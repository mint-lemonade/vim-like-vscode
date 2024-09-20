import * as vscode from 'vscode';
import { KeyHandler } from './keyHandler';
import { MotionHandler, motionKeymap } from './motionHandler';
import { operatorKeyMap } from './operatorHandler';
import { ActionHandler, actionKeymap, insertToModeKeymap } from './actions';
import { Logger, printCursorPositions } from './util';
import { textObjectKeymap } from './textObjectHandler';
import { Register } from './register';
import assert from 'assert';

export type Mode = 'NORMAL' | 'INSERT' | 'VISUAL' | 'VISUAL_LINE';
export type SubMode = 'OPERATOR_PENDING' | 'MULTI_CURSOR' | 'NONE';

export class VimState {
    static currentMode: Mode = 'NORMAL';
    static subMode: SubMode = 'NONE';
    static lastMode: Mode;
    static deferredModeSwitch: Mode | undefined;
    static statusBar: vscode.StatusBarItem;
    static keyHandler: KeyHandler;
    static register: Register;
    static preventCursorPastBoundary: boolean;

    // Vim block cursor behaves differently from vs-code block cursor. 
    // - Unlike vs-code cursor, vim cursor selects char under text in visual mode
    // - Vim block cursor do not moves last charcter of line. 
    // So we create our own respresentation of vim cursor.
    static cursor: {
        selections: {
            anchor: vscode.Position,
            active: vscode.Position
        }[];
        // In VISUAL mode we switch the cursor to line cursor and use text 
        // decoration to mimic the block cursor.
        visualModeTextDecoration: vscode.TextEditorDecorationType | null;
    };

    static activeEditorMap: WeakMap<vscode.TextDocument, {
        mode: Mode, subMode: SubMode
    }> = new WeakMap();

    static init(context: vscode.ExtensionContext) {
        this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
        this.syncVimCursor();
        this.setMode('NORMAL');

        this.keyHandler = new KeyHandler([
            ...motionKeymap,
            ...insertToModeKeymap,
            ...actionKeymap,
            ...operatorKeyMap,
            ...textObjectKeymap
        ], context);
        this.register = new Register(undefined, context);

        this.preventCursorPastBoundary = vscode.workspace
            .getConfiguration('vim-like')
            .get('preventCursorPastBoundary') || false;

        vscode.window.onDidChangeActiveTextEditor((editor) => {
            Logger.log("Aactive editor Changes!");
            // if (!editor) { return; }
            setImmediate(() => {
                if (!editor) { return; }
                Logger.log("Active editor mode: ", this.activeEditorMap.get(editor.document));
                if (this.activeEditorMap.has(editor.document)) {
                    if (this.activeEditorMap.get(editor.document)?.mode === 'INSERT') {
                        this.syncVimCursor();
                    }
                    let savedMode = this.activeEditorMap.get(editor.document);
                    this.setMode(savedMode?.mode!, savedMode?.subMode);
                } else {
                    Logger.log("anchor: ", editor.selection.anchor);
                    Logger.log("active: ", editor.selection.active);
                    this.setMode('NORMAL');
                    // this.syncVimCursor();
                    this.activeEditorMap.set(editor.document, {
                        mode: this.currentMode,
                        subMode: this.subMode
                    });
                }
            });
        });

        vscode.window.onDidChangeTextEditorSelection((e) => {
            Logger.log("Selection Changed: ", e.kind ?
                vscode.TextEditorSelectionChangeKind[e.kind] : e.kind
            );

            if (
                e.kind === vscode.TextEditorSelectionChangeKind.Mouse &&
                this.preventCursorPastBoundary
            ) {
                // If selections are normalized then return early and let next
                // selection change even handle syncing. 
                if (this.normalizeEditorSelection(e.textEditor)) {
                    return;
                }
            }
            Logger.log("Syncing");
            printCursorPositions("Before SYNCING!");
            this.syncVimCursor(e.textEditor);
            printCursorPositions("After SYNCING!");
        });

        vscode.workspace.onDidChangeConfiguration(this.handleConfigChange, this);
    }

    static async type(text: string) {
        if (this.currentMode === 'INSERT') {
            if (!await this.keyHandler.execute(text)) {
                vscode.commands.executeCommand('default:type', { text: text });
            }
            return;
        } else {
            await this.keyHandler.execute(text);
            return;
        }
    }

    static setMode(mode: Mode, subMode: SubMode = 'NONE') {
        this.lastMode = this.currentMode;
        this.currentMode = mode;
        this.subMode = subMode;

        this.updateLineNumbers();

        Logger.log(`Switching mode from ${this.lastMode} to ${this.currentMode}:${this.subMode}`);

        if (this.subMode === 'MULTI_CURSOR') {
            assert.deepEqual(this.currentMode, 'NORMAL');
            this.statusBar.text = `--${subMode}--`.replace('_', ' ');
        } else {
            this.statusBar.text = `--${mode}--`.replace('_', ' ');
        }
        this.statusBar.tooltip = 'Vim Mode';
        this.statusBar.show();

        let editor = vscode.window.activeTextEditor;
        if (editor) {
            this.activeEditorMap.set(editor.document, {
                mode: this.currentMode,
                subMode: this.subMode
            });
            switch (mode) {
                case 'NORMAL': {
                    if (this.subMode === 'MULTI_CURSOR') {
                        editor.options.cursorStyle = vscode.TextEditorCursorStyle.BlockOutline;
                    } else {
                        editor.options.cursorStyle = vscode.TextEditorCursorStyle.Block;
                    }
                    this.syncVimCursor();
                    break;
                }

                case 'VISUAL_LINE':
                case 'VISUAL':
                    {
                        editor.options.cursorStyle = vscode.TextEditorCursorStyle.Line;

                        this.syncVimCursor();
                        // editor.selections.forEach((sel, i) => {
                        //     this.vimCursor.selections[i].anchor = sel.anchor;
                        // });

                        // Setup text decoration to mimic the block cursor.
                        if (!this.cursor.visualModeTextDecoration) {
                            const cursorColor = new vscode.ThemeColor('editorCursor.foreground');
                            const textColor = new vscode.ThemeColor('editorCursor.background');
                            const decorationType = vscode.window.createTextEditorDecorationType({
                                backgroundColor: cursorColor,
                                color: textColor
                            });
                            this.cursor.visualModeTextDecoration = decorationType;
                        }

                        break;
                    }

                case 'INSERT':
                    editor.options = {
                        cursorStyle: vscode.TextEditorCursorStyle.Line
                    };
                    break;

                default:
                    break;
            }
            printCursorPositions("Before syncing VS code cursor!");
            this.syncVsCodeCursorOrSelection();
        }
        vscode.commands.executeCommand('setContext', "vim-like.currentMode", mode);
        vscode.commands.executeCommand('setContext', "vim-like.subMode", subMode);
    }

    static setModeAfterNextSlectionUpdate(mode: Mode) {
        this.deferredModeSwitch = mode;
    }

    static syncVimCursor(e?: vscode.TextEditor) {
        let editor = vscode.window.activeTextEditor;
        if (e) {
            editor = e;
        }
        if (!editor) { return; }
        if (!this.cursor) {
            this.cursor = {
                selections: [],
                visualModeTextDecoration: null
            };
        }
        if (this.lastMode === 'VISUAL_LINE' && this.currentMode === 'VISUAL') {
            // If switching from VISUAL_LINE mode to VISUAL mode do not
            // modify internal vim selections
            return;
        }
        this.cursor.selections = editor.selections.map((sel, i) => {
            if (this.currentMode === 'NORMAL') {
                if (sel.active.isBefore(sel.anchor)) {
                    return {
                        anchor: sel.active,
                        active: sel.active
                    };

                } else if (sel.active.isAfter(sel.anchor)) {
                    return {
                        anchor: sel.active.translate(0, -1),
                        active: sel.active.translate(0, -1)
                    };
                } else {
                    return {
                        anchor: sel.active,
                        active: sel.active
                    };
                }
            } else if (this.currentMode === 'VISUAL' || this.currentMode === 'INSERT') {
                if (sel.active.isBefore(sel.anchor)) {
                    return {
                        anchor: sel.anchor.translate(0, -1),
                        active: sel.active
                    };

                } else if (sel.active.isAfter(sel.anchor)) {
                    return {
                        anchor: sel.anchor,
                        active: sel.active.translate(0, -1)
                    };
                } else {
                    return {
                        anchor: sel.anchor,
                        active: sel.active
                    };
                }
            } else if (this.currentMode === 'VISUAL_LINE') {
                return {
                    anchor: sel.anchor.with({
                        character: this.cursor.selections[i]?.anchor.character || 0
                    }),
                    active: sel.active.with({
                        character: this.cursor.selections[i]?.active.character || 0
                    })
                };
            }
            else {
                console.error("Syhncing in INSERT mode");
                throw new Error("Shouldnn't sync in INSERT mode.");
            }
        });
        this.updateVisualModeCursor();
    }

    static syncVsCodeCursorOrSelection(opts: {
        revealCursor: boolean,
        cursorMove?: {
            to: 'left' | 'right' | 'down' | 'up'
        },
        repeat?: number
    } = { revealCursor: true }) {
        let editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

        /**
         * For some motions that return cursorMove, use more efficient vscode
         * APIs to move cursor rather then using assigning selections method.
         */
        let repeatedMotionSkipsFolds = false;
        if (
            opts.cursorMove &&
            ['NORMAL', 'VISUAL'].includes(VimState.currentMode) &&
            !this.preventCursorPastBoundary
        ) {
            if (opts.repeat && !repeatedMotionSkipsFolds) {
                let moveBy = Math.abs(
                    this.cursor.selections[0].active.line - editor.selection.active.line
                );
                vscode.commands.executeCommand('cursorMove', {
                    to: opts.cursorMove.to,
                    value: moveBy!,
                    select: VimState.currentMode === 'VISUAL'
                });
            } else {
                let command;
                if (opts.cursorMove.to === 'down') {
                    command = 'cursorDown';
                } else if (opts.cursorMove.to === 'up') {
                    command = 'cursorUp';
                }
                if (VimState.currentMode === 'VISUAL') { command += 'Select'; }
                vscode.commands.executeCommand('runCommands', {
                    commands: Array(opts.repeat).fill(command)
                });
            }
            return;
        }

        /**
         * Fallback to using "assigning selections" method, that has more control
         * but can have perfomance impact.
         */
        let startPosition: vscode.Position[] = [];
        let endPosition: vscode.Position[] = [];
        for (let [i, sel] of this.cursor.selections.entries()) {
            if (this.currentMode === 'NORMAL') {
                startPosition[i] = sel.active;
                endPosition[i] = sel.active;
            } else if (this.currentMode === 'VISUAL') {
                if (sel.active.isBefore(sel.anchor)) {
                    startPosition[i] = sel.anchor.translate(0, 1);
                    endPosition[i] = sel.active;
                } else /** vimCursor.active.isAfterOrEqual(vimCursor.anchor) */ {
                    startPosition[i] = sel.anchor;
                    endPosition[i] = sel.active.translate(0, 1);
                }
            } else if (this.currentMode === 'VISUAL_LINE') {
                let anchorLine = editor.document.lineAt(sel.anchor).range;
                let activeLine = editor.document.lineAt(sel.active).range;
                if (sel.active.isBefore(sel.anchor)) {
                    startPosition[i] = anchorLine.end;
                    endPosition[i] = activeLine.start;
                } else /** vimCursor.active.isAfterOrEqual(vimCursor.anchor) */ {
                    startPosition[i] = anchorLine.start;
                    endPosition[i] = activeLine.end;
                }
            } else {
                // If switching from VISUAL to INSERT mode, keep the
                // selection as it is.
                if (this.lastMode === 'VISUAL') {
                    VimState.updateVisualModeCursor();
                    return;
                }
                // If swithcing from NORMAL to INSERT mode, move the cursor
                // to specfic position.
                startPosition[i] = sel.anchor;
                endPosition[i] = sel.active;
            }
        }

        let selections = this.cursor.selections.map((sel, i) => {
            return new vscode.Selection(startPosition[i], endPosition[i]);
        });
        editor.selections = selections;
        if (opts.revealCursor) {
            editor.revealRange(new vscode.Range(selections[0].active, selections[0].active), vscode.TextEditorRevealType.Default);
        }

        VimState.updateVisualModeCursor();
    }

    static async syncSelectionAndExec(action: Function) {
        let editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

        let selections = this.cursor.selections.map((sel, i) => {
            let startPosition: vscode.Position;
            let endPosition: vscode.Position;
            if (this.currentMode === 'VISUAL_LINE') {
                let anchorLine = editor!.document.lineAt(sel.anchor).range;
                let activeLine = editor!.document.lineAt(sel.active).range;
                if (sel.active.isBefore(sel.anchor)) {
                    startPosition = anchorLine.end;
                    endPosition = activeLine.start;
                } else /** vimCursor.active.isAfterOrEqual(vimCursor.anchor) */ {
                    startPosition = anchorLine.start;
                    endPosition = activeLine.end;
                }
            } else {
                if (sel.active.isBefore(sel.anchor)) {
                    startPosition = sel.anchor.translate(0, 1);
                    endPosition = sel.active;
                } else /** vimCursor.active.isAfterOrEqual(vimCursor.anchor) */ {
                    startPosition = sel.anchor;
                    endPosition = sel.active.translate(0, 1);
                }
            }
            return new vscode.Selection(startPosition, endPosition);
        });
        editor.selections = selections;
        action();
        // this.syncVimCursor();
        // VimState.updateVisualModeCursor();
    }

    /**
     * Make sure any editor cursor doesn't go past last line.
     * @returns true if normalization was done or false if already normalized.
     */
    static normalizeEditorSelection(e: vscode.TextEditor) {
        if (!e) { return false; }
        if (this.currentMode !== 'NORMAL') { return false; }
        if (!this.preventCursorPastBoundary) { return false; }

        let cursorPastLastChar = false;
        let normalizedSelections: vscode.Selection[] = [];
        for (let sel of e.selections) {
            let cursorPos = sel.active;
            let line = e.document.lineAt(cursorPos);
            if (cursorPos.character === line.text.length && line.text.length) {
                normalizedSelections.push(
                    new vscode.Selection(
                        sel.anchor.translate(0, -1),
                        sel.active.translate(0, -1)
                    )
                );
                cursorPastLastChar = true;
            } else {
                normalizedSelections.push(sel);
            }
        }
        if (cursorPastLastChar && vscode.window.activeTextEditor) {
            Logger.log("Normalizing Cursors..");
            vscode.window.activeTextEditor.selections = normalizedSelections;
        }

        return cursorPastLastChar;
    }

    static updateVisualModeCursor(position?: vscode.Position) {

        let editor = vscode.window.activeTextEditor;
        if (!editor || !this.cursor.visualModeTextDecoration) { return; }
        Logger.log("Updating visual mode cursor....");

        editor.setDecorations(this.cursor.visualModeTextDecoration, []);
        if (this.currentMode === 'VISUAL') {
            let cursors = this.cursor.selections.map(sel => {
                return new vscode.Range(sel.active, sel.active.translate(0, 1));
            });
            Logger.log("visual mode cursros: ", cursors);
            editor.setDecorations(this.cursor.visualModeTextDecoration, cursors);
        } else if (this.currentMode === 'VISUAL_LINE') {
            let cursors = this.cursor.selections.map(sel => {
                return new vscode.Range(sel.active, sel.active.translate(0, 1));
            });
            Logger.log("visual mode cursros: ", cursors);
            editor.setDecorations(this.cursor.visualModeTextDecoration, cursors);
        }
    }

    static updateLineNumbers() {
        let config = vscode.workspace.getConfiguration("vim-like");
        let relativeLines = config.get('smartRelativeLineNumbers') as boolean;
        if (relativeLines) {
            if (['NORMAL', 'VISUAL', 'VISUAL_LINE'].includes(VimState.currentMode)) {
                // vscode.workspace.getConfiguration('editor')
                //     .update("lineNumbers", 'relative', true);
                let e = vscode.window.activeTextEditor;
                if (e) {
                    e.options.lineNumbers = vscode.TextEditorLineNumbersStyle.Relative;
                }
            } else {
                // vscode.workspace.getConfiguration('editor')
                //     .update("lineNumbers", 'on', true);
                let e = vscode.window.activeTextEditor;
                if (e) {
                    e.options.lineNumbers = vscode.TextEditorLineNumbersStyle.On;
                }
            }
        }
    }

    static handleConfigChange(e: vscode.ConfigurationChangeEvent) {
        if (e.affectsConfiguration("vim-like.smartRelativeLineNumbers")) {
            this.updateLineNumbers();
        }
        if (e.affectsConfiguration("vim-like.switchInsertToVisualKeybinding") ||
            e.affectsConfiguration("vim-like.switchInsertToNormalKeybinding")
        ) {
            ActionHandler.updateInsertToModeKm();
            this.keyHandler.setupKeymaps([
                ...motionKeymap,
                ...insertToModeKeymap,
                ...actionKeymap,
                ...operatorKeyMap,
                ...textObjectKeymap
            ]);

        }
        if (e.affectsConfiguration("vim-like.preventCursorPastBoundary")) {
            this.preventCursorPastBoundary = vscode.workspace
                .getConfiguration('vim-like')
                .get('preventCursorPastBoundary') || false;
        }
    }
}
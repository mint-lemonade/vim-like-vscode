import * as vscode from 'vscode';
import { KeyHandler } from './mapping';
import { motionKeymap } from './motion';
import { operatorKeyMap } from './operator';
import { actionKeymap } from './action';
import { printCursorPositions } from './util';

export type Mode = 'NORMAL' | 'INSERT' | 'VISUAL';

export class VimState {
    static currentMode: Mode = 'NORMAL';
    static lastMode: Mode;
    static deferredModeSwitch: Mode | undefined;
    static statusBar: vscode.StatusBarItem;
    static keyMap: KeyHandler;

    // Vim block cursor behaves differently from vs-code block cursor. 
    // - Unlike vs-code cursor, vim cursor selects char under text in visual mode
    // - Vim block cursor do not moves last charcter of line. 
    // So we create our own respresentation of vim cursor.
    static vimCursor: {
        selections: {
            anchor: vscode.Position,
            active: vscode.Position
        }[];
        // In VISUAL mode we switch the cursor to line cursor and use text 
        // decoration to mimic the block cursor.
        visualModeTextDecoration: vscode.TextEditorDecorationType | null;
    };

    static init() {
        this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
        this.syncVimCursor();
        this.setMode('NORMAL');
        this.keyMap = new KeyHandler([
            ...motionKeymap,
            ...actionKeymap,
            ...operatorKeyMap
        ]);

        vscode.window.onDidChangeActiveTextEditor((editor) => {
            console.log("Aactive editor Changes!");
            if (!editor) { return; }
            setTimeout(() => {
                console.log("anchor: ", editor.selection.anchor);
                console.log("active: ", editor.selection.active);
                this.syncVimCursor();
            });
        });

        vscode.window.onDidChangeTextEditorSelection((e) => {
            if (e.kind !== vscode.TextEditorSelectionChangeKind.Command) {
                console.log("Selection Changed: ", e.kind);
                console.log("Syncing");
                setTimeout(() => {
                    printCursorPositions("Before SYNCING!");
                    this.syncVimCursor();
                    printCursorPositions("After SYNCING!");
                    if (this.deferredModeSwitch) {
                        this.setMode(this.deferredModeSwitch);
                        this.deferredModeSwitch = undefined;
                    }
                });
            }
            // if (e.kind === vscode.TextEditorSelectionChangeKind.Keyboard || e.kind === vscode.TextEditorSelectionChangeKind.Mouse) {
            //     this.syncVimCursor();
            // }
        });
    }

    static type(text: string) {
        if (this.currentMode === 'INSERT') {
            if (!this.keyMap.execute(text)) {
                vscode.commands.executeCommand('default:type', { text: text });
            }
            return;
        } else {
            this.keyMap.execute(text);
            return;
        }
    }

    static setMode(mode: Mode) {
        this.lastMode = this.currentMode;
        this.currentMode = mode;
        console.log(`Switching mode from ${this.lastMode} to ${this.currentMode}`);
        this.statusBar.text = `--${mode}--`;
        this.statusBar.tooltip = 'Vim Mode';
        this.statusBar.show();
        let editor = vscode.window.activeTextEditor;
        if (editor) {
            switch (mode) {
                case 'NORMAL': {
                    editor.options.cursorStyle = vscode.TextEditorCursorStyle.Block;
                    this.syncVimCursor();

                    break;
                }

                case 'VISUAL':
                    {
                        editor.options.cursorStyle = vscode.TextEditorCursorStyle.Line;

                        this.syncVimCursor();
                        // editor.selections.forEach((sel, i) => {
                        //     this.vimCursor.selections[i].anchor = sel.anchor;
                        // });

                        // Setup text decoration to mimic the block cursor.
                        if (!this.vimCursor.visualModeTextDecoration) {
                            const cursorColor = new vscode.ThemeColor('editorCursor.foreground');
                            const textColor = new vscode.ThemeColor('editorCursor.background');
                            const decorationType = vscode.window.createTextEditorDecorationType({
                                backgroundColor: cursorColor,
                                color: textColor
                            });
                            this.vimCursor.visualModeTextDecoration = decorationType;
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
        vscode.commands.executeCommand('setContext', "vim.currentMode", mode);
    }

    static setModeAfterNextSlectionUpdate(mode: Mode) {
        this.deferredModeSwitch = mode;
    }

    static syncVimCursor() {
        let editor = vscode.window.activeTextEditor;
        if (!editor) { return; }
        if (!this.vimCursor) {
            this.vimCursor = {
                selections: [],
                visualModeTextDecoration: null
            };
        }

        this.vimCursor.selections = editor.selections.map(sel => {
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
            } else if (this.currentMode === 'VISUAL') {
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
            } else {
                throw new Error("Shouldnn't sync in INSERT mode.");
            }
        });
        this.updateVisualModeCursor();
    }

    static syncVsCodeCursorOrSelection() {
        let editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

        let startPosition: vscode.Position[] = [];
        let endPosition: vscode.Position[] = [];
        for (let [i, sel] of this.vimCursor.selections.entries()) {
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

        let selections = editor.selections.map((sel, i) => {
            return new vscode.Selection(startPosition[i], endPosition[i]);
        });

        editor.selections = selections;
        editor.revealRange(selections[0]);
        VimState.updateVisualModeCursor();
    }

    static async syncSelectionAndExec(action: Function) {
        let editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

        let selections = this.vimCursor.selections.map((sel, i) => {
            let startPosition: vscode.Position;
            let endPosition: vscode.Position;
            if (sel.active.isBefore(sel.anchor)) {
                startPosition = sel.anchor.translate(0, 1);
                endPosition = sel.active;
            } else /** vimCursor.active.isAfterOrEqual(vimCursor.anchor) */ {
                startPosition = sel.anchor;
                endPosition = sel.active.translate(0, 1);
            }
            return new vscode.Selection(startPosition, endPosition);
        });

        editor.selections = selections;
        await action();
        // this.syncVimCursor();
        // VimState.updateVisualModeCursor();
    }

    static updateVisualModeCursor(position?: vscode.Position) {

        let editor = vscode.window.activeTextEditor;
        if (!editor || !this.vimCursor.visualModeTextDecoration) { return; }
        console.log("Updating visual mode cursor....");

        editor.setDecorations(this.vimCursor.visualModeTextDecoration, []);
        if (this.currentMode === 'VISUAL') {
            let cursors = this.vimCursor.selections.map(sel => {
                return new vscode.Range(sel.active, sel.active.translate(0, 1));
            });
            console.log("visual mode cursros: ", cursors);
            editor.setDecorations(this.vimCursor.visualModeTextDecoration, cursors);

        }
    }
}
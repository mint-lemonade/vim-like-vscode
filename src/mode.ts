import * as vscode from 'vscode';
import { KeyHandler } from './mapping';

export type Mode = 'NORMAL' | 'INSERT' | 'VISUAL';

export class VimState {
    static currentMode: Mode = 'NORMAL';
    static lastMode: Mode;
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
        this.keyMap = new KeyHandler();

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
            if (e.kind === vscode.TextEditorSelectionChangeKind.Keyboard || e.kind === vscode.TextEditorSelectionChangeKind.Mouse) {
                this.syncVimCursor();
            }
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
        this.statusBar.text = `--${mode}--`;
        this.statusBar.tooltip = 'Vim Mode';
        this.statusBar.show();
        let editor = vscode.window.activeTextEditor;
        if (editor) {
            switch (mode) {
                case 'NORMAL': {
                    editor.options.cursorStyle = vscode.TextEditorCursorStyle.Block;
                    break;
                }

                case 'VISUAL':
                    {
                        editor.options.cursorStyle = vscode.TextEditorCursorStyle.Line;
                        editor.selections.forEach((sel, i) => {
                            this.vimCursor.selections[i].anchor = sel.anchor;
                        });
                        // this.vimCursor.anchor = editor.selection.anchor;

                        // Setup text decoration to mimic the block cursor.
                        const cursorColor = new vscode.ThemeColor('editorCursor.foreground');
                        const textColor = new vscode.ThemeColor('editorCursor.background');
                        const decorationType = vscode.window.createTextEditorDecorationType({
                            backgroundColor: cursorColor,
                            color: textColor
                        });
                        this.vimCursor.visualModeTextDecoration = decorationType;

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
            this.syncVsCodeCursorOrSelection();
        }
        vscode.commands.executeCommand('setContext', "vim.currentMode", mode);
    }

    static syncVimCursor() {
        let editor = vscode.window.activeTextEditor;
        if (!editor) { return; }
        if (!this.vimCursor) {
            this.vimCursor = {
                selections: [],
                // anchor: editor.selection.active,
                // active: editor.selection.active,
                visualModeTextDecoration: null
            };
            // return;
        }


        /**
         * // TODO: set vim-cursor based on mode. 
         * Since editor selection is adjusted when syncing vs-code selection
         * from vim-vursor as char under vim-cursor is expected to be selected.
         * So vim-cursor also needs to be adjusted when syncing
         * back from vs-code selection.        
         */
        this.vimCursor.selections = editor.selections.map(sel => {
            return {
                active: sel.active,
                anchor: sel.anchor
            };
        });
        // this.vimCursor.active = editor.selection.active;
        // this.vimCursor.anchor = editor.selection.anchor;
        this.updateVisualModeCursor();
    }

    static syncVsCodeCursorOrSelection() {
        let editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

        let startPosition: vscode.Position[] = [];
        let endPosition: vscode.Position[] = [];
        console.log("selections... ", this.vimCursor.selections);
        this.vimCursor.selections.forEach((sel, i) => {
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
        });


        // let newSelection = new vscode.Selection(startPosition, endPosition);
        // editor.selection = newSelection;
        let selections = editor.selections.map((sel, i) => {
            // sel.anchor = startPosition[i];
            // sel.active = endPosition[i];
            // return {
            //     anchor: startPosition[i],
            //     active: endPosition[i]
            // };
            return new vscode.Selection(startPosition[i], endPosition[i]);

        });
        editor.selections = selections;
        editor.revealRange(selections[0]);
        VimState.updateVisualModeCursor();
    }

    static updateVisualModeCursor(position?: vscode.Position) {

        let editor = vscode.window.activeTextEditor;
        if (!editor || !this.vimCursor.visualModeTextDecoration) { return; }
        editor.setDecorations(this.vimCursor.visualModeTextDecoration, []);
        if (this.currentMode === 'VISUAL') {
            let cursors = this.vimCursor.selections.map(sel => {
                return new vscode.Range(sel.active, sel.active.translate(0, 1));
            });
            editor.setDecorations(this.vimCursor.visualModeTextDecoration, cursors);

        }
    }
}
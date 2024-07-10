import * as vscode from 'vscode';
import { KeyHandler } from './mapping';

export type Mode = 'NORMAL' | 'INSERT' | 'VISUAL';

export class VimState {
    static currentMode: Mode = 'NORMAL';
    static statusBar: vscode.StatusBarItem;
    static keyMap: KeyHandler;

    // Vim block cursor behaves differently from vs-code block cursor. 
    // - Unlike vs-code cursor, vim cursor selects char under text in visual mode
    // - Vim block cursor do not moves last charcter of line. 
    // So we create our own respresentation of vim cursor.
    static vimCursor: {
        anchor: vscode.Position,
        active: vscode.Position
        // In VISUAL mode we switch the cursor to line cursor and use text 
        // decoration to mimic the block cursor.
        visualModeTextDecoration: vscode.TextEditorDecorationType | null;
    };

    static init() {
        this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
        this.setMode('NORMAL');
        this.keyMap = new KeyHandler();
        // this.vimCursor = {
        //     anchor: vscode.window.activeTextEditor.selection.active,
        //     active: editor.selection.active
        // };
    }

    static setMode(mode: Mode) {
        this.currentMode = mode;
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
                        this.vimCursor.anchor = editor.selection.anchor;

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

    static updateVisualModeCursor(position?: vscode.Position) {

        let editor = vscode.window.activeTextEditor;
        if (!editor || !this.vimCursor.visualModeTextDecoration) { return; }
        editor.setDecorations(this.vimCursor.visualModeTextDecoration, []);
        if (this.currentMode === 'VISUAL') {
            let start;
            let end;
            if (editor.selection.active.isBefore(editor.selection.anchor)) {
                start = editor.selection.active;
                end = editor.selection.active.translate(0, 1);
            } else {
                start = editor.selection.active.translate(0, -1);
                end = editor.selection.active;
            }
            editor.setDecorations(this.vimCursor.visualModeTextDecoration, [new vscode.Range(start, end)]);
        }
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

    static syncVsCodeCursorOrSelection() {
        let editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

        let startPosition: vscode.Position;
        let endPosition: vscode.Position;

        if (this.currentMode === 'NORMAL') {
            startPosition = this.vimCursor.active;
            endPosition = this.vimCursor.active;
        } else if (this.currentMode === 'VISUAL') {
            if (this.vimCursor.active.isBefore(this.vimCursor.anchor)) {
                startPosition = this.vimCursor.anchor.translate(0, 1);
                endPosition = this.vimCursor.active;
            } else /** vimCursor.active.isAfterOrEqual(vimCursor.anchor) */ {
                startPosition = this.vimCursor.anchor;
                endPosition = this.vimCursor.active.translate(0, 1);
            }
        } else {
            console.error(`Cannot sync cursor in ${this.currentMode} mode!`);
            return;
        }

        let newSelection = new vscode.Selection(startPosition, endPosition);
        editor.selection = newSelection;
        VimState.updateVisualModeCursor();
    }

    static syncVimCursor() {
        let editor = vscode.window.activeTextEditor;
        if (!editor) { return; }
        if (!this.vimCursor) {
            this.vimCursor = {
                anchor: editor.selection.active,
                active: editor.selection.active,
                visualModeTextDecoration: null
            };
        }
    }

    // static updateVimCursor(anchor: vscode.Position | null, active: vscode.Position | null) {
    //     if (anchor) {
    //         this.vimCursor.anchor = anchor;
    //     }
    //     if (active) {
    //         this.vimCursor.active = active;
    //     }
    // }
}
import * as vscode from 'vscode';
import { Position, TextEditorDecorationType } from "vscode";
import { Keymap } from "./keyHandler";
import { VimState } from "./vimState";
import { posToString, stringToPos } from './util';

export class MultiCursorHandler {
    static cursors: Set<string> = new Set();
    static sortedCursors: Position[] = [];
    static cursorStyle: TextEditorDecorationType;

    static setUp(context: vscode.ExtensionContext) {
        context.subscriptions.push(
            vscode.commands.registerCommand("vim-like.cycleMulticursorForward", () => {
                this.cycleCursors(1);
            }, this)
        );
        context.subscriptions.push(
            vscode.commands.registerCommand("vim-like.cycleMulticursorBackward", () => {
                this.cycleCursors(-1);
            }, this)
        );
    }

    static enterMultiCursorMode() {
        let config = vscode.workspace.getConfiguration("vim-like");
        let bgColor = config.get('yankHighlightBackgroundColor') as string;
        let textColor = config.get('yankHighlightForegroundColor') as string;
        const decorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: bgColor,
            color: textColor,
        });
        this.cursorStyle = decorationType;
        VimState.setMode('NORMAL', 'MULTI_CURSOR');
        if (VimState.cursor.selections.length > 1) {
            this.addCursor();
            VimState.cursor.selections = [VimState.cursor.selections.at(-1)!];
            VimState.syncVsCodeCursorOrSelection();
        }
    }

    static addCursor() {
        let editor = vscode.window.activeTextEditor;
        if (!editor) { return; };
        this.sortedCursors = []; // Clear sorted cursors. 

        VimState.cursor.selections.forEach(sel => {
            this.cursors.add(posToString(sel.active));
        });
        editor.setDecorations(
            this.cursorStyle,
            Array.from(this.cursors)
                .map(s => {
                    let c = stringToPos(s);
                    return new vscode.Range(c, c.translate(0, 1));
                })
        );
    }

    static removeCursor() {
        let editor = vscode.window.activeTextEditor;
        if (!editor) { return; }
        this.sortedCursors = []; // Clear sorted cursors. 

        VimState.cursor.selections.forEach(sel => {
            this.cursors.delete(posToString(sel.active));
        });
        editor.setDecorations(
            this.cursorStyle,
            Array.from(this.cursors)
                .map(s => {
                    let c = stringToPos(s);
                    return new vscode.Range(c, c.translate(0, 1));
                })
        );
    }

    static clearAllCursors() {
        let editor = vscode.window.activeTextEditor;
        if (!editor) { return; };
        this.cursors.clear();
        this.sortedCursors = []; // Clear sorted cursors. 

        editor.setDecorations(
            this.cursorStyle,
            Array.from(this.cursors)
                .map(s => {
                    let c = stringToPos(s);
                    return new vscode.Range(c, c.translate(0, 1));
                })
        );
    }

    static exitMultiCursorMode() {
        let editor = vscode.window.activeTextEditor;
        if (!editor) { return; };
        editor.setDecorations(this.cursorStyle, []);
        let cursors = Array.from(this.cursors);
        if (cursors.length > 0) {
            VimState.cursor.selections = cursors.map(s => {
                let c = stringToPos(s);
                return {
                    anchor: c,
                    active: c
                };
            });
        } else {
            // If no cursor was added in multicursor mode, reset to single cursor,
            VimState.cursor.selections = [VimState.cursor.selections[0]];
        }
        this.cursors.clear();
        this.sortedCursors = []; // Clear sorted cursors. 

        VimState.syncVsCodeCursorOrSelection();
        setImmediate(() => {
            VimState.setMode('NORMAL');
        });
    }

    static cycleCursors(dir: 1 | -1) {
        let editor = vscode.window.activeTextEditor;
        if (!editor) { return; };
        if (this.sortedCursors.length === 0) {
            this.sortCursors();
        }
        if (editor.selections.length > VimState.cursor.selections.length) {
            editor.selections = [editor.selection];
        }
        setImmediate(() => {
            let snapTo: number;
            let startCursor = VimState.cursor.selections[0];

            let i = dir === 1 ? 0 : this.sortedCursors.length - 1;
            if (dir === 1 && startCursor.active.isAfterOrEqual(this.sortedCursors.at(-1)!)) {
                snapTo = 0;
            } else if (dir === -1 && startCursor.active.isBeforeOrEqual(this.sortedCursors.at(0)!)) {
                snapTo = this.sortedCursors.length - 1;
            } else {
                while (i >= 0 && i < this.sortedCursors.length) {
                    let cmp = this.sortedCursors[i].compareTo(startCursor.active);
                    if (cmp === dir) {
                        snapTo = i;
                        break;
                    }
                    i += dir;
                }
            }
            VimState.cursor.selections.forEach((sel) => {
                sel.active = this.sortedCursors[snapTo % this.sortedCursors.length];
                sel.anchor = this.sortedCursors[snapTo % this.sortedCursors.length];
                snapTo += 1;
            });

            VimState.syncVsCodeCursorOrSelection();
        });
    }

    static sortCursors() {
        this.sortedCursors = Array.from(this.cursors)
            .map(c => stringToPos(c))
            .sort((a, b) => {
                return a.compareTo(b);
            });
    }
}


export const multiCursorKeymap: Keymap[] = [
    {
        key: ['q'],
        type: 'Action',
        action: () => MultiCursorHandler.enterMultiCursorMode(),
        mode: ['NORMAL']
    },
    {
        key: ['q'],
        type: 'Action',
        action: () => MultiCursorHandler.exitMultiCursorMode(),
        mode: ['MULTI_CURSOR']
    },
    {
        key: ['a'],
        type: 'Action',
        action: () => MultiCursorHandler.addCursor(),
        mode: ['MULTI_CURSOR']
    },
    {
        key: ['r'],
        type: 'Action',
        action: () => MultiCursorHandler.removeCursor(),
        mode: ['MULTI_CURSOR']
    },
    {
        key: ['c'],
        type: 'Action',
        action: () => MultiCursorHandler.clearAllCursors(),
        mode: ['MULTI_CURSOR']
    },
    {
        key: ['i'],
        type: 'Action',
        action: () => MultiCursorHandler.cycleCursors(1),
        mode: ['MULTI_CURSOR']
    },
];
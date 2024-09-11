import * as vscode from 'vscode';
import { Position, TextEditorDecorationType } from "vscode";
import { Keymap } from "./keyHandler";
import { VimState } from "./vimState";
import { posToString, stringToPos } from './util';

export class MultiCursorHandler {
    static cursors: Set<string> = new Set();
    static cursorStyle: TextEditorDecorationType;

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
        }
    }

    static addCursor() {
        let editor = vscode.window.activeTextEditor;
        if (!editor) { return; };
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
        if (!editor) { return; };
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
        editor.setDecorations(
            this.cursorStyle,
            Array.from(this.cursors)
                .map(s => {
                    let c = stringToPos(s);
                    return new vscode.Range(c, c.translate(0, 1));
                })
        );
    }
    // TODO Make sure exiting without selection doesnt throw errors. 
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
        VimState.syncVsCodeCursorOrSelection();
        setImmediate(() => {
            VimState.setMode('NORMAL');
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
];
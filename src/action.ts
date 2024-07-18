import * as vscode from 'vscode';
import { VimState } from './mode';
import { Mode } from './mode';

type CursorPos = 'before-cursor' | 'after-cursor' | 'line-start' | 'line-end' | 'new-line-below' | 'new-line-above';

export class Action {
    static setup(context: vscode.ExtensionContext) {


    }
    static switchToInsertModeAt(cursorPos: CursorPos) {
        let editor = vscode.window.activeTextEditor;
        if (!editor) { return; }
        switch (cursorPos) {
            case 'after-cursor':
                VimState.vimCursor.active = editor.selection.active.translate(0, 1);
                break;
            case 'line-start': {
                let lineStartOffset = editor.document.lineAt(editor.selection.active).firstNonWhitespaceCharacterIndex;
                VimState.vimCursor.active = editor.selection.active.with(undefined, lineStartOffset);
                break;
            }
            case 'line-end': {
                let lineEndOffset = editor.document.lineAt(editor.selection.active).range.end;
                VimState.vimCursor.active = lineEndOffset;
                break;
            }
            // case 'before-cursor':
            //     // VimState.vimCursor.active = 
            //     break;
            default:
                break;
        }
        if (VimState.currentMode === 'NORMAL') {
            VimState.vimCursor.anchor = VimState.vimCursor.active;
        } else if (VimState.currentMode === 'VISUAL') {
            VimState.vimCursor.anchor = VimState.vimCursor.anchor;
        }
        VimState.setMode('INSERT');
    }
}

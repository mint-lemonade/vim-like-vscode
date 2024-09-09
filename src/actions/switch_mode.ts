import * as vscode from 'vscode';
import { Keymap } from "../mapping";
import { VimState } from "../mode";

type CursorPos =
    'before-cursor' | 'after-cursor' |
    'line-start' | 'line-end' |
    'new-line-below' | 'new-line-above';

async function switchToInsertModeAt(cursorPos: CursorPos) {
    let editor = vscode.window.activeTextEditor;
    if (!editor) { return; }
    if (cursorPos === 'new-line-above') {
        await vscode.commands.executeCommand('editor.action.insertLineBefore');
    } else if (cursorPos === 'new-line-below') {
        await vscode.commands.executeCommand('editor.action.insertLineAfter');
    }

    for (let [i, sel] of VimState.vimCursor.selections.entries()) {
        switch (cursorPos) {
            case 'after-cursor':
                sel.active = editor!.selections[i].active.translate(0, 1);
                break;
            case 'line-start': {
                let lineStartOffset = editor!.document.lineAt(editor!.selections[i].active).firstNonWhitespaceCharacterIndex;
                sel.active = editor!.selections[i].active.with(undefined, lineStartOffset);
                break;
            }
            case 'line-end': {
                let lineEndOffset = editor!.document.lineAt(editor!.selections[i].active).range.end;
                sel.active = lineEndOffset;
                break;
            }

            case 'new-line-below': {
                sel.active = editor!.selections[i].active;
                break;
            }

            case 'new-line-above': {
                sel.active = editor!.selections[i].active;
                break;
            }
            default:
                break;
        }
        if (VimState.currentMode === 'NORMAL') {
            sel.anchor = sel.active;
        } else if (VimState.currentMode === 'VISUAL') {
            sel.anchor = sel.anchor;
        }
    }
    VimState.setMode('INSERT');
}

export const switchModeKeymap: Keymap[] = [
    {
        key: ['j', 'f'],
        type: 'Action',
        action: () => VimState.setMode('NORMAL'),
        mode: ['INSERT']
    },
    {
        key: ['j', 'v'],
        type: 'Action',
        action: () => VimState.setMode('VISUAL'),
        mode: ['INSERT']
    }, {
        key: ['v'],
        type: 'Action',
        action: () => VimState.setMode('VISUAL'),
        mode: ['NORMAL', 'VISUAL_LINE']
    },
    {
        key: ['v'],
        type: 'Action',
        action: () => VimState.setMode('NORMAL'),
        mode: ['VISUAL']
    },
    {
        key: ['V'],
        type: 'Action',
        action: () => VimState.setMode('VISUAL_LINE'),
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE']
    },
    {
        key: ['i'],
        type: 'Action',
        action: () => switchToInsertModeAt('before-cursor'),
        mode: ['NORMAL']
    },
    {
        key: ['I'],
        type: 'Action',
        action: () => switchToInsertModeAt('line-start'),
        mode: ['NORMAL']
    },
    {
        key: ['I'],
        type: 'Action',
        action: () => switchToInsertModeAt('before-cursor'),
        mode: ['VISUAL', 'VISUAL_LINE']
    },
    {
        key: ['a'],
        type: 'Action',
        action: () => switchToInsertModeAt('after-cursor'),
        mode: ['NORMAL']
    },
    {
        key: ['A'],
        type: 'Action',
        action: () => switchToInsertModeAt('line-end'),
        mode: ['NORMAL']
    },
    {
        key: ['o'],
        type: 'Action',
        action: () => switchToInsertModeAt('new-line-below'),
        mode: ['NORMAL']
    },
    {
        key: ['O'],
        type: 'Action',
        action: () => switchToInsertModeAt('new-line-above'),
        mode: ['NORMAL']
    },
];
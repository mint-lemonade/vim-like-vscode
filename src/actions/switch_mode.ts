import * as vscode from 'vscode';
import { Keymap } from "../keyHandler";
import { VimState } from "../vimState";

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

    for (let [i, sel] of VimState.cursor.selections.entries()) {
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

/**
 * Setup keybindings to switch from Insert mode to either Visual or Normal mode.
 */
export let insertToModeKeymap: Keymap[] = [];
export function updateInsertToModeKm() {
    insertToModeKeymap = [];
    let config = vscode.workspace.getConfiguration("vim-like");
    let insertToNormal = config.get('switchInsertToNormalKeybinding') as Array<string>;
    let insertToVisual = config.get('switchInsertToVisualKeybinding') as Array<string>;
    if (insertToNormal.length) {
        insertToModeKeymap.push({
            key: insertToNormal,
            type: 'Action',
            action: () => VimState.setMode('NORMAL'),
            mode: ['INSERT']
        });
    }
    if (insertToVisual.length) {
        insertToModeKeymap.push({
            key: insertToVisual,
            type: 'Action',
            action: () => VimState.setMode('VISUAL'),
            mode: ['INSERT']
        });
    }
}
updateInsertToModeKm();

export const switchModeKeymap: Keymap[] = [
    {
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
import * as vscode from 'vscode';
import { VimState } from './mode';
import { Mode } from './mode';
import { Keymap } from './mapping';
import { Logger } from './util';

type CursorPos = 'before-cursor' | 'after-cursor' | 'line-start' | 'line-end' | 'new-line-below' | 'new-line-above';

export class Action {
    static repeat: number = 0;

    static setup(context: vscode.ExtensionContext) {


    }

    static async switchToInsertModeAt(cursorPos: CursorPos) {
        let editor = vscode.window.activeTextEditor;
        if (!editor) { return; }
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
                    await vscode.commands.executeCommand('editor.action.insertLineAfter');
                    sel.active = editor!.selections[i].active;
                    break;
                }

                case 'new-line-above': {
                    await vscode.commands.executeCommand('editor.action.insertLineBefore');
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

    static deleteChar() {
        let editor = vscode.window.activeTextEditor;
        if (!editor) { return; }
        let repeat = Math.max(this.repeat, 1);
        let ranges: vscode.Range[] = [];
        if (VimState.currentMode === 'NORMAL') {
            ranges = VimState.vimCursor.selections.map(sel => new vscode.Range(sel.active, sel.active.translate(0, repeat)));
        } else if (VimState.currentMode === 'VISUAL') {
            ranges = editor.selections.map(sel => sel);
        }
        editor.edit(e => {
            for (let range of ranges) {
                e.delete(range);
            }
        }).then(res => {
            Logger.log("edit possible: ", res);
            VimState.setModeAfterNextSlectionUpdate('NORMAL');
        });
    }
}

export const actionKeymap: Keymap[] = [
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
    },
    {
        key: ['i'],
        type: 'Action',
        action: () => Action.switchToInsertModeAt('before-cursor'),
        mode: ['NORMAL', 'VISUAL']
    },
    {
        key: ['I'],
        type: 'Action',
        action: () => Action.switchToInsertModeAt('line-start'),
        mode: ['NORMAL']
    },
    {
        key: ['a'],
        type: 'Action',
        action: () => Action.switchToInsertModeAt('after-cursor'),
        mode: ['NORMAL']
    },
    {
        key: ['A'],
        type: 'Action',
        action: () => Action.switchToInsertModeAt('line-end'),
        mode: ['NORMAL']
    },
    {
        key: ['o'],
        type: 'Action',
        action: () => Action.switchToInsertModeAt('new-line-below'),
        mode: ['NORMAL']
    },
    {
        key: ['O'],
        type: 'Action',
        action: () => Action.switchToInsertModeAt('new-line-above'),
        mode: ['NORMAL']
    },
    {
        key: ['x'],
        type: 'Action',
        action: () => Action.deleteChar(),
        mode: ['NORMAL', 'VISUAL']
    },
    {
        key: ['J'],
        type: 'Action',
        action: () => vscode.commands.executeCommand('editorScroll', {
            to: 'down',
            by: 'line'
        }),
        mode: ['NORMAL', 'VISUAL']
    }, {
        key: ['K'],
        type: 'Action',
        action: () => vscode.commands.executeCommand('editorScroll', {
            to: 'up',
            by: 'line'
        }),
        mode: ['NORMAL', 'VISUAL']
    },
];


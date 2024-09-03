import * as vscode from 'vscode';
import { VimState } from './mode';
import { Mode } from './mode';
import { Keymap } from './mapping';
import { Logger } from './util';
import { REGISTERS } from './register';

type CursorPos = 'before-cursor' | 'after-cursor' | 'line-start' | 'line-end' | 'new-line-below' | 'new-line-above';

export class Action {
    static repeat: number = 0;

    static setup(context: vscode.ExtensionContext) {


    }

    static async switchToInsertModeAt(cursorPos: CursorPos) {
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

    static deleteChar(enterInsertMode: boolean) {
        let editor = vscode.window.activeTextEditor;
        if (!editor) { return; }
        let repeat = Math.max(this.repeat, 1);
        let ranges: vscode.Range[] = [];
        if (VimState.currentMode === 'NORMAL') {
            ranges = VimState.vimCursor.selections.map(sel => new vscode.Range(sel.active, sel.active.translate(0, repeat)));
        } else if (VimState.currentMode === 'VISUAL' ||
            VimState.currentMode === 'VISUAL_LINE'
        ) {
            ranges = editor.selections.map(sel => sel);
        }
        editor.edit(e => {
            for (let range of ranges) {
                e.delete(range);
            }
        }).then(res => {
            Logger.log("edit possible: ", res);
            setImmediate(() => {
                if (enterInsertMode) {
                    VimState.setMode('INSERT');
                } else {
                    VimState.setMode('NORMAL');
                }
            });
        });
    }

    static async paste(where: 'before' | 'after') {
        let regEntry = VimState.register.read();
        if (!regEntry) {
            return;
        }
        VimState.keyHandler.waitingForInput = false;

        // Spread Entries over cursors or bunch paste them all.
        let spreadEntries: boolean = false;
        if (regEntry.text.length === VimState.vimCursor.selections.length) {
            spreadEntries = true;
        }

        if (VimState.currentMode === 'NORMAL') {
            if (regEntry.linewise) {
                switch (where) {
                    case 'before':
                        await vscode.commands.executeCommand('editor.action.insertLineBefore');
                        break;
                    case 'after':
                        await vscode.commands.executeCommand('editor.action.insertLineAfter');
                        break;
                    default:
                        break;
                }
            }
        }

        if (VimState.register.selectedReg === REGISTERS.CLIPBOARD_REG) {
            // Paste clipboard content over range under selection
            await vscode.commands.executeCommand('editor.action.clipboardPasteAction')
                .then(_res => {
                    VimState.setModeAfterNextSlectionUpdate('NORMAL');
                });
        } else {
            let pasteAt: vscode.Position | vscode.Range;

            setImmediate(async () => {
                let editor = vscode.window.activeTextEditor;
                if (!editor) { return; }
                let selections = editor.selections;

                await editor.edit(e => {
                    for (let [i, sel] of selections.entries()) {
                        if (VimState.currentMode === 'NORMAL') {
                            pasteAt = sel.active;
                            if (!regEntry.linewise && where === 'after') {
                                pasteAt = sel.active.translate(0, 1);
                            }
                        }
                        else if (['VISUAL', 'VISUAL_LINE'].includes(VimState.currentMode)) {
                            pasteAt = sel;
                        }

                        if (spreadEntries) {
                            e.replace(pasteAt, regEntry.text[i]);
                        } else {
                            e.replace(pasteAt, regEntry.text.join("\n"));
                        }
                    }
                }).then(res => {
                    Logger.log("edit possible: ", res);
                    setImmediate(() => {
                        VimState.setMode('NORMAL');
                    });
                });
            });
        }

    }

    static invertSelection() {
        VimState.vimCursor.selections = VimState.vimCursor.selections.map(sel => {
            return {
                active: sel.anchor,
                anchor: sel.active
            };
        });

        VimState.syncVsCodeCursorOrSelection();
    }

    static joinLine() {
        let editor = vscode.window.activeTextEditor;
        if (!editor) { return; }
        editor.edit(e => {
            if (!editor) { return; }
            for (let sel of VimState.vimCursor.selections) {
                let curLine = editor.document.lineAt(sel.active);
                let nextLine = editor.document.lineAt(sel.active.line + 1);
                let start = curLine.range.end;
                let end = new vscode.Position(
                    nextLine.lineNumber,
                    Math.max(nextLine.firstNonWhitespaceCharacterIndex - 1, 0)
                );
                e.delete(new vscode.Range(start, end));
            }
        }).then(res => {
            setImmediate(() => VimState.setMode('NORMAL'));
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
    }, {
        key: ['v'],
        type: 'Action',
        action: () => VimState.setMode('VISUAL'),
        mode: ['NORMAL', 'VISUAL_LINE']
    }, {
        key: ['v'],
        type: 'Action',
        action: () => VimState.setMode('NORMAL'),
        mode: ['VISUAL']
    }, {
        key: ['V'],
        type: 'Action',
        action: () => VimState.setMode('VISUAL_LINE'),
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE']
    },
    {
        key: ['i'],
        type: 'Action',
        action: () => Action.switchToInsertModeAt('before-cursor'),
        mode: ['NORMAL']
    },
    {
        key: ['I'],
        type: 'Action',
        action: () => Action.switchToInsertModeAt('line-start'),
        mode: ['NORMAL']
    },
    {
        key: ['I'],
        type: 'Action',
        action: () => Action.switchToInsertModeAt('before-cursor'),
        mode: ['VISUAL', 'VISUAL_LINE']
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
        action: () => Action.deleteChar(false),
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE']
    }, {
        key: ['s'],
        type: 'Action',
        action: () => Action.deleteChar(true),
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE']
    },
    {
        key: ['J'],
        type: 'Action',
        action: () => Action.joinLine(),
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE']
    }, {
        key: ['"', '{}'],
        type: 'Action',
        showInStatusBar: true,
        longDesc: ['( " )reg: ', '[{}] '],
        action: (key: string) => VimState.register.set(key[1]),
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE']
    }, {
        key: [':'],
        type: 'Action',
        action: () => vscode.commands.executeCommand("workbench.action.showCommands"),
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE']
    }, {
        key: ['p'],
        type: 'Action',
        action: () => Action.paste('after'),
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE']
    }, {
        key: ['P'],
        type: 'Action',
        action: () => Action.paste('before'),
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE']
    }, {
        key: ['o'],
        type: 'Action',
        action: () => Action.invertSelection(),
        mode: ['VISUAL', 'VISUAL_LINE']
    }
];


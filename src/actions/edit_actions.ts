import * as vscode from 'vscode';
import { VimState } from '../vimState';
import { REGISTERS } from '../register';
import { Logger } from '../util';
import { Keymap } from '../keyHandler';
import { default as OperatorHandler } from '../operatorHandler';
import { MotionHandler } from '../motionHandler';
import { Change, Delete, Move } from '../operators';

function deleteChar(enterInsertMode: boolean, repeat: number) {
    let editor = vscode.window.activeTextEditor;
    if (!editor) { return; }
    repeat = Math.max(repeat, 1);
    let ranges: vscode.Range[] = [];
    if (VimState.currentMode === 'NORMAL') {
        ranges = VimState.cursor.selections.map(sel => new vscode.Range(sel.active, sel.active.translate(0, repeat)));
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

async function paste(where: 'before' | 'after') {
    let regEntry = VimState.register.read();

    if (VimState.register.selectedReg === REGISTERS.CLIPBOARD_REG) {
        // Paste clipboard content over range under selection
        await vscode.commands.executeCommand('editor.action.clipboardPasteAction')
            .then(_res => {
                // VimState.setModeAfterNextSlectionUpdate('NORMAL');
                setImmediate(() => VimState.setMode('NORMAL'));
            });
        return;
    }

    if (!regEntry) { return; }

    // Spread Entries over cursors or bunch paste them all.
    let spreadEntries: boolean = false;
    if (regEntry.text.length === VimState.cursor.selections.length) {
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

    let pasteAt: vscode.Position | vscode.Range;
    setImmediate(async () => {
        let editor = vscode.window.activeTextEditor;
        if (!editor) { return; }
        let selections = editor.selections;

        /**
         * **[activePosition, linesPasted].**
         * 
         * Format ranges can be calculated using active position and number of lines pasted.
         * Calculation is delayed to handle case of pasting code at end of document. 
         */
        let formatRanges: [vscode.Position, number][] = [];
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
                    e.replace(pasteAt, regEntry.text[i].trimStart());

                    let linesPasted = regEntry.text[i].split("\n").length - 1;
                    formatRanges.push([sel.active, linesPasted]);
                } else {
                    e.replace(pasteAt, regEntry.text.join("\n").trimStart());

                    let linesPasted = regEntry.text.join("\n").split("\n").length - 1;
                    formatRanges.push([sel.active, linesPasted]);
                }
            }
        }).then(res => {
            Logger.log("edit possible: ", res);
            setImmediate(() => {
                formatRanges.forEach(([active, linesPasted]) => {
                    let range = new vscode.Range(
                        active.with({ character: 0 }),
                        editor!.document.lineAt(active.line + linesPasted).range.end
                    );
                    vscode.commands.executeCommand('editor.action.formatSelection', range);
                });
                VimState.setMode('NORMAL');
                VimState.normalizeEditorSelection(editor!);
            });
        });
    });
}

function undo() {

}

function joinLine() {
    let editor = vscode.window.activeTextEditor;
    if (!editor) { return; }
    editor.edit(e => {
        if (!editor) { return; }
        for (let sel of VimState.cursor.selections) {
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

function deleteToLineEnd() {
    OperatorHandler.execute(Delete, {
        motion: MotionHandler.moveInLine,
        motionArgs: ['end']
    });
}

function changeToLineEnd() {
    OperatorHandler.execute(Change, {
        motion: MotionHandler.moveInLine,
        motionArgs: ['end']
    });
}

function cutToLineEnd() {
    OperatorHandler.execute(Move, {
        motion: MotionHandler.moveInLine,
        motionArgs: ['end']
    });
}

export const editActionKeymap: Keymap[] = [
    {
        key: ['x'],
        type: 'Action',
        action: (_: any, repeat: number) => deleteChar(false, repeat),
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE']
    }, {
        key: ['s'],
        type: 'Action',
        action: (_: any, repeat: number) => deleteChar(true, repeat),
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE']
    },
    {
        key: ['J'],
        type: 'Action',
        action: () => { vscode.commands.executeCommand("editor.action.joinLines"); },
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE']
    },
    {
        key: ['p'],
        type: 'Action',
        action: () => { paste('after'); },
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE']
    },
    {
        key: ['P'],
        type: 'Action',
        action: () => { paste('before'); },
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE']
    },
    {
        key: ['u'],
        type: 'Action',
        action: () => { vscode.commands.executeCommand('undo'); },
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE']
    },
    {
        key: ['D'],
        type: 'Action',
        action: () => deleteToLineEnd(),
        mode: ['NORMAL']
    },
    {
        key: ['C'],
        type: 'Action',
        action: () => changeToLineEnd(),
        mode: ['NORMAL']
    },
    {
        key: ['M'],
        type: 'Action',
        action: () => cutToLineEnd(),
        mode: ['NORMAL']
    },
];
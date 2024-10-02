import * as vscode from 'vscode';
import { KeyParseState } from "../keyHandler";
import { VimState } from "../vimState";
import { OperatorHandler, OperatorResult } from "../operatorHandler";
import { REGISTERS } from "../register";
import { Logger } from "../util";

export class Change {
    static async exec(OH: OperatorHandler, {
        preArgs = "", postArg = ""
    }): Promise<OperatorResult> {
        Logger.log("Inside operator call.");
        if (preArgs.length > 0 && preArgs !== 'c') {
            return { parseState: KeyParseState.Failed };
        }
        if (postArg.length > 0) {
            return { parseState: KeyParseState.Failed };
        }

        let linewise = false;
        if (preArgs === 'c') {
            linewise = true;
            VimState.cursor.selections = VimState.cursor.selections.map(sel => {
                let line = OH.editor.document.lineAt(sel.active);
                let endLine: vscode.TextLine | undefined;
                if (OH.repeat) {
                    endLine = OH.editor.document.lineAt(sel.active.line + OH.repeat - 1);
                }
                return {
                    anchor: line.range.start,
                    active: (endLine || line).range.end
                };
            });
        }

        VimState.syncSelectionAndExec(async () => {
            let text = OH.editor.selections.map(r => OH.editor.document.getText(r));
            VimState.register.write(text, 'delete', linewise);

            if (VimState.register.selectedReg === REGISTERS.CLIPBOARD_REG) {
                // cut range under selection
                await vscode.commands.executeCommand('editor.action.clipboardCutAction')
                    .then(_res => {
                        // VimState.setModeAfterNextSlectionUpdate('INSERT');
                        setImmediate(() => VimState.setMode('INSERT'));
                    });
            } else {
                await OH.editor.edit(e => {
                    for (let range of OH.editor.selections) {
                        e.delete(range);
                    }
                }).then(res => {
                    Logger.log("edit possible: ", res);
                    setImmediate(() => {
                        VimState.setMode('INSERT');
                    });
                });
            }
        });
        return { parseState: KeyParseState.Success };
    }
}
import * as vscode from 'vscode';
import { KeyParseState } from "../keyHandler";
import { VimState } from "../vimState";
import { OperatorHandler } from "../operatorHandler";
import { REGISTERS } from "../register";
import { Logger } from "../util";

export class Delete {
    static async exec(OH: OperatorHandler, { preArgs = "", postArgs = "" }): Promise<KeyParseState> {
        Logger.log("Inside operator call.");
        Logger.log("preAard: ", preArgs, "--  postArg: ", postArgs);
        if (preArgs.length > 0 && preArgs !== 'd') {
            return KeyParseState.Failed;
        }
        if (postArgs.length > 0) {
            return KeyParseState.Failed;
        }

        let linewiseRanges: vscode.Range[] | undefined;
        let linewise = false;
        if (preArgs === 'd') {
            linewise = true;
            linewiseRanges = VimState.vimCursor.selections.map(sel => {
                let line = OH.editor.document.lineAt(sel.active).rangeIncludingLineBreak;
                if (OH.repeat) {
                    let endLine = OH.editor.document.lineAt(sel.active.line + OH.repeat - 1).rangeIncludingLineBreak;
                    line = new vscode.Range(line.start, endLine.end);
                }
                return line;
            });
        }

        await VimState.syncSelectionAndExec(async () => {
            let text = (linewiseRanges || OH.editor.selections)
                .map(r => OH.editor.document.getText(r));
            VimState.register.write(text, 'delete', linewise);

            if (VimState.register.selectedReg === REGISTERS.CLIPBOARD_REG) {
                // cut range under selection
                await vscode.commands.executeCommand('editor.action.clipboardCutAction')
                    .then(_res => {
                        VimState.setModeAfterNextSlectionUpdate('NORMAL');
                    });
            } else {
                await OH.editor.edit(e => {
                    for (let range of (linewiseRanges || OH.editor.selections)) {
                        e.delete(range);
                    }
                }).then(res => {
                    Logger.log("edit possible: ", res);
                    if (VimState.currentMode !== 'NORMAL') {
                        VimState.setMode('NORMAL');
                    }
                });
            }
        });
        return KeyParseState.Success;
    }
}
import * as vscode from 'vscode';
import { KeyParseState } from "../keyHandler";
import { VimState } from "../vimState";
import { OperatorHandler, OperatorResult } from "../operatorHandler";
import { REGISTERS } from "../register";
import { Logger } from "../util";

export class Delete {
    static async exec(OH: OperatorHandler, { preArgs = "", postArg = "" }): Promise<OperatorResult> {
        Logger.log("Inside operator call.");
        Logger.log("preAard: ", preArgs, "--  postArg: ", postArg);
        if (preArgs.length > 0 && preArgs !== 'd') {
            return { parseState: KeyParseState.Failed };
        }
        if (postArg.length > 0) {
            return { parseState: KeyParseState.Failed };
        }

        // ranges to be deleted including line break
        let linewiseDeleteRanges: vscode.Range[] | undefined;
        // ranges to be saved in register without linebreak
        let linewiseTextRanges: vscode.Range[] | undefined;
        let linewise = false;
        if (preArgs === 'd') {
            linewise = true;
            linewiseDeleteRanges = [];
            linewiseTextRanges = [];
            VimState.cursor.selections.forEach(sel => {
                let startLine = OH.editor.document.lineAt(sel.active);
                let endLine = startLine;
                if (OH.repeat) {
                    endLine = OH.editor.document
                        .lineAt(sel.active.line + OH.repeat - 1);
                }
                linewiseTextRanges!.push(new vscode.Range(
                    startLine.range.start, endLine.range.end
                ));
                linewiseDeleteRanges!.push(new vscode.Range(
                    startLine.range.start, endLine.rangeIncludingLineBreak.end
                ));
                // return line;
            });
        }

        await VimState.syncSelectionAndExec(async () => {
            let text = (linewiseTextRanges || OH.editor.selections)
                .map(r => OH.editor.document.getText(r));
            VimState.register.write(text, 'delete', linewise);

            if (VimState.register.selectedReg === REGISTERS.CLIPBOARD_REG) {
                // cut range under selection
                await vscode.commands.executeCommand('editor.action.clipboardCutAction')
                    .then(_res => {
                        // VimState.setModeAfterNextSlectionUpdate('NORMAL');
                        setImmediate(() => VimState.setMode('NORMAL'));
                    });
            } else {
                await OH.editor.edit(e => {
                    for (let range of (linewiseDeleteRanges || OH.editor.selections)) {
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
        return { parseState: KeyParseState.Success };
    }
}
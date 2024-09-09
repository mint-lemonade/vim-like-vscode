import * as vscode from 'vscode';
import { KeyParseState } from "../keyHandler";
import { VimState } from "../vimState";
import { OperatorHandler } from "../operatorHandler";
import { REGISTERS } from "../register";
import { highlightText, Logger } from "../util";

export class Yank {
    static async exec(OH: OperatorHandler, { preArgs = "", postArgs = "" }): Promise<KeyParseState> {
        Logger.log("Inside operator call.");
        if (preArgs.length > 0 && preArgs !== 'y') {
            return KeyParseState.Failed;
        }
        if (postArgs.length > 0) {
            return KeyParseState.Failed;
        }

        let linewise = false;

        if (preArgs === 'y') {
            linewise = true;
            VimState.cursor.selections = VimState.cursor.selections.map(sel => {
                let line = OH.editor!.document.lineAt(sel.active);
                let endLine: vscode.TextLine | undefined;
                if (OH.repeat) {
                    endLine = OH.editor!.document.lineAt(sel.active.line + OH.repeat - 1);
                }
                return {
                    anchor: line.range.start,
                    active: (endLine || line).range.end
                };
            });
        }

        VimState.syncSelectionAndExec(async () => {
            let text = OH.editor!.selections.map(r => OH.editor!.document.getText(r));
            VimState.register.write(text, 'yank', linewise);

            highlightText(OH.editor!.selections);

            if (VimState.register.selectedReg === REGISTERS.CLIPBOARD_REG) {
                // copy range under selection
                await vscode.commands.executeCommand('editor.action.clipboardCopyAction')
                    .then(_res => {
                        VimState.setModeAfterNextSlectionUpdate('INSERT');
                    });
            } else {
                let selections = OH.editor.selections.map(r => ({
                    anchor: r.start,
                    active: r.start,
                }));
                if (VimState.currentMode !== 'NORMAL') {
                    VimState.setMode('NORMAL');
                }
                setImmediate(() => {
                    VimState.cursor.selections = selections;
                    VimState.syncVsCodeCursorOrSelection();
                });
            }
        });

        return KeyParseState.Success;
    }
}
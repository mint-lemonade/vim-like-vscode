import * as vscode from 'vscode';
import { KeyParseState } from "../keyHandler";
import { VimState } from "../vimState";
import { OperatorHandler, OperatorResult } from "../operatorHandler";

export class ToUpperCase {
    static async exec(OH: OperatorHandler): Promise<OperatorResult> {
        await VimState.syncSelectionAndExec(async () => {
            vscode.commands.executeCommand('editor.action.transformToUppercase');
        });
        return { parseState: KeyParseState.Success };
    }
}

export class ToLowerCase {
    static async exec(OH: OperatorHandler): Promise<OperatorResult> {
        await VimState.syncSelectionAndExec(async () => {
            vscode.commands.executeCommand('editor.action.transformToLowercase');
        });
        return { parseState: KeyParseState.Success };
    }
}
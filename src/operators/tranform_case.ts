import * as vscode from 'vscode';
import { KeyParseState } from "../keyHandler";
import { VimState } from "../vimState";
import { OperatorHandler } from "../operatorHandler";

export class ToUpperCase {
    static async exec(OH: OperatorHandler): Promise<KeyParseState> {
        await VimState.syncSelectionAndExec(async () => {
            vscode.commands.executeCommand('editor.action.transformToUppercase');
        });
        return KeyParseState.Success;
    }
}

export class ToLowerCase {
    static async exec(OH: OperatorHandler): Promise<KeyParseState> {
        await VimState.syncSelectionAndExec(async () => {
            vscode.commands.executeCommand('editor.action.transformToLowercase');
        });
        return KeyParseState.Success;
    }
}
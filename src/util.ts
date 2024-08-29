import { VimState } from "./mode";
import * as vscode from 'vscode';

export function printCursorPositions(mssg?: string) {
    if (mssg) { Logger.log(mssg); }
    Logger.log(" |  Vim: [anchor, active]");
    Logger.log(" |\t", VimState.vimCursor.selections.map(s => {
        return `[(${s.anchor.line}, ${s.anchor.character}) to (${s.active.line}, ${s.active.character})]`;
    }).toString());
    Logger.log(" |  Vscode: [anchor, active]");
    Logger.log(" |\t", vscode.window.activeTextEditor?.selections.map(s => {
        return `[(${s.anchor.line}, ${s.anchor.character}) to (${s.active.line}, ${s.active.character})]`;
    }).toString());
}

export const Logger = {
    log: (message?: any, ...optionalParams: any[]) => {
        if (process.env.LOG_LEVEL === 'debug') {
            console.log(message, ...optionalParams);
        }
    },
    info: (message?: any, ...optionalParams: any[]) => {
        if (process.env.LOG_LEVEL === 'debug') {
            console.info(message, ...optionalParams);
        }
    }
};
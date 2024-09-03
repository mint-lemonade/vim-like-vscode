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

export function highlightText(at: readonly vscode.Range[] | vscode.Position[]) {
    if (at.length === 0) { return; }
    let editor = vscode.window.activeTextEditor;
    if (!editor) { return; }
    let config = vscode.workspace.getConfiguration("vim-like");
    let bgColor = config.get('yankHighlightBackgroundColor') as string;
    let textColor = config.get('yankHighlightForegroundColor') as string;
    let duration = parseInt(config.get('yankHighlightDuration') as string);
    const decorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: bgColor,
        color: textColor,
    });
    let ranges = at.map(p => {
        if (p instanceof vscode.Range) {
            return p;
        }
        return new vscode.Range(p, p.translate(0, 1));
    });
    editor.setDecorations(decorationType, ranges);
    setTimeout(() => {
        editor?.setDecorations(decorationType, []);
    }, duration);
}

import assert from "assert";

interface Equality<T> {
    isEqual: (other: T) => boolean
}
export function assertEqual<T extends Equality<T>>(a: T, b: T, replaceMssg?: string, extraInfo: string = ""): void {
    if (!a.isEqual(b)) {
        // Customize the error message
        const errorMessage = replaceMssg || `[context: ${extraInfo}] Expected objects to be equal:\nA: ${JSON.stringify(a, null, 2)}\nB: ${JSON.stringify(b, null, 2)}`;
        assert.fail(errorMessage);
    }
}
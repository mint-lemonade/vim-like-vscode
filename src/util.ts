import { VimState } from "./mode";
import * as vscode from 'vscode';

export function printCursorPositions(mssg?: string) {
    if (mssg) { console.log(mssg); }
    console.log(" |  Vim: [anchor, active]");
    console.log(" |\t", VimState.vimCursor.selections.map(s => {
        return [s.anchor.character, s.active.character];
    }).toString());
    console.log(" |  Vscode: [anchor, active]");
    console.log(" |\t", vscode.window.activeTextEditor?.selections.map(s => {
        return [s.anchor.character, s.active.character];
    }).toString());
}
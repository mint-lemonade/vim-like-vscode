import * as vscode from 'vscode';
import { executeMotion, Motion, MotionHandler } from "./motion";
import { VimState } from './mode';
import { Keymap } from './mapping';

export type Operator = (range: vscode.Range[]) => void;
type OperatorRangeArgs = { motion: Motion, args: any[] };

export function execOperators(op: Operator, operatorRange?: OperatorRangeArgs) {
    let editor = vscode.window.activeTextEditor;
    if (!editor) { return; }
    MotionHandler.editor = editor;
    Operators.editor = editor;

    let ranges: vscode.Range[] = [];
    if (operatorRange) {
        let cursorPosBeforeMotion = VimState.vimCursor.selections.map(sel => sel.active);
        executeMotion(operatorRange.motion, false, ...operatorRange.args);
        VimState.vimCursor.selections.forEach((sel, i) => {
            ranges.push(new vscode.Range(cursorPosBeforeMotion[i], sel.active.translate(0, 1)));
            // reset cursor to original position.
            sel.active = cursorPosBeforeMotion[i];
            sel.anchor = cursorPosBeforeMotion[i];
        });
    } else {
        ranges = VimState.vimCursor.selections.map(sel => {
            return new vscode.Range(sel.anchor, sel.active.translate(0, 1));
        });
    }
    console.log("Ranges : ", ranges);
    op.call(Operators, ranges);
}

export class Operators {
    static editor: vscode.TextEditor;

    static delete(ranges: vscode.Range[]) {
        console.log("Inside operator call.");
        this.editor.edit(e => {
            for (let range of ranges) {
                e.delete(range);
            }
        }).then(res => {
            console.log("editor Edit result: ", res);
            VimState.setMode('NORMAL');
        });
    }

}

export const operatorKeyMap: Keymap[] = [
    {
        key: ['d'],
        type: 'Operator',
        action: Operators.delete,
        mode: ['NORMAL', 'VISUAL']
    }
];
import * as vscode from 'vscode';
import { executeMotion, Motion, MotionHandler } from "./motion";
import { VimState } from './mode';
import { Keymap } from './mapping';
import { printCursorPositions } from './util';

export type Operator = (range: vscode.Range[]) => void | Promise<void>;
type OperatorRangeArgs = { motion: Motion, motionArgs: any[] };

export async function execOperators(op: Operator, operatorRange?: OperatorRangeArgs) {
    let editor = vscode.window.activeTextEditor;
    if (!editor) { return; }
    MotionHandler.editor = editor;
    Operators.editor = editor;
    op = op.bind(Operators);

    let ranges: vscode.Range[] = [];
    if (operatorRange) {
        // Operator is executed in normal mode with provided motion as range
        executeMotion(operatorRange.motion, false, ...operatorRange.motionArgs);
        console.log("Executing operator from NORMAL mode");
        VimState.syncSelectionAndExec(() => op(ranges));
    } else {
        // Operator is executed in visual mode with selection as range
        console.log("Executing operator from VISUAL mode");
        await op(ranges);
        printCursorPositions("OPERATOR executed!");
    }
}

export class Operators {
    static editor: vscode.TextEditor;

    static async delete(ranges: vscode.Range[]) {
        console.log("Inside operator call.");
        // cut range under selection
        await vscode.commands.executeCommand('editor.action.clipboardCutAction')
            .then(_res => {
                VimState.setModeAfterNextSlectionUpdate('NORMAL');
            });
    }

    static async change(ranges: vscode.Range[]) {
        console.log("Inside operator call.");

        await vscode.commands.executeCommand('editor.action.clipboardCutAction');
        // vscode.commands.
        // if (this.editor.se)
        VimState.setModeAfterNextSlectionUpdate('INSERT');
    }

    static copy(ranges: vscode.Range[]) {

    }

}

export const operatorKeyMap: Keymap[] = [
    {
        key: ['d'],
        type: 'Operator',
        action: Operators.delete,
        mode: ['NORMAL', 'VISUAL']
    },
    {
        key: ['c'],
        type: 'Operator',
        action: Operators.change,
        mode: ['NORMAL', 'VISUAL']
    }
];
import * as vscode from 'vscode';
import { executeMotion, Motion, MotionHandler } from "./motion";
import { VimState } from './mode';
import { Keymap } from './mapping';
import { Logger, printCursorPositions } from './util';

/**
 * @returns **true** if operator is executed or is invalid. KeymapHandler can turn off OP_PENDING MODE.
 * 
 *   **fasle** if operator still needs more args. KeymapHandler should parse more operator args.
 */
export type Operator = (
    ranges: vscode.Range[], preArgs?: string, postArgs?: string
) => boolean | Promise<boolean>;

type OperatorArgs = { motion?: Motion, motionArgs?: any[], preArgs?: string, postArgs?: string };

/**
 * @returns **true** if operator is executed or is invalid. KeymapHandler can turn off OP_PENDING MODE.
 * 
 *   **fasle** if operator still needs more args. KeymapHandler should parse more operator args.
 */
export async function execOperators(op: Operator, opArgs?: OperatorArgs): Promise<boolean> {
    let editor = vscode.window.activeTextEditor;
    if (!editor) { return true; }
    MotionHandler.editor = editor;
    Operators.editor = editor;
    op = op.bind(Operators);

    let ranges: vscode.Range[] = [];
    if (opArgs?.motion) {
        // Operator is executed in normal mode with provided motion as range
        executeMotion(opArgs.motion, false, ...(opArgs.motionArgs || []));
        Logger.log("Executing operator from NORMAL mode");
        return VimState.syncSelectionAndExec(() => op(ranges, opArgs.preArgs, opArgs.postArgs));
    } else {
        // Operator is executed in visual mode with selection as range
        Logger.log("Executing operator from VISUAL mode");
        return op(ranges, opArgs?.preArgs, opArgs?.postArgs);
        printCursorPositions("OPERATOR executed!");
    }
}

export class Operators {
    static editor: vscode.TextEditor;

    static async delete(ranges: vscode.Range[], preArgs = "", postArgs = ""): Promise<boolean> {
        Logger.log("Inside operator call.");
        Logger.log("preAard: ", preArgs, "--  postArg: ", postArgs);
        if (preArgs.length > 0 && preArgs !== 'd') {
            return true;
        }
        if (postArgs.length > 0) {
            return true;
        }
        // cut range under selection
        await vscode.commands.executeCommand('editor.action.clipboardCutAction')
            .then(_res => {
                VimState.setModeAfterNextSlectionUpdate('NORMAL');
            });
        return true;
    }

    static async change(ranges: vscode.Range[], preArgs = "", postArgs = ""): Promise<boolean> {
        Logger.log("Inside operator call.");
        if (preArgs.length > 0 && preArgs !== 'c') {
            return true;
        }
        if (postArgs.length > 0) {
            return true;
        }
        await vscode.commands.executeCommand('editor.action.clipboardCutAction');
        // vscode.commands.
        // if (this.editor.se)
        VimState.setModeAfterNextSlectionUpdate('INSERT');
        return true;
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
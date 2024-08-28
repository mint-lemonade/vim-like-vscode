import * as vscode from 'vscode';
import { executeMotion, Motion, MotionHandler } from "./motion";
import { VimState } from './mode';
import { Keymap } from './mapping';
import { Logger, printCursorPositions } from './util';
import { execTextObject, TextObject, TextObjects } from './text_objects';
import { REGISTERS } from './register';

/**
 * @returns **true** if operator is executed or is invalid. KeymapHandler can turn off OP_PENDING MODE.
 * 
 *   **fasle** if operator still needs more args. KeymapHandler should parse more operator args.
 */
export type Operator = (
    ranges: vscode.Range[], preArgs?: string, postArgs?: string
) => boolean | Promise<boolean>;

type OperatorArgs = {
    motion?: Motion, motionArgs?: any[],
    textObject?: TextObject, textObjectArgs?: any[],
    preArgs?: string, postArgs?: string
};

/**
 * @returns **true** if operator is executed or is invalid. KeymapHandler can turn off OP_PENDING MODE.
 * 
 *   **fasle** if operator still needs more args. KeymapHandler should parse more operator args.
 */
export async function execOperators(op: Operator, args?: OperatorArgs): Promise<boolean> {
    let editor = vscode.window.activeTextEditor;
    if (!editor) { return true; }
    MotionHandler.editor = editor;
    Operators.editor = editor;
    TextObjects.editor = editor;
    op = op.bind(Operators);

    let result: boolean;
    let oldSelections = VimState.vimCursor.selections;
    let ranges: vscode.Range[] = [];
    if (args?.motion) {
        // Operator is executed in normal mode with provided motion as range
        executeMotion(args.motion, false, ...(args.motionArgs || []));
        ranges = VimState.vimCursor.selections
            .map(sel => new vscode.Range(sel.active, sel.anchor))
            .map(r => r.with(undefined, r.end.translate(0, 1)));
        result = await op(ranges, args.preArgs, args.postArgs);
        VimState.syncVimCursor();
    } else if (args?.textObject) {
        ranges = execTextObject(args.textObject, false, ...(args.textObjectArgs || []))
            .map(r => r.with(undefined, r.end.translate(0, 1)));
        result = await op(ranges, args.preArgs, args.postArgs);
        VimState.syncVimCursor();
    } else {
        // Operator is executed in visual mode with selection as range
        ranges = VimState.vimCursor.selections
            .map(sel => new vscode.Range(sel.active, sel.anchor))
            .map(r => r.with(undefined, r.end.translate(0, 1)));

        Logger.log("Executing operator from VISUAL mode");
        result = await op(ranges, args?.preArgs, args?.postArgs);
        printCursorPositions("OPERATOR executed!");
    }

    return result;
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
        if (preArgs === 'd') {
            ranges = VimState.vimCursor.selections.map(sel => {
                let line = this.editor.document.lineAt(sel.active);
                return line.rangeIncludingLineBreak;
            });
        }

        let text = ranges.map(r => this.editor.document.getText(r));
        VimState.register.write(text, 'delete');

        if (VimState.register.selectedReg === REGISTERS.CLIPBOARD_REG) {
            // cut range under selection
            VimState.syncSelectionAndExec(async () => {
                await vscode.commands.executeCommand('editor.action.clipboardCutAction')
                    .then(_res => {
                        VimState.setModeAfterNextSlectionUpdate('NORMAL');
                    });
            });
        } else {
            let selections = ranges.map(r => ({
                anchor: r.start,
                active: r.start,
            }));
            await this.editor.edit(e => {
                for (let range of ranges) {
                    e.delete(range);
                }
            }).then(res => {
                Logger.log("edit possible: ", res);
                if (VimState.currentMode !== 'NORMAL') {
                    VimState.setMode('NORMAL');
                }
                setImmediate(() => {
                    VimState.vimCursor.selections = selections;
                    VimState.syncVsCodeCursorOrSelection();
                });
            });
        }
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

        if (preArgs === 'c') {
            ranges = VimState.vimCursor.selections.map(sel => {
                let line = this.editor.document.lineAt(sel.active);
                return line.range;
            });
        }

        let text = ranges.map(r => this.editor.document.getText(r));
        VimState.register.write(text, 'delete');

        if (VimState.register.selectedReg === REGISTERS.CLIPBOARD_REG) {
            // cut range under selection
            VimState.syncSelectionAndExec(async () => {
                await vscode.commands.executeCommand('editor.action.clipboardCutAction')
                    .then(_res => {
                        VimState.setModeAfterNextSlectionUpdate('INSERT');
                    });
            });
        } else {
            await this.editor.edit(e => {
                for (let range of ranges) {
                    e.delete(range);
                }
            }).then(res => {
                Logger.log("edit possible: ", res);
                let selections = VimState.vimCursor.selections.map(sel => ({
                    anchor: sel.anchor,
                    active: sel.anchor,
                }));
                setImmediate(() => {
                    VimState.vimCursor.selections = selections;
                    VimState.setMode('INSERT');
                });
            });
        }
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
        longDesc: ['(d)elete '],
        mode: ['NORMAL', 'VISUAL']
    },
    {
        key: ['c'],
        type: 'Operator',
        action: Operators.change,
        longDesc: ['(c)hange '],
        mode: ['NORMAL', 'VISUAL']
    }
];
import * as vscode from 'vscode';
import { executeMotion, Motion, MotionHandler } from "./motion";
import { VimState } from './mode';
import { Keymap, OperatorKeymap } from './mapping';
import { highlightText, Logger, printCursorPositions } from './util';
import { execTextObject, TextObject, TextObjects } from './text_objects';
import { REGISTERS } from './register';
import { Surround, surround } from './surround';

/**
 * @returns **true** if operator is executed or is invalid. KeymapHandler can turn off OP_PENDING MODE.
 * 
 *   **fasle** if operator still needs more args. KeymapHandler should parse more operator args.
 */
export type Operator = (
    ranges: vscode.Range[] | undefined, preArgs?: string, postArg?: string, km?: Keymap
) => boolean | Promise<boolean>;

type OperatorArgs = {
    motion?: Motion, motionArgs?: any[],
    textObject?: TextObject, textObjectArgs?: any[],
    preArgs?: string, postArg?: string,
    km?: Keymap, postArgKm?: Keymap
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
    if (args?.km?.type === 'Operator') {
        Operators.curOpKeymap = args?.km;
    }
    TextObjects.editor = editor;
    op = op.bind(Operators);

    let result: boolean;
    let ranges: vscode.Range[] = [];
    if (args?.motion && !(Operators.curOpKeymap)?.handlePostArgs) {
        // Operator is executed in normal mode with provided motion as range
        executeMotion(args.motion, false, ...(args.motionArgs || []));
        result = await op(ranges, args.preArgs, args.postArg);
        VimState.syncVimCursor();
    } else if (args?.textObject && !(Operators.curOpKeymap)?.handlePostArgs) {
        execTextObject(args.textObject, false, ...(args.textObjectArgs || []));
        result = await op(ranges, args.preArgs, args.postArg);
        VimState.syncVimCursor();
    } else {
        // Operator is executed in visual mode with selection as range
        Logger.log("Executing operator from VISUAL mode");
        result = await op(ranges, args?.preArgs, args?.postArg, args?.postArgKm);
        printCursorPositions("OPERATOR executed!");
    }
    if (result) {
        // TODO: Refactor to properly set the reset mechanism after every operator.
        Surround.reset();
    }

    return result;
}

export class Operators {
    static editor: vscode.TextEditor;
    static curOpKeymap: OperatorKeymap | undefined;
    static matchedSeq: string;
    static repeat: number;

    static async delete(ranges: vscode.Range[] | undefined, preArgs = "", postArgs = ""): Promise<boolean> {
        Logger.log("Inside operator call.");
        Logger.log("preAard: ", preArgs, "--  postArg: ", postArgs);
        if (preArgs.length > 0 && preArgs !== 'd') {
            return true;
        }
        if (postArgs.length > 0) {
            return true;
        }

        let linewiseRanges: vscode.Range[] | undefined;
        let linewise = false;
        if (preArgs === 'd') {
            linewise = true;
            linewiseRanges = VimState.vimCursor.selections.map(sel => {
                let line = this.editor.document.lineAt(sel.active).rangeIncludingLineBreak;
                if (this.repeat) {
                    let endLine = this.editor.document.lineAt(sel.active.line + this.repeat - 1).rangeIncludingLineBreak;
                    line = new vscode.Range(line.start, endLine.end);
                }
                return line;
            });
        }

        await VimState.syncSelectionAndExec(async () => {
            let text = (linewiseRanges || this.editor.selections)
                .map(r => this.editor.document.getText(r));
            VimState.register.write(text, 'delete', linewise);

            if (VimState.register.selectedReg === REGISTERS.CLIPBOARD_REG) {
                // cut range under selection
                await vscode.commands.executeCommand('editor.action.clipboardCutAction')
                    .then(_res => {
                        VimState.setModeAfterNextSlectionUpdate('NORMAL');
                    });
            } else {
                await this.editor.edit(e => {
                    for (let range of (linewiseRanges || this.editor.selections)) {
                        e.delete(range);
                    }
                }).then(res => {
                    Logger.log("edit possible: ", res);
                    if (VimState.currentMode !== 'NORMAL') {
                        VimState.setMode('NORMAL');
                    }
                });
            }
        });
        return true;
    }

    static async change(ranges: vscode.Range[] | undefined, preArgs = "", postArgs = ""): Promise<boolean> {
        Logger.log("Inside operator call.");
        if (preArgs.length > 0 && preArgs !== 'c') {
            return true;
        }
        if (postArgs.length > 0) {
            return true;
        }

        let linewise = false;
        if (preArgs === 'c') {
            linewise = true;
            VimState.vimCursor.selections = VimState.vimCursor.selections.map(sel => {
                let line = this.editor.document.lineAt(sel.active);
                let endLine: vscode.TextLine | undefined;
                if (this.repeat) {
                    endLine = this.editor.document.lineAt(sel.active.line + this.repeat - 1);
                }
                return {
                    anchor: line.range.start,
                    active: (endLine || line).range.end
                };
            });
        }

        VimState.syncSelectionAndExec(async () => {
            let text = this.editor.selections.map(r => this.editor.document.getText(r));
            VimState.register.write(text, 'delete', linewise);

            if (VimState.register.selectedReg === REGISTERS.CLIPBOARD_REG) {
                // cut range under selection
                await vscode.commands.executeCommand('editor.action.clipboardCutAction')
                    .then(_res => {
                        VimState.setModeAfterNextSlectionUpdate('INSERT');
                    });
            } else {
                await this.editor.edit(e => {
                    for (let range of this.editor.selections) {
                        e.delete(range);
                    }
                }).then(res => {
                    Logger.log("edit possible: ", res);
                    setImmediate(() => {
                        VimState.setMode('INSERT');
                    });
                });
            }
        });
        return true;
    }

    static async yank(ranges: vscode.Range[] | undefined, preArgs = "", postArgs = ""): Promise<boolean> {
        Logger.log("Inside operator call.");
        if (preArgs.length > 0 && preArgs !== 'y') {
            return true;
        }
        if (postArgs.length > 0) {
            return true;
        }

        let linewise = false;

        if (preArgs === 'y') {
            linewise = true;
            VimState.vimCursor.selections = VimState.vimCursor.selections.map(sel => {
                let line = this.editor.document.lineAt(sel.active);
                let endLine: vscode.TextLine | undefined;
                if (this.repeat) {
                    endLine = this.editor.document.lineAt(sel.active.line + this.repeat - 1);
                }
                return {
                    anchor: line.range.start,
                    active: (endLine || line).range.end
                };
            });
        }

        VimState.syncSelectionAndExec(async () => {
            let text = this.editor.selections.map(r => this.editor.document.getText(r));
            VimState.register.write(text, 'yank', linewise);

            highlightText(this.editor.selections);

            if (VimState.register.selectedReg === REGISTERS.CLIPBOARD_REG) {
                // copy range under selection
                await vscode.commands.executeCommand('editor.action.clipboardCopyAction')
                    .then(_res => {
                        VimState.setModeAfterNextSlectionUpdate('INSERT');
                    });
            } else {
                let selections = this.editor.selections.map(r => ({
                    anchor: r.start,
                    active: r.start,
                }));
                if (VimState.currentMode !== 'NORMAL') {
                    VimState.setMode('NORMAL');
                }
                setImmediate(() => {
                    VimState.vimCursor.selections = selections;
                    VimState.syncVsCodeCursorOrSelection();
                });
            }
        });

        return true;
    }
}

export const operatorKeyMap: Keymap[] = [
    {
        key: ['d'],
        type: 'Operator',
        action: Operators.delete,
        longDesc: ['(d)elete '],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE']
    },
    {
        key: ['c'],
        type: 'Operator',
        action: Operators.change,
        longDesc: ['(c)hange '],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE']
    }, {
        key: ['y'],
        type: 'Operator',
        action: Operators.yank,
        longDesc: ['(y)ank '],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE']
    },
    {
        key: ['s'],
        type: 'Operator',
        action: surround,
        longDesc: ['(s)urround'],
        mode: ['OP_PENDING_MODE'],
        handlePostArgs: true,
    },
];
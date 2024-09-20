import * as vscode from 'vscode';
import { Keymap, KeyParseState } from "../keyHandler";
import { VimState } from '../vimState';
import { TextObjectData, TextObjects } from '../textObjectHandler';
import { highlightText } from '../util';
import { Operator, OperatorHandler } from '../operatorHandler';
import { executeMotion, MotionData, MotionHandler } from '../motionHandler';

const STOP_PARSE = true;
const CONT_PARSE = false;

const quotes = ['\"', '\'', '\`'];
let openingBrackets: Record<string, string> = {
    '{': '{', '[': '[', '(': '(', '<': '<',
    '}': '{', ']': '[', ')': '(', '>': '<',
};
let closingBrackets: Record<string, string> = {
    '{': '}', '[': ']', '(': ')', '<': '>',
    '}': '}', ']': ']', ')': ')', '>': '>',
};
const brackets = "{}[]()<>";

export class Surround {
    static editor: vscode.TextEditor;
    static modifier: string;
    static linewise: boolean;
    static state: 'on' | 'off' = 'off';
    static surround_at: {
        start: vscode.Position;
        end: vscode.Position;
    }[];
    static getSurroundInput: boolean = false;
    static surround_with: {
        start: string,
        end: string
    } | undefined;

    static async exec(OH: OperatorHandler, {
        preArgs = "", postArg = "", km
    }: {
        preArgs?: string, postArg?: string, km?: Keymap
    }): Promise<KeyParseState> {
        if (vscode.window.activeTextEditor) {
            this.editor = vscode.window.activeTextEditor;
        } else {
            return KeyParseState.Failed;
        }

        if (this.state === 'off' && !"dcy".includes(preArgs)) {
            return KeyParseState.Failed;
        }
        if (this.state === 'off') {
            this.state = 'on';
            this.modifier = preArgs;
            this.updateStatusBar();
            return KeyParseState.MoreInput;
        }

        // braces are interpreted as motion, 
        // handle them as any other unknown key instead
        if (km?.type === 'Motion' && brackets.includes(km.key[0])) {
            postArg = km.key[0];
            km = undefined;
            // remove from status bar, as it will be added again as uknown key.
            VimState.keyHandler.statusBar.contents.pop();
        }

        if (this.getSurroundInput) {
            if (km) { return KeyParseState.Failed; }

            if (quotes.includes(postArg)) {
                this.surround_with = {
                    start: postArg,
                    end: postArg
                };
            } else if (brackets.includes(postArg)) {
                this.surround_with = {
                    start: openingBrackets[postArg],
                    end: closingBrackets[postArg]
                };
            } else {
                return KeyParseState.Failed;
            }
            await this.surround();
            return KeyParseState.Success;
        }

        let textObjData: TextObjectData;
        let motionData: MotionData;
        if (this.modifier === 'd' || this.modifier === 'c') {
            if (km) {
                return KeyParseState.Failed;
            }
            if (!quotes.includes(postArg) && !brackets.includes(postArg)) {
                return KeyParseState.Failed;
            }
            if (quotes.includes(postArg)) {
                textObjData = TextObjects.quotesObject(postArg, 'around');
            }
            else /** brackets.includes(postArg) */ {
                textObjData = TextObjects.bracesObject(postArg, 'around');
            }
            this.surround_at = textObjData.filter(t => t).map(textObj => {
                return {
                    start: textObj!.openingWrapper,
                    end: textObj!.closingWrapper
                };
            });
            this.updateStatusBar(postArg);
        }
        else if (this.modifier === 'y') {
            if (preArgs === 's') {
                if (this.linewise) { return KeyParseState.Failed; }
                this.linewise = true;
                this.updateStatusBar();
                this.getSurroundInput = true;
                this.surround_at = VimState.cursor.selections.map(sel => {
                    let line = this.editor.document.lineAt(sel.active);
                    return {
                        start: line.range.start,
                        end: line.range.end
                    };
                });
                return KeyParseState.MoreInput;
            }
            if (km?.type === 'TextObject') {
                textObjData = km.action.call(TextObjects, ...(km.args || []));
                this.surround_at = textObjData.filter(t => t).map(txtObj => {
                    return {
                        start: txtObj!.range.start,
                        end: txtObj!.range.end
                    };
                });
            } else if (km?.type === 'Motion') {

                executeMotion(km.action, false, ...(km.args || []));
                this.surround_at = VimState.cursor.selections.map((sel, i) => {
                    return {
                        start: sel.anchor,
                        end: sel.active
                    };
                });
            } else {
                return KeyParseState.Failed;
            }
        } else {
            console.error(`Invalid surround modifer ${this.modifier}`);
            return KeyParseState.Failed;
        }

        if (this.modifier === 'd') {
            await this.surround();
            return KeyParseState.Success;
        }
        this.getSurroundInput = true;
        return KeyParseState.MoreInput;
    }

    static updateStatusBar(str: string = "") {
        let showLongDesc = vscode.workspace.getConfiguration("vim-like")
            .get('longStatusBarText') as boolean;
        let statusBarText: string = "";
        if (this.modifier === 'd') {
            statusBarText = showLongDesc ? '(ds)delete-surrounding ' : 'ds';
        } else if (this.modifier === 'c') {
            statusBarText = showLongDesc ? '(cs)change-surrounding ' : 'cs';
        } else if (this.modifier === 'y') {
            if (this.linewise) {
                statusBarText = showLongDesc ? '(yss)surround-line-with ' : 'yss';
            } else {
                statusBarText = showLongDesc ? '(ys)add-surrounding ' : 'ys';
            }
        }
        statusBarText += str;
        VimState.keyHandler.updateStatusBarContent(
            'op', undefined, undefined, statusBarText
        );
    }

    static async surround() {
        let edit;
        let highlightRanges: vscode.Position[] = [];
        if (this.modifier === 'd') {
            edit = this.editor.edit(e => {
                for (let at of this.surround_at) {
                    e.delete(new vscode.Range(at.start, at.start.translate(0, 1)));
                    e.delete(new vscode.Range(at.end, at.end.translate(0, 1)));
                }
            });
        } else if (this.modifier === 'c') {
            if (!this.surround_with) {
                console.error("surround_with shouldn't be empty!");
                return KeyParseState.Failed;
            }
            edit = this.editor.edit(e => {
                for (let at of this.surround_at) {
                    e.replace(new vscode.Range(at.start, at.start.translate(0, 1)), this.surround_with!.start);
                    e.replace(new vscode.Range(at.end, at.end.translate(0, 1)), this.surround_with!.end);
                    highlightRanges.push(at.start, at.end);
                }
            });
        } else if (this.modifier === 'y') {
            if (!this.surround_with) {
                console.error("surround_with shouldn't be empty!");
                return KeyParseState.Failed;
            }
            edit = this.editor.edit(e => {
                for (let at of this.surround_at) {
                    e.insert(at.start, this.surround_with!.start);
                    // translate end by 1 char to insert after the word-end
                    e.insert(at.end.translate(0, 1), this.surround_with!.end);
                    // translate end by 1 char to highlight correct char.
                    highlightRanges.push(at.start, at.end.translate(0, 2));
                }
            });
        }
        await edit?.then(result => {
            console.log("Edit possible: ", result);
            highlightText(highlightRanges);
        });
    }

    static reset() {
        this.modifier = "";
        this.linewise = false;
        this.state = 'off';
        this.surround_at = [];
        this.getSurroundInput = false;
        this.surround_with = undefined;
    }
}
// const surround = Surround.op.bind(Surround);
// export { surround };
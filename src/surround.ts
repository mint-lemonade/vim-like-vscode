import * as vscode from 'vscode';
import { Keymap } from "./mapping";
import { VimState } from './mode';
import { TextObjectData, TextObjects } from './text_objects';
import { highlightText } from './util';

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

    // static preArgs: string[];
    static modifier: string;
    static linewise: boolean;
    // static postArgs: any[];
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

    static async op(
        ranges: vscode.Range[] | undefined,
        preArgs = "", postArg = "",
        km?: Keymap
    ): Promise<boolean> {
        if (vscode.window.activeTextEditor) {
            this.editor = vscode.window.activeTextEditor;
        } else {
            return true;
        }

        if (this.state === 'off' && !"dcy".includes(preArgs)) {
            return STOP_PARSE;
        }
        if (this.state === 'off') {
            this.state = 'on';
            this.modifier = preArgs;
            return CONT_PARSE;
        }

        // braces are interpreted as motion, 
        // handle them as any other unknown key instead
        if (km?.type === 'Motion' && brackets.includes(km.key[0])) {
            postArg = km.key[0];
            km = undefined;
        }

        if (this.getSurroundInput) {
            if (km) { return STOP_PARSE; }

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
                return STOP_PARSE;
            }
            await this.execSurround();
            return STOP_PARSE;
        }

        let textObjData: TextObjectData;
        if (this.modifier === 'd' || this.modifier === 'c') {
            if (km) {
                return STOP_PARSE;
            }
            if (!quotes.includes(postArg) && !brackets.includes(postArg)) {
                return STOP_PARSE;
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
        }
        else if (this.modifier === 'y') {
            if (preArgs === 's') {
                if (this.linewise) { return STOP_PARSE; }
                this.linewise = true;
                this.getSurroundInput = true;
                this.surround_at = VimState.vimCursor.selections.map(sel => {
                    let line = this.editor.document.lineAt(sel.active);
                    return {
                        start: line.range.start,
                        end: line.range.end
                    };
                });
                return CONT_PARSE;
            }
            if (km?.type !== 'TextObject') {
                return STOP_PARSE;
            }
            textObjData = km.action.call(TextObjects, ...(km.args || []));
            this.surround_at = textObjData.filter(t => t).map(txtObj => {
                return {
                    start: txtObj!.range.start,
                    end: txtObj!.range.end
                };
            });
        } else {
            console.error(`Invalid surround modifer ${this.modifier}`);
            return STOP_PARSE;
        }

        if (this.modifier === 'd') {
            this.execSurround();
            return STOP_PARSE;
        }
        this.getSurroundInput = true;
        return CONT_PARSE;
    }

    static async execSurround() {
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
                return STOP_PARSE;
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
                return STOP_PARSE;
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
const surround = Surround.op.bind(Surround);
export { surround };
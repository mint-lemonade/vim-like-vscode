import * as vscode from 'vscode';
import { Range } from "vscode";
import { Keymap } from "./keyHandler";
import { VimState } from './vimState';
import { MotionHandler } from './motionHandler';
import { Scanner } from './scanner';

export type TextObjectData = ({
    range: Range,
    openingWrapper: vscode.Position,
    closingWrapper: vscode.Position
} | undefined)[];
export type TextObject = (...args: any[]) => TextObjectData;
type RangeType = 'inside' | 'around';


export class TextObjects {
    static editor: vscode.TextEditor;
    static currentSeq: string;
    static repeat: number = 0;

    static wordObject(wordType: 'word' | 'WORD', rangeType: RangeType): TextObjectData {
        MotionHandler.editor = this.editor;
        let start = MotionHandler.findWordBoundry('cur-start', wordType);
        let end = MotionHandler.findWordBoundry('cur-end', wordType);
        let ranges = VimState.vimCursor.selections.map((sel, i) => {
            return {
                range: new Range(start.positions[i], end.positions[i]).union(new Range(sel.anchor, sel.active)),
                openingWrapper: start.positions[i],
                closingWrapper: end.positions[i]
            };

        });
        return ranges;
    }

    static quotesObject(c: string, type: 'inside' | 'around'): TextObjectData {
        if (!['\"', '\'', '\`'].includes(c)) {
            console.error(`Invalid "${c}" character for textObject`);
            throw new Error(`Invalid "${c}" character for textObject`);
        }
        return VimState.vimCursor.selections.map(sel => {
            let range: Range;
            let line = this.editor.document.lineAt(sel.active);
            let ci = sel.active.character;

            let q1 = line.text.slice(ci).indexOf(c);
            let q0 = line.text.slice(0, ci)
                .split("").reverse().join("").indexOf(c);
            let q2 = line.text.slice(ci + q1 + 1).indexOf(c);

            let adjustStart: number = 0;
            let adjustEnd: number = 0;
            if (type === 'around') {
                adjustStart = -1;
                adjustEnd = 1;
            }
            if (q1 >= 0 && q0 >= 0) {
                // return range in quotes around cursor
                return {
                    range: new Range(
                        new vscode.Position(line.lineNumber, ci - q0 + adjustStart),
                        new vscode.Position(line.lineNumber, ci + q1 - 1 + adjustEnd)
                    ),
                    openingWrapper: new vscode.Position(line.lineNumber, ci - q0 - 1),
                    closingWrapper: new vscode.Position(line.lineNumber, ci + q1)
                };
            }
            else if (q1 >= 0 && q2 >= 0) {
                // return range in quotes after cursor
                return {
                    range: new Range(
                        new vscode.Position(line.lineNumber, ci + q1 + 1 + adjustStart),
                        new vscode.Position(line.lineNumber, ci + q1 + q2 + adjustEnd)
                    ),
                    openingWrapper: new vscode.Position(line.lineNumber, ci + q1),
                    closingWrapper: new vscode.Position(line.lineNumber, ci + q1 + q2 + 1)
                };
            }
            else {
                // return cursor pos
                return undefined;
            }
        });
    }

    static bracesObject(s?: string, type?: 'inside' | 'around'): TextObjectData {
        let rangeType: string;
        if (type === 'inside') { rangeType = 'i'; }
        else if (type === 'around') { rangeType = 'a'; }
        else { rangeType = this.currentSeq[0]; }

        if (!'ai'.includes(rangeType)) {
            console.error(`Invalid rangeType '${rangeType} in bracket text object!`);
            throw new Error(`Invalid rangeType '${rangeType} in bracket text object!`);
        }

        let c = s || this.currentSeq[1];

        let openingBrackets: Record<string, string> = {
            '{': '{', '[': '[', '(': '(', '<': '<',
            '}': '{', ']': '[', ')': '(', '>': '<',
        };
        let closingBrackets: Record<string, string> = {
            '{': '}', '[': ']', '(': ')', '<': '>',
            '}': '}', ']': ']', ')': ')', '>': '>',
        };
        let OPENING_BRACKET = openingBrackets[c];
        let CLOSING_BRACKET = closingBrackets[c];

        if (!OPENING_BRACKET || !CLOSING_BRACKET) {
            console.error(`Invalid "${c}" character for brackets textObject`);
            throw new Error(`Invalid "${c}" character for brackets textObject`);
        }

        return VimState.vimCursor.selections.map(sel => {
            let objectRange: Range | undefined;

            let openingBracketAhead: vscode.Position | undefined;
            let closingBracketAhead: vscode.Position | undefined;

            let surroundingOpeningBracket: vscode.Position | undefined;
            let surroundingClosingBracket: vscode.Position | undefined;

            let leftSearch: vscode.Position | undefined = sel.active;
            let rightSearch: vscode.Position | undefined = sel.active;
            let unmatchedOpeningOnRight = 0;
            let unmatchedClosingOnLeft = 0;

            let scanner = new Scanner(this.editor, sel.active);
            if (charAt(sel.active) === OPENING_BRACKET) {
                surroundingOpeningBracket = sel.active;
            } else if (charAt(sel.active) === CLOSING_BRACKET) {
                surroundingClosingBracket = sel.active;
            }
            leftSearch = scanner.moveLeft();
            rightSearch = scanner.moveRight();
            while (true) {
                if (leftSearch && charAt(leftSearch) === OPENING_BRACKET) {
                    if (unmatchedClosingOnLeft) {
                        unmatchedClosingOnLeft -= 1;
                    } else {
                        if (!surroundingOpeningBracket) {
                            // Found surrounding opening bracket
                            surroundingOpeningBracket = leftSearch;
                        }
                    }
                } else if (leftSearch && charAt(leftSearch) === CLOSING_BRACKET) {
                    unmatchedClosingOnLeft += 1;
                }

                if (rightSearch && charAt(rightSearch) === CLOSING_BRACKET) {
                    if (unmatchedOpeningOnRight) {
                        unmatchedOpeningOnRight -= 1;
                        if (!unmatchedOpeningOnRight && !closingBracketAhead) {
                            // found closing bracket after cursor
                            closingBracketAhead = rightSearch;
                        }
                    } else {
                        if (!surroundingClosingBracket) {
                            // found surrounding closing bracket.
                            surroundingClosingBracket = rightSearch;
                        }
                    }
                } else if (rightSearch && charAt(rightSearch) === OPENING_BRACKET) {
                    unmatchedOpeningOnRight += 1;
                    if (!openingBracketAhead) {
                        // Found opening bracket after cursor.
                        openingBracketAhead = rightSearch;
                    }
                }

                if (surroundingOpeningBracket && surroundingClosingBracket) {
                    objectRange = new Range(surroundingOpeningBracket, surroundingClosingBracket);
                }

                if (openingBracketAhead && closingBracketAhead) {
                    // bracket pair on right is on same line as cursror 
                    if (openingBracketAhead.line === sel.active.line &&
                        closingBracketAhead.line === sel.active.line
                    ) {
                        objectRange = new Range(openingBracketAhead, closingBracketAhead);
                    }

                    // search on either side ended without finding surrouding bracket
                    if ((!leftSearch && !surroundingOpeningBracket) ||
                        (!rightSearch && !surroundingClosingBracket)
                    ) {
                        objectRange = new Range(openingBracketAhead, closingBracketAhead);
                    }
                }

                // if returned range equal to curent selected range continue finding outer range
                if (objectRange) {
                    scanner.resetLeft(objectRange.start);
                    scanner.resetRight(objectRange.end);

                    // adjust range as 'inside' or 'around'
                    if (rangeType === 'i') {
                        objectRange = new Range(
                            scanner.peekLeftAhead(),
                            scanner.peekRightBehind()
                        );
                    }

                    // Range found 😀
                    if (!new Range(sel.anchor, sel.active).isEqual(objectRange)) {
                        break;
                    }

                    // reset search state to find outer range.
                    objectRange = undefined;
                    surroundingClosingBracket = undefined;
                    surroundingOpeningBracket = undefined;
                    openingBracketAhead = undefined;
                    closingBracketAhead = undefined;
                    unmatchedClosingOnLeft = 0;
                    unmatchedOpeningOnRight = 0;
                }

                // If search ended on both end without success, end loop
                if (!rightSearch && !leftSearch) {
                    break;
                }
                leftSearch = scanner.moveLeft();
                rightSearch = scanner.moveRight();
            }
            if (objectRange) {
                return {
                    range: objectRange,
                    openingWrapper: scanner.leftCursor,
                    closingWrapper: scanner.rightCursor
                };
            }
            return undefined;
        });
    }
}

function charAt(pos: vscode.Position): string {
    if (!vscode.window.activeTextEditor) { return ''; }
    return vscode.window.activeTextEditor
        .document.getText(new Range(pos, pos.translate(0, 1)));
}


export function execTextObject(
    textObject: TextObject, syncVsCodeCursor: boolean, ...args: any[]
): TextObjectData {
    let editor = vscode.window.activeTextEditor;
    if (!editor) { return []; }
    TextObjects.editor = editor;

    let texObjData: TextObjectData;
    let repeat = Math.max(1, TextObjects.repeat);
    while (repeat) {

        texObjData = textObject.call(TextObjects, ...args);

        if (texObjData.some(t => !t)) { return texObjData; }
        VimState.vimCursor.selections = VimState.vimCursor.selections.map((sel, i) => {
            if (!texObjData[i]) { return sel; }
            return {
                anchor: texObjData[i]!.range.start,
                active: texObjData[i]!.range.end
            };
        });
        repeat -= 1;
    }

    if (syncVsCodeCursor) {
        VimState.syncVsCodeCursorOrSelection();
    }
    return texObjData!;
}

export const textObjectKeymap: Keymap[] = [
    {
        key: ['i', '{}'],
        type: 'TextObject',
        action: TextObjects.bracesObject,
        longDesc: ['(i)nside ', '{} '],
        mode: ['VISUAL', 'OP_PENDING_MODE']
    }, {
        key: ['a', '{}'],
        type: 'TextObject',
        action: TextObjects.bracesObject,
        longDesc: ['(a)round ', '{} '],
        mode: ['VISUAL', 'OP_PENDING_MODE']
    }, {
        key: ['i', 'w'],
        type: 'TextObject',
        action: TextObjects.wordObject,
        longDesc: ['(i)nside ', '{} '],
        args: ['word', 'inside'],
        mode: ['VISUAL', 'OP_PENDING_MODE']
    }, {
        key: ['i', 'W'],
        type: 'TextObject',
        action: TextObjects.wordObject,
        longDesc: ['(i)nside ', '{} '],
        args: ['WORD', 'inside'],
        mode: ['VISUAL', 'OP_PENDING_MODE']
    }, {
        key: ['i', '"'],
        type: 'TextObject',
        action: TextObjects.quotesObject,
        longDesc: ['(i)nside ', '{} '],
        args: ['"', 'inside'],
        mode: ['VISUAL', 'OP_PENDING_MODE']
    }, {
        key: ['i', '\''],
        type: 'TextObject',
        action: TextObjects.quotesObject,
        longDesc: ['(i)nside ', '{} '],
        args: ['\'', 'inside'],
        mode: ['VISUAL', 'OP_PENDING_MODE']
    }, {
        key: ['i', '`'],
        type: 'TextObject',
        action: TextObjects.quotesObject,
        longDesc: ['(i)nside ', '{} '],
        args: ['`', 'inside'],
        mode: ['VISUAL', 'OP_PENDING_MODE']
    }, {
        key: ['a', 'w'],
        type: 'TextObject',
        action: TextObjects.wordObject,
        longDesc: ['(a)round ', '{} '],
        args: ['word', 'around'],
        mode: ['VISUAL', 'OP_PENDING_MODE']
    }, {
        key: ['a', 'W'],
        type: 'TextObject',
        action: TextObjects.wordObject,
        longDesc: ['(a)round ', '{} '],
        args: ['WORD', 'around'],
        mode: ['VISUAL', 'OP_PENDING_MODE']
    }, {
        key: ['a', '"'],
        type: 'TextObject',
        action: TextObjects.quotesObject,
        longDesc: ['(a)round ', '{} '],
        args: ['"', 'around'],
        mode: ['VISUAL', 'OP_PENDING_MODE']
    }, {
        key: ['a', '\''],
        type: 'TextObject',
        action: TextObjects.quotesObject,
        longDesc: ['(a)round ', '{} '],
        args: ['\'', 'around'],
        mode: ['VISUAL', 'OP_PENDING_MODE']
    }, {
        key: ['a', '`'],
        type: 'TextObject',
        action: TextObjects.quotesObject,
        longDesc: ['(a)round ', '{} '],
        args: ['`', 'around'],
        mode: ['VISUAL', 'OP_PENDING_MODE']
    },
];
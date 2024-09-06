import * as vscode from 'vscode';
import { VimState } from './mode';
import { Keymap } from './mapping';
import { Logger } from './util';


type MotionData = {
    positions: vscode.Position[],
    includeCurrentCharUnderSelection?: boolean
    // jump_by: number,
};
export type Motion = (...args: any[]) => MotionData;

export class MotionHandler {
    static editor: vscode.TextEditor;
    // 0 is default value, motion will executed once when repeat is either 0 or 1
    static repeat: number = 0;

    static current_key: string;

    // data for repeating search
    static search_char: string;
    static include_char: boolean;

    static isCursorAtLineStart(curIdx: number): boolean {
        let curPos = VimState.vimCursor.selections[curIdx].active;
        if (curPos.character === 0) {
            return true;
        }
        return false;
    }

    static isCursorAtLineEnd(curIdx: number): boolean {
        let curPos = VimState.vimCursor.selections[curIdx].active;
        let line = this.editor.document.lineAt(curPos.line);
        if (curPos.character === line.text.length - 1) {
            return true;
        }
        return false;
    }

    @registerMotion()
    static moveLeft(): MotionData {
        return {
            positions: VimState.vimCursor.selections.map((sel, i) => {
                if (this.isCursorAtLineStart(i)) {
                    return sel.active;
                }
                return sel.active.translate(0, -1);
            })
        };
    }

    @registerMotion()
    static moveRight(): MotionData {
        return {
            positions: VimState.vimCursor.selections.map((sel, i) => {
                if (this.isCursorAtLineEnd(i)) {
                    return sel.active;
                }
                return sel.active.translate(0, 1);
            })
        };
    }

    @registerMotion()
    static moveUp(isRepeated: boolean): MotionData {
        let visibleRanges = this.editor.visibleRanges;
        return {
            positions: VimState.vimCursor.selections.map((sel, i) => {
                // if on first line, return current position
                if (sel.active.line === 0) {
                    return sel.active;
                }
                // If cursor encounter folded code, skip over it.
                if (visibleRanges.length > 1 && !isRepeated) {
                    for (let i = visibleRanges.length - 1; i > 0; i--) {
                        // if (i === visibleRanges.length - 1) { break; }
                        if (visibleRanges[i].start.line === sel.active.line) {
                            return visibleRanges[i - 1].end.with({ character: sel.active.character });
                        }
                    };
                }
                return sel.active.translate(-1, 0);
            })
        };
    }

    @registerMotion()
    static moveDown(isRepeated: boolean): MotionData {
        let visibleRanges = this.editor.visibleRanges;
        return {
            // if on last line, return current position
            positions: VimState.vimCursor.selections.map((sel, i) => {
                if (sel.active.line === this.editor.document.lineCount - 1) {
                    return sel.active;
                }

                // If cursor encounter folded code, skip over it.
                if (visibleRanges.length > 1 && !isRepeated) {
                    for (let [i, r] of visibleRanges.entries()) {
                        if (i === visibleRanges.length - 1) { break; }
                        if (r.end.line === sel.active.line) {
                            return visibleRanges[i + 1].start.with({ character: sel.active.character });
                        }
                    };
                }
                return sel.active.translate(1, 0);
            })
        };
    }

    static findWordBoundry(
        by: 'next-start' | 'next-end' | 'prev-start' | 'prev-end' | 'cur-start' | 'cur-end',
        type: 'word' | 'WORD'
    ): MotionData {
        let lineCount = this.editor.document.lineCount;
        let positions = VimState.vimCursor.selections.map((sel, i) => {
            let curPos = sel.active;
            let line = this.editor.document.lineAt(curPos.line);

            let c = curPos.character;
            let search_dir = 0;

            if (['next-start', 'next-end', 'cur-end'].includes(by)) {
                search_dir = 1;
            } else if (['prev-start', 'prev-end', 'cur-start'].includes(by)) {
                search_dir = -1;
            }

            let validChars = wordChars[type];
            // this checks if char is invalid sequence i.e. nor valid char neither whitespace.
            let isInvalidSeqChar = (c: number) => !whitespace.test(line.text[c]) && !validChars.test(line.text[c]);

            // set up search state.
            let onWord: boolean = validChars.test(line.text[c]);
            let onNonWhitespaceInvalidSeq: boolean = isInvalidSeqChar(c);
            let onWhitespace = whitespace.test(line.text[c]);

            while (true) {
                c += search_dir;
                if (by === 'next-end') {
                    if (whitespace.test(line.text[c])) {
                        // skip whitespace
                        continue;
                    }
                    if (c === line.text.length - 1) {
                        // If on last char of line
                        break;
                    } else if (c > line.text.length - 1) {
                        // If gone beyond the last char of line, fetch next line
                        // unless it is last line of document.
                        if (curPos.line === lineCount - 1) {
                            c = line.range.end.character; // set at end
                            break;
                        }

                        curPos = curPos.with(curPos.line + 1, 0);
                        line = this.editor.document.lineAt(curPos.line);
                        // setting 1 instead of zero as c will increment at start of next iteration.
                        c = -1;
                        continue;
                    }

                    if (validChars.test(line.text[c]) && validChars.test(line.text[c + 1])) {
                        // Current and next char is valid so not reached end of word.
                        continue;
                    }

                    if (!validChars.test(line.text[c]) && isInvalidSeqChar(c + 1)) {
                        // Current and next char are non-whitespace invalid so not reached end of invalid seq.
                        continue;
                    }
                    // Found last char of ongoing word or invalid seq.
                    break;
                } else if (by === 'next-start') {
                    if (c >= line.text.length) {
                        // If gone beyond the last char of line, fetch next line
                        // unless it is last line of document.
                        if (curPos.line === lineCount - 1) {
                            c = line.range.end.character; // set at end
                            break;
                        }
                        // if last char of line reached, get next line for search.
                        curPos = curPos.with(curPos.line + 1, 0);
                        line = this.editor.document.lineAt(curPos.line);
                        c = 0;
                        onWord = false;
                        onNonWhitespaceInvalidSeq = false;
                    }

                    if (whitespace.test(line.text[c]) || line.isEmptyOrWhitespace) {
                        // skip whitespace and reset search state.
                        onNonWhitespaceInvalidSeq = false;
                        onWord = false;
                        continue;
                    }
                    if (validChars.test(line.text[c]) && onWord) {
                        // On current word so continue.
                        continue;
                    }

                    if (!validChars.test(line.text[c]) && onNonWhitespaceInvalidSeq) {
                        // On invalid sequence so conntinue.
                        continue;
                    }
                    // Found first valid char or first non-whitespace invalid char.
                    break;
                } else if (by === 'prev-start') {

                    if (whitespace.test(line.text[c])) {
                        // skip whitespace
                        continue;
                    }

                    if (c === 0) {
                        // If on first char of line
                        break;
                    } else if (c < 0) {
                        // If gone beyond the first char of line, fetch prev line
                        // unless it is first line of document.
                        if (curPos.line === 0) {
                            c = 0; // set at start
                            break;
                        }
                        line = this.editor.document.lineAt(curPos.line - 1);
                        curPos = curPos.with(curPos.line - 1, line.text.length);
                        // set as length instead of last char index as as c will
                        // decrement at start of next iteration.
                        c = line.text.length;
                        continue;
                    }

                    if (validChars.test(line.text[c]) && validChars.test(line.text[c - 1])) {
                        // Current and next char is valid so not reached end of word.
                        continue;
                    }

                    if (!validChars.test(line.text[c]) && !validChars.test(line.text[c - 1]) && !whitespace.test(line.text[c - 1])) {
                        // Current and next char are non-whitespace invalid so not reached end of invalid seq.
                        continue;
                    }
                    // Found first char of word or invalid seq going backwards.
                    break;
                } else if (by === 'prev-end') {
                    throw new Error("prev-end unimplimented!");
                } else if (by === 'cur-start') {
                    if (c <= 0) {
                        c = 0;
                        break;
                    }
                    if (onWord && !validChars.test(line.text[c])) {
                        c -= search_dir;
                        break;
                    } else if (onWord && validChars.test(line.text[c])) {
                        c -= search_dir;
                        // if not already at word-start let prev-start handle rest of searching.
                        by = 'prev-start';
                        continue;
                    }

                    if (onNonWhitespaceInvalidSeq && !isInvalidSeqChar(c)) {
                        c -= search_dir;
                        break;
                    } else if (onNonWhitespaceInvalidSeq && isInvalidSeqChar(c)) {
                        c -= search_dir;
                        // if not already at word-start let prev-start handle rest of searching.
                        by = 'prev-start';
                        continue;
                    }

                    if (onWhitespace && whitespace.test(line.text[c])) {
                        continue;
                    } else if (onWhitespace && !whitespace.test(line.text[c])) {
                        c -= search_dir;
                        break;
                    }

                } else if (by === 'cur-end') {
                    if (c > line.text.length - 1) {
                        c -= search_dir;
                        break;
                    }
                    if (onWord && !validChars.test(line.text[c])) {
                        c -= search_dir;
                        break;
                    } else if (onWord && validChars.test(line.text[c])) {
                        c -= search_dir;
                        // if not already at word-end let next-end handle rest of parsing.
                        by = 'next-end';
                        continue;
                    }

                    if (onNonWhitespaceInvalidSeq && !isInvalidSeqChar(c)) {
                        c -= search_dir;
                        break;
                    } else if (onNonWhitespaceInvalidSeq && isInvalidSeqChar(c)) {
                        c -= search_dir;
                        // if not already at word-end let next-end handle rest of parsing.
                        by = 'next-end';
                        continue;
                    }

                    if (onWhitespace && whitespace.test(line.text[c])) {
                        continue;
                    } else if (onWhitespace && !whitespace.test(line.text[c])) {
                        c -= search_dir;
                        break;
                    }
                }
            }
            return new vscode.Position(curPos.line, c);
        });

        return {
            positions,
            includeCurrentCharUnderSelection: true
        };
    }

    /**
     * 
     * @param search_dir 
     * @param include_char true for f/F. false for t/T  
     */
    static findChar(search_dir: 1 | -1, include_char?: boolean): MotionData {
        if (['f', 'F', 't', 'T'].includes(this.current_key[0])) {
            this.search_char = this.current_key[1];
            this.include_char = include_char!;
        } else if (!this.search_char) {
            return {
                positions: VimState.vimCursor.selections.map(sel => sel.active)
            };
        }
        Logger.info("FIND: ", this.current_key);
        let positions = VimState.vimCursor.selections.map((sel, i) => {
            let curPos = sel.active;
            let line = this.editor.document.lineAt(curPos.line);
            let c = curPos.character;

            if (!this.include_char) {
                // in t/T operator skip immediate char to avoid getting stuck
                c += search_dir;
            }
            while (true) {
                c += search_dir;
                if (c < 0 || c > line.text.length - 1) {
                    break;
                }
                if (line.text[c] === this.search_char) {
                    if (this.include_char) {
                        return new vscode.Position(curPos.line, c);
                    }
                    return new vscode.Position(curPos.line, c).translate(0, search_dir * -1);
                }
            }
            return curPos;

        });
        return {
            positions,
            includeCurrentCharUnderSelection: true
        };
    }

    static gotoLine(line: 'first' | 'last'): MotionData {
        if (line === 'first') {
            return {
                positions: VimState.vimCursor.selections.map(_ => new vscode.Position(0, 0))
            };
        } else {
            let line = this.editor.document.lineCount - 1;
            return {
                positions: VimState.vimCursor.selections.map(_ => new vscode.Position(line, 0))
            };
        }
    }

    static moveInLine(to: 'start' | 'end' | 'first-char'): MotionData {
        let positions: vscode.Position[];
        switch (to) {
            case 'first-char':
                positions = VimState.vimCursor.selections
                    .map(sel => {
                        let line = this.editor.document.lineAt(sel.active.line);
                        return new vscode.Position(
                            sel.active.line, line.firstNonWhitespaceCharacterIndex
                        );
                    });
                break;
            case 'start':
                positions = VimState.vimCursor.selections
                    .map(sel => new vscode.Position(sel.active.line, 0));
                break;
            case 'end':
                positions = VimState.vimCursor.selections
                    .map(sel => {
                        let line = this.editor.document.lineAt(sel.active.line);
                        return new vscode.Position(sel.active.line, line.text.length - 1);
                    });
                break;
            default:
                break;
        }
        return {
            positions: positions!
        };
    }

    static moveOnScreen(to: 'middle' | 'top' | 'end'): MotionData {
        let visibleRange = this.editor.visibleRanges[0];
        let position: vscode.Position;
        if (to === 'top') {
            position = visibleRange.start;
        } else if (to === 'middle') {
            let offset = Math.floor((visibleRange.end.line - visibleRange.start.line) / 2);
            position = visibleRange.start.translate(offset, 0);
        } else if (to === 'end') {
            position = visibleRange.end;
        } else {
            console.error("Invalid argument on screen move");
            return { positions: VimState.vimCursor.selections.map(sel => sel.active) };
        }
        return {
            // positions: [position, ...VimState.vimCursor.selections.slice(1).map(sel => sel.active)]
            positions: VimState.vimCursor.selections.map(_ => position)
        };
    }

    static moveToParagraph(to: 1 | -1): MotionData {
        let positions = VimState.vimCursor.selections.map(sel => {
            let l = sel.active.line;
            let startedOnPara = this.editor.document.lineAt(l).isEmptyOrWhitespace;
            while (true) {
                l += to;
                if (l < 0 || l > this.editor.document.lineCount - 1) {
                    l -= to;
                    break;
                }
                if (l === 0 || l === this.editor.document.lineCount - 1) {
                    break;
                }
                let line = this.editor.document.lineAt(l);
                if (line.isEmptyOrWhitespace && startedOnPara) {
                    continue;
                }
                if (line.isEmptyOrWhitespace) {
                    break;
                }
                startedOnPara = false;
            }
            return new vscode.Position(l, sel.active.character);
        });
        return {
            positions
        };
    }
}

export const executeMotion = (motion: Motion, syncVsCodeCursor: boolean, ...args: any[]) => {
    let editor = vscode.window.activeTextEditor;
    if (!editor) { return; }

    MotionHandler.editor = editor;
    let moveTo: MotionData;
    let repeat = Math.max(1, MotionHandler.repeat);
    while (repeat) {

        moveTo = motion.call(MotionHandler, ...args, repeat > 1);

        // make sure vim cursor doesnt go past last char of line.
        moveTo.positions.forEach((pos, i) => {
            let last_char_idx = Math.max(editor!.document.lineAt(pos.line).text.length - 1, 0);
            if (pos.character >= last_char_idx) {
                moveTo.positions[i] = pos.translate(0, last_char_idx - pos.character);
            }
        });
        VimState.vimCursor.selections.forEach((sel, i) => {
            sel.active = moveTo.positions[i];
        });
        repeat -= 1;
    }

    if (syncVsCodeCursor) {
        if (VimState.currentMode === 'NORMAL') {
            VimState.vimCursor.selections.forEach((sel, i) => {
                sel.anchor = sel.active;
            });
        }
        VimState.syncVsCodeCursorOrSelection();
    }
};

/**
 * @description register motion as vs code command.
 * @param commandName name of command. default: name of function to be decorated.
 */
function registerMotion(commandName?: string) {
    return function (originalFunc: Motion, context: any) {
        commandName = commandName || originalFunc.name;
        vscode.commands.registerCommand(`vim.${commandName}`, () => {
            executeMotion(originalFunc, true);
        });
    };
}


// const whitespace = " \t\r\n";
const whitespace = /\s/;
const wordDelim = {
    word: " []{}-()\t\r\n,",
    WORD: " \t\r\n"
};

const wordChars = {
    word: /\w/,
    WORD: /[^\s]/
};

export const motionKeymap: Keymap[] = [
    {
        key: ['h'],
        type: 'Motion',
        action: MotionHandler.moveLeft,
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OP_PENDING_MODE']
    }, {
        key: ['l'],
        type: 'Motion',
        action: MotionHandler.moveRight,
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OP_PENDING_MODE']

    }, {
        key: ['j'],
        type: 'Motion',
        action: MotionHandler.moveDown,
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OP_PENDING_MODE']

    }, {
        key: ['k'],
        type: 'Motion',
        action: MotionHandler.moveUp,
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OP_PENDING_MODE']

    }, {
        key: ['w'],
        type: 'Motion',
        action: MotionHandler.findWordBoundry,
        args: ['next-start', 'word'],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OP_PENDING_MODE']

    }, {
        key: ['W'],
        type: 'Motion',
        action: MotionHandler.findWordBoundry,
        args: ['next-start', 'WORD'],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OP_PENDING_MODE']

    }, {
        key: ['e'],
        type: 'Motion',
        action: MotionHandler.findWordBoundry,
        args: ['next-end', 'word'],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OP_PENDING_MODE']

    }, {
        key: ['E'],
        type: 'Motion',
        action: MotionHandler.findWordBoundry,
        args: ['next-end', 'WORD'],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OP_PENDING_MODE']

    }, {
        key: ['b'],
        type: 'Motion',
        action: MotionHandler.findWordBoundry,
        args: ['prev-start', 'word'],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OP_PENDING_MODE']

    }, {
        key: ['B'],
        type: 'Motion',
        action: MotionHandler.findWordBoundry,
        args: ['prev-start', 'WORD'],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OP_PENDING_MODE']

    }, {
        key: ['f', "{}"],
        type: 'Motion',
        action: MotionHandler.findChar,
        args: [1, true],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OP_PENDING_MODE']
    }, {
        key: ['F', "{}"],
        type: 'Motion',
        action: MotionHandler.findChar,
        args: [-1, true],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OP_PENDING_MODE']
    }, {
        key: ['t', "{}"],
        type: 'Motion',
        action: MotionHandler.findChar,
        args: [1, false],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OP_PENDING_MODE']
    }, {
        key: ['T', "{}"],
        type: 'Motion',
        action: MotionHandler.findChar,
        args: [-1, false],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OP_PENDING_MODE']
    }, {
        key: [';'],
        type: 'Motion',
        action: MotionHandler.findChar,
        args: [1],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OP_PENDING_MODE']
    }, {
        key: [','],
        type: 'Motion',
        action: MotionHandler.findChar,
        args: [-1],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OP_PENDING_MODE']
    }, {
        key: ['g', 'g'],
        type: 'Motion',
        action: MotionHandler.gotoLine,
        args: ['first'],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OP_PENDING_MODE']
    }, {
        key: ['G'],
        type: 'Motion',
        action: MotionHandler.gotoLine,
        args: ['last'],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OP_PENDING_MODE']
    }, {
        key: ['^'],
        type: 'Motion',
        action: MotionHandler.moveInLine,
        args: ['first-char'],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OP_PENDING_MODE']
    }, {
        key: ['0'],
        type: 'Motion',
        action: MotionHandler.moveInLine,
        args: ['start'],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OP_PENDING_MODE']
    }, {
        key: ['$'],
        type: 'Motion',
        action: MotionHandler.moveInLine,
        args: ['end'],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OP_PENDING_MODE']
    }, {
        key: ['H'],
        type: 'Motion',
        action: MotionHandler.moveOnScreen,
        args: ['top'],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OP_PENDING_MODE']
    }, {
        key: ['M'],
        type: 'Motion',
        action: MotionHandler.moveOnScreen,
        args: ['middle'],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OP_PENDING_MODE']
    }, {
        key: ['L'],
        type: 'Motion',
        action: MotionHandler.moveOnScreen,
        args: ['end'],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OP_PENDING_MODE']
    }, {
        key: ['{'],
        type: 'Motion',
        action: MotionHandler.moveToParagraph,
        args: [1],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OP_PENDING_MODE']
    }, {
        key: ['}'],
        type: 'Motion',
        action: MotionHandler.moveToParagraph,
        args: [-1],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OP_PENDING_MODE']
    },
];
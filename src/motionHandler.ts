import * as vscode from 'vscode';
import { VimState } from './vimState';
import { Keymap } from './keyHandler';
import { Logger } from './util';


type MotionData = {
    positions: vscode.Position[],
    includeCharUnderCursor?: boolean
    revealCursor?: boolean;
    // jump_by: number,
};
export type Motion = (...args: any[]) => MotionData;

const WHITESPACE = /\s/;
const WORDCHARS = {
    word: /\w/,
    WORD: /[^\s]/
};

export class MotionHandler {
    static editor: vscode.TextEditor;
    // 0 is default value, motion will executed once when repeat is either 0 or 1
    static repeat: number = 0;

    static currentSeq: string;
    static prevHorizantalPos: number[] = [];

    // data for repeating search
    static searchChar: string;
    static includeChar: boolean;

    static isCursorAtLineStart(curIdx: number): boolean {
        let curPos = VimState.cursor.selections[curIdx].active;
        if (curPos.character === 0) {
            return true;
        }
        return false;
    }

    static isCursorAtLineEnd(curIdx: number): boolean {
        let curPos = VimState.cursor.selections[curIdx].active;
        let line = this.editor.document.lineAt(curPos.line);
        if (curPos.character === line.text.length - 1) {
            return true;
        }
        return false;
    }

    @registerMotion()
    static moveLeft(): MotionData {
        let data = {
            positions: VimState.cursor.selections.map((sel, i) => {
                if (this.isCursorAtLineStart(i)) {
                    return sel.active;
                }
                return sel.active.translate(0, -1);
            })
        };
        this.prevHorizantalPos = data.positions.map(p => p.character);
        return data;
    }

    @registerMotion()
    static moveRight(): MotionData {
        let data = {
            positions: VimState.cursor.selections.map((sel, i) => {
                if (this.isCursorAtLineEnd(i)) {
                    return sel.active;
                }
                return sel.active.translate(0, 1);
            })
        };
        this.prevHorizantalPos = data.positions.map(p => p.character);
        return data;
    }

    @registerMotion()
    static moveUp(isRepeated: boolean): MotionData {
        let visibleRanges = this.editor.visibleRanges;
        return {
            positions: VimState.cursor.selections.map((sel, i) => {
                // if on first line, return current position
                if (sel.active.line === 0) {
                    return sel.active;
                }
                // If cursor encounter folded code, skip over it.
                if (visibleRanges.length > 1 && !isRepeated) {
                    for (let j = visibleRanges.length - 1; j > 0; j--) {
                        // if (i === visibleRanges.length - 1) { break; }
                        if (visibleRanges[j].start.line === sel.active.line) {
                            return visibleRanges[j - 1].end.with({
                                character: this.prevHorizantalPos[i]
                            });
                        }
                    };
                }
                return sel.active.translate(-1, 0).with({
                    character: this.prevHorizantalPos[i]
                });;
            })
        };
    }

    @registerMotion()
    static moveDown(isRepeated: boolean): MotionData {
        let visibleRanges = this.editor.visibleRanges;
        return {
            // if on last line, return current position
            positions: VimState.cursor.selections.map((sel, i) => {
                if (sel.active.line === this.editor.document.lineCount - 1) {
                    return sel.active;
                }

                // If cursor encounter folded code, skip over it.
                if (visibleRanges.length > 1 && !isRepeated) {
                    for (let [j, r] of visibleRanges.entries()) {
                        if (j === visibleRanges.length - 1) { break; }
                        if (r.end.line === sel.active.line) {
                            return visibleRanges[j + 1].start.with({
                                character: this.prevHorizantalPos[i]
                            });
                        }
                    };
                }
                return sel.active.translate(1, 0).with({
                    character: this.prevHorizantalPos[i]
                });;
            })
        };
    }

    static findWordBoundry(
        by: 'next-start' | 'next-end' | 'prev-start' | 'prev-end' | 'cur-start' | 'cur-end',
        type: 'word' | 'WORD'
    ): MotionData {
        let includeCharUnderCursor = true;
        let lineCount = this.editor.document.lineCount;
        let positions = VimState.cursor.selections.map((sel, i) => {
            let curPos = sel.active;
            let line = this.editor.document.lineAt(curPos.line);

            let c = curPos.character;
            let search_dir = 0;

            if (['next-start', 'next-end', 'cur-end'].includes(by)) {
                search_dir = 1;
            } else if (['prev-start', 'prev-end', 'cur-start'].includes(by)) {
                search_dir = -1;
            }

            let validChars = WORDCHARS[type];
            // this checks if char is invalid sequence i.e. nor valid char neither whitespace.
            let isInvalidSeqChar = (c: number) => !WHITESPACE.test(line.text[c]) && !validChars.test(line.text[c]);

            // set up search state.
            let onWord: boolean = validChars.test(line.text[c]);
            let onNonWhitespaceInvalidSeq: boolean = isInvalidSeqChar(c);
            let onWhitespace = WHITESPACE.test(line.text[c]);

            while (true) {
                c += search_dir;
                if (by === 'next-end') {
                    if (WHITESPACE.test(line.text[c])) {
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

                    if (WHITESPACE.test(line.text[c]) || line.isEmptyOrWhitespace) {
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
                    includeCharUnderCursor = false;
                    break;
                } else if (by === 'prev-start') {

                    if (WHITESPACE.test(line.text[c])) {
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

                    if (!validChars.test(line.text[c]) && !validChars.test(line.text[c - 1]) && !WHITESPACE.test(line.text[c - 1])) {
                        // Current and next char are non-whitespace invalid so not reached end of invalid seq.
                        continue;
                    }
                    // Found first char of word or invalid seq going backwards.
                    break;
                } else if (by === 'prev-end') {
                    if (c < 0) {
                        // If gone beyond the first char of line, fetch prev line
                        // unless it is first line of document.
                        if (curPos.line === 0) {
                            c = 0; // set at end
                            break;
                        }
                        // if last char of line reached, get next line for search.
                        curPos = curPos.with(curPos.line - 1, 0);
                        line = this.editor.document.lineAt(curPos.line);
                        c = line.text.length - 1;
                        onWord = false;
                        onNonWhitespaceInvalidSeq = false;
                    }

                    if (WHITESPACE.test(line.text[c]) || line.isEmptyOrWhitespace) {
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

                    if (onWhitespace && WHITESPACE.test(line.text[c])) {
                        continue;
                    } else if (onWhitespace && !WHITESPACE.test(line.text[c])) {
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

                    if (onWhitespace && WHITESPACE.test(line.text[c])) {
                        continue;
                    } else if (onWhitespace && !WHITESPACE.test(line.text[c])) {
                        c -= search_dir;
                        break;
                    }
                }
            }
            return new vscode.Position(curPos.line, c);
        });

        this.prevHorizantalPos = positions.map(p => p.character);
        return {
            positions,
            includeCharUnderCursor
        };
    }

    /**
     * 
     * @param search_dir 
     * @param include_char true for f/F. false for t/T  
     */
    static findChar(search_dir: 1 | -1, include_char?: boolean): MotionData {
        if (['f', 'F', 't', 'T'].includes(this.currentSeq[0])) {
            this.searchChar = this.currentSeq[1];
            this.includeChar = include_char!;
        } else if (!this.searchChar) {
            return {
                positions: VimState.cursor.selections.map(sel => sel.active)
            };
        }
        Logger.info("FIND: ", this.currentSeq);
        let positions = VimState.cursor.selections.map((sel, i) => {
            let curPos = sel.active;
            let line = this.editor.document.lineAt(curPos.line);
            let c = curPos.character;

            if (!this.includeChar) {
                // in t/T operator skip immediate char to avoid getting stuck
                c += search_dir;
            }
            while (true) {
                c += search_dir;
                if (c < 0 || c > line.text.length - 1) {
                    break;
                }
                if (line.text[c] === this.searchChar) {
                    if (this.includeChar) {
                        return new vscode.Position(curPos.line, c);
                    }
                    return new vscode.Position(curPos.line, c).translate(0, search_dir * -1);
                }
            }
            return curPos;

        });
        this.prevHorizantalPos = positions.map(p => p.character);
        return {
            positions,
            includeCharUnderCursor: true
        };
    }

    static gotoLine(line: 'first' | 'last'): MotionData {
        let data: MotionData;
        if (line === 'first') {
            data = {
                positions: VimState.cursor.selections.map(_ => new vscode.Position(0, 0))
            };
        } else {
            let line = this.editor.document.lineCount - 1;
            data = {
                positions: VimState.cursor.selections.map(_ => new vscode.Position(line, 0))
            };
        }
        this.prevHorizantalPos = data.positions.map(p => p.character);
        return data;
    }

    static moveInLine(to: 'start' | 'end' | 'first-char'): MotionData {
        let positions: vscode.Position[];
        switch (to) {
            case 'first-char':
                positions = VimState.cursor.selections
                    .map(sel => {
                        let line = this.editor.document.lineAt(sel.active.line);
                        return new vscode.Position(
                            sel.active.line, line.firstNonWhitespaceCharacterIndex
                        );
                    });
                break;
            case 'start':
                positions = VimState.cursor.selections
                    .map(sel => new vscode.Position(sel.active.line, 0));
                break;
            case 'end':
                positions = VimState.cursor.selections
                    .map(sel => {
                        let line = this.editor.document.lineAt(sel.active.line);
                        return new vscode.Position(sel.active.line, line.text.length - 1);
                    });
                break;
            default:
                break;
        }
        this.prevHorizantalPos = positions!.map(p => p.character);
        return {
            positions: positions!
        };
    }

    static moveOnScreen(to: 'middle' | 'top' | 'end'): MotionData {
        let visibleRange = this.editor.visibleRanges[0];
        let position: vscode.Position;
        if (to === 'top') {
            position = this.editor.visibleRanges[0].start;
        } else if (to === 'middle') {
            let totalRangeSize = this.editor.visibleRanges
                .reduce((l, r) => r.end.line - r.start.line + l, 0);
            let offset = Math.floor((totalRangeSize) / 2);

            // find middle range and offset into middle range
            let countingRangeSum = 0;
            let middleRange: vscode.Range;
            for (let r of this.editor.visibleRanges) {
                let rangeSize = r.end.line - r.start.line;
                if (countingRangeSum + rangeSize >= offset) {
                    middleRange = r;
                    offset = offset - countingRangeSum;
                    break;
                }
                countingRangeSum += rangeSize;
            }
            position = middleRange!.start.translate(offset, 0);
        } else if (to === 'end') {
            position = this.editor.visibleRanges.at(-1)!.end;
        } else {
            console.error("Invalid argument on screen move");
            return { positions: VimState.cursor.selections.map(sel => sel.active) };
        }
        let line = this.editor.document.lineAt(position);
        position = position.with({ character: line.firstNonWhitespaceCharacterIndex });
        this.prevHorizantalPos = [position.character];
        return {
            // positions: [position, ...VimState.vimCursor.selections.slice(1).map(sel => sel.active)]
            positions: VimState.cursor.selections.map(_ => position),
            revealCursor: false
        };
    }

    static moveToParagraph(to: 1 | -1): MotionData {
        let positions = VimState.cursor.selections.map(sel => {
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

export const executeMotion = (motion: Motion, syncVsCodeCursor: boolean, ...args: any[]): MotionData | void => {
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
        VimState.cursor.selections.forEach((sel, i) => {
            sel.active = moveTo.positions[i];
        });
        repeat -= 1;
    }

    if (syncVsCodeCursor) {
        if (VimState.currentMode === 'NORMAL') {
            VimState.cursor.selections.forEach((sel, i) => {
                sel.anchor = sel.active;
            });
        }
        VimState.syncVsCodeCursorOrSelection({
            revealCursor: moveTo!.revealCursor === undefined ? true : moveTo!.revealCursor
        });
    }

    return moveTo!;
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
        key: ['g', 'e'],
        type: 'Motion',
        action: MotionHandler.findWordBoundry,
        args: ['prev-end', 'word'],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OP_PENDING_MODE']
    }, {
        key: ['g', 'E'],
        type: 'Motion',
        action: MotionHandler.findWordBoundry,
        args: ['prev-end', 'WORD'],
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
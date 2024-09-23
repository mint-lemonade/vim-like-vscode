import * as vscode from 'vscode';
import { VimState } from './vimState';
import { Keymap } from './keyHandler';
import { Logger } from './util';

type SearchDir = 1 | -1;

export type MotionData = {
    positions: vscode.Position[],
    excludeCharUnderCursor?: boolean
    revealCursor?: boolean;
    useVscodeCursorMove?: boolean;
    cursorMove?: {
        to: 'right' | 'left' | 'up' | 'down';
    }
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

    // data for repeating f/t search
    static searchChar: string;
    static includeChar: boolean;
    // data for repeating word search.
    static searchWord: string;
    static searchWordDir: SearchDir;

    /**
     * Keep track of continuous motion. i.e. if key pressed and held.
     * If a key is pressed continuously, using just VimState.cursor to
     * calculate next pos leads to erratic cursor movment due to VimState.cursor 
     * syncing asynchronously. 
     * 
     * Calll updateInMotionState() function to use this for any motion. And use
     * inMotionPositions instead of VimState.cursor
     */
    static inMotionPositions: vscode.Position[];
    static lastKeyTime: number;
    static readonly inMotionThreshold: number = 100;

    static isInMotion(now: number): boolean {
        if (!this.lastKeyTime) { this.lastKeyTime = now; }
        return now - this.lastKeyTime < this.inMotionThreshold;
    }

    static updateInMotionState(now: number) {
        if (!this.isInMotion(now) || !this.inMotionPositions) {
            // console.error("Not in motion..", now - this.lastKeyTime);
            this.inMotionPositions = VimState.cursor.selections.map(sel => sel.active);
        } else {
            // Logger.log("In motion...", now - this.lastKeyTime);
        }
        this.lastKeyTime = now;
    }

    static isCursorAtLineStart(curIdx: number): boolean {
        let curPos = this.inMotionPositions[curIdx];
        // let curPos = VimState.cursor.selections[curIdx].active;
        if (curPos.character === 0) {
            return true;
        }
        this.inMotionPositions[curIdx] = curPos.translate(0, -1);
        return false;
    }

    static isCursorAtLineEnd(curIdx: number, now: number): boolean {
        let curPos = this.inMotionPositions[curIdx];
        let line = this.editor.document.lineAt(curPos.line);
        let extraChar = VimState.preventCursorPastBoundary ? 0 : 1;
        if (curPos.character === line.text.length - 1 + extraChar) {
            return true;
        }
        this.inMotionPositions[curIdx] = curPos.translate(0, 1);
        return false;
    }

    @registerMotion()
    static moveLeft(): MotionData {
        let now = new Date().getTime();
        this.updateInMotionState(now);
        let lineStartReached = false;
        let data = {
            positions: this.inMotionPositions.map((sel, i) => {
                if (this.isCursorAtLineStart(i)) {
                    lineStartReached = true;
                    return this.inMotionPositions[i];
                }
                return sel.translate(0, -1);
            })
        };
        this.prevHorizantalPos = data.positions.map(p => p.character);
        return {
            positions: data.positions,
            // useVscodeCursorMove: true,
            // cursorMove: lineStartReached ? undefined : {
            //     to: 'left'
            // }
        };
    }

    @registerMotion()
    static moveRight(): MotionData {
        let now = new Date().getTime();
        this.updateInMotionState(now);
        let lineEndReached = false;
        let data = {
            positions: this.inMotionPositions.map((sel, i) => {
                if (this.isCursorAtLineEnd(i, now)) {
                    lineEndReached = true;
                    return this.inMotionPositions[i];
                }
                return sel.translate(0, 1);
            }),
        };
        this.prevHorizantalPos = data.positions.map(p => p.character);
        return {
            positions: data.positions,
            useVscodeCursorMove: true,
            cursorMove: lineEndReached ? undefined : {
                to: 'right'
            }
        };
    }

    @registerMotion()
    static moveUp(isRepeated: boolean): MotionData {
        let now = new Date().getTime();
        this.updateInMotionState(now);
        let visibleRanges = this.editor.visibleRanges;
        let data: MotionData = {
            positions: this.inMotionPositions.map((p, i) => {
                let sel = { active: p };
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
                });
            }),
            useVscodeCursorMove: true,
            cursorMove: {
                to: 'up',
            }
        };
        this.inMotionPositions = data.positions;
        return data;
    }

    @registerMotion()
    static moveDown(isRepeated: boolean): MotionData {
        let now = new Date().getTime();
        this.updateInMotionState(now);
        let visibleRanges = this.editor.visibleRanges;
        let data: MotionData = {
            // if on last line, return current position
            positions: this.inMotionPositions.map((p, i) => {
                let sel = { active: p };
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
                });
            }),
            useVscodeCursorMove: true,
            cursorMove: {
                to: 'down',
            }
        };
        this.inMotionPositions = data.positions;
        return data;
    }

    static findWordBoundry(
        by: 'next-start' | 'next-end' | 'prev-start' | 'prev-end' | 'cur-start' | 'cur-end',
        type: 'word' | 'WORD'
    ): MotionData {
        let now = new Date().getTime();
        this.updateInMotionState(now);
        let excludeCharUnderCursor = false;
        let lineCount = this.editor.document.lineCount;
        let positions = this.inMotionPositions.map((sel, i) => {
            let curPos = sel;
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
                    excludeCharUnderCursor = true;
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
            this.inMotionPositions[i] = new vscode.Position(curPos.line, c);
            return new vscode.Position(curPos.line, c);
        });

        this.prevHorizantalPos = positions.map(p => p.character);
        return {
            positions,
            excludeCharUnderCursor
        };
    }

    /**
     * 
     * @param search_dir 
     * @param include_char true for f/F. false for t/T  
     */
    static findChar(search_dir: SearchDir, include_char?: boolean): MotionData {
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
        };
    }

    static findWord(word: string, searchDir: SearchDir, changeDir: SearchDir = 1): MotionData {
        this.searchWord = word;
        this.searchWordDir = searchDir;
        searchDir *= changeDir;
        let lineCount = this.editor.document.lineCount;
        let positions = VimState.cursor.selections.map(sel => {
            let lineNo = sel.active.line;
            let line: string;
            if (searchDir === 1) {
                line = this.editor.document.lineAt(lineNo).text.slice(sel.active.character + 1);
            } else {
                line = this.editor.document.lineAt(lineNo).text.slice(0, sel.active.character);
            }
            while (true) {
                let i: number;
                if (searchDir === 1) {
                    i = line.indexOf(word);
                } else {
                    i = line.lastIndexOf(word);
                }
                if (i >= 0) {
                    if (searchDir === 1 && lineNo === sel.active.line) {
                        return new vscode.Position(
                            lineNo,
                            sel.active.character + i + 1
                        );
                    }
                    return new vscode.Position(lineNo, i);
                }
                lineNo = ((lineNo + searchDir + lineCount) % lineCount);
                if (lineNo === sel.active.line) {
                    return sel.active;
                }
                line = this.editor.document.lineAt(lineNo).text;
            }
        });
        this.prevHorizantalPos = positions.map(p => p.character);
        return {
            positions,
            excludeCharUnderCursor: true
        };
    }

    static findNextWordOccurance(): MotionData {
        let wordRange = this.editor.document
            .getWordRangeAtPosition(VimState.cursor.selections[0].active);
        let word = this.editor.document.getText(wordRange);
        return this.findWord(word, 1);
    }

    static repeatWordSearch(changDir: SearchDir): MotionData {
        if (!this.searchWord || !this.searchWordDir) {
            return {
                positions: VimState.cursor.selections.map(sel => sel.active)
            };
        }
        return this.findWord(
            this.searchWord,
            this.searchWordDir,
            changDir
        );
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

    static moveToParagraph(to: SearchDir): MotionData {
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
    let extraChar = VimState.preventCursorPastBoundary ? 0 : 1;
    while (repeat) {

        moveTo = motion.call(MotionHandler, ...args, repeat > 1);

        // make sure vim cursor doesnt go past last char of line.
        moveTo.positions.forEach((pos, i) => {
            let last_char_idx = Math.max(
                editor!.document.lineAt(pos.line).text.length - 1 + extraChar,
                0
            );
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
        let repeat = Math.max(1, MotionHandler.repeat);
        VimState.syncVsCodeCursorOrSelection({
            revealCursor: moveTo!.revealCursor === undefined ? true : moveTo!.revealCursor,
            cursorMove: moveTo!.cursorMove,
            repeat: repeat > 1 ? repeat : undefined
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
        vscode.commands.registerCommand(`vim-like.${commandName}`, () => {
            executeMotion(originalFunc, true);
        });
    };
}

export const motionKeymap: Keymap[] = [
    {
        key: ['h'],
        type: 'Motion',
        action: MotionHandler.moveLeft,
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OPERATOR_PENDING', 'MULTI_CURSOR']
    }, {
        key: ['l'],
        type: 'Motion',
        action: MotionHandler.moveRight,
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OPERATOR_PENDING', 'MULTI_CURSOR']

    }, {
        key: ['j'],
        type: 'Motion',
        action: MotionHandler.moveDown,
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OPERATOR_PENDING', 'MULTI_CURSOR']

    }, {
        key: ['k'],
        type: 'Motion',
        action: MotionHandler.moveUp,
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OPERATOR_PENDING', 'MULTI_CURSOR']

    }, {
        key: ['w'],
        type: 'Motion',
        action: MotionHandler.findWordBoundry,
        args: ['next-start', 'word'],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OPERATOR_PENDING', 'MULTI_CURSOR']

    }, {
        key: ['W'],
        type: 'Motion',
        action: MotionHandler.findWordBoundry,
        args: ['next-start', 'WORD'],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OPERATOR_PENDING', 'MULTI_CURSOR']

    }, {
        key: ['e'],
        type: 'Motion',
        action: MotionHandler.findWordBoundry,
        args: ['next-end', 'word'],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OPERATOR_PENDING', 'MULTI_CURSOR']

    }, {
        key: ['E'],
        type: 'Motion',
        action: MotionHandler.findWordBoundry,
        args: ['next-end', 'WORD'],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OPERATOR_PENDING', 'MULTI_CURSOR']

    }, {
        key: ['b'],
        type: 'Motion',
        action: MotionHandler.findWordBoundry,
        args: ['prev-start', 'word'],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OPERATOR_PENDING', 'MULTI_CURSOR']

    }, {
        key: ['B'],
        type: 'Motion',
        action: MotionHandler.findWordBoundry,
        args: ['prev-start', 'WORD'],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OPERATOR_PENDING', 'MULTI_CURSOR']

    }, {
        key: ['g', 'e'],
        type: 'Motion',
        action: MotionHandler.findWordBoundry,
        args: ['prev-end', 'word'],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OPERATOR_PENDING', 'MULTI_CURSOR']
    }, {
        key: ['g', 'E'],
        type: 'Motion',
        action: MotionHandler.findWordBoundry,
        args: ['prev-end', 'WORD'],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OPERATOR_PENDING', 'MULTI_CURSOR']
    }, {
        key: ['f', "{}"],
        type: 'Motion',
        action: MotionHandler.findChar,
        args: [1, true],
        longDesc: ['(f)ind ', '{}'],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OPERATOR_PENDING', 'MULTI_CURSOR']
    }, {
        key: ['F', "{}"],
        type: 'Motion',
        action: MotionHandler.findChar,
        args: [-1, true],
        longDesc: ['(F)ind ', '{}'],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OPERATOR_PENDING', 'MULTI_CURSOR']
    }, {
        key: ['t', "{}"],
        type: 'Motion',
        action: MotionHandler.findChar,
        args: [1, false],
        longDesc: ['(t)find ', '{}'],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OPERATOR_PENDING', 'MULTI_CURSOR']
    }, {
        key: ['T', "{}"],
        type: 'Motion',
        action: MotionHandler.findChar,
        args: [-1, false],
        longDesc: ['(T)find ', '{}'],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OPERATOR_PENDING', 'MULTI_CURSOR']
    }, {
        key: [';'],
        type: 'Motion',
        action: MotionHandler.findChar,
        args: [1],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OPERATOR_PENDING', 'MULTI_CURSOR']
    }, {
        key: [','],
        type: 'Motion',
        action: MotionHandler.findChar,
        args: [-1],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OPERATOR_PENDING', 'MULTI_CURSOR']
    }, {
        key: ['g', 'g'],
        type: 'Motion',
        action: MotionHandler.gotoLine,
        args: ['first'],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OPERATOR_PENDING', 'MULTI_CURSOR']
    }, {
        key: ['G'],
        type: 'Motion',
        action: MotionHandler.gotoLine,
        args: ['last'],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OPERATOR_PENDING', 'MULTI_CURSOR']
    }, {
        key: ['^'],
        type: 'Motion',
        action: MotionHandler.moveInLine,
        args: ['first-char'],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OPERATOR_PENDING', 'MULTI_CURSOR']
    }, {
        key: ['0'],
        type: 'Motion',
        action: MotionHandler.moveInLine,
        args: ['start'],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OPERATOR_PENDING', 'MULTI_CURSOR']
    }, {
        key: ['$'],
        type: 'Motion',
        action: MotionHandler.moveInLine,
        args: ['end'],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OPERATOR_PENDING', 'MULTI_CURSOR']
    }, {
        key: ['H'],
        type: 'Motion',
        action: MotionHandler.moveOnScreen,
        args: ['top'],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OPERATOR_PENDING', 'MULTI_CURSOR']
    }, {
        key: ['M'],
        type: 'Motion',
        action: MotionHandler.moveOnScreen,
        args: ['middle'],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OPERATOR_PENDING', 'MULTI_CURSOR']
    }, {
        key: ['L'],
        type: 'Motion',
        action: MotionHandler.moveOnScreen,
        args: ['end'],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OPERATOR_PENDING', 'MULTI_CURSOR']
    }, {
        key: ['{'],
        type: 'Motion',
        action: MotionHandler.moveToParagraph,
        args: [1],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OPERATOR_PENDING', 'MULTI_CURSOR']
    }, {
        key: ['}'],
        type: 'Motion',
        action: MotionHandler.moveToParagraph,
        args: [-1],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OPERATOR_PENDING', 'MULTI_CURSOR']
    }, {
        key: ['/'],
        type: 'Motion',
        action: MotionHandler.findWord,
        textInput: true,
        args: ["", 1, 1],
        longDesc: ['( / )search_fwd:  '],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OPERATOR_PENDING', 'MULTI_CURSOR']
    }, {
        key: ['?'],
        type: 'Motion',
        action: MotionHandler.findWord,
        textInput: true,
        args: ["", -1, 1],
        longDesc: ['( ? )search_bwd: '],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OPERATOR_PENDING', 'MULTI_CURSOR']
    },
    {
        key: ['*'],
        type: 'Motion',
        action: MotionHandler.findNextWordOccurance,
        args: [1],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OPERATOR_PENDING', 'MULTI_CURSOR']
    },
    {
        key: ['n'],
        type: 'Motion',
        action: MotionHandler.repeatWordSearch,
        args: [1],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OPERATOR_PENDING', 'MULTI_CURSOR']
    },
    {
        key: ['N'],
        type: 'Motion',
        action: MotionHandler.repeatWordSearch,
        args: [-1],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE', 'OPERATOR_PENDING', 'MULTI_CURSOR']
    },
];
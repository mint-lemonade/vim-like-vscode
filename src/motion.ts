import * as vscode from 'vscode';
import { VimState } from './mode';
import { Keymap } from './mapping';


type MotionData = {
    positions: vscode.Position[],
    includeCurrentCharUnderSelection?: boolean
    // jump_by: number,
};
export type Motion = (...args: any[]) => MotionData;

export class MotionHandler {
    static handelingCursorMove: boolean = false;
    static editor: vscode.TextEditor;
    // 0 is default value, motion will executed once when repeat is either 0 or 1
    static repeat: number = 0;

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
    static moveUp(): MotionData {
        return {
            positions: VimState.vimCursor.selections.map((sel, i) => {
                // if on first line, return current position
                if (sel.active.line === 0) {
                    return sel.active;
                }
                return sel.active.translate(-1, 0);
            })
        };
    }

    @registerMotion()
    static moveDown(): MotionData {
        return {
            // if on last line, return current position
            positions: VimState.vimCursor.selections.map((sel, i) => {
                if (sel.active.line === this.editor.document.lineCount - 1) {
                    return sel.active;
                }
                return sel.active.translate(1, 0);
            })
        };
    }

    static findWordBoundry(
        by: 'next-start' | 'next-end' | 'prev-start',
        type: 'word' | 'WORD'
    ): MotionData {
        let positions = VimState.vimCursor.selections.map((sel, i) => {
            let curPos = sel.active;
            let line = this.editor.document.lineAt(curPos.line);

            let c = curPos.character;
            let search_dir = 0;

            if (by === 'next-start') {
                search_dir = 1;
            } else if (by === 'next-end') {
                search_dir = 1;
            } else if (by === 'prev-start') {
                search_dir = -1;
            }

            let validChars = wordChars[type];

            // set up search state.
            let onWord: boolean = validChars.test(line.text[c]);
            let onNonWhitespaceInvalidSeq: boolean = !whitespace.test(line.text[c]) && !validChars.test(line.text[c]);

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

                    if (!validChars.test(line.text[c]) && !validChars.test(line.text[c + 1]) && !whitespace.test(line.text[c + 1])) {
                        // Current and next char are non-whitespace invalid so not reached end of invalid seq.
                        continue;
                    }
                    // Found last char of ongoing word or invalid seq.
                    break;
                } else if (by === 'next-start') {
                    if (c >= line.text.length) {
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
                }
            }
            return new vscode.Position(curPos.line, c);
        });

        return {
            positions,
            includeCurrentCharUnderSelection: true
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

        moveTo = motion.call(MotionHandler, ...args);

        // make sure vim cursor doesnt go past last char of line.
        moveTo.positions.forEach((pos, i) => {
            let last_char_idx = Math.max(editor!.document.lineAt(pos.line).text.length - 1, 0);
            if (pos.character >= last_char_idx) {
                moveTo.positions[i] = pos.translate(0, last_char_idx - pos.character);
            }
        });

        console.log("cursor position", editor.selections.map(sel => sel.active));
        console.log("moveTo position", moveTo.positions);
        VimState.vimCursor.selections.forEach((sel, i) => {
            sel.active = moveTo.positions[i];
        });
        repeat -= 1;
    }
    // reset repeat to default after executing motion.
    MotionHandler.repeat = 0;
    if (syncVsCodeCursor) {
        VimState.syncVsCodeCursorOrSelection();
    }
};

/**
 * @description register motion as vs code command.
 * @param commandName name of command. default: name of function to be decorated.
 */
function registerMotion(commandName?: string) {
    return function (originalFunc: Motion, context: any) {
        console.log("Context: ", context);
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
        mode: ['NORMAL', 'VISUAL']
    }, {
        key: ['l'],
        type: 'Motion',
        action: MotionHandler.moveRight,
        mode: ['NORMAL', 'VISUAL']

    }, {
        key: ['j'],
        type: 'Motion',
        action: MotionHandler.moveDown,
        mode: ['NORMAL', 'VISUAL']

    }, {
        key: ['k'],
        type: 'Motion',
        action: MotionHandler.moveUp,
        mode: ['NORMAL', 'VISUAL']

    }, {
        key: ['w'],
        type: 'Motion',
        action: MotionHandler.findWordBoundry,
        args: ['next-start', 'word'],
        mode: ['NORMAL', 'VISUAL']

    }, {
        key: ['W'],
        type: 'Motion',
        action: MotionHandler.findWordBoundry,
        args: ['next-start', 'WORD'],
        mode: ['NORMAL', 'VISUAL']

    }, {
        key: ['e'],
        type: 'Motion',
        action: MotionHandler.findWordBoundry,
        args: ['next-end', 'word'],
        mode: ['NORMAL', 'VISUAL']

    }, {
        key: ['E'],
        type: 'Motion',
        action: MotionHandler.findWordBoundry,
        args: ['next-end', 'WORD'],
        mode: ['NORMAL', 'VISUAL']

    }, {
        key: ['b'],
        type: 'Motion',
        action: MotionHandler.findWordBoundry,
        args: ['prev-start', 'word'],
        mode: ['NORMAL', 'VISUAL']

    }, {
        key: ['B'],
        type: 'Motion',
        action: MotionHandler.findWordBoundry,
        args: ['prev-start', 'WORD'],
        mode: ['NORMAL', 'VISUAL']

    }

];
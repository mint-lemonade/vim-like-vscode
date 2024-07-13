import * as vscode from 'vscode';
import { VimState } from './mode';


type MotionData = {
    position: vscode.Position,
    includeCurrentCharUnderSelection?: boolean
    // jump_by: number,
} | null;
type Motion = (...args: any[]) => MotionData;

export class MotionHandler {
    static handelingCursorMove: boolean = false;
    static editor: vscode.TextEditor;
    // static selection
    static isCursorAtLineStart(): boolean {
        let curPos = VimState.vimCursor.active;
        if (curPos.character === 0) {
            return true;
        }
        return false;
    }

    static isCursorAtLineEnd(): boolean {
        let curPos = VimState.vimCursor.active;
        let line = this.editor.document.lineAt(curPos.line);
        if (curPos.character === line.text.length - 1) {
            return true;
        }
        return false;
    }

    static moveLeft(): MotionData {
        if (this.isCursorAtLineStart()) {
            return null;
        }

        return {
            position: VimState.vimCursor.active.translate(0, -1)
        };
    }

    static moveRight(): MotionData {
        if (this.isCursorAtLineEnd()) {
            return null;
        }
        return {
            position: VimState.vimCursor.active.translate(0, 1)
        };
    }

    static moveUp(): MotionData {
        // if on first line do nothing
        if (VimState.vimCursor.active.line === 0) {
            return null;
        }
        return {
            position: VimState.vimCursor.active.translate(-1, 0)
        };
    }

    static moveDown(): MotionData {
        // if on last line do nothing
        if (VimState.vimCursor.active.line === this.editor.document.lineCount - 1) {
            return null;
        }
        return {
            position: VimState.vimCursor.active.translate(1, 0)
        };
    }

    static findWordBoundry(by: 'next-start' | 'next-end' | 'prev-start', type: 'word' | 'WORD'): MotionData {
        let curPos = VimState.vimCursor.active;
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

        return {
            position: new vscode.Position(curPos.line, c),
            includeCurrentCharUnderSelection: true
        };
    }
}

export const executeMotion = (motion: Motion, ...args: any[]) => {
    let editor = vscode.window.activeTextEditor;
    if (!editor) { return; }

    MotionHandler.editor = editor;
    let moveTo = motion.call(MotionHandler, ...args);

    if (!moveTo) { return; }

    // make sure vim cursor doesnt go past last char of line.
    let last_char_idx = Math.max(editor.document.lineAt(moveTo.position.line).text.length - 1, 0);
    if (moveTo.position.character >= last_char_idx) {
        moveTo.position = moveTo.position.translate(0, last_char_idx - moveTo.position.character);
    }

    console.log("cursor position", editor.selection.active);
    console.log("moveTo position", moveTo.position);
    VimState.vimCursor.active = moveTo.position;
    VimState.syncVsCodeCursorOrSelection();
};

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
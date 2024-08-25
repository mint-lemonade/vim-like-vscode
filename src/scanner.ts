import * as vscode from 'vscode';

export class Scanner {
    doc: vscode.TextDocument;
    editor: vscode.TextEditor;
    start: vscode.Position;
    leftCursor: vscode.Position;
    leftLine: vscode.TextLine;
    rightCursor: vscode.Position;
    rightLine: vscode.TextLine;
    constructor(editor: vscode.TextEditor, start: vscode.Position) {
        this.doc = editor.document;
        this.editor = editor;
        this.start = start;
        this.leftCursor = start;
        this.leftLine = this.doc.lineAt(start);
        this.rightCursor = start;
        this.rightLine = this.leftLine;
    }
    moveRight(): vscode.Position | undefined {
        if (this.rightCursor.character < this.rightLine.text.length - 1) {
            this.rightCursor = this.rightCursor.translate(0, 1);
        } else if (this.rightLine.lineNumber < this.doc.lineCount - 1) {
            this.rightCursor = new vscode.Position(this.rightCursor.line + 1, 0);
            this.rightLine = this.doc.lineAt(this.rightCursor);
        } else {
            return undefined;
        }
        return this.rightCursor;
    }
    peekRightBehind(): vscode.Position {
        if (this.rightCursor.character > 0) {
            return this.rightCursor.translate(0, -1);
        } else {
            let line = this.doc.lineAt(this.rightCursor.line - 1);
            return line.range.end;
        }
    }
    moveLeft(): vscode.Position | undefined {
        if (this.leftCursor.character > 0) {
            this.leftCursor = this.leftCursor.translate(0, -1);
        } else if (this.leftLine.lineNumber > 0) {
            this.leftLine = this.doc.lineAt(this.leftCursor.line - 1);
            this.leftCursor = this.leftLine.range.end;
        } else {
            return undefined;
        }
        return this.leftCursor;
    }
    peekLeftAhead(): vscode.Position {
        if (this.leftCursor.character < this.leftLine.text.length - 1) {
            return this.leftCursor.translate(0, 1);
        } else {
            return new vscode.Position(this.leftCursor.line + 1, 0);
        }
    }
    resetLeft(pos: vscode.Position) {
        this.leftCursor = pos;
        this.leftLine = this.doc.lineAt(pos.line);
    }
    resetRight(pos: vscode.Position) {
        this.rightCursor = pos;
        this.rightLine = this.doc.lineAt(pos.line);
    }
}
import * as vscode from 'vscode';

export enum Mode {
    Normal,
    Insert,
    Visual,
}

function modeToString(mode: Mode): string {
    switch (mode) {
        case Mode.Normal:
            return "Normal";
        case Mode.Visual:
            return "Visual";
        case Mode.Insert:
            return "Insert";
        default:
            return 'Unknown Mode';
    }
}

export class VimState {
    static currentMode: Mode = Mode.Normal;
    static statusBar: vscode.StatusBarItem;

    static init() {
        this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
        this.setMode(Mode.Normal);
    }

    static setMode(mode: Mode) {
        this.currentMode = mode;
        this.statusBar.text = `--${modeToString(mode).toUpperCase()}--`;
        this.statusBar.tooltip = 'Vim Mode';
        this.statusBar.show();
        if (vscode.window.activeTextEditor) {
            switch (mode) {
                case Mode.Normal: {
                    vscode.window.activeTextEditor.options.cursorStyle = vscode.TextEditorCursorStyle.Block;
                    break;
                }

                case Mode.Visual:
                    {
                        vscode.window.activeTextEditor.options.cursorStyle = vscode.TextEditorCursorStyle.Block;
                        break;
                    }

                case Mode.Insert:
                    vscode.window.activeTextEditor.options = {
                        cursorStyle: vscode.TextEditorCursorStyle.Line
                    };
                    break;

                default:
                    break;
            }
        }

        vscode.commands.executeCommand('setContext', "vim.currentMode", modeToString(mode));
    }
}
import * as vscode from 'vscode';
import { KeyHandler } from './mapping';

// export const enum Mode {
//     Normal,
//     Insert,
//     Visual,
// }

export type Mode = 'NORMAL' | 'INSERT' | 'VISUAL';

// function modeToString(mode: Mode): string {
//     switch (mode) {
//         case 'NORMAL':
//             return "Normal";
//         case Mode.Visual:
//             return "Visual";
//         case Mode.Insert:
//             return "Insert";
//         default:
//             return 'Unknown Mode';
//     }
// }

export class VimState {
    static currentMode: Mode = 'NORMAL';
    static statusBar: vscode.StatusBarItem;
    static keyMap: KeyHandler;

    static init() {
        this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
        this.setMode('NORMAL');
        this.keyMap = new KeyHandler();
    }

    static setMode(mode: Mode) {
        this.currentMode = mode;
        this.statusBar.text = `--${mode}--`;
        this.statusBar.tooltip = 'Vim Mode';
        this.statusBar.show();
        if (vscode.window.activeTextEditor) {
            switch (mode) {
                case 'NORMAL': {
                    vscode.window.activeTextEditor.options.cursorStyle = vscode.TextEditorCursorStyle.Block;
                    break;
                }

                case 'VISUAL':
                    {
                        vscode.window.activeTextEditor.options.cursorStyle = vscode.TextEditorCursorStyle.Block;
                        break;
                    }

                case 'INSERT':
                    vscode.window.activeTextEditor.options = {
                        cursorStyle: vscode.TextEditorCursorStyle.Line
                    };
                    break;

                default:
                    break;
            }
        }

        vscode.commands.executeCommand('setContext', "vim.currentMode", mode);
    }

    static type(text: string) {
        if (this.currentMode === 'INSERT') {
            if (!this.keyMap.execute(text)) {
                vscode.commands.executeCommand('default:type', { text: text });
            }
            return;
        } else {
            this.keyMap.execute(text);
            return;
        }
    }
}
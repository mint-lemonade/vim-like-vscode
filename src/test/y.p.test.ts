import * as vscode from 'vscode';
import { sleep } from '../util';
import * as BlackBox from './framework/blackbox';

suite('Yank Paste (preventCursorPastBoundary off)', () => {
    setup(() => {
        vscode.workspace.getConfiguration('vim-like').update('preventCursorPastBoundary', false, true);
        const ext = vscode.extensions.getExtension('self.vim-like');
        ext?.exports.VimState.setMode('NORMAL');
        sleep(100);
    });

    let testCases: BlackBox.TestCase[] = [
        {
            from: "Yada []Yada Yada.. interesting text.\nSome text in new line, some after coma. \n More yada yada in another new line.",
            inputs: "y 2 e",
            to: "Yada []Yada Yada.. interesting text.\nSome text in new line, some after coma. \n More yada yada in another new line.",
            // skip: true
        },
        {
            from: "Yada []Yada Yada.. interesting text.\nSome text in new line, some after coma. \n More yada yada in another new line.",
            inputs: "y y j j p",
            to: "Yada Yada Yada.. interesting text.\nSome text in new line, some after coma. \n More yada yada in another new line.\n Yada Yada Yada.. interesting text.[]",
            // skip: true
        },
        {
            from: "Yada []Yada Yada.. interesting text.\nSome text in new line, some after coma. \n More yada yada in another new line.",
            inputs: '" b y y j y y j p " b P',
            to: "Yada Yada Yada.. interesting text.\nSome text in new line, some after coma. \n More yada yada in another new line.\n Yada Yada Yada.. interesting text.[]\n Some text in new line, some after coma. ",
            // skip: true
        }
    ];
    for (let i = 0; i < testCases.length; i++) {
        BlackBox.run(testCases[i]);
    }
});

suite('Yank Paste (preventCursorPastBoundary on)', () => {
    setup(() => {
        vscode.workspace.getConfiguration('vim-like').update('preventCursorPastBoundary', true, true);
        const ext = vscode.extensions.getExtension('self.vim-like');
        ext?.exports.VimState.setMode('NORMAL');
        sleep(100);
    });

    let testCases: BlackBox.TestCase[] = [
        {
            from: "Yada []Yada Yada.. interesting text.\nSome text in new line, some after coma. \n More yada yada in another new line.",
            inputs: "y y j j p",
            to: "Yada Yada Yada.. interesting text.\nSome text in new line, some after coma. \n More yada yada in another new line.\n Yada Yada Yada.. interesting text[].",
            // skip: true
        },
        {
            from: "Yada []Yada Yada.. interesting text.\nSome text in new line, some after coma. \n More yada yada in another new line.",
            inputs: '" b y y j y y j p " b P',
            to: "Yada Yada Yada.. interesting text.\nSome text in new line, some after coma. \n More yada yada in another new line.\n Yada Yada Yada.. interesting text[].\n Some text in new line, some after coma. ",
            // skip: true
        }
    ];
    for (let i = 0; i < testCases.length; i++) {
        BlackBox.run(testCases[i]);
    }
});
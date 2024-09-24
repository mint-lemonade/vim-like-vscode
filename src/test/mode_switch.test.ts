import { sleep } from '../util';
import * as BlackBox from './framework/blackbox';
import * as vscode from 'vscode';

suite('NORMAL to {MODE} Switch', () => {
    setup(() => {
        const ext = vscode.extensions.getExtension('TauCeti.vim-like');
        ext?.exports.VimState.setMode('NORMAL');
        sleep(100);
    });

    let testCases: BlackBox.TestCase[] = [
        {
            from: "opening[]Wrapper: new vscode.Position(line.lineNumber, ci + q1),\nnew vscode.Position(line.lineNumber, ci - q0 + adjustStart),",
            inputs: "v",
            to: "opening[W]rapper: new vscode.Position(line.lineNumber, ci + q1),\nnew vscode.Position(line.lineNumber, ci - q0 + adjustStart),"
        },
        {
            from: "opening[]Wrapper: new vscode.Position(line.lineNumber, ci + q1),\nnew vscode.Position(line.lineNumber, ci - q0 + adjustStart),",
            inputs: "V",
            to: "[openingWrapper: new vscode.Position(line.lineNumber, ci + q1),]\nnew vscode.Position(line.lineNumber, ci - q0 + adjustStart),"
        },
        {
            from: "opening[]Wrapper: new vscode.Position(line.lineNumber, ci + q1),\nnew vscode.Position(line.lineNumber, ci - q0 + adjustStart),",
            inputs: "V j",
            to: "[openingWrapper: new vscode.Position(line.lineNumber, ci + q1),\nnew vscode.Position(line.lineNumber, ci - q0 + adjustStart),]"
        },
        {
            from: "opening[]Wrapper: new vscode.Position(line.lineNumber, ci + q1),\nnew vscode.Position(line.lineNumber, ci - q0 + adjustStart),",
            inputs: "i",
            to: "opening[]Wrapper: new vscode.Position(line.lineNumber, ci + q1),\nnew vscode.Position(line.lineNumber, ci - q0 + adjustStart),"
        },
        {
            from: "opening[]Wrapper: new vscode.Position(line.lineNumber, ci + q1),\nnew vscode.Position(line.lineNumber, ci - q0 + adjustStart),",
            inputs: "a",
            to: "openingW[]rapper: new vscode.Position(line.lineNumber, ci + q1),\nnew vscode.Position(line.lineNumber, ci - q0 + adjustStart),"
        },
        {
            from: "opening[]Wrapper: new vscode.Position(line.lineNumber, ci + q1),\nnew vscode.Position[](line.lineNumber, ci - q0 + adjustStart),",
            inputs: "I",
            to: "[]openingWrapper: new vscode.Position(line.lineNumber, ci + q1),\n[]new vscode.Position(line.lineNumber, ci - q0 + adjustStart),"
        },
        {
            from: "opening[]Wrapper: new vscode.Position(line.lineNumber, ci + q1),\nnew vscode.Position(line.lineNumber, ci - q0 + adjustStart),[]",
            inputs: "A",
            to: "openingWrapper: new vscode.Position(line.lineNumber, ci + q1),[]\nnew vscode.Position(line.lineNumber, ci - q0 + adjustStart),[]"
        },
        {
            from: "opening[]Wrapper: new vscode.Position(line.lineNumber, ci + q1),\nnew vscode.Position(line.lineNumber, ci - q0 + adjustStart),[]",
            inputs: "o",
            to: "openingWrapper: new vscode.Position(line.lineNumber, ci + q1),\n[]\nnew vscode.Position(line.lineNumber, ci - q0 + adjustStart),\n[]"
        },
        {
            from: "opening[]Wrapper: new vscode.Position(line.lineNumber, ci + q1),\nnew vscode.Position(line.lineNumber, ci - q0 + adjustStart),[]",
            inputs: "O",
            to: "[]\nopeningWrapper: new vscode.Position(line.lineNumber, ci + q1),\n[]\nnew vscode.Position(line.lineNumber, ci - q0 + adjustStart),"
        }
    ];
    for (let i = 0; i < testCases.length; i++) {
        BlackBox.run(testCases[i]);
    }
});

suite('INSERT to {MODE} Switch', () => {
    setup(() => {
        const ext = vscode.extensions.getExtension('TauCeti.vim-like');
        ext?.exports.VimState.setMode('INSERT');
        sleep(100);
    });

    let testCases: BlackBox.TestCase[] = [
        {
            from: "opening[]Wrapper: new vscode.Position(line.lineNumber, ci + q1),\nnew vscode.Position(line.lineNumber, ci - q0 + adjustStart),",
            inputs: "j f",
            to: "opening[]Wrapper: new vscode.Position(line.lineNumber, ci + q1),\nnew vscode.Position(line.lineNumber, ci - q0 + adjustStart),"
        },
        {
            from: "opening[]Wrapper: new vscode.Position(line.lineNumber, ci + q1),\nnew vscode.Position(line.lineNumber, ci - q0 + adjustStart),",
            inputs: "j v",
            to: "opening[W]rapper: new vscode.Position(line.lineNumber, ci + q1),\nnew vscode.Position(line.lineNumber, ci - q0 + adjustStart),"
        },
        {
            from: "opening[Wrapper]: new vscode.Position(line.lineNumber, ci + q1),\nnew vscode.Position(line.lineNumber, ci - q0 + adjustStart),",
            inputs: "j v",
            to: "opening[Wrapper]: new vscode.Position(line.lineNumber, ci + q1),\nnew vscode.Position(line.lineNumber, ci - q0 + adjustStart),"
        },
        {
            from: "opening[Wrapper]: new vscode.Position(line.lineNumber, ci + q1),\nnew vscode.Position(line.lineNumber, ci - q0 + adjustStart),",
            inputs: "j f",
            to: "openingWrappe[]r: new vscode.Position(line.lineNumber, ci + q1),\nnew vscode.Position(line.lineNumber, ci - q0 + adjustStart),"
        },
        {
            from: "opening~[Wrapper]: new vscode.Position(line.lineNumber, ci + q1),\nnew vscode.Position(line.lineNumber, ci - q0 + adjustStart),",
            inputs: "j f",
            to: "opening[]Wrapper: new vscode.Position(line.lineNumber, ci + q1),\nnew vscode.Position(line.lineNumber, ci - q0 + adjustStart),"
        },
    ];
    for (let i = 0; i < testCases.length; i++) {
        BlackBox.run(testCases[i]);
    }
});

suite('Selection INSERT <-> VISUAL switch', () => {
    setup(() => {
        const ext = vscode.extensions.getExtension('TauCeti.vim-like');
        ext?.exports.VimState.setMode('INSERT');
        sleep(100);
    });

    let testCases: BlackBox.TestCase[] = [
        {
            from: "openingWrapper[: new vscode].Position(line.lineNumber, ci + q1),\nnew vscode.Position[](line.lineNumber, ci - q0 + adjustStart),",
            inputs: "j v 2 e I",
            to: "openingWrapper[: new vscode.Position](line.lineNumber, ci + q1),\nnew vscode.Position[(line.]lineNumber, ci - q0 + adjustStart),"
        },
        {
            from: "opening[Wrapper: new vscode.Position(line.lineNumber, ci + q1),\nnew vscode.Position(line.]lineNumber, ci - q0 + adjustStart),",
            inputs: "j v 3 e I",
            to: "opening[Wrapper: new vscode.Position(line.lineNumber, ci + q1),\nnew vscode.Position(line.lineNumber, ci] - q0 + adjustStart),"
        },
    ];
    for (let i = 0; i < testCases.length; i++) {
        BlackBox.run(testCases[i]);
    }
});
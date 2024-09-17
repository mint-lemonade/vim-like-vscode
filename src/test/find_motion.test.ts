import { sleep } from '../util';
import * as BlackBox from './framework/blackbox';
import * as vscode from 'vscode';

suite("NORMAL: Find Motions", () => {
    setup(() => {
        const ext = vscode.extensions.getExtension('self.vim-like');
        ext?.exports.VimState.setMode('NORMAL');
        sleep(100);
    });

    suite('Find <char> ahead and jump', () => {
        const testCases: BlackBox.TestCase[] = [
            {
                from: "else if [](VimState.currentMode === 'VISUAL' || VimState.currentMode === 'VISUAL_LINE') {",
                inputs: "f S",
                to: "else if (Vim[]State.currentMode === 'VISUAL' || VimState.currentMode === 'VISUAL_LINE') {",
            },
            {
                from: '[]Foo Foo Foo end\nBar end',
                inputs: '4 f <s>',
                to: '[]Foo Foo Foo end\nBar end',
                skip: true,
            },
            {
                from: '[]Foo Foo Foo end\nBar end',
                inputs: '2 f F',
                to: 'Foo Foo []Foo end\nBar end',
            },
            {
                from: '[]Foo Foo Foo end\nBar end',
                inputs: '2 f <s>',
                to: 'Foo Foo[] Foo end\nBar end',
            },
            {
                from: 'F[]oo Foo Foo end\nBar end',
                inputs: '3 f o',
                to: 'Foo Fo[]o Foo end\nBar end',
            },
        ];

        for (let i = 0; i < testCases.length; i++) {
            BlackBox.run(testCases[i]);
        }
    });

    suite("Find <char> behind and jump", () => {
        const testCases: BlackBox.TestCase[] = [
            {
                from: "else if (VimState.currentMode []=== 'VISUAL' || VimState.currentMode === 'VISUAL_LINE') {",
                inputs: "F S",
                to: "else if (Vim[]State.currentMode === 'VISUAL' || VimState.currentMode === 'VISUAL_LINE') {",
            },
            {
                from: 'This is a line.\nAnd this []is another line.',
                inputs: '4 F <s>',
                to: 'This is a line.\nAnd this []is another line.',
                skip: true,
            },
            {
                from: 'This is a[] line.\nAnd this []is another line.',
                inputs: '2 F <s>',
                to: 'This[] is a line.\nAnd[] this is another line.',
            },
            {
                from: 'This i[]s a line.\nAnd this i[]s another line.',
                inputs: '2 F i',
                to: 'Th[]is is a line.\nAnd th[]is is another line.',
            },
            {
                from: 'This is a cute l[]ine.\nAnd this is another but ulgy l[]ine.',
                inputs: '2 F c',
                to: 'This is a []cute line.\nAnd this is another but ulgy l[]ine.',
            },
        ];

        for (let i = 0; i < testCases.length; i++) {
            BlackBox.run(testCases[i]);
        }
    });

    suite("Find <char> ahead and jump 1 char before", () => {
        const testCases: BlackBox.TestCase[] = [
            {
                from: "else []if (VimState.currentMode []=== 'VISUAL' || VimState.currentMode === 'VISUAL_LINE') {",
                inputs: "t S",
                to: "else if (Vi[]mState.currentMode === 'V[]ISUAL' || VimState.currentMode === 'VISUAL_LINE') {",
            },
            {
                from: 'This is a line.\nAnd this []is another line.',
                inputs: '4 t <s>',
                to: 'This is a line.\nAnd this []is another line.',
                skip: true,
            },
            {
                from: 'This is a[] line.\nAnd this []is another line.',
                inputs: '2 t <s>',
                to: 'This is a[] line.\nAnd this is anothe[]r line.',
            },
            {
                from: 'This []is a line.\nAnd this is another line.',
                inputs: 't i',
                to: 'This is a []line.\nAnd this is another line.',
            },
            {
                from: '[]This is a cute line.\n[]And this is another but ulgy line.',
                inputs: '2 t c',
                to: 'This is a[] cute line.\n[]And this is another but ulgy line.',
            },
        ];

        for (let i = 0; i < testCases.length; i++) {
            BlackBox.run(testCases[i]);
        }
    });

    suite("Find <char> behind and stop 1 char before", () => {
        const testCases: BlackBox.TestCase[] = [
            {
                from: "else if (VimState.currentMode []=== 'VISUAL' || VimState.currentMode === 'VISUAL_LINE') {",
                inputs: "T S",
                to: "else if (VimS[]tate.currentMode === 'VISUAL' || VimState.currentMode === 'VISUAL_LINE') {",
            },
            {
                from: 'This is a line.\nAnd this []is another line.',
                inputs: '4 T <s>',
                to: 'This is a line.\nAnd this []is another line.',
                skip: true,
            },
            {
                from: 'This is a[] line.\nAnd this []is another line.',
                inputs: '2 T <s>',
                to: 'This []is a line.\nAnd []this is another line.',
            },
            {
                from: 'This i[]s a line.\nAnd this is another l[]ine.',
                inputs: '2 T i',
                to: 'Thi[]s is a line.\nAnd thi[]s is another line.',
            },
            {
                from: 'This is a cute l[]ine.\nAnd this is another but ulgy l[]ine.',
                inputs: '2 T c',
                to: 'This is a c[]ute line.\nAnd this is another but ulgy l[]ine.',
            },
        ];

        for (let i = 0; i < testCases.length; i++) {
            BlackBox.run(testCases[i]);
        }
    });
});

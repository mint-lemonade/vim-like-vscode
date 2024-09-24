import { sleep } from '../util';
import * as BlackBox from './framework/blackbox';
import * as vscode from 'vscode';

suite('VISUAL: text object selections', () => {
    setup(() => {
        sleep(100);
        const ext = vscode.extensions.getExtension('TauCeti.vim-like');
        ext?.exports.VimState.setMode('VISUAL');
        sleep(100);
    });

    let testCases: BlackBox.TestCase[] = [
        {
            from: "This is longJ[]oinedWord. Yada Yada Yada....\n Help meeee!!!!",
            inputs: "i w",
            to: "This is [longJoinedWord]. Yada Yada Yada....\n Help meeee!!!!",
        },
        {
            from: "This is longJ[]oinedWord. Yada Yada Yada....\n Help meeee!!!!",
            inputs: "i W",
            to: "This is [longJoinedWord.] Yada Yada Yada....\n Help meeee!!!!",
        },
        {
            from: "This is longJoinedWor[]d. Yada Yada Yada....\n Help meeee!!!!",
            inputs: "i w",
            to: "This is [longJoinedWord]. Yada Yada Yada....\n Help meeee!!!!",
            // skip: true,
        },
        {
            from: "i[]f (syncVsCodeCursor) {\n        if (VimState.currentMode === 'NORMAL') {\n            VimState.vimCurs[]or.selections.forEach((sel, i) => {\n                sel.anchor = sel.active;\n            });\n        }\n        VimState.syncVsCodeCursorOrSelection();\n",
            inputs: "i (",
            to: "if ([syncVsCodeCursor]) {\n        if (VimState.currentMode === 'NORMAL') {\n            VimState.vimCursor.selections.forEach([(sel, i) => {\n                sel.anchor = sel.active;\n            }]);\n        }\n        VimState.syncVsCodeCursorOrSelection();\n",
        },
        {
            from: "if (syncVsCodeCursor) {\n        i[]f (VimState.currentMode === 'NORMAL') {\n            VimState.vimCurs[o]r.selections.forEach((sel, i) => {\n                sel.anchor = sel.active;\n            });\n        }\n        VimState.syncVsCodeCursorOrSelection();\n",
            inputs: "a '",
            to: "if (syncVsCodeCursor) {\n        i[]f (VimState.currentMode === 'NORMAL') {\n            VimState.vimCurs[o]r.selections.forEach((sel, i) => {\n                sel.anchor = sel.active;\n            });\n        }\n        VimState.syncVsCodeCursorOrSelection();\n",
        },
        {
            from: "This is longJoinedWor[]d. 'Yada Yada' Yada....\n Help meeee!!!!",
            inputs: "i '",
            to: "This is longJoinedWord. '[Yada Yada]' Yada....\n Help meeee!!!!",
        },
        {
            from: "This is longJoinedWor[]d. 'Yada Yada Yada....\n Help' meeee!!!!",
            inputs: "i '",
            to: "This is longJoinedWor[]d. 'Yada Yada Yada....\n Help' meeee!!!!",
        },
        {
            from: "This is longJoinedWord. []'Yada Yada' Yada....\n Help meeee!!!!",
            inputs: "i '",
            to: "This is longJoinedWord. '[Yada Yada]' Yada....\n Help meeee!!!!",
        },
        {
            from: "This is longJoinedWord. 'Yada Yada[]' Yada....\n Help meeee!!!!",
            inputs: "i '",
            to: "This is longJoinedWord. '[Yada Yada]' Yada....\n Help meeee!!!!",
            // skip: true,
        },
        {
            from: "This is longJoinedWord. 'Yada Yada' Yada...[].\n Help meeee!!!!",
            inputs: "i w",
            to: "This is longJoinedWord. 'Yada Yada' Yada[....]\n Help meeee!!!!",
            // skip: true,
        },
        {
            from: "This is longJoinedWord. 'Yada Yada' Yad[]a\n Help meeee!!!!",
            inputs: "i w",
            to: "This is longJoinedWord. 'Yada Yada' [Yada]\n Help meeee!!!!",
            // skip: true,
        },
        {
            from: "if (syncVsCodeCursor) {\n        if (VimState.currentMode === 'NORMAL') {\n            VimState.vimCursor.selections.forEach((sel, i) => {\n                sel.anchor = sel.active;\n            [}]);\n        }\n        VimState.syncVsCodeCursorOrSelection();\n",
            inputs: "a {",
            to: "if (syncVsCodeCursor) {\n        if (VimState.currentMode === 'NORMAL') {\n            VimState.vimCursor.selections.forEach((sel, i) => [{\n                sel.anchor = sel.active;\n            }]);\n        }\n        VimState.syncVsCodeCursorOrSelection();\n",
        },
    ];
    for (let i = 0; i < testCases.length; i++) {
        BlackBox.run(testCases[i]);
    }
});
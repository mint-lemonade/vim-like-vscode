import { sleep } from '../util';
import * as vscode from 'vscode';
import * as BlackBox from './framework/blackbox';

suite('NORMAL: Surround', () => {
    setup(() => {
        sleep(100);
        const ext = vscode.extensions.getExtension('TauCeti.vim-like');
        ext?.exports.VimState.setMode('NORMAL');
        sleep(100);
    });
    let testCases: BlackBox.TestCase[] = [
        {
            from: "i[]f (syncVsCodeCursor) {\n        if (VimState.currentMode === 'NORMAL') {\n            VimState.vimCursor.selections.forEach((sel, i) => {\n                sel.anchor = sel.active;\n            });\n        }\n        VimState.syncVsCodeCursorOrSelection();\n",
            inputs: "c s ( <",
            to: "i[]f <syncVsCodeCursor> {\n        if (VimState.currentMode === 'NORMAL') {\n            VimState.vimCursor.selections.forEach((sel, i) => {\n                sel.anchor = sel.active;\n            });\n        }\n        VimState.syncVsCodeCursorOrSelection();\n"
        },
        {
            from: "So[]me 'single-quoted' text. Some in {braces sir}.\nThis one in ({paran and braces})",
            inputs: 'c s \' "',
            to: "So[]me \"single-quoted\" text. Some in {braces sir}.\nThis one in ({paran and braces})"
        },
        {
            from: "So[]me 'single-quoted' text. Some in {braces sir}.\nThis one in ({paran and braces})",
            inputs: 'c s ( {',
            to: "So[]me 'single-quoted' text. Some in {braces sir}.\nThis one in {{paran and braces}}"
        },
        {
            from: "So[]me 'single-quoted' text. Some in {braces sir}.\nT[]his one in ({paran and braces})",
            inputs: 'c s { \'',
            to: "So[]me 'single-quoted' text. Some in 'braces sir'.\nT[]his one in ('paran and braces')"
        },
        {
            from: "if (syncVsCodeCursor) {\n        if (VimState.currentMode === 'NORMAL') {\n            VimState.vimCurs[]or.selections.forEach((sel, i) => {\n                sel.anchor = sel.active;\n            });\n        }\n        VimState.syncVsCodeCursorOrSelection();\n",
            inputs: "d s {",
            to: "if (syncVsCodeCursor) {\n        if (VimState.currentMode === 'NORMAL') \n            VimState.vimCurs[]or.selections.forEach((sel, i) => {\n                sel.anchor = sel.active;\n            });\n        \n        VimState.syncVsCodeCursorOrSelection();\n"
        },
        {
            from: "So[]me 'single-quoted' text. Some in {braces sir}.\nThis one in ({paran and braces})",
            inputs: 'd s (',
            to: "So[]me 'single-quoted' text. Some in {braces sir}.\nThis one in {paran and braces}"
        },
        {
            from: "So[]me 'single-quoted' text. Some in {braces sir}.\nThis one in ({paran and braces})",
            inputs: 'd s \'',
            to: "So[]me single-quoted text. Some in {braces sir}.\nThis one in ({paran and braces})"
        },
        {
            from: "So[]me 'single-quoted' text. Some in {braces sir}.\nT[]his one in ({paran and braces})",
            inputs: 'd s {',
            to: "So[]me 'single-quoted' text. Some in braces sir.\nT[]his one in (paran and braces)"
        },
        {
            from: "if (syncVsCodeCursor) {\n        if (VimState.currentMode === 'NORMAL') {\n            VimState.vimCurs[]or.selections.forEach((sel, i) => {\n                sel.anchor = sel.active;\n            });\n        }\n        VimState.syncVsCodeCursorOrSelection();\n",
            inputs: "y s i w <",
            to: "if (syncVsCodeCursor) {\n        if (VimState.currentMode === 'NORMAL') {\n            VimState.<vimCurs[]or>.selections.forEach((sel, i) => {\n                sel.anchor = sel.active;\n            });\n        }\n        VimState.syncVsCodeCursorOrSelection();\n"
        },
        {
            from: "i[]f (syncVsCodeCursor) {\n        if (VimState.currentMode === 'NORMAL') {\n            VimState.vimCurs[]or.selections.forEach((sel, i) => {\n                sel.anchor = sel.active;\n            });\n        }\n        VimState.syncVsCodeCursorOrSelection();\n",
            inputs: "c s ( <",
            to: "i[]f <syncVsCodeCursor> {\n        if (VimState.currentMode === 'NORMAL') {\n            VimState.vimCurs[]or.selections.forEach<(sel, i) => {\n                sel.anchor = sel.active;\n            }>;\n        }\n        VimState.syncVsCodeCursorOrSelection();\n"
        }
    ];
    for (let i = 0; i < testCases.length; i++) {
        BlackBox.run(testCases[i]);
    }
});
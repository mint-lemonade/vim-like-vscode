import * as vscode from 'vscode';
import { Keymap, KeyParseState } from "../keyHandler";
import { VimState } from "../vimState";
import { switchModeKeymap } from './switch_mode';
import { editActionKeymap } from './edit_actions';
import { registerKeymap } from '../register';

function invertSelection() {
    VimState.vimCursor.selections = VimState.vimCursor.selections.map(sel => {
        return {
            active: sel.anchor,
            anchor: sel.active
        };
    });

    VimState.syncVsCodeCursorOrSelection();
}

export const actionKeymap: Keymap[] = [
    ...switchModeKeymap,
    ...editActionKeymap,
    registerKeymap,
    {
        key: [':'],
        type: 'Action',
        action: () => { vscode.commands.executeCommand("workbench.action.showCommands"); },
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE']
    },
    {
        key: ['o'],
        type: 'Action',
        action: () => invertSelection(),
        mode: ['VISUAL', 'VISUAL_LINE']
    },
    {
        key: ['g', 'd'],
        type: 'Action',
        action: () => { vscode.commands.executeCommand('editor.action.revealDefinition'); },
        mode: ['NORMAL'],
    },
    {
        key: ['z', 'o'],
        type: 'Action',
        longDesc: ['(z)fold', 'open'],
        action: () => { vscode.commands.executeCommand('editor.unfold'); },
        mode: ['NORMAL'],
    },
    {
        key: ['z', 'c'],
        type: 'Action',
        longDesc: ['(z)fold', 'close'],
        action: () => { vscode.commands.executeCommand('editor.fold'); },
        mode: ['NORMAL'],
    },
    {
        key: ['z', 'a'],
        type: 'Action',
        longDesc: ['(z)fold', 'toggle'],
        action: () => { vscode.commands.executeCommand('editor.toggleFold'); },
        mode: ['NORMAL'],
    },
];
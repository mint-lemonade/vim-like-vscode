import * as vscode from 'vscode';
import { Keymap, KeyParseState } from "../keyHandler";
import { VimState } from "../vimState";
import { insertToModeKeymap, switchModeKeymap, updateInsertToModeKm } from './switch_mode';
import { editActionKeymap } from './edit_actions';
import { registerKeymap } from '../register';
import { multiCursorKeymap } from '../multiCursor';

// Setup Actions.
function setup(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand("vim-like.spaceBarScrollUp", () => scroll('up'))
    );
    context.subscriptions.push(
        vscode.commands.registerCommand("vim-like.spaceBarScrollDown", () => scroll('down'))
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "vim-like.addSelectionToNextMatch", () => selectNextMatch()
        )
    );
}

function invertSelection() {
    VimState.cursor.selections = VimState.cursor.selections.map(sel => {
        return {
            active: sel.anchor,
            anchor: sel.active
        };
    });

    VimState.syncVsCodeCursorOrSelection();
}

function foldLevel(matched: string) {
    let level = parseInt(matched[1]);
    if (Number.isNaN(level)) { return KeyParseState.Failed; }
    if (level > 7 || level < 0) {
        return KeyParseState.Failed;
    }
    vscode.commands.executeCommand(`editor.foldLevel${level}`);
}

async function findWordNative(where: 'next' | 'prev' | 'none') {
    switch (where) {
        case 'none':
            await vscode.commands.executeCommand('actions.find');
            // Bring back focus to editor from find-widget. 
            // Directory calling focusEditor command does not bring
            // focus to editor.
            // First focus on side bar to simulate as if focusEditor is being called from
            // command palette . 
            await vscode.commands.executeCommand('workbench.action.focusSideBar');
            await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
            await vscode.commands.executeCommand('editor.action.nextMatchFindAction');
            setImmediate(async () => {
                if (VimState.currentMode !== 'VISUAL') {
                    VimState.setMode('VISUAL');
                }
            });
            break;
        case 'prev':
            vscode.commands.executeCommand('editor.action.previousMatchFindAction');
            break;
        case 'next':
            vscode.commands.executeCommand('editor.action.nextMatchFindAction');
            break;
        default:
            break;
    }
}

function scroll(dir: 'up' | 'down') {
    let command = dir === 'up' ? 'scrollLineUp' : 'scrollLineDown';
    let repeat = vscode.workspace
        .getConfiguration("vim-like")
        .get('spaceScrollByLines') as number;
    if (!repeat) {
        return;
    }
    let commands = Array(repeat).fill(command);
    vscode.commands.executeCommand('runCommands', {
        "commands": commands
    });
}

async function selectNextMatch() {
    await vscode.commands.executeCommand('editor.action.addSelectionToNextFindMatch');
    setImmediate(() => {
        if (VimState.currentMode !== 'VISUAL') {
            VimState.setMode('VISUAL');
        }
    });
}


export const ActionHandler = {
    setup,
    updateInsertToModeKm
};

export { insertToModeKeymap };

export const actionKeymap: Keymap[] = [
    ...switchModeKeymap,
    ...multiCursorKeymap,
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
        key: ['z', '{}'],
        type: 'Action',
        action: (matched) => { foldLevel(matched); },
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
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { Mode, VimState } from './vimState';
import { MultiCursorHandler } from './multiCursor';
import { ActionHandler } from './actions';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	console.log('Extension "Vim-Like" activated!');

	VimState.init(context);
	MultiCursorHandler.setUp(context);
	ActionHandler.setup(context);

	context.subscriptions.push(vscode.commands.registerCommand('type', (text) => {
		VimState.type(text.text);
	}));

	let d1 = vscode.commands.registerCommand('vim-like.escape', () => {
		VimState.setMode('NORMAL');
		VimState.keyHandler.resetKeys();
	});
	context.subscriptions.push(d1);

	let d2 = vscode.commands.registerCommand('vim-like.goToInsertMode', () => {
		VimState.setMode('INSERT');
	});
	context.subscriptions.push(d2);

	let d3 = vscode.commands.registerCommand('vim-like.goToVisualMode', () => {
		VimState.setMode('VISUAL');
	});
	context.subscriptions.push(d3);

	return {
		VimState,
	};
}

export { VimState };

// This method is called when your extension is deactivated
export function deactivate() { }
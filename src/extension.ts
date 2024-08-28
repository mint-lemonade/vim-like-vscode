// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { Mode, VimState } from './mode';
import { Action } from './action';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "helloworld" is now active!');

	VimState.init(context);
	Action.setup(context);

	context.subscriptions.push(vscode.commands.registerCommand('type', (text) => {
		VimState.type(text.text);
	}));

	let disposable = vscode.commands.registerCommand('helloworld.helloWorld', () => {
		vscode.window.showInformationMessage('Hello VS code!');
	});
	context.subscriptions.push(disposable);

	let d1 = vscode.commands.registerCommand('vim.goToNormalMode', () => {
		VimState.setMode('NORMAL');
	});
	context.subscriptions.push(d1);

	let d2 = vscode.commands.registerCommand('vim.goToInsertMode', () => {
		VimState.setMode('INSERT');
	});
	context.subscriptions.push(d2);

	let d3 = vscode.commands.registerCommand('vim.goToVisualMode', () => {
		VimState.setMode('VISUAL');
	});
	context.subscriptions.push(d3);

}

// This method is called when your extension is deactivated
export function deactivate() { }
import * as vscode from 'vscode';


interface Motion {

}
export class MotionHandler {
    static moveLeft(select: Boolean) {
        vscode.commands.executeCommand('cursorMove', {
            to: 'left',
            select
            // by: 
        });
    }

    static moveRight(select: Boolean) {
        vscode.commands.executeCommand('cursorMove', {
            to: 'right',
            select
            // by: 
        });
    }

    static moveUp(select: Boolean) {
        vscode.commands.executeCommand('cursorMove', {
            to: 'up',
            select
            // by: 
        });
    }
    static moveDown(select: Boolean) {
        vscode.commands.executeCommand('cursorMove', {
            to: 'down',
            select
            // by: 
        });
    }
}   
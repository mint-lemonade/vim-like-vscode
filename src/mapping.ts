
import * as vscode from 'vscode';
import { Mode, VimState } from "./mode";
import { MotionHandler } from "./motion";

type Keymap = {
    key: string[],
    action: Function,
    // mode: Mode[],
};


const motionKeymap: Keymap[] = [
    {
        key: ['h'],
        action: MotionHandler.moveLeft,
        // mode: ['NORMAL']
    }, {
        key: ['l'],
        action: MotionHandler.moveRight,
        // mode: ['NORMAL']
    }, {
        key: ['j'],
        action: MotionHandler.moveDown,
        // mode: ['NORMAL']
    }, {
        key: ['k'],
        action: MotionHandler.moveUp,
        // mode: ['NORMAL']
    }
];

const insertModeKeymap: Keymap[] = [
    {
        key: ['j', 'f'],
        action: () => VimState.setMode('NORMAL'),
        // mode: ['INSERT']
    }
];

export class KeyHandler {
    insertModeMap: Keymap[] = [];
    normalModeMap: Keymap[] = [];
    visualModeMap: Keymap[] = [];

    currentSequence: string[] = [];
    expectingSequence: Boolean;
    sequenceTimeout: number = 500; // in milliseconds

    constructor() {
        this.normalModeMap.push(...motionKeymap);
        this.visualModeMap.push(...motionKeymap);
        this.insertModeMap.push(...insertModeKeymap);
        this.expectingSequence = false;
    }

    // returns false if no mapping was found and no action was executed. true otherwise.
    execute(key: string): Boolean {
        console.log("key: ", key);
        if (VimState.currentMode === 'INSERT') {
            if (!this.expectingSequence) {
                for (let km of this.insertModeMap) {
                    if (km.key[0] === key) {
                        if (km.key.length === 1) {
                            km.action();
                            return true;
                        }
                        this.expectingSequence = true;
                        this.currentSequence.push(key);
                        setTimeout(this.flushSequence.bind(this), this.sequenceTimeout);
                        return true;
                    }
                }
            } else {
                this.currentSequence.push(key);
                for (let km of this.insertModeMap) {
                    if (km.key.length < this.currentSequence.length) {
                        continue;
                    }
                    if (km.key.every((k, i) => k === this.currentSequence[i])) {
                        if (km.key.length === this.currentSequence.length) {
                            km.action();
                            this.clearSequence();
                        }
                        return true;
                    }
                }
                this.flushSequence();
                return true;
            }
        } else if (VimState.currentMode === 'NORMAL') {
            for (let km of this.normalModeMap) {
                if (!this.expectingSequence) {
                    if (km.key[0] === key) {
                        if (km.key.length === 1) {
                            km.action(false);
                            return true;
                        }

                    }
                }
            }
        } else if (VimState.currentMode === 'VISUAL') {
            for (let km of this.visualModeMap) {
                if (!this.expectingSequence) {
                    if (km.key[0] === key) {
                        if (km.key.length === 1) {
                            km.action(true);
                            return true;
                        }

                    }
                }
            }
        }
        return false;
    }

    // If key sequence isn't macthed or timeout occurs, 
    // delegate sequence to be typed by vscode.
    flushSequence() {
        console.log("Fushing sequence: ", this.currentSequence);
        this.expectingSequence = false;
        if (this.currentSequence.length) {
            vscode.commands.executeCommand('default:type', { text: this.currentSequence.join('') });
            this.currentSequence = [];
        }
    }

    clearSequence() {
        this.expectingSequence = false;
        this.currentSequence = [];
    }
}
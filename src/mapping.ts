
import * as vscode from 'vscode';
import { Mode, VimState } from "./mode";
import { executeMotion, MotionHandler } from "./motion";
import { Action } from './action';

type Keymap = {
    key: string[],
    action: Function,
    // mode: Mode[],
};


const motionKeymap: Keymap[] = [
    {
        key: ['h'],
        action: () => executeMotion(MotionHandler.moveLeft),
        // mode: ['NORMAL']
    }, {
        key: ['l'],
        action: () => executeMotion(MotionHandler.moveRight),
        // mode: ['NORMAL']
    }, {
        key: ['j'],
        action: () => executeMotion(MotionHandler.moveDown),
        // mode: ['NORMAL']
    }, {
        key: ['k'],
        action: () => executeMotion(MotionHandler.moveUp),
        // mode: ['NORMAL']
    }, {
        key: ['w'],
        action: () => executeMotion(MotionHandler.findWordBoundry, 'next-start', 'word'),
        // mode: ['NORMAL']
    }, {
        key: ['W'],
        action: () => executeMotion(MotionHandler.findWordBoundry, 'next-start', 'WORD'),
        // mode: ['NORMAL']
    }, {
        key: ['e'],
        action: () => executeMotion(MotionHandler.findWordBoundry, 'next-end', 'word'),
        // mode: ['NORMAL']
    }, {
        key: ['E'],
        action: () => executeMotion(MotionHandler.findWordBoundry, 'next-end', 'WORD'),
        // mode: ['NORMAL']
    }, {
        key: ['b'],
        action: () => executeMotion(MotionHandler.findWordBoundry, 'prev-start', 'word'),
        // mode: ['NORMAL']
    }, {
        key: ['B'],
        action: () => executeMotion(MotionHandler.findWordBoundry, 'prev-start', 'WORD'),
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

const normalModeKeymap: Keymap[] = [
    {
        key: ['i'],
        action: () => Action.switchToInsertModeAt('before-cursor'),
        // mode: ['INSERT']
    },
    {
        key: ['I'],
        action: () => Action.switchToInsertModeAt('line-start'),
        // mode: ['INSERT']
    },
    {
        key: ['a'],
        action: () => Action.switchToInsertModeAt('after-cursor'),
        // mode: ['INSERT']
    },
    {
        key: ['A'],
        action: () => Action.switchToInsertModeAt('line-end'),
        // mode: ['INSERT']
    },
];

const visualModeKeymap: Keymap[] = [
    {
        key: ['i'],
        action: () => Action.switchToInsertModeAt('before-cursor'),
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

    debounceTime: number = 10; // in milliseconds
    lastKeyTimeStamp: number = 0;

    constructor() {
        this.normalModeMap.push(...motionKeymap, ...normalModeKeymap);
        this.visualModeMap.push(...motionKeymap, ...visualModeKeymap);
        this.insertModeMap.push(...insertModeKeymap);
        this.expectingSequence = false;
    }

    // returns false if no mapping was found and no action was executed. true otherwise.
    execute(key: string): Boolean {
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
            console.log("key: ", key);
            // if (this.debounceKey()) { return false; }
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
            console.log("key: ", key);
            // if (this.debounceKey()) { return false; }
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

    debounceKey() {
        let currentTime = new Date().getTime();
        if (this.lastKeyTimeStamp < currentTime - this.debounceTime) {
            this.lastKeyTimeStamp = currentTime;
            return false;
        } else {
            this.lastKeyTimeStamp = currentTime;
            return true;
        }
    }
}
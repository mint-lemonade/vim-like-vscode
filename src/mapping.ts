
import * as vscode from 'vscode';
import { Mode, VimState } from "./mode";
import { executeMotion, Motion, MotionHandler } from "./motion";
import { execOperators, Operator } from './operator';
import { Action } from './action';
import { printCursorPositions } from './util';

export type Keymap = {
    // In INSERT mode keys are time sensitive. 
    // So if sequence doesn't match or timeout occurs, typing is delegated to vscode.
    // In NORMAL and VISUAL mode no timout occurs and no delegation happens
    key: string[],
    mode: Mode[],
} & ({
    type: 'Motion',
    action: Motion,
    args?: any[]
} | {
    type: 'Operator',
    action: Operator,
    args?: any[]
} | {
    type: 'Action',
    action: Function,
    // args?: any[]
});

export class KeyHandler {
    insertModeMap: Keymap[] = [];
    normalModeMap: Keymap[] = [];
    visualModeMap: Keymap[] = [];

    currentSequence: string[] = [];
    expectingSequence: Boolean;
    sequenceTimeout: number = 500; // in milliseconds

    debounceTime: number = 10; // in milliseconds
    lastKeyTimeStamp: number = 0;

    operator: Operator | undefined | null;

    constructor(keymaps: Keymap[]) {
        for (let i = keymaps.length - 1; i >= 0; i--) {
            let keymap = keymaps[i];
            if (keymap.mode.includes('INSERT')) {
                this.insertModeMap.push(keymap);
            }
            if (keymap.mode.includes('NORMAL')) {
                this.normalModeMap.push(keymap);
            }
            if (keymap.mode.includes('VISUAL')) {
                this.visualModeMap.push(keymap);
            }
        }
        this.expectingSequence = false;
    }

    // returns false if no mapping was found and no action was executed. true otherwise.
    execute(key: string): Boolean {
        if (VimState.currentMode === 'NORMAL' || VimState.currentMode === 'VISUAL') {
            // if key is  a number then set up repeat value for how many 
            // times next motion is to be repeated.
            let repeat = parseInt(key);
            if (!Number.isNaN(repeat)) {
                MotionHandler.repeat = MotionHandler.repeat * 10 + repeat;
                Action.repeat = Action.repeat * 10 + repeat;
                return true;
            }
        }

        // Get current keymap to be used based on mode.
        let currentKeymap: Keymap[];
        switch (VimState.currentMode) {
            case 'INSERT':
                currentKeymap = this.insertModeMap;
                break;
            case 'NORMAL':
                currentKeymap = this.normalModeMap;
                break;
            case 'VISUAL':
                currentKeymap = this.visualModeMap;
                break;
        }

        // Match keys and execute action
        if (!this.expectingSequence) {
            for (let km of currentKeymap) {
                if (km.key[0] === key) {
                    if (km.key.length === 1) {
                        this.execAction(km);
                        return true;
                    }
                    this.expectingSequence = true;
                    this.currentSequence.push(key);
                    if (VimState.currentMode === 'INSERT') {
                        setTimeout(this.flushSequence.bind(this), this.sequenceTimeout);
                    }
                    return true;
                }
            }
        } else {
            this.currentSequence.push(key);
            for (let km of currentKeymap) {
                if (km.key.length < this.currentSequence.length) {
                    continue;
                }
                if (km.key.every((k, i) => k === this.currentSequence[i])) {
                    if (km.key.length === this.currentSequence.length) {
                        this.execAction(km);
                        this.clearSequence();
                    }
                    return true;
                }
            }
            if (VimState.currentMode === 'INSERT') {
                // If sequence not matched delegate to vscode typing
                this.flushSequence();
            } else {
                // If sequence not matched, clear sequence.
                this.clearSequence();
            }
            return true;
        }
        return false;
    }

    execAction(km: Keymap) {
        printCursorPositions("Before start execution");
        if (km.type === 'Motion') {
            if (this.operator) {
                // if prev key was operator, combine operator and motion 
                execOperators(this.operator, { motion: km.action, args: km.args || [] });
            } else {
                executeMotion(km.action, true, ...(km.args || []));
            }
            this.operator = null;
            // reset repeat to default after executing motion.
            MotionHandler.repeat = 0;
            Action.repeat = 0;
        } else if (km.type === 'Operator') {
            if (VimState.currentMode === 'NORMAL') {
                this.operator = km.action;
            } else if (VimState.currentMode === 'VISUAL') {
                // execute operator on currently selected ranges.
                execOperators(km.action);
            }
        } else if (km.type === 'Action') {
            km.action();
            this.operator = null;
            // reset repeat to default after executing motion.
            MotionHandler.repeat = 0;
            Action.repeat = 0;
        }
        printCursorPositions("After complete execution");
    }

    // If key sequence isn't matched or timeout occurs, 
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
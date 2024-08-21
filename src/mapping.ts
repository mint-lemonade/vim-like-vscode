
import * as vscode from 'vscode';
import { Mode, VimState } from "./mode";
import { executeMotion, Motion, MotionHandler } from "./motion";
import { execOperators, Operator } from './operator';
import { Action } from './action';
import { printCursorPositions } from './util';
import { TextObjects } from './text_objects';
import { EOL } from 'os';

export type Keymap = {
    // In INSERT mode keys are time sensitive. 
    // So if sequence doesn't match or timeout occurs, typing is delegated to vscode.
    // In NORMAL and VISUAL mode no timout occurs and no delegation happens
    key: string[],
    mode: (Mode | 'OP_PENDING_MODE')[],
} & (MotionKeymap | OperatorKeymap | ActionKeymap | TextObjectKeymap);

type MotionKeymap = {
    type: 'Motion',
    action: Motion,
    args?: any[]
};
type OperatorKeymap = {
    type: 'Operator',
    action: Operator,
    requireArgs?: boolean,
    multipleArgs?: boolean
    args?: any[],
};
type ActionKeymap = {
    type: 'Action',
    action: Function,
};
type TextObjectKeymap = {
    type: "TextObjects",
    action: TextObjects,
};

export class KeyHandler {
    statusBar: vscode.StatusBarItem;

    insertModeMap: Keymap[] = [];
    normalModeMap: Keymap[] = [];
    visualModeMap: Keymap[] = [];
    operatorPendingModeMap: Keymap[] = [];

    currentSequence: string[] = [];
    matchedSequence: string = "";
    expectingSequence: Boolean;
    sequenceTimeout: number = 500; // in milliseconds

    debounceTime: number = 10; // in milliseconds
    lastKeyTimeStamp: number = 0;

    operatorPendingMode: boolean = false;
    operatorArg: string = "";
    operator: {
        op: Operator, key: string, km: Keymap,
        preArgs: string, postArgs: string
    } | undefined | null;

    constructor(keymaps: Keymap[]) {
        this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
        this.statusBar.text = 'op: ';
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
            if (keymap.mode.includes('OP_PENDING_MODE')) {
                this.operatorPendingModeMap.push(keymap);
            }
        }
        this.expectingSequence = false;
    }

    // returns false if no mapping was found and no action was executed. true otherwise.
    async execute(key: any): Promise<Boolean> {
        // let key: string = text.text;
        let [matched, matchedKeymap] = this.matchKey(key);
        console.log("matched = ", matched);
        console.log("matchedKeymap", matchedKeymap);
        if (!matched) {
            if (!this.operatorPendingMode) {
                return false;
            }

            // In OP_PENDING_MODE
            this.operatorArg += key;
            if (await execOperators(this.operator!.op, { postArgs: this.operatorArg })) {
                this.resetOperator();
                return true;
            }
            return false;
        }

        // if matched but matchedKeymap is undefined, means middle of an expected sequence.
        if (!matchedKeymap) { return true; }

        if (matchedKeymap.type === 'Motion') {
            MotionHandler.current_key = this.matchedSequence;
        }

        this.execAction(matchedKeymap).then(() => {
            if (this.operatorPendingMode) {
                this.statusBar.show();
            }
        });
        return true;
    }

    matchKey(key: string): [boolean, Keymap | undefined] {
        if (VimState.currentMode === 'NORMAL' || VimState.currentMode === 'VISUAL') {
            // if (this.debounceKey()) {
            //     return false;
            // }

            // if key is  a number then set up repeat value for how many
            // times next motion/operator is to be repeated.
            let repeat = parseInt(key);
            if (!Number.isNaN(repeat)) {
                if (repeat === 0 && MotionHandler.repeat === 0 && Action.repeat === 0) {
                    // Do nothing. Let the key be handled as motion.
                } else {
                    MotionHandler.repeat = MotionHandler.repeat * 10 + repeat;
                    Action.repeat = Action.repeat * 10 + repeat;
                    return [true, undefined];
                }
            }
        }

        // Get current keymap to be used based on mode.
        let currentKeymap: Keymap[];
        if (this.operatorPendingMode) {
            currentKeymap = this.operatorPendingModeMap;
        } else {
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
        }

        // If same operator is pressed twice, we do not match and return its keymap immediately
        if (this.operatorPendingMode) {
            if (this.operator?.key === key) {
                // this.execAction(this.operator.km);
                return [true, this.operator.km];
            }
        }
        // Match keys and execute action
        if (!this.expectingSequence) {
            for (let km of currentKeymap) {
                if (km.key[0] === key) {
                    if (km.key.length === 1) {
                        // this.execAction(km);
                        this.matchedSequence = key;
                        return [true, km];
                    }
                    this.expectingSequence = true;
                    this.currentSequence.push(key);
                    if (VimState.currentMode === 'INSERT') {
                        setTimeout(this.flushSequence.bind(this), this.sequenceTimeout);
                    }
                    return [true, undefined];
                }
            }
        } else {
            this.currentSequence.push(key);
            for (let km of currentKeymap) {
                if (km.key.length < this.currentSequence.length) {
                    continue;
                }
                if (km.key.every((k, i) => k === this.currentSequence[i] || k === '{}')) {
                    if (km.key.length === this.currentSequence.length) {
                        // this.execAction(km);
                        this.matchedSequence = this.currentSequence.join("");
                        this.clearSequence();
                        return [true, km];
                    }
                    return [true, undefined];
                }
            }
            if (VimState.currentMode === 'INSERT') {
                // If sequence not matched delegate to vscode typing
                this.flushSequence();
            } else {
                // If sequence not matched, clear sequence.
                this.clearSequence();
            }
            return [true, undefined];
        }
        return [false, undefined];
    }

    async execAction(km: Keymap) {
        printCursorPositions("Before start execution");

        if (this.operatorPendingMode) {
            if (km.type === 'Motion') {
                execOperators(this.operator!.op, { motion: km.action, motionArgs: km.args || [] });
                this.resetOperator();
                MotionHandler.repeat = 0;
                Action.repeat = 0;
                return;
            }
            else if (km.type === 'Operator') {
                if (await execOperators(km.action, { preArgs: this.operator?.key })) {
                    this.resetOperator();
                    return;
                }
                this.operator = {
                    op: km.action, key: km.key[0], km,
                    preArgs: this.operator!.key, postArgs: ""
                };
                this.statusBar.text += this.operator.key;
                return;
            }
            else if (km.type === 'TextObjects') {


            }
            else if (km.type === 'Action') {
                console.error(`Action '${km.key}' cannot be executed in OP_PENDING_MODE!`);
            }

        } else {
            if (km.type === 'Motion') {
                executeMotion(km.action, true, ...(km.args || []));
                MotionHandler.repeat = 0;
                Action.repeat = 0;
                return;
            }
            else if (km.type === 'Operator') {
                if (VimState.currentMode === 'NORMAL') {
                    this.operatorPendingMode = true;
                    this.operator = {
                        op: km.action, key: km.key[0], km, preArgs: "", postArgs: ""
                    };
                    this.statusBar.text += this.operator.key;

                } else if (VimState.currentMode === 'VISUAL') {
                    // execute operator on currently selected ranges.
                    execOperators(km.action);
                    this.resetOperator();
                }
            }
            else if (km.type === 'TextObjects') {


            }
            else if (km.type === 'Action') {
                km.action();
                // reset repeat to default after executing motion.
                MotionHandler.repeat = 0;
                Action.repeat = 0;
            }
        }

        printCursorPositions("After complete execution");
    }

    resetOperator() {
        this.operator = null;
        this.operatorPendingMode = false;
        this.operatorArg = "";
        this.statusBar.text = 'op: ';
        this.statusBar.hide();
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
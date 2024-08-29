
import * as vscode from 'vscode';
import { Mode, VimState } from "./mode";
import { executeMotion, Motion, MotionHandler } from "./motion";
import { execOperators, Operator } from './operator';
import { Action } from './action';
import { printCursorPositions } from './util';
import { execTextObject, TextObject, TextObjects } from './text_objects';

export type Keymap = {
    // In INSERT mode keys are time sensitive. 
    // So if sequence doesn't match or timeout occurs, typing is delegated to vscode.
    // In NORMAL and VISUAL mode no timout occurs and no delegation happens
    key: string[],
    mode: (Mode | 'OP_PENDING_MODE')[],
    showInStatusBar?: boolean,
    longDesc?: string[]
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
    type: "TextObject",
    action: TextObject,
    args?: any[]
};

export class KeyHandler {
    statusBar: {
        item: vscode.StatusBarItem,
        content: string[]
    };

    insertModeMap: Keymap[] = [];
    normalModeMap: Keymap[] = [];
    visualModeMap: Keymap[] = [];
    visualLineModeMap: Keymap[] = [];
    operatorPendingModeMap: Keymap[] = [];

    waitingForInput: boolean;
    currentSequence: string[] = [];
    matchedSequence: string = "";
    expectingSequence: boolean;
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
        this.statusBar = {
            item: vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1),
            content: []
        };
        this.statusBar.item.text = '';

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
            if (keymap.mode.includes('VISUAL_LINE')) {
                this.visualLineModeMap.push(keymap);
            }
            if (keymap.mode.includes('OP_PENDING_MODE')) {
                this.operatorPendingModeMap.push(keymap);
            }
        }
        this.expectingSequence = false;
        this.waitingForInput = false;
    }

    // returns false if no mapping was found and no action was executed. true otherwise.
    async execute(key: any): Promise<Boolean> {
        // let key: string = text.text;
        let [matched, matchedKeymap] = this.matchKey(key);
        console.log("matched = ", matched);
        console.log("matchedKeymap", matchedKeymap);
        if (!matched) {
            if (!this.operatorPendingMode) {
                this.resetKeys();
                return false;
            }

            // In OP_PENDING_MODE
            this.updateStatusBar();
            this.operatorArg += key;
            if (await execOperators(this.operator!.op, { postArgs: this.operatorArg })) {
                this.resetKeys();
                return true;
            }
            return false;
        }

        // if matched but matchedKeymap is undefined, means middle of an expected sequence.
        if (!matchedKeymap) { return true; }

        if (matchedKeymap.type === 'Motion') {
            MotionHandler.current_key = this.matchedSequence;
        } else if (matchedKeymap.type === 'TextObject') {
            TextObjects.currentSeq = this.matchedSequence;
        }

        this.execAction(matchedKeymap).then(() => {
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
            if (!this.expectingSequence && !Number.isNaN(repeat)) {
                if (repeat === 0 && MotionHandler.repeat === 0 && Action.repeat === 0) {
                    // Do nothing. Let the key be handled as motion.
                } else {
                    MotionHandler.repeat = MotionHandler.repeat * 10 + repeat;
                    Action.repeat = Action.repeat * 10 + repeat;
                    this.matchedSequence = repeat.toString();
                    this.updateStatusBar();
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
                case 'VISUAL_LINE':
                    currentKeymap = this.visualLineModeMap;
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
                    this.matchedSequence = key;
                    this.updateStatusBar(km);
                    if (km.key.length === 1) {
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
                    this.matchedSequence = this.currentSequence.join("");
                    this.updateStatusBar(km, this.currentSequence.length - 1);
                    if (km.key.length === this.currentSequence.length) {
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
                // this.statusBar.text += this.operator.key;
                return;
            }
            else if (km.type === 'TextObject') {
                execOperators(this.operator!.op, {
                    textObject: km.action, textObjectArgs: km.args || []
                });
                this.resetOperator();
                MotionHandler.repeat = 0;
                Action.repeat = 0;
                return;

            }
            else if (km.type === 'Action') {
                console.error(`Action '${km.key}' cannot be executed in OP_PENDING_MODE!`);
            }

        } else {
            if (km.type === 'Motion') {
                executeMotion(km.action, true, ...(km.args || []));
                this.resetKeys();
                // return;
            }
            else if (km.type === 'Operator') {
                if (VimState.currentMode === 'NORMAL') {
                    this.operatorPendingMode = true;
                    this.operator = {
                        op: km.action, key: km.key[0], km, preArgs: "", postArgs: ""
                    };
                    // this.statusBar.text += this.operator.key;

                } else if (VimState.currentMode === 'VISUAL' || VimState.currentMode === 'VISUAL_LINE') {
                    // execute operator on currently selected ranges.
                    execOperators(km.action);
                    this.resetKeys();
                }
            }
            else if (km.type === 'TextObject') {
                execTextObject(km.action, true, ...(km.args || []));
                this.resetKeys();
            }
            else if (km.type === 'Action') {
                km.action(this.matchedSequence);
                // reset repeat to default after executing motion.
                // this.resetKeys();
                if (!this.waitingForInput) {
                    this.resetKeys();
                }
            }
        }

        printCursorPositions("After complete execution");
    }

    resetOperator() {
        this.operator = null;
        this.operatorPendingMode = false;
        this.operatorArg = "";
        this.statusBar.item.text = '';
        this.waitingForInput = false;
        this.statusBar.item.hide();
        VimState.register.reset();
    }
    resetKeys() {
        this.operator = null;
        this.operatorPendingMode = false;
        this.operatorArg = "";
        this.matchedSequence = "";
        this.expectingSequence = false;
        this.statusBar.item.text = '';
        this.statusBar.item.hide();
        VimState.register.reset();
        this.waitingForInput = false;
        MotionHandler.repeat = 0;
        Action.repeat = 0;
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

    updateStatusBar(km?: Keymap, keyIdx: number = 0) {
        if (VimState.currentMode === 'INSERT') { return; }
        if (this.operatorPendingMode) {
            if (!km) {
                this.statusBar.item.text += this.matchedSequence;
                return;
            }
            this.statusBar.item.text += km.longDesc ? km.longDesc[keyIdx].replace('{}', this.matchedSequence[keyIdx]) : km.key[keyIdx];
        } else {
            if (km && km.key.length === 1 && km.type !== 'Operator') {
                return;
            }
            if (km) {
                this.statusBar.item.text += km.longDesc ? km.longDesc[keyIdx].replace('{}', this.matchedSequence[keyIdx]) : km.key[keyIdx];
            }
        }
        if (this.statusBar.item.text.length) {
            this.statusBar.item.show();
        } else {
            this.statusBar.item.hide();
        }
    }
}
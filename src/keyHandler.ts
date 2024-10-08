
import * as vscode from 'vscode';
import { Mode, SubMode, VimState } from "./vimState";
import { executeMotion, Motion, MotionHandler } from "./motionHandler";
import { Operator, default as OperatorHandler, OperatorResult } from './operatorHandler';
import { Logger, printCursorPositions } from './util';
import { execTextObject, TextObject, TextObjects } from './textObjectHandler';
import { EOL } from 'os';
import assert from 'assert';

/**
 * Currently inputs for motions and operators are handled in multiple ways
 * 1. by specifying {} as a key in a Keymap. eg. keys: ['f', '{}']
 *    this matches any single char after f.
 * 2. by setting requireInput as true and inputType as 'char' or 'string' in Keymap.
 *    single 'char' inputType dont work right now. Only long text 'string' works.
 * 3. by returning MoreInput parseState and inputType from Operator execution.
 *    this handles single 'char' input for operators. Not tested with long text 'string'
 * // TODO: Unify input handling approach. Remove **1**. approach of specifying {} in keys. 
 *          Make sure inputType apprach of **2** and **3** works for all cases. ie. single char
 *          for keymaps(**2**) and long-text-string for operators (**3**)
 */
export type InputType = 'char' | 'string';
export type Keymap = {
    // In INSERT mode keys are time sensitive. 
    // So if sequence doesn't match or timeout occurs, typing is delegated to vscode.
    // In NORMAL and VISUAL mode no timout occurs and no delegation happens
    key: string[],
    mode: (Mode | SubMode)[],
    showInStatusBar?: boolean,
    longDesc?: string[],
    requireInput?: boolean,
    inputType?: InputType,
    args?: any[]
} & (MotionKeymap | OperatorKeymap | ActionKeymap | TextObjectKeymap);

type MotionKeymap = {
    type: 'Motion',
    action: Motion,
    args?: any[]
};

export type OperatorKeymap = {
    type: 'Operator',
    action: Operator,
    handlePostArgs?: boolean /**
     * - when false(default) OperatorHandler handles motion and textObjects
     *   to provide range for operator.
     * - when true, motions and textObject are passed as args to operator
     *   to be handled. 
     */
    args?: any[],
};

type ActionKeymap = {
    type: 'Action',
    action: (mathedSeq: string, repeat: number, ...args: any[]) => void | Promise<KeyParseState>,
};

type TextObjectKeymap = {
    type: "TextObject",
    action: TextObject,
    args?: any[]
};

export enum KeyParseState {
    Failed,
    Success,
    MoreInput
}
type StatusBarContentType = 'op' | 'inputText' | 'other';

export class KeyHandler {
    statusBar: {
        item: vscode.StatusBarItem,
        contents: {
            type: StatusBarContentType,
            text: string;
        }[],
    };

    insertModeMap: Keymap[] = [];
    normalModeMap: Keymap[] = [];
    visualModeMap: Keymap[] = [];
    visualLineModeMap: Keymap[] = [];
    operatorPendingModeMap: Keymap[] = [];
    multicursorModeMap: Keymap[] = [];

    // 0 is default value, command will executed once when repeat is either 0 or 1
    repeat: number = 0;
    currentSequence: string[] = [];
    matchedSequence: string = "";
    moreInput: boolean;
    sequenceTimeout: number = 200; // in milliseconds

    nextInputType: InputType | undefined;
    textInput: {
        input: string,
        forKm: Keymap,
        on: boolean
    } | undefined;

    debounceTime: number = 10; // in milliseconds
    lastKeyTimeStamp: number = 0;

    operator: {
        op: Operator, key: string, km: Keymap,
        preArgs: string,
    } | undefined | null;

    constructor(keymaps: Keymap[], context: vscode.ExtensionContext) {
        this.statusBar = {
            item: vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1),
            contents: [],
        };
        context.subscriptions.push(this.statusBar.item);
        this.statusBar.item.text = '';
        this.setupKeymaps(keymaps);
        this.moreInput = false;
        context.subscriptions.push(
            vscode.commands.registerCommand(
                'vim-like.textInputBackspace', this.textInputBackspace, this
            )
        );
        context.subscriptions.push(
            vscode.commands.registerCommand(
                'vim-like.resetKeys', this.resetKeys, this
            )
        );
    }

    setupKeymaps(keymaps: Keymap[]) {
        this.insertModeMap = [];
        this.normalModeMap = [];
        this.visualModeMap = [];
        this.visualLineModeMap = [];
        this.operatorPendingModeMap = [];
        this.multicursorModeMap = [];
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
            if (keymap.mode.includes('OPERATOR_PENDING')) {
                this.operatorPendingModeMap.push(keymap);
            }
            if (keymap.mode.includes('MULTI_CURSOR')) {
                this.multicursorModeMap.push(keymap);
            }
        }
    }

    // returns false if no mapping was found and no action was executed. true otherwise.
    async execute(key: any): Promise<Boolean> {
        let [matched, matchedKeymap] = this.matchKey(key);
        // Logger.log("matched = ", matched);
        // Logger.log("matchedKeymap", matchedKeymap);
        this.renderStatusBar();
        if (!matched) {
            if (VimState.subMode !== 'OPERATOR_PENDING') {
                this.resetKeys();
                return false;
            }

            // In OPERATOR_PENDING
            let result = await OperatorHandler.execute(this.operator!.op, {
                postArg: key, preArgs: this.operator?.preArgs,
                // km: this.operator!.km
            });
            if (result.parseState === KeyParseState.MoreInput) {
                this.nextInputType = result.inputType;

                // set context for when clause without setting this.moreInput 
                // TODO: Ideally both should stay in sync.
                vscode.commands.executeCommand(
                    'setContext', "vim-like.moreInput", true
                );
                this.renderStatusBar();
                return false;
            } else {
                this.resetKeys();
                return true;
            }
        }

        /**
         * if matched but matchedKeymap is undefined, 
         * means middle of an expected sequence
         * or middle of taking input.
         */
        if (!matchedKeymap) {
            // this.renderStatusBar();
            return true;
        }

        /**
         * If matched Keymap requires long-text-input set state to 
         * accept further keypresses as that input.
         */
        if (matchedKeymap.requireInput && matchedKeymap.inputType === 'string' && !this.textInput) {
            this.moreInput = true;
            this.nextInputType = matchedKeymap.inputType;
            vscode.commands.executeCommand(
                'setContext', "vim-like.moreInput", this.moreInput
            );
            this.textInput = {
                input: "",
                forKm: matchedKeymap,
                on: true
            };
            // this.renderStatusBar();
            return true;
        }

        if (matchedKeymap.type === 'Motion') {
            MotionHandler.currentSeq = this.matchedSequence;
        } else if (matchedKeymap.type === 'TextObject') {
            TextObjects.currentSeq = this.matchedSequence;
        }

        this.execAction(matchedKeymap).then((parseState) => {
            if (parseState === KeyParseState.MoreInput) {
                this.renderStatusBar();
                // set context for when clause without setting this.moreInput 
                vscode.commands.executeCommand(
                    'setContext', "vim-like.moreInput", true
                );
            } else {
                this.resetKeys();
            }
        });
        return true;
    }

    matchKey(key: string): [boolean, Keymap | undefined] {
        if (this.nextInputType === 'char') {
            return [false, undefined];
        }
        if (this.nextInputType === 'string' && this.textInput) {
            if (key === EOL) {
                this.textInput.on = false;
                // push input into keymap args, so can be passed when executing
                this.textInput.forKm.args![0] = this.textInput.input;
                return [true, this.textInput.forKm];
            }
            this.textInput.input += key;
            this.matchedSequence += key;
            this.updateStatusBarContent('inputText');
            return [true, undefined];
        }

        if (['NORMAL', 'VISUAL', 'VISUAL_LINE'].includes(VimState.currentMode)) {
            // if (this.debounceKey()) {
            //     return false;
            // }

            // if key is  a number then set up repeat value for how many
            // times next motion/operator is to be repeated.
            let repeat = parseInt(key);
            if (!this.moreInput && !Number.isNaN(repeat)) {
                if (repeat === 0 && this.repeat === 0) {
                    // Do nothing. Let the key be handled as '0' motion.
                } else {
                    this.repeat = this.repeat * 10 + repeat;
                    MotionHandler.repeat = this.repeat;
                    OperatorHandler.repeat = this.repeat;
                    TextObjects.repeat = this.repeat;
                    this.matchedSequence = repeat.toString();
                    this.updateStatusBarContent('other');
                    // set context for when clause without setting this.moreInput 
                    vscode.commands.executeCommand(
                        'setContext', "vim-like.moreInput", true
                    );
                    return [true, undefined];
                }
            }
        }

        // Get current keymap to be used based on mode.
        let currentKeymap: Keymap[];
        if (VimState.subMode === 'OPERATOR_PENDING') {
            currentKeymap = this.operatorPendingModeMap;
        } else if (VimState.subMode === 'MULTI_CURSOR') {
            currentKeymap = this.multicursorModeMap;
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
        if (VimState.subMode === 'OPERATOR_PENDING') {
            if (this.operator?.key === key) {
                // this.execAction(this.operator.km);
                return [true, this.operator.km];
            }
        }
        // Match keys and execute action
        if (!this.moreInput) {
            for (let km of currentKeymap) {
                if (km.key[0] === key) {
                    this.matchedSequence = key;

                    if (km.type === 'Operator') {
                        this.updateStatusBarContent('op', km);
                    } else {
                        this.updateStatusBarContent('other', km);
                    }

                    if (km.key.length === 1) {
                        return [true, km];
                    }
                    this.moreInput = true;
                    vscode.commands.executeCommand(
                        'setContext', "vim-like.moreInput", this.moreInput
                    );
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

                    // update status bar content.
                    if (km.type === 'Operator') {
                        this.updateStatusBarContent(
                            'op', km, this.currentSequence.length - 1
                        );
                    } else {
                        this.updateStatusBarContent(
                            'other', km, this.currentSequence.length - 1
                        );
                    }

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

    async execAction(km: Keymap): Promise<KeyParseState> {
        printCursorPositions("Before start execution");

        if (VimState.subMode === 'OPERATOR_PENDING') {
            let result: OperatorResult;
            if (km.type === 'Motion') {
                result = await OperatorHandler.execute(this.operator!.op, {
                    motion: km.action, motionArgs: km.args || [],
                    preArgs: this.operator?.preArgs, postArgKm: km, km: this.operator?.km
                });
            }
            else if (km.type === 'Operator') {
                let preArgs = this.operator!.key;
                result = await OperatorHandler.execute(km.action, { preArgs, km });
                if (result.parseState === KeyParseState.MoreInput) {
                    this.operator = {
                        op: km.action, key: km.key[0], km,
                        preArgs,
                    };
                }
            }
            else if (km.type === 'TextObject') {
                TextObjects.currentSeq = this.matchedSequence;
                result = await OperatorHandler.execute(this.operator!.op, {
                    textObject: km.action, textObjectArgs: km.args || [],
                    km: this.operator?.km, postArgKm: km
                });
            }
            else if (km.type === 'Action') {
                console.error(`Action '${km.key}' cannot be executed in OPERATOR_PENDING!`);
                return KeyParseState.Failed;
            }
            if (result!.inputType) {
                this.nextInputType = result!.inputType;
            }
            return result!.parseState;
        } else {
            if (km.type === 'Motion') {
                executeMotion(km.action, true, ...(km.args || []));
                return KeyParseState.Success;
            }
            else if (km.type === 'Operator') {
                if (VimState.currentMode === 'NORMAL') {
                    VimState.subMode = 'OPERATOR_PENDING';
                    this.operator = {
                        op: km.action, key: km.key[0], km, preArgs: ""
                    };

                    // this.updateStatusBarContent('op', km);
                    return KeyParseState.MoreInput;

                } else if (VimState.currentMode === 'VISUAL' || VimState.currentMode === 'VISUAL_LINE') {
                    // execute operator on currently selected ranges.
                    OperatorHandler.execute(km.action);
                    return KeyParseState.Success;
                }
            }
            else if (km.type === 'TextObject') {
                execTextObject(km.action, true, ...(km.args || []));
                return KeyParseState.Success;
            }
            else if (km.type === 'Action') {
                let parseState = await km.action(this.matchedSequence, this.repeat);

                return parseState || KeyParseState.Success;
            }
        }
        printCursorPositions("After complete execution");
        return KeyParseState.Failed;
    }

    resetKeys() {
        this.operator = null;
        if (VimState.subMode === 'OPERATOR_PENDING') {
            VimState.subMode = 'NONE';
        }

        this.matchedSequence = "";
        this.moreInput = false;
        vscode.commands.executeCommand(
            'setContext', "vim-like.moreInput", this.moreInput
        );
        this.textInput = undefined;
        this.nextInputType = undefined;

        this.resetStatusBar();

        VimState.register.reset();
        MotionHandler.currentSeq = "";
        TextObjects.currentSeq = "";
        OperatorHandler.reset();

        this.repeat = 0;
        MotionHandler.repeat = 0;
        OperatorHandler.repeat = 0;
        TextObjects.repeat = 0;
    }

    // If key sequence isn't matched or timeout occurs, 
    // delegate sequence to be typed by vscode.
    flushSequence() {
        this.moreInput = false;
        vscode.commands.executeCommand(
            'setContext', "vim-like.moreInput", this.moreInput
        );
        if (this.currentSequence.length) {
            vscode.commands.executeCommand('default:type', { text: this.currentSequence.join('') });
            this.currentSequence = [];
        }
    }

    clearSequence() {
        this.moreInput = false;
        vscode.commands.executeCommand(
            'setContext', "vim-like.moreInput", this.moreInput
        );
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

    // backspace handling when taking more input.
    textInputBackspace() {
        if (this.textInput?.on) {
            if (this.textInput.input.length === 0) {
                this.resetKeys();
                return;
            }
            this.textInput.input = this.textInput.input.slice(0, -1);

            let inputText = this.statusBar.contents.filter(c => c.type === 'inputText');
            assert.equal(inputText.length, 1);
            inputText[0].text = this.textInput.input;
            this.renderStatusBar();
        }
    }

    updateStatusBarContent(
        type: StatusBarContentType,
        km?: Keymap, keyIdx: number = 0,
        text: string = ""
    ) {
        let showLongDesc = vscode.workspace.getConfiguration("vim-like")
            .get('longStatusBarText') as boolean;

        if (!km) {
            if (type === 'inputText') {
                let inputText = this.statusBar.contents.filter(c => c.type === 'inputText');
                if (inputText.length) {
                    inputText[0].text = this.textInput!.input;
                } else {
                    this.statusBar.contents.push({
                        type: 'inputText',
                        text: this.textInput!.input
                    });
                }
            } else if (type === 'other') {
                this.statusBar.contents.push({
                    type: 'other',
                    text: this.matchedSequence.at(-1) || "!",
                });
            } else if (type === 'op') {
                let opText = this.statusBar.contents.filter(c => c.type === 'op');
                if (opText.length) {
                    assert.equal(opText.length, 1);
                    opText[0].text = text;
                }
            }
            return;
        }

        if (type === 'op') {
            let opText = this.statusBar.contents.filter(c => c.type === 'op');
            if (opText.length) {
                assert.equal(opText.length, 1);
                opText[0].text += showLongDesc && km.longDesc ?
                    km.longDesc[keyIdx].replace('{}', this.matchedSequence[keyIdx]) :
                    km.key[keyIdx].replace('{}', this.matchedSequence[keyIdx]);
                return;
            }
        }
        this.statusBar.contents.push({
            type,
            text: showLongDesc && km.longDesc ?
                km.longDesc[keyIdx].replace('{}', this.matchedSequence[keyIdx]) :
                km.key[keyIdx].replace('{}', this.matchedSequence[keyIdx])
        });
    }

    renderStatusBar() {
        this.statusBar.item.text = this.statusBar.contents.map(c => c.text).join("");
        this.statusBar.item.show();
    }

    resetStatusBar() {
        this.statusBar.contents = [];
        this.statusBar.item.text = "";
        this.statusBar.item.hide();
    }
}
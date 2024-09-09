import * as vscode from 'vscode';
import { executeMotion, Motion, MotionHandler } from "./motionHandler";
import { VimState } from './vimState';
import { Keymap, KeyParseState, OperatorKeymap } from './keyHandler';
import { Logger, printCursorPositions } from './util';
import { execTextObject, TextObject, TextObjects } from './textObjectHandler';
import { Surround, Delete, Change, Yank } from './operators';

export interface Operator {
    exec: (
        OH: OperatorHandler, args: {
            ranges?: vscode.Range[],
            preArgs?: string, postArg?: string, km?: Keymap
        }
    ) => Promise<KeyParseState>;

    reset?: () => void;
}

type OperatorArgs = {
    motion?: Motion, motionArgs?: any[],
    textObject?: TextObject, textObjectArgs?: any[],
    preArgs?: string, postArg?: string,
    km?: Keymap, postArgKm?: Keymap
};

export class OperatorHandler {
    editor!: vscode.TextEditor;
    curOpKeymap: OperatorKeymap | undefined;
    matchedSeq: string | undefined;
    repeat: number = 0;

    async execute(op: Operator, args?: OperatorArgs): Promise<KeyParseState> {
        let editor = vscode.window.activeTextEditor;
        if (!editor) {
            return KeyParseState.Failed;
        } else {
            this.editor = editor;
            MotionHandler.editor = editor;
        }
        if (args?.km?.type === 'Operator') {
            this.curOpKeymap = args?.km;
        }
        TextObjects.editor = editor;

        let result: KeyParseState;
        if (args?.motion && !(this.curOpKeymap)?.handlePostArgs) {
            // Operator is executed in normal mode with provided motion as range
            executeMotion(args.motion, false, ...(args.motionArgs || []));

            result = await op.exec(this, {
                preArgs: args.preArgs, postArg: args.postArg
            });
            VimState.syncVimCursor();
        }
        else if (args?.textObject && !(this.curOpKeymap)?.handlePostArgs) {
            // Operator is executed in normal mode with provided textObject as range
            let txtObj = execTextObject(
                args.textObject, false, ...(args.textObjectArgs || [])
            );
            // If any text Object on any cursor is undefined, end Operation.
            if (txtObj.some(t => !t)) { return KeyParseState.Failed; }

            result = await op.exec(this, {
                preArgs: args.preArgs, postArg: args.postArg
            });
            VimState.syncVimCursor();
        }
        else {
            /**
             * Operator is executed in visual mode with selection as range
             * or handles motion/text-object and other args itself.
             */
            result = await op.exec(this, {
                preArgs: args?.preArgs, postArg: args?.postArg, km: args?.postArgKm
            });
            printCursorPositions("OPERATOR executed!");
        }

        if (result !== KeyParseState.MoreInput) {
            if (op.reset) {
                op.reset();
            }
            this.reset();
        }
        return result;
    }

    reset() {
        this.curOpKeymap = undefined;
        this.matchedSeq = "";
        this.repeat = 0;
    }
}

export default new OperatorHandler();

export const operatorKeyMap: Keymap[] = [
    {
        key: ['d'],
        type: 'Operator',
        action: Delete,
        longDesc: ['(d)elete '],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE']
    },
    {
        key: ['c'],
        type: 'Operator',
        action: Change,
        longDesc: ['(c)hange '],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE']
    },
    {
        key: ['y'],
        type: 'Operator',
        action: Yank,
        longDesc: ['(y)ank '],
        mode: ['NORMAL', 'VISUAL', 'VISUAL_LINE']
    },
    {
        key: ['s'],
        type: 'Operator',
        action: Surround,
        longDesc: ['(s)urround'],
        mode: ['OP_PENDING_MODE'],
        handlePostArgs: true,
    },
];
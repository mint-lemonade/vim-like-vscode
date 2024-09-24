import * as vscode from 'vscode';
import { sleep } from '../util';
import * as BlackBox from './framework/blackbox';

suite('{n} d{d} {motion}', () => {
    setup(() => {
        sleep(100);
        const ext = vscode.extensions.getExtension('TauCeti.vim-like');
        ext?.exports.VimState.setMode('NORMAL');
        sleep(100);
    });
    let testCases: BlackBox.TestCase[] = [
        {
            from: "if (args?.motion && !(Operators.curOpKeymap)?.handlePostArgs) {\n // Operator is executed in normal mode with provided motion as range\n executeMotion(args.motion, false, ...(args.motionArgs || ));\n result = await op[](ranges, args.preArgs, args.postArg);\n VimState.syncVimCursor();\n } else if (args?.textObject && !(Operators.curOpKeymap)?.handlePostArgs) {",
            inputs: "d d",
            to: "if (args?.motion && !(Operators.curOpKeymap)?.handlePostArgs) {\n // Operator is executed in normal mode with provided motion as range\n executeMotion(args.motion, false, ...(args.motionArgs || ));\n[] VimState.syncVimCursor();\n } else if (args?.textObject && !(Operators.curOpKeymap)?.handlePostArgs) {"
        },
        {
            from: "if (args?.motion && !(Operators.curOpKeymap)?.handlePostArgs) {\n // Operator is executed in normal mode with provided motion as range\n executeMotion(args.motion, false, ...(args.motionArgs || ));\n result = await op[](ranges, args.preArgs, args.postArg);\n VimState.syncVimCursor();\n } else if (args?.textObject && !(Operators.curOpKeymap)?.handlePostArgs) {",
            inputs: "2 d d",
            to: "if (args?.motion && !(Operators.curOpKeymap)?.handlePostArgs) {\n // Operator is executed in normal mode with provided motion as range\n executeMotion(args.motion, false, ...(args.motionArgs || ));\n[] } else if (args?.textObject && !(Operators.curOpKeymap)?.handlePostArgs) {",
            // skip: true
        },
        {
            from: "if (args?.mo[]tion && !(Operators.curOpKeymap)?.handlePostArgs) {\n // Operator is executed in normal mode with provided motion as range\n executeMotion(args.motion, false, ...(args.motionArgs || ));\n result = []await op(ranges, args.preArgs, args.postArg);\n VimState.syncVimCursor();\n } else if (args?.textObject && !(Operators.curOpKeymap)?.handlePostArgs) {",
            inputs: "d e",
            to: "if (args?.mo[] && !(Operators.curOpKeymap)?.handlePostArgs) {\n // Operator is executed in normal mode with provided motion as range\n executeMotion(args.motion, false, ...(args.motionArgs || ));\n result = [] op(ranges, args.preArgs, args.postArg);\n VimState.syncVimCursor();\n } else if (args?.textObject && !(Operators.curOpKeymap)?.handlePostArgs) {"
        },
        {
            from: "if (args?.mo[]tion && !(Operators.curOpKeymap)?.handlePostArgs) {\n // Operator is executed in normal mode with provided motion as range\n executeMotion(args.motion, false, ...(args.motionArgs || ));\n result = aw[]ait op(ranges, args.preArgs, args.postArg);\n VimState.syncVimCursor();\n } else if (args?.textObject && !(Operators.curOpKeymap)?.handlePostArgs) {",
            inputs: "d i w",
            to: "if (args?.[] && !(Operators.curOpKeymap)?.handlePostArgs) {\n // Operator is executed in normal mode with provided motion as range\n executeMotion(args.motion, false, ...(args.motionArgs || ));\n result = [] op(ranges, args.preArgs, args.postArg);\n VimState.syncVimCursor();\n } else if (args?.textObject && !(Operators.curOpKeymap)?.handlePostArgs) {"
        },
        {
            from: "if (args?.motion && !(Operators.[]curOpKeymap)?.handlePostArgs) {\n // Operator is executed []in normal mode with provided motion as range\n executeMotion(args.motion, false, ...(args.motionArgs || ));\n result = await op(ranges, args.preArgs, args.postArg);\n VimState.syncVimCursor();\n } else if (args?.textObject && !(Operators.curOpKeymap)?.handlePostArgs) {",
            inputs: "d i (",
            to: "if (args?.motion && !([])?.handlePostArgs) {\n // Operator is executed in normal mode with provided motion as range\n executeMotion([]);\n result = await op(ranges, args.preArgs, args.postArg);\n VimState.syncVimCursor();\n } else if (args?.textObject && !(Operators.curOpKeymap)?.handlePostArgs) {"
        },
        {
            from: "if (args?.motion && !(Operators.curOpKeymap)?.handlePostArgs) {\n // Operator is executed in normal mode with provided motion as range\n executeMotion(args.motion, false, ...(args.motionArgs || ));\n result = await op(ranges, args.preArgs, args.postArg);\n VimState.syncVimCursor();\n } else if (args?.textObject && !(Operators.curOpKeymap)?.handlePostArgs) []{",
            inputs: "d i (",
            to: "if (args?.motion && !(Operators.curOpKeymap)?.handlePostArgs) {\n // Operator is executed in normal mode with provided motion as range\n executeMotion(args.motion, false, ...(args.motionArgs || ));\n result = await op(ranges, args.preArgs, args.postArg);\n VimState.syncVimCursor();\n } else if (args?.textObject && !(Operators.curOpKeymap)?.handlePostArgs) []{"
        },
        {
            from: "This is a []sentence. And this is too.",
            inputs: "d i w",
            to: "This is a []. And this is too.",
            // skip: true,
        },
        {
            from: "This is a []sentence. And this is too.\n This is newline.",
            inputs: "d 3 w",
            to: "This is a []this is too.\n This is newline.",
            // skip: true,
        },
        {
            from: "This is a []sentence. And this is too.\n []This is newline.",
            inputs: "d 3 w",
            to: "This is a []this is too.\n [].",
            // skip: true,
        }

    ];
    for (let i = 0; i < testCases.length; i++) {
        BlackBox.run(testCases[i]);
    }
});
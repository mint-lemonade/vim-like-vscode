import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { MotionHandler } from '../motion';
import { VimState } from '../mode';
// import * as myExtension from '../../extension';

interface Equality<T> {
    isEqual: (other: T) => boolean
}
function assertEqual<T extends Equality<T>>(a: T, b: T, replaceMssg?: string, extraInfo: string = ""): void {
    if (!a.isEqual(b)) {
        // Customize the error message
        const errorMessage = replaceMssg || `[context: ${extraInfo}] Expected objects to be equal:\nA: ${JSON.stringify(a, null, 2)}\nB: ${JSON.stringify(b, null, 2)}`;
        assert.fail(errorMessage);
    }
}

suite('Motion Testing', async () => {
    // vscode.window.showInformationMessage('Start all tests.');
    let editor: vscode.TextEditor;
    suiteSetup(async () => {

        let uri = vscode.Uri.parse('/home/urs/edu/vscode_extension/helloworld/src/test/sample.text');
        let doc = await vscode.workspace.openTextDocument(uri);
        editor = await vscode.window.showTextDocument(doc);

        let start = new vscode.Position(0, 0);
        editor.selection = new vscode.Selection(start, start);

        VimState.init();
        VimState.setMode('NORMAL');
        MotionHandler.editor = editor;
    });

    suiteTeardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('w: Jump to next word start', () => {
        // testData = [ [startPostion, expectedMoveToPosition] ]
        let testData: [vscode.Position, vscode.Position][] = [
            [new vscode.Position(0, 0), new vscode.Position(0, 5)],
            [new vscode.Position(1, 31), new vscode.Position(1, 33)],
            [new vscode.Position(2, 7), new vscode.Position(2, 8)],
            [new vscode.Position(2, 8), new vscode.Position(2, 16)],
            [new vscode.Position(2, 16), new vscode.Position(2, 21)],
            [new vscode.Position(2, 21), new vscode.Position(2, 29)],
            [new vscode.Position(0, 64), new vscode.Position(0, 66)],
            // these jumps to next line.
            [new vscode.Position(0, 66), new vscode.Position(1, 0)],
            [new vscode.Position(3, 39), new vscode.Position(4, 0)],
            [new vscode.Position(5, 29), new vscode.Position(6, 0)],

        ];
        for (let [i, data] of testData.entries()) {
            let startPosition = data[0];
            MotionHandler.editor.selection = new vscode.Selection(startPosition, startPosition);
            VimState.vimCursor.active = startPosition;

            let expectedPosition = data[1];
            let result = MotionHandler.findWordBoundry('next-start', 'word')?.position;
            if (!result) { throw Error("Undefined position"); }

            assertEqual(expectedPosition, result, undefined, `test data entry: ${i}`);
        }
    });


    test('W: Jump to next WORD start', () => {
        // testData = [ [startPostion, expectedMoveToPosition] ]
        let testData: [vscode.Position, vscode.Position][] = [
            [new vscode.Position(0, 0), new vscode.Position(0, 5)],
            [new vscode.Position(1, 31), new vscode.Position(1, 42)],
            [new vscode.Position(2, 7), new vscode.Position(2, 8)],
            [new vscode.Position(2, 8), new vscode.Position(2, 21)],
            [new vscode.Position(2, 16), new vscode.Position(2, 21)],
            [new vscode.Position(2, 21), new vscode.Position(2, 29)],
            // these jumps to next line.
            [new vscode.Position(0, 64), new vscode.Position(1, 0)],
            [new vscode.Position(3, 42), new vscode.Position(4, 0)],

        ];
        for (let [i, data] of testData.entries()) {
            let startPosition = data[0];
            MotionHandler.editor.selection = new vscode.Selection(startPosition, startPosition);
            VimState.vimCursor.active = startPosition;

            let expectedPosition = data[1];
            let result = MotionHandler.findWordBoundry('next-start', 'WORD')?.position;
            if (!result) { throw Error("Undefined position"); }

            assertEqual(expectedPosition, result, undefined, `test data entry: ${i}`);
        }
    });

    test('e: Jump to word end', () => {
        // testData = [ [startPostion, expectedMoveToPosition] ]
        let testData: [vscode.Position, vscode.Position][] = [
            [new vscode.Position(0, 0), new vscode.Position(0, 3)],
            [new vscode.Position(1, 31), new vscode.Position(1, 32)],
            [new vscode.Position(2, 7), new vscode.Position(2, 15)],
            [new vscode.Position(2, 8), new vscode.Position(2, 15)],
            [new vscode.Position(2, 15), new vscode.Position(2, 19)],
            [new vscode.Position(2, 19), new vscode.Position(2, 27)],
            [new vscode.Position(0, 65), new vscode.Position(0, 66)],
            [new vscode.Position(3, 42), new vscode.Position(3, 44)],
            // these jumps to next line.
            [new vscode.Position(0, 66), new vscode.Position(1, 4)],
            [new vscode.Position(3, 44), new vscode.Position(4, 2)],
            [new vscode.Position(5, 31), new vscode.Position(6, 2)],

        ];
        for (let [i, data] of testData.entries()) {
            let startPosition = data[0];
            MotionHandler.editor.selection = new vscode.Selection(startPosition, startPosition);
            VimState.vimCursor.active = startPosition;

            let expectedPosition = data[1];
            let result = MotionHandler.findWordBoundry('next-end', 'word')?.position;
            if (!result) { throw Error("Undefined position"); }

            assertEqual(expectedPosition, result, undefined, `test data entry: ${i}`);
        }
    });


    test('E: Jump to WORD end', () => {
        // testData = [ [startPostion, expectedMoveToPosition] ]
        let testData: [vscode.Position, vscode.Position][] = [
            [new vscode.Position(0, 0), new vscode.Position(0, 3)],
            [new vscode.Position(1, 31), new vscode.Position(1, 40)],
            [new vscode.Position(2, 7), new vscode.Position(2, 19)],
            [new vscode.Position(2, 8), new vscode.Position(2, 19)],
            [new vscode.Position(2, 15), new vscode.Position(2, 19)],
            [new vscode.Position(2, 19), new vscode.Position(2, 27)],
            [new vscode.Position(2, 21), new vscode.Position(2, 27)],

        ];
        for (let [i, data] of testData.entries()) {
            let startPosition = data[0];
            MotionHandler.editor.selection = new vscode.Selection(startPosition, startPosition);
            VimState.vimCursor.active = startPosition;

            let expectedPosition = data[1];
            let result = MotionHandler.findWordBoundry('next-end', 'WORD')?.position;
            if (!result) { throw Error("Undefined position"); }

            assertEqual(expectedPosition, result, undefined, `test data entry: ${i}`);
        }
    });

    test('b: Jump to prev word start', () => {
        // testData = [ [startPostion, expectedMoveToPosition] ]
        let testData: [vscode.Position, vscode.Position][] = [
            [new vscode.Position(0, 0), new vscode.Position(0, 0)],
            [new vscode.Position(0, 5), new vscode.Position(0, 0)],
            [new vscode.Position(1, 38), new vscode.Position(1, 36)],
            [new vscode.Position(1, 41), new vscode.Position(1, 40)],
            [new vscode.Position(1, 40), new vscode.Position(1, 36)],
            [new vscode.Position(2, 9), new vscode.Position(2, 8)],
            [new vscode.Position(2, 20), new vscode.Position(2, 16)],
            [new vscode.Position(2, 16), new vscode.Position(2, 8)],
            [new vscode.Position(2, 28), new vscode.Position(2, 21)],
            // these skip to prev line.
            [new vscode.Position(7, 8), new vscode.Position(6, 15)],
            [new vscode.Position(6, 0), new vscode.Position(5, 29)],

        ];
        for (let [i, data] of testData.entries()) {
            let startPosition = data[0];
            MotionHandler.editor.selection = new vscode.Selection(startPosition, startPosition);
            VimState.vimCursor.active = startPosition;

            let expectedPosition = data[1];
            let result = MotionHandler.findWordBoundry('prev-start', 'word')?.position;
            if (!result) { throw Error("Undefined position"); }

            assertEqual(expectedPosition, result, undefined, `test data entry: ${i}`);
        }
    });


    test('B: Jump to prev WORD start', () => {
        // testData = [ [startPostion, expectedMoveToPosition] ]
        let testData: [vscode.Position, vscode.Position][] = [
            [new vscode.Position(0, 0), new vscode.Position(0, 0)],
            [new vscode.Position(0, 5), new vscode.Position(0, 0)],
            [new vscode.Position(1, 38), new vscode.Position(1, 31)],
            [new vscode.Position(1, 41), new vscode.Position(1, 31)],
            [new vscode.Position(2, 9), new vscode.Position(2, 8)],
            [new vscode.Position(2, 20), new vscode.Position(2, 8)],
            [new vscode.Position(2, 16), new vscode.Position(2, 8)],
            [new vscode.Position(2, 28), new vscode.Position(2, 21)],
            // these skip to prev line.
            [new vscode.Position(7, 8), new vscode.Position(6, 9)],
            [new vscode.Position(6, 0), new vscode.Position(5, 29)],
            [new vscode.Position(5, 0), new vscode.Position(4, 20)],
        ];
        for (let [i, data] of testData.entries()) {
            let startPosition = data[0];
            MotionHandler.editor.selection = new vscode.Selection(startPosition, startPosition);
            VimState.vimCursor.active = startPosition;

            let expectedPosition = data[1];
            let result = MotionHandler.findWordBoundry('prev-start', 'WORD')?.position;
            if (!result) { throw Error("Undefined position"); }

            assertEqual(expectedPosition, result, undefined, `test data entry: ${i}`);
        }
    });

    // test('Word jumps to next line', () => {
    //     // testData = [ [startPostion, expectedMoveToPosition] ]
    //     let testData: [vscode.Position, vscode.Position][] = [
    //         [new vscode.Position(0, 0), new vscode.Position(0, 0)],
    //         [new vscode.Position(0, 5), new vscode.Position(0, 0)],
    //         [new vscode.Position(1, 38), new vscode.Position(1, 31)],
    //         [new vscode.Position(1, 41), new vscode.Position(1, 31)],
    //         [new vscode.Position(2, 9), new vscode.Position(2, 8)],
    //         [new vscode.Position(2, 20), new vscode.Position(2, 8)],
    //         [new vscode.Position(2, 16), new vscode.Position(2, 8)],
    //         [new vscode.Position(2, 28), new vscode.Position(2, 21)],
    //     ];
    //     for (let [i, data] of testData.entries()) {
    //         let startPosition = data[0];
    //         MotionHandler.editor.selection = new vscode.Selection(startPosition, startPosition);
    //         VimState.vimCursor.active = startPosition;

    //         let expectedPosition = data[1];
    //         let result = MotionHandler.findWordBoundry('prev-start', 'WORD')?.position;
    //         if (!result) { throw Error("Undefined position"); }

    //         assertEqual(expectedPosition, result, undefined, `test data entry: ${i}`);
    //     }
    // });

    // test('VISUAL mode word/WORD selection', () => {
    //     /**
    //      * testData = {
    //      *      
    //      * }
    //      */
    //     // let testData: [vscode.Position, vscode.Position][] = [
    //     //     [new vscode.Position(0, 0), new vscode.Position(0, 5)],
    //     //     [new vscode.Position(1, 31), new vscode.Position(1, 42)],
    //     //     [new vscode.Position(2, 7), new vscode.Position(2, 8)],
    //     //     [new vscode.Position(2, 8), new vscode.Position(2, 21)],
    //     //     [new vscode.Position(2, 16), new vscode.Position(2, 21)],
    //     //     [new vscode.Position(2, 21), new vscode.Position(2, 29)],

    //     // ];

    //     let testData = [
    //         {
    //             type: 'word', anchorPosition: new vscode.Position(0, 0),
    //         }
    //     ];
    //     for (let [i, data] of testData.entries()) {
    //         let startPosition = data[0];
    //         MotionHandler.editor.selection = new vscode.Selection(startPosition, startPosition);
    //         VimState.vimCursor.active = startPosition;

    //         let expectedPosition = data[1];
    //         let result = MotionHandler.findWordBoundry('next-start', 'WORD')?.position;
    //         if (!result) { throw Error("Undefined position"); }

    //         assertEqual(expectedPosition, result, undefined, `test data entry: ${i}`);
    //     }
    // });
});

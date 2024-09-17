import * as vscode from 'vscode';
import * as assert from 'assert';
import * as TestUtil from './util';
import { TextEditor, TextDocument, Selection, extensions } from 'vscode';
import { assertEqual, sleep } from '../../util';
import { test } from 'mocha';

export interface TestCase {
    language?: string;
    from: string;
    inputs: string;
    to: string;
    skip?: boolean;
}
export interface BlackBoxTestCase {
    it: string,
    before: string;
    keys: string;
    after: string;
}

const getLine = (text: string, offset: number) => {
    let count = 0;
    let position = -1;

    while (true) {
        position = text.indexOf('\n', position + 1);
        if (position < 0 || position >= offset) {
            break;
        }
        count++;
    }

    return count;
};

const getCharacter = (text: string, offset: number) => {
    const textToTheLeft = text.substring(0, offset);
    const lastLineBreakIndex = textToTheLeft.lastIndexOf('\n');

    if (lastLineBreakIndex < 0) {
        return offset;
    } else {
        return offset - (lastLineBreakIndex + 1);
    }
};

const extractInfo = (originalText: string) => {
    const selections: Selection[] = [];

    let cleanText = originalText;

    while (true) {
        let hasMatch = false;

        cleanText = cleanText.replace(
            /~?\[([\s\S]*?)\]/m,
            (match: string, content: string, startOffset: number) => {
                hasMatch = true;

                const endOffset = startOffset + match.length - 1;
                const isReversed = match[0] === '~';

                const startLine = getLine(cleanText, startOffset);
                const endLine = getLine(cleanText, endOffset);

                let startCharacter = getCharacter(cleanText, startOffset);
                let endCharacter = getCharacter(cleanText, endOffset);

                if (startLine === endLine) {
                    // Minus `[` mark.
                    endCharacter -= 1;

                    if (isReversed) {
                        // Minus `~` mark.
                        endCharacter -= 1;
                    }
                }

                selections.push(
                    isReversed
                        ? new Selection(endLine, endCharacter, startLine, startCharacter)
                        : new Selection(startLine, startCharacter, endLine, endCharacter),
                );

                return content;
            },
        );

        if (!hasMatch) {
            break;
        }
    }

    return {
        selections,
        cleanText,
    };
};

export const toJs = (s: Selection) => ({
    active: {
        line: s.active.line,
        character: s.active.character,
    },
    anchor: {
        line: s.anchor.line,
        character: s.anchor.character,
    },
});

const reusableDocuments: Map<string, TextDocument> = new Map();

export const run = (testCase: TestCase, before?: (textEditor: TextEditor) => void) => {
    const plainFrom = testCase.from.replace(/\n/g, '\\n');
    const plainTo = testCase.to.replace(/\n/g, '\\n');
    const expectation = `Inputs: ${testCase.inputs}\n> ${plainFrom}\n< ${plainTo}`;
    let tries = 0;

    const ext = extensions.getExtension('self.vim-like');
    // ext?.exports;
    console.log("is active: ", ext?.isActive);

    let skipableTest = testCase.skip ? test.skip : test;
    skipableTest(expectation, (done) => {
        tries++;

        const language = testCase.language || 'plaintext';
        const fromInfo = extractInfo(testCase.from);
        const toInfo = extractInfo(testCase.to);
        const inputs = testCase.inputs.split(' ');

        TestUtil.createTempDocument(
            fromInfo.cleanText,
            reusableDocuments.get(language),
            language,
        ).then(async (textEditor: TextEditor) => {
            reusableDocuments.set(textEditor.document.languageId, textEditor.document);

            if (before) {
                before(textEditor);
            }

            TestUtil.setSelections(fromInfo.selections);

            await sleep(50 * tries);

            for (let i = 0; i < inputs.length; i++) {
                let input = inputs[i] === '<s>' ? " " : inputs[i];
                ext?.exports.VimState.type(input);
                await sleep(20 * tries);
            }

            if (language !== 'plaintext') {
                await sleep(50 * tries);
            }

            try {
                assert.equal(TestUtil.getDocument()!.getText(), toInfo.cleanText);
                assert.deepEqual(TestUtil.getSelections().map(toJs), toInfo.selections.map(toJs));
            } catch (error) {
                done(error);
                return;
            }

            done();
        });
    });
};

export async function blackBoxTestRunner(tests: BlackBoxTestCase | BlackBoxTestCase[]) {
    if (!Array.isArray(tests)) {
        tests = [tests];
    }
    // let ext = vscode.extensions.getExtension('self.vim-like');
    // await ext?.activate();
    // sleep(500);
    const ext = extensions.getExtension('self.vim-like');

    for (let t of tests) {
        let beforeInfo = extractInfo(t.before);
        let afterInfo = extractInfo(t.after);
        let doc = await vscode.workspace.openTextDocument({ content: beforeInfo.cleanText });
        let editor = await vscode.window.showTextDocument(doc);
        editor.selections = beforeInfo.selections;
        test(`${t.keys}: ${t.it}`, async () => {
            for (let key of t.keys) {
                await ext?.exports.VimState.type(key);
                sleep(100);
            }
            for (let [i, sel] of editor.selections.entries()) {
                assertEqual(sel, afterInfo.selections[i]);
            }
        });
    }
}


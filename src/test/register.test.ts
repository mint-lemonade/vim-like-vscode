import * as vscode from 'vscode';
import { VimState } from '../vimState';
import assert from 'assert';
import { sleep } from '../util';

suite("Registers", () => {
    suiteSetup(() => {
        let ext = vscode.extensions.getExtension('TauCeti.vim-like');
        ext?.activate();
        sleep(100);
    });

    test('delete to history', () => {
        let text = [`Some text getting deleted ${Math.random()}.\n`];
        VimState.register.write(text, 'delete');
        let read = VimState.register.history[0].text;
        assert.deepStrictEqual(text, read);
    });

    test('history shifting', () => {
        let text_1 = [`This text will shift to end index ${Math.random()}\n`];
        let text_2 = [`And this text will be number 1. ${Math.random()}\n`];
        VimState.register.write(text_1, 'delete');
        VimState.register.write(text_2, 'delete');
        let read_0 = VimState.register.history[0].text;
        let read_1 = VimState.register.history[1].text;
        assert.deepStrictEqual(text_2, read_0);
        assert.deepStrictEqual(text_1, read_1);
    });

    test('delete to named reg', () => {
        let text_1 = [`This text will stay at 1st reg ${Math.random()}\n`];
        let text_2 = [`because this will be deleted to named reg. ${Math.random()}\n`];
        let toReg = 'r';
        VimState.register.write(text_1, 'delete');
        VimState.register.set(toReg);
        VimState.register.write(text_2, 'delete');
        VimState.register.reset();
        let read_1 = VimState.register.history[0].text;
        let read_named = VimState.register.registers[toReg].text;
        assert.deepStrictEqual(text_1, read_1);
        assert.notDeepStrictEqual(text_2, read_1);
        assert.deepStrictEqual(text_2, read_named);
    });

    test('yank to named reg', () => {
        let text_1 = [`This text will stay at 1st reg ${Math.random()}\n`];
        let text_2 = [`because this will be yanked to named reg. ${Math.random()}\n`];
        let toReg = 'l';
        VimState.register.write(text_1, 'delete');
        VimState.register.set(toReg);
        VimState.register.write(text_2, 'yank');
        VimState.register.reset();
        let read_1 = VimState.register.history[0].text;
        let read_named = VimState.register.registers[toReg].text;
        assert.deepStrictEqual(text_1, read_1);
        assert.notDeepStrictEqual(text_2, read_1);
        assert.deepStrictEqual(text_2, read_named);
    });

    test('do not delete to history', () => {
        let text_1 = [`This text will stay at 1st reg ${Math.random()}\n`];
        let text_2 = [`because this deleted text is less than a line. ${Math.random()}`];
        VimState.register.write(text_1, 'delete');
        VimState.register.write(text_2, 'delete');
        let read_1 = VimState.register.history[0].text;
        assert.deepStrictEqual(text_1, read_1);
        assert.notDeepStrictEqual(text_2, read_1);
    });

    test('do not delete to defualt or yank register', () => {
        let text_1 = [`This deleted text wont be at default/yank reg ${Math.random()}\n`];
        let text_2 = [`this line will be yanked. ${Math.random()}`];
        VimState.register.write(text_1, 'delete');
        VimState.register.write(text_2, 'yank');
        let read_1 = VimState.register.history[0].text;
        let read_2 = VimState.register.registers['"'].text;
        let read_3 = VimState.register.registers['0'].text;
        assert.deepStrictEqual(text_2, read_1);
        assert.deepStrictEqual(text_2, read_2);
        assert.deepStrictEqual(text_2, read_3);
        assert.notDeepStrictEqual(text_1, read_2);
    });

    test('read', () => {
        let text_1 = [`First text deleted ${Math.random()}\n`];
        let text_2 = [`Second text deleted. ${Math.random()}\n`];
        let text_3 = [`Third text yanked. ${Math.random()}`];
        let text_4 = [`Fourth text yanked to named reg. ${Math.random()}\n`];
        let text_5 = [`Fifth text deleted to named reg. ${Math.random()}\n`];

        let name_reg_1 = 'f';
        let name_reg_2 = 'g';

        VimState.register.write(text_1, 'delete');
        VimState.register.write(text_2, 'delete');
        VimState.register.write(text_3, 'yank');

        VimState.register.set(name_reg_1);
        VimState.register.write(text_4, 'yank');
        VimState.register.reset();

        VimState.register.set(name_reg_2);
        VimState.register.write(text_5, 'yank');
        VimState.register.reset();

        VimState.register.set("3");
        let read_3 = VimState.register.read().text;
        VimState.register.reset();
        assert.deepStrictEqual(text_1, read_3);

        VimState.register.set("2");
        let read_2 = VimState.register.read().text;
        VimState.register.reset();
        assert.deepStrictEqual(text_2, read_2);

        VimState.register.set("1");
        let read_1 = VimState.register.read().text;
        VimState.register.reset();
        assert.deepStrictEqual(text_3, read_1);


        VimState.register.set(name_reg_1);
        let read_name_1 = VimState.register.read().text;
        VimState.register.reset();
        assert.deepStrictEqual(text_4, read_name_1);

        VimState.register.set(name_reg_2);
        let read_name_2 = VimState.register.read().text;
        VimState.register.reset();
        assert.deepStrictEqual(text_5, read_name_2);
    });
});
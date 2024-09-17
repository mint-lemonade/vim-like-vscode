import { Position } from "vscode";
import { assertEqual, stringToPos } from "../util";
import assert from "assert";

suite("Utils", () => {
    test("stringToPos", () => {
        assertEqual(stringToPos("(22,3)"), new Position(22, 3));
        assertEqual(stringToPos("(1,5)"), new Position(1, 5));
        assertEqual(stringToPos("(99,500)"), new Position(99, 500));
        assert.throws(() => stringToPos("2,4"));
        assert.throws(() => stringToPos("(2,4"));
        assert.throws(() => stringToPos("[2,4]"));
        assert.throws(() => stringToPos("(2 4)"));
    });
});
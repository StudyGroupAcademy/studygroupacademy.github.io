import test from "node:test";
import assert from "node:assert/strict";
import { closeNumber, generateMathQuestion, parseLinearExpression, shuffle } from "../question-generator.js";

test("generated questions always include a prompt, answer, hint and worked solution", () => {
  for (let i = 0; i < 500; i += 1) {
    const question = generateMathQuestion(i % 2 ? "Higher" : "Foundation", i);
    assert.equal(typeof question.prompt, "string");
    assert.ok(question.prompt.length > 10);
    assert.equal(typeof question.answer, "string");
    assert.ok(Array.isArray(question.steps) && question.steps.length >= 2);
    assert.ok(question.hint);
    assert.ok(question.marks >= 2);
    assert.ok(question.accepts.includes(question.answer) || question.linear || typeof question.numeric === "number");
  }
});

test("linear expression checker accepts reordered equivalent expressions", () => {
  const expected = parseLinearExpression("8x + 3");
  const actual = parseLinearExpression("3 + 8x");
  assert.deepEqual(actual, expected);
});

test("numeric checker accepts equivalent currency and decimal formats", () => {
  assert.equal(closeNumber("£42.00", 42), true);
  assert.equal(closeNumber("0.5", 0.5), true);
  assert.equal(closeNumber("43", 42), false);
});

test("shuffle preserves every item", () => {
  const input = [1, 2, 3, 4, 5];
  assert.deepEqual([...shuffle(input)].sort(), input);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidTripDay } = require('../tools/dot-local-pilot.cjs');

test('accepts first, last, single and middle days', () => {
  for (const [day, length] of [[1, 7], [7, 7], [1, 1], [4, 7]]) {
    assert.equal(isValidTripDay(day, length), true);
  }
});

test('rejects a day beyond the trip length', () => {
  assert.equal(isValidTripDay(8, 7), false);
});

test('rejects zero, negatives and fractions in either argument', () => {
  for (const value of [0, -1, -7, 0.5, 1.5]) {
    assert.equal(isValidTripDay(value, 7), false);
    assert.equal(isValidTripDay(1, value), false);
  }
});

test('rejects invalid types and non-finite values in either argument', () => {
  for (const value of ['1', '', null, undefined, true, false, {}, [],
    new Number(1), NaN, Infinity, -Infinity, 1n, Symbol('day'), () => 1]) {
    assert.equal(isValidTripDay(value, 7), false);
    assert.equal(isValidTripDay(1, value), false);
  }
});

test('rejects missing arguments', () => {
  assert.equal(isValidTripDay(), false);
  assert.equal(isValidTripDay(1), false);
});

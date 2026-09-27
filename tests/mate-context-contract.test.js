'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const assistant = fs.readFileSync(path.join(root, 'assets/ai-assistant.js'), 'utf8');
const edge = fs.readFileSync(path.join(root, 'supabase/functions/travel-assistant/index.ts'), 'utf8');

test('Mate trip context includes bounded budget and expense summary without sensitive fields', () => {
  assert.match(assistant, /budgetUnlimited: Boolean\(trip\.budgetUnlimited\)/);
  assert.match(assistant, /expenseSummary: summarizeExpenses\(trip\.expenses\)/);
  assert.match(assistant, /totals: Object\.keys\(totals\)\.slice\(0, 8\)/);
  assert.match(assistant, /categories: Object\.keys\(categories\).*\.slice\(0, 8\)/s);
  assert.doesNotMatch(assistant, /expenseSummary:[^\n]*(note|merchant|receipt)/i);
});

test('Mate privacy copy accurately describes expense-summary sharing boundaries', () => {
  assert.match(assistant, /סיכום הוצאות מצומצם לפי מטבע וקטגוריה/);
  assert.match(assistant, /הערות להוצאות, קבלות, מסמכים, סיסמאות, GPS ופרטי הכספת אינם נשלחים/);
});

test('travel assistant edge function sanitizes the new context and identifies as Mate', () => {
  assert.match(edge, /budgetUnlimited: Boolean\(value\.budgetUnlimited\)/);
  assert.match(edge, /expenseSummary:/);
  assert.match(edge, /totals: Array\.isArray\(value\.expenseSummary\?\.totals\).*slice\(0, 8\)/s);
  assert.match(edge, /categories: Array\.isArray\(value\.expenseSummary\?\.categories\).*slice\(0, 8\)/s);
  assert.match(edge, /You are Mate, the friendly personal AI assistant/);
  assert.doesNotMatch(edge, /You are Nevo/);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

test('Budget V2 keeps explicit limited and unlimited modes', () => {
  const source = read('assets/trip-experience.js');
  assert.match(source, /name="budgetMode" value="limited"/);
  assert.match(source, /name="budgetMode" value="unlimited"/);
  assert.match(source, /state\.budgetUnlimited = unlimited/);
  assert.match(source, /current\.budgetUnlimited = state\.budgetUnlimited/);
});

test('Budget V2 exposes a smart summary analytics layer', () => {
  const source = read('assets/trip-experience.js');
  for (const fn of ['tripBudgetTiming', 'budgetAnalytics', 'createSmartBudgetSummary', 'renderSmartBudgetSummary']) {
    assert.match(source, new RegExp('function ' + fn + '\\('));
  }
  assert.match(source, /label: 'הוצאת עד עכשיו'/);
  assert.match(source, /label: 'ממוצע ליום'/);
  assert.match(source, /label: 'הקטגוריה הגבוהה'/);
  assert.match(source, /label: timing\.status === 'active' \? 'זמין ליום מהיום' : 'זמין בממוצע ליום'/);
  assert.match(source, /בקצב הנוכחי ההוצאה המשוערת עד סוף הטיול/);
  assert.match(source, /בקצב הנוכחי צפוי להישאר בסוף הטיול/);
  assert.match(source, /בקצב הנוכחי צפויה חריגה/);
});

test('unlimited budget summary never uses limited-budget concepts in its branch', () => {
  const source = read('assets/trip-experience.js');
  const start = source.indexOf('if (unlimited) {', source.indexOf('function renderSmartBudgetSummary'));
  const end = source.indexOf('} else {', start);
  assert.ok(start >= 0 && end > start);
  const unlimitedBranch = source.slice(start, end);
  assert.doesNotMatch(unlimitedBranch, /נותר|חריגה|נוצלו .*%|dailyAvailable|usedPercent/);
  assert.match(unlimitedBranch, /הוצאת עד עכשיו/);
  assert.match(unlimitedBranch, /ממוצע ליום/);
  assert.match(unlimitedBranch, /הקטגוריה הגבוהה/);
});

test('Budget persistence delegates feature state to Trip Store', () => {
  const source = read('assets/trip-experience.js');
  assert.match(source, /var store = window\.TravelMateTripStore/);
  assert.match(source, /store\.updateTrip\(state\.trip\.id/);
  assert.match(source, /current\.expenses = expenses/);
  assert.match(source, /current\.budget = state\.trip\.budget/);
});

test('Budget V2 smart summary CSS uses the existing feature stylesheet without a patch layer', () => {
  const css = read('assets/trip-experience.css');
  assert.match(css, /Budget V2 smart summary/);
  const start = css.indexOf('/* Budget V2 smart summary');
  const block = css.slice(start);
  assert.doesNotMatch(block, /!important/);
  assert.match(block, /\.budget-smart-summary/);
  assert.match(block, /\.budget-smart-metrics/);
  assert.match(block, /@media\(max-width:430px\)/);
});

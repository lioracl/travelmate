'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'assets', 'trip-experience.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets', 'trip-experience.css'), 'utf8');

test('Budget V2 supports limited and unlimited modes explicitly', () => {
  assert.match(js, /value="limited"/);
  assert.match(js, /value="unlimited"/);
  assert.match(js, /state\.budgetUnlimited/);
  assert.match(js, /ללא הגבלה/);
});

test('Budget V2 smart summary exposes required spending signals', () => {
  assert.match(js, /data-budget-smart-summary/);
  assert.match(js, /הוצא עד עכשיו/);
  assert.match(js, /ממוצע ליום/);
  assert.match(js, /קטגוריה מובילה/);
  assert.match(js, /אפשר להוציא ליום/);
  assert.match(js, /ההוצאה המשוערת לכל הטיול/);
});

test('unlimited mode uses spending-tracking language instead of remaining-budget language', () => {
  assert.match(js, /מעקב הוצאות ללא תקרה/);
  assert.match(js, /כמה הוצאתי עד עכשיו\?/);
  assert.match(js, /state\.budgetUnlimited/);
});

test('currency converter is promoted directly below the smart budget summary', () => {
  assert.match(js, /smartSummary\.insertAdjacentElement\('afterend', card\)/);
  assert.match(js, /המרת מטבע מהירה/);
});

test('Budget persistence delegates to the canonical Trip Store', () => {
  assert.match(js, /window\.TravelMateTripStore/);
  assert.match(js, /store\.saveTrip\(state\.trip\)/);
});

test('Budget V2 summary styling stays in the feature stylesheet and uses semantic tokens', () => {
  assert.match(css, /Budget V2 smart spending summary/);
  assert.match(css, /#budget \.budget-smart-summary/);
  assert.match(css, /var\(--tm-card-bg\)/);
  assert.match(css, /var\(--tm-text-primary\)/);
  assert.doesNotMatch(css, /--tm-card-bg-main|--tm-shadow-card|--tm-control-bg|--tm-border-strong|--tm-card-bg-interactive/);
});

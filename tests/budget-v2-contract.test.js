'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
function read(relative) { return fs.readFileSync(path.join(root, relative), 'utf8'); }
const js = fs.readFileSync(path.join(root, 'assets', 'trip-experience.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets', 'trip-experience.css'), 'utf8');
const customTrip = fs.readFileSync(path.join(root, 'assets', 'custom-trip.js'), 'utf8');
const glass = fs.readFileSync(path.join(root, 'assets', 'readable-glass.css'), 'utf8');

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

test('Budget V2 exposes real overrun instead of zero remaining', () => {
  assert.match(js, /overrunEuros/);
  assert.match(js, /חריגה מהתקציב/);
  assert.match(js, /budget-overrun-active/);
  assert.match(js, /meterPercent = Math\.min\(100, Math\.max\(0, usedPercent\)\)/);
  assert.match(customTrip, /חריגה של/);
  assert.match(customTrip, /is-over-budget/);
});

test('Budget overrun styling uses semantic error tokens', () => {
  assert.match(css, /budget-overrun-card/);
  assert.match(css, /is-over-budget/);
  assert.match(css, /var\(--tm-error\)/);
  assert.match(glass, /budget-card\.is-over-budget/);
  assert.match(glass, /var\(--tm-error\)/);
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

test('Overview exposes direct lazy access to the quick currency converter', () => {
  const html = read('trip/custom/index.html');
  const redesign = read('assets/trip-redesign.js');
  assert.match(html, /data-budget-converter-open/);
  assert.match(html, />המרת מטבע</);
  assert.match(redesign, /TravelMateFeatures\.load\('budget'\)/);
  assert.match(redesign, /\[data-currency-converter\] \[data-converter-amount\]/);
});

test('zero spending is rendered as a valid converted amount once rates are ready', () => {
  assert.match(js, /function currencyConversionReady\(from, to\)/);
  assert.match(js, /summaryConversion\.textContent = currencyConversionReady\('EUR', state\.secondaryCurrency\)/);
  assert.match(js, /result\.innerHTML = currencyConversionReady\(from, to\)/);
  assert.doesNotMatch(js, /summaryConversion\.textContent = secondaryTotal \?/);
  assert.doesNotMatch(js, /result\.innerHTML = converted \?/);
});

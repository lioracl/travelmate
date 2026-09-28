const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('Light surface tokens are not legacy pale-white controls', () => {
  const css = read('assets/readable-glass.css');
  assert.match(css, /--tm-surface-control:var\(--tm-family-control\)/);
  assert.match(css, /--tm-surface-nested:var\(--tm-family-nested\)/);
  assert.doesNotMatch(css, /--tm-surface-control:rgba\(210,226,219,\.96\)/);
});

test('Weather stays neutral but is less opaque on the destination photo', () => {
  const css = read('assets/readable-glass.css');
  assert.match(css, /--tm-weather-card-bg:linear-gradient\(135deg,rgba\(217,225,223,\.42\),rgba\(201,213,210,\.34\)\)/);
  assert.match(css, /--tm-weather-card-blur:none/);
});

test('Secondary control contract excludes semantic danger actions', () => {
  const css = read('assets/readable-glass.css');
  assert.match(css, /button:not\(\.primary\):not\(\.danger\):not\(\.planner-danger\)/);
  assert.match(css, /not\(\[data-delete-saved-place\]\)/);
});
test('Saved-place primary actions use full-width mobile 2+1 layout', () => {
  const css = read('assets/auto-planner.css');
  const app = read('assets/app.js');
  assert.match(css, /@media\(max-width:650px\)\{[\s\S]*?saved-place-links\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /saved-place-links \.saved-calendar-link\{grid-column:1\/-1\}/);
  assert.match(app, /<\/div><div class="nearby-links saved-place-links">/);
});

test('Budget rate dates are localized and unlimited mode avoids duplicate amount headline', () => {
  const js = read('assets/trip-experience.js');
  assert.match(js, /function formatRateDate\(value\)/);
  assert.match(js, /Intl\.DateTimeFormat\('he-IL'/);
  assert.match(js, /<b>ללא הגבלה<\/b> · מעקב הוצאות פעיל/);
});

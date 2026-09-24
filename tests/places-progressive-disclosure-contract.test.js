'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('Places keeps the default search surface compact', () => {
  const nearby = read('assets/nearby.js');
  const css = read('assets/nearby.css');
  assert.match(nearby, /quickKeys=\['attractions','restaurants','hotels','supermarkets'\]/);
  assert.match(css, /nearby-category-search\{display:none\}/);
  assert.match(css, /nearby-controls>label:has\(\[data-nearby-category\]\),\.place-planner \.nearby-controls>button\{display:none\}/);
});

test('Places result cards disclose schedule and secondary links on demand', () => {
  const app = read('assets/app.js');
  assert.match(app, /scheduleFields\.hidden=true/);
  assert.match(app, /secondaryActions\.hidden=true/);
  assert.match(app, /הוספה לתוכנית/);
  assert.match(app, /עוד פרטים/);
  assert.match(app, /שמירה למקומות/);
  assert.match(app, /aria-expanded/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('mobile Places keeps hotel planning available behind an accessible compact toggle', () => {
  const app = read('assets/app.js');
  const css = read('assets/place-planner.css');
  assert.match(app, /data-hotel-fix-toggle/);
  assert.match(app, /aria-expanded="true"/);
  assert.match(app, /setHotelCollapsed\(Boolean\(window\.matchMedia/);
  assert.match(app, /hotelToggle\.addEventListener\('click'/);
  assert.match(css, /\.hotel-fix-toggle\{display:none/);
  assert.match(css, /@media\(max-width:650px\)[\s\S]*\.hotel-fix-toggle\{display:inline-flex\}/);
  assert.match(css, /\.hotel-fix-form\.is-collapsed \.hotel-fix-fields/);
});

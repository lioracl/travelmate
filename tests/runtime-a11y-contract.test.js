const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Navo AI badge owns both color and WebKit text fill for contrast', () => {
  const css = read('assets/readable-glass.css');
  assert.match(css, /\.ai-orb-badge\{[\s\S]*?color:var\(--tm-control-text\);[\s\S]*?-webkit-text-fill-color:var\(--tm-control-text\)/);
});

test('hotel address autocomplete uses a valid single autofill field token', () => {
  const source = read('assets/lodging-manager.js');
  assert.doesNotMatch(source, /autocomplete="organization street-address"/);
  assert.match(source, /name="hotel"[^>]*autocomplete="street-address"/);
});

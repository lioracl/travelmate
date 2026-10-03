const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('phone visual QA patch is loaded after existing surface CSS', () => {
  assert.match(read('index.html'), /home-organizer\.css[^\n]+\n\s*<link[^>]+phone-visual-qa\.css/);
  assert.match(read('trip/custom/index.html'), /readable-glass\.css[^\n]+\n\s*<link[^>]+phone-visual-qa\.css/);
});

test('visual QA patch owns the four phone regressions', () => {
  const css = read('assets/phone-visual-qa.css');
  assert.match(css, /#modal-destination\.modal-backdrop/);
  assert.match(css, /\.content>\.weather-top-widget[\s\S]*backdrop-filter:none/);
  assert.match(css, /#modal-weather-live \.weather-live-modal>header[\s\S]*display:flex/);
  assert.match(css, /#modal-weather-live \.modal-close[\s\S]*position:static/);
  assert.match(css, /button,a\[href\],\[role="button"\][\s\S]*inline-grid/);
});

test('phone overlay shells stay genuinely translucent and flatten nested light layers', () => {
  const css = read('assets/phone-visual-qa.css');
  assert.match(css, /#modal-destination \.destination-modal[\s\S]*rgba\(224,238,242,\.54\)/);
  assert.match(css, /#modal-destination \.destination-modal :is\(input,select\)[\s\S]*rgba\(238,246,248,\.52\)/);
  assert.match(css, /#modal-weather-live \.weather-live-modal[\s\S]*rgba\(218,234,239,\.54\)/);
  assert.match(css, /#modal-weather-live :is\(\.weather-insight,\.weather-live-grid,\.weather-live-day\)[\s\S]*background:transparent/);
  assert.match(css, /#modal-weather-live \.weather-live-day\.today[\s\S]*rgba\(169,220,231,\.10\)/);
});

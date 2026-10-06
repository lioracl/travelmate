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

test('phone overlays obscure the live page while keeping nested rows flat', () => {
  const css = read('assets/phone-visual-qa.css');
  assert.match(css, /#modal-destination\.modal-backdrop[\s\S]*blur\(16px\)/);
  assert.match(css, /#modal-destination \.destination-modal[\s\S]*rgba\(234,243,245,\.94\)/);
  assert.match(css, /#modal-weather-live\.modal-backdrop[\s\S]*blur\(18px\)/);
  assert.match(css, /#modal-weather-live \.weather-live-modal[\s\S]*rgba\(232,241,243,\.94\)/);
  assert.match(css, /#modal-weather-live :is\(\.weather-insight,\.weather-live-grid,\.weather-live-day\)[\s\S]*background:transparent/);
});

test('phone close targets are at least 48px and weather summary stays fully transparent', () => {
  const css = read('assets/phone-visual-qa.css');
  assert.match(css, /Phone acceptance 2\.20\.1/);
  assert.match(css, /\.content>\.weather-top-widget\{[\s\S]*?background:transparent;[\s\S]*?backdrop-filter:none;/);
  assert.doesNotMatch(css.slice(css.indexOf('Phone acceptance 2.20.1')), /!important/);
  assert.match(css, /data-directions-close[\s\S]*?inline-size:48px;[\s\S]*?block-size:48px/);
  assert.match(css, />i\{[\s\S]*?pointer-events:none/);
});

test('directions phone sheet keeps header and footer outside its scrollable body', () => {
  const css = read('assets/place-directions.css');
  assert.match(css, /@media\(max-width:640px\)[\s\S]*?grid-template-rows:auto minmax\(0,1fr\) auto/);
  assert.match(css, /\.place-directions-body\{min-height:0;overflow-y:auto;overscroll-behavior:contain\}/);
  assert.match(css, /\.place-directions-dialog>footer\{position:relative;bottom:auto;[\s\S]*?safe-area-inset-bottom/);
});

test('light mobile account panel uses app material instead of the photographic dark split', () => {
  const css = read('assets/phone-visual-qa.css');
  assert.match(css, /cloud-account-backdrop \.cloud-account-split[\s\S]*background:#e8f1ef/);
  assert.match(css, /cloud-account-split:before\{display:none\}/);
  assert.match(css, /cloud-account-split \.cloud-account-close[\s\S]*rgba\(255,255,255,\.78\)/);
  assert.match(css, /\[data-cloud-sync-now\][\s\S]*var\(--tm-auth-action\)/);
});

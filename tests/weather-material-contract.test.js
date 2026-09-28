'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const css = fs.readFileSync(path.join(__dirname,'../assets/weather-widget.css'),'utf8');
const block = css.slice(css.indexOf('/* Weather live-modal contrast ownership'));

test('forecast modal pairs theme-aware neutral surfaces and foreground without optical blur',()=>{
  assert.match(block,/--tm-overlay-surface:linear-gradient\(155deg,[\s\S]*?var\(--tm-surface-neutral\)/);
  assert.match(block,/--tm-overlay-text:var\(--tm-text-primary\)/);
  assert.match(block,/--tm-overlay-muted:var\(--tm-text-secondary\)/);
  assert.match(block,/--tm-overlay-blur:none/);
  assert.match(block,/\.weather-live-modal>header\{[^}]*backdrop-filter:none/);
  assert.doesNotMatch(block,/rgba\(5,31,24|blur\(26px\)|color:#fff/);
});

test('forecast badge, rows and metrics use the same contextual material contract',()=>{
  assert.match(block,/\.weather-live-header-copy>span\{[^}]*background:var\(--tm-overlay-nested\)/);
  assert.match(block,/\.weather-live-day\{[^}]*background:transparent[^}]*color:var\(--tm-overlay-text\)/);
  assert.match(block,/\.weather-live-metrics b\{[^}]*color:var\(--tm-overlay-text\)/);
  assert.match(block,/\.weather-live-day\.today\{[^}]*var\(--tm-surface-selected\)/);
});

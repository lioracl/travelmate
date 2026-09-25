'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');

test('custom trip has one semantic surface authority',()=>{
  const css=read('assets/readable-glass.css');
  assert.match(css,/Surface Authority 2\.0/);
  assert.match(css,/--tm-surface-glass:/);
  assert.match(css,/--tm-surface-nested:/);
  assert.match(css,/--tm-surface-control:/);
  assert.match(css,/--tm-surface-photo:/);
  assert.match(css,/--tm-surface-text:/);
  assert.match(css,/--tm-surface-photo-text:/);
  assert.doesNotMatch(css,/Photo-background restore: cards float over the destination image/);
  assert.doesNotMatch(css,/Theme system 2026: semantic accent surfaces/);
  assert.doesNotMatch(css,/Phone glass must remain legible over detailed destination photography/);
});

test('glass uses blur instead of opacity escalation',()=>{
  const css=read('assets/readable-glass.css');
  assert.match(css,/--tm-surface-blur:blur\(14px\) saturate\(112%\)/);
  assert.match(css,/--tm-surface-blur-nested:blur\(10px\) saturate\(108%\)/);
  assert.match(css,/--tm-surface-blur-photo:blur\(12px\) saturate\(108%\)/);
  assert.doesNotMatch(css,/--tm-weather-card-blur:blur\(4px\)/);
});

test('weather is the dedicated photo glass material',()=>{
  const css=read('assets/readable-glass.css');
  assert.match(css,/--tm-weather-card-bg:var\(--tm-surface-photo\)/);
  assert.match(css,/--tm-weather-card-text:var\(--tm-surface-photo-text\)/);
  assert.match(css,/--tm-weather-card-blur:var\(--tm-surface-blur-photo\)/);
  assert.match(css,/\.weather-top-widget[\s\S]*background:var\(--tm-surface-photo\)/);
});

test('overview and places no longer own card material tokens',()=>{
  const css=read('assets/readable-glass.css');
  const overview=css.match(/html body\[data-trip-kind="custom"\]\.tm-new-design\[data-trip-view="overview"\]\{([\s\S]*?)\n\}/);
  const places=css.match(/html body\[data-trip-kind="custom"\]\.tm-new-design\[data-trip-view="places"\]\{([\s\S]*?)\n\}/);
  assert.ok(overview,'overview contract exists');
  assert.ok(places,'places contract exists');
  assert.doesNotMatch(overview[1],/--tm-card-|--tm-weather-card-|--tm-readable-|--tm-glass-large-bg/);
  assert.doesNotMatch(places[1],/--tm-card-|--tm-weather-card-|--tm-readable-|--tm-glass-large-bg/);
});

test('surface text and control text are paired by theme',()=>{
  const css=read('assets/readable-glass.css');
  assert.match(css,/--tm-surface-text:#173f32/);
  assert.match(css,/--tm-surface-control:rgba\(255,255,255,\.84\)/);
  assert.match(css,/html\[data-theme="dark"\][\s\S]*--tm-surface-text:#F7FAFA/);
  assert.match(css,/html\[data-theme="dark"\][\s\S]*--tm-card-control-text:#F7FAFA/);
});

test('reduced transparency has an opaque fallback',()=>{
  const css=read('assets/readable-glass.css');
  assert.match(css,/@media \(prefers-reduced-transparency:reduce\)/);
  assert.match(css,/--tm-surface-photo:rgba\(8,24,20,\.88\)/);
});


test('surface polish keeps glass transparent and dark controls paired',()=>{
  const css=read('assets/readable-glass.css');
  assert.match(css,/rgba\(250,253,251,\.50\)/);
  assert.match(css,/rgba\(228,241,234,\.38\)/);
  assert.match(css,/rgba\(247,251,249,\.40\)/);
  assert.match(css,/rgba\(12,31,25,\.46\)/);
  assert.match(css,/rgba\(8,24,20,\.40\)/);
  assert.match(css,/rgba\(15,34,28,\.36\)/);
  assert.match(css,/--tm-control-text:#F7FAFA/);
  assert.match(css,/--tm-card-control-selected:color-mix\(in srgb,var\(--tm-brand-primary\) 30%,rgba\(18,42,34,\.88\)\)/);
});

test('feature surfaces consume semantic tokens instead of hardcoded light colors',()=>{
  const theme=read('assets/theme.css');
  const intelligence=read('assets/trip-intelligence.css');
  assert.match(theme,/\.day-heading\.day-heading,.day-tab\.day-tab[\s\S]*background:var\(--tm-card-bg-nested\)!important/);
  assert.match(theme,/\.day-heading\.day-heading,.day-tab\.day-tab[\s\S]*color:var\(--tm-card-text\)!important/);
  assert.match(intelligence,/\.navo-trip-banner\{[\s\S]*background:var\(--tm-card-bg-nested\)/);
  assert.match(intelligence,/\.navo-trip-banner\{[\s\S]*color:var\(--tm-card-text\)/);
  assert.match(intelligence,/\.navo-trip-banner p\{[^}]*color:var\(--tm-card-secondary\)/);
});


test('Plan nested activity and saved-place cards do not stack backdrop blur',()=>{
  const glass=read('assets/readable-glass.css');
  assert.match(glass,/data-trip-view="plan"[^\n]*#plan#plan :is\(\.planned-activity,\.saved-place\)\{\s*--tm-card-blur:none/);
});


test('Places keeps blur on primary surfaces, not opaque controls or saved-place shelf items',()=>{
  const glass=read('assets/readable-glass.css');
  const nearby=read('assets/nearby.css');
  assert.match(glass,/--tm-places-control-blur:none/);
  assert.match(nearby,/\.saved-places-shelf__item\{[\s\S]*?-webkit-backdrop-filter:none;[\s\S]*?backdrop-filter:none/);
});

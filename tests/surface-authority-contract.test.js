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
  assert.match(css,/--tm-surface-blur-photo:blur\(8px\) saturate\(104%\)/);
  assert.doesNotMatch(css,/--tm-weather-card-blur:blur\(4px\)/);
});

test('weather uses a dedicated crisp opaque material without optical blur',()=>{
  const css=read('assets/readable-glass.css');
  assert.match(css,/--tm-weather-card-bg:linear-gradient\(135deg,#365E6C,#2F5360\)/);
  assert.match(css,/--tm-weather-card-text:var\(--tm-surface-photo-text\)/);
  assert.match(css,/--tm-weather-card-blur:none/);
  assert.match(css,/\.weather-top-widget\{[^}]*background:var\(--tm-weather-card-bg\);[^}]*-webkit-backdrop-filter:none;[^}]*backdrop-filter:none/);
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

test('Overview mobile chrome keeps on-photo contrast in both themes',()=>{
  const css=read('assets/readable-glass.css');
  assert.match(css,/data-trip-view="overview"\] \.mobile-header\{[^}]*color:var\(--tm-text-on-photo\)/);
  assert.match(css,/data-trip-view="overview"\] \.mobile-header :is\([^}]+\)\{[^}]*color:var\(--tm-text-on-photo\)/);
});

test('custom trip mobile drawer keeps a crisp readable material and desktop chrome stays desktop-only',()=>{
  const css=read('assets/readable-glass.css');
  assert.match(css,/@media\(max-width:1000px\)\{[\s\S]*?\.workspace>\.sidebar\{[\s\S]*?--tm-drawer-text:#123f32;[\s\S]*?background:linear-gradient\(155deg,rgba\(250,253,252,\.995\),rgba\(235,245,241,\.99\)\);[\s\S]*?backdrop-filter:none/);
  assert.match(css,/@media\(min-width:1001px\)\{[\s\S]*?data-trip-kind="custom"[\s\S]*?\.workspace>\.sidebar\{/);
});

test('Overview removes optical blur and uses crisp semantic surfaces',()=>{
  const css=read('assets/readable-glass.css');
  assert.match(css,/data-trip-kind="custom"\]\.tm-new-design\[data-trip-view="overview"\]\{[^}]*--tm-surface-blur:none;[^}]*--tm-surface-blur-nested:none;[^}]*--tm-surface-blur-photo:none/);
  assert.match(css,/--tm-overview-card:#F6FAF8/);
  assert.match(css,/\.weather-top-widget\{[^}]*background:var\(--tm-weather-card-bg\);[^}]*-webkit-backdrop-filter:none;[^}]*backdrop-filter:none/);
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
  const glass=read('assets/readable-glass.css');
  const planner=read('assets/auto-planner.css');
  const intelligence=read('assets/trip-intelligence.css');
  assert.match(glass,/data-trip-view="plan"[\s\S]*\.day-heading,.planned-activity,.saved-place[\s\S]*background:var\(--tm-readable-surface-soft\)!important/);
  assert.match(glass,/data-trip-view="plan"[\s\S]*\.day-heading,.planned-activity,.saved-place[\s\S]*color:var\(--tm-readable-text\)!important/);
  assert.match(planner,/\.planner-action\{[\s\S]*background:var\(--tm-action-secondary\)/);
  assert.doesNotMatch(theme,/section#plan#plan[\s\S]*\.day-heading\.day-heading[\s\S]*!important/);
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


test('Budget nested result and expense rows do not stack backdrop blur',()=>{
  const glass=read('assets/readable-glass.css');
  assert.match(glass,/data-trip-view="budget"[^\n]*#budget#budget :is\(\.currency-converter-result,\.expense-record\)\{\s*--tm-card-blur:none/);
});


test('Document rows do not allocate repeated backdrop blur layers',()=>{
  const glass=read('assets/readable-glass.css');
  assert.match(glass,/data-trip-view="documents"[^\n]*#documents#documents \.doc-row\{\s*--tm-card-blur:none/);
});


test('Transport nested and repeated surfaces do not stack backdrop blur',()=>{
  const glass=read('assets/readable-glass.css');
  const transport=read('assets/transport-planner.css');
  assert.match(transport,/\.transport-empty\{[^}]*-webkit-backdrop-filter:none;backdrop-filter:none/);
  assert.match(glass,/data-trip-view="transport"[^\n]*#transport#transport \.service-card\.service-info-link\{\s*--tm-card-blur:none/);
});

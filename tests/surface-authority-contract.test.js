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
  assert.match(css,/--tm-surface-blur:blur\(18px\) saturate\(118%\)/);
  assert.match(css,/--tm-surface-blur-nested:blur\(14px\) saturate\(114%\)/);
  assert.match(css,/--tm-surface-blur-photo:blur\(20px\) saturate\(112%\)/);
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

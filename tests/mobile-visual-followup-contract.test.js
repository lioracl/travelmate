'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

test('documents light gives vault intro its own readable neutral surface', () => {
  const css = read('assets/document-vault.css');
  assert.match(css, /data-trip-view="documents"[^\{]*#documents \.vault-head\{/);
  assert.match(css, /background:color-mix\(in srgb,var\(--tm-brand-primary\) 5%,rgba\(226,238,233,\.72\)\)/);
  assert.match(css, /#documents \.vault-head p\{color:var\(--tm-surface-text-muted\)\}/);
});

test('budget light replaces the legacy charcoal hero with semantic light material', () => {
  const css = read('assets/trip-experience.css');
  assert.match(css, /data-trip-view="budget"[^\{]*#budget \.budget-hero\{/);
  assert.match(css, /color-mix\(in srgb,var\(--tm-brand-primary\) 6%,rgba\(214,230,224,\.64\)\)/);
  assert.match(css, /#budget \.budget-hero>div:first-child :is\(span,strong,p,small\)/);
});

test('mobile plan day actions and budget swap button are centered without competing rotation', () => {
  const plan = read('assets/auto-planner.css');
  const budget = read('assets/trip-experience.css');
  assert.match(plan, /@media\(max-width:680px\)[\s\S]*\.day-heading-actions :is\(\.day-add,\.day-replace\)[\s\S]*place-items:center/);
  assert.match(plan, /width:44px;[\s\S]*height:44px;[\s\S]*padding:0/);
  assert.match(budget, /@media\(max-width:700px\)[\s\S]*#budget \.currency-converter-grid>button[\s\S]*grid-column:2;[\s\S]*grid-row:2;[\s\S]*place-items:center;[\s\S]*transform:none/);
});

test('light Overview and Places use the approved non-milky neutral green material', () => {
  const glass = read('assets/readable-glass.css');
  assert.match(glass, /data-trip-view="overview"[\s\S]*--tm-overview-card:linear-gradient\(135deg,rgba\(112,158,146,\.66\),rgba\(88,137,125,\.58\)\)/);
  assert.match(glass, /data-trip-view="places"[\s\S]*--tm-surface-glass:linear-gradient\(135deg,rgba\(112,158,146,\.66\),rgba\(88,137,125,\.58\)\)/);
  assert.match(glass, /--tm-overview-border:rgba\(45,100,86,\.54\)/);
});

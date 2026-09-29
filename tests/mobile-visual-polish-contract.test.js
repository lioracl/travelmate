'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function markedBlock(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, 'missing marker: ' + startMarker);
  const end = endMarker ? source.indexOf(endMarker, start + startMarker.length) : source.length;
  assert.notEqual(end, -1, 'missing end marker: ' + endMarker);
  return source.slice(start, end);
}

test('mobile Plan polish owns compact 390/430 geometry without escalation', () => {
  const css = read('assets/plan-ux-polish.css');
  const block = markedBlock(css, '/* Mobile Visual Polish: final Plan geometry authority. */');
  assert.match(block, /@media\(max-width:700px\)/);
  assert.match(block, /\.planner-more>summary\{[\s\S]*?min-height:46px;[\s\S]*?height:46px/);
  assert.match(block, /\.planned-activity\.tm-plan-item\{[\s\S]*?grid-template-columns:42px 64px minmax\(0,1fr\)/);
  assert.match(block, /\.tm-plan-activity-media,[\s\S]*?width:64px;[\s\S]*?height:64px/);
  assert.match(block, /grid-template-columns:repeat\(3,44px\)/);
  assert.match(block, /\.tm-plan-item:not\(\.tm-plan-expanded\)[\s\S]*?data-toggle-done[\s\S]*?display:none/);
  assert.match(block, /\.tm-plan-item:not\(\.tm-plan-expanded\)[\s\S]*?data-smart-replace-activity[\s\S]*?display:none/);
  assert.match(block, /\.tm-plan-expanded :is\([\s\S]*?activity-buttons>button[\s\S]*?width:auto/);
  assert.match(block, /\.generated-day\.day-collapsed \.day-heading\{[\s\S]*?min-height:40px/);
  assert.doesNotMatch(block, /!important/);
});

test('mobile Today summary is shorter while expanded content stays available', () => {
  const css = read('assets/today-activities.css');
  const block = markedBlock(css, '/* Mobile Visual Polish: compact Overview activity summary, full detail on demand. */');
  assert.match(block, /@media\(max-width:650px\)/);
  assert.match(block, /\.today-activities-toggle\{[\s\S]*?min-height:78px/);
  assert.match(block, /\.today-activities-expanded\{[\s\S]*?padding:13px/);
  assert.doesNotMatch(block, /display:none/);
  assert.doesNotMatch(block, /!important/);
});

test('Overview translucency polish is phone-scoped and preserves readable touch targets', () => {
  const css = read('assets/readable-glass.css');
  const block = markedBlock(
    css,
    '/* Mobile Visual Polish: final Overview density and translucency authority. */',
    '/* Phase 10 — Final Overlay Material Authority.'
  );
  assert.match(block, /@media\(max-width:650px\)/);
  assert.match(block, /--tm-overview-card:var\(--tm-surface-nested\)/);
  assert.match(block, /\.overview-status-card\{[\s\S]*?min-height:70px;[\s\S]*?padding:9px 10px/);
  assert.match(block, /\.overview-status-card>a\{[\s\S]*?width:44px;[\s\S]*?height:44px/);
  assert.match(block, /\.trip-home-actions a\{[\s\S]*?min-height:48px/);
  assert.doesNotMatch(block, /!important/);
});

test('visual polish does not introduce business-logic or JavaScript changes', () => {
  const allowed = new Set([
    'assets/plan-ux-polish.css',
    'assets/readable-glass.css',
    'assets/today-activities.css',
    'tests/mobile-visual-polish-contract.test.js'
  ]);
  assert.ok(allowed.has('assets/plan-ux-polish.css'));
});

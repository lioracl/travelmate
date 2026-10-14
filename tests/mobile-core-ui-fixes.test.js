const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function read(path){ return fs.readFileSync(path,'utf8'); }

test('All Trips date editor passes the clicked edit control',()=>{
  const js=read('assets/home.js');
  assert.match(js,/editTripDates\(editTrip, editDates\)/);
  assert.doesNotMatch(js,/editTripDates\(editTrip, editButton\)/);
});

test('Mate owns the full mobile visual viewport when open',()=>{
  const css=read('assets/ai-assistant.css');
  assert.match(css,/Mobile full-screen Mate contract — 2026-10-14/);
  assert.match(css,/top:calc\(var\(--ai-viewport-top,0px\) \+ var\(--safe-area-inset-top,env\(safe-area-inset-top\)\)\)/);
  assert.match(css,/height:calc\(var\(--ai-viewport-height,100dvh\) - var\(--safe-area-inset-top,env\(safe-area-inset-top\)\)\)/);
  assert.match(css,/body\.ai-assistant-open \.ai-orb\{display:none\}/);
});

test('mobile Settings has an opaque full-screen shell and safe-area padding',()=>{
  const css=read('assets/security-center.css');
  assert.match(css,/Mobile settings solid full-screen authority — 2026-10-14/);
  assert.match(css,/min-height:100dvh/);
  assert.match(css,/background:#dcebee/);
  assert.match(css,/background:#10262b/);
  assert.match(css,/env\(safe-area-inset-top\)/);
});

test('All Trips mobile action targets meet 44px minimum',()=>{
  const css=read('assets/home-organizer.css');
  assert.match(css,/All Trips mobile action touch targets — 2026-10-14/);
  assert.match(css,/min-height:44px/);
});

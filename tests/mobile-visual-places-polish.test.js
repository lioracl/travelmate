'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('new-trip modal fully isolates the creation flow from trip-card backgrounds', () => {
  const css = read('assets/home-organizer.css');
  assert.match(css, /New-trip modal isolation/);
  assert.match(css, /body\.home-page #modal-destination\.modal-backdrop/);
  assert.match(css, /z-index:1400/);
  assert.match(css, /background:var\(--bg/);
  assert.match(css, /#modal-destination \.destination-modal/);
  assert.match(css, /background:var\(--surface/);
});

test('mobile trip header reaches the viewport edge without exposing page content above it', () => {
  const css = read('assets/trip-redesign.css');
  assert.match(css, /Mobile chrome edge fix/);
  assert.match(css, /body:not\(\.home-page\) \.mobile-header\{[\s\S]*?top:0;[\s\S]*?right:0;[\s\S]*?left:0;/);
  assert.match(css, /network-usage-meter\.in-trip\{top:68px\}/);
});

test('saved places is a remembered collapsible banner instead of a long always-open shelf', () => {
  const app = read('assets/app.js');
  const css = read('assets/nearby.css');
  assert.match(app, /data-saved-places-toggle/);
  assert.match(app, /savedShelfStorageKey='travelmate-saved-shelf:'/);
  assert.match(app, /function setSavedShelfExpanded\(expanded,remember\)/);
  assert.match(app, /sessionStorage\.setItem\(savedShelfStorageKey/);
  assert.match(app, /setSavedShelfExpanded\(true,true\)/);
  assert.match(css, /Saved Places banner: compact, collapsible/);
  assert.match(css, /position:sticky/);
  assert.match(css, /max-height:46dvh/);
});

test('Places does not show a confusing instruction while idle', () => {
  const app = read('assets/app.js');
  const nearby = read('assets/nearby.js');
  const css = read('assets/nearby.css');
  assert.match(app, /<div class="nearby-status" data-nearby-status><\/div>/);
  assert.match(nearby, /status\.textContent=''; \/\* idle:/);
  assert.match(css, /\.nearby-status:empty\{display:none\}/);
});

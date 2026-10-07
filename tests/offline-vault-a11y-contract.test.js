'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const sw = read('sw.js');
const vault = read('assets/document-vault.js');
const brief = read('assets/today-brief.js');

test('offline core includes release-critical Overview lazy assets', () => {
  ['trip-intelligence.css', 'today-activities.css', 'today-activities.js', 'weather-widget.js'].forEach(asset => {
    assert.match(sw, new RegExp("'\\./assets/" + asset.replace('.', '\\.') + "'"));
  });
});

test('Trip Health Check verifies local trip and cache instead of service-worker control alone', () => {
  assert.match(brief, /TravelMateTripStore&&w\.TravelMateTripStore\.getTrip/);
  assert.match(brief, /await caches\.keys\(\)/);
  assert.match(brief, /cache\.match\(canonical,\{ignoreSearch:true\}\)/);
  assert.doesNotMatch(brief, /serviceWorker&&navigator\.serviceWorker\.controller/);
});

test('Document health comes from the authenticated vault metadata result only', () => {
  assert.match(vault, /delete window\.TravelMateDocumentHealth/);
  assert.match(vault, /TravelMateDocumentHealth = Object\.freeze\(\{ tripId: String\(tripId\), count: documents\.length, loaded: true \}\)/);
  assert.match(brief, /w\.TravelMateDocumentHealth/);
  assert.doesNotMatch(brief, /\['documents','vault','files'\]/);
});

test('vault preview is a labelled modal with keyboard containment and focus restoration', () => {
  assert.match(vault, /setAttribute\('role', 'dialog'\)/);
  assert.match(vault, /setAttribute\('aria-modal', 'true'\)/);
  assert.match(vault, /setAttribute\('aria-labelledby', 'vault-preview-title'\)/);
  assert.match(vault, /event\.key === 'Escape'/);
  assert.match(vault, /event\.key !== 'Tab'/);
  assert.match(vault, /event\.shiftKey && document\.activeElement === first/);
  assert.match(vault, /document\.activeElement === last/);
  assert.match(vault, /document\.body\.appendChild\(preview\);\s*closeButton\.focus\(\)/);
  assert.match(vault, /previouslyFocused\.focus\(\)/);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
function read(relative) { return fs.readFileSync(path.join(root, relative), 'utf8'); }

const html = read('trip/custom/index.html');
const vault = read('assets/document-vault.js');
const ai = read('assets/ai-assistant.js');
const css = read('assets/document-vault.css');

test('Documents V2 exposes the approved seven category filters', () => {
  const nav = html.match(/<nav class="documents-category-nav"[\s\S]*?<\/nav>/);
  assert.ok(nav, 'Documents V2 category navigation must exist');
  const filters = Array.from(nav[0].matchAll(/data-document-filter="([^"]+)"/g), (match) => match[1]);
  assert.deepEqual(filters, ['all', 'flights', 'lodging', 'tickets', 'insurance', 'personal', 'mate']);
});

test('Documents V2 has five encrypted document groups plus Mate as a separate archive', () => {
  const groups = Array.from(html.matchAll(/class="doc-row[^"]*" data-document-group="([^"]+)"/g), (match) => match[1]);
  assert.deepEqual(groups, ['flights', 'lodging', 'tickets', 'insurance', 'personal']);
  assert.match(ai, /archive\.dataset\.documentGroup = 'mate'/);
  assert.match(ai, /TravelMateDocuments[\s\S]*\.refresh/);
});

test('legacy document categories are normalized without a database migration', () => {
  assert.match(vault, /\/טיסה\|טיסות\|flight\|boarding\/i/);
  assert.match(vault, /\/תחבורה\|כרטיס\|רכבת\|אוטובוס\|ticket\|transport\|train\|bus\/i/);
  assert.match(vault, /return 'tickets'/);
  assert.match(vault, /return 'personal'/);
  assert.match(vault, /tickets: 'כרטיסים ותחבורה'/);
  assert.match(vault, /personal: 'אישי'/);
  assert.doesNotMatch(vault, /categoryTargets\[documentRecord\.category\]/);
});

test('new uploads use the canonical Documents V2 category names', () => {
  assert.match(vault, /<option>טיסות<\/option><option>לינה<\/option><option>כרטיסים ותחבורה<\/option><option>ביטוח<\/option><option>אישי<\/option>/);
  assert.doesNotMatch(vault, /<option>תחבורה<\/option><option>כרטיסים<\/option>/);
  assert.doesNotMatch(vault, /<option>דרכון ואשרות<\/option><option>אחר<\/option>/);
});

test('Documents V2 category UI remains available before cloud bootstrap', () => {
  const filterSetup = vault.indexOf('window.TravelMateDocuments = Object.freeze');
  const filterApply = vault.indexOf('applyDocumentFilter();', filterSetup);
  const cloudGuard = vault.indexOf("if (!config || !config.url || !config.publishableKey)");
  assert.ok(filterSetup > 0 && filterApply > filterSetup, 'Documents V2 UI must initialize');
  assert.ok(cloudGuard > filterApply, 'cloud availability must not gate local Documents V2 navigation');
});

test('one shared secure upload owner replaces duplicate upload buttons', () => {
  assert.equal((html.match(/data-vault-pick/g) || []).length, 1);
  const markup = vault.slice(vault.indexOf('function createVaultMarkup'), vault.indexOf('async function init'));
  assert.doesNotMatch(markup, /data-vault-pick/);
  assert.match(vault, /section\.querySelectorAll\('\[data-vault-pick\]'\)/);
  assert.match(vault, /vaultPickButtons\.forEach/);
});

test('encrypted document contents are not sent to Mate by Documents V2', () => {
  assert.doesNotMatch(vault, /askAi|travelmate:ask-ai|Gemini|TravelMateNavo/);
  assert.match(vault, /PBKDF2_ITERATIONS = 310000/);
  assert.match(vault, /AES-GCM/);
});

test('Documents V2 filtering is responsive and feature-scoped', () => {
  assert.match(css, /Documents V2 category navigation/);
  assert.match(css, /#documents \.documents-category-nav/);
  assert.match(css, /overflow-x:auto/);
  assert.match(css, /#documents \.doc-row\[hidden\]\{display:none\}/);
});

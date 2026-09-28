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

test('all document upload entry points share one auth-aware action', () => {
  assert.match(vault, /function requestDocumentUpload\(categoryName\)/);
  assert.match(vault, /vaultPickButtons\.forEach/);
  assert.match(vault, /requestDocumentUpload\(categoryName\)/);
  assert.match(vault, /authPanel\.scrollIntoView/);
  assert.match(vault, /email\.focus/);
  assert.doesNotMatch(vault, /button\.disabled = !currentUser/);
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

test('Document Vault ignores stale metadata responses after session changes', () => {
  assert.match(vault, /var documentSessionEpoch = 0/);
  assert.match(vault, /var sessionEpoch = \+\+documentSessionEpoch/);
  assert.match(vault, /renderDocuments\(sessionEpoch, currentUser\.id\)/);
  assert.match(vault, /requestEpoch !== documentSessionEpoch \|\| !currentUser \|\| currentUser\.id !== requestUserId/);
  assert.match(vault, /documentSessionEpoch \+= 1;[\s\S]*clearRemoteDocumentMetadata\(\);[\s\S]*client\.auth\.signOut\(\)/);
});

test('Document Vault clears remote metadata immediately when signed out', () => {
  assert.match(vault, /function clearRemoteDocumentMetadata\(\)/);
  assert.match(vault, /target\.files\.innerHTML = ''/);
  assert.match(vault, /target\.row\.classList\.remove\('has-documents'\)/);
  assert.match(vault, /\[data-vault-count\][\s\S]*0 מסמכים/);
});

test('Custom Documents library owns flat rows instead of nested card material', () => {
  assert.match(css, /Documents final feature ownership/);
  assert.match(css, /data-trip-view="documents"[^\n]*#documents \[data-document-category-list\]\{[\s\S]*?background:transparent[\s\S]*?backdrop-filter:none/);
  assert.match(css, /data-trip-view="documents"[^\n]*#documents \.doc-row,[\s\S]*?border-radius:0;[\s\S]*?background:transparent;[\s\S]*?box-shadow:none/);
  assert.match(css, /data-trip-view="documents"[^\n]*#documents \.doc-category-file\{[\s\S]*?border-radius:0;[\s\S]*?background:var\(--tm-documents-file-row\)/);
});

test('stored document actions use explicit visible labels', () => {
  assert.match(vault, /data-open-document><i[^>]*><\/i><span>פתיחה<\/span>/);
  assert.match(vault, /data-download-document><i[^>]*><\/i><span>הורדה<\/span>/);
  assert.match(vault, /data-delete-document><i[^>]*><\/i><span>מחיקה<\/span>/);
});

test('Custom Documents bypasses the generic theme material boundary', () => {
  const glass = read('assets/readable-glass.css');
  assert.match(glass, /:not\(body\[data-trip-kind="custom"\]\[data-trip-view="documents"\] #documents \*\)/);
});

test('Document actions keep secure preview download and destructive-delete safeguards', () => {
  assert.match(vault, /async function openDocument\(record, download\)/);
  assert.match(vault, /requirePrivateStorageAccess\(\)/);
  assert.match(vault, /downloadBlob\(decrypted, record\.file_name\)/);
  assert.match(vault, /URL\.revokeObjectURL\(url\)/);
  assert.match(vault, /URL\.revokeObjectURL\(objectUrl\)/);
  assert.match(vault, /confirm\('למחוק לצמיתות את המסמך מהענן\? לא ניתן לבטל פעולה זו\.'\)/);
});


test('Documents no longer uses the legacy white-on-dark header override', () => {
  const redesign = read('assets/trip-redesign.css');
  assert.doesNotMatch(redesign, /data-trip-view="documents"[\s\S]{0,900}section-head > div > h1\{[\s\S]*color:#fff!important/);
  assert.doesNotMatch(redesign, /data-trip-view="documents"[\s\S]{0,1200}pill-btn::before/);
});

test('Documents light canvas stays transparent while separate zones own surfaces', () => {
  assert.match(css, /html:not\(\[data-theme="dark"\]\)[\s\S]*data-trip-view="documents"[\s\S]*#documents\{[\s\S]*background:transparent[\s\S]*backdrop-filter:none/);
});

test('final canvas transparency rule does not erase the Documents surface', () => {
  const glass = read('assets/readable-glass.css');
  const canvasRule = glass.match(/\/\* Canvas never becomes a card\. \*\/[\s\S]*?\{\s*background:transparent;\s*\}/);
  assert.ok(canvasRule, 'canvas transparency rule exists');
  assert.doesNotMatch(canvasRule[0], /#documents/);
});

test('partial multi-file upload exposes saved files and prevents accidental duplicate retry', () => {
  assert.match(vault, /if \(uploadedCount > 0\)/);
  assert.match(vault, /input\.value = ''/);
  assert.match(vault, /await renderDocuments\(\)/);
  assert.match(vault, /בחר מחדש רק את הקבצים שלא נשמרו כדי למנוע כפילויות/);
});

test('Document Vault accurately distinguishes encrypted file contents from protected metadata', () => {
  assert.match(vault, /תוכן הקבצים מוצפן במכשיר לפני ההעלאה/);
  assert.match(vault, /שם הקובץ, הקטגוריה וההערה נשמרים כפרטי רשימה בחשבון המוגן/);
  assert.match(vault, /אין להזין בהם מידע רגיש/);
});

test('Document Vault deletes metadata first and queues encrypted blob cleanup safely', () => {
  assert.match(vault, /var metadataResult = await client\.from\('travel_documents'\)\.delete\(\)\.eq\('id', record\.id\)/);
  assert.match(vault, /var storageResult = await client\.storage\.from\(bucket\)\.remove\(\[record\.storage_path\]\)/);
  assert.ok(
    vault.indexOf("var metadataResult = await client.from('travel_documents').delete().eq('id', record.id);")
      < vault.indexOf("var storageResult = await client.storage.from(bucket).remove([record.storage_path]);"),
    'metadata must be removed before the encrypted blob'
  );
  assert.match(vault, /queuePendingCleanup\(currentUser\.id, record\.storage_path\)/);
  assert.match(vault, /await flushPendingCleanup\(\)/);
  assert.match(vault, /window\.addEventListener\('online', function \(\) \{ if \(currentUser\) flushPendingCleanup\(\); \}\)/);
});

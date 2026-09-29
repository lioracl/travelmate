'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function finalBlock() {
  const css = read('assets/document-vault.css');
  const marker = '/* Documents 2.0 final visual authority: one calm hierarchy, no black/nested glass. */';
  const start = css.indexOf(marker);
  assert.notEqual(start, -1, 'Documents 2.0 final authority block must exist');
  return css.slice(start);
}

test('Documents 2.0 uses semantic surfaces without nested blur', () => {
  const block = finalBlock();
  assert.match(block, /\.vault-intro\{[\s\S]*?background:transparent;[\s\S]*?backdrop-filter:none/);
  assert.match(block, /:is\([\s\S]*?\.vault-access,.vault-upload-section,.vault-library[\s\S]*?background:var\(--tm-documents-shell\)/);
  assert.match(block, /:is\([\s\S]*?\.vault-auth,.vault-session,.vault-unlock[\s\S]*?background:transparent;[\s\S]*?backdrop-filter:none/);
  assert.doesNotMatch(block, /background:\s*(?:#000|black)\b/i);
  assert.doesNotMatch(block, /backdrop-filter:\s*blur\(/i);
});

test('Documents 2.0 keeps clear upload and document action hierarchy', () => {
  const block = finalBlock();
  assert.match(block, /\.vault-upload-button\{[\s\S]*?background:var\(--tm-action-primary\);[\s\S]*?color:var\(--tm-text-on-action\)/);
  assert.match(block, /\.doc-category-file-actions \[data-open-document\]\{[\s\S]*?background:var\(--tm-action-secondary\)/);
  assert.match(block, /\.doc-category-file-actions \[data-delete-document\]\{[\s\S]*?var\(--tm-error\)/);
});

test('Documents 2.0 mobile geometry prevents action overflow', () => {
  const block = finalBlock();
  assert.match(block, /@media\(max-width:700px\)/);
  assert.match(block, /\.doc-category-file-actions\{[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(block, /\.doc-category-file-actions button\{[\s\S]*?min-height:44px;[\s\S]*?white-space:normal/);
  assert.match(block, /\.vault-upload-button\{[\s\S]*?width:100%/);
  assert.match(block, /\.doc-category-file-copy strong\{[\s\S]*?text-overflow:ellipsis/);
});

test('Documents 2.0 final visual block does not add important escalation', () => {
  assert.doesNotMatch(finalBlock(), /!important/);
});

test('Documents documentation seed covers requirements, data flow and user guide', () => {
  const doc = read('docs/features/documents/documents-v2.md');
  assert.match(doc, /FR-DOC-001/);
  assert.match(doc, /public\.travel_documents/);
  assert.match(doc, /travel-documents/);
  assert.match(doc, /DFD Level 0/);
  assert.match(doc, /ERD impact/);
  assert.match(doc, /User Guide Seed/);
});

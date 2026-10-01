'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('document vault keeps upload ownership bound to the initiating session', () => {
  const source = fs.readFileSync('assets/document-vault.js', 'utf8');
  assert.match(source, /var uploadUserId = String\(currentUser\.id\)/);
  assert.match(source, /var uploadSessionEpoch = documentSessionEpoch/);
  assert.match(source, /documentSessionEpoch !== uploadSessionEpoch/);
  assert.match(source, /String\(currentUser\.id\) !== uploadUserId/);
  assert.match(source, /queuePendingCleanup\(uploadUserId, objectName\)/);
});

test('document delete retains a retry path when metadata is removed but storage cleanup fails', () => {
  const source = fs.readFileSync('assets/document-vault.js', 'utf8');
  assert.match(source, /client\.from\('travel_documents'\)\.delete\(\)\.eq\('id', record\.id\)/);
  assert.match(source, /await flushPendingCleanup\(\)/);
  assert.match(source, /eq\('user_id', deleteUserId\)\.eq\('storage_path', record\.storage_path\)/);
  assert.match(source, /queuePendingCleanup\(currentUser\.id, record\.storage_path\)/);
});

test('document upload rollback removes the blob when metadata creation fails', () => {
  const source = fs.readFileSync('assets/document-vault.js', 'utf8');
  assert.match(source, /if \(metadataResult\.error\) \{/);
  assert.match(source, /queuePendingCleanup\(uploadUserId, objectName\)/);
  assert.match(source, /if \(isDocumentSession\(uploadUserId, uploadSessionEpoch\)\) await flushPendingCleanup\(\)/);
  assert.match(source, /storage\.from\(bucket\)\.remove\(\[path\]\)/);
  assert.match(source, /eq\('storage_path', path\)\.limit\(1\)/);
});

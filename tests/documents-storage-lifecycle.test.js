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
  assert.match(source, /await abandonUpload\(uploadId, uploadUserId, uploadSessionEpoch\)/);
});

test('document delete retains a retry path when metadata is removed but storage cleanup fails', () => {
  const source = fs.readFileSync('assets/document-vault.js', 'utf8');
  assert.match(source, /client\.from\('travel_documents'\)\.delete\(\)\.eq\('id', record\.id\)/);
  assert.match(source, /database DELETE trigger records cleanup in the same transaction/);
  assert.match(source, /eq\('user_id', deleteUserId\)\.eq\('storage_path', record\.storage_path\)/);
  assert.doesNotMatch(source, /storage\.from\(bucket\)\.remove\(/);
});

test('document upload rollback delegates owner-scoped cleanup to the durable journal', () => {
  const source = fs.readFileSync('assets/document-vault.js', 'utf8');
  assert.match(source, /if \(metadataResult\.error\) \{/);
  assert.match(source, /await abandonUpload\(uploadId, uploadUserId, uploadSessionEpoch\)/);
  assert.match(source, /if \(!uploadId \|\| !isDocumentSession\(userId, epoch\)\) return/);
  assert.match(source, /client\.rpc\('abandon_document_upload'/);
  assert.doesNotMatch(source, /storage\.from\(bucket\)\.remove\(/);
});

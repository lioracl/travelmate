'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs');
const sql=fs.readFileSync('supabase/migrations/20261001151643_document_lifecycle_journal.sql','utf8');
const vault=fs.readFileSync('assets/document-vault.js','utf8');
test('recovery migration never writes Storage rows or backfills existing objects',()=>{
  assert.doesNotMatch(sql,/\b(?:insert\s+into|update|delete\s+from|truncate)\s+storage\./i);
  assert.doesNotMatch(sql,/drop policy|alter.*(?:disable row level|bucket)/i);
  assert.match(sql,/as restrictive for insert to authenticated/);assert.match(sql,/as restrictive for update to authenticated/);
});
test('journal is private, metadata-only, RLS enabled and denied to clients',()=>{
  assert.match(sql,/alter table document_recovery\.uploads enable row level security/);
  assert.match(sql,/revoke all on document_recovery\.uploads from public, anon, authenticated, service_role/);
  assert.doesNotMatch(sql,/\b(?:bytea|passphrase|ciphertext|binary)\b/i);
  assert.match(sql,/owner_id uuid := auth\.uid\(\)/);assert.match(sql,/public\.mfa_satisfied_if_enrolled\(\)/);
});
test('worker RPCs are service-only and every definer pins an empty search path',()=>{
  for(const signature of ['claim_document_cleanup\\(integer\\)','authorize_document_cleanup\\(uuid,uuid\\)','finish_document_cleanup\\(uuid,uuid,boolean\\)']) {
    assert.match(sql,new RegExp('revoke all on function public\\.'+signature+' from public, anon, authenticated'));
    assert.match(sql,new RegExp('grant execute on function public\\.'+signature+' to service_role'));
  }
  assert.equal((sql.match(/security definer/g)||[]).length,(sql.match(/security definer set search_path = ''/g)||[]).length);
  assert.match(sql,/current_setting\('role',true\) is distinct from 'service_role'/);
});
test('recovery requires stable ownership/object identity, grace and a locked journal',()=>{
  assert.match(sql,/for update skip locked/);assert.match(sql,/interval '24 hours'/);
  assert.match(sql,/u\.object_id<>o\.id/);assert.match(sql,/o\.owner_id is distinct from u\.user_id::text/);
  assert.match(sql,/state='ambiguous'/);assert.match(sql,/DOCUMENT_COMMIT_WINDOW_CLOSED/);
  assert.match(sql,/not exists\(select 1 from public\.travel_documents where storage_path=u\.storage_path\)/);
});
test('client journals before upload and delegates deletion without plaintext or passphrase',()=>{
  assert.ok(vault.indexOf("client.rpc('begin_document_upload'")<vault.indexOf('storage.from(bucket).upload('));
  assert.match(vault,/client\.rpc\('begin_document_upload', \{ p_trip_id: tripId, p_expected_owner: uploadUserId \}\)/);
  assert.match(sql,/p_expected_owner is distinct from owner_id/);
  assert.doesNotMatch(vault,/storage\.from\(bucket\)\.remove\(/);
  assert.doesNotMatch(vault,/travelmate-document-cleanup:/);
  assert.match(vault,/client\.rpc\('abandon_document_upload', \{ p_upload_id: uploadId \}\)/);
});

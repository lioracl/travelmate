'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const root = path.resolve(__dirname, '../..');
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
let db;
async function role(name, user = A, aal = 'aal1') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: user, aal })]);
  await db.exec('set role ' + name);
}
async function admin(sql, params = []) { await role('postgres'); return db.query(sql, params); }
async function begin(user = A) { await role('authenticated', user); return (await db.query("select * from public.begin_document_upload('trip',$1)",[user])).rows[0]; }
async function object(journal, user = A) {
  await role('authenticated', user);
  return (await db.query("insert into storage.objects(bucket_id,name,owner_id) values('travel-documents',$1,$2) returning id", [journal.storage_path,user])).rows[0].id;
}
async function metadata(journal, user = A) {
  await role('authenticated', user);
  return db.query("insert into public.travel_documents(user_id,trip_id,file_name,storage_path,file_size,encryption_salt,encryption_iv) values($1,'trip','synthetic.txt',$2,17,'salt','iv') returning id", [user,journal.storage_path]);
}
async function state(j) { return (await admin('select * from document_recovery.uploads where id=$1',[j.upload_id])).rows[0]; }
async function due(j, column = 'expires_at') { await admin(`update document_recovery.uploads set ${column}=now()-interval '2 days',next_attempt_at=null where id=$1`, [j.upload_id]); }
async function claim(j) {
  await role('service_role');
  return (await db.query('select * from public.claim_document_cleanup(100)')).rows.find(row => row.upload_id === j.upload_id);
}
async function mature(j) { await due(j); assert.equal(await claim(j),undefined); await due(j,'cleanup_after'); return claim(j); }
async function authorize(c) { await role('service_role'); return (await db.query('select public.authorize_document_cleanup($1,$2) as allowed',[c.upload_id,c.claim_token])).rows[0].allowed; }
async function finish(c, failed = false) { await role('service_role'); await db.query('select public.finish_document_cleanup($1,$2,$3)',[c.upload_id,c.claim_token,failed]); }

before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key);
    create table auth.mfa_factors(user_id uuid,status text);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    grant usage on schema auth,storage to authenticated,service_role;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner_id text,updated_at timestamptz not null default now(),unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to authenticated,service_role;
    create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
  `);
  await db.query('insert into auth.users values($1),($2)',[A,B]);
  for (const name of ['20260719090000_private_document_vault.sql','20260814213000_mfa_personal_data.sql','20260814233000_repair_private_uploads.sql','20261001151643_document_lifecycle_journal.sql']) {
    if (name === '20261001151643_document_lifecycle_journal.sql') {
      // Synthetic document that predates the journal migration.
      await db.query("insert into storage.objects(bucket_id,name,owner_id) values('travel-documents',$1,$2)",[A+'/legacy/referenced',A]);
      await db.query("insert into public.travel_documents(user_id,trip_id,file_name,file_size,storage_path,encryption_salt,encryption_iv) values($1,'trip','legacy',17,$2,'s','i')",[A,A+'/legacy/referenced']);
    }
    const sql = fs.readFileSync(path.join(root,'supabase/migrations',name),'utf8');
    // PGlite has PostgreSQL's built-in gen_random_uuid; no pgcrypto extension is needed.
    await db.exec(sql.replace('create extension if not exists pgcrypto;',''));
  }
  // Four synthetic legacy orphans stand in for the protected production objects.
  for (let i=0;i<4;i++) await db.query("insert into storage.objects(bucket_id,name,owner_id) values('travel-documents',$1,$2)",[A+'/legacy/orphan-'+i,A]);
});
after(async () => { await db.close(); });

test('journal exists before upload, server assigns owner/path and metadata commit is atomic', async () => {
  const j=await begin(); assert.equal((await state(j)).state,'pending'); assert.equal(j.storage_path,A+'/__lifecycle_v1/'+j.upload_id+'.vault');
  await object(j); await metadata(j); assert.equal((await state(j)).state,'committed');
  await due(j); assert.equal(await claim(j),undefined);
});
test('metadata failure rolls back journal commit; explicit abandon waits for grace', async () => {
  const j=await begin(); await object(j); await role('authenticated');
  await assert.rejects(db.query("insert into public.travel_documents(user_id,trip_id,file_name,storage_path,file_size,encryption_salt,encryption_iv) values($1,'trip','synthetic',$2,-1,'s','i')",[A,j.storage_path]));
  assert.equal((await state(j)).state,'pending'); await role('authenticated');
  await db.query('select public.abandon_document_upload($1)',[j.upload_id]);
  assert.equal(await claim(j),undefined); await due(j,'cleanup_after'); assert.equal(await claim(j),undefined);
  assert.equal((await state(j)).state,'recovery_hold');
});
test('browser termination after Storage upload recovers using journal and two observations', async () => {
  const j=await begin(); await object(j); const c=await mature(j);
  assert.ok(c); assert.equal(await authorize(c),true);
  // Local fake of the Storage API's successful removal; never production SQL deletion.
  await admin("delete from storage.objects where bucket_id='travel-documents' and name=$1",[j.storage_path]);
  await finish(c); assert.equal((await state(j)).state,'deleted');
  assert.equal(await claim(j),undefined);
});
test('lost metadata acknowledgement is referenced and never reclaimed', async () => {
  const j=await begin(); await object(j); await metadata(j);
  await role('authenticated'); await db.query('select public.abandon_document_upload($1)',[j.upload_id]);
  await due(j); assert.equal(await claim(j),undefined); assert.equal((await state(j)).state,'committed');
});
test('cleanup failure retains durable backoff; retry and repeated finish are idempotent', async () => {
  const j=await begin(); await object(j); const c=await mature(j); await finish(c,true);
  assert.equal((await state(j)).last_error,'STORAGE_REMOVE_FAILED'); assert.equal(await claim(j),undefined);
  await due(j,'cleanup_after'); const retry=await claim(j); assert.ok(retry); assert.notEqual(retry.claim_token,c.claim_token);
  await finish(c); assert.equal((await state(j)).claim_token,retry.claim_token);
  await admin('delete from storage.objects where name=$1',[j.storage_path]); await finish(retry); await finish(retry);
  assert.equal((await state(j)).state,'deleted');
});
test('lost Storage remove response retains ambiguous completion even when metadata is absent', async () => {
  const j=await begin(); await object(j); const c=await mature(j);
  await admin('delete from storage.objects where name=$1',[j.storage_path]); await finish(c,true);
  assert.equal((await state(j)).state,'ambiguous');
});
test('lost worker completion recovers an expired claim without another deletion', async () => {
  const j=await begin(); await object(j); const c=await mature(j);
  await admin('delete from storage.objects where name=$1',[j.storage_path]); await due(j,'cleanup_after');
  assert.equal(await claim(j),undefined); assert.equal((await state(j)).state,'ambiguous'); await finish(c);
});
test('missing object is ambiguous; absence alone authorizes no deletion', async () => {
  const j=await begin(); await due(j); assert.equal(await claim(j),undefined); assert.equal((await state(j)).state,'ambiguous');
});
test('changed object identity remains ambiguous and cannot be reclaimed', async () => {
  const j=await begin(); await object(j); await due(j); await claim(j);
  await admin('update storage.objects set updated_at=updated_at+interval \'1 second\' where name=$1',[j.storage_path]);
  await due(j,'cleanup_after'); assert.equal(await claim(j),undefined); assert.equal((await state(j)).state,'ambiguous');
});
test('foreign Storage owner is retained even if its path was forged', async () => {
  const j=await begin(); await admin("insert into storage.objects(bucket_id,name,owner_id) values('travel-documents',$1,$2)",[j.storage_path,B]);
  await due(j); assert.equal(await claim(j),undefined); assert.equal((await state(j)).state,'ambiguous');
});
test('account B cannot upload, commit, abandon or read A journal/metadata', async () => {
  const j=await begin(); await role('authenticated',B);
  await assert.rejects(object(j,B)); await assert.rejects(metadata(j,B));
  await role('authenticated',B); await assert.rejects(db.query('select public.abandon_document_upload($1)',[j.upload_id]));
  await assert.rejects(db.query('select * from document_recovery.uploads'));
});
test('anonymous and MFA-downgraded users cannot prepare lifecycle operations', async () => {
  await role('anon'); await assert.rejects(db.query("select * from public.begin_document_upload('trip',$1)",[A]));
  await admin("insert into auth.mfa_factors values($1,'verified')",[B]); await role('authenticated',B,'aal1');
  await assert.rejects(db.query("select * from public.begin_document_upload('trip',$1)",[B]));
  await role('authenticated',B,'aal2'); assert.ok((await db.query("select * from public.begin_document_upload('trip',$1)",[B])).rows[0]);
});
test('client cannot invoke worker RPCs or grant itself a deletion claim', async () => {
  await role('authenticated');
  for (const sql of ['select * from public.claim_document_cleanup(1)',"select public.authorize_document_cleanup(gen_random_uuid(),gen_random_uuid())","select public.finish_document_cleanup(gen_random_uuid(),gen_random_uuid(),false)"]) await assert.rejects(db.query(sql));
});
test('expired operations fence late uploads and metadata commits', async () => {
  const j=await begin(); await object(j); await due(j); await claim(j);
  await assert.rejects(metadata(j)); await role('authenticated');
  const updated=await db.query('update storage.objects set updated_at=now() where name=$1 returning id',[j.storage_path]); assert.equal(updated.rows.length,0);
  const empty=await begin(); await due(empty); await assert.rejects(object(empty));
});
test('surviving metadata reference wins even if journal state was unexpectedly changed', async () => {
  const j=await begin(); await object(j); await metadata(j);
  await admin("update document_recovery.uploads set state='cleanup_requested',cleanup_after=now()-interval '1 day' where id=$1",[j.upload_id]);
  assert.equal(await claim(j),undefined); assert.equal((await state(j)).state,'committed');
});
test('metadata delete and durable cleanup intent commit together, including legacy files', async () => {
  const j=await begin(); await object(j); await metadata(j); await role('authenticated');
  await db.query('delete from public.travel_documents where storage_path=$1',[j.storage_path]);
  assert.equal((await state(j)).state,'cleanup_requested'); assert.equal(await claim(j),undefined);
  await due(j,'cleanup_after'); assert.ok(await claim(j));
});
test('existing four unjournaled orphan fixtures are never adopted or reclaimed', async () => {
  await role('service_role'); await db.query('select * from public.claim_document_cleanup(100)');
  const rows=(await admin("select name from storage.objects where name like $1",[A+'/legacy/orphan-%'])).rows;
  assert.equal(rows.length,4);
  assert.equal((await admin("select count(*)::integer as count from document_recovery.uploads where storage_path like $1",[A+'/legacy/orphan-%'])).rows[0].count,0);
});
test('old clients cannot create unjournaled private files or metadata after migration', async () => {
  await role('authenticated');
  await assert.rejects(db.query("insert into storage.objects(bucket_id,name,owner_id) values('travel-documents',$1,$2)",[A+'/legacy/new-upload',A]));
  await assert.rejects(db.query("insert into public.travel_documents(user_id,trip_id,file_name,file_size,storage_path,encryption_salt,encryption_iv) values($1,'trip','unjournaled',17,$2,'s','i')",[A,A+'/legacy/orphan-0']));
});
test('legacy referenced documents remain visible/editable; actual deletion alone creates durable intent', async () => {
  await role('authenticated');
  assert.equal((await db.query('select id from public.travel_documents where storage_path=$1',[A+'/legacy/referenced'])).rows.length,1);
  await db.query("update public.travel_documents set note='synthetic update' where storage_path=$1",[A+'/legacy/referenced']);
  await db.query('delete from public.travel_documents where storage_path=$1',[A+'/legacy/referenced']);
  assert.equal((await admin('select state from document_recovery.uploads where storage_path=$1',[A+'/legacy/referenced'])).rows[0].state,'cleanup_requested');
});
test('B cannot read A metadata or Storage even though both have authenticated access', async () => {
  const j=await begin();await object(j);await metadata(j);await role('authenticated',B,'aal2');
  assert.equal((await db.query('select id from public.travel_documents where storage_path=$1',[j.storage_path])).rows.length,0);
  assert.equal((await db.query('select id from storage.objects where name=$1',[j.storage_path])).rows.length,0);
});
test('delete rollback also rolls back the cleanup journal', async () => {
  const j=await begin();await object(j);await metadata(j);await role('authenticated');
  await db.exec('begin');await db.query('delete from public.travel_documents where storage_path=$1',[j.storage_path]);await db.exec('rollback');
  assert.equal((await state(j)).state,'committed');
});
test('installed function ACLs/search paths and journal permissions match least privilege', async () => {
  const result=await admin(`select p.proname,p.proconfig,
    has_function_privilege('anon',p.oid,'EXECUTE') as anon,
    has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated,
    has_function_privilege('service_role',p.oid,'EXECUTE') as service
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='document_recovery' or (n.nspname='public' and p.proname in
    ('begin_document_upload','abandon_document_upload','claim_document_cleanup','authorize_document_cleanup','finish_document_cleanup'))`);
  for(const row of result.rows){
    assert.equal(row.anon,false);assert.ok(row.proconfig.some(c=>c.startsWith('search_path=')));
    assert.equal(row.authenticated,['begin_document_upload','abandon_document_upload','write_allowed'].includes(row.proname));
    assert.equal(row.service,['claim_document_cleanup','authorize_document_cleanup','finish_document_cleanup'].includes(row.proname));
  }
  const table=(await admin("select has_table_privilege('authenticated','document_recovery.uploads','SELECT') as readable,has_table_privilege('authenticated','document_recovery.uploads','INSERT') as writable")).rows[0];
  assert.equal(table.readable,false);assert.equal(table.writable,false);
});
test('optional scheduling is explicit, requires Vault configuration and stores no secret values', async () => {
  await role('postgres');
  await db.exec(`create schema vault;create schema cron;create schema net;
    create table vault.decrypted_secrets(name text,decrypted_secret text);
    create table cron.jobs(name text primary key,schedule text,command text);
    create function net.http_post(url text,body jsonb default '{}'::jsonb,params jsonb default '{}'::jsonb,
      headers jsonb default '{}'::jsonb,timeout_milliseconds integer default 2000) returns bigint language sql as $$ select 1::bigint $$;
    create function cron.schedule(text,text,text) returns bigint language plpgsql as $$ begin
      insert into cron.jobs values($1,$2,$3) on conflict(name) do update set schedule=excluded.schedule,command=excluded.command;return 1;end $$;`);
  const sql=fs.readFileSync(path.join(root,'supabase/document-recovery-schedule.sql'),'utf8').replace(/create extension[^;]+;/g,'');
  await assert.rejects(db.exec(sql),/VAULT_CONFIGURATION_REQUIRED/);
  await db.query("insert into vault.decrypted_secrets values('document_recovery_url',$1),('document_recovery_secret',$2)",['https://synthetic.supabase.co/functions/v1/document-recovery','synthetic-scheduler-secret-test-only']);
  await db.exec(sql);await db.exec(sql);
  const jobs=(await db.query('select * from cron.jobs')).rows;assert.equal(jobs.length,1);
  assert.equal(jobs[0].command.includes('synthetic-scheduler-secret-test-only'),false);
  assert.equal(jobs[0].command.includes('SUPABASE_SERVICE_ROLE_KEY'),false);
  await db.exec(jobs[0].command);
});
test('stale A request authenticated as B cannot create any B journal', async () => {
  await role('authenticated',B,'aal2');
  await assert.rejects(db.query("select * from public.begin_document_upload('trip',$1)",[A]),/DOCUMENT_SESSION_CHANGED/);
});
test('explicit deletion binds the current timestamp of the same owned object', async () => {
  const j=await begin();await object(j);await metadata(j);
  await admin("update storage.objects set updated_at=updated_at+interval '1 second' where name=$1",[j.storage_path]);
  await role('authenticated');await db.query('delete from public.travel_documents where storage_path=$1',[j.storage_path]);
  await due(j,'cleanup_after');assert.ok(await claim(j));
});

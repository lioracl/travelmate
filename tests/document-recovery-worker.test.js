'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../supabase/functions/document-recovery/reconcile.mjs');
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', token='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const claim={ upload_id:id, user_id:id, object_id:id, claim_token:token, storage_path:id+'/__lifecycle_v1/'+id+'.vault' };
function fixture() {
  const calls=[], settings={ claims:[claim], authorized:true, failure:false, throws:false };
  const service={ rpc:async (name,args)=>{ calls.push([name,args]); return { data:name==='claim_document_cleanup'?settings.claims:name==='authorize_document_cleanup'?settings.authorized:null }; }, storage:{from:bucket=>({remove:async paths=>{ calls.push(['remove',bucket,paths]); if(settings.throws)throw new Error('lost reply'); return {error:settings.failure?new Error('offline'):null}; }})} };
  return {calls,settings,service};
}
test('worker removes only authorized database-issued owner-scoped claims',async()=>{
  const {reconcileDocuments}=await modulePromise, f=fixture(); await reconcileDocuments(f.service);
  assert.equal(f.calls[1][0],'authorize_document_cleanup');
  assert.deepEqual(f.calls[2],['remove','travel-documents',[claim.storage_path]]);
  assert.equal(f.calls[3][0],'finish_document_cleanup'); assert.equal(f.calls[3][1].p_failed,false);
});
test('referenced or expired claim never reaches Storage',async()=>{
  const {reconcileDocuments}=await modulePromise, f=fixture(); f.settings.authorized=false; await reconcileDocuments(f.service);
  assert.equal(f.calls.some(c=>c[0]==='remove'),false);
});
test('foreign path and traversal claims fail closed before authorization/deletion',async()=>{
  const {reconcileDocuments}=await modulePromise, f=fixture();
  f.settings.claims=[{...claim,storage_path:token+'/other/file'}, {...claim,storage_path:id+'/../other/file'}, {...claim,object_id:null}];
  await reconcileDocuments(f.service); assert.equal(f.calls.length,1);
});
test('cleanup errors and thrown transport failures finish as durable failures',async()=>{
  const {reconcileDocuments}=await modulePromise;
  for(const type of ['failure','throws']){const f=fixture();f.settings[type]=true;await reconcileDocuments(f.service);assert.equal(f.calls.at(-1)[1].p_failed,true);}
});
test('empty reconciliation is safe and repeated processing uses the same fenced claim',async()=>{
  const {reconcileDocuments}=await modulePromise, f=fixture(); await reconcileDocuments(f.service); f.settings.claims=[]; await reconcileDocuments(f.service);
  assert.equal(f.calls.filter(c=>c[0]==='remove').length,1);
});
test('scheduler endpoint refuses ordinary bearer tokens, missing secrets and GET',async()=>{
  const {recoveryHandler}=await modulePromise;
  const handler=recoveryHandler({getEnv:()=>'',createService:()=>{throw new Error('must not instantiate');}});
  assert.equal((await handler(new Request('https://example.invalid',{method:'POST',headers:{Authorization:'Bearer ordinary-user-token'}}))).status,401);
  assert.equal((await handler(new Request('https://example.invalid'))).status,405);
});
test('worker is disabled by default even with the scheduler secret',async()=>{
  const {recoveryHandler}=await modulePromise, secret='synthetic-recovery-secret-for-tests-only';
  const handler=recoveryHandler({getEnv:name=>name==='DOCUMENT_RECOVERY_SECRET'?secret:'',createService:()=>{throw new Error('disabled');}});
  assert.equal((await handler(new Request('https://example.invalid',{method:'POST',headers:{Authorization:'Bearer '+secret}}))).status,503);
});
test('authorized scheduler ignores supplied paths and returns aggregates without document data',async()=>{
  const {recoveryHandler}=await modulePromise, f=fixture(), secret='synthetic-recovery-secret-for-tests-only';
  const handler=recoveryHandler({getEnv:name=>name==='DOCUMENT_RECOVERY_SECRET'?secret:'true',createService:()=>f.service});
  const response=await handler(new Request('https://example.invalid',{method:'POST',headers:{Authorization:'Bearer '+secret},body:JSON.stringify({storage_path:token+'/private/object'})}));
  assert.equal(response.status,200);const body=await response.text();assert.equal(body.includes(id),false);assert.equal(body.includes(claim.storage_path),false);
  assert.deepEqual(f.calls.find(c=>c[0]==='remove')[2],[claim.storage_path]);
});

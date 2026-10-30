'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {plan,sign,readBundle}=require('../publisher.cjs');
const {publicKeyDigest}=require('../fixture-trust.cjs');
const COMMIT='a'.repeat(40),RUN_ID='INFRA-STAGE04-DIRECTORY-LIMIT-2026';
const WF='lioracl/travelmate/.github/workflows/qa-fixture-signing.yml@refs/heads/main';
function sample(t){
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'tm-qa-dirlimit-'));
  t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
  const repo=path.join(base,'repo'),source=path.join(repo,'qa-fixtures','approved'),scratch=path.join(base,'scratch');
  fs.mkdirSync(path.join(repo,'.git'),{recursive:true});fs.mkdirSync(source,{recursive:true});fs.mkdirSync(scratch);
  fs.writeFileSync(path.join(source,'smoke.txt'),'SIGNED SAMPLE ONLY');
  let ctx={eventName:'workflow_dispatch',repository:'lioracl/travelmate',ref:'refs/heads/main',sha:COMMIT,workflowRef:WF,runId:'7654321',runAttempt:'1',runnerEnvironment:'github-hosted',approvedCommit:COMMIT,approvedArtifactSha:'0'.repeat(64),qaRunId:RUN_ID};
  const digest=plan({ctx,sourceRoot:source,repoRoot:repo,scratchRoot:scratch,expectedDigestRequired:false}).sha256;
  ctx={...ctx,approvedArtifactSha:digest};
  const keys=crypto.generateKeyPairSync('ed25519'),pin=publicKeyDigest(keys.publicKey),now=Date.now();
  const root=path.join(scratch,'qa-signed');
  function create(){sign({ctx,sourceRoot:source,repoRoot:repo,scratchRoot:scratch,outputRoot:root,privateKeyBase64:keys.privateKey.export({format:'der',type:'pkcs8'}).toString('base64'),publisherSpkiSha256:pin,now});}
  function verify(){return readBundle({root,publisherPin:pin,approvedArtifactSha:digest,commit:COMMIT,expectedWorkflowRunId:ctx.runId,expectedWorkflowAttempt:ctx.runAttempt,expectedWorkflowRef:WF,now});}
  return {base,repo,source,scratch,root,create,verify,ctx};
}
function forbidUnboundedReaddir(root,fn){
  const old=fs.readdirSync;
  let unbounded=0;
  fs.readdirSync=function(p,...opts){
    if(typeof p==='string' && (path.resolve(p)===path.resolve(root) || path.resolve(p).startsWith(path.resolve(root)+path.sep))){
      unbounded++;
      throw Error('UNBOUNDED_DIRECTORY_LISTING');
    }
    return old.call(fs,p,...opts);
  };
  try{return fn();}finally{fs.readdirSync=old;assert.equal(unbounded,0,'untrusted bundle must be enumerated with bounded streaming directory reads');}
}
test('RED: valid signed package verification never loads untrusted directory entries without a bound',t=>{
  const a=sample(t);a.create();
  const verified=forbidUnboundedReaddir(a.root,a.verify);
  assert.equal(verified.runId,RUN_ID);
});
test('RED: unexpected extra top-level entries must be rejected with a bounded directory read',t=>{
  const a=sample(t);a.create();
  for(let i=0;i<12;i++)fs.writeFileSync(path.join(a.root,`unapproved-${i}.txt`),'X');
  forbidUnboundedReaddir(a.root,()=>assert.throws(a.verify,/UNEXPECTED_BUNDLE_LAYOUT|BUNDLE_DIRECTORY_QUOTA/));
});
test('RED: source publisher stops excessive empty directory trees before catalog/signing',t=>{
  const a=sample(t);
  for(let i=0;i<4097;i++)fs.mkdirSync(path.join(a.source,'folder'+String(i).padStart(5,'0')));
  assert.throws(()=>plan({ctx:a.ctx,sourceRoot:a.source,repoRoot:a.repo,scratchRoot:a.scratch}),/SOURCE_DIRECTORY_QUOTA|BUNDLE_DIRECTORY_QUOTA|PUBLISHER_DIRECTORY_QUOTA/);
});

'use strict';
// NEW independent RED regression: reject untrusted bundle metadata BEFORE
// allocating/reading attacker-controlled oversized or redirected files.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {plan,sign,readBundle}=require('../publisher.cjs');
const {publicKeyDigest}=require('../fixture-trust.cjs');
const RUN='INFRA-STAGE04-REVIEW-BOUND123';
const sha='a'.repeat(40);
function sample(t){
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'tm-bundle-read-bound-'));
 t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
 const repo=path.join(tmp,'repo'),src=path.join(repo,'qa-fixtures','approved'),scratch=path.join(tmp,'scratch');
 fs.mkdirSync(src,{recursive:true});fs.mkdirSync(scratch);fs.mkdirSync(path.join(repo,'.git'));
 fs.writeFileSync(path.join(src,'ok.txt'),'SYNTHETIC FIXTURE ONLY\n');
 const ctx={eventName:'workflow_dispatch',repository:'lioracl/travelmate',ref:'refs/heads/main',sha,
 workflowRef:'lioracl/travelmate/.github/workflows/qa-fixture-signing.yml@refs/heads/main',runId:'123456789',runAttempt:'1',runnerEnvironment:'github-hosted',
 approvedCommit:sha,approvedArtifactSha:'f'.repeat(64),qaRunId:RUN};
 ctx.approvedArtifactSha=plan({ctx,sourceRoot:src,repoRoot:repo,scratchRoot:scratch,expectedDigestRequired:false}).sha256;
 const kp=crypto.generateKeyPairSync('ed25519'),pin=publicKeyDigest(kp.publicKey);
 const root=path.join(scratch,'qa-signed');const now=Date.now();
 sign({ctx,sourceRoot:src,repoRoot:repo,scratchRoot:scratch,outputRoot:root,
 privateKeyBase64:kp.privateKey.export({format:'der',type:'pkcs8'}).toString('base64'),publisherSpkiSha256:pin,now});
 return {root,tmp,verify:()=>readBundle({root,publisherPin:pin,approvedArtifactSha:ctx.approvedArtifactSha,commit:sha,
 expectedWorkflowRunId:ctx.runId,expectedWorkflowAttempt:ctx.runAttempt,expectedWorkflowRef:ctx.workflowRef,now})};
}
function assertNoUnboundedRead(target,fn){
 const original=fs.readFileSync;
 let unsafeReads=0;
 fs.readFileSync=function(p,...args){
  if(typeof p==='string'&&path.resolve(p)===path.resolve(target)){
    unsafeReads++;
    throw Error('DETECTED_UNBOUNDED_METADATA_READ');
  }
  return original.call(fs,p,...args);
 };
 let actual;
 try{
  try{fn();actual=null;}catch(e){actual=e;}
 }finally{fs.readFileSync=original;}
 assert.equal(unsafeReads,0,'Untrusted metadata must be rejected using bounded fstat/open before readFileSync');
 assert.ok(actual instanceof Error,'Unexpected bundle metadata must be rejected');
 assert.match(actual.message,/BUNDLE|UNSAFE|UNEXPECTED|INVALID|METADATA/);
}
for(const [file,len] of [
 ['run-attestation.json',8193],
 ['run-attestation.sig',512*1024],
 ['publisher-public.pem',512*1024],
 ['artifact-provenance.json',512*1024],
 ['manifest.json',512*1024],
 ['manifest.sig',512*1024],
])test('RED metadata boundary: oversized '+file+' rejected BEFORE unbounded reading',t=>{
 const {root,verify}=sample(t),target=path.join(root,file);
 fs.writeFileSync(target,Buffer.alloc(len,65));
 assertNoUnboundedRead(target,verify);
});
test('RED metadata boundary: redirecting publisher public key outside bundle rejected BEFORE reading it',t=>{
 const {root,tmp,verify}=sample(t),target=path.join(root,'publisher-public.pem');
 const external=path.join(tmp,'outside-private-sentinel.txt');fs.writeFileSync(external,'DO-NOT-READ');
 fs.unlinkSync(target);fs.symlinkSync(external,target);
 assertNoUnboundedRead(target,verify);
});
test('RED metadata boundary: unrecognized extra file rejects before any signed metadata read',t=>{
 const {root,verify}=sample(t),untrusted=path.join(root,'extra-unapproved.txt');
 fs.writeFileSync(untrusted,Buffer.alloc(512*1024,65));
 const att=path.join(root,'run-attestation.json');
 assertNoUnboundedRead(att,verify);
});
test('RED metadata boundary: symlinked bundle root rejects before metadata read',t=>{
 const {root,tmp,verify}=sample(t),linked=path.join(tmp,'linked-bundle-root');
 fs.symlinkSync(root,linked,'dir');
 const original=fs.readFileSync;let unsafe=0;
 fs.readFileSync=function(p,...args){if(typeof p==='string'&&p.startsWith(linked)){unsafe++;throw Error('DETECTED_REDIRECTED_ROOT_READ')}return original.call(fs,p,...args)};
 try{
  assert.throws(()=>readBundle({root:linked,publisherPin:'a'.repeat(64),approvedArtifactSha:'a'.repeat(64),commit:sha,
    expectedWorkflowRunId:'123456789',expectedWorkflowAttempt:'1',
    expectedWorkflowRef:'lioracl/travelmate/.github/workflows/qa-fixture-signing.yml@refs/heads/main'}),/UNSAFE_BUNDLE|ROOT|UNEXPECTED/);
  assert.equal(unsafe,0);
 }finally{fs.readFileSync=original;}
});

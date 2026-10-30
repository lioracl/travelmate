'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {plan,sign,readBundle}=require('../publisher.cjs');
const {publicKeyDigest}=require('../fixture-trust.cjs');
const COMMIT='a'.repeat(40);
const RUN='INFRA-STAGE04-CONSUMER-PARITY';
function setup(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'tm-qa-consumer-parity-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const repo=path.join(root,'repo'),source=path.join(repo,'qa-fixtures','approved'),scratch=path.join(root,'scratch');
  fs.mkdirSync(source,{recursive:true});fs.mkdirSync(path.join(repo,'.git'));fs.mkdirSync(scratch);
  fs.writeFileSync(path.join(source,'smoke.txt'),'VERIFIED-SYNTHETIC-FIXTURE\n');
  const ctx={eventName:'workflow_dispatch',repository:'lioracl/travelmate',ref:'refs/heads/main',sha:COMMIT,workflowRef:'lioracl/travelmate/.github/workflows/qa-fixture-signing.yml@refs/heads/main',runId:'41255678',runAttempt:'1',runnerEnvironment:'github-hosted',approvedCommit:COMMIT,approvedArtifactSha:'0'.repeat(64),qaRunId:RUN};
  return {root,repo,source,scratch,ctx};
}
function approval(io){const ctx={...io.ctx};ctx.approvedArtifactSha=plan({ctx,sourceRoot:io.source,repoRoot:io.repo,scratchRoot:io.scratch,expectedDigestRequired:false}).sha256;return ctx;}
function keyPair(){const k=crypto.generateKeyPairSync('ed25519');return {privateKeyBase64:k.privateKey.export({format:'der',type:'pkcs8'}).toString('base64'),publisherSpkiSha256:publicKeyDigest(k.publicKey)};}
function args(io,ctx,keys){return {ctx,sourceRoot:io.source,repoRoot:io.repo,scratchRoot:io.scratch,outputRoot:path.join(io.scratch,'qa-signed'),...keys,now:Date.now()};}
test('RED: signer must reject source containing an extra top-level empty directory that consumer would reject',t=>{
 const io=setup(t);fs.mkdirSync(path.join(io.source,'empty-but-unsigned'));
 assert.throws(()=>plan({ctx:io.ctx,sourceRoot:io.source,repoRoot:io.repo,scratchRoot:io.scratch,expectedDigestRequired:false}),/SOURCE_EMPTY_DIRECTORY_UNSIGNABLE/);
});
test('RED: nested empty directories must be rejected before an artifact hash is approved',t=>{
 const io=setup(t);fs.mkdirSync(path.join(io.source,'nested','deeper','empty'),{recursive:true});
 assert.throws(()=>plan({ctx:io.ctx,sourceRoot:io.source,repoRoot:io.repo,scratchRoot:io.scratch,expectedDigestRequired:false}),/SOURCE_EMPTY_DIRECTORY_UNSIGNABLE/);
});
test('RED: signer must not consume the private key or publish a bundle containing unsigned empty dirs',t=>{
 const io=setup(t);const ctx=approval(io);fs.mkdirSync(path.join(io.source,'untracked-empty'));
 // Older signer allowed this tree to pass if the approved digest matched.
 assert.throws(()=>sign({...args(io,ctx,{privateKeyBase64:'BAD',publisherSpkiSha256:'f'.repeat(64)})}),/SOURCE_EMPTY_DIRECTORY_UNSIGNABLE/);
 assert.equal(fs.existsSync(path.join(io.scratch,'qa-signed')),false);
});
test('valid populated nested tree is signed, self-verified and accepted by consumer',t=>{
 const io=setup(t);fs.mkdirSync(path.join(io.source,'photos'));fs.writeFileSync(path.join(io.source,'photos','fixture.txt'),'ANOTHER SYNTHETIC FILE');
 const ctx=approval(io),keys=keyPair(),a=args(io,ctx,keys);
 const out=sign(a);
 assert.equal(out.sha256,ctx.approvedArtifactSha);
 const verified=readBundle({root:out.outputRoot,publisherPin:keys.publisherSpkiSha256,approvedArtifactSha:ctx.approvedArtifactSha,commit:ctx.sha,expectedWorkflowRunId:ctx.runId,expectedWorkflowAttempt:ctx.runAttempt,expectedWorkflowRef:ctx.workflowRef,now:a.now});
 assert.equal(verified.runId,RUN);
});
test('RED: signer must not publish if an unapproved file appears in its staging directory before finalization',t=>{
 const io=setup(t),ctx=approval(io),keys=keyPair(),a=args(io,ctx,keys);
 const originalWrite=fs.writeFileSync;
 fs.writeFileSync=function(file,...rest){
   const result=originalWrite.call(fs,file,...rest);
   if(typeof file==='string'&&file.endsWith(path.sep+'run-attestation.sig')){
     originalWrite.call(fs,path.join(path.dirname(file),'injected-unapproved.txt'),'synthetic unsigned extra');
   }
   return result;
 };
 try{assert.throws(()=>sign(a),/UNEXPECTED_BUNDLE_LAYOUT/);}
 finally{fs.writeFileSync=originalWrite;}
 assert.equal(fs.existsSync(a.outputRoot),false);
});
const cp=require('node:child_process');
function githubEnv(ctx){return {GITHUB_EVENT_NAME:ctx.eventName,GITHUB_REPOSITORY:ctx.repository,GITHUB_REF:ctx.ref,GITHUB_SHA:ctx.sha,GITHUB_WORKFLOW_REF:ctx.workflowRef,GITHUB_RUN_ID:ctx.runId,GITHUB_RUN_ATTEMPT:ctx.runAttempt,RUNNER_ENVIRONMENT:ctx.runnerEnvironment,QA_APPROVED_COMMIT:ctx.approvedCommit,QA_APPROVED_ARTIFACT_SHA256:ctx.approvedArtifactSha,QA_RUN_ID:ctx.qaRunId};}
function publisherCli(io,ctx,mode,extraEnv={}){
 const args=[path.join(__dirname,'..','publisher.cjs'),mode,'--source',io.source,'--repo-root',io.repo,'--scratch',io.scratch];
 if(mode==='sign')args.push('--output',path.join(io.scratch,'qa-signed'));
 return cp.spawnSync(process.execPath,args,{encoding:'utf8',timeout:5000,env:{...process.env,...githubEnv(ctx),...extraEnv}});
}
test('real child process plan rejects an unsigned empty directory without a key',t=>{
 const io=setup(t);fs.mkdirSync(path.join(io.source,'unsigned-empty'));
 const r=publisherCli(io,io.ctx,'plan');
 assert.equal(r.status,2,r.stdout+'\n'+r.stderr);
 assert.match(r.stderr,/SOURCE_EMPTY_DIRECTORY_UNSIGNABLE/);
 assert.equal(fs.readdirSync(io.scratch).length,0,'temporary planned package must be cleaned');
});
test('real child process sign produces a package accepted by the strict consumer',t=>{
 const io=setup(t),ctx=approval(io),keys=keyPair();
 const r=publisherCli(io,ctx,'sign',{QA_FIXTURE_SIGNING_PKCS8_B64:keys.privateKeyBase64,QA_FIXTURE_PUBLISHER_SPKI_SHA256:keys.publisherSpkiSha256});
 assert.equal(r.status,0,r.stdout+'\n'+r.stderr);
 assert.match(r.stdout,/QA_FIXTURE_SIGN_PASS/);
 const out=readBundle({root:path.join(io.scratch,'qa-signed'),publisherPin:keys.publisherSpkiSha256,approvedArtifactSha:ctx.approvedArtifactSha,commit:ctx.sha,expectedWorkflowRunId:ctx.runId,expectedWorkflowAttempt:ctx.runAttempt,expectedWorkflowRef:ctx.workflowRef,now:Date.now()});
 assert.equal(out.runId,ctx.qaRunId);
});

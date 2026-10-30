'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const base=path.join(__dirname,'..');
const {plan,sign,readBundle}=require(path.join(base,'publisher.cjs'));
const {publicKeyDigest}=require(path.join(base,'fixture-trust.cjs'));
const COMMIT='a'.repeat(40),RUN='INFRA-STAGE04-BOUND-TEST';
const createFixture=(t)=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'tm-independent-'));t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
 const repo=path.join(tmp,'repo'),root=path.join(repo,'qa-fixtures','approved'),scratch=path.join(tmp,'scratch');
 fs.mkdirSync(root,{recursive:true});fs.mkdirSync(path.join(repo,'.git'));fs.mkdirSync(scratch);fs.writeFileSync(path.join(root,'smoke.txt'),'SIGNED TEST ONLY\n');
 const ctx={eventName:'workflow_dispatch',repository:'lioracl/travelmate',ref:'refs/heads/main',sha:COMMIT,workflowRef:'lioracl/travelmate/.github/workflows/qa-fixture-signing.yml@refs/heads/main',runId:'123456789',runAttempt:'1',runnerEnvironment:'github-hosted',approvedCommit:COMMIT,approvedArtifactSha:'0'.repeat(64),qaRunId:RUN};
 ctx.approvedArtifactSha=plan({ctx,sourceRoot:root,repoRoot:repo,scratchRoot:scratch,expectedDigestRequired:false}).sha256;
 const keys=crypto.generateKeyPairSync('ed25519'),pin=publicKeyDigest(keys.publicKey),output=path.join(scratch,'qa-signed'),now=Date.now();
 sign({ctx,sourceRoot:root,repoRoot:repo,scratchRoot:scratch,outputRoot:output,privateKeyBase64:keys.privateKey.export({format:'der',type:'pkcs8'}).toString('base64'),publisherSpkiSha256:pin,now});
 const verify=(over={})=>readBundle({root:output,publisherPin:pin,approvedArtifactSha:ctx.approvedArtifactSha,commit:COMMIT,expectedWorkflowRunId:ctx.runId,expectedWorkflowAttempt:ctx.runAttempt,expectedWorkflowRef:ctx.workflowRef,now,...over});
 return {output,ctx,verify};
};

test('RED: unsigned artifact provenance must not allow replay of signed bytes as a different GitHub workflow run',t=>{
 const f=createFixture(t),auditPath=path.join(f.output,'artifact-provenance.json'),audit=JSON.parse(fs.readFileSync(auditPath));
 audit.workflowRunId='987654321';fs.writeFileSync(auditPath,JSON.stringify(audit));
 assert.throws(()=>f.verify({expectedWorkflowRunId:'987654321'}),/RUN_BINDING_NOT_SIGNED|SIGNED_RUN_ATTESTATION_MISMATCH/);
});
test('RED: unsigned artifact provenance must not allow a different GitHub retry attempt',t=>{
 const f=createFixture(t),auditPath=path.join(f.output,'artifact-provenance.json'),audit=JSON.parse(fs.readFileSync(auditPath));
 audit.workflowAttempt='2';fs.writeFileSync(auditPath,JSON.stringify(audit));
 assert.throws(()=>f.verify({expectedWorkflowAttempt:'2'}),/RUN_BINDING_NOT_SIGNED|SIGNED_RUN_ATTESTATION_MISMATCH/);
});
test('RED: extra unsigned top-level artifact content must cause signed-bundle rejection',t=>{
 const f=createFixture(t);fs.writeFileSync(path.join(f.output,'extra-unapproved.js'),'UNSIGNED BUNDLE INJECTION');
 assert.throws(()=>f.verify(),/UNEXPECTED_BUNDLE_LAYOUT|EXTRA_BUNDLE_FILES/);
});

test('signed run envelope cannot be stripped or replaced with unsigned metadata',t=>{
 const f=createFixture(t);
 fs.rmSync(path.join(f.output,'run-attestation.sig'));
 assert.throws(()=>f.verify(),/ENOENT|SIGNED_RUN_ATTESTATION|UNEXPECTED_BUNDLE_LAYOUT/);
});
test('signed run envelope rejects altered workflow run ID even if attacker forges metadata and signature bytes',t=>{
 const f=createFixture(t),file=path.join(f.output,'run-attestation.json'),att=JSON.parse(fs.readFileSync(file));
 att.workflowRunId='987654321';fs.writeFileSync(file,JSON.stringify(att)+'\n');
 const auditFile=path.join(f.output,'artifact-provenance.json'),audit=JSON.parse(fs.readFileSync(auditFile));audit.workflowRunId='987654321';fs.writeFileSync(auditFile,JSON.stringify(audit));
 assert.throws(()=>f.verify({expectedWorkflowRunId:'987654321'}),/SIGNED_RUN_ATTESTATION/);
});
test('signed bundle cannot contain unsigned extra run directory even if its signed manifest is intact',t=>{
 const f=createFixture(t);
 fs.mkdirSync(path.join(f.output,f.ctx.qaRunId,'other-dir'));
 assert.throws(()=>f.verify(),/UNEXPECTED_BUNDLE_LAYOUT/);
});
test('signed bundle cannot contain unsigned empty directory within www',t=>{
 const f=createFixture(t);
 fs.mkdirSync(path.join(f.output,f.ctx.qaRunId,'www','extra-empty'));
 assert.throws(()=>f.verify(),/UNEXPECTED_BUNDLE_LAYOUT|UNEXPECTED_FIXTURE_TREE/);
});

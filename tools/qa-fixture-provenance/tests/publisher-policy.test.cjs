'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const crypto=require('node:crypto');
const {exactInput,runContextFromEnv,plan,sign,readBundle,inventoryHash,copyTrustedFixtures}=require('../publisher.cjs');
const {publicKeyDigest}=require('../fixture-trust.cjs');
const sha=(txt)=>crypto.createHash('sha256').update(txt).digest('hex');
const COMMIT='a'.repeat(40), SHA='b'.repeat(64), RUN='INFRA-STAGE04-TEST-RUN-ABC123';
function ctx(over={}){return {eventName:'workflow_dispatch',repository:'lioracl/travelmate',ref:'refs/heads/main',sha:COMMIT,workflowRef:'lioracl/travelmate/.github/workflows/qa-fixture-signing.yml@refs/heads/main',runId:'123456789',runAttempt:'1',runnerEnvironment:'github-hosted',approvedCommit:COMMIT,approvedArtifactSha:SHA,qaRunId:RUN,...over};}
function tempRepo(t){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'tma-qa-issuer-'));
  t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const repo=path.join(temp,'repo'),source=path.join(repo,'qa-fixtures','approved'),scratch=path.join(temp,'scratch');
  fs.mkdirSync(source,{recursive:true});fs.mkdirSync(scratch);fs.mkdirSync(path.join(repo,'.git'));
  fs.writeFileSync(path.join(source,'smoke.txt'),'APPROVED SYNTHETIC QA ONLY\n');
  return {temp,repo,source,scratch};
}
function digestFor(t){const io=tempRepo(t),c=ctx();const planRes=plan({ctx:c,sourceRoot:io.source,repoRoot:io.repo,scratchRoot:io.scratch,expectedDigestRequired:false});return {io,c:{...c,approvedArtifactSha:planRes.sha256},digest:planRes.sha256};}
function testKeys(){const pair=crypto.generateKeyPairSync('ed25519');return {privateKeyBase64:pair.privateKey.export({format:'der',type:'pkcs8'}).toString('base64'),publisherSpkiSha256:publicKeyDigest(pair.publicKey)}}
test('accepts explicit protected main workflow_dispatch, exact commit, hosted runner',()=>assert.equal(exactInput(ctx()),true));
for(const [name,field,value] of [
 ['untrusted PR event','eventName','pull_request'],['pull_request_target event','eventName','pull_request_target'],
 ['fork or other repo','repository','evilon/travelmate'],['untrusted preview branch','ref','refs/heads/preview'],
 ['untrusted tag','ref','refs/tags/v1'],['wrong approved commit','approvedCommit','b'.repeat(40)],
 ['wrong current commit','sha','b'.repeat(40)],['unsigned artifact','approvedArtifactSha',''],
 ['wrong workflow file','workflowRef','lioracl/travelmate/.github/workflows/other.yml@refs/heads/main'],
 ['renamed workflow branch','workflowRef','lioracl/travelmate/.github/workflows/qa-fixture-signing.yml@refs/heads/preview'],
 ['self-hosted runner','runnerEnvironment','self-hosted'],['missing run ID','runId','no'],
 ['invalid attempt','runAttempt','0'],['unsafe QA run id','qaRunId','../../etc/passwd']
])test(`rejects ${name} before fixture source access`,()=>assert.throws(()=>exactInput(ctx({[field]:value}))));
test('run context only uses platform-provided values plus explicit reviewed inputs',()=>{
 const e={GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REPOSITORY:'lioracl/travelmate',GITHUB_REF:'refs/heads/main',GITHUB_SHA:COMMIT,GITHUB_WORKFLOW_REF:ctx().workflowRef,GITHUB_RUN_ID:'123456789',GITHUB_RUN_ATTEMPT:'1',RUNNER_ENVIRONMENT:'github-hosted',QA_APPROVED_COMMIT:COMMIT,QA_APPROVED_ARTIFACT_SHA256:SHA,QA_RUN_ID:RUN};
 assert.deepEqual(runContextFromEnv(e),ctx());
});
test('digest deterministically includes commit, runId and every fixture byte',t=>{
 const {io,c,digest}=digestFor(t);
 assert.equal(digest.length,64);
 assert.deepEqual(plan({ctx:c,sourceRoot:io.source,repoRoot:io.repo,scratchRoot:io.scratch}).sha256,digest);
 assert.notEqual(inventoryHash({commit:'f'.repeat(40),runId:c.qaRunId,files:{'smoke.txt':{size:1,sha256:'0'.repeat(64)}}}),digest);
 assert.throws(()=>plan({ctx:{...c,approvedArtifactSha:'c'.repeat(64)},sourceRoot:io.source,repoRoot:io.repo,scratchRoot:io.scratch}),/EXPECTED_ARTIFACT_SHA_MISMATCH/);
});
test('changing a single approved file after external digest approval fails before key use',t=>{
 const {io,c}=digestFor(t);fs.appendFileSync(path.join(io.source,'smoke.txt'),'TAMPER');
 assert.throws(()=>sign({ctx:c,sourceRoot:io.source,repoRoot:io.repo,scratchRoot:io.scratch,outputRoot:path.join(io.scratch,'qa-signed'),privateKeyBase64:'BAD',publisherSpkiSha256:SHA,now:Date.now()}),/EXPECTED_ARTIFACT_SHA_MISMATCH/);
});
test('a signing job has no key by default, and a wrong protected public pin fails closed',t=>{
 const {io,c}=digestFor(t),k=testKeys();
 const args={ctx:c,sourceRoot:io.source,repoRoot:io.repo,scratchRoot:io.scratch,outputRoot:path.join(io.scratch,'qa-signed'),now:Date.now()};
 assert.throws(()=>sign({...args,publisherSpkiSha256:k.publisherSpkiSha256}),/SIGNING_KEY_NOT_PROVISIONED/);
 assert.throws(()=>sign({...args,privateKeyBase64:k.privateKeyBase64,publisherSpkiSha256:SHA}),/PUBLISHER_KEY_DOES_NOT_MATCH_PROTECTED_PIN/);
});
test('signed bundle has exact external artifact digest, pinned Ed25519 pubkey and 15-minute TTL',t=>{
 const {io,c,digest}=digestFor(t),k=testKeys();const now=Date.now(),root=path.join(io.scratch,'qa-signed');
 const result=sign({ctx:c,sourceRoot:io.source,repoRoot:io.repo,scratchRoot:io.scratch,outputRoot:root,...k,now});
 assert.equal(result.sha256,digest);
 assert.equal(result.publisherSpkiSha256,k.publisherSpkiSha256);
 const bundle=readBundle({root,expectedWorkflowRunId:'123456789',expectedWorkflowAttempt:'1',expectedWorkflowRef:c.workflowRef,publisherPin:k.publisherSpkiSha256,approvedArtifactSha:digest,commit:COMMIT,now});
 assert.equal(bundle.runId,RUN);
 assert.deepEqual(fs.readdirSync(root).sort(),['artifact-provenance.json','manifest.json','manifest.sig','publisher-public.pem','run-attestation.json','run-attestation.sig',RUN].sort());
 assert.equal(fs.readFileSync(path.join(root,'manifest.sig')).length,64);
 assert.equal(fs.readFileSync(path.join(root,'manifest.json')).includes(Buffer.from('PRIVATE KEY')),false);
 assert.throws(()=>readBundle({root,expectedWorkflowRunId:'123456789',expectedWorkflowAttempt:'1',expectedWorkflowRef:c.workflowRef,publisherPin:k.publisherSpkiSha256,approvedArtifactSha:digest,commit:COMMIT,now:now+15*60*1000+1}),/MANIFEST_EXPIRED_OR_FUTURE|SIGNED_RUN_ATTESTATION_EXPIRED/);
});
test('approved bytes tampered after signing fail closed even when size unchanged',t=>{
 const {io,c,digest}=digestFor(t),k=testKeys(),root=path.join(io.scratch,'qa-signed');
 const now=Date.now();sign({ctx:c,sourceRoot:io.source,repoRoot:io.repo,scratchRoot:io.scratch,outputRoot:root,...k,now});
 const file=path.join(root,RUN,'www','smoke.txt');const str=fs.readFileSync(file);str[0]^=1;fs.writeFileSync(file,str);
 assert.throws(()=>readBundle({root,expectedWorkflowRunId:'123456789',expectedWorkflowAttempt:'1',expectedWorkflowRef:c.workflowRef,publisherPin:k.publisherSpkiSha256,approvedArtifactSha:digest,commit:COMMIT,now}),/SIGNED_FILE_BYTES_MUTATED/);
});
test('wrong run id, wrong trusted commit, wrong artifact SHA and wrong pubkey are rejected',t=>{
 const {io,c,digest}=digestFor(t),k=testKeys(),root=path.join(io.scratch,'qa-signed'),now=Date.now();
 sign({ctx:c,sourceRoot:io.source,repoRoot:io.repo,scratchRoot:io.scratch,outputRoot:root,...k,now});
 assert.throws(()=>readBundle({root,expectedWorkflowRunId:'123456789',expectedWorkflowAttempt:'1',expectedWorkflowRef:c.workflowRef,publisherPin:'f'.repeat(64),approvedArtifactSha:digest,commit:COMMIT,now}),/BUNDLE_PUBLISHER_UNPINNED/);
 assert.throws(()=>readBundle({root,expectedWorkflowRunId:'123456789',expectedWorkflowAttempt:'1',expectedWorkflowRef:c.workflowRef,publisherPin:k.publisherSpkiSha256,approvedArtifactSha:'f'.repeat(64),commit:COMMIT,now}),/BUNDLE_PROVENANCE_UNAPPROVED|SIGNED_RUN_ATTESTATION_MISMATCH/);
 assert.throws(()=>readBundle({root,expectedWorkflowRunId:'123456789',expectedWorkflowAttempt:'1',expectedWorkflowRef:c.workflowRef,publisherPin:k.publisherSpkiSha256,approvedArtifactSha:digest,commit:'b'.repeat(40),now}),/BUNDLE_PROVENANCE_UNAPPROVED|SIGNED_RUN_ATTESTATION_MISMATCH/);
});
test('attacker cannot forge manifest by editing provenance JSON or replacing signed content',t=>{
 const {io,c,digest}=digestFor(t),k=testKeys(),root=path.join(io.scratch,'qa-signed'),now=Date.now();
 sign({ctx:c,sourceRoot:io.source,repoRoot:io.repo,scratchRoot:io.scratch,outputRoot:root,...k,now});
 const p=path.join(root,'artifact-provenance.json');const audit=JSON.parse(fs.readFileSync(p));audit.commit='b'.repeat(40);fs.writeFileSync(p,JSON.stringify(audit));
 assert.throws(()=>readBundle({root,expectedWorkflowRunId:'123456789',expectedWorkflowAttempt:'1',expectedWorkflowRef:c.workflowRef,publisherPin:k.publisherSpkiSha256,approvedArtifactSha:digest,commit:COMMIT,now}),/BUNDLE_PROVENANCE_UNAPPROVED|SIGNED_RUN_ATTESTATION_MISMATCH/);
});
test('source directory escaping repo, unexpected directory, and unreadable identity are rejected',t=>{
 const {io,c}=digestFor(t);const other=path.join(io.temp,'elsewhere');fs.mkdirSync(other);
 assert.throws(()=>plan({ctx:c,sourceRoot:other,repoRoot:io.repo,scratchRoot:io.scratch}),/UNAPPROVED_SOURCE_ROOT/);
 fs.rmSync(path.join(io.repo,'.git'),{recursive:true,force:true});
 assert.throws(()=>plan({ctx:c,sourceRoot:io.source,repoRoot:io.repo,scratchRoot:io.scratch}),/NOT_A_CHECKED_OUT_REPOSITORY/);
});
test('symlink source is rejected; hardlink source is rejected',t=>{
 const {io,c}=digestFor(t);const s=path.join(io.source,'sym.txt'),h=path.join(io.source,'link.txt');
 fs.symlinkSync(path.join(io.source,'smoke.txt'),s);
 assert.throws(()=>plan({ctx:c,sourceRoot:io.source,repoRoot:io.repo,scratchRoot:io.scratch}),/SOURCE_LINK_FORBIDDEN/);
 fs.rmSync(s);fs.linkSync(path.join(io.source,'smoke.txt'),h);
 assert.throws(()=>plan({ctx:c,sourceRoot:io.source,repoRoot:io.repo,scratchRoot:io.scratch}),/SOURCE_HARDLINK_OR_SPECIAL_FILE/);
});
test('destination cannot be an existing directory or overwritten, even with correct credentials',t=>{
 const {io,c}=digestFor(t),k=testKeys();const out=path.join(io.scratch,'qa-signed');fs.mkdirSync(out);
 assert.throws(()=>sign({ctx:c,sourceRoot:io.source,repoRoot:io.repo,scratchRoot:io.scratch,outputRoot:out,...k,now:Date.now()}),/OUTPUT_DIR_MUST_BE_UNIQUE/);
});
test('signer refuses output outside runner scratch, including repository checkout',t=>{
 const {io,c}=digestFor(t),k=testKeys();
 for(const out of [path.join(io.temp,'out'),path.join(io.repo,'qa-signed')]){
  assert.throws(()=>sign({ctx:c,sourceRoot:io.source,repoRoot:io.repo,scratchRoot:io.scratch,outputRoot:out,...k,now:Date.now()}),/OUTPUT_NOT_ISOLATED_RUNNER_TEMP/);
 }
});
test('signed bundle rejects extra unapproved file added after publisher signed it',t=>{
 const {io,c,digest}=digestFor(t),k=testKeys(),root=path.join(io.scratch,'qa-signed'),now=Date.now();
 sign({ctx:c,sourceRoot:io.source,repoRoot:io.repo,scratchRoot:io.scratch,outputRoot:root,...k,now});
 fs.writeFileSync(path.join(root,RUN,'www','rogue.txt'),'UNAPPROVED');
 assert.throws(()=>readBundle({root,expectedWorkflowRunId:'123456789',expectedWorkflowAttempt:'1',expectedWorkflowRef:c.workflowRef,publisherPin:k.publisherSpkiSha256,approvedArtifactSha:digest,commit:COMMIT,now}),/SIGNED_BUNDLE_UNEXPECTED_FILE_INVENTORY|UNEXPECTED_FIXTURE_TREE_FILE/);
});
test('no production signing material in source or workflow',()=>{
 const source=fs.readFileSync(path.resolve(__dirname,'../publisher.cjs'),'utf8');
 assert.doesNotMatch(source,/BEGIN (?:OPENSSH|PRIVATE|RSA PRIVATE|EC PRIVATE) KEY/);
 assert.doesNotMatch(source,/generateKeyPairSync/);
});
test('untrusted or missing GitHub run metadata cannot authenticate a signed artifact',t=>{
 const {io,c,digest}=digestFor(t),k=testKeys(),root=path.join(io.scratch,'qa-signed'),now=Date.now();
 sign({ctx:c,sourceRoot:io.source,repoRoot:io.repo,scratchRoot:io.scratch,outputRoot:root,...k,now});
 const base={root,publisherPin:k.publisherSpkiSha256,approvedArtifactSha:digest,commit:COMMIT,now};
 assert.throws(()=>readBundle(base),/TRUSTED_GITHUB_RUN_PROVENANCE_REQUIRED/);
 assert.throws(()=>readBundle({...base,expectedWorkflowRunId:'999',expectedWorkflowAttempt:'1',expectedWorkflowRef:c.workflowRef}),/GITHUB_WORKFLOW_RUN_MISMATCH|SIGNED_RUN_ATTESTATION_MISMATCH/);
 assert.throws(()=>readBundle({...base,expectedWorkflowRunId:c.runId,expectedWorkflowAttempt:'2',expectedWorkflowRef:c.workflowRef}),/GITHUB_WORKFLOW_RUN_MISMATCH|SIGNED_RUN_ATTESTATION_MISMATCH/);
 const auditPath=path.join(root,'artifact-provenance.json');const audit=JSON.parse(fs.readFileSync(auditPath));
 audit.workflowRunId='999';fs.writeFileSync(auditPath,JSON.stringify(audit));
 assert.throws(()=>readBundle({...base,expectedWorkflowRunId:c.runId,expectedWorkflowAttempt:c.runAttempt,expectedWorkflowRef:c.workflowRef}),/GITHUB_WORKFLOW_RUN_MISMATCH|SIGNED_RUN_ATTESTATION_MISMATCH/);
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const EventEmitter=require('node:events');
const {plan,sign}=require('../publisher.cjs');
const {verifyFixtureManifest,publicKeyDigest}=require('../test-fixtures/fixture-trust.cjs');
const {makeHandler}=require('../test-fixtures/v4b-static-server.cjs');
const commit='a'.repeat(40),runId='INFRA-STAGE04-BUNDLE-CONSUMER-2026';
function prep(t){
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'qa-v4b-consumer-'));
 t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 const repo=path.join(base,'repo'),source=path.join(repo,'qa-fixtures','approved'),scratch=path.join(base,'scratch');
 fs.mkdirSync(path.join(repo,'.git'),{recursive:true});fs.mkdirSync(source,{recursive:true});fs.mkdirSync(scratch);
 fs.writeFileSync(path.join(source,'smoke.txt'),'TRAVELMATE-SYNTHETIC');
 const ctx={eventName:'workflow_dispatch',repository:'lioracl/travelmate',ref:'refs/heads/main',sha:commit,workflowRef:'lioracl/travelmate/.github/workflows/qa-fixture-signing.yml@refs/heads/main',runId:'123456789',runAttempt:'1',runnerEnvironment:'github-hosted',approvedCommit:commit,approvedArtifactSha:'0'.repeat(64),qaRunId:runId};
 ctx.approvedArtifactSha=plan({ctx,sourceRoot:source,repoRoot:repo,scratchRoot:scratch,expectedDigestRequired:false}).sha256;
 const keys=crypto.generateKeyPairSync('ed25519'),publisherSpkiSha256=publicKeyDigest(keys.publicKey),now=Date.now(),outputRoot=path.join(scratch,'qa-signed');
 sign({ctx,sourceRoot:source,repoRoot:repo,scratchRoot:scratch,outputRoot,privateKeyBase64:keys.privateKey.export({format:'der',type:'pkcs8'}).toString('base64'),publisherSpkiSha256,now});
 const root=path.join(outputRoot,runId,'www');
 const verifiedSet=verifyFixtureManifest({root,manifestBytes:fs.readFileSync(path.join(outputRoot,'manifest.json')),signature:fs.readFileSync(path.join(outputRoot,'manifest.sig')),publicKey:fs.readFileSync(path.join(outputRoot,'publisher-public.pem')),pinnedPublicKeySha256:publisherSpkiSha256,expectedArtifactSha256:ctx.approvedArtifactSha,now});
 return {base,root,outputRoot,verifiedSet,ctx,publisherSpkiSha256,now};
}
class Res extends EventEmitter{
 constructor(){super();this.code=null;this.headers={};this.chunks=[];this.done=new Promise((resolve,reject)=>{this.resolve=resolve;this.reject=reject});this.closed=false}
 writeHead(code,headers){this.code=code;this.headers=headers;return this}
 write(buf){if(buf!==null&&buf!==undefined&&buf!=='')this.chunks.push(Buffer.from(buf));return true}
 end(buf){if(this.closed)return this;this.write(buf);this.closed=true;this.emit('finish');this.resolve({code:this.code,headers:this.headers,body:Buffer.concat(this.chunks).toString('utf8')});return this}
 destroy(err){if(this.closed)return this;this.closed=true;this.emit('close');this.reject(err||new Error('CLOSED'));return this}
}
async function req(root,verifiedSet,url,method='GET'){
 const res=new Res();makeHandler(root,verifiedSet)({url,method,headers:{host:'127.0.0.1:4173'}},res);
 return await res.done;
}
test('V4B existing consumer accepts externally signed GitHub-style fixture GET and HEAD',async t=>{
 const a=prep(t);const get=await req(a.root,a.verifiedSet,'/smoke.txt');
 assert.equal(get.code,200);assert.equal(get.body,'TRAVELMATE-SYNTHETIC');
 const head=await req(a.root,a.verifiedSet,'/smoke.txt','HEAD');assert.equal(head.code,200);assert.equal(head.body,'');
 assert.equal(head.headers['Content-Length'],String(Buffer.byteLength(get.body)));
});
test('V4B consumer refuses unsigned sibling and same-sized modified signed file',async t=>{
 const a=prep(t);fs.writeFileSync(path.join(a.root,'unsigned.txt'),'UNTRUSTED');
 const r=await req(a.root,a.verifiedSet,'/unsigned.txt');assert.equal(r.code,403);
 fs.writeFileSync(path.join(a.root,'smoke.txt'),'TRAVELMATE-SYNTHETIC'.replace('T','X'));
 const changed=await req(a.root,a.verifiedSet,'/smoke.txt');assert.equal(changed.code,403);
});
test('V4B refuses wrong public-key pin and tampered signature before authorized handler exists',t=>{
 const a=prep(t),p=path.join(a.outputRoot,'manifest.json'),s=path.join(a.outputRoot,'manifest.sig'),pub=path.join(a.outputRoot,'publisher-public.pem');
 const input={root:a.root,manifestBytes:fs.readFileSync(p),signature:fs.readFileSync(s),publicKey:fs.readFileSync(pub),pinnedPublicKeySha256:'0'.repeat(64),expectedArtifactSha256:a.ctx.approvedArtifactSha,now:a.now};
 assert.throws(()=>verifyFixtureManifest(input),/TRUST_ANCHOR_MISMATCH/);
 input.pinnedPublicKeySha256=a.publisherSpkiSha256;input.signature[4]^=1;
 assert.throws(()=>verifyFixtureManifest(input),/INVALID_PUBLISHER_SIGNATURE/);
});

#!/usr/bin/env node
'use strict';
// ISOLATED DESIGN CANDIDATE. No key provisioning, network calls or deployment.
// The only code path that consumes the signing key is the explicitly selected
// `sign` mode. A public proof alone is insufficient to authorize signing.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const os=require('node:os');
const {
  canonicalManifest,publicKeyDigest,signManifestForOfflinePublisher,
  verifyFixtureManifest,catalogApprovedFixtureTree,validateManifest,safeName,readDirectoryLimited
}=require('./fixture-trust.cjs');

const EXPECTED_REPO='lioracl/travelmate';
const EXPECTED_WORKFLOW='.github/workflows/qa-fixture-signing.yml';
const HEX40=/^[0-9a-f]{40}$/;
const HEX64=/^[0-9a-f]{64}$/;
const RUN=/^INFRA-STAGE04-[A-Za-z0-9_-]{6,128}$/;
const SECRET_RE=/^[A-Za-z0-9+/]+={0,2}$/;
const OUT_FILENAME=['manifest.json','manifest.sig','publisher-public.pem','artifact-provenance.json','run-attestation.json','run-attestation.sig'];
const hash=(data)=>crypto.createHash('sha256').update(data).digest('hex');

// Signed GitHub Actions envelope binds the signed fixture manifest to one exact
// workflow run and attempt. The unsigned artifact-provenance.json is informational;
// it must never be the authority for workflow-run identity.
const RUN_ATTEST_AUDIENCE='travelmate:qa:github-run-attestation:v1';
const RUN_ATTEST_KEYS=['schema','audience','repository','workflowRef','workflowRunId','workflowAttempt','commit','qaRunId','artifactSha256','manifestSha256','publisherSpkiSha256','issuedAt','expiresAt'];
function canonicalRunAttestation(doc){
  if(!doc||typeof doc!=='object'||Array.isArray(doc)||Object.keys(doc).length!==RUN_ATTEST_KEYS.length||
    !RUN_ATTEST_KEYS.every(k=>Object.hasOwn(doc,k)))throw Error('SIGNED_RUN_ATTESTATION_SCHEMA_INVALID');
  if(doc.schema!==1||doc.audience!==RUN_ATTEST_AUDIENCE||doc.repository!==EXPECTED_REPO||
    doc.workflowRef!==`${EXPECTED_REPO}/${EXPECTED_WORKFLOW}@refs/heads/main`||
    !/^\d{1,20}$/.test(doc.workflowRunId)||!/^\d{1,4}$/.test(doc.workflowAttempt)||
    Number(doc.workflowAttempt)<1||!HEX40.test(doc.commit)||!RUN.test(doc.qaRunId)||
    !HEX64.test(doc.artifactSha256)||!HEX64.test(doc.manifestSha256)||
    !HEX64.test(doc.publisherSpkiSha256)||!Number.isSafeInteger(doc.issuedAt)||
    !Number.isSafeInteger(doc.expiresAt)||doc.expiresAt<=doc.issuedAt||
    doc.expiresAt-doc.issuedAt>15*60*1000)throw Error('SIGNED_RUN_ATTESTATION_FIELDS_INVALID');
  const ordered={};for(const k of RUN_ATTEST_KEYS)ordered[k]=doc[k];
  const bytes=Buffer.from(JSON.stringify(ordered)+'\n','utf8');
  if(bytes.length>8192)throw Error('SIGNED_RUN_ATTESTATION_OVERSIZED');
  return bytes;
}
function assertExactBundleLayout(root,qaRunId){
  if(!path.isAbsolute(root)||fs.realpathSync(root)!==root)throw Error('UNEXPECTED_BUNDLE_LAYOUT_ROOT');
  const expected=[...OUT_FILENAME,qaRunId].sort();
  if(JSON.stringify(readDirectoryLimited(root,expected.length,'UNEXPECTED_BUNDLE_LAYOUT').map(x=>x.name).sort())!==JSON.stringify(expected))
    throw Error('UNEXPECTED_BUNDLE_LAYOUT');
  for(const filename of OUT_FILENAME){
    const st=fs.lstatSync(path.join(root,filename),{bigint:true});
    if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1n)throw Error('UNEXPECTED_BUNDLE_LAYOUT_FILE');
  }
  const runPath=path.join(root,qaRunId),runStat=fs.lstatSync(runPath);
  if(!runStat.isDirectory()||runStat.isSymbolicLink()||
     JSON.stringify(readDirectoryLimited(runPath,1,'UNEXPECTED_BUNDLE_LAYOUT_RUN').map(x=>x.name))!==JSON.stringify(['www']))
    throw Error('UNEXPECTED_BUNDLE_LAYOUT_RUN');
  const wwwStat=fs.lstatSync(path.join(runPath,'www'));
  if(!wwwStat.isDirectory()||wwwStat.isSymbolicLink())throw Error('UNEXPECTED_BUNDLE_LAYOUT_WWW');
}
function assertExactSignedFixtureTree(www,files){
  const approvedFiles=new Set(Object.keys(files));
  const approvedDirs=new Set();
  for(const file of approvedFiles){
    if(!safeName(file))throw Error('UNEXPECTED_FIXTURE_TREE_FILE_NAME');
    const dirs=file.split('/');dirs.pop();
    let parent='';
    for(const dir of dirs){parent=parent?parent+'/'+dir:dir;approvedDirs.add(parent);}
  }
  let seenFiles=0,seenDirs=0;
  function check(directory,relative,depth){
    if(depth>8)throw Error('UNEXPECTED_FIXTURE_TREE_DEPTH');
    for(const entry of readDirectoryLimited(directory,4608)){
      const name=relative?relative+'/'+entry.name:entry.name;
      if(!safeName(name))throw Error('UNEXPECTED_FIXTURE_TREE_ENTRY');
      const full=path.join(directory,entry.name),st=fs.lstatSync(full,{bigint:true});
      if(st.isSymbolicLink())throw Error('UNEXPECTED_FIXTURE_TREE_SYMLINK');
      if(st.isDirectory()){
        if(!approvedDirs.has(name))throw Error('UNEXPECTED_FIXTURE_TREE_DIRECTORY');
        seenDirs++;if(seenDirs>4096)throw Error('UNEXPECTED_FIXTURE_TREE_QUOTA');
        check(full,name,depth+1);
      }else if(st.isFile()){
        if(!approvedFiles.has(name)||st.nlink!==1n)throw Error('UNEXPECTED_FIXTURE_TREE_FILE');
        seenFiles++;
        if(seenFiles>512)throw Error('UNEXPECTED_FIXTURE_TREE_QUOTA');
      }else throw Error('UNEXPECTED_FIXTURE_TREE_SPECIAL_FILE');
    }
  }
  check(www,'',0);
  if(seenFiles!==approvedFiles.size||seenDirs!==approvedDirs.size)
    throw Error('UNEXPECTED_FIXTURE_TREE_MISSING_ENTRY');
}
function exactInput(ctx){
  const required=['eventName','repository','ref','sha','workflowRef','runId','runAttempt','runnerEnvironment','approvedCommit','approvedArtifactSha','qaRunId'];
  if(!ctx||required.some(k=>typeof ctx[k]!=='string'||!ctx[k]))throw Error('MISSING_TRUSTED_RUN_CONTEXT');
  if(ctx.eventName!=='workflow_dispatch')throw Error('PR_OR_AUTOMATED_EVENT_FORBIDDEN');
  if(ctx.repository!==EXPECTED_REPO)throw Error('WRONG_REPOSITORY');
  if(ctx.ref!=='refs/heads/main')throw Error('UNPROTECTED_REF_OR_WRONG_BRANCH');
  if(!HEX40.test(ctx.approvedCommit)||!HEX40.test(ctx.sha)||ctx.approvedCommit!==ctx.sha)throw Error('APPROVED_COMMIT_SHA_MISMATCH');
  if(!HEX64.test(ctx.approvedArtifactSha))throw Error('APPROVED_ARTIFACT_SHA_MISSING');
  if(!RUN.test(ctx.qaRunId))throw Error('QA_RUN_ID_INVALID');
  if(!/^\d{1,20}$/.test(ctx.runId)||!/^\d{1,4}$/.test(ctx.runAttempt)||Number(ctx.runAttempt)<1)throw Error('GITHUB_RUN_ID_INVALID');
  if(ctx.runnerEnvironment!=='github-hosted')throw Error('SELF_HOSTED_SIGNER_FORBIDDEN');
  if(ctx.workflowRef!==`${EXPECTED_REPO}/${EXPECTED_WORKFLOW}@refs/heads/main`)throw Error('WORKFLOW_REF_NOT_PROTECTED_MAIN');
  return true;
}
function runContextFromEnv(env=process.env){
  return {
    eventName:env.GITHUB_EVENT_NAME,repository:env.GITHUB_REPOSITORY,ref:env.GITHUB_REF,
    sha:env.GITHUB_SHA,workflowRef:env.GITHUB_WORKFLOW_REF,runId:env.GITHUB_RUN_ID,
    runAttempt:env.GITHUB_RUN_ATTEMPT,runnerEnvironment:env.RUNNER_ENVIRONMENT,
    approvedCommit:env.QA_APPROVED_COMMIT,approvedArtifactSha:env.QA_APPROVED_ARTIFACT_SHA256,
    qaRunId:env.QA_RUN_ID
  };
}
function ensureRootInsideWorkspace(sourceRoot,repoRoot){
  const checked=fs.realpathSync(sourceRoot),base=fs.realpathSync(repoRoot);
  if(checked!==path.join(base,'qa-fixtures','approved')||checked===base)throw Error('UNAPPROVED_SOURCE_ROOT');
  const repoGit=path.join(base,'.git');
  // In a GitHub Actions checkout repoGit is present. Synthetic tests can use a
  // separate isolated `repoRoot` and create the .git folder themselves.
  if(!fs.existsSync(repoGit))throw Error('NOT_A_CHECKED_OUT_REPOSITORY');
  return checked;
}
function copyTrustedFixtures(source,dest){
  if(!path.isAbsolute(source)||!path.isAbsolute(dest))throw Error('ABSOLUTE_SOURCE_AND_DEST_REQUIRED');
  if(fs.existsSync(dest))throw Error('DESTINATION_MUST_NOT_PREEXIST');
  const orig=fs.lstatSync(source,{bigint:true});
  if(!orig.isDirectory()||orig.isSymbolicLink())throw Error('SOURCE_ROOT_UNSAFE');
  fs.mkdirSync(dest,{recursive:false,mode:0o700});
  let count=0,total=0,directoryCount=0,sawEmptyDirectory=false;const folded=new Set();
  function rec(input,output,rel,depth){
    if(depth>8)throw Error('SOURCE_TOO_DEEP');
    const entries=readDirectoryLimited(input,4608,'SOURCE_DIRECTORY_QUOTA');
    // The signed file inventory has no directory entries. A source-side empty
    // directory would be unsigned and rejected by the bundle consumer. Reject
    // it before the private key is loaded, rather than issuing an unusable
    // signed artifact.
    if(rel && entries.length===0)sawEmptyDirectory=true;
    for(const entry of entries){
      const name=rel?rel+'/'+entry.name:entry.name;
      if(!safeName(name)||folded.has(name.toLowerCase()))throw Error('UNSAFE_OR_COLLIDING_SOURCE_NAME');
      folded.add(name.toLowerCase());
      const file=path.join(input,entry.name),out=path.join(output,entry.name);
      const before=fs.lstatSync(file,{bigint:true});
      if(before.isSymbolicLink())throw Error('SOURCE_LINK_FORBIDDEN');
      if(before.isDirectory()){
        if(++directoryCount>4096)throw Error('SOURCE_DIRECTORY_QUOTA');
        fs.mkdirSync(out,{mode:0o700});rec(file,out,name,depth+1);continue;
      }
      if(!before.isFile()||before.nlink!==1n)throw Error('SOURCE_HARDLINK_OR_SPECIAL_FILE');
      if(before.size>32n*1024n*1024n)throw Error('SOURCE_FILE_SIZE_LIMIT');
      count++;total+=Number(before.size);
      if(count>512||total>64*1024*1024)throw Error('SOURCE_TREE_QUOTA');
      const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
      let data;
      try{
        const mid=fs.fstatSync(fd,{bigint:true});
        if(!equalMeta(before,mid))throw Error('SOURCE_CHANGED_BEFORE_READ');
        data=Buffer.alloc(Number(before.size));let off=0;
        while(off<data.length){const n=fs.readSync(fd,data,off,Math.min(65536,data.length-off),off);if(n===0)throw Error('SOURCE_TRUNCATED');off+=n;}
        const after=fs.fstatSync(fd,{bigint:true}),afterPath=fs.lstatSync(file,{bigint:true});
        if(!equalMeta(before,after)||!equalMeta(before,afterPath)||fs.realpathSync(file)!==file)throw Error('SOURCE_MUTATED_DURING_COPY');
      }finally{fs.closeSync(fd);}
      fs.writeFileSync(out,data,{flag:'wx',mode:0o600});
    }
  }
  rec(source,dest,'',0);
  // Keep the existing directory/file quota gates before the new consistency
  // rule. A huge tree must still fail with its original quota violation.
  if(sawEmptyDirectory)throw Error('SOURCE_EMPTY_DIRECTORY_UNSIGNABLE');
  if(count===0)throw Error('EMPTY_APPROVED_FIXTURE_TREE');
  return {count,total};
}
function equalMeta(a,b){return ['dev','ino','size','mode','mtimeNs','ctimeNs'].every(k=>typeof a[k]==='bigint'&&a[k]===b[k]);}
function inventoryHash({commit,runId,files}){
  if(!HEX40.test(commit)||!RUN.test(runId)||!files||typeof files!=='object'||Array.isArray(files))throw Error('BAD_INVENTORY_METADATA');
  const entries={};
  for(const name of Object.keys(files).sort()){
    if(!safeName(name)||!HEX64.test(files[name].sha256)||!Number.isSafeInteger(files[name].size))throw Error('BAD_INVENTORY_FILE');
    entries[name]={size:files[name].size,sha256:files[name].sha256};
  }
  return hash(Buffer.from('travelmate:qa:artifact-tree:v1\n'+JSON.stringify({repository:EXPECTED_REPO,commit,runId,files:entries})+'\n'));
}
function plan({ctx,sourceRoot,repoRoot,scratchRoot,expectedDigestRequired=true}){
  exactInput(ctx);
  ensureRootInsideWorkspace(sourceRoot,repoRoot);
  if(!path.isAbsolute(scratchRoot))throw Error('SCRATCH_MUST_BE_ABSOLUTE');
  const scratch=fs.realpathSync(scratchRoot);
  if(scratch.startsWith(fs.realpathSync(repoRoot)+path.sep))throw Error('SCRATCH_INSIDE_SOURCE_REPO');
  const base=fs.mkdtempSync(path.join(scratch,'travelmate-qa-plan-'));
  try{
    const run=path.join(base,ctx.qaRunId);fs.mkdirSync(run);
    const www=path.join(run,'www');copyTrustedFixtures(sourceRoot,www);
    const temp=catalogApprovedFixtureTree(www,{artifactSha256:'0'.repeat(64),issuedAt:1,expiresAt:2});
    const digest=inventoryHash({commit:ctx.sha,runId:ctx.qaRunId,files:temp.files});
    if(expectedDigestRequired && digest!==ctx.approvedArtifactSha)throw Error('EXPECTED_ARTIFACT_SHA_MISMATCH');
    return {sha256:digest,files:temp.files,commit:ctx.sha,runId:ctx.qaRunId};
  }finally{fs.rmSync(base,{recursive:true,force:true});}
}
function strictPrivateKeyFromB64(value){
  if(typeof value!=='string'||value.length<64||value.length>10000||!SECRET_RE.test(value)||value.length%4!==0)throw Error('SIGNING_KEY_NOT_PROVISIONED');
  const raw=Buffer.from(value,'base64');
  if(raw.toString('base64')!==value)throw Error('SIGNING_KEY_BAD_ENCODING');
  const privateKey=crypto.createPrivateKey({key:raw,format:'der',type:'pkcs8'});
  if(privateKey.asymmetricKeyType!=='ed25519')throw Error('SIGNING_KEY_NOT_ED25519');
  return privateKey;
}
function sign({ctx,sourceRoot,repoRoot,scratchRoot,outputRoot,privateKeyBase64,publisherSpkiSha256,now=Date.now()}){
  exactInput(ctx);
  if(!path.isAbsolute(outputRoot)||fs.existsSync(outputRoot))throw Error('OUTPUT_DIR_MUST_BE_UNIQUE');
  // The signer must never write to the checked-out repository or arbitrary paths.
  if(path.resolve(outputRoot)!==path.join(fs.realpathSync(scratchRoot),'qa-signed'))throw Error('OUTPUT_NOT_ISOLATED_RUNNER_TEMP');
  if(!HEX64.test(publisherSpkiSha256||''))throw Error('PRODUCTION_PUBLIC_PIN_UNPROVISIONED');
  // Fail before any output/key use if no external approved SHA matches bytes.
  const preflight=plan({ctx,sourceRoot,repoRoot,scratchRoot});
  const key=strictPrivateKeyFromB64(privateKeyBase64);
  const publicKey=crypto.createPublicKey(key);
  if(publicKeyDigest(publicKey)!==publisherSpkiSha256)throw Error('PUBLISHER_KEY_DOES_NOT_MATCH_PROTECTED_PIN');
  if(!Number.isSafeInteger(now)||now<1000000000000)throw Error('CLOCK_NOT_TRUSTED');
  const dir=path.dirname(outputRoot);
  fs.mkdirSync(dir,{recursive:true});
  const stage=fs.mkdtempSync(path.join(dir,'.qa-sign-stage-'));
  let published=false;
  try{
    const run=path.join(stage,ctx.qaRunId);fs.mkdirSync(run);
    const www=path.join(run,'www');copyTrustedFixtures(sourceRoot,www);
    const manifest=catalogApprovedFixtureTree(www,{artifactSha256:ctx.approvedArtifactSha,issuedAt:now,expiresAt:now+15*60*1000});
    const digest=inventoryHash({commit:ctx.sha,runId:ctx.qaRunId,files:manifest.files});
    if(digest!==ctx.approvedArtifactSha||digest!==preflight.sha256)throw Error('SOURCE_TREE_CHANGED_BEFORE_SIGN');
    validateManifest(manifest);
    const signed=signManifestForOfflinePublisher(manifest,key);
    const checked=verifyFixtureManifest({root:www,manifestBytes:signed.manifestBytes,signature:signed.signature,publicKey,pinnedPublicKeySha256:publisherSpkiSha256,expectedArtifactSha256:digest,now});
    if(checked.runId!==ctx.qaRunId)throw Error('SELF_VERIFY_FAILED');
    fs.writeFileSync(path.join(stage,OUT_FILENAME[0]),signed.manifestBytes,{flag:'wx',mode:0o600});
    fs.writeFileSync(path.join(stage,OUT_FILENAME[1]),signed.signature,{flag:'wx',mode:0o600});
    fs.writeFileSync(path.join(stage,OUT_FILENAME[2]),publicKey.export({type:'spki',format:'pem'}),{flag:'wx',mode:0o600});
    const audit={schema:1,repository:ctx.repository,commit:ctx.sha,workflowRef:ctx.workflowRef,workflowRunId:ctx.runId,workflowAttempt:ctx.runAttempt,runId:ctx.qaRunId,artifactSha256:digest,manifestSha256:hash(signed.manifestBytes),publisherSpkiSha256,issuedAt:manifest.issuedAt,expiresAt:manifest.expiresAt,files:manifest.files};
    fs.writeFileSync(path.join(stage,OUT_FILENAME[3]),JSON.stringify(audit,null,2)+'\n',{flag:'wx',mode:0o600});
    // Bind the actual workflow run and attempt to these exact *signed* fixture
    // bytes; an attacker cannot move a valid manifest into a different Actions
    // artifact and edit an unsigned audit JSON to claim the other run.
    const runAttestation={schema:1,audience:RUN_ATTEST_AUDIENCE,
      repository:ctx.repository,workflowRef:ctx.workflowRef,
      workflowRunId:ctx.runId,workflowAttempt:ctx.runAttempt,commit:ctx.sha,
      qaRunId:ctx.qaRunId,artifactSha256:digest,
      manifestSha256:audit.manifestSha256,publisherSpkiSha256,
      issuedAt:manifest.issuedAt,expiresAt:manifest.expiresAt};
    const attBytes=canonicalRunAttestation(runAttestation);
    fs.writeFileSync(path.join(stage,OUT_FILENAME[4]),attBytes,{flag:'wx',mode:0o600});
    fs.writeFileSync(path.join(stage,OUT_FILENAME[5]),crypto.sign(null,attBytes,key),{flag:'wx',mode:0o600});
    // Verify the exact staged bytes using the SAME strict reader that downstream
    // consumers use. A valid signature alone is insufficient if the package
    // contains unsigned directories, files, or mismatched producer metadata.
    const checkedBundle=readBundle({root:stage,publisherPin:publisherSpkiSha256,
      approvedArtifactSha:digest,commit:ctx.sha,expectedWorkflowRunId:ctx.runId,
      expectedWorkflowAttempt:ctx.runAttempt,expectedWorkflowRef:ctx.workflowRef,now});
    if(checkedBundle.runId!==ctx.qaRunId)throw Error('SIGNED_BUNDLE_SELF_VERIFY_FAILED');
    // Do not include any private material; operator must promote archive content
    // into an approved QA root separately, preserving runId and exact bytes.
    fs.renameSync(stage,outputRoot);published=true;
    return {sha256:digest,manifestSha256:audit.manifestSha256,publisherSpkiSha256,runId:ctx.qaRunId,outputRoot};
  }finally{if(!published)fs.rmSync(stage,{recursive:true,force:true});}
}
// A downloaded Actions artifact is untrusted. Do not read attacker-controlled
// metadata with readFileSync before size, type, and link safety checks.
// The exact layout and a single task-owned run directory are established
// before any metadata is opened; metadata is always read through a bounded fd.
const BUNDLE_META_MAX=Object.freeze({
  'run-attestation.json':8192,
  'run-attestation.sig':64,
  'publisher-public.pem':8192,
  'artifact-provenance.json':256*1024,
  'manifest.json':256*1024,
  'manifest.sig':64
});
function preflightBundleRoot(root){
  if(typeof root!=='string'||!path.isAbsolute(root)||fs.realpathSync(root)!==root)
    throw Error('UNSAFE_BUNDLE_METADATA_ROOT');
  const entries=readDirectoryLimited(root,OUT_FILENAME.length+1,'UNEXPECTED_BUNDLE_LAYOUT').map(x=>x.name);
  const matchingRunIds=entries.filter(x=>RUN.test(x));
  if(matchingRunIds.length!==1)throw Error('UNEXPECTED_BUNDLE_LAYOUT_RUN_COUNT');
  assertExactBundleLayout(root,matchingRunIds[0]);
  return matchingRunIds[0];
}
function metadataUnchanged(a,b){
  return a&&b&&['dev','ino','size','nlink','mode','mtimeNs','ctimeNs'].every(k=>
    typeof a[k]==='bigint'&&a[k]===b[k]);
}
function readBoundedBundleMetadata(root,filename){
  const max=BUNDLE_META_MAX[filename];
  if(!max||filename.includes('/')||filename.includes('\\'))throw Error('UNSAFE_BUNDLE_METADATA_NAME');
  const target=path.join(root,filename);
  const original=fs.lstatSync(target,{bigint:true});
  const exactSignature=filename.endsWith('.sig');
  if(!original.isFile()||original.isSymbolicLink()||original.nlink!==1n||
     original.size<1n||original.size>BigInt(max)||
     (exactSignature&&original.size!==64n))throw Error('UNSAFE_BUNDLE_METADATA_FILE');
  let fd=null;
  try{
    const flags=fs.constants.O_RDONLY|
      (Number.isInteger(fs.constants.O_NOFOLLOW)?fs.constants.O_NOFOLLOW:0);
    fd=fs.openSync(target,flags);
    const before=fs.fstatSync(fd,{bigint:true});
    if(!metadataUnchanged(original,before)||!before.isFile()||before.nlink!==1n)
      throw Error('UNSAFE_BUNDLE_METADATA_IDENTITY');
    const buf=Buffer.alloc(Number(before.size));
    let off=0;
    while(off<buf.length){
      const count=fs.readSync(fd,buf,off,buf.length-off,off);
      if(count<1)throw Error('UNSAFE_BUNDLE_METADATA_TRUNCATED');
      off+=count;
    }
    const after=fs.fstatSync(fd,{bigint:true});
    const pathAfter=fs.lstatSync(target,{bigint:true});
    if(!metadataUnchanged(before,after)||!metadataUnchanged(after,pathAfter)||
       !pathAfter.isFile()||pathAfter.isSymbolicLink()||fs.realpathSync(target)!==target)
      throw Error('UNSAFE_BUNDLE_METADATA_CHANGED');
    return buf;
  }finally{if(fd!==null)fs.closeSync(fd);}
}
function readBundle({root,publisherPin,approvedArtifactSha,commit,expectedWorkflowRunId,expectedWorkflowAttempt,expectedWorkflowRef,now=Date.now()}){
  // Expected values MUST be obtained independently from GitHub's authenticated
  // workflow/run/artifact API; signed bytes alone cannot attest environment
  // reviewer approval or live hosted-run success.
  if(!/^\d{1,20}$/.test(expectedWorkflowRunId||'')||
     !/^\d{1,4}$/.test(expectedWorkflowAttempt||'')||
     expectedWorkflowRef!==`${EXPECTED_REPO}/${EXPECTED_WORKFLOW}@refs/heads/main`)
    throw Error('TRUSTED_GITHUB_RUN_PROVENANCE_REQUIRED');
  if(!HEX40.test(commit||'')||!HEX64.test(approvedArtifactSha||'')||!HEX64.test(publisherPin||''))
    throw Error('TRUSTED_APPROVAL_AND_PUBLISHER_PIN_REQUIRED');
  if(!Number.isSafeInteger(now))throw Error('TRUSTED_CLOCK_REQUIRED');

  const observedRunId=preflightBundleRoot(root);
  // Confirm all run/attempt metadata is signed, NOT merely included in the
  // unsigned informational JSON. Refuse a missing or malformed attestation.
  const attBytes=readBoundedBundleMetadata(root,'run-attestation.json');
  if(attBytes.length>8192)throw Error('SIGNED_RUN_ATTESTATION_OVERSIZED');
  let att;
  try{att=JSON.parse(attBytes.toString('utf8'));}
  catch{throw Error('SIGNED_RUN_ATTESTATION_JSON_INVALID');}
  const exact=canonicalRunAttestation(att);
  if(!exact.equals(attBytes))throw Error('SIGNED_RUN_ATTESTATION_NONCANONICAL');
  const publicKey=readBoundedBundleMetadata(root,'publisher-public.pem');
  if(publicKeyDigest(publicKey)!==publisherPin)throw Error('BUNDLE_PUBLISHER_UNPINNED');
  const signature=readBoundedBundleMetadata(root,'run-attestation.sig');
  if(signature.length!==64||!crypto.verify(null,attBytes,publicKey,signature))
    throw Error('SIGNED_RUN_ATTESTATION_INVALID_SIGNATURE');
  if(att.qaRunId!==observedRunId||att.workflowRunId!==expectedWorkflowRunId||att.workflowAttempt!==expectedWorkflowAttempt||
     att.workflowRef!==expectedWorkflowRef||att.commit!==commit||
     att.artifactSha256!==approvedArtifactSha||att.publisherSpkiSha256!==publisherPin)
    throw Error('SIGNED_RUN_ATTESTATION_MISMATCH');
  if(now<att.issuedAt-60000||now>att.expiresAt)
    throw Error('SIGNED_RUN_ATTESTATION_EXPIRED');

  // Never bless extra top-level artifacts, alternative scripts or sibling
  // payloads just because the `www` subtree happened to match its manifest.
  assertExactBundleLayout(root,att.qaRunId);
  const audit=JSON.parse(readBoundedBundleMetadata(root,'artifact-provenance.json').toString('utf8'));
  if(audit.repository!==EXPECTED_REPO||audit.workflowRunId!==att.workflowRunId||
     audit.workflowAttempt!==att.workflowAttempt||audit.workflowRef!==att.workflowRef)
    throw Error('GITHUB_WORKFLOW_RUN_MISMATCH');
  if(audit.commit!==att.commit||audit.runId!==att.qaRunId||
     audit.artifactSha256!==att.artifactSha256||
     audit.publisherSpkiSha256!==att.publisherSpkiSha256||
     audit.manifestSha256!==att.manifestSha256||
     audit.issuedAt!==att.issuedAt||audit.expiresAt!==att.expiresAt)
    throw Error('BUNDLE_PROVENANCE_UNAPPROVED');
  const actual=inventoryHash({commit,runId:att.qaRunId,files:audit.files});
  if(actual!==approvedArtifactSha)throw Error('BUNDLE_FILE_TREE_SHA_MISMATCH');
  const www=path.join(root,att.qaRunId,'www');
  const manifestBytes=readBoundedBundleMetadata(root,'manifest.json');
  if(att.manifestSha256!==hash(manifestBytes))throw Error('AUDIT_MANIFEST_DIGEST_MISMATCH');
  const out=verifyFixtureManifest({root:www,manifestBytes,
    signature:readBoundedBundleMetadata(root,'manifest.sig'),
    publicKey,pinnedPublicKeySha256:publisherPin,
    expectedArtifactSha256:actual,now});
  if(out.runId!==att.qaRunId)throw Error('SIGNED_RUN_ATTESTATION_MISMATCH');
  const signedManifest=JSON.parse(manifestBytes.toString('utf8'));
  if(signedManifest.issuedAt!==att.issuedAt||signedManifest.expiresAt!==att.expiresAt)
    throw Error('SIGNED_RUN_ATTESTATION_MISMATCH');
  const actualCatalog=catalogApprovedFixtureTree(www,{artifactSha256:approvedArtifactSha,issuedAt:now,expiresAt:now+1});
  const exactKeys=obj=>Object.keys(obj).sort().join('\0');
  const signedFiles=signedManifest.files;
  assertExactSignedFixtureTree(www,signedFiles);
  if(exactKeys(actualCatalog.files)!==exactKeys(audit.files)||
     exactKeys(signedFiles)!==exactKeys(audit.files))
    throw Error('SIGNED_BUNDLE_UNEXPECTED_FILE_INVENTORY');
  for(const k of Object.keys(audit.files)){
    if(JSON.stringify(audit.files[k])!==JSON.stringify(actualCatalog.files[k]))
      throw Error('SIGNED_FILE_BYTES_MUTATED');
  }
  return out;
}
function fromCliArgs(args){
  const mode=args[0];
  const flags=new Map();for(let i=1;i<args.length;i+=2){if(!args[i].startsWith('--')||!args[i+1]||flags.has(args[i]))throw Error('INVALID_CLI_ARGUMENT');flags.set(args[i],args[i+1]);}
  const expected=new Set(['--source','--repo-root','--scratch','--output']);
  if([...flags.keys()].some(k=>!expected.has(k)))throw Error('UNKNOWN_CLI_FLAG');
  if(!['plan','sign'].includes(mode))throw Error('ONLY_PLAN_OR_SIGN_SUPPORTED');
  for(const k of ['--source','--repo-root','--scratch'])if(!flags.has(k))throw Error('CLI_REQUIRED_PATH_MISSING');
  if(mode==='sign'&&!flags.has('--output'))throw Error('SIGN_OUTPUT_REQUIRED');
  return {mode,sourceRoot:flags.get('--source'),repoRoot:flags.get('--repo-root'),scratchRoot:flags.get('--scratch'),outputRoot:flags.get('--output')};
}
if(require.main===module){
  try{
    const opts=fromCliArgs(process.argv.slice(2));
    const ctx=runContextFromEnv();
    const result=opts.mode==='plan'?plan({...opts,ctx}):sign({...opts,ctx,privateKeyBase64:process.env.QA_FIXTURE_SIGNING_PKCS8_B64,publisherSpkiSha256:process.env.QA_FIXTURE_PUBLISHER_SPKI_SHA256});
    console.log('QA_FIXTURE_'+opts.mode.toUpperCase()+'_PASS '+JSON.stringify(result));
  }catch(e){console.error('QA_FIXTURE_FAIL '+e.message);process.exitCode=2;}
}
module.exports={EXPECTED_REPO,EXPECTED_WORKFLOW,exactInput,runContextFromEnv,ensureRootInsideWorkspace,copyTrustedFixtures,inventoryHash,plan,sign,readBundle,canonicalRunAttestation,assertExactBundleLayout,assertExactSignedFixtureTree,strictPrivateKeyFromB64,fromCliArgs};

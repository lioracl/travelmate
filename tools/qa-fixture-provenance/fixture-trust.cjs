'use strict';
// Candidate-only signed, bounded fixture allowlist. NO production key material.
// Publisher MUST operate outside the agent-writable QA fixture directory.
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const MAX_MANIFEST_BYTES=256*1024;
const MAX_FILES=512;
const MAX_FILE_BYTES=32*1024*1024;
const MAX_CATALOG_BYTES=64*1024*1024;
// An uploaded fixture tree is UNTRUSTED. Never allocate an arbitrary-size
// readdirSync result before checking its entry quota. Dir.readSync advances
// one bounded entry at a time and every opened directory is closed.
function readDirectoryLimited(directory,maxEntries,errorCode='BUNDLE_DIRECTORY_QUOTA'){
  if(!Number.isSafeInteger(maxEntries)||maxEntries<1||maxEntries>4608)
    throw Error('INVALID_DIRECTORY_ENTRY_QUOTA');
  const dir=fs.opendirSync(directory);
  const names=[];
  try{
    for(;;){
      const item=dir.readSync();
      if(item===null)break;
      if(names.length>=maxEntries)throw Error(errorCode);
      names.push(item);
    }
  }finally{dir.closeSync();}
  return names;
}

const MAX_TTL_MS=60*60*1000;
const VERIFIED=new WeakSet();
const HEX=/^[0-9a-f]{64}$/;
const RUN=/^(?:INFRA-STAGE04-|travelmate-infra-fixture-)[A-Za-z0-9_-]{6,128}$/i;
const AUDIENCE='travelmate:qa:static-fixtures:v1';
const ROOT_FIELDS=['audience','version','runId','artifactSha256','issuedAt','expiresAt','files'];
function exactKeys(obj,keys){return obj!==null && typeof obj==='object' && !Array.isArray(obj) && Object.keys(obj).length===keys.length && keys.every(x=>Object.hasOwn(obj,x));}
function safeName(name){
  if(typeof name!=='string'||name.length<1||name.length>256||name.startsWith('/')||name.includes('\\')||name.includes(':')||name.includes('%'))return false;
  const pieces=name.split('/');
  return pieces.every(x=>x && /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(x) && !/[. ]$/.test(x) && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(x) && x!=='.' && x!=='..');
}
function validateManifest(obj){
  if(!exactKeys(obj,ROOT_FIELDS)||obj.version!==1||obj.audience!==AUDIENCE)throw Error('BAD_MANIFEST_SCHEMA');
  if(typeof obj.runId!=='string'||!RUN.test(obj.runId))throw Error('BAD_RUN_ID');
  if(typeof obj.artifactSha256!=='string'||!HEX.test(obj.artifactSha256))throw Error('BAD_ARTIFACT_SHA');
  if(!Number.isSafeInteger(obj.issuedAt)||!Number.isSafeInteger(obj.expiresAt)||obj.expiresAt<=obj.issuedAt||obj.expiresAt-obj.issuedAt>MAX_TTL_MS)throw Error('BAD_MANIFEST_WINDOW');
  const entries=obj.files;
  if(!entries||typeof entries!=='object'||Array.isArray(entries))throw Error('BAD_FILES');
  const names=Object.keys(entries);
  if(names.length<1||names.length>MAX_FILES)throw Error('BAD_FILE_COUNT');
  let total=0;const foldedNames=new Set();
  for(const name of names){
    const folded=name.toLowerCase();
    if(foldedNames.has(folded))throw Error('MANIFEST_CASE_COLLISION');
    foldedNames.add(folded);
    if(!safeName(name)||!exactKeys(entries[name],['size','sha256']))throw Error('BAD_FILE_ENTRY');
    const {size,sha256}=entries[name];
    if(!Number.isSafeInteger(size)||size<0||size>MAX_FILE_BYTES||typeof sha256!=='string'||!HEX.test(sha256))throw Error('BAD_FILE_HASH_OR_SIZE');
    total+=size;
    if(total>MAX_CATALOG_BYTES)throw Error('BAD_TOTAL_SIZE');
  }
  return true;
}
function canonicalManifest(obj){
  validateManifest(obj);
  const ordered={audience:obj.audience,version:1,runId:obj.runId,artifactSha256:obj.artifactSha256,issuedAt:obj.issuedAt,expiresAt:obj.expiresAt,files:{}};
  for(const name of Object.keys(obj.files).sort())ordered.files[name]={size:obj.files[name].size,sha256:obj.files[name].sha256};
  const b=Buffer.from(JSON.stringify(ordered)+'\n','utf8');
  if(b.length>MAX_MANIFEST_BYTES)throw Error('MANIFEST_TOO_LARGE');
  return b;
}
function publicKeyDigest(key){
  const k=key && key.type==='public' ? key : crypto.createPublicKey(key);
  if(k.asymmetricKeyType!=='ed25519')throw Error('PUBLISHER_KEY_NOT_ED25519');
  return crypto.createHash('sha256').update(k.export({format:'der',type:'spki'})).digest('hex');
}
function signManifestForOfflinePublisher(manifest,operatorPrivateKey){
  // Caller must protect this key. No CLI loads a private key, no key is bundled.
  const key=operatorPrivateKey && operatorPrivateKey.type==='private' ? operatorPrivateKey : crypto.createPrivateKey(operatorPrivateKey);
  if(key.asymmetricKeyType!=='ed25519')throw Error('PRIVATE_KEY_NOT_ED25519');
  return {manifestBytes:canonicalManifest(manifest),signature:crypto.sign(null,canonicalManifest(manifest),key)};
}
function verifyFixtureManifest({root,manifestBytes,signature,publicKey,pinnedPublicKeySha256,expectedArtifactSha256,now=Date.now()}){
  if(typeof root!=='string'||!path.isAbsolute(root))throw Error('INVALID_QA_ROOT');
  const realRoot=fs.realpathSync(root);
  if(root!==realRoot)throw Error('ROOT_REDIRECTED');
  if(typeof pinnedPublicKeySha256!=='string'||!HEX.test(pinnedPublicKeySha256))throw Error('TRUST_ANCHOR_NOT_PINNED');
  if(typeof expectedArtifactSha256!=='string'||!HEX.test(expectedArtifactSha256))throw Error('ARTIFACT_NOT_PINNED');
  const bytes=Buffer.isBuffer(manifestBytes)?manifestBytes:null;
  if(!bytes||bytes.length>MAX_MANIFEST_BYTES||bytes.length<32)throw Error('MANIFEST_SIZE_INVALID');
  if(!Buffer.isBuffer(signature)||signature.length!==64)throw Error('SIGNATURE_SIZE_INVALID');
  if(!Number.isSafeInteger(now))throw Error('CLOCK_UNAVAILABLE');
  let obj;
  try{obj=JSON.parse(bytes.toString('utf8'));}catch{throw Error('MANIFEST_JSON_INVALID');}
  const canonical=canonicalManifest(obj);
  if(!bytes.equals(canonical))throw Error('NONCANONICAL_MANIFEST');
  if(obj.runId!==path.basename(path.dirname(realRoot)))throw Error('SIGNED_RUN_MISMATCH');
  if(obj.artifactSha256!==expectedArtifactSha256)throw Error('ARTIFACT_SHA_MISMATCH');
  if(now<obj.issuedAt-60_000||now>obj.expiresAt)throw Error('MANIFEST_EXPIRED_OR_FUTURE');
  if(publicKeyDigest(publicKey)!==pinnedPublicKeySha256)throw Error('TRUST_ANCHOR_MISMATCH');
  if(!crypto.verify(null,bytes,publicKey && publicKey.type==='public' ? publicKey : crypto.createPublicKey(publicKey),signature))throw Error('INVALID_PUBLISHER_SIGNATURE');
  // Only the verified factory retains a private entry table; callers cannot
  // forge a set by passing an ordinary object to makeHandler.
  const names=new Map(Object.entries(obj.files).map(([name,meta])=>[name,Object.freeze({size:meta.size,sha256:meta.sha256})]));
  const state=Object.freeze({root:realRoot,runId:obj.runId,artifactSha256:obj.artifactSha256,expiresAt:obj.expiresAt,entry(name){return names.get(name);}});
  VERIFIED.add(state);
  return state;
}
// Offline publisher helper. Inputs MUST come from an independently approved
// build artifact: the function can validate files, not authorize their origin.
function catalogApprovedFixtureTree(root,{artifactSha256,issuedAt,expiresAt}){
  if(typeof root!=='string'||!path.isAbsolute(root)||fs.realpathSync(root)!==root)throw Error('PUBLISHER_ROOT_NOT_CANONICAL');
  const runId=path.basename(path.dirname(root));
  if(!RUN.test(runId)||path.basename(root)!=='www')throw Error('PUBLISHER_ROOT_NOT_TASK_OWNED');
  if(typeof artifactSha256!=='string'||!HEX.test(artifactSha256))throw Error('PUBLISHER_ARTIFACT_NOT_PINNED');
  const files={};let total=0,count=0,directoryCount=0;
  const flags=fs.constants.O_RDONLY | (Number.isInteger(fs.constants.O_NOFOLLOW)?fs.constants.O_NOFOLLOW:0);
  const entriesSeen=new Set();
  function visit(relative,depth){
    if(depth>8)throw Error('PUBLISHER_TREE_TOO_DEEP');
    const directory=path.join(root,relative);
    const stats=fs.lstatSync(directory,{bigint:true});
    if(!stats.isDirectory()||stats.isSymbolicLink())throw Error('PUBLISHER_DIRECTORY_NOT_PLAIN');
    for(const de of readDirectoryLimited(directory,4608,'PUBLISHER_DIRECTORY_QUOTA')){
      const name=relative?relative+'/'+de.name:de.name;
      if(!safeName(name))throw Error('PUBLISHER_UNSAFE_FILE_NAME');
      if(entriesSeen.has(name.toLowerCase()))throw Error('PUBLISHER_CASE_COLLISION');
      entriesSeen.add(name.toLowerCase());
      const current=path.join(directory,de.name);
      const initial=fs.lstatSync(current,{bigint:true});
      if(initial.isSymbolicLink())throw Error('PUBLISHER_SYMLINK_REJECTED');
      if(initial.isDirectory()){
        if(++directoryCount>4096)throw Error('PUBLISHER_DIRECTORY_QUOTA');
        visit(name,depth+1);continue;
      }
      if(!initial.isFile()||initial.nlink!==1n||initial.size>BigInt(MAX_FILE_BYTES))throw Error('PUBLISHER_UNSAFE_FILE');
      count++;total+=Number(initial.size);
      if(count>MAX_FILES||total>MAX_CATALOG_BYTES)throw Error('PUBLISHER_QUOTA_EXCEEDED');
      let fd=null;
      try{
        fd=fs.openSync(current,flags);
        const mid=fs.fstatSync(fd,{bigint:true});
        if(!sameStats(initial,mid)||!mid.isFile()||mid.nlink!==1n)throw Error('PUBLISHER_FILE_CHANGED');
        const contents=Buffer.alloc(Number(mid.size));let offset=0;
        while(offset<contents.length){const n=fs.readSync(fd,contents,offset,Math.min(65536,contents.length-offset),offset);if(n<1)throw Error('PUBLISHER_FILE_TRUNCATED');offset+=n;}
        const after=fs.fstatSync(fd,{bigint:true}),pathStat=fs.lstatSync(current,{bigint:true});
        if(!sameStats(mid,after)||!sameStats(mid,pathStat)||path.resolve(fs.realpathSync(current))!==path.resolve(current))throw Error('PUBLISHER_FILE_CHANGED');
        files[name]={size:contents.length,sha256:crypto.createHash('sha256').update(contents).digest('hex')};
      }finally{if(fd!==null)fs.closeSync(fd);}
    }
  }
  visit('',0);
  return {audience:AUDIENCE,version:1,runId,artifactSha256,issuedAt,expiresAt,files};
}
function sameStats(a,b){return a&&b&&['dev','ino','size','mtimeNs','ctimeNs','mode'].every(x=>typeof a[x]==='bigint'&&a[x]===b[x]);}
function isVerifiedFixtureSet(value){return value!==null&&typeof value==='object'&&VERIFIED.has(value);}
module.exports={AUDIENCE,canonicalManifest,validateManifest,safeName,readDirectoryLimited,publicKeyDigest,signManifestForOfflinePublisher,verifyFixtureManifest,isVerifiedFixtureSet,catalogApprovedFixtureTree,MAX_FILE_BYTES,MAX_CATALOG_BYTES};

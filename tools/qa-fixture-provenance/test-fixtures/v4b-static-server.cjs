#!/usr/bin/env node
'use strict';
// Isolated infrastructure candidate: local-only, zero-dependency, read-only HTTP fixture server.
// NOT installed in TravelMate. NOT an authorization to run protected D3 or product browser tests.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {Readable} = require('node:stream');
const crypto = require('node:crypto');
const {verifyFixtureManifest,isVerifiedFixtureSet} = require('./fixture-trust.cjs');

// UNPROVISIONED: an authorized operator must embed the approved offline
// publisher's SHA256(SPKI DER) in the reviewed, protected release source.
// Never accept a caller-provided fingerprint as the trust root.
const APPROVED_PUBLISHER_SPKI_SHA256 = null;

// A bounded in-memory snapshot is committed before HTTP headers.  The opened
// descriptor remains the sole read authority; a caller cannot rewrite the
// response payload by changing that inode after the metadata checks.
const MAX_SNAPSHOT_BYTES = 32 * 1024 * 1024;
const MAX_ACTIVE_SNAPSHOT_BYTES = 64 * 1024 * 1024;

const MIME = Object.freeze({
  '.html':'text/html; charset=utf-8', '.htm':'text/html; charset=utf-8',
  '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8',
  '.cjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml',
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp',
  '.gif':'image/gif', '.ico':'image/x-icon', '.txt':'text/plain; charset=utf-8',
  '.webmanifest':'application/manifest+json', '.woff2':'font/woff2'
});

function isRestrictedRoot(input) {
  const normalized=String(input).replaceAll('\\','/').toLowerCase().replace(/\/+$/,'') || '/';
  // A fixture root that is the volume root or AN ANCESTOR of the canonical
  // checkout would inadvertently make protected data available over localhost.
  // Normalize and deny both descendants and ancestors of protected paths.
  if (normalized==='/' || /^[a-z]:$/.test(normalized)) return true;
  const protectedPaths=['c:/projects/travelmate-workspace/app','c:/projects/travelmate-dot'];
  return protectedPaths.some(p=>normalized===p || normalized.startsWith(p+'/') || p.startsWith(normalized+'/'))
    || /(?:^|\/)projects\/travelmate-workspace\/app(?:\/|$)/.test(normalized)
    || /(?:^|\/)projects\/travelmate-dot(?:\/|$)/.test(normalized);
}

// Allow only an isolated, synthetic QA fixture under a known per-user QA base.
// Never take the allowlist base from an arbitrary --root or caller-supplied flag.
// The requested root is already realpath-resolved before this check, so a
// reparse point/symlink into Documents, Recovery, the repo or elsewhere fails.
function isApprovedQaRoot(realRoot) {
  let base;
  let prefix;
  if (process.platform==='win32') {
    // Use the OS account home, not mutable LOCALAPPDATA/USERPROFILE environment.
    // A redirected LocalAppData needs an explicitly trusted launcher contract; fail closed here.
    const home=require('node:os').userInfo().homedir;
    if (!home || !path.isAbsolute(home)) return false;
    base=path.resolve(home,'AppData','Local','TravelMate','QA');
    prefix=/^INFRA-STAGE04-[a-z0-9_-]{6,}$/i;
  } else {
    base=fs.realpathSync(require('node:os').tmpdir());
    prefix=/^travelmate-infra-fixture-[a-z0-9_-]+$/i;
  }
  const relative=path.relative(base,realRoot);
  if (!relative || relative==='..' || relative.startsWith('..'+path.sep) || path.isAbsolute(relative)) return false;
  const parts=relative.split(path.sep);
  // Root must be a descendant of a task-owned /www directory, never the
  // parent containing logs, source files, manifests or recovery evidence.
  return parts.length>=2 && prefix.test(parts[0]) && parts[1]==='www';
}

function parseArgs(argv) {
  let root, host='127.0.0.1', port=4173, check=false, manifestPath, signaturePath, publicKeyPath, artifactSha;
  for (let i=0; i<argv.length; i++) {
    const item=argv[i];
    if (item==='--check') {check=true; continue;}
    if (!['--root','--host','--port','--fixture-manifest','--fixture-signature','--publisher-key','--artifact-sha256'].includes(item) || i+1>=argv.length) {
      throw new Error('USAGE: node travelmate-qa-static-server.cjs --root <absolute_directory> [--port 4173] [--host 127.0.0.1] [--check]');
    }
    const value=argv[++i];
    if (item==='--root') root=value;
    if (item==='--fixture-manifest') manifestPath=value;
    if (item==='--fixture-signature') signaturePath=value;
    if (item==='--publisher-key') publicKeyPath=value;
    if (item==='--artifact-sha256') artifactSha=value;
    if (item==='--host') host=value;
    if (item==='--port') {
      if (!/^\d+$/.test(value)) throw new Error('INVALID_PORT');
      port=Number(value);
    }
  }
  if (!root || !path.isAbsolute(root)) throw new Error('ABSOLUTE_ROOT_REQUIRED');
  if (!['127.0.0.1','::1'].includes(host)) throw new Error('LOOPBACK_HOST_REQUIRED');
  if (!Number.isSafeInteger(port) || port<0 || port>65535) throw new Error('INVALID_PORT');
  const resolvedRoot=fs.realpathSync(root);
  if (!fs.statSync(resolvedRoot).isDirectory()) throw new Error('ROOT_NOT_DIRECTORY');
  if (isRestrictedRoot(resolvedRoot)) throw new Error('CANONICAL_OR_LEGACY_ROOT_FORBIDDEN');
  if (!isApprovedQaRoot(resolvedRoot)) throw new Error('QA_ROOT_NOT_APPROVED');
  return {root:resolvedRoot,host,port,check,manifestPath,signaturePath,publicKeyPath,artifactSha};
}

function safeRelativeRequest(url) {
  if (typeof url!=='string' || url.length>8192) return {error:414};
  const raw=url.split('?',1)[0];
  if (!raw.startsWith('/') || /%2f|%5c/i.test(raw)) return {error:400};
  let decoded;
  try {decoded=decodeURIComponent(raw);} catch {return {error:400};}
  if (decoded.includes('\0') || decoded.includes('\\')) return {error:400};
  const segments=decoded.split('/');
  if (segments.some(s=>s==='..' || s.startsWith('.'))) return {error:403};
  // Windows treats ':' as an NTFS alternate-data-stream separator and certain names as devices.
  // Reject these cross-platform so a synthetic fixture never resolves to a special stream/device.
  if (segments.some(s=>{
    // Win32 can normalize final dots/spaces; reject aliases before filesystem lookup.
    if (s.includes(':') || /[. ]$/.test(s)) return true;
    const deviceStem=s.split('.',1)[0].replace(/ +$/,'');
    return /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])$/i.test(deviceStem);
  })) return {error:400};
  const pieces=segments.filter(Boolean);
  return {relative:pieces.join(path.sep)};
}

function isWithinRoot(root, candidate) {
  const rel=path.relative(root,candidate);
  return rel==='' || (rel!=='..' && !rel.startsWith('..'+path.sep) && !path.isAbsolute(rel));
}

// A local attacker with write access to the task-owned fixture must not be
// able to convert a validated name into an outside file before the HTTP read.
// Fail closed if the path contains a reparse/symlink component, has multiple
// hardlinks, or changes identity between pathname inspection and opened fd.
// NOTE: Windows handle/reparse semantics still require independent NTFS tests.
function hasSymlinkComponent(root,candidate) {
  const rel=path.relative(root,candidate);
  if (rel==='..' || rel.startsWith('..'+path.sep) || path.isAbsolute(rel)) return true;
  let cursor=root;
  for (const segment of rel.split(path.sep).filter(Boolean)) {
    cursor=path.join(cursor,segment);
    if (fs.lstatSync(cursor).isSymbolicLink()) return true;
  }
  return false;
}

function sameOpenedFile(a,b) {
  // Real file handles use BigIntStats, retaining exact NTFS inode/device IDs.
  // Detect in-place, same-length writes or metadata changes between checks;
  // dev/ino/size alone do NOT detect such changes.  This is not a promise that
  // mutable bytes cannot change AFTER the last fstat/lstat validation.
  const bigintReliable = s => s && typeof s.dev==='bigint' && s.dev>0n &&
    typeof s.ino==='bigint' && s.ino>0n &&
    typeof s.size==='bigint' && s.size>=0n &&
    typeof s.mtimeNs==='bigint' && s.mtimeNs>=0n &&
    typeof s.ctimeNs==='bigint' && s.ctimeNs>=0n &&
    typeof s.mode==='bigint' && s.mode>0n;
  if (bigintReliable(a) && bigintReliable(b)) {
    return a.dev===b.dev && a.ino===b.ino && a.size===b.size &&
      a.mtimeNs===b.mtimeNs && a.ctimeNs===b.ctimeNs && a.mode===b.mode;
  }
  // Numeric compatibility is retained for the existing isolated identity
  // unit fixtures only. Handler's real fs stat calls ALWAYS opt into bigint.
  const numberReliable = s => s && Number.isSafeInteger(s.dev) && s.dev>0 &&
    Number.isSafeInteger(s.ino) && s.ino>0 &&
    Number.isSafeInteger(s.size) && s.size>=0;
  return !!(numberReliable(a) && numberReliable(b) &&
    a.dev===b.dev && a.ino===b.ino && a.size===b.size);
}

function buildHandler(root,verifiedSet,allowUnsignedTestOnly=false) {
  const approved=verifiedSet && isVerifiedFixtureSet(verifiedSet) && verifiedSet.root===fs.realpathSync(root);
  // Test-only bypass exists exclusively for reproducing the earlier C1
  // streaming tests. The actual main() NEVER calls this mode.

  // Process-local limit per HTTP listener; multiple streams cannot bypass the
  // aggregate reservation by starting before previous responses finish.
  let reservedSnapshotBytes=0;
  return (req,res)=>{
    const headers={
      'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff',
      'Referrer-Policy':'no-referrer'
    };
    const send=(code,body)=>{
      res.writeHead(code,{...headers,'Content-Type':'text/plain; charset=utf-8'});
      res.end(req.method==='HEAD'?'':body);
    };
    if (!/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(String(req.headers.host||''))) return send(403,'INVALID_HOST');
    if (req.method!=='GET' && req.method!=='HEAD') return send(405,'METHOD_NOT_ALLOWED');
    if (req.url==='/__infra_health') {
      res.writeHead(200,{...headers,'Content-Type':'application/json; charset=utf-8'});
      return res.end(req.method==='HEAD'?'':JSON.stringify({service:'travelmate-qa-static-server',status:'ok'})+'\n');
    }
    const reqPath=safeRelativeRequest(req.url);
    if (reqPath.error) return send(reqPath.error,'INVALID_PATH');
    if (!approved && !allowUnsignedTestOnly) return send(503,'TRUSTED_FIXTURE_MANIFEST_REQUIRED');
    if (approved && Date.now()>verifiedSet.expiresAt) return send(503,'SIGNED_MANIFEST_EXPIRED');
    let target=path.join(root,reqPath.relative);
    let fd=null;
    let stream=null;
    let releaseSnapshot=null;
    let info;
    try {
      const initial=fs.lstatSync(target,{bigint:true});
      if (initial.isDirectory()) target=path.join(target,'index.html');
      const routeFile=path.relative(root,target).split(path.sep).join('/');
      const attested=approved ? verifiedSet.entry(routeFile) : null;
      if (approved && !attested) return send(403,'FILE_NOT_ATTESTED');
      // Inspect the original path components before any resolution/open.
      if (hasSymlinkComponent(root,target)) return send(403,'LINK_FORBIDDEN');
      const resolved=fs.realpathSync(target);
      if (!isWithinRoot(root,resolved)) return send(403,'PATH_OUTSIDE_ROOT');
      const before=fs.lstatSync(target,{bigint:true});
      if (!before.isFile() || before.isSymbolicLink()) return send(404,'NOT_FOUND');
      if (before.nlink!==1n) return send(403,'MULTI_LINK_FORBIDDEN');
      const flags=fs.constants.O_RDONLY |
        (Number.isInteger(fs.constants.O_NOFOLLOW) ? fs.constants.O_NOFOLLOW : 0);
      fd=fs.openSync(target,flags);
      info=fs.fstatSync(fd,{bigint:true});
      if (!info.isFile() || info.nlink!==1n) return send(403,'UNSAFE_FILE_HANDLE');
      // Check the path identity once after opening. Response bytes are served
      // exclusively from fd, so subsequent pathname replacement cannot redirect.
      const afterResolved=fs.realpathSync(target);
      if (!isWithinRoot(root,afterResolved) || afterResolved!==resolved || hasSymlinkComponent(root,target))
        return send(403,'PATH_CHANGED');
      const after=fs.lstatSync(target,{bigint:true});
      if (!after.isFile() || after.isSymbolicLink() || after.nlink!==1n ||
          !sameOpenedFile(before,info) || !sameOpenedFile(info,after))
        return send(403,'FILE_CHANGED');
      const contentType=MIME[path.extname(target).toLowerCase()]||'application/octet-stream';
      // Require GET and HEAD to agree on the bounded fixture contract.
      // A large trusted file is NOT streamed raw as a fallback, since that
      // would reintroduce the post-validation in-place rewrite vulnerability.
      if (info.size>BigInt(MAX_SNAPSHOT_BYTES)) return send(413,'FIXTURE_TOO_LARGE');
      if (approved && Number(info.size)!==attested.size) return send(403,'SIGNED_SIZE_MISMATCH');
      if (req.method==='HEAD' && !approved) {
        fs.closeSync(fd);fd=null;
        res.writeHead(200,{...headers,'Content-Type':contentType,'Content-Length':String(info.size)});
        return res.end();
      }
      const length=Number(info.size); // safe because bounded above
      if (reservedSnapshotBytes+length>MAX_ACTIVE_SNAPSHOT_BYTES)
        return send(503,'SNAPSHOT_BUDGET_EXHAUSTED');
      reservedSnapshotBytes+=length;
      let reservationHeld=true;
      releaseSnapshot=()=>{
        if (reservationHeld) {reservationHeld=false;reservedSnapshotBytes-=length;}
      };
      // Read only via the already-validated descriptor. The file can change
      // while being read, so verify both fd and pathname AGAIN before sending
      // any header; after that point the response uses the immutable buffer.
      const snapshot=Buffer.alloc(length);
      let offset=0;
      while (offset<length) {
        const count=fs.readSync(fd,snapshot,offset,Math.min(65536,length-offset),offset);
        if (count<=0) {const err=new Error('SNAPSHOT_TRUNCATED');err.code='EIO';throw err;}
        offset+=count;
      }
      const postFd=fs.fstatSync(fd,{bigint:true});
      const postPath=fs.lstatSync(target,{bigint:true});
      if (!postFd.isFile() || postFd.nlink!==1n || !postPath.isFile() || postPath.nlink!==1n ||
          !sameOpenedFile(info,postFd) || !sameOpenedFile(postFd,postPath) ||
          fs.realpathSync(target)!==resolved || hasSymlinkComponent(root,target)) {
        releaseSnapshot();
        return send(403,'FILE_CHANGED_DURING_SNAPSHOT');
      }
      if (approved && crypto.createHash('sha256').update(snapshot).digest('hex')!==attested.sha256) {
        releaseSnapshot();
        return send(403,'SIGNED_FIXTURE_CONTENT_MISMATCH');
      }
      fs.closeSync(fd);fd=null;
      if (req.method==='HEAD') {
        releaseSnapshot();
        res.writeHead(200,{...headers,'Content-Type':contentType,'Content-Length':String(snapshot.length)});
        return res.end();
      }
      // No filesystem read remains after this point. Mutating an already
      // authorized inode *after* writeHead cannot affect these response bytes.
      stream=Readable.from([snapshot]);
      stream.once('error',()=>{if (!res.destroyed) res.destroy();if (releaseSnapshot) releaseSnapshot();});
      res.once('close',()=>{stream.destroy();if (releaseSnapshot) releaseSnapshot();});
      res.once('error',()=>{stream.destroy();if (releaseSnapshot) releaseSnapshot();});
      res.once('finish',()=>{if (releaseSnapshot) releaseSnapshot();});
      res.writeHead(200,{...headers,'Content-Type':contentType,'Content-Length':String(snapshot.length)});
      stream.pipe(res);
      return;
    } catch (err) {
      // After descriptor handoff, a synchronous response/pipe failure must not
      // leave the stream open or rewrite headers that were already sent.
      if (stream) stream.destroy();
      if (releaseSnapshot) releaseSnapshot();
      // Avoid emitting an unhandled error event from ServerResponse after the
      // status line; the response is already irrecoverable and must be closed.
      if (res.headersSent) { res.destroy(); return; }
      if (err.code==='ENOENT'||err.code==='ENOTDIR') return send(404,'NOT_FOUND');
      if (['EACCES','EPERM','ELOOP'].includes(err.code)) return send(403,'FORBIDDEN');
      return send(500,'FILE_ERROR');
    } finally {
      if (fd!==null) {try{fs.closeSync(fd);}catch{}}
    }
  };
}

function makeHandler(root,verifiedSet){return buildHandler(root,verifiedSet,false);}
// Explicitly separated legacy direct-handler test API. NEVER use for a live
// listener, a service, a test-runner launcher or an untrusted fixture supplier.
function makeLegacyHandlerForOfflineRegression(root){
  if(process.env.NODE_TEST_CONTEXT!=='child-v8')throw Error('LEGACY_UNTRUSTED_HANDLER_TEST_MODE_ONLY');
  return buildHandler(root,null,true);
}
function loadApprovedFixtureSet(opts){
  if(!APPROVED_PUBLISHER_SPKI_SHA256)throw Error('PUBLISHER_TRUST_ANCHOR_UNPROVISIONED');
  if(!opts.manifestPath||!opts.signaturePath||!opts.publicKeyPath||!opts.artifactSha)throw Error('MISSING_SIGNED_FIXTURE_INPUT');
  const locations=[opts.manifestPath,opts.signaturePath,opts.publicKeyPath];
  for(const file of locations){
    if(!path.isAbsolute(file))throw Error('TRUST_FILE_MUST_BE_ABSOLUTE');
    const resolved=fs.realpathSync(file);
    if(isWithinRoot(opts.root,resolved))throw Error('TRUST_FILE_INSIDE_SERVED_ROOT');
    if(!fs.statSync(resolved).isFile())throw Error('TRUST_FILE_NOT_REGULAR');
  }
  return verifyFixtureManifest({root:opts.root,
    manifestBytes:fs.readFileSync(opts.manifestPath),
    signature:fs.readFileSync(opts.signaturePath),
    publicKey:fs.readFileSync(opts.publicKeyPath),
    pinnedPublicKeySha256:APPROVED_PUBLISHER_SPKI_SHA256,
    expectedArtifactSha256:opts.artifactSha
  });
}

async function main(argv) {
  let opts;
  try {opts=parseArgs(argv);} catch (e) {
    console.error('INFRA_PREFLIGHT_FAIL '+e.message);
    process.exitCode=2;
    return;
  }
  if (opts.check) {
    console.log('INFRA_PREFLIGHT_PASS '+JSON.stringify({node:process.version,root:opts.root,host:opts.host,port:opts.port,readOnly:true,fixtureTrust:'ROOT_ONLY_NOT_ATTESTED',serverLaunchAllowed:false}));
    return;
  }
  let verified;
  try { verified=loadApprovedFixtureSet(opts); }
  catch(e){console.error('INFRA_TRUST_FAIL '+e.message);process.exitCode=2;return;}
  const server=http.createServer(makeHandler(opts.root,verified));
  server.requestTimeout=15000;
  server.headersTimeout=10000;
  server.keepAliveTimeout=3000;
  server.maxHeadersCount=100;
  server.on('error',e=>{
    console.error('INFRA_SERVER_FAIL '+e.code);
    process.exitCode=3;
  });
  await new Promise(resolve=>server.listen(opts.port,opts.host,resolve));
  if (!server.listening) return;
  const addr=server.address();
  console.log('INFRA_SERVER_READY '+JSON.stringify({host:opts.host,port:addr.port,root:opts.root,readOnly:true}));
  const shutdown=()=>server.close(()=>process.exit(0));
  process.once('SIGINT',shutdown);
  process.once('SIGTERM',shutdown);
}

if (require.main===module) main(process.argv.slice(2)).catch(e=>{
  console.error('INFRA_SERVER_FATAL '+e.message);
  process.exitCode=4;
});
module.exports={isRestrictedRoot,isApprovedQaRoot,parseArgs,safeRelativeRequest,isWithinRoot,hasSymlinkComponent,sameOpenedFile,makeHandler,makeLegacyHandlerForOfflineRegression,loadApprovedFixtureSet,main};

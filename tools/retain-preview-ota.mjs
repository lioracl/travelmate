// Preserve existing signed bytes only. This tool cannot generate or sign an OTA.
import fs from 'node:fs';
import path from 'node:path';
import {createHash, verify} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const SITE = 'https://lioracl.github.io/travelmate/';
export const OTA_ORIGIN = SITE + 'ota/';
export const API = 'https://api.github.com/repos/lioracl/travelmate/';
export const WORKFLOW_ID = 315274995;
// Public bytes independently verified during review; revalidated on every deploy.
export const CURRENT = Object.freeze({
  manifestBytes: 2095, manifestSha256: '6bd0e4f2ded671520f3e0a900ef764dc23f7ee241d27e69c070dfa1d8b5dd4f9',
  bundleBytes: 2758973, bundleSha256: '0f2a696b92ae669527ac3fde1a35682d6ee0f8b881f19ba80b2007c5d4081519'
});
// Independently verified migration provenance: the last publisher before separation.
export const LEGACY = Object.freeze({
  id: 38715322778, sha: 'e8513167165b0363a497199e83e176c868173923',
  workflowBlob: '3703bff847e87dd400e7e5995989d7cc209b47d2',
  publisherBlob: '7a618f185d461089f1b54e25559cf25c2dda637c',
  nativeSha: 'd80d9909e78ffdca831251b514d1a54f11e9118a'
});
const RUNS = API + 'actions/workflows/' + WORKFLOW_ID + '/runs?branch=preview&event=push&status=success&per_page=1';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const gitBlob = bytes => createHash('sha1').update(Buffer.from('blob ' + bytes.length + '\0')).update(bytes).digest('hex');
const json = bytes => JSON.parse(bytes.toString('utf8'));
function exactSha(value) {
  if (!/^[a-f0-9]{40}$/.test(value || '')) throw Error('Invalid provenance SHA');
  return value;
}
export function validateRun(run, jobs) {
  if (!run || !Number.isSafeInteger(run.id) || run.id < 1 || run.workflow_id !== WORKFLOW_ID ||
      run.repository?.full_name !== 'lioracl/travelmate' || run.head_branch !== 'preview' ||
      run.path !== '.github/workflows/deploy-pages.yml' || run.event !== 'push' ||
      run.status !== 'completed' || run.conclusion !== 'success') throw Error('Missing or invalid successful Preview deployment provenance');
  exactSha(run.head_sha);
  if (!jobs || jobs.total_count !== jobs.jobs?.length || !jobs.jobs.some(job =>
    job.run_id === run.id && job.head_sha === run.head_sha && job.name === 'deploy' &&
    job.status === 'completed' && job.conclusion === 'success' &&
    job.steps?.some(step => step.name === 'Deploy to GitHub Pages' && step.status === 'completed' && step.conclusion === 'success')
  )) throw Error('Successful Pages deployment step not proven');
  return run;
}
export function signedManifest(bytes, publicKey, expectedSha = LEGACY.sha) {
  const envelope = json(bytes);
  for (const key of ['payload', 'signature']) {
    if (typeof envelope[key] !== 'string' || !envelope[key] || Buffer.from(envelope[key], 'base64').toString('base64') !== envelope[key]) throw Error('Invalid signed OTA envelope');
  }
  const payload = Buffer.from(envelope.payload, 'base64');
  if (!verify('RSA-SHA256', payload, publicKey, Buffer.from(envelope.signature, 'base64'))) throw Error('Current OTA pointer/manifest signature mismatch');
  const manifest = json(payload);
  if (manifest.schemaVersion !== 1 || manifest.sha !== exactSha(expectedSha) || manifest.nativeApiLevel !== 2 ||
      manifest.url !== OTA_ORIGIN + expectedSha + '/bundle.zip' ||
      !/^[a-f0-9]{64}$/.test(manifest.sha256 || '') ||
      !/^\d+\.\d+\.\d+$/.test(manifest.version || '') ||
      typeof manifest.bundleSignature !== 'string' || !manifest.bundleSignature ||
      Buffer.from(manifest.bundleSignature, 'base64').toString('base64') !== manifest.bundleSignature) throw Error('Current OTA origin/path/SHA/API contract mismatch');
  return manifest;
}
export function validateCurrent(latest, immutable, bundle, publicKey, expectedSha, expectedVersion, expectedFiles = CURRENT) {
  const manifest = signedManifest(latest, publicKey, expectedSha);
  signedManifest(immutable, publicKey, expectedSha);
  if (!latest.equals(immutable)) throw Error('Current latest and immutable manifest bytes differ');
  if (latest.length !== expectedFiles.manifestBytes || digest(latest) !== expectedFiles.manifestSha256 ||
      bundle.length !== expectedFiles.bundleBytes || digest(bundle) !== expectedFiles.bundleSha256) throw Error('Current OTA bytes differ from independently verified deployment evidence');
  if (manifest.version !== expectedVersion) throw Error('OTA version does not match verified publisher source');
  if (!bundle.length || bundle.length > 128 * 1024 * 1024 || digest(bundle) !== manifest.sha256 ||
      !verify('RSA-SHA256', bundle, publicKey, Buffer.from(manifest.bundleSignature, 'base64'))) throw Error('Current OTA bundle size/hash/signature mismatch');
  return manifest;
}
// No credentials or new permissions: fixed public HTTPS endpoints only.
export async function download(url, maximum, {optional404 = false, fetcher = fetch} = {}) {
  const parsed = new URL(url);
  if (parsed.href !== url || parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash ||
      !(url.startsWith(SITE) || url.startsWith(API))) throw Error('Unexpected retention evidence origin/path');
  const relative = url.startsWith(SITE) ? url.slice(SITE.length) : null;
  if (relative !== null && !/^(?:build-info\.json|ota\/(?:latest\.json|[a-f0-9]{40}\/(?:manifest\.json|bundle\.zip)?)?)$/.test(relative)) throw Error('Unexpected live OTA path');
  const response = await fetcher(url, {redirect: 'error', signal: AbortSignal.timeout(60000), headers: {'Cache-Control': 'no-cache', 'Accept': 'application/vnd.github+json', 'Accept-Encoding': 'identity'}});
  if (response.redirected || response.url !== url) throw Error('Unexpected evidence redirect or response URL');
  if (optional404 && response.status === 404) return null;
  if (!response.ok) throw Error('Required live retention evidence unavailable: ' + url);
  if (response.headers.get('content-encoding') && response.headers.get('content-encoding') !== 'identity') throw Error('Unexpected encoded evidence body');
  const size = response.headers.get('content-length');
  if (size !== null && (!/^\d+$/.test(size) || Number(size) > maximum)) throw Error('Evidence size limit');
  const chunks = []; let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > maximum) throw Error('Evidence size limit');
    chunks.push(chunk);
  }
  if (!length || (size !== null && Number(size) !== length)) throw Error('Absent or truncated evidence');
  return Buffer.concat(chunks);
}
export function checkListing(bytes, directory, allowed) {
  if (bytes === null) return; // Pages does not normally expose directory listings.
  const links = [...bytes.toString('utf8').matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map(match => match[1]);
  if (!links.length) throw Error('Unexpected OTA directory response; path set is uncertain');
  for (const link of links) {
    const absolute = new URL(link, directory).href;
    if (!allowed.includes(absolute)) throw Error('Additional or unexpected live OTA path: ' + absolute);
  }
}
export async function contentAt(sha, relative, get) {
  exactSha(sha);
  const item = json(await get(API + 'contents/' + relative + '?ref=' + sha, 4 * 1024 * 1024));
  if (item.path !== relative || item.type !== 'file' || item.encoding !== 'base64' || typeof item.content !== 'string') throw Error('Missing source provenance');
  const bytes = Buffer.from(item.content.replaceAll('\n', ''), 'base64');
  if (gitBlob(bytes) !== item.sha) throw Error('Source provenance blob mismatch');
  return {bytes, blob: item.sha};
}
export async function retainCurrent({site, publicKey, localWorkflow, localTool, get = download, expectedFiles = CURRENT, readSource = contentAt}) {
  const newest = async () => {
    const result = json(await get(RUNS, 4 * 1024 * 1024));
    if (!Array.isArray(result.workflow_runs) || !result.workflow_runs.length) throw Error('Absent last successful deployment');
    const run = result.workflow_runs[0];
    return validateRun(run, json(await get(API + 'actions/runs/' + run.id + '/jobs?per_page=100', 4 * 1024 * 1024)));
  };
  const run = await newest();
  const liveBuildBytes = await get(SITE + 'build-info.json', 64 * 1024), liveBuild = json(liveBuildBytes);
  if (liveBuild.sha !== run.head_sha || liveBuild.channel !== 'preview') throw Error('Live Preview and last successful deployment provenance disagree');
  const previousWorkflow = await readSource(run.head_sha, '.github/workflows/deploy-pages.yml', get);
  if (run.head_sha === LEGACY.sha) {
    if (run.id !== LEGACY.id || previousWorkflow.blob !== LEGACY.workflowBlob) throw Error('Unknown legacy deployment recipe');
  } else {
    if (!previousWorkflow.bytes.equals(localWorkflow)) throw Error('Previous deployment recipe changed; OTA path set uncertain');
    const previousTool = await readSource(run.head_sha, 'tools/retain-preview-ota.mjs', get);
    if (!previousTool.bytes.equals(localTool)) throw Error('Previous retention recipe changed; OTA path set uncertain');
  }
  const publisher = json(await get(API + 'actions/runs/' + LEGACY.id, 4 * 1024 * 1024));
  validateRun(publisher, json(await get(API + 'actions/runs/' + LEGACY.id + '/jobs?per_page=100', 4 * 1024 * 1024)));
  if (publisher.id !== LEGACY.id || publisher.head_sha !== LEGACY.sha) throw Error('Original OTA publisher provenance mismatch');
  const pin = json((await readSource(LEGACY.sha, 'ota-overlay.json', get)).bytes);
  if (pin.sha !== LEGACY.nativeSha || pin.nativeApiLevel !== 2 || pin.repository !== 'lioracl/travelmate') throw Error('Publisher native trust contract changed');
  if ((await readSource(LEGACY.nativeSha, 'tools/publish-ota.mjs', get)).blob !== LEGACY.publisherBlob) throw Error('Unknown OTA output recipe');
  const about = (await readSource(LEGACY.sha, 'assets/about.js', get)).bytes.toString('utf8');
  const expectedVersion = about.match(/version: '([^']+)'/)?.[1];
  const latest = await get(OTA_ORIGIN + 'latest.json', 64 * 1024);
  const pointer = signedManifest(latest, publicKey, LEGACY.sha);
  const immutable = await get(OTA_ORIGIN + pointer.sha + '/manifest.json', 64 * 1024);
  const bundle = await get(pointer.url, 128 * 1024 * 1024);
  validateCurrent(latest, immutable, bundle, publicKey, LEGACY.sha, expectedVersion, expectedFiles);
  const directory = OTA_ORIGIN + pointer.sha + '/';
  await checkListing(await get(OTA_ORIGIN, 1024 * 1024, {optional404: true}), OTA_ORIGIN,
    [SITE, directory, OTA_ORIGIN + 'latest.json']);
  await checkListing(await get(directory, 1024 * 1024, {optional404: true}), directory,
    [OTA_ORIGIN, directory + 'manifest.json', directory + 'bundle.zip']);
  if (!(await get(OTA_ORIGIN + 'latest.json', 64 * 1024)).equals(latest) ||
      !(await get(SITE + 'build-info.json', 64 * 1024)).equals(liveBuildBytes) ||
      (await newest()).id !== run.id) throw Error('Live deployment or OTA pointer changed during retention');
  const files = new Map([['latest.json', latest], [pointer.sha + '/manifest.json', immutable], [pointer.sha + '/bundle.zip', bundle]]);
  const evidence = {schemaVersion: 1, sourceDeploymentRunId: run.id, sourceDeploymentSha: run.head_sha,
    sourceBuildInfoSha256: digest(liveBuildBytes),
    originalPublisherRunId: LEGACY.id, originalPublisherSha: LEGACY.sha, nativeSha: LEGACY.nativeSha,
    files: [...files].map(([relative, bytes]) => ({path: relative, length: bytes.length, sha256: digest(bytes)}))};
  const out = path.resolve(site, 'ota');
  fs.mkdirSync(out); // All evidence is verified before writing; never overwrite existing output.
  for (const [relative, bytes] of files) {
    const target = path.join(out, relative);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, bytes, {flag: 'wx'});
  }
  return evidence;
}
export async function recheckCurrent(site, get = download) {
  const evidence = json(fs.readFileSync(path.resolve(site) + '.ota-retention-evidence.json'));
  const latest = await get(OTA_ORIGIN + 'latest.json', 64 * 1024);
  if (!latest.equals(fs.readFileSync(path.resolve(site, 'ota/latest.json')))) throw Error('Live OTA pointer advanced after retention; refuse stale publication');
  const build = await get(SITE + 'build-info.json', 64 * 1024);
  if (digest(build) !== evidence.sourceBuildInfoSha256) throw Error('Live Preview moved after retention');
  const list = json(await get(RUNS, 4 * 1024 * 1024));
  if (!list.workflow_runs?.length) throw Error('Absent final deployment provenance');
  const run = list.workflow_runs[0];
  validateRun(run, json(await get(API + 'actions/runs/' + run.id + '/jobs?per_page=100', 4 * 1024 * 1024)));
  if (run.id !== evidence.sourceDeploymentRunId || run.head_sha !== evidence.sourceDeploymentSha || json(build).sha !== run.head_sha) throw Error('Last successful deployment advanced after retention');
  return evidence;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--recheck') {
    await recheckCurrent(process.argv[3]);
    console.log('PASS: live OTA bytes and Preview deployment provenance still match retained state');
    process.exit(0);
  }
  const [site, configPath] = process.argv.slice(2);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const evidence = await retainCurrent({site, publicKey: json(fs.readFileSync(configPath)).plugins.LiveUpdate.publicKey,
    localWorkflow: fs.readFileSync(path.join(root, '.github/workflows/deploy-pages.yml')), localTool: fs.readFileSync(fileURLToPath(import.meta.url))});
  fs.writeFileSync(path.resolve(site) + '.ota-retention-evidence.json', JSON.stringify(evidence, null, 2) + '\n', {flag: 'wx'});
  console.log(JSON.stringify({retainedExistingBytesOnly: true, ...evidence}, null, 2));
}

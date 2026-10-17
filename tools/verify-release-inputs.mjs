import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const NATIVE_SHA = 'd80d9909e78ffdca831251b514d1a54f11e9118a';
export function requireCompatibleDistribution(result, pin) {
  if (pin?.repository !== 'lioracl/travelmate' || pin.sha !== NATIVE_SHA || pin.nativeApiLevel !== 2 ||
      result?.distribution !== 'OTA_ONLY' || !Array.isArray(result.reasons) || result.reasons.length) {
    throw Error('Unreviewed native compatibility delta cannot use the fixed authorized API2 wrapper');
  }
  return {nativeSha: NATIVE_SHA, nativeApiLevel: 2, ...result};
}
export function exactSha(value) {
  if (!/^[a-f0-9]{40}$/.test(value || '')) throw Error('Full lowercase commit SHA required');
  return value;
}
export function verifyPreview(preview, sha, webVersion) {
  exactSha(sha);
  if (preview?.sha !== sha || preview.channel !== 'preview' || preview.version !== webVersion) throw Error('Deployed Preview provenance mismatch');
}
export function certificate(value) {
  const normalized = (value || '').trim().replaceAll(':', '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw Error('Permanent QA certificate SHA256 required');
  return normalized;
}
export function signingReady(env) {
  for (const key of ['TRAVELMATE_QA_KEYSTORE_BASE64', 'TRAVELMATE_QA_STORE_PASSWORD', 'TRAVELMATE_QA_KEY_ALIAS', 'TRAVELMATE_QA_KEY_PASSWORD']) {
    if (!env[key]?.trim()) throw Error('Missing signing configuration: ' + key);
  }
  return certificate(env.TRAVELMATE_QA_CERT_SHA256);
}
export function validate({sha, preview, pin, native, gradle, expectedVersion, expectedCode, webVersion}) {
  exactSha(sha);
  verifyPreview(preview, sha, webVersion);
  if (pin.repository !== 'lioracl/travelmate' || pin.sha !== NATIVE_SHA || pin.nativeApiLevel !== 2 || native.nativeApiLevel !== pin.nativeApiLevel) throw Error('Authorized native SHA/API mismatch');
  if (!/^\d+\.\d+\.\d+$/.test(expectedVersion || '') || !/^[1-9]\d{0,8}$/.test(String(expectedCode))) throw Error('Explicit native version/code required');
  const version = gradle.match(/\bversionName\s+"([^"]+)"/)?.[1];
  const code = Number(gradle.match(/\bversionCode\s+(\d+)/)?.[1]);
  if (version !== expectedVersion || code !== Number(expectedCode) || !/applicationId\s+"com\.travelmate\.app"/.test(gradle)) throw Error('Native version/code/applicationId mismatch');
  return {schemaVersion: 1, webSha: sha, webVersion, nativeSha: pin.sha, nativeApiLevel: pin.nativeApiLevel, nativeVersion: version, nativeVersionCode: code, applicationId: 'com.travelmate.app', preview};
}
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
export function sourceContract(root, web, nativeRoot, previewFile, env) {
  const sha = exactSha(env.WEB_SHA);
  const revision = directory => execFileSync('git', ['-C', directory, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
  if (revision(web) !== sha || revision(nativeRoot) !== NATIVE_SHA) throw Error('Checkout revision mismatch');
  const webVersion = fs.readFileSync(path.join(web, 'assets/about.js'), 'utf8').match(/version: '([^']+)'/)?.[1];
  const result = validate({sha, preview: readJson(previewFile), pin: readJson(path.join(root, 'ota-overlay.json')), native: readJson(path.join(nativeRoot, 'native-overlay.json')), gradle: fs.readFileSync(path.join(nativeRoot, 'android/app/build.gradle'), 'utf8'), expectedVersion: env.EXPECTED_NATIVE_VERSION, expectedCode: env.EXPECTED_NATIVE_CODE, webVersion});
  const pkg = readJson(path.join(nativeRoot, 'package.json'));
  for (const name of ['@capacitor/android', '@capacitor/core']) if (pkg.dependencies[name] !== '8.5.2') throw Error('Capacitor contract mismatch');
  if (pkg.devDependencies['@capacitor/cli'] !== '8.5.2') throw Error('Capacitor CLI contract mismatch');
  for (const [file, patterns] of [
    ['android/variables.gradle', [/minSdkVersion = 26\b/, /compileSdkVersion = 36\b/, /targetSdkVersion = 36\b/]],
    ['android/build.gradle', [/com\.android\.tools\.build:gradle:8\.13\.0/]],
    ['android/gradle/wrapper/gradle-wrapper.properties', [/gradle-8\.14\.3-all\.zip/, /validateDistributionUrl=true/]]
  ]) for (const pattern of patterns) if (!pattern.test(fs.readFileSync(path.join(nativeRoot, file), 'utf8'))) throw Error('Toolchain mismatch: ' + file);
  const config = readJson(path.join(nativeRoot, 'capacitor.config.json'));
  if (config.appId !== result.applicationId || config.server?.url || (config.server?.hostname || 'localhost') !== 'localhost' || config.plugins?.LiveUpdate?.autoUpdateStrategy !== 'none' || config.plugins?.LiveUpdate?.autoDeleteBundles !== false || !config.plugins?.LiveUpdate?.publicKey) throw Error('Runtime origin/update safety mismatch');
  return {...result, certificateSha256: certificate(env.TRAVELMATE_QA_CERT_SHA256)};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [root, web, nativeRoot, previewFile, output] = process.argv.slice(2);
  fs.writeFileSync(output, JSON.stringify(sourceContract(root, web, nativeRoot, previewFile, process.env), null, 2) + '\n', {flag: 'wx'});
}

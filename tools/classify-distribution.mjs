import {execFileSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

// Last Preview web SHA explicitly accepted as compatible with the currently installed native shell.
// Advance this only as part of an explicit native-shell release. Comparing cumulatively from this
// baseline prevents a blocked native change from being hidden by a later web-only push.
export const OTA_BASE = '054ca492931cd52c10af8c918f9bb98ec6b1a339';

const nativePath = /(^|\/)(android|ios|native|plugins|native-overlay|ota-native)(\/|$)|capacitor|cordova|native[-_.](?:api|bridge|plugin|widget|live|compat)|(?:stage-native-web|publish-ota|budget-widget-actions)|ota-overlay\.json$|(?:AndroidManifest\.xml|Info\.plist|Podfile|\.pbxproj|\.xcworkspace|\.xcodeproj|\.gradle|\.swift|\.kt|\.java|\.podspec|\.entitlements|\.aab|\.apk)(?:$|\/)/i;
const dependencyPath = /(^|\/)(?:package(?:-lock)?\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?)$/i;
const webPath = /^(?:assets\/|auth\/|trip\/|supabase\/|tests\/|docs\/|tools\/|\.github\/)|^(?:index\.html|sw\.js|manifest\.webmanifest|AGENTS\.md|README\.md|\.gitignore|playwright\.config\.js)$/;
const nativeDependency = /@capacitor\/|@capawesome\/|cordova-plugin-|capacitor-[\w-]+/i;
const nativeApiUse = /@capacitor\/|@capawesome\/|cordova-plugin-|capacitor-[\w-]+|registerPlugin\s*\(|Capacitor\s*(?:\?\.)?\.\s*Plugins|nativeBridge|TravelMateNative/i;

// changes: {path, added, changed}. Both sides of renames are included by the CLI via --no-renames.
export function classify(changes) {
  const reasons = [];
  for (const change of changes) {
    const name = String(change.path || '').replaceAll('\\', '/');
    let reason = null;
    if (nativePath.test(name)) reason = 'native path or compatibility metadata';
    else if (dependencyPath.test(name) && nativeDependency.test(change.changed || change.added || '')) reason = 'native dependency manifest/lock change';
    else if (!webPath.test(name) && !dependencyPath.test(name)) reason = 'unrecognized path requires native compatibility review';
    else if (!/^(?:tests|docs|tools)\//.test(name) && nativeApiUse.test(change.added || '')) reason = 'added native dependency/API usage';
    if (reason) reasons.push({path: name, reason});
  }
  return {distribution: reasons.length ? 'APK_REQUIRED' : 'OTA_ONLY', reasons};
}

export function gitChanges(base, head = 'HEAD', cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')) {
  if (!base || /^0+$/.test(base)) throw Error('A known OTA compatibility base is required');
  const git = args => execFileSync('git', args, {cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024});
  git(['rev-parse', '--verify', `${base}^{commit}`]);
  git(['rev-parse', '--verify', `${head}^{commit}`]);
  git(['merge-base', '--is-ancestor', base, head]);
  const names = git(['diff', '--no-renames', '--name-only', '-z', base, head]).split('\0').filter(Boolean);
  return names.map(name => {
    const patch = git(['diff', '--no-ext-diff', '--no-renames', '--unified=0', base, head, '--', name])
      .split('\n').filter(line => /^[+-]/.test(line) && !/^(\+\+\+|---)/.test(line));
    return {
      path: name,
      added: patch.filter(line => line.startsWith('+')).join('\n'),
      changed: patch.join('\n')
    };
  });
}

export function classifyGitRange(base = OTA_BASE, head = 'HEAD', cwd) {
  return classify(gitChanges(base, head, cwd));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const head = process.argv[2] || 'HEAD';
    const result = classifyGitRange(OTA_BASE, head);
    const summary = `Distribution=${result.distribution} APK_required=${result.distribution === 'OTA_ONLY' ? 'NO' : 'YES'} OTA_base=${OTA_BASE}`;
    console.log(summary);
    for (const item of result.reasons) console.log(`${item.path}: ${item.reason}`);
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## ${summary}\n${result.reasons.map(item => `- ${item.path}: ${item.reason}`).join('\n')}\n`);
    }
    if (result.distribution !== 'OTA_ONLY') process.exitCode = 1;
  } catch (error) {
    console.error(`Distribution=APK_REQUIRED APK_required=YES — classification failed closed: ${error.message}`);
    process.exitCode = 1;
  }
}

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const source = path.resolve(process.argv[2] || root);
const dist = path.resolve(process.argv[3] || path.join(root, 'dist'));
if (dist === source || dist === root) throw Error('Native output must be separate');
const files = ['index.html', 'manifest.webmanifest', 'sw.js'];
const directories = ['assets', 'trip'];

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

for (const file of files) fs.copyFileSync(path.join(source, file), path.join(dist, file));
for (const directory of directories) fs.cpSync(path.join(source, directory), path.join(dist, directory), { recursive: true });

// Native-only bridge wiring: never alter the published PWA HTML or its asset cache version.
const nativeScripts = [
  'assets/native-live-update.js',
  'assets/budget-widget-actions.js',
  'assets/native-widget-snapshot.js'
];
for (const script of nativeScripts) fs.copyFileSync(path.join(root, script), path.join(dist, script));
for (const [relativePath, prefix] of [
  ['index.html', ''],
  ['trip/custom/index.html', '../../']
]) {
  const target = path.join(dist, relativePath);
  let html = fs.readFileSync(target, 'utf8');
  if (!/<\/body>/i.test(html)) throw new Error(`Native staging missing body: ${relativePath}`);
  const tags = nativeScripts.filter(script => !html.includes(path.basename(script))).map(script => `  <script src="${prefix}${script}" defer></script>`);
  if (tags.length) html = html.replace(/<\/body>/i, `${tags.join('\n')}\n</body>`);
  fs.writeFileSync(target, html);
}

if (fs.existsSync(path.join(source,'build-info.json'))) fs.copyFileSync(path.join(source,'build-info.json'),path.join(dist,'build-info.json'));
const {execFileSync} = await import('node:child_process');
const sourceBuild=fs.existsSync(path.join(source,'build-info.json'))?JSON.parse(fs.readFileSync(path.join(source,'build-info.json'))):null;
execFileSync(process.execPath,[path.join(root,'tools','stamp-web-build.mjs'),dist],{stdio:'inherit',env:{...process.env,...(sourceBuild?{TRAVELMATE_WEB_BUILD_SHA:sourceBuild.sha,TRAVELMATE_WEB_BUILD_VERSION:sourceBuild.version}:{})}});
const build=JSON.parse(fs.readFileSync(path.join(dist,'build-info.json')));
build.nativeApiLevel=JSON.parse(fs.readFileSync(path.join(root,'native-overlay.json'))).nativeApiLevel;
fs.writeFileSync(path.join(dist,'build-info.json'),JSON.stringify(build,null,2)+'\n');
fs.writeFileSync(path.join(dist,'assets','web-build.js'),'window.TravelMateWebBuild=Object.freeze('+JSON.stringify(build)+');\n');
console.log(`Staged TravelMate web assets in ${dist}`);

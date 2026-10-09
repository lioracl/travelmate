import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dist = path.join(root, 'dist');
const files = ['index.html', 'manifest.webmanifest', 'sw.js'];
const directories = ['assets', 'trip'];

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

for (const file of files) fs.copyFileSync(path.join(root, file), path.join(dist, file));
for (const directory of directories) fs.cpSync(path.join(root, directory), path.join(dist, directory), { recursive: true });

// Native-only bridge wiring: never alter the published PWA HTML or its asset cache version.
const nativeScripts = [
  'assets/budget-widget-actions.js',
  'assets/native-widget-snapshot.js'
];
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

console.log(`Staged TravelMate web assets in ${dist}`);

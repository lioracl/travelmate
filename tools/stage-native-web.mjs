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

for (const file of files) {
  fs.copyFileSync(path.join(root, file), path.join(dist, file));
}

for (const directory of directories) {
  fs.cpSync(path.join(root, directory), path.join(dist, directory), { recursive: true });
}

// Native-only bridge wiring: never alter the published PWA HTML or its asset cache version.
for (const [relativePath, scriptPath] of [
  ['index.html', 'assets/native-widget-snapshot.js'],
  ['trip/custom/index.html', '../../assets/native-widget-snapshot.js']
]) {
  const target = path.join(dist, relativePath);
  const html = fs.readFileSync(target, 'utf8');
  if (!/<\/body>/i.test(html)) throw new Error(`Native staging missing body: ${relativePath}`);
  if (!html.includes('native-widget-snapshot.js')) {
    fs.writeFileSync(target, html.replace(/<\/body>/i, `  <script src="${scriptPath}" defer></script>\n</body>`));
  }
}

console.log(`Staged TravelMate web assets in ${dist}`);

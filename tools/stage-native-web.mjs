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

console.log(`Staged TravelMate web assets in ${dist}`);

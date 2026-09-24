'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function walk(dir, predicate, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    const stat = fs.statSync(file);
    if (stat.isDirectory()) walk(file, predicate, out);
    else if (predicate(file)) out.push(file);
  }
  return out;
}

test('visible assistant branding stays Mate while legacy internal Navo identifiers may remain', () => {
  const files = walk(root, (file) => /\.(?:html|js|css)$/i.test(file) && !file.includes(path.sep + 'tests' + path.sep) && !file.includes(path.sep + 'docs' + path.sep));
  const offenders = [];
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    if (/נבו|\bNevo\b/.test(source)) offenders.push(path.relative(root, file));
    assert.doesNotMatch(source, /\bTravelMateMate\b/, path.relative(root, file) + ' must preserve the legacy TravelMateNavo API name');
  }
  assert.deepEqual(offenders, [], 'visible legacy assistant branding returned');
});

test('PWA manifest local entry points and icons exist', () => {
  const manifestPath = path.join(root, 'manifest.webmanifest');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const refs = [manifest.start_url]
    .concat((manifest.icons || []).map((icon) => icon.src))
    .concat((manifest.shortcuts || []).map((shortcut) => shortcut.url))
    .concat((manifest.shortcuts || []).flatMap((shortcut) => (shortcut.icons || []).map((icon) => icon.src)));

  for (const ref of refs.filter(Boolean)) {
    const pathname = String(ref).split('?')[0].replace(/^\.\//, '');
    assert.ok(fs.existsSync(path.join(root, pathname)), 'manifest reference missing: ' + ref);
  }

  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.lang, 'he');
  assert.equal(manifest.dir, 'rtl');
});

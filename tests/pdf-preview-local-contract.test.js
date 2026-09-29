const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const vault = fs.readFileSync(path.join(root, 'assets', 'document-vault.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

test('PDF preview prefers same-origin vendored PDF.js with CDN fallback', () => {
  assert.match(vault, /vaultAssetUrl\('vendor\/pdfjs\/pdf\.min\.js'\)/);
  assert.match(vault, /vaultAssetUrl\('vendor\/pdfjs\/pdf\.worker\.min\.js'\)/);
  assert.match(vault, /retrying CDN/);
});

test('vendored PDF.js files exist and are non-trivial', () => {
  const lib = path.join(root, 'assets', 'vendor', 'pdfjs', 'pdf.min.js');
  const worker = path.join(root, 'assets', 'vendor', 'pdfjs', 'pdf.worker.min.js');
  assert.ok(fs.statSync(lib).size > 100000);
  assert.ok(fs.statSync(worker).size > 500000);
});

test('PDF.js stays local but is cached on demand instead of bloating the install shell', () => {
  const core = sw.match(/const CORE_PATHS=\[[\s\S]*?\];/);
  assert.ok(core);
  assert.doesNotMatch(core[0], /vendor\/pdfjs/);
  assert.match(sw, /const versionedAsset=freshAsset&&url\.searchParams\.has\('v'\)/);
  assert.match(sw, /cacheFirstVersioned\(event\.request,event\)/);
});

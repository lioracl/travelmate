'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const htmlEntries = [
  'index.html',
  'trip/custom/index.html',
  'trip/italy-2028/index.html',
  'trip/japan-2027/index.html'
];

function localAssetRefs(source) {
  return [...source.matchAll(/(?:src|href)=["']([^"'#]+)["']/g)]
    .map((match) => match[1])
    .filter((value) => !/^(?:https?:|mailto:|tel:|data:|javascript:)/i.test(value));
}

test('entry points reference existing local assets and one cache version', () => {
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const swVersion = sw.match(/const ASSET_VERSION='([^']+)'/);
  assert.ok(swVersion, 'sw.js must expose ASSET_VERSION');

  for (const entry of htmlEntries) {
    const file = path.join(root, entry);
    const source = fs.readFileSync(file, 'utf8');
    const dir = path.dirname(file);
    const versions = new Set();

    for (const ref of localAssetRefs(source)) {
      const [pathname, query = ''] = ref.split('?');
      assert.ok(fs.existsSync(path.resolve(dir, pathname)), entry + ' missing asset: ' + ref);
      const version = new URLSearchParams(query).get('v');
      if (version) versions.add(version);
    }

    assert.deepEqual([...versions], [swVersion[1]], entry + ' asset version drifted from sw.js');
  }
});

test('service-worker core paths all exist', () => {
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const paths = [...sw.matchAll(/'\.\/([^']+)'/g)].map((match) => match[1]);
  assert.ok(paths.length > 0, 'service worker core path list is empty');
  for (const item of paths) {
    assert.ok(fs.existsSync(path.join(root, item)), 'service worker missing core path: ' + item);
  }
});

test('dynamic feature-loader assets all exist', () => {
  const app = fs.readFileSync(path.join(root, 'assets/app.js'), 'utf8');
  const names = new Set(
    [...app.matchAll(/['"]([a-z0-9][a-z0-9._-]+\.(?:js|css))['"]/gi)].map((match) => match[1])
  );
  assert.ok(names.size > 0, 'app.js dynamic feature list is empty');
  for (const name of names) {
    assert.ok(fs.existsSync(path.join(root, 'assets', name)), 'dynamic feature asset missing: ' + name);
  }
});

test('retired contrast override layers stay removed', () => {
  for (const file of ['contrast-core.css', 'contrast-detail.css', 'contrast-final.css', 'contrast-view.css']) {
    assert.equal(fs.existsSync(path.join(root, 'assets', file)), false, file + ' must not return');
  }
});

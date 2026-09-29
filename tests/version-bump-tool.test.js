'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');

async function loadTool() {
  return import(pathToFileURL(path.join(root, 'tools', 'bump-version.mjs')).href);
}

test('version manager validates the TravelMate version format', async () => {
  const tool = await loadTool();
  assert.equal(tool.validateVersion('20260929-47'), '20260929-47');
  assert.throws(() => tool.validateVersion('v47'), /YYYYMMDD-N/);
  assert.throws(() => tool.validateVersion('2026-09-29'), /YYYYMMDD-N/);
});

test('version manager reads the canonical version from the service worker', async () => {
  const tool = await loadTool();
  assert.equal(tool.currentVersionFromServiceWorker("const ASSET_VERSION='20260929-46';"), '20260929-46');
  assert.throws(() => tool.currentVersionFromServiceWorker('const CACHE_NAME="x";'), /ASSET_VERSION/);
});

test('version manager replaces only the canonical version token', async () => {
  const tool = await loadTool();
  const result = tool.replaceExactVersion(
    'a?v=20260929-46 b?v=20260929-46 historical=20260929-45',
    '20260929-46',
    '20260929-47',
    'fixture'
  );
  assert.equal(result.replacements, 2);
  assert.equal(result.content, 'a?v=20260929-47 b?v=20260929-47 historical=20260929-45');
  assert.throws(() => tool.replaceExactVersion('no version here', '20260929-46', '20260929-47', 'fixture'), /does not contain/);
});

test('version manager updates all declared files atomically after validation', async () => {
  const tool = await loadTool();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'travelmate-version-'));

  try {
    for (const relativePath of tool.VERSIONED_FILES) {
      const target = path.join(tempRoot, relativePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const body = relativePath === 'sw.js'
        ? "const ASSET_VERSION='20260929-46';\n"
        : 'asset?v=20260929-46\n';
      fs.writeFileSync(target, body, 'utf8');
    }

    const result = await tool.bumpVersion('20260929-47', tempRoot);
    assert.equal(result.currentVersion, '20260929-46');
    assert.equal(result.nextVersion, '20260929-47');
    assert.equal(result.files.length, tool.VERSIONED_FILES.length);

    for (const relativePath of tool.VERSIONED_FILES) {
      const content = fs.readFileSync(path.join(tempRoot, relativePath), 'utf8');
      assert.match(content, /20260929-47/);
      assert.doesNotMatch(content, /20260929-46/);
    }

    const check = await tool.verifyVersionSync(tempRoot);
    assert.equal(check.currentVersion, '20260929-47');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('current repository asset version references are synchronized', () => {
  const output = execFileSync(process.execPath, ['tools/bump-version.mjs', '--check'], {
    cwd: root,
    encoding: 'utf8'
  });
  assert.match(output, /Asset version is synchronized: 20260929-46/);
  assert.match(output, /Checked files: 7/);
});

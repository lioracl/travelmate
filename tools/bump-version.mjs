#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const VERSIONED_FILES = Object.freeze([
  'index.html',
  'trip/custom/index.html',
  'trip/italy-2028/index.html',
  'trip/japan-2027/index.html',
  'assets/app.js',
  'sw.js',
  'tests/sync-conflict-ui-contract.test.js'
]);

const VERSION_PATTERN = /^20\d{6}-\d+$/;
const ASSET_VERSION_PATTERN = /const ASSET_VERSION='(20\d{6}-\d+)'/;

export function validateVersion(value) {
  if (!VERSION_PATTERN.test(String(value || ''))) {
    throw new Error('Version must match YYYYMMDD-N, for example 20260929-47.');
  }
  return String(value);
}

export function currentVersionFromServiceWorker(source) {
  const match = String(source || '').match(ASSET_VERSION_PATTERN);
  if (!match) throw new Error('Could not find ASSET_VERSION in sw.js.');
  return match[1];
}

export function replaceExactVersion(source, currentVersion, nextVersion, fileName = 'file') {
  const text = String(source);
  const count = text.split(currentVersion).length - 1;
  if (!count) {
    throw new Error(fileName + ' does not contain the canonical version ' + currentVersion + '.');
  }
  return { content: text.split(currentVersion).join(nextVersion), replacements: count };
}

export async function verifyVersionSync(rootDir = process.cwd()) {
  const swPath = path.join(rootDir, 'sw.js');
  const sw = await fs.readFile(swPath, 'utf8');
  const currentVersion = currentVersionFromServiceWorker(sw);
  const mismatches = [];

  for (const relativePath of VERSIONED_FILES) {
    const filePath = path.join(rootDir, relativePath);
    const content = await fs.readFile(filePath, 'utf8');
    if (!content.includes(currentVersion)) mismatches.push(relativePath);
  }

  if (mismatches.length) {
    throw new Error('Version drift detected. Missing ' + currentVersion + ' in: ' + mismatches.join(', '));
  }

  return { currentVersion, files: VERSIONED_FILES.slice() };
}

export async function bumpVersion(nextVersion, rootDir = process.cwd(), options = {}) {
  nextVersion = validateVersion(nextVersion);
  const dryRun = Boolean(options.dryRun);
  const sw = await fs.readFile(path.join(rootDir, 'sw.js'), 'utf8');
  const currentVersion = currentVersionFromServiceWorker(sw);

  if (nextVersion === currentVersion) {
    throw new Error('New version must differ from current version ' + currentVersion + '.');
  }

  const updates = [];
  for (const relativePath of VERSIONED_FILES) {
    const filePath = path.join(rootDir, relativePath);
    const source = await fs.readFile(filePath, 'utf8');
    const result = replaceExactVersion(source, currentVersion, nextVersion, relativePath);
    updates.push({ relativePath, filePath, content: result.content, replacements: result.replacements });
  }

  if (!dryRun) {
    for (const update of updates) {
      await fs.writeFile(update.filePath, update.content, 'utf8');
    }
    await verifyVersionSync(rootDir);
  }

  return {
    currentVersion,
    nextVersion,
    dryRun,
    files: updates.map(({ relativePath, replacements }) => ({ path: relativePath, replacements }))
  };
}

function usage() {
  return [
    'Usage:',
    '  node tools/bump-version.mjs --check',
    '  node tools/bump-version.mjs <YYYYMMDD-N> [--dry-run]',
    '',
    'Examples:',
    '  node tools/bump-version.mjs --check',
    '  node tools/bump-version.mjs 20260929-47 --dry-run',
    '  node tools/bump-version.mjs 20260929-47'
  ].join('\n');
}

async function main(argv) {
  const args = argv.slice(2);
  if (!args.length || args.includes('--help') || args.includes('-h')) {
    console.log(usage());
    return;
  }

  if (args[0] === '--check') {
    const result = await verifyVersionSync(process.cwd());
    console.log('Asset version is synchronized:', result.currentVersion);
    console.log('Checked files:', result.files.length);
    return;
  }

  const nextVersion = args[0];
  const result = await bumpVersion(nextVersion, process.cwd(), { dryRun: args.includes('--dry-run') });
  console.log((result.dryRun ? 'Dry run' : 'Updated') + ': ' + result.currentVersion + ' -> ' + result.nextVersion);
  for (const file of result.files) console.log('- ' + file.path + ' (' + file.replacements + ' replacements)');
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectRun) {
  main(process.argv).catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

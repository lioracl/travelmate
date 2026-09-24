'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'assets');

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

test('Supabase library loading has one canonical owner and remains retry-safe', () => {
  const jsFiles = fs.readdirSync(assets).filter((name) => name.endsWith('.js'));
  const owners = jsFiles.filter((name) => /window\.travelMateSupabaseLoader\s*=/.test(fs.readFileSync(path.join(assets, name), 'utf8')));
  assert.deepEqual(owners, ['cloud-sync.js']);

  const cloud = read('assets/cloud-sync.js');
  assert.match(cloud, /window\.travelMateSupabaseLoader = null/);
  assert.match(cloud, /if \(clientPromise === attempt\) clientPromise = null;/);

  const vault = read('assets/document-vault.js');
  assert.doesNotMatch(vault, /SUPABASE_CDN|SUPABASE_SRI|loadSupabaseLibrary|travelMateSupabaseLoader/);
  assert.match(vault, /window\.TravelMateCloud\.getClient\(\)/);
});

test('Getaways has one implementation owned by travel-services', () => {
  assert.equal(fs.existsSync(path.join(assets, 'getaway-fix.js')), false);

  const app = read('assets/app.js');
  assert.doesNotMatch(app, /getaway-fix\.js/);
  assert.match(app, /getaways:\{styles:\['travel-services\.css'\],scripts:\['travel-services\.js'\]\}/);

  const services = read('assets/travel-services.js');
  assert.match(services, /function wireGetaways\(\)/);
  assert.match(services, /https:\/\/overpass-api\.de\/api\/interpreter/);
  assert.match(services, /https:\/\/overpass\.kumi\.systems\/api\/interpreter/);
  assert.match(services, /nwr\["natural"~"peak\|waterfall\|beach"\]/);
  assert.match(services, /nwr\["historic"\]/);
  assert.match(services, /getawayFallback\(results\)/);
  assert.doesNotMatch(services, /stopImmediatePropagation/);
});

test('retired Getaways patch is not referenced anywhere in deployable source', () => {
  const files = [];
  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name);
      const stat = fs.statSync(file);
      if (stat.isDirectory()) walk(file);
      else if (/\.(?:html|js|css|webmanifest)$/i.test(name)) files.push(file);
    }
  }
  walk(root);
  const offenders = files
    .filter((file) => !file.includes(path.sep + 'tests' + path.sep))
    .filter((file) => fs.readFileSync(file, 'utf8').includes('getaway-fix.js'))
    .map((file) => path.relative(root, file));
  assert.deepEqual(offenders, []);
});

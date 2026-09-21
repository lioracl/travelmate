const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const home = fs.readFileSync(path.join(root, 'assets/home.js'), 'utf8');
const nearby = fs.readFileSync(path.join(root, 'assets/nearby.js'), 'utf8');

test('home carousel does not eagerly assign all generated Unsplash backgrounds', () => {
  assert.match(home, /slide\.dataset\.slideImage = "url\('https:\/\/images\.unsplash\.com\//);
  assert.match(home, /if \(distance <= 2\) ensureSlideImage\(slide\)/);
  assert.doesNotMatch(home, /slide\.style\.setProperty\('--slide-image',[\s\S]{0,160}imageId/);
});

test('home carousel timer sleeps while hidden or authenticated', () => {
  assert.match(home, /if \(document\.hidden \|\| document\.body\.classList\.contains\('is-authenticated'\)\) return/);
  assert.match(home, /travelmate:home-auth/);
  assert.match(home, /visibilitychange/);
});

test('nearby delayed-init observer disconnects after a panel initializes', () => {
  assert.match(nearby, /var nearbyInitializedCount = initNearbyPanels\(document\)/);
  assert.match(nearby, /if \(!nearbyInitializedCount\)/);
  assert.match(nearby, /if \(initialized\) nearbyInitObserver\.disconnect\(\)/);
});


test('place auto fill inherits the active asset version for smart plan tools', () => {
  const source = fs.readFileSync(path.join(root, 'assets/place-auto-fill.js'), 'utf8');
  assert.match(source, /featureVersion = featureUrl\.searchParams\.get\('v'\)/);
  assert.match(source, /smart-plan-tools\.js[\s\S]*featureVersion/);
  assert.doesNotMatch(source, /20260920-1/);
});

test('place auto fill caches identical Overpass queries and aborts losing mirrors', () => {
  const source = fs.readFileSync(path.join(root, 'assets/place-auto-fill.js'), 'utf8');
  assert.match(source, /var overpassCache = new Map\(\)/);
  assert.match(source, /overpassCacheLifetime = 120000/);
  assert.match(source, /overpassCache\.get\(query\)/);
  assert.match(source, /controllerIndex !== index[\s\S]*controller\.abort\(\)/);
});


test('legacy sidebar scroll work is coalesced to one animation frame', () => {
  const source = fs.readFileSync(path.join(root, 'assets/app.js'), 'utf8');
  assert.match(source, /function scheduleLegacySidebar\(\)/);
  assert.match(source, /requestAnimationFrame\(function\(\)\{legacySidebarFrame=0;syncLegacySidebar\(\)\}\)/);
  assert.match(source, /addEventListener\('scroll',scheduleLegacySidebar/);
});

test('network usage persistence is batched instead of writing on every resource', () => {
  const source = fs.readFileSync(path.join(root, 'assets/network-usage.js'), 'utf8');
  assert.match(source, /var usageFlushTimer = null/);
  assert.match(source, /function scheduleUsageFlush\(\)/);
  assert.match(source, /usageFlushTimer = setTimeout\(flushUsage, 350\)/);
  assert.match(source, /state\.bytes \+= bytes;\s*scheduleUsageFlush\(\)/);
  assert.match(source, /addEventListener\('pagehide'[\s\S]*flushUsage\(\)/);
});

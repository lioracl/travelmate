const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const home = fs.readFileSync(path.join(root, 'assets/home.js'), 'utf8');
const nearby = fs.readFileSync(path.join(root, 'assets/nearby.js'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

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


test('nearby destination request removes its temporary listener on success and timeout', () => {
  assert.match(nearby, /function requestDestination\(\)[\s\S]*function finish\(value\)[\s\S]*removeEventListener\('nearby:destination-ready',ready\)/);
  assert.match(nearby, /timer=setTimeout\(function\(\)\{finish\(null\)\},7500\)/);
  assert.match(nearby, /function ready\(event\)\{finish\(event\.detail\|\|null\)\}/);
});

test('nearby result enhancement is event-driven without a broad panel mutation observer', () => {
  const source = fs.readFileSync(path.join(root, 'assets/app.js'), 'utf8');
  assert.match(source, /travelmate:nearby-results-rendered[\s\S]*enhanceResults/);
  assert.doesNotMatch(source, /pendingResultRoots|resultEnhancementScheduled/);
});

test('network usage meter does not clone response bodies solely to measure unknown lengths', () => {
  const source = fs.readFileSync(path.join(root, 'assets/network-usage.js'), 'utf8');
  assert.match(source, /content-length/);
  assert.doesNotMatch(source, /response\.clone\(\)\.blob\(\)/);
});

test('nearby caps supplemental Wikipedia latency and bounds in-memory caches', () => {
  assert.match(nearby, /wikipediaGroupsWithinBudget/);
  assert.match(nearby, /budgetMs \|\| 1800/);
  assert.match(nearby, /resultCacheLimit = 12/);
  assert.match(nearby, /while \(resultCache\.size >= resultCacheLimit\)/);
  assert.match(nearby, /placeMediaCacheLimit = 120/);
  assert.match(nearby, /while \(placeMediaCache\.size >= placeMediaCacheLimit\)/);
});

test('place auto fill evicts expired and excess search and image cache entries', () => {
  const source = fs.readFileSync(path.join(root, 'assets/place-auto-fill.js'), 'utf8');
  assert.match(source, /overpassCacheLimit = 12/);
  assert.match(source, /while \(overpassCache\.size >= overpassCacheLimit\)/);
  assert.match(source, /placeImageCacheLimit = 120/);
  assert.match(source, /while \(placeImageCache\.size >= placeImageCacheLimit\)/);
});

test('collaboration keeps long realtime chat sessions bounded in memory', () => {
  const source = fs.readFileSync(path.join(root, 'assets/collaboration.js'), 'utf8');
  assert.match(source, /MESSAGE_LIMIT = 100/);
  assert.match(source, /listTripMessages[\s\S]*slice\(-MESSAGE_LIMIT\)/);
  assert.ok((source.match(/state\.messages = state\.messages\.slice\(-MESSAGE_LIMIT\)/g) || []).length >= 2);
});

test('trip feature loader inherits the active app asset version and defers noncritical structure', () => {
  const source = fs.readFileSync(path.join(root, 'assets/app.js'), 'utf8');
  assert.match(source, /new URL\(appScript\.src,location\.href\)\.searchParams\.get\('v'\)/);
  assert.doesNotMatch(source, /var version='20260921-14'/);
  assert.match(source, /deferredStructureScripts=\['trip-experience\.js','about\.js'\]/);
  assert.match(source, /requestIdleCallback\(run,\{timeout:1800\}\)/);
});

test('Turnstile is armed on auth interaction instead of loading at startup', () => {
  const source = fs.readFileSync(path.join(root, 'assets/security-center.js'), 'utf8');
  assert.match(source, /function armCaptcha\(\)/);
  assert.match(source, /\[data-cloud-auth-form\],\[data-cloud-account-open\]/);
  assert.match(source, /wire\(\); armCaptcha\(\)/);
  assert.doesNotMatch(source, /wire\(\); setupCaptcha\(\)/);
});

test('getaway destination geocoding waits for the first search submit', () => {
  const source = fs.readFileSync(path.join(root, 'assets/travel-services.js'), 'utf8');
  assert.match(source, /async function ensureCoords\(\)/);
  assert.match(source, /form\.addEventListener\('submit'[\s\S]*await ensureCoords\(\)/);
  assert.doesNotMatch(source, /coords=null;geocode\(trip\.city/);
});

test('service worker precaches startup essentials and runtime-caches feature-only bundles', () => {
  assert.match(serviceWorker, /security-center\.js/);
  assert.match(serviceWorker, /trip-redesign\.js/);
  assert.match(serviceWorker, /theme\.js/);
  assert.match(serviceWorker, /document-vault\.js/);
  assert.doesNotMatch(serviceWorker, /'\.\/assets\/ai-assistant\.js'/);
  assert.doesNotMatch(serviceWorker, /'\.\/assets\/smart-hub\.js'/);
  assert.doesNotMatch(serviceWorker, /'\.\/assets\/trip-intelligence\.js'/);
  assert.doesNotMatch(serviceWorker, /'\.\/assets\/trip-experience\.js'/);
  assert.doesNotMatch(serviceWorker, /'\.\/assets\/about\.js'/);
  assert.doesNotMatch(serviceWorker, /'\.\/assets\/admin-center\.js'/);
  assert.doesNotMatch(serviceWorker, /'\.\/assets\/auto-planner\.js'/);
  assert.doesNotMatch(serviceWorker, /'\.\/assets\/nearby\.js'/);
  assert.doesNotMatch(serviceWorker, /'\.\/assets\/collaboration\.js'/);
  assert.doesNotMatch(serviceWorker, /'\.\/assets\/transport-planner\.js'/);
  assert.match(serviceWorker, /freshAsset[\s\S]*networkFirst\(event\.request\)/);
});

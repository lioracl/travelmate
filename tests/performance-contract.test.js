const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const home = fs.readFileSync(path.join(root, 'assets/home.js'), 'utf8');
const nearby = fs.readFileSync(path.join(root, 'assets/nearby.js'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const tripExperience = fs.readFileSync(path.join(root, 'assets/trip-experience.js'), 'utf8');
const smartPlanTools = fs.readFileSync(path.join(root, 'assets/smart-plan-tools.js'), 'utf8');
const aboutScript = fs.readFileSync(path.join(root, 'assets/about.js'), 'utf8');
const appScript = fs.readFileSync(path.join(root, 'assets/app.js'), 'utf8');
const homeScript = fs.readFileSync(path.join(root, 'assets/home.js'), 'utf8');

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


test('legacy sidebar scroll ownership is removed in favor of trip-redesign navigation state', () => {
  const source = fs.readFileSync(path.join(root, 'assets/app.js'), 'utf8');
  assert.doesNotMatch(source, /syncLegacySidebar|scheduleLegacySidebar/);
  assert.doesNotMatch(source, /addEventListener\('scroll',scheduleLegacySidebar/);
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

test('trip feature loader inherits the active asset version and keeps heavy structure lazy', () => {
  const source = fs.readFileSync(path.join(root, 'assets/app.js'), 'utf8');
  assert.match(source, /new URL\(appScript\.src,location\.href\)\.searchParams\.get\('v'\)/);
  assert.doesNotMatch(source, /var version='20260921-14'/);
  assert.doesNotMatch(source, /loadStructure|deferredStructureScripts|structureScripts|structureStyles/);
  assert.match(source, /ensureLazyNavigation\(\)/);
  assert.match(source, /dynamicSectionViews=\{transport:true,getaways:true,group:true,memories:true\}/);
  assert.match(source, /assistant:\{styles:\['ai-assistant\.css','smart-hub\.css'\],scripts:\['ai-assistant\.js','smart-hub\.js'\]\}/);
  assert.match(source, /account:\{styles:\['security-center\.css','admin-center\.css'\],scripts:\['security-center\.js','admin-center\.js'\]\}/);
  assert.match(source, /scheduleIdleFeature\('assistant',2200\)/);
  assert.match(source, /scheduleIdleFeature\('account',4200\)/);
  assert.doesNotMatch(source, /overview:\{[^}]*ai-assistant/);
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
  assert.doesNotMatch(serviceWorker, /'\.\/assets\/security-center\.js'/);
  assert.match(serviceWorker, /trip-redesign\.js/);
  assert.match(serviceWorker, /theme\.js/);
  assert.doesNotMatch(serviceWorker, /'\.\/assets\/document-vault\.js'/);
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

test('versioned local assets use cache-first because the version is part of the URL', () => {
  assert.match(serviceWorker, /async function cacheFirstVersioned/);
  assert.match(serviceWorker, /versionedAsset=freshAsset&&url\.searchParams\.has\('v'\)/);
  assert.match(serviceWorker, /versionedAsset[\s\S]*cacheFirstVersioned\(event\.request\)/);
});

test('Overpass mirrors are hedged instead of both starting immediately', () => {
  const autoFill = fs.readFileSync(path.join(root, 'assets/place-auto-fill.js'), 'utf8');
  assert.match(nearby, /delayTimer=setTimeout\(start,900\*index\)/);
  assert.match(autoFill, /delayTimer = setTimeout\(startRequest, 900 \* index\)/);
  assert.match(nearby, /if\(index===0\)start\(\)/);
  assert.match(autoFill, /if \(index === 0\) startRequest\(\)/);
});

test('mobile trip header has one high-specificity geometry authority', () => {
  const source = fs.readFileSync(path.join(root, 'assets/theme.css'), 'utf8');
  const authorities = source.match(/html body:not\(\.home-page\) \.mobile-header\{\s*position:(?:fixed|sticky)!important;/g) || [];
  assert.equal(authorities.length, 1);
  assert.match(source, /Mobile layout authority: the single source of truth for trip header geometry/);
  assert.doesNotMatch(source, /padding-top:94px!important/);
  assert.doesNotMatch(source, /\+ 84px\)!important/);
});


test('currency rates prefer browser-compatible providers before the legacy Frankfurter endpoint', () => {
  const openEr = tripExperience.indexOf('https://open.er-api.com/v6/latest/EUR');
  const exchangeV4 = tripExperience.indexOf('https://api.exchangerate-api.com/v4/latest/EUR');
  const frankfurter = tripExperience.indexOf('https://api.frankfurter.dev/v1/latest?base=EUR&symbols=');
  assert.ok(openEr >= 0 && exchangeV4 > openEr && frankfurter > exchangeV4);
  assert.doesNotMatch(tripExperience, /https:\/\/api\.frankfurter\.app\/latest/);
});


test('planner replace-day controls expose an accessible name', () => {
  assert.match(smartPlanTools, /setAttribute\('aria-label', 'החלפת התוכנית ליום '/);
  assert.match(smartPlanTools, /fa-rotate" aria-hidden="true/);
});


test('About returns mobile focus to a visible menu trigger', () => {
  assert.match(aboutScript, /querySelectorAll\('\[data-mobile-menu\]'\)/);
  assert.match(aboutScript, /getBoundingClientRect\(\)/);
  assert.match(aboutScript, /returnRect\.right <= window\.innerWidth/);
  assert.match(aboutScript, /matchMedia\('\(max-width: 900px\)'\)/);
  assert.match(aboutScript, /window\.setTimeout/);
  assert.match(aboutScript, /focusTarget\.focus\(\)/);
});


test('skip link stays hidden until keyboard focus and does not steal initial focus', () => {
  const glass = fs.readFileSync(path.join(root, 'assets/readable-glass.css'), 'utf8');
  assert.doesNotMatch(appScript, /skip\.focus\(\{preventScroll:true\}\)/);
  assert.match(glass, /\.tm-skip-link\{[^}]*transform:translateY\(-160%\)/);
  assert.match(glass, /\.tm-skip-link:focus-visible\{[^}]*transform:translateY\(0\)/);
});


test('home carousel excludes the known ORB-blocked Unsplash asset', () => {
  assert.doesNotMatch(homeScript, /photo-1470214304380-aadaedcfff1b/);
});

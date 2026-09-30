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
const homeHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const homeOrganizer = fs.readFileSync(path.join(root, 'assets/home-organizer.css'), 'utf8');

test('home carousel does not eagerly assign all generated Unsplash backgrounds', () => {
  assert.match(home, /slide\.dataset\.slideImage = "url\('https:\/\/images\.unsplash\.com\//);
  assert.match(home, /if \(distance <= 1\) ensureSlideImage\(slide\)/);
  assert.doesNotMatch(home, /slide\.style\.setProperty\('--slide-image',[\s\S]{0,160}imageId/);
  assert.equal((homeHtml.match(/data-carousel-slide style="--slide-image/g) || []).length, 1);
  assert.match(homeHtml, /data-carousel-slide data-slide-image=/);
});

test('home mobile background keeps desktop quality while using a smaller mobile source', () => {
  assert.match(homeOrganizer, /w=2200&q=92/);
  assert.match(homeOrganizer, /@media\(max-width:760px\)[\s\S]*w=1200&q=86/);
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

test('Home defers Account and Admin assets until account intent', () => {
  assert.doesNotMatch(homeHtml, /assets\/(?:security-center|admin-center)\.(?:css|js)/);
  assert.match(homeScript, /TravelMateFeatures\.ensureAccount\(\)/);
});

test('trip feature loader inherits the active asset version and keeps heavy structure lazy', () => {
  const source = fs.readFileSync(path.join(root, 'assets/app.js'), 'utf8');
  assert.match(source, /new URL\(appScript\.src,location\.href\)\.searchParams\.get\('v'\)/);
  assert.doesNotMatch(source, /var version='20260921-14'/);
  assert.doesNotMatch(source, /loadStructure|deferredStructureScripts|structureScripts|structureStyles/);
  assert.match(source, /ensureLazyNavigation\(\)/);
  assert.match(source, /dynamicSectionViews=\{transport:true,getaways:true,group:true,memories:true\}/);
  assert.match(source, /baseStyles=\[[^\]]*'ai-assistant\.css'/);
  assert.match(source, /assistant:\{styles:\['smart-hub\.css'\],scripts:\['ai-assistant\.js','smart-hub\.js'\]\}/);
  assert.match(source, /account:\{styles:\['security-center\.css','admin-center\.css'\],scripts:\['security-center\.js','admin-center\.js'\]\}/);
  assert.doesNotMatch(source, /scheduleIdleFeature\('assistant'/);
  assert.doesNotMatch(source, /scheduleIdleFeature\('account',4200\)/);
  assert.match(source, /function createAssistantShell\(\)/);
  assert.doesNotMatch(source, /overview:\{[^}]*ai-assistant/);
});

test('admin dialog DOM is created only after admin status is confirmed', () => {
  const source = fs.readFileSync(path.join(root, 'assets/admin-center.js'), 'utf8');
  assert.match(source, /if \(!result\.admin\) return;[\s\S]*createDialog\(\);[\s\S]*addLauncher\(\)/);
  assert.match(source, /function openAdmin\(\)[\s\S]*createDialog\(\);[\s\S]*var modal = document\.querySelector/);
  const init = source.match(/function init\(\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(init);
  assert.doesNotMatch(init[1], /createDialog\(\)/);
});

test('successful feature readiness is memoized without blocking failure retries', () => {
  const source = fs.readFileSync(path.join(root, 'assets/app.js'), 'utf8');
  assert.match(source, /featureLoads=\{\},readyFeatures=\{\}/);
  assert.match(source, /if\(readyFeatures\[view\]\)return Promise\.resolve\(true\)/);
  assert.match(source, /if\(featureLoads\[view\]\)return featureLoads\[view\]/);
  assert.match(source, /travelmate:feature-ready[\s\S]*delete featureLoads\[view\];[\s\S]*if\(ready!==false\)readyFeatures\[view\]=true/);
  assert.match(source, /function\(error\)\{\s*delete featureLoads\[view\];\s*throw error/);
});

test('failed dynamic assets are evicted and do not announce a ready feature', () => {
  const source = fs.readFileSync(path.join(root, 'assets/app.js'), 'utf8');
  assert.match(source, /style\.onerror=function\(\)\{[^}]*style\.remove\(\);delete loadedStyles\[file\];resolve\(false\)/);
  assert.match(source, /script\.onerror=function\(\)\{[^}]*script\.remove\(\);delete loadedScripts\[file\];resolve\(false\)/);
  assert.match(source, /if\(results\.some\(function\(result\)\{return result===false\}\)\)return false/);
  assert.match(source, /if\(ready===false\)return false;[\s\S]*travelmate:feature-ready/);
  assert.match(source, /loadFeature\('about'\)\.then\(function\(ready\)\{if\(ready===false\)return;button\.removeAttribute\('data-lazy-about'\)/);
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

test('service worker uses a release-scoped cache namespace and prunes older TravelMate caches', () => {
  assert.match(serviceWorker, /const CACHE_SCHEMA='v266'/);
  assert.match(serviceWorker, /const CACHE_NAME='travelmate-smart-'\+CACHE_SCHEMA\+'-'\+ASSET_VERSION/);
  assert.match(serviceWorker, /TRAVELMATE_CACHE_PATTERN=\/\^travelmate-smart-v\\d\+\(\?:-20\\d\{6\}-\\d\+\)\?\$\//);
  assert.match(serviceWorker, /keys\.filter\(key=>TRAVELMATE_CACHE_PATTERN\.test\(key\)&&key!==CACHE_NAME\)/);
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
  assert.match(serviceWorker, /freshAsset[\s\S]*networkFirst\(event\.request,event,false\)/);
});

test('service worker treats HTTP 5xx navigation responses as recoverable offline failures', () => {
  assert.match(serviceWorker, /if\(response\.status>=500\)\{[\s\S]*?caches\.match\(request,matchOptions\)[\s\S]*?throw new Error\('http-'\+response\.status\)/);
});

test('versioned local assets use cache-first because the version is part of the URL', () => {
  assert.match(serviceWorker, /async function cacheFirstVersioned/);
  assert.match(serviceWorker, /versionedAsset=freshAsset&&url\.searchParams\.has\('v'\)/);
  assert.match(serviceWorker, /versionedAsset[\s\S]*cacheFirstVersioned\(event\.request,event\)/);
});

test('Overpass mirrors are hedged instead of both starting immediately', () => {
  const autoFill = fs.readFileSync(path.join(root, 'assets/place-auto-fill.js'), 'utf8');
  assert.match(nearby, /delayTimer=setTimeout\(start,900\*index\)/);
  assert.match(autoFill, /delayTimer = setTimeout\(startRequest, 900 \* index\)/);
  assert.match(nearby, /if\(index===0\)start\(\)/);
  assert.match(autoFill, /if \(index === 0\) startRequest\(\)/);
});

test('mobile trip header geometry has one feature owner without important escalation', () => {
  const theme = fs.readFileSync(path.join(root, 'assets/theme.css'), 'utf8');
  const redesign = fs.readFileSync(path.join(root, 'assets/trip-redesign.css'), 'utf8');
  const authorities = redesign.match(/body:not\(\.home-page\) \.mobile-header\{\s*position:(?:fixed|sticky);/g) || [];
  assert.equal(authorities.length, 1);
  assert.match(redesign, /Navigation geometry authority — Phase 2/);
  assert.doesNotMatch(theme, /\.mobile-header\{\s*position:(?:fixed|sticky)!important/);
  assert.doesNotMatch(redesign, /padding-top:94px/);
  assert.doesNotMatch(redesign, /\+ 84px\)/);
});


test('currency rates prefer browser-compatible providers before the legacy Frankfurter endpoint', () => {
  const openEr = tripExperience.indexOf('https://open.er-api.com/v6/latest/EUR');
  const exchangeV4 = tripExperience.indexOf('https://api.exchangerate-api.com/v4/latest/EUR');
  const frankfurter = tripExperience.indexOf('https://api.frankfurter.dev/v1/latest?base=EUR&symbols=');
  assert.ok(openEr >= 0 && exchangeV4 > openEr && frankfurter > exchangeV4);
  assert.doesNotMatch(tripExperience, /https:\/\/api\.frankfurter\.app\/latest/);
});


test('fresh cached currency rates skip a redundant network refresh', () => {
  assert.match(tripExperience, /renderCurrency\(\); renderCurrencyConverter\(\); return; \}/);
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


test('home boot loads only home essentials and keeps About lazy', () => {
  const source = fs.readFileSync(path.join(root, 'assets/app.js'), 'utf8');
  const entry = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(source, /homeBaseStyles=\['language\.css','network-usage\.css','theme\.css'\]/);
  assert.match(source, /if\(isHomePage\)[\s\S]*homeBaseStyles\.map\(loadStyle\)[\s\S]*loadSequence\(\['language\.js','theme\.js','user-profile\.js'\]\)/);
  assert.match(source, /\}else\{[\s\S]*var initialView=activeView\(\)[\s\S]*loadFeature\(initialView\)/);
  assert.equal((entry.match(/data-about-open data-lazy-about/g) || []).length, 2);
});


test('service worker registration is a delayed app bootstrap instead of a Smart Hub side effect', () => {
  const app = fs.readFileSync(path.join(root, 'assets/app.js'), 'utf8');
  const hub = fs.readFileSync(path.join(root, 'assets/smart-hub.js'), 'utf8');
  assert.match(app, /window\.addEventListener\('load',schedule,\{once:true\}\)/);
  assert.match(app, /requestIdleCallback\(register,\{timeout:3000\}\)/);
  assert.match(app, /var appAssetVersion=\(function\(\)\{try\{return new URL\(appScript\.src,location\.href\)\.searchParams\.get\('v'\)/);
  assert.match(app, /navigator\.serviceWorker\.register\(new URL\('sw\.js\?v='\+encodeURIComponent\(appAssetVersion\),rootUrl\)\.href,\{updateViaCache:'none'\}\)/);
  assert.doesNotMatch(app, /serviceWorker\.register\([^\n]*encodeURIComponent\(version\)/);
  assert.match(app, /window\.TravelMateInstallPrompt=event/);
  assert.doesNotMatch(hub, /navigator\.serviceWorker\.register/);
  assert.doesNotMatch(hub, /manifest\.webmanifest/);
  assert.match(hub, /window\.TravelMateServiceWorkerRegistration/);
  assert.match(hub, /window\.TravelMateInstallPrompt/);
});

test('network usage keeps its counted resource identity set bounded', () => {
  const source = fs.readFileSync(path.join(root, 'assets/network-usage.js'), 'utf8');
  assert.match(source, /var countedEntryLimit = 800/);
  assert.match(source, /while \(countedEntries\.size > countedEntryLimit\) countedEntries\.delete\(countedEntries\.values\(\)\.next\(\)\.value\)/);
});

test('auto planner coalesces mutation enhancement work into one animation frame', () => {
  const source = fs.readFileSync(path.join(root, 'assets/auto-planner.js'), 'utf8');
  assert.match(source, /var enhancementFrame=0/);
  assert.match(source, /function scheduleEnhancements\(\)\{if\(enhancementFrame\)return;enhancementFrame=requestAnimationFrame/);
  assert.match(source, /var observer=new MutationObserver\(scheduleEnhancements\)/);
  assert.match(source, /planner-rendered',scheduleEnhancements/);
  assert.doesNotMatch(source, /new MutationObserver\(function\(\)\{requestAnimationFrame/);
});

test('service worker clones responses before returning them and keeps cache writes alive', () => {
  assert.match(serviceWorker, /function persistResponse\(event,request,response\)/);
  assert.match(serviceWorker, /const copy=response\.clone\(\);\s*const task=caches\.open\(CACHE_NAME\)\.then\(cache=>cache\.put\(request,copy\)\)/);
  assert.match(serviceWorker, /event\.waitUntil\(task\)/);
  assert.match(serviceWorker, /persistResponse\(event,request,response\)/);
});

test('offline navigation ignores query strings while versioned assets remain exact', () => {
  assert.match(serviceWorker, /networkFirst\(event\.request,event,true\)/);
  assert.match(serviceWorker, /caches\.match\(entry\.href,\{ignoreSearch:true\}\)/);
  assert.match(serviceWorker, /cacheFirstVersioned\(event\.request,event\)/);
  const start = serviceWorker.indexOf('async function cacheFirstVersioned');
  const end = serviceWorker.indexOf("async function navigationFallback", start);
  const versionedBlock = serviceWorker.slice(start, end);
  assert.match(versionedBlock, /caches\.match\(request\)/);
  assert.doesNotMatch(versionedBlock, /ignoreSearch:true/);
});

test('Auto Planner observes only planner/calendar roots instead of the entire document body', () => {
  const source = fs.readFileSync(path.join(root, 'assets/auto-planner.js'), 'utf8');
  assert.match(source, /function observePlannerRoots\(\)/);
  assert.match(source, /document\.querySelector\('#plan'\)/);
  assert.match(source, /document\.querySelector\('\.trip-calendar-backdrop'\)/);
  assert.doesNotMatch(source, /observer\.observe\(document\.body/);
});

test('noncritical warming is limited to Overview intelligence while Account and Mate stay on demand', () => {
  const source = fs.readFileSync(path.join(root, 'assets/app.js'), 'utf8');
  assert.match(source, /function canWarmNonCritical\(\)/);
  assert.match(source, /!document\.hidden/);
  assert.match(source, /connection&&connection\.saveData/);
  assert.match(source, /slow-2g\|2g/);
  assert.match(source, /scheduleIdleFeature\('intelligence',250\)/);
  assert.doesNotMatch(source, /scheduleIdleFeature\('account'/);
  assert.doesNotMatch(source, /scheduleIdleFeature\('assistant'/);
  assert.match(source, /function createAssistantShell\(\)/);
  assert.match(source, /loadFeature\('assistant'\)/);
  assert.match(source, /ensureAccount:function\(\)\{return loadFeature\('account'\)\}/);
});

test('PWA bootstrap does not dispatch the unused app-update-ready event', () => {
  const source = fs.readFileSync(path.join(root, 'assets/app.js'), 'utf8');
  assert.doesNotMatch(source, /travelmate:app-update-ready/);
  assert.match(source, /travelmate:service-worker-ready/);
});

test('Plan day notes debounce persistence and flush before focus/page exit', () => {
  const source = fs.readFileSync(path.join(root, 'assets/auto-planner.js'), 'utf8');
  assert.match(source, /function scheduleNoteSave\(\)[\s\S]*setTimeout\(function\(\)\{noteSaveTimer=0;save\(\)\},450\)/);
  assert.match(source, /data-note-date[^\n]*scheduleNoteSave\(\)/);
  assert.match(source, /focusout[^\n]*flushNoteSave\(\)/);
  assert.match(source, /addEventListener\('pagehide',flushNoteSave\)/);
  assert.doesNotMatch(source, /data-note-date[^\n]*value;save\(\)/);
});

test('past-day enhancement avoids rewriting identical DOM and observer self-loops', () => {
  const source = fs.readFileSync(path.join(root, 'assets/auto-planner.js'), 'utf8');
  assert.match(source, /var nextStripHtml=past\.length/);
  assert.match(source, /var stripSignature=past\.map/);
  assert.match(source, /if\(strip\.dataset\.renderSignature!==stripSignature\)/);
  assert.doesNotMatch(source, /strip\.innerHTML!==nextStripHtml/);
});

test('Overview defers trip intelligence until idle or explicit Overview intent', () => {
  assert.match(appScript, /overview:\{styles:\['weather-widget\.css','trip-intelligence\.css'\],scripts:\['weather-widget\.js'\]\}/);
  assert.match(appScript, /intelligence:\{styles:\[\],scripts:\['trip-intelligence\.js'\]\}/);
  assert.match(appScript, /if\(initialView==='overview'\)scheduleIdleFeature\('intelligence',250\)/);
  assert.match(appScript, /if\(link\.dataset\.view==='overview'\)loadFeature\('intelligence'\)/);
});


test('trip pages defer Account and Admin assets until explicit account intent', () => {
  const source = fs.readFileSync(path.join(root, 'assets/app.js'), 'utf8');
  assert.doesNotMatch(source, /scheduleIdleFeature\('account',4200\)/);
  assert.match(source, /account:\{styles:\['security-center\.css','admin-center\.css'\],scripts:\['security-center\.js','admin-center\.js'\]\}/);
  assert.match(source, /ensureAccount:function\(\)\{return loadFeature\('account'\)\}/);
  assert.match(source, /scheduleIdleFeature\('intelligence',250\)/);
});

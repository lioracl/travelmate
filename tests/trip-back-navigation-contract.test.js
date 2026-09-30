'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
test('trip navigation has a single history owner and rejects stale lazy view completions',()=>{
  const nav=read('assets/navigation-memory.js'),router=read('assets/trip-redesign.js');
  assert.match(nav,/travelMateHistory: tripKey/);
  assert.match(nav,/history\.replaceState\(rootState\(\), '', overviewUrl\(\)\)/);
  assert.match(router,/TravelMateHistory\.navigate\(view\)/);
  assert.match(router,/TravelMateHistory\.bindView/);
  assert.match(router,/TravelMateHistory\.currentView\(\) === view/);
  assert.doesNotMatch(router,/addEventListener\('popstate'/);
});
test('Weather, AI and calendar register cleanup with the central trip history owner',()=>{
  const weather=read('assets/weather-widget.js'),ai=read('assets/ai-assistant.js'),calendar=read('assets/auto-planner.js');
  assert.match(weather,/pushOverlay\('weather', function \(\) \{ close\(ui\); \}\)/);
  assert.match(weather,/closeOverlay\('weather'\)/);
  assert.doesNotMatch(weather,/addEventListener\('popstate'/);
  assert.match(ai,/tripHistory\.pushOverlay\('ai', function/);
  assert.match(calendar,/TravelMateHistory\.pushOverlay\('calendar',function/);
  assert.match(ai,/if \(!window\.TravelMateHistory\) window\.addEventListener\('popstate'/);
  assert.match(calendar,/if\(!window\.TravelMateHistory\)window\.addEventListener\('popstate'/);
});
test('generic modal cleanup leaves dedicated Weather and Smart Hub cleanup to their owners',()=>{
  assert.match(read('assets/app.js'),/\.modal-backdrop\.open:not\(#modal-weather-live\):not\(#modal-smart-hub\)/);
  assert.match(read('assets/app.js'),/var featureReady=coreReady\.then/);
});
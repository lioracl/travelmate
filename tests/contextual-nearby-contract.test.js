'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
function tripContext(){const sandbox={window:{}};vm.runInNewContext(read('assets/trip-context.js'),sandbox);return sandbox.window.TravelMateTripContext;}
test('TripContext derives the free-time window and a user-invoked nearby request',()=>{
  const helper=tripContext(),now=new Date('2026-10-03T13:00:00');
  const trip={activities:[{id:'booking',date:'2026-10-03',time:'15:00',scheduleMode:'fixed'}],savedPlaces:[]};
  assert.equal(helper.availableMinutesUntilNextFixed(trip,now,30),90);
  const request=helper.buildNearbyRequest({trip,now,position:{lat:32.15,lon:34.88},bufferMinutes:30});
  assert.equal(request.userInvoked,true);assert.equal(request.availableMinutes,90);assert.equal(request.nextFixedActivity.record.id,'booking');
});
test('Contextual Nearby is explicit, consent-gated and has no passive GPS loop',()=>{
  const app=read('assets/app.js'),nearby=read('assets/nearby.js');
  assert.match(app,/data-contextual-nearby-open/);assert.match(app,/ensureNearby\(\)\.then/);
  assert.match(app,/availableMinutesUntilNextFixed\(trip,now,30\)/);assert.match(app,/data-contextual-window/);
  assert.match(nearby,/panel\.addEventListener\('travelmate:contextual-nearby'/);assert.match(nearby,/requestGpsConsent\(panel\)/);
  assert.match(nearby,/helper\.buildNearbyRequest/);assert.doesNotMatch(nearby,/setInterval\([^\n]*getCurrentPosition/);
});
test('Contextual mood shortcuts reuse Places categories and remain explicit',()=>{
  const app=read('assets/app.js'),nearby=read('assets/nearby.js'),css=read('assets/nearby.css'),assistant=read('assets/ai-assistant.js');
  assert.match(app,/data-contextual-mood=\"quiet\"/);assert.match(app,/role=\"group\" aria-label=\"מה מתחשק עכשיו\?\"/);assert.match(app,/nearbyPreferencePreset\(contextualMood\)/);
  assert.match(app,/categories:preset\?preset\.categories:\[\]/);
  assert.match(nearby,/categories=contextualRequest&&Array\.isArray\(contextualRequest\.categories\)\?normalizeCategoryKeys/);
  assert.match(nearby,/freeTerm=contextualRequest\?'':placeNameSearchInput\.value\.trim\(\)/);
  assert.match(nearby,/kosher=contextualRequest\?false:/);assert.match(nearby,/radius=contextualRequest\?contextualRadius:selectedRadius/);
  assert.doesNotMatch(nearby,/if\(requestedCategories\)\{selectedCategoryKeys=requestedCategories/);assert.match(nearby,/mood:detail\.mood\|\|''/);
  assert.match(assistant,/categories: Array\.isArray\(action\.intent\.categories\)/);
  assert.doesNotMatch(assistant,/navigator\.geolocation|getCurrentPosition\s*\(/);assert.match(css,/contextual-nearby__moods button\{min-height:44px/);
});
test('Contextual results are time-feasible, bounded and keep explicit save/add actions',()=>{
  const app=read('assets/app.js'),nearby=read('assets/nearby.js');
  assert.match(nearby,/estimateTravelMinutes\(origin,place\)/);assert.match(nearby,/estimateTravelMinutes\(place,next\)/);
  assert.match(nearby,/usable<30/);assert.match(nearby,/slice\(0,6\)/);assert.match(nearby,/contextualSuggestedTime/);
  assert.match(nearby,/deferEnhance/);assert.match(nearby,/data\.contextualNearby|dataset\.contextualNearby/);
  assert.match(app,/contextualTodayValid/);assert.match(app,/scheduleButton\.addEventListener\('click'/);
  assert.match(app,/savePlace\(true\)/);assert.match(app,/trip\.savedPlaces\.push\(placeData\)/);
});

test('Mini Route chooses a compact 2-3 stop sequence only when it fits',()=>{
  const helper=tripContext(),places=[{id:'a',name:'A',lat:32.101,lon:34.800},{id:'b',name:'B',lat:32.102,lon:34.801},{id:'c',name:'C',lat:32.103,lon:34.802}];
  const three=helper.buildMiniRoute(places,{lat:32.1,lon:34.8,availableMinutes:150,routeStops:3});
  assert.equal(three.stops.length,3);assert.ok(three.totalEstimatedMinutes<=150);assert.ok(three.totalTravelMinutes>0);
  const fallback=helper.buildMiniRoute(places,{lat:32.1,lon:34.8,availableMinutes:75,routeStops:3});
  assert.equal(fallback.stops.length,2);assert.ok(fallback.totalEstimatedMinutes<=75);
  assert.equal(helper.buildMiniRoute(places,{lat:32.1,lon:34.8,availableMinutes:60,routeStops:3}),null);
  const blankNext=helper.buildMiniRoute(places,{lat:32.1,lon:34.8,availableMinutes:90,routeStops:2,nextFixedActivity:{record:{lat:'',lon:''}}});
  assert.equal(blankNext.stops.length,2);assert.equal(blankNext.onwardMinutes,0);
  assert.equal(helper.coordinates({lat:'',lon:''}),null);
});

test('Mini Route stays explicit and reuses Contextual Nearby without automatic persistence',()=>{
  const app=read('assets/app.js'),nearby=read('assets/nearby.js');
  assert.match(app,/data-contextual-mini-route/);assert.match(app,/aria-pressed=\"false\"/);assert.match(app,/miniRoute:contextualMiniRoute/);
  assert.match(nearby,/buildMiniRoute\(assessed\.map/);assert.match(nearby,/data-contextual-mini-route-result/);
  assert.match(nearby,/requestGpsConsent\(panel\)/);assert.doesNotMatch(nearby,/buildMiniRoute[\s\S]{0,500}saveTrip|buildMiniRoute[\s\S]{0,500}savedPlaces\.push/);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
function openingApi(){const window={};const context={window,Date,Set,Math,Object,String,Number,RegExp};vm.runInNewContext(read('assets/opening-hours.js'),context);return window.TravelMateOpeningHours}
function routingApi(fetchImpl){const window={};const context={window,fetch:fetchImpl,AbortController,DOMException,setTimeout,clearTimeout,Date,Map,Math,Object,String,Number,Array,Promise,Error};vm.runInNewContext(read('assets/live-routing.js'),context);return window.TravelMateRouting}

test('opening-hours parser only makes claims for conservative weekly rules',()=>{
  const api=openingApi();
  assert.equal(api.statusAt('24/7',new Date('2026-10-05T03:00:00')).state,'open');
  assert.equal(api.statusAt('Mo-Fr 09:00-18:00; Sa 10:00-14:00; Su off',new Date('2026-10-05T10:00:00')).state,'open');
  assert.equal(api.statusAt('Mo-Fr 09:00-18:00; Sa 10:00-14:00; Su off',new Date('2026-10-05T19:00:00')).state,'closed');
  assert.equal(api.statusAt('Mo-Fr sunrise-sunset',new Date('2026-10-05T10:00:00')).state,'unknown');
  assert.equal(api.statusAt('Mo-Fr 09:00-18:00; We off',new Date('2026-10-07T10:00:00')).state,'unknown');
  assert.equal(api.statusAt('Mo-Fr 09:00-18:00',new Date('2026-10-10T10:00:00')).state,'closed');
});

test('opening-hours checks the estimated arrival time instead of only now',()=>{
  const api=openingApi(),base=new Date('2026-10-05T17:40:00');
  assert.equal(api.statusAt('Mo-Fr 09:00-18:00',base).state,'open');
  assert.equal(api.statusAtMinutes('Mo-Fr 09:00-18:00',base,25).state,'closed');
});
test('live routing batches walking candidates into one bounded matrix call and caches it',async()=>{
  let calls=0,lastUrl='';
  const fetchImpl=async url=>{calls+=1;lastUrl=String(url);return{ok:true,json:async()=>({code:'Ok',durations:[[0,600],[620,0]],distances:[[0,900],[910,0]]})}};
  const api=routingApi(fetchImpl),points=[{lat:32.0853,lon:34.7818},{lat:32.0880,lon:34.7900}];
  const first=await api.matrix(points,{mode:'walk'}),second=await api.matrix(points,{mode:'walk'});
  assert.equal(calls,1);assert.match(lastUrl,/routing\.openstreetmap\.de\/routed-foot\/table\/v1\/driving/);
  assert.equal(first.leg(points[0],points[1]).minutes,10);assert.equal(first.leg(points[0],points[1]).source,'live');
  assert.equal(Math.round(first.leg(points[0],points[1]).distanceKm*10)/10,.9);assert.equal(second,first);
});

test('partial live matrices return null legs so callers can fall back to estimates',async()=>{
  const api=routingApi(async()=>({ok:true,json:async()=>({code:'Ok',durations:[[0,null],[620,0]],distances:[[0,null],[910,0]]})}));
  const points=[{lat:32.0853,lon:34.7818},{lat:32.0880,lon:34.7900}],matrix=await api.matrix(points,{mode:'walk'});
  assert.equal(matrix.leg(points[0],points[1]),null);assert.equal(matrix.leg(points[1],points[0]).minutes,11);
});

test('live routing refuses oversized matrices before any network request',async()=>{
  let calls=0;const api=routingApi(async()=>{calls+=1;throw new Error('should not fetch')});
  const result=await api.matrix(Array.from({length:9},(_,i)=>({lat:32+i/1000,lon:34+i/1000})),{mode:'walk'});
  assert.equal(result,null);assert.equal(calls,0);
});
test('Places treats routing and opening-hours scripts as optional before loading Nearby',()=>{
  const app=read('assets/app.js');
  assert.match(app,/function loadOptional\(file\)\{return loadNearbyAsset\(file\)\.catch\(function\(\)\{return false\}\)\}/);
  assert.match(app,/loadOptional\('opening-hours\.js'\)[\s\S]*loadOptional\('live-routing\.js'\)[\s\S]*loadNearbyAsset\('nearby\.js'\)/);
});

test('Places preserves opening-hours data but only makes open-close claims in contextual arrival checks',()=>{
  const app=read('assets/app.js'),nearby=read('assets/nearby.js'),context=read('assets/trip-context.js');
  assert.match(nearby,/openingHours:tags\.opening_hours\|\|''/);assert.match(nearby,/data-place-opening-hours/);
  assert.match(app,/openingHours:result\.dataset\.placeOpeningHours\|\|''/);
  assert.doesNotMatch(nearby,/openingBadgeHtml/);
  assert.match(nearby,/async function applyContextualResults/);assert.match(nearby,/routing\.matrix\(points,\{mode:'walk',signal:searchSignal\}\)/);
  assert.match(nearby,/statusAtMinutes\(place\.openingHours,requested,Number\(outbound\.minutes\|\|0\)\)/);assert.match(nearby,/openingStatus\.state==='closed'/);
  assert.match(nearby,/var allLive=assessed\.length>0&&assessed\.every/);assert.match(nearby,/contextualRouting=allLive\?'live':'estimate'/);
  assert.match(nearby,/currentPlaces=await applyContextualResults[\s\S]*if\(requestId!==searchSequence\|\|searchSignal\.aborted\)return/);
  assert.match(context,/function buildMiniRoute\(places,request,travelLookup\)/);assert.match(context,/source:best\.live\?'live':'estimate'/);
});

test('routing and opening-hours modules do not request location or start passive tracking',()=>{
  const source=read('assets/live-routing.js')+'\n'+read('assets/opening-hours.js');
  assert.doesNotMatch(source,/geolocation|getCurrentPosition|watchPosition/);assert.doesNotMatch(source,/setInterval\s*\(/);assert.doesNotMatch(source,/Notification|requestPermission/);
});

test('Mini Route consumes live leg data when a matrix lookup is available',()=>{
  const sandbox={window:{}};vm.runInNewContext(read('assets/trip-context.js'),sandbox);const helper=sandbox.window.TravelMateTripContext;
  const places=[{id:'a',lat:32.101,lon:34.801},{id:'b',lat:32.102,lon:34.802}],request={lat:32.1,lon:34.8,availableMinutes:90,routeStops:2};
  const route=helper.buildMiniRoute(places,request,()=>({minutes:5,mode:'walk',source:'live',distanceKm:.4}));
  assert.equal(route.stops.length,2);assert.equal(route.source,'live');assert.equal(route.totalTravelMinutes,10);
});

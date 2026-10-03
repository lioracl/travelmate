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
});test('Contextual results are time-feasible, bounded and keep explicit save/add actions',()=>{
  const app=read('assets/app.js'),nearby=read('assets/nearby.js');
  assert.match(nearby,/estimateTravelMinutes\(origin,place\)/);assert.match(nearby,/estimateTravelMinutes\(place,next\)/);
  assert.match(nearby,/usable<30/);assert.match(nearby,/slice\(0,6\)/);assert.match(nearby,/contextualSuggestedTime/);
  assert.match(nearby,/deferEnhance/);assert.match(nearby,/data\.contextualNearby|dataset\.contextualNearby/);
  assert.match(app,/contextualTodayValid/);assert.match(app,/scheduleButton\.addEventListener\('click'/);
  assert.match(app,/savePlace\(true\)/);assert.match(app,/trip\.savedPlaces\.push\(placeData\)/);
});

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
function liveApi(helper){
  const window={TravelMateTripContext:helper,addEventListener(){},dispatchEvent(){}};
  const document={readyState:'loading',body:{dataset:{tripView:'plan'}},addEventListener(){}};
  const sandbox={window,document,navigator:{onLine:true},location:{search:'?id=t'},URLSearchParams,Date,Math,Object,String,Number,Array,Set,Map,Promise,CustomEvent:function(){},setTimeout(){return 1},clearTimeout(){}};
  vm.runInNewContext(read('assets/plan-live-routing.js'),sandbox);
  return window.TravelMatePlanLiveRouting;
}
test('Plan live routing collects only supported future timed transitions and preserves manual travel time',()=>{
  const helper={
    scheduleMode:r=>r.scheduleMode||'planned',
    coordinates:r=>Number.isFinite(Number(r.lat))&&Number.isFinite(Number(r.lon))?{lat:Number(r.lat),lon:Number(r.lon)}:null,
    estimateTravelMinutes:(a,b)=>({minutes:12,mode:b.travelMode||'transit',modeSource:b.travelMode?'explicit':'inferred',source:b.travelMinutesBefore?'manual':'estimate',distanceKm:1})
  };
  const api=liveApi(helper),trip={activities:[
    {id:'a',date:'2026-10-12',time:'10:00',scheduleMode:'fixed',lat:32.1,lon:34.8},
    {id:'b',date:'2026-10-12',time:'11:00',scheduleMode:'fixed',travelMode:'walk',lat:32.11,lon:34.81},
    {id:'c',date:'2026-10-12',time:'12:00',scheduleMode:'fixed',travelMode:'transit',lat:32.12,lon:34.82},
    {id:'d',date:'2026-10-13',time:'10:00',scheduleMode:'fixed',lat:32.2,lon:34.9},
    {id:'e',date:'2026-10-13',time:'11:00',scheduleMode:'fixed',travelMode:'walk',travelMinutesBefore:15,lat:32.21,lon:34.91}
  ],savedPlaces:[]};
  const pairs=api.collectPairs(trip,'2026-10-12');
  assert.equal(pairs.length,1);
  assert.equal(pairs[0].from.id,'a');
  assert.equal(pairs[0].to.id,'b');
  assert.equal(pairs[0].providerMode,'walk');
  assert.equal(api.providerMode('taxi'),'drive');
  assert.equal(api.providerMode('metro'),'');
});
test('Plan live routing batches route matrices to at most eight unique points',()=>{
  const api=liveApi({}),pairs=Array.from({length:5},(_,i)=>({providerMode:'walk',fromPoint:{lat:32+i*.01,lon:34+i*.01},toPoint:{lat:32+i*.01+.001,lon:34+i*.01+.001}}));
  const batches=api.buildBatches(pairs);
  assert.equal(batches.length,2);
  assert.ok(batches.every(batch=>batch.points.length<=8));
  assert.equal(batches.reduce((sum,b)=>sum+b.pairs.length,0),5);
});
test('Trip transition assessment accepts live route data while keeping arrival-buffer math factual',()=>{
  const window={};vm.runInNewContext(read('assets/trip-context.js'),{window,Date,Object,Number,String,Array,Math,Set,CustomEvent:function(){}});
  const api=window.TravelMateTripContext,previous={time:'10:00',duration:60,lat:32.1,lon:34.8},next={time:'11:20',scheduleMode:'fixed',travelMode:'walk',arrivalBufferMinutes:10,lat:32.11,lon:34.81};
  const base=api.transitionAssessment(previous,next),live=api.transitionAssessment(previous,next,{travelEstimate:{minutes:5,distanceKm:.5,mode:'walk',modeSource:'explicit',source:'live',provider:'OpenStreetMap routing'}});
  assert.equal(live.source,'live');
  assert.equal(live.provider,'OpenStreetMap routing');
  assert.equal(live.travelMinutes,5);
  assert.equal(live.requiredMinutes,15);
  assert.equal(live.risk,false);
  assert.ok(base.travelMinutes>=live.travelMinutes);
});
test('Live Plan routing is OTA-only, non-persistent and never requests device location',()=>{
  const source=read('assets/plan-live-routing.js'),app=read('assets/app.js'),polish=read('assets/plan-ux-polish.js');
  assert.match(app,/plan-live-routing.js/);
  assert.match(app,/live-routing.js/);
  assert.match(polish,/travelmate:plan-live-routing/);
  assert.match(polish,/transition.source==='live'/);
  assert.match(source,/localStorage\.getItem\('travelmate-active-user'\)/);
  assert.doesNotMatch(source,/geolocation|getCurrentPosition|watchPosition|saveTrip|updateTrip|localStorage\.(?:setItem|removeItem|clear)|sessionStorage/);
  assert.equal(source.includes('setInterval('),false);
});

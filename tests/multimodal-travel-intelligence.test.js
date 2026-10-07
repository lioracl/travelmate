'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const contextSource=fs.readFileSync('assets/trip-context.js','utf8');
const analyticsSource=fs.readFileSync('assets/trip-analytics.js','utf8');
function load(){
  const window={dispatchEvent(){}};
  const sandbox={window,Date,Object,Number,String,Array,Math,URL,Set,CustomEvent:function(type){this.type=type}};
  vm.runInNewContext(contextSource,sandbox,{filename:'trip-context.js'});
  vm.runInNewContext(analyticsSource,sandbox,{filename:'trip-analytics.js'});
  return{context:window.TravelMateTripContext,analytics:window.TravelMateTripAnalytics};
}

test('travel mode taxonomy preserves distinct multimodal choices',()=>{
  const {context}=load();
  assert.equal(context.travelMode({travelMode:'walking'},2),'walk');
  assert.equal(context.travelMode({travelMode:'uber'},2),'taxi');
  assert.equal(context.travelMode({travelMode:'subway'},2),'metro');
  assert.equal(context.travelMode({travelMode:'train'},2),'rail');
  assert.equal(context.travelMode({travelMode:'bus'},2),'transit');
  assert.equal(context.travelMode({travelMode:'cycling'},2),'bike');
});

test('auto mode remains inferred while explicit selections stay explicit',()=>{
  const {context}=load();
  assert.equal(context.travelModeInfo({},.8).mode,'walk');
  assert.equal(context.travelModeInfo({},.8).source,'inferred');
  assert.equal(context.travelModeInfo({transportMode:'taxi'},8).source,'explicit');
  assert.equal(context.travelModeInfo({transportMode:'taxi'},8).mode,'taxi');
});test('manual travel time keeps selected mode and confirmation source',()=>{
  const {context}=load();
  const result=context.estimateTravelMinutes({lat:32.08,lon:34.78},{lat:32.10,lon:34.82,travelMode:'metro',travelMinutesBefore:18});
  assert.equal(result.mode,'metro');
  assert.equal(result.modeSource,'explicit');
  assert.equal(result.source,'manual');
  assert.equal(result.minutes,18);
});

test('Trip Analytics exposes per-mode movement while preserving legacy aggregates',()=>{
  const {analytics}=load();
  const data=analytics.build({activities:[
    {id:'a1',date:'2026-10-03',time:'09:00',done:true,lat:32.08,lon:34.78},
    {id:'a2',date:'2026-10-03',time:'10:00',done:true,lat:32.081,lon:34.781,travelMode:'walk'},
    {id:'a3',date:'2026-10-03',time:'12:00',done:true,lat:32.10,lon:34.82,travelMode:'taxi',travelMinutesBefore:22},
    {id:'a4',date:'2026-10-03',time:'15:00',done:true,lat:32.12,lon:34.84,travelMode:'metro',travelMinutesBefore:16}
  ]});
  assert.equal(data.movement.byMode.walk.segments,1);
  assert.equal(data.movement.byMode.taxi.segments,1);
  assert.equal(data.movement.byMode.metro.segments,1);
  assert.ok(data.movement.walkingDistanceKm>0);
  assert.ok(data.movement.transportDistanceKm>0);
  assert.equal(data.movement.explicitModeCoverage,1);
});test('personal stats aggregate multimodal breakdown only from owned trips',()=>{
  const {analytics}=load();
  const stats=analytics.buildPersonalStats([{id:'t1',ownerId:'u1',activities:[
    {id:'a1',date:'2026-10-03',time:'09:00',done:true,lat:32.08,lon:34.78},
    {id:'a2',date:'2026-10-03',time:'10:00',done:true,lat:32.09,lon:34.79,travelMode:'rail',travelMinutesBefore:14}
  ]},{id:'foreign',ownerId:'u2',activities:[{id:'x1',date:'2026-10-03',time:'09:00',done:true,lat:32,lon:34},{id:'x2',date:'2026-10-03',time:'10:00',done:true,lat:33,lon:35,travelMode:'taxi'}]}],'u1');
  assert.equal(stats.modeBreakdown.rail.segments,1);
  assert.equal(stats.modeBreakdown.taxi.segments,0);
});

test('Plan editors expose one canonical travel mode field',()=>{
  const planner=fs.readFileSync('assets/auto-planner.js','utf8');
  const polish=fs.readFileSync('assets/plan-ux-polish.js','utf8');
  assert.match(planner,/name="travelMode"/);
  assert.match(planner,/data-calendar-travel-mode/);
  assert.match(planner,/applyTravelFields/);
  assert.match(polish,/helper\.travelModeLabel/);
});

test('Trip Replay consumes per-mode analytics instead of collapsing all transport',()=>{
  const replay=fs.readFileSync('assets/trip-replay.js','utf8');
  assert.match(replay,/function movementModeFacts/);
  assert.match(replay,/movement&&movement\.byMode/);
  assert.match(replay,/explicitModeCoverage/);
});
test('Trip Replay keeps a manually timed mode even when coordinates are unavailable',()=>{
  const {analytics}=load();
  const movement=analytics.build({activities:[
    {id:'a1',date:'2026-10-03',time:'09:00',done:true},
    {id:'a2',date:'2026-10-03',time:'10:00',done:true,travelMode:'taxi',travelMinutesBefore:22}
  ]}).movement;
  assert.equal(movement.byMode.taxi.distanceKm,0);
  assert.equal(movement.byMode.taxi.travelMinutes,22);
  assert.equal(movement.byMode.taxi.manualTimeSegments,1);
  const window={addEventListener(){},TravelMateEvents:null};
  const document={readyState:'loading',addEventListener(){},getElementById(){return null}};
  vm.runInNewContext(fs.readFileSync('assets/trip-replay.js','utf8'),{window,document,URLSearchParams,Date,Object,Number,String,Array,Math,Intl,setTimeout(){}});
  const text=window.TravelMateTripReplay.narrative({completed:0,planned:0,memories:0,expenses:0,savedOnly:0,analytics:{movement}});
  assert.match(text,/מונית/);
  assert.match(text,/22 דק׳/);
});
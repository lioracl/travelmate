'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const widget = require('../assets/native-widget-snapshot.js');
const today = require('../assets/custom-trip.js');
const now = new Date(2026,9,9,12,30,15);
function trip(activities) { return {id:'parity-trip',ownerId:'owner-1',start:'2026-10-09',end:'2026-10-10',activities,savedPlaces:[]}; }
function activity(id,time,duration,title=id) { return {id,date:'2026-10-09',time,duration,title}; }
function snap(value,at=now,owner=today) { return widget.buildSnapshot({trip:value,now:at,todayApi:owner,accountId:'owner-1'}); }

test('native projection does not invent a duration for past or future untimed-duration commitments',()=>{
 const value=trip([activity('past','12:00'),activity('future','14:00')]);
 const result=snap(value);
 assert.deepEqual(result.agenda.map(i=>i.id),['future']);
 assert.equal(result.agenda[0].endEpochMs,result.agenda[0].startEpochMs);
 assert.equal(result.liveToday.state,'next'); assert.equal(result.liveToday.time,'14:00');
});
test('native projection preserves canonical Hebrew tie order instead of sorting by ID',()=>{
 const value=trip([activity('z-first','12:00',60,'א'),activity('a-second','12:00',60,'ת')]);
 const selected=today.currentOrNext(today.agenda(value,'2026-10-09'),now);
 assert.equal(snap(value).agenda[0].id,selected.id);
});
test('Live Today delegates selection to the supplied canonical owner',()=>{
 let calls=0;
 const owner={agenda:()=>[],currentOrNext:()=>{calls++;return {kind:'activity',id:'owner-choice',state:'next',time:'18:05'};}};
 const result=snap(trip([activity('raw-choice','12:00',60)]),now,owner);
 assert.equal(result.liveToday.time,'18:05'); assert.equal(result.liveToday.state,'next'); assert.ok(calls>1);
});
test('canonical current-to-next boundary expires selection without inventing a native successor',()=>{
 const value=trip([activity('current','12:00',31),activity('later','14:00',60)]);
 const result=snap(value);
 assert.equal(result.liveToday.state,'current');
 assert.equal(result.liveToday.validUntilEpochMs,new Date(2026,9,9,12,31).getTime());
 assert.equal(snap(value,new Date(2026,9,9,12,31)).liveToday.time,'14:00');
});
test('zero duration is next during its scheduled minute, never current, then expires',()=>{
 const value=trip([activity('instant','12:30',0)]);
 assert.equal(snap(value).liveToday.state,'next');
 assert.equal(snap(value).liveToday.validUntilEpochMs,new Date(2026,9,9,12,31).getTime());
 assert.equal(snap(value,new Date(2026,9,9,12,31)).liveToday.state,'none');
});
test('midnight expires selection even when yesterday activity duration crosses midnight',()=>{
 const value=trip([activity('crossing','23:50',60)]);
 assert.equal(snap(value,new Date(2026,9,9,23,55)).liveToday.validUntilEpochMs,new Date(2026,9,10,0,0).getTime());
});
test('canonical owner absence fails closed and selection never contains private labels',()=>{
 const value=trip([activity('private','12:00',60,'private user title')]);
 const result=snap(value,now,null);
 assert.equal(result.liveToday.validUntilEpochMs,now.getTime());
 assert.equal(result.liveToday.state,'none');
 assert.deepEqual(Object.keys(snap(value).liveToday).sort(),['state','time','validUntilEpochMs']);
 assert.doesNotMatch(JSON.stringify(snap(value).liveToday),/private/);
});
test('native bridges bound canonical selection and both renderers reject expired or legacy selection',()=>{
 const java=fs.readFileSync('android/app/src/main/java/com/travelmate/app/TravelMateWidgetBridgePlugin.java','utf8');
 const swift=fs.readFileSync('ios/App/App/TravelMateWidgetBridgePlugin.swift','utf8');
 assert.match(java,/liveUntil > now && liveUntil <= expires/);
 assert.match(swift,/until > now, until <= expires/);
 for(const file of ['android/app/src/main/java/com/travelmate/app/TravelMateLiveTodayWidgetProvider.java','ios/App/TravelMateBudgetWidget/TravelMateLiveTodayWidget.swift']){
  const source=fs.readFileSync(file,'utf8');
  assert.match(source,/validUntilEpochMs/);assert.doesNotMatch(source,/selectedItem|optJSONObject\(0\)/);
 }
});
test('pending initial session cannot overwrite a later account-context change', async () => {
 const vm=require('node:vm'); const listeners={},timers=[],writes=[]; let resolveSession,onAuth;
 const shared=trip([activity('shared','12:00',60)]);
 const root={
  location:{search:'?id=parity-trip'},
  Capacitor:{Plugins:{TravelMateWidgetBridge:{updateSnapshot:async({snapshot})=>writes.push(snapshot),clearSnapshot:async()=>{}}}},
  TravelMateCloud:{getSession:()=>new Promise(resolve=>{resolveSession=resolve;}),getCachedTrips:()=>[shared],onAuthChange:cb=>{onAuth=cb;}},
  TravelMateTripStore:{getTrip:()=>shared},travelMateTripReady:Promise.resolve(shared),TravelMateToday:today,
  setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout:()=>{},addEventListener:(key,fn)=>{(listeners[key]??=[]).push(fn);}
 };
 vm.runInNewContext(fs.readFileSync('assets/native-widget-snapshot.js','utf8'),{window:root,document:{readyState:'complete'},URL,URLSearchParams,Date,Intl,Promise,console});
 const flush=()=>new Promise(resolve=>setImmediate(resolve)); await flush();
 listeners['travelmate:account-context-changed'].forEach(fn=>fn({detail:{userId:'user-B'}}));
 resolveSession({user:{id:'user-A'}}); await flush(); while(timers.length)timers.shift()(); await flush();
 assert.equal(writes.length,0,'stale A session must not republish after B context');
 assert.equal(typeof onAuth,'function','subscription remains installed for the next real auth event');
 onAuth('SIGNED_IN',{user:{id:'user-B'}}); await flush(); while(timers.length)timers.shift()(); await flush();
 assert.equal(writes.length,1); assert.equal(writes[0].accountId,'user-B');
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const widget = require('../assets/native-widget-snapshot.js');
const today = require('../assets/custom-trip.js');

function trip() {
  return {
    id:'trip-1', ownerId:'owner-1', city:'Prague', country:'Czechia', start:'2026-10-08', end:'2026-10-10', days:3,
    activities:[
      {id:'done',date:'2026-10-08',time:'09:00',title:'Done',duration:60,done:true,scheduleMode:'fixed'},
      {id:'flex',date:'2026-10-08',time:'10:00',title:'Flexible',duration:120,scheduleMode:'flexible'},
      {id:'window',date:'2026-10-08',time:'11:00',title:'Window',duration:60,scheduleMode:'window'},
      {id:'fixed',date:'2026-10-08',time:'12:00',title:'Museum',locationName:'National Museum',duration:90,scheduleMode:'fixed'},
      {id:'later',date:'2026-10-09',time:'08:30',title:'Breakfast',duration:60,scheduleMode:'fixed'}
    ],
    savedPlaces:[{id:'place-1',date:'2026-10-08',time:'16:00',name:'Old Town',address:'Staré Město'}]
  };
}

test('widget snapshot is schema-versioned and scoped to account/trip', () => {
  const snap=widget.buildSnapshot({trip:trip(),now:new Date(2026,9,8,11,30),todayApi:today,weather:{ready:true,currentLabel:'בהיר',temperature:21.4},unreadCount:3,accountId:'user-1',privacyMode:'standard'});
  assert.equal(snap.schemaVersion,1);
  assert.equal(snap.accountId,'user-1');
  assert.equal(snap.tripOwnerId,'owner-1');
  assert.equal(snap.tripId,'trip-1');
  assert.equal(snap.destination,'Prague');
  assert.equal(snap.unreadChanges,3);
  assert.equal(snap.weather.temperatureC,21);
  assert.match(snap.deepLinks.plan,/^travelmate:\/\/trip\/trip-1\?view=plan$/);
});

test('agenda excludes done flexible and window items and keeps fixed/planned items', () => {
  const snap=widget.buildSnapshot({trip:trip(),now:new Date(2026,9,8,11,30),todayApi:today,accountId:'user-1',privacyMode:'standard'});
  assert.deepEqual(snap.agenda.map(item=>item.id),['fixed','place-1','later']);
  assert.equal(snap.agenda[0].title,'Museum');
  assert.equal(snap.agenda[0].location,'National Museum');
});

test('redacted privacy mode removes activity/location/destination labels but preserves timing', () => {
  const snap=widget.buildSnapshot({trip:trip(),now:new Date(2026,9,8,11,30),todayApi:today,accountId:'user-1',privacyMode:'redacted'});
  assert.equal(snap.destination,'');
  assert.ok(snap.agenda.length>0);
  snap.agenda.forEach(item=>{assert.equal(item.title,'');assert.equal(item.location,'');assert.match(item.startAt,/Z$/)});
});

test('snapshot is bounded and contains no document health or notes payloads', () => {
  const value=trip();
  value.dayNotes={'2026-10-08':'private note'};
  value.documents=[{id:'doc-secret'}];
  value.health={steps:12345};
  for(let i=0;i<20;i++)value.activities.push({id:'x'+i,date:'2026-10-08',time:String(12+Math.floor(i/4)).padStart(2,'0')+':'+String((i%4)*15).padStart(2,'0'),title:'X'+i,duration:30,scheduleMode:'fixed'});
  const snap=widget.buildSnapshot({trip:value,now:new Date(2026,9,8,11,30),todayApi:today,accountId:'user-1'});
  assert.ok(snap.agenda.length<=8);
  const encoded=JSON.stringify(snap);
  assert.doesNotMatch(encoded,/private note|doc-secret|12345/);
  assert.doesNotMatch(encoded,/documents|health|dayNotes/);
});

test('weather freshness is explicit and unread count is bounded', () => {
  const now=new Date(2026,9,8,11,30);
  const snap=widget.buildSnapshot({trip:trip(),now,todayApi:today,weather:{ready:true,currentLabel:'גשם',temperature:18},unreadCount:5000,accountId:'user-1'});
  assert.equal(snap.unreadChanges,999);
  assert.equal(new Date(snap.weather.validUntil).getTime()-now.getTime(),30*60*1000);
  assert.equal(new Date(snap.expiresAt).getTime()-now.getTime(),30*60*1000);
});

test('native deep links accept only the TravelMate scheme and known views', () => {
  assert.deepEqual(widget.parseDeepLink('travelmate://trip/abc?view=plan'),{tripId:'abc',view:'plan',panel:''});
  assert.deepEqual(widget.parseDeepLink('travelmate://trip/abc?view=evil'),{tripId:'abc',view:'overview',panel:''});
  assert.equal(widget.parseDeepLink('https://example.com/trip/abc?view=plan'),null);
});

test('runtime contract uses canonical Today/Weather/change contexts and clears on sign-out', () => {
  const source=fs.readFileSync(path.join(__dirname,'..','assets','native-widget-snapshot.js'),'utf8');
  const notifications=fs.readFileSync(path.join(__dirname,'..','assets','trip-change-notifications.js'),'utf8');
  assert.match(source,/TravelMateToday/);
  assert.match(source,/TravelMateWeatherContext/);
  assert.match(source,/TravelMateTripChangeContext/);
  assert.match(source,/trip-change-context/);
  assert.match(source,/clearNativeSnapshot\(\)/);
  assert.match(source,/TravelMateWidgetBridge/);
  assert.match(notifications,/TravelMateTripChangeContext/);
  assert.match(notifications,/unreadCount/);
});

test('default widget payload is redacted and rejects invalid account/trip/time scopes', () => {
  const snap = widget.buildSnapshot({trip:trip(),now:new Date(2026,9,8,11,30),todayApi:today,accountId:'user-1'});
  assert.equal(snap.privacyMode,'redacted');
  assert.equal(snap.destination,'');
  assert.ok(snap.agenda.every(item => !item.title && !item.location));
  assert.throws(() => widget.buildSnapshot({trip:trip(),accountId:''}),/INVALID_WIDGET_SCOPE/);
  assert.throws(() => widget.buildSnapshot({trip:{...trip(),id:'../other'},accountId:'user-1'}),/INVALID_WIDGET_SCOPE/);
  assert.throws(() => widget.buildSnapshot({trip:trip(),accountId:'user-1',now:'invalid'}),/INVALID_WIDGET_TIME/);
});

test('canonical Today normalizes free and time-window aliases, rejects invalid times and dates', () => {
  const value=trip();
  value.activities.push(
    {id:'free-alias',date:'2026-10-08',time:'13:00',title:'Private',flexibility:'free'},
    {id:'window-alias',date:'2026-10-08',time:'14:00',title:'Private',timingMode:'time-window'},
    {id:'invalid-clock',date:'2026-10-08',time:'29:45',title:'Bad clock'},
    {id:'invalid-date',date:'2026-10-32',time:'15:00',title:'Bad date'},
    {id:'missing-time',date:'2026-10-08',title:'Unscheduled'}
  );
  const snap=widget.buildSnapshot({trip:value,now:new Date(2026,9,8,11,30),todayApi:today,accountId:'user-1',privacyMode:'standard'});
  for (const id of ['free-alias','window-alias','invalid-clock','invalid-date','missing-time']) {
    assert.equal(snap.agenda.some(item=>item.id===id),false,id);
  }
});

test('weather does not invent zero degrees or extend stale observation freshness', () => {
  const now=new Date(2026,9,8,11,30);
  const fresh=widget.buildSnapshot({trip:trip(),now,accountId:'user-1',weather:{ready:true,temperature:null},weatherObservedAt:now.getTime()});
  assert.equal(fresh.weather.temperatureC,null);
  const stale=widget.buildSnapshot({trip:trip(),now,accountId:'user-1',weather:{ready:true,temperature:25},weatherObservedAt:now.getTime()-31*60*1000});
  assert.equal(stale.weather.ready,false);
  assert.equal(stale.weather.validUntil,null);
  assert.equal(stale.weather.temperatureC,null);
});

test('widget timezone is validated and clock basis never claims destination-local accuracy', () => {
  const value=trip();
  value.timeZone='Not/A_Zone';
  const invalid=widget.buildSnapshot({trip:value,accountId:'user-1'});
  assert.equal(invalid.destinationTimeZone,'');
  assert.equal(invalid.clockBasis,'device-local');
  value.timeZone='Europe/Prague';
  assert.equal(widget.buildSnapshot({trip:value,accountId:'user-1'}).destinationTimeZone,'Europe/Prague');
});

test('deep links reject path injection and unknown panels', () => {
  assert.equal(widget.parseDeepLink('travelmate://trip/..%2Fsecret?view=plan'),null);
  assert.equal(widget.parseDeepLink('travelmate://evil/trip-1'),null);
  assert.deepEqual(widget.parseDeepLink('travelmate://trip/trip-1?view=plan&panel=changes'),{tripId:'trip-1',view:'plan',panel:''});
  assert.deepEqual(widget.parseDeepLink('travelmate://trip/trip-1?view=overview&panel=changes'),{tripId:'trip-1',view:'overview',panel:'changes'});
});

test('native staging owns widget script wiring without modifying published PWA HTML', () => {
  const source=fs.readFileSync(path.join(__dirname,'..','tools','stage-native-web.mjs'),'utf8');
  const pwa=fs.readFileSync(path.join(__dirname,'..','trip','custom','index.html'),'utf8');
  assert.match(source,/native-widget-snapshot\.js/);
  assert.doesNotMatch(pwa,/native-widget-snapshot\.js/);
});

test('runtime clears native data on sign-out and prevents stale-account republish', async () => {
  const vm=require('node:vm');
  const source=fs.readFileSync(path.join(__dirname,'..','assets','native-widget-snapshot.js'),'utf8');
  const listeners={};
  const timers=[];
  const writes=[];
  let clears=0;
  let onAuth;
  let activeUser='user-1';
  const current=trip();
  const root={
    location:{search:'?id=trip-1',origin:'https://localhost',href:'https://localhost/trip/custom/index.html?id=trip-1'},
    Capacitor:{Plugins:{TravelMateWidgetBridge:{
      updateSnapshot:async ({snapshot})=>{writes.push(snapshot);},
      clearSnapshot:async ()=>{clears+=1;}
    }}},
    TravelMateCloud:{
      getSession:async ()=>({user:{id:activeUser}}),
      getCachedTrips:()=>activeUser==='user-1'?[current]:[],
      onAuthChange:cb=>{onAuth=cb;}
    },
    TravelMateTripStore:{getTrip:()=>current},
    travelMateTripReady:Promise.resolve(current),
    TravelMateToday:today,
    setTimeout:fn=>{timers.push(fn);return timers.length;},
    clearTimeout:()=>{},
    addEventListener:(name,fn)=>{(listeners[name]??=[]).push(fn);}
  };
  const context={window:root,document:{readyState:'complete'},URL,URLSearchParams,Date,Promise,Intl,console};
  vm.runInNewContext(source,context);
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  await flush();
  assert.equal(typeof onAuth,'function');
  assert.ok(timers.length);
  timers.shift()();
  await flush();
  assert.equal(writes.length,1);
  assert.equal(writes[0].accountId,'user-1');
  assert.equal(writes[0].privacyMode,'redacted');
  onAuth('SIGNED_OUT',null);
  activeUser='';
  await flush();
  assert.ok(clears>=1);
  const before=writes.length;
  (listeners['travelmate:activities-updated']||[]).forEach(fn=>fn({}));
  if(timers.length) timers.shift()();
  await flush();
  assert.equal(writes.length,before);
  activeUser='user-2';
  (listeners['travelmate:account-context-changed']||[]).forEach(fn=>fn({detail:{userId:'user-2'}}));
  await flush();
  assert.ok(clears>=2);
  onAuth('SIGNED_IN',{user:{id:'user-2'}});
  await flush();
  if(timers.length) timers.shift()();
  await flush();
  assert.equal(writes.length,before,'unrecognized account must not publish the previous trip');
});

test('home screen retains last widget for signed-in user but clears it on logout', async () => {
  const vm=require('node:vm');
  const source=fs.readFileSync(path.join(__dirname,'..','assets','native-widget-snapshot.js'),'utf8');
  const listeners={};
  let onAuth;
  let clears=0;
  let writes=0;
  const root={
    location:{search:'',origin:'https://localhost',href:'https://localhost/'},
    Capacitor:{Plugins:{TravelMateWidgetBridge:{
      updateSnapshot:async ()=>{writes+=1;},
      clearSnapshot:async ()=>{clears+=1;}
    }}},
    TravelMateCloud:{getSession:async ()=>({user:{id:'user-1'}}),onAuthChange:cb=>{onAuth=cb;},getCachedTrips:()=>[trip()]},
    setTimeout:fn=>{fn();return 1;},
    clearTimeout:()=>{},
    addEventListener:(name,fn)=>{(listeners[name]??=[]).push(fn);}
  };
  vm.runInNewContext(source,{window:root,document:{readyState:'complete'},URL,URLSearchParams,Date,Promise,Intl,console});
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  await flush();
  (listeners.focus||[]).forEach(fn=>fn({}));
  await flush();
  assert.equal(writes,0);
  assert.equal(clears,0);
  onAuth('SIGNED_OUT',null);
  await flush();
  assert.equal(clears,1);
});

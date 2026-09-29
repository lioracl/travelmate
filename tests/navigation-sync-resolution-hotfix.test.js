'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const nav=fs.readFileSync(path.join(root,'assets/navigation-memory.js'),'utf8');
const custom=fs.readFileSync(path.join(root,'assets/custom-trip.js'),'utf8');

test('top back exits only from Overview and stays inside the trip elsewhere',()=>{
  assert.match(nav,/currentView\(\) === 'overview'/);
  assert.match(nav,/overview \? button\.dataset\.tripExitHref : overviewUrl\(\)/);
  assert.match(nav,/topBack && currentView\(\) !== 'overview'/);
  assert.match(nav,/history\.state && history\.state\.travelMateView/);
  assert.match(nav,/window\.addEventListener\('travelmate:viewchange', updateExitButtons\)/);
});

test('successful conflict resolution reloads the chosen canonical trip state',()=>{
  assert.match(custom,/renderSyncConflictBanner\(result\.trip\);\s*window\.location\.reload\(\);/);
});

test('stale save completion cannot recreate a resolved conflict',()=>{
  let source=fs.readFileSync(path.join(root,'assets/cloud-sync.js'),'utf8');
  source=source.replace('  window.TravelMateCloud = {',"  window.__syncTest={prepareTripSave,updateLocalSyncState,invalidatePendingTripSync};\n  window.TravelMateCloud = {");
  const base={id:'trip-1',ownerId:'user-1',country:'Test',city:'Local',start:'2026-01-01',end:'2026-01-02',days:1,cloudRevision:10,syncStatus:'synced'};
  const storage=new Map([['travelmate-active-user','user-1'],['travelmate-trips',JSON.stringify([base])]]);
  const localStorage={getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
  const context={console,setTimeout,clearTimeout,CustomEvent:function(type,init){this.type=type;this.detail=init.detail;},localStorage,window:{crypto:{randomUUID:()=> '11111111-1111-4111-8111-111111111111'},dispatchEvent(){},addEventListener(){},__travelMateSupabaseClient:{}},document:{}};
  vm.runInNewContext(source,context);
  const pending=context.window.__syncTest.prepareTripSave({...base,city:'Pending local'});
  context.window.__syncTest.invalidatePendingTripSync(pending,'user-1');
  context.window.TravelMateCloud.upsertLocalTrip({...base,city:'Cloud',cloudRevision:11,syncStatus:'synced'});
  context.window.__syncTest.updateLocalSyncState(pending,'conflict','2026-09-29T01:00:00.000Z','user-1',12);
  const stored=JSON.parse(storage.get('travelmate-trips'))[0];
  assert.equal(stored.city,'Cloud');
  assert.equal(stored.syncStatus,'synced');
  assert.equal(stored.cloudRevision,11);
  assert.equal(stored.syncConflict,undefined);
});

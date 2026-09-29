'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function boot(entries,client={}){
  let source=fs.readFileSync(path.join(root,'assets/cloud-sync.js'),'utf8');
  source=source.replace('  window.TravelMateCloud = {',"  window.__canonicalSyncTest={activateUserStorage,mergeActiveTripsWithBackup};\n  window.TravelMateCloud = {");
  const storage=new Map(entries);
  const localStorage={getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k),key:i=>Array.from(storage.keys())[i]||null,get length(){return storage.size;}};
  const window={crypto:{randomUUID:()=> '11111111-1111-4111-8111-111111111111'},__travelMateSupabaseClient:client,dispatchEvent(){},addEventListener(){}};
  const context={console,setTimeout,clearTimeout,AbortController,CustomEvent:function(type,init){this.type=type;this.detail=init&&init.detail;},localStorage,sessionStorage:{getItem(){return null},setItem(){},removeItem(){}},window,document:{}};
  vm.runInNewContext(source,context);
  return {storage,window};
}
test('stale per-user conflict snapshot cannot override the active synced trip',()=>{
  const cloud={id:'trip-1',ownerId:'user-1',city:'Cloud',country:'Test',cloudRevision:7,syncStatus:'synced'};
  const stale={...cloud,city:'Stale local',cloudRevision:6,syncStatus:'conflict',syncMutationId:'old',syncConflict:{serverRevision:7}};
  const {storage,window}=boot([['travelmate-active-user','user-1'],['travelmate-trips',JSON.stringify([cloud])],['travelmate-trips-user:user-1',JSON.stringify([stale])]]);
  window.__canonicalSyncTest.activateUserStorage('user-1');
  const active=JSON.parse(storage.get('travelmate-trips'))[0];
  const backup=JSON.parse(storage.get('travelmate-trips-user:user-1'))[0];
  assert.equal(active.city,'Cloud'); assert.equal(active.syncStatus,'synced');
  assert.equal(backup.city,'Cloud'); assert.equal(backup.syncStatus,'synced');
});

test('active-user snapshot remains a recovery backup for trips missing from active storage',()=>{
  const backup={id:'backup-only',ownerId:'user-1',city:'Recovered',country:'Test',cloudRevision:4,syncStatus:'synced'};
  const {storage,window}=boot([['travelmate-active-user','user-1'],['travelmate-trips','[]'],['travelmate-trips-user:user-1',JSON.stringify([backup])]]);
  window.__canonicalSyncTest.activateUserStorage('user-1');
  assert.equal(JSON.parse(storage.get('travelmate-trips'))[0].city,'Recovered');
});
test('upserting authoritative cloud state mirrors it to the active-user snapshot',()=>{
  const stale={id:'trip-1',ownerId:'user-1',city:'Stale',country:'Test',cloudRevision:6,syncStatus:'conflict'};
  const {storage,window}=boot([['travelmate-active-user','user-1'],['travelmate-trips',JSON.stringify([stale])],['travelmate-trips-user:user-1',JSON.stringify([stale])]]);
  const cloud={id:'trip-1',ownerId:'user-1',city:'Cloud',country:'Test',cloudRevision:7,syncStatus:'synced'};
  window.TravelMateCloud.upsertLocalTrip(cloud);
  const active=JSON.parse(storage.get('travelmate-trips'))[0];
  const backup=JSON.parse(storage.get('travelmate-trips-user:user-1'))[0];
  assert.equal(active.city,'Cloud'); assert.equal(active.syncStatus,'synced');
  assert.equal(backup.city,'Cloud'); assert.equal(backup.syncStatus,'synced');
});

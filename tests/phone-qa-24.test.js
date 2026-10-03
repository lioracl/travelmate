'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function boot({online=false,session=null,error=null}={}){
 const own={id:'own',ownerId:'A',city:'Active',cloudRevision:7,syncStatus:'synced'}, shared={id:'shared',ownerId:'other-owner'},foreign={id:'foreign',ownerId:'B'};
 const storage=new Map([['travelmate-active-user','A'],['travelmate-trips',JSON.stringify([own,shared,foreign])],['travelmate-trips-user:A',JSON.stringify([{...own,city:'Stale',cloudRevision:6,syncStatus:'conflict'},shared])]]);
 let callback;const client={auth:{getSession:async()=>({data:{session},error}),onAuthStateChange:fn=>{callback=fn;return {data:{subscription:{unsubscribe(){}}}}}}};
 const window={__travelMateSupabaseClient:client,dispatchEvent(){},addEventListener(){}};
 const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 vm.runInNewContext(fs.readFileSync('assets/cloud-sync.js','utf8'),{window,localStorage,document:{},navigator:{onLine:online},setTimeout,clearTimeout,CustomEvent:function(){},console});
 return {storage,cloud:window.TravelMateCloud,fire:(e,s)=>callback(e,s),setSession:s=>{session=s}};
}
test('offline session refresh with no session preserves canonical cached access',async()=>{const r=boot();await r.cloud.getSession();assert.equal(r.storage.get('travelmate-active-user'),'A');assert.deepEqual(Array.from(r.cloud.getCachedTrips(),t=>t.id),['own','shared']);});
test('offline cache keeps active canonical state over stale conflict backup',()=>{const r=boot();assert.equal(r.cloud.getCachedTrips()[0].city,'Active');});
test('session refresh failure preserves cache and does not expose foreign active rows',async()=>{const r=boot({error:Error('NETWORK_DOWN')});await assert.rejects(r.cloud.getSession(),/NETWORK_DOWN/);assert.equal(r.cloud.getCachedTrips().some(t=>t.ownerId==='B'),false);});
test('explicit logout offline clears access; B cannot inherit A cache',async()=>{const r=boot();await r.cloud.onAuthChange(()=>{});r.fire('SIGNED_OUT',null);await new Promise(resolve=>setTimeout(resolve,10));assert.equal(r.cloud.getCachedTrips().length,0);r.setSession({user:{id:'B'}});await r.cloud.getSession();assert.equal(r.storage.get('travelmate-active-user'),'B');assert.equal(r.cloud.getCachedTrips().length,0);});
test('offline null INITIAL_SESSION preserves cache; online null session clears access',async()=>{const r=boot();await r.cloud.onAuthChange(()=>{});r.fire('INITIAL_SESSION',null);await new Promise(resolve=>setTimeout(resolve,10));assert.equal(r.cloud.getCachedTrips().length,2);const online=boot({online:true});await online.cloud.getSession();assert.equal(online.cloud.getCachedTrips().length,0);});
test('account switch during delayed session lookup rejects the stale result',async()=>{const r=boot();const pending=r.cloud.getSession();r.storage.set('travelmate-active-user','B');await assert.rejects(pending,/AUTH_CONTEXT_CHANGED/);assert.equal(r.storage.get('travelmate-active-user'),'B');});

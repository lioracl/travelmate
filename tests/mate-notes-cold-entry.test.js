'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../assets/mate-notes.js'),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
function trip(ownerId='A',id='same-trip'){return {id,ownerId,cloudRevision:7,budget:50,aiNotes:[{id:'old',question:'Synthetic question',answer:'Synthetic answer',createdAt:'2026-10-20T00:00:00Z'}]};}
function boot(records=[trip()],ready){
 let account='A',list=clone(records),saves=[];const listeners={};
 const window={TravelMateTripStore:{getTrips:()=>clone(list),saveTrip:value=>{saves.push(clone(value));list=list.map(t=>t.id===value.id&&t.ownerId===value.ownerId?clone(value):t);emit('travelmate:local-trips-updated');}},addEventListener:(name,fn)=>(listeners[name]??=[]).push(fn)};
 if(ready)window.travelMateTripReady=ready;
 const document={body:{dataset:{}},readyState:'complete',getElementById:()=>null,addEventListener(){}};
 const location={search:'?id=same-trip'},localStorage={getItem:key=>key==='travelmate-active-user'?account:null};
 function emit(name){for(const fn of listeners[name]||[])fn({});}
 const context={window,document,location,localStorage,URLSearchParams,Promise,Intl,navigator:{}};
 vm.runInNewContext(source,context);
 return {api:window.TravelMateMateNotes,list:()=>clone(list),saves,emit,account(value,records){account=value;if(records)list=clone(records);emit('travelmate:account-context-changed');},replace(records){list=clone(records);emit('travelmate:local-trips-updated');},location,context};
}
test('notes delta resolves latest canonical revision and preserves unrelated fields',()=>{
 const h=boot(),scope=h.api.capture('same-trip');const next=trip();next.cloudRevision=8;next.budget=99;next.aiNotes.push({id:'new'});h.replace([next]);
 assert.equal(h.api.update('same-trip',draft=>{draft.aiNotes=draft.aiNotes.filter(n=>n.id!=='old');draft.budget=-1;return true;},scope),true);
 assert.deepEqual(h.saves[0].aiNotes,[{id:'new'}]);assert.equal(h.saves[0].cloudRevision,8);assert.equal(h.saves[0].budget,99);
});
test('A scope cannot mutate same trip ID after A to B account switch',()=>{
 const h=boot(),scope=h.api.capture('same-trip');h.account('B',[trip('B')]);
 assert.equal(h.api.update('same-trip',d=>{d.aiNotes=[];return true;},scope),false);assert.equal(h.saves.length,0);assert.equal(h.list()[0].aiNotes.length,1);
});
test('A to B to A does not revive old generation',()=>{
 const h=boot(),scope=h.api.capture('same-trip');h.account('B',[trip('B')]);h.account('A',[trip()]);
 assert.equal(h.api.update('same-trip',()=>true,scope),false);assert.equal(h.saves.length,0);
});
test('scope rejects route change, pagehide and later pageshow reuse',()=>{
 const h=boot(),scope=h.api.capture('same-trip');h.location.search='?id=other-trip';
 assert.equal(h.api.update('same-trip',()=>true,scope),false);
 h.location.search='?id=same-trip';const next=h.api.capture('same-trip');h.emit('pagehide');h.emit('pageshow');
 assert.equal(h.api.update('same-trip',()=>true,next),false);assert.equal(h.saves.length,0);
});
test('shared owner survives active-account mismatch and reordered colliding IDs',()=>{
 const h=boot([trip('shared-owner')]),scope=h.api.capture('same-trip');assert.equal(scope.ownerId,'shared-owner');
 h.replace([trip('other-owner'),{...trip('shared-owner'),cloudRevision:12}]);
 assert.equal(h.api.update('same-trip',d=>{d.aiNotes=[];return true;},scope),true);
 assert.equal(h.saves[0].ownerId,'shared-owner');assert.equal(h.saves[0].cloudRevision,12);assert.equal(h.list()[0].aiNotes.length,1);
});
test('ambiguous unbound composite identity fails closed',()=>{
 const h=boot([trip('first'),trip('second')]);
 assert.equal(h.api.capture('same-trip'),null);assert.equal(h.api.update('same-trip',()=>true),false);assert.equal(h.saves.length,0);
});
test('legacy ownerless wildcard cannot divert a bound-owner canonical write',()=>{
 const h=boot(),scope=h.api.capture('same-trip');h.replace([trip(''),trip()]);
 assert.equal(h.api.update('same-trip',d=>{d.aiNotes=[];return true;},scope),false);
 assert.equal(h.saves.length,0);assert.equal(h.list()[0].ownerId,'');assert.equal(h.list()[0].aiNotes.length,1);
});
test('canonical trip-ready resolves ambiguous page owner',async()=>{
 let release;const ready=new Promise(r=>release=r),h=boot([trip('first'),trip('second')],ready);
 release(trip('second'));await Promise.resolve();await Promise.resolve();
 assert.equal(h.api.capture('same-trip').ownerId,'second');
});
test('pending page hydration does not bind a different locally cached owner',async()=>{
 let release;const h=boot([trip('cached-owner')],new Promise(r=>release=r));
 assert.equal(h.api.capture('same-trip'),null);
 h.replace([trip('cached-owner'),trip('invited-owner')]);release(trip('invited-owner'));
 await Promise.resolve();await Promise.resolve();
 assert.equal(h.api.capture('same-trip').ownerId,'invited-owner');
});
test('late trip-ready cannot select former owner after account generation changes',async()=>{
 let release;const h=boot([trip('first'),trip('second')],new Promise(r=>release=r));
 h.account('B',[trip('B'),trip('shared')]);release(trip('first'));await Promise.resolve();await Promise.resolve();
 assert.equal(h.api.capture('same-trip'),null);assert.equal(h.saves.length,0);
});
test('pending hydration resumes safely after pagehide and pageshow',async()=>{
 let release;const h=boot([trip('first'),trip('second')],new Promise(r=>release=r));
 h.emit('pagehide');release(trip('second'));await Promise.resolve();await Promise.resolve();
 assert.equal(h.api.capture('same-trip'),null);h.emit('pageshow');await Promise.resolve();await Promise.resolve();
 assert.equal(h.api.capture('same-trip').ownerId,'second');
});
test('rejected trip-ready has safe empty fallback',async()=>{
 let reject;const h=boot([],new Promise((r,j)=>reject=j));reject(Error('synthetic'));await Promise.resolve();await Promise.resolve();
 assert.equal(h.api.capture('same-trip'),null);assert.equal(h.saves.length,0);
});
test('deleted, pending-deletion and signed-out owned trips cannot be mutated',()=>{
 for(const record of [{...trip(),deletedAt:'synthetic'},{...trip(),deletePending:true}]){
  const h=boot([record]);assert.equal(h.api.capture('same-trip'),null);
 }
 const h=boot();h.account('',[trip()]);assert.equal(h.api.capture('same-trip'),null);assert.equal(h.api.update('same-trip',()=>true),false);
});
test('legacy ownerless local trip stays usable while signed out',()=>{
 const h=boot([trip('')]);h.account('',[trip('')]);assert.equal(h.api.update('same-trip',d=>{d.aiNotes=[];return true;}),true);assert.equal(h.saves[0].ownerId,'');
});
test('re-entrant account change or canonical update aborts persistence',()=>{
 const a=boot(),scope=a.api.capture('same-trip');assert.equal(a.api.update('same-trip',d=>{d.aiNotes=[];a.account('B',[trip('B')]);return true;},scope),false);assert.equal(a.saves.length,0);
 const b=boot();assert.equal(b.api.update('same-trip',d=>{d.aiNotes=[];b.replace([{...trip(),cloudRevision:9}]);return true;}),false);assert.equal(b.saves.length,0);assert.equal(b.list()[0].cloudRevision,9);
});
test('no-op updater and vanished owner do not create records or writes',()=>{
 const h=boot(),scope=h.api.capture('same-trip');assert.equal(h.api.update('same-trip',()=>false,scope),false);
 h.replace([trip('different')]);assert.equal(h.api.update('same-trip',()=>true,scope),false);assert.equal(h.saves.length,0);
});
test('formatting preserves escaped text, headings, emphasis and lists',()=>{
 const h=boot();assert.equal(h.api.formatResponse('# Header\n- **bold**\n&lt;script&gt;x&lt;/script&gt;'),'<h3>Header</h3><ul><li><strong>bold</strong></li></ul><p>&lt;script&gt;x&lt;/script&gt;</p>');
});
test('module initialization is idempotent and has no auth, voice or network dependency',()=>{
 const h=boot(),api=h.api;vm.runInNewContext(source,h.context);assert.equal(h.context.window.TravelMateMateNotes,api);
 assert.doesNotMatch(source,/\bfetch\s*\(|getSession\s*\(|getClient\s*\(|TravelMateVoice|functions\.invoke/);
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function runtime(){
 const storage=new Map([['travelmate-active-user','owner'],['travelmate-trips',JSON.stringify([{id:'trip',ownerId:'owner',activities:[{id:'a',title:'OLD',time:'10:00'}],savedPlaces:[],budget:1000,expenses:[],memories:[]}])]]);
 const context={localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},CustomEvent:function(t,o){this.type=t;this.detail=o.detail},window:{dispatchEvent(){}}};
 vm.runInNewContext(fs.readFileSync('assets/trip-store.js','utf8'),context);
 return {store:context.window.TravelMateTripStore,storage};
}
const copy=value=>JSON.parse(JSON.stringify(value));
function save(store,draft,baseline,fields){return store.saveTripFields(draft,baseline,fields,{userId:'owner'});}
test('Budget save preserves newer Plan and Memories fields',()=>{
 const {store}=runtime(),baseline=copy(store.getTrip('trip')),draft=copy(baseline);
 store.updateTrip('trip',t=>{t.activities[0].title='NEW';t.memories=[{id:'m',note:'new memory'}];return t});draft.budget=500;
 const saved=save(store,draft,baseline,['budget','memories','expenses']);
 assert.equal(saved.activities[0].title,'NEW');assert.equal(saved.memories[0].note,'new memory');assert.equal(saved.budget,500);
});
test('Memories save preserves newer Budget and Plan',()=>{
 const {store}=runtime(),baseline=copy(store.getTrip('trip')),draft=copy(baseline);
 store.updateTrip('trip',t=>{t.budget=700;t.expenses=[{id:'e',amount:5}];t.activities[0].title='NEW';return t});draft.memories.push({id:'m',note:'memory'});
 const saved=save(store,draft,baseline,['budget','expenses','memories']);assert.equal(saved.budget,700);assert.equal(saved.expenses[0].amount,5);assert.equal(saved.activities[0].title,'NEW');assert.equal(saved.memories.length,1);
});
test('retained Plan patches an edited field and preserves realtime record edits/additions',()=>{
 const {store}=runtime(),baseline=copy(store.getTrip('trip')),draft=copy(baseline);
 store.updateTrip('trip',t=>{t.activities=[{id:'a',title:'NEW',time:'10:00'},{id:'b',title:'remote'}];t.budget=800;return t});draft.activities[0].time='11:00';
 const saved=save(store,draft,baseline,['activities']);assert.equal(saved.activities[0].title,'NEW');assert.equal(saved.activities[0].time,'11:00');assert.equal(saved.activities[1].id,'b');assert.equal(saved.budget,800);
});
test('canonical deletion is not resurrected by a stale record edit',()=>{
 const {store}=runtime(),baseline=copy(store.getTrip('trip')),draft=copy(baseline);store.updateTrip('trip',t=>{t.activities=[];return t});draft.activities[0].time='11:00';assert.deepEqual(copy(save(store,draft,baseline,['activities']).activities),[]);
});
test('account switch rejects retained writes even for same trip id',()=>{
 const {store,storage}=runtime(),baseline=copy(store.getTrip('trip')),draft=copy(baseline);draft.budget=500;storage.set('travelmate-active-user','other');assert.equal(save(store,draft,baseline,['budget']),null);assert.equal(store.getTrip('trip').budget,1000);
});
test('owner mismatch and absent canonical trip cannot create a new trip',()=>{
 const {store}=runtime(),baseline=copy(store.getTrip('trip')),draft=copy(baseline);draft.ownerId='other';draft.budget=500;assert.equal(save(store,draft,baseline,['budget']),null);store.removeTrip('trip');assert.equal(save(store,baseline,baseline,['budget']),null);
});
test('identity fields cannot be patched and draft does not mutate canonical before save',()=>{
 const {store}=runtime(),baseline=copy(store.getTrip('trip')),draft=copy(baseline);draft.activities[0].title='changed';assert.equal(store.getTrip('trip').activities[0].title,'OLD');assert.throws(()=>save(store,draft,baseline,['ownerId']),/FIELD/);
});

test('actual experience Budget writer retains NEW Plan after OLD snapshot',()=>{
 const {store}=runtime(),old=copy(store.getTrip('trip'));
 const source=fs.readFileSync('assets/trip-experience.js','utf8');
 const start=source.indexOf('  function saveTripData('),end=source.indexOf('  function receiptPath(',start);
 const context={state:{trip:old,expenses:[],memories:[],budgetCategories:[],albumUrl:'',fee:2.5,secondaryCurrency:'ILS',budgetUnlimited:false},experienceBaseline:copy(old),experienceAccountId:'owner',experienceAvailable:true,localStorage:{getItem:()=> 'owner'},window:{TravelMateTripStore:store},location:{search:'?id=trip'},URLSearchParams,cloud:null,writeJson(){},storageKey(){return 'key'},safeExpenses(){return []}};
 vm.runInNewContext(source.slice(start,end),context);
 store.updateTrip('trip',t=>{t.activities[0].title='NEW';return t});context.state.trip.budget=500;context.saveTripData();assert.equal(store.getTrip('trip').activities[0].title,'NEW');assert.equal(store.getTrip('trip').budget,500);
});

test('new owned map and collection preserve canonical additions made after absent baseline fields',()=>{
 const {store}=runtime(),baseline=copy(store.getTrip('trip')),draft=copy(baseline);delete baseline.dayModes;delete baseline.memories;delete draft.dayModes;delete draft.memories;
 store.updateTrip('trip',t=>{t.dayModes={'2026-10-15':'fixed'};t.memories=[{id:'remote',note:'remote'}];return t});draft.dayModes={'2026-10-14':'flexible'};draft.memories=[{id:'local',note:'local'}];
 const saved=save(store,draft,baseline,['dayModes','memories']);assert.equal(saved.dayModes['2026-10-15'],'fixed');assert.equal(saved.dayModes['2026-10-14'],'flexible');assert.deepEqual(copy(saved.memories).map(m=>m.id),['remote','local']);
});

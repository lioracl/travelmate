'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function apis(){
  const window={dispatchEvent(){},addEventListener(){}};
  const document={readyState:'loading',addEventListener(){},getElementById(){return null}};
  const sandbox={window,document,Date,Object,Number,String,Array,Math,Intl,URLSearchParams,CustomEvent:function(){},setTimeout(){}};
  for(const name of ['trip-context','trip-analytics','learned-preferences','trip-replay']){
    vm.runInNewContext(fs.readFileSync('assets/'+name+'.js','utf8'),sandbox);
  }
  return window;
}

test('personal stats fail closed without an authenticated owner',()=>{
  const a=apis().TravelMateTripAnalytics;
  for(const user of [undefined,null,'']){
    const stats=a.buildPersonalStats([{id:'guest',days:5,activities:[{date:'2026-10-01',done:true}]}],user);
    assert.equal(stats.tripsCount,0);
    assert.equal(stats.completedVisits,0);
  }
});

test('missing coordinates remain unknown while explicit numeric zero is valid',()=>{
  const w=apis(),c=w.TravelMateTripContext;
  for(const missing of [null,undefined,'','   ']){
    assert.equal(c.coordinates({lat:missing,lon:10}),null);
    assert.equal(c.coordinates({lat:10,lon:missing}),null);
    assert.equal(c.distanceKm({lat:missing,lon:10},{lat:0,lon:0}),null);
  }
  assert.equal(c.coordinates(null),null);
  assert.equal(c.coordinates({lat:0,lon:'0'}).lat,0);
  const result=w.TravelMateTripAnalytics.build({activities:[
    {date:'2026-10-01',time:'10:00',done:true,lat:'',lon:''},
    {date:'2026-10-01',time:'12:00',done:true,lat:50,lon:14}
  ]});
  assert.equal(result.coverage.coordinateRecords,1);
  assert.equal(result.movement.distanceKm,0);
  assert.equal(result.status.distance,'unknown');
});

test('manual travel time does not fabricate distance coverage or distance status',()=>{
  const result=apis().TravelMateTripAnalytics.build({activities:[
    {id:'a',date:'2026-10-01',time:'10:00',done:true},
    {id:'b',date:'2026-10-01',time:'12:00',done:true,travelMinutesBefore:25}
  ]});
  assert.equal(result.movement.travelMinutes,25);
  assert.equal(result.status.travelTime,'confirmed');
  assert.equal(result.movement.distanceCoverage,0);
  assert.equal(result.status.distance,'unknown');
});

test('cross-trip confidence and evidence count distinct owned trip identities',()=>{
  const a=apis().TravelMateLearnedPreferences;
  const first={id:'one',ownerId:'u',activities:[{id:'a',category:'museum',done:true}]};
  const second={id:'two',ownerId:'u',activities:[{id:'b',category:'museum',done:true}]};
  const expected=a.buildCrossTripSuggestions([first,second],'u')[0];
  const actual=a.buildCrossTripSuggestions([first,first,second],'u')[0];
  assert.equal(actual.confidence,expected.confidence);
  assert.equal(actual.evidence.length,2);
  assert.equal(actual.reviewState,'suggested');
  assert.equal(a.exportForMate(actual,true),null);
  const confirmed=a.transition(actual,'confirmed');
  assert.ok(a.exportForMate(confirmed,true));
  assert.equal(a.exportForMate(a.transition(confirmed,'rejected'),true),null);
  assert.equal(a.exportForMate(a.transition(confirmed,'deleted'),true),null);
});

test('learning excludes missing trip identity and foreign or deleted evidence',()=>{
  const a=apis().TravelMateLearnedPreferences;
  const base={ownerId:'u',activities:[{id:'a',category:'museum',done:true}]};
  assert.equal(a.buildCrossTripSuggestions([base,{...base,id:'two'}],'u').length,0);
  assert.equal(a.buildCrossTripSuggestions([{...base,id:'one'},{...base,id:'two',ownerId:'other'},{...base,id:'three',deletedAt:'2026-10-01'}],'u').length,0);
});

test('Replay never adds unlike currencies into a claimed monetary total',()=>{
  const a=apis().TravelMateTripReplay;
  const mixed=a.build({expenses:[{amount:10,currency:'EUR'},{amount:20,currency:'USD'}]});
  assert.equal(mixed.expenseTotal,null);
  assert.equal(mixed.expenseLabel,'');
  assert.equal(mixed.expenseCurrency,'');
  assert.equal(mixed.expenses,2);
  assert.doesNotMatch(a.narrative(mixed),/30/);
  const same=a.build({expenses:[{amount:10,currency:'EUR'},{amount:20,currency:'EUR'}]});
  assert.equal(same.expenseTotal,30);
  assert.equal(same.expenseCurrency,'EUR');
});


function cloudProfile(){
  let user={user_metadata:{display_name:'Before',travelmate_preferences:{pace:'relaxed',learningEnabled:false}}};
  const writes=[];
  const window={__travelMateSupabaseClient:{auth:{updateUser:async update=>{
    writes.push(update);
    user={...user,user_metadata:{...user.user_metadata,...update.data}};
    return {data:{user},error:null};
  }}},dispatchEvent(){},addEventListener(){}};
  const sandbox={window,document:{},localStorage:{getItem(){return null},setItem(){}},setTimeout,clearTimeout,CustomEvent:function(){}};
  vm.runInNewContext(fs.readFileSync('assets/cloud-sync.js','utf8'),sandbox);
  return {api:window.TravelMateCloud,writes};
}
test('Home name-only profile saves preserve preferences and the learning opt-out',async()=>{
  const {api,writes}=cloudProfile();
  const result=await api.updateProfile(' After ');
  assert.equal(result.data.user.user_metadata.display_name,'After');
  assert.equal(result.data.user.user_metadata.travelmate_preferences.pace,'relaxed');
  assert.equal(result.data.user.user_metadata.travelmate_preferences.learningEnabled,false);
  assert.equal(Object.hasOwn(writes[0].data,'travelmate_preferences'),false);
});
test('explicit profile preference edits and resets remain supported',async()=>{
  const {api}=cloudProfile();
  const changed=await api.updateProfile('After',{pace:'active',learningEnabled:false});
  assert.equal(changed.data.user.user_metadata.travelmate_preferences.pace,'active');
  assert.equal(changed.data.user.user_metadata.travelmate_preferences.learningEnabled,false);
  const reset=await api.updateProfile('After',{});
  assert.equal(reset.data.user.user_metadata.travelmate_preferences,null);
});
test('learning does not read private sources and Mate exports no provenance or private text',()=>{
  const a=apis().TravelMateLearnedPreferences;
  const trips=['one','two'].map(id=>{
    const trip={id,ownerId:'u',activities:[{id:'a',category:'museum',done:true}]};
    for(const key of ['documents','receipts','memories','messages','credentials','medicalNotes','gpsHistory']){
      Object.defineProperty(trip,key,{get(){throw new Error('Private read: '+key)}});
    }
    return trip;
  });
  const suggestion=a.buildCrossTripSuggestions(trips,'u')[0];
  const exported=a.exportForMate(a.transition(suggestion,'confirmed'),true);
  assert.deepEqual(Object.keys(exported).sort(),['preferenceKey','reviewState','sourceScope','value']);
  assert.equal(a.exportForMate(a.transition(suggestion,'confirmed'),false),null);
});

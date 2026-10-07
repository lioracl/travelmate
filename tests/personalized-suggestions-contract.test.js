'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('assets/personalized-suggestions.js','utf8');
const nearby=fs.readFileSync('assets/nearby.js','utf8');
const css=fs.readFileSync('assets/nearby.css','utf8');
const app=fs.readFileSync('assets/app.js','utf8');

function boot(extra={}){
  const listeners=[];
  const window={
    dispatchEvent(event){listeners.push(event)},
    TravelMateUserProfile:{
      preferenceLabels:{interests:{food:'אוכל',history:'היסטוריה',culture:'תרבות',photography:'צילום',beaches:'חופים',technology:'טכנולוגיה'}},
      fromUser(){return{preferences:{interests:['food','history'],learningEnabled:true}}}
    },
    TravelMateCloud:{getSession:async()=>({user:{id:'owner-A'}})},
    TravelMateLearnedProfile:{confirmedForMate:async()=>[{preferenceKey:'interests',value:'culture',reviewState:'confirmed'},{preferenceKey:'interests',value:'food',reviewState:'confirmed'}]},
    ...extra
  };
  vm.runInNewContext(source,{window,CustomEvent:function(type,init){this.type=type;this.detail=init&&init.detail},Object,Array,String,Promise,console});
  return{api:window.TravelMatePersonalizedSuggestions,window,listeners};
}

test('personalization keeps declared interests first and confirmed learned interests separate',()=>{
  const {api}=boot();
  const model=api.build(['food','history'],['culture','food']);
  assert.deepEqual(Array.from(model.declared),['food','history']);
  assert.deepEqual(Array.from(model.learned),['culture']);
  assert.equal(model.interests[0].source,'declared');
  assert.equal(model.interests.at(-1).source,'learned');
  assert.deepEqual(Array.from(model.categoryKeys).slice(0,6),['restaurants','cafes','bakeries','markets','historic','museums']);
});

test('category and place reasons disclose why a suggestion is personalized',()=>{
  const {api}=boot(),model=api.build(['history'],['culture']);
  const reason=api.reasonForCategory('historic',model);assert.equal(reason.interest,'history');assert.equal(reason.label,'היסטוריה');assert.equal(reason.source,'declared');assert.equal(reason.text,'מתאים לתחום שבחרת: היסטוריה');
  assert.equal(api.reasonForCategory('markets',model).source,'learned');
  assert.equal(api.reasonForPlace({category:'museum',type:'attractions'},'all',model).interest,'history');
  assert.equal(api.inferCategoryKey({category:'viewpoint'}),'viewpoints');
});

test('current profile uses confirmed learned preferences without syncing or mutating them',async()=>{
  let confirmedCalls=0,syncCalls=0;
  const {api}=boot({TravelMateLearnedProfile:{confirmedForMate:async(owner,enabled)=>{confirmedCalls+=1;assert.equal(owner,'owner-A');assert.equal(enabled,true);return[{preferenceKey:'interests',value:'culture',reviewState:'confirmed'}]},sync:async()=>{syncCalls+=1}}});
  const model=await api.current();
  assert.deepEqual(Array.from(model.declared),['food','history']);
  assert.deepEqual(Array.from(model.learned),['culture']);
  assert.equal(confirmedCalls,1);
  assert.equal(syncCalls,0);
});

test('declared personalization survives learned-preference lookup failure',async()=>{
  const {api}=boot({TravelMateLearnedProfile:{confirmedForMate:async()=>{throw new Error('offline')}}});
  const model=await api.current();
  assert.deepEqual(Array.from(model.declared),['food','history']);
  assert.deepEqual(Array.from(model.learned),[]);
});

test('Places exposes an explicit For You shelf without automatic search or GPS',()=>{
  assert.match(app,/places:\{[\s\S]*'learned-preferences\.js','learned-profile\.js','personalized-suggestions\.js'/);
  assert.match(nearby,/data-nearby-personalized/);
  assert.match(nearby,/hydratePersonalization\(\)/);
  assert.match(nearby,/TravelMatePersonalizedSuggestions/);
  assert.match(nearby,/personalFitHtml\(place,category,results\)/);
  const hydrate=nearby.slice(nearby.indexOf('async function hydratePersonalization'),nearby.indexOf('function clearPoiMarkers'));
  assert.doesNotMatch(hydrate,/currentPosition\(|executePlacesSearch\(|searchAt\(/);
});

test('personalized Places styling stays semantic, responsive and adds no important escalation',()=>{
  assert.match(css,/\.nearby-personalized\{/);
  assert.match(css,/\.nearby-personal-fit\{/);
  assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  const block=css.slice(css.indexOf('Personalized Suggestions V1'));
  assert.doesNotMatch(block,/!important/);
  assert.doesNotMatch(block,/#(?:[0-9a-f]{3}|[0-9a-f]{6})\b/i);
});

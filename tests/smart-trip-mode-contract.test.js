const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const smart=require('../assets/smart-trip-mode.js');

const app=fs.readFileSync('assets/app.js','utf8');
const nearby=fs.readFileSync('assets/nearby.js','utf8');
const weather=fs.readFileSync('assets/weather-widget.js','utf8');
const css=fs.readFileSync('assets/smart-trip-mode.css','utf8');
const source=fs.readFileSync('assets/smart-trip-mode.js','utf8');

function baseModel(overrides={}){
  return Object.assign({phase:'ACTIVE',today:'2026-10-05',dayIndex:2,currentOrNext:null,firstScheduled:null,completedTotal:0},overrides);
}
function today(model){return {model(){return model;}}}
function context(overrides={}){
  return Object.assign({
    nextFixedActivity(){return null;},
    availableMinutesUntilNextFixed(){return null;},
    transitionAssessmentsForDate(){return {};},
    freeTimeWindowsForDate(){return [];},
    clockTime(total){return String(Math.floor(total/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0');}
  },overrides);
}
function suggestion(model,ctx,personalization={},weather={ready:false},now='2026-10-05T17:00:00'){
  return smart.buildSuggestion({id:'trip-1'},new Date(now),personalization,weather,{today:today(model),context:ctx});
}

test('Smart Trip Mode classifies bounded weather signals without location data',()=>{
  assert.equal(smart.weatherSignal({ready:true,weatherCode:61,precipitationProbability:70}).kind,'rain');
  assert.equal(smart.weatherSignal({ready:true,weatherCode:1,windSpeed:40}).kind,'wind');
  assert.equal(smart.weatherSignal({ready:true,weatherCode:1,uvIndex:8}).kind,'heat');
  assert.equal(smart.weatherSignal({ready:true,weatherCode:1,currentLabel:'מעונן חלקית'}).kind,'normal');
  assert.equal(smart.weatherSignal({ready:false}).kind,'unknown');
});

test('before and after trip states produce advisory planning or recap actions',()=>{
  const before=suggestion(baseModel({phase:'BEFORE',daysUntilStart:2,firstScheduled:{id:'first'}}),context());
  assert.equal(before.kind,'prepare');
  assert.equal(before.action.href,'#plan');
  const after=suggestion(baseModel({phase:'AFTER',completedTotal:7}),context());
  assert.equal(after.kind,'recap');
  assert.equal(after.action.href,'#memories');
});

test('current activity wins over free-time and personalized suggestions',()=>{
  const model=baseModel({currentOrNext:{state:'current',id:'now',title:'מוזיאון',time:'17:00'}});
  const ctx=context({freeTimeWindowsForDate(){return[{durationMinutes:120}];}});
  const result=suggestion(model,ctx,{interests:[{key:'food',label:'אוכל',source:'declared'}],categoryKeys:['restaurants']},{ready:true,weatherCode:1,currentLabel:'נעים'});
  assert.equal(result.kind,'current');
  assert.equal(result.action.href,'#plan');
  assert.doesNotMatch(result.body,/מסעד/);
});

test('transition risk outranks an otherwise usable free-time window',()=>{
  const fixed={kind:'activity',record:{id:'dinner',title:'ארוחת ערב'},start:1080};
  const ctx=context({
    nextFixedActivity(){return fixed;},
    transitionAssessmentsForDate(){return {'activity:dinner':{risk:true,travelMinutes:35,latestDepartureTime:'17:20'}};},
    availableMinutesUntilNextFixed(){return 30;},
    freeTimeWindowsForDate(){return[{durationMinutes:90}];}
  });
  const result=suggestion(baseModel(),ctx,{}, {ready:true,weatherCode:1,currentLabel:'נעים'},'2026-10-05T17:00:00');
  assert.equal(result.kind,'transition');
  assert.match(result.title,/ארוחת ערב/);
  assert.ok(result.signals.some(item=>item.label.includes('17:20')));
});

test('free window uses declared personalization but still requires an explicit Places action',()=>{
  const ctx=context({freeTimeWindowsForDate(){return[{durationMinutes:90}];}});
  const personalization={interests:[{key:'history',label:'היסטוריה',source:'declared'}],categoryKeys:['historic','museums']};
  const result=suggestion(baseModel(),ctx,personalization,{ready:true,weatherCode:1,currentLabel:'נעים'});
  assert.equal(result.kind,'free-window');
  assert.equal(result.action.href,'#places');
  assert.equal(result.action.categoryKey,'historic');
  assert.match(result.body,/היסטוריה/);
  assert.ok(result.signals.some(item=>item.label==='היסטוריה'));
});

test('rain redirects a personalized free window to a compatible indoor category',()=>{
  const ctx=context({freeTimeWindowsForDate(){return[{durationMinutes:120}];}});
  const personalization={interests:[{key:'history',label:'היסטוריה',source:'declared'}],categoryKeys:['historic','museums']};
  const result=suggestion(baseModel(),ctx,personalization,{ready:true,weatherCode:61,precipitationProbability:80});
  assert.equal(result.kind,'weather-window');
  assert.equal(result.action.categoryKey,'museums');
  assert.ok(result.signals.some(item=>item.label.includes('גשם')));
});

test('Smart Trip Mode runtime is local and never owns search, GPS, AI or trip persistence',()=>{
  assert.doesNotMatch(source,/\bfetch\s*\(/);
  assert.doesNotMatch(source,/geolocation|currentPosition\s*\(/);
  assert.doesNotMatch(source,/TravelMateNavo|\.request\s*\(/);
  assert.doesNotMatch(source,/saveTrip\s*\(|updateTrip\s*\(/);
  assert.match(source,/travelmate-smart-place-hint/);
  assert.match(source,/הצעה בלבד/);
});

test('overview intelligence loader wires context, personalization and Smart Trip Mode in order',()=>{
  assert.match(app,/intelligence:\{styles:\['smart-trip-mode\.css'\],scripts:\['trip-context\.js','learned-preferences\.js','learned-profile\.js','personalized-suggestions\.js','smart-trip-mode\.js','trip-intelligence\.js'\]\}/);
  assert.match(source,/travelMateTripReady/);
});

test('weather exposes only a bounded recommendation snapshot and no destination coordinates',()=>{
  const start=weather.indexOf('function contextSnapshot()');
  const end=weather.indexOf('function weatherSvg',start);
  const contract=weather.slice(start,end);
  assert.match(contract,/precipitationProbability/);
  assert.match(contract,/windSpeed/);
  assert.match(contract,/uvIndex/);
  assert.doesNotMatch(contract,/latitude|longitude|state\.location/);
  assert.match(weather,/travelmate:weather-context-change/);
});

test('Smart Trip category handoff only selects a category and cannot search or request GPS',()=>{
  const start=nearby.indexOf("panel.addEventListener('travelmate:smart-category'");
  const end=nearby.indexOf('function selectSearchMode',start);
  const handler=nearby.slice(start,end);
  assert.ok(start>0&&end>start);
  assert.match(handler,/selectedCategoryKeys=\[key\]/);
  assert.match(handler,/החיפוש יתחיל רק כשתלחץ על חיפוש/);
  assert.doesNotMatch(handler,/executePlacesSearch|searchAt\(|currentPosition\(|requestGpsConsent/);
  assert.match(nearby,/consumeSmartTripCategoryHint/);
  assert.match(nearby,/Date\.now\(\)-savedAt>600000/);
});

test('Smart Trip Mode visual contract is responsive and adds no important escalation',()=>{
  assert.match(css,/\.smart-trip-mode/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(css,/@media\(max-width:350px\)/);
  assert.doesNotMatch(css,/!important/);
});

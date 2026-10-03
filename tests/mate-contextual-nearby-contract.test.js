'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

function tripContext(){
  const sandbox={window:{}};
  vm.runInNewContext(read('assets/trip-context.js'),sandbox);
  return sandbox.window.TravelMateTripContext;
}

test('Mate recognizes explicit nearby free-time intent and common durations',()=>{
  const helper=tripContext();
  assert.equal(helper.parseMateNearbyIntent('יש לי שעה וחצי פנויה, מה אפשר לעשות לידי?').availableMinutes,90);
  assert.equal(helper.parseMateNearbyIntent('יש לי שעתיים וחצי פנויות, מה כדאי לעשות בסביבה?').availableMinutes,150);
  assert.equal(helper.parseMateNearbyIntent('I have 45 minutes free, what can I do near me?').availableMinutes,45);
  assert.equal(helper.parseMateNearbyIntent('I have half an hour free, find something nearby').availableMinutes,30);
  assert.equal(helper.parseMateNearbyIntent('מה לעשות בסביבה בשעה הקרובה?').availableMinutes,60);
  assert.equal(helper.parseMateNearbyIntent('Any things to do around here?').availableMinutes,null);
  assert.equal(helper.parseMateNearbyIntent('יש לי 10 דקות פנויות, מה אפשר לעשות לידי?').availableMinutes,10);
  assert.equal(helper.parseMateNearbyIntent('I have 8 hours free, suggest something near me').availableMinutes,360);
  assert.equal(helper.parseMateNearbyIntent('Recommend a nearby restaurant').availableMinutes,null);
});

test('Mate and Places share contextual mood presets',()=>{
  const helper=tripContext();
  const quiet=helper.parseMateNearbyIntent('יש לי שעה פנויה ורוצה משהו שקט לידי');
  assert.equal(quiet.mood,'quiet');assert.deepEqual(Array.from(quiet.categories),['parks','museums']);
  const coffee=helper.parseMateNearbyIntent('I have 45 minutes and want coffee near me');
  assert.equal(coffee.mood,'coffee');assert.deepEqual(Array.from(coffee.categories),['cafes']);
  assert.deepEqual(Array.from(helper.nearbyPreferencePreset('culture').categories),['museums','historic']);
  assert.deepEqual(Array.from(helper.nearbyPreferencePreset('נוף').categories),['viewpoints']);
  assert.deepEqual(Array.from(helper.nearbyPreferencePreset('קניות').categories),['malls','markets','clothing']);
});

test('Mate does not hijack unrelated AI prompts',()=>{
  const helper=tripContext();
  assert.equal(helper.parseMateNearbyIntent('תסביר לי איך לחסוך בתקציב'),null);
  assert.equal(helper.parseMateNearbyIntent('מה מזג האוויר מחר?'),null);
  assert.equal(helper.parseMateNearbyIntent('תן לי מסעדה טובה בפריז'),null);
  assert.equal(helper.parseMateNearbyIntent('I have free time, help me plan tomorrow'),null);
  assert.equal(helper.parseMateNearbyIntent('Show me how the nearby feature works'),null);
  assert.equal(helper.parseMateNearbyIntent('Recommend how I can find nearby places in Google Maps'),null);
  assert.equal(helper.parseMateNearbyIntent('Find the word nearby in my itinerary'),null);
  assert.equal(helper.parseMateNearbyIntent("I don't want coffee near me"),null);
  assert.equal(helper.parseMateNearbyIntent('I am not looking for a cafe near me'),null);
  assert.equal(helper.parseMateNearbyIntent("Is 'coffee near me' good wording?"),null);
  assert.equal(helper.parseMateNearbyIntent('אני לא רוצה קפה לידי'),null);
  assert.equal(helper.parseMateNearbyIntent('זה ניסוח טוב: קפה לידי?'),null);
  assert.equal(helper.parseMateNearbyIntent("How should I phrase 'coffee near me'?"),null);
  assert.equal(helper.parseMateNearbyIntent("Is 'coffee near me' a good prompt?"),null);
  assert.equal(helper.parseMateNearbyIntent('I would rather not get coffee near me'),null);
  assert.equal(helper.parseMateNearbyIntent('No coffee near me, please'),null);
  assert.equal(helper.parseMateNearbyIntent('לא בא לי קפה לידי'),null);
  assert.equal(helper.parseMateNearbyIntent('אין לי חשק לקפה לידי'),null);
  assert.equal(helper.parseMateNearbyIntent('I do not feel like coffee near me'),null);
  assert.equal(helper.parseMateNearbyIntent("I don't feel like coffee near me"),null);
  assert.equal(helper.parseMateNearbyIntent('לא מתחשק לי קפה לידי'),null);
  assert.equal(helper.parseMateNearbyIntent("Translate 'what can I do near me?' into Hebrew"),null);
  assert.equal(helper.parseMateNearbyIntent('Write a poem about something to do nearby.'),null);
  assert.equal(helper.parseMateNearbyIntent('Do not recommend a restaurant near me.'),null);
  assert.equal(helper.parseMateNearbyIntent('תסביר לי מה אפשר לעשות לידי'),null);
});

test('explicit Mate duration is capped by the next fixed commitment',()=>{
  const helper=tripContext(),now=new Date('2026-10-03T13:00:00');
  const trip={activities:[{id:'fixed',date:'2026-10-03',time:'14:30',scheduleMode:'fixed'}],savedPlaces:[]};
  const request=helper.buildNearbyRequest({trip,now,position:{lat:32.1,lon:34.8},availableMinutes:180,bufferMinutes:30});
  assert.equal(request.availableMinutes,60);
  assert.equal(request.nextFixedActivity.record.id,'fixed');
  const noFixed=helper.buildNearbyRequest({trip:{activities:[],savedPlaces:[]},now,position:{lat:32.1,lon:34.8},availableMinutes:90,bufferMinutes:30});
  assert.equal(noFixed.availableMinutes,90);
  const short=helper.buildNearbyRequest({trip:{activities:[],savedPlaces:[]},now,position:{lat:32.1,lon:34.8},availableMinutes:10,bufferMinutes:30});
  assert.equal(short.availableMinutes,10);
});

test('Mate reuses Places contextual-nearby and never requests GPS directly',()=>{
  const assistant=read('assets/ai-assistant.js'),nearby=read('assets/nearby.js'),app=read('assets/app.js');
  assert.match(app,/assistant:\{styles:\['smart-hub\.css'\],scripts:\['trip-context\.js','ai-assistant\.js','smart-hub\.js'\]\}/);
  assert.match(assistant,/parseMateNearbyIntent\(content\)/);
  assert.match(assistant,/features\.load\('places'\)/);
  assert.match(assistant,/navigation\.open\('places'\)/);
  assert.match(assistant,/panel\.dispatchEvent\(new CustomEvent\('travelmate:contextual-nearby'/);
  assert.doesNotMatch(assistant,/navigator\.geolocation|getCurrentPosition\s*\(/);
  assert.match(nearby,/panel\.addEventListener\('travelmate:contextual-nearby'/);
  assert.match(nearby,/requestGpsConsent\(panel\)/);
});

test('local nearby action returns before the normal Gemini path',()=>{
  const assistant=read('assets/ai-assistant.js');
  const sendStart=assistant.indexOf('async function sendMessage');
  const invoke=assistant.indexOf('var result = await invokeAssistant(client, state.messages.slice(-12));',sendStart);
  const localBranch=assistant.indexOf('if (nearbyAction)',sendStart);
  const localReturn=assistant.indexOf('return;',localBranch);
  assert.ok(sendStart>=0&&localBranch>sendStart&&localReturn>localBranch&&invoke>localReturn);
  assert.match(assistant,/המיקום יתבקש רק דרך מסך ההסכמה הקיים/);
  assert.match(assistant,/שום מקום לא יישמר או יתווסף לתוכנית אוטומטית/);
  assert.match(assistant,/invokeAssistant\(client, state\.messages\.slice\(-12\)\)/);
});

test('Mate requests Mini Route only from explicit nearby route language',()=>{
  const helper=tripContext();
  const hebrew=helper.parseMateNearbyIntent('יש לי שעתיים, תן לי 2-3 מקומות קרובים ברצף');
  assert.equal(hebrew.miniRoute,true);assert.equal(hebrew.routeStops,3);assert.equal(hebrew.availableMinutes,120);
  const english=helper.parseMateNearbyIntent('I have two hours, find 2 nearby places in a row');
  assert.equal(english.miniRoute,true);assert.equal(english.routeStops,2);assert.equal(english.availableMinutes,120);
  assert.equal(helper.parseMateNearbyIntent('Explain what a mini route near me means'),null);
  assert.equal(helper.parseMateNearbyIntent('I already have 2 stops nearby'),null);
  assert.equal(helper.parseMateNearbyIntent("I don't need a mini route near me"),null);
  assert.equal(helper.parseMateNearbyIntent('I do not need 2 nearby places'),null);
  assert.equal(helper.parseMateNearbyIntent("Please don't build a short route near me"),null);
});

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
function api(){
  const window={addEventListener(){},dispatchEvent(){}};
  const sandbox={window,document:{readyState:'loading',body:{dataset:{tripView:'plan'}},addEventListener(){}},location:{search:'?id=t'},navigator:{},URLSearchParams,Date,Object,Number,String,Array,Math,Set,Map,Promise,CustomEvent:function(){},requestAnimationFrame(){return 1}};
  vm.runInNewContext(read('assets/opening-hours.js'),sandbox);
  vm.runInNewContext(read('assets/plan-opening-hours.js'),sandbox);
  return window.TravelMatePlanOpeningHours;
}
test('Plan opening-hours warns only on parsed actionable schedule conflicts',()=>{
  const service=api(),base={id:'x',date:'2026-10-12',scheduleMode:'fixed',duration:60,openingHours:'Mo 10:00-18:00'};
  assert.equal(service.statusFor({...base,time:'09:00'},'2026-10-12').state,'closed');
  assert.equal(service.statusFor({...base,time:'10:00',arrivalBufferMinutes:10},'2026-10-12').state,'open');
  assert.equal(service.statusFor({...base,time:'17:30'},'2026-10-12').state,'closing');
  assert.equal(service.statusFor({...base,time:'11:00',openingHours:'Mo 10:00-18:00; PH off'},'2026-10-12').state,'unknown');
});
test('Plan opening-hours skips flexible, window, done and past records',()=>{
  const service=api(),base={id:'x',date:'2026-10-12',time:'11:00',duration:60,openingHours:'Mo 10:00-18:00'};
  assert.equal(service.statusFor({...base,scheduleMode:'flexible'},'2026-10-12'),null);
  assert.equal(service.statusFor({...base,scheduleMode:'window'},'2026-10-12'),null);
  assert.equal(service.statusFor({...base,scheduleMode:'fixed',done:true},'2026-10-12'),null);
  assert.equal(service.statusFor({...base,date:'2026-10-11',scheduleMode:'fixed'},'2026-10-12'),null);
});
test('Plan opening-hours builds separate activity/place status keys without mutating trip data',()=>{
  const service=api(),trip={activities:[{id:'a',date:'2026-10-12',time:'09:00',duration:60,scheduleMode:'fixed',openingHours:'Mo 10:00-18:00'}],savedPlaces:[{id:'p',date:'2026-10-12',time:'17:30',duration:60,scheduleMode:'fixed',opening_hours:'Mo 10:00-18:00'}]};
  const before=JSON.stringify(trip),statuses=service.buildStatuses(trip,new Date(2026,9,12,8,0));
  assert.equal(statuses['activity:a'].state,'closed');
  assert.equal(statuses['place:p'].state,'closing');
  assert.equal(JSON.stringify(trip),before);
});
test('Opening-hours Plan intelligence is optional, advisory and has no tracking or persistence owner',()=>{
  const source=read('assets/plan-opening-hours.js'),app=read('assets/app.js'),polish=read('assets/plan-ux-polish.js'),css=read('assets/plan-ux-polish.css');
  assert.equal(app.includes('function loadPlanTravelIntelligence()'),true);
  assert.equal(app.includes("loadScript('opening-hours.js')"),true);
  assert.equal(app.includes("loadScript('plan-opening-hours.js')"),true);
  const planStart=app.indexOf("plan:{styles:["),planEnd=app.indexOf("},",planStart);
  const planDefinition=app.slice(planStart,planEnd+2);
  assert.doesNotMatch(planDefinition,/opening-hours.js|plan-opening-hours.js|live-routing.js|plan-live-routing.js/);
  assert.match(polish,/travelmate:plan-opening-hours/);
  assert.match(polish,/OpenStreetMap/);
  const featureCss=css.slice(css.indexOf('/* Opening-hours intelligence'));
  assert.doesNotMatch(featureCss,/!important/);
  ['geolocation','getCurrentPosition','watchPosition','fetch(','XMLHttpRequest','saveTrip','updateTrip','localStorage','sessionStorage','setInterval('].forEach(token=>assert.equal(source.includes(token),false,token));
});

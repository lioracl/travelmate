'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const today=require('../assets/custom-trip.js');
const smart=require('../assets/smart-trip-mode.js');
function context(){const window={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/trip-context.js'),'utf8'),{window,Date});return window.TravelMateTripContext;}
const now=()=>new Date('2026-10-13T12:00:00');
const trip=activities=>({id:'smart-soft-time-qa',start:'2026-10-13',end:'2026-10-15',days:3,activities,savedPlaces:[]});
const build=(value,ctx=context())=>smart.buildSuggestion(value,now(),{}, {ready:false},{today,context:ctx});
test('real Today and TripContext keep flexible/window activities out of fixed commitments',()=>{
 const value=trip([{id:'flex',date:'2026-10-13',time:'12:00',duration:60,scheduleMode:'flexible'},{id:'window',date:'2026-10-13',time:'12:20',scheduleMode:'window'}]);
 const ctx=context();assert.equal(today.model(value,now()).currentOrNext,null);assert.equal(ctx.nextFixedActivity(value,now()),null);
 assert.equal(ctx.availableMinutesUntilNextFixed(value,now(),30),null);
 const result=build(value,ctx);assert.equal(result.action.href,'#places');assert.equal(result.kind,'free-window');
});
test('completed fixed activities do not force Smart Trip to prepare or constrain Nearby',()=>{
 const value=trip([{id:'done-fixed',date:'2026-10-13',time:'12:20',scheduleMode:'fixed',done:true}]),ctx=context();
 assert.equal(today.model(value,now()).currentOrNext,null);assert.equal(ctx.nextFixedActivity(value,now()),null);
 assert.equal(ctx.availableMinutesUntilNextFixed(value,now(),30),null);
 const result=build(value,ctx);assert.equal(result.kind,'free-window');assert.equal(result.anchorId,'');
});
test('unfinished booked/reservation entries remain genuine fixed commitments',()=>{
 for(const scheduleMode of ['fixed','booked','reservation']){
 const value=trip([{id:'booking',title:'Controlled booking',date:'2026-10-13',time:'12:20',scheduleMode}]),ctx=context();
 assert.equal(ctx.nextFixedActivity(value,now()).record.id,'booking');const result=build(value,ctx);
 assert.equal(result.kind,'prepare-next');assert.equal(result.anchorId,'booking');assert.equal(result.action.href,'#plan');
 }
});
test('Smart Trip delegates free-window suitability to the shared Nearby classifier',()=>{
 const value=trip([{id:'late',date:'2026-10-13',time:'17:00',scheduleMode:'fixed'}]),canonical=context();let called=0;
 const ctx={...canonical,classifyNearbyTimeFit(options){called++;return canonical.classifyNearbyTimeFit(options);}};
 const result=build(value,ctx);assert.equal(called,1);assert.equal(result.kind,'free-window');assert.equal(result.anchorId,'late');
 assert.equal(canonical.classifyNearbyTimeFit({availableMinutes:270,outboundMinutes:0}).status,'green');
});
test('completed activities cannot create a transition risk for a later commitment',()=>{
 const ctx=context(),value=trip([
  {id:'completed',date:'2026-10-13',time:'12:00',duration:90,scheduleMode:'fixed',done:true,lat:32.08,lon:34.78},
  {id:'next',date:'2026-10-13',time:'14:00',duration:60,scheduleMode:'fixed',lat:32.30,lon:34.90}
 ]);
 const transitions=ctx.transitionAssessmentsForDate(value,'2026-10-13');
 assert.equal(Object.hasOwn(transitions,'activity:next'),false);
 const decisions=require('../assets/smart-trip-decisions.js').analyze({trip:value,now:now(),date:'2026-10-13',context:ctx});
 assert.ok(!decisions.recommendations.some(item=>item.key==='transition:activity:next'));
});
test('completed future blocks no longer split the canonical free-time window',()=>{
 const value=trip([{id:'done',date:'2026-10-13',time:'13:00',duration:60,scheduleMode:'fixed',done:true}]);
 const windows=context().freeTimeWindowsForDate(value,'2026-10-13',{startTime:'12:00',endTime:'16:00'});
 assert.equal(windows.length,1);assert.equal(windows[0].durationMinutes,240);
});
test('Smart Trip and Nearby derive context without mutating canonical trip or starting a search',()=>{
 const value=trip([{id:'flex',date:'2026-10-13',time:'12:20',scheduleMode:'flexible'}]),before=JSON.stringify(value),ctx=context();
 const result=build(value,ctx),request=ctx.buildNearbyRequest({trip:value,now:now(),position:{lat:32,lon:34}});
 assert.equal(request.availableMinutes,null);assert.equal(request.nextFixedActivity,null);assert.equal(result.action.href,'#places');
 assert.equal(JSON.stringify(value),before);assert.equal(Object.hasOwn(result,'lat'),false);
});

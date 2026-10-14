'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const engine=require('../assets/smart-trip-decisions.js'),{controller,selectLiveTransitions}=require('../assets/smart-trip-actions.js');
function harness(){let account='A',id='t',trip={id:'t',ownerId:'A',activities:[{id:'a',date:'2026-10-13',time:'15:00',scheduleMode:'flexible'},{id:'fixed',time:'18:00',scheduleMode:'fixed'}],savedPlaces:[],expenses:[{id:'e',amount:3}]},saves=0;
 const flow=controller({engine,read:()=>trip,account:()=>account,tripId:()=>id,save:next=>{saves++;trip=next;return next;}});
 return {flow,get trip(){return trip;},get saves(){return saves;},switchAccount:()=>{account='B';},switchTrip:()=>{id='other';}};
}
test('controller preview and confirmation are read-only; apply saves once and exact undo preserves unrelated data',()=>{
 const h=harness(),before=JSON.stringify(h.trip);h.flow.preview('a','16:00');h.flow.confirm();assert.equal(JSON.stringify(h.trip),before);assert.equal(h.saves,0);
 h.flow.apply();assert.equal(h.saves,1);assert.equal(h.trip.activities[0].time,'16:00');assert.throws(()=>h.flow.apply(),/CONFIRM_REQUIRED/);
 h.trip.expenses.push({id:'later',amount:7});h.flow.undo();assert.equal(h.saves,2);assert.equal(h.trip.activities[0].time,'15:00');assert.equal(h.trip.expenses.length,2);
 assert.throws(()=>h.flow.undo(),/UNDO_UNAVAILABLE/);
});
test('account or trip changes fence confirmation, apply and undo',()=>{
 for(const change of ['switchAccount','switchTrip'])for(const stage of ['confirm','apply','undo']){
 const h=harness();h.flow.preview('a','16:00');if(stage!=='confirm')h.flow.confirm();if(stage==='undo')h.flow.apply();
 const saves=h.saves;h[change]();assert.throws(()=>h.flow[stage](),/CONTEXT_CHANGED/);assert.equal(h.saves,saves);
 }
});
test('a different commitment changing after preview invalidates apply',()=>{
 const h=harness();h.flow.preview('a','16:00');h.flow.confirm();h.trip.activities[1].time='16:15';
 assert.throws(()=>h.flow.apply(),/STALE_PREVIEW/);assert.equal(h.saves,0);
});
test('concurrent target edit blocks bounded undo without clobbering it',()=>{
 const h=harness();h.flow.preview('a','16:00');h.flow.confirm();h.flow.apply();h.trip.activities[0].title='Concurrent';
 assert.throws(()=>h.flow.undo(),/UNDO_CONFLICT/);assert.equal(h.saves,1);assert.equal(h.trip.activities[0].title,'Concurrent');
});
test('window moves are deferred rather than silently violating window bounds',()=>{
 const h=harness();h.trip.activities[0].scheduleMode='window';assert.throws(()=>h.flow.preview('a','23:00'),/NOT_MOVABLE/);
});
test('unknown routing online stays unknown, never a late arrival assertion',()=>{
 const result=engine.analyze({trip:{id:'t',activities:[{id:'a',date:'2026-10-13',time:'12:40',scheduleMode:'fixed'}]},now:new Date(2026,9,13,12)});
 assert.equal(result.recommendations[0].provenance,'routing:unknown');assert.equal(result.recommendations[0].confidence,'low');
});

test('ambiguous duplicate activity IDs fail closed',()=>{const h=harness();h.trip.activities.push({...h.trip.activities[0]});assert.throws(()=>h.flow.preview('a','16:00'),/NOT_MOVABLE/);assert.equal(h.saves,0);});

test('changed itinerary after apply blocks undo but preserves the later commitment',()=>{const h=harness();h.flow.preview('a','16:00');h.flow.confirm();h.flow.apply();h.trip.activities[1].time='15:30';assert.throws(()=>h.flow.undo(),/UNDO_CONFLICT/);assert.equal(h.trip.activities[1].time,'15:30');assert.equal(h.saves,1);});

test('zero travel still respects the explicit arrival buffer and negative travel remains unknown',()=>{const options={trip:{id:'t',activities:[{id:'a',date:'2026-10-13',time:'12:05',scheduleMode:'fixed',arrivalBufferMinutes:10}]},now:new Date(2026,9,13,12),routingById:{a:{minutes:0,source:'live'}}};assert.equal(engine.analyze(options).recommendations[0].key,'late:a');options.routingById.a.minutes=-1;assert.equal(engine.analyze(options).recommendations[0].provenance,'routing:unknown');});


test('live transition snapshots are scoped to the current trip and TTL',()=>{const transitions={'activity:fixed':{date:'2026-10-13',source:'live'}},now=1000000,trip={id:'t'};assert.equal(selectLiveTransitions({tripId:'t',updatedAt:now-1000,transitions},trip,now),transitions);assert.equal(selectLiveTransitions({tripId:'other',updatedAt:now-1000,transitions},trip,now),null);assert.equal(selectLiveTransitions({tripId:'t',updatedAt:now-120001,transitions},trip,now),null);assert.equal(selectLiveTransitions({tripId:'t',updatedAt:now+1,transitions},trip,now),null);});

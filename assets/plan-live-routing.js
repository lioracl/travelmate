(function(){
'use strict';
if(window.TravelMatePlanLiveRouting)return;
var MAX_POINTS=8,MAX_PAIRS=12,REFRESH_TTL=120000;
var state={scope:'',tripId:'',signature:'',updatedAt:0,transitions:Object.create(null),inflight:null,requestId:0};
function context(){return window.TravelMateTripContext||null}
function routing(){return window.TravelMateRouting||null}
function currentTrip(){var store=window.TravelMateTripStore,id=new URLSearchParams(location.search).get('id');return store&&store.getTrip?store.getTrip(id):null}
function localDateKey(value){var helper=context();if(helper&&helper.localDateKey)return helper.localDateKey(value);var date=value instanceof Date?value:new Date(value||Date.now());return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-')}
function providerMode(mode){return mode==='walk'?'walk':mode==='bike'?'bike':mode==='drive'||mode==='taxi'?'drive':''}
function recordMode(record){var helper=context();return helper&&helper.scheduleMode?helper.scheduleMode(record):String(record&&record.scheduleMode||'planned')}
function point(record){var helper=context();return helper&&helper.coordinates?helper.coordinates(record):null}
function collectPairs(trip,today){
  var helper=context();if(!trip||!helper||typeof helper.estimateTravelMinutes!=='function')return[];
  var dates=Object.create(null),list=[];
  (trip.activities||[]).forEach(function(record){if(record&&record.date)(dates[String(record.date)]||(dates[String(record.date)]=[])).push({kind:'activity',record:record})});
  (trip.savedPlaces||[]).forEach(function(record){if(record&&record.date)(dates[String(record.date)]||(dates[String(record.date)]=[])).push({kind:'place',record:record})});
  Object.keys(dates).filter(function(date){return !today||date>=today}).sort().forEach(function(date){
    var entries=dates[date].filter(function(entry){var mode=recordMode(entry.record);return entry.record&&entry.record.done!==true&&entry.record.time&&mode!=='flexible'&&mode!=='window'}).sort(function(a,b){return String(a.record.time).localeCompare(String(b.record.time))});
    for(var i=1;i<entries.length&&list.length<MAX_PAIRS;i+=1){
      var previous=entries[i-1],next=entries[i],from=point(previous.record),to=point(next.record);if(!from||!to)continue;
      var estimate=helper.estimateTravelMinutes(previous.record,next.record);if(!estimate||estimate.source==='manual')continue;
      var provider=providerMode(estimate.mode);if(!provider)continue;
      list.push({date:date,fromKind:previous.kind,toKind:next.kind,from:previous.record,to:next.record,fromPoint:from,toPoint:to,logicalMode:estimate.mode,modeSource:estimate.modeSource||'inferred',providerMode:provider})
    }
  });
  return list
}
function pointKey(value){return Number(value.lat).toFixed(5)+','+Number(value.lon).toFixed(5)}
function buildBatches(pairs){
  var groups={walk:[],bike:[],drive:[]};(pairs||[]).forEach(function(pair){if(groups[pair.providerMode])groups[pair.providerMode].push(pair)});
  var batches=[];Object.keys(groups).forEach(function(mode){var current=null;groups[mode].forEach(function(pair){
    function needed(batch){var keys=new Set((batch&&batch.points||[]).map(pointKey));var count=0;[pair.fromPoint,pair.toPoint].forEach(function(p){var key=pointKey(p);if(!keys.has(key)){keys.add(key);count+=1}});return count}
    if(!current||current.points.length+needed(current)>MAX_POINTS){current={mode:mode,pairs:[],points:[]};batches.push(current)}
    var keys=new Set(current.points.map(pointKey));[pair.fromPoint,pair.toPoint].forEach(function(p){var key=pointKey(p);if(!keys.has(key)){keys.add(key);current.points.push(p)}});current.pairs.push(pair)
  })});return batches
}
function scopeKey(trip){return [typeof localStorage==='undefined'?'':String(localStorage.getItem('travelmate-active-user')||''),String(trip&&trip.ownerId||''),String(trip&&trip.id||'')].join('@')}
function invalidate(){state.requestId+=1;state.inflight=null;state.signature='';state.scope='';state.tripId='';state.updatedAt=0;state.transitions=Object.create(null)}
function signatureFor(trip,pairs){return [scopeKey(trip)].concat((pairs||[]).map(function(pair){return [pair.date,pair.fromKind,pair.from.id,pair.toKind,pair.to.id,pair.from.time,Number(pair.from.duration||60),pair.to.time,pair.logicalMode,pointKey(pair.fromPoint),pointKey(pair.toPoint),pair.to.arrivalBufferMinutes===undefined||pair.to.arrivalBufferMinutes===null?10:Number(pair.to.arrivalBufferMinutes)].join('@')})).join('|')}
function allowNetwork(){if(navigator.onLine===false)return false;var connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection||null;if(connection&&connection.saveData)return false;if(connection&&/^(slow-2g|2g)$/i.test(String(connection.effectiveType||'')))return false;return true}
function transitionFrom(pair,leg){var helper=context();if(!helper||typeof helper.transitionAssessment!=='function'||!leg)return null;var assessment=helper.transitionAssessment(pair.from,pair.to,{travelEstimate:{minutes:leg.minutes,distanceKm:leg.distanceKm,mode:pair.logicalMode,modeSource:pair.modeSource,source:'live',provider:leg.provider||'OpenStreetMap routing'}});if(!assessment||assessment.overlap)return null;return Object.freeze({date:pair.date,fromKind:pair.fromKind,fromId:String(pair.from.id),fromTitle:String(pair.from.title||pair.from.name||''),toKind:pair.toKind,toId:String(pair.to.id),gapMinutes:assessment.gapMinutes,travelMinutes:assessment.travelMinutes,bufferMinutes:assessment.bufferMinutes,requiredMinutes:assessment.requiredMinutes,shortfallMinutes:assessment.shortfallMinutes,latestDepartureTime:assessment.latestDepartureTime,risk:assessment.risk,mode:assessment.mode,modeSource:assessment.modeSource,source:'live',provider:assessment.provider||leg.provider||'OpenStreetMap routing',distanceKm:assessment.distanceKm})}
function emit(tripId,transitions,pairCount){window.dispatchEvent(new CustomEvent('travelmate:plan-live-routing',{detail:{tripId:String(tripId||''),transitions:transitions,updatedAt:state.updatedAt,pairCount:Number(pairCount||0),liveCount:Object.keys(transitions||{}).length}}))}
async function refresh(force){
  if(document.body&&document.body.dataset.tripView!=='plan')return state.transitions;
  var trip=currentTrip(),api=routing(),helper=context();if(!trip||!api||!helper||typeof api.matrix!=='function')return state.transitions;
  var pairs=collectPairs(trip,localDateKey(new Date())),signature=signatureFor(trip,pairs),now=Date.now();
  if(!force&&state.tripId===String(trip.id||'')&&state.signature===signature&&now-state.updatedAt<REFRESH_TTL){emit(trip.id,state.transitions,pairs.length);return state.transitions}
  if(!allowNetwork()||!pairs.length){state.requestId+=1;state.inflight=null;state.tripId=String(trip.id||'');state.signature=signature;state.updatedAt=now;state.transitions=Object.create(null);emit(trip.id,state.transitions,pairs.length);return state.transitions}
  if(state.inflight&&state.signature===signature)return state.inflight;
  var requestId=++state.requestId,batches=buildBatches(pairs),scope=scopeKey(trip);state.scope=scope;state.signature=signature;
  state.inflight=Promise.all(batches.map(async function(batch){var matrix=await api.matrix(batch.points,{mode:batch.mode});return{batch:batch,matrix:matrix}})).then(function(results){
    if(requestId!==state.requestId)return state.transitions;if(scope!==scopeKey(currentTrip())){invalidate();return state.transitions}var transitions=Object.create(null);results.forEach(function(result){if(!result.matrix||typeof result.matrix.leg!=='function')return;result.batch.pairs.forEach(function(pair){var leg=result.matrix.leg(pair.fromPoint,pair.toPoint),transition=transitionFrom(pair,leg);if(transition)transitions[pair.toKind+':'+String(pair.to.id)]=transition})});state.tripId=String(trip.id||'');state.updatedAt=Date.now();state.transitions=transitions;emit(trip.id,transitions,pairs.length);return transitions
  }).catch(function(){if(scope!==scopeKey(currentTrip())){invalidate();return state.transitions}if(requestId===state.requestId){state.tripId=String(trip.id||'');state.updatedAt=Date.now();state.transitions=Object.create(null);emit(trip.id,state.transitions,pairs.length)}return state.transitions}).finally(function(){if(requestId===state.requestId)state.inflight=null});
  return state.inflight
}
var refreshTimer=0;function schedule(force){clearTimeout(refreshTimer);refreshTimer=setTimeout(function(){refresh(Boolean(force))},120)}
window.TravelMatePlanLiveRouting=Object.freeze({refresh:refresh,collectPairs:collectPairs,buildBatches:buildBatches,providerMode:providerMode,getTransitions:function(){if(state.scope&&state.scope!==scopeKey(currentTrip()))invalidate();return state.transitions},getSnapshot:function(){if(state.scope&&state.scope!==scopeKey(currentTrip()))invalidate();return Object.freeze({tripId:state.tripId,updatedAt:state.updatedAt,transitions:state.transitions})}});
document.addEventListener('travelmate:planner-rendered',function(){schedule(false)});
window.addEventListener('travelmate:viewchange',function(event){if(event.detail&&event.detail.view==='plan')schedule(false)});
window.addEventListener('travelmate:account-context-changed',invalidate);
window.addEventListener('travelmate:canonical-trip-replaced',function(){invalidate();schedule(true)});
window.addEventListener('online',function(){schedule(true)});
function start(){schedule(false)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();

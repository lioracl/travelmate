(function(){
'use strict';
if(window.TravelMatePlanOpeningHours)return;
function helper(){return window.TravelMateOpeningHours||null}
function context(){return window.TravelMateTripContext||null}
function currentTrip(){var store=window.TravelMateTripStore,id=new URLSearchParams(location.search).get('id');return store&&store.getTrip?store.getTrip(id):null}
function hoursValue(record){return String(record&&(record.openingHours||record.opening_hours)||'').trim()}
function scheduleMode(record){var api=context();return api&&api.scheduleMode?api.scheduleMode(record):String(record&&record.scheduleMode||'planned')}
function localDateKey(value){var api=context();if(api&&api.localDateKey)return api.localDateKey(value);var d=value instanceof Date?value:new Date(value||Date.now());return[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
function localMoment(date,time){var dm=String(date||'').match(/^(\d{4})-(\d{2})-(\d{2})$/),tm=String(time||'').match(/^(\d{1,2}):(\d{2})$/);if(!dm||!tm)return null;var value=new Date(Number(dm[1]),Number(dm[2])-1,Number(dm[3]),Number(tm[1]),Number(tm[2]),0,0);return Number.isFinite(value.getTime())?value:null}
function arrivalMoment(record){var moment=localMoment(record&&record.date,record&&record.time);if(!moment)return null;var mode=scheduleMode(record),configured=Number(record&&record.arrivalBufferMinutes),buffer=mode==='fixed'?(Number.isFinite(configured)&&configured>=0?configured:10):0;moment.setMinutes(moment.getMinutes()-buffer);return moment}
function statusFor(record,today){
  var opening=helper(),hours=hoursValue(record),mode=scheduleMode(record);if(!opening||!hours||!record||record.done||mode==='flexible'||mode==='window')return null;
  if(today&&String(record.date||'')<String(today))return null;
  var arrival=arrivalMoment(record),start=localMoment(record.date,record.time);if(!arrival||!start)return null;var status=opening.statusAt(hours,arrival);if(!status||status.state==='unknown')return Object.freeze({state:'unknown',confidence:status&&status.confidence||'unknown'});
  if(status.state==='closed'&&arrival.getTime()!==start.getTime()){var startStatus=opening.statusAt(hours,start);if(startStatus&&startStatus.state==='open')status=startStatus}
  if(status.state==='closed')return Object.freeze({state:'closed',confidence:status.confidence||'parsed',at:start.toISOString(),source:'osm'});
  var duration=Math.max(0,Number(record.duration||0));if(duration>0){var finish=new Date(start.getTime()+Math.max(0,duration-1)*60000),finishStatus=opening.statusAt(hours,finish);if(finishStatus&&finishStatus.state==='closed'&&finishStatus.confidence==='parsed')return Object.freeze({state:'closing',confidence:'parsed',at:arrival.toISOString(),endsAt:finish.toISOString(),source:'osm'})}
  return Object.freeze({state:'open',confidence:status.confidence||'parsed',at:arrival.toISOString(),source:'osm'})
}
function buildStatuses(trip,now){var statuses=Object.create(null),today=localDateKey(now||new Date());if(!trip)return statuses;(trip.activities||[]).forEach(function(record){var status=statusFor(record,today);if(status)statuses['activity:'+String(record.id)]=status});(trip.savedPlaces||[]).forEach(function(record){var status=statusFor(record,today);if(status)statuses['place:'+String(record.id)]=status});return statuses}
function refresh(){if(document.body&&document.body.dataset.tripView!=='plan')return Object.create(null);var trip=currentTrip();if(!trip)return Object.create(null);var statuses=buildStatuses(trip,new Date());window.dispatchEvent(new CustomEvent('travelmate:plan-opening-hours',{detail:{tripId:String(trip.id||''),statuses:statuses,warningCount:Object.keys(statuses).filter(function(key){return statuses[key].state==='closed'||statuses[key].state==='closing'}).length}}));return statuses}
var scheduled=0;function schedule(){if(scheduled)return;scheduled=requestAnimationFrame(function(){scheduled=0;refresh()})}
window.TravelMatePlanOpeningHours=Object.freeze({hoursValue:hoursValue,localMoment:localMoment,arrivalMoment:arrivalMoment,statusFor:statusFor,buildStatuses:buildStatuses,refresh:refresh});
document.addEventListener('travelmate:planner-rendered',schedule);document.addEventListener('travelmate:places-updated',schedule);window.addEventListener('travelmate:viewchange',function(event){if(event.detail&&event.detail.view==='plan')schedule()});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule);else schedule();
})();

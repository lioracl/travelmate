(function(){
'use strict';
function localDateKey(value){
  var date=value instanceof Date?value:new Date(value||Date.now());
  return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-')
}
function minutes(value){
  var parts=String(value||'').split(':').map(Number);
  return Number.isFinite(parts[0])?parts[0]*60+(parts[1]||0):null
}
function scheduleMode(item){
  var raw=String(item&&(item.scheduleMode||item.timingMode||item.flexibility)||'').toLowerCase();
  if(raw==='fixed'||raw==='booked'||raw==='reservation')return'fixed';
  if(raw==='window'||raw==='time-window'||raw==='time_window')return'window';
  if(raw==='flexible'||raw==='free')return'flexible';
  return'planned'
}
function recordsForDate(trip,date){
  return (trip&&trip.activities||[]).map(function(item){return{kind:'activity',record:item}})
    .concat((trip&&trip.savedPlaces||[]).map(function(item){return{kind:'place',record:item}}))
    .filter(function(entry){return String(entry.record.date||'')===String(date||'')})
}
function explicitDayMode(trip,date){
  var value=String(trip&&trip.dayModes&&trip.dayModes[date]||'').toLowerCase();
  return value==='flexible'||value==='balanced'||value==='scheduled'?value:''
}
function dayMode(trip,date){
  var override=explicitDayMode(trip,date);
  if(override)return override;
  var records=recordsForDate(trip,date),explicit=records.filter(function(entry){return scheduleMode(entry.record)!=='planned'});
  if(!explicit.length)return'unclassified';
  var fixed=explicit.filter(function(entry){return scheduleMode(entry.record)==='fixed'}).length;
  var flexible=explicit.filter(function(entry){return scheduleMode(entry.record)==='flexible'}).length;
  if(fixed>=3||fixed/explicit.length>=.6)return'scheduled';
  if(!fixed&&flexible===explicit.length)return'flexible';
  return'balanced'
}
function nextFixedActivity(trip,now){
  var moment=now instanceof Date?now:new Date(now||Date.now()),today=localDateKey(moment),current=moment.getHours()*60+moment.getMinutes();
  return recordsForDate(trip,today).map(function(entry){
    var start=minutes(entry.record.time);
    return{kind:entry.kind,record:entry.record,start:start}
  }).filter(function(entry){
    return scheduleMode(entry.record)==='fixed'&&entry.start!==null&&entry.start>=current
  }).sort(function(a,b){return a.start-b.start})[0]||null
}
function availableMinutesUntilNextFixed(trip,now,bufferMinutes){
  var moment=now instanceof Date?now:new Date(now||Date.now()),next=nextFixedActivity(trip,moment);
  if(!next)return null;
  var current=moment.getHours()*60+moment.getMinutes();
  return Math.max(0,next.start-current-Number(bufferMinutes||30))
}
function buildNearbyRequest(options){
  options=options||{};var position=options.position||{},lat=Number(position.lat),lon=Number(position.lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lon))return null;
  var now=options.now instanceof Date?options.now:new Date(options.now||Date.now()),trip=options.trip||null;
  var available=Number.isFinite(Number(options.availableMinutes))?Number(options.availableMinutes):availableMinutesUntilNextFixed(trip,now,options.bufferMinutes);
  return Object.freeze({
    userInvoked:true,
    lat:lat,
    lon:lon,
    requestedAt:now.toISOString(),
    availableMinutes:available,
    mood:String(options.mood||'').trim(),
    categories:Array.isArray(options.categories)?options.categories.slice():[],
    nextFixedActivity:nextFixedActivity(trip,now),
    note:'Context only. This helper never requests geolocation, starts timers, or sends notifications.'
  })
}
window.TravelMateTripContext=Object.freeze({
  localDateKey:localDateKey,
  scheduleMode:scheduleMode,
  recordsForDate:recordsForDate,
  explicitDayMode:explicitDayMode,
  dayMode:dayMode,
  nextFixedActivity:nextFixedActivity,
  availableMinutesUntilNextFixed:availableMinutesUntilNextFixed,
  buildNearbyRequest:buildNearbyRequest
})
})();
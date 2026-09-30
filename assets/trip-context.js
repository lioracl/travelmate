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
function coordinates(record){
  var lat=Number(record&&(record.lat!==undefined?record.lat:record.latitude));
  var lon=Number(record&&(record.lon!==undefined?record.lon:record.lng!==undefined?record.lng:record.longitude));
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return null;
  return{lat:lat,lon:lon}
}
function distanceKm(first,second){
  var a=coordinates(first),b=coordinates(second);
  if(!a||!b)return null;
  var toRad=Math.PI/180,dLat=(b.lat-a.lat)*toRad,dLon=(b.lon-a.lon)*toRad;
  var lat1=a.lat*toRad,lat2=b.lat*toRad;
  var hav=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)*Math.sin(dLon/2);
  return 6371*2*Math.atan2(Math.sqrt(hav),Math.sqrt(Math.max(0,1-hav)))
}
function travelMode(record,distance){
  var raw=String(record&&(record.travelMode||record.transportMode)||'auto').toLowerCase();
  if(raw==='walk'||raw==='walking'||raw==='foot')return'walk';
  if(raw==='drive'||raw==='driving'||raw==='car')return'drive';
  if(raw==='transit'||raw==='public'||raw==='public_transport')return'transit';
  return Number(distance)<=1.4?'walk':'transit'
}
function estimateTravelMinutes(previous,next){
  var explicit=Number(next&&(next.travelMinutesBefore||next.transitionMinutes||next.travelMinutes));
  var distance=distanceKm(previous,next),mode=travelMode(next,distance);
  if(Number.isFinite(explicit)&&explicit>0){
    return Object.freeze({minutes:Math.max(1,Math.round(explicit)),mode:mode,source:'manual',distanceKm:distance})
  }
  if(distance===null)return null;
  var routeDistance=Math.max(.05,distance*1.25),speed=mode==='walk'?4.5:mode==='drive'?24:16,overhead=mode==='walk'?2:mode==='drive'?5:8;
  var estimated=Math.max(3,Math.ceil(routeDistance/speed*60+overhead));
  return Object.freeze({minutes:estimated,mode:mode,source:'estimate',distanceKm:distance})
}
function clockTime(totalMinutes){
  if(!Number.isFinite(Number(totalMinutes))||Number(totalMinutes)<0)return'';
  var total=Math.round(Number(totalMinutes)),hours=Math.floor(total/60)%24,mins=total%60;
  return String(hours).padStart(2,'0')+':'+String(mins).padStart(2,'0')
}
function transitionAssessment(previous,next,options){
  options=options||{};
  var previousStart=minutes(previous&&previous.time),nextStart=minutes(next&&next.time);
  if(previousStart===null||nextStart===null)return null;
  var duration=Math.max(0,Number(previous&&previous.duration||60));
  var gap=nextStart-(previousStart+duration);
  var estimate=estimateTravelMinutes(previous,next);
  if(!estimate)return null;
  var configured=Number(next&&next.arrivalBufferMinutes),buffer=Number.isFinite(configured)&&configured>=0?configured:Number.isFinite(Number(options.bufferMinutes))?Math.max(0,Number(options.bufferMinutes)):10;
  var required=estimate.minutes+buffer,shortfall=Math.max(0,required-gap),leaveBy=nextStart-required;
  return Object.freeze({
    gapMinutes:gap,
    travelMinutes:estimate.minutes,
    bufferMinutes:buffer,
    requiredMinutes:required,
    shortfallMinutes:shortfall,
    latestDepartureTime:clockTime(leaveBy),
    risk:gap>=0&&shortfall>0,
    overlap:gap<0,
    mode:estimate.mode,
    source:estimate.source,
    distanceKm:estimate.distanceKm
  })
}
function transitionAssessmentsForDate(trip,date,options){
  var entries=recordsForDate(trip,date).map(function(entry){
    return{kind:entry.kind,record:entry.record,start:minutes(entry.record.time)}
  }).filter(function(entry){
    var mode=scheduleMode(entry.record);
    return entry.start!==null&&mode!=='flexible'&&mode!=='window'
  }).sort(function(a,b){return a.start-b.start});
  var map=Object.create(null);
  for(var index=1;index<entries.length;index+=1){
    var previous=entries[index-1],next=entries[index],assessment=transitionAssessment(previous.record,next.record,options);
    if(!assessment||assessment.overlap)continue;
    map[next.kind+':'+String(next.record.id)]=Object.freeze({
      fromKind:previous.kind,
      fromId:String(previous.record.id),
      fromTitle:String(previous.record.title||previous.record.name||'הפעילות הקודמת'),
      toKind:next.kind,
      toId:String(next.record.id),
      gapMinutes:assessment.gapMinutes,
      travelMinutes:assessment.travelMinutes,
      bufferMinutes:assessment.bufferMinutes,
      requiredMinutes:assessment.requiredMinutes,
      shortfallMinutes:assessment.shortfallMinutes,
      latestDepartureTime:assessment.latestDepartureTime,
      risk:assessment.risk,
      mode:assessment.mode,
      source:assessment.source,
      distanceKm:assessment.distanceKm
    })
  }
  return map
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
function estimateNearbyVisitMinutes(place){
  var value=String(place&&(place.category||place.type)||'').toLowerCase();
  if(/cafe|coffee|bakery|קפה|מאפ/.test(value))return 35;
  if(/restaurant|food|מסעד|אוכל/.test(value))return 60;
  if(/supermarket|market|shop|mall|shopping|סופר|שוק|קניון|קניות/.test(value))return 45;
  if(/museum|gallery|מוזיא|גלר/.test(value))return 75;
  if(/park|garden|view|historic|attraction|tourism|פארק|גן|תצפ|היסטור|אטרק/.test(value))return 60;
  return 50
}
function contextualNearbyFit(place,request){
  request=request||{};
  if(!request.userInvoked)return null;
  var origin={lat:Number(request.lat),lon:Number(request.lon)},distanceMeters=Number(place&&place.distance);
  var distance=Number.isFinite(distanceMeters)&&distanceMeters>=0?distanceMeters/1000:distanceKm(origin,place);
  if(distance===null||!Number.isFinite(distance))return null;
  var toPlace=estimateTravelMinutes(origin,Object.assign({},place||{},{travelMode:place&&place.travelMode||'auto'}));
  if(!toPlace)return null;
  var visitMinutes=estimateNearbyVisitMinutes(place),onwardMinutes=0;
  var next=request.nextFixedActivity&&request.nextFixedActivity.record;
  if(next){
    var onward=estimateTravelMinutes(place,next);
    onwardMinutes=onward?onward.minutes:Math.max(10,toPlace.minutes)
  }
  var totalMinutes=toPlace.minutes+visitMinutes+onwardMinutes;
  var available=Number(request.availableMinutes),hasLimit=Number.isFinite(available)&&available>=0;
  var slack=hasLimit?available-totalMinutes:null,fit=!hasLimit||slack>=0;
  var score=(fit?1000:0)-toPlace.minutes*3-distance*12-Math.max(0,visitMinutes-45)-(hasLimit?Math.abs(slack)*.12:0);
  return Object.freeze({
    fit:fit,
    score:Math.round(score*10)/10,
    distanceKm:distance,
    travelMinutes:toPlace.minutes,
    visitMinutes:visitMinutes,
    onwardMinutes:onwardMinutes,
    totalMinutes:totalMinutes,
    availableMinutes:hasLimit?available:null,
    slackMinutes:slack
  })
}
function contextualRadiusMeters(availableMinutes){
  var minutesAvailable=Number(availableMinutes);
  if(!Number.isFinite(minutesAvailable)||minutesAvailable<=0)return 800;
  if(minutesAvailable<=45)return 800;
  if(minutesAvailable<=90)return 1200;
  if(minutesAvailable<=180)return 2000;
  return 3000
}
function freeTimeWindow(trip,now,options){
  options=options||{};
  var moment=now instanceof Date?now:new Date(now||Date.now());
  var today=localDateKey(moment),start=String(trip&&trip.start||''),end=String(trip&&trip.end||'');
  if(!trip||!start||!end||today<start||today>end)return null;
  var buffer=Number.isFinite(Number(options.bufferMinutes))?Math.max(0,Number(options.bufferMinutes)):30;
  var next=nextFixedActivity(trip,moment),available=next?availableMinutesUntilNextFixed(trip,moment,buffer):null;
  return Object.freeze({
    date:today,
    availableMinutes:available,
    bufferMinutes:buffer,
    nextFixedActivity:next,
    radiusMeters:contextualRadiusMeters(available),
    openEnded:!next
  })
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
    radiusMeters:contextualRadiusMeters(available),
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
  coordinates:coordinates,
  distanceKm:distanceKm,
  estimateTravelMinutes:estimateTravelMinutes,
  clockTime:clockTime,
  transitionAssessment:transitionAssessment,
  transitionAssessmentsForDate:transitionAssessmentsForDate,
  nextFixedActivity:nextFixedActivity,
  availableMinutesUntilNextFixed:availableMinutesUntilNextFixed,
  estimateNearbyVisitMinutes:estimateNearbyVisitMinutes,
  contextualNearbyFit:contextualNearbyFit,
  contextualRadiusMeters:contextualRadiusMeters,
  freeTimeWindow:freeTimeWindow,
  buildNearbyRequest:buildNearbyRequest
})
})();
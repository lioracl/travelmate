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
function freeTimeWindowsForDate(trip,date,options){
  options=options||{};
  var dayStart=minutes(options.startTime||'09:00'),dayEnd=minutes(options.endTime||'22:00');
  var minimum=Math.max(15,Number(options.minimumMinutes||45));
  var buffer=Number.isFinite(Number(options.bufferMinutes))?Math.max(0,Number(options.bufferMinutes)):10;
  if(dayStart===null||dayEnd===null||dayEnd<=dayStart)return[];
  var entries=recordsForDate(trip,date).map(function(entry){
    var start=minutes(entry.record.time),mode=scheduleMode(entry.record);
    return{kind:entry.kind,record:entry.record,start:start,end:start===null?null:start+Math.max(0,Number(entry.record.duration||60)),mode:mode}
  }).filter(function(entry){
    return entry.start!==null&&entry.mode!=='flexible'&&entry.mode!=='window'
  }).sort(function(a,b){return a.start-b.start});
  var windows=[],cursor=dayStart,previous=null;
  entries.forEach(function(entry){
    if(entry.end<=dayStart||entry.start>=dayEnd)return;
    var gapEnd=Math.min(entry.start,dayEnd);
    if(previous){
      var assessment=transitionAssessment(previous.record,entry.record,{bufferMinutes:buffer});
      if(assessment&&!assessment.overlap)gapEnd=Math.min(gapEnd,entry.start-assessment.requiredMinutes)
    }
    var start=Math.max(cursor,dayStart),duration=gapEnd-start;
    if(duration>=minimum){
      windows.push(Object.freeze({
        date:String(date||''),
        startTime:clockTime(start),
        endTime:clockTime(gapEnd),
        durationMinutes:Math.round(duration),
        beforeId:previous?String(previous.record.id||''):'',
        afterId:String(entry.record.id||'')
      }))
    }
    cursor=Math.max(cursor,entry.end);
    previous=entry
  });
  var tailStart=Math.max(cursor,dayStart),tailDuration=dayEnd-tailStart;
  if(tailDuration>=minimum){
    windows.push(Object.freeze({
      date:String(date||''),
      startTime:clockTime(tailStart),
      endTime:clockTime(dayEnd),
      durationMinutes:Math.round(tailDuration),
      beforeId:previous?String(previous.record.id||''):'',
      afterId:''
    }))
  }
  return windows
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
function clampNearbyDuration(value){
  var duration=Number(value);
  if(!Number.isFinite(duration))return null;
  return Math.min(360,Math.max(0,Math.round(duration)))
}
function durationNumber(value){
  var numbers={one:1,two:2,three:3,four:4,five:5,six:6,'אחת':1,'אחד':1,'שתי':2,'שני':2,'שלוש':3,'שלושה':3,'ארבע':4,'ארבעה':4,'חמש':5,'חמישה':5,'שש':6,'שישה':6};
  var normalized=String(value||'').toLowerCase();
  return Object.prototype.hasOwnProperty.call(numbers,normalized)?numbers[normalized]:Number(normalized)
}
function parseNearbyDuration(value){
  var text=String(value||'').toLowerCase().replace(/[–—]/g,'-').replace(/\s+/g,' ').trim(),match,amount;
  if(!text)return null;
  if(/(?:half\s+(?:an?\s+)?hour|חצי\s+שעה)/.test(text))return 30;
  if(/(?:an?|one)\s+hour\s+and\s+(?:a\s+)?half/.test(text)||/שעה\s+וחצי/.test(text))return 90;
  if(/שעתיים\s+וחצי/.test(text))return 150;
  if(/שעה\s+ורבע/.test(text))return 75;
  match=text.match(/(\d+(?:[.,]\d+)?|one|two|three|four|five|six)\s*(?:and\s+(?:a\s+)?half\s*)?(?:hours?|hrs?|h)\b/);
  if(match){amount=durationNumber(match[1].replace(',','.'))+(/and\s+(?:a\s+)?half/.test(match[0])?.5:0);return clampNearbyDuration(amount*60)}
  match=text.match(/(\d+(?:[.,]\d+)?|one|two|three|four|five|six)\s*(?:minutes?|mins?|min|m)\b/);
  if(match)return clampNearbyDuration(durationNumber(match[1].replace(',','.')));
  if(/(?:^|\s)(?:(?:an?|one)\s+hour|(?:the\s+)?next\s+hour)(?:\s|$)/.test(text)||/(?:^|\s)שעה(?:\s|$)|בשעה\s+הקרובה/.test(text))return 60;
  if(/שעתיים/.test(text))return 120;
  match=text.match(/(\d+(?:[.,]\d+)?|אחת|אחד|שתי|שני|שלוש|שלושה|ארבע|ארבעה|חמש|חמישה|שש|שישה)\s*(?:שעה|שעות)(?:\s+וחצי)?/);
  if(match){amount=durationNumber(match[1].replace(',','.'))+(/וחצי/.test(match[0])?.5:0);return clampNearbyDuration(amount*60)}
  match=text.match(/(\d+(?:[.,]\d+)?|אחת|אחד|שתי|שני|שלוש|שלושה|ארבע|ארבעה|חמש|חמישה|שש|שישה)\s*(?:דקה|דקות)/);
  if(match)return clampNearbyDuration(durationNumber(match[1].replace(',','.')));
  return null
}
function parseMateNearbyIntent(value){
  var text=String(value||'').toLowerCase().replace(/[׳״]/g,"'").replace(/\s+/g,' ').trim();
  if(!text)return null;
  var metaOrNegated=/(?:\b(?:do\s+not|don't|dont|never)\s+(?:find|show|suggest|recommend)\b|\b(?:translate|rewrite|summari[sz]e|explain|define)\b|\bwrite\s+(?:(?:a|an|the)\s+)?(?:poem|story|sentence|prompt|message)\b|\bfind\s+the\s+(?:word|phrase)\b|אל\s+(?:תציע|תמליץ|תמצא|תמצאי)|בלי\s+(?:להציע|להמליץ|למצוא)|תרג(?:ם|מי)|תסביר|הסבר|נסח|נסחי|כתוב\s+(?:שיר|סיפור|משפט|פרומפט)|כתבי\s+(?:שיר|סיפור|משפט|פרומפט)|מצא\s+את\s+(?:המילה|הביטוי))/i.test(text);
  if(metaOrNegated)return null;
  var nearby=/(?:\bnearby\b|\bnear\s+(?:me|us)\b|\bclose\s+by\b|\baround\s+(?:me|here)\b|\bin\s+(?:my|the)\s+area\b|לידי|לידינו|בסביבה|בסביבתי|סביבי|קרוב\s+אלי|קרוב\s+אליי|קרוב\s+אלינו|באזור\s+שלי)/i.test(text);
  var discovery=/(?:\b(?:something|anything|things?)\s+to\s+do\b|\bwhat\s+(?:can|could|should)\s+(?:i|we)\s+do\b|\bwhere\s+(?:can|could|should)\s+(?:i|we)\s+go\b|\b(?:free|spare)\s+time\b|\b(?:find|suggest|recommend)\s+(?:(?:me|us)\s+)?(?:a\s+|some\s+)?(?:nearby\s+)?(?:place|activity|restaurant|cafe|coffee|food|museum|attraction|thing|something|anything)\b|\b(?:places?|activities|restaurants?|cafes?|coffee|food|museums?|attractions?)\s+(?:nearby|near\s+(?:me|us)|around\s+(?:me|here)|in\s+(?:my|the)\s+area)\b|מה\s+(?:(?:אפשר|כדאי|יש)\s+)?לעשות|מה\s+יש\s+בסביבה|משהו\s+לעשות|לאן\s+(?:אפשר|כדאי|נלך|ללכת)|זמן\s+פנוי|(?:מצא|מצאי|תמצא|תמצאי|הצע|הציעי|תציע|המלץ|המלצי|תמליץ)\s+(?:לי\s+|לנו\s+)?(?:מקום|פעילות|מסעדה|בית\s+קפה|קפה|אוכל|מוזיאון|אטרקציה|בילוי)|(?:מקומות?|פעילויות?|מסעדות?|(?:בית|בתי)\s+קפה|אוכל|מוזיאונים?|אטרקציות?|בילוי)\s+(?:לידי|לידינו|בסביבה|בסביבתי|סביבי|קרוב\s+אלי|קרוב\s+אליי|קרוב\s+אלינו|באזור\s+שלי))/i.test(text);
  if(!nearby||!discovery)return null;
  return Object.freeze({userInvoked:true,availableMinutes:parseNearbyDuration(text),source:'mate'})
}
function buildNearbyRequest(options){
  options=options||{};var position=options.position||{},lat=Number(position.lat),lon=Number(position.lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lon))return null;
  var now=options.now instanceof Date?options.now:new Date(options.now||Date.now()),trip=options.trip||null;
  var untilFixed=availableMinutesUntilNextFixed(trip,now,options.bufferMinutes),available=Number.isFinite(Number(options.availableMinutes))?Number(options.availableMinutes):untilFixed;
  if(untilFixed!==null&&Number.isFinite(Number(untilFixed))&&Number.isFinite(Number(available)))available=Math.min(Number(available),Number(untilFixed));
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
  coordinates:coordinates,
  distanceKm:distanceKm,
  estimateTravelMinutes:estimateTravelMinutes,
  clockTime:clockTime,
  transitionAssessment:transitionAssessment,
  transitionAssessmentsForDate:transitionAssessmentsForDate,
  freeTimeWindowsForDate:freeTimeWindowsForDate,
  nextFixedActivity:nextFixedActivity,
  availableMinutesUntilNextFixed:availableMinutesUntilNextFixed,
  clampNearbyDuration:clampNearbyDuration,
  parseNearbyDuration:parseNearbyDuration,
  parseMateNearbyIntent:parseMateNearbyIntent,
  buildNearbyRequest:buildNearbyRequest
})
})();

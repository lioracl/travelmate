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
  var rawLat=record&&(record.lat!==undefined?record.lat:record.latitude),rawLon=record&&(record.lon!==undefined?record.lon:record.lng!==undefined?record.lng:record.longitude);
  if(rawLat===null||rawLat===undefined||rawLon===null||rawLon===undefined||String(rawLat).trim()===''||String(rawLon).trim()==='')return null;
  var lat=Number(rawLat),lon=Number(rawLon);
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
var nearbyPreferencePresets=Object.freeze({
  food:Object.freeze({key:'food',label:'אוכל',categories:Object.freeze(['restaurants'])}),
  coffee:Object.freeze({key:'coffee',label:'קפה',categories:Object.freeze(['cafes'])}),
  quiet:Object.freeze({key:'quiet',label:'שקט',categories:Object.freeze(['parks','museums'])}),
  culture:Object.freeze({key:'culture',label:'תרבות',categories:Object.freeze(['museums','historic'])}),
  view:Object.freeze({key:'view',label:'נוף ותצפית',categories:Object.freeze(['viewpoints'])}),
  shopping:Object.freeze({key:'shopping',label:'קניות',categories:Object.freeze(['malls','markets','clothing'])})
});
function nearbyPreferencePreset(value){
  var text=String(value||'').toLowerCase().replace(/[׳״]/g,"'").replace(/\s+/g,' ').trim(),key=nearbyPreferencePresets[text]?text:'';
  if(!key&&/(?:\b(?:coffee|cafe|café)\b|קפה)/i.test(text))key='coffee';
  else if(!key&&/(?:\b(?:food|restaurant|meal|eat|dinner|lunch|breakfast)\b|אוכל|מסעד)/i.test(text))key='food';
  else if(!key&&/(?:\b(?:quiet|calm|peaceful|relax|relaxing)\b|שקט|רגוע|רגועה|להירגע)/i.test(text))key='quiet';
  else if(!key&&/(?:\b(?:culture|cultural|museum|gallery|historic|history)\b|תרבות|מוזיא|גלרי|היסטור)/i.test(text))key='culture';
  else if(!key&&/(?:\b(?:view|viewpoint|scenic|panorama|lookout)\b|תצפית|נוף|נופי|פנורמ)/i.test(text))key='view';
  else if(!key&&/(?:\b(?:shopping|shop|mall|market)\b|קניות|קניון|שוק)/i.test(text))key='shopping';
  var preset=nearbyPreferencePresets[key];return preset?Object.freeze({key:preset.key,label:preset.label,categories:preset.categories.slice()}):null
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
  var metaOrNegated=/(?:\b(?:do\s+not|don't|dont|never)\s+(?:find|show|suggest|recommend)\b|\b(?:do\s+not|don't|dont)\s+(?:want|need|build|make)\b|\b(?:would\s+rather|rather)\s+not\b|\bnot\s+looking\s+for\b|\bno\s+(?:coffee|cafe|food|restaurant|shopping|museum|view|quiet)\b|\bavoid\s+(?:finding|showing|suggesting|recommending)?\b|\b(?:translate|rewrite|summari[sz]e|explain|define)\b|\b(?:wording|phrasing|phrase|prompt)\b|\bwrite\s+(?:(?:a|an|the)\s+)?(?:poem|story|sentence|prompt|message)\b|\bfind\s+the\s+(?:word|phrase)\b|אל\s+(?:תציע|תמליץ|תמצא|תמצאי|תראה|תציג)|בלי\s+(?:להציע|להמליץ|למצוא)|לא\s+(?:רוצה|רוצים|רוצות|מחפש|מחפשת|מחפשים|מחפשות|בא\s+לי)|אין\s+לי\s+חשק|תרג(?:ם|מי)|תסביר|הסבר|נסח|נסחי|ניסוח|כתוב\s+(?:שיר|סיפור|משפט|פרומפט)|כתבי\s+(?:שיר|סיפור|משפט|פרומפט)|מצא\s+את\s+(?:המילה|הביטוי))/i.test(text);
  if(metaOrNegated)return null;
  var preference=nearbyPreferencePreset(text);
  var negativePreference=/(?:\b(?:(?:do|does|did)\s+not|don't|doesn't|didn't|dont|doesnt|didnt|would\s+rather\s+not|rather\s+not|not)\s+(?:really\s+)?(?:want|need|feel\s+like|look(?:ing)?\s+for|get|grab)\b|\b(?:no|without)\s+(?:coffee|cafe|food|restaurant|shopping|museum|view|quiet)\b|(?:לא|אל)\s+(?:בא\s+לי|מתחשק\s+לי|רוצה|רוצים|רוצות|מחפש|מחפשת|מחפשים|מחפשות)|אין\s+לי\s+חשק)/i.test(text);
  if(preference&&negativePreference)return null;
  var nearby=/(?:\bnearby\b|\bnear\s+(?:me|us)\b|\bclose\s+by\b|\baround\s+(?:me|here)\b|\bin\s+(?:my|the)\s+area\b|לידי|לידינו|בסביבה|בסביבתי|סביבי|קרוב\s+אלי|קרוב\s+אליי|קרוב\s+אלינו|באזור\s+שלי|מקומות?\s+קרוב(?:ים|ות)?)/i.test(text);
  var discovery=/(?:\b(?:something|anything|things?)\s+to\s+do\b|\bwhat\s+(?:can|could|should)\s+(?:i|we)\s+do\b|\bwhere\s+(?:can|could|should)\s+(?:i|we)\s+go\b|\b(?:free|spare)\s+time\b|\b(?:find|suggest|recommend)\s+(?:(?:me|us)\s+)?(?:a\s+|some\s+)?(?:nearby\s+)?(?:place|activity|restaurant|cafe|coffee|food|museum|attraction|thing|something|anything)\b|\b(?:places?|activities|restaurants?|cafes?|coffee|food|museums?|attractions?)\s+(?:nearby|near\s+(?:me|us)|around\s+(?:me|here)|in\s+(?:my|the)\s+area)\b|מה\s+(?:(?:אפשר|כדאי|יש)\s+)?לעשות|מה\s+יש\s+בסביבה|משהו\s+לעשות|לאן\s+(?:אפשר|כדאי|נלך|ללכת)|זמן\s+פנוי|(?:מצא|מצאי|תמצא|תמצאי|הצע|הציעי|תציע|המלץ|המלצי|תמליץ)\s+(?:לי\s+|לנו\s+)?(?:מקום|פעילות|מסעדה|בית\s+קפה|קפה|אוכל|מוזיאון|אטרקציה|בילוי)|(?:מקומות?|פעילויות?|מסעדות?|(?:בית|בתי)\s+קפה|אוכל|מוזיאונים?|אטרקציות?|בילוי)\s+(?:לידי|לידינו|בסביבה|בסביבתי|סביבי|קרוב\s+אלי|קרוב\s+אליי|קרוב\s+אלינו|באזור\s+שלי))/i.test(text);
  var preferenceRequest=/(?:\b(?:want|wanna|need|looking\s+for|find|show|suggest|recommend|get|grab|feel\s+like)\b|רוצה|רוצים|רוצות|מחפש|מחפשת|מחפשים|מחפשות|בא\s+לי|מתחשק|יש\s+לי\s+חשק|תמצא|תמצאי|תציע|תמליץ|המלץ|המלצי)/i.test(text);
  var routeStops=requestedMiniRouteStops(text),routeRequest=routeStops>0&&/(?:\b(?:find|show|suggest|recommend|give|build|make|want|need|looking\s+for)\b|(?:תן|תני|מצא|מצאי|תמצא|תמצאי|הצע|הציעי|תציע|בנה|בני|רוצה|מחפש|מחפשת)\s*(?:לי|לנו)?)/i.test(text);
  if(routeStops&&!routeRequest)routeStops=0;
  discovery=discovery||Boolean(preference&&preferenceRequest)||routeRequest;
  if(!nearby||!discovery)return null;
  return Object.freeze({userInvoked:true,availableMinutes:parseNearbyDuration(text),mood:preference?preference.key:'',categories:preference?preference.categories.slice():[],miniRoute:routeStops>0,routeStops:routeStops,source:'mate'})
}
function requestedMiniRouteStops(value){
  var text=String(value||'').toLowerCase().replace(/[–—]/g,'-').replace(/\s+/g,' ').trim();
  var route=/(?:\bmini[- ]?route\b|\bshort\s+(?:walking\s+)?route\b|\b(?:2|3|two|three)\s*(?:-|or|to)?\s*(?:3|three)?\s+(?:nearby\s+)?(?:places?|stops?)\b|\b(?:places?|stops?)\s+(?:in\s+)?(?:a\s+)?(?:row|sequence)\b|מסלול\s+קצר|(?:2|3)\s*-\s*3\s+מקומות?|שני(?:ים)?\s*-\s*שלושה\s+מקומות?|(?:2|3|שני(?:ים)?|שתי|שלוש(?:ה)?)\s+(?:מקומות?|תחנות?)|מקומות?\s+ברצף)/i.test(text);
  if(!route)return 0;
  var twoOnly=/(?:\b(?:2|two)\s+(?:nearby\s+)?(?:places?|stops?)\b|(?:שני(?:ים)?|שתי)\s+(?:מקומות?|תחנות?))/i.test(text)&&!/(?:\b(?:3|three)\b|שלוש(?:ה)?)/i.test(text);
  return twoOnly?2:3
}
function buildMiniRoute(places,request){
  request=request||{};var available=Number(request.availableMinutes),target=Math.min(3,Math.max(2,Math.round(Number(request.routeStops||3)))),origin={lat:Number(request.lat),lon:Number(request.lon)};
  if(!Number.isFinite(available)||available<60||!coordinates(origin))return null;
  var pool=(Array.isArray(places)?places:[]).filter(function(place){return coordinates(place)}).slice(0,6),next=request.nextFixedActivity&&request.nextFixedActivity.record;
  function evaluate(sequence){var previous=origin,legs=[],travel=0;for(var i=0;i<sequence.length;i+=1){var leg=estimateTravelMinutes(previous,sequence[i]);if(!leg)return null;legs.push(leg.minutes);travel+=leg.minutes;previous=sequence[i]}var onward=next?estimateTravelMinutes(previous,next):null,onwardMinutes=onward?Number(onward.minutes||0):0,visitBudget=available-travel-onwardMinutes,visit=Math.min(45,Math.floor((visitBudget/sequence.length)/5)*5);if(visit<30)return null;var total=travel+onwardMinutes+visit*sequence.length;return{sequence:sequence.slice(),legs:legs,onwardMinutes:onwardMinutes,visitMinutes:visit,totalTravelMinutes:travel+onwardMinutes,totalEstimatedMinutes:total,score:travel+onwardMinutes}}
  function bestFor(count){var best=null,used=new Array(pool.length).fill(false),sequence=[];function walk(){if(sequence.length===count){var candidate=evaluate(sequence);if(candidate&&(!best||candidate.score<best.score||candidate.score===best.score&&candidate.totalEstimatedMinutes<best.totalEstimatedMinutes))best=candidate;return}for(var i=0;i<pool.length;i+=1){if(used[i])continue;used[i]=true;sequence.push(pool[i]);walk();sequence.pop();used[i]=false}}walk();return best}
  for(var count=target;count>=2;count-=1){var best=bestFor(count);if(!best)continue;return Object.freeze({stops:Object.freeze(best.sequence.map(function(place,index){return Object.freeze({place:place,travelMinutes:best.legs[index],visitMinutes:best.visitMinutes})})),onwardMinutes:best.onwardMinutes,totalTravelMinutes:best.totalTravelMinutes,totalVisitMinutes:best.visitMinutes*count,totalEstimatedMinutes:best.totalEstimatedMinutes,availableMinutes:available,requestedStops:target})}
  return null
}
function buildNearbyRequest(options){
  options=options||{};var position=options.position||{},lat=Number(position.lat),lon=Number(position.lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lon))return null;
  var now=options.now instanceof Date?options.now:new Date(options.now||Date.now()),trip=options.trip||null,miniRoute=Boolean(options.miniRoute),routeStops=miniRoute?Math.min(3,Math.max(2,Math.round(Number(options.routeStops||3)))):0;
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
    miniRoute:miniRoute,
    routeStops:routeStops,
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
  nearbyPreferencePreset:nearbyPreferencePreset,
  requestedMiniRouteStops:requestedMiniRouteStops,
  parseMateNearbyIntent:parseMateNearbyIntent,
  buildNearbyRequest:buildNearbyRequest,
  buildMiniRoute:buildMiniRoute
})
})();

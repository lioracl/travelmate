(function(){
'use strict';
var scheduled=0,observer=null,preparedDays=Object.create(null);
function context(){return window.TravelMateTripContext||null}
function currentTrip(){
  var store=window.TravelMateTripStore,id=new URLSearchParams(location.search).get('id');
  return store&&store.getTrip?store.getTrip(id):null
}
function localDateKey(value){
  var helper=context();
  if(helper&&helper.localDateKey)return helper.localDateKey(value);
  var date=value instanceof Date?value:new Date(value||Date.now());
  return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-')
}
function recordFor(row,trip){
  if(!trip)return null;
  if(row.matches('.saved-place'))return (trip.savedPlaces||[]).find(function(item){return String(item.id)===String(row.dataset.savedPlaceId)});
  return (trip.activities||[]).find(function(item){return String(item.id)===String(row.dataset.activityId)})
}
function recordKind(row){return row.matches('.saved-place')?'place':'activity'}
function safeUrl(value){
  var raw=String(value||'').trim();if(!raw)return'';
  try{var url=new URL(raw,location.href);return /^https?:$/.test(url.protocol)?url.href:''}catch(error){return''}
}
function navigationUrl(record,trip){
  if(!record)return'';
  var direct=safeUrl(record.maps||record.googleMapsUrl||record.directionsUrl);
  if(direct)return direct;
  var lat=Number(record.lat),lon=Number(record.lon),destination='';
  if(Number.isFinite(lat)&&Number.isFinite(lon))destination=lat+','+lon;
  else destination=[record.address,record.locationName,record.name||record.title,trip&&trip.city,trip&&trip.country].filter(Boolean).join(', ');
  return destination?'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(destination):''
}
function scheduleMode(record){
  var helper=context();return helper&&helper.scheduleMode?helper.scheduleMode(record):'planned'
}
function dayMode(trip,date){
  var helper=context();return helper&&helper.dayMode?helper.dayMode(trip,date):'unclassified'
}
function dayModeLabel(mode){
  return mode==='scheduled'?'יום מתוזמן':mode==='balanced'?'יום מאוזן':mode==='flexible'?'יום גמיש':''
}
function dayModeOverride(trip,date){
  var helper=context();return helper&&helper.explicitDayMode?helper.explicitDayMode(trip,date):''
}
function saveDayMode(trip,date,value){
  if(!trip||!date)return;
  trip.dayModes=Object.assign({},trip.dayModes||{});
  if(value==='auto')delete trip.dayModes[date];else trip.dayModes[date]=value;
  var store=window.TravelMateTripStore;
  if(store&&store.saveTrip)store.saveTrip(trip);
  schedule()
}
function ensureToolbar(plan,trip){
  var toolbar=plan.querySelector('.planner-toolbar'),actions=toolbar&&toolbar.querySelector('.planner-toolbar-actions');
  if(!toolbar||!actions||toolbar.dataset.planUxToolbar==='true')return;
  toolbar.dataset.planUxToolbar='true';
  var add=actions.querySelector('[data-new-activity]');if(add)add.classList.add('primary');
  var calendar=actions.querySelector('[data-open-trip-calendar]'),more=actions.querySelector('.planner-more'),menu=more&&more.querySelector('.planner-more-menu');
  if(calendar){calendar.classList.remove('primary');if(menu)menu.insertBefore(calendar,menu.firstChild)}
  var today=document.createElement('button');today.type='button';today.className='planner-action';today.dataset.planJumpToday='';
  today.innerHTML='<i class="fa-solid fa-location-crosshairs" aria-hidden="true"></i><span>היום</span>';
  if(more)actions.insertBefore(today,more);else actions.appendChild(today);
  var key=localDateKey(new Date()),hasToday=Boolean(trip&&String(trip.start||'')<=key&&String(trip.end||'')>=key);
  today.disabled=!hasToday;today.title=hasToday?'מעבר ליום הנוכחי בטיול':'הטיול אינו מתקיים היום';
  today.addEventListener('click',function(){
    var card=plan.querySelector('.generated-day[data-day-date="'+key+'"]');
    if(!card)return;
    if(card.classList.contains('day-collapsed')){var badge=card.querySelector('.badge');if(badge)badge.click()}
    card.scrollIntoView({behavior:'smooth',block:'start'})
  })
}
function makeToggle(row,actions){
  var button=actions.querySelector('[data-plan-details-toggle]');if(button)return button;
  button=document.createElement('button');button.type='button';button.className='tm-plan-details-toggle';button.dataset.planDetailsToggle='';
  button.setAttribute('aria-expanded','false');button.setAttribute('aria-label','פתיחת כל פרטי הפעילות');
  button.innerHTML='<i class="fa-solid fa-chevron-down" aria-hidden="true"></i><span>פרטים</span>';
  actions.appendChild(button);return button
}
function makeNavigation(actions,record,trip){
  if(actions.querySelector('.tm-plan-nav-action'))return;
  var href=navigationUrl(record,trip);if(!href)return;
  var link=document.createElement('a');link.className='tm-plan-nav-action';link.href=href;link.target='_blank';link.rel='noopener noreferrer';
  link.setAttribute('aria-label','ניווט אל '+String(record&&record.name||record&&record.title||'הפעילות'));
  link.innerHTML='<i class="fa-solid fa-route" aria-hidden="true"></i><span>ניווט</span>';
  actions.insertBefore(link,actions.firstChild)
}
function syncDone(row){
  var button=row.querySelector('[data-toggle-done],[data-toggle-saved-done]');if(!button)return;
  var done=row.classList.contains('done');button.setAttribute('aria-pressed',String(done));
  button.setAttribute('aria-label',done?'סומן כהושלם. לחיצה תחזיר למתוכנן':'סימון כהושלם')
}
function makeActivityMedia(row,record){
  if(row.matches('.saved-place')||row.querySelector('.tm-plan-activity-media'))return;
  var media=document.createElement('span');media.className='tm-plan-activity-media';
  var image=safeUrl(record&&record.image);
  if(image){
    var img=document.createElement('img');img.src=image;img.alt='תמונה של '+String(record.title||'הפעילות');img.loading='lazy';
    img.addEventListener('error',function(){media.classList.add('tm-plan-image-placeholder');media.innerHTML='<i class="fa-solid fa-location-dot" aria-hidden="true"></i>'});
    media.appendChild(img)
  }else{
    media.classList.add('tm-plan-image-placeholder');media.innerHTML='<i class="fa-solid fa-location-dot" aria-hidden="true"></i>'
  }
  var copy=row.querySelector('.activity-copy');if(copy)row.insertBefore(media,copy)
}
function addLocation(row,record){
  var host=row.querySelector('.activity-copy,.saved-place-content');if(!host||host.querySelector('.tm-plan-location'))return;
  var value=String(record&&(record.address||record.locationName)||'').trim();if(!value)return;
  var line=document.createElement('span');line.className='tm-plan-location';
  line.innerHTML='<i class="fa-solid fa-location-dot" aria-hidden="true"></i><span></span>';line.querySelector('span').textContent=value;
  var strong=host.querySelector('strong,h3');if(strong&&strong.nextSibling)host.insertBefore(line,strong.nextSibling);else host.appendChild(line)
}
function detailRow(icon,text){
  var p=document.createElement('p');p.innerHTML='<i class="'+icon+'" aria-hidden="true"></i><span></span>';p.querySelector('span').textContent=text;return p
}
function detailLink(icon,label,href){
  var a=document.createElement('a');a.href=href;a.target='_blank';a.rel='noopener noreferrer';
  a.innerHTML='<i class="'+icon+'" aria-hidden="true"></i><span></span>';a.querySelector('span').textContent=label;return a
}
function addSecondaryDetails(row,record){
  if(row.querySelector('.tm-plan-secondary-details')||!record)return;
  var details=document.createElement('section');details.className='tm-plan-secondary-details';details.setAttribute('aria-label','פרטים נוספים');
  var address=String(record.address||'').trim(),description=String(record.description||record.note||record.notes||'').trim();
  var phone=String(record.phone||record.telephone||'').trim(),hours=String(record.openingHours||record.opening_hours||'').trim();
  var rating=record.rating||record.googleRating||'',reviews=record.reviewCount||record.ratingsCount||'';
  if(address)details.appendChild(detailRow('fa-solid fa-location-dot',address));
  if(description)details.appendChild(detailRow('fa-regular fa-note-sticky',description));
  if(hours)details.appendChild(detailRow('fa-regular fa-clock',hours));
  if(rating)details.appendChild(detailRow('fa-solid fa-star','ציון '+rating+(reviews?' · '+reviews+' ביקורות':'')));
  var nav=document.createElement('nav'),official=safeUrl(record.website||record.officialUrl),ratings=safeUrl(record.ratingsUrl||record.googleMapsUrl);
  if(official)nav.appendChild(detailLink('fa-solid fa-globe','אתר רשמי',official));
  if(ratings)nav.appendChild(detailLink('fa-brands fa-google','ציונים וביקורות',ratings));
  if(phone){var tel=document.createElement('a');tel.href='tel:'+phone.replace(/[^+\d]/g,'');tel.innerHTML='<i class="fa-solid fa-phone" aria-hidden="true"></i><span></span>';tel.querySelector('span').textContent=phone;nav.appendChild(tel)}
  if(nav.childNodes.length)details.appendChild(nav);
  if(!details.childNodes.length)return;
  row.appendChild(details)
}
function addStatus(row,label,type){
  var host=row.querySelector('.activity-copy,.saved-place-content');if(!host)return;
  var existing=host.querySelector('.tm-plan-state-badge');if(existing)existing.remove();
  if(!label)return;
  var badge=document.createElement('span');badge.className='tm-plan-state-badge '+(type==='now'?'is-now':'is-next');badge.textContent=label;host.appendChild(badge)
}
function statusMap(trip){
  var map=Object.create(null),today=localDateKey(new Date());
  if(!trip||String(trip.start||'')>today||String(trip.end||'')<today)return map;
  var now=new Date(),current=now.getHours()*60+now.getMinutes(),records=[];
  (trip.activities||[]).forEach(function(record){records.push({kind:'activity',record:record})});
  (trip.savedPlaces||[]).forEach(function(record){records.push({kind:'place',record:record})});
  records=records.filter(function(entry){var mode=scheduleMode(entry.record);return String(entry.record.date||'')===today&&!entry.record.done&&mode!=='flexible'&&mode!=='window'}).map(function(entry){
    var parts=String(entry.record.time||'').split(':').map(Number),start=Number.isFinite(parts[0])?parts[0]*60+(parts[1]||0):null;
    return{kind:entry.kind,record:entry.record,start:start,duration:Number(entry.record.duration||60)}
  }).filter(function(entry){return entry.start!==null}).sort(function(a,b){return a.start-b.start});
  var active=records.find(function(entry){return entry.start<=current&&entry.start+entry.duration>current});
  var next=records.find(function(entry){return entry.start>current});
  if(active)map[active.kind+':'+active.record.id]={label:'עכשיו',type:'now'};
  if(next)map[next.kind+':'+next.record.id]={label:'הבא',type:'next'};
  return map
}
function transitionMap(trip){
  var helper=context(),map=Object.create(null);
  if(!helper||typeof helper.transitionAssessmentsForDate!=='function'||!trip)return map;
  var dates=new Set();
  (trip.activities||[]).forEach(function(record){if(record&&record.date)dates.add(String(record.date))});
  (trip.savedPlaces||[]).forEach(function(record){if(record&&record.date)dates.add(String(record.date))});
  dates.forEach(function(date){
    var current=helper.transitionAssessmentsForDate(trip,date);
    Object.keys(current||{}).forEach(function(key){map[key]=current[key]})
  });
  return map
}
function travelModeLabel(mode){
  var helper=context();if(helper&&typeof helper.travelModeLabel==='function')return helper.travelModeLabel(mode);
  return mode==='walk'?'\u05d4\u05dc\u05d9\u05db\u05d4':mode==='bike'?'\u05d0\u05d5\u05e4\u05e0\u05d9\u05d9\u05dd':mode==='drive'?'\u05e8\u05db\u05d1':mode==='taxi'?'\u05de\u05d5\u05e0\u05d9\u05ea':mode==='metro'?'\u05de\u05d8\u05e8\u05d5':mode==='rail'?'\u05e8\u05db\u05d1\u05ea':'\u05ea\u05d7\u05d1\u05d5\u05e8\u05d4 \u05e6\u05d9\u05d1\u05d5\u05e8\u05d9\u05ea'
}
function addTransition(row,transition){
  var host=row.querySelector('.activity-copy,.saved-place-content');if(!host)return;
  var existing=host.querySelector('.tm-plan-transition');if(existing)existing.remove();
  row.classList.toggle('tm-plan-travel-risk',Boolean(transition&&transition.risk));
  if(!transition)return;
  var line=document.createElement('span');
  line.className='tm-plan-transition'+(transition.risk?' is-risk':' is-ok');
  line.dataset.transitionSource=transition.source||'estimate';
  var prefix=transition.source==='manual'?'זמן מעבר':'הערכת מעבר';
  var text=prefix+' · כ־'+transition.travelMinutes+' דק׳ · '+travelModeLabel(transition.mode)+(transition.bufferMinutes?' + '+transition.bufferMinutes+' דק׳ מרווח':'');
  if(transition.risk)text+=' · חסרות כ־'+transition.shortfallMinutes+' דק׳';
  else if(transition.latestDepartureTime)text+=' · כדאי לצאת עד '+transition.latestDepartureTime;
  else text+=' · נשארו '+transition.gapMinutes+' דק׳ בין הפעילויות';
  line.innerHTML='<i class="fa-solid '+(transition.risk?'fa-triangle-exclamation':'fa-route')+'" aria-hidden="true"></i><span></span>';
  line.querySelector('span').textContent=text;
  host.appendChild(line)
}
function enhanceRow(row,trip,statuses,transitions){
  var record=recordFor(row,trip),actions=row.querySelector('.activity-buttons,.saved-place-actions');if(!record||!actions)return;
  if(row.dataset.planUxEnhanced!=='true'){
    row.dataset.planUxEnhanced='true';row.classList.add('tm-plan-item');row.dataset.planExpanded='false';
    makeActivityMedia(row,record);addLocation(row,record);addSecondaryDetails(row,record);makeNavigation(actions,record,trip);makeToggle(row,actions)
  }
  row.dataset.planScheduleMode=scheduleMode(record);
  syncDone(row);
  var key=recordKind(row)+':'+record.id,status=statuses[key];addStatus(row,status&&status.label,status&&status.type);
  addTransition(row,transitions&&transitions[key])
}
function dayRecords(trip,date){
  var list=[];
  (trip.activities||[]).forEach(function(record){if(String(record.date||'')===date)list.push(record)});
  (trip.savedPlaces||[]).forEach(function(record){if(String(record.date||'')===date)list.push(record)});
  return list
}
function enhanceDay(card,index,trip,today){
  var date=String(card.dataset.dayDate||card.dataset.tripDate||'');if(!date)return;
  var records=dayRecords(trip,date),done=records.filter(function(record){return !!record.done}).length,total=records.length;
  card.classList.toggle('tm-plan-day-current',date===today&&String(trip.start||'')<=today&&String(trip.end||'')>=today);
  card.classList.toggle('tm-plan-day-future',date>today);card.classList.toggle('tm-plan-day-past',date<today);
  var heading=card.querySelector('.day-heading'),summary=heading&&heading.querySelector('.day-summary');
  if(summary)summary.textContent=total?(done+' מתוך '+total+' הושלמו'+(done<total?' · '+(total-done)+' נותרו':'')):'אין פעילויות ביום הזה';
  if(heading){
    var meta=heading.querySelector('.tm-plan-day-kind');if(!meta){meta=document.createElement('span');meta.className='tm-plan-day-kind';heading.querySelector('div').appendChild(meta)}
    meta.textContent=date===today&&card.classList.contains('tm-plan-day-current')?'היום':date<today?'עבר':'עתידי';
    var mode=dayMode(trip,date),modeText=dayModeLabel(mode),modeBadge=heading.querySelector('.tm-plan-day-mode');
    if(modeText){
      if(!modeBadge){modeBadge=document.createElement('span');modeBadge.className='tm-plan-day-mode';heading.querySelector('div').appendChild(modeBadge)}
      modeBadge.textContent=modeText;modeBadge.dataset.dayMode=mode
    }else if(modeBadge)modeBadge.remove();
    var modeSelect=heading.querySelector('.tm-plan-day-mode-select');
    if(!modeSelect){
      modeSelect=document.createElement('select');
      modeSelect.className='tm-plan-day-mode-select';
      modeSelect.setAttribute('aria-label','בחירת אופי היום');
      modeSelect.innerHTML='<option value="auto">אופי יום · אוטומטי</option><option value="flexible">אופי יום · גמיש</option><option value="balanced">אופי יום · מאוזן</option><option value="scheduled">אופי יום · מתוזמן</option>';
      modeSelect.addEventListener('click',function(event){event.stopPropagation()});
      modeSelect.addEventListener('keydown',function(event){event.stopPropagation()});
      modeSelect.addEventListener('change',function(event){event.stopPropagation();saveDayMode(currentTrip()||trip,date,modeSelect.value)});
      heading.appendChild(modeSelect)
    }
    modeSelect.value=dayModeOverride(trip,date)||'auto';
    var helper=context(),dayTransitions=helper&&helper.transitionAssessmentsForDate?helper.transitionAssessmentsForDate(trip,date):{},riskCount=Object.keys(dayTransitions||{}).filter(function(key){return dayTransitions[key]&&dayTransitions[key].risk}).length;
    var riskBadge=heading.querySelector('.tm-plan-day-travel-risk');
    if(riskCount){
      if(!riskBadge){riskBadge=document.createElement('span');riskBadge.className='tm-plan-day-travel-risk';heading.querySelector('div').appendChild(riskBadge)}
      riskBadge.textContent='סיכון מעבר · '+riskCount
    }else if(riskBadge)riskBadge.remove()
  }
  var content=card.querySelector(':scope > div'),empty=content&&content.querySelector('.tm-plan-empty-day');
  if(!total&&content){
    if(!empty){empty=document.createElement('div');empty.className='tm-plan-empty-day';empty.innerHTML='<span>אין פעילויות ביום הזה</span><button type="button" data-plan-empty-add="'+date+'"><i class="fa-solid fa-plus" aria-hidden="true"></i> הוסף פעילות</button>';var note=content.querySelector('.day-note');content.insertBefore(empty,note||null)}
  }else if(empty)empty.remove();
  if(!preparedDays[date]&&date>=today){
    preparedDays[date]=true;
    var activeTrip=String(trip.start||'')<=today&&String(trip.end||'')>=today;
    var focus=activeTrip?today:(String(trip.start||'')>today?String(trip.start):'');
    var shouldCollapse=Boolean(focus&&date!==focus);
    if(shouldCollapse&&!card.classList.contains('day-collapsed')){var badge=card.querySelector('.badge');if(badge)setTimeout(function(){badge.click()},0)}
    if(!shouldCollapse&&card.classList.contains('day-collapsed')){var openBadge=card.querySelector('.badge');if(openBadge)setTimeout(function(){openBadge.click()},0)}
  }
}
function enhancePastStrip(plan,trip){
  var strip=plan.querySelector('.past-days-strip');if(!strip)return;
  var buttons=[].slice.call(strip.querySelectorAll('[data-open-past-day]')),label=strip.querySelector(':scope > span');
  if(label)label.dataset.count=String(buttons.length);
  buttons.forEach(function(button){
    var date=button.dataset.openPastDay,records=dayRecords(trip,date),done=records.filter(function(record){return !!record.done}).length;
    button.dataset.progress=records.length?(done+'/'+records.length+' הושלמו'):'אין פעילויות'
  })
}
function apply(){
  if(document.body.dataset.tripView!=='plan')return;
  var plan=document.getElementById('plan'),trip=currentTrip();if(!plan||!trip)return;
  plan.dataset.planUxReady='true';ensureToolbar(plan,trip);
  var today=localDateKey(new Date()),statuses=statusMap(trip),transitions=transitionMap(trip);
  [].slice.call(plan.querySelectorAll('.generated-day')).forEach(function(card,index){enhanceDay(card,index,trip,today)});
  plan.querySelectorAll('.planned-activity,.saved-place').forEach(function(row){enhanceRow(row,trip,statuses,transitions)});
  enhancePastStrip(plan,trip)
}
function schedule(){if(scheduled)return;scheduled=requestAnimationFrame(function(){scheduled=0;apply()})}
function setExpanded(row,open){
  var plan=row.closest('#plan');if(!plan)return;
  if(open)plan.querySelectorAll('.tm-plan-item.tm-plan-expanded').forEach(function(other){if(other!==row)setExpanded(other,false)});
  row.classList.toggle('tm-plan-expanded',open);row.dataset.planExpanded=String(open);
  var toggle=row.querySelector('[data-plan-details-toggle]');if(toggle){
    toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'סגירת פרטי הפעילות':'פתיחת כל פרטי הפעילות');
    var icon=toggle.querySelector('i');if(icon)icon.className=open?'fa-solid fa-chevron-up':'fa-solid fa-chevron-down'
  }
}
function collapseOtherOpenDays(targetDate){
  if(!(window.matchMedia&&window.matchMedia('(max-width:700px)').matches))return;
  var plan=document.getElementById('plan'),target=plan&&plan.querySelector('.generated-day[data-day-date="'+targetDate+'"]');
  if(!plan||!target||target.classList.contains('day-collapsed'))return;
  [].slice.call(plan.querySelectorAll('.generated-day')).forEach(function(card){
    if(String(card.dataset.dayDate||'')===String(targetDate)||card.classList.contains('day-collapsed')||card.classList.contains('current-trip-day')||card.classList.contains('tm-plan-day-current'))return;
    var badge=card.querySelector('.badge');if(badge)badge.click()
  })
}
document.addEventListener('click',function(event){
  var toggle=event.target.closest('[data-plan-details-toggle]');
  if(toggle){var row=toggle.closest('.tm-plan-item');if(!row)return;event.preventDefault();setExpanded(row,!row.classList.contains('tm-plan-expanded'));return}
  var emptyAdd=event.target.closest('[data-plan-empty-add]');
  if(emptyAdd){var emptyCard=emptyAdd.closest('.generated-day'),headerAdd=emptyCard&&emptyCard.querySelector('.day-add[data-add-date]');if(headerAdd)headerAdd.click();return}
  if(event.target.closest('[data-add-date]'))return;
  var dayToggle=event.target.closest('[data-toggle-day]');
  if(dayToggle)setTimeout(function(){collapseOtherOpenDays(dayToggle.dataset.toggleDay)},0)
});
document.addEventListener('travelmate:planner-rendered',schedule);
document.addEventListener('travelmate:places-updated',schedule);
window.addEventListener('travelmate:viewchange',schedule);
window.addEventListener('focus',schedule);
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')schedule()});
function start(){
  schedule();var plan=document.getElementById('plan');if(plan&&window.MutationObserver){observer=new MutationObserver(schedule);observer.observe(plan,{childList:true,subtree:true})}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start()
})();
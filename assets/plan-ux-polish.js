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
  records=records.filter(function(entry){return String(entry.record.date||'')===today&&!entry.record.done&&scheduleMode(entry.record)!=='flexible'}).map(function(entry){
    var parts=String(entry.record.time||'').split(':').map(Number),start=Number.isFinite(parts[0])?parts[0]*60+(parts[1]||0):null;
    return{kind:entry.kind,record:entry.record,start:start,duration:Number(entry.record.duration||60)}
  }).filter(function(entry){return entry.start!==null}).sort(function(a,b){return a.start-b.start});
  var active=records.find(function(entry){return entry.start<=current&&entry.start+entry.duration>current});
  var next=records.find(function(entry){return entry.start>current});
  if(active)map[active.kind+':'+active.record.id]={label:'עכשיו',type:'now'};
  if(next)map[next.kind+':'+next.record.id]={label:'הבא',type:'next'};
  return map
}
function enhanceRow(row,trip,statuses){
  var record=recordFor(row,trip),actions=row.querySelector('.activity-buttons,.saved-place-actions');if(!record||!actions)return;
  if(row.dataset.planUxEnhanced!=='true'){
    row.dataset.planUxEnhanced='true';row.classList.add('tm-plan-item');row.dataset.planExpanded='false';
    row.dataset.planScheduleMode=scheduleMode(record);
    makeActivityMedia(row,record);addLocation(row,record);addSecondaryDetails(row,record);makeNavigation(actions,record,trip);makeToggle(row,actions)
  }
  syncDone(row);
  var status=statuses[recordKind(row)+':'+record.id];addStatus(row,status&&status.label,status&&status.type)
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
    meta.textContent=date===today&&card.classList.contains('tm-plan-day-current')?'היום':date<today?'עבר':index===0?'יום ראשון':'מתוכנן'
  }
  var content=card.querySelector(':scope > div'),empty=content&&content.querySelector('.tm-plan-empty-day');
  if(!total&&content){
    if(!empty){empty=document.createElement('div');empty.className='tm-plan-empty-day';empty.innerHTML='<span>אין פעילויות ביום הזה</span><button type="button" data-add-date="'+date+'"><i class="fa-solid fa-plus" aria-hidden="true"></i> הוסף פעילות</button>';var note=content.querySelector('.day-note');content.insertBefore(empty,note||null)}
  }else if(empty)empty.remove();
  if(window.matchMedia&&window.matchMedia('(max-width:700px)').matches&&!preparedDays[date]&&date>=today){
    preparedDays[date]=true;
    var focus=String(trip.start||'')<=today&&String(trip.end||'')>=today?today:(String(trip.start||'')>today?String(trip.start):'');
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
  var today=localDateKey(new Date()),statuses=statusMap(trip);
  [].slice.call(plan.querySelectorAll('.generated-day')).forEach(function(card,index){enhanceDay(card,index,trip,today)});
  plan.querySelectorAll('.planned-activity,.saved-place').forEach(function(row){enhanceRow(row,trip,statuses)});
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
document.addEventListener('click',function(event){
  var toggle=event.target.closest('[data-plan-details-toggle]');if(!toggle)return;
  var row=toggle.closest('.tm-plan-item');if(!row)return;event.preventDefault();setExpanded(row,!row.classList.contains('tm-plan-expanded'))
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
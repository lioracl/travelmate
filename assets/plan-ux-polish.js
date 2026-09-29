(function(){
'use strict';
var scheduled=0,observer=null;
function currentTrip(){
  var store=window.TravelMateTripStore,id=new URLSearchParams(location.search).get('id');
  return store&&store.getTrip?store.getTrip(id):null;
}
function recordFor(row,trip){
  if(!trip)return null;
  if(row.matches('.saved-place')){
    return (trip.savedPlaces||[]).find(function(item){return String(item.id)===String(row.dataset.savedPlaceId)})
  }
  return (trip.activities||[]).find(function(item){return String(item.id)===String(row.dataset.activityId)})
}
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
function makeToggle(row,actions){
  var button=actions.querySelector('[data-plan-details-toggle]');
  if(button)return button;
  button=document.createElement('button');button.type='button';button.className='tm-plan-details-toggle';
  button.dataset.planDetailsToggle='';button.setAttribute('aria-expanded','false');
  button.setAttribute('aria-label','פתיחת כל פרטי הפעילות');
  button.innerHTML='<i class="fa-solid fa-chevron-down" aria-hidden="true"></i><span>פרטים</span>';
  actions.appendChild(button);return button
}
function makeNavigation(row,actions,record,trip){
  if(actions.querySelector('.tm-plan-nav-action'))return;
  var href=navigationUrl(record,trip);if(!href)return;
  var link=document.createElement('a');link.className='tm-plan-nav-action';link.href=href;link.target='_blank';link.rel='noopener noreferrer';
  link.setAttribute('aria-label','ניווט אל '+String(record.name||record.title||'הפעילות'));
  link.innerHTML='<i class="fa-solid fa-route" aria-hidden="true"></i><span>ניווט</span>';
  actions.insertBefore(link,actions.firstChild)
}
function syncDone(row){
  var button=row.querySelector('[data-toggle-done],[data-toggle-saved-done]');
  if(!button)return;var done=row.classList.contains('done');
  button.setAttribute('aria-pressed',String(done));
  button.setAttribute('aria-label',done?'סומן כהושלם. לחיצה תחזיר למתוכנן':'סימון כהושלם')
}
function enhanceRow(row,trip){
  if(row.dataset.planUxEnhanced==='true'){syncDone(row);return}
  var actions=row.querySelector('.activity-buttons,.saved-place-actions');if(!actions)return;
  row.dataset.planUxEnhanced='true';row.classList.add('tm-plan-item');row.dataset.planExpanded='false';
  var record=recordFor(row,trip);makeNavigation(row,actions,record,trip);makeToggle(row,actions);syncDone(row)
}
function apply(){
  if(document.body.dataset.tripView!=='plan')return;
  var plan=document.getElementById('plan');if(!plan)return;
  var trip=currentTrip();
  plan.querySelectorAll('.planned-activity,.saved-place').forEach(function(row){enhanceRow(row,trip)})
}
function schedule(){
  if(scheduled)return;scheduled=requestAnimationFrame(function(){scheduled=0;apply()})
}
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
  var row=toggle.closest('.tm-plan-item');if(!row)return;
  event.preventDefault();setExpanded(row,!row.classList.contains('tm-plan-expanded'))
});
document.addEventListener('travelmate:planner-rendered',schedule);
window.addEventListener('travelmate:viewchange',schedule);
function start(){
  schedule();var plan=document.getElementById('plan');if(plan&&window.MutationObserver){
    observer=new MutationObserver(schedule);observer.observe(plan,{childList:true,subtree:true})
  }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start()
})();
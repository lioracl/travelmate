(function(){
'use strict';
function currentTrip(){
  var store=window.TravelMateTripStore,id=new URLSearchParams(location.search).get('id');
  return store&&store.getTrip?store.getTrip(id):null
}
function datesForTrip(trip){
  if(!trip||!trip.start||!trip.end)return[];
  var start=new Date(trip.start+'T12:00:00'),end=new Date(trip.end+'T12:00:00'),dates=[];
  if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime()))return dates;
  for(var cursor=new Date(start);cursor<=end;cursor.setDate(cursor.getDate()+1)){
    dates.push([cursor.getFullYear(),String(cursor.getMonth()+1).padStart(2,'0'),String(cursor.getDate()).padStart(2,'0')].join('-'))
  }
  return dates
}
function formatDate(value){
  try{return new Intl.DateTimeFormat('he-IL',{weekday:'long',day:'numeric',month:'long'}).format(new Date(value+'T12:00:00'))}
  catch(error){return value}
}
function durationLabel(minutes){
  var hours=Math.floor(minutes/60),rest=minutes%60,parts=[];
  if(hours)parts.push(hours+' ש׳');
  if(rest)parts.push(rest+' דק׳');
  return parts.join(' ')||minutes+' דק׳'
}
function ensurePanel(plan){
  var panel=plan.querySelector('[data-free-time-panel]');
  if(panel)return panel;
  panel=document.createElement('section');
  panel.className='tm-free-time-panel';
  panel.dataset.freeTimePanel='';
  panel.hidden=true;
  panel.innerHTML='<div class="tm-free-time-head"><div><small>Plan 2.3</small><h3>חלונות זמן פנויים</h3><p>מבוסס על הפעילויות המתוזמנות וזמן המעבר המשוער. פעילויות גמישות וחלונות זמן אינם נחסמים אוטומטית.</p></div><button type="button" data-free-time-close aria-label="סגירת חלונות זמן"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div><div class="tm-free-time-results" data-free-time-results></div>';
  var toolbar=plan.querySelector('.planner-toolbar');
  if(toolbar&&toolbar.parentNode)toolbar.parentNode.insertBefore(panel,toolbar.nextSibling);else plan.insertBefore(panel,plan.firstChild);
  return panel
}
function render(){
  var plan=document.getElementById('plan'),trip=currentTrip(),helper=window.TravelMateTripContext;
  if(!plan||!trip||!helper||!helper.freeTimeWindowsForDate)return;
  var panel=ensurePanel(plan),host=panel.querySelector('[data-free-time-results]'),dates=datesForTrip(trip),groups=[];
  dates.forEach(function(date){
    var windows=helper.freeTimeWindowsForDate(trip,date,{startTime:'09:00',endTime:'22:00',minimumMinutes:45,bufferMinutes:10});
    if(windows.length)groups.push({date:date,windows:windows})
  });
  if(!groups.length){
    host.innerHTML='<p class="tm-free-time-empty">לא נמצאו כרגע חלונות של 45 דקות ומעלה בין 09:00 ל־22:00.</p>';
    return
  }
  host.innerHTML='';
  groups.forEach(function(group){
    var article=document.createElement('article'),title=document.createElement('h4');
    article.className='tm-free-time-day';title.textContent=formatDate(group.date);article.appendChild(title);
    var list=document.createElement('div');list.className='tm-free-time-list';
    group.windows.forEach(function(windowInfo){
      var item=document.createElement('button');item.type='button';item.className='tm-free-time-window';
      item.dataset.freeTimeDate=group.date;item.dataset.freeTimeStart=windowInfo.startTime;
      item.innerHTML='<strong></strong><span></span><i class="fa-solid fa-plus" aria-hidden="true"></i>';
      item.querySelector('strong').textContent=windowInfo.startTime+'–'+windowInfo.endTime;
      item.querySelector('span').textContent=durationLabel(windowInfo.durationMinutes)+' פנויים';
      list.appendChild(item)
    });
    article.appendChild(list);host.appendChild(article)
  })
}
function install(){
  var plan=document.getElementById('plan'),toolbar=plan&&plan.querySelector('.planner-toolbar'),actions=toolbar&&toolbar.querySelector('.planner-toolbar-actions');
  if(!plan||!actions||actions.querySelector('[data-free-time-open]'))return;
  var button=document.createElement('button');button.type='button';button.className='planner-action';button.dataset.freeTimeOpen='';
  button.innerHTML='<i class="fa-regular fa-clock" aria-hidden="true"></i><span>זמן פנוי</span>';
  actions.appendChild(button)
}
document.addEventListener('click',function(event){
  var open=event.target.closest('[data-free-time-open]');
  if(open){
    var plan=document.getElementById('plan'),panel=plan&&ensurePanel(plan);
    if(!panel)return;render();panel.hidden=false;panel.scrollIntoView({behavior:'smooth',block:'nearest'});return
  }
  var close=event.target.closest('[data-free-time-close]');
  if(close){var panel=close.closest('[data-free-time-panel]');if(panel)panel.hidden=true;return}
  var slot=event.target.closest('[data-free-time-date]');
  if(slot){
    var plan=document.getElementById('plan'),add=plan&&plan.querySelector('[data-new-activity]');
    if(add){add.click();window.dispatchEvent(new CustomEvent('travelmate:free-time-selected',{detail:{date:slot.dataset.freeTimeDate,time:slot.dataset.freeTimeStart}}))}
  }
});
document.addEventListener('travelmate:planner-rendered',install);
window.addEventListener('travelmate:feature-ready',function(event){if(event.detail&&event.detail.view==='plan')install()});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
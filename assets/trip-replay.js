(function(){
'use strict';
if(window.__travelMateTripReplayLoaded)return;
window.__travelMateTripReplayLoaded=true;

function trip(){
  var store=window.TravelMateTripStore,id=new URLSearchParams(location.search).get('id');
  return store&&store.getTrip?store.getTrip(id):null
}
function clean(value){return String(value||'').trim()}
function localDate(value){
  var raw=clean(value);
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;
  var date=new Date(raw);if(Number.isNaN(date.getTime()))return'';
  return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-')
}
function itemDate(item){return localDate(item&& (item.localDate||item.date))}
function title(item){return clean(item&&(item.title||item.name||item.note))||'פריט ללא שם'}
function completedItems(current){
  var activities=(current.activities||[]).filter(function(item){return item&&item.done===true}).map(function(item){return{kind:'activity',date:itemDate(item),time:clean(item.time),title:title(item),category:clean(item.category)}});
  var places=(current.savedPlaces||[]).filter(function(item){return item&&item.done===true}).map(function(item){return{kind:'place',date:itemDate(item),time:clean(item.time),title:title(item),category:clean(item.category)}});
  return activities.concat(places).sort(function(a,b){return String(a.date).localeCompare(String(b.date))||String(a.time).localeCompare(String(b.time))})
}
function plannedCount(current){return (current.activities||[]).length+(current.savedPlaces||[]).filter(function(item){return item&&item.date}).length}
function unscheduledSavedCount(current){return (current.savedPlaces||[]).filter(function(item){return item&&!item.date}).length}
function memories(current){
  return (current.memories||[]).map(function(item){return{date:itemDate(item),note:clean(item.note),attachments:Array.isArray(item.attachments)?item.attachments.length:0}}).filter(function(item){return item.note})
}
function expenseTotal(current){
  return (current.expenses||[]).reduce(function(sum,item){return sum+Number(item&&item.amount||0)},0)
}
function expenseCurrency(current){
  var counts=Object.create(null);
  (current.expenses||[]).forEach(function(item){var code=clean(item&&item.currency)||'EUR';counts[code]=(counts[code]||0)+1});
  return Object.keys(counts).sort(function(a,b){return counts[b]-counts[a]})[0]||'EUR'
}
function inclusiveDays(start,end){
  var from=localDate(start),to=localDate(end);
  if(!from||!to)return null;
  var startDate=new Date(from+'T12:00:00'),endDate=new Date(to+'T12:00:00');
  if(Number.isNaN(startDate.getTime())||Number.isNaN(endDate.getTime())||endDate<startDate)return null;
  return Math.round((endDate-startDate)/86400000)+1
}
function expenseTotalsByCurrency(current){
  var totals=Object.create(null),invalid=0;
  (current.expenses||[]).forEach(function(item){
    var amount=Number(item&&item.amount),currency=clean(item&&item.currency).toUpperCase();
    if(!Number.isFinite(amount)||amount<0||!/^[A-Z]{3}$/.test(currency)){invalid+=1;return}
    totals[currency]=(totals[currency]||0)+amount
  });
  return Object.keys(totals).sort().map(function(currency){return{currency:currency,amount:Number(totals[currency].toFixed(2))}})
}
function analyticsFor(current,done,planned){
  var tripDays=Number(current&&current.days);
  if(!Number.isFinite(tripDays)||tripDays<=0)tripDays=inclusiveDays(current&&current.start,current&&current.end);
  var completionRate=planned>0?Math.round((done/planned)*100):null;
  var byDate=Object.create(null);
  done.forEach(function(item){if(item.date)byDate[item.date]=(byDate[item.date]||0)+1});
  var busiestDates=Object.keys(byDate).sort(function(a,b){return byDate[b]-byDate[a]||a.localeCompare(b)});
  var expenseTotals=expenseTotalsByCurrency(current||{});
  var expenseCount=Array.isArray(current&&current.expenses)?current.expenses.length:0;
  var invalidExpenseCount=Math.max(0,expenseCount-expenseTotals.reduce(function(sum,item){return sum+1},0));
  var coverage={
    dates:Boolean(current&&current.start&&current.end),
    completion:planned>0,
    expenses:expenseCount===0||invalidExpenseCount===0,
    memories:Array.isArray(current&&current.memories)
  };
  return Object.freeze({
    tripDays:tripDays===null?{value:null,status:'unknown'}:{value:tripDays,status:'confirmed'},
    completionRate:completionRate===null?{value:null,status:'unknown'}:{value:completionRate,status:'confirmed'},
    busiestDay:busiestDates.length?{date:busiestDates[0],completed:byDate[busiestDates[0]],status:'confirmed'}:{date:null,completed:null,status:'unknown'},
    expenseTotals:Object.freeze(expenseTotals),
    expenseStatus:expenseCount===0?'unknown':invalidExpenseCount?'unknown':'confirmed',
    coverage:Object.freeze(coverage)
  })
}
function safeMoney(amount,currency){
  try{return new Intl.NumberFormat('he-IL',{style:'currency',currency:currency,maximumFractionDigits:2}).format(amount)}
  catch(error){return amount+' '+currency}
}
function buildReplay(current){
  current=current||{};
  var done=completedItems(current),notes=memories(current),byDate=Object.create(null);
  done.forEach(function(item){if(!item.date)return;(byDate[item.date]||(byDate[item.date]={done:[],memories:[]})).done.push(item)});
  notes.forEach(function(item){if(!item.date)return;(byDate[item.date]||(byDate[item.date]={done:[],memories:[]})).memories.push(item)});
  var dates=Object.keys(byDate).sort(),total=expenseTotal(current),currency=expenseCurrency(current);
  return Object.freeze({
    destination:[clean(current.city),clean(current.country)].filter(Boolean).join(', '),
    start:clean(current.start),end:clean(current.end),
    planned:plannedCount(current),
    completed:done.length,
    savedOnly:unscheduledSavedCount(current),
    memories:notes.length,
    attachments:notes.reduce(function(sum,item){return sum+item.attachments},0),
    expenses:(current.expenses||[]).length,
    expenseTotal:total,
    expenseCurrency:currency,
    expenseLabel:total?safeMoney(total,currency):'',
    analytics:analyticsFor(current,done,dataPlannedCount(current)),
    days:dates.map(function(date){return Object.freeze({date:date,done:byDate[date].done.slice(),memories:byDate[date].memories.slice()})})
  })
}
function formatDate(value){
  try{return new Intl.DateTimeFormat('he-IL',{weekday:'long',day:'numeric',month:'long'}).format(new Date(value+'T12:00:00'))}
  catch(error){return value}
}
function narrative(data){
  var lines=[];
  if(data.completed)lines.push('סומנו '+data.completed+' פעילויות ומקומות כהושלמו מתוך '+data.planned+' פריטים שתוזמנו.');
  else if(data.planned)lines.push('יש '+data.planned+' פריטים מתוכננים, אך עדיין לא סומנו פעילויות או מקומות כהושלמו.');
  if(data.memories)lines.push('נשמרו '+data.memories+' רגעים מהטיול'+(data.attachments?' עם '+data.attachments+' קבצים מצורפים.':'.'));
  if(data.expenses)lines.push('נרשמו '+data.expenses+' הוצאות'+(data.expenseLabel?' בסכום כולל של '+data.expenseLabel+'.':'.'));
  if(data.savedOnly)lines.push(data.savedOnly+' מקומות נשמרו כרעיונות בלי תאריך ולכן אינם נספרים כביקורים.');
  if(!lines.length)lines.push('ככל שתסמן פעילויות כהושלמו ותשמור רגעים, ה־Replay ייבנה אוטומטית.');
  return lines.join(' ')
}
function prompt(data){
  var dayFacts=data.days.map(function(day){
    var completed=day.done.map(function(item){return item.title}).join(', ');
    var notes=day.memories.map(function(item){return item.note}).join(' | ');
    return [day.date,completed?'הושלם: '+completed:'',notes?'זיכרונות: '+notes:''].filter(Boolean).join(' — ')
  }).join('\n');
  return 'כתוב Trip Replay בעברית לטיול ב'+(data.destination||'היעד')+'. השתמש רק בעובדות שסופקו, בלי להמציא ביקורים. פריט נחשב ביקור רק אם סומן כהושלם. נתונים: '+narrative(data)+'\nציר זמן:\n'+(dayFacts||'אין עדיין פריטי ציר זמן.')+'\nסיים ב-3 נקודות קצרות: רגעים בולטים, קצב הטיול, ומה כדאי לזכור לפעם הבאה.'
}
function ensureCard(){
  var section=document.getElementById('memories');if(!section)return null;
  var existing=section.querySelector('[data-trip-replay]');if(existing)return existing;
  var card=document.createElement('article');card.className='trip-replay-card';card.dataset.tripReplay='';
  card.innerHTML='<header class="trip-replay-head"><div><small>Trip Replay · 2.4</small><h2>הטיול שלך, לפי מה שבאמת קרה</h2><p data-trip-replay-summary></p></div><button type="button" data-trip-replay-ai><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i><span>סיפור עם Mate</span></button></header><div class="trip-replay-stats" data-trip-replay-stats></div><div class="trip-replay-analytics" data-trip-replay-analytics aria-label="נתוני טיול"></div><div class="trip-replay-timeline" data-trip-replay-timeline></div>';
  var summary=section.querySelector('.trip-summary-card');if(summary&&summary.parentNode)summary.parentNode.insertBefore(card,summary);else section.appendChild(card);
  card.querySelector('[data-trip-replay-ai]').addEventListener('click',function(){
    var current=trip(),data=buildReplay(current||{});
    if(window.TravelMateEvents&&window.TravelMateEvents.emit)window.TravelMateEvents.emit(window.TravelMateEvents.names.askAi,{prompt:prompt(data),source:'trip-replay'});
  });
  return card
}
function render(){
  var current=trip(),card=ensureCard();if(!current||!card)return;
  var data=buildReplay(current),summary=card.querySelector('[data-trip-replay-summary]'),stats=card.querySelector('[data-trip-replay-stats]'),timeline=card.querySelector('[data-trip-replay-timeline]'),analytics=card.querySelector('[data-trip-replay-analytics]');
  summary.textContent=narrative(data);
  if(analytics){
    var tripDays=data.analytics.tripDays.value===null?'לא ידוע':data.analytics.tripDays.value+' ימים';
    var completion=data.analytics.completionRate.value===null?'אין מספיק נתונים':data.analytics.completionRate.value+'%';
    var busiest=data.analytics.busiestDay.date?formatDate(data.analytics.busiestDay.date)+' · '+data.analytics.busiestDay.completed+' שהושלמו':'אין מספיק נתונים';
    analytics.innerHTML='<div><small>משך הטיול</small><strong>'+escapeHtml(tripDays)+'</strong></div><div><small>השלמת התוכנית</small><strong>'+escapeHtml(completion)+'</strong></div><div><small>היום העמוס ביותר</small><strong>'+escapeHtml(busiest)+'</strong></div><div><small>מצב נתוני הוצאות</small><strong>'+escapeHtml(data.analytics.expenseStatus==='confirmed'?'מאומת':data.analytics.expenseStatus==='unknown'?'חלקי/לא ידוע':'לא ידוע')+'</strong></div>';
  }
  var statItems=[
    ['fa-circle-check','הושלמו',String(data.completed)],
    ['fa-calendar-check','תוכננו',String(data.planned)],
    ['fa-bookmark','נשמרו לרעיונות',String(data.savedOnly)],
    ['fa-camera','רגעים',String(data.memories)]
  ];
  if(data.expenses)statItems.push(['fa-wallet','הוצאות',data.expenseLabel||String(data.expenses)]);
  stats.innerHTML='';
  statItems.forEach(function(item){var box=document.createElement('div');box.innerHTML='<i class="fa-solid '+item[0]+'" aria-hidden="true"></i><span><small>'+item[1]+'</small><strong>'+item[2]+'</strong></span>';stats.appendChild(box)});
  timeline.innerHTML='';
  if(!data.days.length){timeline.innerHTML='<p class="trip-replay-empty">אין עדיין ימים עם פריטים שסומנו כהושלמו או זיכרונות שנשמרו.</p>';return}
  data.days.forEach(function(day){
    var article=document.createElement('section'),h=document.createElement('h3');h.textContent=formatDate(day.date);article.appendChild(h);
    var list=document.createElement('div');list.className='trip-replay-day-items';
    day.done.forEach(function(item){var row=document.createElement('p');row.className='is-completed';row.innerHTML='<i class="fa-solid fa-location-dot" aria-hidden="true"></i><span></span>';row.querySelector('span').textContent=(item.time?item.time+' · ':'')+item.title;list.appendChild(row)});
    day.memories.forEach(function(item){var row=document.createElement('p');row.className='is-memory';row.innerHTML='<i class="fa-solid fa-quote-right" aria-hidden="true"></i><span></span>';row.querySelector('span').textContent=item.note;list.appendChild(row)});
    article.appendChild(list);timeline.appendChild(article)
  })
}
window.TravelMateTripReplay=Object.freeze({build:buildReplay,narrative:narrative,prompt:prompt,render:render});
window.addEventListener('travelmate:feature-ready',function(event){if(event.detail&&/^(memories|summary)$/.test(event.detail.view||''))render()});
document.addEventListener('travelmate:planner-rendered',function(){if(document.getElementById('memories'))render()});
window.addEventListener('travelmate:places-updated',function(){if(document.getElementById('memories'))render()});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(render,0)});else setTimeout(render,0);
})();
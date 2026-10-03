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
function safeMoney(amount,currency){
  try{return new Intl.NumberFormat('he-IL',{style:'currency',currency:currency,maximumFractionDigits:2}).format(amount)}
  catch(error){return amount+' '+currency}
}
function buildReplay(current){
  current=current||{};
  var done=completedItems(current),notes=memories(current),byDate=Object.create(null);
  var analytics=window.TravelMateTripAnalytics&&typeof window.TravelMateTripAnalytics.build==='function'
    ? window.TravelMateTripAnalytics.build(current)
    : null;
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
    analytics:analytics,
    days:dates.map(function(date){return Object.freeze({date:date,done:byDate[date].done.slice(),memories:byDate[date].memories.slice()})})
  })
}
function formatDate(value){
  try{return new Intl.DateTimeFormat('he-IL',{weekday:'long',day:'numeric',month:'long'}).format(new Date(value+'T12:00:00'))}
  catch(error){return value}
}
function movementModeFacts(movement){var labels={walk:'\u05d4\u05dc\u05d9\u05db\u05d4',bike:'\u05d0\u05d5\u05e4\u05e0\u05d9\u05d9\u05dd',drive:'\u05e8\u05db\u05d1',taxi:'\u05de\u05d5\u05e0\u05d9\u05ea',transit:'\u05ea\u05d7\u05d1\u05d5\u05e8\u05d4 \u05e6\u05d9\u05d1\u05d5\u05e8\u05d9\u05ea',metro:'\u05de\u05d8\u05e8\u05d5',rail:'\u05e8\u05db\u05d1\u05ea'},icons={walk:'fa-person-walking',bike:'fa-bicycle',drive:'fa-car',taxi:'fa-taxi',transit:'fa-bus-simple',metro:'fa-train-subway',rail:'fa-train'};return Object.keys(labels).map(function(mode){var item=movement&&movement.byMode&&movement.byMode[mode];return item&&item.segments?{mode:mode,label:labels[mode],icon:icons[mode],segments:item.segments,distanceKm:Number(item.distanceKm||0),travelMinutes:Number(item.travelMinutes||0),manualTimeSegments:Number(item.manualTimeSegments||0)}:null}).filter(Boolean)}
function narrative(data){
  var lines=[];
  if(data.completed)lines.push('סומנו '+data.completed+' פעילויות ומקומות כהושלמו מתוך '+data.planned+' פריטים שתוזמנו.');
  else if(data.planned)lines.push('יש '+data.planned+' פריטים מתוכננים, אך עדיין לא סומנו פעילויות או מקומות כהושלמו.');
  if(data.memories)lines.push('נשמרו '+data.memories+' רגעים מהטיול'+(data.attachments?' עם '+data.attachments+' קבצים מצורפים.':'.'));
  if(data.expenses)lines.push('נרשמו '+data.expenses+' הוצאות'+(data.expenseLabel?' בסכום כולל של '+data.expenseLabel+'.':'.'));
  if(data.analytics&&data.analytics.movement){var modeFacts=movementModeFacts(data.analytics.movement).filter(function(item){return item.distanceKm>0||item.travelMinutes>0});if(modeFacts.length){var modeText=modeFacts.map(function(item){return item.distanceKm>0?item.distanceKm+' \u05e7\u05f4\u05de '+item.label:item.travelMinutes+' \u05d3\u05e7\u05f3 '+item.label}).join(' · ');lines.push('\u05dc\u05e4\u05d9 \u05d4\u05e0\u05ea\u05d5\u05e0\u05d9\u05dd \u05d4\u05d6\u05de\u05d9\u05e0\u05d9\u05dd: '+modeText+'. \u05de\u05e8\u05d7\u05e7\u05d9\u05dd \u05de\u05d7\u05d5\u05e9\u05d1\u05d9\u05dd \u05dc\u05e4\u05d9 \u05e7\u05d5\u05d0\u05d5\u05e8\u05d3\u05d9\u05e0\u05d8\u05d5\u05ea; \u05d6\u05de\u05e0\u05d9 \u05de\u05e2\u05d1\u05e8 \u05e9\u05d4\u05d5\u05d6\u05e0\u05d5 \u05d9\u05d3\u05e0\u05d9\u05ea \u05e0\u05e9\u05de\u05e8\u05d9\u05dd \u05db\u05e0\u05ea\u05d5\u05df \u05de\u05d0\u05d5\u05de\u05ea'+(data.analytics.movement.explicitModeCoverage<1?' \u05d5\u05d7\u05dc\u05e7 \u05de\u05d0\u05de\u05e6\u05e2\u05d9 \u05d4\u05de\u05e2\u05d1\u05e8 \u05d4\u05d5\u05e1\u05e7\u05d5 \u05d0\u05d5\u05d8\u05d5\u05de\u05d8\u05d9\u05ea.':'.'));}}
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
  card.innerHTML='<header class="trip-replay-head"><div><small>Trip Replay · 2.4</small><h2>הטיול שלך, לפי מה שבאמת קרה</h2><p data-trip-replay-summary></p></div><button type="button" data-trip-replay-ai><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i><span>סיפור עם Mate</span></button></header><div class="trip-replay-stats" data-trip-replay-stats></div><div class="trip-replay-timeline" data-trip-replay-timeline></div>';
  var summary=section.querySelector('.trip-summary-card');if(summary&&summary.parentNode)summary.parentNode.insertBefore(card,summary);else section.appendChild(card);
  card.querySelector('[data-trip-replay-ai]').addEventListener('click',function(){
    var current=trip(),data=buildReplay(current||{});
    if(window.TravelMateEvents&&window.TravelMateEvents.emit)window.TravelMateEvents.emit(window.TravelMateEvents.names.askAi,{prompt:prompt(data),source:'trip-replay'});
  });
  return card
}
function render(){
  var current=trip(),card=ensureCard();if(!current||!card)return;
  var data=buildReplay(current),summary=card.querySelector('[data-trip-replay-summary]'),stats=card.querySelector('[data-trip-replay-stats]'),timeline=card.querySelector('[data-trip-replay-timeline]');
  summary.textContent=narrative(data);
  var statItems=[
    ['fa-circle-check','הושלמו',String(data.completed)],
    ['fa-calendar-check','תוכננו',String(data.planned)],
    ['fa-bookmark','נשמרו לרעיונות',String(data.savedOnly)],
    ['fa-camera','רגעים',String(data.memories)]
  ];
  if(data.expenses)statItems.push(['fa-wallet','הוצאות',data.expenseLabel||String(data.expenses)]);
  if(data.analytics&&data.analytics.movement){movementModeFacts(data.analytics.movement).forEach(function(item){if(item.distanceKm>0)statItems.push([item.icon,item.label+' · \u05de\u05e9\u05d5\u05e2\u05e8',item.distanceKm+' \u05e7\u05f4\u05de']);else if(item.travelMinutes>0)statItems.push([item.icon,item.label+(item.manualTimeSegments===item.segments?' · \u05d6\u05de\u05df \u05e9\u05d4\u05d5\u05d6\u05df':' · \u05d6\u05de\u05df \u05de\u05e9\u05d5\u05e2\u05e8'),item.travelMinutes+' \u05d3\u05e7\u05f3'])});if(data.analytics.movement.travelMinutes>0)statItems.push(['fa-clock','\u05d6\u05de\u05df \u05e0\u05e1\u05d9\u05e2\u05d4/\u05de\u05e2\u05d1\u05e8',Math.round(data.analytics.movement.travelMinutes/60*10)/10+' \u05e9\u05e2\u05d5\u05ea']);
  }
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
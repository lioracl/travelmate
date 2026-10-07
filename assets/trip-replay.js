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
function title(item){return clean(item&&(item.title||item.name))||'פריט ללא שם'}
function completedItems(current){
  var activities=(current.activities||[]).filter(function(item){return item&&item.done===true&&itemDate(item)}).map(function(item){return{kind:'activity',date:itemDate(item),time:clean(item.time),title:title(item),category:clean(item.category)}});
  var places=(current.savedPlaces||[]).filter(function(item){return item&&item.done===true&&itemDate(item)}).map(function(item){return{kind:'place',date:itemDate(item),time:clean(item.time),title:title(item),category:clean(item.category)}});
  return activities.concat(places).sort(function(a,b){return String(a.date).localeCompare(String(b.date))||String(a.time).localeCompare(String(b.time))})
}
function plannedCount(current){return (current.activities||[]).length+(current.savedPlaces||[]).filter(function(item){return item&&item.date}).length}
function unscheduledSavedCount(current){return (current.savedPlaces||[]).filter(function(item){return item&&!item.date}).length}
function memories(current){
  return (current.memories||[]).map(function(item){return{date:itemDate(item),note:clean(item.note),attachments:Array.isArray(item.attachments)?item.attachments.length:0}}).filter(function(item){return item.note})
}
function fallbackExpenseTotals(current){var totals={};(current.expenses||[]).forEach(function(item){var amount=Number(item&&item.amount),raw=clean(item&&item.currency).toUpperCase(),code=/^[A-Z]{3}$/.test(raw)?raw:'UNKNOWN';if(!Number.isFinite(amount)||amount<0)return;totals[code]=(totals[code]||0)+amount});return totals}
function expenseTotal(current){var totals=fallbackExpenseTotals(current),codes=Object.keys(totals);return codes.length===1?totals[codes[0]]:0}
function expenseCurrency(current){var codes=Object.keys(fallbackExpenseTotals(current));return codes.length===1?codes[0]:''}
function safeMoney(amount,currency){if(currency==='UNKNOWN')return Number(amount||0)+' · מטבע לא ידוע';try{return new Intl.NumberFormat('he-IL',{style:'currency',currency:currency,maximumFractionDigits:2}).format(amount)}catch(error){return amount+' '+currency}}

function expenseLabels(summary,current){var totals=summary&&summary.totals&&Object.keys(summary.totals).length?summary.totals:fallbackExpenseTotals(current);return Object.keys(totals||{}).sort().map(function(code){return safeMoney(totals[code],code)})}
function confidenceText(status){return status==='confirmed'?'\u05de\u05d0\u05d5\u05de\u05ea':status==='estimated'?'\u05d4\u05e2\u05e8\u05db\u05d4':'\u05d0\u05d9\u05df \u05de\u05e1\u05e4\u05d9\u05e7 \u05e0\u05ea\u05d5\u05e0\u05d9\u05dd'}
function movementSummary(movement){return movementModeFacts(movement).filter(function(item){return item.distanceKm>0||item.travelMinutes>0}).map(function(item){return item.distanceKm>0?item.label+' '+item.distanceKm+' \u05e7\u05f4\u05de':item.label+' '+item.travelMinutes+' \u05d3\u05e7\u05f3'}).join(' · ')}
function dayMoney(totals){return Object.keys(totals||{}).sort().map(function(code){return safeMoney(totals[code],code)}).join(' · ')}
function buildReplay(current){
  current=current||{};
  var done=completedItems(current),notes=memories(current),byDate=Object.create(null);
  var analytics=window.TravelMateTripAnalytics&&typeof window.TravelMateTripAnalytics.build==='function'
    ? window.TravelMateTripAnalytics.build(current)
    : null;
  done.forEach(function(item){if(!item.date)return;(byDate[item.date]||(byDate[item.date]={done:[],memories:[]})).done.push(item)});
  notes.forEach(function(item){if(!item.date)return;(byDate[item.date]||(byDate[item.date]={done:[],memories:[]})).memories.push(item)});
  var dates=Object.keys(byDate).sort(),expenseSummary=analytics&&analytics.expenses||null,labels=expenseLabels(expenseSummary,current),codes=expenseSummary?Object.keys(expenseSummary.totals||{}):[],total=codes.length===1?Number(expenseSummary.totals[codes[0]]||0):labels.length===1?expenseTotal(current):0,currency=codes[0]||expenseCurrency(current);
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
    expenseLabel:labels.join(' · '),
    expenseLabels:Object.freeze(labels.slice()),
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
  if(data.expenses)lines.push('נרשמו '+data.expenses+' הוצאות'+(data.expenseLabel?' לפי מטבע: '+data.expenseLabel+'.':'.'));
  if(data.analytics&&data.analytics.movement){var modeFacts=movementModeFacts(data.analytics.movement).filter(function(item){return item.distanceKm>0||item.travelMinutes>0});if(modeFacts.length){var modeText=modeFacts.map(function(item){return item.distanceKm>0?item.distanceKm+' \u05e7\u05f4\u05de '+item.label:item.travelMinutes+' \u05d3\u05e7\u05f3 '+item.label}).join(' · ');lines.push('\u05dc\u05e4\u05d9 \u05d4\u05e0\u05ea\u05d5\u05e0\u05d9\u05dd \u05d4\u05d6\u05de\u05d9\u05e0\u05d9\u05dd: '+modeText+'. \u05de\u05e8\u05d7\u05e7\u05d9\u05dd \u05de\u05d7\u05d5\u05e9\u05d1\u05d9\u05dd \u05dc\u05e4\u05d9 \u05e7\u05d5\u05d0\u05d5\u05e8\u05d3\u05d9\u05e0\u05d8\u05d5\u05ea; \u05d6\u05de\u05e0\u05d9 \u05de\u05e2\u05d1\u05e8 \u05e9\u05d4\u05d5\u05d6\u05e0\u05d5 \u05d9\u05d3\u05e0\u05d9\u05ea \u05e0\u05e9\u05de\u05e8\u05d9\u05dd \u05db\u05e0\u05ea\u05d5\u05df \u05de\u05d0\u05d5\u05de\u05ea'+(data.analytics.movement.explicitModeCoverage<1?' \u05d5\u05d7\u05dc\u05e7 \u05de\u05d0\u05de\u05e6\u05e2\u05d9 \u05d4\u05de\u05e2\u05d1\u05e8 \u05d4\u05d5\u05e1\u05e7\u05d5 \u05d0\u05d5\u05d8\u05d5\u05de\u05d8\u05d9\u05ea.':'.'));}}
  if(data.savedOnly)lines.push(data.savedOnly+' מקומות נשמרו כרעיונות בלי תאריך ולכן אינם נספרים כביקורים.');
  if(!lines.length)lines.push('ככל שתסמן פעילויות כהושלמו ותשמור רגעים, ה־Replay ייבנה אוטומטית.');
  return lines.join(' ')
}
function prompt(data){
  var dayFacts=data.days.map(function(day){var completed=day.done.map(function(item){return item.title}).join(', ');return [day.date,completed?'הושלם: '+completed:''].filter(Boolean).join(' — ')}).join('\n');
  return 'כתוב Trip Replay בעברית לטיול ב'+(data.destination||'היעד')+'. השתמש רק בעובדות שסופקו, בלי להמציא ביקורים. פריט נחשב ביקור רק אם סומן כהושלם. אל תבקש ואל תכלול תוכן של זיכרונות פרטיים; מספר הזיכרונות בלבד נכלל בסיכום. נתונים: '+narrative(data)+'\nציר זמן עובדתי:\n'+(dayFacts||'אין עדיין פריטי ציר זמן.')+'\nסיים ב-3 נקודות קצרות: רגעים בולטים לפי ביקורים מאומתים, קצב הטיול, ומה כדאי לזכור לפעם הבאה.'
}
var summaryMap=null,summaryMapPromise=null,summaryMapSignature='',summaryMapDataSignature='',summaryMapRequestId=0;
function loadSummaryMapLibrary(){if(window.maplibregl)return Promise.resolve(window.maplibregl);if(summaryMapPromise)return summaryMapPromise;summaryMapPromise=new Promise(function(resolve,reject){var css=document.querySelector('link[href*="maplibre-gl"]');if(!css){css=document.createElement('link');css.rel='stylesheet';css.href='https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.css';document.head.appendChild(css)}var script=document.createElement('script');script.src='https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.js';script.onload=function(){resolve(window.maplibregl)};script.onerror=function(){summaryMapPromise=null;reject(new Error('MAP_LIBRARY_FAILED'))};document.head.appendChild(script)});return summaryMapPromise}
function renderConfidence(card,data){var node=card.querySelector('[data-trip-summary-confidence]');if(!node)return;node.innerHTML='';var status=data.analytics&&data.analytics.status||{},items=[['\u05d1\u05d9\u05e7\u05d5\u05e8\u05d9\u05dd','confirmed'],['\u05de\u05e8\u05d7\u05e7',status.distance||'unknown'],['\u05d6\u05de\u05df \u05de\u05e2\u05d1\u05e8',status.travelTime||'unknown'],['\u05d4\u05d5\u05e6\u05d0\u05d5\u05ea',status.expenses||'confirmed']];items.forEach(function(item){var chip=document.createElement('span');chip.className='trip-summary-confidence-chip is-'+item[1];chip.textContent=item[0]+' · '+confidenceText(item[1]);node.appendChild(chip)})}
function renderExpenseBreakdown(card,data){var node=card.querySelector('[data-trip-summary-expenses]');if(!node)return;node.innerHTML='';var expenses=data.analytics&&data.analytics.expenses;if(!expenses||!expenses.count){node.hidden=true;return}node.hidden=false;var title=document.createElement('h3');title.textContent='\u05d4\u05d5\u05e6\u05d0\u05d5\u05ea \u05d5\u05e8\u05db\u05d9\u05e9\u05d5\u05ea \u05e9\u05e0\u05e8\u05e9\u05de\u05d5';node.appendChild(title);var list=document.createElement('div');list.className='trip-summary-expense-list';expenses.categories.slice(0,6).forEach(function(item){var row=document.createElement('p'),name=document.createElement('strong'),value=document.createElement('span');name.textContent=item.name+' · '+item.count;value.textContent=dayMoney(item.totals);row.append(name,value);list.appendChild(row)});node.appendChild(list)}
function renderDailySummary(card,data){var node=card.querySelector('[data-trip-summary-days]');if(!node)return;node.innerHTML='';var days=data.analytics&&data.analytics.summaryDays||[];if(!days.length){node.hidden=true;return}node.hidden=false;days.forEach(function(day){var article=document.createElement('article'),head=document.createElement('h3'),facts=document.createElement('div');head.textContent=formatDate(day.date);facts.className='trip-summary-day-facts';var visit=document.createElement('span');visit.textContent=day.completedVisits?day.completedVisits+' \u05d1\u05d9\u05e7\u05d5\u05e8\u05d9\u05dd \u05e9\u05d4\u05d5\u05e9\u05dc\u05de\u05d5':'\u05d0\u05d9\u05df \u05d1\u05d9\u05e7\u05d5\u05e8\u05d9\u05dd \u05e9\u05e1\u05d5\u05de\u05e0\u05d5 \u05db\u05d4\u05d5\u05e9\u05dc\u05de\u05d5';facts.appendChild(visit);var move=movementSummary(day.movement);if(move){var movement=document.createElement('span');movement.textContent=move;facts.appendChild(movement)}if(day.expenseCount){var expense=document.createElement('span');expense.textContent=day.expenseCount+' \u05d4\u05d5\u05e6\u05d0\u05d5\u05ea · '+dayMoney(day.expenseTotals);facts.appendChild(expense)}article.append(head,facts);node.appendChild(article)})}
function prepareRouteMap(card,data){
  var shell=card.querySelector('[data-trip-summary-map-shell]'),button=card.querySelector('[data-trip-summary-map-toggle]'),mapNode=card.querySelector('[data-trip-summary-map]'),status=card.querySelector('[data-trip-summary-map-status]'),points=data.analytics&&data.analytics.route&&data.analytics.route.points||[];
  if(!shell||!button||!mapNode||!status)return;
  var signature=points.map(function(point){return point.date+'@'+point.id+'@'+point.lat+','+point.lon}).join('|');
  if(summaryMapDataSignature!==signature){summaryMapDataSignature=signature;summaryMapRequestId+=1;if(summaryMap){summaryMap.remove();summaryMap=null;summaryMapSignature=''}}
  shell.hidden=points.length<2;
  if(points.length<2){mapNode.hidden=true;button.setAttribute('aria-expanded','false');return}
  status.textContent=points.length+' נקודות ביקור עם מיקום שמור. הקווים מחברים רק ביקורים מאותו יום והם המחשה משוערת, לא תיעוד GPS. המפה נטענת רק בלחיצה; OpenFreeMap מקבל את אזור המפה, ללא בקשת GPS חדשה.';
  button.onclick=async function(){
    var opening=mapNode.hidden;mapNode.hidden=!opening;button.setAttribute('aria-expanded',String(opening));button.querySelector('span').textContent=opening?'הסתר מפת ביקורים':'הצג מפת ביקורים';if(!opening)return;
    if(summaryMap&&summaryMapSignature===signature){setTimeout(function(){summaryMap.resize()},40);return}
    var requestId=++summaryMapRequestId;status.textContent='טוען מפת ביקורים מסכמת…';
    try{var MapLibre=await loadSummaryMapLibrary();if(requestId!==summaryMapRequestId||signature!==summaryMapDataSignature||mapNode.hidden)return;
      summaryMapSignature=signature;summaryMap=new MapLibre.Map({container:mapNode,style:'https://tiles.openfreemap.org/styles/liberty',center:[points[0].lon,points[0].lat],zoom:12,attributionControl:false});
      summaryMap.addControl(new MapLibre.NavigationControl(),'top-left');summaryMap.addControl(new MapLibre.AttributionControl({compact:true}),'bottom-right');
      summaryMap.on('load',function(){if(requestId!==summaryMapRequestId||signature!==summaryMapDataSignature)return;var byDate={};points.forEach(function(point){(byDate[point.date]||(byDate[point.date]=[])).push(point)});var features=Object.keys(byDate).sort().map(function(date){var day=byDate[date];return day.length>1?{type:'Feature',properties:{date:date},geometry:{type:'LineString',coordinates:day.map(function(point){return[point.lon,point.lat]})}}:null}).filter(Boolean);summaryMap.addSource('travelmate-summary-route',{type:'geojson',data:{type:'FeatureCollection',features:features}});summaryMap.addLayer({id:'travelmate-summary-route-line',type:'line',source:'travelmate-summary-route',paint:{'line-width':4,'line-opacity':.72}});var bounds=new MapLibre.LngLatBounds();points.forEach(function(point,index){bounds.extend([point.lon,point.lat]);var marker=document.createElement('span');marker.className='trip-summary-map-marker';marker.textContent=String(index+1);marker.setAttribute('role','img');marker.setAttribute('aria-label',(point.title||'ביקור')+' · '+point.date);new MapLibre.Marker({element:marker}).setLngLat([point.lon,point.lat]).addTo(summaryMap)});summaryMap.fitBounds(bounds,{padding:48,maxZoom:15,duration:0});status.textContent=points.length+' נקודות ביקור מאומתות · הקווים הם חיבור משוער בתוך כל יום בלבד.'})
    }catch(error){if(requestId!==summaryMapRequestId)return;mapNode.hidden=true;button.setAttribute('aria-expanded','false');button.querySelector('span').textContent='הצג מפת ביקורים';status.textContent=navigator.onLine===false?'המפה דורשת חיבור לרשת. סיכום הטיול נשאר זמין גם Offline.':'לא הצלחנו לטעון את המפה כרגע.'}
  }
}
function ensureCard(){
  var section=document.getElementById('memories');if(!section)return null;
  var existing=section.querySelector('[data-trip-replay]');if(existing)return existing;
  var card=document.createElement('article');card.className='trip-replay-card';card.dataset.tripReplay='';
  card.innerHTML='<header class="trip-replay-head"><div><small>Trip Summary & Replay · 2.12</small><h2>הטיול שלך, לפי מה שבאמת קרה</h2><p data-trip-replay-summary></p></div><button type="button" data-trip-replay-ai><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i><span>סיפור עם Mate</span></button></header><div class="trip-summary-confidence" data-trip-summary-confidence aria-label="אמינות נתוני הסיכום"></div><div class="trip-replay-stats" data-trip-replay-stats></div><section class="trip-summary-expenses" data-trip-summary-expenses></section><section class="trip-summary-days" data-trip-summary-days aria-label="סיכום לפי יום"></section><section class="trip-summary-map-shell" data-trip-summary-map-shell hidden><header><div><h3>מפת נקודות הביקור</h3><p data-trip-summary-map-status></p></div><button type="button" data-trip-summary-map-toggle aria-expanded="false"><i class="fa-solid fa-map-location-dot" aria-hidden="true"></i><span>הצג מפת ביקורים</span></button></header><div class="trip-summary-map" data-trip-summary-map role="region" aria-label="מפת נקודות הביקור" hidden></div></section><div class="trip-replay-timeline" data-trip-replay-timeline></div>';
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
  renderConfidence(card,data);renderExpenseBreakdown(card,data);renderDailySummary(card,data);prepareRouteMap(card,data);
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
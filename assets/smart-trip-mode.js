(function(root,factory){
  'use strict';
  var api=factory(root||null);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(!root)return;
  if(root.TravelMateSmartTripMode)return;
  root.TravelMateSmartTripMode=Object.freeze(api);
  if(root.document)api.mount();
})(typeof window==='undefined'?null:window,function(win){
  'use strict';

  function clean(value){return String(value==null?'':value).trim()}
  function finite(value){if(value===null||value===undefined||String(value).trim()==='')return null;var number=Number(value);return Number.isFinite(number)?number:null}
  function clockMinutes(value){var match=String(value||'').match(/^(\d{1,2}):(\d{2})/);return match?Number(match[1])*60+Number(match[2]):null}
  function nowMinutes(value){var date=value instanceof Date?value:new Date(value||Date.now());return date.getHours()*60+date.getMinutes()}
  function roundWindow(value){var minutes=Math.max(0,Math.round(Number(value)||0));if(minutes<60)return minutes+' דקות';var hours=Math.floor(minutes/60),rest=minutes%60;if(!rest)return hours===1?'שעה':hours+' שעות';return (hours===1?'שעה':hours+' שעות')+' ו־'+rest+' דקות'}
  function categoryLabel(key){var labels={restaurants:'אוכל',cafes:'בתי קפה',bakeries:'מאפיות',markets:'שווקים',parks:'פארקים',viewpoints:'תצפיות',beaches:'חופים',museums:'מוזיאונים',attractions:'אטרקציות',historic:'אתרים היסטוריים',malls:'קניונים',clothing:'קניות',bars:'ברים',nightclubs:'חיי לילה',zoos:'גני חיות',theme_parks:'פארקי שעשועים'};return labels[key]||'מקומות'}
  function weatherSignal(snapshot){
    snapshot=snapshot||{};
    if(snapshot.ready!==true)return Object.freeze({kind:'unknown',label:'תחזית עדיין לא זמינה',icon:'fa-cloud'});
    var code=finite(snapshot.weatherCode),rain=finite(snapshot.precipitationProbability),wind=finite(snapshot.windSpeed),uv=finite(snapshot.uvIndex),max=finite(snapshot.maxTemperature);
    if(code!==null&&code>=95)return Object.freeze({kind:'storm',label:'סופות רעמים',icon:'fa-cloud-bolt'});
    if((code!==null&&((code>=51&&code<=67)||(code>=80&&code<=82)))||(rain!==null&&rain>=60))return Object.freeze({kind:'rain',label:rain!==null?'גשם '+Math.round(rain)+'%':'גשם',icon:'fa-umbrella'});
    if(wind!==null&&wind>=35)return Object.freeze({kind:'wind',label:'רוח '+Math.round(wind)+' קמ״ש',icon:'fa-wind'});
    if((uv!==null&&uv>=7)||(max!==null&&max>=32))return Object.freeze({kind:'heat',label:uv!==null&&uv>=7?'UV '+Math.round(uv):'חם '+Math.round(max)+'°',icon:'fa-sun'});
    return Object.freeze({kind:'normal',label:clean(snapshot.currentLabel)||'מזג אוויר נוח',icon:'fa-cloud-sun'});
  }
  function firstInterest(personalization){var list=personalization&&Array.isArray(personalization.interests)?personalization.interests:[];return list[0]||null}
  function preferredCategory(personalization,weather){
    var blocked=personalization&&personalization.blockedCategoryKeys||[],categories=(personalization&&Array.isArray(personalization.categoryKeys)?personalization.categoryKeys:[]).filter(function(key){return blocked.indexOf(key)<0});
    if(weather&&/^(storm|rain|wind|heat)$/.test(weather.kind)){
      var indoor=['museums','cafes','malls','markets','attractions'];
      for(var i=0;i<indoor.length;i+=1)if(categories.indexOf(indoor[i])>=0)return indoor[i];
      return indoor.find(function(key){return blocked.indexOf(key)<0})||''
    }
    return categories[0]||''
  }
  function signal(icon,label){return Object.freeze({icon:icon,label:label})}
  function action(label,href,category){return Object.freeze({label:label,href:href,categoryKey:category||''})}
  function freezeSuggestion(value){
    value.signals=Object.freeze(value.signals||[]);
    value.action=Object.freeze(value.action||{});
    value.signature=[value.phase,value.kind,value.anchorId||'',value.weatherKind||'',value.action.categoryKey||''].join('|');
    return Object.freeze(value)
  }
  function firstFreeWindow(context,trip,today,now){
    if(!context||typeof context.freeTimeWindowsForDate!=='function')return null;
    var start=context.clockTime?context.clockTime(nowMinutes(now)):String(Math.floor(nowMinutes(now)/60)).padStart(2,'0')+':'+String(nowMinutes(now)%60).padStart(2,'0');
    var windows=context.freeTimeWindowsForDate(trip,today,{startTime:start,endTime:'22:00',minimumMinutes:45,bufferMinutes:10});
    return Array.isArray(windows)&&windows.length?windows[0]:null
  }
  function transitionForNext(context,trip,today,next){
    if(!context||typeof context.transitionAssessmentsForDate!=='function'||!next)return null;
    var assessments=context.transitionAssessmentsForDate(trip,today,{bufferMinutes:10})||{};
    return assessments[next.kind+':'+String(next.record&&next.record.id||'')]||null
  }
  function buildSuggestion(trip,now,personalization,weatherSnapshot,helpers){
    helpers=helpers||{};
    var today=helpers.today||(win&&win.TravelMateToday),context=helpers.context||(win&&win.TravelMateTripContext);
    if(!trip||!today||typeof today.model!=='function')return null;
    var moment=now instanceof Date?now:new Date(now||Date.now()),model=today.model(trip,moment),phase=String(model.phase||'').toLowerCase(),weather=weatherSignal(weatherSnapshot),interest=firstInterest(personalization),category=preferredCategory(personalization,weather),signals=[];
    if(phase==='before'){
      var countdown=Number(model.daysUntilStart||0),first=model.firstScheduled;
      signals.push(signal('fa-calendar-day',countdown===1?'הטיול מתחיל מחר':'עוד '+countdown+' ימים'));
      if(interest)signals.push(signal('fa-heart',interest.label));
      return freezeSuggestion({phase:'before',kind:'prepare',anchorId:first&&first.id||'',weatherKind:weather.kind,icon:'fa-suitcase-rolling',eyebrow:'Smart Trip Mode',title:countdown===1?'מחר יוצאים לדרך — בדיקה קצרה לפני היציאה':'הטיול מתקרב — אפשר לסגור את היום הראשון',body:first?'הפריט הראשון כבר בתוכנית. כדאי לעבור על היום הראשון ולוודא ששעות ומעברים עדיין מתאימים.':'היום הראשון עדיין פתוח. אפשר לסדר אותו עכשיו בלי להעמיס את שאר הטיול.',signals:signals,action:action('פתח את היום הראשון','#plan','')})
    }
    if(phase==='after'){
      signals.push(signal('fa-circle-check',Number(model.completedTotal||0)+' פריטים הושלמו'));
      return freezeSuggestion({phase:'after',kind:'recap',anchorId:'',weatherKind:'',icon:'fa-flag-checkered',eyebrow:'Smart Trip Mode',title:'הטיול הסתיים — זמן טוב לסיכום',body:'אפשר לעבור על המקומות שסימנת כהושלמו ולפתוח את סיכום הטיול בלי לשנות את התוכנית המקורית.',signals:signals,action:action('פתח סיכום טיול','#memories','')})
    }
    var current=model.currentOrNext&&model.currentOrNext.state==='current'?model.currentOrNext:null;
    if(current){
      signals.push(signal('fa-play','עכשיו בתוכנית'));
      if(weather.kind!=='unknown')signals.push(signal(weather.icon,weather.label));
      return freezeSuggestion({phase:'active',kind:'current',anchorId:String(current.id||''),weatherKind:weather.kind,icon:'fa-location-dot',eyebrow:'Smart Trip Mode',title:'עכשיו: '+clean(current.title||'הפעילות הנוכחית'),body:'אין צורך להעמיס עוד החלטה כרגע. כשתסיים, TravelMate יעדכן את ההצעה לפי מה שנשאר ביום.',signals:signals,action:action('פתח את תוכנית היום','#plan','')})
    }
    var nextFixed=context&&typeof context.nextFixedActivity==='function'?context.nextFixedActivity(trip,moment):null,nextStart=nextFixed?finite(nextFixed.start):null,until=nextStart===null?null:Math.max(0,nextStart-nowMinutes(moment)),transition=transitionForNext(context,trip,model.today,nextFixed);
    if(nextFixed&&transition&&transition.risk&&until!==null&&until<=120){
      signals.push(signal('fa-route','מעבר כ־'+Math.round(transition.travelMinutes)+' דק׳'));
      if(transition.latestDepartureTime)signals.push(signal('fa-clock','יציאה מומלצת '+transition.latestDepartureTime));
      if(weather.kind!=='unknown')signals.push(signal(weather.icon,weather.label));
      return freezeSuggestion({phase:'active',kind:'transition',anchorId:String(nextFixed.record&&nextFixed.record.id||''),weatherKind:weather.kind,icon:'fa-route',eyebrow:'Smart Trip Mode',title:'כדאי להתכונן למעבר ל־'+clean(nextFixed.record&& (nextFixed.record.title||nextFixed.record.name)||'הפעילות הבאה'),body:'לפי זמני התוכנית והערכת המעבר, המרווח צפוף. זו התראה מייעצת בלבד — TravelMate לא מזיז דבר אוטומטית.',signals:signals,action:action('בדוק את הרצף בתוכנית','#plan','')})
    }
    if(nextFixed&&until!==null&&until<=45){
      signals.push(signal('fa-clock','בעוד '+until+' דק׳'));
      if(weather.kind!=='unknown')signals.push(signal(weather.icon,weather.label));
      var weatherNote=/^(storm|rain)$/.test(weather.kind)?' התחזית גשומה, אז כדאי לצאת מצויד בהתאם.':'';
      return freezeSuggestion({phase:'active',kind:'prepare-next',anchorId:String(nextFixed.record&&nextFixed.record.id||''),weatherKind:weather.kind,icon:'fa-bell',eyebrow:'Smart Trip Mode',title:'התחייבות קרובה: '+clean(nextFixed.record&&(nextFixed.record.title||nextFixed.record.name)||'הפעילות הבאה'),body:'נשארו פחות מ־45 דקות עד ההתחלה. זה זמן טוב לסיים מה שעושים ולהתכונן ליציאה.'+weatherNote,signals:signals,action:action('פתח את הפעילות בתוכנית','#plan','')})
    }
    var prefs=personalization&&personalization.profile2||{},pace=personalization&&personalization.travelPace||'',fitService=helpers.personalized||(win&&win.TravelMatePersonalizedSuggestions),reason=fitService&&fitService.profileReason?fitService.profileReason(personalization):'';
    if(fitService&&fitService.activeAt&&!fitService.activeAt(personalization,moment))return freezeSuggestion({phase:'active',kind:'preferred-hours',icon:'fa-moon',eyebrow:'Smart Trip Mode',title:'מחוץ לשעות הפעילות שבחרת',body:'אפשר להשאיר את הזמן פנוי. ההעדפה אינה משנה פעילויות שכבר בתוכנית.',signals:signals,profileReason:reason,action:action('בדוק את תוכנית היום','#plan','')});
    var fixedFree=context&&typeof context.availableMinutesUntilNextFixed==='function'?context.availableMinutesUntilNextFixed(trip,moment,30):null,windowFree=firstFreeWindow(context,trip,model.today,moment),freeCandidates=[];
    if(fixedFree!==null&&fixedFree!==undefined&&Number.isFinite(Number(fixedFree)))freeCandidates.push(Number(fixedFree));
    if(windowFree&&Number.isFinite(Number(windowFree.durationMinutes)))freeCandidates.push(Number(windowFree.durationMinutes));
    var freeMinutes=freeCandidates.length?Math.max(0,Math.min.apply(Math,freeCandidates)):null;
    if(freeMinutes!==null&&freeMinutes>=45){
      signals.push(signal('fa-hourglass-half',roundWindow(freeMinutes)+' פנויות'));
      if(weather.kind!=='unknown')signals.push(signal(weather.icon,weather.label));
      if(interest)signals.push(signal(interest.source==='learned'?'fa-check':'fa-heart',interest.label));
      var constrained=/^(storm|rain|wind|heat)$/.test(weather.kind),blocked=personalization&&personalization.blockedCategoryKeys||[],target=category||['attractions','cafes','parks'].find(function(key){return blocked.indexOf(key)<0})||'';
      if(!target||(pace==='relaxed'&&freeMinutes<90)||(prefs.spontaneity==='planned'&&freeMinutes<60))return freezeSuggestion({phase:'active',kind:'rest-window',icon:'fa-mug-hot',eyebrow:'Smart Trip Mode',title:'אפשר להשאיר את החלון למנוחה',body:'לפי הבחירות המפורשות שלך, אין צורך להעמיס פעילות נוספת בחלון קצר.',signals:signals,profileReason:reason,action:action('פתח את תוכנית היום','#plan','')});
      var body=constrained?'מזג האוויר מצדיק בחירה נוחה יותר. '+(interest?'לפי '+interest.label+', ':'')+'אפשר לפתוח קודם '+categoryLabel(target)+' ולבחור בעצמך מקום שמתאים לחלון הזמן.':interest?'אפשר לנצל את החלון למשהו שמתאים ל־'+interest.label+'. TravelMate יפתח את '+categoryLabel(target)+' לבחירה, בלי לחפש ובלי לבקש מיקום עד שתבחר.':'אפשר לנצל את החלון למקום קטן בדרך. החיפוש יתחיל רק אם תבקש אותו במסך מקומות.';
      return freezeSuggestion({phase:'active',kind:constrained?'weather-window':'free-window',anchorId:nextFixed&&String(nextFixed.record&&nextFixed.record.id||'')||'',weatherKind:weather.kind,icon:constrained?weather.icon:'fa-wand-magic-sparkles',eyebrow:'Smart Trip Mode',title:constrained?'יש לך '+roundWindow(freeMinutes)+' — עדיף משהו נוח למזג האוויר':'יש לך '+roundWindow(freeMinutes)+' פנויות',body:body,profileReason:reason,signals:signals,action:action(constrained?'מצא מקום מתאים':'מצא משהו שמתאים לי','#places',target)})
    }
    var next=model.currentOrNext&&model.currentOrNext.state==='next'?model.currentOrNext:null;
    if(next){
      signals.push(signal('fa-clock',clean(next.time||'')));
      if(weather.kind!=='unknown')signals.push(signal(weather.icon,weather.label));
      return freezeSuggestion({phase:'active',kind:'next',anchorId:String(next.id||''),weatherKind:weather.kind,icon:'fa-calendar-day',eyebrow:'Smart Trip Mode',title:'הבא היום: '+clean(next.title||'הפעילות הבאה'),body:'היום כבר מסודר סביב הפעילות הבאה. אפשר לבדוק את פרטי היום, או להשאיר את הקצב כמו שהוא.',signals:signals,action:action('פתח את תוכנית היום','#plan','')})
    }
    signals.push(signal('fa-calendar','היום פתוח'));
    if(weather.kind!=='unknown')signals.push(signal(weather.icon,weather.label));
    if(interest)signals.push(signal(interest.source==='learned'?'fa-check':'fa-heart',interest.label));
    var fallbackCategory=category||['attractions','cafes','parks'].find(function(key){return !(personalization&&personalization.blockedCategoryKeys||[]).includes(key)})||'';
    return freezeSuggestion({phase:'active',kind:'open-day',anchorId:'',weatherKind:weather.kind,icon:'fa-compass',eyebrow:'Smart Trip Mode',title:'היום נשאר פתוח',body:interest?'אם בא לך להוסיף משהו, אפשר להתחיל מ־'+interest.label+' ולבחור בעצמך.':'אפשר להשאיר את היום גמיש או לפתוח Places ולבחור משהו קטן.',profileReason:reason,signals:signals,action:action(fallbackCategory?'פתח הצעות במקומות':'פתח את תוכנית היום',fallbackCategory?'#places':'#plan',fallbackCategory)})
  }

  function currentTrip(){
    if(!win||!win.document)return null;
    var id=new URLSearchParams(win.location.search).get('id'),store=win.TravelMateTripStore;
    return id&&store&&typeof store.getTrip==='function'?store.getTrip(id):null
  }
  function weatherSnapshot(){var service=win&&win.TravelMateWeatherContext;return service&&typeof service.snapshot==='function'?service.snapshot():{ready:false}}
  function personalization(){var service=win&&win.TravelMatePersonalizedSuggestions;return service&&typeof service.current==='function'?service.current():Promise.resolve({interests:[],categoryKeys:[],isEmpty:true})}
  function escapeHtml(value){return String(value||'').replace(/[&<>"']/g,function(character){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]})}
  function render(card,suggestion){
    if(!card||!suggestion)return;
    card.dataset.profileReason=suggestion.profileReason||'';card.dataset.smartTripKind=suggestion.kind;card.dataset.smartTripSignature=suggestion.signature;
    var dismissed='';try{dismissed=win.sessionStorage.getItem('travelmate-smart-trip-dismiss:'+String(currentTrip()&&currentTrip().id||''))||''}catch(error){}
    if(dismissed===suggestion.signature){card.hidden=true;return}
    var signals=suggestion.signals.map(function(item){return'<span><i class="fa-solid '+escapeHtml(item.icon)+'" aria-hidden="true"></i>'+escapeHtml(item.label)+'</span>'}).join('');
    card.innerHTML='<header><span class="smart-trip-mode__icon"><i class="fa-solid '+escapeHtml(suggestion.icon)+'" aria-hidden="true"></i></span><div><small>'+escapeHtml(suggestion.eyebrow)+'</small><h2 id="smart-trip-mode-title">'+escapeHtml(suggestion.title)+'</h2></div><button type="button" class="smart-trip-mode__dismiss" data-smart-trip-dismiss aria-label="הסתרת ההצעה הנוכחית">הסתר כרגע</button></header><div class="smart-trip-mode__signals" aria-label="למה ההצעה מופיעה">'+signals+'</div><p>'+escapeHtml([suggestion.body,suggestion.profileReason].filter(Boolean).join(' '))+'</p><footer><a class="primary" href="'+escapeHtml(suggestion.action.href||'#overview')+'" data-smart-trip-action'+(suggestion.action.categoryKey?' data-smart-trip-category="'+escapeHtml(suggestion.action.categoryKey)+'"':'')+'><span>'+escapeHtml(suggestion.action.label||'פתח')+'</span><i class="fa-solid fa-arrow-left" aria-hidden="true"></i></a><small>הצעה בלבד · שום דבר לא משתנה בלי פעולה שלך</small></footer>';
    card.hidden=false;win.document.dispatchEvent(new CustomEvent('travelmate:smart-trip-updated'))
  }
  function ensureCard(){
    var overview=win.document.querySelector('#overview'),today=win.document.querySelector('[data-trip-today]'),control=win.document.querySelector('[data-overview-control-center]');if(!overview)return null;
    var card=win.document.querySelector('[data-smart-trip-mode]');if(card)return card;
    card=win.document.createElement('section');card.className='card smart-trip-mode';card.dataset.smartTripMode='';card.setAttribute('aria-labelledby','smart-trip-mode-title');card.hidden=true;
    if(today)today.insertAdjacentElement('afterend',card);else if(control)control.insertAdjacentElement('beforebegin',card);else overview.insertAdjacentElement('afterend',card);
    return card
  }
  function mount(){
    if(!win||!win.document||!win.location||!new URLSearchParams(win.location.search).get('id'))return false;
    var card=ensureCard();if(!card)return false;
    var generation=0,lastContext={interests:[],categoryKeys:[],isEmpty:true};
    async function refresh(loadProfile){
      var trip=currentTrip();if(!trip){card.hidden=true;return}
      var run=++generation,nextContext=lastContext;
      if(loadProfile!==false)try{nextContext=await personalization()}catch(error){nextContext={interests:[],categoryKeys:[],isEmpty:true}}
      if(run!==generation||!card.isConnected)return;lastContext=nextContext;
      var suggestion=buildSuggestion(trip,new Date(),lastContext,weatherSnapshot());if(suggestion)render(card,suggestion);else card.hidden=true
    }
    card.addEventListener('click',function(event){
      var dismiss=event.target.closest('[data-smart-trip-dismiss]');if(dismiss){var trip=currentTrip(),signature=card.dataset.smartTripSignature||'';try{win.sessionStorage.setItem('travelmate-smart-trip-dismiss:'+String(trip&&trip.id||''),signature)}catch(error){}card.hidden=true;return}
      var link=event.target.closest('[data-smart-trip-action]');if(!link)return;var category=link.dataset.smartTripCategory,trip=currentTrip();if(!category||!trip)return;
      try{win.sessionStorage.setItem('travelmate-smart-place-hint:'+String(trip.id),JSON.stringify({category:category,savedAt:Date.now()}))}catch(error){}
      var panel=win.document.querySelector('[data-nearby-places]');if(panel)panel.dispatchEvent(new CustomEvent('travelmate:smart-category',{detail:{category:category}}))
    });
    ['travelmate:planner-rendered','travelmate:places-updated','travelmate:activities-updated'].forEach(function(name){win.document.addEventListener(name,function(){refresh(false)})});
    win.addEventListener('travelmate:weather-context-change',function(){refresh(false)});
    win.addEventListener('travelmate:home-auth',function(){generation+=1;lastContext={interests:[],categoryKeys:[],isEmpty:true};card.hidden=true;card.dataset.profileReason='';win.document.dispatchEvent(new CustomEvent('travelmate:smart-trip-updated'));refresh(true)});
    win.addEventListener('travelmate:profile-change',function(){refresh(true)});
    win.addEventListener('travelmate:learned-profile-change',function(){refresh(true)});
    win.addEventListener('focus',function(){refresh(false)});
    win.addEventListener('pageshow',function(){refresh(false)});
    win.setInterval(function(){if(!win.document.hidden)refresh(false)},300000);
    if(win.travelMateTripReady)Promise.resolve(win.travelMateTripReady).then(function(){refresh(true)}).catch(function(){refresh(true)});else refresh(true);
    return true
  }

  return Object.freeze({weatherSignal:weatherSignal,buildSuggestion:buildSuggestion,preferredCategory:preferredCategory,roundWindow:roundWindow,mount:mount});
});

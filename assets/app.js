var appScript=document.currentScript;
var appAssetVersion=(function(){try{return new URL(appScript.src,location.href).searchParams.get('v')||'20260929-45'}catch(error){return'20260929-45'}})();
(function(){
  var version=appAssetVersion;
  var loadedStyles={},loadedScripts={},featureLoads={};
  var isHomePage=Boolean(document.body&&document.body.classList.contains('home-page'));
  var baseStyles=['language.css','mobile-menu.css','navigation-memory.css','network-usage.css','trip-redesign.css','modal-system.css','theme.css','ai-assistant.css'];
  var homeBaseStyles=['language.css','network-usage.css','theme.css'];
  var finalStyle='readable-glass.css';
  var dynamicSectionViews={transport:true,getaways:true,group:true,memories:true};
  var features={
    overview:{styles:['weather-widget.css','trip-intelligence.css'],scripts:['weather-widget.js']},
    intelligence:{styles:[],scripts:['trip-intelligence.js']},
    assistant:{styles:['smart-hub.css'],scripts:['ai-assistant.js','smart-hub.js']},
    account:{styles:['security-center.css','admin-center.css'],scripts:['security-center.js','admin-center.js']},
    places:{styles:['nearby.css','place-planner.css','lodging-manager.css','place-auto-fill.css','smart-plan-tools.css','place-directions.css','place-sharing.css'],scripts:['trip-context.js','lodging-manager.js','place-auto-fill.js','place-directions.js']},
    plan:{styles:['auto-planner.css','place-planner.css','lodging-manager.css','place-auto-fill.css','smart-plan-tools.css','place-directions.css','plan-ux-polish.css'],scripts:['trip-context.js','auto-planner.js','lodging-manager.js','place-auto-fill.js','place-directions.js','plan-ux-polish.js']},
    documents:{styles:['document-vault.css'],scripts:['document-vault.js']},
    budget:{styles:['trip-experience.css'],scripts:['trip-experience.js']},
    memories:{styles:['trip-experience.css'],scripts:['trip-experience.js']},
    summary:{styles:['trip-experience.css'],scripts:['trip-experience.js']},
    group:{styles:['collaboration.css','chat-place-sharing.css','place-directions.css'],scripts:['place-directions.js','collaboration.js']},
    transport:{styles:['transport-planner.css','travel-services.css','place-directions.css'],scripts:['travel-services.js','transport-planner.js','place-directions.js']},
    getaways:{styles:['travel-services.css'],scripts:['travel-services.js']},
    about:{styles:['about.css'],scripts:['about.js']}
  };
  function assetUrl(file){return new URL(file,appScript.src).href+'?v='+version}
  function loadStyle(file){
    if(loadedStyles[file])return loadedStyles[file];
    loadedStyles[file]=new Promise(function(resolve){
      var existing=document.querySelector('link[data-travelmate-style="'+file+'"],link[href*="/assets/'+file+'"]');
      if(existing){resolve(true);return}
      var style=document.createElement('link');style.rel='stylesheet';style.href=assetUrl(file);style.dataset.travelmateStyle=file;style.onload=function(){resolve(true)};style.onerror=function(){console.error('TravelMate style failed to load:',file);style.remove();delete loadedStyles[file];resolve(false)};var finalLink=document.querySelector('link[data-travelmate-style="'+finalStyle+'"]');if(file!==finalStyle&&finalLink)document.head.insertBefore(style,finalLink);else document.head.appendChild(style)
    });
    return loadedStyles[file]
  }
  function loadScript(file){
    if(loadedScripts[file])return loadedScripts[file];
    var existing=[].slice.call(document.scripts).find(function(script){return script.src&&script.src.indexOf('/assets/'+file)!==-1});
    if(existing){loadedScripts[file]=Promise.resolve(true);return loadedScripts[file]}
    loadedScripts[file]=new Promise(function(resolve){var script=document.createElement('script');script.src=assetUrl(file);script.async=false;script.onload=function(){resolve(true)};script.onerror=function(){console.error('TravelMate feature failed to load:',file);script.remove();delete loadedScripts[file];resolve(false)};document.head.appendChild(script)});
    return loadedScripts[file]
  }
  function loadSequence(files){return files.reduce(function(chain,file){return chain.then(function(ok){return ok===false?false:loadScript(file)})},Promise.resolve(true))}
  function waitForSection(view){
    if(!dynamicSectionViews[view])return Promise.resolve(true);
    if(document.getElementById(view))return Promise.resolve(true);
    return new Promise(function(resolve){var deadline=Date.now()+2500;(function check(){if(document.getElementById(view)){resolve(true);return}if(Date.now()>=deadline){resolve(false);return}requestAnimationFrame(check)})()})
  }
  function loadTodayActivities(){return Promise.all([loadStyle('today-activities.css'),loadScript('today-activities.js')])}
  function loadFeature(view){
    var feature=features[view];if(!feature)return Promise.resolve(true);
    if(featureLoads[view])return featureLoads[view];
    featureLoads[view]=Promise.all((feature.styles||[]).map(loadStyle)).then(function(results){
      if(results.some(function(result){return result===false}))return false;
      return loadSequence(feature.scripts||[])
    }).then(function(ready){
      if(ready===false)return false;
      return waitForSection(view)
    }).then(function(ready){
      if(ready===false)return false;
      window.dispatchEvent(new CustomEvent('travelmate:feature-ready',{detail:{view:view}}));
      return true
    }).then(function(ready){
      delete featureLoads[view];
      return ready
    },function(error){
      delete featureLoads[view];
      throw error
    });
    return featureLoads[view]
  }
  function ensureLazyNavigation(){
    var nav=document.querySelector('.sidebar nav');if(!nav)return;
    [].slice.call(nav.querySelectorAll('.sidebar-lazy-feature,.sidebar-service')).forEach(function(link){
      if(/^(transport|getaways|group|memories)$/.test(link.dataset.view||''))link.remove()
    })
  }
  function canWarmNonCritical(){var connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection||null;return !document.hidden&&!(connection&&connection.saveData)&&!(connection&&/^(slow-2g|2g)$/i.test(String(connection.effectiveType||'')))}
  function scheduleIdleFeature(view,delay){var run=function(){if(canWarmNonCritical())loadFeature(view)};setTimeout(function(){if('requestIdleCallback' in window)requestIdleCallback(run,{timeout:1800});else run()},delay)}
  function warmNonCritical(){scheduleIdleFeature('account',4200)}
  function createAssistantShell(){
    if(isHomePage||document.querySelector('.ai-orb'))return;
    var orb=document.createElement('button');
    orb.className='ai-orb';orb.type='button';orb.dataset.aiShell='';orb.setAttribute('aria-label','פתיחת העוזר האישי');orb.setAttribute('aria-expanded','false');
    orb.innerHTML='<span class="ai-orb-ring"></span><i class="fa-solid fa-wand-magic-sparkles"></i><span class="ai-orb-badge">AI</span>';
    function activate(event){
      if(window.__travelMateAiAssistantLoaded){orb.removeEventListener('click',activate,true);return}
      event.preventDefault();event.stopImmediatePropagation();
      loadFeature('assistant').then(function(ready){
        if(ready===false)return;
        orb.removeEventListener('click',activate,true);
        window.TravelMateEvents.emit(window.TravelMateEvents.names.askAi,{source:'assistant-shell'});
      })
    }
    orb.addEventListener('click',activate,true);document.body.appendChild(orb)
  }
  function activeView(){var view=document.body&&document.body.dataset.tripView||new URLSearchParams(location.search).get('view')||'overview';return view==='car-rental'?'transport':view}
  if(isHomePage){
    var homeBaseReady=Promise.all(homeBaseStyles.map(loadStyle));
    var homeCoreReady=homeBaseReady.then(function(){return loadSequence(['language.js','theme.js'])});
    Promise.all([homeBaseReady,loadStyle(finalStyle),homeCoreReady]);
  }else{
    ensureLazyNavigation();
    var baseReady=Promise.all(baseStyles.map(loadStyle));
    baseReady.then(createAssistantShell);
    var coreReady=baseReady.then(function(){return loadSequence(['language.js','navigation-memory.js','trip-redesign.js','theme.js'])});
    var initialView=activeView();
    var featureReady=baseReady.then(function(){return loadFeature(initialView)});
    Promise.all([baseReady,loadStyle(finalStyle),coreReady,featureReady,initialView==='overview'?baseReady.then(loadTodayActivities):Promise.resolve(true)]).then(function(){if(initialView==='overview')scheduleIdleFeature('intelligence',250);warmNonCritical()});
  }
  window.addEventListener('travelmate:viewchange',function(event){var view=event.detail&&event.detail.view;loadFeature(view).then(function(){if(view==='overview'){loadTodayActivities();scheduleIdleFeature('intelligence',250)}})});
  document.addEventListener('pointerenter',function(event){var link=event.target.closest&&event.target.closest('[data-view]');if(link){loadFeature(link.dataset.view);if(link.dataset.view==='overview'){loadTodayActivities();loadFeature('intelligence')}}},{capture:true,passive:true});
  document.addEventListener('touchstart',function(event){var link=event.target.closest&&event.target.closest('[data-view]');if(link){loadFeature(link.dataset.view);if(link.dataset.view==='overview')loadFeature('intelligence')}},{capture:true,passive:true});
  document.addEventListener('click',function(event){var button=event.target.closest&&event.target.closest('[data-lazy-about]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();loadFeature('about').then(function(ready){if(ready===false)return;button.removeAttribute('data-lazy-about');button.click()})},true);
  window.TravelMateFeatures=Object.freeze({load:loadFeature,has:function(view){return Boolean(features[view])},ensureAssistant:function(){return loadFeature('assistant')},ensureAccount:function(){return loadFeature('account')}});
})();

window.addEventListener('beforeinstallprompt',function(event){
  event.preventDefault();
  window.TravelMateInstallPrompt=event;
});

(function scheduleServiceWorkerRegistration(){
  if(!('serviceWorker' in navigator)||location.protocol==='file:'||window.__travelMateServiceWorkerScheduled)return;
  window.__travelMateServiceWorkerScheduled=true;
  var rootUrl=new URL('../',appScript.src);
  function register(){
    navigator.serviceWorker.register(new URL('sw.js?v='+encodeURIComponent(appAssetVersion),rootUrl).href,{updateViaCache:'none'}).then(function(registration){
      window.TravelMateServiceWorkerRegistration=registration;
      window.dispatchEvent(new CustomEvent('travelmate:service-worker-ready',{detail:{registration:registration}}));
      registration.update().catch(function(){});
    }).catch(function(){});
  }
  function schedule(){
    if('requestIdleCallback' in window)requestIdleCallback(register,{timeout:3000});
    else setTimeout(register,700);
  }
  if(document.readyState==='complete')schedule();
  else window.addEventListener('load',schedule,{once:true});
})();
var lastModalTrigger=null;
function closeModal(){document.querySelectorAll('.modal-backdrop.open').forEach(function(modal){modal.classList.remove('open')});if(lastModalTrigger&&document.contains(lastModalTrigger)){lastModalTrigger.focus()}lastModalTrigger=null}
function modalFocusable(modal){return [].slice.call(modal.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(function(node){return node.offsetParent!==null})}
function focusModal(modal){var targets=modalFocusable(modal),target=targets[0];if(target)requestAnimationFrame(function(){target.focus()})}
function trapGenericModalFocus(event){if(event.key!=='Tab')return;var modal=document.querySelector('.modal-backdrop.open:not(#modal-weather-live)');if(!modal)return;var targets=modalFocusable(modal);if(!targets.length){event.preventDefault();return}var first=targets[0],last=targets[targets.length-1],active=document.activeElement;if(event.shiftKey&&(active===first||!modal.contains(active))){event.preventDefault();last.focus()}else if(!event.shiftKey&&(active===last||!modal.contains(active))){event.preventDefault();first.focus()}}
function showDayToast(message){var toast=document.getElementById('day-toast');if(!toast)return;toast.textContent=message;toast.classList.add('show');clearTimeout(window.__dayToastTimer);window.__dayToastTimer=setTimeout(function(){toast.classList.remove('show')},2600)}
function minutesFromTime(value){var parts=(value||'00:00').split(':').map(Number);return (parts[0]||0)*60+(parts[1]||0)}
function checkDayConflicts(panel){if(!panel)return false;var items=[].slice.call(panel.querySelectorAll('.day-item'));var hasConflict=false;var previousStart=-1;var previousEnd=-1;items.forEach(function(item){var start=minutesFromTime(item.dataset.time);var duration=Number(item.dataset.duration||60);if(start<previousStart||start<previousEnd)hasConflict=true;previousStart=start;previousEnd=start+duration});if(hasConflict)showDayToast('יש חפיפה או סדר שעות לא רציף, אבל השינוי נשמר.');return hasConflict}
function activeDayPanel(){return document.querySelector('.day-panel.active')}
function initDayPlanner(){document.querySelectorAll('.day-panel').forEach(checkDayConflicts)}

document.addEventListener('click',function(event){
  var trigger=event.target.closest('[data-modal]');
  if(trigger){var id='modal-'+trigger.dataset.modal;var modal=document.getElementById(id);if(trigger.dataset.alert){var title=document.getElementById('alert-title');if(title)title.textContent=trigger.dataset.alert}closeModal();if(modal){lastModalTrigger=trigger;modal.classList.add('open');focusModal(modal);if(id==='modal-day')initDayPlanner()}}
  if(event.target.matches('[data-close]')||event.target.closest('[data-close]')||event.target.classList.contains('modal-backdrop'))closeModal();
});

document.addEventListener('click',function(event){
  var tab=event.target.closest('[data-day-tab]');
  if(tab){var index=tab.dataset.dayTab;document.querySelectorAll('.day-tab').forEach(function(item){item.classList.toggle('active',item===tab)});document.querySelectorAll('.day-panel').forEach(function(panel){panel.classList.toggle('active',panel.dataset.dayPanel===index)});checkDayConflicts(activeDayPanel())}
  var hold=event.target.closest('.hold-btn');
  if(hold){var item=hold.closest('.day-item');item.classList.toggle('hold');hold.classList.toggle('active');var label=item.querySelector('.state-label');if(label)label.textContent=item.classList.contains('hold')?'בהשהיה':'מתוכנן'}
  var tentative=event.target.closest('.tentative-btn');
  if(tentative){var item2=tentative.closest('.day-item');item2.classList.toggle('tentative');tentative.classList.toggle('active');var label2=item2.querySelector('.state-label');if(label2)label2.textContent=item2.classList.contains('tentative')?'החלטה במקום':(item2.classList.contains('hold')?'בהשהיה':'מתוכנן')}
  var del=event.target.closest('.delete-btn');
  if(del){var panel=del.closest('.day-panel');del.closest('.day-item').remove();checkDayConflicts(panel);showDayToast('הפעילות נמחקה מהיום.')}
  if(event.target.closest('#copy-link')){var copyButton=event.target.closest('#copy-link');var strong=copyButton.querySelector('strong');var done=function(){if(strong)strong.textContent='הקישור הועתק'};if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(location.href).then(done)}else{var input=document.createElement('textarea');input.value=location.href;input.style.position='fixed';input.style.opacity='0';document.body.appendChild(input);input.select();document.execCommand('copy');input.remove();done()}}
});

document.addEventListener('change',function(event){if(event.target.classList.contains('duration-select')){var item=event.target.closest('.day-item');item.dataset.duration=event.target.value;var label=item.querySelector('.duration-label');if(label)label.textContent='משך: '+event.target.value+' דק׳';checkDayConflicts(item.closest('.day-panel'))}});
document.addEventListener('submit',function(event){var form=event.target.closest('[data-add-activity]');if(!form)return;event.preventDefault();var panel=form.closest('.day-panel');var list=panel.querySelector('[data-sortable-day]');var time=form.elements.time.value||'11:00';var title=form.elements.title.value||'פעילות חדשה';var category=form.elements.category.value||'פעילות';var duration=form.elements.duration.value||'60';var item=document.createElement('article');item.className='day-item upcoming';item.draggable=true;item.dataset.activityId='new-'+Date.now();item.dataset.time=time;item.dataset.duration=duration;item.innerHTML='<button class="drag-handle" type="button" aria-label="גרירת פעילות"><i class="fa-solid fa-grip-vertical"></i></button><time>'+escapePlannerText(time)+'</time><div class="day-dot"><i class="fa-solid fa-location-dot"></i></div><div><span>חדש · '+escapePlannerText(category)+'</span><strong>'+escapePlannerText(title)+'</strong><p>מיקום יתווסף בהמשך · אפשר לערוך לפי הצורך</p><div class="day-meta"><span class="duration-label">משך: '+escapePlannerText(duration)+' דק׳</span><span class="state-label">מתוכנן</span></div></div><div class="activity-controls"><select class="duration-select" aria-label="משך פעילות"><option value="30">30 דק׳</option><option value="60">שעה</option><option value="90">שעה וחצי</option><option value="120">שעתיים</option><option value="180">3 שעות</option></select><button class="mini-btn hold-btn" type="button">השהיה</button><button class="mini-btn tentative-btn" type="button">?</button><button class="mini-btn danger delete-btn" type="button">מחיקה</button></div>';item.querySelector('.duration-select').value=duration;var empty=list.querySelector('.empty-day');if(empty)empty.remove();list.appendChild(item);form.elements.title.value='';checkDayConflicts(panel);showDayToast('הפעילות נוספה ליום הזה.')});
document.addEventListener('dragstart',function(event){var item=event.target.closest('.day-item');if(!item)return;item.classList.add('dragging');event.dataTransfer.effectAllowed='move'});
document.addEventListener('dragend',function(event){var item=event.target.closest('.day-item');if(!item)return;item.classList.remove('dragging');checkDayConflicts(item.closest('.day-panel'))});
document.addEventListener('dragover',function(event){var list=event.target.closest('[data-sortable-day]');if(!list)return;event.preventDefault();var dragging=list.querySelector('.dragging');if(!dragging)return;var siblings=[].slice.call(list.querySelectorAll('.day-item:not(.dragging)'));var next=siblings.find(function(item){return event.clientY<item.getBoundingClientRect().top+item.getBoundingClientRect().height/2});list.insertBefore(dragging,next||null)});
document.addEventListener('keydown',function(event){trapGenericModalFocus(event);if(event.key==='Escape'){var weatherModal=document.getElementById('modal-weather-live');if(!(weatherModal&&weatherModal.classList.contains('open')))closeModal();closeMobileMenu()}});

function closeMobileMenu(){document.body.classList.remove('mobile-menu-open');var button=document.querySelector('[data-mobile-menu]');if(button){button.setAttribute('aria-expanded','false');button.setAttribute('aria-label','פתיחת תפריט');var icon=button.querySelector('i');if(icon)icon.className='fa-solid fa-bars'}}
document.addEventListener('click',function(event){var menuButton=event.target.closest('[data-mobile-menu]');if(menuButton){var opening=!document.body.classList.contains('mobile-menu-open');document.body.classList.toggle('mobile-menu-open',opening);menuButton.setAttribute('aria-expanded',String(opening));menuButton.setAttribute('aria-label',opening?'סגירת תפריט':'פתיחת תפריט');var icon=menuButton.querySelector('i');if(icon)icon.className=opening?'fa-solid fa-xmark':'fa-solid fa-bars';return}if(event.target.closest('.sidebar nav a,.trip-sidebar-more-menu a,.trip-sidebar-more-menu button')||event.target.matches('.mobile-menu-shade'))closeMobileMenu()});
document.addEventListener('click',function(event){if(!event.target.closest('[data-vault-pick]')||event.target.closest('[data-document-vault]'))return;var fileInput=document.querySelector('[data-vault-form] input[type="file"]');if(fileInput)fileInput.click()});
window.addEventListener('resize',function(){if(window.innerWidth>1000)closeMobileMenu()});
document.addEventListener('click',function(event){var skip=event.target.closest('.tm-skip-link[href="#main-content"]');if(!skip)return;var main=document.getElementById('main-content');if(!main)return;requestAnimationFrame(function(){main.focus({preventScroll:true})})});

document.addEventListener('DOMContentLoaded',function(){var header=document.querySelector('.mobile-header');if(header){var back=header.querySelector('a');if(back){back.className='mobile-back';back.setAttribute('aria-label','חזרה לכל הטיולים');back.innerHTML='<i class="fa-solid fa-arrow-right"></i>'}var looseIcon=header.querySelector(':scope > i.fa-bars');if(looseIcon)looseIcon.remove();if(!header.querySelector('[data-mobile-menu]')){var menu=document.createElement('button');menu.className='mobile-menu-button';menu.type='button';menu.dataset.mobileMenu='';menu.setAttribute('aria-label','פתיחת תפריט');menu.setAttribute('aria-expanded','false');menu.innerHTML='<i class="fa-solid fa-bars"></i>';header.appendChild(menu)}}if(document.querySelector('.sidebar')&&!document.querySelector('.mobile-menu-shade')){var shade=document.createElement('button');shade.type='button';shade.className='mobile-menu-shade';shade.setAttribute('aria-label','סגירת תפריט');document.body.appendChild(shade)}});

function initTripPlacePlanner(){var daysContainer=document.querySelector('[data-generated-days]');if(!daysContainer)return;var tripId=new URLSearchParams(location.search).get('id'),tripStore=window.TravelMateTripStore,trip=tripStore&&tripStore.getTrip(tripId);if(!trip)return;trip.savedPlaces=trip.savedPlaces||[];var placesSection=document.getElementById('places');if(!placesSection||placesSection.querySelector('[data-nearby-places]'))return;
  var dateOptions=[],resultSchedulingDraft=Object.create(null);var startDate=new Date(trip.start+'T12:00:00');for(var dayIndex=0;dayIndex<trip.days;dayIndex++){var optionDate=new Date(startDate.getTime()+dayIndex*86400000),value=optionDate.toISOString().slice(0,10),weekday=new Intl.DateTimeFormat('he-IL',{weekday:'short'}).format(optionDate),calendarDate=new Intl.DateTimeFormat('he-IL',{day:'numeric',month:'numeric',year:'numeric'}).format(optionDate),label=weekday+' · '+calendarDate,compactLabel=value.slice(8,10)+'/'+value.slice(5,7)+'/'+value.slice(0,4);dateOptions.push({value:value,label:label,compactLabel:compactLabel})}
  var panel=document.createElement('div');panel.className='nearby-panel place-planner';panel.dataset.nearbyPlaces='';panel.dataset.destinationLat='0';panel.dataset.destinationLon='0';panel.dataset.destinationName=trip.city+', '+trip.country;panel.innerHTML='<div class="place-planner-intro"><div class="nearby-copy"><span>מקומות לטיול</span><h2>חיפוש ושמירת מקומות</h2><p>חפשו בעיר היעד, לידכם או במפה. שמירה ותזמון יופיעו רק כשתצטרכו אותם.</p></div><div class="place-planner-note"><i class="fa-solid fa-bookmark"></i> אפשר לשמור מקום גם בלי לתזמן אותו</div></div><section class="saved-places-shelf" data-saved-places-shelf hidden><button type="button" class="saved-places-shelf__toggle" data-saved-places-toggle aria-expanded="false" aria-controls="saved-places-list"><span class="saved-places-shelf__toggle-copy"><span>מקומות שמורים</span><strong data-saved-places-count>0 מקומות</strong></span><span class="saved-places-shelf__summary" aria-live="polite"><span><b data-saved-places-unscheduled>0</b> שמורים בלבד</span><span><b data-saved-places-scheduled>0</b> בתוכנית</span></span><i class="fa-solid fa-chevron-down" data-saved-places-chevron aria-hidden="true"></i></button><div id="saved-places-list" class="saved-places-shelf__list" data-saved-places-list hidden></div></section><form class="hotel-fix-form" data-hotel-fix-form><div class="hotel-fix-heading"><span><i class="fa-solid fa-hotel"></i></span><div><small>נקודת בסיס לטיול</small><h3>קיבוע מלון במפה</h3><p>הקלידו שם מלון או כתובת, ושמרו אותו ישירות ביום או בפעילות.</p></div><button type="button" class="hotel-fix-toggle" data-hotel-fix-toggle aria-expanded="true" aria-label="צמצום פרטי המלון"><i class="fa-solid fa-chevron-up" aria-hidden="true"></i><span>צמצום</span></button></div><div class="hotel-fix-fields"><label class="wide">שם המלון או כתובת<input name="hotelQuery" required maxlength="220" autocomplete="street-address" placeholder="לדוגמה: Hotel Artemide, Rome"></label><label>יום בטיול<select name="hotelDate"></select></label><label>שעה<input name="hotelTime" type="time" value="15:00" required></label><label class="wide">קישור לפעילות קיימת<select name="activityId"><option value="">ללא קישור — שמירה כפעילות לינה</option></select></label></div><div class="hotel-fix-actions"><a data-hotel-preview target="_blank" rel="noopener noreferrer" hidden><i class="fa-solid fa-map-location-dot"></i> תצוגה במפה</a><button type="submit"><i class="fa-solid fa-location-crosshairs"></i> איתור ושמירת המלון</button></div><p class="hotel-fix-status" data-hotel-fix-status>הכתובת תאותר ותישמר עם קישור ישיר למפה.</p></form><div class="nearby-controls"><label>מה מחפשים?<select data-nearby-category><option value="all">הכול</option><option value="food">מסעדות ובתי קפה</option><option value="attractions">אטרקציות ותרבות</option><option value="trips">טיולים וטבע</option><option value="shopping">קניות</option></select></label><label>רדיוס<select data-nearby-radius><option value="500">500 מטר</option><option value="1000" selected>קילומטר</option><option value="3000">3 ק״מ</option><option value="5000">5 ק״מ</option><option value="10000">10 ק״מ</option></select></label><button class="nearby-search" type="button" data-nearby-search><i class="fa-solid fa-location-crosshairs"></i> חיפוש לפי GPS</button><button class="nearby-map-button" type="button" data-nearby-map-button><i class="fa-solid fa-map-location-dot"></i> בחירת נקודה במפה</button></div><div class="nearby-map-shell" data-nearby-map-shell hidden><div class="nearby-map" data-nearby-map></div><div class="nearby-map-footer"><span data-nearby-map-hint>לחצי על נקודה במפה כדי לבחור אזור חיפוש.</span><button type="button" data-nearby-map-search disabled>חיפוש סביב הנקודה</button></div></div><div class="nearby-status" data-nearby-status></div><div class="nearby-results" data-nearby-results></div>';placesSection.appendChild(panel);
  var savedShelfStorageKey='travelmate-saved-shelf:'+String(trip.id),savedShelfExpanded=(function(){try{var stored=sessionStorage.getItem(savedShelfStorageKey);if(stored!==null)return stored==='1'}catch(error){}return !(window.matchMedia&&window.matchMedia('(max-width:760px)').matches)})();
  function setSavedShelfExpanded(expanded,remember){
    var shelf=panel.querySelector('[data-saved-places-shelf]'),list=panel.querySelector('[data-saved-places-list]'),toggle=panel.querySelector('[data-saved-places-toggle]'),chevron=panel.querySelector('[data-saved-places-chevron]');
    savedShelfExpanded=Boolean(expanded);
    if(shelf)shelf.classList.toggle('is-expanded',savedShelfExpanded);
    if(list)list.hidden=!savedShelfExpanded;
    if(toggle){toggle.setAttribute('aria-expanded',String(savedShelfExpanded));toggle.setAttribute('aria-label',savedShelfExpanded?'סגירת המקומות השמורים':'פתיחת המקומות השמורים')}
    if(chevron){chevron.classList.toggle('fa-chevron-up',savedShelfExpanded);chevron.classList.toggle('fa-chevron-down',!savedShelfExpanded)}
    if(remember)try{sessionStorage.setItem(savedShelfStorageKey,savedShelfExpanded?'1':'0')}catch(error){}
  }
  var hotelForm=panel.querySelector('[data-hotel-fix-form]'),hotelDate=hotelForm.elements.hotelDate,activitySelect=hotelForm.elements.activityId,hotelStatus=hotelForm.querySelector('[data-hotel-fix-status]'),hotelPreview=hotelForm.querySelector('[data-hotel-preview]'),hotelToggle=hotelForm.querySelector('[data-hotel-fix-toggle]');function setHotelCollapsed(collapsed){hotelForm.classList.toggle('is-collapsed',collapsed);if(!hotelToggle)return;hotelToggle.setAttribute('aria-expanded',String(!collapsed));hotelToggle.setAttribute('aria-label',collapsed?'פתיחת פרטי המלון':'צמצום פרטי המלון');var label=hotelToggle.querySelector('span'),icon=hotelToggle.querySelector('i');if(label)label.textContent=collapsed?'פרטי מלון':'צמצום';if(icon){icon.classList.toggle('fa-chevron-down',collapsed);icon.classList.toggle('fa-chevron-up',!collapsed)}}if(hotelToggle){setHotelCollapsed(Boolean(window.matchMedia&&window.matchMedia('(max-width:650px)').matches));hotelToggle.addEventListener('click',function(){setHotelCollapsed(!hotelForm.classList.contains('is-collapsed'))})}dateOptions.forEach(function(date){var option=document.createElement('option');option.value=date.value;option.textContent=date.label;hotelDate.appendChild(option)});(trip.activities||[]).slice().sort(function(a,b){return String(a.date||'').localeCompare(String(b.date||''))||String(a.time||'').localeCompare(String(b.time||''))}).forEach(function(activity){var option=document.createElement('option');option.value=activity.id;option.textContent=(activity.date||'')+' · '+(activity.time||'')+' · '+(activity.title||'פעילות');activitySelect.appendChild(option)});activitySelect.addEventListener('change',function(){var activity=(trip.activities||[]).find(function(item){return item.id===activitySelect.value});if(!activity)return;hotelDate.value=activity.date||hotelDate.value;hotelForm.elements.hotelTime.value=activity.time||hotelForm.elements.hotelTime.value});hotelForm.addEventListener('submit',function(event){event.preventDefault();var query=hotelForm.elements.hotelQuery.value.trim(),activity=(trip.activities||[]).find(function(item){return item.id===activitySelect.value}),search=[query,trip.city,trip.country].filter(Boolean).join(', '),button=hotelForm.querySelector('button[type="submit"]');if(!query)return;button.disabled=true;hotelStatus.textContent='מאתר את המלון והכתובת במפה…';var controller=new AbortController(),timer=setTimeout(function(){controller.abort()},7000);fetch('https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&q='+encodeURIComponent(search),{signal:controller.signal}).then(function(response){if(!response.ok)throw new Error('lookup-failed');return response.json()}).then(function(results){var result=results&&results[0],lat=result&&result.lat||'',lon=result&&result.lon||'',address=result&&result.display_name||query,mapQuery=lat&&lon?lat+','+lon:search,maps='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(mapQuery),source=lat&&lon?'https://www.openstreetmap.org/?mlat='+encodeURIComponent(lat)+'&mlon='+encodeURIComponent(lon)+'#map=17/'+encodeURIComponent(lat)+'/'+encodeURIComponent(lon):'';var existing=trip.savedPlaces.find(function(place){return place.category==='מלון ולינה'&&String(place.name).toLowerCase()===query.toLowerCase()}),place={id:existing&&existing.id||'hotel-'+Date.now(),name:query,category:'מלון ולינה',description:address,date:activity&&activity.date||hotelDate.value,time:activity&&activity.time||hotelForm.elements.hotelTime.value||'15:00',duration:60,maps:maps,ratingsUrl:maps,sourceUrl:source,lat:lat,lon:lon,linkedActivityId:activity&&activity.id||''};if(existing)Object.assign(existing,place);else trip.savedPlaces.push(place);if(activity){activity.locationName=query;activity.address=address;activity.lat=lat;activity.lon=lon;activity.maps=maps;activity.linkedHotelId=place.id}persist();renderSaved();window.TravelMateEvents.emit(window.TravelMateEvents.names.activitiesUpdated,{tripId:trip.id,source:'places-planner'});hotelPreview.href=maps;hotelPreview.hidden=false;hotelStatus.textContent=activity?'המלון נשמר במפה וקושר לפעילות „'+activity.title+'”.':'המלון נשמר במפה ונוסף לציר הזמן.';if(window.showDayToast)window.showDayToast('המלון נשמר וקובע במפה.')} ).catch(function(){var maps='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(search),existing=trip.savedPlaces.find(function(place){return place.category==='מלון ולינה'&&String(place.name).toLowerCase()===query.toLowerCase()}),place={id:existing&&existing.id||'hotel-'+Date.now(),name:query,category:'מלון ולינה',description:query,date:activity&&activity.date||hotelDate.value,time:activity&&activity.time||hotelForm.elements.hotelTime.value||'15:00',duration:60,maps:maps,ratingsUrl:maps,linkedActivityId:activity&&activity.id||''};if(existing)Object.assign(existing,place);else trip.savedPlaces.push(place);if(activity){activity.locationName=query;activity.address=query;activity.maps=maps;activity.linkedHotelId=place.id}persist();renderSaved();window.TravelMateEvents.emit(window.TravelMateEvents.names.activitiesUpdated,{tripId:trip.id,source:'places-planner'});hotelPreview.href=maps;hotelPreview.hidden=false;hotelStatus.textContent='לא התקבל מיקום מדויק, לכן נשמר חיפוש מפה לפי השם או הכתובת שהוזנו.'}).finally(function(){clearTimeout(timer);button.disabled=false})});
  var destinationButton=document.createElement('button');destinationButton.className='nearby-map-button';destinationButton.type='button';destinationButton.innerHTML='<i class="fa-solid fa-city"></i> חיפוש בעיר היעד';panel.querySelector('.nearby-controls').appendChild(destinationButton);var destinationCoords=null,destinationLookup=null,nearbyLoaded=false;
  function ensureNearby(){if(nearbyLoaded)return;nearbyLoaded=true;var nearbyScript=document.createElement('script'),appUrl=new URL(appScript.src),assetVersion=appUrl.searchParams.get('v');nearbyScript.src=new URL('nearby.js',appUrl).href+(assetVersion?'?v='+encodeURIComponent(assetVersion):'');document.body.appendChild(nearbyScript)}
  function ensureDestination(){if(destinationCoords)return Promise.resolve(destinationCoords);if(destinationLookup)return destinationLookup;var cacheKey='travelmate-destination-coords:'+String(trip.city+'|'+trip.country).toLowerCase();try{var cached=JSON.parse(localStorage.getItem(cacheKey)||'null');if(cached&&cached.lat&&Date.now()-cached.savedAt<2592000000){destinationCoords={lat:Number(cached.lat),lon:Number(cached.lon)};panel.dataset.destinationLat=cached.lat;panel.dataset.destinationLon=cached.lon;return Promise.resolve(destinationCoords)}}catch(error){}var geocodeController=new AbortController(),geocodeTimer=setTimeout(function(){geocodeController.abort()},6000);destinationLookup=fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q='+encodeURIComponent(trip.city+', '+trip.country),{signal:geocodeController.signal}).then(function(response){return response.json()}).then(function(data){if(!data||!data[0])throw new Error('destination-not-found');destinationCoords={lat:Number(data[0].lat),lon:Number(data[0].lon)};panel.dataset.destinationLat=data[0].lat;panel.dataset.destinationLon=data[0].lon;try{localStorage.setItem(cacheKey,JSON.stringify({lat:data[0].lat,lon:data[0].lon,savedAt:Date.now()}))}catch(error){}panel.querySelector('[data-nearby-status]').textContent='מרכז '+trip.city+' אותר. אפשר לחפש בעיר, להשתמש ב־GPS או לבחור נקודה במפה.';return destinationCoords}).catch(function(){panel.querySelector('[data-nearby-status]').textContent='לא הצלחנו לאתר אוטומטית את מרכז העיר. GPS ובחירת נקודה במפה עדיין זמינים.';return null}).finally(function(){clearTimeout(geocodeTimer);destinationLookup=null});return destinationLookup}
  destinationButton.addEventListener('click',function(){ensureNearby();ensureDestination().then(function(coords){if(coords)panel.dispatchEvent(new CustomEvent('nearby:search',{detail:coords}));else panel.querySelector('[data-nearby-status]').textContent='לא הצלחנו לאתר את מרכז העיר. אפשר לבחור נקודה במפה.'})});panel.addEventListener('nearby:destination-request',function(){ensureDestination().then(function(coords){panel.dispatchEvent(new CustomEvent('nearby:destination-ready',{detail:coords||null}))})});
  function persist(){if(!tripStore)return;var saved=tripStore.updateTrip(trip.id,function(current){current.savedPlaces=trip.savedPlaces;current.activities=trip.activities||[];return current});if(saved)trip=saved;window.TravelMateEvents.emit(window.TravelMateEvents.names.placesUpdated,{tripId:trip.id,source:'places-planner'})}
  var savedPlaceImageBackfillBusy=false;
  async function backfillSavedPlaceImages(){
    if(savedPlaceImageBackfillBusy||!window.TravelMateNearby||!window.TravelMateNearby.resolveMedia)return false;
    var missing=(trip.savedPlaces||[]).filter(function(place){return place&&place.name&&!safePlannerUrl(place.image)&&place.imageResolutionVersion!==3}).slice(0,10);
    if(!missing.length)return false;
    savedPlaceImageBackfillBusy=true;var changed=false;
    try{
      for(var imageIndex=0;imageIndex<missing.length;imageIndex++){
        var place=missing[imageIndex],media=null;
        try{media=await window.TravelMateNearby.resolveMedia({id:place.sourceId||place.id,name:place.name,lat:Number(place.lat),lon:Number(place.lon),category:place.category||'',type:place.type||'',source:place.source||'',wikidata:place.wikidata||'',wikipedia:place.wikipedia||place.wikipediaUrl||'',commons:place.commons||'',image:''})}catch(error){}
        place.imageResolutionVersion=3;
        if(media&&safePlannerUrl(media.image)){place.image=media.image;place.imageSource=media.imageSource||place.imageSource||'';place.imageAttribution=media.imageAttribution||place.imageAttribution||'';changed=true}
      }
      persist();
      if(changed)renderSaved();
      return changed;
    }finally{savedPlaceImageBackfillBusy=false}
  }
  function calendarUrl(place){var start=calendarStamp(place.date,place.time||'10:00'),end=calendarStamp(place.date,addPlannerMinutes(place.time||'10:00',60)),details=[place.description,place.officialUrl,place.ratingsUrl].filter(Boolean).join('\n'),locationValue=place.lat&&place.lon?place.lat+','+place.lon:[place.name,trip.city,trip.country].filter(Boolean).join(', '),params=new URLSearchParams({action:'TEMPLATE',text:place.name+' · TravelMate',dates:start+'/'+end,details:details,location:locationValue});return'https://calendar.google.com/calendar/render?'+params.toString()}
  function insertByTime(list,row){var time=row.dataset.time||'10:00',next=[].slice.call(list.querySelectorAll('.planned-activity,.saved-place')).find(function(item){return(item.dataset.time||'23:59').localeCompare(time)>0});list.insertBefore(row,next||null)}
  function savedDayLabel(dateValue){
    var option=dateOptions.find(function(date){return date.value===dateValue});
    if(!option)return escapePlannerText(dateValue||'');
    var index=dateOptions.indexOf(option)+1;
    return 'יום '+index+' · '+escapePlannerText(option.compactLabel)
  }
  function revealSavedPlace(placeId){
    var shelf=panel.querySelector('[data-saved-places-shelf]'),list=panel.querySelector('[data-saved-places-list]');
    if(!shelf||!list)return;
    setSavedShelfExpanded(true,true);
    var item=list.querySelector('[data-saved-shelf-id="'+String(placeId||'').replace(/"/g,'\\\"')+'"]');
    if(!item)return;
    item.classList.add('is-just-saved');
    requestAnimationFrame(function(){
      var top=item.offsetTop,bottom=top+item.offsetHeight,viewTop=list.scrollTop,viewBottom=viewTop+list.clientHeight;
      if(top<viewTop||bottom>viewBottom)list.scrollTo({top:Math.max(0,top-8),behavior:'smooth'})
    });
    setTimeout(function(){item.classList.remove('is-just-saved')},1800)
  }
  function openSavedPlaceInPlan(place){
    if(!place||!place.date)return;
    var openRow=function(){
      var row=daysContainer.querySelector('[data-saved-place-id="'+String(place.id||'').replace(/"/g,'\\\"')+'"]');
      if(!row)return;
      var day=row.closest('.generated-day');
      if(day&&day.classList.contains('day-collapsed')){var badge=day.querySelector('.badge');if(badge)badge.click()}
      requestAnimationFrame(function(){row.classList.add('is-plan-target');row.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(function(){row.classList.remove('is-plan-target')},1800)})
    };
    if(document.body.dataset.tripView==='plan'){openRow();return}
    var planLink=document.querySelector('.sidebar [data-view="plan"],[data-view="plan"]');
    if(planLink){planLink.click();setTimeout(openRow,120);return}
    var target=new URL(location.href);target.searchParams.set('view','plan');location.href=target.href
  }
  function renderSavedShelf(){
    var shelf=panel.querySelector('[data-saved-places-shelf]'),list=panel.querySelector('[data-saved-places-list]'),count=panel.querySelector('[data-saved-places-count]'),scheduledCount=panel.querySelector('[data-saved-places-scheduled]'),unscheduledCount=panel.querySelector('[data-saved-places-unscheduled]'),items=(trip.savedPlaces||[]).slice();
    if(!shelf||!list||!count)return;
    var scheduledTotal=items.filter(function(place){return Boolean(place.date)}).length;
    count.textContent=items.length===1?'מקום אחד':items.length+' מקומות';
    if(scheduledCount)scheduledCount.textContent=String(scheduledTotal);
    if(unscheduledCount)unscheduledCount.textContent=String(items.length-scheduledTotal);
    shelf.hidden=!items.length;
    setSavedShelfExpanded(items.length?savedShelfExpanded:false,false);
    list.innerHTML=items.map(function(place){
      var maps=safePlannerUrl(place.maps||place.ratingsUrl),scheduled=Boolean(place.date),when=scheduled?'בתוכנית · '+savedDayLabel(place.date)+(place.time?' · '+escapePlannerText(place.time):''):'נשמר כאן · עדיין לא תוזמן';
      var options='<option value="">ללא תאריך</option>'+dateOptions.map(function(date){return '<option value="'+date.value+'"'+(date.value===place.date?' selected':'')+'>'+escapePlannerText(date.compactLabel)+'</option>'}).join('');
      return '<article class="saved-places-shelf__item '+(scheduled?'is-scheduled':'is-unscheduled')+'" data-saved-shelf-id="'+escapePlannerText(place.id||'')+'"><span class="saved-places-shelf__icon"><i class="fa-solid fa-bookmark" aria-hidden="true"></i></span><div class="saved-places-shelf__copy"><strong>'+escapePlannerText(place.name||'מקום שמור')+'</strong><small>'+when+'</small></div><div class="saved-places-shelf__actions"><label><span>יום</span><select data-saved-shelf-date aria-label="יום לתזמון '+escapePlannerText(place.name||'המקום')+'">'+options+'</select></label><label><span>שעה</span><input data-saved-shelf-time type="time" value="'+escapePlannerText(place.time||'10:00')+'" aria-label="שעה לתזמון '+escapePlannerText(place.name||'המקום')+'"></label><button type="button" data-saved-shelf-schedule><i class="fa-solid fa-calendar-check" aria-hidden="true"></i><span>'+(scheduled?'עדכון תזמון':'הוספה לתוכנית')+'</span></button>'+(scheduled?'<button type="button" data-saved-shelf-open-plan><i class="fa-solid fa-list-check" aria-hidden="true"></i><span>הצג בתוכנית</span></button><button type="button" data-saved-shelf-unschedule><i class="fa-solid fa-calendar-xmark" aria-hidden="true"></i><span>הסר מהתוכנית</span></button>':'')+'<button type="button" class="saved-places-shelf__delete" data-saved-shelf-delete aria-label="הסרת '+escapePlannerText(place.name||'המקום')+' מהמקומות השמורים"><i class="fa-solid fa-trash" aria-hidden="true"></i><span>הסר</span></button>'+(maps?'<a href="'+escapePlannerText(maps)+'" target="_blank" rel="noopener noreferrer" aria-label="פתיחת '+escapePlannerText(place.name||'המקום')+' במפה"><i class="fa-solid fa-map-location-dot" aria-hidden="true"></i><span>מפה</span></a>':'')+'</div></article>';
    }).join('')
  }
  function renderSaved(){renderSavedShelf();daysContainer.querySelectorAll('.saved-place').forEach(function(node){node.remove()});daysContainer.querySelectorAll('.generated-day').forEach(function(node){node.classList.remove('has-saved-places')});var changed=false;trip.savedPlaces.forEach(function(place,index){if(!place.id){place.id='place-'+Date.now()+'-'+index;changed=true}if(!place.time){place.time='10:00';changed=true}var dayNumber=Math.floor((new Date(place.date+'T12:00:00')-startDate)/86400000),cards=daysContainer.querySelectorAll('.generated-day'),card=cards[dayNumber];if(!card)return;card.classList.add('has-saved-places');var content=card.querySelector('div'),list=content.querySelector('.planned-activities');if(!list){list=document.createElement('div');list.className='planned-activities day-timeline';content.appendChild(list)}else list.classList.add('day-timeline');var row=document.createElement('article'),official=safePlannerUrl(place.officialUrl),ratings=safePlannerUrl(place.ratingsUrl||place.maps),source=safePlannerUrl(place.sourceUrl),image=safePlannerUrl(place.image),links='';row.className='saved-place'+(place.done?' done':'');row.dataset.savedPlaceId=place.id;row.dataset.placeLat=place.lat||'';row.dataset.placeLon=place.lon||'';row.dataset.time=place.time||'10:00';if(official)links+='<a href="'+escapePlannerText(official)+'" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-globe"></i> אתר רשמי</a>';if(ratings)links+='<a class="google-rating-link" href="'+escapePlannerText(ratings)+'" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-google"></i> ציונים וביקורות</a>';if(source)links+='<a href="'+escapePlannerText(source)+'" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-location-dot"></i> מיקום מדויק</a>';links+='<a class="saved-calendar-link" href="'+escapePlannerText(calendarUrl(place))+'" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-calendar-plus"></i> הוסף ליומן</a>';row.innerHTML=(image?'<img class="saved-place-image" src="'+escapePlannerText(image)+'" alt="תמונה של '+escapePlannerText(place.name)+'" loading="lazy">':'<span class="saved-place-image image-unavailable" role="img" aria-label="אין תמונה זמינה עבור '+escapePlannerText(place.name)+'"><i class="fa-solid fa-location-dot" aria-hidden="true"></i></span>')+'<div class="saved-place-content"><span class="saved-place-type">'+escapePlannerText(place.category||'מקום שנשמר')+'</span><h3>'+escapePlannerText(place.name)+'</h3><div class="saved-place-schedule"><i class="fa-regular fa-clock"></i><strong>'+escapePlannerText(place.time||'10:00')+'</strong></div><div class="saved-place-editor" hidden><input type="time" value="'+escapePlannerText(place.time||'10:00')+'" data-saved-place-time aria-label="שעת הביקור ב'+escapePlannerText(place.name)+'"><button type="button" data-save-saved-time>שמירה</button></div>'+(place.description?'<p>'+escapePlannerText(place.description)+'</p>':'')+'</div><div class="nearby-links saved-place-links">'+links+'</div><span class="saved-place-actions"><button type="button" data-toggle-saved-done title="סימון כהושלם" aria-label="סימון המקום כהושלם"><i class="fa-solid fa-check"></i></button><button type="button" data-edit-saved-place title="עריכת שעה" aria-label="עריכת שעת המקום"><i class="fa-solid fa-pen"></i></button><button type="button" data-delete-saved-place title="מחיקת המקום" aria-label="מחיקת המקום"><i class="fa-solid fa-trash"></i></button></span>';var picture=row.querySelector('img.saved-place-image');if(picture)picture.addEventListener('error',function(){var failed=picture.src,fallback=document.createElement('span');fallback.className='saved-place-image image-unavailable';fallback.setAttribute('role','img');fallback.setAttribute('aria-label','אין תמונה זמינה עבור '+place.name);fallback.innerHTML='<i class="fa-solid fa-location-dot" aria-hidden="true"></i>';picture.replaceWith(fallback);if(window.TravelMateNearby&&window.TravelMateNearby.invalidateMedia)window.TravelMateNearby.invalidateMedia({id:place.sourceId||place.id,wikidata:place.wikidata,wikipedia:place.wikipedia||place.wikipediaUrl,name:place.name});if(place.image===failed||safePlannerUrl(place.image)===failed){var retry=!place.imageFailureRetried;place.image='';place.imageResolutionVersion=retry?0:3;place.imageFailureRetried=true;persist();if(retry)setTimeout(backfillSavedPlaceImages,0)}});insertByTime(list,row)});if(changed)persist()}
  panel.addEventListener('click',function(event){
    if(event.target.closest('[data-saved-places-toggle]')){setSavedShelfExpanded(!savedShelfExpanded,true);return}
    var shelfItem=event.target.closest('[data-saved-shelf-id]');
    if(!shelfItem)return;
    var place=trip.savedPlaces.find(function(item){return item.id===shelfItem.dataset.savedShelfId});
    if(!place)return;
    if(event.target.closest('[data-saved-shelf-schedule]')){
      var date=shelfItem.querySelector('[data-saved-shelf-date]').value,time=shelfItem.querySelector('[data-saved-shelf-time]').value||'10:00';
      if(!date){if(window.showDayToast)window.showDayToast('בחר יום לפני ההוספה לתוכנית.');shelfItem.querySelector('[data-saved-shelf-date]').focus();return}
      place.date=date;place.time=time;persist();renderSaved();if(window.showDayToast)window.showDayToast('המקום תוזמן בתוכנית.');return
    }
    if(event.target.closest('[data-saved-shelf-open-plan]')){
      openSavedPlaceInPlan(place);return
    }
    if(event.target.closest('[data-saved-shelf-unschedule]')){
      place.date='';place.time=place.time||'10:00';persist();renderSaved();if(window.showDayToast)window.showDayToast('התזמון הוסר; המקום נשאר במקומות שמורים.');return
    }
    if(event.target.closest('[data-saved-shelf-delete]')){
      if(window.confirm&& !window.confirm('למחוק את המקום מהמקומות השמורים?'))return;
      trip.savedPlaces=trip.savedPlaces.filter(function(item){return item.id!==place.id});persist();renderSaved();if(window.showDayToast)window.showDayToast('המקום נמחק מהמקומות השמורים.')
    }
  });
  function populateScheduleTimes(select){if(!select||select.dataset.timeOptionsReady==='true')return;var selected=select.value;select.replaceChildren();var blank=document.createElement('option');blank.value='';blank.textContent='—';select.appendChild(blank);for(var hour=0;hour<24;hour++){for(var minute=0;minute<60;minute+=15){var timeValue=String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0'),timeOption=document.createElement('option');timeOption.value=timeValue;timeOption.textContent=timeValue;select.appendChild(timeOption)}}if(/^\d{2}:\d{2}$/.test(selected)&&!select.querySelector('option[value="'+selected+'"]')){var customTime=document.createElement('option');customTime.value=selected;customTime.textContent=selected;select.appendChild(customTime)}select.value=selected;select.dataset.timeOptionsReady='true'}
  function normalizeSavedPlaceText(value){return String(value||'').toLocaleLowerCase().replace(/[\s\-_.,\'״׳()]+/g,' ').trim()}
  function savedPlaceDistanceMeters(first,second){var lat1=Number(first&&first.lat),lon1=Number(first&&first.lon),lat2=Number(second&&second.lat),lon2=Number(second&&second.lon);if(!Number.isFinite(lat1)||!Number.isFinite(lon1)||!Number.isFinite(lat2)||!Number.isFinite(lon2))return Infinity;var rad=Math.PI/180,dLat=(lat2-lat1)*rad,dLon=(lon2-lon1)*rad,a=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin(dLon/2)*Math.sin(dLon/2);return 6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))}
  function savedPlaceMatchesCandidate(place,candidate){var firstId=String(place&&place.sourceId||''),secondId=String(candidate&&candidate.sourceId||'');if(firstId&&secondId&&firstId===secondId)return true;if(place&&candidate&&place.wikidata&&candidate.wikidata&&String(place.wikidata)===String(candidate.wikidata))return true;if(/^osm:/.test(firstId)&&/^osm:/.test(secondId))return false;if(firstId&&secondId&&place&&candidate&&place.source&&candidate.source&&String(place.source)===String(candidate.source))return false;var sameName=normalizeSavedPlaceText(place&&place.name)===normalizeSavedPlaceText(candidate&&candidate.name);if(!sameName)return false;var firstCategory=normalizeSavedPlaceText(place&&place.category),secondCategory=normalizeSavedPlaceText(candidate&&candidate.category);if(firstCategory&&secondCategory&&firstCategory!==secondCategory)return false;var sameAddress=place&&candidate&&place.address&&candidate.address&&normalizeSavedPlaceText(place.address)===normalizeSavedPlaceText(candidate.address);return Boolean(sameAddress)||savedPlaceDistanceMeters(place,candidate)<=30}
  function enhanceResults(root){var scope=root&&root.nodeType?root:panel,results=[];if(scope.matches&&scope.matches('.nearby-result'))results.push(scope);if(scope.querySelectorAll)results.push.apply(results,[].slice.call(scope.querySelectorAll('.nearby-result')));results.forEach(function(result){
    result.classList.add('tm-place-card');var resultContent=result.querySelector(':scope > div:not([data-nearby-result-media])');if(resultContent)resultContent.classList.add('tm-place-card__content');
    if(result.querySelector('.tm-place-card__schedule'))return;
    var heading=result.querySelector('h3'),renameInput=result.querySelector('[data-gps-place-name],[data-nearby-manual-name]'),category=result.dataset.placeCategory||(result.querySelector('.nearby-type')?result.querySelector('.nearby-type').textContent.trim():'מקום'),description=result.querySelector('p')?result.querySelector('p').textContent.trim():'',ratingsLink=result.querySelector('.google-rating-link'),officialLink=result.querySelector('.nearby-links a i.fa-globe'),sourceLink=result.querySelector('.nearby-links a[href*="openstreetmap.org"]'),scheduleFields=document.createElement('section'),primaryActions=document.createElement('div'),secondaryActions=document.createElement('div'),scheduleHeading=document.createElement('h4'),dateLabel=document.createElement('label'),timeLabel=document.createElement('label'),scheduleDate=document.createElement('select'),scheduleTime=document.createElement('select'),validation=document.createElement('small'),distance=result.querySelector(':scope > .nearby-distance'),resultId=result.dataset.placeId||[result.dataset.placeLat,result.dataset.placeLon,result.dataset.placeName||(heading&&heading.textContent.trim())].filter(Boolean).join('|');
    if(!resultId)resultId='result-'+Date.now()+'-'+Math.random().toString(36).slice(2);result.dataset.schedulingDraftId=resultId;var draft=resultSchedulingDraft[resultId]||(resultSchedulingDraft[resultId]={date:'',time:'10:00'}),linkGroup=resultContent&&resultContent.querySelector(':scope > .nearby-links');officialLink=officialLink&&officialLink.closest('a');scheduleFields.className='nearby-result-schedule tm-place-card__schedule';primaryActions.className='tm-place-card__primary-actions';secondaryActions.className='nearby-links tm-place-card__secondary-actions';scheduleHeading.textContent='מתי להוסיף לתוכנית?';dateLabel.className='nearby-schedule-date tm-place-card__date';dateLabel.innerHTML='<span>תאריך</span>';timeLabel.className='nearby-schedule-time tm-place-card__time';timeLabel.innerHTML='<span>שעה</span>';scheduleDate.dataset.nearbyScheduleDate='';scheduleDate.dir='ltr';scheduleDate.setAttribute('aria-label','תאריך לתזמון '+((heading&&heading.textContent.trim())||'המקום'));scheduleDate.innerHTML='<option value="">—</option>';dateOptions.forEach(function(date){var option=document.createElement('option');option.value=date.value;option.textContent=date.compactLabel;scheduleDate.appendChild(option)});scheduleDate.value=dateOptions.some(function(date){return date.value===draft.date})?draft.date:'';scheduleTime.dataset.nearbyScheduleTime='';scheduleTime.dataset.timeOptionsReady='false';scheduleTime.dir='ltr';scheduleTime.setAttribute('aria-label','שעה לתזמון '+((heading&&heading.textContent.trim())||'המקום'));var initialTime=document.createElement('option');initialTime.value=/^\d{2}:\d{2}$/.test(draft.time||'')?draft.time:'';initialTime.textContent=initialTime.value||'—';scheduleTime.appendChild(initialTime);scheduleTime.value=initialTime.value;validation.className='nearby-schedule-validation';validation.setAttribute('aria-live','polite');dateLabel.appendChild(scheduleDate);timeLabel.appendChild(scheduleTime);scheduleFields.append(scheduleHeading,dateLabel,timeLabel,validation);if(distance&&resultContent)resultContent.appendChild(distance);var keyLinks=document.createElement('div'),moreDetails=document.createElement('button');keyLinks.className='nearby-links tm-place-card__key-links';moreDetails.type='button';moreDetails.className='nearby-more-details';moreDetails.innerHTML='<i class="fa-solid fa-ellipsis"></i> עוד פרטים';if(linkGroup){linkGroup.classList.remove('nearby-links');[].slice.call(linkGroup.children).forEach(function(action){if(action.matches('a.google-rating-link')||action.querySelector('i.fa-globe'))keyLinks.appendChild(action);else secondaryActions.appendChild(action)});linkGroup.remove();if(resultContent&&keyLinks.children.length)resultContent.appendChild(keyLinks);secondaryActions.hidden=true;if(!secondaryActions.children.length)moreDetails.hidden=true}else{secondaryActions.hidden=true;moreDetails.hidden=true}
    var button=document.createElement('button'),scheduleButton=document.createElement('button');scheduleFields.hidden=true;button.type='button';button.className='nearby-save-primary';button.innerHTML='<i class="fa-solid fa-bookmark"></i> שמירה למקומות';scheduleButton.type='button';scheduleButton.className='nearby-save-schedule';scheduleButton.innerHTML='<i class="fa-solid fa-calendar-plus"></i> הוספה לתוכנית';
    function savePlace(schedule){
      var name=(renameInput&&renameInput.value.trim())||result.dataset.placeName||(heading?heading.textContent.trim():'מקום'),lat=Number(result.dataset.placeLat||0),lon=Number(result.dataset.placeLon||0),sourceId=result.dataset.placeId||'',address=result.dataset.placeAddress||description,identity={sourceId:sourceId,source:result.dataset.placeSource||'',wikidata:result.dataset.placeWikidata||'',name:name,address:address,category:category,lat:lat,lon:lon};
      if(!name){if(renameInput)renameInput.focus();return}
      if(schedule){validation.textContent='';scheduleDate.classList.remove('is-invalid');scheduleTime.classList.remove('is-invalid');if(!draft.date){validation.textContent='יש לבחור תאריך לפני ההוספה לתוכנית.';scheduleDate.classList.add('is-invalid');scheduleDate.focus();return}if(!draft.time){validation.textContent='יש לבחור שעה לפני ההוספה לתוכנית.';scheduleTime.classList.add('is-invalid');scheduleTime.focus();return}}
      var existing=trip.savedPlaces.find(function(place){return savedPlaceMatchesCandidate(place,identity)});
      var currentImage=result.querySelector('[data-nearby-result-media] img,:scope > img'),placeData={id:existing&&existing.id||'place-'+Date.now(),name:name,category:category,description:description,address:address,date:schedule?draft.date:(existing&&existing.date||''),time:schedule?draft.time:(existing&&existing.time||''),duration:60,maps:ratingsLink?ratingsLink.href:'#',ratingsUrl:ratingsLink?ratingsLink.href:'',officialUrl:officialLink?officialLink.href:'',sourceUrl:sourceLink?sourceLink.href:'',image:currentImage?currentImage.currentSrc||currentImage.src:(result.dataset.placeImage||''),imageSource:result.dataset.placeImageSource||'',imageAttribution:result.dataset.placeImageAttribution||'',lat:result.dataset.placeLat||'',lon:result.dataset.placeLon||'',source:result.dataset.placeSource||'',sourceId:sourceId,phone:result.dataset.placePhone||'',wikidata:result.dataset.placeWikidata||'',wikipediaUrl:result.dataset.placeWikipedia||'',wikipedia:result.dataset.placeWikipedia||'',commons:result.dataset.placeCommons||'',imageResolutionVersion:(currentImage||result.dataset.placeImage)?3:0,gpsAccuracy:Number(result.dataset.gpsAccuracy||0)||undefined};
      if(existing){Object.assign(existing,placeData);button.innerHTML='<i class="fa-solid fa-check"></i> כבר במקומות שמורים';scheduleButton.innerHTML=schedule?'<i class="fa-solid fa-calendar-check"></i> התזמון עודכן':'<i class="fa-solid fa-calendar-plus"></i> הוספה ותזמון'}else{trip.savedPlaces.push(placeData);button.innerHTML='<i class="fa-solid fa-check"></i> נשמר במקומות שמורים'}
      persist();renderSaved();backfillSavedPlaceImages();button.classList.add('saved');button.innerHTML='<i class="fa-solid fa-check"></i> נשמר · הצג במקומות ששמרתי';result.dataset.duplicate=existing?'true':'false';revealSavedPlace(placeData.id);if(window.showDayToast)window.showDayToast(schedule?'המקום נשמר ונוסף לתוכנית.':'המקום נשמר ב״מקומות שמורים״ בכרטיסיית מקומות — באזור ״המקומות ששמרתי״.');
    }
    scheduleDate.addEventListener('change',function(){draft.date=scheduleDate.value;scheduleDate.classList.remove('is-invalid');validation.textContent=''});scheduleTime.addEventListener('change',function(){draft.time=scheduleTime.value;scheduleTime.classList.remove('is-invalid');validation.textContent=''});
    button.addEventListener('click',function(){savePlace(false)});scheduleButton.addEventListener('click',function(){if(scheduleFields.hidden){scheduleFields.hidden=false;scheduleButton.innerHTML='<i class="fa-solid fa-calendar-check"></i> שמירה בתוכנית';populateScheduleTimes(scheduleTime);scheduleDate.focus();return}savePlace(true)});moreDetails.addEventListener('click',function(){secondaryActions.hidden=!secondaryActions.hidden;moreDetails.setAttribute('aria-expanded',String(!secondaryActions.hidden));moreDetails.innerHTML=secondaryActions.hidden?'<i class="fa-solid fa-ellipsis"></i> עוד פרטים':'<i class="fa-solid fa-chevron-up"></i> פחות פרטים'});moreDetails.setAttribute('aria-expanded','false');
    primaryActions.append(button,scheduleButton);if(!moreDetails.hidden)primaryActions.appendChild(moreDetails);result.append(scheduleFields,primaryActions,secondaryActions)
  })}
  panel.addEventListener('travelmate:nearby-results-reset',function(){resultSchedulingDraft=Object.create(null)});window.addEventListener('travelmate:nearby-ready',backfillSavedPlaceImages);
  panel.addEventListener('pointerdown',function(event){if(event.target.matches('[data-nearby-schedule-time]'))populateScheduleTimes(event.target)},{capture:true});panel.addEventListener('focusin',function(event){if(event.target.matches('[data-nearby-schedule-time]'))populateScheduleTimes(event.target)});panel.addEventListener('travelmate:nearby-results-rendered',function(event){enhanceResults(event.target)});enhanceResults(panel);daysContainer.addEventListener('click',function(event){var row=event.target.closest('[data-saved-place-id]');if(!row)return;var place=trip.savedPlaces.find(function(item){return item.id===row.dataset.savedPlaceId});if(!place)return;if(event.target.closest('[data-edit-saved-place]')){var editor=row.querySelector('.saved-place-editor');editor.hidden=!editor.hidden;if(!editor.hidden)editor.querySelector('input').focus();return}if(event.target.closest('[data-save-saved-time]')){place.time=row.querySelector('[data-saved-place-time]').value||'10:00';persist();renderSaved();return}if(event.target.closest('[data-toggle-saved-done]')){place.done=!place.done;persist();renderSaved();return}if(event.target.closest('[data-delete-saved-place]')&&window.confirm('למחוק את המקום מהתוכנית היומית?')){trip.savedPlaces=trip.savedPlaces.filter(function(item){return item.id!==place.id});persist();renderSaved()}});document.addEventListener('travelmate:planner-rendered',function(){renderSaved();backfillSavedPlaceImages()});document.addEventListener('travelmate:saved-place-date-updated',function(event){var detail=event.detail||{},place=trip.savedPlaces.find(function(item){return item.id===detail.id});if(!place)return;place.date=detail.date;renderSaved()});renderSaved();backfillSavedPlaceImages();
  function activatePlaces(view){if(view!=='places')return;ensureNearby();ensureDestination()}
  activatePlaces(document.body.dataset.tripView||new URLSearchParams(location.search).get('view')||'overview');window.addEventListener('travelmate:viewchange',function(event){activatePlaces(event.detail&&event.detail.view)});
}
function escapePlannerText(value){return String(value||'').replace(/[&<>"']/g,function(character){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]})}
function safePlannerUrl(value){var raw=String(value||'').trim();if(!raw||raw==='#')return '';try{var url=new URL(raw,location.href);return /^https?:$/.test(url.protocol)?url.href:''}catch(error){return ''}}
function addPlannerMinutes(time,amount){var parts=String(time||'10:00').split(':').map(Number),total=(parts[0]||0)*60+(parts[1]||0)+Number(amount||0);return String(Math.floor(total/60)%24).padStart(2,'0')+':'+String(total%60).padStart(2,'0')}
function calendarStamp(date,time){return String(date||'').replace(/-/g,'')+'T'+String(time||'10:00').replace(':','')+'00'}
function startTripPlacePlanner(){Promise.resolve(window.travelMateTripReady).then(initTripPlacePlanner).catch(function(error){console.error('TravelMate place planner startup failed',error)})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startTripPlacePlanner);else startTripPlacePlanner();

(function installFullScheduleEditing(){
  if(!/\/trip\//.test(location.pathname.replace(/\\/g,'/')))return;
  var scheduled=false;
  function trips(){return window.TravelMateTripStore?window.TravelMateTripStore.getTrips():[]}
  function current(){var id=new URLSearchParams(location.search).get('id');return window.TravelMateTripStore?window.TravelMateTripStore.getTrip(id):null}
  function dateChoices(trip){var result=[],start=new Date(trip.start+'T12:00:00');for(var i=0;i<Number(trip.days||0);i++){var date=new Date(start.getTime()+i*86400000);result.push({value:date.toISOString().slice(0,10),label:'יום '+(i+1)+' · '+new Intl.DateTimeFormat('he-IL',{day:'numeric',month:'long'}).format(date)})}return result}
  function saveTrip(trip){if(!window.TravelMateTripStore)return;window.TravelMateTripStore.saveTrip(trip)}
  function minutesValue(value){var parts=String(value||'00:00').split(':').map(Number);return(parts[0]||0)*60+(parts[1]||0)}
  function enhance(){
    scheduled=false;
    var trip=current(),days=document.querySelector('[data-generated-days]');if(!trip||!days)return;
    var choices=dateChoices(trip);
    days.querySelectorAll('[data-saved-place-id]').forEach(function(row){
      var place=(trip.savedPlaces||[]).find(function(item){return item.id===row.dataset.savedPlaceId}),editor=row.querySelector('.saved-place-editor');if(!place||!editor||editor.querySelector('[data-saved-place-date]'))return;
      var label=document.createElement('label');label.className='saved-place-day-field';label.innerHTML='<span>יום בטיול</span><select data-saved-place-date aria-label="בחירת יום לפעילות">'+choices.map(function(item){return'<option value="'+item.value+'"'+(item.value===place.date?' selected':'')+'>'+item.label+'</option>'}).join('')+'</select>';
      editor.insertBefore(label,editor.firstChild);
      label.querySelector('select').addEventListener('change',function(event){
        place.date=event.target.value;saveTrip(trip);
        document.dispatchEvent(new CustomEvent('travelmate:saved-place-date-updated',{detail:{id:place.id,date:place.date}}));
        window.TravelMateEvents.emit(window.TravelMateEvents.names.placesUpdated,{tripId:trip.id,source:'places-planner'});
        if(window.showDayToast)window.showDayToast('הפעילות הועברה ליום שבחרת.');
      });
    });
    var conflictRows=new Set();
    days.querySelectorAll('.generated-day').forEach(function(day){
      var rows=[].slice.call(day.querySelectorAll('.planned-activity,.saved-place')).map(function(row){
        var record=row.matches('.saved-place')?(trip.savedPlaces||[]).find(function(item){return item.id===row.dataset.savedPlaceId}):(trip.activities||[]).find(function(item){return item.id===row.dataset.activityId});
        return{row:row,start:minutesValue(row.dataset.time||(record&&record.time)),duration:Number(record&&record.duration||90)};
      }).sort(function(a,b){return a.start-b.start});
      for(var i=0;i<rows.length;i++){for(var j=i+1;j<rows.length&&rows[j].start<rows[i].start+rows[i].duration;j++){conflictRows.add(rows[i].row);conflictRows.add(rows[j].row)}}
    });
    days.querySelectorAll('.planned-activity,.saved-place').forEach(function(row){var hasConflict=conflictRows.has(row),note=row.querySelector('.schedule-conflict-note');row.classList.toggle('soft-conflict',hasConflict);if(hasConflict&&!note){note=document.createElement('span');note.className='schedule-conflict-note';note.innerHTML='<i class="fa-regular fa-clock"></i> חפיפה אפשרית';var copy=row.querySelector('.activity-copy,.saved-place-content')||row;copy.appendChild(note)}else if(!hasConflict&&note)note.remove()});
  }
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(enhance)}
  function start(){var days=document.querySelector('[data-generated-days]');if(!days)return;new MutationObserver(schedule).observe(days,{childList:true,subtree:true});document.addEventListener('travelmate:planner-rendered',schedule);document.addEventListener('travelmate:places-updated',schedule);schedule()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();

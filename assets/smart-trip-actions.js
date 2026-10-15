(function(root,factory){
 'use strict';
 var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
 if(root&&!root.TravelMateSmartTripActions){root.TravelMateSmartTripActions=api;if(root.document)api.mount(root);}
})(typeof window==='undefined'?null:window,function(){
 'use strict';
 function controller(options){
  var engine=options.engine,token=null,scope=null;
  function fence(){var trip=options.read(),account=String(options.account()||''),id=String(options.tripId()||'');
   if(!trip||String(trip.id)!==id||(scope&&(scope.account!==account||scope.id!==id||scope.owner!==String(trip.ownerId||''))))throw Error('SMART_TRIP_CONTEXT_CHANGED');
   if(trip.ownerId&&String(trip.ownerId)!==account)throw Error('SMART_TRIP_READ_ONLY');
   return trip;
  }
  return Object.freeze({
   state:function(){return token?token.state:'idle';},
   reset:function(){token=null;scope=null;},
   preview:function(id,time){var trip=fence();scope={account:String(options.account()||''),id:String(options.tripId()||''),owner:String(trip.ownerId||'')};token=engine.previewMove(trip,id,time,{ownerId:scope.account,context:options.context});return token;},
   confirm:function(){fence();token=engine.confirmMove(token);return token;},
   apply:function(){var result=engine.applyMove(fence(),token);if(!options.save(result.trip))throw Error('SMART_TRIP_SAVE_FAILED');token=result.undoToken;return result;},
   undo:function(){var result=engine.undoMove(fence(),token);if(!options.save(result.trip))throw Error('SMART_TRIP_SAVE_FAILED');token=null;scope=null;return result;}
  });
 }
 function escape(value){return String(value||'').replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
 function selectLiveTransitions(snapshot,trip,now){
  if(!snapshot||!trip||String(snapshot.tripId||'')!==String(trip.id||''))return null;
  var updatedAt=Number(snapshot.updatedAt),current=Number(now);if(!Number.isFinite(current))current=Date.now();
  if(!Number.isFinite(updatedAt)||updatedAt<=0||current<updatedAt||current-updatedAt>120000)return null;
  return snapshot.transitions&&typeof snapshot.transitions==='object'?snapshot.transitions:null;
 }
 function buildWeatherByKey(trip,weatherContext){
  var result={};if(!trip||!weatherContext||typeof weatherContext.at!=='function')return result;
  function add(kind,record){if(!record||record.done===true||!record.id||!record.date||!record.time)return;var evidence=weatherContext.at(record.date,record.time);if(evidence&&evidence.ready===true)result[kind+':'+String(record.id)]=evidence;}
  (trip.activities||[]).forEach(function(record){add('activity',record);});(trip.savedPlaces||[]).forEach(function(record){add('place',record);});return result;
 }
 function mount(win){
  var plan=win.document.querySelector('#plan');if(!plan||plan.querySelector('[data-smart-check]'))return;
  var engine=win.TravelMateSmartTripDecisions,store=win.TravelMateTripStore;if(!engine||!store)return;
  function id(){return new URLSearchParams(win.location.search).get('id')||'';}
  function account(){return win.localStorage.getItem('travelmate-active-user')||'';}
  function read(){return store.getTrip(id());}
  var flow=controller({engine:engine,read:read,account:account,tripId:id,context:win.TravelMateTripContext,save:function(trip){var saved=store.saveTrip(trip);if(saved)win.TravelMateEvents.emit(win.TravelMateEvents.names.activitiesUpdated,{tripId:trip.id,source:'smart-trip'});return saved;}});
  var check=win.document.createElement('button');check.type='button';check.dataset.smartCheck='';check.className='secondary';check.textContent='בדיקת היום · Smart Trip';check.setAttribute('aria-expanded','false');plan.prepend(check);
  var active=false,message='',preview=null,alternativeByKey={};
  function paint(focus){
   if(!focus&&flow.state()!=='idle')return;
   var card=win.document.querySelector('[data-smart-trip-mode]');if(!card)return;if(!active){if(card.dataset.smartDecisionActive!==undefined)card.hidden=true;return;}
   if(check.nextSibling!==card)plan.insertBefore(card,check.nextSibling);card.dataset.smartDecisionActive='';card.hidden=false;
   var panel=card.querySelector('[data-smart-decisions]');if(!panel){panel=win.document.createElement('div');panel.dataset.smartDecisions='';panel.id='smart-trip-decisions-panel';card.appendChild(panel);}check.setAttribute('aria-controls',panel.id);
   var trip=read();if(!trip){panel.textContent='הטיול אינו זמין בחשבון הנוכחי.';return;}
   var context=win.TravelMateTripContext,now=new Date(),opening={};(trip.activities||[]).concat(trip.savedPlaces||[]).forEach(function(item){if(!win.TravelMateOpeningHours||!item.openingHours||!item.time)return;var moment=new Date(item.date+'T'+item.time+':00'),at=win.TravelMateOpeningHours.statusAt(item.openingHours,moment),end=win.TravelMateOpeningHours.statusAtMinutes(item.openingHours,moment,Number(item.duration||60));opening[item.id]={status:at.state==='closed'?'closed':at.state==='open'&&end.state==='closed'?'closing':'unknown',source:at.source};});var liveSnapshot=win.TravelMatePlanLiveRouting&&typeof win.TravelMatePlanLiveRouting.getSnapshot==='function'?win.TravelMatePlanLiveRouting.getSnapshot():null,transitionById=selectLiveTransitions(liveSnapshot,trip,now.getTime()),weatherContext=win.TravelMateWeatherContext||null,weatherByKey=buildWeatherByKey(trip,weatherContext);var result=engine.analyze({trip:trip,now:now,context:context,transitionById:transitionById,openingById:opening,offline:win.navigator.onLine===false,weatherByKey:weatherByKey,weather:weatherContext&&typeof weatherContext.snapshot==='function'?weatherContext.snapshot():null});
   var items=result.recommendations.map(function(item){return '<li><strong>'+escape(item.title)+'</strong><p>'+escape(item.reason)+'</p><small>'+escape(item.provenance)+' · '+escape({high:'ביטחון גבוה',medium:'הערכה',low:'לא מאומת'}[item.confidence])+'</small> <a href="'+escape(item.action.href)+'">פתיחה</a></li>';}).join('');alternativeByKey={};var alternativeHtml=(result.alternatives||[]).map(function(item){alternativeByKey[item.key]=item;return '<li><strong>'+escape(item.title)+'</strong><p>'+escape(item.oldTime)+' ← '+escape(item.newTime)+' · '+escape(item.reason)+'</p><small>'+escape(item.provenance)+' · '+escape({high:'ביטחון גבוה',medium:'הערכה',low:'לא מאומת'}[item.confidence]||'לא מאומת')+'</small><button type="button" data-smart-alternative="'+escape(item.key)+'">תצוגה מקדימה לחלופה</button></li>';}).join('');
   var moves=(trip.activities||[]).filter(function(item){var mode=context.scheduleMode(item);return item.done!==true&&item.date===result.date&&mode!=='fixed'&&mode!=='window'&&/^\d{2}:\d{2}$/.test(item.time||'');});
   var state=flow.state(),content='';
   if(state==='preview'||state==='confirmed')content='<p>תצוגה מקדימה: '+escape(preview.oldTime)+' ← '+escape(preview.newTime)+'. יתר הפעילויות לא יוזזו; יש לבדוק את התאמת השעה.</p><button type="button" data-smart-step="'+(state==='preview'?'confirm':'apply')+'">'+(state==='preview'?'אישור השינוי':'החלת השינוי')+'</button><button type="button" data-smart-step="cancel">ביטול</button>';
   else if(state==='undoable')content='<p>השעה נשמרה.</p><button type="button" data-smart-step="undo">ביטול השינוי האחרון</button>';
   else if(moves.length&&(!trip.ownerId||String(trip.ownerId)===account()))content='<form data-smart-move><label>פעילות גמישה<select name="activity">'+moves.map(function(item){return '<option value="'+escape(item.id)+'">'+escape(item.title)+' · '+escape(item.time)+'</option>';}).join('')+'</select></label><label>שעה מוצעת<input name="time" type="time" required></label><button type="submit">תצוגה מקדימה</button></form>';if(state==='idle'&&alternativeHtml)content+='<section data-smart-alternatives><h4>חלופות אפשריות</h4><ul>'+alternativeHtml+'</ul></section>';
   panel.innerHTML='<h3>בדיקת היום</h3>'+(items?'<ul>'+items+'</ul>':'<p>לא נמצאה המלצה מבוססת כרגע. אפשר להמשיך בתוכנית.</p>')+content+'<p role="status" aria-live="polite" data-smart-status>'+escape(message)+'</p>';
   if(focus){var target=panel.querySelector(focus);if(target)target.focus();}
  }
  function fail(){flow.reset();preview=null;message='הפעולה לא נשמרה: החשבון, הטיול או הפעילות השתנו. יש לבדוק מחדש.';paint('[data-smart-move] select');}
  check.addEventListener('click',function(){active=!active;check.setAttribute('aria-expanded',String(active));if(active)paint('[data-smart-move] select');else{var card=win.document.querySelector('[data-smart-trip-mode]');if(card)card.hidden=true;}});
  plan.addEventListener('submit',function(event){if(!event.target.matches('[data-smart-move]'))return;event.preventDefault();try{preview=flow.preview(event.target.elements.activity.value,event.target.elements.time.value);message='התוכנית עדיין לא השתנתה.';paint('[data-smart-step="confirm"]');}catch(error){fail();}});
  plan.addEventListener('click',function(event){var button=event.target.closest('[data-smart-alternative]');if(!button)return;var alternative=alternativeByKey[button.dataset.smartAlternative];if(!alternative)return;try{preview=flow.preview(alternative.activityId,alternative.newTime);message='החלופה מוצגת בלבד; התוכנית עדיין לא השתנתה.';paint('[data-smart-step="confirm"]');}catch(error){fail();}});
  plan.addEventListener('click',function(event){var button=event.target.closest('[data-smart-step]');if(!button)return;try{var step=button.dataset.smartStep;if(step==='cancel'){flow.reset();preview=null;}else flow[step]();message=step==='apply'?'השינוי נשמר; אפשר לבטל אותו.':step==='undo'?'השעה המקורית שוחזרה.':'האישור התקבל; השמירה תתבצע רק בהחלה.';paint(step==='confirm'?'[data-smart-step="apply"]':step==='apply'?'[data-smart-step="undo"]':'[data-smart-move] select');}catch(error){fail();}});
  win.document.addEventListener('travelmate:smart-trip-updated',function(){var panel=win.document.querySelector('[data-smart-decisions]'),form=panel&&panel.querySelector('[data-smart-move]');if(active&&(flow.state()!=='idle'||panel&&panel.contains(win.document.activeElement)||form&&form.elements.time.value))return;paint();});
  win.addEventListener('travelmate:plan-live-routing',function(event){if(!active||!event.detail||String(event.detail.tripId||'')!==id())return;var panel=win.document.querySelector('[data-smart-decisions]'),form=panel&&panel.querySelector('[data-smart-move]'),draftTime=form&&form.elements&&form.elements.time&&form.elements.time.value,editing=form&&form.contains(win.document.activeElement);if(editing||draftTime)return;paint();});
  ['travelmate:account-context-changed','travelmate:home-auth','travelmate:trip-write-forbidden'].forEach(function(name){win.addEventListener(name,function(){flow.reset();preview=null;message='';active=false;check.setAttribute('aria-expanded','false');var card=win.document.querySelector('[data-smart-trip-mode]');if(card)card.hidden=true;});});
 }
 return Object.freeze({controller:controller,mount:mount,selectLiveTransitions:selectLiveTransitions,buildWeatherByKey:buildWeatherByKey});
});

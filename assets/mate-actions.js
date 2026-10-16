(function(root,factory){'use strict';var api=factory(typeof module==='object'&&module.exports?require('./mate-trip-snapshot.js'):root.TravelMateTripSnapshot);if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TravelMateActions=api;})(typeof window==='undefined'?null:window,function(snapshot){
 'use strict';
 function copy(value){return JSON.parse(JSON.stringify(value));}
 function fingerprint(trip){return JSON.stringify(trip.activities||[]);}
 function validate(actions,context,request){
  if(!context||!Array.isArray(context.activities)||!Array.isArray(actions)||actions.length!==1)return null;
  var action=actions[0];
  if(!action||action.type!=='remove_activity'||action.requiresConfirmation!==true||typeof action.activityId!=='string'||!action.activityId||action.activityId.length>100)return null;
  var matches=context.activities.filter(function(a){return String(a.id)===action.activityId;});if(matches.length!==1)return null;
  var activity=matches[0],duplicates=context.activities.filter(function(a){return a.title===activity.title;});
  if(duplicates.length>1){var specified=duplicates.filter(function(a){return a.time&&String(request||'').includes(a.time)&&(!duplicates.some(function(b){return b!==a&&b.time===a.time;})||a.date&&String(request||'').includes(a.date));});if(specified.length!==1||String(specified[0].id)!==action.activityId)return null;}
  return {type:'remove_activity',activityId:action.activityId,requiresConfirmation:true};
 }

 var types=['remove_plan_item','add_plan_item','move_plan_item','update_plan_item','mark_completed','add_saved_place_to_plan'];
 function keys(value,allowed){return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(function(k){return allowed.includes(k);});}
 function validDate(value,context){return Boolean(snapshot.date(value))&&(!context.start||value>=context.start)&&(!context.end||value<=context.end);}

 function openScreen(request){var match=/^(?:פתח|פתחי|open)\s+(?:את\s+)?(תוכנית|תכנית|מקומות|תקציב|מסמכים|סקירה|plan|places|budget|documents|overview)[.!?]?$/i.exec(String(request||'').trim());return match?({'תוכנית':'plan','תכנית':'plan','מקומות':'places','תקציב':'budget','מסמכים':'documents','סקירה':'overview',plan:'plan',places:'places',budget:'budget',documents:'documents',overview:'overview'})[match[1].toLowerCase()]:null;}
 function referenceId(context,request){
  var items=context.timeline||[],text=String(request||''),named=items.filter(function(i){return i.title&&text.includes(i.title);});
  if(named.length===1)return named[0].planItemId;
  var pool=named.length?named:items;
  if(/הראשו(?:ן|נה)|\bfirst\b/i.test(text))return pool[0]&&pool[0].planItemId;
  if(/השני(?:יה)?|\bsecond\b/i.test(text))return pool[1]&&pool[1].planItemId;
  if(/הבא(?:ה)?|\bnext\b/i.test(text)){var now=context.currentState||{},next=pool.filter(function(i){return !i.done&&i.date&&(i.date>now.date||i.date===now.date&&i.time>=now.time);})[0];return next&&next.planItemId;}
  if(/אותה|אותו|את זה|that one|this one/i.test(text))return context.referencePlanItemId||null;
  return null;
 }
 function validateV2(actions,context,request){
  if(!context||!Array.isArray(context.timeline)||!Array.isArray(actions)||actions.length!==1)return null;
  var a=actions[0];if(!keys(a,['type','planItemId','changes','requiresConfirmation'])||!types.includes(a.type)||a.requiresConfirmation!==true)return null;
  var changes=a.changes||{},allowed=a.type==='add_plan_item'?['title','date','time','duration','category']:a.type==='update_plan_item'?['title','date','time','duration']:a.type==='move_plan_item'||a.type==='add_saved_place_to_plan'?['date','time']:[];
  if(!keys(changes,allowed))return null;
  if('title'in changes&&(typeof changes.title!=='string'||!changes.title.trim()||changes.title.length>160))return null;
  if('category'in changes&&(typeof changes.category!=='string'||changes.category.length>60))return null;
  if('date'in changes&&!validDate(changes.date,context))return null;
  if('time'in changes&&!snapshot.time(changes.time))return null;
  if('duration'in changes&&(typeof changes.duration!=='number'||!Number.isFinite(changes.duration)||changes.duration<5||changes.duration>1440))return null;
  if(['move_plan_item','update_plan_item'].includes(a.type)&&!Object.keys(changes).length)return null;
  if(['add_plan_item','add_saved_place_to_plan'].includes(a.type)&&(!changes.date||!changes.time))return null;
  if(a.type==='add_plan_item'){if(a.planItemId!==undefined||!changes.title)return null;return copy(a);}
  if(typeof a.planItemId!=='string'||a.planItemId.length>120)return null;
  var pool=a.type==='add_saved_place_to_plan'?context.savedPlaces:context.timeline;
  if(!Array.isArray(pool))return null;
  var matches=pool.filter(function(i){return i.planItemId===a.planItemId;});if(matches.length!==1)return null;
  var target=matches[0],reference=referenceId(context,request);if(reference&&a.type!=='add_saved_place_to_plan'&&reference!==a.planItemId)return null;if(!target.sourceId||!['activity','saved_place'].includes(target.sourceType)||target.isTripBase||target.travelAnchor)return null;
  if(a.type==='add_saved_place_to_plan'&&(target.sourceType!=='saved_place'||target.date))return null;
  var duplicates=pool.filter(function(i){return i.title===target.title;});
  if(duplicates.length>1&&reference!==a.planItemId){var specified=duplicates.filter(function(i){return i.time&&String(request||'').includes(i.time)&&(!duplicates.some(function(j){return j!==i&&j.time===i.time;})||i.date&&String(request||'').includes(i.date));});if(specified.length!==1||specified[0].planItemId!==a.planItemId)return null;}
  // Deleting the saved object is deliberately unsupported; unscheduling is a different action.
  if(a.type==='remove_plan_item'&&target.sourceType==='saved_place'&&/מהמקומות השמורים|ממקומות שמורים|delete.*saved|remove.*saved places/i.test(String(request||'')))return null;
  return copy(a);
 }
 function create(options){
  var generation=0,lastReference=null;
  function scope(){return [String(options.account()||''),String(options.tripId()||''),generation].join('|');}
  function read(){var account=String(options.account()||''),trip=options.store.getTrip(options.tripId(),account);
   if(!account||!trip||String(trip.id)!==String(options.tripId())||String(trip.ownerId||'')!==account||trip.readOnly===true||trip.syncStatus==='conflict')throw Error('MATE_ACTION_READ_ONLY');if(['activities','savedPlaces'].some(function(field){return trip[field]!=null&&(!Array.isArray(trip[field])||trip[field].some(function(item){return !item||typeof item!=='object'||Array.isArray(item);}));}))throw Error('MATE_ACTION_INVALID_TRIP');return trip;}
  function capture(){try{var trip=read();return {scope:scope(),revision:fingerprint(trip),planRevision:planRevision(trip),owner:trip.ownerId};}catch(error){return null;}}
  function propose(actions,context,request,fence){
   if(actions&&actions[0]&&actions[0].type!=='remove_activity')return proposeV2(actions,context,request,fence);
   var action=validate(actions,context,request);if(!action||!fence||fence.scope!==scope())return null;
   var trip;try{trip=read();}catch(error){return null;}
   if(String(context.id)!==String(trip.id)||fence.revision!==fingerprint(trip)||!validate(actions,trip,request))return null;
   var index=(trip.activities||[]).findIndex(function(a){return String(a.id)===action.activityId;});if(index<0)return null;
   var removed=copy(trip.activities[index]),revision=fence.revision,state='proposed',expires=(options.now||Date.now)()+300000;
   function check(){if(fence.scope!==scope()||(options.now||Date.now)()>expires)throw Error('MATE_ACTION_STALE');var live=read();if(fingerprint(live)!==revision)throw Error('MATE_ACTION_STALE');return live;}
   function write(undo){
    if(state!==(undo?'undoable':'proposed'))throw Error('MATE_ACTION_STALE');check();state='saving';
    try{var changed=false,saved=options.store.updateTrip(options.tripId(),function(draft,current){check();if(fingerprint(current)!==revision)throw Error('MATE_ACTION_STALE');draft.activities=copy(current.activities||[]);if(undo){if(draft.activities.some(function(a){return String(a.id)===action.activityId;}))throw Error('MATE_ACTION_STALE');draft.activities.splice(index,0,copy(removed));}else{if(JSON.stringify(draft.activities[index])!==JSON.stringify(removed))throw Error('MATE_ACTION_STALE');draft.activities.splice(index,1);}changed=true;return draft;},{ownerId:fence.owner});
     if(!changed||!saved)throw Error('MATE_ACTION_SAVE_FAILED');revision=fingerprint(saved);state=undo?'undone':'undoable';
     options.emit({tripId:saved.id,activityId:action.activityId,action:undo?'restored':'removed',source:'mate'});return copy(removed);
    }catch(error){state='invalid';throw error;}
   }
   return Object.freeze({activity:copy(removed),confirm:function(){return write(false);},undo:function(){return write(true);},cancel:function(){if(state==='proposed')state='cancelled';},valid:function(){try{check();return state==='proposed'||state==='undoable';}catch(error){return false;}},state:function(){return state;}});
  }

  function planRevision(trip){return JSON.stringify([trip.start,trip.end,trip.activities||[],trip.savedPlaces||[]]);}
  function fullContext(trip){var c=snapshot.build(trip);c.timeline=snapshot.timeline(trip);c.savedPlaces=(trip.savedPlaces||[]).map(function(p){return snapshot.item(p,'saved_place');});return c;}
  function proposeV2(actions,context,request,fence){
   var action=validateV2(actions,context,request);if(!action||!fence||fence.scope!==scope())return null;
   var trip;try{trip=read();}catch(error){return null;}
   var liveContext=fullContext(trip);liveContext.referencePlanItemId=reference();
   if(context.id!==String(trip.id)||fence.planRevision!==planRevision(trip)||!validateV2(actions,liveContext,request))return null;
   var target=action.type==='add_plan_item'?null:(action.type==='add_saved_place_to_plan'?context.savedPlaces:context.timeline).find(function(i){return i.planItemId===action.planItemId;});
   if(target)lastReference={scope:scope(),revision:planRevision(trip),id:target.planItemId};
   var field=target&&target.sourceType==='saved_place'?'savedPlaces':'activities',before=copy(trip[field]||[]),index=target?before.findIndex(function(i){return String(i.id)===target.sourceId;}):before.length;
   if(target&&(index<0||before.filter(function(i){return String(i.id)===target.sourceId;}).length!==1))return null;
   var state='proposed',revision=fence.planRevision,expires=(options.now||Date.now)()+300000;
   var label=target?target.title:action.changes.title,changes=action.changes||{};
   var verbs={remove_plan_item:'הסרה מהתוכנית',add_plan_item:'הוספה לתוכנית',move_plan_item:'שינוי תזמון',update_plan_item:'עדכון פריט',mark_completed:'סימון כהושלם',add_saved_place_to_plan:'הוספת מקום לתוכנית'};
   var description=verbs[action.type]+' — '+label+(target?' · '+[target.date,target.time].filter(Boolean).join(' '):'')+(Object.keys(changes).length?' · '+Object.keys(changes).map(function(k){return ({date:'תאריך',time:'שעה',duration:'משך בדקות',title:'שם',category:'קטגוריה'})[k]+': '+changes[k];}).join(' · '):'')+(action.type==='remove_plan_item'&&field==='savedPlaces'?' · המקום יישאר במקומות השמורים.':'');
   function check(){if(fence.scope!==scope()||(options.now||Date.now)()>expires)throw Error('MATE_ACTION_STALE');var live=read();if(planRevision(live)!==revision)throw Error('MATE_ACTION_STALE');return live;}
   function write(undo){
    if(state!==(undo?'undoable':'proposed'))throw Error('MATE_ACTION_STALE');check();state='saving';
    try{var saved=options.store.updateTrip(options.tripId(),function(draft,current){check();if(planRevision(current)!==revision)throw Error('MATE_ACTION_STALE');var list=copy(current[field]||[]);
      if(undo)list=copy(before);
      else if(action.type==='remove_plan_item'){if(field==='savedPlaces'){list[index].date='';list[index].time='';}else list.splice(index,1);}
      else if(action.type==='add_plan_item'){var id='mate-'+(options.newId?options.newId():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));if(list.some(function(i){return String(i.id)===id;}))throw Error('MATE_ACTION_DUPLICATE');list.push(Object.assign({id:id,done:false,duration:60,category:'אחר'},changes));}
      else if(action.type==='mark_completed')list[index].done=true;
      else Object.keys(changes).forEach(function(k){list[index][k==='title'&&field==='savedPlaces'?'name':k]=changes[k];});
      draft[field]=list;return draft;
     },{ownerId:fence.owner});
     if(!saved)throw Error('MATE_ACTION_SAVE_FAILED');revision=planRevision(saved);state=undo?'undone':'undoable';options.emit({tripId:saved.id,activityId:target&&target.sourceId,sourceType:target&&target.sourceType,field:field,action:undo?'restored':action.type,source:'mate'});return saved;
    }catch(error){state='invalid';throw error;}
   }
   return Object.freeze({activity:target||{title:label,date:changes.date,time:changes.time},description:description,buttonLabel:action.type==='remove_plan_item'?'הסר מהתוכנית':'אישור השינוי',successText:action.type==='remove_plan_item'&&field==='savedPlaces'?'התזמון הוסר. המקום נשאר במקומות השמורים.':'התוכנית עודכנה במכשיר. סנכרון הענן כפוף למצב החיבור.',confirm:function(){return write(false);},undo:function(){return write(true);},cancel:function(){if(state==='proposed')state='cancelled';},valid:function(){try{check();return state==='proposed'||state==='undoable';}catch(error){return false;}},state:function(){return state;}});
  }
  function reference(){try{return lastReference&&lastReference.scope===scope()&&lastReference.revision===planRevision(read())?lastReference.id:null;}catch(error){return null;}}
  return Object.freeze({reference:reference,capture:capture,propose:propose,invalidate:function(){generation++;}});
 }
 return Object.freeze({create:create,validate:validate,validateV2:validateV2,types:Object.freeze(types),openScreen:openScreen,referenceId:referenceId});
});

(function(root,factory){'use strict';var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TravelMateActions=api;})(typeof window==='undefined'?null:window,function(){
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
 function create(options){
  var generation=0;
  function scope(){return [String(options.account()||''),String(options.tripId()||''),generation].join('|');}
  function read(){var account=String(options.account()||''),trip=options.store.getTrip(options.tripId(),account);
   if(!account||!trip||String(trip.id)!==String(options.tripId())||String(trip.ownerId||'')!==account||trip.readOnly===true||trip.syncStatus==='conflict')throw Error('MATE_ACTION_READ_ONLY');return trip;}
  function capture(){try{var trip=read();return {scope:scope(),revision:fingerprint(trip),owner:trip.ownerId};}catch(error){return null;}}
  function propose(actions,context,request,fence){
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
  return Object.freeze({capture:capture,propose:propose,invalidate:function(){generation++;}});
 }
 return Object.freeze({create:create,validate:validate});
});

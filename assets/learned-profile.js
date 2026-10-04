(function(){
'use strict';
if(window.TravelMateLearnedProfile)return;

var TABLE='learned_travel_preferences',MAX_EVIDENCE=12;
var INTERESTS=['culture','food','nature','history','shopping','nightlife','photography','relaxation'];
var FULL_COLUMNS='id,user_id,candidate_key,preference_key,suggested_value,value,confidence,review_state,source_scope,evidence,evidence_active,revision,created_at,updated_at,reviewed_at';

function clean(value,max){var text=String(value==null?'':value).trim().replace(/\s+/g,' ');return max?text.slice(0,max):text}
function validInterest(value){var item=clean(value,60);return INTERESTS.indexOf(item)>=0?item:''}
function clamp(value){var number=Number(value);if(!Number.isFinite(number))return 0;return Math.round(Math.max(0,Math.min(1,number))*1000)/1000}
function offline(){return typeof navigator!=='undefined'&&navigator.onLine===false}
function error(code){var item=new Error(code);item.code=code;return item}
function localDateKey(date){var d=date||new Date(),y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return y+'-'+m+'-'+day}
function dispatch(reason,detail){if(typeof window.dispatchEvent!=='function'||typeof CustomEvent!=='function')return;window.dispatchEvent(new CustomEvent('travelmate:learned-profile-change',{detail:Object.assign({reason:reason},detail||{})}))}
function rpcRow(result){var data=result&&result.data;if(Array.isArray(data))return data[0]||null;return data||null}

async function requireOwner(expected){
  var cloud=window.TravelMateCloud;
  if(!cloud||typeof cloud.getSession!=='function')throw error('LEARNED_PROFILE_CLOUD_UNAVAILABLE');
  var session=await cloud.getSession(),owner=session&&session.user&&String(session.user.id||'');
  if(!owner||(expected&&owner!==String(expected)))throw error('AUTH_CONTEXT_CHANGED');
  return session
}
async function scoped(expected){
  var session=await requireOwner(expected),owner=String(session.user.id),cloud=window.TravelMateCloud;
  if(!cloud||typeof cloud.scopedClientForOwner!=='function')throw error('LEARNED_PROFILE_SCOPED_CLIENT_UNAVAILABLE');
  var result=await cloud.scopedClientForOwner(owner);
  await requireOwner(owner);
  if(!result||!result.client||String(result.ownerId)!==owner)throw error('AUTH_CONTEXT_CHANGED');
  return{owner:owner,session:result.session||session,client:result.client}
}

function scheduledPlace(item){return Boolean(item&&(item.date||item.localDate||item.scheduledDate||item.day||item.scheduled===true||Number.isFinite(Number(item.dayIndex))))}
function completedTrip(trip,today){var end=clean(trip&&(trip.end||trip.endDate),10);return /^\d{4}-\d{2}-\d{2}$/.test(end)&&end<today}
function sanitizeTrips(trips,owner,today){
  var cutoff=today||localDateKey();
  return(Array.isArray(trips)?trips:[]).filter(function(trip){return trip&&String(trip.ownerId||'')===String(owner)&&!trip.deletedAt&&!trip.deletePending&&completedTrip(trip,cutoff)}).map(function(trip){
    return{
      id:clean(trip.id,120),ownerId:String(trip.ownerId),end:clean(trip.end||trip.endDate,10),
      activities:(Array.isArray(trip.activities)?trip.activities:[]).filter(function(item){return item&&item.done===true&&item.id}).map(function(item){return{id:clean(item.id,160),category:clean(item.category,100),done:true}}),
      savedPlaces:(Array.isArray(trip.savedPlaces)?trip.savedPlaces:[]).filter(function(item){return item&&item.done===true&&item.id&&scheduledPlace(item)}).map(function(item){return{id:clean(item.id,160),category:clean(item.category,100),done:true,date:item.date||item.localDate||item.scheduledDate||''}}),
      places:(Array.isArray(trip.places)?trip.places:[]).filter(function(item){return item&&item.done===true&&item.id&&scheduledPlace(item)}).map(function(item){return{id:clean(item.id,160),category:clean(item.category,100),done:true,date:item.date||item.localDate||item.scheduledDate||''}})
    }
  })
}
function safeEvidence(value){
  var result=[],seen=Object.create(null),model=window.TravelMateLearnedPreferences;
  (Array.isArray(value)?value:[]).forEach(function(raw){
    if(result.length>=MAX_EVIDENCE)return;
    var item=model&&model.createEvidence?model.createEvidence(raw):null;
    if(!item||['completed_activity','completed_place'].indexOf(item.eventKind)<0||!item.sourceTripId||!item.eventRef)return;
    var key=[item.eventKind,item.sourceTripId,item.eventRef].join('|');if(seen[key])return;seen[key]=true;
    result.push({sourceTripId:clean(item.sourceTripId,120),eventKind:clean(item.eventKind,60),eventRef:clean(item.eventRef,160)})
  });
  return result
}
function derive(trips,owner,learningEnabled,today){
  if(learningEnabled!==true)return[];
  var model=window.TravelMateLearnedPreferences;if(!model||typeof model.buildCrossTripSuggestions!=='function')return[];
  return model.buildCrossTripSuggestions(sanitizeTrips(trips,owner,today),owner).map(function(item){
    var value=validInterest(item.value),evidence=safeEvidence(item.evidence);
    return{candidateKey:'cross-trip:interests:'+value,preferenceKey:'interests',suggestedValue:value,value:value,confidence:clamp(item.confidence),reviewState:'suggested',sourceScope:'cross_trip',evidence:evidence,evidenceActive:evidence.length>=2}
  }).filter(function(item){return item.value&&item.evidenceActive})
}
function fromRow(row){
  return{id:String(row.id),userId:String(row.user_id),candidateKey:clean(row.candidate_key,120),preferenceKey:clean(row.preference_key,120),suggestedValue:validInterest(row.suggested_value),value:validInterest(row.value),confidence:clamp(row.confidence),reviewState:clean(row.review_state,30),sourceScope:clean(row.source_scope,30),evidence:safeEvidence(row.evidence),evidenceActive:row.evidence_active===true,revision:Number(row.revision||0),createdAt:row.created_at||null,updatedAt:row.updated_at||null,reviewedAt:row.reviewed_at||null}
}

async function list(owner){
  if(offline())throw error('LEARNED_PROFILE_OFFLINE');
  var ctx=await scoped(owner),result=await ctx.client.from(TABLE).select(FULL_COLUMNS).eq('user_id',ctx.owner).order('created_at',{ascending:true});
  if(result.error)throw result.error;await requireOwner(ctx.owner);return(result.data||[]).map(fromRow)
}
async function getRow(ctx,id){
  var result=await ctx.client.from(TABLE).select(FULL_COLUMNS).eq('user_id',ctx.owner).eq('id',String(id)).maybeSingle();
  if(result.error)throw result.error;await requireOwner(ctx.owner);return result.data?fromRow(result.data):null
}
async function syncCandidate(ctx,candidate,current){
  var result=await ctx.client.rpc('travelmate_sync_learned_preference',{
    p_candidate_key:candidate.candidateKey,
    p_suggested_value:candidate.suggestedValue,
    p_confidence:candidate.confidence,
    p_evidence:safeEvidence(candidate.evidence),
    p_expected_revision:current?current.revision:null
  });
  if(result.error)throw result.error;await requireOwner(ctx.owner);var row=rpcRow(result);return row?fromRow(row):current||null
}
async function deactivate(ctx,current){
  var result=await ctx.client.rpc('travelmate_deactivate_learned_preference',{p_id:current.id,p_expected_revision:current.revision});
  if(result.error)throw result.error;await requireOwner(ctx.owner);var row=rpcRow(result);return row?fromRow(row):null
}
async function sync(){
  if(offline())throw error('LEARNED_PROFILE_OFFLINE');
  var ctx=await scoped(),helper=window.TravelMateUserProfile,profile=helper&&helper.fromUser?helper.fromUser(ctx.session.user):null,stored=await list(ctx.owner);
  if(!profile||profile.preferences.learningEnabled!==true)return stored;
  var cloud=window.TravelMateCloud,generated=derive(cloud&&cloud.getCachedTrips?cloud.getCachedTrips():[],ctx.owner,true),existingByKey=Object.create(null),generatedByKey=Object.create(null);
  stored.forEach(function(item){existingByKey[item.candidateKey]=item});generated.forEach(function(item){generatedByKey[item.candidateKey]=item});
  for(var i=0;i<generated.length;i+=1){
    await requireOwner(ctx.owner);var candidate=generated[i],current=existingByKey[candidate.candidateKey];
    if(current&&current.reviewState==='rejected')continue;
    await syncCandidate(ctx,candidate,current||null)
  }
  for(var j=0;j<stored.length;j+=1){
    await requireOwner(ctx.owner);var stale=stored[j];
    if(generatedByKey[stale.candidateKey]||stale.reviewState==='rejected')continue;
    if(stale.reviewState==='suggested'||(stale.reviewState==='confirmed'&&stale.evidenceActive))await deactivate(ctx,stale)
  }
  await requireOwner(ctx.owner);return list(ctx.owner)
}
async function review(id,expectedRevision,action,correctedValue){
  if(offline())throw error('LEARNED_PROFILE_OFFLINE');
  var revision=Number(expectedRevision);if(!String(id||'')||!Number.isInteger(revision)||revision<1)throw error('LEARNED_PROFILE_CONFLICT');
  var ctx=await scoped(),value=action==='correct'?validInterest(correctedValue):null;if(action==='correct'&&!value)throw error('LEARNED_PROFILE_VALUE');
  if(['confirm','correct','reject'].indexOf(action)<0)throw error('LEARNED_PROFILE_ACTION');
  var result=await ctx.client.rpc('travelmate_review_learned_preference',{p_id:String(id),p_expected_revision:revision,p_action:action,p_value:value});
  if(result.error)throw result.error;await requireOwner(ctx.owner);var row=rpcRow(result);if(!row)throw error('LEARNED_PROFILE_CONFLICT');var updated=fromRow(row);dispatch(action,{ownerId:ctx.owner,candidate:updated});return updated
}
async function remove(id,expectedRevision){
  if(offline())throw error('LEARNED_PROFILE_OFFLINE');
  var revision=Number(expectedRevision);if(!String(id||'')||!Number.isInteger(revision)||revision<1)throw error('LEARNED_PROFILE_CONFLICT');
  var ctx=await scoped(),result=await ctx.client.rpc('travelmate_delete_learned_preference',{p_id:String(id),p_expected_revision:revision});
  if(result.error)throw result.error;await requireOwner(ctx.owner);if(result.data!==true)throw error('LEARNED_PROFILE_CONFLICT');dispatch('delete',{ownerId:ctx.owner});return true
}
async function deleteAllAndDisable(){
  if(offline())throw error('LEARNED_PROFILE_OFFLINE');
  var ctx=await scoped(),cloud=window.TravelMateCloud,helper=window.TravelMateUserProfile,profile=helper.fromUser(ctx.session.user),preferences={pace:profile.preferences.pace,activityDensity:profile.preferences.activityDensity,transport:profile.preferences.transport,tripStyle:profile.preferences.tripStyle,interests:Array.prototype.slice.call(profile.preferences.interests),learningEnabled:false};
  if(!cloud||typeof cloud.updatePreferencesForOwner!=='function')throw error('LEARNED_PROFILE_PROFILE_API_UNAVAILABLE');
  var profileResult=await cloud.updatePreferencesForOwner(ctx.owner,preferences);if(profileResult&&profileResult.error)throw profileResult.error;
  var user=profileResult&&profileResult.data&&profileResult.data.user;if(!user||String(user.id)!==ctx.owner)throw error('AUTH_CONTEXT_CHANGED');
  await requireOwner(ctx.owner);
  var result=await ctx.client.rpc('travelmate_delete_all_learned_preferences');
  if(result.error){result.error.learningDisabled=true;result.error.user=user;throw result.error}
  await requireOwner(ctx.owner);
  if(typeof window.dispatchEvent==='function'&&typeof CustomEvent==='function')window.dispatchEvent(new CustomEvent('travelmate:profile-change',{detail:{user:user}}));
  dispatch('delete-all',{ownerId:ctx.owner,learningEnabled:false});return{user:user,deletedCount:Number(result.data||0)}
}
async function confirmedForMate(owner,learningEnabled){
  if(learningEnabled!==true||!owner||offline())return[];
  try{
    var ctx=await scoped(owner),result=await ctx.client.rpc('travelmate_confirmed_learned_preferences');if(result.error)throw result.error;await requireOwner(ctx.owner);
    return(result.data||[]).map(function(row){var value=validInterest(row&&row.value);return value?{preferenceKey:'interests',value:value,reviewState:'confirmed',sourceScope:'cross_trip'}:null}).filter(Boolean)
  }catch(err){return[]}
}

window.TravelMateLearnedProfile=Object.freeze({TABLE:TABLE,MAX_EVIDENCE:MAX_EVIDENCE,INTERESTS:Object.freeze(INTERESTS.slice()),localDateKey:localDateKey,completedTrip:completedTrip,sanitizeTrips:sanitizeTrips,derive:derive,list:list,sync:sync,review:review,remove:remove,deleteAllAndDisable:deleteAllAndDisable,confirmedForMate:confirmedForMate});
if(typeof window.dispatchEvent==='function'&&typeof CustomEvent==='function')window.dispatchEvent(new CustomEvent('travelmate:learned-profile-ready'));
})();

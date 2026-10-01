(function(){
'use strict';

if(window.TravelMateLearnedPreferences)return;

var REVIEW_STATES=Object.freeze({
  SUGGESTED:'suggested',
  CONFIRMED:'confirmed',
  REJECTED:'rejected',
  DELETED:'deleted'
});

var SOURCE_SCOPES=Object.freeze({
  TRIP:'trip',
  CROSS_TRIP:'cross_trip'
});

var ALLOWED_EVENT_KINDS=Object.freeze([
  'completed_activity',
  'completed_place',
  'saved_place',
  'expense_aggregate',
  'declared_preference'
]);

var FORBIDDEN_EVENT_KINDS=Object.freeze([
  'document',
  'document_text',
  'receipt',
  'receipt_text',
  'vault',
  'credential',
  'medical_note',
  'private_note',
  'private_message',
  'raw_gps',
  'gps_history'
]);

var TRANSITIONS=Object.freeze({
  suggested:Object.freeze({confirmed:true,rejected:true,deleted:true}),
  confirmed:Object.freeze({rejected:true,deleted:true}),
  rejected:Object.freeze({deleted:true}),
  deleted:Object.freeze({})
});

function clean(value,max){
  var text=String(value==null?'':value).trim().replace(/\s+/g,' ');
  return max?text.slice(0,max):text;
}

function clamp(value){
  var number=Number(value);
  if(!Number.isFinite(number))return 0;
  return Math.round(Math.max(0,Math.min(1,number))*1000)/1000;
}

function iso(value){
  if(!value)return '';
  var date=value instanceof Date?value:new Date(value);
  return Number.isNaN(date.getTime())?'':date.toISOString();
}

function isAllowedEventKind(kind){
  return ALLOWED_EVENT_KINDS.indexOf(clean(kind,60))>=0;
}

function isForbiddenEventKind(kind){
  return FORBIDDEN_EVENT_KINDS.indexOf(clean(kind,60))>=0;
}

function createEvidence(input){
  input=input||{};
  var eventKind=clean(input.eventKind,60);
  if(!isAllowedEventKind(eventKind)||isForbiddenEventKind(eventKind))return null;
  return Object.freeze({
    id:clean(input.id,80),
    sourceTripId:clean(input.sourceTripId,120)||null,
    eventKind:eventKind,
    eventRef:clean(input.eventRef,160)||null,
    observedAt:iso(input.observedAt)||null,
    weight:clamp(input.weight==null?0.5:input.weight)
  });
}

function normalizeCandidate(input){
  input=input||{};
  var evidence=Array.isArray(input.evidence)?input.evidence.map(createEvidence).filter(Boolean):[];
  var state=Object.keys(REVIEW_STATES).map(function(key){return REVIEW_STATES[key]}).indexOf(input.reviewState)>=0
    ? input.reviewState
    : REVIEW_STATES.SUGGESTED;
  var scope=input.sourceScope===SOURCE_SCOPES.CROSS_TRIP?SOURCE_SCOPES.CROSS_TRIP:SOURCE_SCOPES.TRIP;
  return Object.freeze({
    id:clean(input.id,120),
    preferenceKey:clean(input.preferenceKey,120),
    value:input.value==null?'':input.value,
    confidence:clamp(input.confidence),
    reviewState:state,
    sourceScope:scope,
    createdAt:iso(input.createdAt)||new Date().toISOString(),
    updatedAt:iso(input.updatedAt)||new Date().toISOString(),
    reviewedAt:iso(input.reviewedAt)||null,
    lastEvidenceAt:iso(input.lastEvidenceAt)||null,
    evidence:evidence
  });
}

function transition(candidate,nextState,now){
  var current=normalizeCandidate(candidate);
  var next=clean(nextState,30);
  if(!TRANSITIONS[current.reviewState]||!TRANSITIONS[current.reviewState][next])return null;
  var timestamp=iso(now)||new Date().toISOString();
  return Object.freeze(Object.assign({},current,{
    reviewState:next,
    updatedAt:timestamp,
    reviewedAt:timestamp
  }));
}

function addEvidence(candidate,evidenceInput,confidenceDelta,now){
  var current=normalizeCandidate(candidate);
  var evidence=createEvidence(evidenceInput);
  if(!evidence)return null;
  if(current.reviewState===REVIEW_STATES.DELETED)return null;
  var duplicate=current.evidence.some(function(item){
    return item.eventKind===evidence.eventKind &&
      item.sourceTripId===evidence.sourceTripId &&
      item.eventRef===evidence.eventRef;
  });
  if(duplicate)return current;
  var timestamp=iso(now)||new Date().toISOString();
  var delta=Number(confidenceDelta);
  if(!Number.isFinite(delta))delta=0.05;
  return Object.freeze(Object.assign({},current,{
    confidence:clamp(current.confidence+delta*evidence.weight),
    updatedAt:timestamp,
    lastEvidenceAt:evidence.observedAt||timestamp,
    evidence:current.evidence.concat([evidence])
  }));
}

function removeEvidence(candidate,predicate){
  var current=normalizeCandidate(candidate);
  var keep=current.evidence.filter(function(item){return !predicate(item)});
  if(keep.length===current.evidence.length)return current;
  var confidence=clamp(current.confidence*(keep.length?0.8:0.5));
  return Object.freeze(Object.assign({},current,{
    confidence:confidence,
    updatedAt:new Date().toISOString(),
    evidence:keep
  }));
}

function canPersonalize(candidate,learningEnabled){
  var current=normalizeCandidate(candidate);
  return learningEnabled!==false && current.reviewState===REVIEW_STATES.CONFIRMED;
}

function evidenceOwnedBy(evidence,authenticatedUserId){
  var userId=clean(authenticatedUserId,120);
  var ownerId=clean(evidence&&evidence.sourceOwnerId,120);
  return Boolean(userId&&ownerId&&userId===ownerId);
}

function createOwnedEvidence(input,authenticatedUserId){
  if(!evidenceOwnedBy(input,authenticatedUserId))return null;
  return createEvidence(input);
}

function exportForMate(candidate,learningEnabled){
  var current=normalizeCandidate(candidate);
  if(!canPersonalize(current,learningEnabled))return null;
  return Object.freeze({
    preferenceKey:current.preferenceKey,
    value:current.value,
    reviewState:current.reviewState,
    sourceScope:current.sourceScope
  });
}

window.TravelMateLearnedPreferences=Object.freeze({
  REVIEW_STATES:REVIEW_STATES,
  SOURCE_SCOPES:SOURCE_SCOPES,
  ALLOWED_EVENT_KINDS:ALLOWED_EVENT_KINDS,
  FORBIDDEN_EVENT_KINDS:FORBIDDEN_EVENT_KINDS,
  isAllowedEventKind:isAllowedEventKind,
  createEvidence:createEvidence,
  createOwnedEvidence:createOwnedEvidence,
  evidenceOwnedBy:evidenceOwnedBy,
  normalizeCandidate:normalizeCandidate,
  transition:transition,
  addEvidence:addEvidence,
  removeEvidence:removeEvidence,
  canPersonalize:canPersonalize,
  exportForMate:exportForMate
});
window.dispatchEvent(new CustomEvent('travelmate:learned-preferences-ready'));
})();

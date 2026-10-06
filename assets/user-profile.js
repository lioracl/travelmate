(function(){
'use strict';

function clean(value){
  return String(value||'').trim().replace(/\s+/g,' ')
}
function safeAvatarUrl(value){
  var raw=clean(value);
  if(!raw)return'';
  try{
    var url=new URL(raw,location.href);
    return /^https?:$/.test(url.protocol)?url.href:''
  }catch(error){return''}
}
var preferenceOptions=Object.freeze({
  pace:Object.freeze(['relaxed','balanced','active','intensive']),
  activityDensity:Object.freeze(['light','balanced','dense']),
  transport:Object.freeze(['walking','transit','mixed','car']),
  tripStyle:Object.freeze(['city','culture','nature','food','relaxation','mixed']),
  interests:Object.freeze(['culture','food','nature','history','shopping','nightlife','photography','relaxation','beaches','museums','families','hiking','technology'])
});
var preferenceLabels=Object.freeze({
  pace:Object.freeze({relaxed:'נינוח',balanced:'מאוזן',active:'פעיל',intensive:'אינטנסיבי'}),
  activityDensity:Object.freeze({light:'מעט פעילויות',balanced:'קצב מאוזן',dense:'יום מלא'}),
  transport:Object.freeze({walking:'הליכה',transit:'תחבורה ציבורית',mixed:'משולב',car:'רכב'}),
  tripStyle:Object.freeze({city:'עיר',culture:'תרבות',nature:'טבע',food:'אוכל',relaxation:'מנוחה',mixed:'משולב'}),
  interests:Object.freeze({culture:'תרבות',food:'אוכל',nature:'טבע',history:'היסטוריה',shopping:'קניות',nightlife:'חיי לילה',photography:'צילום',relaxation:'מנוחה',beaches:'חופים',museums:'מוזיאונים',families:'משפחות',hiking:'טיולים רגליים',technology:'טכנולוגיה'})
});
var preferenceFieldLabels=Object.freeze({
  pace:'קצב טיול',activityDensity:'צפיפות פעילויות',transport:'דרך התניידות',tripStyle:'סגנון טיול',interests:'תחומי עניין'
});
// Optional explicit extension of the canonical Auth preference object, not a new store.
var travelerGroups=Object.freeze({
  walking:{label:'הליכה נוחה',options:{short:'קצרה',medium:'בינונית',long:'ארוכה'}},
  transport:{label:'תחבורה מועדפת',multi:true,options:{walking:'הליכה',transit:'תחבורה ציבורית',taxi:'מונית או נסיעה שיתופית',car:'רכב שכור',bicycle:'אופניים'}},
  activeHours:{label:'שעות פעילות מועדפות',multi:true,options:{early_morning:'מוקדם בבוקר',morning:'בוקר',afternoon:'אחר הצהריים',evening:'ערב',night:'לילה'}},
  spending:{label:'סגנון הוצאה אישי — לא תקציב הטיול',options:{economical:'חסכוני',balanced:'מאוזן',comfortable:'נוח',premium:'פרימיום'}},
  food:{label:'העדפות אוכל',multi:true,options:{local:'מטבח מקומי',street_food:'אוכל רחוב',vegetarian:'צמחוני',vegan:'טבעוני',cafes:'בתי קפה',fine_dining:'מסעדות גורמה'}},
  spontaneity:{label:'גמישות התכנון',options:{planned:'מתוכנן',flexible:'גמיש',spontaneous:'ספונטני'}},
  exclusions:{label:'לא להציע לי',multi:true,options:{nightlife:'חיי לילה',shopping:'קניות',museums:'מוזיאונים',long_walks:'הליכות ארוכות',expensive_places:'מקומות יקרים',early_mornings:'מוקדם בבוקר'}}
});
Object.keys(travelerGroups).forEach(function(key){Object.freeze(travelerGroups[key].options);Object.freeze(travelerGroups[key])});
function normalizeTraveler(value){
  var source=value&&typeof value==='object'?value:{},result={};
  Object.keys(travelerGroups).forEach(function(key){var group=travelerGroups[key];
    if(group.multi){result[key]=Object.freeze((Array.isArray(source[key])?source[key]:[]).map(clean).filter(function(item,index,list){return list.indexOf(item)===index&&(key==='exclusions'?/^[a-z][a-z0-9_-]{0,39}$/.test(item):Object.prototype.hasOwnProperty.call(group.options,item))}).slice(0,32));}
    else result[key]=Object.prototype.hasOwnProperty.call(group.options,clean(source[key]))?clean(source[key]):'';
  });return Object.freeze(result);
}
function travelerSummary(value){var normalized=normalizeTraveler(value);return Object.keys(travelerGroups).filter(function(key){return Array.isArray(normalized[key])?normalized[key].length:normalized[key]}).map(function(key){var group=travelerGroups[key],values=Array.isArray(normalized[key])?normalized[key]:[normalized[key]];return Object.freeze({key:'profile2.'+key,label:group.label,value:values.join(','),valueLabel:values.map(function(v){return group.options[v]||'קטגוריה נוספת שהוחרגה'}).join(' · ')})})}
function normalizePreferences(value){
  var source=value&&typeof value==='object'?value:{};
  function one(key){
    var candidate=clean(source[key]);
    return preferenceOptions[key].indexOf(candidate)>=0?candidate:'';
  }
  var interests=Array.isArray(source.interests)?source.interests.map(clean).filter(function(item,index,list){
    return preferenceOptions.interests.indexOf(item)>=0&&list.indexOf(item)===index;
  }).slice(0,preferenceOptions.interests.length):[];
  var normalized={
    pace:one('pace'),
    activityDensity:one('activityDensity'),
    transport:one('transport'),
    tripStyle:one('tripStyle'),
    interests:Object.freeze(interests),
    learningEnabled:source.learningEnabled===true
  };
  if(Object.prototype.hasOwnProperty.call(source,'profile2'))normalized.profile2=normalizeTraveler(source.profile2);
  return Object.freeze(normalized)
}
function preferenceSummary(value){
  var preferences=normalizePreferences(value),items=[];
  ['pace','activityDensity','transport','tripStyle'].forEach(function(key){
    if(!preferences[key])return;
    items.push(Object.freeze({key:key,label:preferenceFieldLabels[key],value:preferences[key],valueLabel:preferenceLabels[key][preferences[key]]}))
  });
  if(preferences.interests.length){
    items.push(Object.freeze({key:'interests',label:preferenceFieldLabels.interests,value:preferences.interests.join(','),valueLabel:preferences.interests.map(function(item){return preferenceLabels.interests[item]}).join(' · ')}))
  }
  var combined=items.concat(travelerSummary(preferences.profile2)),groups=5+(preferences.profile2?Object.keys(travelerGroups).length:0);
  return Object.freeze({
    items:Object.freeze(combined),
    configuredCount:combined.length,
    totalGroups:groups,
    isEmpty:combined.length===0,
    isComplete:combined.length===groups,
    completionLabel:combined.length===groups?'כל קבוצות ההעדפה הוגדרו':combined.length?'הוגדרו '+combined.length+' מתוך '+groups+' קבוצות העדפה':'עדיין לא הוגדרו העדפות נסיעה',
    learningEnabled:preferences.learningEnabled
  })
}
function greetingAt(value){
  var date=value instanceof Date?value:new Date(value||Date.now());
  var hour=date.getHours();
  return hour<5?'לילה טוב':hour<12?'בוקר טוב':hour<17?'צהריים טובים':'ערב טוב'
}
function fromUser(user,now){
  var metadata=user&&user.user_metadata||{};
  var email=clean(user&&user.email);
  var rawName=clean(metadata.display_name||metadata.full_name||metadata.name);
  var emailName=email?email.split('@')[0].replace(/[._-]+/g,' ').trim():'';
  var name=rawName||emailName;
  var firstName=name?name.split(/\s+/)[0]:'';
  var initials=name?name.split(/\s+/).slice(0,2).map(function(part){return part.charAt(0)}).join('').toUpperCase():(email?email.charAt(0).toUpperCase():'');
  var avatarRemoved=metadata.avatar_removed===true;
  var avatarUrl=avatarRemoved?'':safeAvatarUrl(metadata.avatar_url||metadata.picture||metadata.photo_url||'');
  var preferences=normalizePreferences(metadata.travelmate_preferences);
  return Object.freeze({
    name:name,
    firstName:firstName,
    initials:initials,
    avatarUrl:avatarUrl,
    avatarRemoved:avatarRemoved,
    greeting:greetingAt(now),
    preferences:preferences
  })
}
function localDateKey(value){
  var date=value instanceof Date?value:new Date(value||Date.now());
  return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-')
}
function dayDistance(fromKey,toKey){
  var from=new Date(String(fromKey)+'T12:00:00');
  var to=new Date(String(toKey)+'T12:00:00');
  if(Number.isNaN(from.getTime())||Number.isNaN(to.getTime()))return 0;
  return Math.round((to-from)/86400000)
}
function selectHomeContext(trips,now){
  var today=localDateKey(now);
  var list=(Array.isArray(trips)?trips:[]).filter(function(trip){
    return trip&&trip.id&&trip.start&&trip.end
  });
  var current=list.filter(function(trip){
    return String(trip.start)<=today&&String(trip.end)>=today&&trip.isActive!==false
  }).sort(function(a,b){
    return String(a.end).localeCompare(String(b.end))
  })[0]||null;
  if(current){
    return Object.freeze({
      type:'current',
      trip:current,
      daysRemaining:Math.max(0,dayDistance(today,current.end))
    })
  }
  var upcoming=list.filter(function(trip){
    return String(trip.start)>today&&trip.isActive!==false
  }).sort(function(a,b){
    return String(a.start).localeCompare(String(b.start))
  })[0]||null;
  if(upcoming){
    return Object.freeze({
      type:'upcoming',
      trip:upcoming,
      daysUntil:Math.max(0,dayDistance(today,upcoming.start))
    })
  }
  var recent=list.filter(function(trip){
    return String(trip.end)<today
  }).sort(function(a,b){
    return String(b.end).localeCompare(String(a.end))
  })[0]||null;
  if(recent){
    return Object.freeze({
      type:'recent',
      trip:recent,
      daysAgo:Math.max(0,dayDistance(recent.end,today))
    })
  }
  return Object.freeze({type:'empty',trip:null})
}

window.TravelMateUserProfile=Object.freeze({
  fromUser:fromUser,
  preferenceOptions:preferenceOptions,
  preferenceLabels:preferenceLabels,
  preferenceFieldLabels:preferenceFieldLabels,
  travelerGroups:travelerGroups,
  normalizeTraveler:normalizeTraveler,
  travelerSummary:travelerSummary,
  normalizePreferences:normalizePreferences,
  preferenceSummary:preferenceSummary,
  greetingAt:greetingAt,
  localDateKey:localDateKey,
  selectHomeContext:selectHomeContext
});
window.dispatchEvent(new CustomEvent('travelmate:user-profile-ready'));
})();

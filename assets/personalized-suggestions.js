(function(){
'use strict';
if(window.TravelMatePersonalizedSuggestions)return;

var MAP=Object.freeze({
  food:Object.freeze(['restaurants','cafes','bakeries','markets']),
  nature:Object.freeze(['parks','viewpoints','beaches']),
  beaches:Object.freeze(['beaches']),
  culture:Object.freeze(['museums','attractions','historic','markets']),
  history:Object.freeze(['historic','museums']),
  museums:Object.freeze(['museums']),
  shopping:Object.freeze(['malls','markets','clothing']),
  nightlife:Object.freeze(['bars','nightclubs']),
  families:Object.freeze(['zoos','theme_parks','parks']),
  hiking:Object.freeze(['parks','viewpoints']),
  photography:Object.freeze(['viewpoints','historic','attractions']),
  technology:Object.freeze(['museums','attractions']),
  relaxation:Object.freeze(['parks','beaches','cafes'])
});

function clean(value){return String(value==null?'':value).trim()}
function unique(items){var seen=Object.create(null),result=[];(items||[]).forEach(function(item){item=clean(item);if(!item||seen[item])return;seen[item]=true;result.push(item)});return result}
function labels(){var helper=window.TravelMateUserProfile;return helper&&helper.preferenceLabels&&helper.preferenceLabels.interests||{}}
function allowedInterest(value){var key=clean(value);return Object.prototype.hasOwnProperty.call(MAP,key)?key:''}
function interestLabel(value){return labels()[value]||value}
function normalizeLearned(rows){return unique((Array.isArray(rows)?rows:[]).map(function(item){return item&&item.preferenceKey==='interests'&&item.reviewState==='confirmed'?allowedInterest(item.value):''}).filter(Boolean))}
function build(declared,learned){
  var declaredKeys=unique((declared||[]).map(allowedInterest).filter(Boolean));
  var learnedKeys=unique((learned||[]).map(allowedInterest).filter(Boolean)).filter(function(key){return declaredKeys.indexOf(key)<0});
  var interests=declaredKeys.map(function(key){return Object.freeze({key:key,label:interestLabel(key),source:'declared'})}).concat(learnedKeys.map(function(key){return Object.freeze({key:key,label:interestLabel(key),source:'learned'})}));
  var categories=[];interests.forEach(function(item){(MAP[item.key]||[]).forEach(function(key){if(categories.indexOf(key)<0)categories.push(key)})});
  return Object.freeze({
    declared:Object.freeze(declaredKeys),
    learned:Object.freeze(learnedKeys),
    interests:Object.freeze(interests),
    categoryKeys:Object.freeze(categories),
    isEmpty:interests.length===0
  })
}
function empty(){return build([],[])}
async function current(){
  var cloud=window.TravelMateCloud,helper=window.TravelMateUserProfile;
  if(!cloud||typeof cloud.getSession!=='function'||!helper||typeof helper.fromUser!=='function')return empty();
  try{
    var session=await cloud.getSession(),user=session&&session.user;if(!user)return empty();
    var profile=helper.fromUser(user),declared=profile&&profile.preferences&&profile.preferences.interests||[],learned=[];
    var service=window.TravelMateLearnedProfile;
    if(profile&&profile.preferences&&profile.preferences.learningEnabled===true&&service&&typeof service.confirmedForMate==='function'){
      try{learned=normalizeLearned(await service.confirmedForMate(String(user.id),true))}catch(ignore){learned=[]}
    }
    var fresh=await cloud.getSession(),freshId=fresh&&fresh.user&&String(fresh.user.id||'');if(freshId!==String(user.id))return empty();
    return build(declared,learned)
  }catch(error){return empty()}
}
function categoriesFor(context,fallback,max){
  var base=unique(Array.isArray(fallback)?fallback:[]),preferred=context&&Array.isArray(context.categoryKeys)?context.categoryKeys:[];
  var result=[];preferred.concat(base).forEach(function(key){if(result.indexOf(key)<0)result.push(key)});
  return result.slice(0,Math.max(1,Number(max)||4))
}
function reasonForCategory(categoryKey,context){
  if(!categoryKey||!context||!Array.isArray(context.interests))return null;
  var match=context.interests.find(function(item){return (MAP[item.key]||[]).indexOf(categoryKey)>=0});
  if(!match)return null;
  return Object.freeze({interest:match.key,label:match.label,source:match.source,text:match.source==='declared'?'מתאים לתחום שבחרת: '+match.label:'מתאים להעדפה שאישרת: '+match.label})
}
function inferCategoryKey(place){
  var raw=(clean(place&&place.category)+' '+clean(place&&place.type)).toLowerCase();
  if(/museum|gallery/.test(raw))return'museums';
  if(/historic|monument|memorial|archaeological/.test(raw))return'historic';
  if(/viewpoint/.test(raw))return'viewpoints';
  if(/park|garden|nature_reserve/.test(raw))return'parks';
  if(/beach/.test(raw))return'beaches';
  if(/nightclub/.test(raw))return'nightclubs';
  if(/bar|pub/.test(raw))return'bars';
  if(/cafe/.test(raw))return'cafes';
  if(/bakery/.test(raw))return'bakeries';
  if(/restaurant|fast_food/.test(raw))return'restaurants';
  if(/marketplace|market/.test(raw))return'markets';
  if(/mall|department_store/.test(raw))return'malls';
  if(/clothes|fashion|jewelry|shoes/.test(raw))return'clothing';
  if(/zoo|aquarium/.test(raw))return'zoos';
  if(/theme_park/.test(raw))return'theme_parks';
  if(/attraction/.test(raw))return'attractions';
  return''
}
function reasonForPlace(place,primaryCategory,context){
  var inferred=inferCategoryKey(place),key=inferred||(primaryCategory&&primaryCategory!=='all'?primaryCategory:'');
  return reasonForCategory(key,context)
}
function summary(context){
  if(!context||context.isEmpty)return'';
  var direct=context.interests.filter(function(item){return item.source==='declared'}).slice(0,3).map(function(item){return item.label}),learned=context.interests.filter(function(item){return item.source==='learned'}).slice(0,2).map(function(item){return item.label}),parts=[];
  if(direct.length)parts.push('לפי תחומי העניין שבחרת: '+direct.join(' · '));
  if(learned.length)parts.push('והעדפות שאישרת: '+learned.join(' · '));
  return parts.join(' ')
}

window.TravelMatePersonalizedSuggestions=Object.freeze({
  interestCategoryMap:MAP,
  build:build,
  current:current,
  categoriesFor:categoriesFor,
  reasonForCategory:reasonForCategory,
  reasonForPlace:reasonForPlace,
  inferCategoryKey:inferCategoryKey,
  summary:summary
});
window.dispatchEvent(new CustomEvent('travelmate:personalized-suggestions-ready'));
})();

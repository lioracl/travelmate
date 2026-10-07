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
var EXCLUSIONS=Object.freeze({nightlife:['bars','nightclubs'],shopping:['malls','clothing','markets'],museums:['museums'],long_walks:['hiking','long_walks'],expensive_places:['expensive_places'],early_mornings:['early_mornings']});
function traveler(value){var helper=window.TravelMateUserProfile;return helper&&helper.normalizeTraveler?helper.normalizeTraveler(value):value||{}}
function blockedKeys(value){var p=traveler(value);return unique((p.exclusions||[]).reduce(function(keys,key){return keys.concat(EXCLUSIONS[key]||[key])},[]))}
function categoryScore(key,p,pace){
  p=p||{};var score=0;
  if(p.walking==='short'&&key==='viewpoints')score-=30;
  if(p.walking==='long'&&/^(parks|viewpoints)$/.test(key))score+=12;
  if(p.spending==='economical'&&/^(parks|beaches|markets|cafes)$/.test(key))score+=15;
  if(p.spending==='premium'&&key==='restaurants')score+=12;
  if(p.transport&&p.transport.indexOf('walking')<0&&p.transport.length&&key==='viewpoints')score-=8;
  if(pace==='relaxed'&&/^(cafes|parks|beaches)$/.test(key))score+=15;
  if((p.food||[]).indexOf('cafes')>=0&&key==='cafes')score+=30;
  if((p.food||[]).some(function(x){return x==='local'||x==='street_food'})&&/^(markets|bakeries)$/.test(key))score+=25;
  if((p.food||[]).some(function(x){return x==='vegetarian'||x==='vegan'||x==='fine_dining'})&&key==='restaurants')score+=20;
  return score;
}
function activePeriod(now){var hour=(now instanceof Date?now:new Date(now||Date.now())).getHours();return hour>=5&&hour<8?'early_morning':hour<12&&hour>=8?'morning':hour>=12&&hour<17?'afternoon':hour>=17&&hour<21?'evening':'night'}
function activeAt(context,now){var p=context&&context.profile2||{},period=activePeriod(now);return !(period==='early_morning'&&(p.exclusions||[]).indexOf('early_mornings')>=0)&&(!(p.activeHours||[]).length||p.activeHours.indexOf(period)>=0)}
function profileReason(context){var p=context&&context.profile2||{},parts=[];if(context&&context.travelPace==='relaxed')parts.push('לפי הקצב הנינוח שבחרת');else if(context&&context.travelPace==='intensive')parts.push('לפי הקצב האינטנסיבי שבחרת');if(p.walking==='short')parts.push('עם עדיפות להליכה קצרה');if((p.transport||[]).length)parts.push('בהתחשב בתחבורה שבחרת');if((p.activeHours||[]).length)parts.push('בשעות הפעילות שבחרת');if(p.spending==='economical')parts.push('לפי סגנון ההוצאה החסכוני שלך');if(p.spending==='premium')parts.push('לפי העדפת הפרימיום שלך');if(p.spontaneity==='planned')parts.push('עם זמן לתכנון מראש');if(p.spontaneity==='spontaneous')parts.push('עם מקום לספונטניות');return parts.slice(0,2).join(' · ')}
function rankPlaces(places,context,preserveManual){var p=context&&context.profile2||{},blocked=context&&context.blockedCategoryKeys||[];return (places||[]).map(function(place,index){var category=inferCategoryKey(place),excluded=blocked.indexOf(category)>=0||((p.exclusions||[]).indexOf('long_walks')>=0&&(place.walkingLevel==='long'||Number(place.walkingMinutes)>30))||((p.exclusions||[]).indexOf('expensive_places')>=0&&Number(place.priceLevel)>=3);var score=categoryScore(category,p,context&&context.travelPace);if(p.walking==='short'&&Number(place.walkingMinutes)>20)score-=40;if(p.spending==='economical'&&Number(place.priceLevel)>=3)score-=30;if((p.transport||[]).length&&Array.isArray(place.supportedTransport)&&!place.supportedTransport.some(function(key){return p.transport.indexOf(key)>=0}))score-=25;return{place:place,index:index,score:excluded?-1000:score,excluded:excluded}}).filter(function(row){return preserveManual||!row.excluded}).sort(function(a,b){return b.score-a.score||a.index-b.index}).map(function(row){return row.place})}
function build(declared,learned,preferences){
  preferences=preferences||{};var p=traveler(preferences.profile2),blocked=blockedKeys(p),pace=preferences.pace==='active'?'intensive':preferences.pace||'';
  var declaredKeys=unique((declared||[]).map(allowedInterest).filter(Boolean)).filter(function(key){return (MAP[key]||[]).some(function(category){return blocked.indexOf(category)<0})});
  var learnedKeys=unique((learned||[]).map(allowedInterest).filter(Boolean)).filter(function(key){return declaredKeys.indexOf(key)<0&&(MAP[key]||[]).some(function(category){return blocked.indexOf(category)<0})});
  var interests=declaredKeys.map(function(key){return Object.freeze({key:key,label:interestLabel(key),source:'declared'})}).concat(learnedKeys.map(function(key){return Object.freeze({key:key,label:interestLabel(key),source:'learned'})}));
  var categories=[];interests.forEach(function(item){(MAP[item.key]||[]).forEach(function(key){if(categories.indexOf(key)<0)categories.push(key)})});
  var configured=Object.keys(p).some(function(key){return Array.isArray(p[key])?p[key].length:Boolean(p[key])});
  if(configured||pace){categories=unique(categories.concat(['attractions','cafes','parks']));}
  categories=categories.filter(function(key){return blocked.indexOf(key)<0}).map(function(key,index){return{key:key,index:index,score:categoryScore(key,p,pace)}}).sort(function(a,b){return b.score-a.score||a.index-b.index}).map(function(row){return row.key});
  return Object.freeze({
    profile2:p,travelPace:pace,blockedCategoryKeys:Object.freeze(blocked),
    declared:Object.freeze(declaredKeys),
    learned:Object.freeze(learnedKeys),
    interests:Object.freeze(interests),
    categoryKeys:Object.freeze(categories),
    isEmpty:interests.length===0&&!configured&&!pace
  })
}
var contextGeneration=0;
if(typeof window.addEventListener==='function')['travelmate:home-auth','travelmate:profile-change','travelmate:learned-profile-change'].forEach(function(name){window.addEventListener(name,function(){contextGeneration+=1})});
function empty(){return build([],[])}
async function current(){
  var generation=contextGeneration,cloud=window.TravelMateCloud,helper=window.TravelMateUserProfile;
  if(!cloud||typeof cloud.getSession!=='function'||!helper||typeof helper.fromUser!=='function')return empty();
  try{
    var session=await cloud.getSession(),user=session&&session.user;if(!user)return empty();
    var profile=helper.fromUser(user),declared=profile&&profile.preferences&&profile.preferences.interests||[],learned=[];
    var service=window.TravelMateLearnedProfile;
    if(profile&&profile.preferences&&profile.preferences.learningEnabled===true&&service&&typeof service.confirmedForMate==='function'){
      try{learned=normalizeLearned(await service.confirmedForMate(String(user.id),true))}catch(ignore){learned=[]}
    }
    var fresh=await cloud.getSession(),freshId=fresh&&fresh.user&&String(fresh.user.id||'');if(generation!==contextGeneration||freshId!==String(user.id))return empty();
    return build(declared,learned,profile.preferences)
  }catch(error){return empty()}
}
function categoriesFor(context,fallback,max){
  var base=unique(Array.isArray(fallback)?fallback:[]),preferred=context&&Array.isArray(context.categoryKeys)?context.categoryKeys:[];
  var result=[];preferred.concat(base).forEach(function(key){if(result.indexOf(key)<0&&(!context||!context.blockedCategoryKeys||context.blockedCategoryKeys.indexOf(key)<0))result.push(key)});
  return result.slice(0,Math.max(1,Number(max)||4))
}
function reasonForCategory(categoryKey,context){
  if(!categoryKey||!context||!Array.isArray(context.interests)||context.blockedCategoryKeys&&context.blockedCategoryKeys.indexOf(categoryKey)>=0)return null;
  var match=context.interests.find(function(item){return (MAP[item.key]||[]).indexOf(categoryKey)>=0});
  if(!match){var reason=profileReason(context);return reason?Object.freeze({interest:'',label:'העדפות מפורשות',source:'declared',text:reason}):null;}
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
  var p=context&&context.profile2||{},exclusions=p.exclusions||[];if(exclusions.indexOf('expensive_places')>=0&&Number(place&&place.priceLevel)>=3||exclusions.indexOf('long_walks')>=0&&(place&&place.walkingLevel==='long'||Number(place&&place.walkingMinutes)>30))return null;return reasonForCategory(key,context)
}
function summary(context){
  if(!context||context.isEmpty)return'';
  var direct=context.interests.filter(function(item){return item.source==='declared'}).slice(0,3).map(function(item){return item.label}),learned=context.interests.filter(function(item){return item.source==='learned'}).slice(0,2).map(function(item){return item.label}),parts=[];
  if(direct.length)parts.push('לפי תחומי העניין שבחרת: '+direct.join(' · '));
  if(learned.length)parts.push('והעדפות שאישרת: '+learned.join(' · '));
  if(!parts.length&&profileReason(context))parts.push(profileReason(context));return parts.join(' ')
}

window.TravelMatePersonalizedSuggestions=Object.freeze({
  profileReason:profileReason,
  activeAt:activeAt,
  rankPlaces:rankPlaces,
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

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
  var avatarUrl=safeAvatarUrl(metadata.avatar_url||metadata.picture||metadata.photo_url||'');
  return Object.freeze({
    name:name,
    firstName:firstName,
    initials:initials,
    avatarUrl:avatarUrl,
    greeting:greetingAt(now)
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
  greetingAt:greetingAt,
  localDateKey:localDateKey,
  selectHomeContext:selectHomeContext
});
window.dispatchEvent(new CustomEvent('travelmate:user-profile-ready'));
})();
(function(){
'use strict';

if(window.TravelMateTripAnalytics)return;

var context=window.TravelMateTripContext;

function clean(value){return String(value==null?'':value).trim()}
function number(value){var n=Number(value);return Number.isFinite(n)?n:null}
function round(value,decimals){
  var factor=Math.pow(10,decimals||2);
  return Math.round(Number(value)*factor)/factor
}
function localDate(item){
  var raw=clean(item&&item.localDate||item&&item.date);
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;
  if(context&&typeof context.localDateKey==='function'&&raw){
    var date=new Date(raw);
    return Number.isNaN(date.getTime())?'':context.localDateKey(date);
  }
  return ''
}
function completedRecords(trip){
  var activities=(trip&&trip.activities||[]).filter(function(item){return item&&item.done===true}).map(function(item){
    return{kind:'activity',record:item}
  });
  var places=(trip&&trip.savedPlaces||[]).filter(function(item){return item&&item.done===true}).map(function(item){
    return{kind:'place',record:item}
  });
  return activities.concat(places).map(function(entry){
    return Object.freeze({
      kind:entry.kind,
      record:entry.record,
      date:localDate(entry.record),
      time:clean(entry.record.time)
    })
  }).filter(function(entry){return entry.date}).sort(function(a,b){
    return a.date.localeCompare(b.date)||a.time.localeCompare(b.time)
  })
}
function groupByDate(records){
  var map=Object.create(null);
  records.forEach(function(entry){
    (map[entry.date]||(map[entry.date]=[])).push(entry)
  });
  return map
}
function segment(previous,next){
  if(!context||typeof context.estimateTravelMinutes!=='function')return null;
  var estimate=context.estimateTravelMinutes(previous.record,next.record);
  if(!estimate)return null;
  var explicit=number(next.record.travelMinutesBefore||next.record.transitionMinutes||next.record.travelMinutes);
  return Object.freeze({
    fromId:clean(previous.record.id),
    toId:clean(next.record.id),
    date:next.date,
    mode:estimate.mode,
    modeSource:estimate.modeSource||'inferred',
    distanceKm:number(estimate.distanceKm),
    travelMinutes:estimate.minutes,
    source:explicit!==null&&explicit>0?'manual':'estimate'
  })
}
function summarizeSegments(segments){
  var totals={distanceKm:0,travelMinutes:0,walkingDistanceKm:0,transportDistanceKm:0,walkingMinutes:0,transportMinutes:0};
  var modes=['walk','bike','drive','taxi','transit','metro','rail'],byMode=Object.create(null);modes.forEach(function(mode){byMode[mode]={segments:0,distanceKm:0,travelMinutes:0,manualTimeSegments:0}});
  var distanceSegments=0,timeSegments=0,manualTimeSegments=0,explicitModeSegments=0;
  segments.forEach(function(item){
    var bucket=byMode[item.mode]||byMode.transit;bucket.segments+=1;
    if(item.modeSource==='explicit')explicitModeSegments+=1;
    if(number(item.distanceKm)!==null){
      totals.distanceKm+=item.distanceKm;
      if(item.mode==='walk')totals.walkingDistanceKm+=item.distanceKm;
      else totals.transportDistanceKm+=item.distanceKm;
      bucket.distanceKm+=item.distanceKm;
      distanceSegments+=1
    }
    if(number(item.travelMinutes)!==null){
      totals.travelMinutes+=item.travelMinutes;
      if(item.mode==='walk')totals.walkingMinutes+=item.travelMinutes;
      else totals.transportMinutes+=item.travelMinutes;
      bucket.travelMinutes+=item.travelMinutes;
      timeSegments+=1;
    }
    if(item.source==='manual'){manualTimeSegments+=1;bucket.manualTimeSegments+=1;}
  });
  var frozenByMode={};modes.forEach(function(mode){var item=byMode[mode];frozenByMode[mode]=Object.freeze({segments:item.segments,distanceKm:round(item.distanceKm),travelMinutes:Math.round(item.travelMinutes),manualTimeSegments:item.manualTimeSegments})});
  return{
    distanceKm:round(totals.distanceKm),
    walkingDistanceKm:round(totals.walkingDistanceKm),
    transportDistanceKm:round(totals.transportDistanceKm),
    travelMinutes:Math.round(totals.travelMinutes),
    walkingMinutes:Math.round(totals.walkingMinutes),
    transportMinutes:Math.round(totals.transportMinutes),
    distanceCoverage:segments.length?round(distanceSegments/segments.length,2):0,
    timeCoverage:segments.length?round(timeSegments/segments.length,2):0,
    manualTimeCoverage:segments.length?round(manualTimeSegments/segments.length,2):0,
    explicitModeCoverage:segments.length?round(explicitModeSegments/segments.length,2):0,
    byMode:Object.freeze(frozenByMode)
  }
}
function currencyCode(value){var code=clean(value).toUpperCase();return /^[A-Z]{3}$/.test(code)?code:'UNKNOWN'}
function freezeMoneyMap(map){var copy={};Object.keys(map).sort().forEach(function(code){copy[code]=round(map[code])});return Object.freeze(copy)}
function summarizeExpenses(items){
  var totals={},categories=Object.create(null),days=Object.create(null),count=0;
  (Array.isArray(items)?items:[]).forEach(function(item){var amount=number(item&&item.amount);if(amount===null||amount<0)return;var currency=currencyCode(item&&item.currency),category=clean(item&&item.category).split('/')[0].trim()||'אחר',date=localDate(item);count+=1;totals[currency]=(totals[currency]||0)+amount;var bucket=categories[category]||(categories[category]={count:0,totals:{}});bucket.count+=1;bucket.totals[currency]=(bucket.totals[currency]||0)+amount;if(date){var day=days[date]||(days[date]={count:0,totals:{}});day.count+=1;day.totals[currency]=(day.totals[currency]||0)+amount}});
  return Object.freeze({count:count,totals:freezeMoneyMap(totals),categories:Object.freeze(Object.keys(categories).sort().map(function(name){return Object.freeze({name:name,count:categories[name].count,totals:freezeMoneyMap(categories[name].totals)})})),days:Object.freeze(Object.keys(days).sort().map(function(date){return Object.freeze({date:date,count:days[date].count,totals:freezeMoneyMap(days[date].totals)})})),status:'confirmed'})
}
function routePoints(records){if(!context||typeof context.coordinates!=='function')return Object.freeze([]);return Object.freeze(records.map(function(entry){var point=context.coordinates(entry.record);if(!point)return null;return Object.freeze({id:clean(entry.record.id),kind:entry.kind,date:entry.date,time:entry.time,title:clean(entry.record.title||entry.record.name)||'מקום',lat:point.lat,lon:point.lon})}).filter(Boolean))}
function summaryDays(completedDates,groups,segments,expenses){var map=Object.create(null);completedDates.forEach(function(date){var day=groups[date];map[date]={date:date,completedVisits:day.length,activities:day.filter(function(item){return item.kind==='activity'}).length,places:day.filter(function(item){return item.kind==='place'}).length,segments:[],expenseCount:0,expenseTotals:{}}});segments.forEach(function(item){var day=map[item.date]||(map[item.date]={date:item.date,completedVisits:0,activities:0,places:0,segments:[],expenseCount:0,expenseTotals:{}});day.segments.push(item)});expenses.days.forEach(function(expenseDay){var day=map[expenseDay.date]||(map[expenseDay.date]={date:expenseDay.date,completedVisits:0,activities:0,places:0,segments:[],expenseCount:0,expenseTotals:{}});day.expenseCount=expenseDay.count;day.expenseTotals=expenseDay.totals});return Object.freeze(Object.keys(map).sort().map(function(date){var day=map[date];return Object.freeze({date:date,completedVisits:day.completedVisits,activities:day.activities,places:day.places,movement:Object.freeze(summarizeSegments(day.segments)),expenseCount:day.expenseCount,expenseTotals:Object.freeze(day.expenseTotals)})}))}
function build(trip){
  trip=trip||{};
  var completed=completedRecords(trip),groups=groupByDate(completed),dates=Object.keys(groups).sort();
  var segments=[];
  dates.forEach(function(date){
    var day=groups[date];
    for(var index=1;index<day.length;index+=1){
      var item=segment(day[index-1],day[index]);
      if(item)segments.push(item)
    }
  });
  var movement=summarizeSegments(segments),expenses=summarizeExpenses(trip.expenses||[]),points=routePoints(completed),daily=summaryDays(dates,groups,segments,expenses);
  var planned=((trip.activities||[]).length+(trip.savedPlaces||[]).filter(function(item){return item&&item.date}).length);
  var possibleSegments=Math.max(0,completed.length-dates.length);
  var coordinatesAvailable=completed.filter(function(item){
    return context&&typeof context.coordinates==='function'&&context.coordinates(item.record)
  }).length;
  return Object.freeze({
    completedVisits:completed.length,
    completedActivities:completed.filter(function(item){return item.kind==='activity'}).length,
    completedPlaces:completed.filter(function(item){return item.kind==='place'}).length,
    plannedItems:planned,
    activeDays:dates.length,
    expenses:expenses,
    route:Object.freeze({points:points,pointCount:points.length,pointCoverage:completed.length?round(points.length/completed.length,2):0,pointStatus:points.length?'confirmed':'unknown',pathStatus:points.length>1?'estimated':'unknown'}),
    summaryDays:daily,
    days:dates.map(function(date){
      var day=groups[date];
      return Object.freeze({
        date:date,
        completedVisits:day.length,
        activities:day.filter(function(item){return item.kind==='activity'}).length,
        places:day.filter(function(item){return item.kind==='place'}).length
      })
    }),
    movement:movement,
    coverage:Object.freeze({
      coordinateRecords:coordinatesAvailable,
      coordinateCoverage:completed.length?round(coordinatesAvailable/completed.length,2):0,
      possibleSegments:possibleSegments,
      segmentCoverage:possibleSegments?round(segments.length/possibleSegments,2):0
    }),
    status:Object.freeze({
      visits:'confirmed',
      distance:segments.length?'estimated':'unknown',
      travelTime:movement.manualTimeCoverage===1&&segments.length?'confirmed':segments.length?'estimated':'unknown',
      expenses:'confirmed'
    })
  })
}

function buildPersonalStats(trips,authenticatedUserId){
  var list=Array.isArray(trips)?trips:[];
  var userId=String(authenticatedUserId||'');
  var ownedAll=list.filter(function(trip){
    return trip&&String(trip.ownerId||'')===userId&&!trip.deletedAt&&!trip.deletePending;
  });
  var owned=ownedAll.slice(0,50);
  var stats={
    tripsCount:owned.length,
    tripsAvailable:ownedAll.length,
    tripsConsidered:owned.length,
    truncated:ownedAll.length>owned.length,
    totalDays:0,
    completedVisits:0,
    completedActivities:0,
    completedPlaces:0,
    activeDays:0,
    distanceKm:0,
    walkingDistanceKm:0,
    transportDistanceKm:0,
    travelMinutes:0,
    distanceCoverage:0,
    timeCoverage:0,
    modeBreakdown:{walk:{segments:0,distanceKm:0,travelMinutes:0},bike:{segments:0,distanceKm:0,travelMinutes:0},drive:{segments:0,distanceKm:0,travelMinutes:0},taxi:{segments:0,distanceKm:0,travelMinutes:0},transit:{segments:0,distanceKm:0,travelMinutes:0},metro:{segments:0,distanceKm:0,travelMinutes:0},rail:{segments:0,distanceKm:0,travelMinutes:0}}
  };
  var distanceCoverageWeight=0;
  var timeCoverageWeight=0;
  owned.forEach(function(trip){
    var result=build(trip);
    stats.totalDays+=Number(trip.days||0)||0;
    stats.completedVisits+=result.completedVisits;
    stats.completedActivities+=result.completedActivities;
    stats.completedPlaces+=result.completedPlaces;
    stats.activeDays+=result.activeDays;
    stats.distanceKm+=result.movement.distanceKm;
    stats.walkingDistanceKm+=result.movement.walkingDistanceKm;
    stats.transportDistanceKm+=result.movement.transportDistanceKm;
    stats.travelMinutes+=result.movement.travelMinutes;
    Object.keys(stats.modeBreakdown).forEach(function(mode){var source=result.movement.byMode&&result.movement.byMode[mode];if(!source)return;stats.modeBreakdown[mode].segments+=source.segments;stats.modeBreakdown[mode].distanceKm+=source.distanceKm;stats.modeBreakdown[mode].travelMinutes+=source.travelMinutes});
    var possibleSegments=Number(result.coverage&&result.coverage.possibleSegments||0);
    if(possibleSegments>0){
      distanceCoverageWeight+=possibleSegments;
      timeCoverageWeight+=possibleSegments;
      stats.distanceCoverage+=result.movement.distanceCoverage*possibleSegments;
      stats.timeCoverage+=result.movement.timeCoverage*possibleSegments;
    }
  });
  if(distanceCoverageWeight)stats.distanceCoverage=Math.round(stats.distanceCoverage/distanceCoverageWeight*100)/100;
  if(timeCoverageWeight)stats.timeCoverage=Math.round(stats.timeCoverage/timeCoverageWeight*100)/100;
  stats.distanceKm=round(stats.distanceKm);
  stats.walkingDistanceKm=round(stats.walkingDistanceKm);
  stats.transportDistanceKm=round(stats.transportDistanceKm);
  stats.travelMinutes=Math.round(stats.travelMinutes);
  Object.keys(stats.modeBreakdown).forEach(function(mode){var item=stats.modeBreakdown[mode];item.distanceKm=round(item.distanceKm);item.travelMinutes=Math.round(item.travelMinutes);Object.freeze(item)});Object.freeze(stats.modeBreakdown);
  return Object.freeze(stats);
}

window.TravelMateTripAnalytics=Object.freeze({
  build:build,
  completedRecords:completedRecords,
  summarizeSegments:summarizeSegments,
  summarizeExpenses:summarizeExpenses,
  buildPersonalStats:buildPersonalStats
});
window.dispatchEvent(new CustomEvent('travelmate:trip-analytics-ready'));
})();

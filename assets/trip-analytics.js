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
    mode:estimate.mode,
    distanceKm:number(estimate.distanceKm),
    travelMinutes:estimate.minutes,
    source:explicit!==null&&explicit>0?'manual':'estimate'
  })
}
function summarizeSegments(segments){
  var totals={distanceKm:0,travelMinutes:0,walkingDistanceKm:0,transportDistanceKm:0,walkingMinutes:0,transportMinutes:0};
  var distanceSegments=0,timeSegments=0,manualTimeSegments=0;
  segments.forEach(function(item){
    if(number(item.distanceKm)!==null){
      totals.distanceKm+=item.distanceKm;
      if(item.mode==='walk')totals.walkingDistanceKm+=item.distanceKm;
      else totals.transportDistanceKm+=item.distanceKm;
      distanceSegments+=1
    }
    if(number(item.travelMinutes)!==null){
      totals.travelMinutes+=item.travelMinutes;
      if(item.mode==='walk')totals.walkingMinutes+=item.travelMinutes;
      else totals.transportMinutes+=item.travelMinutes;
      timeSegments+=1;
    }
    if(item.source==='manual')manualTimeSegments+=1;
  });
  return{
    distanceKm:round(totals.distanceKm),
    walkingDistanceKm:round(totals.walkingDistanceKm),
    transportDistanceKm:round(totals.transportDistanceKm),
    travelMinutes:Math.round(totals.travelMinutes),
    walkingMinutes:Math.round(totals.walkingMinutes),
    transportMinutes:Math.round(totals.transportMinutes),
    distanceCoverage:segments.length?round(distanceSegments/segments.length,2):0,
    timeCoverage:segments.length?round(timeSegments/segments.length,2):0,
    manualTimeCoverage:segments.length?round(manualTimeSegments/segments.length,2):0
  }
}
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
  var movement=summarizeSegments(segments);
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
      travelTime:movement.manualTimeCoverage===1&&segments.length?'confirmed':segments.length?'estimated':'unknown'
    })
  })
}

function buildPersonalStats(trips,authenticatedUserId){
  var list=Array.isArray(trips)?trips:[];
  var userId=String(authenticatedUserId||'');
  var owned=list.filter(function(trip){
    return trip&&String(trip.ownerId||'')===userId&&!trip.deletedAt&&!trip.deletePending;
  }).slice(0,50);
  var stats={
    tripsCount:owned.length,
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
    timeCoverage:0
  };
  var coverageWeight=0;
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
    coverageWeight+=1;
    stats.distanceCoverage+=result.movement.distanceCoverage;
    stats.timeCoverage+=result.movement.timeCoverage;
  });
  if(coverageWeight){
    stats.distanceCoverage=Math.round(stats.distanceCoverage/coverageWeight*100)/100;
    stats.timeCoverage=Math.round(stats.timeCoverage/coverageWeight*100)/100;
  }
  stats.distanceKm=round(stats.distanceKm);
  stats.walkingDistanceKm=round(stats.walkingDistanceKm);
  stats.transportDistanceKm=round(stats.transportDistanceKm);
  stats.travelMinutes=Math.round(stats.travelMinutes);
  return Object.freeze(stats);
}

window.TravelMateTripAnalytics=Object.freeze({
  build:build,
  completedRecords:completedRecords,
  summarizeSegments:summarizeSegments,
  buildPersonalStats:buildPersonalStats
});
window.dispatchEvent(new CustomEvent('travelmate:trip-analytics-ready'));
})();

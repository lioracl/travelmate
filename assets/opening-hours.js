(function(){
'use strict';
if(window.TravelMateOpeningHours)return;
var DAY={Su:0,Mo:1,Tu:2,We:3,Th:4,Fr:5,Sa:6};
function clean(value){return String(value||'').trim().replace(/\s+/g,' ')}
function minute(value){var match=String(value||'').match(/^(\d{1,2}):(\d{2})$/);if(!match)return null;var hour=Number(match[1]),min=Number(match[2]);return hour<24&&min<60?hour*60+min:null}
function days(value){var result=new Set(),parts=String(value||'').split(',');for(var i=0;i<parts.length;i+=1){var token=parts[i].trim();if(!token)return null;if(token.indexOf('-')>-1){var range=token.split('-'),start=DAY[range[0]],end=DAY[range[1]];if(start===undefined||end===undefined)return null;for(var step=0,current=start;step<7;step+=1,current=(current+1)%7){result.add(current);if(current===end)break}}else{if(DAY[token]===undefined)return null;result.add(DAY[token])}}return result}
function parse(value){var raw=clean(value);if(!raw)return null;if(raw==='24/7')return{raw:raw,always:true,rules:[]};if(/\b(?:PH|SH)\b|sunrise|sunset|dawn|dusk|\+|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(raw))return null;var rules=[],chunks=raw.split(';');for(var i=0;i<chunks.length;i+=1){var part=clean(chunks[i]),match=part.match(/^([A-Z][a-z](?:-[A-Z][a-z])?(?:,[A-Z][a-z](?:-[A-Z][a-z])?)*)\s+(off|closed|.+)$/);if(!match)return null;var activeDays=days(match[1]);if(!activeDays)return null;var body=match[2].toLowerCase();if(body==='off'||body==='closed'){rules.push({days:activeDays,closed:true,intervals:[]});continue}var intervals=[],items=match[2].split(',');for(var j=0;j<items.length;j+=1){var pair=clean(items[j]).split('-');if(pair.length!==2)return null;var start=minute(pair[0]),end=minute(pair[1]);if(start===null||end===null||end<=start)return null;intervals.push([start,end])}rules.push({days:activeDays,closed:false,intervals:intervals})}return rules.length?{raw:raw,always:false,rules:rules}:null}
function statusAt(value,date){
  var parsed=parse(value),moment=date instanceof Date?date:new Date(date||Date.now());
  if(!parsed||!Number.isFinite(moment.getTime()))return Object.freeze({state:'unknown',label:'שעות פתיחה לא אומתו',raw:clean(value),source:'osm',confidence:'unknown'});
  if(parsed.always)return Object.freeze({state:'open',label:'פתוח עכשיו',raw:parsed.raw,source:'osm',confidence:'parsed'});
  var day=moment.getDay(),now=moment.getHours()*60+moment.getMinutes(),applicable=parsed.rules.filter(function(rule){return rule.days.has(day)});
  if(applicable.length>1)return Object.freeze({state:'unknown',label:'שעות פתיחה לא אומתו',raw:parsed.raw,source:'osm',confidence:'conflict'});
  if(!applicable.length)return Object.freeze({state:'closed',label:'סגור עכשיו',raw:parsed.raw,source:'osm',confidence:'parsed'});
  var rule=applicable[0];if(rule.closed)return Object.freeze({state:'closed',label:'סגור עכשיו',raw:parsed.raw,source:'osm',confidence:'parsed'});
  var open=rule.intervals.some(function(interval){return now>=interval[0]&&now<interval[1]});
  return Object.freeze({state:open?'open':'closed',label:open?'פתוח עכשיו':'סגור עכשיו',raw:parsed.raw,source:'osm',confidence:'parsed'})
}
function statusAtMinutes(value,date,offsetMinutes){var moment=date instanceof Date?new Date(date.getTime()):new Date(date||Date.now());if(!Number.isFinite(moment.getTime()))return statusAt(value,moment);moment.setMinutes(moment.getMinutes()+Number(offsetMinutes||0));var status=statusAt(value,moment);return Object.freeze(Object.assign({},status,{at:moment.toISOString()}))}
function badge(value,date){var status=statusAt(value,date);if(status.state==='unknown')return '';return '<span class="nearby-opening-status is-'+status.state+'"><i class="fa-solid '+(status.state==='open'?'fa-door-open':'fa-door-closed')+'" aria-hidden="true"></i>'+status.label+' <small>· לפי OpenStreetMap</small></span>'}
window.TravelMateOpeningHours=Object.freeze({parse:parse,statusAt:statusAt,statusAtMinutes:statusAtMinutes,badge:badge});
})();

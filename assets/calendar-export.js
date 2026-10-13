(function(root,factory){
'use strict';
var api=factory();
if(typeof module==='object'&&module.exports)module.exports=api;
else root.TravelMateCalendarExport=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
var MARKER='TravelMate';
var TIME_COPY='השעה המיוצאת היא השעה המקומית של הטיול כפי שהוזנה. אזור הזמן של הטיול אינו ידוע; יש לבדוק ולאשר את אזור הזמן ביומן לפני שמירה או ייבוא.';
function text(value){return typeof value==='string'?value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim():''}
function mode(record){
  var raw=String(record.scheduleMode||record.timingMode||record.flexibility||'').toLowerCase();
  if(['fixed','booked','reservation'].includes(raw))return'fixed';
  if(['flexible','free'].includes(raw))return'flexible';
  if(['window','time-window','time_window'].includes(raw))return'window';
  return'planned';
}
function localStart(record){
  if(!record||['flexible','window'].includes(mode(record)))return null;
  if(typeof record.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(record.date))return null;
  if(typeof record.time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(record.time))return null;
  var parts=record.date.split('-').map(Number),date=new Date(0);
  if(parts[0]<1)return null;
  date.setUTCFullYear(parts[0],parts[1]-1,parts[2]);date.setUTCHours(0,0,0,0);
  if(date.getUTCFullYear()!==parts[0]||date.getUTCMonth()!==parts[1]-1||date.getUTCDate()!==parts[2])return null;
  var time=record.time.split(':').map(Number);date.setUTCHours(time[0],time[1],0,0);
  return date;
}
function duration(record){
  // Matches the planner's missing-duration default, never an invalid explicit value.
  if(record.duration===undefined||record.duration===null||record.duration==='')return 60;
  if(typeof record.duration!=='number'&&typeof record.duration!=='string')return null;
  var value=Number(record.duration);
  return Number.isSafeInteger(value)&&value>0?value:null;
}
function eligible(record){
  var start=localStart(record),minutes=record&&duration(record);if(!start||minutes===null)return false;
  var end=new Date(start.getTime()+minutes*60000);
  return Number.isFinite(end.getTime())&&end.getUTCFullYear()<=9999;
}
function stamp(date){return date.toISOString().slice(0,19).replace(/[-:]/g,'')}
async function deriveEvent(trip,record){
  var start=localStart(record),minutes=record&&duration(record);if(!start||minutes===null)return null;
  var end=new Date(start.getTime()+minutes*60000);
  if(!Number.isFinite(end.getTime())||end.getUTCFullYear()>9999)return null;
  var title=text(record.title)||text(record.name)||'פעילות TravelMate';
  var location=[text(record.locationName),text(record.address)].filter(Boolean).join(', ');
  // Only opaque canonical record IDs are hashed; no account or private fields are read.
  var identity=JSON.stringify([text(trip&&trip.id),text(record.id)||[record.date,record.time,title,location].join('|')]);
  var bytes=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity));
  var uid=Array.from(new Uint8Array(bytes),function(byte){return byte.toString(16).padStart(2,'0')}).join('')+'@travelmate.invalid';
  return Object.freeze({title:title,start:stamp(start),end:stamp(end),location:location,description:MARKER,uid:uid});
}
function escapeIcs(value){return String(value).replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;')}
function fold(line){
  var lines=[],current='',size=0,encoder=new TextEncoder();
  for(var char of line){var length=encoder.encode(char).length;if(size+length>75){lines.push(current);current=' ';size=1}current+=char;size+=length}
  lines.push(current);return lines.join('\r\n');
}
function buildIcs(events,now){
  var date=now===undefined?new Date():new Date(now);
  if(!Number.isFinite(date.getTime())||date.getUTCFullYear()<1||date.getUTCFullYear()>9999)throw new TypeError('Invalid DTSTAMP');
  var lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//TravelMate//Calendar Export//EN','CALSCALE:GREGORIAN'];
  (Array.isArray(events)?events:[events]).filter(Boolean).forEach(function(event){
    lines.push('BEGIN:VEVENT','UID:'+event.uid,'DTSTAMP:'+stamp(date)+'Z','DTSTART:'+event.start,'DTEND:'+event.end,'SUMMARY:'+escapeIcs(event.title),'DESCRIPTION:'+MARKER);
    if(event.location)lines.push('LOCATION:'+escapeIcs(event.location));
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');return lines.map(fold).join('\r\n')+'\r\n';
}
function googleUrl(event){
  if(!event)return'';
  var params=new URLSearchParams({action:'TEMPLATE',text:event.title,dates:event.start+'/'+event.end,details:MARKER});
  if(event.location)params.set('location',event.location);
  return'https://calendar.google.com/calendar/render?'+params.toString();
}
return Object.freeze({deriveEvent:deriveEvent,eligible:eligible,buildIcs:buildIcs,googleUrl:googleUrl,timeCopy:TIME_COPY});
});

(function(){
'use strict';
var dialog=null,opener=null,current=null,revision=0;
function api(){return window.TravelMateCalendarExport}
function close(){if(dialog&&dialog.open)dialog.close()}
function syncOnline(){
  if(!dialog||!dialog.open)return;
  var offline=navigator.onLine===false;
  dialog.querySelector('[data-calendar-google]').disabled=!current||offline;
  dialog.querySelector('[data-calendar-online]').textContent=offline?'Google Calendar אינו זמין ללא רשת. אפשר להוריד קובץ ICS ולייבא אותו ליומן.':'Google Calendar ייפתח רק בלחיצה. הפרטים המוצגים יועברו ל־Google; יש לאשר שם את השעה ואזור הזמן.';
}
function download(events){
  var blob=new Blob([api().buildIcs(events)],{type:'text/calendar;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download='travelmate-calendar.ics';document.body.appendChild(link);link.click();link.remove();
  setTimeout(function(){URL.revokeObjectURL(url)},1000);
}
function ensureDialog(){
  if(dialog)return;
  dialog=document.createElement('dialog');dialog.className='modal tm-calendar-export';dialog.dir='rtl';
  dialog.setAttribute('aria-labelledby','tm-calendar-export-title');dialog.setAttribute('aria-describedby','tm-calendar-export-time');
  dialog.innerHTML='<header><h2 id="tm-calendar-export-title">הוספה ליומן</h2><button type="button" data-calendar-close aria-label="סגירה">✕</button></header><p id="tm-calendar-export-time"></p><p data-calendar-summary></p><p data-calendar-status role="status"></p><div class="action-options"><button type="button" data-calendar-google disabled>Google Calendar</button><button type="button" data-calendar-ics disabled>הורדת קובץ ICS</button></div><p data-calendar-online></p><small>ייצוא בלבד: שם, שעה, משך ומיקום שנשמר. הערות ומסמכים אינם נכללים. התוכנית אינה משתנה.</small>';
  dialog.querySelector('#tm-calendar-export-time').textContent=api().timeCopy;
  dialog.querySelector('[data-calendar-close]').addEventListener('click',close);
  dialog.addEventListener('keydown',function(event){
    if(event.key!=='Tab')return;
    var buttons=Array.from(dialog.querySelectorAll('button:not(:disabled)')),first=buttons[0],last=buttons[buttons.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  });
  dialog.addEventListener('click',function(event){if(event.target===dialog){var rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)close()}});
  dialog.addEventListener('close',function(){revision++;current=null;if(window.TravelMateHistory)window.TravelMateHistory.closeOverlay('calendar-export');if(opener&&opener.isConnected)opener.focus()});
  dialog.querySelector('[data-calendar-ics]').addEventListener('click',function(){if(current)download(current)});
  dialog.querySelector('[data-calendar-google]').addEventListener('click',function(){if(current&&navigator.onLine!==false)window.open(api().googleUrl(current),'_blank','noopener,noreferrer')});
  document.body.appendChild(dialog);
}
async function open(trip,record,trigger){
  ensureDialog();opener=trigger||document.activeElement;current=null;var token=++revision;
  dialog.querySelector('[data-calendar-google]').disabled=true;dialog.querySelector('[data-calendar-ics]').disabled=true;
  dialog.querySelector('[data-calendar-summary]').textContent='';
  dialog.querySelector('[data-calendar-status]').textContent='בודק תזמון…';
  if(!dialog.open)dialog.showModal();
  if(window.TravelMateHistory)window.TravelMateHistory.pushOverlay('calendar-export',close);
  dialog.querySelector('[data-calendar-close]').focus();syncOnline();
  try{
    var event=await api().deriveEvent(trip,record);if(token!==revision||!dialog.open)return;
    current=event;
    dialog.querySelector('[data-calendar-status]').textContent=event?'':'נדרשים תאריך תקין ושעה מדויקת. פעילות גמישה או חלון זמן אינם מיוצאים כאירוע מדויק.';
    dialog.querySelector('[data-calendar-summary]').textContent=event?[event.title,record.date+' · '+record.time,event.location].filter(Boolean).join(' — '):'';
    dialog.querySelector('[data-calendar-ics]').disabled=!event;syncOnline();
  }catch(error){if(token===revision)dialog.querySelector('[data-calendar-status]').textContent='לא ניתן להכין את הייצוא. אפשר לסגור ולנסות שוב.'}
}
window.addEventListener('travelmate:account-context-changed',function(){revision++;current=null;close()});
window.addEventListener('online',syncOnline);window.addEventListener('offline',syncOnline);
window.TravelMateCalendarExportUI=Object.freeze({open:open,download:download});
})();

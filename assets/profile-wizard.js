(function(){
'use strict';

var OUTPUT_SIZE=512;
var SOURCE_MAX_BYTES=20*1024*1024;
var UPLOAD_MAX_BYTES=2*1024*1024;
var STYLE_DEFINITIONS=Object.freeze([
  Object.freeze({id:'natural',label:'טבעי',filter:'none'}),
  Object.freeze({id:'warm',label:'חמים',filter:'saturate(1.12) sepia(.16) contrast(1.04)'}),
  Object.freeze({id:'ocean',label:'ים',filter:'saturate(1.08) hue-rotate(10deg) contrast(1.06)'}),
  Object.freeze({id:'mono',label:'שחור־לבן',filter:'grayscale(1) contrast(1.12)'})
]);
var ACCEPTED_TYPES=Object.freeze(['image/jpeg','image/png','image/webp']);
var modal=null,opener=null,ownerId='',user=null,decodedImage=null;
var normalizedBlob=null,styleResults=[],selectedStyle='natural',step=1,busy=false,drawFrame=0,sourceGeneration=0;
var previousBodyOverflow='';

function el(selector){return modal&&modal.querySelector(selector)}
function all(selector){return modal?Array.prototype.slice.call(modal.querySelectorAll(selector)):[]}
function setStatus(message,isError){var node=el('[data-profile-wizard-status]');if(!node)return;node.textContent=message||'';node.setAttribute('role',isError?'alert':'status');node.classList.toggle('error',Boolean(isError))}
function errorMessage(error){
  var value=String(error&&error.message||error||'');
  if(/OFFLINE/.test(value))return'כדי לשמור שינויים בפרופיל יש להתחבר לרשת. השינויים לא יישמרו בתור.';
  if(/AUTH_CONTEXT_CHANGED/.test(value))return'החשבון השתנה בזמן השמירה. שום שינוי לא הוחל על החשבון החדש.';
  if(/NORMALIZED_TOO_LARGE/.test(value))return'התמונה המעובדת גדולה מ־2MB. נסו חיתוך אחר.';
  if(/CONTENT_INVALID/.test(value))return'קובץ התמונה אינו תקין או שאינו תואם לסוג שלו.';
  return'לא הצלחנו לשמור את הפרופיל. נסו שוב.';
}
function revoke(url){if(url&&window.URL&&window.URL.revokeObjectURL)window.URL.revokeObjectURL(url)}
function releaseImage(){if(decodedImage&&typeof decodedImage.close==='function')decodedImage.close();decodedImage=null}
function clearResults(){styleResults.forEach(function(item){revoke(item.url)});styleResults=[];normalizedBlob=null;var grid=el('[data-profile-styles]');if(grid)grid.replaceChildren();var preview=el('[data-profile-selected-preview]');if(preview)preview.removeAttribute('src')}
function resetFiles(){sourceGeneration+=1;releaseImage();clearResults();all('input[type="file"]').forEach(function(input){input.value=''});var canvas=el('[data-profile-crop]');if(canvas){var context=canvas.getContext('2d');context.clearRect(0,0,canvas.width,canvas.height)}var preview=el('[data-profile-selected-preview]');if(preview)preview.removeAttribute('src')}
function signatureMatches(bytes,type){
  if(type==='image/jpeg')return bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  if(type==='image/png')return bytes.length>=8&&[137,80,78,71,13,10,26,10].every(function(value,index){return bytes[index]===value});
  if(type==='image/webp')return bytes.length>=12&&String.fromCharCode.apply(null,bytes.slice(0,4))==='RIFF'&&String.fromCharCode.apply(null,bytes.slice(8,12))==='WEBP';
  return false
}
function sourceFileCheck(file){
  if(!file||ACCEPTED_TYPES.indexOf(String(file.type||'').toLowerCase())<0)return{ok:false,error:'SOURCE_TYPE'};
  if(!Number(file.size)||Number(file.size)>SOURCE_MAX_BYTES)return{ok:false,error:'SOURCE_SIZE'};
  return{ok:true}
}
async function validImageBytes(file){
  if(!file||typeof file.arrayBuffer!=='function')return false;
  var buffer=await file.arrayBuffer();return signatureMatches(new Uint8Array(buffer).slice(0,12),String(file.type||'').toLowerCase())
}
async function validateSource(file){
  var check=sourceFileCheck(file);if(!check.ok)throw new Error(check.error);
  var header=file.slice&&file.slice(0,12).arrayBuffer?await file.slice(0,12).arrayBuffer():await file.arrayBuffer();
  if(!signatureMatches(new Uint8Array(header),String(file.type).toLowerCase()))throw new Error('SOURCE_SIGNATURE');
}
function loadWithImage(file){return new Promise(function(resolve,reject){
  var url=URL.createObjectURL(file),image=new Image(),settled=false;function done(){if(!settled){settled=true;revoke(url)}}
  image.onload=function(){done();if(image.naturalWidth&&image.naturalHeight)resolve(image);else reject(new Error('SOURCE_DECODE'))};
  image.onerror=function(){done();reject(new Error('SOURCE_DECODE'))};image.src=url
})}
async function decodeSource(file){
  if(typeof window.createImageBitmap==='function'){
    try{return await window.createImageBitmap(file,{imageOrientation:'from-image'})}catch(error){}
  }
  return loadWithImage(file)
}
function imageWidth(){return decodedImage&&(decodedImage.width||decodedImage.naturalWidth)||0}
function imageHeight(){return decodedImage&&(decodedImage.height||decodedImage.naturalHeight)||0}
function cropValues(){return{zoom:Number(el('[data-profile-zoom]').value),x:Number(el('[data-profile-x]').value),y:Number(el('[data-profile-y]').value)}}
function drawCrop(target,filter){
  if(!decodedImage)return;
  var context=target.getContext('2d'),values=cropValues(),width=imageWidth(),height=imageHeight();
  var scale=Math.max(OUTPUT_SIZE/width,OUTPUT_SIZE/height)*values.zoom;
  var drawnWidth=width*scale,drawnHeight=height*scale;
  var x=(OUTPUT_SIZE-drawnWidth)/2+(values.x/100)*Math.max(0,drawnWidth-OUTPUT_SIZE)/2;
  var y=(OUTPUT_SIZE-drawnHeight)/2+(values.y/100)*Math.max(0,drawnHeight-OUTPUT_SIZE)/2;
  context.save();context.clearRect(0,0,OUTPUT_SIZE,OUTPUT_SIZE);context.filter=filter||'none';
  context.drawImage(decodedImage,x,y,drawnWidth,drawnHeight);context.restore()
}
function scheduleCropDraw(){if(drawFrame)cancelAnimationFrame(drawFrame);drawFrame=requestAnimationFrame(function(){drawFrame=0;var canvas=el('[data-profile-crop]');if(canvas)drawCrop(canvas,'none')})}
function canvasBlob(canvas,type,quality){return new Promise(function(resolve){canvas.toBlob(resolve,type,quality)})}
async function boundedBlob(canvas){
  var types=['image/webp','image/jpeg'];
  for(var typeIndex=0;typeIndex<types.length;typeIndex+=1){
    for(var quality=.92;quality>=.5;quality-=.08){
      var blob=await canvasBlob(canvas,types[typeIndex],quality);
      if(blob&&blob.type===types[typeIndex]&&blob.size>0&&blob.size<=UPLOAD_MAX_BYTES)return blob
    }
  }
  throw new Error('AVATAR_NORMALIZED_TOO_LARGE')
}
function fileFromBlob(blob,style){var extension=blob.type==='image/webp'?'webp':'jpg';return new File([blob],'travelmate-'+style+'.'+extension,{type:blob.type,lastModified:Date.now()})}
async function prepareStyles(){
  clearResults();var base=el('[data-profile-crop]');drawCrop(base,'none');normalizedBlob=await boundedBlob(base);
  for(var index=0;index<STYLE_DEFINITIONS.length;index+=1){
    var definition=STYLE_DEFINITIONS[index],canvas=document.createElement('canvas');canvas.width=OUTPUT_SIZE;canvas.height=OUTPUT_SIZE;
    var context=canvas.getContext('2d');context.filter=definition.filter;context.drawImage(base,0,0);context.filter='none';
    var blob=await boundedBlob(canvas);styleResults.push({id:definition.id,label:definition.label,blob:blob,url:URL.createObjectURL(blob)});canvas.width=0;canvas.height=0
  }
}
function preferenceLabels(){return{
  pace:{relaxed:'רגוע',balanced:'מאוזן',active:'פעיל'},
  activityDensity:{light:'מעט פעילויות',balanced:'קצב מאוזן',dense:'יום מלא'},
  transport:{walking:'הליכה',transit:'תחבורה ציבורית',mixed:'משולב',car:'רכב'},
  tripStyle:{city:'עיר',culture:'תרבות',nature:'טבע',food:'אוכל',relaxation:'מנוחה',mixed:'משולב'},
  interests:{culture:'תרבות',food:'אוכל',nature:'טבע',history:'היסטוריה',shopping:'קניות',nightlife:'חיי לילה',photography:'צילום',relaxation:'מנוחה'}
}}
function preferenceField(key,title,current){
  var options=window.TravelMateUserProfile.preferenceOptions[key],labels=preferenceLabels()[key];
  return'<label class="profile-wizard-field"><span>'+title+'</span><select name="'+key+'"><option value="">לא צוין</option>'+options.map(function(value){return'<option value="'+value+'"'+(current===value?' selected':'')+'>'+labels[value]+'</option>'}).join('')+'</select></label>'
}
function preferencesMarkup(current){
  var options=window.TravelMateUserProfile.preferenceOptions,labels=preferenceLabels().interests;
  return'<div class="profile-wizard-preferences">'+preferenceField('pace','קצב טיול',current.pace)+preferenceField('activityDensity','צפיפות פעילויות',current.activityDensity)+preferenceField('transport','דרך התניידות',current.transport)+preferenceField('tripStyle','סגנון טיול',current.tripStyle)+'<fieldset class="profile-wizard-interests"><legend>תחומי עניין</legend><div>'+options.interests.map(function(value){return'<label><input type="checkbox" name="interests" value="'+value+'"'+(current.interests.indexOf(value)>=0?' checked':'')+'><span>'+labels[value]+'</span></label>'}).join('')+'</div></fieldset><label class="profile-wizard-learning"><input type="checkbox" name="learningEnabled"'+(current.learningEnabled?' checked':'')+'><span>לאפשר התאמה עתידית לפי בחירות שאבצע באפליקציה</span></label></div>'
}
function buildModal(){
  var wrapper=document.createElement('div');wrapper.className='profile-wizard-backdrop';wrapper.hidden=true;wrapper.innerHTML='<section class="profile-wizard" role="dialog" aria-modal="true" aria-labelledby="profile-wizard-title"><header><div><small data-profile-step-label>שלב 1 מתוך 3</small><h2 id="profile-wizard-title" tabindex="-1">עריכת הפרופיל</h2></div><button type="button" class="profile-wizard-close" data-profile-wizard-close aria-label="סגירת עריכת הפרופיל">×</button></header><ol class="profile-wizard-progress" aria-label="התקדמות"><li aria-current="step">תמונה</li><li>סגנון</li><li>העדפות</li></ol><form data-profile-wizard-form><section data-profile-step="1"><p class="profile-wizard-privacy">העיבוד והחיתוך מתבצעים במכשיר. רק התמונה המעובדת נשלחת; לאחר שמירה האווטר זמין באמצעות כתובת ציבורית.</p><div class="profile-crop-shell"><canvas width="512" height="512" data-profile-crop aria-label="תצוגה מקדימה של חיתוך התמונה"></canvas><div data-profile-empty>בחרו תמונה כדי להתחיל</div></div><div class="profile-source-actions"><label class="profile-source-button"><i class="fa-solid fa-camera" aria-hidden="true"></i><span>צילום תמונה</span><input type="file" data-profile-camera accept="image/jpeg,image/png,image/webp" capture="user"></label><label class="profile-source-button"><i class="fa-regular fa-images" aria-hidden="true"></i><span>בחירה מהגלריה</span><input type="file" data-profile-gallery accept="image/jpeg,image/png,image/webp"></label></div><div class="profile-crop-controls" hidden data-profile-crop-controls><label><span>זום</span><input type="range" min="1" max="3" step="0.01" value="1" data-profile-zoom></label><label><span>מיקום אופקי</span><input type="range" min="-100" max="100" step="1" value="0" data-profile-x></label><label><span>מיקום אנכי</span><input type="range" min="-100" max="100" step="1" value="0" data-profile-y></label></div></section><section data-profile-step="2" hidden><fieldset class="profile-style-fieldset"><legend>בחרו סגנון אחד</legend><div class="profile-style-grid" data-profile-styles></div></fieldset></section><section data-profile-step="3" hidden><div class="profile-final-avatar"><img data-profile-selected-preview alt="האווטר שנבחר"></div><div data-profile-preference-fields></div></section><p class="profile-wizard-status" data-profile-wizard-status role="status" aria-live="polite"></p><footer><button type="button" class="secondary" data-profile-back hidden>חזרה</button><button type="button" data-profile-next disabled>המשך</button><button type="submit" data-profile-save hidden>שמירת הפרופיל</button></footer></form></section>';
  wrapper.querySelector('#profile-wizard-title').setAttribute('tabindex','-1');
  wrapper.addEventListener('keydown',function(event){if(event.key==='Escape'||event.key==='Tab'){onKeydown(event);event.stopPropagation()}});
  document.body.appendChild(wrapper);return wrapper
}
function setStep(next){
  step=next;all('[data-profile-step]').forEach(function(section){section.hidden=Number(section.dataset.profileStep)!==step});
  all('.profile-wizard-progress li').forEach(function(item,index){if(index+1===step)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current')});
  el('[data-profile-step-label]').textContent='שלב '+step+' מתוך 3';el('[data-profile-back]').hidden=step===1;el('[data-profile-next]').hidden=step===3;el('[data-profile-save]').hidden=step!==3;
  if(step===1)el('[data-profile-next]').disabled=!decodedImage;else if(step===2)el('[data-profile-next]').disabled=false;
  setStatus('');var heading=el('#profile-wizard-title');if(heading)heading.focus({preventScroll:true})
}
function renderStyles(){
  el('[data-profile-styles]').innerHTML=styleResults.map(function(item,index){return'<label class="profile-style-card"><input type="radio" name="avatarStyle" value="'+item.id+'"'+(item.id===selectedStyle?' checked':'')+'><img src="'+item.url+'" alt=""><span>'+item.label+'</span></label>'}).join('');
  var chosen=styleResults.find(function(item){return item.id===selectedStyle})||styleResults[0];if(chosen)el('[data-profile-selected-preview]').src=chosen.url
}
function renderPreferences(){
  var profile=window.TravelMateUserProfile.fromUser(user);el('[data-profile-preference-fields]').innerHTML=preferencesMarkup(profile.preferences)
}
async function handleFile(file){
  if(!file)return;var generation=++sourceGeneration;setStatus('בודק ומעבד את התמונה…');el('[data-profile-next]').disabled=true;
  try{
    await validateSource(file);if(generation!==sourceGeneration)return;releaseImage();clearResults();var decoded=await decodeSource(file);if(generation!==sourceGeneration){if(decoded&&typeof decoded.close==='function')decoded.close();return}decodedImage=decoded;
    if(!imageWidth()||!imageHeight())throw new Error('SOURCE_DECODE');
    ['[data-profile-zoom]','[data-profile-x]','[data-profile-y]'].forEach(function(selector){el(selector).value=selector.indexOf('zoom')>=0?'1':'0'});
    el('[data-profile-empty]').hidden=true;el('[data-profile-crop-controls]').hidden=false;scheduleCropDraw();el('[data-profile-next]').disabled=false;setStatus('התמונה מוכנה. אפשר לכוון זום ומיקום לפני ההמשך.')
  }catch(error){if(generation!==sourceGeneration)return;releaseImage();clearResults();el('[data-profile-empty]').hidden=false;el('[data-profile-crop-controls]').hidden=true;var message=/SOURCE_SIZE/.test(String(error.message))?'אפשר לבחור תמונת JPG, PNG או WebP עד 20MB.':'לא הצלחנו לקרוא את התמונה. ודאו שזה קובץ JPG, PNG או WebP תקין.';setStatus(message,true)}
}
function collectPreferences(){
  var interests=all('input[name="interests"]:checked').map(function(input){return input.value});
  return window.TravelMateUserProfile.normalizePreferences({pace:el('[name="pace"]').value,activityDensity:el('[name="activityDensity"]').value,transport:el('[name="transport"]').value,tripStyle:el('[name="tripStyle"]').value,interests:interests,learningEnabled:el('[name="learningEnabled"]').checked})
}
function setMutationDisabled(disabled){all('button,input,select').forEach(function(control){if(!control.matches('[data-profile-wizard-close]'))control.disabled=disabled});el('[data-profile-save]').setAttribute('aria-busy',disabled?'true':'false')}
async function stillCurrentOwner(){var session=await window.TravelMateCloud.getSession();return session&&session.user&&String(session.user.id)===ownerId?session:null}
async function saveProfileSafely(event){
  event.preventDefault();
  if(busy)return;
  if(navigator.onLine===false){setStatus('כדי לשמור שינויים בפרופיל יש להתחבר לרשת. השינויים לא יישמרו בתור.',true);return}
  var chosen=styleResults.find(function(item){return item.id===selectedStyle});
  if(!chosen)return;
  busy=true;var avatarSaved=false;setMutationDisabled(true);setStatus('שומר את הפרופיל בחשבון…');
  try{
    var session=await stillCurrentOwner();if(!session)throw new Error('AUTH_CONTEXT_CHANGED');
    var metadata=user.user_metadata||{},displayName=String(metadata.display_name||'');
    var avatarResult=await window.TravelMateCloud.uploadAvatar(fileFromBlob(chosen.blob,chosen.id),{style:chosen.id,normalized:true});
    if(avatarResult.error)throw avatarResult.error;
    avatarSaved=true;
    session=await stillCurrentOwner();if(!session||!avatarResult.data||!avatarResult.data.user||String(avatarResult.data.user.id)!==ownerId)throw new Error('AUTH_CONTEXT_CHANGED');
    user=avatarResult.data.user;window.dispatchEvent(new CustomEvent('travelmate:profile-change',{detail:{user:user}}));
    var profileResult=await window.TravelMateCloud.updateProfileForOwner(ownerId,displayName,collectPreferences());
    if(profileResult&&profileResult.error)throw profileResult.error;
    user=profileResult.data&&profileResult.data.user||user;window.dispatchEvent(new CustomEvent('travelmate:profile-change',{detail:{user:user}}));setStatus('הפרופיל נשמר בהצלחה.');setTimeout(closeWizard,450)
  }catch(error){setStatus(avatarSaved?'התמונה נשמרה בחשבון המקורי. שמירת ההעדפות לא הושלמה בוודאות; התחברו שוב ובדקו.':errorMessage(error),true)}
  finally{busy=false;setMutationDisabled(false);updateOnlineState()}
}
async function openWizard(button){
  if(!modal)modal=buildModal();opener=button;setStatus('טוען את הפרופיל…');modal.hidden=false;previousBodyOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
  try{
    var session=await window.TravelMateCloud.getSession();if(!session||!session.user)throw new Error('AUTH_REQUIRED');ownerId=String(session.user.id);user=session.user;selectedStyle='natural';resetFiles();renderPreferences();setStep(1);updateOnlineState();el('.profile-wizard-close').focus()
  }catch(error){setStatus('יש להתחבר לחשבון כדי לערוך את הפרופיל.',true)}
}
function closeWizard(){if(!modal||modal.hidden||busy)return;modal.hidden=true;document.body.style.overflow=previousBodyOverflow;resetFiles();ownerId='';user=null;if(opener&&document.contains(opener))opener.focus();opener=null}
function updateOnlineState(){if(!modal||modal.hidden)return;var offline=navigator.onLine===false;el('[data-profile-save]').disabled=offline;if(offline)setStatus('כדי לשמור שינויים בפרופיל יש להתחבר לרשת. השינויים לא יישמרו בתור.',false)}
function focusable(){return all('button:not([disabled]):not([hidden]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])').filter(function(node){return!node.closest('[hidden]')})}
function onKeydown(event){
  if(!modal||modal.hidden)return;if(event.key==='Escape'){event.preventDefault();closeWizard();return}if(event.key!=='Tab')return;
  var items=focusable();if(!items.length)return;var first=items[0],last=items[items.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
}
window.TravelMateProfileWizard=Object.freeze({OUTPUT_SIZE:OUTPUT_SIZE,AVATAR_SIZE:OUTPUT_SIZE,SOURCE_MAX_BYTES:SOURCE_MAX_BYTES,UPLOAD_MAX_BYTES:UPLOAD_MAX_BYTES,STORED_MAX_BYTES:UPLOAD_MAX_BYTES,styles:STYLE_DEFINITIONS,sourceFileCheck:sourceFileCheck,validImageBytes:validImageBytes,boundedBlob:boundedBlob});
if(typeof document==='undefined')return;
document.addEventListener('click',function(event){
  var open=event.target.closest&&event.target.closest('[data-profile-wizard-open]');if(open){event.preventDefault();if(window.TravelMateCloud&&window.TravelMateUserProfile)openWizard(open);return}
  if(!modal||modal.hidden)return;if(event.target===modal||event.target.closest('[data-profile-wizard-close]')){event.preventDefault();closeWizard()}
});
document.addEventListener('change',function(event){
  if(!modal||modal.hidden)return;if(event.target.matches('[data-profile-camera],[data-profile-gallery]')){handleFile(event.target.files&&event.target.files[0]);return}
  if(event.target.name==='avatarStyle'){selectedStyle=event.target.value;var chosen=styleResults.find(function(item){return item.id===selectedStyle});if(chosen)el('[data-profile-selected-preview]').src=chosen.url}
});
document.addEventListener('input',function(event){if(modal&&!modal.hidden&&event.target.matches('[data-profile-zoom],[data-profile-x],[data-profile-y]'))scheduleCropDraw()});
document.addEventListener('keydown',onKeydown);
document.addEventListener('submit',function(event){if(modal&&!modal.hidden&&event.target.matches('[data-profile-wizard-form]'))saveProfileSafely(event)});
document.addEventListener('click',async function(event){
  if(!modal||modal.hidden)return;
  if(event.target.closest('[data-profile-back]')){setStep(Math.max(1,step-1));return}
  if(!event.target.closest('[data-profile-next]'))return;
  if(step===1){busy=true;el('[data-profile-next]').disabled=true;setStatus('מכין ארבעה סגנונות מקומיים…');try{await prepareStyles();renderStyles();setStep(2)}catch(error){setStatus(errorMessage(error),true);el('[data-profile-next]').disabled=false}finally{busy=false}}
  else if(step===2){renderPreferences();setStep(3)}
});
window.addEventListener('online',updateOnlineState);window.addEventListener('offline',updateOnlineState);
window.addEventListener('travelmate:home-auth',function(event){if(modal&&!modal.hidden&&!event.detail.authenticated)closeWizard()});

})();

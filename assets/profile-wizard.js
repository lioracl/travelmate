(function(){
'use strict';

var OUTPUT_SIZE=512;
var SOURCE_MAX_BYTES=20*1024*1024;
var UPLOAD_MAX_BYTES=2*1024*1024;
var STYLE_DEFINITIONS=Object.freeze([
  Object.freeze({id:'classic',label:'קלאסי'}),
  Object.freeze({id:'tokyo-neon',label:'טוקיו ניאון'}),
  Object.freeze({id:'japanese-calm',label:'רוגע יפני'}),
  Object.freeze({id:'beach-journey',label:'מסע חופים'}),
  Object.freeze({id:'manga-action',label:'מנגה אקשן'}),
  Object.freeze({id:'cinematic',label:'סינמטי'})
]);
var styleEpoch=0,generationActive=0,generationControllers=new Set();
var INTEREST_CARDS=Object.freeze([{id:'food',icon:'🍜'},{id:'nature',icon:'🌿'},{id:'beaches',icon:'🏖️'},{id:'culture',icon:'🎭'},{id:'history',icon:'🏛️'},{id:'museums',icon:'🖼️'},{id:'shopping',icon:'🛍️'},{id:'nightlife',icon:'🌙'},{id:'families',icon:'🧑‍🧑‍🧒'},{id:'hiking',icon:'🥾'},{id:'photography',icon:'📷'},{id:'technology',icon:'💡'},{id:'relaxation',icon:'☀️'}]);
var ACCEPTED_TYPES=Object.freeze(['image/jpeg','image/png','image/webp']);
var modal=null,opener=null,ownerId='',user=null,decodedImage=null;
var styleResults=[],selectedStyle='',step=1,busy=false,drawFrame=0,sourceGeneration=0;
var onboarding={photo:null,avatarStyle:'',interestTags:[]};
var previousBodyOverflow='',wizardGeneration=0,closeTimer=0,inertSiblings=[];
function currentWizard(generation){return modal&&!modal.hidden&&generation===wizardGeneration}
function staleWork(){return new Error('PROFILE_STALE_WORK')}

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
function releaseImage(){if(decodedImage&&typeof decodedImage.close==='function')decodedImage.close();if(decodedImage&&decodedImage.tagName==='CANVAS'){decodedImage.width=0;decodedImage.height=0}decodedImage=null}
function clearResults(){styleEpoch+=1;generationControllers.forEach(function(controller){controller.abort()});generationControllers.clear();selectedStyle='';onboarding.avatarStyle='';styleResults.forEach(function(item){if(!item.isPlaceholder)revoke(item.url)});styleResults=[];var grid=el('[data-profile-styles]');if(grid)grid.replaceChildren();var preview=el('[data-profile-selected-preview]');if(preview)preview.removeAttribute('src')}
function resetFiles(){sourceGeneration+=1;var existing=el('[data-profile-existing-photo]');if(existing){existing.onload=null;existing.onerror=null;existing.removeAttribute('src');existing.hidden=true}onboarding.photo=null;onboarding.avatarStyle='';if(drawFrame){cancelAnimationFrame(drawFrame);drawFrame=0}releaseImage();clearResults();all('input[type="file"]').forEach(function(input){input.value=''});var canvas=el('[data-profile-crop]');if(canvas){var context=canvas.getContext('2d');context.clearRect(0,0,canvas.width,canvas.height)}var preview=el('[data-profile-selected-preview]');if(preview)preview.removeAttribute('src');var empty=el('[data-profile-empty]'),controls=el('[data-profile-crop-controls]');if(empty)empty.hidden=false;if(controls)controls.hidden=true}
function signatureMatches(bytes,type){
  if(type==='image/jpeg')return bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  if(type==='image/png')return bytes.length>=8&&[137,80,78,71,13,10,26,10].every(function(value,index){return bytes[index]===value});
  if(type==='image/webp')return bytes.length>=12&&String.fromCharCode.apply(null,bytes.slice(0,4))==='RIFF'&&String.fromCharCode.apply(null,bytes.slice(8,12))==='WEBP';
  return false
}
function sourceFileCheck(file){
  if(!file||ACCEPTED_TYPES.indexOf(String(file.type||'').toLowerCase())<0)return{ok:false,error:'SOURCE_TYPE'};
  var extensions={'image/jpeg':/\.jpe?g$/i,'image/png':/\.png$/i,'image/webp':/\.webp$/i};
  if(!extensions[String(file.type).toLowerCase()].test(String(file.name||'')))return{ok:false,error:'SOURCE_TYPE'};
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
  image.onload=function(){done();if(!image.naturalWidth||!image.naturalHeight){reject(new Error('SOURCE_DECODE'));return}
    var ratio=Math.min(1,2048/Math.max(image.naturalWidth,image.naturalHeight));
    if(ratio<1){var canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);image.onload=null;image.onerror=null;image.src='';resolve(canvas)}else resolve(image)
  };
  image.onerror=function(){done();reject(new Error('SOURCE_DECODE'))};image.src=url
})}
async function sourceDimensions(file){
  var bytes=new Uint8Array(await file.slice(0,1024*1024).arrayBuffer()),view=new DataView(bytes.buffer),width=0,height=0,orientation=1;
  if(file.type==='image/png'&&bytes.length>=24){width=view.getUint32(16);height=view.getUint32(20)}
  else if(file.type==='image/webp'&&bytes.length>=30){
    var chunk=String.fromCharCode.apply(null,bytes.slice(12,16));
    if(chunk==='VP8X'){width=1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16);height=1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16)}
    else if(chunk==='VP8L'&&bytes[20]===47){width=1+bytes[21]+((bytes[22]&63)<<8);height=1+(bytes[22]>>6)+(bytes[23]<<2)+((bytes[24]&15)<<10)}
    else if(chunk==='VP8 '&&bytes[23]===157&&bytes[24]===1&&bytes[25]===42){width=view.getUint16(26,true)&16383;height=view.getUint16(28,true)&16383}
  }else if(file.type==='image/jpeg'){
    for(var offset=2;offset+4<bytes.length;){
      if(bytes[offset]!==255)break;var code=bytes[offset+1],length=view.getUint16(offset+2),end=offset+2+length;
      if(length<2||end>bytes.length)break;
      if([192,193,194,195,197,198,199,201,202,203,205,206,207].indexOf(code)>=0&&length>=7){height=view.getUint16(offset+5);width=view.getUint16(offset+7)}
      if(code===225&&length>=16&&String.fromCharCode.apply(null,bytes.slice(offset+4,offset+10))==='Exif\0\0'){
        var tiff=offset+10,little=view.getUint16(tiff)===18761,ifd=tiff+view.getUint32(tiff+4,little);
        if(ifd>=tiff&&ifd+2<=end){var count=view.getUint16(ifd,little);for(var entry=ifd+2;entry+12<=end&&count>0;entry+=12,count-=1){if(view.getUint16(entry,little)===274&&view.getUint16(entry+2,little)===3&&view.getUint32(entry+4,little)===1)orientation=view.getUint16(entry+8,little)}}
      }
      offset=end
    }
  }
  if(orientation>=5&&orientation<=8){var swap=width;width=height;height=swap}
  return{width:width,height:height}
}
async function decodeSource(file){
  if(typeof window.createImageBitmap==='function'){
    try{
      var dimensions=await sourceDimensions(file),options={imageOrientation:'from-image'};
      if(dimensions.width>0&&dimensions.height>0&&Math.max(dimensions.width,dimensions.height)>2048){var ratio=2048/Math.max(dimensions.width,dimensions.height);options.resizeWidth=Math.max(1,Math.round(dimensions.width*ratio));options.resizeHeight=Math.max(1,Math.round(dimensions.height*ratio));options.resizeQuality='high'}
      return await window.createImageBitmap(file,options)
    }catch(error){}
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
// Every selectable preview is a real generated image. No source-photo or static fallback.
async function avatarStylePreview(definition,photo,expectedOwner,signal){
  var blob=await window.TravelMateCloud.generateAvatarForOwner(expectedOwner,definition.id,photo,signal);
  if(signal.aborted)throw staleWork();
  if(!blob||blob.size>3*1024*1024||!await validImageBytes(blob))throw new Error('INVALID_GENERATED_IMAGE');
  var dimensions=await sourceDimensions(blob);
  if(!dimensions.width||!dimensions.height||Math.max(dimensions.width,dimensions.height)>4096)throw new Error('INVALID_GENERATED_IMAGE');
  var image=await decodeSource(blob),canvas=document.createElement('canvas');canvas.width=OUTPUT_SIZE;canvas.height=OUTPUT_SIZE;
  try{
    var width=image.width||image.naturalWidth,height=image.height||image.naturalHeight,scale=Math.max(OUTPUT_SIZE/width,OUTPUT_SIZE/height);
    canvas.getContext('2d').drawImage(image,(OUTPUT_SIZE-width*scale)/2,(OUTPUT_SIZE-height*scale)/2,width*scale,height*scale);
    var normalized=await boundedBlob(canvas);if(signal.aborted)throw staleWork();
    return{id:definition.id,label:definition.label,blob:normalized,url:URL.createObjectURL(normalized),isPlaceholder:false,status:'ready'};
  }finally{canvas.width=0;canvas.height=0;if(typeof image.close==='function')image.close();if(image.tagName==='CANVAS'){image.width=0;image.height=0}}
}
function selectedResult(){return styleResults.find(function(item){return item.id===selectedStyle&&item.status==='ready'&&item.isPlaceholder===false&&item.blob})||null}
function generationMessage(error){
  var value=String(error&&error.message||'');
  if(/OFFLINE/.test(value))return'יצירת אווטרים דורשת חיבור לרשת. התחברו ונסו שוב.';
  if(/LIMIT/.test(value))return'הגענו למגבלת יצירה. המתינו לפחות 30 שניות; אם המכסה היומית נוצלה, נסו מחר.';
  if(/AUTH/.test(value))return'יש להתחבר שוב לחשבון כדי ליצור אווטר.';
  if(/NOT_CONFIGURED/.test(value))return'שירות יצירת האווטרים עדיין אינו זמין. נסו שוב מאוחר יותר.';
  return'לא הצלחנו ליצור את האווטר. אפשר לנסות שוב.';
}
function generationCurrent(epoch,wizard,source,owner){return epoch===styleEpoch&&source===sourceGeneration&&currentWizard(wizard)&&owner===ownerId}
function pumpStyles(){
  if(!modal||modal.hidden||navigator.onLine===false||!onboarding.photo)return;
  while(generationActive<2){
    var item=styleResults.find(function(result){return result.status==='pending'});if(!item)break;
    item.status='loading';generationActive+=1;var controller=new AbortController();generationControllers.add(controller);renderStyles();
    generateStyle(item,controller,styleEpoch,wizardGeneration,sourceGeneration,ownerId,onboarding.photo);
  }
}
async function generateStyle(item,controller,epoch,wizard,source,owner,photo){
  try{
    var result=await avatarStylePreview(item,photo,owner,controller.signal);
    if(!generationCurrent(epoch,wizard,source,owner)||controller.signal.aborted){revoke(result.url);return}
    Object.assign(item,result);renderStyles();
  }catch(error){if(generationCurrent(epoch,wizard,source,owner)){item.status='failed';item.message=generationMessage(navigator.onLine===false?new Error('OFFLINE'):error);renderStyles()}}
  finally{generationActive-=1;generationControllers.delete(controller);pumpStyles()}
}
function retryStyles(id){
  if(busy||!ownerId||navigator.onLine===false){if(navigator.onLine===false)setStatus(generationMessage(new Error('OFFLINE')),true);return}
  styleResults.forEach(function(item){if(item.status==='failed'&&(!id||item.id===id)){item.status='pending';item.message=''}});renderStyles();pumpStyles();
}
async function prepareStyles(){
  if(styleResults.length){renderStyles();setStep(2);return}
  if(!decodedImage)throw new Error('SOURCE_DECODE');
  var generation=sourceGeneration,wizard=wizardGeneration,base=document.createElement('canvas');base.width=OUTPUT_SIZE;base.height=OUTPUT_SIZE;drawCrop(base,'none');
  try{
    var photo=await boundedBlob(base);
    if(generation!==sourceGeneration||!currentWizard(wizard))throw staleWork();
    onboarding.photo=photo;styleResults=STYLE_DEFINITIONS.map(function(item){return{id:item.id,label:item.label,blob:null,url:null,isPlaceholder:false,status:navigator.onLine===false?'failed':'pending',message:navigator.onLine===false?generationMessage(new Error('OFFLINE')):''}});
    renderStyles();setStep(2);pumpStyles();
  }finally{base.width=0;base.height=0}
}
function preferenceLabels(){return window.TravelMateUserProfile.preferenceLabels}
function preferenceField(key,title,current){
  var options=window.TravelMateUserProfile.preferenceOptions[key],labels=preferenceLabels()[key];
  return'<label class="profile-wizard-field"><span>'+title+'</span><select name="'+key+'"><option value="">לא צוין</option>'+options.map(function(value){return'<option value="'+value+'"'+(current===value?' selected':'')+'>'+labels[value]+'</option>'}).join('')+'</select></label>'
}
function preferencesMarkup(current){
  var labels=preferenceLabels().interests;
  var cards='<fieldset class="profile-wizard-interests"><legend class="sr-only">בחירת תחומי עניין</legend><div class="profile-interest-grid">'+INTEREST_CARDS.map(function(item){return'<label class="profile-interest-card"><input type="checkbox" name="interests" value="'+item.id+'"'+(current.interests.indexOf(item.id)>=0?' checked':'')+'><span><i aria-hidden="true">'+item.icon+'</i><strong>'+labels[item.id]+'</strong></span></label>'}).join('')+'</div></fieldset>';
  return cards+'<details class="profile-extra-details"><summary>פרטי פרופיל נוספים</summary><div class="profile-wizard-preferences">'+preferenceField('pace','קצב טיול',current.pace)+preferenceField('activityDensity','צפיפות פעילויות',current.activityDensity)+preferenceField('transport','דרך התניידות',current.transport)+preferenceField('tripStyle','סגנון טיול',current.tripStyle)+'<label class="profile-wizard-learning"><input type="checkbox" name="learningEnabled"'+(current.learningEnabled?' checked':'')+'><span><strong>הצטרפות להתאמה עתידית</strong><small>כבוי כברירת מחדל. הצעות נלמדות דורשות אישור; מסמכים, הערות פרטיות ו־GPS לא ישמשו ללמידה.</small></span></label></div></details>'
}
function buildModal(){
  var wrapper=document.createElement('div');wrapper.className='profile-wizard-backdrop';wrapper.hidden=true;wrapper.innerHTML='<section class="profile-wizard" role="dialog" aria-modal="true" aria-labelledby="profile-wizard-title"><header><div><small data-profile-step-label>שלב 1 מתוך 3</small><h2 id="profile-wizard-title" tabindex="-1">יצירת פרופיל אישי</h2></div><button type="button" class="profile-wizard-close" data-profile-wizard-close aria-label="סגירת יצירת הפרופיל">×</button></header><ol class="profile-wizard-progress" aria-label="התקדמות"><li aria-current="step"><span>1</span> הוספת תמונה</li><li><span>2</span> בחירת אווטר</li><li><span>3</span> תחומי עניין</li></ol><form data-profile-wizard-form><section data-profile-step="1"><h3>הוספת תמונה</h3><p class="profile-step-subtitle">אפשר להעלות תמונה מהגלריה או לצלם עכשיו</p><p class="profile-wizard-privacy">העיבוד והחיתוך מתבצעים במכשיר. ליצירת אווטרים התמונה החתוכה נשלחת לשירות AI; לאחר שמירה האווטר זמין באמצעות כתובת ציבורית.</p><div class="profile-crop-shell"><img data-profile-existing-photo hidden alt="תמונת הפרופיל הנוכחית"><canvas width="512" height="512" data-profile-crop aria-label="תצוגה מקדימה של חיתוך התמונה"></canvas><div data-profile-empty>בחרו תמונה מהגלריה או צלמו עכשיו</div></div><div class="profile-source-actions"><label class="profile-source-button"><i class="fa-regular fa-images" aria-hidden="true"></i><span>בחירה מהגלריה</span><input type="file" data-profile-gallery accept="image/jpeg,image/png,image/webp"></label><label class="profile-source-button"><i class="fa-solid fa-camera" aria-hidden="true"></i><span>צילום תמונה</span><input type="file" data-profile-camera accept="image/jpeg,image/png,image/webp" capture="user"></label></div><div class="profile-crop-controls" hidden data-profile-crop-controls><label><span>זום</span><input type="range" min="1" max="3" step="0.01" value="1" data-profile-zoom></label><label><span>מיקום אופקי</span><input type="range" min="-100" max="100" step="1" value="0" data-profile-x></label><label><span>מיקום אנכי</span><input type="range" min="-100" max="100" step="1" value="0" data-profile-y></label></div></section><section data-profile-step="2" hidden><h3>בחירת אווטר</h3><p class="profile-step-subtitle">בחר את הסגנון שהכי מתאים לך</p><p class="profile-wizard-privacy">התמונה החתוכה נשלחת לשירות AI ליצירת שישה אווטרים אישיים. רק האווטר שנבחר יישמר בסיום.</p><fieldset class="profile-style-fieldset"><legend class="sr-only">בחירת סגנון אווטר</legend><div class="profile-style-grid" data-profile-styles></div></fieldset><p data-profile-generation-summary role="status" aria-live="polite"></p><button type="button" data-profile-retry-all hidden>נסה שוב</button></section><section data-profile-step="3" hidden><h3>תחומי עניין</h3><p class="profile-step-subtitle">בחר את מה שמעניין אותך כדי שנוכל להתאים המלצות</p><div class="profile-final-avatar" hidden><img data-profile-selected-preview alt="האווטר שנבחר"><span data-profile-final-initials aria-hidden="true"></span></div><label class="profile-wizard-field profile-wizard-name" hidden><span>שם לתצוגה</span><input type="text" name="displayName" maxlength="80" autocomplete="nickname"></label><div data-profile-preference-fields></div></section><p class="profile-wizard-status" data-profile-wizard-status role="status" aria-live="polite"></p><footer><button type="button" class="secondary" data-profile-back hidden>חזרה</button><button type="button" data-profile-next disabled>המשך</button><button type="submit" data-profile-save hidden>סיום</button><p class="profile-finish-helper" data-profile-finish-helper hidden>אפשר לשנות אחר כך</p></footer></form></section>';
  wrapper.querySelector('#profile-wizard-title').setAttribute('tabindex','-1');
  wrapper.addEventListener('keydown',function(event){if(event.key==='Escape'||event.key==='Tab'){onKeydown(event);event.stopPropagation()}});
  document.body.appendChild(wrapper);return wrapper
}
function setStep(next){
  step=next;modal.dataset.profileScene=String(step);all('[data-profile-step]').forEach(function(section){section.hidden=Number(section.dataset.profileStep)!==step});
  all('.profile-wizard-progress li').forEach(function(item,index){if(index+1===step)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');item.dataset.complete=index+1<step?'true':'false'});
  el('[data-profile-step-label]').textContent='שלב '+step+' מתוך 3';el('[data-profile-back]').hidden=step===1;el('[data-profile-next]').hidden=step===3;el('[data-profile-save]').hidden=step!==3;el('[data-profile-finish-helper]').hidden=step!==3;
  if(step===1)el('[data-profile-next]').disabled=!decodedImage&&!onboarding.photo;else if(step===2)el('[data-profile-next]').disabled=!selectedResult();
  setStatus('');var heading=el('#profile-wizard-title');if(heading)heading.focus({preventScroll:true})
}
function renderStyles(){
  var grid=el('[data-profile-styles]');if(!grid)return;
  if(!grid.children.length)grid.innerHTML=styleResults.map(function(item){return'<div class="profile-style-card" data-style="'+item.id+'"></div>'}).join('');
  styleResults.forEach(function(item){
    var card=grid.querySelector('[data-style="'+item.id+'"]');if(!card)return;
    if(card.dataset.status!==item.status){
      card.dataset.status=item.status;card.setAttribute('aria-busy',item.status==='loading'?'true':'false');
      card.innerHTML='<label><input type="radio" name="avatarStyle" value="'+item.id+'"'+(item.status==='ready'&&!busy?'':' disabled')+'>'+ (item.status==='ready'?'<img alt="">':'<div class="profile-avatar-loading" aria-hidden="true">'+(item.status==='failed'?'!':'…')+'</div>')+'<span>'+item.label+'</span></label>'+(item.status==='failed'?'<p data-style-error></p><button type="button" data-profile-retry="'+item.id+'" aria-label="נסה שוב: '+item.label+'">נסה שוב</button>':'');
      if(item.status==='ready'){var image=card.querySelector('img');image.src=item.url;image.onerror=function(){if(styleResults.includes(item)&&item.status==='ready'){revoke(item.url);item.url=null;item.blob=null;item.status='failed';item.message='לא הצלחנו להציג את האווטר. נסו שוב.';if(selectedStyle===item.id){selectedStyle='';onboarding.avatarStyle=''}renderStyles()}}}
      if(item.status==='failed')card.querySelector('[data-style-error]').textContent=item.message||generationMessage();
    }
    card.querySelector('input').checked=item.id===selectedStyle;card.querySelector('input').disabled=busy||item.status!=='ready';var retry=card.querySelector('[data-profile-retry]');if(retry)retry.disabled=busy||navigator.onLine===false;
  });
  var chosen=selectedResult(),preview=el('[data-profile-selected-preview]');el('.profile-final-avatar').hidden=!chosen;
  el('[data-profile-final-initials]').hidden=true;if(chosen)preview.src=chosen.url;else preview.removeAttribute('src');
  if(step===2)el('[data-profile-next]').disabled=!chosen;
  var ready=styleResults.filter(function(item){return item.status==='ready'}).length,failed=styleResults.filter(function(item){return item.status==='failed'}).length;
  el('[data-profile-generation-summary]').textContent=navigator.onLine===false?generationMessage(new Error('OFFLINE')):failed===6?'יצירת כל האווטרים נכשלה. נסו שוב כשיש חיבור לרשת.':ready+' מתוך 6 אווטרים מוכנים. אפשר לבחור אווטר מוכן ולהמשיך.';
  el('[data-profile-retry-all]').hidden=failed!==6;el('[data-profile-retry-all]').disabled=navigator.onLine===false;
}
function renderPreferences(){
  var profile=window.TravelMateUserProfile.fromUser(user),preferences=Object.assign({},profile.preferences);
  el('[name="displayName"]').value=profile.name;el('[data-profile-preference-fields]').innerHTML=preferencesMarkup(preferences);var details=el('.profile-extra-details');details.insertBefore(el('[name="displayName"]').closest('label'),details.querySelector('.profile-wizard-preferences'));el('[name="displayName"]').closest('label').hidden=false;onboarding.interestTags=preferences.interests.slice()
}
function showExistingPhoto(generation){
  var profile=window.TravelMateUserProfile.fromUser(user);if(!profile.avatarUrl)return;
  var image=el('[data-profile-existing-photo]'),source=sourceGeneration;
  image.crossOrigin='anonymous';image.onload=function(){if(!currentWizard(generation)||source!==sourceGeneration)return;decodedImage=image;onboarding.photo={url:profile.avatarUrl,existing:true};image.hidden=false;el('[data-profile-empty]').hidden=true;el('[data-profile-next]').disabled=false};
  image.onerror=function(){if(currentWizard(generation)&&source===sourceGeneration){image.hidden=true;image.removeAttribute('src');onboarding.photo=null;el('[data-profile-next]').disabled=true}};image.src=profile.avatarUrl
}
async function handleFile(file){
  if(!file||busy)return;var generation=++sourceGeneration;clearResults();onboarding.photo=null;setStatus('בודק ומעבד את התמונה…');el('[data-profile-next]').disabled=true;
  try{
    await validateSource(file);if(generation!==sourceGeneration)return;releaseImage();clearResults();var decoded=await decodeSource(file);if(generation!==sourceGeneration){if(decoded&&typeof decoded.close==='function')decoded.close();return}decodedImage=decoded;
    if(!imageWidth()||!imageHeight())throw new Error('SOURCE_DECODE');selectedStyle='';onboarding.avatarStyle='';onboarding.photo=null;
    ['[data-profile-zoom]','[data-profile-x]','[data-profile-y]'].forEach(function(selector){el(selector).value=selector.indexOf('zoom')>=0?'1':'0'});
    el('[data-profile-existing-photo]').hidden=true;el('[data-profile-empty]').hidden=true;el('[data-profile-crop-controls]').hidden=false;scheduleCropDraw();el('[data-profile-next]').disabled=false;setStatus('התמונה מוכנה. אפשר לכוון זום ומיקום לפני ההמשך.')
  }catch(error){if(generation!==sourceGeneration)return;releaseImage();clearResults();el('[data-profile-crop]').getContext('2d').clearRect(0,0,OUTPUT_SIZE,OUTPUT_SIZE);el('[data-profile-empty]').hidden=false;el('[data-profile-crop-controls]').hidden=true;el('[data-profile-next]').disabled=true;var message=/SOURCE_SIZE/.test(String(error.message))?'אפשר לבחור תמונת JPG, PNG או WebP עד 20MB.':'לא הצלחנו לקרוא את התמונה. ודאו שזה קובץ JPG, PNG או WebP תקין.';setStatus(message,true)}
}
function collectPreferences(){
  var interests=all('input[name="interests"]:checked').map(function(input){return input.value});onboarding.interestTags=interests.slice();
  return window.TravelMateUserProfile.normalizePreferences({pace:el('[name="pace"]').value,activityDensity:el('[name="activityDensity"]').value,transport:el('[name="transport"]').value,tripStyle:el('[name="tripStyle"]').value,interests:interests,learningEnabled:el('[name="learningEnabled"]').checked})
}
function setMutationDisabled(disabled){all('button,input,select').forEach(function(control){control.disabled=disabled});el('[data-profile-save]').setAttribute('aria-busy',disabled?'true':'false');if(!disabled){el('[data-profile-next]').disabled=step===1?(!decodedImage&&!onboarding.photo):!selectedResult();all('[name="avatarStyle"]').forEach(function(input){input.disabled=!styleResults.some(function(item){return item.id===input.value&&item.status==='ready'})});updateOnlineState()}}
async function stillCurrentOwner(expectedOwner){var session=await window.TravelMateCloud.getSession();return session&&session.user&&String(session.user.id)===expectedOwner?session:null}
async function saveProfileSafely(event){
  event.preventDefault();
  if(busy)return;
  if(navigator.onLine===false){setStatus('כדי לשמור שינויים בפרופיל יש להתחבר לרשת. השינויים לא יישמרו בתור.',true);return}
  var chosen=selectedResult();if(step!==3||!chosen||!onboarding.photo)return;
  var generation=wizardGeneration,saveOwner=ownerId,displayName=el('[name="displayName"]').value,preferences=collectPreferences();
  busy=true;var avatarSaved=false;setMutationDisabled(true);setStatus('שומר את הפרופיל בחשבון…');
  try{
    var session=await stillCurrentOwner(saveOwner);if(!currentWizard(generation)||!session)throw new Error('AUTH_CONTEXT_CHANGED');
    if(chosen&&chosen.blob&&chosen.isPlaceholder===false){
      var avatarResult=await window.TravelMateCloud.uploadAvatar(fileFromBlob(chosen.blob,chosen.id),{style:chosen.id,normalized:true,ownerId:saveOwner});
      if(avatarResult.error)throw avatarResult.error;
      avatarSaved=true;
      session=await stillCurrentOwner(saveOwner);if(!currentWizard(generation)||!session||!avatarResult.data||!avatarResult.data.user||String(avatarResult.data.user.id)!==saveOwner)throw new Error('AUTH_CONTEXT_CHANGED');
      user=avatarResult.data.user;window.dispatchEvent(new CustomEvent('travelmate:profile-change',{detail:{user:user}}));
    }
    var profileResult=await window.TravelMateCloud.updateProfileForOwner(saveOwner,displayName,preferences,{avatarStyle:onboarding.avatarStyle});
    if(profileResult&&profileResult.error)throw profileResult.error;
    session=await stillCurrentOwner(saveOwner);if(!currentWizard(generation)||!session)throw new Error('AUTH_CONTEXT_CHANGED');
    user=profileResult.data&&profileResult.data.user||user;window.dispatchEvent(new CustomEvent('travelmate:profile-change',{detail:{user:user}}));setStatus('הפרופיל נשמר בהצלחה.');closeTimer=setTimeout(function(){if(currentWizard(generation))closeWizard()},450)
  }catch(error){if(currentWizard(generation))setStatus(avatarSaved?'התמונה נשמרה בחשבון המקורי. שמירת ההעדפות לא הושלמה בוודאות; התחברו שוב ובדקו.':errorMessage(error),true)}
  finally{if(currentWizard(generation)){busy=false;setMutationDisabled(false)}}
}
async function openWizard(button){
  if(modal&&!modal.hidden)return;
  if(!modal)modal=buildModal();var generation=++wizardGeneration;opener=button;ownerId='';user=null;busy=true;resetFiles();onboarding={photo:null,avatarStyle:'',interestTags:[]};setMutationDisabled(true);setStatus('טוען את הפרופיל…');modal.hidden=false;var nameField=el('[name="displayName"]').closest('label');nameField.hidden=true;el('[data-profile-step="3"]').insertBefore(nameField,el('[data-profile-preference-fields]'));el('[name="displayName"]').value='';el('[data-profile-preference-fields]').replaceChildren();setStep(1);setStatus('טוען את הפרופיל…');
  inertSiblings=Array.prototype.slice.call(document.body.children).filter(function(node){return node!==modal}).map(function(node){var state={node:node,inert:node.inert};node.inert=true;return state});
  previousBodyOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
  el('[data-profile-wizard-close]').disabled=false;el('[data-profile-wizard-close]').focus();
  try{
    var session=await window.TravelMateCloud.getSession();if(!currentWizard(generation))return;if(!session||!session.user)throw new Error('AUTH_REQUIRED');ownerId=String(session.user.id);user=session.user;selectedStyle='';renderPreferences();setStep(1);showExistingPhoto(generation)
  }catch(error){if(currentWizard(generation))setStatus('יש להתחבר לחשבון כדי לערוך את הפרופיל.',true)}
  finally{if(currentWizard(generation)){busy=false;if(user)setMutationDisabled(false)}}
}
function closeWizard(force){if(!modal||modal.hidden||(busy&&force!==true&&ownerId))return;wizardGeneration+=1;if(closeTimer){clearTimeout(closeTimer);closeTimer=0}busy=false;modal.hidden=true;document.body.style.overflow=previousBodyOverflow;inertSiblings.forEach(function(state){state.node.inert=state.inert});inertSiblings=[];resetFiles();onboarding.interestTags=[];var nameField=el('[name="displayName"]').closest('label');nameField.hidden=true;el('[data-profile-step="3"]').insertBefore(nameField,el('[data-profile-preference-fields]'));el('[name="displayName"]').value='';el('[data-profile-preference-fields]').replaceChildren();ownerId='';user=null;if(opener&&document.contains(opener))opener.focus();opener=null}
function updateOnlineState(){if(!modal||modal.hidden)return;var offline=navigator.onLine===false;el('[data-profile-save]').disabled=busy||offline||!ownerId;if(offline){generationControllers.forEach(function(controller){controller.abort()});styleResults.forEach(function(item){if(item.status==='pending'){item.status='failed';item.message=generationMessage(new Error('OFFLINE'))}});if(styleResults.length)renderStyles();setStatus(step===2?generationMessage(new Error('OFFLINE')):'כדי לשמור שינויים בפרופיל יש להתחבר לרשת. השינויים לא יישמרו בתור.',false)}else if(styleResults.length)renderStyles()}
function focusable(){return all('button:not([disabled]):not([hidden]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])').filter(function(node){return!node.closest('[hidden]')&&node.getClientRects().length>0})}
function onKeydown(event){
  if(!modal||modal.hidden)return;if(event.key==='Escape'){event.preventDefault();closeWizard();return}if(event.key!=='Tab')return;
  var items=focusable();if(!items.length)return;var first=items[0],last=items[items.length-1];if(items.indexOf(document.activeElement)<0){event.preventDefault();(event.shiftKey?last:first).focus();return}if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
}
window.TravelMateProfileWizard=Object.freeze({OUTPUT_SIZE:OUTPUT_SIZE,AVATAR_SIZE:OUTPUT_SIZE,SOURCE_MAX_BYTES:SOURCE_MAX_BYTES,UPLOAD_MAX_BYTES:UPLOAD_MAX_BYTES,STORED_MAX_BYTES:UPLOAD_MAX_BYTES,styles:STYLE_DEFINITIONS,sourceFileCheck:sourceFileCheck,validImageBytes:validImageBytes,boundedBlob:boundedBlob});
if(typeof document==='undefined')return;
document.addEventListener('click',function(event){
  var open=event.target.closest&&event.target.closest('[data-profile-wizard-open]');if(open){event.preventDefault();if(window.TravelMateCloud&&window.TravelMateUserProfile)openWizard(open);return}
  if(!modal||modal.hidden)return;if(event.target===modal||event.target.closest('[data-profile-wizard-close]')){event.preventDefault();closeWizard()}
});
document.addEventListener('change',function(event){
  if(!modal||modal.hidden)return;if(event.target.matches('[data-profile-camera],[data-profile-gallery]')){handleFile(event.target.files&&event.target.files[0]);return}
  if(event.target.name==='interests')onboarding.interestTags=all('input[name="interests"]:checked').map(function(input){return input.value});
  if(event.target.name==='avatarStyle'){if(!styleResults.some(function(item){return item.id===event.target.value&&item.status==='ready'&&item.blob&&!item.isPlaceholder}))return;selectedStyle=event.target.value;onboarding.avatarStyle=selectedStyle;el('[data-profile-next]').disabled=false;var chosen=styleResults.find(function(item){return item.id===selectedStyle});if(chosen)el('[data-profile-selected-preview]').src=chosen.url;el('.profile-final-avatar').hidden=false}
});
document.addEventListener('input',function(event){if(modal&&!modal.hidden&&!busy&&event.target.matches('[data-profile-zoom],[data-profile-x],[data-profile-y]')){sourceGeneration+=1;clearResults();onboarding.photo=null;scheduleCropDraw()}});
document.addEventListener('keydown',onKeydown);
document.addEventListener('submit',function(event){if(modal&&!modal.hidden&&event.target.matches('[data-profile-wizard-form]'))saveProfileSafely(event)});
document.addEventListener('click',async function(event){
  if(!modal||modal.hidden||busy||!ownerId)return;
  var retry=event.target.closest('[data-profile-retry]');if(retry){retryStyles(retry.dataset.profileRetry);return}if(event.target.closest('[data-profile-retry-all]')){retryStyles();return}
  if(event.target.closest('[data-profile-back]')){setStep(Math.max(1,step-1));return}
  if(!event.target.closest('[data-profile-next]'))return;
  if(step===1){if(!decodedImage&&!onboarding.photo)return;var generation=wizardGeneration;busy=true;setMutationDisabled(true);setStatus('מכין את התמונה ואת אפשרויות האווטר…');try{await prepareStyles();if(currentWizard(generation)){renderStyles();setStep(2)}}catch(error){if(currentWizard(generation))setStatus(errorMessage(error),true)}finally{if(currentWizard(generation)){busy=false;setMutationDisabled(false)}}}
  else if(step===2&&selectedResult()){setStep(3)}
});
window.addEventListener('online',updateOnlineState);window.addEventListener('offline',updateOnlineState);
window.addEventListener('travelmate:home-auth',async function(event){
  if(!modal||modal.hidden)return;var generation=wizardGeneration;
  if(!event.detail||!event.detail.authenticated){closeWizard(true);return}
  try{var session=await stillCurrentOwner(ownerId);if(currentWizard(generation)&&!session)closeWizard(true)}catch(error){if(currentWizard(generation))closeWizard(true)}
});

})();

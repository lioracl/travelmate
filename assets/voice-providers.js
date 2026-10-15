(function(root,factory){'use strict';var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TravelMateVoiceProviders=api;})(typeof window==='undefined'?null:window,function(){
 'use strict';
 function web(win){return {name:'web-speech',native:false,synth:win.speechSynthesis,Recognition:win.SpeechRecognition||win.webkitSpeechRecognition,Utterance:win.SpeechSynthesisUtterance,prepare:function(){return Promise.resolve();},ready:function(){return true;},capabilities:function(){return {provider:'web-speech',canSpeak:Boolean(win.speechSynthesis&&win.SpeechSynthesisUtterance),canRecognize:Boolean(win.SpeechRecognition||win.webkitSpeechRecognition),canStop:Boolean(win.speechSynthesis),canPause:Boolean(win.speechSynthesis&&win.speechSynthesis.pause&&win.speechSynthesis.resume),requestedLanguage:'he-IL',currentLanguage:'',ttsNetwork:'device-reported-local-only',sttNetwork:'provider-dependent'};}};}
 function android(win,plugin){
  var nonce=Date.now().toString(36)+Math.random().toString(36).slice(2,12);
  var sequence=0,activeSpeech=null,activeRecognition=null,handles=[],registration=null,epoch=0,prepared=false,preparation=null;
  var lifecycle=[],voiceListeners=[],caps={provider:'android-native',canSpeak:Boolean(plugin),canRecognize:Boolean(plugin),canStop:true,canPause:false,voices:[],requestedLanguage:'he-IL',currentLanguage:'',ttsNetwork:'device-reported-local-only',sttNetwork:'provider-dependent'};
  function invoke(name,args){try{return Promise.resolve(plugin[name](args||{}));}catch(error){return Promise.reject(error);}}
  function ignore(promise){promise.catch(function(){});}
  function id(){return 'voice-'+nonce+'-'+(++sequence);}
  function event(value){
   var speech=activeSpeech,recognition=activeRecognition;
   if(speech&&speech.id===value.sessionId){var utterance=speech.value;
    if(value.type==='tts-start'){caps.currentLanguage=value.value||caps.currentLanguage;if(utterance.onstart)utterance.onstart({language:caps.currentLanguage});}
    if(value.type==='tts-end'){activeSpeech=null;synth.speaking=false;if(utterance.onend)utterance.onend();}
    if(value.type==='tts-error'){activeSpeech=null;synth.speaking=false;if(utterance.onerror)utterance.onerror({error:value.value});}
   }
   if(recognition&&recognition.session===value.sessionId){
    caps.recognitionSignal=value.type;
    if(value.type==='stt-start'&&recognition.onstart)recognition.onstart();
    if((value.type==='stt-speech-end'||value.type==='stt-finalizing')&&recognition.onspeechend)recognition.onspeechend();
    if(value.type==='stt-result'&&recognition.onresult)recognition.onresult({results:[[{transcript:value.value}]]});
    if(value.type==='stt-end'){activeRecognition=null;if(recognition.onend)recognition.onend();}
    if(value.type==='stt-error'){activeRecognition=null;if(recognition.onerror)recognition.onerror({error:value.value});}
   }
  }
  function listeners(){
   if(!plugin)return Promise.resolve();if(registration)return registration;var token=epoch;
   // Capacitor's addListener takes positional arguments; register once per document lifetime.
   registration=Promise.all([['voiceEvent',event],['voiceLifecycle',function(){dispose();lifecycle.forEach(function(listener){listener();});}]].map(function(pair){return Promise.resolve().then(function(){return plugin.addListener(pair[0],pair[1]);}).then(function(handle){if(token!==epoch){if(handle&&handle.remove)ignore(Promise.resolve(handle.remove()));}else handles.push(handle);});}));
   return registration;
  }
  function prepare(){
   if(prepared)return Promise.resolve(caps);if(preparation)return preparation;
   if(!plugin){prepared=true;caps.canSpeak=false;caps.canRecognize=false;caps.error='native-plugin-unavailable';return Promise.resolve(caps);}
   var token=epoch;
   preparation=listeners().then(function(){if(token!==epoch)throw new Error('cancelled');return invoke('getCapabilities');}).then(function(value){if(token!==epoch)return caps;caps=Object.assign({},caps,value,{provider:'android-native',canPause:false});prepared=true;voiceListeners.forEach(function(listener){listener();});return caps;}).finally(function(){preparation=null;});return preparation;
  }
  var synth={speaking:false,pending:false,paused:false,getVoices:function(){return caps.voices||[];},addEventListener:function(name,listener){if(name==='voiceschanged')voiceListeners.push(listener);},
   speak:function(utterance){var request={id:id(),value:utterance};activeSpeech=request;synth.speaking=true;
    listeners().then(function(){if(activeSpeech!==request)return;return invoke('speak',{sessionId:request.id,text:utterance.text,voiceURI:utterance.voice&&utterance.voice.voiceURI||'',rate:utterance.rate,pitch:utterance.pitch,volume:utterance.volume}).then(function(result){if(activeSpeech===request&&result){caps.currentLanguage=result.currentLanguage||'';caps.effectiveVoiceURI=result.voiceURI||'';caps.requestedVoiceURI=result.requestedVoiceURI||'';caps.voiceFallback=result.fallback===true;caps.rateAccepted=result.rateAccepted;caps.pitchAccepted=result.pitchAccepted;caps.rate=result.rate;caps.pitch=result.pitch;if(utterance.onstart)utterance.onstart({language:caps.currentLanguage,fallback:caps.voiceFallback});}});}).catch(function(error){if(activeSpeech===request)event({sessionId:request.id,type:'tts-error',value:error.code||'synthesis-failed'});});
   },cancel:function(){var request=activeSpeech;activeSpeech=null;synth.speaking=false;if(plugin&&request)ignore(invoke('cancel',{sessionId:request.id}));}
  };
  function Recognition(){this.session='';}
  Recognition.prototype.start=function(){var recognition=this;recognition.session=id();activeRecognition=recognition;
   listeners().then(function(){if(activeRecognition!==recognition)return;return invoke('startListening',{sessionId:recognition.session,language:'he-IL'});}).catch(function(error){if(activeRecognition===recognition)event({sessionId:recognition.session,type:'stt-error',value:error.code||'service-not-allowed'});});
  };
  Recognition.prototype.stop=function(){if(activeRecognition===this)ignore(invoke('stopListening',{sessionId:this.session}));};
  Recognition.prototype.abort=function(){if(activeRecognition===this)activeRecognition=null;if(plugin&&this.session)ignore(invoke('cancel',{sessionId:this.session}));};
  function dispose(){epoch++;prepared=false;preparation=null;registration=null;synth.cancel();if(activeRecognition)activeRecognition.abort();handles.splice(0).forEach(function(handle){if(handle&&handle.remove)ignore(Promise.resolve(handle.remove()));});}
  return {name:'android-native',native:true,synth:synth,Recognition:plugin?Recognition:null,Utterance:function(text){this.text=text;},prepare:prepare,ready:function(){return prepared;},capabilities:function(){return caps;},onLifecycle:function(listener){lifecycle.push(listener);},dispose:dispose};
 }
 function create(win){var cap=win.Capacitor;if(!cap||!cap.isNativePlatform||!cap.isNativePlatform()||!cap.getPlatform||cap.getPlatform()!=='android')return web(win);var plugin=null;
  try{if(!cap.isPluginAvailable||cap.isPluginAvailable('TravelMateVoice'))plugin=cap.Plugins&&cap.Plugins.TravelMateVoice||cap.registerPlugin('TravelMateVoice');}catch(error){}
  return android(win,plugin);
 }
 return Object.freeze({create:create});
});

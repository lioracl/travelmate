package com.travelmate.app;

import android.Manifest;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Device speech only. No recorder, files, service, HTTP client or transcript persistence. */
@CapacitorPlugin(name = "TravelMateVoice", permissions = {
    @Permission(alias = "microphone", strings = {Manifest.permission.RECORD_AUDIO})
})
public class TravelMateVoicePlugin extends Plugin {
    private TextToSpeech tts;
    private SpeechRecognizer recognizer;
    private boolean ready, initializing, foreground = true;
    private int engineEpoch;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable initializationTimeout;
    private String speaking = "", listening = "", speakingLanguage = "";
    private PluginCall permissionCall;
    private final List<PluginCall> waiting = new ArrayList<>();
    private final Locale hebrew = Locale.forLanguageTag("he-IL");

    private void main(Runnable work) { getActivity().runOnUiThread(work); }
    private void emit(String session, String type, String value) {
        JSObject event = new JSObject(); event.put("sessionId", session); event.put("type", type);
        if (value != null) event.put("value", value);
        notifyListeners("voiceEvent", event);
    }
    private List<Voice> usableVoices() {
        List<Voice> result = new ArrayList<>();
        if (!ready || tts == null) return result;
        Set<Voice> voices = tts.getVoices();
        if (voices != null) for (Voice voice : voices) {
            // Network voices and unavailable voice data cannot silently become cloud speech.
            if (!voice.isNetworkConnectionRequired() && !voice.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)) result.add(voice);
        }
        result.sort((a,b) -> a.getName().compareTo(b.getName()));
        return result;
    }
    private JSObject capabilities(String error) {
        JSObject result = new JSObject(); JSArray voices = new JSArray();
        for (Voice voice : usableVoices()) {
            JSObject item = new JSObject(); item.put("voiceURI", voice.getName()); item.put("name", voice.getName());
            item.put("lang", voice.getLocale().toLanguageTag()); item.put("localService", true);
            item.put("networkRequired", voice.isNetworkConnectionRequired()); voices.put(item);
        }
        result.put("provider", "android-native"); result.put("canSpeak", voices.length() > 0);
        result.put("canRecognize", SpeechRecognizer.isRecognitionAvailable(getContext()));
        result.put("canStop", true); result.put("canPause", false); result.put("voices", voices);
        result.put("requestedLanguage", "he-IL");
        result.put("currentLanguage", ready && tts.getVoice() != null ? tts.getVoice().getLocale().toLanguageTag() : "");
        result.put("ttsNetwork", "device-reported-local-only"); result.put("sttNetwork", "provider-dependent");
        result.put("error", error == null ? "" : error); return result;
    }
    private void finishInitialization(String error) {
        if(initializationTimeout!=null){handler.removeCallbacks(initializationTimeout);initializationTimeout=null;}
        List<PluginCall> calls = new ArrayList<>(waiting); waiting.clear();
        for (PluginCall call : calls) call.resolve(capabilities(error));
    }
    @PluginMethod public void getCapabilities(PluginCall call) { main(() -> {
        if (!foreground) { call.resolve(capabilities("background")); return; }
        if (ready) { call.resolve(capabilities(null)); return; }
        waiting.add(call); if (initializing) return;
        initializing = true; int epoch = ++engineEpoch;
        initializationTimeout=()->{if(epoch!=engineEpoch||!initializing)return;engineEpoch++;initializing=false;ready=false;if(tts!=null){tts.shutdown();tts=null;}finishInitialization("engine-timeout");};
        handler.postDelayed(initializationTimeout,10000);
        try {
            tts = new TextToSpeech(getContext(), status -> main(() -> {
                if (epoch != engineEpoch) return;
                initializing = false; ready = status == TextToSpeech.SUCCESS && tts != null;
                if (ready) {
                    tts.setLanguage(hebrew);
                    tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                        @Override public void onStart(String id) { main(() -> { if (id.equals(speaking)) emit(id,"tts-start",speakingLanguage); }); }
                        @Override public void onStop(String id,boolean interrupted) { main(() -> { if(id.equals(speaking)){speaking="";emit(id,"tts-error","interrupted");} }); }
                        @Override public void onDone(String id) { main(() -> { if (id.equals(speaking)) { speaking="";emit(id,"tts-end",null); } }); }
                        @Override public void onError(String id) { onError(id, TextToSpeech.ERROR); }
                        @Override public void onError(String id,int error) { main(() -> { if (id.equals(speaking)) { speaking="";emit(id,"tts-error","synthesis-failed"); } }); }
                    });
                } else if (tts != null) { tts.shutdown(); tts = null; }
                finishInitialization(ready ? null : "engine-unavailable");
            }));
        } catch (RuntimeException error) { initializing=false;ready=false;if(tts!=null)tts.shutdown();tts=null;finishInitialization("engine-unavailable"); }
    }); }
    @PluginMethod public void speak(PluginCall call) { main(() -> {
        String session=call.getString("sessionId",""), text=call.getString("text","");
        if (!foreground || !ready || tts == null) { call.reject("TTS engine is not ready","engine-unavailable");return; }
        if (!VoicePolicy.validSession(session) || text.isEmpty() || text.length()>4000) { call.reject("Invalid speech request","invalid-request");return; }
        stopRecognition("aborted");stopSpeech();
        List<Voice> voices=usableVoices(),ordered=new ArrayList<>();String requested=call.getString("voiceURI","");
        for(Voice voice:voices)if(voice.getName().equals(requested))ordered.add(voice);
        for(Voice voice:voices)if(("he".equals(voice.getLocale().getLanguage())||"iw".equals(voice.getLocale().getLanguage()))&&!ordered.contains(voice))ordered.add(voice);
        for(Voice voice:voices)if(!ordered.contains(voice))ordered.add(voice);
        Voice selected=VoicePolicy.firstUsable(ordered,voice->tts.setVoice(voice)==TextToSpeech.SUCCESS);
        if(selected==null){call.reject("No usable local device voice","voice-unavailable");return;}
        tts.setSpeechRate(VoicePolicy.delivery(call.getDouble("rate",1.0),0.8f,1.2f));
        tts.setPitch(VoicePolicy.delivery(call.getDouble("pitch",1.0),0.8f,1.2f));
        Bundle parameters=new Bundle();parameters.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME,VoicePolicy.delivery(call.getDouble("volume",1.0),0f,1f));
        speakingLanguage=selected.getLocale().toLanguageTag();speaking=session;
        if(tts.speak(text,TextToSpeech.QUEUE_FLUSH,parameters,session)!=TextToSpeech.SUCCESS){speaking="";call.reject("Device synthesis failed","synthesis-failed");return;}
        JSObject result=new JSObject();result.put("currentLanguage",selected.getLocale().toLanguageTag());result.put("voiceURI",selected.getName());call.resolve(result);
    }); }
    @PluginMethod public void startListening(PluginCall call) { main(() -> {
        String session=call.getString("sessionId","");
        if(!foreground||!VoicePolicy.validSession(session)){call.reject("Recognition unavailable","aborted");return;}
        stopRecognition("aborted");stopSpeech();
        if(!SpeechRecognizer.isRecognitionAvailable(getContext())){call.reject("No recognition provider","service-not-allowed");return;}
        listening=session;
        if(getPermissionState("microphone")!=PermissionState.GRANTED){permissionCall=call;requestPermissionForAlias("microphone",call,"microphoneResult");return;}
        beginRecognition(call);
    }); }
    @PermissionCallback private void microphoneResult(PluginCall call) { main(() -> {
        if(permissionCall!=call)return;permissionCall=null;
        if(!foreground||!listening.equals(call.getString("sessionId",""))){call.reject("Recognition cancelled","aborted");return;}
        if(getPermissionState("microphone")!=PermissionState.GRANTED){listening="";call.reject("Microphone permission denied","not-allowed");return;}
        beginRecognition(call);
    }); }
    private void beginRecognition(PluginCall call) {
        final String session=listening;
        try {
            recognizer=SpeechRecognizer.createSpeechRecognizer(getContext());
            recognizer.setRecognitionListener(new RecognitionListener(){
                private boolean current(){return foreground&&session.equals(listening);}
                @Override public void onReadyForSpeech(Bundle data){if(current())emit(session,"stt-start",null);}
                @Override public void onResults(Bundle data){if(!current())return;ArrayList<String> results=data.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);if(results!=null&&!results.isEmpty())emit(session,"stt-result",results.get(0));listening="";releaseRecognizer();emit(session,"stt-end",null);}
                @Override public void onError(int error){if(!current())return;listening="";releaseRecognizer();emit(session,"stt-error",VoicePolicy.recognitionError(error));}
                @Override public void onBeginningOfSpeech(){} @Override public void onEndOfSpeech(){}
                @Override public void onRmsChanged(float rms){} @Override public void onBufferReceived(byte[] buffer){}
                @Override public void onPartialResults(Bundle data){} @Override public void onEvent(int event,Bundle data){}
            });
            Intent intent=new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE,"he-IL");intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS,false);
            intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS,1);
            recognizer.startListening(intent);call.resolve();
        }catch(RuntimeException error){releaseRecognizer();listening="";call.reject("Recognition service unavailable","service-not-allowed");}
    }
    private void releaseRecognizer(){SpeechRecognizer previous=recognizer;recognizer=null;if(previous!=null){try{previous.cancel();}catch(RuntimeException ignored){}try{previous.destroy();}catch(RuntimeException ignored){}}}
    private void stopRecognition(String reason){String old=listening;listening="";releaseRecognizer();if(permissionCall!=null){permissionCall.reject("Recognition cancelled",reason);permissionCall=null;}if(!old.isEmpty())emit(old,"stt-error",reason);}
    private void stopSpeech(){String old=speaking;speaking="";if(tts!=null)tts.stop();if(!old.isEmpty())emit(old,"tts-error","interrupted");}
    @PluginMethod public void stopListening(PluginCall call){main(()->{if(recognizer!=null&&listening.equals(call.getString("sessionId","")))recognizer.stopListening();call.resolve();});}
    @PluginMethod public void cancel(PluginCall call){main(()->{String id=call.getString("sessionId","");if(id.isEmpty()||id.equals(listening))stopRecognition("aborted");if(id.isEmpty()||id.equals(speaking))stopSpeech();call.resolve();});}
    private void suspend(){stopRecognition("aborted");stopSpeech();engineEpoch++;initializing=false;ready=false;if(tts!=null){tts.shutdown();tts=null;}finishInitialization("background");notifyListeners("voiceLifecycle",new JSObject());}
    @Override protected void handleOnPause(){foreground=false;main(this::suspend);}
    @Override protected void handleOnResume(){foreground=true;}
    @Override protected void handleOnDestroy(){foreground=false;main(this::suspend);}
}

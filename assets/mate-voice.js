(function (root, factory) {
  'use strict';
  var api = factory(typeof module === 'object' && module.exports ? require('./voice-providers.js') : root.TravelMateVoiceProviders);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && !root.TravelMateVoice) root.TravelMateVoice = api.createController(root, root.TravelMateSettings);
})(typeof window === 'undefined' ? null : window, function (providers) {
  'use strict';
  function createController(win, settings) {
    var provider = providers.create(win), synth = provider.synth, Recognition = provider.Recognition, Utterance = provider.Utterance;
    var recognition = null, utterance = null, parts = [], index = 0, generation = 0, timer = 0, processing = false, owner = '';
    var listeners = new Set(), phase = 'idle', message = '', stopping = false, sessionScope = scope();
    function scope() { var user = ''; try { user = win.localStorage.getItem('travelmate-active-user') || ''; } catch (error) {} return [user, win.location && win.location.pathname || '', win.location && win.location.search || ''].join('|'); }
    function preferences() { return settings && settings.getVoicePreferences ? settings.getVoicePreferences() : { enabled: false, style: 'auto', voiceURI: '' }; }
    function voices() { try { return synth && synth.getVoices ? synth.getVoices().filter(function (voice) { return voice.localService === true; }) : []; } catch (error) { return []; } }
    function base() {
      if (!preferences().enabled) return ['disabled', 'יכולות הקול כבויות בהגדרות. אפשר להמשיך להקליד.'];
      if (processing) return ['processing', 'חושב…'];
      if (!Recognition && !(synth && Utterance)) return ['unsupported', 'קול אינו נתמך בדפדפן הזה. אפשר להמשיך להקליד.'];
      if (win.navigator && win.navigator.onLine === false) return ['offline', voices().length ? 'ללא רשת: הכתבה כבויה. הקראה מקומית והקלדה זמינות.' : 'ללא רשת: אפשר להמשיך להקליד; לא נמצא קול מקומי.'];
      return ['idle', ''];
    }
    function snapshot() { return Object.freeze({ phase: phase, message: message, owner: owner, stopping: stopping, canRecognize: provider.capabilities().canRecognize, canSpeak: provider.capabilities().canSpeak, canPause: provider.capabilities().canPause, provider: provider.name, capabilities: Object.freeze(Object.assign({}, provider.capabilities())), enabled: preferences().enabled, localVoiceCount: voices().length }); }
    function emit() { var value = snapshot(); listeners.forEach(function (listener) { try { listener(value); } catch (error) {} }); }
    function state(next, text) { phase = next; message = text || ''; emit(); }
    function resetState() { var value = base(); state(value[0], value[1]); }
    function current(token) { return token === generation && sessionScope === scope() && !(win.document && win.document.hidden); }
    function clearTimer() { if (timer) win.clearTimeout(timer); timer = 0; }
    function invalidate() {
      generation += 1; clearTimer(); var previous = recognition; recognition = null; stopping = false;
      if (previous) { try { previous.abort(); } catch (error) {} }
      parts = []; index = 0; utterance = null;
      if (synth) { try { if (synth.speaking || synth.pending || synth.paused || owner) synth.cancel(); } catch (error) {} }
      owner = ''; sessionScope = scope();
    }
    function cancel(expectedOwner) { if (expectedOwner && expectedOwner !== owner) return false; invalidate(); resetState(); return true; }
    function failure(text, kind) { invalidate(); state(kind || 'error', text); return false; }
    function available() { if (!preferences().enabled) return failure('יכולות הקול כבויות בהגדרות. אפשר להמשיך להקליד.', 'disabled'); if (processing) return false; if (win.document && win.document.hidden) return false; return true; }
    function startListening(options) {
      options = options || {};
      if (!available()) return false;
      if (recognition) return false;
      if (!Recognition) return failure('הכתבה אינה נתמכת בדפדפן הזה. אפשר להמשיך להקליד.', 'unsupported');
      if (win.navigator && win.navigator.onLine === false) return failure('הכתבה אינה מופעלת ללא רשת. אפשר להמשיך להקליד.', 'offline');
      invalidate(); owner = 'mate'; var token = generation, next;
      try { next = new Recognition(); } catch (error) { return failure('לא ניתן לפתוח הכתבה בדפדפן הזה. אפשר להקליד.', 'unsupported'); }
      recognition = next; next.lang = 'he-IL'; next.interimResults = false; next.continuous = false;
      function valid() { return current(token) && recognition === next; }
      next.onstart = function () { if (valid()) state('listening', 'מקשיב… סיום מקבל את ההכתבה; ביטול מוחק אותה.'); };
      next.onresult = function (event) {
        if (!valid()) return;
        var value = event.results && event.results[0] && event.results[0][0] && event.results[0][0].transcript;
        if (typeof value === 'string' && options.onResult) options.onResult(value.trim().slice(0, 4000));
      };
      next.onend = function () { if (!valid()) return; recognition = null; owner = ''; stopping = false; clearTimer(); resetState(); };
      next.onerror = function (event) {
        if (!valid()) return;
        var code = event && event.error;
        var text = code === 'service-not-allowed' ? 'ספק זיהוי דיבור אינו זמין במכשיר. אפשר להמשיך להקליד.' : code === 'not-allowed' ? 'הגישה למיקרופון נחסמה. אפשר לבדוק את הרשאות הדפדפן או להמשיך להקליד.' : code === 'no-speech' ? 'לא זוהה דיבור. אפשר לנסות שוב בלחיצה או להקליד.' : code === 'language-not-supported' ? 'זיהוי עברית אינו זמין בדפדפן הזה. אפשר להקליד.' : 'ההכתבה הופסקה או אינה זמינה. אפשר לנסות שוב בלחיצה או להקליד.';
        failure(text, code === 'not-allowed' ? 'permission-denied' : code === 'service-not-allowed' ? 'unsupported' : code === 'network' ? 'limited' : 'error');
      };
      state('listening', 'פותח הכתבה… אפשר לבטל בכל רגע.');
      try { next.start(); if (valid()) timer = win.setTimeout(function () { if (valid()) failure('ההכתבה נעצרה לאחר 30 שניות. להפעלה נוספת יש ללחוץ שוב.'); }, 30000); }
      catch (error) { return failure('לא ניתן להתחיל הכתבה. בדקו הרשאת מיקרופון או המשיכו להקליד.'); }
      return true;
    }
    function stopListening() { if (!recognition || stopping) return false; stopping = true; state('listening', 'מסיים את ההכתבה… אפשר לבטל.'); try { recognition.stop(); return true; } catch (error) { return failure('לא ניתן לסיים את ההכתבה. אפשר להמשיך להקליד.'); } }
    function chooseVoice(requested, language) {
      var list = voices(), selected = requested && list.find(function (voice) { return voice.voiceURI === requested; });
      if (selected) return { voice: selected, missing: false };
      var baseLanguage = String(language || 'he-IL').split('-')[0].toLowerCase();
      var matching = list.filter(function (voice) { return String(voice.lang || '').split('-')[0].toLowerCase() === baseLanguage; });
      return { voice: matching.find(function (voice) { return voice.default; }) || matching[0] || list.find(function (voice) { return voice.default; }) || list[0] || null, missing: Boolean(requested) };
    }
    function chunks(text) { var result = []; while (text.length > 350) { var cut = text.lastIndexOf(' ', 350); if (cut < 100) cut = 350; result.push(text.slice(0, cut)); text = text.slice(cut).trim(); } if (text) result.push(text); return result; }
    function speak(text, options) {
      options = options || {};
      if (!available()) return false;
      if (provider.native && !provider.ready()) {
        invalidate(); owner = options.owner || 'mate'; var preparing = generation; state('processing', 'מכין את קול המכשיר… הטקסט נשאר זמין.');
        provider.prepare().then(function () { if (current(preparing)) { resetState(); speak(text, options); } }).catch(function () { if (current(preparing)) failure('לא ניתן לאתחל את מנוע הקול במכשיר. הטקסט נשאר זמין.'); });
        return true;
      }
      if (!synth || !Utterance) return failure('הקראה אינה נתמכת בדפדפן הזה. הטקסט נשאר זמין.', 'unsupported');
      text = String(text || '').trim(); if (!text) return false;
      if (text.length > 30000) return failure('התשובה ארוכה מדי להקראה אחת. הטקסט נשאר זמין לקריאה.');
      var prefs = preferences(), language = options.lang || 'he-IL', selection = chooseVoice(prefs.voiceURI, language);
      if (!selection.voice) return failure('לא נמצא קול מקומי במכשיר. אפשר לקרוא את הטקסט ולנסות שוב לאחר שקולות המכשיר נטענו.', 'unsupported');
      invalidate(); owner = options.owner || 'mate'; parts = chunks(text); index = 0;
      var token = generation, style = settings.getVoiceStyles().find(function (value) { return value.id === prefs.style; }) || settings.getVoiceStyles()[0];
      var fallback = selection.missing ? 'הקול שנבחר אינו זמין; נעשה שימוש בקול מקומי חלופי. ' : '';
      if (!/^he(?:-|$)/i.test(selection.voice.lang || '') && /^he(?:-|$)/i.test(language)) fallback += 'נבחר קול שאינו עברי; ההגייה בעברית עשויה להיות מוגבלת. ';
      function play() {
        if (!current(token)) return;
        if (index >= parts.length) { utterance = null; parts = []; owner = ''; resetState(); return; }
        var next = new Utterance(parts[index]); utterance = next;
        next.voice = selection.voice; next.lang = language; next.rate = style.rate; next.pitch = style.pitch; next.volume = style.volume;
        function valid() { return current(token) && utterance === next; }
        next.onstart = function (event) { if (valid()) { var actualLanguage = event && event.language; var nativeWarning = actualLanguage && /^he(?:-|$)/i.test(language) && !/^he(?:-|$)/i.test(actualLanguage) && /^he(?:-|$)/i.test(selection.voice.lang || '') ? 'מנוע המכשיר בחר קול חלופי שאינו עברי; ההגייה עשויה להיות מוגבלת. ' : ''; state('speaking', fallback + nativeWarning + 'מקריא…'); } };
        next.onpause = function () { if (valid()) state('paused', fallback + 'ההקראה מושהית.'); };
        next.onresume = function () { if (valid()) state('speaking', fallback + 'מקריא…'); };
        next.onend = function () { if (!valid()) return; utterance = null; index += 1; if (phase !== 'paused') play(); };
        next.onerror = function (event) { if (!valid()) return; if (event && (event.error === 'canceled' || event.error === 'interrupted')) { cancel(); return; } failure('ההקראה אינה זמינה כרגע. הטקסט נשאר זמין לקריאה.'); };
        state('speaking', fallback + 'מקריא…');
        try { synth.speak(next); } catch (error) { failure('ההקראה נכשלה. הטקסט נשאר זמין לקריאה.'); }
      }
      resumeChunk = play; play(); return phase === 'speaking';
    }
    var resumeChunk = function () {};
    function pause() { if (phase !== 'speaking' || !synth || !provider.capabilities().canPause) return false; try { synth.pause(); state('paused', 'ההקראה מושהית.'); return true; } catch (error) { return failure('השהיית ההקראה אינה זמינה. אפשר לעצור אותה.'); } }
    function resume() { if (phase !== 'paused' || !synth || !provider.capabilities().canPause) return false; try { synth.resume(); if (utterance) state('speaking', 'מקריא…'); else resumeChunk(); return true; } catch (error) { return failure('המשך ההקראה אינו זמין. אפשר להפעיל אותה מחדש.'); } }
    function setProcessing(value) { processing = Boolean(value); if (processing) { invalidate(); state('processing', 'חושב…'); } else if (phase === 'processing') resetState(); }
    var stop = function () { cancel(); };
    ['pagehide', 'beforeunload', 'popstate', 'travelmate:viewchange', 'travelmate:account-context-changed', 'travelmate:home-auth', 'travelmate:voice-preferences-changed'].forEach(function (event) { win.addEventListener(event, stop); });
    if (win.document && win.document.addEventListener) win.document.addEventListener('visibilitychange', function () { if (win.document.hidden) cancel(); });
    win.addEventListener('offline', function () { if (recognition) cancel(); else if (!utterance && !parts.length) resetState(); });
    win.addEventListener('online', function () { if (!recognition && !utterance && !parts.length) resetState(); });
    if (provider.onLifecycle) provider.onLifecycle(function () { cancel(); });
    if (provider.dispose) win.addEventListener('pagehide', provider.dispose);
    if (synth && synth.addEventListener) synth.addEventListener('voiceschanged', emit);
    resetState();
    return Object.freeze({ startListening: startListening, stopListening: stopListening, speak: speak, pause: pause, resume: resume, cancel: cancel, setProcessing: setProcessing, prepare: function () { return provider.prepare().then(function () { emit(); return snapshot(); }); }, getLocalVoices: voices, getSnapshot: function () { if (sessionScope !== scope()) cancel(); return snapshot(); }, subscribe: function (listener) { listeners.add(listener); listener(snapshot()); return function () { listeners.delete(listener); }; } });
  }
  return { createController: createController };
});

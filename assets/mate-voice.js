(function (root, factory) {
  'use strict';
  var api = factory(typeof module === 'object' && module.exports ? require('./voice-providers.js') : root.TravelMateVoiceProviders);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && !root.TravelMateVoice) root.TravelMateVoice = api.createController(root, root.TravelMateSettings);
})(typeof window === 'undefined' ? null : window, function (providers) {
  'use strict';
  // Speech-only projection: never change the chat response or persisted message.
  function speechText(value) {
    return String(value || '').replace(/\r\n?/g, '\n')
      .replace(/^\s*`{3,}[^\n]*$/gm, '').replace(/`+/g, '')
      .replace(/!?\[([^\]]+)\]\(https?:\/\/[^\s)]*(?:\([^)]*\)[^)]*)?\)/gi, '$1')
      .replace(/https?:\/\/[^\s<>]+|www\.[^\s<>]+/gi, '')
      .replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/gi, '')
      .replace(/<\/?(?:p|div|br|li|h[1-6])\b[^>]*>/gi, '\n').replace(/<\/?[a-z][^>]*>/gi, '')
      .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&(?:quot|apos);/gi, "'")
      .replace(/^\s{0,3}#{1,6}\s+/gm, '').replace(/^\s*(?:[-+*•]|\d+[.)])\s+/gm, '')
      .replace(/(\*\*|__|~~)([\s\S]*?)\1/g, '$2').replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=$|[\s.,!?):])/g, '$1$2')
      .replace(/^\s*(?:[-_*~=|]\s*)+$/gm, '').replace(/\*{2,}|`/g, '').replace(/\*([^*\n]+)\*/g, '$1')
      .replace(/([!?.,])\1{2,}/g, '$1').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim();
  }
  function speechChunks(text) {
    // A period only ends a sentence before whitespace/end: dates and decimals stay intact.
    var sentences = text.match(/[^\n]+(?:\n|$)/g) || [], result = [];
    sentences.forEach(function (line) {
      (line.match(/.*?[.!?](?=\s|$)|.+$/g) || []).forEach(function (part) {
        part = part.trim();
        while (part.length > 350) { var cut = part.lastIndexOf(' ', 350); if (cut < 100) cut = 350; result.push(part.slice(0, cut)); part = part.slice(cut).trim(); }
        if (part && /[\p{L}\p{N}]/u.test(part)) result.push(part);
      });
    });
    return result;
  }
  function isHebrew(language) { return /^(?:he|iw)(?:-|$)/i.test(language || ''); }
  function createController(win, settings) {
    var provider = providers.create(win), synth = provider.synth, Recognition = provider.Recognition, Utterance = provider.Utterance;
    var recognition = null, utterance = null, parts = [], index = 0, generation = 0, timer = 0, processing = false, owner = '';
    var conversation = null, conversationEnd = 'IDLE', interrupt = null, interruptTimer = 0, speechOptions = null, interruptStatus = 'inactive';
    var listeners = new Set(), phase = 'idle', message = '', stopping = false, sessionScope = scope();
    function scope() { var user = ''; try { user = win.localStorage.getItem('travelmate-active-user') || ''; } catch (error) {} return [user, win.location && win.location.pathname || '', win.location && win.location.search || ''].join('|'); }
    function preferences() { return settings && settings.getVoicePreferences ? settings.getVoicePreferences() : { enabled: false, style: 'auto', voiceURI: '' }; }
    function voices() { try { return synth && synth.getVoices ? synth.getVoices().filter(function (voice) { return voice.localService === true && voice.networkRequired !== true; }) : []; } catch (error) { return []; } }
    function base() {
      if (!preferences().enabled) return ['disabled', 'יכולות הקול כבויות בהגדרות. אפשר להמשיך להקליד.'];
      if (processing) return ['processing', 'חושב…'];
      if (!Recognition && !(synth && Utterance)) return ['unsupported', 'קול אינו נתמך בדפדפן הזה. אפשר להמשיך להקליד.'];
      if (win.navigator && win.navigator.onLine === false) return ['offline', voices().length ? 'ללא רשת: הכתבה כבויה. הקראה מקומית והקלדה זמינות.' : 'ללא רשת: אפשר להמשיך להקליד; לא נמצא קול מקומי.'];
      return ['idle', ''];
    }
    function conversationState() {
      if (!conversation) return conversationEnd;
      if (phase === 'processing') return 'THINKING';
      if (phase === 'speaking' || phase === 'paused') return 'SPEAKING';
      if (conversation.confirmationPending) return 'CONFIRMATION_PENDING';
      if (phase === 'listening') return 'LISTENING';
      if (conversation.awaitingTap) return 'FOLLOW_UP_AVAILABLE';
      return 'IDLE';
    }
    function snapshot() { return Object.freeze({ speechSourceId: speechOptions && speechOptions.sourceId || '', interruptListening: Boolean(interrupt), interruptStatus: interruptStatus, conversationActive: Boolean(conversation), conversationState: conversationState(), recognitionOfflineGuaranteed: false, recognitionNetwork: provider.capabilities().sttNetwork || 'unknown', phase: phase, message: message, owner: owner, stopping: stopping, canRecognize: provider.capabilities().canRecognize, canSpeak: provider.capabilities().canSpeak, canPause: provider.capabilities().canPause, provider: provider.name, capabilities: Object.freeze(Object.assign({}, provider.capabilities())), enabled: preferences().enabled, localVoiceCount: voices().length }); }
    function emit() { var value = snapshot(); listeners.forEach(function (listener) { try { listener(value); } catch (error) {} }); }
    function state(next, text) { phase = next; message = text || ''; emit(); }
    function resetState() { var value = base(); state(value[0], value[1]); }
    function current(token) { return token === generation && sessionScope === scope() && !(win.document && win.document.hidden); }
    function clearTimer() { if (timer) win.clearTimeout(timer); timer = 0; }
    function invalidate() {
      generation += 1; clearTimer(); stopInterrupt(); speechOptions = null; var previous = recognition; recognition = null; stopping = false;
      if (previous) { try { previous.abort(); } catch (error) {} }
      parts = []; index = 0; utterance = null;
      if (synth) { try { if (synth.speaking || synth.pending || synth.paused || owner) synth.cancel(); } catch (error) {} }
      owner = ''; sessionScope = scope();
    }
    function cancel(expectedOwner) { if (expectedOwner && expectedOwner !== owner && !(expectedOwner === 'mate' && conversation)) return false; if (conversation) conversationEnd = 'CANCELLED'; conversation = null; invalidate(); resetState(); return true; }
    function failure(text, kind) { if (conversation) conversationEnd = 'ERROR'; conversation = null; invalidate(); state(kind || 'error', text); return false; }
    function available() { if (!preferences().enabled) return failure('יכולות הקול כבויות בהגדרות. אפשר להמשיך להקליד.', 'disabled'); if (processing) return false; if (win.document && win.document.hidden) return false; return true; }
    function startListening(options) {
      options = options || {};
      if (!available()) return false;
      if (recognition) return false;
      if (!Recognition) return failure('הכתבה אינה נתמכת בדפדפן הזה. אפשר להמשיך להקליד.', 'unsupported');
      if (win.navigator && win.navigator.onLine === false) return failure('הכתבה אינה מופעלת ללא רשת. אפשר להמשיך להקליד.', 'offline');
      invalidate(); owner = 'mate'; var token = generation, next;
      try { next = new Recognition(); } catch (error) { return failure('לא ניתן לפתוח הכתבה בדפדפן הזה. אפשר להקליד.', 'unsupported'); }
      var finalParts = [];
      next.onspeechend = function () { if (valid()) state('listening', 'מסיים את ההכתבה… אפשר לבטל.'); };
      recognition = next; next.lang = 'he-IL'; next.interimResults = false; next.continuous = false;
      function valid() { return current(token) && recognition === next; }
      next.onstart = function () { if (valid()) state('listening', options.followUp ? (options.confirmationPending ? 'ממתין לכן או לא עבור ההצעה המוצגת — עד 12 שניות. אפשר לבטל.' : 'מקשיב לשאלת המשך — עד 12 שניות. אפשר לבטל.') : preferences().autoSend ? 'מקשיב… בסיום ההכתבה ההודעה תישלח אוטומטית. ביטול אינו שולח.' : 'מקשיב… בסיום אפשר לערוך ולשלוח. ביטול אינו שולח.'); };
      next.onresult = function (event) {
        if (!valid()) return;
        var results = event.results || [];
        for (var resultIndex = event.resultIndex || 0; resultIndex < results.length; resultIndex += 1) {
          var result = results[resultIndex];
          if (!result || result.isFinal === false) continue;
          var value = result[0] && result[0].transcript;
          if (typeof value === 'string') finalParts[resultIndex] = value.trim();
        }
        var transcript = finalParts.filter(Boolean).join(' ').slice(0, 4000);
        if (transcript && options.onResult) options.onResult(transcript);
      };
      next.onend = function () {
        if (!valid()) return;
        recognition = null; owner = ''; stopping = false; clearTimer(); resetState();
        var transcript = finalParts.filter(Boolean).join(' ').slice(0, 4000);
        if (transcript && current(token) && options.onComplete) options.onComplete(transcript);
        else if (!transcript && conversation) endConversation();
      };
      next.onerror = function (event) {
        if (!valid()) return;
        var code = event && event.error;
        var text = code === 'service-not-allowed' ? 'ספק זיהוי דיבור אינו זמין במכשיר. אפשר להמשיך להקליד.' : code === 'not-allowed' ? 'הגישה למיקרופון נחסמה. אפשר לבדוק את הרשאות הדפדפן או להמשיך להקליד.' : code === 'no-speech' ? 'לא זוהה דיבור. אפשר לנסות שוב בלחיצה או להקליד.' : code === 'language-not-supported' ? 'זיהוי עברית אינו זמין בדפדפן הזה. אפשר להקליד.' : 'ההכתבה הופסקה או אינה זמינה. אפשר לנסות שוב בלחיצה או להקליד.';
        failure(text, code === 'not-allowed' ? 'permission-denied' : code === 'service-not-allowed' ? 'unsupported' : code === 'network' ? 'limited' : 'error');
      };
      state('listening', 'פותח הכתבה… אפשר לבטל בכל רגע.');
      try { next.start(); if (valid()) timer = win.setTimeout(function () { if (valid()) { if (options.followUp) endConversation(); else failure('ההכתבה נעצרה לאחר 30 שניות. להפעלה נוספת יש ללחוץ שוב.'); } }, options.followUp ? 12000 : 30000); }
      catch (error) { return failure('לא ניתן להתחיל הכתבה. בדקו הרשאת מיקרופון או המשיכו להקליד.'); }
      return true;
    }
    // Conversation orchestration lives in the existing voice controller. A follow-up
    // is a fresh recognition session, capped at 12 seconds, never a permanent mic.
    function conversationCurrent(session) {
      return conversation === session && session.scope === scope() && !(win.document && win.document.hidden) && (!session.canContinue || session.canContinue());
    }
    function endConversation() {
      if (!conversation) return false;
      cancel();
      win.dispatchEvent(new win.CustomEvent('travelmate:voice-lifecycle-invalidated'));
      return true;
    }
    function conversationTurn(followUp) {
      var session = conversation;
      if (!session || !conversationCurrent(session)) { endConversation(); return false; }
      if (processing) return false;
      session.followUp = Boolean(followUp); session.awaitingTap = false;
      var options = session.createTurn();
      options.followUp = session.followUp;
      options.confirmationPending = session.confirmationPending;
      return startListening(options);
    }
    function startConversation(options) {
      if (processing || !available() || !options || typeof options.createTurn !== 'function') return false;
      cancel(); conversationEnd = 'IDLE';
      conversation = { scope: scope(), createTurn: options.createTurn, canContinue: options.canContinue, followUp: false, confirmationPending: false };
      return conversationTurn(false);
    }
    function finishConversationTurn(options) {
      var session = conversation;
      if (!session || !conversationCurrent(session)) { endConversation(); return false; }
      options = options || {}; session.confirmationPending = Boolean(options.confirmationPending);
      function next() { if (conversationCurrent(session)) conversationTurn(true); }
      if (options.text && preferences().autoSpeakReplies && provider.native && !provider.ready()) {
        invalidate(); var preparing = generation;
        state('processing', 'מכין את קול המכשיר… הטקסט נשאר זמין.');
        provider.prepare().then(function () { if (current(preparing) && conversationCurrent(session)) { resetState(); finishConversationTurn(options); } }).catch(function () { if (current(preparing) && conversationCurrent(session)) failure('לא ניתן לאתחל את מנוע הקול במכשיר. הטקסט נשאר זמין.'); });
        return true;
      }
      if (options.text && preferences().autoSpeakReplies && preferences().enabled && provider.capabilities().canSpeak && voices().length) return speak(options.text, { owner: 'mate', lang: 'he-IL', conversationReply: true, voiceOrigin: true, sourceId: options.sourceId, onComplete: next });
      invalidate(); session.awaitingTap = true;
      state('idle', 'אפשר לשאול שאלת המשך בלחיצה על המיקרופון — עד 12 שניות.');
      timer = win.setTimeout(function () { if (conversation === session) endConversation(); }, 12000);
      return true;
    }
    function stopListening() { if (!recognition || stopping) return false; stopping = true; state('listening', 'מסיים את ההכתבה… אפשר לבטל.'); try { recognition.stop(); return true; } catch (error) { return failure('לא ניתן לסיים את ההכתבה. אפשר להמשיך להקליד.'); } }
    function chooseVoice(requested, language) {
      var list = voices(), selected = requested && list.find(function (voice) { return voice.voiceURI === requested; });
      if (selected) return { voice: selected, missing: false };
      var wanted = String(language || 'he-IL').toLowerCase().replace(/^iw/, 'he');
      function rank(voice) { var lang = String(voice.lang || '').toLowerCase().replace(/^iw/, 'he'); return lang === wanted ? 2 : lang.split('-')[0] === wanted.split('-')[0] ? 1 : 0; }
      function number(value, fallback) { return Number.isFinite(Number(value)) && value != null ? Number(value) : fallback; }
      list.sort(function (a,b) { return rank(b)-rank(a) || number(b.quality,0)-number(a.quality,0) || number(a.latency,1000)-number(b.latency,1000) || Number(Boolean(b.default))-Number(Boolean(a.default)) || String(a.voiceURI).localeCompare(String(b.voiceURI)); });
      return { voice: list[0] || null, missing: Boolean(requested) };
    }
    function stopInterrupt() {
      var previous = interrupt; interrupt = null;
      if (interruptTimer) win.clearTimeout(interruptTimer); interruptTimer = 0;
      if (previous) { try { previous.abort(); } catch (error) {} }
      interruptStatus = 'inactive';
    }
    function awaitFollowUp() {
      if (!conversation) { resetState(); return; }
      invalidate(); conversation.awaitingTap = true; conversation.confirmationPending = false;
      state('idle', 'ההקראה נעצרה. להמשך השיחה לחצו על המיקרופון — עד 12 שניות.');
      var session = conversation;
      timer = win.setTimeout(function () { if (conversation === session) endConversation(); }, 12000);
    }
    function stopPlayback() {
      if (!utterance && !parts.length && !speechOptions) return false;
      var options = speechOptions;
      if (!conversation && options && options.voiceOrigin && options.createTurn) conversation = { scope: scope(), createTurn: options.createTurn, canContinue: options.canContinue, followUp: true, confirmationPending: false };
      invalidate(); awaitFollowUp(); return true;
    }
    function listenForStop(next, token) {
      if (!speechOptions || !speechOptions.voiceOrigin || interrupt || !provider.createInterrupt || !(provider.capabilities().canInterrupt) || win.navigator && win.navigator.onLine === false) return;
      var options = speechOptions;
      if (options.interruptFailed || options.interruptAttempted === next) return; options.interruptAttempted = next;
      var listener = provider.createInterrupt(next); if (!listener) return;
      interrupt = listener; interruptStatus = 'starting';
      function valid() { return current(token) && interrupt === listener && phase === 'speaking'; }
      function ended() { if (!valid()) return; stopInterrupt(); interruptStatus = 'tap-only'; state('speaking', 'מקריא… עצירה קולית אינה פעילה; אפשר לעצור בלחיצה.'); }
      listener.onstart = function () { if (valid()) { interruptStatus = 'listening'; state('speaking', 'מקריא ומקשיב לפקודת עצירה בלבד — עד 30 שניות. אפשר לעצור גם בלחיצה.'); } };
      listener.onresult = function (event) { if (!valid()) return; var result = event.results && event.results[0]; if (!result || result.isFinal === false) return; var value = String(result[0] && result[0].transcript || '').trim().replace(/[.!?׃]+$/g, '').trim(); if (/^(עצור|תעצור|תפסיק|די|stop)$/i.test(value)) stopPlayback(); };
      listener.onerror = function (event) { if (valid() && event && event.error !== 'aborted') options.interruptFailed = true; ended(); }; listener.onend = ended;
      try { listener.start(); interruptTimer = win.setTimeout(ended, 30000); } catch (error) { ended(); }
    }
    function speak(text, options) {
      options = options || {};
      if (conversation && !options.conversationReply) endConversation();
      if (!available()) return false;
      if (provider.native && !provider.ready()) {
        invalidate(); owner = options.owner || 'mate'; var preparing = generation; state('processing', 'מכין את קול המכשיר… הטקסט נשאר זמין.');
        provider.prepare().then(function () { if (current(preparing)) { resetState(); speak(text, options); } }).catch(function () { if (current(preparing)) failure('לא ניתן לאתחל את מנוע הקול במכשיר. הטקסט נשאר זמין.'); });
        return true;
      }
      if (!synth || !Utterance) return failure('הקראה אינה נתמכת בדפדפן הזה. הטקסט נשאר זמין.', 'unsupported');
      text = speechText(text); if (!text || !speechChunks(text).length) { invalidate(); awaitFollowUp(); return false; }
      if (text.length > 30000) return failure('התשובה ארוכה מדי להקראה אחת. הטקסט נשאר זמין לקריאה.');
      var prefs = preferences(), language = options.lang || 'he-IL', selection = chooseVoice(prefs.voiceURI, language);
      if (!selection.voice) return failure('לא נמצא קול מקומי במכשיר. אפשר לקרוא את הטקסט ולנסות שוב לאחר שקולות המכשיר נטענו.', 'unsupported');
      invalidate(); owner = options.owner || 'mate'; parts = speechChunks(text); index = 0; speechOptions = Object.assign({}, options);
      var completed = false, token = generation, style = settings.getVoiceStyles().find(function (value) { return value.id === prefs.style; }) || settings.getVoiceStyles()[0];
      var fallback = selection.missing ? 'הקול שנבחר אינו זמין; נעשה שימוש בקול מקומי חלופי. ' : '';
      if (!isHebrew(selection.voice.lang || '') && isHebrew(language)) fallback += 'נבחר קול שאינו עברי; ההגייה בעברית עשויה להיות מוגבלת. ';
      function play() {
        if (!current(token)) return;
        if (index >= parts.length) { stopInterrupt(); speechOptions = null; utterance = null; parts = []; owner = ''; resetState(); if (!completed && current(token)) { completed = true; if (options.onComplete) options.onComplete(); } return; }
        var next = new Utterance(parts[index]); utterance = next;
        next.allowInterrupt = Boolean(options.voiceOrigin && (options.owner || 'mate') === 'mate');
        next.voice = selection.voice; next.lang = language; next.rate = style.rate; next.pitch = style.pitch; next.volume = style.volume;
        function valid() { return current(token) && utterance === next; }
        next.onstart = function (event) { if (valid()) { var actualLanguage = event && event.language; var voiceFallback = event && event.fallback ? 'מנוע המכשיר בחר קול מקומי חלופי. ' : ''; var nativeWarning = actualLanguage && isHebrew(language) && !isHebrew(actualLanguage) && isHebrew(selection.voice.lang || '') ? 'מנוע המכשיר בחר קול חלופי שאינו עברי; ההגייה עשויה להיות מוגבלת. ' : ''; if (!interrupt) state('speaking', fallback + voiceFallback + nativeWarning + 'מקריא…'); if (!(event && event.diagnostics)) listenForStop(next, token); } };
        next.onpause = function () { if (valid()) state('paused', fallback + 'ההקראה מושהית.'); };
        next.onresume = function () { if (valid()) state('speaking', fallback + 'מקריא…'); };
        next.onend = function () { if (!valid()) return; stopInterrupt(); utterance = null; index += 1; if (phase !== 'paused') { if (provider.native && index < parts.length) timer = win.setTimeout(function () { timer = 0; play(); }, style.pauseMs || 0); else play(); } };
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
    win.addEventListener('offline', function () { if (recognition || conversation || utterance || parts.length) cancel(); else if (!utterance && !parts.length) resetState(); });
    win.addEventListener('online', function () { if (!recognition && !utterance && !parts.length) resetState(); });
    if (provider.onLifecycle) provider.onLifecycle(function () { cancel(); win.dispatchEvent(new win.CustomEvent('travelmate:voice-lifecycle-invalidated')); });
    if (provider.dispose) win.addEventListener('pagehide', provider.dispose);
    if (synth && synth.addEventListener) synth.addEventListener('voiceschanged', emit);
    resetState();
    return Object.freeze({ startConversation: startConversation, endConversation: endConversation, continueConversation: function () { return conversationTurn(Boolean(conversation && conversation.awaitingTap)); }, finishConversationTurn: finishConversationTurn, startListening: startListening, stopPlayback: stopPlayback, stopListening: stopListening, speak: speak, pause: pause, resume: resume, cancel: cancel, setProcessing: setProcessing, prepare: function () { return provider.prepare().then(function () { emit(); return snapshot(); }); }, getLocalVoices: voices, getSnapshot: function () { if (sessionScope !== scope()) cancel(); return snapshot(); }, subscribe: function (listener) { listeners.add(listener); listener(snapshot()); return function () { listeners.delete(listener); }; } });
  }
  return { createController: createController, speechText: speechText, speechChunks: speechChunks };
});

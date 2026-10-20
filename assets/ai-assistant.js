(function () {
  'use strict';

  if (window.__travelMateAiAssistantLoaded) return;
  window.__travelMateAiAssistantLoaded = true;

  var cloud = window.TravelMateCloud;
  var state = { open: false, busy: false, session: null, messages: [], lifecycleGeneration: 0 };
  var pageLock = null;
  var tripContext = collectTripContext();
  var storageKey = conversationStorageKey();
  var lifecycleUserId = String(localStorage.getItem('travelmate-active-user') || '');

  function conversationStorageKey(userId) {
    var owner = userId || localStorage.getItem('travelmate-active-user') || 'guest';
    var contextId = tripContext && (tripContext.id || tripContext.tripId || tripContext.sessionId);
    return 'travelmate-ai-chat:' + owner + ':' + (contextId || 'general');
  }

  function escapeText(value) { return String(value || '').replace(/[&<>"']/g, function (character) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]; }); }
  function trimText(value, limit) { return String(value || '').trim().slice(0, limit); }

  function summarizeExpenses(expenses) {
    var totals = {};
    var categories = {};
    (Array.isArray(expenses) ? expenses : []).slice(0, 200).forEach(function (expense) {
      var amount = Math.max(0, Number(expense && expense.amount || 0));
      var currency = trimText(expense && expense.currency || 'EUR', 8).toUpperCase();
      var category = trimText(expense && expense.category || 'אחר', 60) || 'אחר';
      if (amount && /^[A-Z]{3}$/.test(currency)) totals[currency] = Number(((totals[currency] || 0) + amount).toFixed(2));
      categories[category] = (categories[category] || 0) + 1;
    });
    return {
      count: Array.isArray(expenses) ? expenses.length : 0,
      totals: Object.keys(totals).slice(0, 8).map(function (currency) { return { currency: currency, amount: totals[currency] }; }),
      categories: Object.keys(categories).sort(function (a, b) { return categories[b] - categories[a]; }).slice(0, 8).map(function (category) { return { category: category, count: categories[category] }; })
    };
  }

  function collectTripContext() {
    var id = new URLSearchParams(location.search).get('id');
    var trips = readTrips();
    var trip = trips.find(function (item) { return String(item.id) === String(id); });
    if (trip) {
      return {
        id: String(trip.id), country: trimText(trip.country, 80), city: trimText(trip.city, 80),
        start: trip.start, end: trip.end, days: Number(trip.days || 1), budget: Number(trip.budget || 0), budgetUnlimited: Boolean(trip.budgetUnlimited), type: trimText(trip.type, 40),
        expenseSummary: summarizeExpenses(trip.expenses),
        activities: (trip.activities || []).slice(0, 40).map(function (item) { return { date: item.date, time: item.time, title: trimText(item.title, 160), category: trimText(item.category, 60), duration: Number(item.duration || 0), done: Boolean(item.done) }; }),
        savedPlaces: (trip.savedPlaces || []).slice(0, 30).map(function (item) { return { name: trimText(item.name, 160), category: trimText(item.category, 60), date: item.date }; })
      };
    }
    var heading = document.querySelector('h1');
    if (heading && !/לאן נוסעים|הטיולים שלי/.test(heading.textContent)) return { page: trimText(document.title, 120), destination: trimText(heading.textContent, 160) };
    return null;
  }

  function restoreMessages() {
    try {
      var restored = JSON.parse(sessionStorage.getItem(storageKey) || '[]');
      if (Array.isArray(restored)) state.messages = restored.filter(validMessage).slice(-16);
    } catch (error) {}
  }

  function validMessage(message) { return message && (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string'; }
  function persistMessages() { try { sessionStorage.setItem(storageKey, JSON.stringify(state.messages.slice(-16))); } catch (error) {} }

  function createUi() {
    var orb = document.querySelector('.ai-orb') || document.createElement('button');
    orb.className = 'ai-orb'; orb.type = 'button'; orb.setAttribute('aria-label', 'פתיחת העוזר האישי'); orb.setAttribute('aria-expanded', 'false');
    orb.innerHTML = '<span class="ai-orb-ring"></span><i class="fa-solid fa-wand-magic-sparkles"></i><span class="ai-orb-badge">AI</span>';
    orb.removeAttribute('data-ai-shell');
    var panel = document.createElement('aside');
    panel.className = 'ai-panel'; panel.hidden = true; panel.id = 'travelmate-ai-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', 'העוזר האישי של TravelMate'); orb.setAttribute('aria-controls', panel.id);
    panel.innerHTML = '<header class="ai-panel-header"><span class="ai-avatar"><i class="fa-solid fa-compass"></i></span><div class="ai-panel-title"><strong>Mate · העוזר האישי שלך</strong><small data-ai-status role="status" aria-live="polite">מוכן לעזור בכל שאלה</small></div><div class="ai-panel-actions"><button class="ai-icon-button" type="button" data-ai-clear title="שיחה חדשה" aria-label="שיחה חדשה"><i class="fa-solid fa-rotate"></i></button><button class="ai-icon-button" type="button" data-ai-close title="סגירה" aria-label="סגירת העוזר"><i class="fa-solid fa-xmark"></i></button></div></header><div class="ai-context-bar"><i class="fa-solid fa-location-dot"></i><span data-ai-context></span><button type="button" data-ai-privacy>מה נשלח?</button></div><div class="ai-chat" data-ai-chat aria-live="polite"></div><div><div class="ai-quick-prompts" data-ai-prompts></div><form class="ai-composer" data-ai-form><div class="ai-composer-row"><button class="ai-voice" type="button" data-ai-voice aria-label="הכתבה קולית" title="הכתבה קולית"><i class="fa-solid fa-microphone"></i></button><textarea name="message" rows="1" maxlength="4000" placeholder="שאל אותי על הטיול או על כל נושא…" aria-label="הודעה לעוזר"></textarea><button type="submit" data-ai-send aria-label="שליחת הודעה"><i class="fa-solid fa-arrow-up"></i></button></div><div class="ai-composer-note"><span>Enter לשליחה · Shift+Enter לשורה חדשה</span><span>AI עשוי לטעות</span></div></form></div>';
    if (!orb.isConnected) document.body.appendChild(orb); document.body.appendChild(panel);
    return { orb: orb, panel: panel, chat: panel.querySelector('[data-ai-chat]'), form: panel.querySelector('[data-ai-form]'), input: panel.querySelector('textarea'), status: panel.querySelector('[data-ai-status]'), prompts: panel.querySelector('[data-ai-prompts]') };
  }

  var ui = createUi();

  var keyboardBaseline = { width: window.innerWidth, height: window.innerHeight };
  function syncVisualViewport() {
    var viewport = window.visualViewport;
    var height = viewport ? viewport.height : window.innerHeight;
    var offsetTop = viewport ? viewport.offsetTop : 0;
    document.documentElement.style.setProperty('--ai-viewport-height', Math.round(height) + 'px');
    document.documentElement.style.setProperty('--ai-viewport-top', Math.round(offsetTop) + 'px');
    // Android adjustResize can shrink innerHeight and visualViewport together.
    // Preserve pre-focus height; reset on orientation/width changes.
    if (Math.abs(keyboardBaseline.width - window.innerWidth) > 80 ||
        (!state.open && document.activeElement !== ui.input) || height > keyboardBaseline.height) {
      keyboardBaseline = { width: window.innerWidth, height: window.innerHeight };
    }
    var resizedWithInput = document.activeElement === ui.input && keyboardBaseline.height - height > 120;
    document.body.classList.toggle('ai-keyboard-open', state.open && (window.innerHeight - height > 120 || resizedWithInput));
  }

  function lockPageScroll() {
    if (pageLock) return;
    pageLock = {
      scrollY: window.scrollY,
      position: document.body.style.position,
      top: document.body.style.top,
      left: document.body.style.left,
      right: document.body.style.right,
      width: document.body.style.width,
      overflow: document.body.style.overflow
    };
    document.documentElement.classList.add('ai-assistant-open');
    document.body.classList.add('ai-assistant-open');
    document.body.style.position = 'fixed';
    document.body.style.top = -pageLock.scrollY + 'px';
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
  }

  function unlockPageScroll() {
    if (!pageLock) return;
    var scrollY = pageLock.scrollY;
    document.body.style.position = pageLock.position;
    document.body.style.top = pageLock.top;
    document.body.style.left = pageLock.left;
    document.body.style.right = pageLock.right;
    document.body.style.width = pageLock.width;
    document.body.style.overflow = pageLock.overflow;
    document.documentElement.classList.remove('ai-assistant-open');
    document.body.classList.remove('ai-assistant-open', 'ai-keyboard-open');
    pageLock = null;
    window.scrollTo(0, scrollY);
  }

  function contextLabel() {
    if (tripContext && tripContext.city) return 'מכיר את הטיול ל' + tripContext.city + ' · ללא מסמכים או GPS';
    if (tripContext && tripContext.destination) return 'מכיר את המסך הנוכחי · ללא מסמכים או GPS';
    return 'מצב כללי · אפשר לשאול על כל נושא';
  }

  function quickPrompts() {
    return tripContext && (tripContext.city || tripContext.destination)
      ? ['בנה לי יום רגוע', 'מה כדאי להזמין מראש?', 'האם התוכנית עמוסה?', 'תן לי טיפ מפתיע ליעד']
      : ['עזור לי לבחור יעד', 'בנה רשימת אריזה', 'איך לחסוך בטיול?', 'תן לי רעיון מגניב לסופ״ש'];
  }

  function renderPrompts() {
    ui.prompts.innerHTML = '';
    quickPrompts().forEach(function (prompt) { var button = document.createElement('button'); button.type = 'button'; button.textContent = prompt; button.addEventListener('click', function () { sendMessage(prompt); }); ui.prompts.appendChild(button); });
  }

  function formatAssistantText(content) {
    return window.TravelMateMateNotes.formatResponse(content);
  }

  function addMessage(role, content, options) {
    var row = document.createElement('div'); row.className = 'ai-message ' + role;
    var avatar = document.createElement('span'); avatar.className = 'ai-message-avatar'; avatar.innerHTML = role === 'user' ? '<i class="fa-solid fa-user"></i>' : '<i class="fa-solid fa-compass"></i>';
    var bubble = document.createElement('div'); bubble.className = 'ai-bubble';
    if (options && options.html) bubble.innerHTML = content;
    else if (role === 'assistant') bubble.innerHTML = formatAssistantText(content);
    else bubble.textContent = content;
    row.appendChild(avatar); row.appendChild(bubble); ui.chat.appendChild(row);
    if (role === 'assistant' && !(options && options.temporary)) addMessageTools(bubble, options && options.responseState || { content: content });
    ui.chat.scrollTop = ui.chat.scrollHeight;
    return row;
  }

  function addMessageTools(bubble, responseState) {
    var content = responseState.content;
    var tools = document.createElement('div'); tools.className = 'ai-message-tools';
    var speak = document.createElement('button'); speak.type = 'button'; speak.innerHTML = '<i class="fa-solid fa-volume-high"></i> הקראה';
    speak.dataset.aiRead = '';
    speak.addEventListener('click', function () { if (window.TravelMateVoice) window.TravelMateVoice.speak(content, { owner: 'mate', lang: 'he-IL' }); });
    var copy = document.createElement('button'); copy.type = 'button'; copy.innerHTML = '<i class="fa-regular fa-copy"></i> העתקה';
    copy.addEventListener('click', function () { navigator.clipboard && navigator.clipboard.writeText(content); copy.textContent = 'הועתק'; });
    tools.appendChild(speak); tools.appendChild(copy);
    var tripId = currentTripId();
    var noteScope = window.TravelMateMateNotes && window.TravelMateMateNotes.capture(tripId);
    var activeTrip = noteScope && window.TravelMateMateNotes.getTrip(tripId);
    if (activeTrip) {
      var saveNote = document.createElement('button');
      saveNote.type = 'button';
      saveNote.innerHTML = '<i class="fa-solid fa-file-circle-plus"></i> \u05e9\u05de\u05d5\u05e8 \u05d1\u05de\u05e1\u05de\u05db\u05d9\u05dd';
      saveNote.addEventListener('click', function () {
        var question = '';
        for (var index = state.messages.length - 1; index >= 0; index--) {
          if (state.messages[index].role === 'user') { question = state.messages[index].content; break; }
        }
        if (!question) { saveNote.textContent = '\u05e9\u05d0\u05dc \u05e9\u05d0\u05dc\u05d4 \u05ea\u05d7\u05d9\u05dc\u05d4'; return; }
        if (saveAiNote(question, content, noteScope)) {
          saveNote.innerHTML = '<i class="fa-solid fa-check"></i> \u05e0\u05e9\u05de\u05e8 \u05d1\u05de\u05e1\u05de\u05db\u05d9 \u05d4\u05d8\u05d9\u05d5\u05dc';
          saveNote.disabled = true;
        } else saveNote.textContent = '\u05db\u05d1\u05e8 \u05e0\u05e9\u05de\u05e8';
      });
      tools.appendChild(saveNote);
    }
    if (responseIncomplete(responseState.data) && responseState.messages && responseState.context !== undefined) {
      var continueButton = document.createElement('button');
      continueButton.type = 'button';
      continueButton.className = 'ai-continue-response';
      continueButton.innerHTML = '<i class="fa-solid fa-forward-step"></i> המשך תשובה';
      continueButton.addEventListener('click', async function () {
        if (responseState.continuing) return;
        var generation = state.lifecycleGeneration;
        responseState.continuing = true; continueButton.disabled = true; continueButton.textContent = 'ממשיך…';
        try {
          var continued = await continueResponse(responseState.content, responseState.messages, responseState.context);
          responseState.content = continued.answer; responseState.data = continued.data;
          if (responseState.message) responseState.message.content = responseState.content;
          persistMessages();
          bubble.innerHTML = formatAssistantText(responseState.content);
          addMessageTools(bubble, responseState);
          ui.chat.scrollTop = ui.chat.scrollHeight;
        } catch (error) {
          if (generation !== state.lifecycleGeneration) return;
          continueButton.disabled = false; continueButton.innerHTML = '<i class="fa-solid fa-forward-step"></i> המשך תשובה';
          setStatus(friendlyError(error));
        } finally { responseState.continuing = false; }
      });
      tools.appendChild(continueButton);
    }
    bubble.appendChild(tools);
  }

  function readTrips() {
    var store = window.TravelMateTripStore;
    if (store && store.getTrips) {
      try { return store.getTrips(); } catch (error) {}
    }
    var service = activeCloud();
    if (service && service.getLocalTrips) {
      try {
        var cloudTrips = service.getLocalTrips();
        if (Array.isArray(cloudTrips)) return cloudTrips;
      } catch (error) {}
    }
    return [];
  }

  function currentTripId() {
    return new URLSearchParams(location.search).get('id') || tripContext && (tripContext.id || tripContext.tripId);
  }

  function saveAiNote(question, answer, scope) {
    return persistTripWithNote(currentTripId(), question, answer, undefined, scope);
  }

  function renderAiNotesArchive() {
    if (window.TravelMateMateNotes) window.TravelMateMateNotes.refresh();
  }

  function responseIncomplete(data) {
    return Boolean(data && (data.truncated === true || data.complete === false));
  }

  async function invokeAssistant(client, messages, contextOverride) {
    var invokeRequest = client.functions.invoke('travel-assistant', { body: { messages: messages, context: contextOverride || tripContext, locale: document.documentElement.lang || 'he' } });
    var result = await Promise.race([invokeRequest, new Promise(function (resolve, reject) { setTimeout(function () { reject(new Error('AI_TIMEOUT')); }, 30000); })]);
    if (result.error) {
      try { var errorBody = await result.error.context.clone().json(); result.error.travelMateCode = [errorBody && errorBody.error, errorBody && errorBody.providerCode, errorBody && errorBody.providerStatus].filter(Boolean).join(':'); } catch (parseError) {}
    }
    return result;
  }

  function renderHistory() {
    ui.chat.innerHTML = '';
    if (!state.messages.length) addMessage('assistant', tripContext && (tripContext.city || tripContext.destination) ? 'היי, אני Mate 👋\nאני מכיר את הטיול שמופיע כאן ויכול לעזור לתכנן, לבדוק עומס, להציע רעיונות — וגם לענות על שאלות כלליות.' : 'היי, אני Mate 👋\nהעוזר האישי שלך ב־TravelMate. אפשר לשאול אותי על יעדים, תכנון, תקציב, אריזה — או על כל נושא אחר.');
    state.messages.forEach(function (message) { addMessage(message.role, message.content); });
  }

  var tripHistory = window.TravelMateHistory || null;
  function setOpen(open, fromHistory) {
    if (!open && window.TravelMateVoice) window.TravelMateVoice.cancel('mate');
    if (open && !state.open && !fromHistory) {
      if (tripHistory) {
        tripHistory.pushOverlay('ai', function () {
          setOpen(false, true);
          requestAnimationFrame(function () { if (document.contains(ui.orb)) ui.orb.focus(); });
        });
      } else if (!(history.state && history.state.travelMateOverlay === 'ai')) {
        var overlayState = Object.assign({}, history.state || {}, { travelMateTrip: true, travelMateOverlay: 'ai' });
        history.pushState(overlayState, '', location.href);
      }
    }
    if (!open && state.open && !fromHistory) {
      if (tripHistory) {
        state.open = false; ui.panel.hidden = true; ui.orb.setAttribute('aria-expanded', 'false');
        unlockPageScroll(); if (document.contains(ui.orb)) ui.orb.focus();
        tripHistory.closeOverlay('ai');
        return;
      }
      if (history.state && history.state.travelMateOverlay === 'ai') {
        if (document.contains(ui.orb)) ui.orb.focus();
        history.back();
        return;
      }
    }
    state.open = open; ui.panel.hidden = !open; ui.orb.setAttribute('aria-expanded', String(open));
    if (open) { lockPageScroll(); syncVisualViewport(); ui.input.focus(); ui.chat.scrollTop = ui.chat.scrollHeight; setTimeout(syncVisualViewport, 120); }
    else { unlockPageScroll(); if (document.contains(ui.orb)) ui.orb.focus(); }
  }

  function setBusy(busy) { state.busy = busy; ui.input.disabled = busy; ui.form.querySelector('[data-ai-send]').disabled = busy; ui.panel.setAttribute('aria-busy', String(busy)); if (window.TravelMateVoice) window.TravelMateVoice.setProcessing(busy); }
  var assistantStatus = 'מוכן לעזור בכל שאלה';
  function setStatus(value) { assistantStatus = value; renderVoiceState(window.TravelMateVoice && window.TravelMateVoice.getSnapshot()); }
  function renderVoiceState(snapshot) {
    ui.status.textContent = snapshot && snapshot.message || assistantStatus;
    if (!snapshot) return;
    ui.panel.dataset.voiceState = snapshot.phase;
    var privacy = ui.panel.querySelector('.ai-voice-privacy');
    if (privacy) privacy.textContent = snapshot.provider === 'android-native' ? 'הכתבה מופעלת רק בלחיצה דרך ספק הזיהוי של Android, שעשוי להשתמש ברשת. TravelMate אינו שומר קובצי קול. הקראה משתמשת בקולות שהמכשיר מסמן כמקומיים; אפשר להמשיך להקליד.' : 'הכתבה מופעלת רק בלחיצה ועשויה לעבור דרך ספק הדפדפן; אינה מובטחת ללא רשת. הקראה משתמשת רק בקול שהמכשיר מסמן כמקומי. אפשר להמשיך להקליד.';
    var mic = ui.panel.querySelector('[data-ai-voice]');
    mic.disabled = state.busy || !snapshot.enabled || !snapshot.canRecognize || snapshot.phase === 'offline' || snapshot.stopping;
    mic.classList.toggle('listening', snapshot.phase === 'listening');
    mic.setAttribute('aria-pressed', String(snapshot.phase === 'listening'));
    mic.setAttribute('aria-label', snapshot.phase === 'listening' ? 'סיום הכתבה' : 'הכתבה קולית');
    var controls = ui.panel.querySelector('[data-ai-voice-controls]');
    if (controls) {
      controls.hidden = !['listening','speaking','paused'].includes(snapshot.phase);
      controls.querySelector('[data-voice-pause]').hidden = snapshot.phase !== 'speaking' || !snapshot.canPause;
      controls.querySelector('[data-voice-resume]').hidden = snapshot.phase !== 'paused' || !snapshot.canPause;
      controls.querySelector('[data-voice-stop]').textContent = snapshot.phase === 'listening' ? 'ביטול הכתבה' : 'עצירת הקראה';
    }
  }
  function typingRow() { return addMessage('assistant', '<span class="ai-typing" aria-label="Mate חושב"><i></i><i></i><i></i></span>', { html: true, temporary: true }); }

  function activeCloud() { return window.TravelMateCloud || cloud; }
  function currentAuthUserId() { return String((state.session && state.session.user && state.session.user.id) || localStorage.getItem('travelmate-active-user') || ''); }
  function requestIsCurrent(context) {
    if (!context || context.generation !== state.lifecycleGeneration) return false;
    if (context.userId && currentAuthUserId() !== context.userId) return false;
    return context.storageKey === storageKey;
  }

  async function getSession() {
    var service = activeCloud();
    if (!service) return null;
    var generation = state.lifecycleGeneration;
    try {
      var session = await service.getSession();
      if (generation !== state.lifecycleGeneration) return null;
      if (session && session.expires_at && session.expires_at * 1000 < Date.now() + 60000) {
        var client = await service.getClient();
        if (generation !== state.lifecycleGeneration) return null;
        var refreshed = await client.auth.refreshSession();
        if (generation !== state.lifecycleGeneration) return null;
        session = refreshed.data && refreshed.data.session || session;
      }
      if (String(session && session.user && session.user.id || '') !== String(localStorage.getItem('travelmate-active-user') || '')) return null;
      state.session = session;
      return state.session;
    } catch (error) { return null; }
  }

  function friendlyError(error) {
    var status = Number(error && (error.context && error.context.status || error.status) || 0);
    var message = [error && error.travelMateCode, error && error.message, error && error.name].filter(Boolean).join(':');
    if (/AI_NOT_CONFIGURED/i.test(message)) return 'שירות ה־AI עדיין לא הוגדר במלואו. אפשר לנסות שוב לאחר עדכון השירות.';
    if (/USAGE_CHECK_FAILED/i.test(message)) return 'בדיקת מכסת השימוש של Mate נכשלה. נסה לצאת ולהיכנס מחדש לחשבון.';
    if (/AI_PROVIDER_ERROR|EMPTY_AI_RESPONSE/i.test(message)) return 'ספק ה־AI אינו זמין כרגע או לא החזיר תשובה תקינה. אפשר לנסות שוב בעוד רגע.';
    if (/AI_TIMEOUT|AbortError|TimeoutError/i.test(message)) return 'Mate לא קיבל תשובה בזמן. בדוק את החיבור ונסה שוב — השיחה נשמרה.';
    if (status === 401 || /JWT|Unauthorized|AUTH_REQUIRED|NAVO_AUTH_REQUIRED/i.test(message)) return 'כדי לדבר איתי צריך להתחבר לחשבון TravelMate.';
    if (status === 429 || /DAILY_LIMIT_REACHED|RATE_LIMIT|429/i.test(message)) return 'הגעת למגבלת השימוש היומית בעוזר. אפשר לחזור ולשאול אותי מחר.';
    var nativeAndroid = window.TravelMateVoice && window.TravelMateVoice.getSnapshot().provider === 'android-native';
    if (status === 403 || /ORIGIN_NOT_ALLOWED/i.test(message) || nativeAndroid && /FunctionsFetchError|Failed to (?:send|fetch)|NetworkError/i.test(message)) return 'Mate לא הצליח להתחבר לשירות ה־AI מהאפליקציה. נדרש לבדוק את הרשאת החיבור של גרסת Android.';
    if (status === 404 || /FUNCTION_NOT_FOUND/i.test(message)) return 'שירות ה־AI עדיין לא הופעל. נדרשת הפעלה של השירות כדי לקבל תשובות.';
    return 'לא הצלחתי להתחבר כרגע. בדוק את החיבור ונסה שוב בעוד רגע.';
  }

  function appendAiNote(trip, question, answer, metadata) {
    if (!trip) return false;
    trip.aiNotes = Array.isArray(trip.aiNotes) ? trip.aiNotes : [];
    var responseId = metadata && metadata.responseId ? String(metadata.responseId) : '';
    if (responseId && trip.aiNotes.some(function (note) { return String(note.responseId || '') === responseId; })) return false;
    if (!responseId && trip.aiNotes.some(function (note) { return note.question === question && note.answer === answer; })) return false;
    trip.aiNotes.unshift(Object.assign({ id: 'navo-note-' + Date.now(), question: question, answer: answer, createdAt: new Date().toISOString() }, metadata || {}));
    return true;
  }

  function persistTripWithNote(tripId, question, answer, metadata, scope) {
    var notes = window.TravelMateMateNotes;
    return Boolean(notes && notes.update(tripId, function (trip) {
      return appendAiNote(trip, question, answer, metadata);
    }, scope));
  }

  function mergeContinuation(original, continuation) {
    var first = String(original || '').trim();
    var next = String(continuation || '').trim();
    if (!next || first.indexOf(next) !== -1) return first;
    var maxOverlap = Math.min(800, first.length, next.length);
    for (var length = maxOverlap; length >= 12; length -= 1) {
      if (first.slice(-length) === next.slice(0, length)) return first + next.slice(length);
    }
    return first + '\n\n' + next;
  }

  async function continueResponse(previousAnswer, messages, context) {
    var continuationAnchor = String(previousAnswer || '').slice(-3500);
    var continuationMessages = (messages || []).concat([
      { role: 'assistant', content: continuationAnchor },
      { role: 'user', content: 'התשובה הקודמת נקטעה. המשך בדיוק מהמקום שבו נעצרת, ללא חזרה על כותרות או מידע שכבר נכתב.' }
    ]);
    var result = await requestWithContext(continuationMessages, context);
    var extra = result.answer;
    if (!extra) throw new Error('EMPTY_AI_RESPONSE');
    return { answer: mergeContinuation(previousAnswer, extra), data: result.data || {} };
  }

  async function requestWithContext(messages, context) {
    var requestGeneration = state.lifecycleGeneration;
    var session = await getSession();
    if (requestGeneration !== state.lifecycleGeneration) throw new Error('AI_REQUEST_STALE');
    if (!session || !session.user) throw new Error('NAVO_AUTH_REQUIRED');
    var requestContext = { generation: requestGeneration, userId: String(session.user.id), storageKey: conversationStorageKey(session.user.id) };
    if (!requestIsCurrent(requestContext)) throw new Error('AI_REQUEST_STALE');
    var service = activeCloud();
    var client = await service.getClient();
    if (!requestIsCurrent(requestContext)) throw new Error('AI_REQUEST_STALE');
    var result = await invokeAssistant(client, messages, context);
    if (!requestIsCurrent(requestContext)) throw new Error('AI_REQUEST_STALE');
    if (result.error) throw result.error;
    var answer = String(result.data && result.data.answer || '').trim();
    if (!answer) throw new Error('EMPTY_AI_RESPONSE');
    return { answer: answer, data: result.data || {} };
  }

  function showInlineLogin(content) {
    var row = addMessage('assistant', '<form class="ai-login-card ai-inline-login" data-ai-login><strong>התחברות ל־Mate</strong><p>Mate מוגן בחשבון TravelMate כדי שמפתח ה־AI לא ייחשף בטלפון.</p><input type="email" name="email" autocomplete="email" placeholder="כתובת דוא״ל" aria-label="כתובת דוא״ל להתחברות ל־Mate" required><input type="password" name="password" autocomplete="current-password" placeholder="סיסמת החשבון" aria-label="סיסמת החשבון להתחברות ל־Mate" required><button type="submit">התחברות והמשך</button><small data-ai-login-status></small></form>', { html: true, temporary: true });
    var form = row.querySelector('[data-ai-login]');
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      var service = activeCloud();
      var status = form.querySelector('[data-ai-login-status]');
      var button = form.querySelector('button');
      if (!service || !service.signIn) { status.textContent = 'שירות ההתחברות עדיין נטען. נסה שוב בעוד רגע.'; return; }
      button.disabled = true; status.textContent = 'מתחבר…';
      try {
        var result = await service.signIn(form.elements.email.value.trim(), form.elements.password.value);
        if (result.error) throw result.error;
        state.session = result.data && result.data.session;
        form.innerHTML = '<strong>התחברת בהצלחה</strong><p>השאלה הוחזרה לשדה. לחץ על שליחה ו־Mate יענה מיד.</p>';
        ui.input.value = content; autoGrow(); ui.input.focus(); setStatus('מחובר · מוכן לענות');
      } catch (error) {
        status.textContent = 'הדוא״ל או הסיסמה אינם נכונים. אפשר לנסות שוב.';
        button.disabled = false;
      }
    });
  }

  function contextualNearbyIntent(content) {
    var helper = window.TravelMateTripContext;
    var tripId = currentTripId();
    var trip = tripId && readTrips().find(function (item) { return String(item.id) === String(tripId); });
    if (!trip || !helper || typeof helper.parseMateNearbyIntent !== 'function') return null;
    var intent = helper.parseMateNearbyIntent(content);
    return intent ? { intent: intent, trip: trip } : null;
  }

  function waitForNearbyPanel() {
    return new Promise(function (resolve, reject) {
      var deadline = Date.now() + 6000;
      function check() {
        var panel = document.querySelector('#places [data-nearby-places]');
        if (panel && panel.dataset.nearbyInitialized === 'true' && window.TravelMateNearby) { resolve(panel); return; }
        if (Date.now() >= deadline) { reject(new Error('NEARBY_NOT_READY')); return; }
        setTimeout(check, 30);
      }
      check();
    });
  }

  async function openContextualNearby(action) {
    var features = window.TravelMateFeatures;
    var navigation = window.TravelMateNavigation;
    if (!features || typeof features.load !== 'function' || !navigation || typeof navigation.open !== 'function') throw new Error('NEARBY_NOT_READY');
    var loaded = await features.load('places');
    if (loaded === false) throw new Error('NEARBY_NOT_READY');
    navigation.open('places');
    var panel = await waitForNearbyPanel();
    var detail = { trip: action.trip, now: new Date(), bufferMinutes: 30, source: 'mate', mood: action.intent.mood || '', categories: Array.isArray(action.intent.categories) ? action.intent.categories.slice() : [], miniRoute: Boolean(action.intent.miniRoute), routeStops: Number(action.intent.routeStops || 0) };
    if (Number.isFinite(action.intent.availableMinutes)) detail.availableMinutes = action.intent.availableMinutes;
    panel.dispatchEvent(new CustomEvent('travelmate:contextual-nearby', { detail: detail }));
  }

  async function sendMessage(forcedText) {
    if (state.busy) return;
    var content = trimText(forcedText || ui.input.value, 4000); if (!content) return;
    var requestGeneration = state.lifecycleGeneration;
    var requestContext = null;
    setOpen(true); ui.input.value = ''; autoGrow();
    state.messages.push({ role: 'user', content: content }); state.messages = state.messages.slice(-16); persistMessages(); addMessage('user', content);
    var nearbyAction = contextualNearbyIntent(content);
    if (nearbyAction) {
      var confirmation = nearbyAction.intent.miniRoute ? 'פותח את Places כדי לבנות מסלול קצר של עד ' + nearbyAction.intent.routeStops + ' תחנות. המיקום יתבקש רק דרך מסך ההסכמה הקיים, ושום מקום לא יישמר או יתווסף לתוכנית אוטומטית.' : 'פותח את Places לחיפוש קרוב. המיקום יתבקש רק דרך מסך ההסכמה הקיים, ושום מקום לא יישמר או יתווסף לתוכנית אוטומטית.';
      state.messages.push({ role: 'assistant', content: confirmation }); state.messages = state.messages.slice(-16); persistMessages(); addMessage('assistant', confirmation);
      setBusy(true); setStatus('פותח את Places…');
      try {
        await openContextualNearby(nearbyAction);
        setStatus('החיפוש עבר ל־Places');
      } catch (error) {
        addMessage('assistant', 'לא הצלחתי לפתוח את החיפוש הקרוב כרגע. אפשר להמשיך לשאול אותי כרגיל או לפתוח את Places ידנית.');
        setStatus('חיפוש Places אינו זמין כרגע');
      } finally { setBusy(false); if (state.open) ui.input.focus(); }
      return;
    }
    setBusy(true); setStatus('חושב על התשובה…'); var typing = typingRow();
    try {
      var session = await getSession();
      if (requestGeneration !== state.lifecycleGeneration) { typing.remove(); return; }
      if (!session || !session.user) {
        typing.remove(); showInlineLogin(content);
        setStatus('נדרשת התחברות'); return;
      }
      requestContext = { generation: requestGeneration, userId: String(session.user.id), storageKey: conversationStorageKey(session.user.id) };
      if (!requestIsCurrent(requestContext)) { typing.remove(); return; }
      var service = activeCloud();
      var client = await service.getClient();
      if (!requestIsCurrent(requestContext)) { typing.remove(); return; }
      var result = await invokeAssistant(client, state.messages.slice(-12));
      if (!requestIsCurrent(requestContext)) { typing.remove(); return; }
      if (result.error) {
        if (!requestIsCurrent(requestContext)) { typing.remove(); return; }
        throw result.error;
      }
      var answer = String(result.data && result.data.answer || '').trim() || 'לא התקבלה תשובה. נסה לנסח את השאלה מחדש.';
      var assistantMessage = { role: 'assistant', content: answer };
      var responseState = { id: 'navo-response-' + Date.now(), content: answer, data: result.data || {}, messages: state.messages.slice(-12), context: tripContext ? JSON.parse(JSON.stringify(tripContext)) : null, message: assistantMessage };
      typing.remove(); state.messages.push(assistantMessage); state.messages = state.messages.slice(-16); persistMessages(); addMessage('assistant', answer, { responseState: responseState }); setStatus('מחובר · ההקשר של הטיול פעיל');
    } catch (error) {
      if (requestGeneration !== state.lifecycleGeneration || requestContext && !requestIsCurrent(requestContext)) { typing.remove(); return; }
      console.error('TravelMate AI request failed', error); typing.remove(); addMessage('assistant', '<div class="ai-login-card ai-error-card">' + escapeText(friendlyError(error)) + '</div>', { html: true, temporary: true }); setStatus('החיבור ל־AI אינו זמין');
    } finally { if (requestGeneration === state.lifecycleGeneration) { setBusy(false); ui.input.focus(); } }
  }

  function autoGrow() { ui.input.style.height = 'auto'; ui.input.style.height = Math.min(ui.input.scrollHeight, 110) + 'px'; }

  function setupVoice() {
    var voice = window.TravelMateVoice, button = ui.panel.querySelector('[data-ai-voice]');
    ui.status.id = 'mate-voice-status'; button.setAttribute('aria-describedby', 'mate-voice-status');
    var controls = document.createElement('div'); controls.className = 'ai-voice-controls'; controls.dataset.aiVoiceControls = ''; controls.hidden = true;
    controls.innerHTML = '<button type="button" data-voice-pause>השהיה</button><button type="button" data-voice-resume hidden>המשך הקראה</button><button type="button" data-voice-stop>עצירת הקראה</button>';
    ui.form.appendChild(controls);
    var privacy = document.createElement('small'); privacy.className = 'ai-voice-privacy';
    privacy.textContent = 'הכתבה מופעלת רק בלחיצה ועשויה לעבור דרך ספק הדפדפן; אינה מובטחת ללא רשת. הקראה משתמשת רק בקול שהמכשיר מסמן כמקומי. אפשר להמשיך להקליד.';
    ui.form.appendChild(privacy);
    if (!voice) { button.disabled = true; return; }
    button.addEventListener('click', function () {
      if (voice.getSnapshot().phase === 'listening') voice.stopListening();
      else {
        var dictationGeneration = state.lifecycleGeneration, dictationSent = false;
        voice.startListening({
          onResult: function (text) { if (state.open && !state.busy && dictationGeneration === state.lifecycleGeneration) { ui.input.value = text; autoGrow(); } },
          onComplete: function (text) {
            if (dictationSent || !state.open || state.busy || dictationGeneration !== state.lifecycleGeneration) return;
            var settings = window.TravelMateSettings;
            if (settings && settings.getVoicePreferences().autoSend) {
              dictationSent = true; sendMessage(text);
            } else { ui.input.focus(); }
          }
        });
      }
    });
    controls.querySelector('[data-voice-pause]').addEventListener('click', voice.pause);
    controls.querySelector('[data-voice-resume]').addEventListener('click', voice.resume);
    controls.querySelector('[data-voice-stop]').addEventListener('click', function () { voice.cancel('mate'); ui.input.focus(); });
    voice.subscribe(renderVoiceState);
  }

  ui.panel.querySelector('[data-ai-context]').textContent = contextLabel(); renderPrompts(); restoreMessages(); renderHistory(); renderAiNotesArchive(); setupVoice();
  function applyAccountContext(event, session) {
    var previousUserId = lifecycleUserId;
    var nextUserId = String((session && session.user && session.user.id) || '');
    state.session = session || null;
    if (previousUserId === nextUserId) return;
    lifecycleUserId = nextUserId;
    state.lifecycleGeneration += 1;
    setBusy(false);
    ui.input.value = ''; autoGrow();
    if (window.TravelMateVoice) window.TravelMateVoice.cancel();
    tripContext = collectTripContext();
    var nextKey = conversationStorageKey(session && session.user ? session.user.id : 'guest');
    if (nextKey === storageKey) return;
    storageKey = nextKey;
    state.messages = [];
    restoreMessages();
    renderHistory();
    renderAiNotesArchive();
    setStatus('מוכן לעזור בכל שאלה');
    window.dispatchEvent(new CustomEvent('travelmate:ai-account-context-changed', { detail: { event: event, userId: session && session.user ? String(session.user.id) : null, generation: state.lifecycleGeneration } }));
  }
  window.addEventListener('travelmate:account-context-changed', function (event) {
    var userId = event.detail && event.detail.userId;
    applyAccountContext('ACCOUNT_CHANGED', userId ? { user: { id: userId } } : null);
  });
  if (activeCloud() && activeCloud().onAuthChange) Promise.resolve(activeCloud().onAuthChange(applyAccountContext)).catch(function () { setStatus('החיבור לחשבון אינו זמין כרגע. אפשר להמשיך להשתמש בכלים המקומיים.'); });
  ui.orb.addEventListener('click', function () { setOpen(!state.open); });
  ui.panel.querySelector('[data-ai-close]').addEventListener('click', function () { setOpen(false); });
  ui.panel.querySelector('[data-ai-clear]').addEventListener('click', function () { if (window.TravelMateVoice) window.TravelMateVoice.cancel('mate'); state.messages = []; persistMessages(); renderHistory(); setStatus('שיחה חדשה'); });
  ui.panel.querySelector('[data-ai-privacy]').addEventListener('click', function () { addMessage('assistant', 'אני שולח ל־Google Gemini רק את השאלה, היסטוריית השיחה הקצרה ותקציר הטיול: יעד, תאריכים, פעילויות, מקומות ששמרת, מסגרת התקציב וסיכום הוצאות מצומצם לפי מטבע וקטגוריה. הערות להוצאות, קבלות, מסמכים, סיסמאות, GPS ופרטי הכספת אינם נשלחים. במסלול החינמי Google עשויה להשתמש בתוכן לשיפור מוצריה.'); });
  ui.form.addEventListener('submit', function (event) { event.preventDefault(); sendMessage(); });
  ui.panel.querySelector('.ai-quick-prompts').addEventListener('focusin', function (event) { var button = event.target.closest('button'); if (button) button.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' }); });
  ui.input.addEventListener('input', autoGrow);
  ui.input.addEventListener('focus', function () { setTimeout(syncVisualViewport, 80); setTimeout(syncVisualViewport, 320); });
  ui.input.addEventListener('blur', function () { setTimeout(syncVisualViewport, 120); });
  ui.input.addEventListener('keydown', function (event) { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } });
  window.addEventListener('travelmate:ask-ai', function (event) {
    var prompt = trimText(event.detail && event.detail.prompt, 4000);
    if (event.detail && event.detail.context) {
      if (window.TravelMateVoice) window.TravelMateVoice.cancel('mate');
      tripContext = event.detail.context;
      var nextKey = conversationStorageKey(state.session && state.session.user ? state.session.user.id : undefined);
      if (nextKey !== storageKey) {
        storageKey = nextKey;
        state.messages = [];
        restoreMessages();
        renderHistory();
      }
      ui.panel.querySelector('[data-ai-context]').textContent = contextLabel();
      renderPrompts();
    }
    setOpen(true);
    if (prompt) { ui.input.value = prompt; autoGrow(); }
    ui.input.focus();
  });
  if (!window.TravelMateHistory) window.addEventListener('popstate', function () {
    if (state.open && !(history.state && history.state.travelMateOverlay === 'ai')) { setOpen(false, true); requestAnimationFrame(function () { if (document.contains(ui.orb)) ui.orb.focus(); }); }
  });
  document.addEventListener('keydown', function (event) {
    if (!state.open) return;
    if (event.key === 'Escape') { setOpen(false); return; }
    if (event.key !== 'Tab') return;
    var focusable = [].slice.call(ui.panel.querySelectorAll('button:not([disabled]):not([hidden]),a[href],input:not([disabled]):not([hidden]),select:not([disabled]):not([hidden]),textarea:not([disabled]):not([hidden]),[tabindex]:not([tabindex="-1"])')).filter(function (node) { return node.offsetParent !== null; });
    if (!focusable.length) return;
    var first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  document.addEventListener('touchmove', function (event) {
    if (!state.open) return;
    if (!event.target.closest('.ai-chat, .ai-quick-prompts, .ai-composer textarea')) event.preventDefault();
  }, { passive: false });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncVisualViewport);
    window.visualViewport.addEventListener('scroll', syncVisualViewport);
  } else window.addEventListener('resize', syncVisualViewport);
  syncVisualViewport();
  window.TravelMateNavo = {
    request: requestWithContext,
    friendlyError: friendlyError,
    formatResponse: formatAssistantText,
    responseIncomplete: responseIncomplete,
    continueResponse: continueResponse,
    appendNote: appendAiNote,
    saveNoteForTrip: function (tripId, question, answer, metadata) {
      return persistTripWithNote(tripId, question, answer, metadata);
    },
    openConversation: function (prompt, context) {
      window.TravelMateEvents.emit(window.TravelMateEvents.names.askAi, { prompt: prompt, context: context, source: 'mate-conversation' });
    }
  };
  window.dispatchEvent(new CustomEvent('travelmate:navo-ready'));
})();

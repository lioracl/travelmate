(function () {
  'use strict';

  if (window.__travelMateAiAssistantLoaded) return;
  window.__travelMateAiAssistantLoaded = true;

  var cloud = window.TravelMateCloud;
  var state = { open: false, busy: false, session: null, messages: [], recognition: null };
  var tripContext = collectTripContext();
  var storageKey = conversationStorageKey();

  function conversationStorageKey(userId) {
    var owner = userId || localStorage.getItem('travelmate-active-user') || 'guest';
    return 'travelmate-ai-chat:' + owner + ':' + (tripContext && tripContext.id ? tripContext.id : 'general');
  }

  function escapeText(value) { return String(value || '').replace(/[&<>"']/g, function (character) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]; }); }
  function trimText(value, limit) { return String(value || '').trim().slice(0, limit); }

  function collectTripContext() {
    var id = new URLSearchParams(location.search).get('id');
    var trips = [];
    try { trips = JSON.parse(localStorage.getItem('travelmate-trips') || '[]'); } catch (error) {}
    var trip = trips.find(function (item) { return String(item.id) === String(id); });
    if (trip) {
      return {
        id: String(trip.id), country: trimText(trip.country, 80), city: trimText(trip.city, 80),
        start: trip.start, end: trip.end, days: Number(trip.days || 1), budget: Number(trip.budget || 0), type: trimText(trip.type, 40),
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
    var orb = document.createElement('button');
    orb.className = 'ai-orb'; orb.type = 'button'; orb.setAttribute('aria-label', 'פתיחת העוזר האישי'); orb.setAttribute('aria-expanded', 'false');
    orb.innerHTML = '<span class="ai-orb-ring"></span><i class="fa-solid fa-wand-magic-sparkles"></i><span class="ai-orb-badge">AI</span>';
    var panel = document.createElement('aside');
    panel.className = 'ai-panel'; panel.hidden = true; panel.setAttribute('aria-label', 'העוזר האישי של TravelMate');
    panel.innerHTML = '<header class="ai-panel-header"><span class="ai-avatar"><i class="fa-solid fa-compass"></i></span><div class="ai-panel-title"><strong>נבו · העוזר האישי שלך</strong><small data-ai-status>מוכן לעזור בכל שאלה</small></div><div class="ai-panel-actions"><button class="ai-icon-button" type="button" data-ai-clear title="שיחה חדשה" aria-label="שיחה חדשה"><i class="fa-solid fa-rotate"></i></button><button class="ai-icon-button" type="button" data-ai-close title="סגירה" aria-label="סגירת העוזר"><i class="fa-solid fa-xmark"></i></button></div></header><div class="ai-context-bar"><i class="fa-solid fa-location-dot"></i><span data-ai-context></span><button type="button" data-ai-privacy>מה נשלח?</button></div><div class="ai-chat" data-ai-chat aria-live="polite"></div><div><div class="ai-quick-prompts" data-ai-prompts></div><form class="ai-composer" data-ai-form><div class="ai-composer-row"><button class="ai-voice" type="button" data-ai-voice aria-label="הכתבה קולית" title="הכתבה קולית"><i class="fa-solid fa-microphone"></i></button><textarea name="message" rows="1" maxlength="4000" placeholder="שאל אותי על הטיול או על כל נושא…" aria-label="הודעה לעוזר"></textarea><button type="submit" data-ai-send aria-label="שליחת הודעה"><i class="fa-solid fa-arrow-up"></i></button></div><div class="ai-composer-note"><span>Enter לשליחה · Shift+Enter לשורה חדשה</span><span>AI עשוי לטעות</span></div></form></div>';
    document.body.appendChild(orb); document.body.appendChild(panel);
    return { orb: orb, panel: panel, chat: panel.querySelector('[data-ai-chat]'), form: panel.querySelector('[data-ai-form]'), input: panel.querySelector('textarea'), status: panel.querySelector('[data-ai-status]'), prompts: panel.querySelector('[data-ai-prompts]') };
  }

  var ui = createUi();

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

  function addMessage(role, content, options) {
    var row = document.createElement('div'); row.className = 'ai-message ' + role;
    var avatar = document.createElement('span'); avatar.className = 'ai-message-avatar'; avatar.innerHTML = role === 'user' ? '<i class="fa-solid fa-user"></i>' : '<i class="fa-solid fa-compass"></i>';
    var bubble = document.createElement('div'); bubble.className = 'ai-bubble';
    if (options && options.html) bubble.innerHTML = content; else bubble.textContent = content;
    row.appendChild(avatar); row.appendChild(bubble); ui.chat.appendChild(row);
    if (role === 'assistant' && !(options && options.temporary)) addMessageTools(bubble, content);
    ui.chat.scrollTop = ui.chat.scrollHeight;
    return row;
  }

  function addMessageTools(bubble, content) {
    var tools = document.createElement('div'); tools.className = 'ai-message-tools';
    var speak = document.createElement('button'); speak.type = 'button'; speak.innerHTML = '<i class="fa-solid fa-volume-high"></i> הקראה';
    speak.addEventListener('click', function () { if (!window.speechSynthesis) return; speechSynthesis.cancel(); var utterance = new SpeechSynthesisUtterance(content); utterance.lang = 'he-IL'; speechSynthesis.speak(utterance); });
    var copy = document.createElement('button'); copy.type = 'button'; copy.innerHTML = '<i class="fa-regular fa-copy"></i> העתקה';
    copy.addEventListener('click', function () { navigator.clipboard && navigator.clipboard.writeText(content); copy.textContent = 'הועתק'; });
    tools.appendChild(speak); tools.appendChild(copy); bubble.appendChild(tools);
  }

  function renderHistory() {
    ui.chat.innerHTML = '';
    if (!state.messages.length) addMessage('assistant', tripContext && (tripContext.city || tripContext.destination) ? 'היי, אני נבו 👋\nאני מכיר את הטיול שמופיע כאן ויכול לעזור לתכנן, לבדוק עומס, להציע רעיונות — וגם לענות על שאלות כלליות.' : 'היי, אני נבו 👋\nהעוזר האישי שלך ב־TravelMate. אפשר לשאול אותי על יעדים, תכנון, תקציב, אריזה — או על כל נושא אחר.');
    state.messages.forEach(function (message) { addMessage(message.role, message.content); });
  }

  function setOpen(open) {
    state.open = open; ui.panel.hidden = !open; ui.orb.setAttribute('aria-expanded', String(open));
    if (open) { ui.input.focus(); ui.chat.scrollTop = ui.chat.scrollHeight; }
  }

  function setBusy(busy) { state.busy = busy; ui.input.disabled = busy; ui.form.querySelector('[data-ai-send]').disabled = busy; }
  function setStatus(value) { ui.status.textContent = value; }
  function typingRow() { return addMessage('assistant', '<span class="ai-typing" aria-label="נבו חושב"><i></i><i></i><i></i></span>', { html: true, temporary: true }); }

  function activeCloud() { return window.TravelMateCloud || cloud; }

  async function getSession() {
    var service = activeCloud();
    if (!service) return null;
    try {
      state.session = await service.getSession();
      if (state.session && state.session.expires_at && state.session.expires_at * 1000 < Date.now() + 60000) {
        var client = await service.getClient();
        var refreshed = await client.auth.refreshSession();
        state.session = refreshed.data && refreshed.data.session || state.session;
      }
      return state.session;
    } catch (error) { return null; }
  }

  function friendlyError(error) {
    var message = String(error && (error.travelMateCode || error.message || error.context && error.context.status) || '');
    if (/AI_NOT_CONFIGURED/i.test(message)) return 'נבו עדיין לא מחובר למפתח Gemini בשרת. בדוק שסוד GEMINI_API_KEY קיים ב־Supabase.';
    if (/USAGE_CHECK_FAILED/i.test(message)) return 'בדיקת מכסת השימוש של נבו נכשלה. נסה לצאת ולהיכנס מחדש לחשבון.';
    if (/AI_PROVIDER_ERROR.*403|PERMISSION_DENIED/i.test(message)) return 'מפתח Gemini אינו מורשה כרגע. בדוק ב־Google AI Studio שהמפתח פעיל ושפרויקט ה־Free tier זמין.';
    if (/AI_PROVIDER_ERROR.*404|NOT_FOUND/i.test(message)) return 'מודל Gemini שהוגדר אינו זמין למפתח הזה. TravelMate יעבור למודל Flash היציב לאחר עדכון השרת.';
    if (/AI_PROVIDER_ERROR|EMPTY_AI_RESPONSE/i.test(message)) return 'שירות Gemini לא החזיר תשובה תקינה. אפשר לנסות שוב בעוד רגע.';
    if (/AI_TIMEOUT/i.test(message)) return 'נבו לא קיבל תשובה בזמן. בדוק את החיבור ונסה שוב — השיחה נשמרה.';
    if (/401|JWT|Unauthorized/i.test(message)) return 'כדי לדבר איתי צריך להתחבר לחשבון TravelMate.';
    if (/429|limit|rate/i.test(message)) return 'הגעת למגבלת השימוש היומית בעוזר. אפשר לחזור ולשאול אותי מחר.';
    if (/404|FunctionsHttpError|Failed to send/i.test(message)) return 'שירות ה־AI עדיין לא הופעל ב־Supabase. הממשק כבר מוכן, ונדרשת הפעלה חד־פעמית של הפונקציה.';
    return 'לא הצלחתי להתחבר כרגע. אפשר לנסות שוב בעוד רגע.';
  }

  function showInlineLogin(content) {
    var row = addMessage('assistant', '<form class="ai-login-card ai-inline-login" data-ai-login><strong>התחברות לנבו</strong><p>נבו מוגן בחשבון TravelMate כדי שמפתח ה־AI לא ייחשף בטלפון.</p><input type="email" name="email" autocomplete="email" placeholder="כתובת דוא״ל" aria-label="כתובת דוא״ל להתחברות לנבו" required><input type="password" name="password" autocomplete="current-password" placeholder="סיסמת החשבון" aria-label="סיסמת החשבון להתחברות לנבו" required><button type="submit">התחברות והמשך</button><small data-ai-login-status></small></form>', { html: true, temporary: true });
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
        form.innerHTML = '<strong>התחברת בהצלחה</strong><p>השאלה הוחזרה לשדה. לחץ על שליחה ונבו יענה מיד.</p>';
        ui.input.value = content; autoGrow(); ui.input.focus(); setStatus('מחובר · מוכן לענות');
      } catch (error) {
        status.textContent = 'הדוא״ל או הסיסמה אינם נכונים. אפשר לנסות שוב.';
        button.disabled = false;
      }
    });
  }

  async function sendMessage(forcedText) {
    if (state.busy) return;
    var content = trimText(forcedText || ui.input.value, 4000); if (!content) return;
    setOpen(true); ui.input.value = ''; autoGrow();
    state.messages.push({ role: 'user', content: content }); state.messages = state.messages.slice(-16); persistMessages(); addMessage('user', content);
    setBusy(true); setStatus('חושב על התשובה…'); var typing = typingRow();
    try {
      var session = await getSession();
      if (!session || !session.user) {
        typing.remove(); showInlineLogin(content);
        setStatus('נדרשת התחברות'); return;
      }
      var service = activeCloud();
      var client = await service.getClient();
      var invokeRequest = client.functions.invoke('travel-assistant', { body: { messages: state.messages.slice(-12), context: tripContext, locale: document.documentElement.lang || 'he' } });
      var result = await Promise.race([invokeRequest, new Promise(function (resolve, reject) { setTimeout(function () { reject(new Error('AI_TIMEOUT')); }, 30000); })]);
      if (result.error) {
        try { var errorBody = await result.error.context.clone().json(); result.error.travelMateCode = [errorBody && errorBody.error, errorBody && errorBody.providerCode, errorBody && errorBody.providerStatus].filter(Boolean).join(':'); } catch (parseError) {}
        throw result.error;
      }
      var answer = trimText(result.data && result.data.answer, 10000) || 'לא התקבלה תשובה. נסה לנסח את השאלה מחדש.';
      typing.remove(); state.messages.push({ role: 'assistant', content: answer }); state.messages = state.messages.slice(-16); persistMessages(); addMessage('assistant', answer); setStatus('מחובר · ההקשר של הטיול פעיל');
    } catch (error) {
      console.error('TravelMate AI request failed', error); typing.remove(); addMessage('assistant', '<div class="ai-login-card ai-error-card">' + escapeText(friendlyError(error)) + '</div>', { html: true, temporary: true }); setStatus('החיבור ל־AI אינו זמין');
    } finally { setBusy(false); ui.input.focus(); }
  }

  function autoGrow() { ui.input.style.height = 'auto'; ui.input.style.height = Math.min(ui.input.scrollHeight, 110) + 'px'; }

  function setupVoice() {
    var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition; var button = ui.panel.querySelector('[data-ai-voice]');
    if (!Recognition) { button.hidden = true; return; }
    state.recognition = new Recognition(); state.recognition.lang = 'he-IL'; state.recognition.interimResults = false;
    state.recognition.onstart = function () { button.classList.add('listening'); setStatus('מקשיב…'); };
    state.recognition.onend = function () { button.classList.remove('listening'); if (!state.busy) setStatus('מוכן לעזור בכל שאלה'); };
    state.recognition.onresult = function (event) { ui.input.value = event.results[0][0].transcript; autoGrow(); ui.input.focus(); };
    button.addEventListener('click', function () { try { state.recognition.start(); } catch (error) {} });
  }

  ui.panel.querySelector('[data-ai-context]').textContent = contextLabel(); renderPrompts(); restoreMessages(); renderHistory(); setupVoice();
  if (activeCloud() && activeCloud().onAuthChange) activeCloud().onAuthChange(function (event, session) {
    var nextKey = conversationStorageKey(session && session.user ? session.user.id : 'guest');
    if (nextKey === storageKey) return;
    storageKey = nextKey;
    state.messages = [];
    restoreMessages();
    renderHistory();
  });
  ui.orb.addEventListener('click', function () { setOpen(!state.open); });
  ui.panel.querySelector('[data-ai-close]').addEventListener('click', function () { setOpen(false); });
  ui.panel.querySelector('[data-ai-clear]').addEventListener('click', function () { state.messages = []; persistMessages(); renderHistory(); setStatus('שיחה חדשה'); });
  ui.panel.querySelector('[data-ai-privacy]').addEventListener('click', function () { addMessage('assistant', 'אני שולח ל־Google Gemini רק את השאלה, היסטוריית השיחה הקצרה ותקציר הטיול: יעד, תאריכים, פעילויות ומקומות ששמרת. מסמכים, סיסמאות, GPS ופרטי הכספת אינם נשלחים. במסלול החינמי Google עשויה להשתמש בתוכן לשיפור מוצריה.'); });
  ui.form.addEventListener('submit', function (event) { event.preventDefault(); sendMessage(); });
  ui.input.addEventListener('input', autoGrow);
  ui.input.addEventListener('keydown', function (event) { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } });
  window.addEventListener('travelmate:ask-ai', function (event) {
    var prompt = trimText(event.detail && event.detail.prompt, 4000);
    setOpen(true);
    if (prompt) { ui.input.value = prompt; autoGrow(); }
    ui.input.focus();
  });
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && state.open) setOpen(false); });
})();

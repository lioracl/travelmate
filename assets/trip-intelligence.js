(function () {
  'use strict';

  if (window.TravelMateTripIntelligence) return;

  var MODE = { NEW_TRIP: 'NEW_TRIP', EXISTING_TRIP: 'EXISTING_TRIP' };
  var TYPE_META = {
    'זוגי': { icon: 'fa-heart', prompt: 'דגש על קצב זוגי, חוויות רומנטיות, ערבים, מסעדות, תצפיות וזמן רגוע.' },
    'משפחתי': { icon: 'fa-people-roof', prompt: 'דגש על התאמה לילדים, תחבורה מעשית, הפסקות ואפשרויות ליום גשום.' },
    'סולו': { icon: 'fa-user', prompt: 'דגש על גמישות, תנועה בטוחה ונוחה, תרבות והזדמנויות חברתיות.' },
    'חברים': { icon: 'fa-user-group', prompt: 'דגש על חוויות משותפות, אוכל, בילוי ופעילויות לקבוצה.' }
  };
  var newTripSessionId = String(Date.now());
  var states = {};
  function emptyState(key) { return { key: key, context: null, fingerprint: '', answer: '', prompt: '', responseData: null, responseId: '', pendingSave: false, stale: false, busy: false, returnFocus: null, status: 'new' }; }
  var state = emptyState('NEW_TRIP:' + newTripSessionId);
  states[state.key] = state;
  var ui = {};

  function contextKey(context) { return context.contextMode + ':' + (context.tripId || context.sessionId || 'general'); }
  function bindContext(context) {
    var key = contextKey(context);
    if (!states[key]) states[key] = emptyState(key);
    state = states[key];
    state.context = context;
    return state;
  }

  function clean(value, limit) { return String(value == null ? '' : value).trim().slice(0, limit || 200); }
  function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, function (character) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]; }); }
  function daysBetween(start, end) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '') || !/^\d{4}-\d{2}-\d{2}$/.test(end || '')) return 0;
    return Math.max(0, Math.round((new Date(end + 'T12:00:00') - new Date(start + 'T12:00:00')) / 86400000));
  }
  function supportedType(value) { return Object.prototype.hasOwnProperty.call(TYPE_META, value) ? value : ''; }
  function normalizeItinerary(items) {
    return Array.isArray(items) ? items.slice(0, 40).map(function (item) { return { date: clean(item.date, 10) || null, time: clean(item.time, 5) || null, title: clean(item.title || item.name, 160), category: clean(item.category, 60), duration: Number(item.duration || 0) || null, done: Boolean(item.done) }; }).filter(function (item) { return item.title; }) : [];
  }
  function normalizePlaces(items) {
    return Array.isArray(items) ? items.slice(0, 30).map(function (item) { return { name: clean(item.name || item.title, 160), category: clean(item.category, 60), date: clean(item.date, 10) || null, time: clean(item.time, 5) || null }; }).filter(function (item) { return item.name; }) : [];
  }
  function normalizeLodging(value) {
    var items = Array.isArray(value) ? value : value ? [value] : [];
    var result = items.slice(0, 3).map(function (item) { return { name: clean(item.name || item.title, 160), area: clean(item.area || item.address || item.locationName, 180), date: clean(item.date, 10) || null }; }).filter(function (item) { return item.name || item.area; });
    return result.length ? result : null;
  }
  function normalizeTransport(value) {
    if (!value || typeof value !== 'object') return null;
    var result = { mode: clean(value.mode || value.type, 60), origin: clean(value.origin || value.from, 120), destination: clean(value.destination || value.to, 120), carrier: clean(value.carrier || value.provider, 100), date: clean(value.date, 10) || null, time: clean(value.time, 5) || null };
    return Object.keys(result).some(function (key) { return result[key]; }) ? result : null;
  }
  function normalizeContext(input, mode) {
    input = input || {};
    var startDate = clean(input.startDate || input.start, 10);
    var endDate = clean(input.endDate || input.end, 10);
    var budget = Number(input.budget || 0);
    return {
      contextMode: mode || MODE.NEW_TRIP,
      tripId: clean(input.tripId || input.id, 100) || null,
      sessionId: clean(input.sessionId, 100) || null,
      destination: clean(input.destination || input.city, 120),
      country: clean(input.country, 120),
      startDate: startDate || null,
      endDate: endDate || null,
      durationDays: Number(input.durationDays || input.days || daysBetween(startDate, endDate)) || null,
      budget: Number.isFinite(budget) && budget > 0 ? budget : null,
      currency: clean(input.currency, 12) || 'EUR',
      tripType: supportedType(clean(input.tripType || input.type, 40)) || null,
      preferences: Array.isArray(input.preferences) ? input.preferences.map(function (item) { return clean(item, 80); }).filter(Boolean).slice(0, 2) : [],
      itineraryContext: normalizeItinerary(input.itineraryContext || input.activities),
      savedPlacesContext: normalizePlaces(input.savedPlacesContext || input.savedPlaces),
      lodgingContext: normalizeLodging(input.lodgingContext),
      transportContext: normalizeTransport(input.transportContext)
    };
  }
  function fingerprint(context) {
    return JSON.stringify([context.contextMode, context.tripId, context.destination, context.country, context.startDate, context.endDate, context.durationDays, context.budget, context.currency, context.tripType, context.preferences, context.itineraryContext, context.savedPlacesContext, context.lodgingContext, context.transportContext]);
  }
  function monthLabel(date) {
    if (!date) return '';
    try { return new Intl.DateTimeFormat('he-IL', { month: 'long' }).format(new Date(date + 'T12:00:00')); } catch (error) { return ''; }
  }
  function contextSummary(context) {
    return [context.tripType, context.durationDays ? context.durationDays + ' ימים' : '', monthLabel(context.startDate)].filter(Boolean).join(' · ');
  }
  function updateBannerState() {
    if (!ui.bannerState) return;
    var labels = { 'new': 'חדש', saved: 'נשמר במסמכים', stale: 'דורש רענון' };
    ui.bannerState.textContent = labels[state.status] || labels.new;
    ui.bannerState.dataset.state = state.status;
  }
  function promptFor(context) {
    var typeInstruction = TYPE_META[context.tripType] ? TYPE_META[context.tripType].prompt : '';
    if (context.contextMode === MODE.EXISTING_TRIP) {
      return [
        'פעל כנבו, יועץ הנסיעות של TravelMate. החזר המלצות תמציתיות בעברית בלבד.',
        'זהו טיול קיים. הערך ושפר את התכנון השמור; אל תתנהג כאילו התכנון מתחיל מאפס.',
        'יעד: ' + context.destination + (context.country ? ', ' + context.country : '') + '.',
        context.tripType ? 'סוג טיול: ' + context.tripType + '. ' + typeInstruction : '',
        context.startDate && context.endDate ? 'תאריכים: ' + context.startDate + ' עד ' + context.endDate + '; ' + context.durationDays + ' ימים.' : '',
        context.budget ? 'תקציב משוער: ' + context.budget + ' ' + context.currency + '.' : '',
        context.itineraryContext.length ? 'מסלול מתוכנן ומאומת: ' + JSON.stringify(context.itineraryContext) : 'אין מסלול מובנה זמין לבדיקה.',
        context.savedPlacesContext.length ? 'מקומות שכבר נשמרו: ' + JSON.stringify(context.savedPlacesContext) : '',
        context.lodgingContext ? 'לינה קיימת: ' + JSON.stringify(context.lodgingContext) : '',
        context.transportContext ? 'תחבורה קיימת: ' + JSON.stringify(context.transportContext) : '',
        'השתמש בכותרות: הטיול שלך בקצרה; מה מתאים במיוחד לטיול הזה; מה לא לפספס; מה כבר מכוסה במסלול רק אם המבנה המאומת מוכיח זאת; מה אולי חסר; לינה; אוכל ובילוי; התניידות; טיפ לעונה; טיפ של Navo.',
        'אל תוסיף דבר למסלול. אל תמציא מחירים, שעות פתיחה, סגירות, אירועים או מצב תחבורה בזמן אמת.'
      ].filter(Boolean).join('\n');
    }
    return [
      'פעל כנבו, יועץ הנסיעות של TravelMate. החזר המלצות תמציתיות בעברית בלבד.',
      'מצב ההקשר: ' + context.contextMode + '.',
      'יעד: ' + context.destination + (context.country ? ', ' + context.country : '') + '.',
      context.tripType ? 'סוג טיול: ' + context.tripType + '. ' + typeInstruction : '',
      context.startDate && context.endDate ? 'תאריכים: ' + context.startDate + ' עד ' + context.endDate + '; ' + context.durationDays + ' ימים.' : '',
      context.budget ? 'תקציב משוער: ' + context.budget + ' ' + context.currency + '.' : '',
      context.preferences.length ? 'העדפות: ' + context.preferences.join(', ') + '.' : '',
      'התמקד בהתאמת היעד, 4–6 דברים שלא כדאי לפספס, אזורי לינה, אוכל ובילוי, התניידות, קצב מומלץ, טיפ לעונה וטיפ אישי אחד של נבו.',
      'אל תטען שיש מסלול קיים. אל תמציא מחירים, שעות פתיחה, סגירות, אירועים או מצב תחבורה בזמן אמת. השתמש בכותרות קצרות ורשימות.'
    ].filter(Boolean).join('\n');
  }
  function renderAnswer(answer) {
    var navo = window.TravelMateNavo;
    return navo && navo.formatResponse ? navo.formatResponse(answer) : '<p>' + escapeHtml(answer).replace(/\n/g, '<br>') + '</p>';
  }
  function createSheet() {
    var backdrop = document.createElement('section');
    backdrop.className = 'navo-intelligence-backdrop';
    backdrop.hidden = true;
    backdrop.innerHTML = '<div class="navo-intelligence-sheet" role="dialog" aria-modal="true" aria-labelledby="navo-intelligence-title"><header><span class="navo-intelligence-icon"><i class="fa-solid fa-compass"></i></span><div><h2 id="navo-intelligence-title">המלצות Navo</h2><p data-navo-context></p></div><button type="button" data-navo-close aria-label="סגירת המלצות Navo"><i class="fa-solid fa-xmark"></i></button></header><div class="navo-intelligence-status" data-navo-stale hidden><i class="fa-solid fa-triangle-exclamation"></i><span>הפרטים השתנו מאז יצירת ההמלצות</span><button type="button" data-navo-refresh>רענן המלצות</button></div><div class="navo-intelligence-content" data-navo-content tabindex="0"></div><footer><button type="button" data-navo-save><i class="fa-solid fa-file-circle-plus"></i> שמור למסמכים</button><button type="button" data-navo-ask><i class="fa-solid fa-comments"></i> שאל את נבו עוד</button></footer></div>';
    document.body.appendChild(backdrop);
    ui.backdrop = backdrop;
    ui.sheet = backdrop.firstElementChild;
    ui.title = backdrop.querySelector('#navo-intelligence-title');
    ui.context = backdrop.querySelector('[data-navo-context]');
    ui.content = backdrop.querySelector('[data-navo-content]');
    ui.stale = backdrop.querySelector('[data-navo-stale]');
    ui.save = backdrop.querySelector('[data-navo-save]');
    backdrop.querySelector('[data-navo-close]').addEventListener('click', closeSheet);
    backdrop.querySelector('[data-navo-refresh]').addEventListener('click', generate);
    ui.save.addEventListener('click', saveResponse);
    backdrop.querySelector('[data-navo-ask]').addEventListener('click', askMore);
    ui.content.addEventListener('click', function (event) { if (event.target.closest('[data-navo-continue]')) continueAnswer(); });
    backdrop.addEventListener('click', function (event) { if (event.target === backdrop) closeSheet(); });
    document.addEventListener('keydown', function (event) {
      if (backdrop.hidden) return;
      if (event.key === 'Escape') { closeSheet(); return; }
      if (event.key !== 'Tab') return;
      var focusable = Array.from(ui.sheet.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled])')).filter(function (element) { return element.offsetParent !== null; });
      if (!focusable.length) return;
      var first = focusable[0]; var last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
  }
  function openSheet(context) {
    bindContext(context);
    state.returnFocus = document.activeElement;
    ui.title.textContent = context.destination + ' — המלצות Navo';
    ui.context.textContent = contextSummary(context);
    ui.backdrop.hidden = false;
    document.body.classList.add('navo-intelligence-open');
    ui.sheet.querySelector('[data-navo-close]').focus();
    if (!state.answer || state.stale) generate(); else renderState();
  }
  function closeSheet() {
    ui.backdrop.hidden = true;
    document.body.classList.remove('navo-intelligence-open');
    if (state.returnFocus && state.returnFocus.isConnected) state.returnFocus.focus();
  }
  function renderState() {
    ui.stale.hidden = !state.stale;
    ui.content.innerHTML = state.answer ? renderAnswer(state.answer) : '<div class="navo-intelligence-empty"><i class="fa-solid fa-compass"></i><p>נבו יכין המלצות מותאמות לפרטי הטיול שבחרת.</p></div>';
    if (state.answer && window.TravelMateNavo && window.TravelMateNavo.responseIncomplete(state.responseData)) {
      ui.content.insertAdjacentHTML('beforeend', '<button type="button" class="navo-intelligence-continue" data-navo-continue><i class="fa-solid fa-forward-step"></i> המשך תשובה</button>');
    }
    ui.save.disabled = !state.answer || state.stale || state.busy;
  }
  async function generate() {
    if (state.busy || !state.context) return;
    var navo = window.TravelMateNavo;
    if (!navo || !navo.request) { ui.content.innerHTML = '<p class="navo-intelligence-error">נבו עדיין נטען. נסה שוב בעוד רגע.</p>'; return; }
    state.busy = true; state.stale = false; state.pendingSave = false;
    ui.stale.hidden = true; ui.content.innerHTML = '<div class="navo-intelligence-loading"><i class="fa-solid fa-spinner fa-spin"></i><p>נבו מכין המלצות שמתאימות לטיול שלך…</p></div>';
    try {
      state.prompt = promptFor(state.context);
      var result = await navo.request([{ role: 'user', content: state.prompt }], state.context);
      state.answer = result.answer; state.responseData = result.data || {}; state.responseId = 'navo-intelligence-' + Date.now(); state.fingerprint = fingerprint(state.context); state.status = 'new'; renderState(); updateBannerState();
    } catch (error) {
      state.answer = '';
      var message = /NAVO_AUTH_REQUIRED/.test(String(error && error.message)) ? 'כדי לקבל המלצות מנבו צריך להתחבר לחשבון TravelMate.' : navo.friendlyError(error);
      ui.content.innerHTML = '<p class="navo-intelligence-error">' + escapeHtml(message) + '</p>';
    } finally { state.busy = false; ui.save.disabled = !state.answer || state.stale; }
  }
  async function continueAnswer() {
    if (state.busy || !state.answer || !state.context) return;
    var activeState = state; var responseId = state.responseId; var contextFingerprint = fingerprint(state.context);
    var button = ui.content.querySelector('[data-navo-continue]');
    state.busy = true;
    if (button) { button.disabled = true; button.textContent = 'ממשיך…'; }
    var failure = '';
    try {
      var result = await window.TravelMateNavo.continueResponse(state.answer, [{ role: 'user', content: state.prompt }], state.context);
      if (state !== activeState || state.responseId !== responseId || fingerprint(state.context) !== contextFingerprint) return;
      state.answer = result.answer; state.responseData = result.data || {}; state.responseId = 'navo-intelligence-' + Date.now();
    } catch (error) {
      failure = window.TravelMateNavo.friendlyError(error);
    } finally {
      if (state === activeState) {
        state.busy = false; renderState();
        if (failure) ui.content.insertAdjacentHTML('beforeend', '<p class="navo-intelligence-error">' + escapeHtml(failure) + '</p>');
      }
    }
  }
  function noteMetadata(context) {
    return { title: 'סיכום יעד — ' + context.destination + ' — ' + context.tripType, destination: context.destination, country: context.country, tripType: context.tripType, startDate: context.startDate, endDate: context.endDate, source: 'Navo', generatedAt: new Date().toISOString() };
  }
  function saveResponse() {
    if (!state.answer || state.stale || !state.context) return;
    if (state.context.tripId) {
      var saved = window.TravelMateNavo.saveNoteForTrip(state.context.tripId, state.prompt, state.answer, noteMetadata(state.context));
      ui.save.innerHTML = saved ? '<i class="fa-solid fa-check"></i> נשמר במסמכי הטיול' : '<i class="fa-solid fa-check"></i> כבר נשמר';
      state.status = 'saved'; updateBannerState();
      ui.save.disabled = true;
      return;
    }
    state.pendingSave = true;
    ui.save.innerHTML = '<i class="fa-solid fa-clock"></i> יישמר לאחר בניית הטיול';
    ui.save.disabled = true;
  }
  function askMore() {
    if (!state.context) return;
    closeSheet();
    window.TravelMateNavo.openConversation('המשך את המלצות היעד עבור הטיול הזה. שאל אותי במה להתמקד ואל תחזור על המידע שכבר נתת.', state.context);
  }
  function attachPendingToTrip(trip) {
    if (!state.pendingSave || !state.answer || !trip) return false;
    var context = normalizeContext(Object.assign({}, state.context || {}, trip), MODE.NEW_TRIP);
    context.tripId = String(trip.id);
    var added = window.TravelMateNavo && window.TravelMateNavo.appendNote(trip, state.prompt, state.answer, noteMetadata(context));
    if (added) state.pendingSave = false;
    return Boolean(added);
  }
  function formContext(form) {
    return normalizeContext({ sessionId: 'new-trip-' + newTripSessionId, destination: form.elements.city.value, country: form.elements.country.value, startDate: form.elements.start.value, endDate: form.elements.end.value, budget: form.elements.budget.value, currency: 'EUR', tripType: form.elements.type.value }, MODE.NEW_TRIP);
  }
  function syncNewTrip(form) {
    var context = formContext(form);
    var ready = Boolean(context.destination && context.tripType);
    ui.banner.hidden = !ready;
    if (!ready) return;
    bindContext(context);
    ui.banner.querySelector('strong').textContent = 'נבו מכיר את ' + context.destination;
    ui.banner.querySelector('p').textContent = 'מה כדאי לדעת לטיול ' + context.tripType + (context.durationDays ? ' של ' + context.durationDays + ' ימים?' : '?');
    if (state.answer && state.fingerprint !== fingerprint(context)) { state.stale = true; state.status = 'stale'; ui.stale.hidden = false; updateBannerState(); }
  }
  function enhanceTripType(form) {
    var select = form.elements.type;
    var supported = Array.from(select.options).map(function (option) { return supportedType(option.value); }).filter(Boolean);
    if (!supported.length) return;
    var field = document.createElement('fieldset'); field.className = 'navo-trip-types'; field.innerHTML = '<legend>סוג הטיול</legend><div></div>';
    var controls = field.querySelector('div');
    supported.forEach(function (type) {
      var button = document.createElement('button'); button.type = 'button'; button.dataset.tripType = type; button.innerHTML = '<i class="fa-solid ' + TYPE_META[type].icon + '"></i><span>' + type + '</span>';
      button.addEventListener('click', function () { select.value = type; select.dispatchEvent(new Event('change', { bubbles: true })); }); controls.appendChild(button);
    });
    select.closest('label').classList.add('navo-native-trip-type'); select.closest('label').after(field);
    function render() { controls.querySelectorAll('button').forEach(function (button) { var selected = button.dataset.tripType === select.value; button.classList.toggle('is-selected', selected); button.setAttribute('aria-pressed', String(selected)); }); }
    select.addEventListener('change', render); render();
  }
  function formatHebrewDate(value) {
    var match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? match[3] + '.' + match[2] + '.' + match[1] : '';
  }
  function enhanceDateDisplays(form) {
    ['start', 'end'].forEach(function (name) {
      var input = form.elements[name];
      if (!input || input.dataset.navoDateDisplay) return;
      input.dataset.navoDateDisplay = 'true'; input.lang = 'he-IL'; input.dir = 'ltr';
      var display = document.createElement('small'); display.className = 'navo-date-display'; display.hidden = true; display.setAttribute('aria-live', 'polite');
      input.insertAdjacentElement('afterend', display);
      function render() { var date = formatHebrewDate(input.value); display.textContent = date ? 'התאריך שנבחר: ' + date : ''; display.hidden = !date; }
      input.addEventListener('input', render); input.addEventListener('change', render); render();
    });
  }
  function initNewTrip() {
    var form = document.querySelector('[data-destination-form]');
    if (!form || form.dataset.navoIntelligence) return;
    form.dataset.navoIntelligence = 'true';
    var cityField = form.elements.city.closest('label');
    var countryField = form.elements.country.closest('label');
    if (cityField && countryField) form.insertBefore(cityField, countryField);
    enhanceTripType(form);
    enhanceDateDisplays(form);
    var banner = document.createElement('aside'); banner.className = 'navo-trip-banner'; banner.hidden = true; banner.innerHTML = '<span><i class="fa-solid fa-compass"></i></span><div><strong></strong><p></p></div><button type="button"><i class="fa-solid fa-wand-magic-sparkles"></i> לצפייה בהמלצות</button>';
    var submit = form.querySelector('[type="submit"]'); form.insertBefore(banner, submit); ui.banner = banner;
    banner.querySelector('button').addEventListener('click', function () { openSheet(formContext(form)); });
    form.addEventListener('input', function () { syncNewTrip(form); }); form.addEventListener('change', function () { syncNewTrip(form); });
    syncNewTrip(form);
  }

  var existingTransientTypes = {};
  function canonicalTrip(tripId) {
    var trips = window.TravelMateCloud && window.TravelMateCloud.getLocalTrips ? window.TravelMateCloud.getLocalTrips() || [] : [];
    var trip = trips.find(function (item) { return String(item.id) === String(tripId); });
    if (trip) return trip;
    try { trips = JSON.parse(localStorage.getItem('travelmate-trips') || '[]'); } catch (error) { trips = []; }
    return trips.find(function (item) { return String(item.id) === String(tripId); }) || null;
  }
  function existingContext(trip) {
    var savedPlaces = Array.isArray(trip.savedPlaces) ? trip.savedPlaces : [];
    var lodging = savedPlaces.filter(function (place) { return /מלון|לינה|hotel|hostel/i.test(String(place.category || '') + ' ' + String(place.name || '')); });
    return normalizeContext({
      id: trip.id, destination: trip.city || trip.destination, country: trip.country,
      start: trip.start, end: trip.end, days: trip.days, budget: trip.budget,
      currency: trip.currency || 'EUR', type: supportedType(trip.type) || existingTransientTypes[String(trip.id)],
      preferences: trip.preferences, activities: trip.activities, savedPlaces: savedPlaces,
      lodgingContext: lodging, transportContext: trip.transportContext || trip.transport || trip.transportation
    }, MODE.EXISTING_TRIP);
  }
  function updateExistingBanner(context) {
    if (!ui.banner) return;
    var hasType = Boolean(context.tripType);
    ui.banner.querySelector('strong').textContent = hasType ? 'נבו מכיר את ' + context.destination : 'התאם את ההמלצות לטיול שלך';
    ui.banner.querySelector('p').textContent = hasType ? 'יש לי המלצות מותאמות לטיול ' + context.tripType + (context.durationDays ? ' של ' + context.durationDays + ' ימים' : '') : 'בחרו סוג טיול כדי לקבל המלצות מותאמות ל־' + context.destination;
    ui.banner.querySelector('[data-navo-open]').hidden = !hasType;
    var setup = ui.banner.querySelector('[data-navo-existing-types]');
    setup.hidden = hasType;
    setup.querySelectorAll('button').forEach(function (button) { button.setAttribute('aria-pressed', String(button.dataset.tripType === context.tripType)); });
    updateBannerState();
  }
  function markExistingStale(context) {
    bindContext(context);
    if (state.answer && state.fingerprint !== fingerprint(context)) {
      state.stale = true; state.status = 'stale';
      ui.stale.hidden = false;
    }
    if (!ui.backdrop.hidden && state.context.tripId === context.tripId) {
      ui.title.textContent = context.destination + ' — המלצות Navo';
      ui.context.textContent = contextSummary(context);
      renderState();
    }
    updateExistingBanner(context);
  }
  function initExistingTrip() {
    var overview = document.querySelector('#overview');
    var tripId = new URLSearchParams(location.search).get('id');
    if (!overview || !tripId || !window.travelMateTripReady) return;
    Promise.resolve(window.travelMateTripReady).then(function (readyTrip) {
      var trip = readyTrip || canonicalTrip(tripId);
      if (!trip || String(trip.id) !== String(tripId)) return;
      var context = existingContext(trip);
      bindContext(context);
      var banner = document.createElement('aside');
      banner.className = 'navo-trip-banner navo-existing-trip-banner';
      banner.innerHTML = '<span><i class="fa-solid fa-compass"></i></span><div><small class="navo-trip-state" data-navo-state></small><strong></strong><p></p><div class="navo-existing-type-setup" data-navo-existing-types></div></div><button type="button" data-navo-open><i class="fa-solid fa-wand-magic-sparkles"></i> לצפייה בהמלצות</button>';
      var types = banner.querySelector('[data-navo-existing-types]');
      Object.keys(TYPE_META).forEach(function (type) {
        var button = document.createElement('button'); button.type = 'button'; button.dataset.tripType = type; button.innerHTML = '<i class="fa-solid ' + TYPE_META[type].icon + '"></i> ' + type;
        button.addEventListener('click', function () {
          existingTransientTypes[String(tripId)] = type;
          markExistingStale(existingContext(canonicalTrip(tripId) || trip));
        });
        types.appendChild(button);
      });
      var summary = document.querySelector('.trip-overview-summary');
      (summary || overview).insertAdjacentElement('afterend', banner);
      ui.banner = banner; ui.bannerState = banner.querySelector('[data-navo-state]');
      banner.querySelector('[data-navo-open]').addEventListener('click', function () { openSheet(existingContext(canonicalTrip(tripId) || trip)); });
      updateExistingBanner(context);
      function refresh() { var latest = canonicalTrip(tripId); if (latest) { trip = latest; markExistingStale(existingContext(latest)); } }
      ['travelmate:planner-rendered', 'travelmate:places-updated', 'travelmate:activities-updated'].forEach(function (eventName) { document.addEventListener(eventName, refresh); });
      window.addEventListener('focus', refresh);
      document.addEventListener('submit', function (event) { if (event.target.matches('[data-total-budget-form]')) setTimeout(refresh, 0); }, true);
    });
  }

  createSheet(); initNewTrip(); initExistingTrip();
  window.TravelMateTripIntelligence = { MODE: MODE, normalizeContext: normalizeContext, promptFor: promptFor, renderAnswer: renderAnswer, open: openSheet, attachPendingToTrip: attachPendingToTrip };
})();

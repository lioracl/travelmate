(function (root) {
  'use strict';

  var SCHEMA_VERSION = 1;
  var MAX_AGENDA_ITEMS = 8;
  var AGENDA_HORIZON_MS = 36 * 60 * 60 * 1000;
  var WEATHER_FRESH_MS = 30 * 60 * 1000;

  function clampCount(value) {
    var number = Math.floor(Number(value || 0));
    return Number.isFinite(number) ? Math.max(0, Math.min(999, number)) : 0;
  }

  function cleanText(value, maxLength) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, maxLength || 160);
  }

  function scheduleMode(record) {
    var mode = cleanText(record && (record.scheduleMode || record.timingMode || record.flexibility), 20).toLowerCase();
    if (mode === 'flexible' || mode === 'free') return 'flexible';
    if (mode === 'window' || mode === 'time-window' || mode === 'time_window') return 'window';
    return mode || 'planned';
  }

  function localDateTimeIso(date, time) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) || !/^\d{2}:\d{2}$/.test(String(time || ''))) return null;
    var value = new Date(String(date) + 'T' + String(time) + ':00');
    if (!Number.isFinite(value.getTime()) || value.getFullYear() !== Number(date.slice(0, 4)) ||
        value.getMonth() + 1 !== Number(date.slice(5, 7)) || value.getDate() !== Number(date.slice(8, 10)) ||
        value.getHours() !== Number(time.slice(0, 2)) || value.getMinutes() !== Number(time.slice(3, 5))) return null;
    return value.toISOString();
  }

  function agendaItem(record, kind, privacyMode) {
    var startAt = localDateTimeIso(record && record.date, record && record.time);
    if (!startAt) return null;
    var rawDuration = Number(record && record.duration);
    var duration = Number.isFinite(rawDuration) && rawDuration > 0 ? Math.min(1440, rawDuration) : 60;
    var startMs = new Date(startAt).getTime();
    var title = privacyMode === 'redacted' ? '' : cleanText(record && (record.title || record.name), 120);
    var location = privacyMode === 'redacted' ? '' : cleanText(record && (record.locationName || record.address), 120);
    return {
      id: cleanText(record && record.id, 180),
      kind: kind,
      title: title,
      location: location,
      time: cleanText(record && record.time, 5),
      startAt: startAt,
      endAt: new Date(startMs + duration * 60000).toISOString(),
      startEpochMs: startMs,
      endEpochMs: startMs + duration * 60000
    };
  }

  function buildAgenda(trip, now, privacyMode, todayApi) {
    var nowMs = now.getTime();
    var horizon = nowMs + AGENDA_HORIZON_MS;
    var items = [];
    var dayCache = Object.create(null);
    function addRecord(record, kind) {
      if (!record || record.done === true || !record.date) return;
      var mode = scheduleMode(record);
      if (todayApi && typeof todayApi.agenda === 'function') {
        if (!dayCache[record.date]) dayCache[record.date] = todayApi.agenda(trip, record.date);
        var canonical = dayCache[record.date].find(function (item) {
          return item.kind === kind && String(item.id) === String(record.id);
        });
        if (canonical) {
          if (canonical.done) return;
          mode = canonical.scheduleMode;
        }
      }
      if (mode === 'flexible' || mode === 'window') return;
      var item = agendaItem(record, kind, privacyMode);
      if (item) items.push(item);
    }
    (trip && trip.activities || []).forEach(function (record) { addRecord(record, 'activity'); });
    (trip && trip.savedPlaces || []).forEach(function (record) { addRecord(record, 'place'); });
    return items.filter(function (item) {
      var start = new Date(item.startAt).getTime();
      var end = new Date(item.endAt).getTime();
      return end > nowMs && start <= horizon;
    }).sort(function (a, b) {
      return a.startAt.localeCompare(b.startAt) || a.id.localeCompare(b.id);
    }).slice(0, MAX_AGENDA_ITEMS);
  }

  function weatherSnapshot(weather, now, observedAt) {
    weather = weather || {};
    var observedMs = observedAt == null ? now.getTime() : Number(observedAt);
    var validUntilMs = observedMs + WEATHER_FRESH_MS;
    var ready = weather.ready === true && Number.isFinite(observedMs) && observedMs > 0 &&
      observedMs <= now.getTime() + 60000 && validUntilMs > now.getTime();
    var temperature = weather.temperature == null ? NaN : Number(weather.temperature);
    return {
      ready: ready,
      label: ready ? cleanText(weather.currentLabel, 80) : '',
      temperatureC: ready && Number.isFinite(temperature) ? Math.round(temperature) : null,
      validUntil: ready ? new Date(validUntilMs).toISOString() : null,
      validUntilEpochMs: ready ? validUntilMs : null
    };
  }

  function phaseSnapshot(trip, now, todayApi) {
    if (!todayApi || typeof todayApi.model !== 'function') return { phase: 'UNKNOWN', today: '', dayIndex: null, tripDays: Number(trip && trip.days || 0) };
    var model = todayApi.model(trip, now);
    return {
      phase: cleanText(model && model.phase, 16) || 'UNKNOWN',
      today: cleanText(model && model.today, 10),
      dayIndex: model && model.dayIndex != null && Number.isFinite(Number(model.dayIndex)) ? Number(model.dayIndex) : null,
      tripDays: Math.max(0, Number(model && model.tripDays || trip && trip.days || 0))
    };
  }

  function validatedTimeZone(value) {
    var name = cleanText(value, 80);
    if (!name) return '';
    try { return new Intl.DateTimeFormat('en-US', { timeZone: name }).resolvedOptions().timeZone; }
    catch (error) { return ''; }
  }

  function currencyCode(value, fallback) {
    var code = cleanText(value || fallback || '', 3).toUpperCase();
    return /^[A-Z]{3}$/.test(code) ? code : (fallback == null ? 'EUR' : fallback);
  }

  function tripCurrency(trip) {
    var explicit = currencyCode(trip && (trip.localCurrency || trip.currency), '');
    if (explicit) return explicit;
    var country = cleanText(trip && trip.country, 80).toLowerCase();
    var groups = {
      ILS:['ישראל','israel'], CZK:['צכיה',"צ'כיה",'הרפובליקה הצכית','czechia','czech republic'], JPY:['יפן','japan'],
      GBP:['בריטניה','אנגליה','סקוטלנד','וויילס','united kingdom','uk','england','scotland','wales'], CHF:['שווייץ','שוויץ','switzerland'],
      PLN:['פולין','poland'], HUF:['הונגריה','hungary'], TRY:['טורקיה','turkey','türkiye'], USD:['ארצות הברית','ארה"ב','usa','united states'],
      CAD:['קנדה','canada'], DKK:['דנמרק','denmark'], SEK:['שוודיה','sweden'], NOK:['נורווגיה','norway'], RON:['רומניה','romania'],
      ISK:['איסלנד','iceland'], AUD:['אוסטרליה','australia'], NZD:['ניו זילנד','new zealand'], CNY:['סין','china'],
      KRW:['קוריאה הדרומית','דרום קוריאה','south korea'], INR:['הודו','india'], THB:['תאילנד','thailand'], MXN:['מקסיקו','mexico'],
      BRL:['ברזיל','brazil'], ZAR:['דרום אפריקה','south africa']
    };
    var found = Object.keys(groups).find(function(code){ return groups[code].some(function(name){ return country === name || country.indexOf(name) >= 0; }); });
    return found || 'EUR';
  }

  function ratePerEur(cache, code) {
    code = currencyCode(code, 'EUR');
    if (code === 'EUR') return 1;
    var rates = cache && cache.rates || {};
    var value = Number(rates[code] || (code === 'ILS' && cache && cache.rate) || 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function convertWithCache(amount, from, to, cache) {
    var fromRate = ratePerEur(cache, from), toRate = ratePerEur(cache, to);
    return fromRate && toRate ? Number(amount || 0) * toRate / fromRate : null;
  }

  function localDay(date) {
    return date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0') + '-' + String(date.getDate()).padStart(2,'0');
  }

  function budgetWidgetSnapshot(trip, now, cache) {
    trip = trip || {};
    var local = tripCurrency(trip);
    var home = currencyCode(trip.secondaryCurrency, 'ILS');
    var expenses = Array.isArray(trip.expenses) ? trip.expenses : [];
    var complete = true;
    var spent = 0;
    var paceSpent = 0;
    var today = localDay(now);
    var start = /^\d{4}-\d{2}-\d{2}$/.test(String(trip.start||'')) ? String(trip.start) : '';
    var end = /^\d{4}-\d{2}-\d{2}$/.test(String(trip.end||'')) ? String(trip.end) : '';
    expenses.forEach(function(expense){
      var amount = Number(expense && expense.amount || 0);
      if (!Number.isFinite(amount) || amount < 0) return;
      var code = currencyCode(expense && expense.currency, 'EUR');
      var localAmount = code === local ? amount : convertWithCache(amount, code, local, cache);
      if (localAmount == null) { complete = false; return; }
      spent += localAmount;
      var date = String(expense && expense.date || '');
      if ((!start || !date || date >= start) && (!end || !date || date <= end) && (!date || date <= today)) paceSpent += localAmount;
    });
    var limitEur = Math.max(0, Number(trip.budget || 0));
    var limit = local === 'EUR' ? limitEur : convertWithCache(limitEur, 'EUR', local, cache);
    if (limitEur && limit == null) complete = false;
    var unlimited = trip.budgetUnlimited === true;
    var startDate = start ? new Date(start + 'T00:00:00') : null;
    var endDate = end ? new Date(end + 'T00:00:00') : null;
    var day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var before = Boolean(startDate && day < startDate);
    var completed = Boolean(endDate && day > endDate);
    var elapsed = 1;
    if (startDate && !before) {
      var effective = completed ? endDate : day;
      elapsed = Math.max(1, Math.round((effective - startDate) / 86400000) + 1);
    }
    var paceState = before ? 'before-trip' : completed ? 'completed' : expenses.length ? 'active' : 'unavailable';
    var dailyPace = !before && complete ? paceSpent / Math.max(1, elapsed) : 0;
    var safeLimit = complete && limit != null ? Math.max(0, limit) : 0;
    var remaining = !unlimited && complete ? Math.max(0, safeLimit - spent) : 0;
    var overrun = !unlimited && complete ? Math.max(0, spent - safeLimit) : 0;
    var savedAt = Number(cache && cache.savedAt || 0);
    var fxRate = convertWithCache(1, local, home, cache);
    var freshness = fxRate && savedAt > 0 ? (now.getTime() - savedAt <= 43200000 ? 'fresh' : 'stale') : 'unavailable';
    return Object.freeze({
      ready: complete,
      mode: unlimited ? 'unlimited' : 'limited',
      tripCurrency: local,
      homeCurrency: home,
      spent: complete ? Math.round(spent * 100) / 100 : 0,
      limit: unlimited || !complete ? null : Math.round(safeLimit * 100) / 100,
      remaining: unlimited || !complete ? null : Math.round(remaining * 100) / 100,
      overrun: unlimited || !complete ? null : Math.round(overrun * 100) / 100,
      dailyPace: complete ? Math.round(dailyPace * 100) / 100 : 0,
      paceState: paceState,
      fx: Object.freeze({
        fromCurrency: local, toCurrency: home,
        rate: freshness === 'unavailable' ? null : Math.round(fxRate * 1000000) / 1000000,
        convertedSpentValue: freshness === 'unavailable' || !complete ? null : Math.round(spent * fxRate * 100) / 100,
        asOf: freshness === 'unavailable' ? '' : cleanText(cache && cache.date, 40),
        cachedAtEpochMs: freshness === 'unavailable' ? null : savedAt, freshness: freshness
      }),
      actions: Object.freeze({budget:'budget',quickExpense:'quick-expense',converter:'converter'})
    });
  }

  function buildSnapshot(options) {
    options = options || {};
    var trip = options.trip || {};
    var now = options.now instanceof Date ? options.now : new Date(options.now == null ? Date.now() : options.now);
    var accountId = cleanText(options.accountId, 180);
    var tripId = cleanText(trip.id, 180);
    if (!Number.isFinite(now.getTime())) throw new Error('INVALID_WIDGET_TIME');
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,179}$/.test(accountId) || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,179}$/.test(tripId)) throw new Error('INVALID_WIDGET_SCOPE');
    var privacyMode = options.privacyMode === 'standard' ? 'standard' : 'redacted';
    var agenda = buildAgenda(trip, now, privacyMode, options.todayApi);
    var phase = phaseSnapshot(trip, now, options.todayApi);
    var updatedAt = now.toISOString();
    return Object.freeze({
      schemaVersion: SCHEMA_VERSION,
      accountId: accountId,
      tripOwnerId: cleanText(options.ownerId || trip.ownerId || accountId, 180),
      tripId: tripId,
      destination: privacyMode === 'redacted' ? '' : cleanText(trip.city || trip.name, 100),
      destinationTimeZone: validatedTimeZone(trip.timeZone || trip.timezone),
      clockBasis: 'device-local', // Today currently uses the device clock; never imply destination-local precision.
      privacyMode: privacyMode,
      phase: phase.phase,
      today: phase.today,
      dayIndex: phase.dayIndex,
      tripDays: phase.tripDays,
      agenda: agenda,
      weather: weatherSnapshot(options.weather, now, options.weatherObservedAt),
      unreadChanges: clampCount(options.unreadCount),
      budgetWidget: options.budgetWidget || budgetWidgetSnapshot(trip, now, options.fxCache || null),
      updatedAt: updatedAt,
      updatedAtEpochMs: now.getTime(),
      expiresAt: new Date(now.getTime() + WEATHER_FRESH_MS).toISOString(),
      expiresAtEpochMs: now.getTime() + WEATHER_FRESH_MS,
      deepLinks: Object.freeze({
        overview: 'travelmate://trip/' + encodeURIComponent(cleanText(trip.id, 180)) + '?view=overview',
        plan: 'travelmate://trip/' + encodeURIComponent(cleanText(trip.id, 180)) + '?view=plan',
        changes: 'travelmate://trip/' + encodeURIComponent(cleanText(trip.id, 180)) + '?view=overview&panel=changes'
      })
    });
  }

  function plugin() {
    return root && root.Capacitor && root.Capacitor.Plugins && root.Capacitor.Plugins.TravelMateWidgetBridge || null;
  }

  function appPlugin() {
    return root && root.Capacitor && root.Capacitor.Plugins && root.Capacitor.Plugins.App || null;
  }

  function parseDeepLink(url) {
    try {
      var parsed = new URL(String(url || ''));
      if (parsed.protocol !== 'travelmate:' || parsed.hostname !== 'trip') return null;
      var tripId = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,179}$/.test(tripId) || parsed.username || parsed.password || parsed.port) return null;
      var view = parsed.searchParams.get('view') || 'overview';
      if (!/^(overview|plan|places|budget|transport)$/.test(view)) view = 'overview';
      var panel = view === 'overview' && parsed.searchParams.get('panel') === 'changes' ? 'changes' : '';
      var action = view === 'budget' && /^(quick-expense|converter)$/.test(parsed.searchParams.get('action') || '') ? parsed.searchParams.get('action') : '';
      return { tripId: tripId, view: view, panel: panel, action: action };
    } catch (error) { return null; }
  }

  var api = { buildSnapshot: buildSnapshot, buildAgenda: buildAgenda, buildBudgetWidget: budgetWidgetSnapshot, parseDeepLink: parseDeepLink, schemaVersion: SCHEMA_VERSION };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (!root || typeof document === 'undefined') return;
  root.TravelMateNativeWidgetSnapshot = api;

  var state = { session: null, trip: null, weather: null, weatherObservedAt: 0, timer: 0, generation: 0, activeAccountId: '', bridgeQueue: Promise.resolve(), authSubscription: null };

  function queueBridge(action) {
    state.bridgeQueue = state.bridgeQueue.catch(function () {}).then(action);
    return state.bridgeQueue;
  }

  function readFxCache(trip) {
    if (!root.localStorage) return null;
    try { return JSON.parse(root.localStorage.getItem('travelmate-eur-rates:' + tripCurrency(trip)) || 'null'); } catch (error) { return null; }
  }

  function notificationSnapshot() {
    var context = root.TravelMateTripChangeContext;
    return context && typeof context.snapshot === 'function' ? context.snapshot() : { unreadCount: 0 };
  }

  function currentTrip() {
    var id = new URLSearchParams(root.location.search).get('id');
    var store = root.TravelMateTripStore;
    return id && store && typeof store.getTrip === 'function' ? store.getTrip(id) : state.trip;
  }

  function scheduleSync() {
    if (state.timer) return;
    state.timer = root.setTimeout(function () {
      state.timer = 0;
      syncNow().catch(function (error) { console.warn('TravelMate widget update deferred', error && error.message); });
    }, 80);
  }

  async function syncNow() {
    var bridge = plugin();
    var session = state.session;
    if (!bridge || typeof bridge.updateSnapshot !== 'function' || !session || !session.user) return;
    var accountId = String(session.user.id || '');
    var trip = currentTrip();
    if (!trip && !state.trip) return; // Home retains the last authorized widget until sign-out/account change.
    var cloud = root.TravelMateCloud;
    var cached = cloud && typeof cloud.getCachedTrips === 'function' ? cloud.getCachedTrips() : [];
    var authorized = trip && cached.some(function (item) {
      return String(item.id) === String(trip.id) && String(item.ownerId || accountId) === String(trip.ownerId || accountId);
    });
    if (!accountId || state.activeAccountId !== accountId || !authorized) { await clearNativeSnapshot(); return; }
    var generation = state.generation;
    var notification = notificationSnapshot();
    var weatherContext = root.TravelMateWeatherContext;
    state.weather = weatherContext && typeof weatherContext.snapshot === 'function' ? weatherContext.snapshot() : state.weather;
    var snapshot = buildSnapshot({
      trip: trip,
      now: new Date(),
      todayApi: root.TravelMateToday,
      weather: state.weather,
      weatherObservedAt: state.weatherObservedAt,
      unreadCount: notification.unreadCount,
      fxCache: readFxCache(trip),
      accountId: accountId,
      ownerId: trip.ownerId || accountId,
      // Home-screen widgets can be visible while the device is locked.
      privacyMode: 'redacted'
    });
    await queueBridge(function () {
      if (generation !== state.generation || !state.session || !state.session.user || String(state.session.user.id) !== accountId) return;
      return bridge.updateSnapshot({ snapshot: snapshot });
    });
  }

  async function clearNativeSnapshot() {
    if (state.timer) { root.clearTimeout(state.timer); state.timer = 0; }
    var bridge = plugin();
    if (bridge && typeof bridge.clearSnapshot === 'function') {
      try { await queueBridge(function () { return bridge.clearSnapshot(); }); }
      catch (error) { console.error('TravelMate widget snapshot clear failed', error); }
    }
  }

  function openBudgetAction(action) {
    if (!action) return Promise.resolve(false);
    var features = root.TravelMateFeatures;
    var ready = features && typeof features.load === 'function' ? features.load('budget') : Promise.resolve(true);
    return Promise.resolve(ready).then(function(){
      var actions = root.TravelMateBudgetWidgetActions;
      return actions && typeof actions.open === 'function' ? actions.open(action) : false;
    });
  }

  function handleDeepLink(url) {
    var target = parseDeepLink(url);
    if (!target) return false;
    var currentId = new URLSearchParams(root.location.search).get('id');
    if (String(currentId || '') === target.tripId && root.TravelMateNavigation && typeof root.TravelMateNavigation.open === 'function') {
      root.TravelMateNavigation.open(target.view);
      if (target.panel === 'changes') {
        var bell = document.querySelector('.trip-notification-launcher:not([hidden])');
        if (bell) bell.click();
      }
      if (target.action) openBudgetAction(target.action);
      return true;
    }
    var query = '?id=' + encodeURIComponent(target.tripId) + '&view=' + encodeURIComponent(target.view);
    if (target.panel) query += '&nativePanel=' + encodeURIComponent(target.panel);
    if (target.action) query += '&nativeAction=' + encodeURIComponent(target.action);
    root.location.href = new URL('/trip/custom/index.html', root.location.origin).href + query;
    return true;
  }

  async function installDeepLinks() {
    var app = appPlugin();
    if (!app) return;
    if (typeof app.addListener === 'function') app.addListener('appUrlOpen', function (event) { handleDeepLink(event && event.url); });
    if (typeof app.getLaunchUrl === 'function') {
      try { var launch = await app.getLaunchUrl(); if (launch && launch.url) handleDeepLink(launch.url); } catch (error) {}
    }
  }

  async function start() {
    installDeepLinks();
    if (!root.TravelMateCloud) return;
    try {
      if (root.travelMateTripReady) state.trip = await root.travelMateTripReady;
      state.session = await root.TravelMateCloud.getSession();
      state.activeAccountId = state.session && state.session.user ? String(state.session.user.id) : '';
      if (state.activeAccountId && state.trip) scheduleSync();
      else if (!state.activeAccountId) await clearNativeSnapshot();
      var pendingAction = new URLSearchParams(root.location.search).get('nativeAction') || '';
      if (/^(quick-expense|converter)$/.test(pendingAction)) openBudgetAction(pendingAction);
      if (typeof root.TravelMateCloud.onAuthChange === 'function') {
        state.authSubscription = await root.TravelMateCloud.onAuthChange(function (event, session) {
          var previous = state.session && state.session.user && String(state.session.user.id);
          var next = session && session.user && String(session.user.id);
          state.session = session || null;
          state.activeAccountId = next || '';
          if (previous !== next) { state.generation += 1; clearNativeSnapshot(); }
          if (next && state.trip) scheduleSync();
        });
      }
    } catch (error) { state.generation += 1; state.session = null; await clearNativeSnapshot(); }
  }

  ['travelmate:today-minute','travelmate:activities-updated','travelmate:places-updated','travelmate:weather-context-change','travelmate:trip-change-context','travelmate:sync-restored','travelmate:local-trips-updated','travelmate:canonical-trip-replaced','travelmate:budget-updated'].forEach(function (name) {
    root.addEventListener(name, function (event) {
      if (name === 'travelmate:weather-context-change') {
        state.weather = event.detail || null;
        state.weatherObservedAt = state.weather && state.weather.ready ? Date.now() : 0;
      }
      scheduleSync();
    });
  });
  root.addEventListener('travelmate:account-context-changed', function (event) {
    state.activeAccountId = String(event && event.detail && event.detail.userId || '');
    state.generation += 1;
    clearNativeSnapshot();
    if (state.trip && state.session && state.session.user && String(state.session.user.id) === state.activeAccountId) scheduleSync();
  });
  root.addEventListener('travelmate:trip-deleted', function (event) {
    if (event.detail && (!state.trip || String(event.detail.id) === String(state.trip.id))) {
      state.generation += 1;
      clearNativeSnapshot();
    }
  });
  root.addEventListener('online', scheduleSync);
  root.addEventListener('focus', scheduleSync);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})(typeof window !== 'undefined' ? window : globalThis);

(function (root) {
  'use strict';

  function numericId(value) {
    var number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function targetView(event) {
    var type = String(event && event.entity_type || 'trip');
    if (type === 'activity' || type === 'plan') return 'plan';
    if (type === 'place' || type === 'places') return 'places';
    if (type === 'budget') return 'budget';
    if (type === 'transport') return 'transport';
    if (type === 'lodging') return 'places';
    return 'overview';
  }

  function actionLabel(event) {
    var action = String(event && event.action || 'updated');
    var type = String(event && event.entity_type || 'trip');
    if (type === 'activity') return action === 'added' ? 'נוספה פעילות לתוכנית' : action === 'removed' ? 'פעילות הוסרה מהתוכנית' : 'פעילות בתוכנית עודכנה';
    if (type === 'place') return action === 'added' ? 'נוסף מקום לטיול' : action === 'removed' ? 'מקום הוסר מהטיול' : 'מקום בטיול עודכן';
    if (type === 'plan') return 'התוכנית היומית עודכנה';
    if (type === 'places') return 'המקומות השמורים עודכנו';
    if (type === 'budget') return 'התקציב או ההוצאות עודכנו';
    if (type === 'transport') return 'פרטי התחבורה עודכנו';
    if (type === 'lodging') return 'פרטי הלינה עודכנו';
    var summary = event && event.summary || {};
    var labels = [];
    if (summary.plan_changed) labels.push('התוכנית');
    if (summary.places_changed) labels.push('המקומות');
    if (summary.budget_changed) labels.push('התקציב');
    if (summary.transport_changed) labels.push('התחבורה');
    if (summary.lodging_changed) labels.push('הלינה');
    if (summary.trip_details_changed) labels.push('פרטי הטיול');
    return labels.length > 1 ? 'עודכנו ' + labels.join(', ') : 'פרטי הטיול עודכנו';
  }

  function externalEvents(events, userId) {
    return (events || []).filter(function (event) {
      return String(event.actor_user_id || '') !== String(userId || '');
    });
  }

  function unreadCount(events, userId, lastReadId) {
    var floor = numericId(lastReadId);
    return externalEvents(events, userId).filter(function (event) { return numericId(event.id) > floor; }).length;
  }

  var helpers = { targetView: targetView, actionLabel: actionLabel, externalEvents: externalEvents, unreadCount: unreadCount };
  if (typeof module !== 'undefined' && module.exports) module.exports = helpers;
  root.TravelMateTripChangeNotifications = helpers;
  if (typeof document === 'undefined') return;

  var cloud = root.TravelMateCloud;
  if (!cloud) return;
  var tripReady = root.travelMateTripReady || Promise.resolve(root.TravelMateTripStore && root.TravelMateTripStore.getTrip ? root.TravelMateTripStore.getTrip(document.body.dataset.tripId || '') : null);

  var state = {
    trip: null, session: null, members: [], events: [], lastReadId: 0,
    unsubscribe: null, authSubscription: null, open: false, activated: false,
    refreshPromise: null, lastRefreshAt: 0, opener: null, accountToken: 0
  };
  var ui = {};

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function currentUserId() {
    return state.session && state.session.user ? String(state.session.user.id) : '';
  }

  function ownerId() {
    return state.trip ? String(state.trip.ownerId || currentUserId()) : '';
  }

  function memberName(userId) {
    var member = state.members.find(function (item) { return String(item.user_id) === String(userId); });
    return member && member.display_name ? String(member.display_name) : 'חבר בטיול';
  }

  function eventTime(value) {
    try {
      return new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
    } catch (error) { return ''; }
  }

  function createLauncher(className, label) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', label);
    button.hidden = true;
    button.innerHTML = '<i class="fa-regular fa-bell" aria-hidden="true"></i><span class="trip-notification-label">עדכונים</span><b data-trip-notification-badge hidden aria-hidden="true"></b>';
    button.addEventListener('click', function () { openPanel(button); });
    return button;
  }

  function createUi() {
    var sidebar = document.querySelector('.sidebar');
    var settings = sidebar && sidebar.querySelector('[data-security-open]');
    ui.desktopButton = createLauncher('trip-notification-launcher', 'פתיחת עדכוני הטיול');
    if (sidebar) {
      if (settings) settings.insertAdjacentElement('beforebegin', ui.desktopButton);
      else sidebar.appendChild(ui.desktopButton);
    }

    var mobileStrong = document.querySelector('.mobile-header>strong');
    ui.mobileButton = createLauncher('trip-notification-launcher trip-notification-mobile', 'פתיחת עדכוני הטיול');
    ui.mobileButton.querySelector('.trip-notification-label').hidden = true;
    if (mobileStrong) {
      var share = mobileStrong.querySelector('[data-trip-share-whatsapp]');
      if (share) share.insertAdjacentElement('beforebegin', ui.mobileButton);
      else mobileStrong.appendChild(ui.mobileButton);
    }

    ui.panel = document.createElement('section');
    ui.panel.className = 'trip-notification-panel';
    ui.panel.hidden = true;
    ui.panel.setAttribute('role', 'dialog');
    ui.panel.setAttribute('aria-modal', 'false');
    ui.panel.setAttribute('aria-labelledby', 'trip-notification-title');
    ui.panel.innerHTML = '<header><div><span>הטיול המשותף</span><h2 id="trip-notification-title">מה השתנה?</h2></div><button type="button" data-trip-notification-close aria-label="סגירת העדכונים"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></header>' +
      '<div class="trip-notification-status" data-trip-notification-status role="status" aria-live="polite"></div>' +
      '<div class="trip-notification-list" data-trip-notification-list></div>' +
      '<footer><button type="button" data-trip-notification-read-all><i class="fa-solid fa-check-double" aria-hidden="true"></i> סמן הכול כנקרא</button><small>העדכונים נשמרים בענן ומושלמים אחרי חזרה מחיבור לא מקוון.</small></footer>';
    document.body.appendChild(ui.panel);
    ui.list = ui.panel.querySelector('[data-trip-notification-list]');
    ui.status = ui.panel.querySelector('[data-trip-notification-status]');
    ui.readAll = ui.panel.querySelector('[data-trip-notification-read-all]');
    ui.close = ui.panel.querySelector('[data-trip-notification-close]');
    ui.close.addEventListener('click', closePanel);
    ui.readAll.addEventListener('click', markAllRead);
    ui.list.addEventListener('click', function (event) {
      var button = event.target.closest('[data-trip-change-id]');
      if (!button) return;
      var item = state.events.find(function (record) { return String(record.id) === String(button.dataset.tripChangeId); });
      if (item) openEvent(item);
    });
    ui.panel.addEventListener('keydown', function (event) { if (event.key === 'Escape') { event.preventDefault(); closePanel(); } });
  }

  function setLaunchersVisible(visible) {
    [ui.desktopButton, ui.mobileButton].forEach(function (button) { if (button) button.hidden = !visible; });
    if (!visible) closePanel(false);
  }

  root.TravelMateTripChangeContext = Object.freeze({ snapshot: function () {
    return Object.freeze({ ready: Boolean(state.session && state.members.length > 1), unreadCount: unreadCount(state.events, currentUserId(), state.lastReadId) });
  }});

  function publishContext(count) {
    root.dispatchEvent(new CustomEvent('travelmate:trip-change-context', { detail: { ready: Boolean(state.session && state.members.length > 1), unreadCount: Number(count || 0) } }));
  }

  function updateBadges() {
    var count = unreadCount(state.events, currentUserId(), state.lastReadId);
    [ui.desktopButton, ui.mobileButton].forEach(function (button) {
      if (!button) return;
      var badge = button.querySelector('[data-trip-notification-badge]');
      badge.hidden = count === 0;
      badge.textContent = count > 99 ? '99+' : String(count);
      button.setAttribute('aria-label', count ? 'פתיחת עדכוני הטיול · ' + count + ' לא נקראו' : 'פתיחת עדכוני הטיול · אין עדכונים שלא נקראו');
    });
    ui.readAll.disabled = count === 0;
    publishContext(count);
  }

  function render() {
    updateBadges();
    var mine = currentUserId();
    var items = externalEvents(state.events, mine).slice().sort(function (a, b) { return numericId(b.id) - numericId(a.id); }).slice(0, 40);
    if (!items.length) {
      ui.list.innerHTML = '<div class="trip-notification-empty"><i class="fa-regular fa-bell-slash" aria-hidden="true"></i><strong>אין עדיין עדכונים מחברי הטיול</strong><span>שינויים משותפים יופיעו כאן.</span></div>';
      return;
    }
    ui.list.innerHTML = items.map(function (item) {
      var unread = numericId(item.id) > numericId(state.lastReadId);
      var canOpenExact = Boolean(item.entity_id && item.action !== 'removed' && (item.entity_type === 'activity' || item.entity_type === 'place'));
      return '<button type="button" class="trip-notification-item' + (unread ? ' is-unread' : '') + '" data-trip-change-id="' + escapeHtml(item.id) + '">' +
        '<span class="trip-notification-dot" aria-hidden="true"></span><span class="trip-notification-copy"><strong>' + escapeHtml(actionLabel(item)) + '</strong>' +
        '<small>' + escapeHtml(memberName(item.actor_user_id)) + ' · ' + escapeHtml(eventTime(item.created_at)) + '</small></span>' +
        '<span class="trip-notification-open">' + (canOpenExact ? 'לפריט' : 'למסך') + ' <i class="fa-solid fa-chevron-left" aria-hidden="true"></i></span></button>';
    }).join('');
  }

  function mergeEvent(event) {
    if (!event || !numericId(event.id)) return;
    var existing = state.events.findIndex(function (item) { return String(item.id) === String(event.id); });
    if (existing === -1) state.events.push(event);
    else state.events[existing] = event;
    state.events.sort(function (a, b) { return numericId(a.id) - numericId(b.id); });
    if (state.events.length > 100) state.events = state.events.slice(-100);
  }

  async function refresh(force) {
    if (!state.session || !state.trip || navigator.onLine === false) {
      if (ui.status) ui.status.textContent = navigator.onLine === false ? 'לא מקוון · העדכונים יושלמו כשהחיבור יחזור.' : '';
      return;
    }
    if (state.refreshPromise) return state.refreshPromise;
    if (!force && Date.now() - state.lastRefreshAt < 5000) return;
    var token = state.accountToken;
    state.refreshPromise = (async function () {
      try {
        ui.status.textContent = 'מסנכרן עדכונים…';
        var values = await Promise.all([
          cloud.listTripChangeEvents(ownerId(), state.trip.id, 100),
          cloud.getTripChangeReadState(ownerId(), state.trip.id),
          cloud.listTripMembers(ownerId(), state.trip.id)
        ]);
        if (token !== state.accountToken) return;
        state.events = values[0] || [];
        state.lastReadId = numericId(values[1] && values[1].last_read_event_id);
        state.members = values[2] || [];
        var member = state.members.some(function (item) { return String(item.user_id) === currentUserId(); });
        if (!member) { setLaunchersVisible(false); await stopRealtime(); return; }
        setLaunchersVisible(state.members.length > 1);
        state.lastRefreshAt = Date.now();
        ui.status.textContent = '';
        render();
      } catch (error) {
        if (token !== state.accountToken) return;
        console.error('TravelMate trip change refresh failed', error);
        state.events = [];
        state.members = [];
        state.lastReadId = 0;
        render();
        setLaunchersVisible(false);
        await stopRealtime();
        ui.status.textContent = 'לא ניתן לרענן כרגע את עדכוני הטיול.';
      } finally {
        if (token === state.accountToken) state.refreshPromise = null;
      }
    })();
    return state.refreshPromise;
  }

  async function stopRealtime() {
    if (!state.unsubscribe) return;
    var unsubscribe = state.unsubscribe;
    state.unsubscribe = null;
    try { unsubscribe(); } catch (error) {}
  }

  async function startRealtime() {
    await stopRealtime();
    if (!state.session || !state.trip || navigator.onLine === false) return;
    var token = state.accountToken;
    state.unsubscribe = await cloud.subscribeToTripChangeEvents(ownerId(), state.trip.id, function (event) {
      if (token !== state.accountToken) return;
      mergeEvent(event);
      render();
      if (ui.desktopButton && ui.desktopButton.hidden) refresh(true);
      if (String(event.actor_user_id || '') !== currentUserId()) ui.status.textContent = 'נוסף עדכון חדש לטיול.';
    });
  }

  async function markThrough(eventId) {
    var value = numericId(eventId);
    if (!value || !state.session) return;
    try {
      var saved = await cloud.markTripChangesRead(ownerId(), state.trip.id, value);
      state.lastReadId = Math.max(state.lastReadId, numericId(saved));
      render();
    } catch (error) {
      console.error('TravelMate mark trip changes read failed', error);
      ui.status.textContent = 'העדכון נפתח, אך סימון הקריאה לא נשמר כרגע.';
    }
  }

  async function markAllRead() {
    if (!state.events.length) return;
    var latest = state.events.reduce(function (max, event) { return Math.max(max, numericId(event.id)); }, 0);
    if (latest) await markThrough(latest);
  }

  function openPanel(opener) {
    if (!state.session) return;
    state.opener = opener || document.activeElement;
    state.open = true;
    ui.panel.hidden = false;
    document.body.classList.add('trip-notifications-open');
    [ui.desktopButton, ui.mobileButton].forEach(function (button) { if (button) button.setAttribute('aria-expanded', 'true'); });
    render();
    refresh(true);
    ui.close.focus();
  }

  function closePanel(restoreFocus) {
    if (!ui.panel || ui.panel.hidden) return;
    state.open = false;
    ui.panel.hidden = true;
    document.body.classList.remove('trip-notifications-open');
    [ui.desktopButton, ui.mobileButton].forEach(function (button) { if (button) button.setAttribute('aria-expanded', 'false'); });
    if (restoreFocus !== false && state.opener && typeof state.opener.focus === 'function' && !state.opener.hidden) state.opener.focus();
  }

  function findLocalRecord(event) {
    var store = root.TravelMateTripStore;
    var trip = store && store.getTrip ? store.getTrip(state.trip.id, ownerId()) : state.trip;
    if (!trip || !event.entity_id) return null;
    var list = event.entity_type === 'activity' ? trip.activities || [] : event.entity_type === 'place' ? trip.savedPlaces || [] : [];
    return list.find(function (item) { return String(item.id) === String(event.entity_id); }) || null;
  }

  function focusExactEvent(event) {
    if (!event.entity_id || event.action === 'removed') return;
    var deadline = Date.now() + 3500;
    var record = findLocalRecord(event);
    function attempt() {
      if (event.entity_type === 'activity' && record && record.date && root.TravelMatePlanner && typeof root.TravelMatePlanner.openDay === 'function') root.TravelMatePlanner.openDay(record.date);
      var nodes = event.entity_type === 'activity' ? document.querySelectorAll('[data-activity-id]') : document.querySelectorAll('[data-saved-shelf-id]');
      var target = [].find.call(nodes, function (node) {
        return String(event.entity_type === 'activity' ? node.dataset.activityId : node.dataset.savedShelfId) === String(event.entity_id);
      });
      if (target) {
        if (event.entity_type === 'place') {
          var toggle = document.querySelector('[data-saved-places-toggle]');
          if (toggle && toggle.getAttribute('aria-expanded') === 'false') toggle.click();
        }
        target.setAttribute('tabindex', '-1');
        target.classList.add('is-trip-notification-target');
        var reduced = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
        target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
        target.focus({ preventScroll: true });
        setTimeout(function () { target.classList.remove('is-trip-notification-target'); }, 1800);
        return;
      }
      if (Date.now() < deadline) setTimeout(attempt, 100);
    }
    attempt();
  }

  async function openEvent(event) {
    closePanel(false);
    markThrough(event.id);
    var view = targetView(event);
    if (root.TravelMateNavigation && typeof root.TravelMateNavigation.open === 'function') root.TravelMateNavigation.open(view);
    else {
      var link = document.querySelector('[data-view="' + view + '"]');
      if (link) link.click();
    }
    if (event.entity_id && event.action !== 'removed' && (event.entity_type === 'activity' || event.entity_type === 'place')) {
      Promise.resolve().then(function () { focusExactEvent(event); });
    }
  }

  async function resetForSession(session) {
    state.accountToken += 1;
    await stopRealtime();
    state.session = session || null;
    state.events = [];
    state.members = [];
    state.lastReadId = 0;
    state.lastRefreshAt = 0;
    state.refreshPromise = null;
    closePanel(false);
    setLaunchersVisible(false);
    if (!state.session || !state.trip) return;
    state.trip.ownerId = state.trip.ownerId || state.session.user.id;
    await refresh(true);
    if (state.members.some(function (item) { return String(item.user_id) === currentUserId(); })) {
      try { await startRealtime(); } catch (error) { console.error('TravelMate trip change realtime failed', error); }
    }
  }

  async function initialize() {
    state.trip = await tripReady;
    if (!state.trip) return;
    createUi();
    var session = await cloud.getSession();
    await resetForSession(session);
    state.activated = true;
    state.authSubscription = await cloud.onAuthChange(function (event, nextSession) {
      var nextId = nextSession && nextSession.user ? String(nextSession.user.id) : '';
      if (nextId === currentUserId() && event !== 'SIGNED_OUT') return;
      resetForSession(nextSession).catch(function (error) { console.error('TravelMate notification auth reset failed', error); });
    });
  }

  root.addEventListener('online', function () {
    if (!state.activated || !state.session) return;
    refresh(true).then(startRealtime).catch(function (error) { console.error('TravelMate notification reconnect failed', error); });
  });
  root.addEventListener('focus', function () { if (state.activated && state.session) refresh(false); });
  root.addEventListener('travelmate:sync-restored', function () { if (state.activated && state.session) refresh(true); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && state.activated && state.session) refresh(false); });
  root.addEventListener('beforeunload', function () { stopRealtime(); });

  initialize().catch(function (error) { console.error('TravelMate trip change notifications failed', error); });
})(typeof window !== 'undefined' ? window : globalThis);

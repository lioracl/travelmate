(function () {
  'use strict';
  if (window.TravelMateAppShell) return;
  var root = document.documentElement;
  var header = document.querySelector('body.home-page .home-sidebar, body:not(.home-page) .mobile-header');
  function measureHeader() {
    var height = header && header.getBoundingClientRect().height;
    if (height > 0) root.style.setProperty('--tm-shell-header-height', Math.ceil(height) + 'px');
  }
  if (header && window.ResizeObserver) new ResizeObserver(measureHeader).observe(header);
  measureHeader();
  var capacitor = window.Capacitor;
  var bars = null;
  if (capacitor && capacitor.isNativePlatform && capacitor.isNativePlatform()) {
    root.dataset.nativeShell = capacitor.getPlatform();
    bars = capacitor.Plugins && capacitor.Plugins.SystemBars;
    if (!bars && capacitor.registerPlugin) bars = capacitor.registerPlugin('SystemBars');
  }
  function syncBarContrast() {
    if (bars && bars.setStyle) bars.setStyle({style:root.dataset.theme === 'dark' ? 'DARK' : 'LIGHT'}).catch(function () {});
  }
  syncBarContrast();
  window.addEventListener('travelmate:theme-change', syncBarContrast);
  window.addEventListener('pageshow', measureHeader);

  // The trip Hero owns the profile affordance. Keep the existing profile button and
  // its account/security behavior; only move its visual ownership out of the header.
  function syncTripProfileHero() {
    if (document.body.classList.contains('home-page')) return false;
    var hero = document.querySelector('#overview.hero');
    var avatar = document.querySelector('[data-trip-profile-avatar]');
    if (!hero || !avatar) return false;
    if (avatar.parentElement !== hero) hero.appendChild(avatar);
    avatar.classList.add('trip-profile-avatar--hero');
    avatar.setAttribute('data-profile-placement', 'hero');
    return true;
  }

  function scheduleTripProfileHero() {
    syncTripProfileHero();
    window.setTimeout(syncTripProfileHero, 0);
    window.setTimeout(syncTripProfileHero, 250);
  }

  function currentTrip() {
    var store = window.TravelMateTripStore;
    var id = new URLSearchParams(location.search).get('id');
    return store && store.getTrip ? store.getTrip(id) : null;
  }

  function setStatus(panel, message, warning) {
    var status = panel && panel.querySelector('[data-nearby-status]');
    if (!status) return;
    status.classList.remove('is-error', 'is-warning');
    if (warning) status.classList.add('is-warning');
    status.textContent = message;
  }

  function activeNearbyMood(contextual) {
    var active = contextual && contextual.querySelector('[data-contextual-mood][aria-pressed="true"]');
    return active ? String(active.dataset.contextualMood || '') : '';
  }

  function waitForNearbyReady(panel, callback) {
    if (window.TravelMateNearby) { callback(); return; }
    var settled = false;
    function finish() {
      if (settled) return;
      settled = true;
      window.removeEventListener('travelmate:nearby-ready', onReady);
      callback();
    }
    function onReady() { finish(); }
    window.addEventListener('travelmate:nearby-ready', onReady);
    window.setTimeout(function () { if (window.TravelMateNearby) finish(); }, 120);
    window.setTimeout(function () {
      if (settled) return;
      settled = true;
      window.removeEventListener('travelmate:nearby-ready', onReady);
      setStatus(panel, 'חיפוש המקומות עדיין נטען. נסה שוב בעוד רגע.', true);
    }, 5000);
  }

  function applyMoodCategory(panel, contextual) {
    var mood = activeNearbyMood(contextual);
    if (!mood) return;
    var helper = window.TravelMateTripContext;
    var preset = helper && helper.nearbyPreferencePreset ? helper.nearbyPreferencePreset(mood) : null;
    var key = preset && Array.isArray(preset.categories) && preset.categories[0];
    if (key) panel.dispatchEvent(new CustomEvent('travelmate:smart-category', {detail:{category:key}}));
  }

  function runFreeNearbySearch(panel, contextual) {
    setStatus(panel, 'מחפש מקומות קרובים לפי המיקום הנוכחי…');
    waitForNearbyReady(panel, function () {
      applyMoodCategory(panel, contextual);
      var gpsMode = panel.querySelector('[data-nearby-mode="gps"]');
      if (gpsMode && gpsMode.getAttribute('aria-pressed') !== 'true') gpsMode.click();
      window.setTimeout(function () {
        var execute = panel.querySelector('[data-nearby-execute-search]') || panel.querySelector('[data-nearby-search]');
        if (execute) execute.click();
        else setStatus(panel, 'לא הצלחנו להפעיל את החיפוש כרגע. נסה שוב.', true);
      }, 0);
    });
  }

  function runTimeFitNearbySearch(panel, contextual) {
    var trip = currentTrip();
    var helper = window.TravelMateTripContext;
    var input = contextual.querySelector('[data-contextual-window]');
    var available = Math.max(30, Math.min(360, Number(input && input.value) || 90));
    var mood = activeNearbyMood(contextual);
    var preset = helper && helper.nearbyPreferencePreset ? helper.nearbyPreferencePreset(mood) : null;
    if (!trip || !helper || !helper.buildNearbyRequest) {
      setStatus(panel, 'מצב התאמה לזמן עדיין נטען. נסה שוב בעוד רגע.', true);
      return;
    }
    setStatus(panel, 'מחפש מקומות ומוסיף הכוונה לחלון הזמן שבחרת…');
    waitForNearbyReady(panel, function () {
      panel.dispatchEvent(new CustomEvent('travelmate:contextual-nearby', {detail:{
        trip:trip,
        now:new Date(),
        availableMinutes:available,
        bufferMinutes:30,
        mood:preset ? preset.key : '',
        categories:preset ? preset.categories : [],
        miniRoute:contextual.querySelector('[data-contextual-mini-route]') && contextual.querySelector('[data-contextual-mini-route]').getAttribute('aria-pressed') === 'true',
        routeStops:3
      }}));
    });
  }

  // The visible Nearby card now has one clear default: free GPS search. Time-fit is
  // an explicit secondary mode and never controls the primary search button.
  function enhanceNearbyFreeSearch() {
    var panel = document.querySelector('[data-nearby-places]');
    if (!panel) return false;
    var contextual = panel.querySelector('[data-contextual-nearby]');
    if (!contextual) return false;

    var heading = contextual.querySelector(':scope > div strong');
    var copy = contextual.querySelector(':scope > div small');
    if (heading) heading.textContent = 'מה יש קרוב אליי?';
    if (copy) copy.textContent = 'חיפוש לפי GPS. הזמן הוא הכוונה בלבד; כל המקומות זמינים לבחירה.';

    var windowLabel = contextual.querySelector('[data-contextual-window-label]');
    if (windowLabel) {
      var labelText = Array.prototype.find.call(windowLabel.childNodes, function (node) { return node.nodeType === 3; });
      if (labelText) labelText.textContent = 'זמן פנוי מרבי (דקות)';
      if (!contextual.classList.contains('is-time-fit-open')) windowLabel.hidden = true;
    }

    var primary = contextual.querySelector('[data-contextual-nearby-open]');
    if (primary && primary.dataset.freeNearbyBound !== 'true') {
      primary.dataset.freeNearbyBound = 'true';
      primary.classList.add('tm-nearby-free-primary');
      primary.innerHTML = '<i class="fa-solid fa-location-crosshairs" aria-hidden="true"></i><span>מצא לי משהו קרוב</span>';
      primary.setAttribute('aria-label', 'חיפוש חופשי של מקומות קרובים לפי GPS');
      primary.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopImmediatePropagation();
        runFreeNearbySearch(panel, contextual);
      }, true);
    }

    var timeFit = contextual.querySelector('[data-nearby-time-fit]');
    if (!timeFit && primary) {
      timeFit = document.createElement('button');
      timeFit.type = 'button';
      timeFit.className = 'tm-nearby-time-fit-action';
      timeFit.dataset.nearbyTimeFit = '';
      timeFit.setAttribute('aria-expanded', 'false');
      timeFit.innerHTML = '<i class="fa-regular fa-clock" aria-hidden="true"></i><span>הכוונה לזמן פנוי</span>';
      primary.insertAdjacentElement('afterend', timeFit);
      timeFit.addEventListener('click', function () {
        var open = !contextual.classList.contains('is-time-fit-open');
        contextual.classList.toggle('is-time-fit-open', open);
        timeFit.setAttribute('aria-expanded', String(open));
        if (windowLabel) windowLabel.hidden = !open;
        if (open && windowLabel) {
          var input = windowLabel.querySelector('input');
          if (input) input.focus({preventScroll:true});
        }
      });
    }

    var runTimeFit = contextual.querySelector('[data-nearby-time-fit-run]');
    if (!runTimeFit) {
      runTimeFit = document.createElement('button');
      runTimeFit.type = 'button';
      runTimeFit.className = 'tm-nearby-time-fit-run';
      runTimeFit.dataset.nearbyTimeFitRun = '';
      runTimeFit.innerHTML = '<i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i><span>חפש עם הכוונת זמן</span>';
      var route = contextual.querySelector('[data-contextual-mini-route]');
      if (route) route.insertAdjacentElement('afterend', runTimeFit);
      else contextual.appendChild(runTimeFit);
      runTimeFit.addEventListener('click', function () { runTimeFitNearbySearch(panel, contextual); });
    }

    var form = panel.querySelector('[data-nearby-free-form]');
    if (form) {
      var input = form.querySelector('[data-nearby-place-name-input]');
      var label = input && input.closest('label');
      var labelText = label && label.querySelector('span');
      if (labelText) labelText.textContent = 'מה תרצה למצוא קרוב אליך?';
      if (input) input.placeholder = 'לדוגמה: קפה, מסעדה, מוזיאון או בית מרקחת';
      if (!form.querySelector('[data-nearby-free-note]')) {
        var note = document.createElement('small');
        note.className = 'tm-nearby-free-note';
        note.dataset.nearbyFreeNote = '';
        note.textContent = 'חיפוש לפי המיקום הנוכחי. זמן ושעות פתיחה מוצגים כהכוונה בלבד ואינם מסתירים מקומות.';
        form.appendChild(note);
      }
    }

    panel.dataset.nearbyFreeDefault = 'true';
    return true;
  }

  function scheduleNearbyEnhancement() {
    var attempts = 0;
    (function retry() {
      attempts += 1;
      if (enhanceNearbyFreeSearch() || attempts >= 30) return;
      window.setTimeout(retry, 120);
    })();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      scheduleTripProfileHero();
      scheduleNearbyEnhancement();
    }, {once:true});
  } else {
    scheduleTripProfileHero();
    scheduleNearbyEnhancement();
  }

  window.addEventListener('travelmate:home-auth', scheduleTripProfileHero);
  window.addEventListener('travelmate:profile-change', scheduleTripProfileHero);
  window.addEventListener('travelmate:nearby-ready', scheduleNearbyEnhancement);
  window.addEventListener('travelmate:viewchange', function (event) {
    if (event.detail && event.detail.view === 'places') scheduleNearbyEnhancement();
  });
  document.addEventListener('travelmate:places-updated', scheduleNearbyEnhancement);

  // app.js creates the trip avatar after this shell script; observe only until the
  // first successful move, then rely on lifecycle events above.
  if (!document.body.classList.contains('home-page') && window.MutationObserver) {
    var avatarObserver = new MutationObserver(function () {
      if (syncTripProfileHero()) avatarObserver.disconnect();
    });
    avatarObserver.observe(document.body, {childList:true,subtree:true});
  }

  // Read-only diagnostics: no second source of inset values or persisted state.
  window.TravelMateAppShell = {snapshot:function () {
    var style = getComputedStyle(root);
    return {top:style.getPropertyValue('--tm-safe-top').trim(),bottom:style.getPropertyValue('--tm-safe-bottom').trim(),headerHeight:style.getPropertyValue('--tm-shell-header-height').trim(),viewportHeight:window.visualViewport ? window.visualViewport.height : innerHeight};
  }, syncTripProfileHero:syncTripProfileHero, enhanceNearbyFreeSearch:enhanceNearbyFreeSearch};
})();

/* V12.1 opt-in presentation pilot. Existing controllers retain all data/actions. */
(function installProfileSettingsPilot() {
  'use strict';
  var requested = new URLSearchParams(location.search).get('v12pilot');
  if (!/^(profile|settings)$/.test(requested || '') ||
      !document.body.classList.contains('home-page') || !window.TravelMateAppShell) return;
  if (window.TravelMateAppShell.pilot) return;
  var active = null, epoch = 0, stopped = false, observer = null, queued = false, observedChild = null;
  var closeSelectors = {profile:'[data-cloud-account-close]', settings:'[data-security-close]'};
  var roots = {profile:'[data-cloud-account-backdrop]', settings:'[data-security-dialog]'};
  var pending = false;
  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function icon(name) {
    var node = element('i', 'fa-solid fa-' + name);
    node.setAttribute('aria-hidden', 'true');
    return node;
  }
  function button(label, action, glyph) {
    var node = element('button', 'tm121-action');
    node.type = 'button';
    node.dataset.pilotAction = action;
    if (glyph) node.appendChild(icon(glyph));
    node.appendChild(element('span', '', label));
    return node;
  }
  function add(view, parent, node) {
    parent.appendChild(node);
    view.added.push(node);
    return node;
  }
  // Move actual controls with their listeners, identity and value; never clone them.
  function eligibleFocus(view, node) {
    if (!node || !node.isConnected || !view.panel.contains(node) ||
        !node.getClientRects().length || getComputedStyle(node).visibility !== 'visible') return false;
    for (var parent = node; parent; parent = parent.parentElement) {
      if (parent.hidden || parent.inert) return false;
    }
    return true;
  }
  function retainFocus(view, node, ticket, owner) {
    // Removal can reset focus to body. Never override a newer owner or focus target.
    if (stopped || ticket !== epoch || active !== owner || !eligibleFocus(view, node)) return;
    if (document.activeElement === document.body || document.activeElement === document.documentElement) {
      node.focus({preventScroll:true});
    }
  }
  function move(view, node, parent) {
    if (!node || !node.parentNode) return;
    var focused = document.activeElement, ticket = epoch;
    var retain = node.contains(focused) && eligibleFocus(view, focused);
    var marker = document.createComment('v12-pilot-return');
    node.parentNode.insertBefore(marker, node);
    view.moves.push({node:node, marker:marker});
    parent.appendChild(node);
    if (retain) retainFocus(view, focused, ticket, view);
  }
  function card(view, parent, title, glyph, tone) {
    var node = add(view, parent, element('section', 'tm121-card ' + (tone || '')));
    var heading = element('h3', 'tm121-card-title');
    heading.append(icon(glyph), element('span', '', title));
    node.appendChild(heading);
    return node;
  }
  function gap(view, parent, label, key) {
    var node = add(view, parent, element('p', 'tm121-gap', label));
    node.dataset.pilotGap = key;
    return node;
  }
  function makeDock(view) {
    var dock = add(view, view.panel, element('nav', 'tm121-dock'));
    dock.setAttribute('aria-label', 'ניווט');
    dock.dataset.pilotDock = '';
    [['בית','home','house'],['מקומות','places','location-dot'],['טיול חדש','new-trip','plus'],
      ['הטיולים שלי','trips','suitcase'],[view.mode === 'profile' ? 'פרופיל' : 'הגדרות','current',view.mode === 'profile' ? 'user' : 'gear']]
      .forEach(function (entry) {
        var control = button(entry[0], entry[1], entry[2]);
        if (entry[1] === 'current') { control.setAttribute('aria-current','page'); control.disabled = true; }
        if (entry[1] === 'places') {
          control.disabled = true;
          control.title = 'חיפוש מקומות מחוץ לטיול אינו מחובר בגרסת הבסיס';
          control.setAttribute('aria-describedby','tm121-navigation-gap');
        }
        dock.appendChild(control);
      });
    var note = gap(view, view.panel, 'תצוגת ניסיון: יעד הניווט החמישי ממתין להכרעה; מקומות מחוץ לטיול טרם מחובר.', 'external-dock');
    note.id = 'tm121-navigation-gap';
  }
  function decorateProfile(view) {
    var host = view.panel.querySelector('[data-smart-profile]');
    if (!host) return false;
    var head = host.querySelector('.cloud-smart-profile-head');
    var hero = add(view, host, element('header','tm121-profile-cover'));
    host.insertBefore(hero, host.firstChild);
    hero.appendChild(element('h2','','פרופיל'));
    gap(view, hero, 'תמונת שער אישית לא הוגדרה', 'profile-cover-source');
    hero.appendChild(button('הגדרות','settings','gear'));
    move(view, head, hero);
    var stats = card(view, host, 'הטיולים שלך', 'suitcase');
    stats.classList.add('tm121-metrics');
    // No fabricated rating/photo/place counts from the approved example.
    var cachedTrips = [], tripsReadable = false;
    try {
      var cloud = window.TravelMateCloud;
      if (cloud && typeof cloud.getCachedTrips === 'function') {
        cachedTrips = cloud.getCachedTrips();
        tripsReadable = Array.isArray(cachedTrips);
        if (!tripsReadable) cachedTrips = [];
      }
    } catch (error) { cachedTrips = []; }
    ['מקומות שביקרתי','טיולים','תמונות','דירוג'].forEach(function (label, index) {
      var cell = element('div','tm121-metric');
      cell.append(element('strong','',index === 1 && tripsReadable ? String(cachedTrips.length) : '—'), element('span','',label));
      stats.appendChild(cell);
    });
    gap(view, stats, 'ספירת מקומות, תמונות ודירוג אינה מחוברת לתצוגה זו.', 'profile-metrics');
    var trips = card(view, host, 'טיולים אחרונים', 'suitcase');
    var tripList = element('div','tm121-recent-trips');
    trips.appendChild(tripList);
    cachedTrips.filter(function (trip) { return trip && trip.id; }).slice().sort(function (a,b) {
      return String(b.start || '').localeCompare(String(a.start || ''));
    }).slice(0,3).forEach(function (trip) {
      var item = element('article','tm121-recent-trip');
      var images = window.TravelMateDestinationImages;
      var source = images && images.cached && images.cached(trip.city,trip.country);
      if (source) {
        try {
          var url = new URL(source,location.href);
          if (/^https?:$/.test(url.protocol)) {
            var photo = element('img'); photo.src = url.href; photo.alt = ''; photo.loading = 'lazy'; item.appendChild(photo);
          }
        } catch (error) {}
      }
      item.append(element('strong','',String(trip.city || trip.country || 'טיול')),
        element('small','',String(trip.start || '') + ' – ' + String(trip.end || '')));
      tripList.appendChild(item);
    });
    if (!tripList.children.length) gap(view,trips,tripsReadable ? 'אין טיולים שמורים להצגה.' : 'לא ניתן לקרוא את רשימת הטיולים כעת.','profile-trips-empty');
    trips.appendChild(button('הצג הכל','trips','chevron-left'));
    var prefs = host.querySelector('.cloud-declared-preferences');
    move(view, prefs, host);
    if (prefs) { prefs.classList.add('tm121-preferences'); view.classes.push([prefs,'tm121-preferences']); }
    var interests = card(view, host, 'תחומי עניין','heart');
    gap(view, interests, 'בחירת תחומי העניין נשארת בעורך הפרופיל הקיים.', 'profile-interest-cards');
    var learned = host.querySelector('[data-learned-profile-host]');
    move(view, learned, host);
    if (learned) { learned.classList.add('tm121-learned'); view.classes.push([learned,'tm121-learned']); }
    move(view, host.querySelector('.cloud-profile-privacy'), host);
    move(view, host.querySelector('.cloud-avatar-actions'), host);
    move(view, host.querySelector('[data-cloud-avatar-status]'), host);
    return true;
  }
  function decorateSettings(view) {
    var header = view.panel.querySelector(':scope > header');
    if (!header) return false;
    header.classList.add('tm121-settings-header'); view.classes.push([header,'tm121-settings-header']);
    var brand = add(view, header, element('span','tm121-brand-mark'));
    brand.appendChild(icon('gear'));
    var body = add(view, view.panel, element('div','tm121-settings-cards'));
    var voice = card(view, body, 'קול ו-MATE','microphone','tm121-blue');
    move(view, view.panel.querySelector('[data-settings-voice]'), voice);
    var appearance = card(view, body, 'מראה','palette','tm121-yellow');
    move(view, view.panel.querySelector('.security-preferences'), appearance);
    var notifications = card(view, body, 'התראות','bell','tm121-red');
    gap(view, notifications, 'העדפות המלצות, טיסות ומבצעים אינן מחוברות בבסיס הנבחר.', 'notification-preferences');
    var privacy = card(view, body, 'פרטיות','shield-halved','tm121-green');
    var details = element('details','tm121-existing-security');
    details.appendChild(element('summary','','ניהול החשבון, הפרטיות והאבטחה הקיימים'));
    privacy.appendChild(details);
    ['[data-security-profile]','.settings-section-title','[data-security-status]','[data-security-mfa]','.security-actions'].forEach(function (selector) {
      move(view, view.panel.querySelector(selector), details);
    });
    var offline = card(view, body, 'מצב לא מקוון','cloud-arrow-down','tm121-purple');
    gap(view, offline, 'שמירת המידע הקיימת נשמרת. הורדת מפות וניהולן אינם מחוברים כאן.', 'offline-maps');
    var about = card(view, body, 'אודות','circle-info','tm121-blue');
    about.appendChild(button('גרסה, עזרה ומשוב','about','circle-info'));
    move(view, view.panel.querySelector('footer'), body);
    return true;
  }
  function restore() {
    var view = active;
    if (!view) return;
    var focused = document.activeElement, ticket = epoch;
    var retain = eligibleFocus(view, focused);
    active = null;
    view.panel.removeEventListener('click', onAction);
    view.moves.slice().reverse().forEach(function (item) {
      if (item.marker.parentNode) item.marker.parentNode.replaceChild(item.node, item.marker);
    });
    view.classes.forEach(function (item) { item[0].classList.remove(item[1]); });
    view.added.slice().reverse().forEach(function (node) { node.remove(); });
    view.panel.removeAttribute('data-v12-pilot');
    view.backdrop.removeAttribute('data-v12-pilot-backdrop');
    view.inert.forEach(function (item) {
      if (item[0].isConnected) item[0].inert = item[1];
    });
    if (retain) retainFocus(view, focused, ticket, null);
  }
  function closeCurrent() {
    var view = active;
    if (!view) return;
    var close = view.backdrop.querySelector(closeSelectors[view.mode]);
    restore();
    if (close) close.click();
  }
  function actionTarget(action) {
    if (action === 'profile') {
      var launcher = document.querySelector(document.body.classList.contains('is-authenticated') ? '.home-profile-launcher' : '.landing-login');
      if (launcher) return launcher;
    }
    var selectors = {profile:'[data-cloud-account-open]', settings:'[data-security-open]',
      'new-trip':'.home-sidebar [data-modal="destination"]', trips:'.home-sidebar a[href="#active-trips"]',
      about:'[data-about-open]'};
    return document.querySelector(selectors[action] || '[data-never-pilot-target]');
  }
  function onAction(event) {
    var control = event.target.closest('[data-pilot-action]');
    if (!control || control.disabled) return;
    var action = control.dataset.pilotAction;
    if (action === 'current' || action === 'places') return;
    event.preventDefault(); event.stopPropagation();
    closeCurrent();
    if (action === 'home') {
      var main = document.getElementById('main-content');
      if (main) main.focus();
      return;
    }
    var target = actionTarget(action);
    if (target) target.click(); // Existing canonical route/command and guards.
  }
  function sync() {
    if (stopped) return;
    var child = document.querySelector('.profile-wizard-backdrop');
    if (observer && child && child !== observedChild) {
      observer.observe(child, {attributes:true,attributeFilter:['hidden']}); observedChild = child;
    }
    if (child && !child.hidden) { restore(); return; }
    var mode = null, backdrop = null;
    ['profile','settings'].some(function (candidate) {
      var node = document.querySelector(roots[candidate]);
      if (node && !node.hidden) { mode = candidate; backdrop = node; return true; }
      return false;
    });
    // Auth UI remains owned by Home. Never style a signed-out/recovery form as Profile.
    if (mode === 'profile' && (!document.body.classList.contains('is-authenticated') ||
        !backdrop.querySelector('[data-cloud-session]') || backdrop.querySelector('[data-cloud-session]').hidden)) mode = null;
    if (active && (active.mode !== mode || active.backdrop !== backdrop)) restore();
    if (!mode || active) return;
    var panel = backdrop.querySelector(mode === 'profile' ? '[data-cloud-account]' : '.security-center');
    if (!panel) return;
    var view = {mode:mode, panel:panel, backdrop:backdrop, moves:[], added:[], classes:[], inert:[]};
    active = view;
    try {
      if (!(mode === 'profile' ? decorateProfile(view) : decorateSettings(view))) { restore(); return; }
      makeDock(view);
      panel.dataset.v12Pilot = mode;
      backdrop.dataset.v12PilotBackdrop = mode;
      Array.prototype.forEach.call(document.body.children, function (node) {
        if (node === backdrop || /^(SCRIPT|LINK|STYLE)$/.test(node.tagName) || node.hidden) return;
        view.inert.push([node, node.inert]); node.inert = true;
      });
      panel.addEventListener('click', onAction);
    } catch (error) {
      restore();
      console.error('TravelMate presentation pilot failed', error);
    }
  }
  function schedule() {
    if (queued || stopped) return;
    queued = true;
    Promise.resolve().then(function () { queued = false; sync(); });
  }
  function invalidate() {
    epoch += 1;
    closeCurrent(); // Presentation only; no upload cancellation or data write.
  }
  function releaseForChild(event) {
    if (!active || !active.panel.contains(event.target)) return;
    if (event.target.closest('[data-profile-wizard-open],[data-profile-interests-open]')) {
      epoch += 1;
      // Keep the canonical parent visible for the child's existing return-focus contract.
      // Release our inert state before that owner snapshots and isolates its siblings.
      restore();
    }
  }
  function releaseForOwnerClose(event) {
    if (!active) return;
    if ((event.type === 'keydown' && event.key === 'Escape') ||
        (event.type === 'click' && (event.target === active.backdrop ||
          (active.panel.contains(event.target) && event.target.closest(closeSelectors[active.mode]))))) {
      // The existing owner restores focus synchronously. Release inert before it runs.
      restore();
    }
  }
  function observeDialogs() {
    if (stopped || observer) return;
    observer = new MutationObserver(schedule);
    observer.observe(document.body, {childList:true}); // Existing child dialog is created lazily once.
    ['profile','settings'].forEach(function (mode) {
      var node = document.querySelector(roots[mode]);
      if (node) observer.observe(node,{subtree:true,attributes:true,attributeFilter:['hidden']});
    });
    schedule();
  }
  function featureReady(event) {
    if (event.detail && event.detail.view === 'account') observeDialogs();
  }
  function pageHide(event) {
    if (event.persisted) { invalidate(); return; }
    dispose();
  }
  function start() {
    if (stopped || pending) return;
    pending = true;
    var ticket = epoch;
    var loader = window.TravelMateFeatures;
    Promise.resolve(loader && loader.ensureAccount ? loader.ensureAccount() : false).then(function (ready) {
      pending = false;
      if (stopped || ready === false) return;
      observeDialogs();
      if (ticket !== epoch) return; // A changed account may open only through a new user activation.
      var target = actionTarget(requested);
      if (target) target.click();
    }, function () { pending = false; });
  }
  function dispose() {
    if (stopped) return;
    stopped = true; epoch += 1;
    restore();
    if (observer) observer.disconnect();
    window.removeEventListener('travelmate:home-auth', invalidate);
    window.removeEventListener('travelmate:account-context-changed', invalidate);
    window.removeEventListener('pagehide', pageHide);
    window.removeEventListener('travelmate:feature-ready', featureReady);
    document.removeEventListener('click', releaseForChild, true);
    document.removeEventListener('click', releaseForOwnerClose, true);
    document.removeEventListener('keydown', releaseForOwnerClose, true);
    document.removeEventListener('DOMContentLoaded', start);
  }
  window.addEventListener('travelmate:home-auth', invalidate);
  window.addEventListener('travelmate:account-context-changed', invalidate);
  window.addEventListener('pagehide', pageHide);
  window.addEventListener('travelmate:feature-ready', featureReady);
  document.addEventListener('click', releaseForChild, true);
  document.addEventListener('click', releaseForOwnerClose, true);
  document.addEventListener('keydown', releaseForOwnerClose, true);
  window.TravelMateAppShell.pilot = Object.freeze({sync:sync, dispose:dispose,
    snapshot:function () { return {enabled:!stopped, active:active && active.mode, epoch:epoch, pending:pending}; }});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();

(function () {
  'use strict';
  if (window.TravelMateAppShell) return;
  var root = document.documentElement;
  var header = document.querySelector('body.home-page .tm-home-header, body:not(.home-page) .mobile-header');
  function measureHeader() {
    var height = header && header.getBoundingClientRect().height;
    if (height > 0) root.style.setProperty('--tm-shell-header-height', Math.ceil(height) + 'px');
  }
  if (header && window.ResizeObserver) new ResizeObserver(measureHeader).observe(header);
  measureHeader();
  var isV3 = document.body.dataset.design === 'v3';
  var isHome = document.body.classList.contains('home-page');
  var dock = document.querySelector('.tm-trip-dock');
  var utilities = document.querySelector('[data-shell-utilities]');
  var utilityOpener = null;
  var backgroundStates = [];
  function closeUtilities() {
    if (!utilities || utilities.hidden) return;
    utilities.hidden = true;
    document.body.classList.remove('mobile-menu-open');
    document.querySelectorAll('[data-shell-more]').forEach(function (button) { button.setAttribute('aria-expanded', 'false'); });
    backgroundStates.forEach(function (item) { item.node.inert = item.inert; });
    backgroundStates = [];
    if (utilityOpener && utilityOpener.isConnected) utilityOpener.focus({preventScroll:true});
  }
  function openUtilities(opener) {
    if (!utilities) return;
    if (!utilities.hidden) { closeUtilities(); return; }
    utilityOpener = opener;
    utilities.hidden = false;
    document.body.classList.add('mobile-menu-open');
    document.querySelectorAll('[data-shell-more]').forEach(function (button) { button.setAttribute('aria-expanded', 'true'); });
    [document.querySelector('main.content'), dock].filter(Boolean).forEach(function (node) {
      backgroundStates.push({node:node,inert:node.inert}); node.inert = true;
    });
    var close = utilities.querySelector('[data-shell-close]');
    if (close) close.focus({preventScroll:true});
  }
  function utilityKeydown(event) {
    if (!utilities || utilities.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation(); closeUtilities(); return;
    }
    if (event.key !== 'Tab') return;
    var controls = Array.prototype.filter.call(utilities.querySelectorAll('a[href],button,input,select,textarea,[tabindex="0"]'), function (node) {
      return !node.disabled && !node.hidden && node.getClientRects().length > 0;
    });
    var first = controls[0], last = controls[controls.length - 1];
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === first || !utilities.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !utilities.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  }
  function syncDock() {
    if (!dock) return;
    var view = document.body.dataset.tripPrimaryView || 'overview';
    dock.querySelectorAll('[data-shell-view]').forEach(function (link) {
      var url = new URL(location.href); url.hash = ''; url.searchParams.set('view', link.dataset.shellView); link.href = url.href;
      if (view === link.dataset.shellView) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
    });
    var more = dock.querySelector('[data-shell-more]');
    if (more) more.classList.toggle('is-active', !/^(overview|plan|places)$/.test(view));
  }
  // Outside-trip URLs use the browser's native hash history. Inside-trip view
  // and overlay entries retain TravelMateHistory as their only state owner.
  // Home has no trip destination responder. Reuse the existing mode controls;
  // selecting GPS changes UI only, while the engine owns explicit search/consent.
  function configureHomeNearby() {
    if (!isHome || !isV3) return;
    var panel = document.querySelector('#home-places [data-nearby-places]');
    if (!panel || !window.TravelMateNearby) return;
    window.TravelMateNearby.init(panel);
    var destination = panel.querySelector('[data-nearby-mode="destination"]');
    var gps = panel.querySelector('[data-nearby-mode="gps"]');
    if (destination) { destination.hidden = true; destination.disabled = true; }
    if (gps && panel.dataset.searchMode === 'destination') gps.click();
  }
  function syncHomeRoute() {
    if (!isHome || !isV3) return;
    var route = /^(#active-trips|#trip-archive)$/.test(location.hash) ? 'trips' : location.hash === '#home-places' ? 'places' : 'home';
    document.body.dataset.homeView = route;
    if (dock) dock.querySelectorAll('[data-home-route]').forEach(function (link) {
      if (link.dataset.homeRoute === route) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
    });
    // Hidden sections retain their canonical nodes, forms, filters and cached data.
    document.querySelectorAll('[data-home-trip-browser],[data-trip-list],[data-trip-archive],.trip-area-head').forEach(function (node) { node.inert = route !== 'trips'; });
    if (route === 'places' && window.TravelMateFeatures) {
      window.TravelMateFeatures.load('home-nearby').then(function (ready) {
        if (ready !== false) configureHomeNearby();
        var status = document.querySelector('#home-places [data-nearby-status]');
        if (ready === false && status) status.textContent = 'טעינת מקומות לא הושלמה. אפשר לנסות שוב בכניסה למסך.';
      }).catch(function () {
        var status = document.querySelector('#home-places [data-nearby-status]');
        if (status) status.textContent = 'מקומות אינם זמינים כרגע. אפשר לחזור ולנסות שוב.';
      });
    }
    closeUtilities();
  }
  if (isV3) {
    if (utilities) {
      if (!utilities.id) utilities.id = 'tm-utilities';
      document.querySelectorAll('[data-shell-more]').forEach(function (button) { button.setAttribute('aria-controls',utilities.id); });
    }
    document.addEventListener('keydown', utilityKeydown, true);
    document.addEventListener('click', function (event) {
      var more = event.target.closest('[data-shell-more]');
      if (more) { event.preventDefault(); openUtilities(more); return; }
      if (event.target.closest('[data-shell-close]')) { closeUtilities(); return; }
      if (utilities && !utilities.hidden && event.target.closest('[data-shell-utilities] a,[data-shell-utilities] button')) closeUtilities();
    });
    if (dock) dock.addEventListener('click', function (event) {
      var link = event.target.closest('[data-shell-view]');
      if (link && !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && window.TravelMateHistory) {
        event.preventDefault(); window.TravelMateHistory.navigate(link.dataset.shellView);
      }
    });
    window.addEventListener('travelmate:viewchange', syncDock);
    if (!isHome) new MutationObserver(syncDock).observe(document.body,{attributes:true,attributeFilter:['data-trip-primary-view']});
    window.addEventListener('hashchange',syncHomeRoute);
    window.addEventListener('travelmate:home-auth',function (event) {
      if (event.detail && event.detail.authenticated === false && !document.body.classList.contains('has-cached-trips')) { var homeUrl=new URL(location.href);homeUrl.hash='home';history.replaceState(history.state,'',homeUrl.href); }
      syncHomeRoute();
    });
    document.addEventListener('DOMContentLoaded',syncHomeRoute,{once:true});
    syncDock(); syncHomeRoute();
  }

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
  }, v3:isV3, closeUtilities:closeUtilities, configureHomeNearby:configureHomeNearby, syncHomeRoute:syncHomeRoute, syncTripProfileHero:syncTripProfileHero, enhanceNearbyFreeSearch:enhanceNearbyFreeSearch};
})();

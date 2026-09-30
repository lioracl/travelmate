(function () {
  'use strict';

  var workspace = document.querySelector('.workspace');
  var content = document.querySelector('main.content');
  if (!workspace || !content) return;

  try { history.scrollRestoration = 'manual'; } catch (error) {}

  var currentUrl = new URL(location.href);
  currentUrl.hash = '';
  currentUrl.searchParams.delete('invite');
  try { sessionStorage.setItem('travelmate-last-trip-url', currentUrl.href); } catch (error) {}

  var activeView = viewFromLocation();
  var tripKey = location.pathname + '?id=' + (new URLSearchParams(location.search).get('id') || '');
  var overlays = new Map();
  var closingEntry = false;
  var dismissing = false;
  var queuedView = null;
  var renderView = null;
  var lastOutsideFocus = document.activeElement;
  function currentView() { return activeView; }

  function viewFromLocation() {
    var view = new URLSearchParams(location.search).get('view') || location.hash.slice(1) || 'overview';
    return view === 'car-rental' ? 'transport' : view;
  }

  function viewUrl(view) {
    var url = new URL(location.href);
    url.hash = '';
    url.searchParams.set('view', view || 'overview');
    return url.href;
  }

  function overviewUrl() {
    return viewUrl('overview');
  }

  function tripState(view, extra) {
    var state = Object.assign({}, history.state || {}, {
      travelMateTrip: true,
      travelMateHistory: tripKey,
      travelMateView: view || 'overview'
    }, extra || {});
    delete state.travelMateOverlay;
    return state;
  }

  function rootState() {
    return tripState('overview', { travelMateRoot: true, travelMateGuard: false });
  }

  function guardState() {
    return tripState('overview', { travelMateRoot: false, travelMateGuard: true });
  }

  function sectionState(view) {
    return tripState(view, { travelMateRoot: false, travelMateGuard: false });
  }

  function armOverviewGuard() {
    history.pushState(guardState(), '', overviewUrl());
  }

  function primeTripHistory() {
    if (history.state && history.state.travelMateHistory === tripKey && !history.state.travelMateRoot) {
      history.replaceState(sectionState(activeView), '', viewUrl(activeView));
      return;
    }
    var initialView = viewFromLocation();
    var initialUrl = viewUrl(initialView);
    history.replaceState(rootState(), '', overviewUrl());
    if (initialView === 'overview') armOverviewGuard();
    else history.pushState(sectionState(initialView), '', initialUrl);
  }

  function syncEntry() {
    if (dismissing || closingEntry) return;
    if (overlays.size) {
      var state = sectionState(activeView);
      state.travelMateOverlay = Array.from(overlays.keys()).map(function (id) { return typeof id === 'string' ? id : 'dialog'; }).pop();
      if (history.state && history.state.travelMateOverlay) history.replaceState(state, '', viewUrl(activeView));
      else history.pushState(state, '', viewUrl(activeView));
    } else if (history.state && history.state.travelMateOverlay) {
      closingEntry = true;
      history.back();
    }
  }
  function pushOverlay(name, close) {
    if (!overlays.has(name)) overlays.set(name, { close: close });
    syncEntry();
  }
  function closeOverlay(name) { overlays.delete(name); syncEntry(); }
  function dismissOverlays() {
    dismissing = true;
    try { Array.from(overlays.values()).reverse().forEach(function (overlay) { overlay.close(); }); }
    finally { overlays.clear(); dismissing = false; }
  }
  function showView(view) {
    activeView = view === 'car-rental' ? 'transport' : (view || 'overview');
    if (renderView) renderView(activeView);
    updateExitButtons();
  }
  function navigate(view) {
    view = view === 'car-rental' ? 'transport' : (view || 'overview');
    collectOverlays();
    if (overlays.size) { dismissOverlays(); syncEntry(); }
    if (closingEntry) { queuedView = view; return; }
    history.replaceState(view === 'overview' ? guardState() : sectionState(view), '', viewUrl(view));
    showView(view);
  }

  // Adapters call each existing owner's close control, preserving cleanup and focus.
  // AI, Weather and calendar register their callbacks directly. All overlays share
  // one temporary entry, so even nested dialogs reach Overview within two Backs.
  var adapters = [
    ['.modal-backdrop:not(#modal-weather-live):not(#modal-smart-hub)', '[data-close]', 'open'],
    ['#modal-smart-hub', '[data-smart-close]', 'open'],
    ['[data-about-modal]', '[data-about-close]', 'open'],
    ['[data-security-dialog]', '[data-security-close]'],
    ['[data-admin-dialog]', '[data-admin-close]'],
    ['.auto-place-backdrop', '[data-auto-place-close]'],
    ['.place-directions-backdrop', '[data-directions-close]', 'open'],
    ['.place-share-backdrop', '[data-place-share-close]', 'open'],
    ['[data-vault-preview]', '[data-vault-preview-close]', 'open'],
    ['[data-receipt-modal]', '[data-receipt-preview-close]'],
    ['.navo-intelligence-backdrop', '[data-navo-close]'],
    ['.trip-map-dialog', '[data-trip-map-close]'],
    ['.floating-logout-dialog', '[data-floating-logout-cancel]']
  ];
  function collectOverlays() {
    var found = new Set();
    adapters.forEach(function (adapter) {
      document.querySelectorAll(adapter[0]).forEach(function (element) {
        var open = adapter[2] ? element.classList.contains(adapter[2]) : !element.hidden;
        if (!open || !element.isConnected) return;
        found.add(element);
        if (overlays.has(element)) return;
        var returnFocus = lastOutsideFocus;
        overlays.set(element, { dom: true, close: function () {
          var button = element.querySelector(adapter[1]);
          if (button) button.click();
          if (returnFocus && returnFocus.isConnected && (!document.activeElement || document.activeElement === document.body || element.contains(document.activeElement))) returnFocus.focus();
        } });
      });
    });
    if (document.body.classList.contains('mobile-menu-open')) {
      found.add(document.body);
      if (!overlays.has(document.body)) overlays.set(document.body, { dom: true, close: function () {
        window.closeMobileMenu();
        var button = document.querySelector('[data-mobile-menu]'); if (button) button.focus();
      } });
    }
    overlays.forEach(function (overlay, id) { if (overlay.dom && !found.has(id)) overlays.delete(id); });
    syncEntry();
  }
  document.addEventListener('focusin', function (event) {
    if (!event.target.closest('[role="dialog"],.modal-backdrop,.sidebar')) lastOutsideFocus = event.target;
  });
  new MutationObserver(function () { if (!dismissing) collectOverlays(); }).observe(document.body, {
    subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden', 'aria-hidden']
  });

  function updateExitButtons() {
    var overview = currentView() === 'overview';
    document.querySelectorAll('.mobile-back,.mobile-trip-back,.hero-back').forEach(function (button) {
      if (!button.dataset.tripExitHref) button.dataset.tripExitHref = button.getAttribute('href') || '../../index.html';
      button.setAttribute('href', overview ? button.dataset.tripExitHref : overviewUrl());
      button.setAttribute('aria-label', overview ? 'חזרה לכל הטיולים' : 'חזרה לסקירת הטיול');
      if (button.classList.contains('hero-back')) {
        button.innerHTML = overview
          ? '<i class="fa-solid fa-arrow-right"></i> כל הטיולים'
          : '<i class="fa-solid fa-arrow-right"></i> חזרה לסקירה';
      }
    });
  }

  function addSectionBackButtons() {
    content.querySelectorAll('.section[id]:not(#overview)').forEach(function (section) {
      var head = section.querySelector(':scope > .section-head');
      if (!head || head.querySelector('.trip-action-back')) return;
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'trip-action-back';
      button.innerHTML = '<i class="fa-solid fa-arrow-right"></i><span>חזרה לסקירה</span>';
      button.setAttribute('aria-label', 'חזרה לסקירת הטיול');
      head.appendChild(button);
    });
  }

  function returnToOverview() { navigate('overview'); }
  function handlePopState() {
    // Finish consuming a manual close before applying an immediate open/navigation.
    if (closingEntry) {
      closingEntry = false;
      history.replaceState(sectionState(activeView), '', viewUrl(activeView));
      if (queuedView !== null) { var next = queuedView; queuedView = null; navigate(next); }
      else collectOverlays();
      return;
    }
    if (overlays.size) {
      dismissOverlays();
      if (history.state && history.state.travelMateRoot) history.pushState(sectionState(activeView), '', viewUrl(activeView));
      else history.replaceState(sectionState(activeView), '', viewUrl(activeView));
      return;
    }
    activeView = 'overview';
    if (history.state && history.state.travelMateHistory === tripKey && history.state.travelMateRoot) armOverviewGuard();
    else history.replaceState(guardState(), '', overviewUrl());
    showView('overview');
  }
  window.TravelMateHistory = Object.freeze({
    navigate: navigate, pushOverlay: pushOverlay, closeOverlay: closeOverlay,
    returnToOverview: returnToOverview, overviewUrl: overviewUrl,
    currentView: currentView,
    bindView: function (callback) { renderView = callback; callback(activeView); }
  });

  primeTripHistory();

  document.addEventListener('click', function (event) {
    var topBack = event.target.closest('.mobile-back,.mobile-trip-back,.hero-back');
    if (topBack && currentView() !== 'overview') {
      event.preventDefault();
      returnToOverview();
      return;
    }
    if (event.target.closest('.trip-action-back')) {
      event.preventDefault();
      returnToOverview();
    }
  }, true);

  window.addEventListener('popstate', handlePopState);
  window.addEventListener('travelmate:viewchange', updateExitButtons);
  window.addEventListener('travelmate:feature-ready', function () {
    addSectionBackButtons();
    updateExitButtons();
  });

  addSectionBackButtons();
  updateExitButtons();
  collectOverlays();
})();
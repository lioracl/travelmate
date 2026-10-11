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

  function setActionLabel(button, label) {
    if (!button) return;
    button.setAttribute('aria-label', label);
    button.title = label;
    var span = button.querySelector('span');
    if (span) { span.textContent = label; return; }
    var textNode = Array.prototype.find.call(button.childNodes, function (node) {
      return node.nodeType === 3 && String(node.textContent || '').trim();
    });
    if (textNode) textNode.textContent = ' ' + label + ' ';
  }

  // Free nearby search is the primary path. Time-fit remains available only through
  // its existing explicit contextual action; no schedule/window filtering is applied
  // to this button because it delegates to the normal GPS search owner in nearby.js.
  function enhanceNearbyFreeSearch() {
    var panel = document.querySelector('[data-nearby-places]');
    if (!panel) return false;

    var timeFit = panel.querySelector('[data-contextual-nearby]');
    if (timeFit && timeFit.tagName === 'BUTTON') {
      timeFit.classList.add('tm-nearby-time-fit-action');
      setActionLabel(timeFit, 'התאמה לזמן פנוי');
    }

    var form = panel.querySelector('[data-nearby-free-form]');
    var execute = panel.querySelector('[data-nearby-execute-search]');
    if (!form || !execute) return false;

    var input = form.querySelector('[data-nearby-place-name-input]');
    var label = input && input.closest('label');
    var labelText = label && label.querySelector('span');
    if (labelText) labelText.textContent = 'מה תרצה למצוא קרוב אליך?';
    if (input) input.placeholder = 'לדוגמה: קפה, מסעדה, מוזיאון או בית מרקחת';

    if (!form.querySelector('[data-nearby-free-note]')) {
      var note = document.createElement('small');
      note.className = 'tm-nearby-free-note';
      note.dataset.nearbyFreeNote = '';
      note.textContent = 'חיפוש חופשי לפי המיקום הנוכחי — בלי מסגרת זמן ובלי סינון לפי התוכנית.';
      form.appendChild(note);
    }

    var actions = execute.closest('.nearby-execute-actions') || execute.parentElement;
    if (actions && !actions.querySelector('[data-nearby-free-gps]')) {
      var freeButton = document.createElement('button');
      freeButton.type = 'button';
      freeButton.className = 'nearby-free-gps-action primary';
      freeButton.dataset.nearbyFreeGps = '';
      freeButton.innerHTML = '<i class="fa-solid fa-location-crosshairs" aria-hidden="true"></i><span>מצא לי משהו קרוב</span>';
      freeButton.addEventListener('click', function () {
        var gpsMode = panel.querySelector('[data-nearby-mode="gps"]');
        if (gpsMode && gpsMode.getAttribute('aria-pressed') !== 'true') gpsMode.click();
        window.setTimeout(function () {
          var currentExecute = panel.querySelector('[data-nearby-execute-search]');
          if (currentExecute) currentExecute.click();
        }, 0);
      });
      actions.insertBefore(freeButton, execute);
    }

    panel.dataset.nearbyFreeDefault = 'true';
    return true;
  }

  function scheduleNearbyEnhancement() {
    var attempts = 0;
    (function retry() {
      attempts += 1;
      if (enhanceNearbyFreeSearch() || attempts >= 12) return;
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
  document.addEventListener('travelmate:places-updated', scheduleNearbyEnhancement);

  // app.js creates the trip avatar after this shell script; observe only until the
  // first successful move, then rely on lifecycle events above.
  if (!document.body.classList.contains('home-page') && window.MutationObserver) {
    var avatarObserver = new MutationObserver(function () {
      if (syncTripProfileHero()) avatarObserver.disconnect();
    });
    avatarObserver.observe(document.body, {childList:true, subtree:true});
  }

  // Read-only diagnostics: no second source of inset values or persisted state.
  window.TravelMateAppShell = {snapshot:function () {
    var style = getComputedStyle(root);
    return {top:style.getPropertyValue('--tm-safe-top').trim(),bottom:style.getPropertyValue('--tm-safe-bottom').trim(),headerHeight:style.getPropertyValue('--tm-shell-header-height').trim(),viewportHeight:window.visualViewport ? window.visualViewport.height : innerHeight};
  }, syncTripProfileHero:syncTripProfileHero, enhanceNearbyFreeSearch:enhanceNearbyFreeSearch};
})();

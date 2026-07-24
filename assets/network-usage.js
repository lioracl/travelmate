(function () {
  'use strict';

  if (window.__travelMateNetworkUsageLoaded) return;
  window.__travelMateNetworkUsageLoaded = true;

  var STORAGE_KEY = 'travelmate:network-usage:v1';
  var MODE_KEY = 'travelmate:network-mode:v1';
  var POSITION_KEY = 'travelmate:network-meter-position:v1';
  var LOGOUT_POSITION_KEY = 'travelmate:logout-position:v2';
  var assetScript = document.currentScript;
  var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
  var countedEntries = new Set();
  var state = readUsage();
  var manualMode = localStorage.getItem(MODE_KEY) || 'auto';
  var meter;
  var panel;

  function todayKey() {
    var now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  }

  function readUsage() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (saved.date === todayKey() && Number.isFinite(saved.bytes)) return saved;
    } catch (error) {}
    return { date: todayKey(), bytes: 0 };
  }

  function saveUsage() {
    state.date = todayKey();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function ensureToday() {
    if (state.date !== todayKey()) {
      state = { date: todayKey(), bytes: 0 };
      saveUsage();
    }
  }

  function automaticNetwork() {
    if (!navigator.onLine) return { type: 'offline', detected: true, label: 'לא מחובר', icon: 'fa-signal' };
    var type = connection && String(connection.type || '').toLowerCase();
    if (type === 'wifi') return { type: 'wifi', detected: true, label: 'Wi-Fi', icon: 'fa-wifi' };
    if (type === 'cellular' || type === 'wimax') return { type: 'cellular', detected: true, label: cellularLabel(), icon: 'fa-signal' };
    if (type === 'ethernet') return { type: 'wifi', detected: true, label: 'רשת קווית', icon: 'fa-ethernet' };
    if (type === 'none') return { type: 'offline', detected: true, label: 'לא מחובר', icon: 'fa-signal' };
    return { type: 'unknown', detected: false, label: 'רשת פעילה', icon: 'fa-wifi' };
  }

  function cellularLabel() {
    var effective = connection && String(connection.effectiveType || '').toUpperCase();
    return effective && /^(SLOW-2G|2G|3G|4G)$/.test(effective) ? effective : 'סלולרי';
  }

  function currentNetwork() {
    if (manualMode === 'wifi') return { type: 'wifi', detected: false, label: 'Wi-Fi', icon: 'fa-wifi', manual: true };
    if (manualMode === 'cellular') return { type: 'cellular', detected: false, label: cellularLabel(), icon: 'fa-signal', manual: true };
    return automaticNetwork();
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(bytes < 10240 ? 1 : 0) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(bytes < 10485760 ? 2 : 1) + ' MB';
    return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  }

  function addBytes(bytes) {
    bytes = Number(bytes || 0);
    if (bytes <= 0) return;
    ensureToday();
    state.bytes += bytes;
    saveUsage();
    render();
  }

  function addEntry(entry) {
    if (!entry || currentNetwork().type !== 'cellular') return;
    if (entry.initiatorType === 'fetch' || entry.initiatorType === 'xmlhttprequest') return;
    var bytes = Number(entry.transferSize || 0);
    if (bytes <= 0) return;
    var key = [entry.entryType, entry.name, Math.round(entry.startTime), bytes].join('|');
    if (countedEntries.has(key)) return;
    countedEntries.add(key);
    ensureToday();
    addBytes(bytes);
  }

  function bodySize(body) {
    if (!body) return 0;
    if (typeof body === 'string') return new TextEncoder().encode(body).byteLength;
    if (typeof Blob !== 'undefined' && body instanceof Blob) return body.size;
    if (typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer) return body.byteLength;
    if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(body)) return body.byteLength;
    if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return new TextEncoder().encode(body.toString()).byteLength;
    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      var total = 0;
      body.forEach(function (value, key) {
        total += new TextEncoder().encode(String(key)).byteLength;
        total += typeof value === 'string' ? new TextEncoder().encode(value).byteLength : Number(value.size || 0);
      });
      return total;
    }
    return 0;
  }

  function instrumentFetch() {
    if (!window.fetch || window.fetch.__travelMateMeasured) return;
    var originalFetch = window.fetch;
    function measuredFetch(input, init) {
      var cellularAtStart = currentNetwork().type === 'cellular';
      if (cellularAtStart && init && init.body) addBytes(bodySize(init.body));
      var request = originalFetch.apply(this, arguments);
      request.then(function (response) {
        if (!cellularAtStart || !response) return;
        var statedLength = Number(response.headers && response.headers.get('content-length'));
        if (statedLength > 0) { addBytes(statedLength); return; }
        try { response.clone().blob().then(function (blob) { addBytes(blob.size); }).catch(function () {}); } catch (error) {}
      }).catch(function () {});
      return request;
    }
    measuredFetch.__travelMateMeasured = true;
    measuredFetch.__travelMateOriginal = originalFetch;
    window.fetch = measuredFetch;
  }

  function startMeasuring() {
    try {
      performance.getEntriesByType('navigation').forEach(addEntry);
      var observer = new PerformanceObserver(function (list) { list.getEntries().forEach(addEntry); });
      observer.observe({ type: 'resource', buffered: true });
    } catch (error) {
      try {
        var fallbackObserver = new PerformanceObserver(function (list) { list.getEntries().forEach(addEntry); });
        fallbackObserver.observe({ entryTypes: ['resource'] });
      } catch (ignored) {}
    }
  }

  function meterText(network) {
    if (network.type === 'wifi') return network.label + ' · לא נספר';
    if (network.type === 'cellular') return network.label + ' · ' + formatBytes(state.bytes);
    if (network.type === 'offline') return 'לא מחובר';
    return 'זיהוי רשת מוגבל';
  }

  function render() {
    if (!meter) return;
    ensureToday();
    var network = currentNetwork();
    meter.dataset.network = network.type;
    meter.querySelector('i').className = 'fa-solid ' + network.icon;
    meter.querySelector('[data-network-text]').textContent = meterText(network);
    meter.setAttribute('aria-label', 'מצב רשת: ' + meterText(network) + '. לחצו לפרטים');
    if (panel) {
      panel.querySelector('[data-network-status]').textContent = network.label + (network.manual ? ' · בחירה ידנית' : network.detected ? ' · זוהה אוטומטית' : ' · לא ניתן לזהות אוטומטית');
      panel.querySelector('[data-network-total]').textContent = formatBytes(state.bytes);
      panel.querySelectorAll('[data-network-mode]').forEach(function (button) {
        button.classList.toggle('active', button.dataset.networkMode === manualMode);
      });
    }
  }

  function buildWidget() {
    meter = document.createElement('button');
    meter.type = 'button';
    meter.className = 'network-usage-meter';
    if (document.querySelector('.mobile-header')) meter.classList.add('in-trip');
    meter.setAttribute('aria-expanded', 'false');
    meter.title = 'ניתן לגרור את הכפתור למקום נוח';
    meter.innerHTML = '<i class="fa-solid fa-wifi" aria-hidden="true"></i><span data-network-text></span>';

    panel = document.createElement('section');
    panel.className = 'network-usage-panel';
    if (document.querySelector('.mobile-header')) panel.classList.add('in-trip');
    panel.hidden = true;
    panel.innerHTML = '<header><div><small>חיבור וצריכת נתונים</small><strong data-network-status></strong></div><button type="button" data-network-close aria-label="סגירה"><i class="fa-solid fa-xmark"></i></button></header>' +
      '<div class="network-usage-total"><span>שימוש סלולרי היום</span><strong data-network-total>0 B</strong></div>' +
      '<p>המד סופר רק נתונים ש־TravelMate הורידה בזמן שהחיבור זוהה כסלולרי. שימוש ב־Wi-Fi אינו נספר.</p>' +
      '<div class="network-mode-picker" role="group" aria-label="בחירת סוג החיבור"><button type="button" data-network-mode="auto">אוטומטי</button><button type="button" data-network-mode="wifi"><i class="fa-solid fa-wifi"></i> Wi-Fi</button><button type="button" data-network-mode="cellular"><i class="fa-solid fa-signal"></i> סלולרי</button></div>' +
      '<button class="network-reset" type="button" data-network-reset>איפוס המד של היום</button><small class="network-privacy"><i class="fa-solid fa-shield-halved"></i> הנתון נשמר רק במכשיר הזה.</small>';

    document.body.append(meter, panel);
    var didDrag = false;
    var dragState = null;
    try {
      var savedPosition = JSON.parse(localStorage.getItem(POSITION_KEY) || 'null');
      if (savedPosition && Number.isFinite(savedPosition.left) && Number.isFinite(savedPosition.top)) {
        meter.style.left = Math.min(Math.max(8, savedPosition.left), window.innerWidth - 48) + 'px';
        meter.style.top = Math.min(Math.max(8, savedPosition.top), window.innerHeight - 48) + 'px';
      }
    } catch (error) {}
    function positionPanel() {
      var rect = meter.getBoundingClientRect();
      var panelWidth = Math.min(330, window.innerWidth - 16);
      panel.style.left = Math.min(Math.max(8, rect.left), window.innerWidth - panelWidth - 8) + 'px';
      panel.style.top = Math.min(rect.bottom + 10, window.innerHeight - 120) + 'px';
    }
    meter.addEventListener('pointerdown', function (event) {
      dragState = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: meter.offsetLeft, top: meter.offsetTop };
      didDrag = false;
      meter.setPointerCapture(event.pointerId);
      meter.classList.add('dragging');
    });
    meter.addEventListener('pointermove', function (event) {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      var deltaX = event.clientX - dragState.x;
      var deltaY = event.clientY - dragState.y;
      if (Math.abs(deltaX) + Math.abs(deltaY) > 5) didDrag = true;
      if (!didDrag) return;
      meter.style.left = Math.min(Math.max(8, dragState.left + deltaX), window.innerWidth - meter.offsetWidth - 8) + 'px';
      meter.style.top = Math.min(Math.max(8, dragState.top + deltaY), window.innerHeight - meter.offsetHeight - 8) + 'px';
    });
    function finishDrag(event) {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      meter.classList.remove('dragging');
      if (didDrag) {
        localStorage.setItem(POSITION_KEY, JSON.stringify({ left: meter.offsetLeft, top: meter.offsetTop }));
        positionPanel();
      }
      dragState = null;
      setTimeout(function () { didDrag = false; }, 0);
    }
    meter.addEventListener('pointerup', finishDrag);
    meter.addEventListener('pointercancel', finishDrag);
    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', finishDrag);
    meter.addEventListener('click', function () {
      if (didDrag) return;
      panel.hidden = !panel.hidden;
      meter.setAttribute('aria-expanded', String(!panel.hidden));
      if (!panel.hidden) positionPanel();
      render();
    });
    panel.addEventListener('click', function (event) {
      var modeButton = event.target.closest('[data-network-mode]');
      if (modeButton) {
        manualMode = modeButton.dataset.networkMode;
        localStorage.setItem(MODE_KEY, manualMode);
        render();
        return;
      }
      if (event.target.closest('[data-network-reset]')) {
        state = { date: todayKey(), bytes: 0 };
        saveUsage();
        render();
        return;
      }
      if (event.target.closest('[data-network-close]')) {
        panel.hidden = true;
        meter.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('click', function (event) {
      if (!panel.hidden && !panel.contains(event.target) && !meter.contains(event.target)) {
        panel.hidden = true;
        meter.setAttribute('aria-expanded', 'false');
      }
    });
    render();
  }

  function buildLogout() {
    if (document.querySelector('[data-floating-logout]')) return;
    var menu = document.querySelector('.sidebar, .home-sidebar');
    if (menu) {
      var menuLogout = document.createElement('button');
      menuLogout.type = 'button';
      menuLogout.className = 'trip-logout';
      menuLogout.dataset.floatingLogout = '';
      menuLogout.setAttribute('aria-label', 'התנתקות');
      menuLogout.innerHTML = '<i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i><span class="tip">התנתקות</span>';

      var menuDialog = document.createElement('section');
      menuDialog.className = 'floating-logout-dialog';
      menuDialog.hidden = true;
      menuDialog.setAttribute('role', 'dialog');
      menuDialog.setAttribute('aria-modal', 'true');
      menuDialog.setAttribute('aria-labelledby', 'floating-logout-title');
      menuDialog.innerHTML = '<div><h2 id="floating-logout-title">התנתקות</h2><p>לצאת מהחשבון ולחזור למסך הראשי?</p><div><button type="button" data-floating-logout-cancel>ביטול</button><button type="button" data-floating-logout-confirm><i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i> התנתקות</button></div></div>';
      menu.appendChild(menuLogout);
      document.body.appendChild(menuDialog);

      function closeMenuDialog() {
        menuDialog.hidden = true;
        menuLogout.focus();
      }
      menuLogout.addEventListener('click', function () {
        menuDialog.hidden = false;
        menuDialog.querySelector('[data-floating-logout-cancel]').focus();
      });
      menuDialog.querySelector('[data-floating-logout-cancel]').addEventListener('click', closeMenuDialog);
      menuDialog.addEventListener('click', function (event) { if (event.target === menuDialog) closeMenuDialog(); });
      document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && !menuDialog.hidden) closeMenuDialog(); });
      menuDialog.querySelector('[data-floating-logout-confirm]').addEventListener('click', async function () {
        this.disabled = true;
        try {
          if (window.TravelMateCloud && typeof window.TravelMateCloud.signOut === 'function') await window.TravelMateCloud.signOut();
        } finally {
          var menuHomeUrl = assetScript && assetScript.src ? new URL('../index.html', assetScript.src).href : new URL('/index.html', window.location.href).href;
          window.location.href = menuHomeUrl;
        }
      });
      return;
    }
    if (document.body.classList.contains('home-page')) return;
    var logout = document.createElement('button');
    logout.type = 'button';
    logout.className = 'floating-logout';
    logout.dataset.floatingLogout = '';
    logout.setAttribute('aria-label', 'התנתקות');
    logout.title = 'התנתקות · ניתן לגרור למקום נוח';
    logout.innerHTML = '<i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i><span class="floating-control-tip">התנתקות</span>';

    var dialog = document.createElement('section');
    dialog.className = 'floating-logout-dialog';
    dialog.hidden = true;
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'floating-logout-title');
    dialog.innerHTML = '<div><h2 id="floating-logout-title">התנתקות</h2><p>לצאת מהחשבון ולחזור למסך הראשי?</p><div><button type="button" data-floating-logout-cancel>ביטול</button><button type="button" data-floating-logout-confirm><i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i> התנתקות</button></div></div>';
    document.body.append(logout, dialog);

    var didDrag = false;
    var dragState = null;
    try {
      var savedPosition = JSON.parse(localStorage.getItem(LOGOUT_POSITION_KEY) || 'null');
      if (savedPosition && Number.isFinite(savedPosition.left) && Number.isFinite(savedPosition.top)) {
        logout.style.left = Math.min(Math.max(8, savedPosition.left), window.innerWidth - 48) + 'px';
        logout.style.top = Math.min(Math.max(8, savedPosition.top), window.innerHeight - 48) + 'px';
      }
    } catch (error) {}
    logout.addEventListener('pointerdown', function (event) {
      dragState = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: logout.offsetLeft, top: logout.offsetTop };
      didDrag = false;
      logout.setPointerCapture(event.pointerId);
      logout.classList.add('dragging');
    });
    logout.addEventListener('pointermove', function (event) {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      var deltaX = event.clientX - dragState.x;
      var deltaY = event.clientY - dragState.y;
      if (Math.abs(deltaX) + Math.abs(deltaY) > 5) didDrag = true;
      if (!didDrag) return;
      logout.style.left = Math.min(Math.max(8, dragState.left + deltaX), window.innerWidth - logout.offsetWidth - 8) + 'px';
      logout.style.top = Math.min(Math.max(8, dragState.top + deltaY), window.innerHeight - logout.offsetHeight - 8) + 'px';
    });
    function finishDrag(event) {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      logout.classList.remove('dragging');
      if (didDrag) localStorage.setItem(LOGOUT_POSITION_KEY, JSON.stringify({ left: logout.offsetLeft, top: logout.offsetTop }));
      dragState = null;
      setTimeout(function () { didDrag = false; }, 0);
    }
    logout.addEventListener('pointerup', finishDrag);
    logout.addEventListener('pointercancel', finishDrag);
    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', finishDrag);

    function closeDialog() {
      dialog.hidden = true;
      logout.focus();
    }
    logout.addEventListener('click', function () {
      if (didDrag) return;
      dialog.hidden = false;
      dialog.querySelector('[data-floating-logout-cancel]').focus();
    });
    dialog.querySelector('[data-floating-logout-cancel]').addEventListener('click', closeDialog);
    dialog.addEventListener('click', function (event) { if (event.target === dialog) closeDialog(); });
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && !dialog.hidden) closeDialog(); });
    dialog.querySelector('[data-floating-logout-confirm]').addEventListener('click', async function () {
      this.disabled = true;
      try {
        if (window.TravelMateCloud && typeof window.TravelMateCloud.signOut === 'function') await window.TravelMateCloud.signOut();
      } finally {
        var homeUrl = assetScript && assetScript.src ? new URL('../index.html', assetScript.src).href : new URL('/index.html', window.location.href).href;
        window.location.href = homeUrl;
      }
    });
  }

  window.addEventListener('online', render);
  window.addEventListener('offline', render);
  if (connection && connection.addEventListener) connection.addEventListener('change', render);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) render(); });
  function init() {
    buildWidget();
    buildLogout();
    instrumentFetch();
    startMeasuring();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();

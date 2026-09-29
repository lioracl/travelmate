(function (root) {
  'use strict';

  function sameLocalDay(first, second) {
    return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth() && first.getDate() === second.getDate();
  }

  function selectNextActivity(items, selectedDate, now) {
    var ordered = items.slice().sort(function (first, second) { return first.startMinutes - second.startMinutes; });
    if (!sameLocalDay(selectedDate, now)) {
      return ordered.length ? { activity: ordered[0], status: 'הפעילות הראשונה ביום' } : { activity: null, status: 'אין פעילויות ביום הזה' };
    }
    var currentMinutes = now.getHours() * 60 + now.getMinutes();
    var activity = ordered.find(function (item) {
      return currentMinutes < item.startMinutes + Math.max(1, Number(item.duration || 60));
    });
    if (!activity) return { activity: null, status: 'אין עוד פעילויות היום' };
    if (currentMinutes >= activity.startMinutes) return { activity: activity, status: 'מתחיל עכשיו' };
    var difference = activity.startMinutes - currentMinutes;
    return { activity: activity, status: difference <= 1 ? 'מתחיל עכשיו' : 'עוד ' + difference + ' דקות' };
  }

  function shortLocation(value) {
    var location = String(value || '').split('·')[0].trim();
    return /^(?:מיקום יתווסף בהמשך|מיקום לא הוגדר|ללא מיקום)$/i.test(location) ? '' : location;
  }

  var api = { selectNextActivity: selectNextActivity, shortLocation: shortLocation };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TravelMateTodayActivities = api;
  if (typeof document === 'undefined') return;

  var monthNumbers = {
    'ינואר': 0, 'פברואר': 1, 'מרץ': 2, 'אפריל': 3, 'מאי': 4, 'יוני': 5,
    'יולי': 6, 'אוגוסט': 7, 'ספטמבר': 8, 'אוקטובר': 9, 'נובמבר': 10, 'דצמבר': 11
  };

  function minutes(value) {
    var parts = String(value || '00:00').split(':').map(Number);
    return (parts[0] || 0) * 60 + (parts[1] || 0);
  }

  function addDays(date, count) {
    var result = new Date(date.getTime());
    result.setDate(result.getDate() + count);
    return result;
  }

  function tripStartDate(dayModal) {
    var explicit = document.body.dataset.tripStart;
    if (explicit) return new Date(explicit + 'T12:00:00');
    var tripId = document.body.dataset.tripId || '';
    var yearMatch = tripId.match(/(?:^|-)(\d{4})(?:$|-)/);
    var firstHeading = dayModal.querySelector('[data-day-panel="0"] .day-panel-head h3');
    var dateMatch = firstHeading && firstHeading.textContent.trim().match(/(\d{1,2})\s+(.+)/);
    if (!yearMatch || !dateMatch || monthNumbers[dateMatch[2]] == null) return null;
    return new Date(Number(yearMatch[1]), monthNumbers[dateMatch[2]], Number(dateMatch[1]), 12, 0, 0, 0);
  }

  function rowData(row) {
    var description = row.querySelector('p');
    return {
      element: row,
      startMinutes: minutes(row.dataset.time || (row.querySelector('time') && row.querySelector('time').textContent)),
      duration: Number(row.dataset.duration || 60),
      time: (row.dataset.time || (row.querySelector('time') && row.querySelector('time').textContent) || '').trim(),
      title: (row.querySelector('strong') && row.querySelector('strong').textContent || 'פעילות').trim(),
      location: shortLocation(description && description.textContent)
    };
  }

  function setText(node, value) {
    value = String(value == null ? '' : value);
    if (node.textContent !== value) node.textContent = value;
  }

  function renderCollapsedSummary(card, result) {
    var activity = result.activity;
    var time = card.querySelector('[data-next-time]');
    var title = card.querySelector('[data-next-title]');
    var status = card.querySelector('[data-next-status]');
    var location = card.querySelector('[data-next-location]');
    if (!time || !title || !status || !location) return;
    setText(time, activity ? activity.time : '');
    setText(title, activity ? activity.title : result.status);
    setText(status, activity ? result.status : '');
    setText(location, activity && activity.location ? shortLocation(activity.location) : '');
    location.hidden = !location.textContent;
  }

  function setExpanded(card, open, restoreFocus) {
    var toggle = card.querySelector('.today-activities-toggle');
    var expanded = card.querySelector('.today-activities-expanded');
    if (!toggle || !expanded) return;
    card.classList.toggle('is-collapsed', !open);
    card.classList.toggle('is-expanded', open);
    card.dataset.todayActivitiesOpen = String(open);
    toggle.setAttribute('aria-expanded', String(open));
    var icon = toggle.querySelector('i');
    if (icon) icon.className = open ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down';
    expanded.hidden = !open;
    if (!open && restoreFocus !== false) toggle.focus();
  }

  function shellHtml(id) {
    return '<button class="today-activities-toggle" type="button" aria-expanded="false" aria-controls="' + id + '">' +
      '<span class="today-activities-label">הפעילות הקרובה</span>' +
      '<span class="today-activities-summary" aria-live="polite"><span class="today-activities-main"><b data-next-time></b><strong data-next-title></strong></span>' +
      '<span class="today-activities-meta"><span data-next-status></span><span data-next-location></span></span></span>' +
      '<i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button>' +
      '<div class="today-activities-expanded" id="' + id + '" hidden></div>';
  }

  function bindShell(card, onRefresh) {
    var toggle = card.querySelector('.today-activities-toggle');
    var expanded = card.querySelector('.today-activities-expanded');
    if (!toggle || !expanded || card.dataset.todayActivitiesBound === 'true') return;
    card.dataset.todayActivitiesBound = 'true';
    toggle.addEventListener('click', function () { setExpanded(card, toggle.getAttribute('aria-expanded') !== 'true'); });
    card.addEventListener('click', function (event) {
      if (event.target.closest('.today-activities-less')) setExpanded(card, false);
    });
    if (onRefresh) card.__todayActivitiesRefresh = onRefresh;
  }

  function initLegacy() {
    var overviewPanel = document.querySelector('.dashboard > article.panel:first-child');
    var dayModal = document.getElementById('modal-day');
    if (!overviewPanel || !dayModal || overviewPanel.dataset.todayActivitiesReady === 'true') return false;
    var modalContent = dayModal.querySelector('.modal');
    var tabs = modalContent && modalContent.querySelector('.day-tabs');
    var panels = modalContent && [].slice.call(modalContent.querySelectorAll('.day-panel'));
    if (!tabs || !panels.length) return false;

    var startDate = tripStartDate(dayModal);
    var today = new Date();
    today.setHours(12, 0, 0, 0);
    var initialIndex = 0;
    if (startDate) {
      var difference = Math.round((today - startDate) / 86400000);
      if (difference >= 0 && difference < panels.length) initialIndex = difference;
    }
    tabs.querySelectorAll('[data-day-tab]').forEach(function (tab) {
      var active = Number(tab.dataset.dayTab) === initialIndex;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    panels.forEach(function (panel) { panel.classList.toggle('active', Number(panel.dataset.dayPanel) === initialIndex); });

    var expandedId = 'today-activities-details';
    overviewPanel.dataset.todayActivitiesReady = 'true';
    overviewPanel.classList.add('today-activities-card', 'is-collapsed');
    overviewPanel.innerHTML = shellHtml(expandedId);
    var expanded = overviewPanel.querySelector('.today-activities-expanded');
    expanded.insertAdjacentHTML('beforeend', '<div class="today-activities-expanded-head"><div><span>היום בטיול</span><h2>התוכנית שלך</h2></div></div>');
    expanded.appendChild(tabs);
    panels.forEach(function (panel) { expanded.appendChild(panel); });
    var toast = modalContent.querySelector('.day-toast');
    if (toast) expanded.appendChild(toast);
    expanded.insertAdjacentHTML('beforeend', '<button class="today-activities-less" type="button"><i class="fa-solid fa-chevron-up" aria-hidden="true"></i> הצג פחות</button>');
    dayModal.remove();

    function selectedIndex() {
      var selected = tabs.querySelector('.day-tab.active');
      return selected ? Number(selected.dataset.dayTab) : 0;
    }
    function selectedDate() {
      return startDate ? addDays(startDate, selectedIndex()) : new Date(0);
    }
    function renderSummary() {
      tabs.querySelectorAll('[data-day-tab]').forEach(function (tab) { tab.setAttribute('aria-selected', String(tab.classList.contains('active'))); });
      var panel = expanded.querySelector('[data-day-panel="' + selectedIndex() + '"]');
      var activities = panel ? [].slice.call(panel.querySelectorAll('.day-item')).map(rowData) : [];
      renderCollapsedSummary(overviewPanel, selectNextActivity(activities, selectedDate(), new Date()));
    }

    bindShell(overviewPanel, renderSummary);
    tabs.addEventListener('click', function (event) { if (event.target.closest('[data-day-tab]')) window.setTimeout(renderSummary, 0); });
    new MutationObserver(function (changes) {
      if (changes.some(function (change) { return change.type === 'childList' || change.attributeName === 'class'; })) renderSummary();
    }).observe(expanded, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    window.setInterval(renderSummary, 60000);
    renderSummary();
    return true;
  }

  function currentTrip() {
    var id = new URLSearchParams(location.search).get('id');
    var store = window.TravelMateTripStore;
    return store && store.getTrip ? store.getTrip(id) : null;
  }

  function customActivityData(trip) {
    if (!trip || !window.TravelMateToday) return { items: [], selectedDate: new Date() };
    var state = window.TravelMateToday.phase(trip, new Date());
    var selectedDate = new Date(state.today + 'T12:00:00');
    var agenda = state.name === 'active' ? window.TravelMateToday.agenda(trip, state.today) : [];
    var items = agenda.map(function (item) {
      var source = item.kind === 'place'
        ? (trip.savedPlaces || []).find(function (record) { return String(record.id) === String(item.id); })
        : (trip.activities || []).find(function (record) { return String(record.id) === String(item.id); });
      return {
        startMinutes: minutes(item.time),
        duration: Number(item.duration || 60),
        time: item.time === '23:59' ? '' : item.time,
        title: item.title,
        location: shortLocation(source && (source.address || source.locationName))
      };
    });
    return { items: items, selectedDate: selectedDate, state: state };
  }

  function enhanceCustom() {
    var card = document.querySelector('[data-trip-today]');
    var trip = currentTrip();
    if (!card || !trip || card.hidden || !card.children.length) return false;
    if (card.querySelector('.today-activities-toggle')) {
      if (card.__todayActivitiesRefresh) card.__todayActivitiesRefresh();
      return true;
    }

    var original = document.createElement('div');
    original.className = 'today-activities-current-content';
    while (card.firstChild) original.appendChild(card.firstChild);

    card.classList.add('today-activities-card', 'is-collapsed');
    card.dataset.todayActivitiesReady = 'true';
    card.innerHTML = shellHtml('today-activities-custom-details');
    var expanded = card.querySelector('.today-activities-expanded');
    expanded.appendChild(original);
    expanded.insertAdjacentHTML('beforeend', '<button class="today-activities-less" type="button"><i class="fa-solid fa-chevron-up" aria-hidden="true"></i> הצג פחות</button>');

    function refresh() {
      var freshTrip = currentTrip();
      var data = customActivityData(freshTrip);
      var result;
      if (data.state && data.state.name === 'before') {
        result = { activity: null, status: data.state.daysUntil === 1 ? 'מחר יוצאים לדרך' : 'עוד ' + data.state.daysUntil + ' ימים יוצאים לדרך' };
      } else if (data.state && data.state.name === 'after') {
        result = { activity: null, status: 'הטיול הסתיים' };
      } else {
        result = selectNextActivity(data.items, data.selectedDate, new Date());
      }
      renderCollapsedSummary(card, result);
    }

    bindShell(card, refresh);
    setExpanded(card, card.dataset.todayActivitiesOpen === 'true', false);
    refresh();
    return true;
  }

  var frame = 0;
  function scheduleInit() {
    if (frame) return;
    frame = requestAnimationFrame(function () {
      frame = 0;
      initLegacy();
      enhanceCustom();
    });
  }

  function start() {
    scheduleInit();
    var observer = new MutationObserver(scheduleInit);
    observer.observe(document.body, { childList: true, subtree: true });
    ['travelmate:planner-rendered', 'travelmate:places-updated', 'travelmate:activities-updated'].forEach(function (name) {
      document.addEventListener(name, scheduleInit);
    });
    window.addEventListener('travelmate:local-trips-updated', scheduleInit);
    window.addEventListener('focus', scheduleInit);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') scheduleInit(); });
    window.setInterval(function () {
      var cards = document.querySelectorAll('.today-activities-card');
      cards.forEach(function (card) { if (card.__todayActivitiesRefresh) card.__todayActivitiesRefresh(); });
    }, 60000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(typeof window !== 'undefined' ? window : globalThis);
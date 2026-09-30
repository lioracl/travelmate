(function (root, factory) {
  var helpers = factory();
  if (typeof module === 'object' && module.exports) module.exports = helpers;
  if (root) root.TravelMateToday = Object.freeze(helpers);
})(typeof window === 'undefined' ? null : window, function () {
  'use strict';

  var DAY_MS = 86400000;

  function localDateKey(value) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
    var date = value instanceof Date ? value : new Date(value == null ? Date.now() : value);
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  }

  function dayStamp(value) {
    var parts = String(value || '').split('-').map(Number);
    return parts.length === 3 && parts.every(Number.isFinite) ? Date.UTC(parts[0], parts[1] - 1, parts[2]) : NaN;
  }

  function dayDistance(from, to) {
    return Math.round((dayStamp(to) - dayStamp(from)) / DAY_MS);
  }

  function phase(trip, today) {
    var date = localDateKey(today);
    var start = String(trip && trip.start || '');
    var end = String(trip && trip.end || start);
    if (date < start) return { name: 'before', today: date, daysUntil: dayDistance(date, start), dayIndex: 0 };
    if (date > end) return { name: 'after', today: date, daysUntil: 0, dayIndex: 0 };
    return { name: 'active', today: date, daysUntil: 0, dayIndex: dayDistance(start, date) + 1 };
  }

  function normalizedTime(value) {
    var match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
    return match ? String(match[1]).padStart(2, '0') + ':' + match[2] : '23:59';
  }

  function timingMode(item) {
    var raw = String(item && (item.scheduleMode || item.timingMode || item.flexibility) || '').toLowerCase();
    if (raw === 'fixed' || raw === 'booked' || raw === 'reservation') return 'fixed';
    if (raw === 'window' || raw === 'time-window' || raw === 'time_window') return 'window';
    if (raw === 'flexible' || raw === 'free') return 'flexible';
    return 'planned';
  }

  function agenda(trip, date) {
    var items = [];
    (trip && trip.activities || []).forEach(function (item) {
      if (!item || item.date !== date) return;
      items.push({ kind: 'activity', id: item.id, title: item.title || 'פעילות', date: item.date, time: normalizedTime(item.time), duration: Math.max(0, Number(item.duration || 0)), category: item.category || 'פעילות', scheduleMode: timingMode(item), done: item.done === true });
    });
    (trip && trip.savedPlaces || []).forEach(function (item) {
      if (!item || item.date !== date) return;
      items.push({ kind: 'place', id: item.id, title: item.name || 'מקום שמור', date: item.date, time: normalizedTime(item.time), duration: Math.max(0, Number(item.duration || 0)), category: item.category || 'מקום שמור', scheduleMode: timingMode(item), done: item.done === true });
    });
    return items.sort(function (left, right) { return left.time.localeCompare(right.time) || left.title.localeCompare(right.title, 'he'); });
  }

  function minutes(value) {
    var match = String(value || '').match(/^(\d{2}):(\d{2})$/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  }

  function currentOrNext(items, nowMinutes) {
    if (typeof nowMinutes === 'string') nowMinutes = minutes(nowMinutes);
    else if (nowMinutes instanceof Date) nowMinutes = nowMinutes.getHours() * 60 + nowMinutes.getMinutes();
    var remaining = (items || []).filter(function (item) { return !item.done && item.scheduleMode !== 'flexible' && item.scheduleMode !== 'window'; });
    var current = remaining.find(function (item) {
      var start = minutes(item.time);
      return start !== null && item.duration > 0 && start <= nowMinutes && nowMinutes < start + item.duration;
    });
    if (current) return Object.assign({ state: 'current', item: current }, current);
    var next = remaining.find(function (item) { var start = minutes(item.time); return start !== null && start >= nowMinutes; });
    return next ? Object.assign({ state: 'next', item: next }, next) : null;
  }

  function allItems(trip) {
    return (trip && trip.activities || []).concat(trip && trip.savedPlaces || []).filter(function (item) { return item && item.date; });
  }

  function summary(trip) {
    var items = allItems(trip);
    return { total: items.length, completed: items.filter(function (item) { return item.done === true; }).length };
  }

  function firstScheduled(trip) {
    var dates = allItems(trip).map(function (item) {
      return { title: item.title || item.name || 'פריט בתוכנית', date: item.date, time: normalizedTime(item.time) };
    }).sort(function (left, right) { return (left.date + left.time).localeCompare(right.date + right.time); });
    return dates[0] || null;
  }

  function model(trip, now) {
    var date = now instanceof Date ? now : new Date(now == null ? Date.now() : now);
    var phaseState = phase(trip, date);
    var items = allItems(trip).slice().sort(function (left, right) {
      return (String(left.date) + normalizedTime(left.time)).localeCompare(String(right.date) + normalizedTime(right.time));
    });
    var todayItems = agenda(trip, phaseState.today);
    return {
      phase: phaseState.name.toUpperCase(), today: phaseState.today,
      dayIndex: phaseState.name === 'active' ? phaseState.dayIndex : null,
      tripDays: Number(trip && trip.days || dayDistance(trip.start, trip.end) + 1),
      daysUntilStart: phaseState.daysUntil,
      items: items, todayItems: todayItems,
      completedToday: todayItems.filter(function (item) { return item.done; }).length,
      remainingToday: todayItems.filter(function (item) { return !item.done; }).length,
      currentOrNext: currentOrNext(todayItems, date),
      firstScheduled: firstScheduled(trip),
      completedTotal: items.filter(function (item) { return item.done === true; }).length
    };
  }

  return {
    localDateKey: localDateKey, localDateValue: localDateKey,
    dayDistance: dayDistance, daysBetween: dayDistance,
    phase: phase, tripPhase: function (trip, now) { return phase(trip, now).name.toUpperCase(); },
    agenda: agenda, agendaForDate: agenda,
    currentOrNext: currentOrNext, summary: summary, firstScheduled: firstScheduled, model: model
  };
});

(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var tripId = new URLSearchParams(location.search).get('id');
  var cloud = window.TravelMateCloud;
  var store = window.TravelMateTripStore;

  function localTrip() {
    if (store && store.getTrip) return store.getTrip(tripId);
    if (cloud && cloud.getLocalTrips) {
      return cloud.getLocalTrips().find(function (item) { return String(item.id) === String(tripId); }) || null;
    }
    return null;
  }

  function signature(trip) {
    try { return JSON.stringify(trip); } catch (error) { return ''; }
  }

  function localDateValue(date) {
    return window.TravelMateToday.localDateKey(date || new Date());
  }

  function normalizedTime(value) {
    var match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
    if (!match) return '23:59';
    return String(match[1]).padStart(2, '0') + ':' + match[2];
  }

  function overviewTimingMode(item) {
    var helper = window.TravelMateTripContext;
    if (helper && helper.scheduleMode) return helper.scheduleMode(item);
    var raw = String(item && (item.scheduleMode || item.timingMode || item.flexibility) || '').toLowerCase();
    if (raw === 'fixed' || raw === 'booked' || raw === 'reservation') return 'fixed';
    if (raw === 'window' || raw === 'time-window' || raw === 'time_window') return 'window';
    if (raw === 'flexible' || raw === 'free') return 'flexible';
    return 'planned';
  }

  function overviewItems(trip) {
    var items = [];
    (trip.activities || []).forEach(function (activity) {
      if (!activity || !activity.date || activity.done) return;
      items.push({
        kind: 'activity',
        title: activity.title || 'פעילות',
        date: activity.date,
        time: normalizedTime(activity.time),
        duration: Math.max(0, Number(activity.duration || 0)),
        category: activity.category || '',
        location: activity.locationName || activity.address || '',
        scheduleMode: overviewTimingMode(activity)
      });
    });
    (trip.savedPlaces || []).forEach(function (place) {
      if (!place || !place.date || place.done) return;
      items.push({
        kind: 'place',
        title: place.name || 'מקום שמור',
        date: place.date,
        time: normalizedTime(place.time),
        duration: Math.max(0, Number(place.duration || 0)),
        category: place.category || '',
        location: place.address || place.description || '',
        scheduleMode: overviewTimingMode(place)
      });
    });
    return items.sort(function (a, b) {
      return String(a.date + 'T' + a.time).localeCompare(String(b.date + 'T' + b.time));
    });
  }

  function overviewTimeMinutes(value) {
    var match = String(value || '').match(/^(\d{2}):(\d{2})$/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  }

  function overviewClockValue(minutes) {
    if (!Number.isFinite(minutes)) return '';
    var value = ((minutes % 1440) + 1440) % 1440;
    return String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0');
  }

  function nextOverviewItem(trip) {
    var items = overviewItems(trip);
    if (!items.length) return null;
    var now = new Date();
    var today = localDateValue(now);
    var currentMinutes = now.getHours() * 60 + now.getMinutes();
    var timedItems = items.filter(function (item) { return item.scheduleMode !== 'flexible' && item.scheduleMode !== 'window'; });
    var current = timedItems.find(function (item) {
      var startMinutes = item.date === today ? overviewTimeMinutes(item.time) : null;
      return startMinutes !== null && item.duration > 0 && startMinutes <= currentMinutes && currentMinutes < startMinutes + item.duration;
    });
    if (current) {
      var currentStart = overviewTimeMinutes(current.time);
      return Object.assign({}, current, { isNow: true, endTime: overviewClockValue(currentStart + current.duration) });
    }
    var currentTime = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    var nextTimed = timedItems.find(function (item) {
      return item.date > today || (item.date === today && item.time >= currentTime);
    });
    if (nextTimed) return nextTimed;
    return items.find(function (item) {
      return item.date > today || (item.date === today && item.time >= currentTime);
    }) || null;
  }

  function overviewLodging(trip) {
    var lodgingPattern = /מלון|לינה|hotel|hostel|apartment|accommodation/i;
    return (trip.savedPlaces || []).find(function (place) {
      return lodgingPattern.test(String(place && place.category || '') + ' ' + String(place && place.name || ''));
    }) || (trip.activities || []).find(function (activity) {
      return lodgingPattern.test(String(activity && activity.category || '') + ' ' + String(activity && activity.title || ''));
    }) || null;
  }

  function cachedCurrencyRates() {
    for (var index = 0; index < localStorage.length; index += 1) {
      var key = localStorage.key(index);
      if (!key || key.indexOf('travelmate-eur-rates:') !== 0) continue;
      try {
        var value = JSON.parse(localStorage.getItem(key) || 'null');
        if (value && value.rates) return value.rates;
      } catch (error) {}
    }
    return {};
  }

  function spentInEuros(trip) {
    var rates = cachedCurrencyRates();
    return (trip.expenses || []).reduce(function (sum, expense) {
      var amount = Number(expense && expense.amount || 0);
      var currency = String(expense && expense.currency || 'EUR').toUpperCase();
      if (!amount) return sum;
      if (currency === 'EUR') return sum + amount;
      var rate = Number(rates[currency] || 0);
      return rate ? sum + amount / rate : sum;
    }, 0);
  }

  function compactMoney(value, currency) {
    try {
      return new Intl.NumberFormat('he-IL', { style: 'currency', currency: currency || 'EUR', maximumFractionDigits: 0 }).format(Number(value || 0));
    } catch (error) {
      return Math.round(Number(value || 0)).toLocaleString('he-IL') + ' ' + (currency || 'EUR');
    }
  }

  function overviewBudgetMoney(euros, trip) {
    var currency = String(trip && trip.budgetCurrency || 'ILS').toUpperCase();
    if (currency === 'EUR') return compactMoney(euros, 'EUR');
    var rate = Number(cachedCurrencyRates()[currency] || 0);
    return rate ? compactMoney(Number(euros || 0) * rate, currency) : '';
  }

  function formatOverviewDate(date, time) {
    if (!date) return '';
    var value = new Date(date + 'T12:00:00');
    var today = localDateValue(new Date());
    var label = date === today ? 'היום' : new Intl.DateTimeFormat('he-IL', { weekday: 'short', day: 'numeric', month: 'short' }).format(value);
    return label + (time && time !== '23:59' ? ' · ' + time : '');
  }

  function escapeToday(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function todayDateLabel(date) {
    return new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(date + 'T12:00:00'));
  }

  function todayAgendaRows(items, focus) {
    var start = 0;
    if (items.length > 3 && focus) {
      var focusIndex = items.findIndex(function (item) { return item.kind === focus.kind && String(item.id) === String(focus.id); });
      if (focusIndex > 0) start = Math.min(focusIndex - 1, items.length - 3);
    }
    return items.slice(start, start + 3).map(function (item) {
      var time = item.time === '23:59' ? 'ללא שעה' : item.time;
      return '<li class="trip-today-row' + (item.done ? ' is-complete' : '') + '">' +
        '<time datetime="' + escapeToday(item.date + 'T' + item.time) + '">' + escapeToday(time) + '</time>' +
        '<span><strong>' + escapeToday(item.title) + '</strong><small>' + escapeToday(item.category) + (item.kind === 'place' ? ' · מקום שמור' : '') + '</small></span>' +
        (item.done ? '<i class="fa-solid fa-check" aria-label="הושלם"></i>' : '') + '</li>';
    }).join('');
  }

  function todayActions(includeAll, afterTrip) {
    var actions = afterTrip
      ? '<a class="primary" href="#plan"><i class="fa-solid fa-calendar-days" aria-hidden="true"></i>תוכנית הטיול</a><a href="#overview"><i class="fa-solid fa-house" aria-hidden="true"></i>סקירה</a>'
      : '<a class="primary" href="#plan"><i class="fa-solid fa-calendar-days" aria-hidden="true"></i>תוכנית</a>';
    if (includeAll) actions += '<a href="#places"><i class="fa-solid fa-location-dot" aria-hidden="true"></i>מקומות</a><a href="#budget"><i class="fa-solid fa-wallet" aria-hidden="true"></i>תקציב</a><button type="button" data-today-weather><i class="fa-solid fa-cloud-sun" aria-hidden="true"></i>מזג אוויר</button>';
    return '<nav class="trip-today-actions" aria-label="פעולות מהירות">' + actions + '</nav>';
  }

  function renderTripToday(trip, now) {
    var root = document.querySelector('[data-trip-today]');
    if (!root || !trip || !trip.start || !trip.end) return;
    now = now || new Date();
    var state = window.TravelMateToday.phase(trip, now);
    var heading = '<header><div><small>מצב טיול · היום</small><h2 id="trip-today-title">';
    var closingHeading = '</h2></div>';

    if (state.name === 'before') {
      var first = window.TravelMateToday.firstScheduled(trip);
      var countdown = state.daysUntil === 1 ? 'מחר יוצאים לדרך' : 'עוד ' + state.daysUntil + ' ימים יוצאים לדרך';
      root.innerHTML = heading + escapeToday(countdown) + closingHeading + '<i class="fa-solid fa-suitcase-rolling" aria-hidden="true"></i></header>' +
        '<div class="trip-today-before"><p>הטיול מתחיל ב־<strong>' + escapeToday(todayDateLabel(trip.start)) + '</strong>.</p>' +
        (first ? '<span>הפריט הראשון: <strong>' + escapeToday(first.title) + '</strong> · ' + escapeToday(formatOverviewDate(first.date, first.time)) + '</span>' : '<span>התוכנית עדיין פתוחה — אפשר להתחיל בקצב שלך.</span>') + '</div>' + todayActions(false, false);
    } else if (state.name === 'after') {
      var tripSummary = window.TravelMateToday.summary(trip);
      root.innerHTML = heading + 'הטיול הסתיים' + closingHeading + '<i class="fa-solid fa-flag-checkered" aria-hidden="true"></i></header>' +
        '<div class="trip-today-before"><p><strong>' + tripSummary.completed + '</strong> מתוך <strong>' + tripSummary.total + '</strong> פריטים סומנו כהושלמו.</p><span>המסלול נשאר כאן לעיון, ואפשר לשמור את הרגעים שאספתם.</span></div>' + todayActions(false, true);
    } else {
      var items = window.TravelMateToday.agenda(trip, state.today);
      var completed = items.filter(function (item) { return item.done; }).length;
      var remaining = items.length - completed;
      var nowMinutes = now.getHours() * 60 + now.getMinutes();
      var focus = window.TravelMateToday.currentOrNext(items, nowMinutes);
      var tripDays = Number(trip.days || window.TravelMateToday.dayDistance(trip.start, trip.end) + 1);
      var focusHtml = focus
        ? '<div class="trip-today-focus"><small>' + (focus.state === 'current' ? 'עכשיו' : 'הבא היום') + '</small><strong>' + escapeToday(focus.title) + '</strong><span>' + escapeToday(focus.time === '23:59' ? 'ללא שעה' : focus.time) + (focus.category ? ' · ' + escapeToday(focus.category) : '') + '</span></div>'
        : '';
      var agendaHtml = items.length
        ? '<ol class="trip-today-agenda" aria-label="סדר היום">' + todayAgendaRows(items, focus) + '</ol>'
        : '<div class="trip-today-empty"><i class="fa-regular fa-calendar-plus" aria-hidden="true"></i><div><strong>היום נשאר פתוח</strong><span>אפשר לנוח או להוסיף משהו קטן לתוכנית.</span></div><a href="#plan">לתכנון היום</a></div>';
      root.innerHTML = heading + 'היום הוא יום ' + state.dayIndex + ' מתוך ' + tripDays + closingHeading + '<time datetime="' + state.today + '">' + escapeToday(todayDateLabel(state.today)) + '</time></header>' +
        '<div class="trip-today-progress" aria-label="התקדמות היום"><span><strong>' + completed + '</strong> הושלמו</span><i aria-hidden="true"></i><span><strong>' + remaining + '</strong> נשארו</span></div>' + focusHtml + agendaHtml + todayActions(true, false);
    }
    root.hidden = false;
    if (root.dataset.weatherBound !== 'true') {
      root.dataset.weatherBound = 'true';
      root.addEventListener('click', function (event) {
        if (!event.target.closest('[data-today-weather]')) return;
        var weather = document.querySelector('[data-weather-top-widget]');
        if (weather) weather.click();
      });
    }
  }

  function renderOverviewControlCenter(trip) {
    var root = document.querySelector('[data-overview-control-center]');
    if (!root || !trip) return;

    var next = nextOverviewItem(trip);
    var nextLabel = root.querySelector('[data-overview-next-label]');
    var nextTitle = root.querySelector('[data-overview-next-title]');
    var nextMeta = root.querySelector('[data-overview-next-meta]');
    if (next) {
      nextLabel.textContent = next.isNow ? 'עכשיו' : 'הבא בתוכנית';
      nextTitle.textContent = next.title;
      nextMeta.textContent = [
        next.isNow ? 'עד ' + next.endTime : formatOverviewDate(next.date, next.time),
        next.location || next.category
      ].filter(Boolean).join(' · ');
    } else {
      nextLabel.textContent = 'הבא בתוכנית';
      nextTitle.textContent = 'עדיין אין פעילות מתוכננת';
      nextMeta.textContent = 'אפשר להתחיל מכרטיסיית תוכנית';
    }

    var expenses = Array.isArray(trip.expenses) ? trip.expenses : [];
    var spent = spentInEuros(trip);
    var spentDisplay = overviewBudgetMoney(spent, trip);
    var budgetTitle = root.querySelector('[data-overview-budget-title]');
    var budgetMeta = root.querySelector('[data-overview-budget-meta]');
    if (trip.budgetUnlimited === true) {
      budgetTitle.textContent = 'ללא הגבלה';
      budgetMeta.textContent = expenses.length
        ? expenses.length + ' הוצאות נרשמו' + (spentDisplay ? ' · כ־' + spentDisplay : '')
        : 'מעקב הוצאות פעיל';
    } else {
      var budget = Number(trip.budget || 0);
      var budgetDelta = budget - spent;
      var budgetOverrun = budget > 0 && budgetDelta < 0;
      var budgetDeltaDisplay = overviewBudgetMoney(Math.abs(budgetDelta), trip);
      budgetTitle.textContent = budget
        ? budgetDeltaDisplay
          ? budgetOverrun ? 'חריגה של ' + budgetDeltaDisplay : budgetDeltaDisplay + ' נותרו'
          : budgetOverrun ? 'חריגה בתקציב' : 'תקציב מוגדר'
        : 'טרם הוגדר תקציב';
      budgetMeta.textContent = expenses.length
        ? spentDisplay
          ? 'הוצאו עד עכשיו כ־' + spentDisplay + ' · ' + expenses.length + ' הוצאות'
          : expenses.length + ' הוצאות נרשמו · סכום בשקלים יתעדכן לאחר טעינת שער'
        : budget ? 'עדיין לא נרשמו הוצאות' : 'אפשר להגדיר מסגרת או לבחור ללא הגבלה';
      var overviewBudgetCard = budgetTitle.closest('.budget-card');
      if (overviewBudgetCard) overviewBudgetCard.classList.toggle('is-over-budget', budgetOverrun);
    }

    var lodging = overviewLodging(trip);
    var lodgingTitle = root.querySelector('[data-overview-lodging-title]');
    var lodgingMeta = root.querySelector('[data-overview-lodging-meta]');
    if (lodging) {
      lodgingTitle.textContent = lodging.name || lodging.locationName || lodging.title || 'מקום הלינה';
      lodgingMeta.textContent = lodging.address || lodging.description || lodging.locationName || 'נשמר בטיול';
    } else {
      lodgingTitle.textContent = 'לא הוגדר עדיין';
      lodgingMeta.textContent = 'אפשר לקבע מלון דרך מקומות';
    }

    var attentionTitle = root.querySelector('[data-overview-attention-title]');
    var attentionMeta = root.querySelector('[data-overview-attention-meta]');
    var attentionLink = root.querySelector('[data-overview-attention-link]');
    var hasPlan = overviewItems(trip).length > 0;
    var today = localDateValue(new Date());
    var beforeTrip = trip.start && today < trip.start;
    var duringTrip = trip.start && trip.end && today >= trip.start && today <= trip.end;
    if (!hasPlan) {
      attentionTitle.textContent = 'התוכנית עדיין ריקה';
      attentionMeta.textContent = 'הוסף לפחות פעילות אחת כדי שהסקירה תוכל להוביל אותך במהלך היום';
      attentionLink.setAttribute('href', '#plan');
    } else if (!lodging && (beforeTrip || duringTrip)) {
      attentionTitle.textContent = 'לא הוגדר מקום לינה';
      attentionMeta.textContent = 'שמירת המלון תעזור לניווט ולתכנון היומי';
      attentionLink.setAttribute('href', '#places');
    } else if (trip.budgetUnlimited !== true && !Number(trip.budget || 0)) {
      attentionTitle.textContent = 'לא הוגדר מצב תקציב';
      attentionMeta.textContent = 'אפשר לבחור תקציב מוגדר או ללא הגבלה';
      attentionLink.setAttribute('href', '#budget');
    } else {
      attentionTitle.textContent = duringTrip ? 'הטיול פעיל והבסיס מסודר' : 'הבסיס לטיול מסודר';
      attentionMeta.textContent = next ? 'הפעילות הבאה כבר מופיעה כאן למעלה' : 'אין כרגע פעולה דחופה';
      attentionLink.setAttribute('href', '#plan');
    }
  }

  var immediateTrip = localTrip();
  var immediateSignature = signature(immediateTrip);
  if (immediateTrip) renderTrip(immediateTrip);

  var inviteToken = new URLSearchParams(location.search).get('invite');

  async function resolveCloudTrip(seedTrip, token) {
    var trip = seedTrip;
    if (!cloud || !tripId) return trip || localTrip();
    try {
      var invitedOwnerId = null;
      if (token) {
        var invitation = await cloud.acceptTripInvite(token);
        if (!invitation.accepted && invitation.reason === 'SIGNED_OUT') {
          sessionStorage.setItem('travelmate-pending-invite', location.href);
        } else if (invitation.accepted) {
          invitedOwnerId = invitation.trip && invitation.trip.owner_id;
          var cleanUrl = new URL(location.href);
          cleanUrl.searchParams.delete('invite');
          history.replaceState({}, '', cleanUrl.href);
          window.dispatchEvent(new CustomEvent('travelmate:invite-accepted'));
        }
      }
      var cloudTrip = await cloud.getTrip(tripId, invitedOwnerId);
      if (cloudTrip) trip = cloudTrip;
    } catch (error) {
      console.error('TravelMate cloud trip load failed', error);
      trip = trip || localTrip();
    }
    return trip || localTrip();
  }

  function scheduleCloudRefresh(seedTrip) {
    if (!cloud || !tripId || !seedTrip || navigator.onLine === false) return;
    var run = function () {
      resolveCloudTrip(seedTrip, null).then(function (cloudTrip) {
        if (!cloudTrip) return;
        if (signature(cloudTrip) !== signature(localTrip())) renderTrip(cloudTrip);
        window.dispatchEvent(new CustomEvent('travelmate:trip-cloud-refreshed', { detail: { id: tripId } }));
      }).catch(function () {});
    };
    setTimeout(function () {
      if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 2000 });
      else run();
    }, 2800);
  }

  if (immediateTrip && !inviteToken) {
    window.travelMateTripReady = Promise.resolve(immediateTrip);
    scheduleCloudRefresh(immediateTrip);
  } else {
    window.travelMateTripReady = resolveCloudTrip(immediateTrip, inviteToken).then(function (trip) {
      if (!trip) {
        location.replace('../../index.html');
        return null;
      }
      if (!immediateTrip || signature(trip) !== immediateSignature) renderTrip(trip);
      return trip;
    });
  }

  function renderTrip(trip) {
    function text(selector, value) { document.querySelectorAll(selector).forEach(function (node) { node.textContent = value; }); }
    function format(value) { return new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value + 'T12:00:00')); }
    document.title = trip.city + ', ' + trip.country + ' - TravelMate';
    if (window.TravelMateDestinationImages) window.TravelMateDestinationImages.apply(document.querySelector('.custom-hero'), trip.city, trip.country);
    text('[data-city]', trip.city);
    text('[data-country]', trip.country);
    text('[data-country-flag]', window.TravelMateDestinationImages ? window.TravelMateDestinationImages.flag(trip.country) : '🌍');
    if (window.TravelMateDestinationImages && window.TravelMateDestinationImages.flagCode) {
      var countryCode = window.TravelMateDestinationImages.flagCode(trip.country);
      if (countryCode) document.querySelectorAll('[data-country-flag]').forEach(function (node) {
        node.innerHTML = '<img class="country-flag-svg" src="https://flagcdn.com/' + countryCode.toLowerCase() + '.svg" alt="" width="28" height="20">';
      });
    }
    text('[data-days]', trip.days);
    text('[data-type]', trip.type);
    text('[data-budget]', Number(trip.budget).toLocaleString('he-IL'));
    text('[data-dates]', format(trip.start) + ' – ' + format(trip.end));
    renderTripToday(trip);
    renderOverviewControlCenter(trip);
    var query = encodeURIComponent(trip.city + ', ' + trip.country);
    document.querySelectorAll('[data-maps]').forEach(function (link) { link.href = 'https://www.google.com/maps/search/?api=1&query=' + query; });
    document.querySelector('[data-wiki]').href = 'https://he.wikipedia.org/wiki/Special:Search?search=' + query;
    document.querySelector('[data-tourism]').href = 'https://www.google.com/search?q=' + encodeURIComponent('official tourism ' + trip.city + ' ' + trip.country);
    document.querySelectorAll('[data-search]').forEach(function (link) { link.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(link.dataset.search + ' ' + trip.city + ' ' + trip.country); });
    var themes = ['היכרות עם מרכז העיר והסביבה', 'אתרי החובה והתרבות המקומית', 'שכונות, אוכל ושווקים', 'טבע, פארקים ונקודות תצפית', 'יום גמיש להמלצות שהתגלו בדרך'];
    var start = new Date(trip.start + 'T12:00:00');
    var days = document.querySelector('[data-generated-days]');
    days.innerHTML = '';
    for (var index = 0; index < trip.days; index += 1) {
      var date = new Date(start.getTime() + index * 86400000);
      var article = document.createElement('article');
      article.className = 'generated-day';
      article.innerHTML = '<span class="badge">יום ' + (index + 1) + '</span><div><strong>' + new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }).format(date) + '</strong><p>' + (index === 0 ? 'הגעה, התמקמות וסיור קל ליד מקום הלינה' : index === trip.days - 1 ? 'בוקר חופשי, השלמות ויציאה לשדה התעופה' : themes[(index - 1) % themes.length]) + '</p></div>';
      days.appendChild(article);
    }
  }

  function renderSyncConflictBanner(trip) {
    var banner = document.querySelector('[data-sync-conflict]');
    if (!banner) return;
    banner.dataset.syncConflictVisible = String(Boolean(trip && String(trip.syncStatus || '') === 'conflict'));
  }

  function refreshOverviewFromStore() {
    var trip = localTrip();
    if (trip) {
      renderTripToday(trip);
      renderOverviewControlCenter(trip);
    }
    renderSyncConflictBanner(trip);
  }

  async function resolveVisibleConflict(strategy) {
    var trip = localTrip();
    var banner = document.querySelector('[data-sync-conflict]');
    if (!trip || !banner || !store || typeof store.resolveConflict !== 'function') return;
    var buttons = Array.prototype.slice.call(banner.querySelectorAll('button'));
    var message = banner.querySelector('.trip-sync-conflict-copy p');
    buttons.forEach(function (button) { button.disabled = true; });
    if (message) message.textContent = 'מסנכרן את הגרסה שבחרת…';
    try {
      var result = await store.resolveConflict(trip.id, strategy, trip.ownerId);
      if (result && result.trip) {
        renderTrip(result.trip);
        renderSyncConflictBanner(result.trip);
        window.location.reload();
        return;
      }
      refreshOverviewFromStore();
    } catch (error) {
      console.error('TravelMate conflict resolution failed', error);
      if (message) message.textContent = 'לא הצלחנו לפתור את ההתנגשות כרגע. השינויים המקומיים נשמרו ולא נדרסו.';
      renderSyncConflictBanner(localTrip());
    } finally {
      buttons.forEach(function (button) { button.disabled = false; });
    }
  }

  var useCloudButton = document.querySelector('[data-sync-use-cloud]');
  var keepLocalButton = document.querySelector('[data-sync-keep-local]');
  if (useCloudButton) useCloudButton.addEventListener('click', function () { resolveVisibleConflict('cloud'); });
  if (keepLocalButton) keepLocalButton.addEventListener('click', function () { resolveVisibleConflict('local'); });

  renderSyncConflictBanner(immediateTrip);

  ['travelmate:planner-rendered', 'travelmate:places-updated', 'travelmate:activities-updated'].forEach(function (eventName) {
    document.addEventListener(eventName, refreshOverviewFromStore);
  });
  window.addEventListener('travelmate:local-trips-updated', refreshOverviewFromStore);
  window.addEventListener('travelmate:trip-synced', refreshOverviewFromStore);
  window.addEventListener('focus', refreshOverviewFromStore);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') refreshOverviewFromStore();
  });

  var writeForbiddenNoticeTimer = null;
  window.addEventListener('travelmate:trip-write-forbidden', function (event) {
    var trip = localTrip();
    if (!trip || !event.detail || String(event.detail.id) !== String(trip.id)) return;
    refreshOverviewFromStore();
    var notice = document.querySelector('[data-sync-write-notice]');
    if (!notice) return;
    notice.hidden = false;
    clearTimeout(writeForbiddenNoticeTimer);
    writeForbiddenNoticeTimer = setTimeout(function () { notice.hidden = true; }, 6500);
  });
})();

(function () {
  'use strict';

  if (window.__travelMateOverviewV2Loaded) return;
  window.__travelMateOverviewV2Loaded = true;

  var host = document.querySelector('[data-overview-control-center]');
  if (!host || !window.TravelMateTripStore) return;

  var tripId = new URLSearchParams(location.search).get('id');
  var currency = window.TravelMateCurrencyUtils;

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function localDateValue(date) {
    var value = date || new Date();
    return value.getFullYear() + '-' + String(value.getMonth() + 1).padStart(2, '0') + '-' + String(value.getDate()).padStart(2, '0');
  }

  function localTimeValue(date) {
    var value = date || new Date();
    return String(value.getHours()).padStart(2, '0') + ':' + String(value.getMinutes()).padStart(2, '0');
  }

  function dayDiff(left, right) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(left || '') || !/^\d{4}-\d{2}-\d{2}$/.test(right || '')) return 0;
    return Math.round((new Date(left + 'T12:00:00') - new Date(right + 'T12:00:00')) / 86400000);
  }

  function formatDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return '';
    return new Intl.DateTimeFormat('he-IL', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(value + 'T12:00:00'));
  }

  function safeUrl(value) {
    try {
      var url = new URL(String(value || ''), location.href);
      return /^(https?):$/.test(url.protocol) ? url.href : '';
    } catch (error) {
      return '';
    }
  }

  function tripPhase(trip) {
    var today = localDateValue();
    if (trip.start && today < trip.start) {
      var until = Math.max(0, dayDiff(trip.start, today));
      return { mode: 'before', label: until === 1 ? 'מתחיל מחר' : 'מתחיל בעוד ' + until + ' ימים' };
    }
    if (trip.end && today > trip.end) return { mode: 'after', label: 'הטיול הסתיים' };
    if (trip.start && trip.end) {
      var day = Math.max(1, dayDiff(today, trip.start) + 1);
      var total = Math.max(1, dayDiff(trip.end, trip.start) + 1);
      return { mode: 'active', label: 'יום ' + Math.min(day, total) + ' מתוך ' + total };
    }
    return { mode: 'active', label: 'הטיול פעיל' };
  }

  function scheduledItems(trip) {
    var activities = Array.isArray(trip.activities) ? trip.activities : [];
    var places = Array.isArray(trip.savedPlaces) ? trip.savedPlaces : [];
    return activities.map(function (item) {
      return {
        id: item.id,
        title: item.title || item.name || 'פעילות',
        date: item.date || '',
        time: item.time || '',
        done: Boolean(item.done),
        type: 'activity'
      };
    }).concat(places.filter(function (item) {
      return !item.isTripBase;
    }).map(function (item) {
      return {
        id: item.id,
        title: item.name || item.title || (item.travelAnchor ? 'מעבר' : 'מקום'),
        date: item.date || '',
        time: item.time || '',
        done: Boolean(item.done),
        type: item.travelAnchor || 'place'
      };
    })).filter(function (item) {
      return /^\d{4}-\d{2}-\d{2}$/.test(item.date) && !item.done;
    }).sort(function (left, right) {
      return String(left.date + 'T' + (left.time || '23:59')).localeCompare(String(right.date + 'T' + (right.time || '23:59')));
    });
  }

  function nextScheduledItem(trip, phase) {
    var items = scheduledItems(trip);
    if (!items.length || phase.mode === 'after') return null;
    if (phase.mode === 'before') return items[0] || null;
    var threshold = localDateValue() + 'T' + localTimeValue();
    return items.find(function (item) {
      return String(item.date + 'T' + (item.time || '23:59')) >= threshold;
    }) || null;
  }

  function formatBudgetAmount(euros, localCurrency, cache) {
    if (!currency || !Number.isFinite(Number(euros))) return '';
    var rates = cache && cache.rates || {};
    var local = currency.localFromEuros(Number(euros), localCurrency, rates);
    if (Number.isFinite(local)) return currency.money(local, localCurrency);
    return currency.money(Number(euros), 'EUR');
  }

  function budgetSnapshot(trip) {
    var expenses = Array.isArray(trip.expenses) ? trip.expenses : [];
    var localCurrency = currency ? currency.countryCurrency(trip.country) : 'EUR';
    var cache = currency ? currency.readCachedRates(localCurrency) : null;
    var rates = cache && cache.rates || {};
    var euroValues = currency ? expenses.map(function (expense) { return currency.expenseInEuros(expense, rates); }) : [];
    var complete = euroValues.length === expenses.length && euroValues.every(Number.isFinite);
    var spentEuros = complete ? euroValues.reduce(function (sum, value) { return sum + value; }, 0) : NaN;
    var unlimited = trip.budgetUnlimited === true;
    var totalEuros = Number(trip.budget || 0);

    var strong = '';
    var detail = '';
    if (!expenses.length) {
      strong = unlimited ? '0 הוצאות' : formatBudgetAmount(0, localCurrency, cache);
      detail = unlimited ? 'מעקב ללא תקרת תקציב' : totalEuros ? 'מתוך ' + formatBudgetAmount(totalEuros, localCurrency, cache) : 'הגדר תקציב כדי לעקוב אחרי ההוצאות';
    } else if (complete) {
      strong = formatBudgetAmount(spentEuros, localCurrency, cache);
      if (unlimited) {
        detail = expenses.length + ' הוצאות · ללא תקרה';
      } else if (totalEuros) {
        var remaining = Math.max(0, totalEuros - spentEuros);
        detail = 'נשאר ' + formatBudgetAmount(remaining, localCurrency, cache) + ' מתוך ' + formatBudgetAmount(totalEuros, localCurrency, cache);
      } else {
        detail = expenses.length + ' הוצאות · עדיין לא הוגדר תקציב';
      }
    } else {
      var currencies = expenses.map(function (expense) { return String(expense.currency || 'EUR').toUpperCase(); });
      var unique = currencies.filter(function (code, index, list) { return list.indexOf(code) === index; });
      if (unique.length === 1) {
        var direct = expenses.reduce(function (sum, expense) { return sum + Number(expense.amount || 0); }, 0);
        strong = currency ? currency.money(direct, unique[0]) : direct.toLocaleString('he-IL') + ' ' + unique[0];
        detail = expenses.length + ' הוצאות · שער ההמרה יעודכן בפתיחת התקציב';
      } else {
        strong = expenses.length + ' הוצאות';
        detail = 'פתח תקציב לסיכום מדויק בין מטבעות';
      }
    }
    return { strong: strong || '—', detail: detail, unlimited: unlimited };
  }

  function hotelSnapshot(trip) {
    var hotel = (Array.isArray(trip.savedPlaces) ? trip.savedPlaces : []).find(function (item) { return item && item.isTripBase; });
    if (!hotel) return null;
    return {
      name: hotel.name || 'מקום הלינה',
      address: hotel.address || hotel.description || '',
      maps: safeUrl(hotel.maps || hotel.ratingsUrl || hotel.sourceUrl)
    };
  }

  function render() {
    var trip = window.TravelMateTripStore.getTrip(tripId);
    if (!trip) return;
    var phase = tripPhase(trip);
    var next = nextScheduledItem(trip, phase);
    var budget = budgetSnapshot(trip);
    var hotel = hotelSnapshot(trip);

    var nextBody = next
      ? '<strong>' + escapeHtml(next.title) + '</strong><span>' + escapeHtml([formatDate(next.date), next.time].filter(Boolean).join(' · ')) + '</span>'
      : '<strong>' + (phase.mode === 'after' ? 'הטיול הסתיים' : 'אין פעילות מתוזמנת קרובה') + '</strong><span>' + (phase.mode === 'after' ? 'הזיכרונות והסיכום נשארים זמינים' : 'אפשר להוסיף פעילות מהתוכנית או ממקומות') + '</span>';

    var hotelBody = hotel
      ? '<strong>' + escapeHtml(hotel.name) + '</strong><span>' + escapeHtml(hotel.address || 'נקודת הבסיס של הטיול') + '</span>'
      : '<strong>עדיין לא הוגדר מקום לינה</strong><span>אפשר לקבע מלון מתוך מקומות</span>';

    var hotelAction = hotel && hotel.maps
      ? '<a href="' + escapeHtml(hotel.maps) + '" target="_blank" rel="noopener noreferrer"><span>ניווט</span><i class="fa-solid fa-arrow-up-right-from-square"></i></a>'
      : '<a href="#places" data-view="places"><span>הגדרת לינה</span><i class="fa-solid fa-arrow-left"></i></a>';

    host.innerHTML =
      '<header class="overview-control-head"><div><small>במבט אחד</small><h2>מה חשוב עכשיו</h2></div><span class="overview-trip-phase" data-overview-phase="' + phase.mode + '"><i class="fa-regular fa-clock"></i>' + escapeHtml(phase.label) + '</span></header>' +
      '<div class="overview-control-grid">' +
        '<article class="overview-control-card" data-overview-card="next"><span class="overview-control-icon"><i class="fa-regular fa-calendar-check"></i></span><div><small>הדבר הבא</small>' + nextBody + '</div><a href="#plan" data-view="plan"><span>לתוכנית</span><i class="fa-solid fa-arrow-left"></i></a></article>' +
        '<article class="overview-control-card" data-overview-card="budget"><span class="overview-control-icon"><i class="fa-solid fa-wallet"></i></span><div><small>' + (budget.unlimited ? 'הוצאות עד עכשיו' : 'מצב התקציב') + '</small><strong>' + escapeHtml(budget.strong) + '</strong><span>' + escapeHtml(budget.detail) + '</span></div><a href="#budget" data-view="budget"><span>לתקציב</span><i class="fa-solid fa-arrow-left"></i></a></article>' +
        '<article class="overview-control-card" data-overview-card="hotel"><span class="overview-control-icon"><i class="fa-solid fa-hotel"></i></span><div><small>בסיס הטיול</small>' + hotelBody + '</div>' + hotelAction + '</article>' +
      '</div>';

    window.dispatchEvent(new CustomEvent('travelmate:overview-v2-rendered', { detail: { tripId: trip.id, phase: phase.mode } }));
  }

  render();
  Promise.resolve(window.travelMateTripReady).then(render).catch(function () {});
  window.addEventListener('travelmate:local-trips-updated', render);
  document.addEventListener('travelmate:places-updated', render);
  document.addEventListener('travelmate:planner-rendered', render);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) render(); });

  window.TravelMateOverview = Object.freeze({ render: render });
})();
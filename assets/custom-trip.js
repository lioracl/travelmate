(function () {
  'use strict';

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
    var value = date || new Date();
    var local = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function normalizedTime(value) {
    var match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
    if (!match) return '23:59';
    return String(match[1]).padStart(2, '0') + ':' + match[2];
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
        category: activity.category || '',
        location: activity.locationName || activity.address || ''
      });
    });
    (trip.savedPlaces || []).forEach(function (place) {
      if (!place || !place.date || place.done) return;
      items.push({
        kind: 'place',
        title: place.name || 'מקום שמור',
        date: place.date,
        time: normalizedTime(place.time),
        category: place.category || '',
        location: place.address || place.description || ''
      });
    });
    return items.sort(function (a, b) {
      return String(a.date + 'T' + a.time).localeCompare(String(b.date + 'T' + b.time));
    });
  }

  function nextOverviewItem(trip) {
    var items = overviewItems(trip);
    if (!items.length) return null;
    var now = new Date();
    var today = localDateValue(now);
    var currentTime = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    return items.find(function (item) {
      return item.date > today || (item.date === today && item.time >= currentTime);
    }) || items[0];
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

  function formatOverviewDate(date, time) {
    if (!date) return '';
    var value = new Date(date + 'T12:00:00');
    var today = localDateValue(new Date());
    var label = date === today ? 'היום' : new Intl.DateTimeFormat('he-IL', { weekday: 'short', day: 'numeric', month: 'short' }).format(value);
    return label + (time && time !== '23:59' ? ' · ' + time : '');
  }

  function renderOverviewControlCenter(trip) {
    var root = document.querySelector('[data-overview-control-center]');
    if (!root || !trip) return;

    var next = nextOverviewItem(trip);
    var nextTitle = root.querySelector('[data-overview-next-title]');
    var nextMeta = root.querySelector('[data-overview-next-meta]');
    if (next) {
      nextTitle.textContent = next.title;
      nextMeta.textContent = [formatOverviewDate(next.date, next.time), next.location || next.category].filter(Boolean).join(' · ');
    } else {
      nextTitle.textContent = 'עדיין אין פעילות מתוכננת';
      nextMeta.textContent = 'אפשר להתחיל מכרטיסיית תוכנית';
    }

    var expenses = Array.isArray(trip.expenses) ? trip.expenses : [];
    var spent = spentInEuros(trip);
    var budgetTitle = root.querySelector('[data-overview-budget-title]');
    var budgetMeta = root.querySelector('[data-overview-budget-meta]');
    if (trip.budgetUnlimited === true) {
      budgetTitle.textContent = 'ללא הגבלה';
      budgetMeta.textContent = expenses.length ? expenses.length + ' הוצאות נרשמו' + (spent ? ' · כ־' + compactMoney(spent, 'EUR') : '') : 'מעקב הוצאות פעיל';
    } else {
      var budget = Number(trip.budget || 0);
      budgetTitle.textContent = budget ? compactMoney(Math.max(0, budget - spent), 'EUR') + ' נותרו' : 'טרם הוגדר תקציב';
      budgetMeta.textContent = expenses.length ? 'הוצאו עד עכשיו כ־' + compactMoney(spent, 'EUR') + ' · ' + expenses.length + ' הוצאות' : budget ? 'עדיין לא נרשמו הוצאות' : 'אפשר להגדיר מסגרת או לבחור ללא הגבלה';
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

  window.travelMateTripReady = (async function () {
    var trip = immediateTrip;
    if (cloud && tripId) {
      try {
        var invitedOwnerId = null;
        var inviteToken = new URLSearchParams(location.search).get('invite');
        if (inviteToken) {
          var invitation = await cloud.acceptTripInvite(inviteToken);
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
      }
      catch (error) {
        console.error('TravelMate cloud trip load failed', error);
        trip = trip || localTrip();
      }
    }
    if (!trip) trip = localTrip();
    if (!trip) {
      location.replace('../../index.html');
      return null;
    }
    if (!immediateTrip || signature(trip) !== immediateSignature) renderTrip(trip);
    return trip;
  })();

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
    var splits = [['לינה', .4], ['אוכל', .22], ['תחבורה', .15], ['אטרקציות', .13], ['רזרבה', .1]];
    var expenses = document.querySelector('[data-expenses]');
    expenses.innerHTML = '';
    splits.forEach(function (item) {
      var amount = Math.round(trip.budget * item[1]);
      var article = document.createElement('article');
      article.className = 'expense';
      article.innerHTML = '<div><strong>' + item[0] + '</strong><span>€' + amount.toLocaleString('he-IL') + '</span></div><div class="progress"><i style="width:' + (item[1] * 100) + '%"></i></div>';
      expenses.appendChild(article);
    });
  }

  function refreshOverviewFromStore() {
    var trip = localTrip();
    if (trip) renderOverviewControlCenter(trip);
  }

  ['travelmate:planner-rendered', 'travelmate:places-updated', 'travelmate:activities-updated'].forEach(function (eventName) {
    document.addEventListener(eventName, refreshOverviewFromStore);
  });
  window.addEventListener('travelmate:local-trips-updated', refreshOverviewFromStore);
  window.addEventListener('travelmate:trip-synced', refreshOverviewFromStore);
})();

(function () {
  'use strict';

  var STORAGE_KEY = 'travelmate-trips';
  var endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];
  var categoryLabels = {
    attractions: 'אטרקציות ותרבות',
    museums: 'מוזיאונים וגלריות',
    food: 'מסעדות ובתי קפה',
    kosher: 'מסעדות ובתי קפה כשרים',
    nature: 'טבע ופארקים',
    shopping: 'קניות'
  };
  var categoryQueries = {
    attractions: ['nwr["tourism"~"attraction|viewpoint|zoo|theme_park"]{around};'],
    museums: ['nwr["tourism"~"museum|gallery"]{around};'],
    food: ['nwr["amenity"~"restaurant|cafe|fast_food"]{around};'],
    kosher: [
      'nwr["amenity"~"restaurant|cafe|fast_food"]["diet:kosher"~"yes|only",i]{around};',
      'nwr["amenity"~"restaurant|cafe|fast_food"]["cuisine"~"kosher",i]{around};'
    ],
    nature: [
      'nwr["leisure"~"park|garden|nature_reserve"]{around};',
      'nwr["natural"~"beach|peak|wood"]{around};'
    ],
    shopping: ['nwr["shop"]{around};']
  };
  var dialog;
  var state = { trip: null, origin: null, candidates: [], proposal: [] };

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function getTrips() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch (error) { return []; }
  }

  function currentTrip() {
    var id = new URLSearchParams(location.search).get('id');
    return getTrips().find(function (trip) { return String(trip.id) === String(id); });
  }

  function saveTrip(trip) {
    var trips = getTrips();
    var index = trips.findIndex(function (item) { return String(item.id) === String(trip.id); });
    if (index < 0) return false;
    trips[index] = trip;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
    if (window.TravelMateCloud) window.TravelMateCloud.queueTripSave(trip);
    document.dispatchEvent(new CustomEvent('travelmate:places-updated'));
    return true;
  }

  function dateOptions(trip) {
    var start = new Date(trip.start + 'T12:00:00');
    return Array.from({ length: Number(trip.days || 0) }, function (_, index) {
      var date = new Date(start.getTime() + index * 86400000);
      return {
        value: date.toISOString().slice(0, 10),
        label: 'יום ' + (index + 1) + ' · ' + new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long' }).format(date)
      };
    });
  }

  function distance(latA, lonA, latB, lonB) {
    var radius = 6371000;
    var pointA = Number(latA) * Math.PI / 180;
    var pointB = Number(latB) * Math.PI / 180;
    var deltaPoint = (Number(latB) - Number(latA)) * Math.PI / 180;
    var deltaLongitude = (Number(lonB) - Number(lonA)) * Math.PI / 180;
    var value = Math.sin(deltaPoint / 2) ** 2 +
      Math.cos(pointA) * Math.cos(pointB) * Math.sin(deltaLongitude / 2) ** 2;
    return 2 * radius * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
  }

  function fetchWithTimeout(url, options, timeout) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeout || 16000);
    return fetch(url, Object.assign({}, options || {}, { signal: controller.signal }))
      .finally(function () { clearTimeout(timer); });
  }

  async function geocode(query) {
    var response = await fetchWithTimeout(
      'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(query),
      { headers: { Accept: 'application/json' } },
      10000
    );
    if (!response.ok) throw new Error('לא הצלחנו לאתר את נקודת המוצא.');
    var data = await response.json();
    if (!data[0]) throw new Error('לא נמצאה כתובת מתאימה. נסה לכתוב עיר ורחוב.');
    return { lat: Number(data[0].lat), lon: Number(data[0].lon), label: data[0].display_name || query };
  }

  function gpsPosition() {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) {
        reject(new Error('המכשיר אינו תומך בקבלת מיקום.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(function (position) {
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          label: 'המיקום הנוכחי'
        });
      }, function () {
        reject(new Error('לא התקבל אישור למיקום. אפשר לבחור מרכז יעד או כתובת.'));
      }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
    });
  }

  function safeSearchTerm(value) {
    return String(value || '').replace(/[^\p{L}\p{N}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  }

  function queryFor(categories, radius, origin, freeTerm) {
    var around = '(around:' + Number(radius) + ',' + origin.lat + ',' + origin.lon + ')';
    var parts = [];
    categories.forEach(function (category) {
      (categoryQueries[category] || []).forEach(function (part) {
        parts.push(part.replace('{around}', around));
      });
    });
    var term = safeSearchTerm(freeTerm);
    if (term) {
      parts.push('nwr["name"~"' + term + '",i]' + around + ';');
      parts.push('nwr["brand"~"' + term + '",i]' + around + ';');
    }
    if (!parts.length) parts = categoryQueries.attractions.map(function (part) { return part.replace('{around}', around); });
    return '[out:json][timeout:30];(' + parts.join('') + ');out center tags 180;';
  }

  async function overpass(query) {
    var requests = endpoints.map(function (endpoint) {
      return fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: 'data=' + encodeURIComponent(query)
      }, 18000).then(function (response) {
        if (!response.ok) throw new Error('שירות המקומות אינו זמין.');
        return response.json();
      });
    });
    try { return await Promise.any(requests); } catch (error) {
      throw new Error('לא הצלחנו לקבל כרגע מקומות מהאזור. בדוק את החיבור ונסה שוב.');
    }
  }

  function categoryFor(tags) {
    if (/yes|only/i.test(tags['diet:kosher'] || '') || /kosher/i.test(tags.cuisine || '')) return 'kosher';
    if (tags.tourism && /museum|gallery/.test(tags.tourism)) return 'museums';
    if (tags.amenity && /restaurant|cafe|fast_food/.test(tags.amenity)) return 'food';
    if (tags.shop) return 'shopping';
    if (tags.leisure || tags.natural) return 'nature';
    return 'attractions';
  }

  function normalizeCandidates(data, origin) {
    var seen = {};
    return (data.elements || []).map(function (item) {
      var tags = item.tags || {};
      var lat = item.lat || (item.center && item.center.lat);
      var lon = item.lon || (item.center && item.center.lon);
      var name = tags['name:he'] || tags['name:en'] || tags.name || tags.brand;
      if (!lat || !lon || !name) return null;
      var key = String(name).toLowerCase().trim();
      if (seen[key]) return null;
      seen[key] = true;
      var category = categoryFor(tags);
      var website = tags.website || tags['contact:website'] || '';
      var address = [
        tags['addr:street:he'] || tags['addr:street:en'] || tags['addr:street'],
        tags['addr:housenumber'],
        tags['addr:city']
      ].filter(Boolean).join(' ');
      var details = [address, tags.opening_hours ? 'שעות: ' + tags.opening_hours : '', tags.cuisine ? 'סגנון: ' + tags.cuisine.replace(/;/g, ', ') : ''].filter(Boolean);
      return {
        name: name,
        categoryKey: category,
        category: categoryLabels[category] || 'מקום',
        description: details.join(' · ') || 'מקום שנבחר אוטומטית לפי ההעדפות והמרחק',
        lat: Number(lat),
        lon: Number(lon),
        distance: distance(origin.lat, origin.lon, lat, lon),
        officialUrl: /^https?:/i.test(website) ? website : '',
        ratingsUrl: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(name + ' ' + lat + ',' + lon),
        sourceUrl: 'https://www.openstreetmap.org/?mlat=' + lat + '&mlon=' + lon + '#map=17/' + lat + '/' + lon
      };
    }).filter(Boolean).sort(function (first, second) { return first.distance - second.distance; });
  }

  function selectedSettings() {
    var form = dialog.querySelector('[data-auto-place-form]');
    return {
      categories: [].slice.call(form.querySelectorAll('[name="category"]:checked')).map(function (input) { return input.value; }),
      freeTerm: form.elements.freeTerm.value.trim(),
      originMode: form.elements.originMode.value,
      originText: form.elements.originText.value.trim(),
      radius: Number(form.elements.radius.value),
      perDay: Number(form.elements.perDay.value),
      startTime: form.elements.startTime.value || '09:30',
      gap: Number(form.elements.gap.value),
      duration: Number(form.elements.duration.value),
      dates: [].slice.call(form.querySelectorAll('[name="date"]:checked')).map(function (input) { return input.value; }),
      keepExisting: form.elements.keepExisting.checked
    };
  }

  async function resolveOrigin(settings, trip) {
    if (settings.originMode === 'gps') return gpsPosition();
    if (settings.originMode === 'custom') {
      if (!settings.originText) throw new Error('יש לכתוב כתובת או שם מקום לנקודת המוצא.');
      return geocode(settings.originText + ', ' + trip.city + ', ' + trip.country);
    }
    return geocode(trip.city + ', ' + trip.country);
  }

  function addMinutes(time, amount) {
    var parts = time.split(':').map(Number);
    var total = parts[0] * 60 + parts[1] + amount;
    return String(Math.floor(total / 60) % 24).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
  }

  function buildProposal(candidates, settings, trip) {
    var existingNames = {};
    (trip.savedPlaces || []).forEach(function (place) { existingNames[String(place.name).toLowerCase()] = true; });
    var available = candidates.filter(function (place) { return !existingNames[String(place.name).toLowerCase()]; });
    var needed = settings.dates.length * settings.perDay;
    var chosen = [];
    var categories = settings.categories.length ? settings.categories : Object.keys(categoryLabels);
    while (available.length && chosen.length < needed) {
      var desired = categories[chosen.length % categories.length];
      var index = available.findIndex(function (place) { return place.categoryKey === desired; });
      if (index < 0) index = 0;
      chosen.push(available.splice(index, 1)[0]);
    }
    return chosen.map(function (place, index) {
      var dayIndex = Math.floor(index / settings.perDay);
      var slot = index % settings.perDay;
      return Object.assign({}, place, {
        id: 'auto-place-' + Date.now() + '-' + index,
        date: settings.dates[dayIndex],
        time: addMinutes(settings.startTime, slot * (settings.duration + settings.gap)),
        duration: settings.duration,
        autoGenerated: true,
        autoSearchCategory: place.categoryKey,
        autoRadius: settings.radius,
        autoOrigin: state.origin,
        selected: true
      });
    });
  }

  function renderPreview() {
    var preview = dialog.querySelector('[data-auto-place-preview]');
    var actions = dialog.querySelector('[data-auto-place-preview-actions]');
    if (!state.proposal.length) {
      preview.innerHTML = '<div class="auto-place-empty"><i class="fa-solid fa-map-location-dot"></i><strong>לא נמצאו מספיק מקומות מתאימים</strong><span>נסה להגדיל את המרחק או לבחור סוגי מקום נוספים.</span></div>';
      actions.hidden = true;
      return;
    }
    var groups = {};
    state.proposal.forEach(function (place) {
      (groups[place.date] = groups[place.date] || []).push(place);
    });
    var dates = dateOptions(state.trip);
    preview.innerHTML = Object.keys(groups).map(function (date) {
      var label = (dates.find(function (item) { return item.value === date; }) || {}).label || date;
      return '<section class="auto-place-preview-day"><header><strong>' + escapeHtml(label) + '</strong><span>' + groups[date].length + ' פעילויות</span></header>' +
        groups[date].map(function (place) {
          var index = state.proposal.indexOf(place);
          return '<label class="auto-place-preview-item"><input type="checkbox" data-auto-place-choice="' + index + '" checked>' +
            '<span class="auto-place-preview-time">' + escapeHtml(place.time) + '</span><span><strong>' + escapeHtml(place.name) +
            '</strong><small>' + escapeHtml(place.category) + ' · ' + (place.distance < 1000 ? Math.round(place.distance) + ' מ׳' : (place.distance / 1000).toFixed(1) + ' ק״מ') +
            '</small></span><i class="fa-solid fa-check"></i></label>';
        }).join('') + '</section>';
    }).join('');
    actions.hidden = false;
  }

  async function createPreview(event) {
    event.preventDefault();
    var settings = selectedSettings();
    var status = dialog.querySelector('[data-auto-place-status]');
    if (!settings.dates.length) {
      status.textContent = 'יש לבחור לפחות יום אחד למילוי.';
      return;
    }
    if (!settings.categories.length && !settings.freeTerm) {
      status.textContent = 'יש לבחור לפחות סוג מקום אחד או לכתוב חיפוש חופשי.';
      return;
    }
    status.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> מאתר מקומות ובונה מסלול מוצע…';
    dialog.querySelector('[data-auto-place-build]').disabled = true;
    try {
      state.origin = await resolveOrigin(settings, state.trip);
      var data = await overpass(queryFor(settings.categories, settings.radius, state.origin, settings.freeTerm));
      state.candidates = normalizeCandidates(data, state.origin);
      state.proposal = buildProposal(state.candidates, settings, state.trip);
      state.settings = settings;
      renderPreview();
      status.textContent = 'נבנתה הצעה סביב ' + state.origin.label + '. בדוק ואשר את המקומות הרצויים.';
    } catch (error) {
      state.proposal = [];
      renderPreview();
      status.textContent = error.message || 'לא הצלחנו לבנות את התוכנית.';
    } finally {
      dialog.querySelector('[data-auto-place-build]').disabled = false;
    }
  }

  function applyProposal() {
    var selected = state.proposal.filter(function (_, index) {
      var input = dialog.querySelector('[data-auto-place-choice="' + index + '"]');
      return input && input.checked;
    });
    if (!selected.length) {
      dialog.querySelector('[data-auto-place-status]').textContent = 'יש להשאיר לפחות מקום אחד מסומן.';
      return;
    }
    var fresh = currentTrip();
    if (!fresh) return;
    fresh.savedPlaces = fresh.savedPlaces || [];
    if (!state.settings.keepExisting) {
      var selectedDates = state.settings.dates;
      fresh.savedPlaces = fresh.savedPlaces.filter(function (place) {
        return !place.autoGenerated || selectedDates.indexOf(place.date) < 0;
      });
    }
    var existing = {};
    fresh.savedPlaces.forEach(function (place) { existing[String(place.name).toLowerCase() + '|' + place.date] = true; });
    selected.forEach(function (place) {
      if (!existing[String(place.name).toLowerCase() + '|' + place.date]) fresh.savedPlaces.push(place);
    });
    saveTrip(fresh);
    closeDialog();
    location.hash = 'plan';
    if (window.showDayToast) window.showDayToast('הימים מולאו אוטומטית במקומות שבחרת.');
  }

  function buildDialog(trip) {
    dialog = document.createElement('section');
    dialog.className = 'auto-place-backdrop';
    dialog.hidden = true;
    dialog.innerHTML = '<div class="auto-place-dialog" role="dialog" aria-modal="true" aria-labelledby="auto-place-title">' +
      '<header><div><small>תכנון בלי הוספה ידנית</small><h2 id="auto-place-title">מילוי ימים אוטומטי</h2><p>בחר מה לחפש, מאיפה מתחילים וכמה פעילויות יהיו בכל יום.</p></div><button type="button" data-auto-place-close aria-label="סגירה"><i class="fa-solid fa-xmark"></i></button></header>' +
      '<form data-auto-place-form><section><h3><span>1</span> מה מעניין אותך?</h3><div class="auto-place-categories">' +
      Object.keys(categoryLabels).map(function (key) { return '<label><input type="checkbox" name="category" value="' + key + '"' + (key === 'attractions' || key === 'museums' ? ' checked' : '') + '><span><i class="fa-solid fa-check"></i>' + categoryLabels[key] + '</span></label>'; }).join('') +
      '</div><label class="auto-place-field wide"><span>חיפוש חופשי נוסף</span><input name="freeTerm" type="search" placeholder="לדוגמה: בתי כנסת, שווקים או פארקי שעשועים"></label></section>' +
      '<section><h3><span>2</span> נקודת מוצא ומרחק</h3><div class="auto-place-origins"><label><input type="radio" name="originMode" value="destination" checked><span><i class="fa-solid fa-city"></i><strong>מרכז היעד</strong><small>' + escapeHtml(trip.city) + '</small></span></label><label><input type="radio" name="originMode" value="gps"><span><i class="fa-solid fa-location-crosshairs"></i><strong>המיקום שלי</strong><small>GPS בזמן השימוש</small></span></label><label><input type="radio" name="originMode" value="custom"><span><i class="fa-solid fa-hotel"></i><strong>כתובת או מלון</strong><small>נקודת מוצא קבועה</small></span></label></div>' +
      '<label class="auto-place-field wide" data-auto-origin-text hidden><span>שם המלון, כתובת או מקום</span><input name="originText" placeholder="לדוגמה: Hotel Central, Prague"></label><div class="auto-place-grid"><label class="auto-place-field"><span>מרחק מרבי</span><select name="radius"><option value="1000">1 ק״מ</option><option value="3000" selected>3 ק״מ</option><option value="5000">5 ק״מ</option><option value="10000">10 ק״מ</option><option value="20000">20 ק״מ</option></select></label><label class="auto-place-field"><span>פעילויות בכל יום</span><select name="perDay"><option value="1">1</option><option value="2">2</option><option value="3" selected>3</option><option value="4">4</option><option value="5">5</option></select></label></div></section>' +
      '<section><h3><span>3</span> ימים ושעות</h3><div class="auto-place-days">' + dateOptions(trip).map(function (date) { return '<label><input type="checkbox" name="date" value="' + date.value + '" checked><span>' + escapeHtml(date.label) + '</span></label>'; }).join('') + '</div><div class="auto-place-grid three"><label class="auto-place-field"><span>שעת התחלה</span><input type="time" name="startTime" value="09:30"></label><label class="auto-place-field"><span>משך פעילות</span><select name="duration"><option value="60">שעה</option><option value="90" selected>שעה וחצי</option><option value="120">שעתיים</option><option value="180">3 שעות</option></select></label><label class="auto-place-field"><span>זמן מעבר</span><select name="gap"><option value="15">15 דקות</option><option value="30" selected>30 דקות</option><option value="45">45 דקות</option><option value="60">שעה</option></select></label></div><label class="auto-place-keep"><input type="checkbox" name="keepExisting" checked><span><i class="fa-solid fa-lock"></i><strong>שמור את מה שכבר תכננתי</strong><small>המילוי האוטומטי לא מוחק פעילויות ומקומות קיימים.</small></span></label></section>' +
      '<p class="auto-place-status" data-auto-place-status role="status">התוכנית תוצג לבדיקה לפני שהיא נשמרת.</p><button class="auto-place-build" type="submit" data-auto-place-build><i class="fa-solid fa-wand-magic-sparkles"></i> בנה לי הצעה</button></form>' +
      '<div class="auto-place-preview" data-auto-place-preview></div><footer data-auto-place-preview-actions hidden><button type="button" data-auto-place-back>שינוי ההגדרות</button><button type="button" class="primary" data-auto-place-apply><i class="fa-solid fa-calendar-check"></i> מילוי הימים שסומנו</button></footer></div>';
    document.body.appendChild(dialog);
    dialog.querySelector('[data-auto-place-form]').addEventListener('submit', createPreview);
    dialog.querySelectorAll('[name="originMode"]').forEach(function (input) {
      input.addEventListener('change', function () {
        dialog.querySelector('[data-auto-origin-text]').hidden = input.form.elements.originMode.value !== 'custom';
      });
    });
    dialog.querySelector('[data-auto-place-close]').addEventListener('click', closeDialog);
    dialog.querySelector('[data-auto-place-back]').addEventListener('click', function () {
      state.proposal = [];
      dialog.querySelector('[data-auto-place-preview]').innerHTML = '';
      dialog.querySelector('[data-auto-place-preview-actions]').hidden = true;
      dialog.querySelector('[data-auto-place-form]').hidden = false;
      dialog.querySelector('[data-auto-place-status]').textContent = 'אפשר לשנות את ההגדרות ולבנות הצעה חדשה.';
    });
    dialog.querySelector('[data-auto-place-apply]').addEventListener('click', applyProposal);
    dialog.addEventListener('click', function (event) { if (event.target === dialog) closeDialog(); });
  }

  function openDialog() {
    state.trip = currentTrip();
    if (!state.trip) return;
    if (!dialog) buildDialog(state.trip);
    state.candidates = [];
    state.proposal = [];
    dialog.querySelector('[data-auto-place-form]').hidden = false;
    dialog.querySelector('[data-auto-place-preview]').innerHTML = '';
    dialog.querySelector('[data-auto-place-preview-actions]').hidden = true;
    dialog.querySelector('[data-auto-place-status]').textContent = 'התוכנית תוצג לבדיקה לפני שהיא נשמרת.';
    dialog.hidden = false;
    document.body.classList.add('auto-place-open');
    dialog.querySelector('[data-auto-place-close]').focus();
  }

  function closeDialog() {
    if (!dialog) return;
    dialog.hidden = true;
    document.body.classList.remove('auto-place-open');
  }

  async function replacementFor(placeId) {
    var trip = currentTrip();
    if (!trip) return;
    var place = (trip.savedPlaces || []).find(function (item) { return item.id === placeId; });
    if (!place) return;
    var origin = place.lat && place.lon ? { lat: Number(place.lat), lon: Number(place.lon), label: place.name } :
      (place.autoOrigin || await geocode(trip.city + ', ' + trip.country));
    var radius = Number(place.autoRadius || 3000);
    var category = place.autoSearchCategory || 'attractions';
    var statusEvent = new CustomEvent('travelmate:auto-place-replacing', { detail: { id: placeId, loading: true } });
    document.dispatchEvent(statusEvent);
    try {
      var data = await overpass(queryFor([category], radius, origin, ''));
      var candidates = normalizeCandidates(data, origin);
      var used = {};
      (trip.savedPlaces || []).forEach(function (item) { used[String(item.name).toLowerCase()] = true; });
      var replacement = candidates.find(function (candidate) { return !used[String(candidate.name).toLowerCase()]; });
      if (!replacement) throw new Error('לא נמצא מקום חלופי באזור. נסה להגדיל את המרחק במילוי האוטומטי.');
      Object.assign(place, replacement, {
        id: placeId,
        date: place.date,
        time: place.time,
        duration: place.duration || 90,
        autoGenerated: true,
        autoSearchCategory: category,
        autoRadius: radius,
        autoOrigin: origin,
        done: false,
        canceled: false
      });
      saveTrip(trip);
      if (window.showDayToast) window.showDayToast('הפעילות הוחלפה אוטומטית ב־' + replacement.name);
    } catch (error) {
      alert(error.message || 'לא הצלחנו להחליף את הפעילות.');
    } finally {
      document.dispatchEvent(new CustomEvent('travelmate:auto-place-replacing', { detail: { id: placeId, loading: false } }));
    }
  }

  function install() {
    var places = document.getElementById('places');
    if (!places || !currentTrip() || places.querySelector('[data-auto-place-open]')) return;
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'auto-place-launch';
    button.dataset.autoPlaceOpen = '';
    button.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i><span><strong>מילוי ימים אוטומטי</strong><small>בחר סוגי מקומות, מרחק וכמות פעילויות ליום</small></span><i class="fa-solid fa-arrow-left"></i>';
    var heading = places.querySelector('.section-head');
    if (heading) heading.insertAdjacentElement('afterend', button); else places.prepend(button);
    button.addEventListener('click', openDialog);
  }

  window.TravelMateAutoPlaces = { open: openDialog, replace: replacementFor };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && dialog && !dialog.hidden) closeDialog(); });
})();

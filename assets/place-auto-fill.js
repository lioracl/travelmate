(function () {
  'use strict';

  var featureScript = document.currentScript;
  var featureStyle = document.createElement('link');
  featureStyle.rel = 'stylesheet';
  featureStyle.href = new URL('place-auto-fill-v2.css', featureScript.src).href + '?v=20260727-2';
  document.head.appendChild(featureStyle);
  var smartStyle = document.createElement('link');
  smartStyle.rel = 'stylesheet';
  smartStyle.href = new URL('smart-plan-tools.css', featureScript.src).href + '?v=20260727-3';
  document.head.appendChild(smartStyle);
  var smartScript = document.createElement('script');
  smartScript.src = new URL('smart-plan-tools.js', featureScript.src).href + '?v=20260727-3';
  document.head.appendChild(smartScript);

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
      var rating = Number(tags.rating || tags.stars || tags['review:rating'] || 0);
      if (!Number.isFinite(rating) || rating < 1 || rating > 5) rating = 0;
      var informationScore = [website, address, tags.opening_hours, tags.phone || tags['contact:phone'], tags.wikipedia, tags.wikidata].filter(Boolean).length;
      var fee = String(tags.fee || '').toLowerCase();
      var costEstimate = fee === 'no' ? 0 : (category === 'food' || category === 'kosher' ? 25 : category === 'shopping' ? 35 : 15);
      return {
        name: name,
        categoryKey: category,
        category: categoryLabels[category] || 'מקום',
        description: details.join(' · ') || 'מקום שנבחר אוטומטית לפי ההעדפות והמרחק',
        lat: Number(lat),
        lon: Number(lon),
        distance: distance(origin.lat, origin.lon, lat, lon),
        rating: rating,
        informationScore: informationScore,
        openingHours: tags.opening_hours || '',
        phone: tags.phone || tags['contact:phone'] || '',
        address: address,
        costEstimate: costEstimate,
        freeEntry: fee === 'no',
        wheelchair: /yes|limited/i.test(tags.wheelchair || ''),
        familyFriendly: /playground|zoo|theme_park|park|garden/.test([tags.leisure, tags.tourism].filter(Boolean).join('|')) || /yes/i.test(tags.kids_area || tags.child_friendly || ''),
        indoor: /museum|gallery|shopping_centre/.test([tags.tourism, tags.shop].filter(Boolean).join('|')) || /indoor|yes/i.test(tags.indoor || ''),
        officialUrl: /^https?:/i.test(website) ? website : '',
        ratingsUrl: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(name + ' ' + lat + ',' + lon),
        sourceUrl: 'https://www.openstreetmap.org/?mlat=' + lat + '&mlon=' + lon + '#map=17/' + lat + '/' + lon
      };
    }).filter(Boolean).sort(function (first, second) { return first.distance - second.distance; });
  }

  function selectedSettings() {
    var form = dialog.querySelector('[data-auto-place-form]');
    var settings = {
      categories: [].slice.call(form.querySelectorAll('[name="category"]:checked')).map(function (input) { return input.value; }),
      freeTerm: form.elements.freeTerm.value.trim(),
      originMode: form.elements.originMode.value,
      originText: form.elements.originText.value.trim(),
      radius: Number(form.elements.radius.value),
      perDay: Number(form.elements.perDay.value),
      startTime: form.elements.startTime.value || '09:30',
      gap: Number(form.elements.gap.value),
      duration: Number(form.elements.duration.value),
      sortBy: form.elements.sortBy.value,
      minimumRating: Number(form.elements.minimumRating.value || 0),
      requireWebsite: form.elements.requireWebsite.checked,
      requireHours: form.elements.requireHours.checked,
      pace: form.elements.pace.value,
      dailyBudget: Number(form.elements.dailyBudget.value || 0),
      weatherAware: form.elements.weatherAware.checked,
      familyFriendly: form.elements.familyFriendly.checked,
      wheelchair: form.elements.wheelchair.checked,
      preferFree: form.elements.preferFree.checked,
      dates: [].slice.call(form.querySelectorAll('[name="date"]:checked')).map(function (input) { return input.value; }),
      keepExisting: form.elements.keepExisting.checked
    };
    if (settings.pace === 'relaxed') { settings.perDay = 2; settings.duration = Math.max(settings.duration, 120); settings.gap = Math.max(settings.gap, 45); }
    if (settings.pace === 'balanced') { settings.perDay = 3; }
    if (settings.pace === 'intensive') { settings.perDay = 5; settings.duration = Math.min(settings.duration, 90); settings.gap = Math.min(settings.gap, 30); }
    return settings;
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
    var available = candidates.filter(function (place) {
      if (existingNames[String(place.name).toLowerCase()]) return false;
      if (settings.minimumRating && (!place.rating || place.rating < settings.minimumRating)) return false;
      if (settings.requireWebsite && !place.officialUrl) return false;
      if (settings.requireHours && !place.openingHours) return false;
      if (settings.wheelchair && !place.wheelchair) return false;
      if (settings.familyFriendly && !place.familyFriendly) return false;
      return true;
    });
    available.sort(function (first, second) {
      var firstPreference = (settings.preferFree && first.freeEntry ? 3 : 0) + (settings.weatherAware && state.rainyDates && state.rainyDates.length && first.indoor ? 2 : 0);
      var secondPreference = (settings.preferFree && second.freeEntry ? 3 : 0) + (settings.weatherAware && state.rainyDates && state.rainyDates.length && second.indoor ? 2 : 0);
      if (firstPreference !== secondPreference) return secondPreference - firstPreference;
      if (settings.sortBy === 'rating') return (second.rating || 0) - (first.rating || 0) || second.informationScore - first.informationScore || first.distance - second.distance;
      if (settings.sortBy === 'information') return second.informationScore - first.informationScore || first.distance - second.distance;
      if (settings.sortBy === 'random') return Math.random() - 0.5;
      if (settings.sortBy === 'distance') return first.distance - second.distance;
      return (second.rating || 0) - (first.rating || 0) || second.informationScore - first.informationScore || first.distance - second.distance;
    });
    var needed = settings.dates.length * settings.perDay;
    var chosen = [];
    var categories = settings.categories.length ? settings.categories : Object.keys(categoryLabels);
    while (available.length && chosen.length < needed) {
      var desired = categories[chosen.length % categories.length];
      var index = available.findIndex(function (place) { return place.categoryKey === desired; });
      if (index < 0) index = 0;
      chosen.push(available.splice(index, 1)[0]);
    }
    var result = chosen.map(function (place, index) {
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
    settings.dates.forEach(function (date) {
      var day = result.filter(function (place) { return place.date === date; });
      var cursor = state.origin;
      day.forEach(function (_, index) {
        var remaining = day.slice(index);
        remaining.sort(function (first, second) {
          return distance(cursor.lat, cursor.lon, first.lat, first.lon) - distance(cursor.lat, cursor.lon, second.lat, second.lon);
        });
        var nearest = remaining[0];
        var currentIndex = result.indexOf(day[index]);
        var nearestIndex = result.indexOf(nearest);
        var currentTime = result[currentIndex].time;
        var legDistance = distance(cursor.lat, cursor.lon, nearest.lat, nearest.lon);
        result[currentIndex] = nearest;
        result[nearestIndex] = day[index];
        result[currentIndex].time = currentTime;
        result[currentIndex].travelFromPreviousMinutes = Math.max(5, Math.round(legDistance / 75));
        cursor = nearest;
      });
    });
    if (settings.dailyBudget) {
      settings.dates.forEach(function (date) {
        var spent = 0;
        result.filter(function (place) { return place.date === date; }).forEach(function (place) {
          spent += place.costEstimate || 0;
          if (spent > settings.dailyBudget) place.selected = false;
        });
      });
    }
    return result;
  }

  async function weatherFor(origin, dates) {
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + origin.lat + '&longitude=' + origin.lon +
      '&daily=precipitation_probability_max&timezone=auto&forecast_days=16';
    try {
      var response = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 10000);
      var data = await response.json();
      var rainy = [];
      (data.daily && data.daily.time || []).forEach(function (date, index) {
        if (dates.indexOf(date) >= 0 && Number(data.daily.precipitation_probability_max[index] || 0) >= 45) rainy.push(date);
      });
      return rainy;
    } catch (error) { return []; }
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
      return '<section class="auto-place-preview-day"><header><strong>' + escapeHtml(label) + '</strong><span>' + groups[date].length + ' פעילויות</span><button type="button" data-auto-replace-day="' + escapeHtml(date) + '"><i class="fa-solid fa-rotate"></i> החלף יום</button></header>' +
        groups[date].map(function (place) {
          var index = state.proposal.indexOf(place);
          var rating = place.rating ? '<span class="auto-place-rating"><i class="fa-solid fa-star"></i>' + place.rating.toFixed(1) + '</span>' : '<span class="auto-place-rating muted">ללא דירוג זמין</span>';
          return '<article class="auto-place-preview-item"><label class="auto-place-choice"><input type="checkbox" data-auto-place-choice="' + index + '"' + (place.selected === false ? '' : ' checked') + '><span></span></label>' +
            '<span class="auto-place-preview-time">' + escapeHtml(place.time) + '</span><span><strong>' + escapeHtml(place.name) +
            '</strong><small>' + escapeHtml(place.category) + ' · ' + (place.distance < 1000 ? Math.round(place.distance) + ' מ׳' : (place.distance / 1000).toFixed(1) + ' ק״מ') +
            '</small><span class="auto-place-meta">' + rating + '<span><i class="fa-solid fa-person-walking"></i> כ־' + (place.travelFromPreviousMinutes || 5) + ' דק׳ מהתחנה הקודמת</span><span><i class="fa-solid fa-coins"></i> כ־€' + (place.costEstimate || 0) + '</span>' + (place.officialUrl ? '<span><i class="fa-solid fa-globe"></i> אתר רשמי</span>' : '') + (place.openingHours ? '<span><i class="fa-regular fa-clock"></i> שעות זמינות</span>' : '') + '</span></span>' +
            '<button type="button" class="auto-place-details-button" data-auto-place-details="' + index + '" aria-expanded="false"><i class="fa-solid fa-circle-info"></i><span>פרטים</span></button>' +
            '<div class="auto-place-details" data-auto-place-details-panel="' + index + '" hidden><p>' + escapeHtml(place.description) + '</p><dl>' +
            (place.address ? '<div><dt>כתובת</dt><dd>' + escapeHtml(place.address) + '</dd></div>' : '') +
            (place.openingHours ? '<div><dt>שעות פתיחה</dt><dd>' + escapeHtml(place.openingHours) + '</dd></div>' : '') +
            (place.phone ? '<div><dt>טלפון</dt><dd>' + escapeHtml(place.phone) + '</dd></div>' : '') +
            '</dl><div class="auto-place-detail-links">' +
            '<a href="' + escapeHtml(place.ratingsUrl) + '" target="_blank" rel="noopener"><i class="fa-solid fa-star"></i> דירוגים ב־Google</a>' +
            (place.officialUrl ? '<a href="' + escapeHtml(place.officialUrl) + '" target="_blank" rel="noopener"><i class="fa-solid fa-globe"></i> אתר המקום</a>' : '') +
            '<a href="' + escapeHtml(place.sourceUrl) + '" target="_blank" rel="noopener"><i class="fa-solid fa-map"></i> מפה</a></div></div></article>';
        }).join('') + '</section>';
    }).join('');
    var mapPlaces = state.proposal.slice();
    if (mapPlaces.length) {
      var mapParams = new URLSearchParams({
        api: '1',
        origin: state.origin.lat + ',' + state.origin.lon,
        destination: mapPlaces[mapPlaces.length - 1].lat + ',' + mapPlaces[mapPlaces.length - 1].lon,
        travelmode: 'walking'
      });
      if (mapPlaces.length > 1) mapParams.set('waypoints', mapPlaces.slice(0, -1).map(function (place) { return place.lat + ',' + place.lon; }).join('|'));
      preview.insertAdjacentHTML('beforeend', '<section class="auto-place-map"><header><strong><i class="fa-solid fa-map-location-dot"></i> מפת המסלול המוצע</strong><a target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?' + escapeHtml(mapParams.toString()) + '">פתיחה במפה</a></header><div class="auto-place-map-points">' + mapPlaces.map(function (place, index) { return '<a target="_blank" rel="noopener" href="' + escapeHtml(place.sourceUrl) + '"><b>' + (index + 1) + '</b><span>' + escapeHtml(place.name) + '</span></a>'; }).join('') + '</div></section>');
    }
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
      state.rainyDates = settings.weatherAware ? await weatherFor(state.origin, settings.dates) : [];
      var data = await overpass(queryFor(settings.categories, settings.radius, state.origin, settings.freeTerm));
      state.candidates = normalizeCandidates(data, state.origin);
      state.proposal = buildProposal(state.candidates, settings, state.trip);
      state.settings = settings;
      renderPreview();
      status.textContent = 'נבנתה הצעה סביב ' + state.origin.label + (state.rainyDates.length ? ' · ימים עם סיכוי לגשם הותאמו למקומות מקורים.' : '') + ' בדוק ואשר את המקומות הרצויים.';
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

  function replacePreviewDay(date) {
    var used = {};
    state.proposal.forEach(function (place) { used[String(place.name).toLowerCase()] = true; });
    var alternatives = state.candidates.filter(function (place) { return !used[String(place.name).toLowerCase()]; });
    var dayPlaces = state.proposal.filter(function (place) { return place.date === date; });
    dayPlaces.forEach(function (oldPlace) {
      var index = state.proposal.indexOf(oldPlace);
      var replacementIndex = alternatives.findIndex(function (place) { return place.categoryKey === oldPlace.categoryKey; });
      if (replacementIndex < 0) replacementIndex = 0;
      if (!alternatives[replacementIndex]) return;
      state.proposal[index] = Object.assign({}, alternatives.splice(replacementIndex, 1)[0], {
        id: oldPlace.id,
        date: oldPlace.date,
        time: oldPlace.time,
        duration: oldPlace.duration,
        travelFromPreviousMinutes: oldPlace.travelFromPreviousMinutes,
        autoGenerated: true,
        autoSearchCategory: oldPlace.categoryKey,
        autoRadius: state.settings.radius,
        autoOrigin: state.origin,
        selected: true
      });
    });
    renderPreview();
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
      '<section><h3><span>3</span> איך לבחור את המקומות?</h3><div class="auto-place-grid"><label class="auto-place-field"><span>סדר עדיפות</span><select name="sortBy"><option value="recommended" selected>מומלצים — דירוג, מידע ומרחק</option><option value="rating">דירוג גבוה קודם</option><option value="distance">הכי קרוב קודם</option><option value="information">הכי הרבה מידע קודם</option><option value="random">גיוון והפתעה</option></select></label><label class="auto-place-field"><span>דירוג מינימלי, כשקיים במקור</span><select name="minimumRating"><option value="0" selected>ללא סינון</option><option value="3.5">3.5 ומעלה</option><option value="4">4.0 ומעלה</option><option value="4.5">4.5 ומעלה</option></select></label><label class="auto-place-field"><span>קצב הטיול</span><select name="pace"><option value="relaxed">רגוע — 2 פעילויות</option><option value="balanced" selected>מאוזן — 3 פעילויות</option><option value="intensive">עמוס — 5 פעילויות</option><option value="custom">לפי הבחירה שלי</option></select></label><label class="auto-place-field"><span>תקציב יומי משוער לאדם</span><select name="dailyBudget"><option value="0" selected>ללא מגבלה</option><option value="25">עד €25</option><option value="50">עד €50</option><option value="100">עד €100</option><option value="200">עד €200</option></select></label></div><div class="auto-place-switches"><label><input type="checkbox" name="requireWebsite"><span><i class="fa-solid fa-globe"></i><b>רק עם אתר רשמי</b></span></label><label><input type="checkbox" name="requireHours"><span><i class="fa-regular fa-clock"></i><b>רק עם שעות פתיחה</b></span></label><label><input type="checkbox" name="weatherAware" checked><span><i class="fa-solid fa-cloud-sun"></i><b>התאמה למזג האוויר</b></span></label><label><input type="checkbox" name="familyFriendly"><span><i class="fa-solid fa-children"></i><b>מתאים למשפחה</b></span></label><label><input type="checkbox" name="wheelchair"><span><i class="fa-solid fa-wheelchair"></i><b>נגיש לכיסא גלגלים</b></span></label><label><input type="checkbox" name="preferFree"><span><i class="fa-solid fa-piggy-bank"></i><b>העדף מקומות חינמיים</b></span></label></div><p class="auto-place-note"><i class="fa-solid fa-circle-info"></i> המסלול יסודר אוטומטית לפי קרבה וזמן מעבר. דירוג ומאפייני נגישות מוצגים רק כאשר מקור המקומות מספק אותם.</p></section>' +
      '<section><h3><span>4</span> ימים ושעות</h3><div class="auto-place-days">' + dateOptions(trip).map(function (date) { return '<label><input type="checkbox" name="date" value="' + date.value + '" checked><span>' + escapeHtml(date.label) + '</span></label>'; }).join('') + '</div><div class="auto-place-grid three"><label class="auto-place-field"><span>שעת התחלה</span><input type="time" name="startTime" value="09:30"></label><label class="auto-place-field"><span>משך פעילות</span><select name="duration"><option value="60">שעה</option><option value="90" selected>שעה וחצי</option><option value="120">שעתיים</option><option value="180">3 שעות</option></select></label><label class="auto-place-field"><span>זמן מעבר</span><select name="gap"><option value="15">15 דקות</option><option value="30" selected>30 דקות</option><option value="45">45 דקות</option><option value="60">שעה</option></select></label></div><label class="auto-place-keep"><input type="checkbox" name="keepExisting" checked><span><i class="fa-solid fa-lock"></i><strong>שמור את מה שכבר תכננתי</strong><small>המילוי האוטומטי לא מוחק פעילויות ומקומות קיימים.</small></span></label></section>' +
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
    dialog.addEventListener('click', function (event) {
      var replaceDay = event.target.closest('[data-auto-replace-day]');
      if (replaceDay) {
        replacePreviewDay(replaceDay.dataset.autoReplaceDay);
        return;
      }
      var button = event.target.closest('[data-auto-place-details]');
      if (!button) return;
      var panel = dialog.querySelector('[data-auto-place-details-panel="' + button.dataset.autoPlaceDetails + '"]');
      if (!panel) return;
      panel.hidden = !panel.hidden;
      button.setAttribute('aria-expanded', String(!panel.hidden));
      var label = button.querySelector('span');
      if (label) label.textContent = panel.hidden ? 'פרטים' : 'סגירה';
    });
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

  function activityCategory(value) {
    var text = String(value || '').toLowerCase();
    if (/אוכל|מסעד|קפה|food|restaurant/.test(text)) return 'food';
    if (/מוז|תרבות|museum|culture/.test(text)) return 'museums';
    if (/טבע|פארק|nature|park/.test(text)) return 'nature';
    if (/קניות|shop/.test(text)) return 'shopping';
    return 'attractions';
  }

  async function replacementForActivity(activityId) {
    var trip = currentTrip();
    if (!trip) return;
    var activity = (trip.activities || []).find(function (item) { return item.id === activityId; });
    if (!activity) return;
    document.dispatchEvent(new CustomEvent('travelmate:auto-activity-replacing', { detail: { id: activityId, loading: true } }));
    try {
      var origin = activity.lat && activity.lon ? { lat: activity.lat, lon: activity.lon, label: activity.title } : await geocode(trip.city + ', ' + trip.country);
      var category = activityCategory(activity.category);
      var data = await overpass(queryFor([category], 5000, origin, ''));
      var used = {};
      (trip.activities || []).forEach(function (item) { used[String(item.title).toLowerCase()] = true; });
      (trip.savedPlaces || []).forEach(function (item) { used[String(item.name).toLowerCase()] = true; });
      var replacement = normalizeCandidates(data, origin).find(function (candidate) { return !used[String(candidate.name).toLowerCase()]; });
      if (!replacement) throw new Error('לא נמצאה פעילות חלופית מתאימה באזור.');
      Object.assign(activity, {
        title: replacement.name,
        category: replacement.category,
        description: replacement.description,
        lat: replacement.lat,
        lon: replacement.lon,
        officialUrl: replacement.officialUrl,
        ratingsUrl: replacement.ratingsUrl,
        sourceUrl: replacement.sourceUrl,
        done: false
      });
      saveTrip(trip);
      document.dispatchEvent(new CustomEvent('travelmate:activities-updated'));
    } catch (error) {
      alert(error.message || 'לא הצלחנו להחליף את הפעילות.');
    } finally {
      document.dispatchEvent(new CustomEvent('travelmate:auto-activity-replacing', { detail: { id: activityId, loading: false } }));
    }
  }

  async function replacementForDay(date) {
    var trip = currentTrip();
    if (!trip) return;
    var activities = (trip.activities || []).filter(function (item) { return item.date === date; });
    var places = (trip.savedPlaces || []).filter(function (item) { return item.date === date; });
    if (!activities.length && !places.length) {
      openDialog();
      return;
    }
    if (!confirm('להחליף אוטומטית את כל הפעילויות והמקומות ביום הזה?')) return;
    for (var activityIndex = 0; activityIndex < activities.length; activityIndex++) {
      await replacementForActivity(activities[activityIndex].id);
    }
    for (var placeIndex = 0; placeIndex < places.length; placeIndex++) {
      await replacementFor(places[placeIndex].id);
    }
    document.dispatchEvent(new CustomEvent('travelmate:activities-updated'));
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

  window.TravelMateAutoPlaces = { open: openDialog, replace: replacementFor, replaceActivity: replacementForActivity, replaceDay: replacementForDay };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && dialog && !dialog.hidden) closeDialog(); });
})();

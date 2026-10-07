(function () {
  'use strict';

  if (window.__travelMateWeatherLoaded) return;
  window.__travelMateWeatherLoaded = true;

  var state = { location: null, forecast: null, loading: false, error: false };
  var locale = 'he-IL';

  function clean(value) { return String(value || '').replace(/[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}]/gu, '').trim(); }
  function round(value) { return Number.isFinite(Number(value)) ? Math.round(Number(value)) : '--'; }
  function escapeText(value) { return String(value || '').replace(/[&<>"']/g, function (character) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]; }); }
  function wait(milliseconds) { return new Promise(function (resolve) { window.setTimeout(resolve, milliseconds); }); }

  async function fetchJson(url, label) {
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timeout = window.setTimeout(function () { if (controller) controller.abort(); }, 12000);
    try {
      var response = await fetch(url, controller ? { signal: controller.signal } : undefined);
      if (!response.ok) throw new Error(label + '-' + response.status);
      return await response.json();
    } finally { window.clearTimeout(timeout); }
  }

  function weatherDetails(code, isDay) {
    code = Number(code);
    if (code === 0) return { label: isDay === 0 ? 'לילה בהיר' : 'בהיר', icon: isDay === 0 ? 'fa-moon' : 'fa-sun' };
    if (code === 1 || code === 2) return { label: 'מעונן חלקית', icon: 'fa-cloud-sun' };
    if (code === 3) return { label: 'מעונן', icon: 'fa-cloud' };
    if (code === 45 || code === 48) return { label: 'ערפל', icon: 'fa-smog' };
    if (code >= 51 && code <= 57) return { label: 'טפטוף', icon: 'fa-cloud-rain' };
    if (code >= 61 && code <= 67) return { label: 'גשם', icon: 'fa-cloud-showers-heavy' };
    if (code >= 71 && code <= 77) return { label: 'שלג', icon: 'fa-snowflake' };
    if (code >= 80 && code <= 82) return { label: 'ממטרים', icon: 'fa-cloud-showers-heavy' };
    if (code >= 85 && code <= 86) return { label: 'ממטרי שלג', icon: 'fa-snowflake' };
    if (code >= 95) return { label: 'סופות רעמים', icon: 'fa-cloud-bolt' };
    return { label: 'מזג אוויר משתנה', icon: 'fa-cloud-sun' };
  }

  function weatherAtmosphere(code, isDay, temperature, apparent) {
    code = Number(code);
    var temp = Number(temperature);
    var feels = Number(apparent);
    var heat = Math.max(Number.isFinite(temp) ? temp : -Infinity, Number.isFinite(feels) ? feels : -Infinity);
    if (code >= 95) return 'storm';
    if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return 'snow';
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
    if (code === 45 || code === 48) return 'fog';
    if (Number(isDay) !== 0 && heat >= 35) return 'heat';
    if (code === 0) return Number(isDay) === 0 ? 'clear-night' : 'clear-day';
    if (code >= 1 && code <= 3) return 'clouds';
    return 'clouds';
  }

  function dailyWeatherPresentation(code, precipitationProbability, temperature) {
    var numericCode = Number(code);
    var chance = Number(precipitationProbability);
    var base = weatherDetails(numericCode, 1);
    var atmosphere = weatherAtmosphere(numericCode, 1, temperature, temperature);
    var drizzle = numericCode >= 51 && numericCode <= 57;
    var rain = (numericCode >= 61 && numericCode <= 67) || (numericCode >= 80 && numericCode <= 82);
    var snow = (numericCode >= 71 && numericCode <= 77) || (numericCode >= 85 && numericCode <= 86);
    if (!(drizzle || rain || snow) || !Number.isFinite(chance)) return { label: base.label, icon: base.icon, atmosphere: atmosphere };
    if (chance < 20) return { label: '\u05de\u05e2\u05d5\u05e0\u05df \u05d7\u05dc\u05e7\u05d9\u05ea', icon: 'fa-cloud-sun', atmosphere: 'clouds' };
    if (chance < 50) {
      return {
        label: snow ? '\u05e1\u05d9\u05db\u05d5\u05d9 \u05dc\u05e9\u05dc\u05d2' : drizzle ? '\u05e1\u05d9\u05db\u05d5\u05d9 \u05dc\u05d8\u05e4\u05d8\u05d5\u05e3' : '\u05e1\u05d9\u05db\u05d5\u05d9 \u05dc\u05d2\u05e9\u05dd',
        icon: snow ? 'fa-snowflake' : drizzle ? 'fa-cloud-rain' : 'fa-cloud-showers-heavy',
        atmosphere: chance >= 40 ? atmosphere : 'clouds'
      };
    }
    return { label: base.label, icon: base.icon, atmosphere: atmosphere };
  }

  function contextSnapshot() {
    var data=state.forecast||{},current=data.current||{},daily=data.daily||{},details=state.forecast?weatherDetails(current.weather_code,current.is_day):{label:''};
    function value(list){var number=Number(Array.isArray(list)?list[0]:null);return Number.isFinite(number)?number:null;}
    var temperature=Number(current.temperature_2m),apparent=Number(current.apparent_temperature),code=Number(current.weather_code);
    return Object.freeze({
      ready:Boolean(state.forecast&&!state.error),
      currentLabel:details.label||'',
      temperature:Number.isFinite(temperature)?temperature:null,
      apparentTemperature:Number.isFinite(apparent)?apparent:null,
      weatherCode:Number.isFinite(code)?code:null,
      precipitationProbability:value(daily.precipitation_probability_max),
      windSpeed:value(daily.wind_speed_10m_max),
      uvIndex:value(daily.uv_index_max),
      maxTemperature:value(daily.temperature_2m_max),
      source:'Open-Meteo'
    });
  }
  function publishContext(){var snapshot=contextSnapshot();window.dispatchEvent(new CustomEvent('travelmate:weather-context-change',{detail:snapshot}));return snapshot;}
  window.TravelMateWeatherContext=Object.freeze({snapshot:contextSnapshot});

  function weatherSvg(icon) {
    var cloud = '<path class="weather-icon__cloud" d="M7 19h12a5 5 0 0 0 .6-10A7 7 0 0 0 6.4 11 4 4 0 0 0 7 19Z"></path>';
    var sun = '<circle class="weather-icon__sun" cx="19" cy="7" r="3.3"></circle><path class="weather-icon__sun-ray" d="M19 1.5v2M19 10.5v2M13.5 7h-2M24.5 7h2M15.3 3.3 13.8 1.8M22.7 3.3 24.2 1.8"></path>';
    var rain = '<path class="weather-icon__rain" d="m9 21-1.2 2.5M14 21l-1.2 2.5M19 21l-1.2 2.5"></path>';
    var snow = '<path class="weather-icon__snow" d="M9 21v4M7 23h4M16 21v4M14 23h4"></path>';
    var bolt = '<path class="weather-icon__bolt" d="m15 18.5-3 5h3l-1 4 5-7h-3l2-2Z"></path>';
    var fog = '<path class="weather-icon__fog" d="M6 21h16M8 24h12"></path>';
    var body = cloud;
    if (icon === 'fa-sun') body = '<circle class="weather-icon__sun weather-icon__sun--solo" cx="14" cy="14" r="5"></circle><path class="weather-icon__sun-ray" d="M14 3v3M14 22v3M3 14h3M22 14h3M6.2 6.2l2.1 2.1M19.7 19.7l2.1 2.1M21.8 6.2l-2.1 2.1M8.3 19.7l-2.1 2.1"></path>';
    else if (icon === 'fa-moon') body = '<path class="weather-icon__moon" d="M18.5 4.2a9.2 9.2 0 1 0 5.3 15.9A8.2 8.2 0 0 1 18.5 4.2Z"></path>';
    else if (icon === 'fa-cloud-sun') body = sun + cloud;
    else if (icon === 'fa-cloud-rain' || icon === 'fa-cloud-showers-heavy') body = cloud + rain;
    else if (icon === 'fa-snowflake') body = cloud + snow;
    else if (icon === 'fa-cloud-bolt') body = cloud + bolt;
    else if (icon === 'fa-smog') body = cloud + fog;
    return '<svg class="weather-icon-svg" viewBox="0 0 28 28" aria-hidden="true" focusable="false">' + body + '</svg>';
  }

  function storedTrip() {
    var id = new URLSearchParams(location.search).get('id');
    if (!id || !window.TravelMateTripStore) return null;
    return window.TravelMateTripStore.getTrip(id);
  }

  function pageDestination() {
    if (!/\/trip\//.test(location.pathname.replace(/\\/g, '/'))) return null;
    var trip = storedTrip();
    var nearby = document.querySelector('[data-destination-lat][data-destination-lon]');
    var cityNode = document.querySelector('[data-city]');
    var countryNode = document.querySelector('[data-country]');
    var heroText = document.querySelector('.hero-copy p');
    var heading = document.querySelector('.hero h1');
    var city = clean(trip && trip.city || cityNode && cityNode.textContent || heroText && heroText.textContent.split('·')[0].split(',')[0] || heading && heading.textContent);
    var country = clean(trip && trip.country || countryNode && countryNode.textContent || heading && heading.textContent);
    if (!city && !nearby) return null;
    return {
      city: city || clean(nearby.dataset.destinationName), country: country,
      latitude: nearby ? Number(nearby.dataset.destinationLat) : null,
      longitude: nearby ? Number(nearby.dataset.destinationLon) : null
    };
  }

  function createUi(destination) {
    document.querySelectorAll('.quick-grid .card.weather').forEach(function (oldCard) {
      var grid = oldCard.closest('.quick-grid'); oldCard.remove(); if (grid) grid.classList.add('weather-live-replaced');
    });
    var oldModal = document.getElementById('modal-weather'); if (oldModal) oldModal.remove();

    var content = document.querySelector('.content'); var hero = content && content.querySelector('.hero');
    if (!content || !hero) return null;
    var button = content.querySelector(':scope > [data-weather-top-widget]') || hero.querySelector('[data-weather-top-widget]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button'; button.className = 'weather-top-widget weather-master-card'; button.dataset.cardStyle = 'weather'; button.dataset.weatherTopWidget = '';
      if (document.body.dataset.tripKind === 'custom') hero.insertAdjacentElement('afterend', button);
      else hero.appendChild(button);
    }
    if (document.body.dataset.tripKind === 'custom' && button.parentElement !== content) hero.insertAdjacentElement('afterend', button);
    button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', 'פתיחת תחזית מזג האוויר המלאה עבור ' + destination.city);
    button.innerHTML = '<span class="weather-atmosphere" data-weather-atmosphere="idle" aria-hidden="true"><span class="weather-atmosphere__orb"></span><span class="weather-atmosphere__stars"></span><span class="weather-atmosphere__cloud weather-atmosphere__cloud--one"></span><span class="weather-atmosphere__cloud weather-atmosphere__cloud--two"></span><span class="weather-atmosphere__precip"></span><span class="weather-atmosphere__mist weather-atmosphere__mist--one"></span><span class="weather-atmosphere__mist weather-atmosphere__mist--two"></span><span class="weather-atmosphere__flash"></span></span>' + '<span class="weather-top-icon">' + weatherSvg('fa-cloud-sun') + '</span><span class="weather-top-copy"><small>מזג האוויר ב' + escapeText(destination.city) + '</small><strong data-weather-summary>טוען תחזית עדכנית…</strong></span><span class="weather-top-temperature" data-weather-temperature>--°</span><span class="weather-top-action">פתח תחזית <i class="fa-solid fa-chevron-down" aria-hidden="true"></i></span>';

    var backdrop = document.createElement('section');
    backdrop.id = 'modal-weather-live'; backdrop.className = 'modal-backdrop'; backdrop.setAttribute('role', 'dialog'); backdrop.setAttribute('aria-modal', 'true'); backdrop.setAttribute('aria-labelledby', 'weather-live-title');
    backdrop.innerHTML = '<div class="modal weather-live-modal"><header><div class="weather-live-header-copy"><span>תחזית עדכנית</span><h2 id="weather-live-title">7 ימים ב' + escapeText(destination.city) + '</h2><small data-weather-updated>הנתונים נטענים…</small></div><button class="modal-close" type="button" data-weather-close aria-label="סגירת התחזית"><i class="fa-solid fa-xmark"></i></button></header><div data-weather-content><div class="weather-loading"><i class="fa-solid fa-circle-notch fa-spin"></i>מביא תחזית עדכנית…</div></div></div>';
    document.body.appendChild(backdrop);
    return { button: button, backdrop: backdrop, content: backdrop.querySelector('[data-weather-content]'), summary: button.querySelector('[data-weather-summary]'), temperature: button.querySelector('[data-weather-temperature]'), icon: button.querySelector('.weather-top-icon'), atmosphere: button.querySelector('[data-weather-atmosphere]'), updated: backdrop.querySelector('[data-weather-updated]') };
  }

  async function resolveLocation(destination) {
    if (Number.isFinite(destination.latitude) && Number.isFinite(destination.longitude)) return destination;
    var cacheKey = 'travelmate-weather-place:' + [destination.city, destination.country].join('|').toLowerCase();
    try { var cached = JSON.parse(localStorage.getItem(cacheKey) || 'null'); if (cached && cached.latitude) return cached; } catch (error) {}
    var queries = [[destination.city, destination.country].filter(Boolean).join(', '), destination.city].filter(Boolean);
    var result = null;
    for (var index = 0; index < queries.length && !result; index += 1) {
      try {
        var data = await fetchJson('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(queries[index]) + '&count=5&language=he&format=json', 'geocoding');
        var results = data.results || [];
        result = results.find(function (item) { return !destination.country || clean(item.country).includes(clean(destination.country)) || clean(destination.country).includes(clean(item.country)); }) || results[0] || null;
      } catch (error) { if (index === queries.length - 1) throw error; }
    }
    if (!result) throw new Error('location-not-found');
    var located = { city: result.name || destination.city, country: result.country || destination.country, latitude: result.latitude, longitude: result.longitude, timezone: result.timezone };
    try { localStorage.setItem(cacheKey, JSON.stringify(located)); } catch (error) {}
    return located;
  }

  async function fetchForecast(place, force) {
    var cacheKey = 'travelmate-weather-forecast:' + place.latitude.toFixed(3) + ',' + place.longitude.toFixed(3);
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem(cacheKey) || 'null'); } catch (error) {}
    if (!force && cached && Date.now() - cached.savedAt < 900000) return cached.data;
    var fields = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,uv_index_max';
    var current = 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day';
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + encodeURIComponent(place.latitude) + '&longitude=' + encodeURIComponent(place.longitude) + '&current=' + current + '&daily=' + fields + '&timezone=auto&forecast_days=7';
    var data = null; var lastError = null;
    for (var attempt = 0; attempt < 2 && !data; attempt += 1) {
      try { data = await fetchJson(url, 'forecast'); }
      catch (error) { lastError = error; if (attempt === 0) await wait(1200); }
    }
    if (!data && cached && cached.data) return cached.data;
    if (!data) throw lastError || new Error('forecast');
    try { localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), data: data })); } catch (error) {}
    return data;
  }

  function adviceFor(data) {
    var daily = data.daily || {}; var rain = daily.precipitation_probability_max || []; var wind = daily.wind_speed_10m_max || []; var uv = daily.uv_index_max || []; var codes = daily.weather_code || []; var highs = daily.temperature_2m_max || [];
    function target(index) { return dayName(daily.time && daily.time[index], index); }
    var rainIndex = rain.findIndex(function (value) { return Number(value) >= 60; });
    if (rainIndex >= 0) { var rainDay = target(rainIndex); return { icon: 'fa-umbrella', target: rainDay, title: rainDay === 'היום' ? 'גשם צפוי היום' : 'גשם צפוי ב' + rainDay, text: 'סיכוי של ' + round(rain[rainIndex]) + '% לגשם. Mate יכול להתאים את המסלול למקומות מקורים.' }; }
    var windIndex = wind.findIndex(function (value) { return Number(value) >= 35; });
    if (windIndex >= 0) { var windDay = target(windIndex); return { icon: 'fa-wind', target: windDay, title: windDay === 'היום' ? 'רוח חזקה צפויה היום' : 'רוח חזקה צפויה ב' + windDay, text: 'מומלץ לבדוק מחדש תצפיות, שיט ופעילויות פתוחות.' }; }
    var uvIndex = uv.findIndex(function (value) { return Number(value) >= 7; });
    if (uvIndex >= 0) {
      var uvDay = target(uvIndex); var uvVisual = dailyWeatherPresentation(codes[uvIndex], rain[uvIndex], highs[uvIndex]); var uvState = uvVisual.atmosphere; var mixed = uvState === 'clouds' || uvState === 'rain' || uvState === 'storm' || uvState === 'fog';
      return { icon: 'fa-sun', target: uvDay, title: uvDay === 'היום' ? 'UV גבוה היום' : 'UV גבוה ב' + uvDay, text: (mixed ? 'זהו שיא ה־UV היומי הצפוי, גם אם בחלק מהיום התחזית מעוננת או גשומה. ' : '') + 'מומלצים מים, כובע וקרם הגנה.' };
    }
    return { icon: 'fa-suitcase-rolling', target: 'כללי', title: 'התחזית מתאימה לתכנון', text: 'לא זוהתה כרגע התרעת מזג אוויר חריגה. כדאי לבדוק שוב סמוך ליציאה.' };
  }

  function dayName(date, index) {
    if (index === 0) return 'היום'; if (index === 1) return 'מחר';
    return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(new Date(date + 'T12:00:00'));
  }

  function render(ui, place, data) {
    var current = data.current || {}; var daily = data.daily || {}; var details = weatherDetails(current.weather_code, current.is_day); var currentAtmosphere = weatherAtmosphere(current.weather_code, current.is_day, current.temperature_2m, current.apparent_temperature);
    ui.button.dataset.weatherAtmosphere = currentAtmosphere;
    if (ui.atmosphere) ui.atmosphere.dataset.weatherAtmosphere = currentAtmosphere;
    ui.summary.textContent = details.label + ' \u00b7 \u05de\u05e8\u05d2\u05d9\u05e9 \u05db\u05de\u05d5 ' + round(current.apparent_temperature) + '\u00b0'; ui.temperature.textContent = round(current.temperature_2m) + '\u00b0'; ui.icon.innerHTML = weatherSvg(details.icon);
    ui.updated.textContent = '\u05e2\u05d5\u05d3\u05db\u05df \u05e2\u05db\u05e9\u05d9\u05d5 \u00b7 \u05d0\u05d6\u05d5\u05e8 \u05d6\u05de\u05df ' + (data.timezone_abbreviation || data.timezone || place.timezone || '\u05de\u05e7\u05d5\u05de\u05d9');
    function atmospherePieces() { return '<span class="weather-atmosphere__orb"></span><span class="weather-atmosphere__stars"></span><span class="weather-atmosphere__cloud weather-atmosphere__cloud--one"></span><span class="weather-atmosphere__cloud weather-atmosphere__cloud--two"></span><span class="weather-atmosphere__precip"></span><span class="weather-atmosphere__mist weather-atmosphere__mist--one"></span><span class="weather-atmosphere__mist weather-atmosphere__mist--two"></span><span class="weather-atmosphere__flash"></span>'; }
    var advice = adviceFor(data); var rows = (daily.time || []).map(function (date, index) {
      var day = dailyWeatherPresentation(daily.weather_code[index], daily.precipitation_probability_max[index], daily.temperature_2m_max[index]); var dayAtmosphere = day.atmosphere;
      var expanded = index === 0; var detailsId = 'weather-day-details-' + index; var dayLabel = dayName(date, index);
      var max = round(daily.temperature_2m_max[index]), min = round(daily.temperature_2m_min[index]), rainChance = round(daily.precipitation_probability_max[index]), wind = round(daily.wind_speed_10m_max[index]), uv = round(daily.uv_index_max[index]);
      return '<article class="weather-live-day' + (index === 0 ? ' today' : '') + (expanded ? ' expanded' : '') + '" data-weather-day="' + dayAtmosphere + '">' +
        '<button type="button" class="weather-live-day-toggle" data-weather-day-toggle aria-expanded="' + String(expanded) + '" aria-controls="' + detailsId + '">' +
          '<span class="weather-live-day-icon">' + weatherSvg(day.icon) + '<small>' + max + '\u00b0</small></span>' +
          '<span class="weather-live-day-copy"><strong>' + escapeText(dayLabel) + '</strong><span>' + escapeText(day.label) + ' \u00b7 ' + new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(date + 'T12:00:00')) + '</span></span>' +
          '<span class="weather-live-day-quick"><b><i class="fa-solid fa-droplet"></i> ' + rainChance + '%</b><i class="fa-solid fa-chevron-down weather-live-day-chevron" aria-hidden="true"></i></span>' +
        '</button>' +
        '<div class="weather-live-day-details" id="' + detailsId + '" data-weather-day-details' + (expanded ? '' : ' hidden') + '>' +
          '<div class="weather-live-day-scene weather-atmosphere" data-weather-atmosphere="' + dayAtmosphere + '" aria-hidden="true">' + atmospherePieces() + '<strong>' + escapeText(day.label) + '</strong><small>' + max + '\u00b0 / ' + min + '\u00b0</small></div>' +
          '<div class="weather-live-day-detail-grid">' +
            '<div><i class="fa-solid fa-temperature-half"></i><span>\u05d8\u05de\u05e4\u05e8\u05d8\u05d5\u05e8\u05d4</span><strong>' + max + '\u00b0 / ' + min + '\u00b0</strong></div>' +
            '<div><i class="fa-solid fa-droplet"></i><span>\u05de\u05e9\u05e7\u05e2\u05d9\u05dd</span><strong>' + rainChance + '%</strong></div>' +
            '<div><i class="fa-solid fa-wind"></i><span>\u05e8\u05d5\u05d7</span><strong>' + wind + ' \u05e7\u05de\u05f4\u05e9</strong></div>' +
            '<div><i class="fa-solid fa-sun"></i><span>UV</span><strong>' + uv + '</strong></div>' +
          '</div>' +
        '</div>' +
      '</article>';
    }).join('');
    var scene = '<div class="weather-live-scene weather-atmosphere" data-weather-atmosphere="' + currentAtmosphere + '" aria-hidden="true">' + atmospherePieces() + '<strong>' + escapeText(details.label) + '</strong><small>' + round(current.temperature_2m) + '\u00b0 \u00b7 \u05de\u05e8\u05d2\u05d9\u05e9 \u05db\u05de\u05d5 ' + round(current.apparent_temperature) + '\u00b0</small></div>';
    ui.content.innerHTML = scene + '<div class="weather-insight"><i class="fa-solid ' + advice.icon + '"></i><div><strong>' + escapeText(advice.title) + '</strong><span>' + escapeText(advice.text) + '</span></div></div><div class="weather-live-grid">' + rows + '</div><div class="weather-live-footer"><div class="weather-live-actions"><button class="primary" type="button" data-weather-ai><i class="fa-solid fa-wand-magic-sparkles"></i> \u05e9\u05d0\u05dc \u05d0\u05ea Mate \u05e2\u05dc \u05d4\u05ea\u05d7\u05d6\u05d9\u05ea</button><button type="button" data-weather-refresh><i class="fa-solid fa-rotate"></i> \u05e8\u05e2\u05e0\u05d5\u05df</button></div><a class="weather-source" href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">\u05e0\u05ea\u05d5\u05e0\u05d9\u05dd: Open-Meteo \u05d5\u05de\u05d5\u05d3\u05dc\u05d9\u05dd \u05e9\u05dc \u05e9\u05d9\u05e8\u05d5\u05ea\u05d9 \u05de\u05d6\u05d2 \u05d0\u05d5\u05d5\u05d9\u05e8 \u05dc\u05d0\u05d5\u05de\u05d9\u05d9\u05dd</a></div>';
    ui.content.querySelector('[data-weather-refresh]').addEventListener('click', function () { load(ui, true); });
    ui.content.querySelectorAll('[data-weather-day-toggle]').forEach(function (toggle) {
      toggle.addEventListener('click', function () {
        var opening = toggle.getAttribute('aria-expanded') !== 'true';
        ui.content.querySelectorAll('[data-weather-day-toggle]').forEach(function (other) {
          var panel = document.getElementById(other.getAttribute('aria-controls')); var article = other.closest('.weather-live-day');
          other.setAttribute('aria-expanded', 'false'); if (panel) panel.hidden = true; if (article) article.classList.remove('expanded');
        });
        if (opening) { var panel = document.getElementById(toggle.getAttribute('aria-controls')); var article = toggle.closest('.weather-live-day'); toggle.setAttribute('aria-expanded', 'true'); if (panel) panel.hidden = false; if (article) article.classList.add('expanded'); }
      });
    });
    var aiButton = ui.content.querySelector('[data-weather-ai]');
    aiButton.addEventListener('click', function () {
      var forecastSummary = (daily.time || []).map(function (date, index) {
        var day = dailyWeatherPresentation(daily.weather_code[index], daily.precipitation_probability_max[index], daily.temperature_2m_max[index]);
        return dayName(date, index) + ': ' + day.label + ', ' + round(daily.temperature_2m_max[index]) + '\u00b0/' + round(daily.temperature_2m_min[index]) + '\u00b0, ' + round(daily.precipitation_probability_max[index]) + '% \u05de\u05e9\u05e7\u05e2\u05d9\u05dd, ' + round(daily.wind_speed_10m_max[index]) + ' \u05e7\u05de\u05f4\u05e9, UV ' + round(daily.uv_index_max[index]);
      }).join('; ');
      var prompt = '\u05d1\u05d3\u05d5\u05e7 \u05d0\u05ea \u05ea\u05d7\u05d6\u05d9\u05ea \u05de\u05d6\u05d2 \u05d4\u05d0\u05d5\u05d5\u05d9\u05e8 \u05dc\u05be7 \u05d4\u05d9\u05de\u05d9\u05dd \u05d4\u05e7\u05e8\u05d5\u05d1\u05d9\u05dd \u05d1' + place.city + ' \u05d5\u05d4\u05e6\u05e2 \u05dc\u05d9 \u05d4\u05ea\u05d0\u05de\u05d5\u05ea \u05dc\u05de\u05e1\u05dc\u05d5\u05dc \u05d5\u05e8\u05e9\u05d9\u05de\u05ea \u05e6\u05d9\u05d5\u05d3 \u05e7\u05e6\u05e8\u05d4.\n\n\u05e0\u05ea\u05d5\u05e0\u05d9 \u05d4\u05ea\u05d7\u05d6\u05d9\u05ea: ' + forecastSummary;
      function emitToMate() {
        if (!window.TravelMateEvents || !window.TravelMateEvents.names || !window.TravelMateEvents.names.askAi) return;
        close(ui, false); window.TravelMateEvents.emit(window.TravelMateEvents.names.askAi, { prompt: prompt, source: 'weather' });
      }
      if (window.__travelMateAiAssistantLoaded) { emitToMate(); return; }
      if (window.TravelMateFeatures && typeof window.TravelMateFeatures.load === 'function') {
        aiButton.disabled = true; aiButton.setAttribute('aria-busy', 'true');
        window.TravelMateFeatures.load('assistant').then(function (ready) { if (ready !== false) emitToMate(); }).catch(function (error) { console.error('TravelMate weather assistant failed to load', error); }).finally(function () { aiButton.disabled = false; aiButton.removeAttribute('aria-busy'); });
        return;
      }
      emitToMate();
    });
  }

  function renderError(ui) {
    if (ui.atmosphere) ui.atmosphere.dataset.weatherAtmosphere = 'idle';
    ui.summary.textContent = 'לא הצלחנו לעדכן כרגע'; ui.temperature.textContent = '--°';
    ui.content.innerHTML = '<div class="weather-error"><i class="fa-solid fa-cloud-arrow-down"></i><strong>התחזית לא נטענה</strong><span>בדוק את החיבור ונסה שוב.</span><button type="button" data-weather-retry>ניסיון נוסף</button></div>';
    ui.content.querySelector('[data-weather-retry]').addEventListener('click', function () { load(ui, true); });
  }

  async function load(ui, force) {
    if (state.loading) return; state.loading = true;
    if (force) ui.content.innerHTML = '<div class="weather-loading"><i class="fa-solid fa-circle-notch fa-spin"></i>מרענן תחזית…</div>';
    try { state.location = await resolveLocation(state.location); state.forecast = await fetchForecast(state.location, force); state.error=false; render(ui, state.location, state.forecast); publishContext(); }
    catch (error) { state.error=true; console.error('TravelMate weather failed', error); renderError(ui); publishContext(); }
    finally { state.loading = false; }
  }

  function scheduleInitialLoad(ui) { var run = function () { load(ui, false); }; if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 1000 }); else window.setTimeout(run, 250); }

  function weatherFocusable(ui) {
    return [].slice.call(ui.backdrop.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(function (node) {
      return !node.hidden && node.getAttribute('aria-hidden') !== 'true' && node.getClientRects().length > 0;
    });
  }
  function open(ui) {
    ui.backdrop.classList.add('open');
    ui.button.setAttribute('aria-expanded', 'true');
    if (window.TravelMateHistory && typeof window.TravelMateHistory.pushOverlay === 'function') {
      window.TravelMateHistory.pushOverlay('weather', function () { close(ui); });
    }
    var closeButton = ui.backdrop.querySelector('[data-weather-close]');
    if (closeButton) closeButton.focus();
  }
  function close(ui, restoreFocus) {
    ui.backdrop.classList.remove('open');
    ui.button.setAttribute('aria-expanded', 'false');
    if (window.TravelMateHistory && typeof window.TravelMateHistory.closeOverlay === 'function') window.TravelMateHistory.closeOverlay('weather');
    if (restoreFocus !== false) ui.button.focus();
  }

  var destination = pageDestination(); if (!destination) return; state.location = destination;
  var ui = createUi(destination); if (!ui) return;
  ui.button.addEventListener('click', function () { open(ui); });
  ui.backdrop.querySelector('[data-weather-close]').addEventListener('click', function () { close(ui); });
  ui.backdrop.addEventListener('click', function (event) { if (event.target === ui.backdrop) close(ui); });
  document.addEventListener('keydown', function (event) {
    if (!ui.backdrop.classList.contains('open')) return;
    if (event.key === 'Escape') { event.preventDefault(); close(ui); return; }
    if (event.key !== 'Tab') return;
    var focusable = weatherFocusable(ui); if (!focusable.length) { event.preventDefault(); return; }
    var first = focusable[0], last = focusable[focusable.length - 1], active = document.activeElement;
    if (event.shiftKey && (active === first || !ui.backdrop.contains(active))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
  });
  scheduleInitialLoad(ui);
})();
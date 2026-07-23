(function () {
  'use strict';

  if (window.__travelMateWeatherLoaded) return;
  window.__travelMateWeatherLoaded = true;

  var state = { location: null, forecast: null, loading: false };
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

  function storedTrip() {
    var id = new URLSearchParams(location.search).get('id');
    if (!id) return null;
    try {
      return JSON.parse(localStorage.getItem('travelmate-trips') || '[]').find(function (item) { return String(item.id) === String(id); }) || null;
    } catch (error) { return null; }
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

    var button = document.createElement('button');
    button.type = 'button'; button.className = 'weather-top-widget'; button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-expanded', 'false');
    button.innerHTML = '<span class="weather-top-icon"><i class="fa-solid fa-cloud-sun"></i></span><span class="weather-top-copy"><small>מזג האוויר ב' + escapeText(destination.city) + '</small><strong data-weather-summary>טוען תחזית עדכנית…</strong></span><span class="weather-top-temperature" data-weather-temperature>--°</span><i class="fa-solid fa-chevron-down weather-top-chevron"></i>';
    var content = document.querySelector('.content'); var hero = content && content.querySelector('.hero');
    if (!content || !hero) return null;
    hero.insertAdjacentElement('afterend', button);

    var backdrop = document.createElement('section');
    backdrop.id = 'modal-weather-live'; backdrop.className = 'modal-backdrop'; backdrop.setAttribute('role', 'dialog'); backdrop.setAttribute('aria-modal', 'true'); backdrop.setAttribute('aria-labelledby', 'weather-live-title');
    backdrop.innerHTML = '<div class="modal weather-live-modal"><header><div class="weather-live-header-copy"><span>תחזית עדכנית</span><h2 id="weather-live-title">7 ימים ב' + escapeText(destination.city) + '</h2><small data-weather-updated>הנתונים נטענים…</small></div><button class="modal-close" type="button" data-weather-close aria-label="סגירת התחזית"><i class="fa-solid fa-xmark"></i></button></header><div data-weather-content><div class="weather-loading"><i class="fa-solid fa-circle-notch fa-spin"></i>מביא תחזית עדכנית…</div></div></div>';
    document.body.appendChild(backdrop);
    return { button: button, backdrop: backdrop, content: backdrop.querySelector('[data-weather-content]'), summary: button.querySelector('[data-weather-summary]'), temperature: button.querySelector('[data-weather-temperature]'), icon: button.querySelector('.weather-top-icon i'), updated: backdrop.querySelector('[data-weather-updated]') };
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
    var daily = data.daily || {}; var rain = daily.precipitation_probability_max || []; var wind = daily.wind_speed_10m_max || []; var uv = daily.uv_index_max || [];
    var rainIndex = rain.findIndex(function (value) { return Number(value) >= 60; });
    if (rainIndex >= 0) return { icon: 'fa-umbrella', title: 'כדאי להכניס מטרייה לתיק', text: 'סיכוי של ' + round(rain[rainIndex]) + '% לגשם ב' + dayName(daily.time[rainIndex], rainIndex) + '. נבו יכול להתאים את המסלול למקומות מקורים.' };
    var windIndex = wind.findIndex(function (value) { return Number(value) >= 35; });
    if (windIndex >= 0) return { icon: 'fa-wind', title: 'צפויה רוח חזקה', text: 'מומלץ לבדוק מחדש תצפיות, שיט ופעילויות פתוחות ב' + dayName(daily.time[windIndex], windIndex) + '.' };
    var uvIndex = uv.findIndex(function (value) { return Number(value) >= 7; });
    if (uvIndex >= 0) return { icon: 'fa-sun', title: 'לא לשכוח הגנה מהשמש', text: 'מדד UV גבוה צפוי ב' + dayName(daily.time[uvIndex], uvIndex) + '. מומלצים מים, כובע וקרם הגנה.' };
    return { icon: 'fa-suitcase-rolling', title: 'התחזית מתאימה לתכנון', text: 'לא זוהתה כרגע התרעת מזג אוויר חריגה. כדאי לבדוק שוב סמוך ליציאה.' };
  }

  function dayName(date, index) {
    if (index === 0) return 'היום'; if (index === 1) return 'מחר';
    return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(new Date(date + 'T12:00:00'));
  }

  function render(ui, place, data) {
    var current = data.current || {}; var daily = data.daily || {}; var details = weatherDetails(current.weather_code, current.is_day);
    ui.summary.textContent = details.label + ' · מרגיש כמו ' + round(current.apparent_temperature) + '°'; ui.temperature.textContent = round(current.temperature_2m) + '°'; ui.icon.className = 'fa-solid ' + details.icon;
    ui.updated.textContent = 'עודכן עכשיו · אזור זמן ' + (data.timezone_abbreviation || data.timezone || place.timezone || 'מקומי');
    var advice = adviceFor(data); var rows = (daily.time || []).map(function (date, index) {
      var day = weatherDetails(daily.weather_code[index], 1);
      return '<article class="weather-live-day' + (index === 0 ? ' today' : '') + '"><span class="weather-live-day-icon"><i class="fa-solid ' + day.icon + '"></i></span><div><strong>' + escapeText(dayName(date, index)) + '</strong><span>' + escapeText(day.label) + ' · ' + new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(date + 'T12:00:00')) + '</span></div><div class="weather-live-metrics"><b><i class="fa-solid fa-temperature-high"></i> ' + round(daily.temperature_2m_max[index]) + '° / ' + round(daily.temperature_2m_min[index]) + '°</b><b><i class="fa-solid fa-droplet"></i> ' + round(daily.precipitation_probability_max[index]) + '%</b><b><i class="fa-solid fa-wind"></i> ' + round(daily.wind_speed_10m_max[index]) + ' קמ״ש</b></div></article>';
    }).join('');
    ui.content.innerHTML = '<div class="weather-insight"><i class="fa-solid ' + advice.icon + '"></i><div><strong>' + escapeText(advice.title) + '</strong><span>' + escapeText(advice.text) + '</span></div></div><div class="weather-live-grid">' + rows + '</div><div class="weather-live-footer"><div class="weather-live-actions"><button class="primary" type="button" data-weather-ai><i class="fa-solid fa-wand-magic-sparkles"></i> שאל את נבו על התחזית</button><button type="button" data-weather-refresh><i class="fa-solid fa-rotate"></i> רענון</button></div><a class="weather-source" href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">נתונים: Open-Meteo ומודלים של שירותי מזג אוויר לאומיים</a></div>';
    ui.content.querySelector('[data-weather-refresh]').addEventListener('click', function () { load(ui, true); });
    ui.content.querySelector('[data-weather-ai]').addEventListener('click', function () {
      close(ui); window.dispatchEvent(new CustomEvent('travelmate:ask-ai', { detail: { prompt: 'בדוק את תחזית מזג האוויר ל־7 הימים הקרובים ב' + place.city + ' והצע לי התאמות למסלול ורשימת ציוד קצרה.' } }));
    });
  }

  function renderError(ui) {
    ui.summary.textContent = 'לא הצלחנו לעדכן כרגע'; ui.temperature.textContent = '--°';
    ui.content.innerHTML = '<div class="weather-error"><i class="fa-solid fa-cloud-arrow-down"></i><strong>התחזית לא נטענה</strong><span>בדוק את החיבור ונסה שוב.</span><button type="button" data-weather-retry>ניסיון נוסף</button></div>';
    ui.content.querySelector('[data-weather-retry]').addEventListener('click', function () { load(ui, true); });
  }

  async function load(ui, force) {
    if (state.loading) return; state.loading = true;
    if (force) ui.content.innerHTML = '<div class="weather-loading"><i class="fa-solid fa-circle-notch fa-spin"></i>מרענן תחזית…</div>';
    try { state.location = await resolveLocation(state.location); state.forecast = await fetchForecast(state.location, force); render(ui, state.location, state.forecast); }
    catch (error) { console.error('TravelMate weather failed', error); renderError(ui); }
    finally { state.loading = false; }
  }

  function open(ui) { ui.backdrop.classList.add('open'); ui.button.setAttribute('aria-expanded', 'true'); var closeButton = ui.backdrop.querySelector('[data-weather-close]'); if (closeButton) closeButton.focus(); }
  function close(ui) { ui.backdrop.classList.remove('open'); ui.button.setAttribute('aria-expanded', 'false'); }

  var destination = pageDestination(); if (!destination) return; state.location = destination;
  var ui = createUi(destination); if (!ui) return;
  ui.button.addEventListener('click', function () { open(ui); });
  ui.backdrop.querySelector('[data-weather-close]').addEventListener('click', function () { close(ui); ui.button.focus(); });
  ui.backdrop.addEventListener('click', function (event) { if (event.target === ui.backdrop) close(ui); });
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && ui.backdrop.classList.contains('open')) close(ui); });
  load(ui, false);
})();

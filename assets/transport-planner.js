(function () {
  'use strict';

  if (!document.querySelector('.workspace main.content')) return;

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, function (char) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]; });
  }
  function getStaticTrip() {
    var countryNode = document.querySelector('.destination-mini strong');
    var heroText = document.querySelector('#overview .hero-copy p');
    var country = countryNode ? countryNode.textContent.trim() : '';
    var route = heroText ? heroText.textContent.split('·')[0].trim() : country;
    return { city: route.split(/,| ו/)[0].trim() || country, country: country, start: '' };
  }
  async function getTrip() {
    if (window.travelMateTripReady) {
      try { return await window.travelMateTripReady; } catch (error) {}
    }
    return getStaticTrip();
  }
  function link(url, icon, title, text, source) {
    return '<a class="transport-result" href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer"><span class="transport-result-icon"><i class="fa-solid ' + icon + '"></i></span><span><strong>' + escapeHtml(title) + '</strong><small>' + escapeHtml(text) + '</small></span><em>' + escapeHtml(source) + ' <i class="fa-solid fa-arrow-up-right-from-square"></i></em></a>';
  }
  function googleTransit(origin, destination) {
    return 'https://www.google.com/maps/dir/?api=1&origin=' + encodeURIComponent(origin) + '&destination=' + encodeURIComponent(destination) + '&travelmode=transit';
  }
  function rome2rio(origin, destination) {
    function pathPart(value) { return encodeURIComponent(value.trim().replace(/\s+/g, '-')); }
    return 'https://www.rome2rio.com/map/' + pathPart(origin) + '/' + pathPart(destination);
  }
  function uber(origin, destination) {
    return 'https://m.uber.com/ul/?action=setPickup&pickup%5Bformatted_address%5D=' + encodeURIComponent(origin) + '&dropoff%5Bformatted_address%5D=' + encodeURIComponent(destination);
  }
  function officialSearch(city, country) {
    return 'https://www.google.com/search?q=' + encodeURIComponent('official public transport fares ' + city + ' ' + country);
  }
  function fareSources(city, country) {
    var key = (city + ' ' + country).toLowerCase();
    if (/פראג|prague|צכ|czech/.test(key)) return { public: 'https://pid.cz/en/tickets-and-fare/', rail: 'https://www.cd.cz/en/', taxi: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('official taxi ' + city) };
    if (/רומא|rome|איטל|italy/.test(key)) return { public: 'https://www.atac.roma.it/en/tickets-and-passes', rail: 'https://www.trenitalia.com/en.html', taxi: 'https://romamobilita.it/en/moving-rome/taxi' };
    if (/טוקיו|tokyo|יפן|japan/.test(key)) return { public: 'https://www.tokyometro.jp/en/ticket/index.html', rail: 'https://www.japanrailpass.net/en/', taxi: 'https://www.gotokyo.org/en/plan/getting-around/taxis/' };
    if (/תל אביב|tel aviv|ישראל|israel/.test(key)) return { public: 'https://pti.org.il/', rail: 'https://www.rail.co.il/', taxi: 'https://www.gov.il/he/departments/topics/taxis/govil-landing-page' };
    return { public: officialSearch(city, country), rail: 'https://www.openstreetmap.org/search?query=' + encodeURIComponent('train station ' + city + ' ' + country), taxi: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('taxi ' + city + ' ' + country) };
  }
  function addNavigation() {
    var nav = document.querySelector('.sidebar nav');
    if (nav && !nav.querySelector('[href="#transport"]')) {
      var item = document.createElement('a');
      item.href = '#transport';
      item.innerHTML = '<i class="fa-solid fa-train-subway"></i><span class="tip">תחבורה ומחירים</span>';
      nav.appendChild(item);
    }
    var modules = document.querySelector('.modules');
    if (modules && !modules.querySelector('[href="#transport"]')) {
      var card = document.createElement('a');
      card.className = 'module';
      card.href = '#transport';
      card.innerHTML = '<span class="icon"><i class="fa-solid fa-train-subway"></i></span><strong>תחבורה חכמה</strong><small>מסלולים, רכבות, מטרו, אוטובוסים ומוניות</small>';
      modules.appendChild(card);
    }
  }
  function createSection(trip) {
    if (document.getElementById('transport')) return document.getElementById('transport');
    var city = trip.city || trip.destination || trip.country || '';
    var country = trip.country || '';
    var sources = fareSources(city, country);
    var section = document.createElement('section');
    section.id = 'transport';
    section.className = 'section transport-section';
    section.innerHTML = '<div class="section-head"><div><p>מסלול, מפעילים ותעריפים במקום אחד</p><h1>תחבורה ציבורית ומחירים</h1></div></div>' +
      '<div class="transport-layout"><article class="transport-card transport-search-card"><div class="transport-title"><span><i class="fa-solid fa-route"></i></span><div><h2>איך מגיעים?</h2><p>חיפוש מעודכן לפי נקודת יציאה, יעד ותאריך.</p></div></div>' +
      '<form class="transport-form" data-transport-form><label>מאיפה?<input name="origin" value="' + escapeHtml(city) + ' מרכז העיר" placeholder="מלון, תחנה או כתובת" required></label><label>לאן?<input name="destination" placeholder="אטרקציה, תחנה או עיר" required></label><label>תאריך נסיעה<input name="date" type="date" value="' + escapeHtml(trip.start || '') + '"></label><label>שעה<input name="time" type="time" value="09:00"></label><label>מה להציג?<select name="mode"><option value="all">כל האפשרויות</option><option value="public">מטרו ואוטובוסים</option><option value="rail">רכבות</option><option value="taxi">מוניות</option></select></label><button type="submit"><i class="fa-solid fa-magnifying-glass"></i> חיפוש מסלול ומחיר</button></form>' +
      '<div class="transport-results" data-transport-results><div class="transport-empty"><i class="fa-solid fa-location-arrow"></i><strong>מלא יעד ולחץ על חיפוש</strong><span>נפתח לך מסלול חי והשוואת מחירים בשירותים אמינים.</span></div></div></article>' +
      '<aside class="transport-card fare-guide"><div class="transport-title"><span><i class="fa-solid fa-ticket"></i></span><div><h2>מדריך מחירים</h2><p>' + escapeHtml(city + (country ? ', ' + country : '')) + '</p></div></div>' +
      '<a class="fare-row" href="' + escapeHtml(sources.public) + '" target="_blank" rel="noopener"><i class="fa-solid fa-bus-simple"></i><div><strong>מטרו ואוטובוסים <i class="fa-solid fa-arrow-up-right-from-square"></i></strong><p>כרטיסים, אזורי תעריף וכרטיס יומי במקור הרשמי או הפתוח המתאים ליעד.</p></div></a>' +
      '<a class="fare-row" href="' + escapeHtml(sources.rail) + '" target="_blank" rel="noopener"><i class="fa-solid fa-train"></i><div><strong>רכבות <i class="fa-solid fa-arrow-up-right-from-square"></i></strong><p>לוחות זמנים, סוגי רכבות ומחירים אצל מפעיל הרכבות של היעד.</p></div></a>' +
      '<a class="fare-row" href="' + escapeHtml(sources.taxi) + '" target="_blank" rel="noopener"><i class="fa-solid fa-taxi"></i><div><strong>מוניות <i class="fa-solid fa-arrow-up-right-from-square"></i></strong><p>תעריפים, כללי נסיעה ושירותי מוניות מורשים באזור.</p></div></a>' +
      '<a class="official-fares" href="' + escapeHtml(officialSearch(city, country)) + '" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-building-columns"></i><span><strong>איתור אתר התחבורה הרשמי</strong><small>למחירים, כרטיסים והנחות עדכניים</small></span></a>' +
      '<p class="transport-note"><i class="fa-solid fa-circle-info"></i> המחיר הסופי נקבע אצל המפעיל. TravelMate מציג קישורים והשוואות ואינו מוכר כרטיסים.</p></aside></div>';
    var main = document.querySelector('main.content');
    var anchor = document.getElementById('car-rental') || main.querySelector('.external-resources');
    main.insertBefore(section, anchor || null);
    return section;
  }
  function wire(section, trip) {
    var form = section.querySelector('[data-transport-form]');
    var results = section.querySelector('[data-transport-results]');
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var data = new FormData(form);
      var origin = String(data.get('origin') || '').trim();
      var destination = String(data.get('destination') || '').trim();
      var context = [trip.city, trip.country].filter(Boolean).join(', ');
      if (context && origin.indexOf(trip.country || '---') === -1) origin += ', ' + context;
      if (context && destination.indexOf(trip.country || '---') === -1) destination += ', ' + context;
      var mode = data.get('mode');
      var items = [];
      if (mode === 'all' || mode === 'public') items.push(link(googleTransit(origin, destination), 'fa-train-subway', 'מטרו, אוטובוסים ורכבות מקומיות', 'מסלול חי, זמני יציאה והחלפות', 'Google Maps'));
      if (mode === 'all' || mode === 'rail') items.push(link(rome2rio(origin, destination), 'fa-train', 'רכבות ואוטובוסים בין־עירוניים', 'חלופות מסלול וטווחי מחיר משוערים', 'Rome2Rio'));
      if (mode === 'all' || mode === 'rail') items.push(link('https://www.omio.com/', 'fa-ticket', 'השוואת כרטיסי רכבת ואוטובוס', 'בדיקת זמינות ומחיר לתאריך שבחרת', 'Omio'));
      if (mode === 'all' || mode === 'taxi') items.push(link(uber(origin, destination), 'fa-taxi', 'מונית ומחיר נסיעה', 'קבלת הצעת מחיר זמינה לפני הזמנה', 'Uber'));
      results.innerHTML = '<div class="transport-results-head"><strong>אפשרויות מ־' + escapeHtml(origin) + ' אל ' + escapeHtml(destination) + '</strong><span>' + escapeHtml(String(data.get('date') || 'היום')) + ' · ' + escapeHtml(String(data.get('time') || '')) + '</span></div>' + items.join('');
    });
  }
  async function init() {
    var trip = await getTrip();
    if (!trip) return;
    addNavigation();
    var section = createSection(trip);
    wire(section, trip);
  }
  init();
})();

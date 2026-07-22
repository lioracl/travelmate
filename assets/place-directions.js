(function () {
  'use strict';

  if (!document.querySelector('.workspace main.content')) return;

  var STORAGE_KEY = 'travelmate-route-origin';
  var currentPlace = null;
  var resolvedTrip = null;
  if (window.travelMateTripReady) {
    Promise.resolve(window.travelMateTripReady).then(function (trip) { resolvedTrip = trip || null; }).catch(function () {});
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, function (character) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character];
    });
  }

  function getTripContext() {
    var trip = resolvedTrip || window.travelMateCurrentTrip;
    if (trip) return [trip.city, trip.country].filter(Boolean).join(', ');
    var country = document.querySelector('.destination-mini strong');
    var hero = document.querySelector('#overview .hero-copy p');
    return [hero && hero.textContent.split('·')[0].trim(), country && country.textContent.trim()].filter(Boolean).join(', ');
  }

  function destinationFor(place) {
    if (place.lat && place.lon) return place.lat + ',' + place.lon;
    return [place.name, getTripContext()].filter(Boolean).join(', ');
  }

  function mapsDirections(mode, place, origin) {
    var params = new URLSearchParams({ api: '1', destination: destinationFor(place), travelmode: mode, dir_action: 'navigate' });
    if (origin) params.set('origin', origin);
    return 'https://www.google.com/maps/dir/?' + params.toString();
  }

  function uberDirections(place, originMode, origin) {
    var params = new URLSearchParams({ action: 'setPickup' });
    if (originMode === 'gps') params.set('pickup', 'my_location');
    else params.set('pickup[formatted_address]', origin);
    if (place.lat && place.lon) {
      params.set('dropoff[latitude]', place.lat);
      params.set('dropoff[longitude]', place.lon);
      params.set('dropoff[nickname]', place.name);
    } else {
      params.set('dropoff[formatted_address]', destinationFor(place));
    }
    return 'https://m.uber.com/ul/?' + params.toString();
  }

  function wazeDirections(place) {
    var params = new URLSearchParams({ navigate: 'yes' });
    if (place.lat && place.lon) params.set('ll', place.lat + ',' + place.lon);
    else params.set('q', destinationFor(place));
    return 'https://waze.com/ul?' + params.toString();
  }

  function gettDirections(place) {
    var params = new URLSearchParams({ pickup: 'my_location' });
    if (place.lat && place.lon) {
      params.set('dropoff_latitude', place.lat);
      params.set('dropoff_longitude', place.lon);
    }
    params.set('dropoffpoi_name_optional', place.name || destinationFor(place));
    return 'gett://order?' + params.toString();
  }

  function buildModal() {
    var modal = document.createElement('section');
    modal.className = 'place-directions-backdrop';
    modal.dataset.placeDirectionsModal = '';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = '<div class="place-directions-dialog" role="dialog" aria-modal="true" aria-labelledby="place-directions-title">' +
      '<header><div><small>מסלול מוכן בלחיצה</small><h2 id="place-directions-title" data-directions-place>איך מגיעים?</h2></div><button type="button" data-directions-close aria-label="סגירה"><i class="fa-solid fa-xmark"></i></button></header>' +
      '<div class="place-directions-body"><fieldset><legend>מאיפה יוצאים?</legend>' +
      '<div class="directions-origin-options"><label><input type="radio" name="directions-origin" value="gps" checked><span><i class="fa-solid fa-location-crosshairs"></i><strong>המיקום שלי</strong><small>Google Maps יזהה את המיקום</small></span></label>' +
      '<label><input type="radio" name="directions-origin" value="destination"><span><i class="fa-solid fa-city"></i><strong>מרכז היעד</strong><small data-directions-city>מרכז העיר</small></span></label>' +
      '<label><input type="radio" name="directions-origin" value="custom"><span><i class="fa-solid fa-hotel"></i><strong>מלון או כתובת</strong><small>נקודת יציאה קבועה</small></span></label></div>' +
      '<label class="directions-custom-origin" data-directions-custom hidden><span>כתובת המלון או נקודת היציאה</span><input type="text" data-directions-origin-input placeholder="לדוגמה: שם המלון והעיר" autocomplete="street-address"></label></fieldset>' +
      '<div class="directions-mode-grid" data-directions-modes></div>' +
      '<p class="directions-note"><i class="fa-solid fa-circle-info"></i> זמני הנסיעה, הקווים והמחירים מוצגים בשירות החיצוני בזמן אמת.</p></div>' +
      '<footer><button type="button" data-directions-close>חזרה למקומות</button></footer></div>';
    document.body.appendChild(modal);
    return modal;
  }

  var modal = buildModal();
  var originInput = modal.querySelector('[data-directions-origin-input]');
  try { originInput.value = localStorage.getItem(STORAGE_KEY) || ''; } catch (error) {}

  function selectedOrigin() {
    var mode = (modal.querySelector('input[name="directions-origin"]:checked') || {}).value || 'gps';
    if (mode === 'gps') return { mode: mode, value: '' };
    if (mode === 'destination') return { mode: mode, value: getTripContext() };
    return { mode: mode, value: originInput.value.trim() };
  }

  function modeLink(icon, title, description, href, accent) {
    return '<a class="direction-mode' + (accent ? ' primary' : '') + '" href="' + escapeHtml(href) + '" target="_blank" rel="noopener noreferrer"><i class="fa-solid ' + icon + '"></i><span><strong>' + title + '</strong><small>' + description + '</small></span><i class="fa-solid fa-arrow-up-right-from-square"></i></a>';
  }

  function renderModes() {
    if (!currentPlace) return;
    var origin = selectedOrigin();
    var needsAddress = origin.mode === 'custom' && !origin.value;
    var grid = modal.querySelector('[data-directions-modes]');
    if (needsAddress) {
      grid.innerHTML = '<div class="directions-address-needed"><i class="fa-solid fa-location-dot"></i><span><strong>הזן כתובת יציאה</strong><small>לאחר ההזנה יופיעו כל אפשרויות ההגעה.</small></span></div>';
      return;
    }
    grid.innerHTML = modeLink('fa-train-subway', 'תחבורה ציבורית', 'מטרו, רכבות, חשמליות ואוטובוסים', mapsDirections('transit', currentPlace, origin.value), true) +
      modeLink('fa-person-walking', 'הליכה', 'מסלול רגלי עד הכניסה', mapsDirections('walking', currentPlace, origin.value)) +
      modeLink('fa-car', 'רכב', 'ניווט לפי עומסי התנועה', mapsDirections('driving', currentPlace, origin.value)) +
      modeLink('fa-bicycle', 'אופניים', 'מסלול רכיבה כאשר זמין', mapsDirections('bicycling', currentPlace, origin.value)) +
      modeLink('fa-diamond-turn-right', 'Waze', 'המיקום הנוכחי נלקח אוטומטית והיעד כבר מוזן', wazeDirections(currentPlace)) +
      modeLink('fa-taxi', 'מונית Uber', origin.mode === 'gps' ? 'נקודת האיסוף היא המיקום הנוכחי והיעד כבר מוזן' : 'נקודת האיסוף והיעד מוכנים באפליקציה', uberDirections(currentPlace, origin.mode, origin.value)) +
      modeLink('fa-car-side', 'מונית Gett', 'Gett תיפתח עם המיקום הנוכחי כנקודת איסוף ועם היעד שנבחר', gettDirections(currentPlace));
  }

  function openModal(place) {
    currentPlace = place;
    modal.querySelector('[data-directions-place]').textContent = 'איך מגיעים אל ' + place.name + '?';
    modal.querySelector('[data-directions-city]').textContent = getTripContext() || 'מרכז היעד';
    renderModes();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('place-directions-open');
    modal.querySelector('[data-directions-close]').focus();
  }

  function closeModal() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('place-directions-open');
    currentPlace = null;
  }

  function enhanceCard(card) {
    if (card.dataset.directionsReady === '1') return;
    var title = card.querySelector('h3');
    if (!title) return;
    var links = card.querySelector('.nearby-links');
    if (!links) {
      links = document.createElement('div');
      links.className = 'nearby-links';
      var content = card.querySelector('div') || card;
      content.appendChild(links);
    }
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'place-directions-button';
    button.innerHTML = '<i class="fa-solid fa-route"></i> איך מגיעים?';
    button.addEventListener('click', function () {
      openModal({ name: title.textContent.trim(), lat: card.dataset.placeLat || '', lon: card.dataset.placeLon || '' });
    });
    links.prepend(button);
    card.dataset.directionsReady = '1';
  }

  function enhanceResults(root) {
    (root || document).querySelectorAll('.nearby-result, .places-grid .place-card, .saved-place').forEach(enhanceCard);
  }

  modal.addEventListener('click', function (event) {
    if (event.target === modal || event.target.closest('[data-directions-close]')) closeModal();
  });
  modal.querySelectorAll('input[name="directions-origin"]').forEach(function (radio) {
    radio.addEventListener('change', function () {
      modal.querySelector('[data-directions-custom]').hidden = radio.value !== 'custom';
      if (radio.value === 'custom') originInput.focus();
      renderModes();
    });
  });
  originInput.addEventListener('input', function () {
    try { localStorage.setItem(STORAGE_KEY, originInput.value.trim()); } catch (error) {}
    renderModes();
  });
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && modal.classList.contains('open')) closeModal(); });

  enhanceResults(document);
  new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      mutation.addedNodes.forEach(function (node) { if (node.nodeType === 1) enhanceResults(node.matches && node.matches('.nearby-result, .saved-place') ? node.parentNode : node); });
    });
  }).observe(document.body, { childList: true, subtree: true });
})();

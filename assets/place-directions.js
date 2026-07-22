(function () {
  'use strict';

  if (!document.querySelector('.workspace main.content')) return;

  var STORAGE_KEY = 'travelmate-route-origin';
  var currentPlace = null;
  var resolvedTrip = null;
  var shareModal = null;
  var sharePlace = null;
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

  function safeUrl(value) {
    try {
      var url = new URL(String(value || ''), location.href);
      return /^https?:$/.test(url.protocol) ? url.href : '';
    } catch (error) { return ''; }
  }

  function safeExternalUrl(value) {
    var href = safeUrl(value);
    if (!href) return '';
    try {
      var parsed = new URL(href);
      if (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') return '';
      if (parsed.origin === location.origin && parsed.pathname === location.pathname) return '';
      return href;
    } catch (error) {
      return '';
    }
  }

  function cleanPlace(place) {
    place = place || {};
    return {
      name: String(place.name || 'מקום ששיתפו איתי').trim().slice(0, 160),
      category: String(place.category || '').trim().slice(0, 100),
      description: String(place.description || '').trim().slice(0, 320),
      lat: String(place.lat || '').trim().slice(0, 30),
      lon: String(place.lon || '').trim().slice(0, 30),
      image: safeUrl(place.image),
      officialUrl: safeExternalUrl(place.officialUrl),
      ratingsUrl: safeUrl(place.ratingsUrl || place.maps),
      sourceUrl: safeExternalUrl(place.sourceUrl)
    };
  }

  function placeFromCard(card) {
    var title = card.querySelector('h3');
    var description = card.querySelector('p');
    var category = card.querySelector('.nearby-type, .saved-place-type');
    var image = card.querySelector('img');
    var ratings = card.querySelector('.google-rating-link');
    var officialIcon = card.querySelector('.nearby-links a i.fa-globe');
    var source = card.querySelector('.nearby-links a[href*="openstreetmap.org"]');
    return cleanPlace({
      name: title && title.textContent,
      description: description && description.textContent,
      category: category && category.textContent,
      image: image && image.src,
      lat: card.dataset.placeLat,
      lon: card.dataset.placeLon,
      ratingsUrl: ratings && ratings.href,
      officialUrl: officialIcon && officialIcon.closest('a') && officialIcon.closest('a').href,
      sourceUrl: source && source.href
    });
  }

  function appLinkFor(place) {
    var trip = resolvedTrip || window.travelMateCurrentTrip || {};
    var link;
    if (/^(127\.0\.0\.1|localhost)$/.test(location.hostname)) {
      link = new URL('https://lioracl.github.io/travelmate/trip/custom/index.html');
      var localId = new URLSearchParams(location.search).get('id');
      if (localId) link.searchParams.set('id', localId);
    } else {
      link = new URL(location.href);
      link.search = '';
      if (trip.id) link.searchParams.set('id', trip.id);
      else {
        var currentId = new URLSearchParams(location.search).get('id');
        if (currentId) link.searchParams.set('id', currentId);
      }
    }
    link.searchParams.set('sharedPlace', '1');
    link.searchParams.set('placeName', place.name);
    if (place.category) link.searchParams.set('placeCategory', place.category);
    if (place.description) link.searchParams.set('placeInfo', place.description.slice(0, 180));
    if (place.lat) link.searchParams.set('placeLat', place.lat);
    if (place.lon) link.searchParams.set('placeLon', place.lon);
    if (place.ratingsUrl) link.searchParams.set('placeRatings', place.ratingsUrl);
    if (place.officialUrl) link.searchParams.set('placeOfficial', place.officialUrl);
    link.hash = 'places';
    return link.href;
  }

  function shareTextFor(place) {
    var lines = ['📍 ' + place.name];
    if (place.category) lines.push(place.category);
    if (place.description) lines.push(place.description);
    if (place.ratingsUrl) lines.push('⭐ ציונים וביקורות: ' + place.ratingsUrl);
    if (place.officialUrl) lines.push('🌐 אתר רשמי: ' + place.officialUrl);
    lines.push('🧭 פתיחה וניווט ב־TravelMate: ' + appLinkFor(place));
    return lines.join('\n');
  }

  function buildShareModal() {
    var section = document.createElement('section');
    section.className = 'place-share-backdrop';
    section.dataset.placeShareModal = '';
    section.setAttribute('aria-hidden', 'true');
    section.innerHTML = '<div class="place-share-dialog" role="dialog" aria-modal="true" aria-labelledby="place-share-title"><header><div><small>שיתוף חכם</small><h2 id="place-share-title" data-place-share-title>שיתוף מקום</h2></div><button type="button" data-place-share-close aria-label="סגירה"><i class="fa-solid fa-xmark"></i></button></header><p data-place-share-summary></p><div class="place-share-actions"><button type="button" class="whatsapp" data-place-share-whatsapp><i class="fa-brands fa-whatsapp"></i><span><strong>שליחה ב־WhatsApp</strong><small>כולל פרטים וקישור חזרה לאפליקציה</small></span></button><button type="button" data-place-share-native><i class="fa-solid fa-share-nodes"></i><span><strong>שיתוף במכשיר</strong><small>הודעות, דוא״ל ואפליקציות נוספות</small></span></button><button type="button" data-place-share-copy><i class="fa-solid fa-link"></i><span><strong>העתקת קישור</strong><small>קישור חכם למקום ולניווט</small></span></button></div><p class="place-share-status" data-place-share-status role="status"></p></div>';
    document.body.appendChild(section);
    section.addEventListener('click', function (event) {
      if (event.target === section || event.target.closest('[data-place-share-close]')) closeShareModal();
      if (event.target.closest('[data-place-share-whatsapp]')) shareToWhatsApp(sharePlace);
      if (event.target.closest('[data-place-share-native]')) nativeShare(sharePlace);
      if (event.target.closest('[data-place-share-copy]')) copyShareLink(sharePlace);
    });
    return section;
  }

  function openShareModal(place) {
    sharePlace = cleanPlace(place);
    if (!shareModal) shareModal = buildShareModal();
    shareModal.querySelector('[data-place-share-title]').textContent = 'שיתוף ' + sharePlace.name;
    shareModal.querySelector('[data-place-share-summary]').textContent = sharePlace.description || 'הפרטים והיעד יצורפו אוטומטית לקישור.';
    shareModal.querySelector('[data-place-share-status]').textContent = '';
    shareModal.classList.add('open');
    shareModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('place-share-open');
    shareModal.querySelector('[data-place-share-close]').focus();
  }

  function closeShareModal() {
    if (!shareModal) return;
    shareModal.classList.remove('open');
    shareModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('place-share-open');
    sharePlace = null;
  }

  function shareToWhatsApp(place) {
    if (!place) return;
    window.open('https://wa.me/?text=' + encodeURIComponent(shareTextFor(cleanPlace(place))), '_blank', 'noopener');
  }

  async function nativeShare(place) {
    if (!place) return;
    place = cleanPlace(place);
    if (navigator.share) {
      try {
        await navigator.share({ title: place.name + ' · TravelMate', text: shareTextFor(place), url: appLinkFor(place) });
        return;
      } catch (error) { if (error && error.name === 'AbortError') return; }
    }
    shareToWhatsApp(place);
  }

  async function copyShareLink(place) {
    if (!place) return;
    var link = appLinkFor(cleanPlace(place));
    try { await navigator.clipboard.writeText(link); }
    catch (error) {
      var input = document.createElement('textarea');
      input.value = link;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      input.remove();
    }
    if (shareModal) shareModal.querySelector('[data-place-share-status]').textContent = 'הקישור הועתק.';
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
    currentPlace = cleanPlace(place);
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
    var place = placeFromCard(card);
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'place-directions-button';
    button.innerHTML = '<i class="fa-solid fa-route"></i> איך מגיעים?';
    button.addEventListener('click', function () {
      openModal(placeFromCard(card));
    });
    var shareButton = document.createElement('button');
    shareButton.type = 'button';
    shareButton.className = 'place-share-button';
    shareButton.innerHTML = '<i class="fa-brands fa-whatsapp"></i> שיתוף מקום';
    shareButton.addEventListener('click', function () { openShareModal(placeFromCard(card)); });
    links.prepend(button);
    links.insertBefore(shareButton, button.nextSibling);
    card.dataset.directionsReady = '1';
  }

  function enhanceResults(root) {
    (root || document).querySelectorAll('.nearby-result, .places-grid .place-card, .saved-place').forEach(enhanceCard);
  }

  function sharedPlaceFromUrl() {
    var params = new URLSearchParams(location.search);
    if (params.get('sharedPlace') !== '1' || !params.get('placeName')) return null;
    return cleanPlace({
      name: params.get('placeName'),
      category: params.get('placeCategory'),
      description: params.get('placeInfo'),
      lat: params.get('placeLat'),
      lon: params.get('placeLon'),
      ratingsUrl: params.get('placeRatings'),
      officialUrl: params.get('placeOfficial')
    });
  }

  function showSharedPlaceCard() {
    var place = sharedPlaceFromUrl();
    var section = document.getElementById('places');
    if (!place || !section || section.querySelector('[data-shared-place-card]')) return;
    var card = document.createElement('article');
    card.className = 'shared-place-card';
    card.dataset.sharedPlaceCard = '';
    card.innerHTML = '<span class="shared-place-icon"><i class="fa-solid fa-location-dot"></i></span><div><small>מקום ששיתפו איתך</small><h2>' + escapeHtml(place.name) + '</h2>' + (place.description ? '<p>' + escapeHtml(place.description) + '</p>' : '') + '</div><div class="shared-place-actions"><button type="button" data-shared-place-navigate><i class="fa-solid fa-route"></i> ניווט</button><button type="button" data-shared-place-share><i class="fa-solid fa-share-nodes"></i> שיתוף</button></div>';
    card.addEventListener('click', function (event) {
      if (event.target.closest('[data-shared-place-navigate]')) openModal(place);
      if (event.target.closest('[data-shared-place-share]')) openShareModal(place);
    });
    var heading = section.querySelector('.section-head');
    if (heading) heading.insertAdjacentElement('afterend', card);
    else section.prepend(card);
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

  window.TravelMatePlaceActions = {
    navigate: function (place) { openModal(cleanPlace(place)); },
    share: function (place) { openShareModal(cleanPlace(place)); },
    whatsApp: function (place) { shareToWhatsApp(cleanPlace(place)); },
    appLink: function (place) { return appLinkFor(cleanPlace(place)); },
    clean: cleanPlace
  };
  document.addEventListener('travelmate:navigate-place', function (event) { openModal(cleanPlace(event.detail)); });
  document.addEventListener('travelmate:share-place', function (event) { openShareModal(cleanPlace(event.detail)); });

  enhanceResults(document);
  showSharedPlaceCard();
  new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      mutation.addedNodes.forEach(function (node) { if (node.nodeType === 1) enhanceResults(node.matches && node.matches('.nearby-result, .saved-place') ? node.parentNode : node); });
    });
  }).observe(document.body, { childList: true, subtree: true });
})();

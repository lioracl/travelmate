(function () {
  'use strict';

  var closeAppButton = document.querySelector('[data-close-app]');
  if (closeAppButton) closeAppButton.addEventListener('click', function () {
    closeAppButton.disabled = true;
    closeAppButton.innerHTML = '<i class="fa-solid fa-power-off"></i> סוגר…';
    try {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App && window.Capacitor.Plugins.App.exitApp) {
        window.Capacitor.Plugins.App.exitApp();
        return;
      }
      if (navigator.app && navigator.app.exitApp) {
        navigator.app.exitApp();
        return;
      }
      window.close();
    } catch (error) {}
    setTimeout(function () {
      if (document.hidden) return;
      closeAppButton.disabled = false;
      closeAppButton.innerHTML = '<i class="fa-solid fa-mobile-screen-button"></i> סגור ממסך היישומים';
      closeAppButton.title = 'בדפדפן רגיל מערכת ההפעלה אינה מאפשרת לאתר לסגור את החלון בעצמו';
    }, 450);
  });

  var form = document.querySelector('[data-destination-form]');
  var list = document.querySelector('[data-trip-list]');
  var addButton = list && list.querySelector('.add-destination');
  var cloud = window.TravelMateCloud;
  var destinationWizard = null;
  var currentSession = null;
  var sessionGeneration = 0;
  var authSubscriptionPending = false;
  var authSubscribed = false;
  var passwordChangeMode = false;
  var renderedTrips = new Map();
  // List presentation only: canonical storage, account hydration and dates retain their owners.
  var tripBrowser = document.querySelector('[data-home-trip-browser]');
  var tripSearch = document.querySelector('[data-home-trip-search]');
  var homeFilter = 'active';
  var homeSyncState = 'loading';
  function paintHomeState(state) {
    if (state) homeSyncState = state;
    if (!tripBrowser) return;
    var offline = navigator.onLine === false;
    var text = offline ? 'ללא רשת · מוצגים הטיולים השמורים במכשיר' : homeSyncState === 'loading' ? 'טוען ומסנכרן את הטיולים…' : homeSyncState === 'error' ? 'הסנכרון לא הושלם · הטיולים השמורים עדיין זמינים' : '';
    tripBrowser.querySelector('[data-home-trip-state]').textContent = text;
    tripBrowser.querySelector('[data-home-trip-retry]').hidden = offline || homeSyncState !== 'error' || !currentSession;
    if (list) list.setAttribute('aria-busy', String(!offline && homeSyncState === 'loading'));
  }
  function filterHomeTrips() {
    if (!tripBrowser || !list) return;
    var query = String(tripSearch.value || '').normalize('NFKC').trim().toLocaleLowerCase('he');
    var visible = 0;
    document.querySelectorAll('.trip-card-shell').forEach(function (shell) {
      var matches = !query || shell.querySelector('.trip-copy').textContent.normalize('NFKC').toLocaleLowerCase('he').includes(query);
      shell.hidden = !matches;
      if (matches && (shell.parentElement === list) === (homeFilter === 'active')) visible += 1;
    });
    tripBrowser.querySelector('[data-home-trip-results]').textContent = query ? (visible ? 'נמצאו ' + visible + ' טיולים' : 'לא נמצאו טיולים. אפשר לנסות יעד או מדינה אחרים.') : !visible && homeFilter === 'active' && homeSyncState !== 'loading' ? 'אין טיולים פעילים כרגע. אפשר ליצור טיול חדש או לעיין בארכיון.' : '';
  }
  function selectHomeFilter(value) {
    if (!tripBrowser || !list) return;
    homeFilter = value;
    var archive = ensureArchive();
    list.hidden = value === 'archive';
    var heading = document.querySelector('.trip-area-head');
    if (heading) heading.hidden = value === 'archive';
    archive.querySelector('[data-archive-list]').hidden = value !== 'archive';
    archive.querySelector('[data-archive-toggle]').setAttribute('aria-expanded', String(value === 'archive'));
    tripBrowser.querySelectorAll('[data-home-filter]').forEach(function (button) { button.setAttribute('aria-pressed', String(button.dataset.homeFilter === value)); });
    filterHomeTrips();
  }
  if (tripBrowser) {
    tripSearch.addEventListener('input', filterHomeTrips);
    tripBrowser.querySelectorAll('[data-home-filter]').forEach(function (button) { button.addEventListener('click', function () { selectHomeFilter(button.dataset.homeFilter); }); });
    tripBrowser.querySelector('[data-home-trip-retry]').addEventListener('click', synchronize);
    window.addEventListener('offline', function () { paintHomeState(); });
  }
  var staticActivityKey = 'travelmate-static-trip-activity';
  var pendingShortcut = new URLSearchParams(location.search).get('shortcut') || '';
  var destinationImageObserver = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      destinationImageObserver.unobserve(entry.target);
      applyDestinationCardImage(entry.target);
    });
  }, { rootMargin: '240px 0px' }) : null;

  function applyDestinationCardImage(card) {
    if (!card || card.dataset.destinationImageRequested === 'true') return;
    var images = window.TravelMateDestinationImages;
    if (!images) return;
    card.dataset.destinationImageRequested = 'true';
    images.apply(card, card.dataset.destinationCity || '', card.dataset.destinationCountry || '');
  }

  function queueDestinationCardImage(shell, trip) {
    var card = shell && shell.querySelector('.trip-card');
    if (!card || !window.TravelMateDestinationImages) return;
    card.dataset.destinationCity = trip.city || '';
    card.dataset.destinationCountry = trip.country || '';
    if (destinationImageObserver) destinationImageObserver.observe(card);
    else applyDestinationCardImage(card);
  }

  (function initHomeHeaderUtilities() {
    if (document.body.dataset.design === 'v3') return; // App Shell owns the utility dialog.
    var sidebar = document.querySelector('.home-sidebar');
    var menu = sidebar && sidebar.querySelector('[data-home-more-menu]');
    var toggle = sidebar && sidebar.querySelector('[data-home-more-toggle]');
    var navigation = sidebar && sidebar.querySelector('nav');
    var archive = navigation && navigation.querySelector('.home-archive-action');
    var mobileHeader = window.matchMedia('(max-width:600px)');
    if (!sidebar || !menu || !toggle) return;

    function syncArchivePlacement() {
      if (!archive || !navigation) return;
      if (mobileHeader.matches) {
        var aboutAction = menu.querySelector('[data-about-open]');
        menu.insertBefore(archive, aboutAction || menu.querySelector('.trip-logout'));
      } else {
        navigation.insertBefore(archive, toggle);
      }
    }

    function collectInjectedUtilities() {
      sidebar.querySelectorAll(':scope > .security-center-launcher, :scope > .admin-center-launcher, :scope > .trip-logout').forEach(function (action) {
        menu.appendChild(action);
      });
      var utilityOrder = [
        '[data-cloud-account-open]',
        '.admin-center-launcher',
        '.security-center-launcher',
        '.home-archive-action',
        '[data-about-open]',
        '.trip-logout'
      ];
      utilityOrder.forEach(function (selector) {
        var action = menu.querySelector(selector);
        if (action) menu.appendChild(action);
      });
    }

    function closeMenu() {
      menu.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    }

    toggle.addEventListener('click', function () {
      var opening = !menu.classList.contains('is-open');
      menu.classList.toggle('is-open', opening);
      toggle.setAttribute('aria-expanded', String(opening));
    });
    menu.addEventListener('click', function (event) {
      if (event.target.closest('button, a')) closeMenu();
    });
    document.addEventListener('click', function (event) {
      if (!sidebar.contains(event.target)) closeMenu();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' || !menu.classList.contains('is-open')) return;
      closeMenu();
      toggle.focus();
    });
    mobileHeader.addEventListener('change', function () {
      syncArchivePlacement();
      closeMenu();
    });

    syncArchivePlacement();
    collectInjectedUtilities();
    new MutationObserver(collectInjectedUtilities).observe(sidebar, { childList: true });
  })();

  function handlePwaShortcut(trips) {
    if (!pendingShortcut) return;
    var shortcut = pendingShortcut;
    pendingShortcut = '';
    history.replaceState(null, '', location.pathname + location.hash);
    if (shortcut === 'new') {
      var newTripButton = document.querySelector('[data-modal="destination"]');
      if (newTripButton) newTripButton.click();
      return;
    }
    var available = Array.isArray(trips) ? trips.slice() : [];
    var now = localDateString();
    var trip = available.find(function (item) { return item.start <= now && item.end >= now; }) ||
      available.find(function (item) { return item.end >= now; }) || available[0];
    if (!trip) return setMessage('כדי להשתמש בקיצור יש ליצור או לסנכרן טיול תחילה.', true);
    var views = { today: 'plan', places: 'places', documents: 'documents' };
    var view = views[shortcut] || 'overview';
    location.href = 'trip/custom/index.html?id=' + encodeURIComponent(trip.id) + '&view=' + view + '#' + view;
  }

  (function initHomeCarousel() {
    var carousel = document.querySelector('[data-home-carousel]');
    if (!carousel) return;
    var track = carousel.querySelector('.carousel-track');
    var extraDestinationImages = [
      'photo-1502602898657-3e91760cbb34','photo-1493976040374-85c8e12f0c0e','photo-1533104816931-20fa691ff6ca','photo-1516483638261-f4dbaf036963',
      'photo-1505765050516-f72dcac9c60e','photo-1528127269322-539801943592','photo-1548013146-72479768bada','photo-1469474968028-56623f02e42e',
      'photo-1507525428034-b723cf961d3e','photo-1510414842594-a61c69b5ae57','photo-1483683804023-6ccdb62f86ef','photo-1494526585095-c41746248156',
      'photo-1512100356356-de1b84283e18','photo-1530789253388-582c481c54b0','photo-1500534314209-a25ddb2bd429','photo-1518548419970-58e3b4079ab2',
      'photo-1516426122078-c23e76319801','photo-1501785888041-af3ef285b470','photo-1526772662000-3f88f10405ff'
    ];
    extraDestinationImages.forEach(function (imageId) {
      var slide = document.createElement('article');
      slide.className = 'destination-slide';
      slide.dataset.carouselSlide = '';
      slide.dataset.slideImage = "url('https://images.unsplash.com/" + imageId + "?auto=format&fit=crop&w=900&q=84')";
      track.appendChild(slide);
    });
    var slides = Array.from(carousel.querySelectorAll('[data-carousel-slide]'));
    var dotsHost = carousel.querySelector('[data-carousel-dots]');
    var activeIndex = Math.max(0, slides.findIndex(function (slide) { return slide.classList.contains('active'); }));
    var timer;
    slides.forEach(function (_, index) {
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.setAttribute('aria-label', 'הצגת יעד ' + (index + 1));
      dot.addEventListener('click', function () { showSlide(index); restart(); });
      dotsHost.appendChild(dot);
    });
    function ensureSlideImage(slide) {
      if (!slide.dataset.slideImage || slide.dataset.slideImageLoaded === 'true') return;
      slide.style.setProperty('--slide-image', slide.dataset.slideImage);
      slide.dataset.slideImageLoaded = 'true';
    }
    function showSlide(index) {
      activeIndex = (index + slides.length) % slides.length;
      slides.forEach(function (slide, slideIndex) {
        var offset = slideIndex - activeIndex;
        if (offset > slides.length / 2) offset -= slides.length;
        if (offset < -slides.length / 2) offset += slides.length;
        var distance = Math.abs(offset);
        if (distance <= 1) ensureSlideImage(slide);
        slide.style.setProperty('--slide-offset', offset);
        slide.style.setProperty('--slide-x', (offset * 118) + 'px');
        slide.style.setProperty('--slide-scale', slideIndex === activeIndex ? '1.12' : String(Math.max(.72, 1 - distance * .08)));
        slide.style.setProperty('--slide-rotate', (offset * -1.4) + 'deg');
        slide.style.zIndex = String(50 - distance);
        slide.style.opacity = distance > 4 ? '0' : String(Math.max(.38, 1 - distance * .13));
        slide.style.visibility = distance > 4 ? 'hidden' : 'visible';
        slide.classList.toggle('active', slideIndex === activeIndex);
        slide.setAttribute('aria-hidden', slideIndex === activeIndex ? 'false' : 'true');
      });
      Array.from(dotsHost.children).forEach(function (dot, dotIndex) {
        dot.classList.toggle('active', dotIndex === activeIndex);
      });
    }
    function restart() {
      clearInterval(timer);
      timer = null;
      if (document.hidden || document.body.classList.contains('is-authenticated')) return;
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        timer = setInterval(function () { showSlide(activeIndex + 1); }, 3800);
      }
    }
    var previousButton = carousel.querySelector('[data-carousel-previous]');
    var nextButton = carousel.querySelector('[data-carousel-next]');
    if (previousButton) previousButton.addEventListener('click', function () { showSlide(activeIndex - 1); restart(); });
    if (nextButton) nextButton.addEventListener('click', function () { showSlide(activeIndex + 1); restart(); });
    window.addEventListener('travelmate:home-auth', function (event) {
      if (event.detail && event.detail.authenticated) {
        clearInterval(timer);
        timer = null;
      } else restart();
    });
    document.addEventListener('visibilitychange', restart);
    showSlide(activeIndex);
    restart();
  })();

  function daysBetween(start, end) { return Math.floor((new Date(end) - new Date(start)) / 86400000) + 1; }
  function formatDate(value) { return new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value + 'T12:00:00')); }
  function escapeText(value) { return String(value || '').replace(/[&<>"']/g, function (character) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]; }); }

  function countryFlag(country) {
    var normalized = String(country || '').trim().toLowerCase().replace(/[׳״'".]/g, '');
    var aliases = {
      'יפן': 'JP', 'japan': 'JP', 'איטליה': 'IT', 'italy': 'IT', 'צכיה': 'CZ', 'צכית': 'CZ', 'czechia': 'CZ', 'czech republic': 'CZ',
      'גרמניה': 'DE', 'germany': 'DE', 'צרפת': 'FR', 'france': 'FR', 'ספרד': 'ES', 'spain': 'ES', 'פורטוגל': 'PT', 'portugal': 'PT',
      'יוון': 'GR', 'greece': 'GR', 'בריטניה': 'GB', 'אנגליה': 'GB', 'united kingdom': 'GB', 'uk': 'GB', 'ארצות הברית': 'US', 'ארהב': 'US', 'usa': 'US', 'united states': 'US',
      'קנדה': 'CA', 'canada': 'CA', 'הולנד': 'NL', 'netherlands': 'NL', 'בלגיה': 'BE', 'belgium': 'BE', 'אוסטריה': 'AT', 'austria': 'AT',
      'שווייץ': 'CH', 'שוויץ': 'CH', 'switzerland': 'CH', 'פולין': 'PL', 'poland': 'PL', 'הונגריה': 'HU', 'hungary': 'HU', 'קרואטיה': 'HR', 'croatia': 'HR',
      'תאילנד': 'TH', 'thailand': 'TH', 'וייטנאם': 'VN', 'vietnam': 'VN', 'הודו': 'IN', 'india': 'IN', 'סין': 'CN', 'china': 'CN', 'דרום קוריאה': 'KR', 'south korea': 'KR',
      'טורקיה': 'TR', 'turkey': 'TR', 'קפריסין': 'CY', 'cyprus': 'CY', 'גאורגיה': 'GE', 'georgia': 'GE', 'ישראל': 'IL', 'israel': 'IL',
      'מקסיקו': 'MX', 'mexico': 'MX', 'ברזיל': 'BR', 'brazil': 'BR', 'ארגנטינה': 'AR', 'argentina': 'AR', 'אוסטרליה': 'AU', 'australia': 'AU', 'ניו זילנד': 'NZ', 'new zealand': 'NZ'
    };
    var code = /^[a-z]{2}$/i.test(normalized) ? normalized.toUpperCase() : aliases[normalized];
    return code ? String.fromCodePoint.apply(String, code.split('').map(function (letter) { return 127397 + letter.charCodeAt(0); })) : '🌍';
  }
  function todayValue() { var now = new Date(); return new Date(now.getFullYear(), now.getMonth(), now.getDate()); }
  function localDateString(value) { var date = value || new Date(); return String(date.getFullYear()) + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0'); }
  function dateState(trip) {
    var today = todayValue();
    var start = trip.start ? new Date(trip.start + 'T00:00:00') : null;
    var end = trip.end ? new Date(trip.end + 'T23:59:59') : null;
    var activationDate = start ? new Date(start.getTime() - 7 * 86400000) : null;
    if (trip.isActive === false) return { active: false, label: 'לא פעיל', icon: 'fa-pause' };
    if (trip.isActive === true) return { active: true, label: 'פעיל ידנית', icon: 'fa-circle-check' };
    if (activationDate && today < activationDate) return { active: false, label: 'ממתין לתאריך', icon: 'fa-clock' };
    if (start && today < start) return { active: true, label: 'מתחיל בתוך שבוע', icon: 'fa-hourglass-half' };
    if (end && today > end) return { active: false, label: 'הטיול הסתיים', icon: 'fa-box-archive' };
    return { active: true, label: 'מתרחש עכשיו', icon: 'fa-location-dot', now: true };
  }
  function readStaticActivity() { try { return JSON.parse(localStorage.getItem(staticActivityKey) || '{}'); } catch (error) { return {}; } }
  function writeStaticActivity(value) { localStorage.setItem(staticActivityKey, JSON.stringify(value)); }

  function ensureArchive() {
    var archive = document.querySelector('[data-trip-archive]');
    if (archive || !list) return archive;
    var heading = document.createElement('div');
    heading.className = 'trip-area-head';
    heading.innerHTML = '<h2>טיולים פעילים</h2><span data-active-count>0</span>';
    list.insertAdjacentElement('beforebegin', heading);
    archive = document.createElement('section');
    archive.className = 'trip-archive';
    archive.id = 'trip-archive';
    archive.dataset.tripArchive = '';
    archive.innerHTML = '<button class="trip-archive-toggle" type="button" data-archive-toggle aria-expanded="false" aria-controls="trip-archive-list"><i class="fa-solid fa-box-archive" aria-hidden="true"></i><span><strong>ארכיון הטיולים</strong><small>כולל טיולים שהסתיימו וטיולים שטרם הופעלו</small></span><b data-archive-count>0</b><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button><div id="trip-archive-list" class="modules trip-archive-list" data-archive-list hidden></div>';
    list.insertAdjacentElement('afterend', archive);
    archive.querySelector('[data-archive-toggle]').addEventListener('click', function (event) {
      var expanded = event.currentTarget.getAttribute('aria-expanded') === 'true';
      event.currentTarget.setAttribute('aria-expanded', String(!expanded));
      archive.querySelector('[data-archive-list]').hidden = expanded;
      if (expanded && homeFilter === 'archive') selectHomeFilter('active');
    });
    return archive;
  }

  function openArchiveFromNavigation(event) {
    if (event) event.preventDefault();
    var archive = ensureArchive();
    if (!archive) return;
    var toggle = archive.querySelector('[data-archive-toggle]');
    var archiveList = archive.querySelector('[data-archive-list]');
    toggle.setAttribute('aria-expanded', 'true');
    archiveList.hidden = false;
    if (tripBrowser) selectHomeFilter('archive');
    archive.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // R06 card composition only: reuse canonical metadata and action nodes.
  function composeTripCard(shell, trip) {
    var link = shell.querySelector('.trip-card');
    var copy = shell.querySelector('.trip-copy');
    var openLabel = copy.querySelector('strong');
    var photo = document.createElement('span');
    photo.className = 'trip-card-photo';
    photo.setAttribute('aria-hidden', 'true');
    link.insertBefore(photo, link.firstChild);

    function metadataIcon(name) {
      var icon = document.createElement('i');
      icon.className = 'fa-solid ' + name;
      icon.setAttribute('aria-hidden', 'true');
      return icon;
    }
    var date = copy.querySelector('.trip-date-range');
    var days = copy.querySelectorAll('.tag')[1];
    if (trip.start && trip.end) {
      var calendar = document.createElement('span');
      calendar.className = 'trip-calendar';
      copy.insertBefore(calendar, date);
      calendar.appendChild(metadataIcon('fa-calendar-days'));
      calendar.appendChild(date);
    } else {
      date.remove();
    }
    var metrics = document.createElement('span');
    metrics.className = 'trip-card-metrics';
    if (trip.days !== '' && Number.isFinite(Number(trip.days)) && Number(trip.days) > 0) {
      days.classList.add('trip-day-count');
      days.insertBefore(metadataIcon('fa-sun'), days.firstChild);
      metrics.appendChild(days);
    } else {
      days.remove();
    }
    var places = copy.querySelector('.trip-place-count');
    if (places) {
      places.insertBefore(metadataIcon('fa-location-dot'), places.firstChild);
      metrics.appendChild(places);
    }
    if (metrics.childElementCount) copy.insertBefore(metrics, openLabel);
  }

  function cardShell(trip, isStatic, href, background) {
    var state = dateState(trip);
    var shell = document.createElement('article');
    shell.className = 'trip-card-shell' + (isStatic ? ' static-trip-card' : ' cloud-trip-card');
    shell.dataset.tripId = String(trip.id);
    shell.dataset.tripKind = isStatic ? 'static' : 'cloud';
    shell.dataset.start = trip.start || '';
    shell.dataset.end = trip.end || '';
    shell.dataset.days = trip.days || '';
    if (!isStatic) shell.dataset.cloudTrip = String(trip.id);
    shell.innerHTML = '<a class="trip-card" href="' + escapeText(href) + '" style="background-image:url(\'' + escapeText(background) + '\')"><span class="trip-overlay"></span><span class="trip-flag trip-country-flag" aria-label="דגל ' + escapeText(trip.country) + '">' + countryFlag(trip.country) + '</span><span class="trip-copy"><span class="trip-date-state' + (state.now ? ' now' : '') + '"><i class="fa-solid ' + state.icon + '" aria-hidden="true"></i> ' + escapeText(state.label) + '</span><h2>' + escapeText(trip.country) + '</h2><p><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ' + escapeText(trip.city) + '</p><span class="tag">' + (trip.start ? formatDate(trip.start) + ' – ' + formatDate(trip.end) : '') + '</span> <span class="tag">' + escapeText(trip.days) + ' ימים</span><strong>פתיחת הטיול <i class="fa-solid fa-arrow-left" aria-hidden="true"></i></strong></span></a><div class="trip-card-action-rail">' + (!isStatic ? '<button class="trip-edit-dates" type="button" data-trip-edit-dates aria-label="עריכת תאריכי הטיול"><i class="fa-solid fa-calendar-days" aria-hidden="true"></i><span>תאריכים</span></button><button class="trip-delete" type="button" data-trip-delete aria-label="מחיקת הטיול"><i class="fa-solid fa-trash" aria-hidden="true"></i><span>מחיקה</span></button>' : '') + '<button class="trip-activity-toggle' + (state.active ? ' active' : '') + '" type="button" data-trip-activity aria-pressed="' + String(state.active) + '"><i class="fa-solid ' + (state.active ? 'fa-circle-check' : 'fa-circle') + '" aria-hidden="true"></i><span>' + escapeText(state.active ? 'פעיל' : state.label) + '</span></button></div>';
    // Isolate the endpoints so Hebrew labels cannot reverse the date range.
    var dateTag = shell.querySelector('.tag');
    dateTag.classList.add('trip-date-range');
    dateTag.replaceChildren();
    if (trip.start && trip.end) {
      dateTag.setAttribute('aria-label', 'מ־' + formatDate(trip.start) + ' עד ' + formatDate(trip.end));
      [trip.start, trip.end].forEach(function (value, index) {
        if (index) dateTag.appendChild(document.createTextNode(' – '));
        var endpoint = document.createElement('bdi');
        endpoint.textContent = formatDate(value);
        dateTag.appendChild(endpoint);
      });
    }
    if (Array.isArray(trip.savedPlaces)) {
      var places = document.createElement('span');
      places.className = 'tag trip-place-count';
      places.textContent = trip.savedPlaces.length === 1 ? 'מקום שמור אחד' : trip.savedPlaces.length + ' מקומות שמורים';
      shell.querySelector('.trip-copy').insertBefore(places, shell.querySelector('.trip-copy>strong'));
    }
    if (document.body.dataset.design === 'v3') composeTripCard(shell, trip);
    return shell;
  }

  function tripCard(trip) {
    var images = window.TravelMateDestinationImages;
    var background = images && images.cached(trip.city, trip.country) || images && images.fallback || 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=1200&q=80';
    return cardShell(trip, false, 'trip/custom/index.html?id=' + encodeURIComponent(trip.id), background);
  }

  function tripIdentity(trip) {
    function clean(value) { return String(value || '').trim().toLowerCase().replace(/\s+/g, ' '); }
    return [clean(trip.country), clean(trip.city), clean(trip.start), clean(trip.end)].join('|');
  }

  function removeShadowedStaticTrips(trips) {
    var cloudIds = new Set(trips.map(function (trip) { return String(trip.id); }));
    var cloudIdentities = new Set(trips.map(tripIdentity));
    document.querySelectorAll('[data-trip-kind="static"]').forEach(function (shell) {
      var staticTrip = staticTripFromShell(shell);
      if (cloudIds.has(String(staticTrip.id)) || cloudIdentities.has(tripIdentity(staticTrip))) shell.remove();
    });
  }

  function renderTrips(trips) {
    if (!list) return;
    document.querySelectorAll('[data-cloud-trip]').forEach(function (node) {
      var card = node.querySelector('.trip-card');
      if (destinationImageObserver && card) destinationImageObserver.unobserve(card);
      node.remove();
    });
    var archiveList = ensureArchive().querySelector('[data-archive-list]');
    renderedTrips = new Map(trips.map(function (trip) { return [String(trip.id), trip]; }));
    var canonicalTrips = Array.from(renderedTrips.values());
    removeShadowedStaticTrips(canonicalTrips);
    canonicalTrips.forEach(function (trip) {
      var active = dateState(trip).active;
      var shell = tripCard(trip);
      (active ? list : archiveList).insertBefore(shell, active ? addButton : null);
      queueDestinationCardImage(shell, trip);
    });
    updateCounts();
    filterHomeTrips();
    renderAdaptiveHome(canonicalTrips);
    if (window.TravelMateAppShell) window.TravelMateAppShell.syncHomeRoute();
    handlePwaShortcut(canonicalTrips);
  }

  function prepareStaticTrips() {
    if (!list) return;
    var activity = readStaticActivity();
    [].slice.call(list.querySelectorAll('a.trip-card')).forEach(function (link, index) {
      if (link.closest('.trip-card-shell')) return;
      var id = link.dataset.staticId || 'featured-' + index;
      var trip = {
        id: id,
        country: link.dataset.country || link.querySelector('h2').textContent.trim(),
        city: link.querySelector('p').textContent.trim(),
        start: link.dataset.start || '', end: link.dataset.end || '', days: link.dataset.days || '',
        isActive: Object.prototype.hasOwnProperty.call(activity, id) ? activity[id] : undefined
      };
      var background = (link.style.backgroundImage.match(/url\(["']?(.*?)["']?\)/) || [])[1] || '';
      link.replaceWith(cardShell(trip, true, link.getAttribute('href'), background.replace(/&amp;/g, '&')));
    });
  }

  function staticTripFromShell(shell, activeValue) {
    var link = shell.querySelector('.trip-card');
    return {
      id: shell.dataset.tripId,
      country: link.querySelector('h2').textContent.trim(), city: link.querySelector('p').textContent.trim(),
      start: shell.dataset.start || '', end: shell.dataset.end || '', days: shell.dataset.days || '', isActive: activeValue
    };
  }

  function organizeStaticTrips() {
    if (!list) return;
    var archiveList = ensureArchive().querySelector('[data-archive-list]');
    var activity = readStaticActivity();
    [].slice.call(document.querySelectorAll('[data-trip-kind="static"]')).forEach(function (shell) {
      var id = shell.dataset.tripId;
      var activeValue = Object.prototype.hasOwnProperty.call(activity, id) ? activity[id] : undefined;
      var active = dateState(staticTripFromShell(shell, activeValue)).active;
      (active ? list : archiveList).insertBefore(shell, active ? addButton : null);
    });
    updateCounts();
  }

  function updateCounts() {
    if (!list) return;
    var archive = ensureArchive();
    var archiveList = archive.querySelector('[data-archive-list]');
    var activeCount = list.querySelectorAll(':scope > .trip-card-shell').length;
    var archiveCount = archiveList.querySelectorAll(':scope > .trip-card-shell').length;
    document.querySelector('[data-active-count]').textContent = String(activeCount);
    archive.querySelector('[data-archive-count]').textContent = String(archiveCount);
    var empty = archiveList.querySelector('.trip-archive-empty');
    if (!archiveCount && !empty) {
      empty = document.createElement('div'); empty.className = 'trip-archive-empty'; empty.textContent = 'הארכיון ריק כרגע.'; archiveList.appendChild(empty);
    }
    if (archiveCount && empty) empty.remove();
    if (tripBrowser) {
      tripBrowser.querySelector('[data-home-active-count]').textContent = '(' + activeCount + ')';
      tripBrowser.querySelector('[data-home-archive-count]').textContent = '(' + archiveCount + ')';
      filterHomeTrips();
    }
  }

  function editTripDates(trip, opener) {
    var backdrop = document.createElement('section');
    backdrop.className = 'trip-date-editor-backdrop';
    backdrop.innerHTML = '<form class="trip-date-editor" role="dialog" aria-modal="true" aria-labelledby="trip-date-editor-title"><button class="trip-date-editor-close" type="button" aria-label="סגירה"><i class="fa-solid fa-xmark"></i></button><div><small>עדכון הטיול</small><h2 id="trip-date-editor-title">עריכת תאריכים</h2><p>' + escapeText(trip.city) + ', ' + escapeText(trip.country) + '</p></div><label><span>תאריך יציאה</span><input type="date" name="start" value="' + escapeText(trip.start) + '" required></label><label><span>תאריך חזרה</span><input type="date" name="end" value="' + escapeText(trip.end) + '" required></label><p class="trip-date-editor-error" role="alert"></p><button class="trip-date-editor-save" type="submit"><i class="fa-solid fa-calendar-check"></i> שמירת התאריכים</button></form>';
    document.body.appendChild(backdrop);
    document.body.classList.add('trip-date-editor-open');
    var editor = backdrop.querySelector('.trip-date-editor');
    function close() {
      document.body.classList.remove('trip-date-editor-open');
      backdrop.remove();
      if (opener && document.contains(opener)) opener.focus();
    }
    editor.querySelector('.trip-date-editor-close').addEventListener('click', close);
    backdrop.addEventListener('click', close);
    editor.addEventListener('click', function (event) { event.stopPropagation(); });
    editor.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key !== 'Tab') return;
      var focusable = [].slice.call(editor.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(function (node) { return node.offsetParent !== null; });
      if (!focusable.length) return;
      var first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    editor.addEventListener('submit', async function (event) {
      event.preventDefault();
      var start = editor.elements.start.value;
      var end = editor.elements.end.value;
      var days = daysBetween(start, end);
      var error = editor.querySelector('.trip-date-editor-error');
      if (days < 1) { error.textContent = 'תאריך החזרה חייב להיות אחרי תאריך היציאה.'; return; }
      if (days > 60) { error.textContent = 'אפשר להגדיר טיול של עד 60 ימים.'; return; }
      trip.start = start;
      trip.end = end;
      trip.days = days;
      cloud.upsertLocalTrip(trip);
      renderTrips(Array.from(renderedTrips.values()));
      close();
      if (currentSession) {
        try { await cloud.saveTrip(trip); }
        catch (saveError) { console.error('Trip dates sync failed', saveError); }
      }
    });
    editor.elements.start.focus();
  }

  document.addEventListener('click', async function (event) {
    var deleteButton = event.target.closest('[data-trip-delete]');
    if (deleteButton) {
      event.preventDefault(); event.stopPropagation();
      var deleteShell = deleteButton.closest('.trip-card-shell');
      var tripToDelete = deleteShell && renderedTrips.get(String(deleteShell.dataset.tripId));
      if (!tripToDelete || !window.confirm('למחוק את הטיול ל' + tripToDelete.city + ', ' + tripToDelete.country + '?\nהפעולה תמחק את הטיול מהחשבון ולא ניתן לבטל אותה.')) return;
      deleteButton.disabled = true;
      try {
        if (currentSession) await cloud.deleteTrip(tripToDelete);
        else cloud.removeLocalTrip(tripToDelete.id, tripToDelete.ownerId);
        renderedTrips.delete(String(tripToDelete.id));
        renderTrips(Array.from(renderedTrips.values()));
      } catch (error) {
        console.error('Trip deletion failed', error); deleteButton.disabled = false;
        window.alert('לא הצלחנו למחוק את הטיול. בדוק את החיבור ונסה שוב.');
      }
      return;
    }
    var editDates = event.target.closest('[data-trip-edit-dates]');
    if (editDates) {
      event.preventDefault();
      event.stopPropagation();
      var editShell = editDates.closest('.trip-card-shell');
      var editTrip = editShell && renderedTrips.get(String(editShell.dataset.tripId));
      if (editTrip) editTripDates(editTrip, editDates);
      return;
    }
    var button = event.target.closest('[data-trip-activity]');
    if (!button) return;
    var shell = button.closest('.trip-card-shell');
    var id = shell.dataset.tripId;
    var nextActive = button.getAttribute('aria-pressed') !== 'true';
    if (shell.dataset.tripKind === 'static') {
      var values = readStaticActivity();
      values[id] = nextActive;
      writeStaticActivity(values);
      var link = shell.querySelector('.trip-card');
      var replacement = cardShell(staticTripFromShell(shell, nextActive), true, link.getAttribute('href'), (link.style.backgroundImage.match(/url\(["']?(.*?)["']?\)/) || [, ''])[1]);
      shell.replaceWith(replacement);
      organizeStaticTrips();
      return;
    }
    var trip = renderedTrips.get(String(id));
    if (!trip) return;
    trip.isActive = nextActive;
    cloud.upsertLocalTrip(trip);
    renderTrips(Array.from(renderedTrips.values()));
    if (currentSession) {
      try { await cloud.saveTrip(trip); }
      catch (error) { console.error('Trip activity sync failed', error); }
    }
  });

  function createAccountPanel() {
    var backdrop = document.createElement('section');
    backdrop.className = 'cloud-account-backdrop';
    backdrop.dataset.cloudAccountBackdrop = '';
    backdrop.hidden = true;
    backdrop.setAttribute('aria-hidden', 'true');
    var panel = document.createElement('div');
    panel.className = 'cloud-account';
    panel.dataset.cloudAccount = '';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'cloud-account-title');
    panel.innerHTML = '<div class="cloud-account-copy"><h2 id="cloud-account-title">התחברות</h2><small data-cloud-message role="status" aria-live="polite" data-message-state="info">התחברו כדי לשמור את כל הטיולים בענן הפרטי.</small></div><form data-cloud-auth-form><label class="cloud-auth-field"><span>דואר אלקטרוני</span><span class="cloud-auth-input"><i class="fa-regular fa-envelope" aria-hidden="true"></i><input name="email" type="email" autocomplete="email" required placeholder="הזן אימייל"></span></label><label class="cloud-auth-field"><span>סיסמה</span><span class="cloud-auth-input"><i class="fa-solid fa-lock" aria-hidden="true"></i><input name="password" type="password" autocomplete="current-password" required placeholder="הזן את הסיסמה"></span></label><button class="cloud-login-submit" type="submit">להתחבר</button><div class="cloud-auth-secondary" aria-label="אפשרויות התחברות נוספות"><button type="button" class="cloud-create-account" data-cloud-signup>צריך חשבון?</button><button type="button" class="cloud-create-account" data-cloud-forgot>שכחתי סיסמה</button><button type="button" class="cloud-create-account" data-cloud-resend>לא קיבלתי מייל · שלח שוב</button></div></form><form data-cloud-password-form hidden><input name="newPassword" type="password" autocomplete="new-password" minlength="8" required placeholder="סיסמה חדשה · לפחות 8 תווים"><input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" required placeholder="אימות הסיסמה החדשה"><button type="submit"><i class="fa-solid fa-key"></i> שמירת סיסמה חדשה</button><button type="button" class="secondary" data-cloud-password-cancel>ביטול</button></form><div class="cloud-account-session" data-cloud-session hidden><span><i class="fa-solid fa-circle-check"></i> מחובר/ת בתור <strong data-cloud-email></strong></span><section class="cloud-avatar-editor" data-cloud-avatar-editor aria-labelledby="cloud-avatar-title"><span class="cloud-avatar-preview" data-cloud-avatar-preview data-user-avatar hidden aria-hidden="true"></span><div class="cloud-avatar-copy"><strong id="cloud-avatar-title">הפרופיל שלי</strong><small>תמונה והעדפות נסיעה נשמרות בחשבון הקיים. עיבוד התמונה מתבצע במכשיר; לאחר שמירה האווטר זמין דרך כתובת ציבורית.</small></div><div class="cloud-avatar-actions"><button type="button" class="secondary" data-profile-wizard-open>עריכת פרופיל</button><button type="button" class="secondary" data-cloud-avatar-remove>הסרת תמונה</button><label class="cloud-avatar-pick cloud-avatar-legacy" hidden>בחירת תמונה<input type="file" data-cloud-avatar-input accept="image/jpeg,image/png,image/webp"></label><button type="button" data-cloud-avatar-upload hidden disabled>שמירת תמונה</button></div><small class="cloud-avatar-status" data-cloud-avatar-status role="status" aria-live="polite"></small></section><form class="cloud-profile-form" data-cloud-profile-form><label class="cloud-auth-field"><span>שם תצוגה</span><span class="cloud-auth-input"><i class="fa-regular fa-user" aria-hidden="true"></i><input name="displayName" type="text" maxlength="80" autocomplete="name" placeholder="איך לפנות אליך?"></span></label><button type="submit" class="secondary" data-cloud-profile-save><i class="fa-solid fa-user-check"></i> שמירת שם</button></form><button type="button" data-cloud-sync-now><i class="fa-solid fa-arrows-rotate"></i> סנכרון עכשיו</button><button type="button" class="secondary" data-cloud-change-password><i class="fa-solid fa-key"></i> שינוי סיסמה</button><button type="button" class="secondary" data-cloud-signout>יציאה</button></div>';
    var smartProfile = panel.querySelector('[data-cloud-avatar-editor]');
    smartProfile.classList.add('cloud-smart-profile');
    smartProfile.dataset.smartProfile = '';
    smartProfile.innerHTML = '<div class="cloud-smart-profile-head"><span class="cloud-avatar-preview" data-cloud-avatar-preview data-user-avatar hidden aria-hidden="true"></span><div><small data-smart-profile-greeting></small><strong id="cloud-avatar-title" data-smart-profile-name>הפרופיל שלי</strong><span data-smart-profile-email></span></div></div><section class="cloud-declared-preferences" aria-labelledby="cloud-declared-title"><div><small>מה שסיפרת ל־TravelMate</small><h3 id="cloud-declared-title">העדפות הנסיעה המוצהרות שלך</h3></div><p data-smart-profile-completion></p><div class="cloud-preference-chips" data-smart-profile-preferences></div><p data-smart-profile-empty hidden>עדיין לא הוגדרו העדפות נסיעה.</p><p class="cloud-learning-state" data-smart-profile-learning></p></section><section class="cloud-learned-profile" data-learned-profile-host aria-label="העדפות נלמדות"><p class="cloud-learned-loading">העדפות נלמדות נטענות לאחר פתיחת החשבון.</p></section><p class="cloud-profile-privacy"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i><span>ההעדפות בשליטתך. Mate מקבל העדפות מוצהרות, ורק העדפות נלמדות שאישרת במפורש כשהלמידה פעילה. מסמכים, הערות פרטיות, הודעות פרטיות ו־GPS אינם משמשים ללמידה.</span></p><div class="cloud-avatar-actions"><button type="button" class="secondary cloud-profile-edit" data-profile-wizard-open><i class="fa-solid fa-image" aria-hidden="true"></i> תמונה ואווטר</button><button type="button" class="secondary cloud-profile-interests" data-profile-interests-open><i class="fa-solid fa-heart" aria-hidden="true"></i> העדפות ותחומי עניין</button><button type="button" class="secondary" data-cloud-avatar-remove>הסרת תמונה</button><label class="cloud-avatar-pick cloud-avatar-legacy" hidden>בחירת תמונה<input type="file" data-cloud-avatar-input accept="image/jpeg,image/png,image/webp"></label><button type="button" data-cloud-avatar-upload hidden disabled>שמירת תמונה</button></div><small class="cloud-avatar-status" data-cloud-avatar-status role="status" aria-live="polite"></small>';
    var legacyProfileForm = panel.querySelector('[data-cloud-profile-form]');
    if (legacyProfileForm) legacyProfileForm.remove();
    panel.classList.add('cloud-account-split');
    panel.insertAdjacentHTML('afterbegin', '<button class="cloud-account-close" type="button" data-cloud-account-close aria-label="סגירת חלון ההתחברות"><i class="fa-solid fa-xmark"></i></button>');
    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);
    return panel;
  }

  var accountPanel = createAccountPanel();
  if (window.TravelMateTheme && window.TravelMateTheme.refreshAccentChoices) window.TravelMateTheme.refreshAccentChoices();
  var authForm = accountPanel.querySelector('[data-cloud-auth-form]');
  var passwordForm = accountPanel.querySelector('[data-cloud-password-form]');
  var avatarInput = accountPanel.querySelector('[data-cloud-avatar-input]');
  var avatarUpload = accountPanel.querySelector('[data-cloud-avatar-upload]');
  var avatarRemove = accountPanel.querySelector('[data-cloud-avatar-remove]');
  var avatarPreview = accountPanel.querySelector('[data-cloud-avatar-preview]');
  var avatarStatus = accountPanel.querySelector('[data-cloud-avatar-status]');
  var pendingAvatarFile = null;
  var pendingAvatarPreviewUrl = '';
  var avatarBusy = false;
  var avatarRenderGeneration = 0;

  var sessionPanel = accountPanel.querySelector('[data-cloud-session]');
  var message = accountPanel.querySelector('[data-cloud-message]');
  var accountBackdrop = accountPanel.closest('[data-cloud-account-backdrop]');
  var accountOpenButtons = [].slice.call(document.querySelectorAll('[data-cloud-account-open]'));
  var lastAccountOpenButton = null;

  async function openAccountModal(event) {
    lastAccountOpenButton = event && event.currentTarget ? event.currentTarget : lastAccountOpenButton;
    if (window.TravelMateFeatures && typeof window.TravelMateFeatures.ensureAccount === 'function') {
      try { await window.TravelMateFeatures.ensureAccount(); }
      catch (error) { console.error('TravelMate account feature failed to load', error); }
    }
    if (window.TravelMateSecurity && window.TravelMateSecurity.resumeCaptcha) window.TravelMateSecurity.resumeCaptcha();
    accountBackdrop.hidden = false;
    accountBackdrop.setAttribute('aria-hidden', 'false');
    document.body.classList.add('cloud-account-open');
    var firstField = accountPanel.querySelector('form:not([hidden]) input');
    var firstControl = firstField || accountPanel.querySelector('[data-cloud-account-close]');
    if (firstControl) firstControl.focus();
  }

  function closeAccountModal() {
    if (window.TravelMateSecurity && window.TravelMateSecurity.pauseCaptcha) window.TravelMateSecurity.pauseCaptcha();
    accountBackdrop.hidden = true;
    accountBackdrop.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('cloud-account-open');
    if (lastAccountOpenButton) lastAccountOpenButton.focus();
  }

  accountOpenButtons.forEach(function (button) {
    button.addEventListener('click', openAccountModal);
  });
  accountPanel.querySelector('[data-cloud-account-close]').addEventListener('click', closeAccountModal);
  accountBackdrop.addEventListener('click', function (event) {
    if (event.target === accountBackdrop) closeAccountModal();
  });
  document.addEventListener('keydown', function (event) {
    if (accountBackdrop.hidden) return;
    if (event.key === 'Escape') { closeAccountModal(); return; }
    if (event.key !== 'Tab') return;
    var focusable = [].slice.call(accountPanel.querySelectorAll('button:not([disabled]):not([hidden]),a[href],input:not([disabled]):not([hidden]),select:not([disabled]):not([hidden]),textarea:not([disabled]):not([hidden]),[tabindex]:not([tabindex="-1"])')).filter(function (node) { return node.offsetParent !== null; });
    if (!focusable.length) return;
    var first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  function setMessage(value, error) {
    var state = error ? 'error' : /התקבלה|נשלח|אושר|מסונכרן|הכול מסונכרן/.test(value) ? 'success' : 'info';
    message.textContent = value;
    message.classList.toggle('error', Boolean(error));
    message.dataset.messageState = state;
    message.setAttribute('role', error ? 'alert' : 'status');
  }

  function authMessage(error) {
    var value = String(error && (error.message || error.code) || '');
    if (/email not confirmed/i.test(value)) return 'החשבון עדיין לא אומת. לחץ על „לא קיבלתי מייל” כדי לשלוח שוב.';
    if (/email address not authorized/i.test(value)) return 'Supabase אינו מורשה לשלוח לכתובת הזו. יש להגדיר SMTP פרטי או להשתמש בכתובת של חבר צוות הפרויקט.';
    if (/rate limit|too many requests|over_email_send_rate_limit/i.test(value)) return 'הגעת למגבלת השליחה של Supabase. המתן כשעה ונסה שוב, או הגדר SMTP פרטי.';
    if (/CAPTCHA_REQUIRED|captcha|verification.*failed/i.test(value)) return 'יש להשלים את בדיקת האבטחה לפני הפעולה. אם הבדיקה לא נטענה, בדוק את החיבור ונסה שוב.';
    if (/invalid login/i.test(value)) return 'כתובת הדוא״ל או הסיסמה אינן נכונות. אם טרם אימתת את החשבון, שלח שוב את מייל האימות.';
    if (/AVATAR_CONFLICT/i.test(value)) return 'תמונת הפרופיל השתנתה במכשיר או בחלון אחר. המצב העדכני נטען; אפשר לבחור שוב תמונה אם רוצים להחליף אותה.';
    if (/AVATAR_OFFLINE/i.test(value)) return 'שינוי תמונת פרופיל דורש חיבור לרשת.';
    if (/AUTH_CONTEXT_CHANGED/i.test(value)) return 'החשבון השתנה בזמן הפעולה. לא בוצע שינוי בחשבון החדש.';
    return 'לא הצלחנו להשלים את הפעולה. נסו שוב בעוד רגע.';
  }

  function personalizedUser(user) {
    var shared = window.TravelMateUserProfile;
    if (shared && typeof shared.fromUser === 'function') return shared.fromUser(user);
    var metadata = user && user.user_metadata || {};
    var email = String(user && user.email || '').trim();
    var rawName = String(metadata.display_name || metadata.full_name || metadata.name || '').trim();
    var emailName = email ? email.split('@')[0].replace(/[._-]+/g, ' ').trim() : '';
    var name = rawName || emailName;
    var firstName = name ? name.split(/\s+/)[0] : '';
    var hour = new Date().getHours();
    var greeting = hour < 5 ? 'לילה טוב' : hour < 12 ? 'בוקר טוב' : hour < 17 ? 'צהריים טובים' : 'ערב טוב';
    var initials = name ? name.split(/\s+/).slice(0, 2).map(function (part) { return part.charAt(0); }).join('').toUpperCase() : (email ? email.charAt(0).toUpperCase() : '');
    return { name: name, firstName: firstName, greeting: greeting, initials: initials, avatarUrl: '' };
  }

  function paintAvatar(avatar, user, profile) {
    avatar.hidden = !user;
    avatar.textContent = user ? profile.initials : '';
    avatar.classList.toggle('has-image', Boolean(user && profile.avatarUrl));
    avatar.style.backgroundImage = user && profile.avatarUrl ? 'url("' + profile.avatarUrl.replace(/"/g, '%22') + '")' : '';
    avatar.dataset.avatarUrl = user && profile.avatarUrl ? profile.avatarUrl : '';
    var renderGeneration = String(++avatarRenderGeneration);
    avatar.dataset.avatarGeneration = renderGeneration;
    avatar.setAttribute('aria-label', user && profile.name ? 'משתמש: ' + profile.name : 'משתמש מחובר');
    if (user && profile.avatarUrl && typeof window.Image === 'function') {
      var expected = profile.avatarUrl;
      var probe = new window.Image();
      probe.onerror = function () { if (avatar.dataset.avatarGeneration === renderGeneration && avatar.dataset.avatarUrl === expected) { avatar.classList.remove('has-image'); avatar.style.backgroundImage = ''; avatar.dataset.avatarUrl = ''; avatar.textContent = profile.initials || ''; } };
      probe.src = expected;
    }
  }

  function renderPersonalization(session) {
    var user = session && session.user;
    var profile = personalizedUser(user);
    document.querySelectorAll('[data-account-label]').forEach(function (label) {
      label.textContent = user ? profile.greeting + (profile.firstName ? ', ' + profile.firstName : '') : 'התחברות';
    });
    document.querySelectorAll('[data-user-avatar]').forEach(function (avatar) { paintAvatar(avatar, user, profile); });
    document.querySelectorAll('[data-cloud-account-open]').forEach(function (button) {
      var icon = button.querySelector('[data-account-icon]');
      if (icon) icon.hidden = Boolean(user);
    });
    renderSmartProfile(session);
  }

  function refreshLocalGreeting() {
    if(document.hidden||!currentSession||!currentSession.user)return;
    var profile=personalizedUser(currentSession.user);
    var text=profile.greeting+(profile.firstName?' '+profile.firstName:'');
    document.querySelectorAll('[data-account-label],[data-smart-profile-greeting],[data-home-greeting]').forEach(function(node){node.textContent=text;});
  }
  document.addEventListener('visibilitychange',refreshLocalGreeting);
  window.addEventListener('pageshow',refreshLocalGreeting);
  setInterval(refreshLocalGreeting,60000);

  function renderSmartProfile(session) {
    var host = accountPanel && accountPanel.querySelector('[data-smart-profile]');
    var user = session && session.user;
    if (!host || !user) return;
    var profile = personalizedUser(user);
    var helper = window.TravelMateUserProfile;
    var summary = helper && typeof helper.preferenceSummary === 'function' ? helper.preferenceSummary(profile.preferences) : { items: [], isEmpty: true, learningEnabled: false };
    var greeting = host.querySelector('[data-smart-profile-greeting]');
    var name = host.querySelector('[data-smart-profile-name]');
    var email = host.querySelector('[data-smart-profile-email]');
    var list = host.querySelector('[data-smart-profile-preferences]');
    var completion = host.querySelector('[data-smart-profile-completion]');
    var empty = host.querySelector('[data-smart-profile-empty]');
    var learning = host.querySelector('[data-smart-profile-learning]');
    greeting.textContent = profile.greeting + (profile.firstName ? ', ' + profile.firstName : '');
    name.textContent = profile.name || 'הפרופיל שלי';
    email.textContent = String(user.email || '');
    list.replaceChildren();
    completion.textContent = summary.completionLabel || '';
    summary.items.forEach(function (item) {
      var chip = document.createElement('span');
      var label = document.createElement('small');
      var value = document.createElement('strong');
      label.textContent = item.label;
      value.textContent = item.valueLabel;
      chip.append(label, value);
      list.appendChild(chip);
    });
    empty.hidden = !summary.isEmpty;
    learning.classList.toggle('is-enabled', summary.learningEnabled === true);
    learning.textContent = summary.learningEnabled === true ? 'התאמה עתידית: הצטרפת במפורש' : 'התאמה עתידית: כבויה עד להצטרפות מפורשת';
  }

  function adaptiveHomeContext(trips) {
    var shared = window.TravelMateUserProfile;
    if (shared && typeof shared.selectHomeContext === 'function') return shared.selectHomeContext(trips || [], new Date());
    return { type: 'empty', trip: null };
  }

  function renderAdaptiveHome(trips) {
    var host = document.querySelector('[data-home-personal-summary]');
    if (!host) return;
    var user = currentSession && currentSession.user;
    host.hidden = !user;
    if (!user) return;
    var profile = personalizedUser(user);
    var context = adaptiveHomeContext(trips || Array.from(renderedTrips.values()));
    var greeting = host.querySelector('[data-home-greeting]');
    var kicker = host.querySelector('[data-home-context-kicker]');
    var copy = host.querySelector('[data-home-context]');
    var action = host.querySelector('[data-home-context-action]');
    if (greeting) greeting.textContent = profile.greeting + (profile.firstName ? ', ' + profile.firstName : '');
    if (!kicker || !copy || !action) return;
    var trip = context.trip;
    if (context.type === 'current' && trip) {
      kicker.textContent = 'הפרופיל שלי';
      copy.textContent = 'הטיול ל־' + trip.city + ' מתקיים עכשיו' + (context.daysRemaining ? ' · נשארו ' + context.daysRemaining + ' ימים' : ' · זה היום האחרון') + '.';
      action.href = 'trip/custom/index.html?id=' + encodeURIComponent(trip.id);
      action.innerHTML = 'חזרה לטיול <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>';
      return;
    }
    if (context.type === 'upcoming' && trip) {
      kicker.textContent = 'הפרופיל שלי';
      copy.textContent = 'הטיול ל־' + trip.city + ' מתחיל ' + (context.daysUntil === 1 ? 'מחר' : 'בעוד ' + context.daysUntil + ' ימים') + '.';
      action.href = 'trip/custom/index.html?id=' + encodeURIComponent(trip.id);
      action.innerHTML = 'להמשך התכנון <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>';
      return;
    }
    if (context.type === 'recent' && trip) {
      kicker.textContent = 'הפרופיל שלי';
      copy.textContent = 'הטיול האחרון ל־' + trip.city + ' הסתיים ' + (context.daysAgo === 1 ? 'אתמול' : 'לפני ' + context.daysAgo + ' ימים') + '. אפשר להשלים זיכרונות ופרטים שנשארו.';
      action.href = 'trip/custom/index.html?id=' + encodeURIComponent(trip.id);
      action.innerHTML = 'פתיחת הטיול <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>';
      return;
    }
    kicker.textContent = 'הפרופיל שלי';
    copy.textContent = 'אין כרגע טיול אישי פעיל. אפשר לבחור יעד חדש ולהתחיל לתכנן.';
    action.href = '#active-trips';
    action.innerHTML = 'לטיולים שלי <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>';
  }

  function hydrateCachedTrips() {
    var trips = cloud && cloud.getCachedTrips ? cloud.getCachedTrips() : [];
    document.body.classList.toggle('has-cached-trips', trips.length > 0);
    renderTrips(trips);
  }

  function setSession(session) {
    if (tripBrowser && String(currentSession && currentSession.user.id || '') !== String(session && session.user.id || '')) {
      tripSearch.value = '';
      selectHomeFilter('active');
    }
    sessionGeneration += 1;
    currentSession = session;
    if (destinationWizard) destinationWizard.syncIdentity();
    var user = session && session.user;
    var profile = personalizedUser(user);
    document.body.classList.toggle('is-authenticated', Boolean(session));
    renderPersonalization(session);
    hydrateCachedTrips();
    renderAdaptiveHome(Array.from(renderedTrips.values()));
    window.dispatchEvent(new CustomEvent('travelmate:home-auth', { detail: { authenticated: Boolean(session) } }));
    if (passwordChangeMode && session) return;
    authForm.hidden = Boolean(session);
    passwordForm.hidden = true;
    sessionPanel.hidden = !session;
    accountPanel.querySelector('[data-cloud-email]').textContent = session && session.user ? session.user.email : '';
    clearPendingAvatar();
    updateAvatarControls();
    accountOpenButtons.forEach(function (button) {
      var label = session ? 'החשבון שלי' : 'התחברות';
      button.setAttribute('aria-label', label);
      button.setAttribute('title', label);
      if (button.classList.contains('landing-login')) {
        var accountLabel = button.querySelector('[data-account-label]');
        if (accountLabel) { var accountProfile = session ? personalizedUser(session.user) : null; accountLabel.textContent = accountProfile ? accountProfile.greeting + (accountProfile.firstName ? ', ' + accountProfile.firstName : '') : label; }
      }
      else {
        var tip = button.querySelector('.tip');
        if (tip) tip.textContent = label;
      }
    });
    if (session) {
      closeAccountModal();
      var pendingInvite = sessionStorage.getItem('travelmate-pending-invite');
      if (pendingInvite) {
        sessionStorage.removeItem('travelmate-pending-invite');
        location.href = pendingInvite;
        return;
      }
      synchronize();
    }
    else {
      hydrateCachedTrips();
      paintHomeState('ready');
      setMessage('התחברו כדי לשמור את כל הטיולים בענן הפרטי.');
    }
  }

  function showPasswordForm(session, isRecovery) {
    currentSession = session || currentSession;
    passwordChangeMode = true;
    authForm.hidden = true;
    sessionPanel.hidden = true;
    passwordForm.hidden = false;
    passwordForm.reset();
    setMessage(isRecovery ? 'קישור השחזור אושר. בחר סיסמה חדשה לחשבון.' : 'בחר סיסמה חדשה לחשבון.');
    openAccountModal();
    passwordForm.elements.newPassword.focus();
  }

  function finishPasswordChange() {
    passwordChangeMode = false;
    passwordForm.hidden = true;
    setSession(currentSession);
  }

  async function synchronize() {
    if (!cloud || !currentSession) return;
    hydrateCachedTrips();
    var generation = sessionGeneration;
    var owner = currentSession.user.id;
    paintHomeState('loading');
    setMessage('מסנכרן/ת את הטיולים…');
    try {
      var trips = await cloud.syncLocalTrips();
      if (generation !== sessionGeneration || !currentSession || currentSession.user.id !== owner) return;
      renderTrips(trips);
      paintHomeState('ready');
      filterHomeTrips();
      setMessage('הכול מסונכרן · ' + trips.length + ' טיולים זמינים בכל המכשירים');
    } catch (error) {
      if (generation !== sessionGeneration || !currentSession || currentSession.user.id !== owner) return;
      console.error('TravelMate trip sync failed', error);
      paintHomeState('error');
      filterHomeTrips();
      var missingTable = /travel_trips|schema cache|does not exist/i.test(String(error && error.message || ''));
      setMessage(missingTable ? 'טבלת סנכרון הטיולים עדיין לא הופעלה ב־Supabase.' : 'הסנכרון נכשל זמנית. הטיולים נשארו שמורים במכשיר.', true);
    }
  }

  authForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    var submitButton = authForm.querySelector('.cloud-login-submit');
    cloud = window.TravelMateCloud || cloud;
    if (!cloud || typeof cloud.signIn !== 'function') {
      setMessage('שירות ההתחברות עדיין נטען. נסו שוב בעוד רגע.', true);
      return;
    }
    submitButton.disabled = true;
    submitButton.setAttribute('aria-busy', 'true');
    setMessage('מתחבר/ת…');
    try {
      var result = await cloud.signIn(authForm.elements.email.value.trim(), authForm.elements.password.value);
      if (result.error) setMessage(authMessage(result.error), true);
    } catch (error) {
      console.error('TravelMate sign in failed', error);
      setMessage(authMessage(error), true);
    } finally {
      submitButton.disabled = false;
      submitButton.removeAttribute('aria-busy');
    }
  });

  function clearPendingAvatar() {
    pendingAvatarFile = null;
    if (pendingAvatarPreviewUrl) { URL.revokeObjectURL(pendingAvatarPreviewUrl); pendingAvatarPreviewUrl = ''; }
    if (avatarInput) avatarInput.value = '';
  }
  function setAvatarStatus(value, error) {
    if (!avatarStatus) return;
    avatarStatus.textContent = value || '';
    avatarStatus.classList.toggle('error', Boolean(error));
    avatarStatus.setAttribute('role', error ? 'alert' : 'status');
  }
  function updateAvatarControls() {
    if (!avatarInput || !avatarUpload || !avatarRemove) return;
    var user = currentSession && currentSession.user;
    var online = typeof navigator === 'undefined' || navigator.onLine !== false;
    var profile = personalizedUser(user);
    avatarInput.disabled = avatarBusy || !user || !online;
    avatarUpload.disabled = avatarBusy || !user || !online || !pendingAvatarFile;
    avatarRemove.disabled = avatarBusy || !user || !online || !profile.avatarUrl;
    if (user && !online) setAvatarStatus('כדי לשנות תמונת פרופיל יש להתחבר לרשת.', false);
  }
  if (avatarInput) avatarInput.addEventListener('change', function () {
    var file = avatarInput.files && avatarInput.files[0];
    clearPendingAvatar();
    if (!file) { renderPersonalization(currentSession); updateAvatarControls(); return; }
    var check = cloud && cloud.validateAvatarFile ? cloud.validateAvatarFile(file) : { ok: false, error: 'שירות האווטר עדיין נטען.' };
    if (!check.ok) { setAvatarStatus(check.error, true); renderPersonalization(currentSession); updateAvatarControls(); return; }
    var previewUrl = URL.createObjectURL(file);
    pendingAvatarPreviewUrl = previewUrl;
    var profile = personalizedUser(currentSession && currentSession.user);
    if (avatarPreview) { avatarPreview.hidden = false; avatarPreview.textContent = profile.initials || ''; avatarPreview.classList.remove('has-image'); avatarPreview.style.backgroundImage = ''; }
    if (typeof window.Image !== 'function') { pendingAvatarFile = file; if (avatarPreview) { avatarPreview.classList.add('has-image'); avatarPreview.style.backgroundImage = 'url("' + previewUrl.replace(/"/g, '%22') + '")'; } setAvatarStatus('התמונה מוכנה לתצוגה מקדימה. לחץ על „שמירת תמונה” כדי לעדכן.', false); updateAvatarControls(); return; }
    var probe = new window.Image();
    probe.onload = function () { if (pendingAvatarPreviewUrl !== previewUrl) return; pendingAvatarFile = file; if (avatarPreview) { avatarPreview.classList.add('has-image'); avatarPreview.style.backgroundImage = 'url("' + previewUrl.replace(/"/g, '%22') + '")'; } setAvatarStatus('התמונה מוכנה לתצוגה מקדימה. לחץ על „שמירת תמונה” כדי לעדכן.', false); updateAvatarControls(); };
    probe.onerror = function () { if (pendingAvatarPreviewUrl !== previewUrl) return; clearPendingAvatar(); renderPersonalization(currentSession); setAvatarStatus('לא הצלחנו לקרוא את קובץ התמונה. נסו קובץ אחר.', true); updateAvatarControls(); };
    probe.src = previewUrl;
    updateAvatarControls();
  });
  if (avatarUpload) avatarUpload.addEventListener('click', async function () {
    if (!pendingAvatarFile || !cloud || typeof cloud.uploadAvatar !== 'function' || !currentSession || !currentSession.user) return;
    var ownerId = String(currentSession.user.id);
    avatarBusy = true; avatarUpload.setAttribute('aria-busy', 'true'); updateAvatarControls();
    setAvatarStatus('מעלה את תמונת הפרופיל…', false);
    try {
      var result = await cloud.uploadAvatar(pendingAvatarFile);
      if (!currentSession || !currentSession.user || String(currentSession.user.id) !== ownerId) return;
      if (result.error) { if (result.data && result.data.user && String(result.data.user.id) === ownerId) { currentSession.user = result.data.user; clearPendingAvatar(); renderPersonalization(currentSession); window.dispatchEvent(new CustomEvent('travelmate:profile-change', { detail: { user: currentSession.user } })); } setAvatarStatus(result.rollbackError ? 'העדכון נכשל וגם ניקוי הקובץ החדש לא הושלם. נסו שוב מאוחר יותר.' : authMessage(result.error), true); return; }
      if (!result.data || !result.data.user || String(result.data.user.id) !== ownerId) { setAvatarStatus('החשבון השתנה בזמן העדכון. התמונה לא הוחלה במסך הנוכחי.', true); return; }
      currentSession.user = result.data.user;
      clearPendingAvatar(); renderPersonalization(currentSession); updateAvatarControls();
      window.dispatchEvent(new CustomEvent('travelmate:profile-change', { detail: { user: currentSession.user } }));
      setAvatarStatus(result.cleanupError ? 'התמונה נשמרה. ניקוי הגרסה הקודמת לא הושלם.' : 'תמונת הפרופיל נשמרה.', Boolean(result.cleanupError));
    } catch (error) { if (currentSession && currentSession.user && String(currentSession.user.id) === ownerId) { console.error('TravelMate avatar upload failed', error); setAvatarStatus(authMessage(error), true); } }
    finally { avatarBusy = false; avatarUpload.removeAttribute('aria-busy'); updateAvatarControls(); }
  });
  if (avatarRemove) avatarRemove.addEventListener('click', async function () {
    if (!cloud || typeof cloud.removeAvatar !== 'function' || !currentSession || !currentSession.user) return;
    var ownerId = String(currentSession.user.id);
    avatarBusy = true; avatarRemove.setAttribute('aria-busy', 'true'); updateAvatarControls(); setAvatarStatus('מסיר את תמונת הפרופיל…', false);
    try {
      var result = await cloud.removeAvatar();
      if (!currentSession || !currentSession.user || String(currentSession.user.id) !== ownerId) return;
      if (result.error) { if (result.data && result.data.user && String(result.data.user.id) === ownerId) { currentSession.user = result.data.user; renderPersonalization(currentSession); window.dispatchEvent(new CustomEvent('travelmate:profile-change', { detail: { user: currentSession.user } })); } setAvatarStatus(authMessage(result.error), true); return; }
      if (!result.data || !result.data.user || String(result.data.user.id) !== ownerId) { setAvatarStatus('החשבון השתנה בזמן העדכון. השינוי לא הוחל במסך הנוכחי.', true); return; }
      currentSession.user = result.data.user;
      clearPendingAvatar(); renderPersonalization(currentSession); updateAvatarControls();
      window.dispatchEvent(new CustomEvent('travelmate:profile-change', { detail: { user: currentSession.user } }));
      setAvatarStatus(result.cleanupError ? 'האווטר הוסר מהפרופיל, אך ניקוי הקובץ הישן לא הושלם.' : 'תמונת הפרופיל הוסרה. מוצגים כעת ראשי התיבות.', Boolean(result.cleanupError));
    } catch (error) { if (currentSession && currentSession.user && String(currentSession.user.id) === ownerId) { console.error('TravelMate avatar removal failed', error); setAvatarStatus(authMessage(error), true); } }
    finally { avatarBusy = false; avatarRemove.removeAttribute('aria-busy'); updateAvatarControls(); }
  });
  window.addEventListener('online', updateAvatarControls);
  window.addEventListener('offline', updateAvatarControls);

  accountPanel.querySelector('[data-cloud-signup]').addEventListener('click', async function (event) {
    if (!authForm.reportValidity()) return;
    if (authForm.elements.password.value.length < 8) {
      setMessage('ליצירת חשבון חדש נדרשת סיסמה של לפחות 8 תווים.', true);
      return;
    }
    var button = event.currentTarget;
    button.disabled = true;
    setMessage('יוצר/ת חשבון…');
    try {
      var result = await cloud.signUp(authForm.elements.email.value.trim(), authForm.elements.password.value, cloud.authRedirectUrl());
      if (result.error) setMessage(authMessage(result.error), true);
      else if (!result.data.session && result.data.user && Array.isArray(result.data.user.identities) && !result.data.user.identities.length) setMessage('כבר קיים חשבון עם הכתובת הזו. לחץ על „לא קיבלתי מייל” לשליחה חוזרת, או נסה להתחבר.');
      else if (!result.data.session) setMessage('בקשת ההרשמה התקבלה. בדוק גם בספאם; אם המייל לא הגיע, לחץ על „שלח שוב”.');
    } catch (error) {
      setMessage(authMessage(error), true);
    } finally {
      button.disabled = false;
    }
  });
  accountPanel.querySelector('[data-cloud-forgot]').addEventListener('click', async function (event) {
    if (!authForm.elements.email.reportValidity()) return;
    var button = event.currentTarget;
    button.disabled = true;
    setMessage('שולח קישור לאיפוס הסיסמה…');
    try {
      var result = await cloud.resetPassword(authForm.elements.email.value.trim(), cloud.authRedirectUrl());
      if (result.error) {
        setMessage(authMessage(result.error), true);
        button.disabled = false;
        return;
      }
      setMessage('קישור לאיפוס הסיסמה נשלח. בדוק גם בתיקיות ספאם וקידומי מכירות.');
      button.textContent = 'נשלח · אפשר שוב בעוד דקה';
      setTimeout(function () {
        button.disabled = false;
        button.textContent = 'שכחתי סיסמה';
      }, 60000);
    } catch (error) {
      setMessage(authMessage(error), true);
      button.disabled = false;
    }
  });
  accountPanel.querySelector('[data-cloud-resend]').addEventListener('click', async function (event) {
    if (!authForm.elements.email.reportValidity()) return;
    var button = event.currentTarget; button.disabled = true; setMessage('שולח שוב את מייל האימות…');
    var sent = false;
    try {
      var result = await cloud.resendSignup(authForm.elements.email.value.trim(), cloud.authRedirectUrl());
      if (result.error) { setMessage(authMessage(result.error), true); return; }
      sent = true;
      setMessage('מייל אימות נוסף נשלח. בדוק גם בתיקיות ספאם וקידומי מכירות.');
      button.textContent = 'נשלח · אפשר שוב בעוד דקה';
      setTimeout(function () { button.disabled = false; button.textContent = 'לא קיבלתי מייל · שלח שוב'; }, 60000);
    } catch (error) {
      setMessage(authMessage(error), true);
    } finally {
      if (!sent) button.disabled = false;
    }
  });
  accountPanel.querySelector('[data-cloud-signout]').addEventListener('click', function () { cloud.signOut(); });
  accountPanel.querySelector('[data-cloud-sync-now]').addEventListener('click', synchronize);
  accountPanel.querySelector('[data-cloud-change-password]').addEventListener('click', function () { showPasswordForm(currentSession, false); });
  accountPanel.querySelector('[data-cloud-password-cancel]').addEventListener('click', finishPasswordChange);
  passwordForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    var password = passwordForm.elements.newPassword.value;
    if (password !== passwordForm.elements.confirmPassword.value) {
      setMessage('הסיסמאות אינן זהות. בדוק והקלד אותן שוב.', true);
      return;
    }
    var button = passwordForm.querySelector('button[type="submit"]');
    button.disabled = true;
    setMessage('שומר את הסיסמה החדשה…');
    var result = await cloud.updatePassword(password);
    button.disabled = false;
    if (result.error) {
      setMessage(authMessage(result.error), true);
      return;
    }
    passwordChangeMode = false;
    passwordForm.hidden = true;
    setSession(currentSession);
    setMessage('הסיסמה עודכנה בהצלחה והחשבון מחובר.');
  });

  // New Trip wizard core: transient form state; canonical writers remain external.
  function validateDestinationFields(raw, onlyStep) {
    function failure(step, field, message) { return { error: message, step: step, field: field }; }
    function dateDay(value) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
      var bits = value.split('-').map(Number), date = new Date(0);
      if (bits[0] < 1) return NaN;
      date.setUTCFullYear(bits[0], bits[1] - 1, bits[2]); date.setUTCHours(0, 0, 0, 0);
      return date.toISOString().slice(0, 10) === value ? date.getTime() / 86400000 : NaN;
    }
    var country = String(raw.country || '').trim(), city = String(raw.city || '').trim();
    var start = String(raw.start || ''), end = String(raw.end || '');
    var first = dateDay(start), last = dateDay(end), days = last - first + 1;
    var budgetText = String(raw.budget == null ? '' : raw.budget).trim();
    var budget = budgetText === '' ? 2500 : Number(budgetText), type = String(raw.type || '');
    if (onlyStep == null || onlyStep === 0) {
      if (!country) return failure(0, 'country', 'יש להזין מדינה.');
      if (!city) return failure(0, 'city', 'יש להזין עיר.');
    }
    if (onlyStep == null || onlyStep === 1) {
      if (!Number.isFinite(first)) return failure(1, 'start', 'יש לבחור תאריך יציאה תקין.');
      if (!Number.isFinite(last)) return failure(1, 'end', 'יש לבחור תאריך חזרה תקין.');
      if (days < 1) return failure(1, 'end', 'תאריך החזרה אינו יכול להיות לפני תאריך היציאה.');
      if (days > 60) return failure(1, 'end', 'אפשר לבנות כרגע טיול של עד 60 ימים.');
    }
    if (onlyStep == null || onlyStep === 2) {
      if (raw.budgetBadInput || !Number.isFinite(budget) || budget < 100 || (budget - 100) % 50 !== 0) return failure(2, 'budget', 'יש להזין תקציב של לפחות 100 אירו, בקפיצות של 50.');
      if (!Array.isArray(raw.allowedTypes) || raw.allowedTypes.indexOf(type) === -1) return failure(2, 'type', 'יש לבחור סוג טיול מהרשימה.');
    }
    return { value: { country: country, city: city, start: start, end: end, budget: budget, type: type, days: days } };
  }

  function createDestinationWizard(options) {
    var identity = String(options.identity() || ''), epoch = 0, visibility = 0, open = false;
    var step = 0, busy = false, committed = null, prepared = null, attachmentAttempted = false, reservedId = null, operation = null;
    var navigationStarted = false;
    var error = '', field = '', status = '';
    function preparedFields() { if (!prepared) return null; var fields = {}; ['country','city','start','end','budget','type','days'].forEach(function (name) { fields[name] = prepared[name]; }); return fields; }
    function snapshot() { return { step: step, busy: busy, created: Boolean(committed), prepared: Boolean(prepared), preparedFields: preparedFields(), error: error, field: field, status: status }; }
    function emit(focus) { options.render(snapshot(), focus); }
    function syncIdentity() {
      var next = String(options.identity() || '');
      if (next === identity) return false;
      identity = next; epoch += 1; navigationStarted = false; operation = null; busy = false; committed = null; prepared = null; attachmentAttempted = false; reservedId = null; step = 0;
      error = open ? 'החשבון השתנה. פרטי הטיול נוקו.' : ''; field = ''; status = '';
      options.resetFields(); emit(open ? 'heading' : ''); return true;
    }
    function validate(activeOnly) {
      var result = validateDestinationFields(options.readFields(), activeOnly ? step : null);
      if (result.error) { step = result.step; error = result.error; field = result.field; status = ''; emit(field); return null; }
      error = ''; field = ''; return result.value;
    }
    function next() { if (syncIdentity() || busy || prepared || step === 3) return; if (validate(true)) { step += 1; emit('heading'); } }
    function back() { if (syncIdentity() || busy || prepared || step === 0) return; step -= 1; error = ''; field = ''; emit('heading'); }
    function edit(index) { if (syncIdentity() || busy || prepared || !Number.isInteger(index) || index < 0 || index > 2) return; step = index; error = ''; field = ''; emit('heading'); }
    function owned(op) { return operation === op && op.epoch === epoch && String(options.identity() || '') === op.identity; }
    function openCommitted() { if (!navigationStarted) { navigationStarted = true; options.openTrip(committed.id); } }
    function navigate(op) { if (owned(op) && open && (!options.isOpen || options.isOpen()) && visibility === op.visibility) openCommitted(); }
    async function confirm() {
      if (syncIdentity() || busy || !open || options.isOpen && !options.isOpen()) return;
      if (step !== 3) { next(); return; }
      if (committed) { openCommitted(); return; }
      var current = prepared ? validateDestinationFields(options.readFields()) : null;
      if (prepared && (current.error || Object.keys(current.value).some(function (name) { return current.value[name] !== prepared[name]; }))) { step = 3; error = 'הפרטים כבר הוכנו לשמירה ונשמרים כפי שאושרו. הניסיון החוזר משתמש באותם פרטים.'; emit('heading'); return; }
      var value = validate(false); if (!value) return;
      if (typeof options.localSave !== 'function' || options.canSaveLocal && !options.canSaveLocal()) { error = 'השמירה במכשיר אינה זמינה כרגע. הפרטים נשארו בזיכרון; אין מעבר לטיול.'; emit('heading'); return; }
      busy = true; status = 'שומר את הטיול במכשיר…'; error = ''; field = '';
      var op = operation = { epoch: epoch, identity: identity, visibility: visibility };
      if (reservedId === null) reservedId = String(options.newId());
      var retry = Boolean(prepared);
      if (!prepared) {
        prepared = Object.assign({ id: reservedId }, value, { savedPlaces: [], activities: [], dayNotes: {} });
        if (identity) prepared.ownerId = identity;
      }
      var trip = prepared;
      emit('');
      try {
        if (!owned(op)) return;
        if (!attachmentAttempted) { attachmentAttempted = true; if (options.attachPending) options.attachPending(trip); }
        if (!owned(op)) return;
        // A primary write may have succeeded before the account snapshot failed.
        // Recover canonical additions instead of replacing them with empty arrays.
        if (retry && typeof options.readLocalTrip === 'function') {
          var existing = options.readLocalTrip(trip.id, identity);
          if (!owned(op)) return;
          if (existing) {
            if (String(existing.id) !== trip.id || String(existing.ownerId || '') !== identity) throw new Error('LOCAL_IDENTITY_MISMATCH');
            Object.assign(trip, JSON.parse(JSON.stringify(existing)));
            emit('');
          }
        }
        if (!owned(op)) return;
        var saved = options.localSave(trip);
        if (saved && typeof saved.then === 'function') saved = await saved;
        if (!owned(op)) return;
        if (!saved || String(saved.id) !== trip.id) throw new Error('LOCAL_SAVE_UNCONFIRMED');
        committed = trip;
        if (typeof options.shouldCloudSave === 'function' && options.shouldCloudSave(identity) && typeof options.cloudSave === 'function') {
          status = 'נשמר במכשיר. מסנכרן לענן…'; emit('');
          if (!owned(op)) return;
          try {
            var result = await options.cloudSave(trip, identity);
            if (!owned(op)) return;
            if (!result || result.saved !== true) throw new Error('CLOUD_SAVE_UNCONFIRMED');
            status = 'הטיול נשמר במכשיר ובענן.';
          } catch (cloudError) {
            if (!owned(op)) return;
            status = 'הטיול נשמר במכשיר. הסנכרון לענן לא הושלם; אפשר לפתוח את הטיול שנשמר.';
            return;
          }
        } else status = 'הטיול נשמר במכשיר.';
        navigate(op);
      } catch (localError) {
        if (!owned(op)) return;
        error = 'לא ניתן לאשר את השמירה במכשיר. הפרטים שהוכנו נשמרים בזיכרון לניסיון חוזר, ללא שינוי או יצירת טיול נוסף.'; status = '';
      } finally {
        if (owned(op)) { busy = false; emit(error ? 'heading' : ''); }
      }
    }
    return { next: next, back: back, edit: edit, confirm: confirm, syncIdentity: syncIdentity, snapshot: snapshot,
      opened: function () { syncIdentity(); if (!open) { open = true; visibility += 1; } emit('heading'); },
      closed: function () { if (open) { open = false; visibility += 1; } }
    };
  }
  // New Trip DOM adapter: existing modal owns open/close, Back and focus return.
  function createDestinationDiscovery(form, options) {
    // A small, explicit suggestion list; canonical city/country inputs own the draft.
    var suggestions = [
      { id: 'tokyo', city: 'טוקיו', country: 'יפן', aliases: 'tokyo japan טוקיו יפן' },
      { id: 'santorini', city: 'סנטוריני', country: 'יוון', aliases: 'santorini greece סנטוריני יוון' },
      { id: 'rome', city: 'רומא', country: 'איטליה', aliases: 'rome roma italy רומא איטליה' },
      { id: 'paris', city: 'פריז', country: 'צרפת', aliases: 'paris france פריז פאריס צרפת' },
      { id: 'phuket', city: 'פוקט', country: 'תאילנד', aliases: 'phuket thailand פוקט תאילנד' },
      { id: 'new-york', city: 'ניו יורק', country: 'ארצות הברית', aliases: 'new york newyork nyc united states usa us ניו יורק ארצות הברית ארהב' }
    ];
    var root = form.querySelector('[data-destination-discovery]');
    var search = root.querySelector('[data-destination-search]'), clear = root.querySelector('[data-destination-clear]');
    var manualButton = root.querySelector('[data-destination-manual]'), grid = root.querySelector('.destination-choices');
    var empty = root.querySelector('[data-destination-empty]'), selection = root.querySelector('[data-destination-selection]');
    var manualFields = form.querySelectorAll('[data-destination-manual-field]');
    var manual = false, writing = false, active = false, generation = 0, cards = [];
    function normalize(value) { return String(value || '').trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f\u0591-\u05c7'"׳״.,-]/g, '').replace(/\s+/g, ' '); }
    function matches(item, query) { return normalize(query).split(' ').every(function (word) { return normalize(item.aliases).indexOf(word) !== -1; }); }
    function selected(item) { return normalize(form.elements.city.value) === normalize(item.city) && normalize(form.elements.country.value) === normalize(item.country); }
    function editable() { return options.editable() && options.isOpen(); }
    function notifyFields() {
      writing = true;
      ['country', 'city'].forEach(function (name) {
        form.elements[name].dispatchEvent(new Event('input', { bubbles: true }));
        form.elements[name].dispatchEvent(new Event('change', { bubbles: true }));
      });
      writing = false;
    }
    function draw() {
      var state = options.snapshot(), locked = state.busy || state.prepared, count = 0;
      if (state.step === 0 && (state.field === 'city' || state.field === 'country')) manual = true;
      search.disabled = clear.disabled = manualButton.disabled = locked;
      clear.hidden = !search.value;
      cards.forEach(function (card) {
        var chosen = selected(card.item), visible = matches(card.item, search.value);
        card.button.hidden = !visible; card.button.disabled = locked;
        card.button.setAttribute('aria-pressed', String(chosen)); card.check.hidden = !chosen;
        if (visible) count += 1;
      });
      empty.hidden = count !== 0;
      manualFields.forEach(function (label) { label.hidden = state.step !== 0 || !manual; });
      manualButton.setAttribute('aria-expanded', String(manual));
      manualButton.textContent = manual ? 'סגירת ההזנה הידנית' : 'הזנת יעד אחר';
      var city = form.elements.city.value.trim(), country = form.elements.country.value.trim();
      var message = city && country ? 'היעד שנבחר: ' + city + ', ' + country : count ? count + ' הצעות. בחרו יעד או הזינו עיר ומדינה.' : 'אין התאמה בהצעות. אפשר להזין עיר ומדינה ידנית.';
      if (selection.textContent !== message) selection.textContent = message;
    }
    function imageState(card, state) {
      card.button.dataset.imageState = state;
      card.image.hidden = state !== 'ready';
      card.imageStatus.hidden = state === 'ready';
      card.imageStatus.textContent = state === 'loading' ? 'טוען תמונה…' : 'תמונה אינה זמינה';
    }
    function stopImages(reset) {
      generation += 1;
      cards.forEach(function (card) {
        clearTimeout(card.timer); card.timer = null; card.image.onload = card.image.onerror = null;
        if (reset || card.button.dataset.imageState === 'loading') { card.image.removeAttribute('src'); imageState(card, 'idle'); }
      });
    }
    function loadImages() {
      if (!active || !options.isOpen()) return;
      var owner = options.identity(), token = generation, helper = window.TravelMateDestinationImages;
      cards.forEach(function (card) {
        if (card.button.dataset.imageState !== 'idle') return;
        function current() { return active && options.isOpen() && token === generation && owner === options.identity() && card.button.isConnected; }
        function finish(state) { if (!current()) return; clearTimeout(card.timer); card.timer = null; card.image.onload = card.image.onerror = null; imageState(card, state); }
        function paint(url) {
          if (!current() || card.button.dataset.imageState !== 'loading') return;
          // The helper's generic travel fallback is not a photograph of this destination.
          if (!url || url === helper.fallback || !/^https:\/\//i.test(url)) { finish('unavailable'); return; }
          card.image.onload = function () { finish(card.image.naturalWidth > 0 ? 'ready' : 'unavailable'); };
          card.image.onerror = function () { finish('unavailable'); };
          card.image.src = url;
        }
        imageState(card, 'loading');
        card.timer = setTimeout(function () { finish('unavailable'); }, 12000);
        try {
          if (!helper) { finish('unavailable'); return; }
          var cached = helper.cached(card.item.city, card.item.country);
          if (cached) { paint(cached); return; }
          if (navigator.onLine === false) { finish('unavailable'); return; }
          Promise.resolve(helper.resolve(card.item.city, card.item.country)).then(paint, function () { finish('unavailable'); });
        } catch (_) { finish('unavailable'); }
      });
    }
    suggestions.forEach(function (item) {
      var button = document.createElement('button'), img = document.createElement('img');
      var caption = document.createElement('span'), city = document.createElement('strong'), country = document.createElement('span');
      var check = document.createElement('span'), imageStatus = document.createElement('span');
      button.type = 'button'; button.className = 'destination-choice'; button.dataset.destinationChoice = item.id;
      button.setAttribute('aria-pressed', 'false'); button.setAttribute('aria-label', item.city + ', ' + item.country);
      img.alt = ''; img.decoding = 'async'; img.hidden = true;
      caption.className = 'destination-choice-caption'; city.textContent = item.city; country.textContent = item.country;
      caption.appendChild(city); caption.appendChild(country);
      check.className = 'destination-choice-check'; check.textContent = '✓'; check.hidden = true; check.setAttribute('aria-hidden', 'true');
      imageStatus.className = 'destination-image-status'; imageStatus.setAttribute('aria-hidden', 'true');
      button.appendChild(img); button.appendChild(imageStatus); button.appendChild(caption); button.appendChild(check); grid.appendChild(button);
      var card = { item: item, button: button, image: img, check: check, imageStatus: imageStatus, timer: null }; cards.push(card); imageState(card, 'idle');
      button.addEventListener('click', function () {
        if (!editable()) return;
        form.elements.city.value = item.city; form.elements.country.value = item.country; manual = false;
        notifyFields(); draw();
      });
    });
    search.addEventListener('input', function () {
      if (!editable()) return;
      var chosen = suggestions.find(selected);
      if ((chosen && !matches(chosen, search.value)) || (!chosen && (form.elements.city.value || form.elements.country.value))) {
        form.elements.city.value = ''; form.elements.country.value = ''; notifyFields();
      }
      draw();
    });
    search.addEventListener('keydown', function (event) { if (event.key === 'Enter') { event.preventDefault(); var first = cards.find(function (card) { return !card.button.hidden && !card.button.disabled; }); if (first) first.button.focus(); else manualButton.focus(); } });
    clear.addEventListener('click', function () { if (!editable()) return; search.value = ''; draw(); search.focus(); });
    manualButton.addEventListener('click', function () {
      if (!editable()) return;
      manual = !manual; draw(); if (manual) form.elements.city.focus();
    });
    ['country', 'city'].forEach(function (name) {
      form.elements[name].addEventListener('input', function () { if (!writing) { manual = true; draw(); } });
      form.elements[name].addEventListener('change', function () { if (!writing) draw(); });
    });
    grid.addEventListener('keydown', function (event) {
      var visible = cards.filter(function (card) { return !card.button.hidden && !card.button.disabled; });
      var index = visible.findIndex(function (card) { return card.button === event.target; });
      if (index < 0 || !/^(ArrowRight|ArrowLeft|ArrowUp|ArrowDown|Home|End)$/.test(event.key)) return;
      var rtl = document.documentElement.dir !== 'ltr', delta = event.key === 'ArrowDown' ? 2 : event.key === 'ArrowUp' ? -2 : event.key === 'ArrowRight' ? (rtl ? -1 : 1) : (rtl ? 1 : -1);
      var next = event.key === 'Home' ? 0 : event.key === 'End' ? visible.length - 1 : Math.max(0, Math.min(visible.length - 1, index + delta));
      event.preventDefault(); visible[next].button.focus();
    });
    return {
      render: draw,
      reset: function () { stopImages(true); search.value = ''; manual = false; },
      opened: function () { active = true; cards.forEach(function (card) { if (card.button.dataset.imageState === 'unavailable') imageState(card, 'idle'); }); draw(); loadImages(); },
      closed: function () { active = false; stopImages(false); },
      refreshImages: loadImages,
      online: function () { cards.forEach(function (card) { if (card.button.dataset.imageState === 'unavailable') imageState(card, 'idle'); }); loadImages(); }
    };
  }
  // The canonical dock keeps its nodes, direct handlers and route owner.
  // Relocation makes it part of the existing dialog focus scope.
  function createWizardDockOwnership(modal, options) {
    var dock = document.querySelector('.tm-home-dock'), host = modal.querySelector('.destination-modal'), record = null;
    function opened() {
      if (!dock || !host || record || !options.isOpen()) return;
      record = { parent: dock.parentNode, next: dock.nextSibling, inert: dock.inert, marker: dock.getAttribute('data-wizard-dock') };
      dock.setAttribute('data-wizard-dock', ''); host.appendChild(dock);
    }
    function closed() {
      if (!record) return;
      var saved = record; record = null; dock.inert = saved.inert;
      if (saved.marker === null) dock.removeAttribute('data-wizard-dock'); else dock.setAttribute('data-wizard-dock', saved.marker);
      saved.parent.insertBefore(dock, saved.next && saved.next.parentNode === saved.parent ? saved.next : null);
    }
    if (dock) dock.addEventListener('click', function (event) {
      if (!record || !options.isOpen()) return;
      var action = event.target.closest('[data-modal="destination"],[data-home-route],[data-cloud-account-open]');
      if (!action || !dock.contains(action)) return;
      if (modal.inert || dock.inert) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      if (action.matches('[data-modal="destination"]')) {
        // Already in this wizard: do not run app.js close/reopen or steal focus.
        event.preventDefault(); event.stopImmediatePropagation(); return;
      }
      // Close synchronously before Profile's target handler or native link default.
      // This also handles a same-hash link, which emits no hashchange event.
      options.dismiss();
      if (options.isOpen()) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      closed(); action.focus({ preventScroll: true });
    }, true);
    function leave() { if (record && options.isOpen()) options.dismiss(); }
    window.addEventListener('popstate', leave);
    window.addEventListener('hashchange', leave);
    return { opened: opened, closed: closed, suspend: function (value) { if (record) dock.inert = value || record.inert; } };
  }
  function createWizardModalOwnership(modal, form, options) {
    var background = [], opener = null, nested = null, focusRevision = 0, closing = false;
    function entryFor(node) {
      var entry = background.find(function (item) { return item.node === node; });
      if (!entry) { entry = { node: node, inert: node.inert }; background.push(entry); }
      return entry;
    }
    function inertBackground() {
      if (!options.isOpen() || closing) return;
      if (nested && !current(nested)) release(nested, true, false);
      Array.prototype.forEach.call(document.body.children, function (node) {
        if (node === modal || /^(SCRIPT|STYLE|LINK)$/.test(node.tagName)) return;
        entryFor(node); node.inert = !(nested && current(nested) && nested.node === node);
      });
    }
    function restoreWizard(record) {
      if (options.dock) options.dock.suspend(false);
      modal.inert = record.wizardInert;
      if (record.wizardModal === null) modal.removeAttribute('aria-modal'); else modal.setAttribute('aria-modal', record.wizardModal);
    }
    function closeOwnership() {
      closing = false;
      if (nested) release(nested, true, false);
      if (options.dock) options.dock.closed();
      background.forEach(function (entry) { entry.node.inert = entry.inert; }); background = [];
      if (opener && opener.isConnected && modal.contains(document.activeElement)) opener.focus({ preventScroll: true });
    }
    function release(record, close, returnFocus) {
      if (nested !== record) return;
      nested = null; focusRevision += 1; clearTimeout(record.cancelTimer); record.observer.disconnect(); restoreWizard(record);
      // Close through the canonical sheet action, never by emulating its state.
      if (close && !record.node.hidden) record.close.click();
      record.node.inert = options.isOpen() ? true : record.entry.inert;
      if (returnFocus && options.isOpen() && options.identity() === record.identity && record.opener.isConnected && record.opener.getClientRects().length) record.opener.focus({ preventScroll: true });
    }
    function current(record) { return nested === record && options.isOpen() && options.identity() === record.identity; }
    function reconcile(record) {
      if (nested !== record) return;
      var state = options.snapshot();
      if (!current(record) || state.step !== 2 || state.busy || state.prepared) { release(record, true, false); return; }
      if (record.node.hidden) { release(record, false, true); return; }
      record.active = true; record.closing = false; clearTimeout(record.cancelTimer); modal.inert = true; modal.setAttribute('aria-modal', 'false');
      record.node.inert = false;
      if (options.dock) options.dock.suspend(true);
      if (!record.sheet.contains(document.activeElement)) record.close.focus({ preventScroll: true });
    }
    function arm(trigger) {
      var state = options.snapshot();
      if (nested || !options.isOpen() || state.step !== 2 || state.busy || state.prepared || trigger.disabled || !trigger.getClientRects().length) return;
      // Only the actual optional wizard launcher may borrow the one canonical
      // recommendation sheet. Other dialogs remain part of the inert background.
      if (!window.TravelMateTripIntelligence || trigger !== form.querySelector('.navo-trip-banner button')) return;
      var nodes = document.querySelectorAll('body>.navo-intelligence-backdrop');
      if (nodes.length !== 1 || !nodes[0].hidden) return;
      var node = nodes[0], sheet = node.querySelector('.navo-intelligence-sheet[role="dialog"][aria-labelledby="navo-intelligence-title"]');
      var close = sheet && sheet.querySelector('[data-navo-close]');
      if (!sheet || !close || !sheet.querySelector('#navo-intelligence-title')) return;
      var entry = entryFor(node); if (entry.inert) return;
      var record = { node: node, sheet: sheet, close: close, entry: entry, opener: trigger, identity: options.identity(), wizardInert: modal.inert, wizardModal: modal.getAttribute('aria-modal'), active: false, closing: false };
      record.observer = new MutationObserver(function () { reconcile(record); }); nested = record; focusRevision += 1;
      record.observer.observe(node, { attributes: true, attributeFilter: ['hidden'] });
      // Release before openSheet's synchronous focus; suspend the wizard only
      // after openSheet has retained its original return-focus element.
      node.inert = false;
      // A trusted click can checkpoint microtasks between capture and target
      // listeners. Hidden is still expected then: openSheet has not run yet.
      // Cancel a non-opening dispatch only in the next task, after propagation.
      record.cancelTimer = setTimeout(function () {
        if (nested === record && !record.active && record.node.hidden) release(record, false, false);
      }, 0);
    }
    document.addEventListener('click', function (event) {
      var trigger = event.target.closest('[data-modal="destination"]'); if (trigger && !options.isOpen()) opener = trigger;
      var launch = event.target.closest('.navo-trip-banner button'); if (launch && form.contains(launch)) arm(launch);
      if (nested && (event.target === nested.node || nested.close.contains(event.target))) { nested.closing = true; restoreWizard(nested); }
      if (options.isOpen() && (event.target === modal || event.target.closest('#modal-destination [data-close]'))) {
        closing = true;
        if (nested) release(nested, true, false);
        if (options.dock) options.dock.closed();
        background.forEach(function (entry) { entry.node.inert = entry.inert; }); background = [];
      }
    }, true);
    document.addEventListener('keydown', function (event) {
      var record = nested;
      if (record && !current(record)) { release(record, true, false); record = null; }
      if (record && !record.node.hidden && (event.key === 'Escape' || event.key === 'Tab')) {
        // Both legacy document traps otherwise run for the same key. During
        // this scoped handoff, only the active recommendation sheet owns it.
        event.stopImmediatePropagation();
        if (event.key === 'Escape') { event.preventDefault(); record.close.click(); reconcile(record); return; }
        var controls = Array.prototype.filter.call(record.sheet.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]'), function (node) { return !node.hidden && node.getClientRects().length; });
        var first = controls[0], last = controls[controls.length - 1];
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || !record.sheet.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !record.sheet.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
        return;
      }
      if (event.key === 'Escape' && options.isOpen()) { closing = true; if (options.dock) options.dock.closed(); background.forEach(function (entry) { entry.node.inert = entry.inert; }); background = []; }
    }, true);
    document.addEventListener('focusin', function (event) {
      var record = nested;
      if (record && record.active && !record.closing && current(record) && !record.node.hidden && !record.sheet.contains(event.target)) record.close.focus({ preventScroll: true });
    }, true);
    // Ask Mate leaves this interaction scope. closeSheet has already hidden
    // recommendations before emitting this canonical event. End the wizard's
    // whole modal transaction before the assistant's own event/focus/history
    // owner runs; never add the assistant to an inert exemption list.
    window.addEventListener('travelmate:ask-ai', function (event) {
      var record = nested, detail = event.detail || {};
      if (!record || !current(record) || !record.node.hidden || detail.source !== 'mate-conversation' || !detail.context || detail.context.contextMode !== 'NEW_TRIP') return;
      options.dismiss();
      if (!options.isOpen()) closeOwnership();
    }, true);
    new MutationObserver(inertBackground).observe(document.body, { childList: true });
    return {
      opened: function () { closing = false; if (options.dock) options.dock.opened(); inertBackground(); },
      ownsFocus: function () { return Boolean(nested && current(nested) && !nested.node.hidden); },
      revision: function () { return focusRevision; },
      reset: function () { if (nested) release(nested, true, false); },
      closed: closeOwnership
    };
  }
  // Presentation adapter only: native form controls and writer ownership stay intact.
  function createWizardScrollLayout(form, back) {
    var scroll = document.createElement('div'), records = [];
    scroll.className = 'trip-wizard-scroll'; scroll.setAttribute('data-wizard-scroll-region', '');
    scroll.hidden = true; form.insertBefore(scroll, back);
    function sync(step) {
      var later = step > 0, typeLabel = form.elements.type.closest('label');
      var types = form.querySelector('.navo-trip-types'), banner = form.querySelector('.navo-trip-banner');
      if (later) {
        Array.prototype.slice.call(form.children).forEach(function (node) {
          if (node === scroll || node === types || node === banner ||
              node === form.elements.country.closest('label') || node === form.elements.city.closest('label') ||
              node.matches('.destination-discovery,[data-wizard-back],[data-wizard-next],.create-trip')) return;
          if (!node.matches('[data-wizard-panel],.trip-wizard-intro,.form-error,.trip-wizard-save-status')) return;
          var marker = document.createComment('wizard-content-position');
          form.insertBefore(marker, node); records.push({ node: node, marker: marker }); scroll.appendChild(node);
        });
        if (types && (types.parentNode !== scroll || typeLabel.nextElementSibling !== types)) typeLabel.after(types);
        if (banner && (banner.parentNode !== scroll || scroll.lastElementChild !== banner)) scroll.appendChild(banner);
      } else {
        records.forEach(function (item) { form.insertBefore(item.node, item.marker); item.marker.remove(); });
        records = [];
        if (types && (types.parentNode !== form || typeLabel.nextElementSibling !== types)) typeLabel.after(types);
        if (banner && (banner.parentNode !== form || banner.nextElementSibling !== back)) form.insertBefore(banner, back);
      }
      [types, banner].forEach(function (node) { if (node && node.hidden !== (step !== 2)) node.hidden = step !== 2; });
      if (scroll.hidden !== !later) scroll.hidden = !later;
      if (form.dataset.wizardScroll !== String(later)) form.dataset.wizardScroll = String(later);
    }
    function revealFocused() {
      var focused = document.activeElement;
      if (scroll.hidden || !focused || !scroll.contains(focused) || !focused.getClientRects().length) return;
      focused.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    }
    return { sync: sync, revealFocused: revealFocused };
  }

  function initDestinationWizard(form) {
    var modal = document.getElementById('modal-destination');
    var heading = form.querySelector('[data-wizard-heading]');
    var progress = modal.querySelector('[data-wizard-progress-label]');
    var next = form.querySelector('[data-wizard-next]'), back = form.querySelector('[data-wizard-back]');
    var confirm = form.querySelector('.create-trip'), error = form.querySelector('[data-form-error]');
    var status = form.querySelector('[data-wizard-save-status]');
    var names = ['country', 'city', 'start', 'end', 'budget', 'type'];
    var titles = ['לאן רוצים לטוס?', 'מתי יוצאים לדרך?', 'איך תרצו לטייל?', 'הטיול שלכם, לפני שיוצאים'];
    var labels = ['יעד', 'תאריכים', 'העדפות ותקציב', 'סיכום'];
    var scrollLayout = createWizardScrollLayout(form, back);
    var intro = form.querySelector('.trip-wizard-intro p');
    var descriptions = [intro.textContent, 'בחרו את יום היציאה ואת יום החזרה כדי לקבוע את משך הטיול.', 'בחרו את סוג הטיול והגדירו תקציב כולל באירו שמתאים לכם.', 'בדקו את פרטי הטיול המרוכזים כאן.'];
    function defaults() {
      if (ownership) ownership.reset();
      if (discovery) discovery.reset();
      form.reset();
      var today = new Date(), next = new Date(today.getTime() + 7 * 86400000);
      form.elements.start.value = localDateString(today); form.elements.end.value = localDateString(next);
      names.forEach(function (name) { form.elements[name].dispatchEvent(new Event('change', { bubbles: true })); });
    }
    function readFields() {
      var value = { budget: Number(form.elements.budget.value || 2500) }; names.forEach(function (name) { if (name !== 'budget') value[name] = form.elements[name].value; });
      value.budgetBadInput = Boolean(form.elements.budget.validity && form.elements.budget.validity.badInput);
      value.allowedTypes = Array.prototype.map.call(form.elements.type.options, function (option) { return option.value; });
      return value;
    }
    function identity() { try { return String(localStorage.getItem('travelmate-active-user') || ''); } catch (_) { return String(currentSession && currentSession.user && currentSession.user.id || ''); } }
    function render(state, focus) {
      form.dataset.wizardStep = String(state.step);
      modal.dataset.wizardStep = String(state.step);
      if (state.preparedFields) names.forEach(function (name) { form.elements[name].value = state.preparedFields[name]; });
      form.querySelectorAll('[data-wizard-panel]').forEach(function (panel) { panel.hidden = Number(panel.dataset.wizardPanel) !== state.step; });
      modal.querySelectorAll('[data-wizard-progress]').forEach(function (item, index) {
        if (index === state.step) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current');
        item.dataset.complete = String(index < state.step);
      });
      heading.textContent = titles[state.step];
      intro.textContent = descriptions[state.step];
      progress.textContent = 'שלב ' + (state.step + 1) + ' מתוך 4 · ' + labels[state.step];
      error.textContent = state.error; status.textContent = state.status;
      error.hidden = !state.error; status.hidden = !state.status;
      next.hidden = state.step === 3; confirm.hidden = state.step !== 3; back.hidden = state.step === 0;
      next.disabled = state.busy || state.prepared; back.disabled = state.busy || state.prepared; confirm.disabled = state.busy;
      confirm.textContent = state.busy ? 'שומר…' : state.created ? 'פתיחת הטיול שנשמר' : state.prepared ? 'ניסיון שמירה נוסף' : 'אישור ויצירת הטיול';
      confirm.setAttribute('aria-busy', String(state.busy));
      names.forEach(function (name) { var input = form.elements[name]; input.disabled = state.busy || state.prepared; input.setAttribute('aria-invalid', String(state.field === name)); });
      form.querySelectorAll('[data-wizard-edit]').forEach(function (button) { button.disabled = state.busy || state.prepared; });
      if (discovery) { discovery.render(); if (modal.classList.contains('open')) discovery.refreshImages(); }
      if (state.step === 3) {
        var result = validateDestinationFields(readFields());
        if (result.value) {
          var value = result.value;
          form.querySelector('[data-wizard-summary="destination"]').textContent = value.city + ', ' + value.country;
          form.querySelector('[data-wizard-summary="dates"]').textContent = formatDate(value.start) + ' – ' + formatDate(value.end);
          form.querySelector('[data-wizard-summary="days"]').textContent = value.days === 1 ? 'יום אחד' : value.days + ' ימים';
          form.querySelector('[data-wizard-summary="preferences"]').textContent = value.type;
          form.querySelector('[data-wizard-summary="budget"]').textContent = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value.budget);
        }
      }
      scrollLayout.sync(state.step);
      var focusIdentity = identity(), focusRevision = ownership ? ownership.revision() : 0;
      if (focus) requestAnimationFrame(function () {
        if (!modal.classList.contains('open') || controller.snapshot().step !== state.step || identity() !== focusIdentity || ownership && (ownership.ownsFocus() || ownership.revision() !== focusRevision)) return;
        var target = focus === 'heading' ? heading : form.elements[focus];
        if (!target || !target.getClientRects().length) target = heading;
        target.focus({ preventScroll: true }); target.scrollIntoView({ block: 'nearest' });
      });
    }
    defaults();
    var controller = createDestinationWizard({
      identity: identity, readFields: readFields, resetFields: defaults, render: render,
      isOpen: function () { return modal.classList.contains('open'); },
      newId: function () { return String(Date.now()); },
      canSaveLocal: function () { return Boolean(cloud && typeof cloud.upsertLocalTrip === 'function'); },
      localSave: function (trip) { return cloud.upsertLocalTrip(trip); },
      readLocalTrip: function (id, owner) {
        if (!cloud || typeof cloud.getLocalTrips !== 'function') return null;
        return cloud.getLocalTrips().find(function (trip) { return String(trip.id) === id && String(trip.ownerId || '') === owner; }) || null;
      },
      attachPending: function (trip) { if (window.TravelMateTripIntelligence) window.TravelMateTripIntelligence.attachPendingToTrip(trip); },
      shouldCloudSave: function (owner) { return Boolean(owner && currentSession && currentSession.user && String(currentSession.user.id) === owner && navigator.onLine !== false); },
      cloudSave: function (trip, owner) { return cloud && typeof cloud.saveTrip === 'function' ? cloud.saveTrip(trip, owner) : Promise.resolve({ saved: false }); },
      openTrip: function (id) { location.href = 'trip/custom/index.html?id=' + encodeURIComponent(id); }
    });
    var discovery = createDestinationDiscovery(form, {
      identity: identity, snapshot: controller.snapshot, isOpen: function () { return modal.classList.contains('open'); },
      editable: function () { if (controller.syncIdentity()) return false; var state = controller.snapshot(); return state.step === 0 && !state.busy && !state.prepared; }
    });
    form.noValidate = true;
    next.addEventListener('click', controller.next); back.addEventListener('click', controller.back);
    form.addEventListener('submit', function (event) { event.preventDefault(); controller.confirm(); });
    form.addEventListener('click', function (event) { var button = event.target.closest('[data-wizard-edit]'); if (button) controller.edit(Number(button.dataset.wizardEdit)); });
    // Retain compatibility with optional existing intelligence decorators: both
    // destination labels and the final submit stay direct children of this form.
    new MutationObserver(function () {
      var changed = false;
      form.querySelectorAll('.navo-trip-types,.navo-trip-banner').forEach(function (node) {
        if (node.dataset.wizardPanel !== '2') { node.dataset.wizardPanel = '2'; changed = true; }
      });
      if (changed) render(controller.snapshot(), '');
      else scrollLayout.sync(controller.snapshot().step);
    }).observe(form, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
    var dock = createWizardDockOwnership(modal, { isOpen: function () { return modal.classList.contains('open'); }, dismiss: function () { modal.querySelector('[data-close]').click(); } });
    var ownership = createWizardModalOwnership(modal, form, { dock: dock, identity: identity, snapshot: controller.snapshot, isOpen: function () { return modal.classList.contains('open'); }, dismiss: function () { modal.querySelector('[data-close]').click(); } });
    function measureViewport() {
      if (!modal.classList.contains('open')) return;
      var viewport = window.visualViewport;
      modal.dataset.wizardCompact = String((viewport ? viewport.height : window.innerHeight) < 560);
      modal.style.setProperty('--tm-wizard-viewport-height', (viewport ? viewport.height : window.innerHeight) + 'px');
      modal.style.setProperty('--tm-wizard-viewport-top', (viewport ? viewport.offsetTop : 0) + 'px');
      scrollLayout.revealFocused();
    }
    new MutationObserver(function () {
      if (modal.classList.contains('open')) {
        ownership.opened();
        measureViewport(); controller.opened(); discovery.opened();
      } else {
        ownership.closed(); discovery.closed(); controller.closed();
      }
    }).observe(modal, { attributes: true, attributeFilter: ['class'] });
    if (window.visualViewport) { window.visualViewport.addEventListener('resize', measureViewport); window.visualViewport.addEventListener('scroll', measureViewport); }
    window.addEventListener('resize', measureViewport);
    window.addEventListener('online', function () { if (modal.classList.contains('open')) discovery.online(); });
    window.addEventListener('travelmate:account-context-changed', controller.syncIdentity);
    window.addEventListener('storage', function (event) { if (event.key === 'travelmate-active-user') controller.syncIdentity(); });
    render(controller.snapshot(), '');
    return controller;
  }

  if (form) destinationWizard = initDestinationWizard(form);

  prepareStaticTrips();
  organizeStaticTrips();
  document.querySelectorAll('a[href="#trip-archive"]').forEach(function (link) {
    link.addEventListener('click', openArchiveFromNavigation);
  });
  function openArchiveRoute() {
    if (location.hash === '#trip-archive') openArchiveFromNavigation();
  }
  openArchiveRoute();
  window.addEventListener('hashchange', openArchiveRoute);

  if (!cloud) {
    setMessage('חיבור הענן אינו זמין כרגע. הטיולים נשמרים במכשיר בלבד.', true);
    return;
  }
  function restoreSession() {
    hydrateCachedTrips();
    var generation = sessionGeneration;
    cloud.getSession().then(function (session) {
      if (generation === sessionGeneration) setSession(session);
    }).catch(function () {
      if (generation !== sessionGeneration) return;
      hydrateCachedTrips();
      paintHomeState('error');
      filterHomeTrips();
      setMessage('חיבור הענן אינו זמין כרגע. הטיולים השמורים זמינים במכשיר.', true);
    });
    if (authSubscribed || authSubscriptionPending) return;
    authSubscriptionPending = true;
    cloud.onAuthChange(function (event, session) {
      if (event === 'PASSWORD_RECOVERY') { showPasswordForm(session, true); return; }
      setSession(session);
    }).then(function () { authSubscribed = true; }).catch(function () {
      // Reconnection can load the SDK and subscribe again.
    }).finally(function () { authSubscriptionPending = false; });
  }
  restoreSession();
  window.addEventListener('online', restoreSession);
  window.addEventListener('travelmate:local-trips-updated', hydrateCachedTrips);
  window.addEventListener('storage', function (event) {
    var change = cloud.cacheChangeType(event.key);
    if (change === 'account') setSession(null);
    else if (change === 'trips') hydrateCachedTrips();
  });
  window.addEventListener('travelmate:user-profile-ready', function () {
    if (!currentSession) return;
    renderPersonalization(currentSession);
    renderAdaptiveHome(Array.from(renderedTrips.values()));
  });
  window.addEventListener('travelmate:profile-change', function (event) {
    if (!currentSession) return;
    if (event.detail && event.detail.user) {
      if (String(event.detail.user.id) !== String(currentSession.user.id)) return;
      currentSession.user = event.detail.user;
    }
    renderPersonalization(currentSession);
    renderAdaptiveHome(Array.from(renderedTrips.values()));
  });
})();

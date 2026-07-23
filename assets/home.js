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
  var currentSession = null;
  var passwordChangeMode = false;
  var renderedTrips = new Map();
  var staticActivityKey = 'travelmate-static-trip-activity';

  (function initHomeCarousel() {
    var carousel = document.querySelector('[data-home-carousel]');
    if (!carousel) return;
    var track = carousel.querySelector('.carousel-track');
    var extraDestinationImages = [
      'photo-1502602898657-3e91760cbb34','photo-1493976040374-85c8e12f0c0e','photo-1533104816931-20fa691ff6ca','photo-1516483638261-f4dbaf036963',
      'photo-1505765050516-f72dcac9c60e','photo-1528127269322-539801943592','photo-1548013146-72479768bada','photo-1469474968028-56623f02e42e',
      'photo-1507525428034-b723cf961d3e','photo-1510414842594-a61c69b5ae57','photo-1483683804023-6ccdb62f86ef','photo-1494526585095-c41746248156',
      'photo-1512100356356-de1b84283e18','photo-1530789253388-582c481c54b0','photo-1500534314209-a25ddb2bd429','photo-1518548419970-58e3b4079ab2',
      'photo-1516426122078-c23e76319801','photo-1501785888041-af3ef285b470','photo-1526772662000-3f88f10405ff','photo-1470214304380-aadaedcfff1b'
    ];
    extraDestinationImages.forEach(function (imageId) {
      var slide = document.createElement('article');
      slide.className = 'destination-slide';
      slide.dataset.carouselSlide = '';
      slide.style.setProperty('--slide-image', "url('https://images.unsplash.com/" + imageId + "?auto=format&fit=crop&w=900&q=84')");
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
    function showSlide(index) {
      activeIndex = (index + slides.length) % slides.length;
      slides.forEach(function (slide, slideIndex) {
        var offset = slideIndex - activeIndex;
        if (offset > slides.length / 2) offset -= slides.length;
        if (offset < -slides.length / 2) offset += slides.length;
        var distance = Math.abs(offset);
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
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        timer = setInterval(function () { showSlide(activeIndex + 1); }, 3800);
      }
    }
    carousel.querySelector('[data-carousel-previous]').addEventListener('click', function () { showSlide(activeIndex - 1); restart(); });
    carousel.querySelector('[data-carousel-next]').addEventListener('click', function () { showSlide(activeIndex + 1); restart(); });
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
    archive.dataset.tripArchive = '';
    archive.innerHTML = '<button class="trip-archive-toggle" type="button" data-archive-toggle aria-expanded="false"><i class="fa-solid fa-box-archive"></i><span><strong>ארכיון הטיולים</strong><small>טיול עתידי יופעל אוטומטית שבוע לפני היציאה</small></span><b data-archive-count>0</b><i class="fa-solid fa-chevron-down"></i></button><div class="modules trip-archive-list" data-archive-list hidden></div>';
    list.insertAdjacentElement('afterend', archive);
    archive.querySelector('[data-archive-toggle]').addEventListener('click', function (event) {
      var expanded = event.currentTarget.getAttribute('aria-expanded') === 'true';
      event.currentTarget.setAttribute('aria-expanded', String(!expanded));
      archive.querySelector('[data-archive-list]').hidden = expanded;
    });
    return archive;
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
    shell.innerHTML = '<a class="trip-card" href="' + escapeText(href) + '" style="background-image:url(\'' + escapeText(background) + '\')"><span class="trip-overlay"></span><span class="trip-flag trip-country-flag" aria-label="דגל ' + escapeText(trip.country) + '">' + countryFlag(trip.country) + '</span><span class="trip-copy"><span class="trip-date-state' + (state.now ? ' now' : '') + '"><i class="fa-solid ' + state.icon + '"></i> ' + escapeText(state.label) + '</span><h2>' + escapeText(trip.country) + '</h2><p>' + escapeText(trip.city) + '</p><span class="tag">' + (trip.start ? formatDate(trip.start) + ' – ' + formatDate(trip.end) : '') + '</span> <span class="tag">' + escapeText(trip.days) + ' ימים</span><strong>פתיחת הטיול <i class="fa-solid fa-arrow-left"></i></strong></span></a><button class="trip-activity-toggle' + (state.active ? ' active' : '') + '" type="button" data-trip-activity aria-pressed="' + String(state.active) + '"><i class="fa-solid fa-circle"></i><span>' + (state.active ? 'פעיל' : 'לא פעיל') + '</span></button>';
    return shell;
  }

  function tripCard(trip) {
    var images = window.TravelMateDestinationImages;
    var background = images && images.cached(trip.city, trip.country) || images && images.fallback || 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=1200&q=80';
    var shell = cardShell(trip, false, 'trip/custom/index.html?id=' + encodeURIComponent(trip.id), background);
    if (images) images.apply(shell.querySelector('.trip-card'), trip.city, trip.country);
    return shell;
  }

  function renderTrips(trips) {
    if (!list) return;
    document.querySelectorAll('[data-cloud-trip]').forEach(function (node) { node.remove(); });
    var archiveList = ensureArchive().querySelector('[data-archive-list]');
    renderedTrips = new Map(trips.map(function (trip) { return [String(trip.id), trip]; }));
    trips.forEach(function (trip) {
      var active = dateState(trip).active;
      (active ? list : archiveList).insertBefore(tripCard(trip), active ? addButton : null);
    });
    updateCounts();
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
    var activeCount = list.querySelectorAll('.trip-card-shell').length;
    var archiveCount = archiveList.querySelectorAll('.trip-card-shell').length;
    document.querySelector('[data-active-count]').textContent = String(activeCount);
    archive.querySelector('[data-archive-count]').textContent = String(archiveCount);
    var empty = archiveList.querySelector('.trip-archive-empty');
    if (!archiveCount && !empty) {
      empty = document.createElement('div'); empty.className = 'trip-archive-empty'; empty.textContent = 'הארכיון ריק כרגע.'; archiveList.appendChild(empty);
    }
    if (archiveCount && empty) empty.remove();
  }

  document.addEventListener('click', async function (event) {
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
    panel.innerHTML = '<div class="cloud-account-copy"><span class="cloud-account-icon"><i class="fa-solid fa-cloud"></i></span><div><strong>סנכרון בין המחשב לטלפון</strong><small data-cloud-message>התחברו כדי לשמור את כל הטיולים בענן הפרטי.</small></div></div><form data-cloud-auth-form><input name="email" type="email" autocomplete="email" required placeholder="כתובת דוא״ל"><input name="password" type="password" autocomplete="current-password" minlength="8" required placeholder="סיסמת החשבון"><button type="submit">כניסה</button><button type="button" class="secondary" data-cloud-signup>יצירת חשבון</button><button type="button" class="secondary" data-cloud-resend>לא קיבלתי מייל · שלח שוב</button></form><form data-cloud-password-form hidden><input name="newPassword" type="password" autocomplete="new-password" minlength="8" required placeholder="סיסמה חדשה · לפחות 8 תווים"><input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" required placeholder="אימות הסיסמה החדשה"><button type="submit"><i class="fa-solid fa-key"></i> שמירת סיסמה חדשה</button><button type="button" class="secondary" data-cloud-password-cancel>ביטול</button></form><div class="cloud-account-session" data-cloud-session hidden><span><i class="fa-solid fa-circle-check"></i> מחובר/ת בתור <strong data-cloud-email></strong></span><button type="button" data-cloud-sync-now><i class="fa-solid fa-arrows-rotate"></i> סנכרון עכשיו</button><button type="button" class="secondary" data-cloud-change-password><i class="fa-solid fa-key"></i> שינוי סיסמה</button><button type="button" class="secondary" data-cloud-signout>יציאה</button></div>';
    panel.classList.add('cloud-account-split');
    panel.querySelector('.cloud-account-copy').insertAdjacentHTML('afterbegin', '<span class="cloud-auth-kicker"><i class="fa-solid fa-route"></i> TravelMate</span>');
    panel.querySelector('.cloud-account-copy strong').textContent = 'ברוכים הבאים';
    panel.querySelector('[data-cloud-auth-form]').insertAdjacentHTML('afterbegin', '<div class="cloud-auth-intro"><strong>התחברות לחשבון</strong><span>הטיולים, המסמכים והתוכניות שלך מחכים בענן הפרטי.</span></div>');
    panel.insertAdjacentHTML('afterbegin', '<button class="cloud-account-close" type="button" data-cloud-account-close aria-label="סגירת חלון ההתחברות"><i class="fa-solid fa-xmark"></i></button>');
    panel.querySelector('.cloud-account-copy strong').id = 'cloud-account-title';
    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);
    return panel;
  }

  var accountPanel = createAccountPanel();
  var authForm = accountPanel.querySelector('[data-cloud-auth-form]');
  var passwordForm = accountPanel.querySelector('[data-cloud-password-form]');
  var sessionPanel = accountPanel.querySelector('[data-cloud-session]');
  var message = accountPanel.querySelector('[data-cloud-message]');
  var accountBackdrop = accountPanel.closest('[data-cloud-account-backdrop]');
  var accountOpenButton = document.querySelector('[data-cloud-account-open]');

  function openAccountModal() {
    accountBackdrop.hidden = false;
    accountBackdrop.setAttribute('aria-hidden', 'false');
    document.body.classList.add('cloud-account-open');
    var firstField = accountPanel.querySelector('form:not([hidden]) input');
    if (firstField) firstField.focus();
  }

  function closeAccountModal() {
    accountBackdrop.hidden = true;
    accountBackdrop.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('cloud-account-open');
    if (accountOpenButton) accountOpenButton.focus();
  }

  if (accountOpenButton) accountOpenButton.addEventListener('click', openAccountModal);
  accountPanel.querySelector('[data-cloud-account-close]').addEventListener('click', closeAccountModal);
  accountBackdrop.addEventListener('click', function (event) {
    if (event.target === accountBackdrop) closeAccountModal();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !accountBackdrop.hidden) closeAccountModal();
  });

  function setMessage(value, error) {
    message.textContent = value;
    message.classList.toggle('error', Boolean(error));
  }

  function authMessage(error) {
    var value = String(error && (error.message || error.code) || '');
    if (/email not confirmed/i.test(value)) return 'החשבון עדיין לא אומת. לחץ על „לא קיבלתי מייל” כדי לשלוח שוב.';
    if (/email address not authorized/i.test(value)) return 'Supabase אינו מורשה לשלוח לכתובת הזו. יש להגדיר SMTP פרטי או להשתמש בכתובת של חבר צוות הפרויקט.';
    if (/rate limit|too many requests|over_email_send_rate_limit/i.test(value)) return 'הגעת למגבלת השליחה של Supabase. המתן כשעה ונסה שוב, או הגדר SMTP פרטי.';
    if (/invalid login/i.test(value)) return 'כתובת הדוא״ל או הסיסמה אינן נכונות. אם טרם אימתת את החשבון, שלח שוב את מייל האימות.';
    return 'הפעולה נכשלה: ' + (value || 'נסה שוב בעוד רגע.');
  }

  function setSession(session) {
    currentSession = session;
    document.body.classList.toggle('is-authenticated', Boolean(session));
    if (passwordChangeMode && session) return;
    authForm.hidden = Boolean(session);
    passwordForm.hidden = true;
    sessionPanel.hidden = !session;
    accountPanel.querySelector('[data-cloud-email]').textContent = session && session.user ? session.user.email : '';
    if (accountOpenButton) {
      accountOpenButton.innerHTML = session ? 'החשבון שלי' : '<span>התחברות</span>';
    }
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
      renderTrips(cloud ? cloud.getLocalTrips() : []);
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
    setMessage('מסנכרן/ת את הטיולים…');
    try {
      var trips = await cloud.syncLocalTrips();
      renderTrips(trips);
      setMessage('הכול מסונכרן · ' + trips.length + ' טיולים זמינים בכל המכשירים');
    } catch (error) {
      console.error('TravelMate trip sync failed', error);
      var missingTable = /travel_trips|schema cache|does not exist/i.test(String(error && error.message || ''));
      setMessage(missingTable ? 'טבלת סנכרון הטיולים עדיין לא הופעלה ב־Supabase.' : 'הסנכרון נכשל זמנית. הטיולים נשארו שמורים במכשיר.', true);
    }
  }

  authForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    setMessage('מתחבר/ת…');
    var result = await cloud.signIn(authForm.elements.email.value.trim(), authForm.elements.password.value);
    if (result.error) setMessage(authMessage(result.error), true);
  });

  accountPanel.querySelector('[data-cloud-signup]').addEventListener('click', async function () {
    if (!authForm.reportValidity()) return;
    setMessage('יוצר/ת חשבון…');
    var result = await cloud.signUp(authForm.elements.email.value.trim(), authForm.elements.password.value, cloud.authRedirectUrl());
    if (result.error) setMessage(authMessage(result.error), true);
    else if (!result.data.session && result.data.user && Array.isArray(result.data.user.identities) && !result.data.user.identities.length) setMessage('כבר קיים חשבון עם הכתובת הזו. לחץ על „לא קיבלתי מייל” לשליחה חוזרת, או נסה להתחבר.');
    else if (!result.data.session) setMessage('בקשת ההרשמה התקבלה. בדוק גם בספאם; אם המייל לא הגיע, לחץ על „שלח שוב”.');
  });
  accountPanel.querySelector('[data-cloud-resend]').addEventListener('click', async function (event) {
    if (!authForm.elements.email.reportValidity()) return;
    var button = event.currentTarget; button.disabled = true; setMessage('שולח שוב את מייל האימות…');
    var result = await cloud.resendSignup(authForm.elements.email.value.trim(), cloud.authRedirectUrl());
    if (result.error) { setMessage(authMessage(result.error), true); button.disabled = false; return; }
    setMessage('מייל אימות נוסף נשלח. בדוק גם בתיקיות ספאם וקידומי מכירות.');
    button.textContent = 'נשלח · אפשר שוב בעוד דקה';
    setTimeout(function () { button.disabled = false; button.textContent = 'לא קיבלתי מייל · שלח שוב'; }, 60000);
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

  if (form) {
    var today = new Date();
    var next = new Date(today.getTime() + 7 * 86400000);
    form.elements.start.value = today.toISOString().slice(0, 10);
    form.elements.end.value = next.toISOString().slice(0, 10);
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      var error = form.querySelector('[data-form-error]');
      var days = daysBetween(form.elements.start.value, form.elements.end.value);
      if (days < 1) { error.textContent = 'תאריך החזרה חייב להיות אחרי תאריך היציאה.'; return; }
      if (days > 60) { error.textContent = 'אפשר לבנות כרגע טיול של עד 60 ימים.'; return; }
      var trip = { id: String(Date.now()), country: form.elements.country.value.trim(), city: form.elements.city.value.trim(), start: form.elements.start.value, end: form.elements.end.value, budget: Number(form.elements.budget.value || 2500), type: form.elements.type.value, days: days, savedPlaces: [], activities: [], dayNotes: {} };
      cloud.upsertLocalTrip(trip);
      if (currentSession) {
        try { await cloud.saveTrip(trip); }
        catch (saveError) { console.error('Initial cloud trip save failed', saveError); }
      }
      location.href = 'trip/custom/index.html?id=' + encodeURIComponent(trip.id);
    });
  }

  prepareStaticTrips();
  organizeStaticTrips();

  if (!cloud) {
    setMessage('חיבור הענן אינו זמין כרגע. הטיולים נשמרים במכשיר בלבד.', true);
    return;
  }
  cloud.getSession().then(setSession).catch(function () { setMessage('לא ניתן להתחבר לענן כרגע.', true); });
  cloud.onAuthChange(function (event, session) {
    if (event === 'PASSWORD_RECOVERY') {
      showPasswordForm(session, true);
      return;
    }
    setSession(session);
  });
})();

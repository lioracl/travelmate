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
    var panel = document.createElement('section');
    panel.className = 'cloud-account';
    panel.dataset.cloudAccount = '';
    panel.innerHTML = '<div class="cloud-account-copy"><span class="cloud-account-icon"><i class="fa-solid fa-cloud"></i></span><div><strong>סנכרון בין המחשב לטלפון</strong><small data-cloud-message>התחברו כדי לשמור את כל הטיולים בענן הפרטי.</small></div></div><form data-cloud-auth-form><input name="email" type="email" autocomplete="email" required placeholder="כתובת דוא״ל"><input name="password" type="password" autocomplete="current-password" minlength="8" required placeholder="סיסמת החשבון"><button type="submit">כניסה</button><button type="button" class="secondary" data-cloud-signup>יצירת חשבון</button><button type="button" class="secondary" data-cloud-resend>לא קיבלתי מייל · שלח שוב</button></form><form data-cloud-password-form hidden><input name="newPassword" type="password" autocomplete="new-password" minlength="8" required placeholder="סיסמה חדשה · לפחות 8 תווים"><input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" required placeholder="אימות הסיסמה החדשה"><button type="submit"><i class="fa-solid fa-key"></i> שמירת סיסמה חדשה</button><button type="button" class="secondary" data-cloud-password-cancel>ביטול</button></form><div class="cloud-account-session" data-cloud-session hidden><span><i class="fa-solid fa-circle-check"></i> מחובר/ת בתור <strong data-cloud-email></strong></span><button type="button" data-cloud-sync-now><i class="fa-solid fa-arrows-rotate"></i> סנכרון עכשיו</button><button type="button" class="secondary" data-cloud-change-password><i class="fa-solid fa-key"></i> שינוי סיסמה</button><button type="button" class="secondary" data-cloud-signout>יציאה</button></div>';
    var hero = document.querySelector('main > .hero');
    hero.insertAdjacentElement('afterend', panel);
    return panel;
  }

  var accountPanel = createAccountPanel();
  var authForm = accountPanel.querySelector('[data-cloud-auth-form]');
  var passwordForm = accountPanel.querySelector('[data-cloud-password-form]');
  var sessionPanel = accountPanel.querySelector('[data-cloud-session]');
  var message = accountPanel.querySelector('[data-cloud-message]');

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
    if (passwordChangeMode && session) return;
    authForm.hidden = Boolean(session);
    passwordForm.hidden = true;
    sessionPanel.hidden = !session;
    accountPanel.querySelector('[data-cloud-email]').textContent = session && session.user ? session.user.email : '';
    if (session) {
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

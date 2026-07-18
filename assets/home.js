(function () {
  'use strict';

  var form = document.querySelector('[data-destination-form]');
  var list = document.querySelector('[data-trip-list]');
  var addButton = list && list.querySelector('.add-destination');
  var cloud = window.TravelMateCloud;
  var currentSession = null;
  var passwordChangeMode = false;

  function daysBetween(start, end) { return Math.floor((new Date(end) - new Date(start)) / 86400000) + 1; }
  function formatDate(value) { return new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value + 'T12:00:00')); }
  function escapeText(value) { return String(value || '').replace(/[&<>"']/g, function (character) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]; }); }

  function tripCard(trip) {
    var link = document.createElement('a');
    link.className = 'trip-card cloud-trip-card';
    link.dataset.cloudTrip = String(trip.id);
    link.href = 'trip/custom/index.html?id=' + encodeURIComponent(trip.id);
    link.style.backgroundImage = "url('https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=1200&q=80')";
    link.innerHTML = '<span class="trip-overlay"></span><span class="trip-flag">✈️</span><span class="trip-copy"><h2>' + escapeText(trip.country) + '</h2><p>' + escapeText(trip.city) + '</p><span class="tag">' + formatDate(trip.start) + ' – ' + formatDate(trip.end) + '</span> <span class="tag">' + trip.days + ' ימים</span><strong>פתיחת הטיול <i class="fa-solid fa-arrow-left"></i></strong></span>';
    return link;
  }

  function renderTrips(trips) {
    if (!list) return;
    list.querySelectorAll('[data-cloud-trip]').forEach(function (node) { node.remove(); });
    trips.forEach(function (trip) { list.insertBefore(tripCard(trip), addButton); });
  }

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
    if (session) synchronize();
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

(function () {
  'use strict';

  var cloud = window.TravelMateCloud;
  var currentSession = null;
  var captchaToken = '';
  var pendingFactorId = '';
  var challengeInProgress = false;
  var dialogReturnFocus = null;

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function message(text, error) {
    var node = document.querySelector('[data-security-message]');
    if (!node) return;
    node.textContent = text || '';
    node.classList.toggle('error', Boolean(error));
  }

  function createButton() {
    if (document.querySelector('.security-center-launcher[data-security-open]')) return;
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'security-center-launcher';
    button.dataset.securityOpen = '';
    button.dataset.lazyAccount = '';
    button.innerHTML = '<i class="fa-solid fa-gear" aria-hidden="true"></i><span class="security-launcher-label">הגדרות</span>';
    button.setAttribute('aria-label', 'פתיחת הגדרות');
    var sidebar = document.querySelector(document.body.classList.contains('home-page') ? '.home-sidebar' : '.sidebar');
    if (!sidebar) return document.body.appendChild(button);
    var logout = sidebar.querySelector(':scope > .trip-logout');
    sidebar.insertBefore(button, logout || null);
  }

  function createDialog() {
    if (document.querySelector('[data-security-dialog]')) return;
    var backdrop = document.createElement('section');
    backdrop.className = 'security-center-backdrop';
    backdrop.dataset.securityDialog = '';
    backdrop.hidden = true;
    backdrop.innerHTML = '<div class="security-center" role="dialog" aria-modal="true" aria-labelledby="security-title">' +
      '<header><div><small>התאמה אישית, אבטחה וניהול המכשיר</small><h2 id="security-title">הגדרות</h2></div><button type="button" data-security-close aria-label="סגירה"><i class="fa-solid fa-xmark"></i></button></header>' +
      '<p class="security-message" data-security-message></p>' +
      '<section class="security-profile" data-security-profile><div class="security-profile-head"><span class="security-profile-avatar" data-security-profile-avatar aria-hidden="true"></span><div><small>הפרופיל שלך</small><strong data-security-profile-name>TravelMate</strong><span data-security-profile-email></span></div></div><section class="security-declared-summary" data-security-declared-summary><div><small>מה שסיפרת ל־TravelMate</small><strong>העדפות נסיעה מוצהרות</strong></div><p data-security-profile-completion></p><div class="security-declared-items" data-security-declared-items></div><p data-security-declared-empty hidden>עדיין לא הוגדרו העדפות נסיעה.</p><p data-security-learning-state></p><div class="security-profile-edit-actions"><button type="button" data-profile-wizard-open><i class="fa-solid fa-image" aria-hidden="true"></i> תמונה ואווטר</button><button type="button" data-profile-interests-open><i class="fa-solid fa-heart" aria-hidden="true"></i> תחומי עניין</button></div><small class="security-declared-privacy">העריכה מתבצעת רק באשף הפרופיל. הצעות ש־Mate ילמד בעתיד יוצגו בנפרד וידרשו אישור; מסמכים, הערות פרטיות ו־GPS אינם מקור ללמידה.</small></section><p data-security-profile-note></p></section>' +
      '<section class="security-preferences"><h3>העדפות האפליקציה</h3><div class="settings-list">' +
      '<div class="settings-row"><i class="fa-solid fa-language" aria-hidden="true"></i><span><strong>שפת האפליקציה</strong><small>בחר את שפת הממשק בכל המכשיר הזה</small></span><div class="settings-options" role="group" aria-label="שפת האפליקציה"><button type="button" data-language-choice="he">עברית</button><button type="button" data-language-choice="en">English</button></div></div>' +
      '<div class="settings-row"><i class="fa-solid fa-circle-half-stroke" aria-hidden="true"></i><span><strong>תצוגת האפליקציה</strong><small>בחר מצב בהיר או כהה</small></span><div class="settings-options" role="group" aria-label="תצוגת האפליקציה"><button type="button" data-theme-choice="light"><i class="fa-regular fa-sun"></i> בהיר</button><button type="button" data-theme-choice="dark"><i class="fa-regular fa-moon"></i> כהה</button></div></div>' +
      '<div class="settings-row settings-row-accent"><i class="fa-solid fa-palette" aria-hidden="true"></i><span><strong>ערכת צבע</strong><small>הצבע משפיע על פעולות, בחירה ואייקונים — לא על צבעי אזהרה או הצלחה</small></span><fieldset class="settings-accent-picker"><legend class="sr-only">בחירת ערכת צבע</legend><div role="group" aria-label="בחירת ערכת צבע"><button type="button" data-accent-choice="ocean" aria-label="אוקיינוס"><i></i><span>אוקיינוס</span></button><button type="button" data-accent-choice="emerald" aria-label="אמרלד"><i></i><span>אמרלד</span></button><button type="button" data-accent-choice="teal" aria-label="טורקיז"><i></i><span>טורקיז</span></button><button type="button" data-accent-choice="sunset" aria-label="שקיעה"><i></i><span>שקיעה</span></button><button type="button" data-accent-choice="plum" aria-label="שזיף"><i></i><span>שזיף</span></button><button type="button" data-accent-choice="pink" aria-label="ורוד"><i></i><span>ורוד</span></button></div></fieldset></div>' +
      '<div class="settings-row settings-row-surface"><i class="fa-solid fa-layer-group" aria-hidden="true"></i><span><strong>מראה האפליקציה</strong><small>בחר את סגנון הכרטיסים והפקדים. צבע ההדגשה נבחר בנפרד.</small></span><fieldset class="settings-surface-picker"><legend class="sr-only">בחירת מראה האפליקציה</legend><div role="group" aria-label="בחירת מראה האפליקציה"><button type="button" data-surface-choice="classic"><i class="surface-swatch" aria-hidden="true"></i><span>Classic</span></button><button type="button" data-surface-choice="ice-aqua"><i class="surface-swatch" aria-hidden="true"></i><span>Ice Aqua</span></button><button type="button" data-surface-choice="pearl-blue"><i class="surface-swatch" aria-hidden="true"></i><span>Pearl Blue</span></button><button type="button" data-surface-choice="warm-sand"><i class="surface-swatch" aria-hidden="true"></i><span>Warm Sand</span></button><button type="button" data-surface-choice="soft-lilac"><i class="surface-swatch" aria-hidden="true"></i><span>Soft Lilac</span></button><button type="button" data-surface-choice="nordic-slate"><i class="surface-swatch" aria-hidden="true"></i><span>Nordic Slate</span></button></div></fieldset></div>' +
      '</div></section><div class="settings-section-title"><i class="fa-solid fa-shield-halved"></i><span><strong>אבטחה ופרטיות</strong><small>מצב החשבון ואימות דו־שלבי</small></span></div>' +
      '<section class="security-status" data-security-status></section>' +
      '<section class="security-mfa" data-security-mfa></section>' +
      '<section class="security-actions"><h3>יציאה וניהול המכשיר</h3><div>' +
      '<button type="button" data-security-signout><i class="fa-solid fa-right-from-bracket"></i><span><strong>יציאה מהמכשיר הזה</strong><small>המידע המקומי יישאר במכשיר</small></span></button>' +
      '<button type="button" data-security-signout-all><i class="fa-solid fa-user-lock"></i><span><strong>יציאה מכל המכשירים</strong><small>מומלץ אם טלפון אבד או נגנב</small></span></button>' +
      '<button type="button" class="danger" data-security-clean><i class="fa-solid fa-mobile-screen-button"></i><span><strong>יציאה וניקוי המכשיר</strong><small>מוחק מהמכשיר נתוני TravelMate מקומיים</small></span></button>' +
      '</div></section><footer><i class="fa-solid fa-circle-info"></i> קוד האימות והסיסמה אינם נשמרים באפליקציה.</footer></div>';
    document.body.appendChild(backdrop);
  }

  function createMfaGate() {
    if (document.querySelector('[data-mfa-gate]')) return;
    var gate = document.createElement('section');
    gate.className = 'security-mfa-gate';
    gate.dataset.mfaGate = '';
    gate.hidden = true;
    gate.innerHTML = '<div class="security-mfa-gate-card" role="dialog" aria-modal="true" aria-labelledby="mfa-gate-title">' +
      '<span class="security-mfa-gate-icon"><i class="fa-solid fa-shield-halved"></i></span>' +
      '<small>שלב אבטחה נוסף</small><h2 id="mfa-gate-title">אימות הכניסה</h2>' +
      '<p>הסיסמה אושרה. כדי לפתוח טיולים, הודעות ומסמכים אישיים הזן קוד מאפליקציית האימות.</p>' +
      '<form data-mfa-gate-form><label>קוד בן 6 ספרות<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label><button type="submit">אימות ופתיחת המידע</button><span data-mfa-gate-message aria-live="polite"></span></form>' +
      '<button type="button" class="security-mfa-gate-signout" data-mfa-gate-signout>יציאה מהחשבון</button></div>';
    document.body.appendChild(gate);
  }

  function hideMfaGate() {
    var gate = document.querySelector('[data-mfa-gate]');
    if (gate) gate.hidden = true;
    document.body.classList.remove('security-mfa-required');
  }

  async function enforceMfaChallenge() {
    if (challengeInProgress || !currentSession || !cloud || !cloud.listMfaFactors || !cloud.getAssuranceLevel) {
      if (!currentSession) hideMfaGate();
      return;
    }
    challengeInProgress = true;
    try {
      var factorsResult = await cloud.listMfaFactors();
      if (factorsResult.error) throw factorsResult.error;
      var verified = (factorsResult.data && factorsResult.data.totp || []).filter(function (factor) { return factor.status === 'verified'; });
      var assuranceResult = await cloud.getAssuranceLevel();
      if (assuranceResult.error) throw assuranceResult.error;
      var level = assuranceResult.data || {};
      if (!verified.length || level.currentLevel === 'aal2' || level.nextLevel !== 'aal2') {
        hideMfaGate();
        return;
      }
      createMfaGate();
      var gate = document.querySelector('[data-mfa-gate]');
      var form = gate.querySelector('[data-mfa-gate-form]');
      var status = gate.querySelector('[data-mfa-gate-message]');
      gate.hidden = false;
      document.body.classList.add('security-mfa-required');
      form.onsubmit = async function (event) {
        event.preventDefault();
        var button = form.querySelector('button');
        button.disabled = true; status.textContent = 'מאמת את הקוד…';
        var result = await cloud.challengeAndVerifyTotp(verified[0].id, form.code.value);
        if (result.error) {
          status.textContent = 'הקוד אינו תקין או שפג תוקפו. נסה קוד חדש.';
          form.code.select(); button.disabled = false; return;
        }
        status.textContent = 'הכניסה אושרה.';
        hideMfaGate();
        await refresh();
      };
      gate.querySelector('[data-mfa-gate-signout]').onclick = async function () {
        await cloud.signOut('local');
        location.reload();
      };
      setTimeout(function () { form.code.focus(); }, 40);
    } catch (error) {
      console.error('TravelMate MFA challenge check failed', error);
    } finally {
      challengeInProgress = false;
    }
  }

  function openDialog() {
    var dialog = document.querySelector('[data-security-dialog]');
    if (!dialog) return;
    dialogReturnFocus = document.activeElement && document.activeElement !== document.body ? document.activeElement : document.querySelector('[data-security-open]');
    dialog.hidden = false;
    document.body.classList.add('security-center-open');
    syncPreferences();
    refresh();
    var closeButton = dialog.querySelector('[data-security-close]');
    if (closeButton) requestAnimationFrame(function () { closeButton.focus(); });
  }

  function syncPreferences() {
    var language = window.TravelMateLanguage && window.TravelMateLanguage.get ? window.TravelMateLanguage.get() : 'he';
    var theme = window.TravelMateTheme && window.TravelMateTheme.get ? window.TravelMateTheme.get() : 'light';
    var accent = window.TravelMateTheme && window.TravelMateTheme.getAccent ? window.TravelMateTheme.getAccent() : 'ocean';
    try {
      if (!window.TravelMateLanguage) language = localStorage.getItem('travelmate-language') || 'he';
      if (!window.TravelMateTheme) {
        theme = localStorage.getItem('travelmate-theme') || 'light';
        accent = localStorage.getItem('travelmate-accent') || 'ocean';
      }
    } catch (error) {}
    if (window.TravelMateTheme && window.TravelMateTheme.refreshSurfaceChoices) window.TravelMateTheme.refreshSurfaceChoices();
    document.querySelectorAll('[data-language-choice]').forEach(function (button) {
      var selected = button.dataset.languageChoice === language;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    document.querySelectorAll('[data-theme-choice]').forEach(function (button) {
      var selected = button.dataset.themeChoice === theme;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    document.querySelectorAll('[data-accent-choice]').forEach(function (button) {
      var choice = window.TravelMateTheme && window.TravelMateTheme.normalizeAccent ? window.TravelMateTheme.normalizeAccent(button.dataset.accentChoice) : button.dataset.accentChoice;
      var selected = choice === accent;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function closeDialog() {
    var dialog = document.querySelector('[data-security-dialog]');
    if (!dialog || dialog.hidden) return;
    dialog.hidden = true;
    document.body.classList.remove('security-center-open');
    var target = dialogReturnFocus;
    var mobileMenu = document.querySelector('[data-mobile-menu]');
    dialogReturnFocus = null;
    if (mobileMenu && mobileMenu.offsetParent !== null && window.matchMedia('(max-width: 900px)').matches) target = mobileMenu;
    else if (!target || !document.contains(target) || target.offsetParent === null) target = mobileMenu || document.querySelector('[data-security-open]');
    if (target && document.contains(target) && typeof target.focus === 'function') requestAnimationFrame(function () { target.focus(); });
  }

  function trapDialogFocus(event) {
    var dialog = document.querySelector('[data-security-dialog]');
    if (!dialog || dialog.hidden || event.key !== 'Tab') return;
    var focusable = [].slice.call(dialog.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(function (node) { return node.offsetParent !== null; });
    if (!focusable.length) return;
    var first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    else if (!dialog.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
  }

  function profileFromSession() {
    var user = currentSession && currentSession.user;
    var helper = window.TravelMateUserProfile;
    if (helper && typeof helper.fromUser === 'function') return helper.fromUser(user);
    var email = String(user && user.email || '').trim();
    var name = String(user && user.user_metadata && (user.user_metadata.display_name || user.user_metadata.full_name || user.user_metadata.name) || '').trim();
    if (!name && email) name = email.split('@')[0].replace(/[._-]+/g, ' ').trim();
    return { name: name, firstName: name ? name.split(/\s+/)[0] : '', initials: name ? name.split(/\s+/).slice(0, 2).map(function (part) { return part.charAt(0); }).join('').toUpperCase() : '', avatarUrl: '' };
  }

  function renderProfile() {
    var host = document.querySelector('[data-security-profile]');
    if (!host) return;
    var user = currentSession && currentSession.user;
    var profile = profileFromSession();
    var avatar = host.querySelector('[data-security-profile-avatar]');
    var name = host.querySelector('[data-security-profile-name]');
    var email = host.querySelector('[data-security-profile-email]');
    var note = host.querySelector('[data-security-profile-note]');
    var items = host.querySelector('[data-security-declared-items]');
    var empty = host.querySelector('[data-security-declared-empty]');
    var completion = host.querySelector('[data-security-profile-completion]');
    var learning = host.querySelector('[data-security-learning-state]');
    host.classList.toggle('is-signed-out', !user);
    name.textContent = user ? (profile.name || 'הפרופיל שלי') : 'פרופיל אישי';
    email.textContent = user ? String(user.email || '') : 'יש להתחבר כדי לשמור שם תצוגה בין מכשירים.';
    avatar.textContent = user && !profile.avatarUrl ? profile.initials : '';
    avatar.classList.toggle('has-image', Boolean(user && profile.avatarUrl));
    avatar.style.backgroundImage = user && profile.avatarUrl ? 'url("' + profile.avatarUrl.replace(/"/g, '%22') + '")' : '';
    var helper = window.TravelMateUserProfile;
    var summary = helper && helper.preferenceSummary ? helper.preferenceSummary(profile.preferences) : { items: [], isEmpty: true, learningEnabled: false };
    items.replaceChildren();
    completion.textContent = user ? summary.completionLabel || '' : '';
    summary.items.forEach(function (item) {
      var row = document.createElement('span');
      row.textContent = item.label + ': ' + item.valueLabel;
      items.appendChild(row);
    });
    empty.hidden = !user || !summary.isEmpty;
    learning.hidden = !user;
    learning.classList.toggle('is-enabled', summary.learningEnabled === true);
    learning.textContent = summary.learningEnabled === true ? 'התאמה עתידית: הצטרפת במפורש' : 'התאמה עתידית: כבויה עד להצטרפות מפורשת';
    host.querySelectorAll('[data-profile-wizard-open],[data-profile-interests-open]').forEach(function(button){button.hidden=!user});
    note.textContent = user ? 'הפרופיל וההעדפות נשמרים בחשבון Auth הקיים שלך.' : 'יש להתחבר כדי לנהל את הפרופיל וההעדפות.';
  }

  async function renderMfa() {
    var host = document.querySelector('[data-security-mfa]');
    if (!host) return;
    if (!currentSession || !cloud || !cloud.listMfaFactors) {
      host.innerHTML = '<h3>אימות דו־שלבי</h3><p>יש להתחבר לחשבון כדי להפעיל אימות באפליקציית קודים.</p>';
      return;
    }
    try {
      var factorsResult = await cloud.listMfaFactors();
      if (factorsResult.error) throw factorsResult.error;
      var factors = factorsResult.data && factorsResult.data.totp || [];
      var verified = factors.filter(function (factor) { return factor.status === 'verified'; });
      var assurance = await cloud.getAssuranceLevel();
      var level = assurance.data || {};
      if (verified.length) {
        var needsCode = level.nextLevel === 'aal2' && level.currentLevel !== 'aal2';
        host.innerHTML = '<div class="security-mfa-head"><div><h3>אימות דו־שלבי</h3><p>מופעל באמצעות אפליקציית קודים.</p></div><span class="secure"><i class="fa-solid fa-shield"></i> פעיל</span></div>' +
          (needsCode ? '<form data-mfa-challenge><label>קוד בן 6 ספרות<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label><button type="submit">אימות וכניסה מאובטחת</button></form>' : '<p class="security-good"><i class="fa-solid fa-circle-check"></i> ההתחברות הנוכחית מאומתת.</p>') +
          '<button type="button" class="security-text-button" data-mfa-remove>ביטול האימות הדו־שלבי</button>';
        var challenge = host.querySelector('[data-mfa-challenge]');
        if (challenge) challenge.onsubmit = function (event) { event.preventDefault(); verifyCode(verified[0].id, challenge.code.value); };
        host.querySelector('[data-mfa-remove]').onclick = function () { removeMfa(verified[0].id); };
      } else {
        host.innerHTML = '<div class="security-mfa-head"><div><h3>אימות דו־שלבי</h3><p>קוד נוסף מגן על החשבון גם אם הסיסמה נחשפה.</p></div><span><i class="fa-solid fa-shield"></i> מומלץ</span></div><button type="button" class="security-primary" data-mfa-start>הפעלת אימות דו־שלבי בחינם</button>';
        host.querySelector('[data-mfa-start]').onclick = enrollMfa;
      }
    } catch (error) {
      host.innerHTML = '<h3>אימות דו־שלבי</h3><p>לא ניתן לטעון כרגע את הגדרות האימות. נסה שוב בעוד רגע.</p>';
    }
  }

  async function enrollMfa() {
    message('יוצר מפתח אימות מאובטח…');
    var result = await cloud.enrollTotp();
    if (result.error) return message('לא הצלחנו להפעיל אימות: ' + result.error.message, true);
    var data = result.data || {};
    pendingFactorId = data.id || '';
    var totp = data.totp || {};
    var host = document.querySelector('[data-security-mfa]');
    host.innerHTML = '<h3>חיבור לאפליקציית קודים</h3><ol><li>פתח Google Authenticator, Microsoft Authenticator או אפליקציה דומה.</li><li>סרוק את הקוד או הזן את המפתח.</li><li>הקלד כאן את הקוד שקיבלת.</li></ol>' +
      (totp.qr_code ? '<img class="security-qr" src="' + escapeHtml(totp.qr_code) + '" alt="קוד QR להגדרת אימות דו־שלבי">' : '') +
      '<code class="security-secret">' + escapeHtml(totp.secret || '') + '</code><form data-mfa-enroll-verify><label>קוד בן 6 ספרות<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label><button type="submit">אישור והפעלה</button></form>';
    host.querySelector('[data-mfa-enroll-verify]').onsubmit = function (event) { event.preventDefault(); verifyCode(pendingFactorId, event.currentTarget.code.value); };
    message('סרוק את הקוד והזן קוד חד־פעמי כדי לסיים.');
  }

  async function verifyCode(factorId, code) {
    message('מאמת את הקוד…');
    var result = await cloud.challengeAndVerifyTotp(factorId, code);
    if (result.error) return message('הקוד אינו תקין או שפג תוקפו. נסה קוד חדש.', true);
    pendingFactorId = '';
    message('האימות הדו־שלבי פעיל וההתחברות מאובטחת.');
    renderProfile();
    await renderMfa();
    await enforceMfaChallenge();
  }

  async function removeMfa(factorId) {
    if (!window.confirm('לבטל את האימות הדו־שלבי? החשבון יהיה מוגן רק באמצעות הסיסמה.')) return;
    var result = await cloud.unenrollMfa(factorId);
    if (result.error) return message('לא הצלחנו לבטל את האימות.', true);
    message('האימות הדו־שלבי בוטל.');
    renderMfa();
  }

  async function refresh() {
    cloud = window.TravelMateCloud || cloud;
    try { currentSession = cloud ? await cloud.getSession() : null; } catch (error) { currentSession = null; }
    renderProfile();
    var host = document.querySelector('[data-security-status]');
    if (host) host.innerHTML = currentSession && currentSession.user
      ? '<i class="fa-solid fa-circle-check"></i><div><strong>החשבון מחובר ומוצפן בתעבורה</strong><small>' + escapeHtml(currentSession.user.email) + (currentSession.user.email_confirmed_at ? ' · כתובת מאומתת' : ' · כתובת טרם אומתה') + '</small></div>'
      : '<i class="fa-solid fa-triangle-exclamation"></i><div><strong>המכשיר אינו מחובר</strong><small>התחבר כדי לסנכרן מידע ולהשתמש באימות דו־שלבי.</small></div>';
    await renderMfa();
    await enforceMfaChallenge();
  }

  function wire() {
    createButton();
    createDialog();
    createMfaGate();
    document.addEventListener('click', function (event) {
      if (event.target.closest('[data-security-open]')) openDialog();
      if (event.target.closest('[data-security-profile] [data-profile-wizard-open],[data-security-profile] [data-profile-interests-open]')) closeDialog();
      if (event.target.closest('[data-security-close]') || event.target.matches('[data-security-dialog]')) closeDialog();
      var languageChoice = event.target.closest('[data-language-choice]');
      if (languageChoice && window.TravelMateLanguage) {
        window.TravelMateLanguage.set(languageChoice.dataset.languageChoice);
        syncPreferences();
      }
      var themeChoice = event.target.closest('[data-theme-choice]');
      if (themeChoice) {
        if (window.TravelMateTheme) window.TravelMateTheme.set(themeChoice.dataset.themeChoice);
        else {
          try { localStorage.setItem('travelmate-theme', themeChoice.dataset.themeChoice); } catch (error) {}
          document.documentElement.dataset.theme = themeChoice.dataset.themeChoice;
        }
        syncPreferences();
      }
      var accentChoice = event.target.closest('[data-accent-choice]');
      if (accentChoice && window.TravelMateTheme && window.TravelMateTheme.setAccent) {
        window.TravelMateTheme.setAccent(accentChoice.dataset.accentChoice);
        syncPreferences();
      }
    });
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape') closeDialog(); else trapDialogFocus(event); });
    window.addEventListener('travelmate:profile-change', function (event) {
      var changed = event.detail && event.detail.user;
      if (!currentSession || !currentSession.user || !changed || String(changed.id) !== String(currentSession.user.id)) return;
      currentSession.user = changed;
      renderProfile();
    });
    document.querySelector('[data-security-signout]').onclick = async function () { await cloud.signOut('local'); location.reload(); };
    document.querySelector('[data-security-signout-all]').onclick = async function () {
      if (!window.confirm('לנתק את החשבון מכל המכשירים המחוברים?')) return;
      await cloud.signOut('global'); location.reload();
    };
    document.querySelector('[data-security-clean]').onclick = async function () {
      var unsyncedTrips = cloud && cloud.getLocalTrips ? cloud.getLocalTrips().filter(function (trip) {
        return trip && (trip.deletePending || ['pending', 'failed', 'unknown', 'local', 'conflict'].includes(trip.syncStatus));
      }) : [];
      var warning = 'פעולה זו תמחק מהמכשיר הזה עותקים מקומיים, מטמון והעדפות של TravelMate. מידע שסונכרן לענן יישאר בענן.';
      if (unsyncedTrips.length) warning += '\n\nאזהרה: קיימים ' + unsyncedTrips.length + ' טיולים עם שינויים מקומיים שלא אושרו כסנכרון מלא. ניקוי המכשיר עלול למחוק שינויים אלה לצמיתות.';
      if (!window.confirm(warning + '\n\nלהמשיך?')) return;
      await cloud.signOut('local');
      await cloud.clearDeviceData();
      location.replace(location.pathname.indexOf('/trip/') >= 0 ? '../../index.html' : 'index.html');
    };
    if (cloud && cloud.onAuthChange) cloud.onAuthChange(function () { refresh(); });
  }

  function setupCaptcha() {
    var config = window.TRAVELMATE_SUPABASE || {};
    if (!config.turnstileSiteKey) return;
    var form = document.querySelector('[data-cloud-auth-form]');
    if (!form || form.querySelector('[data-security-captcha]')) return;
    var host = document.createElement('div');
    host.dataset.securityCaptcha = '';
    host.className = 'security-captcha';
    form.insertBefore(host, form.querySelector('.cloud-login-submit'));
    if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) {
      host.classList.add('security-captcha-development');
      host.setAttribute('role', 'status');
      host.innerHTML = '<i class="fa-solid fa-shield-halved" aria-hidden="true"></i><span>בדיקת האבטחה זמינה באתר המאובטח ולא בתצוגה המקומית.</span>';
      return;
    }
    function render() {
      if (!window.turnstile) return;
      window.turnstile.render(host, { sitekey: config.turnstileSiteKey, theme: 'light', callback: function (token) { captchaToken = token; } });
    }
    if (window.turnstile) { render(); return; }
    if (document.querySelector('script[data-travelmate-turnstile]')) return;
    var script = document.createElement('script');
    script.dataset.travelmateTurnstile = '';
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true; script.defer = true; script.onload = render;
    document.head.appendChild(script);
  }

  function armCaptcha() {
    var armed = true;
    function start(event) {
      if (!armed) return;
      var target = event && event.target;
      if (target && target.closest && !target.closest('[data-cloud-auth-form],[data-cloud-account-open]')) return;
      armed = false;
      document.removeEventListener('focusin', start, true);
      document.removeEventListener('pointerdown', start, true);
      setupCaptcha();
    }
    document.addEventListener('focusin', start, true);
    document.addEventListener('pointerdown', start, true);
  }

  window.TravelMateSecurity = { getCaptchaToken: function () { return captchaToken || undefined; }, open: openDialog };
  window.TravelMateSettings = { open: openDialog, close: closeDialog };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { wire(); armCaptcha(); });
  else { wire(); armCaptcha(); }
})();

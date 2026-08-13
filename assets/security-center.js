(function () {
  'use strict';

  var cloud = window.TravelMateCloud;
  var currentSession = null;
  var captchaToken = '';
  var pendingFactorId = '';

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
    if (document.querySelector('[data-security-open]')) return;
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'security-center-launcher';
    button.dataset.securityOpen = '';
    button.innerHTML = '<i class="fa-solid fa-shield-halved" aria-hidden="true"></i><span>אבטחה</span>';
    button.setAttribute('aria-label', 'פתיחת מרכז האבטחה');
    if (document.body.classList.contains('home-page')) {
      var account = Array.prototype.find.call(document.querySelectorAll('[data-cloud-account-open]'), function (candidate) {
        return Boolean(candidate.offsetWidth || candidate.offsetHeight);
      }) || document.querySelector('[data-cloud-account-open]');
      if (account) account.insertAdjacentElement('afterend', button);
      else document.body.appendChild(button);
    } else {
      var nav = document.querySelector('.sidebar nav');
      if (nav) nav.appendChild(button);
      else document.body.appendChild(button);
    }
  }

  function createDialog() {
    if (document.querySelector('[data-security-dialog]')) return;
    var backdrop = document.createElement('section');
    backdrop.className = 'security-center-backdrop';
    backdrop.dataset.securityDialog = '';
    backdrop.hidden = true;
    backdrop.innerHTML = '<div class="security-center" role="dialog" aria-modal="true" aria-labelledby="security-title">' +
      '<header><div><small>הגנה על החשבון והמכשיר</small><h2 id="security-title">מרכז האבטחה</h2></div><button type="button" data-security-close aria-label="סגירה"><i class="fa-solid fa-xmark"></i></button></header>' +
      '<p class="security-message" data-security-message></p>' +
      '<section class="security-status" data-security-status></section>' +
      '<section class="security-mfa" data-security-mfa></section>' +
      '<section class="security-actions"><h3>יציאה וניהול המכשיר</h3><div>' +
      '<button type="button" data-security-signout><i class="fa-solid fa-right-from-bracket"></i><span><strong>יציאה מהמכשיר הזה</strong><small>המידע המקומי יישאר במכשיר</small></span></button>' +
      '<button type="button" data-security-signout-all><i class="fa-solid fa-user-lock"></i><span><strong>יציאה מכל המכשירים</strong><small>מומלץ אם טלפון אבד או נגנב</small></span></button>' +
      '<button type="button" class="danger" data-security-clean><i class="fa-solid fa-mobile-screen-button"></i><span><strong>יציאה וניקוי המכשיר</strong><small>מוחק מהמכשיר נתוני TravelMate מקומיים</small></span></button>' +
      '</div></section><footer><i class="fa-solid fa-circle-info"></i> קוד האימות והסיסמה אינם נשמרים באפליקציה.</footer></div>';
    document.body.appendChild(backdrop);
  }

  function openDialog() {
    var dialog = document.querySelector('[data-security-dialog]');
    if (!dialog) return;
    dialog.hidden = false;
    document.body.classList.add('security-center-open');
    refresh();
  }

  function closeDialog() {
    var dialog = document.querySelector('[data-security-dialog]');
    if (dialog) dialog.hidden = true;
    document.body.classList.remove('security-center-open');
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
    await renderMfa();
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
    var host = document.querySelector('[data-security-status]');
    if (host) host.innerHTML = currentSession && currentSession.user
      ? '<i class="fa-solid fa-circle-check"></i><div><strong>החשבון מחובר ומוצפן בתעבורה</strong><small>' + escapeHtml(currentSession.user.email) + (currentSession.user.email_confirmed_at ? ' · כתובת מאומתת' : ' · כתובת טרם אומתה') + '</small></div>'
      : '<i class="fa-solid fa-triangle-exclamation"></i><div><strong>המכשיר אינו מחובר</strong><small>התחבר כדי לסנכרן מידע ולהשתמש באימות דו־שלבי.</small></div>';
    await renderMfa();
  }

  function wire() {
    createButton();
    createDialog();
    document.addEventListener('click', function (event) {
      if (event.target.closest('[data-security-open]')) openDialog();
      if (event.target.closest('[data-security-close]') || event.target.matches('[data-security-dialog]')) closeDialog();
    });
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape') closeDialog(); });
    document.querySelector('[data-security-signout]').onclick = async function () { await cloud.signOut('local'); location.reload(); };
    document.querySelector('[data-security-signout-all]').onclick = async function () {
      if (!window.confirm('לנתק את החשבון מכל המכשירים המחוברים?')) return;
      await cloud.signOut('global'); location.reload();
    };
    document.querySelector('[data-security-clean]').onclick = async function () {
      if (!window.confirm('פעולה זו תמחק מהמכשיר הזה עותקים מקומיים, מטמון והעדפות של TravelMate. מידע שסונכרן לענן יישאר בענן. להמשיך?')) return;
      await cloud.signOut('local');
      cloud.clearDeviceData();
      location.replace(location.pathname.indexOf('/trip/') >= 0 ? '../../index.html' : 'index.html');
    };
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
    function render() {
      if (!window.turnstile) return;
      window.turnstile.render(host, { sitekey: config.turnstileSiteKey, theme: 'light', callback: function (token) { captchaToken = token; } });
    }
    var script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true; script.defer = true; script.onload = render;
    document.head.appendChild(script);
  }

  window.TravelMateSecurity = { getCaptchaToken: function () { return captchaToken || undefined; }, open: openDialog };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { wire(); setupCaptcha(); });
  else { wire(); setupCaptcha(); }
})();

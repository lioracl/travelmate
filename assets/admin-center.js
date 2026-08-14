(function () {
  'use strict';

  var cloud = window.TravelMateCloud;
  var state = { role: '', users: [], settings: [] };

  function applyPublicSettings(rows) {
    var announcement = (rows.find(function (item) { return item.key === 'announcement'; }) || {}).value || {};
    var features = (rows.find(function (item) { return item.key === 'features'; }) || {}).value || {};
    ['newTrips', 'aiAssistant', 'collaboration'].forEach(function (key) {
      document.body.dataset[key + 'Disabled'] = String(features[key] === false);
    });
    var banner = document.querySelector('[data-app-announcement]');
    if (!announcement.enabled || !announcement.text) { if (banner) banner.remove(); return; }
    if (!banner) {
      banner = document.createElement('aside');
      banner.className = 'app-announcement';
      banner.dataset.appAnnouncement = '';
      banner.setAttribute('role', 'status');
      document.body.appendChild(banner);
    }
    banner.innerHTML = '<i class="fa-solid fa-bullhorn"></i><span>' + escapeHtml(announcement.text) + '</span>';
  }

  async function loadPublicSettings() {
    try {
      var client = await cloud.getClient();
      var result = await client.from('app_settings').select('key,value');
      if (!result.error) applyPublicSettings(result.data || []);
    } catch (_) {}
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  async function invoke(action, payload) {
    var client = await cloud.getClient();
    var result = await client.functions.invoke('admin-center', { body: Object.assign({ action: action }, payload || {}) });
    if (result.error) {
      var context = result.error.context;
      if (context && typeof context.json === 'function') {
        try {
          var details = await context.json();
          throw Object.assign(new Error(details.message || details.error || result.error.message), details);
        } catch (error) {
          if (error && (error.error || error.message !== result.error.message)) throw error;
        }
      }
      throw result.error;
    }
    if (result.data && result.data.error) throw Object.assign(new Error(result.data.message || result.data.error), result.data);
    return result.data || {};
  }

  function status(text, error) {
    var node = document.querySelector('[data-admin-status]');
    if (!node) return;
    node.textContent = text || '';
    node.classList.toggle('error', Boolean(error));
  }

  function createDialog() {
    if (document.querySelector('[data-admin-dialog]')) return;
    var modal = document.createElement('section');
    modal.className = 'admin-center-backdrop';
    modal.dataset.adminDialog = '';
    modal.hidden = true;
    modal.innerHTML = '<div class="admin-center" role="dialog" aria-modal="true" aria-labelledby="admin-title"><header><div><small>ניהול מאובטח · כל פעולה מתועדת</small><h2 id="admin-title">מרכז מנהל</h2></div><button type="button" data-admin-close aria-label="סגירה"><i class="fa-solid fa-xmark"></i></button></header><nav class="admin-tabs" aria-label="אזורי ניהול"><button class="active" type="button" data-admin-tab="users"><i class="fa-solid fa-users"></i> משתמשים</button><button type="button" data-admin-tab="settings"><i class="fa-solid fa-sliders"></i> הגדרות מערכת</button><button type="button" data-admin-tab="audit"><i class="fa-solid fa-clipboard-list"></i> יומן פעולות</button></nav><p class="admin-status" data-admin-status role="status"></p><main data-admin-content></main><footer><i class="fa-solid fa-shield-halved"></i><span>אין אפשרות לראות סיסמאות. מסמכים פרטיים אינם נפתחים למנהל באופן אוטומטי.</span></footer></div>';
    document.body.appendChild(modal);
  }

  function addLauncher() {
    var preferences = document.querySelector('.security-preferences .settings-list');
    if (preferences && !preferences.querySelector('[data-admin-open="settings"]')) {
      var row = document.createElement('button');
      row.type = 'button';
      row.className = 'settings-row admin-settings-row';
      row.dataset.adminOpen = 'settings';
      row.innerHTML = '<i class="fa-solid fa-user-shield"></i><span><strong>מרכז מנהל</strong><small>משתמשים, הרשאות, הגדרות מערכת ויומן פעולות</small></span><b>פתיחה <i class="fa-solid fa-chevron-left"></i></b>';
      preferences.appendChild(row);
    }
    var sidebar = document.querySelector(document.body.classList.contains('home-page') ? '.home-sidebar' : '.sidebar');
    if (!sidebar || sidebar.querySelector('[data-admin-open="sidebar"]')) return;
    var launcher = document.createElement('button');
    launcher.type = 'button';
    launcher.className = 'admin-center-launcher';
    launcher.dataset.adminOpen = 'sidebar';
    launcher.setAttribute('aria-label', 'פתיחת מרכז המנהל');
    launcher.innerHTML = '<i class="fa-solid fa-user-shield" aria-hidden="true"></i><span>מרכז מנהל</span>';
    var settingsButton = sidebar.querySelector(':scope > [data-security-open]');
    sidebar.insertBefore(launcher, settingsButton || sidebar.querySelector(':scope > .trip-logout') || null);
  }

  function formatDate(value) {
    if (!value) return 'טרם התחבר';
    try { return new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)); } catch (_) { return value; }
  }

  function userRows(query) {
    var normalized = String(query || '').trim().toLowerCase();
    var users = normalized ? state.users.filter(function (user) { return String(user.email || '').toLowerCase().indexOf(normalized) >= 0 || String(user.id || '').toLowerCase().indexOf(normalized) >= 0 || String(user.role || '').toLowerCase().indexOf(normalized) >= 0; }) : state.users;
    return users.map(function (user) {
      var disabled = user.bannedUntil && new Date(user.bannedUntil) > new Date();
      var roleOptions = state.role === 'super_admin' && user.role !== 'super_admin'
        ? '<select data-admin-role data-user-id="' + escapeHtml(user.id) + '"><option value="user"' + (user.role === 'user' ? ' selected' : '') + '>משתמש</option><option value="admin"' + (user.role === 'admin' ? ' selected' : '') + '>מנהל</option></select>'
        : '<span class="admin-role">' + (user.role === 'super_admin' ? 'מנהל ראשי' : user.role === 'admin' ? 'מנהל' : 'משתמש') + '</span>';
      return '<article class="admin-user-card"><span class="admin-user-avatar"><i class="fa-solid fa-user"></i></span><div><strong>' + escapeHtml(user.email || 'ללא כתובת') + '</strong><small>כניסה אחרונה: ' + escapeHtml(formatDate(user.lastSignInAt)) + '</small><code>' + escapeHtml(user.id) + '</code></div>' + roleOptions + '<div class="admin-user-actions"><button type="button" data-admin-copy-user data-user-email="' + escapeHtml(user.email || '') + '" data-user-id="' + escapeHtml(user.id) + '"><i class="fa-regular fa-copy"></i><span>העתקה</span></button><button type="button" class="' + (disabled ? 'enable' : 'disable') + '" data-admin-toggle-user data-user-id="' + escapeHtml(user.id) + '" data-enabled="' + String(disabled) + '">' + (disabled ? 'שחרור משתמש' : 'חסימת משתמש') + '</button></div></article>';
    }).join('');
  }

  async function renderUsers() {
    var host = document.querySelector('[data-admin-content]');
    host.innerHTML = '<div class="admin-loading"><i class="fa-solid fa-spinner fa-spin"></i> טוען משתמשים…</div>';
    try {
      var data = await invoke('list-users');
      state.users = data.users || [];
      var blocked = state.users.filter(function (user) { return user.bannedUntil && new Date(user.bannedUntil) > new Date(); }).length;
      host.innerHTML = '<section class="admin-summary"><div><strong>' + state.users.length + '</strong><span>משתמשים</span></div><div><strong>' + state.users.filter(function (user) { return user.role !== 'user'; }).length + '</strong><span>מנהלים</span></div><div><strong>' + blocked + '</strong><span>חסומים</span></div></section><div class="admin-toolbar"><label><i class="fa-solid fa-magnifying-glass"></i><input type="search" data-admin-user-search placeholder="חיפוש לפי אימייל, מזהה או תפקיד"></label><button type="button" data-admin-refresh><i class="fa-solid fa-rotate"></i> רענון</button></div><section class="admin-users">' + userRows() + '</section>';
    } catch (error) { renderError(host, error); }
  }

  async function renderSettings() {
    var host = document.querySelector('[data-admin-content]');
    host.innerHTML = '<div class="admin-loading"><i class="fa-solid fa-spinner fa-spin"></i> טוען הגדרות…</div>';
    try {
      var data = await invoke('settings');
      state.settings = data.settings || [];
      var announcement = (state.settings.find(function (item) { return item.key === 'announcement'; }) || {}).value || {};
      var features = (state.settings.find(function (item) { return item.key === 'features'; }) || {}).value || {};
      host.innerHTML = '<form class="admin-system-form" data-admin-settings-form><section><h3>הודעת מערכת</h3><label class="admin-switch"><input type="checkbox" name="announcementEnabled"' + (announcement.enabled ? ' checked' : '') + '><span>הצגת הודעה לכל המשתמשים</span></label><label>תוכן ההודעה<textarea name="announcementText" rows="3" maxlength="500">' + escapeHtml(announcement.text || '') + '</textarea></label></section><section><h3>פיצ׳רים זמינים</h3><label class="admin-switch"><input type="checkbox" name="newTrips"' + (features.newTrips !== false ? ' checked' : '') + '><span>יצירת טיולים חדשים</span></label><label class="admin-switch"><input type="checkbox" name="aiAssistant"' + (features.aiAssistant !== false ? ' checked' : '') + '><span>העוזר החכם</span></label><label class="admin-switch"><input type="checkbox" name="collaboration"' + (features.collaboration !== false ? ' checked' : '') + '><span>שיתוף וקבוצות</span></label></section><button class="admin-save" type="submit"><i class="fa-solid fa-floppy-disk"></i> שמירת הגדרות</button></form>';
    } catch (error) { renderError(host, error); }
  }

  async function renderAudit() {
    var host = document.querySelector('[data-admin-content]');
    host.innerHTML = '<div class="admin-loading"><i class="fa-solid fa-spinner fa-spin"></i> טוען יומן…</div>';
    try {
      var data = await invoke('audit');
      var events = data.events || [];
      host.innerHTML = events.length ? '<div class="admin-toolbar"><span><strong>' + events.length + '</strong> פעולות אחרונות</span><button type="button" data-admin-export-audit><i class="fa-solid fa-file-csv"></i> ייצוא CSV</button></div><section class="admin-audit">' + events.map(function (event) { return '<article><i class="fa-solid fa-shield"></i><div><strong>' + escapeHtml(event.action) + '</strong><small>' + escapeHtml(formatDate(event.created_at)) + (event.target_user_id ? ' · יעד ' + escapeHtml(event.target_user_id) : '') + '</small></div></article>'; }).join('') + '</section>' : '<div class="admin-empty">עדיין לא נרשמו פעולות מנהל.</div>';
      host.dataset.auditEvents = JSON.stringify(events);
    } catch (error) { renderError(host, error); }
  }

  function renderError(host, error) {
    var mfa = error && (error.error === 'MFA_REQUIRED' || error.message === 'MFA_REQUIRED');
    host.innerHTML = '<div class="admin-error"><i class="fa-solid fa-triangle-exclamation"></i><strong>' + (mfa ? 'נדרש אימות דו־שלבי' : 'לא ניתן להשלים את הפעולה') + '</strong><p>' + escapeHtml(mfa ? 'חזור להגדרות, אמת קוד בן 6 ספרות ונסה שוב.' : error.message || 'שגיאה לא ידועה') + '</p></div>';
  }

  function openAdmin() {
    var modal = document.querySelector('[data-admin-dialog]');
    if (window.TravelMateSettings && window.TravelMateSettings.close) window.TravelMateSettings.close();
    document.body.classList.remove('mobile-menu-open');
    requestAnimationFrame(function () {
      modal.hidden = false;
      document.body.classList.add('admin-center-open');
      renderUsers();
    });
  }

  function closeAdmin() {
    var modal = document.querySelector('[data-admin-dialog]');
    if (modal) modal.hidden = true;
    document.body.classList.remove('admin-center-open');
  }

  async function detectAdmin() {
    if (!cloud) return;
    document.querySelectorAll('[data-admin-open]').forEach(function (item) { item.remove(); });
    try {
      var session = await cloud.getSession();
      if (!session) { closeAdmin(); return; }
      loadPublicSettings();
      var result = await invoke('status');
      if (!result.admin) return;
      state.role = result.role || 'admin';
      addLauncher();
    } catch (_) {}
  }

  document.addEventListener('click', async function (event) {
    if (event.target.closest('[data-admin-open]')) { event.preventDefault(); openAdmin(); return; }
    if (event.target.closest('[data-admin-close]') || event.target.matches('[data-admin-dialog]')) { closeAdmin(); return; }
    var tab = event.target.closest('[data-admin-tab]');
    if (tab) {
      document.querySelectorAll('[data-admin-tab]').forEach(function (item) { item.classList.toggle('active', item === tab); });
      if (tab.dataset.adminTab === 'settings') renderSettings(); else if (tab.dataset.adminTab === 'audit') renderAudit(); else renderUsers();
      return;
    }
    var toggle = event.target.closest('[data-admin-toggle-user]');
    if (toggle) {
      if (!confirm(toggle.dataset.enabled === 'true' ? 'לשחרר את המשתמש ולאפשר כניסה מחדש?' : 'לחסום את המשתמש מכל המכשירים?')) return;
      status('מעדכן את המשתמש…');
      try { await invoke('update-user', { userId: toggle.dataset.userId, enabled: toggle.dataset.enabled === 'true' }); status('המשתמש עודכן.'); renderUsers(); } catch (error) { status(error.message, true); }
      return;
    }
    if (event.target.closest('[data-admin-refresh]')) { renderUsers(); return; }
    var copyUser = event.target.closest('[data-admin-copy-user]');
    if (copyUser) {
      var details = (copyUser.dataset.userEmail || 'ללא אימייל') + '\n' + copyUser.dataset.userId;
      if (navigator.clipboard) await navigator.clipboard.writeText(details);
      status('פרטי המשתמש הועתקו.');
      return;
    }
    if (event.target.closest('[data-admin-export-audit]')) {
      var host = document.querySelector('[data-admin-content]');
      var events = JSON.parse(host.dataset.auditEvents || '[]');
      var csv = '\uFEFFפעולה,תאריך,משתמש יעד\n' + events.map(function (item) { return [item.action, item.created_at, item.target_user_id || ''].map(function (value) { return '"' + String(value || '').replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
      var csvUrl = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      var link = document.createElement('a'); link.href = csvUrl; link.download = 'travelmate-admin-audit.csv'; document.body.appendChild(link); link.click(); link.remove(); setTimeout(function () { URL.revokeObjectURL(csvUrl); }, 60000);
    }
  });

  document.addEventListener('input', function (event) {
    if (!event.target.matches('[data-admin-user-search]')) return;
    var list = document.querySelector('.admin-users');
    if (list) list.innerHTML = userRows(event.target.value) || '<div class="admin-empty">לא נמצאו משתמשים תואמים.</div>';
  });

  document.addEventListener('change', async function (event) {
    var select = event.target.closest('[data-admin-role]');
    if (!select) return;
    if (!confirm('לשנות את תפקיד המשתמש ל־' + select.options[select.selectedIndex].text + '?')) return renderUsers();
    status('מעדכן הרשאה…');
    try { await invoke('update-role', { userId: select.dataset.userId, role: select.value }); status('ההרשאה עודכנה.'); renderUsers(); } catch (error) { status(error.message, true); renderUsers(); }
  });

  document.addEventListener('submit', async function (event) {
    var form = event.target.closest('[data-admin-settings-form]');
    if (!form) return;
    event.preventDefault();
    status('שומר הגדרות…');
    try {
      await invoke('update-settings', { key: 'announcement', value: { enabled: form.announcementEnabled.checked, text: form.announcementText.value.trim() } });
      await invoke('update-settings', { key: 'features', value: { newTrips: form.newTrips.checked, aiAssistant: form.aiAssistant.checked, collaboration: form.collaboration.checked } });
      await loadPublicSettings();
      status('הגדרות המערכת נשמרו.');
    } catch (error) { status(error.message, true); }
  });

  function init() {
    createDialog();
    detectAdmin();
    if (cloud && cloud.onAuthChange) cloud.onAuthChange(function () { setTimeout(detectAdmin, 0); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

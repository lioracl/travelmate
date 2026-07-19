(function () {
  'use strict';

  if (!window.travelMateTripReady || !window.TravelMateCloud) return;
  var cloud = window.TravelMateCloud;
  var state = { trip: null, session: null, members: [], messages: [], unsubscribe: null };
  var ui;

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function initials(name) {
    return String(name || 'מטייל').trim().split(/\s+/).slice(0, 2).map(function (part) { return part.charAt(0); }).join('').toUpperCase();
  }

  function memberName(userId) {
    var member = state.members.find(function (item) { return String(item.user_id) === String(userId); });
    return member ? member.display_name : 'מטייל';
  }

  function roleLabel(role) {
    return role === 'owner' ? 'מנהל הטיול' : role === 'viewer' ? 'צפייה בלבד' : 'יכול לערוך';
  }

  function currentMember() {
    if (!state.session) return null;
    return state.members.find(function (item) { return String(item.user_id) === String(state.session.user.id); }) || null;
  }

  function isOwner() {
    return Boolean(state.session && String(state.trip.ownerId) === String(state.session.user.id));
  }

  function createInterface() {
    var nav = document.querySelector('.sidebar nav');
    if (nav && !nav.querySelector('[href="#group"]')) {
      nav.insertAdjacentHTML('beforeend', '<a href="#group"><i class="fa-solid fa-user-group"></i><span class="tip">הקבוצה</span></a>');
    }
    var modules = document.querySelector('.modules');
    if (modules && !modules.querySelector('[href="#group"]')) {
      modules.insertAdjacentHTML('beforeend', '<a class="module collaboration-module" href="#group"><span class="icon"><i class="fa-solid fa-comments"></i></span><strong>הקבוצה</strong><small>חברים, סנכרון וצ׳אט משותף</small></a>');
    }
    var section = document.createElement('section');
    section.id = 'group';
    section.className = 'section collaboration-section';
    section.innerHTML = '<div class="section-head collaboration-heading"><div><p>כל המטיילים במקום אחד</p><h1>הקבוצה של הטיול</h1></div><span class="collaboration-live"><i></i> סנכרון חי</span></div>' +
      '<div class="collaboration-signed-out" data-group-signed-out hidden><i class="fa-solid fa-user-lock"></i><div><strong>צריך להתחבר כדי לשתף את הטיול</strong><p>אפשר להתחבר דרך אזור המסמכים ולאחר מכן לחזור לכאן.</p></div><a href="#documents">מעבר להתחברות</a></div>' +
      '<div class="collaboration-grid" data-group-content hidden>' +
        '<article class="group-card members-card"><header><div><span>חברי הטיול</span><h2><span data-member-count>0</span> מטיילים</h2></div><button type="button" data-create-invite><i class="fa-solid fa-user-plus"></i> הזמנה</button></header><div class="member-list" data-member-list></div><p class="group-privacy"><i class="fa-solid fa-lock"></i> רק חברי הטיול יכולים לראות את התוכנית והשיחות.</p></article>' +
        '<article class="group-card chat-card"><header><div><span>שיחה קבוצתית</span><h2>הודעות</h2></div><span class="chat-online" data-chat-status>מחובר</span></header><div class="group-chat" data-group-chat aria-live="polite"></div><form class="group-composer" data-group-composer><textarea name="message" maxlength="2000" rows="1" placeholder="כתיבת הודעה לקבוצה…" aria-label="הודעה לקבוצה" required></textarea><button type="submit" aria-label="שליחת הודעה"><i class="fa-solid fa-paper-plane"></i></button></form></article>' +
      '</div>' +
      '<div class="invite-dialog" data-invite-dialog hidden><div class="invite-card"><button type="button" class="invite-close" data-invite-close aria-label="סגירה"><i class="fa-solid fa-xmark"></i></button><i class="fa-solid fa-people-roof invite-hero-icon"></i><h2>הזמנת מטיילים</h2><p>בחר הרשאה וצור קישור שאפשר לשלוח ב־WhatsApp.</p><label>הרשאה<select data-invite-role><option value="editor">יכול לערוך את הטיול</option><option value="viewer">צפייה בלבד</option></select></label><button type="button" class="invite-create" data-invite-generate><i class="fa-solid fa-link"></i> יצירת קישור מאובטח</button><div class="invite-result" data-invite-result hidden><input type="text" readonly data-invite-url><div><button type="button" data-invite-share><i class="fa-brands fa-whatsapp"></i> שיתוף</button><button type="button" data-invite-copy><i class="fa-solid fa-copy"></i> העתקה</button></div><small>הקישור תקף לשבעה ימים ועד 20 מצטרפים.</small></div><p class="invite-status" data-invite-status></p></div></div>' +
      '<div class="collaboration-toast" data-collaboration-toast role="status"></div>';
    var external = document.querySelector('.external-resources');
    if (external) external.insertAdjacentElement('beforebegin', section);
    else document.querySelector('main.content').appendChild(section);
    return {
      section: section,
      signedOut: section.querySelector('[data-group-signed-out]'),
      content: section.querySelector('[data-group-content]'),
      members: section.querySelector('[data-member-list]'),
      memberCount: section.querySelector('[data-member-count]'),
      inviteButton: section.querySelector('[data-create-invite]'),
      chat: section.querySelector('[data-group-chat]'),
      chatStatus: section.querySelector('[data-chat-status]'),
      composer: section.querySelector('[data-group-composer]'),
      dialog: section.querySelector('[data-invite-dialog]'),
      inviteRole: section.querySelector('[data-invite-role]'),
      inviteResult: section.querySelector('[data-invite-result]'),
      inviteUrl: section.querySelector('[data-invite-url]'),
      inviteStatus: section.querySelector('[data-invite-status]'),
      toast: section.querySelector('[data-collaboration-toast]')
    };
  }

  function toast(message) {
    ui.toast.textContent = message;
    ui.toast.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { ui.toast.classList.remove('show'); }, 3000);
  }

  function renderMembers() {
    ui.memberCount.textContent = state.members.length;
    ui.members.innerHTML = '';
    state.members.forEach(function (member) {
      var row = document.createElement('div');
      row.className = 'group-member';
      var mine = state.session && String(member.user_id) === String(state.session.user.id);
      var controls = '';
      if (isOwner() && member.role !== 'owner') {
        controls = '<select data-member-role="' + escapeHtml(member.user_id) + '" aria-label="הרשאת ' + escapeHtml(member.display_name) + '"><option value="editor"' + (member.role === 'editor' ? ' selected' : '') + '>עורך</option><option value="viewer"' + (member.role === 'viewer' ? ' selected' : '') + '>צופה</option></select><button type="button" data-remove-member="' + escapeHtml(member.user_id) + '" aria-label="הסרת המטייל"><i class="fa-solid fa-user-minus"></i></button>';
      }
      row.innerHTML = '<span class="member-avatar">' + escapeHtml(initials(member.display_name)) + '</span><span class="member-copy"><strong>' + escapeHtml(member.display_name) + (mine ? ' · אתה' : '') + '</strong><small>' + roleLabel(member.role) + '</small></span><span class="member-controls">' + controls + '</span>';
      ui.members.appendChild(row);
    });
    ui.inviteButton.hidden = !isOwner();
    var me = currentMember();
    document.body.classList.toggle('trip-viewer', Boolean(me && me.role === 'viewer'));
    ui.composer.querySelector('textarea').disabled = !me;
    ui.composer.querySelector('button').disabled = !me;
  }

  function messageNode(message) {
    var mine = state.session && String(message.sender_user_id) === String(state.session.user.id);
    var article = document.createElement('article');
    article.className = 'group-message' + (mine ? ' mine' : '');
    article.dataset.messageId = message.id;
    var time = new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit' }).format(new Date(message.created_at));
    article.innerHTML = '<span class="message-sender">' + escapeHtml(mine ? 'אתה' : memberName(message.sender_user_id)) + '</span><p>' + escapeHtml(message.body) + '</p><time>' + escapeHtml(time) + '</time>';
    return article;
  }

  function renderMessages() {
    ui.chat.innerHTML = '';
    if (!state.messages.length) {
      ui.chat.innerHTML = '<div class="chat-empty"><i class="fa-regular fa-comments"></i><strong>השיחה מתחילה כאן</strong><span>שלח הודעה ראשונה לחברי הטיול.</span></div>';
      return;
    }
    state.messages.forEach(function (message) { ui.chat.appendChild(messageNode(message)); });
    ui.chat.scrollTop = ui.chat.scrollHeight;
  }

  async function loadMembers() {
    state.members = await cloud.listTripMembers(state.trip.ownerId, state.trip.id);
    renderMembers();
    renderMessages();
  }

  async function loadMessages() {
    state.messages = await cloud.listTripMessages(state.trip.ownerId, state.trip.id);
    renderMessages();
  }

  function openInvite() {
    ui.inviteResult.hidden = true;
    ui.inviteStatus.textContent = '';
    ui.dialog.hidden = false;
    document.body.classList.add('invite-open');
  }

  function closeInvite() {
    ui.dialog.hidden = true;
    document.body.classList.remove('invite-open');
  }

  async function generateInvite() {
    var button = ui.dialog.querySelector('[data-invite-generate]');
    button.disabled = true;
    ui.inviteStatus.textContent = 'יוצר קישור מאובטח…';
    try {
      var token = await cloud.createTripInvite(state.trip.ownerId, state.trip.id, ui.inviteRole.value);
      var link = new URL(location.href);
      link.searchParams.set('id', state.trip.id);
      link.searchParams.set('invite', token);
      link.hash = 'group';
      ui.inviteUrl.value = link.href;
      ui.inviteResult.hidden = false;
      ui.inviteStatus.textContent = 'הקישור מוכן לשליחה.';
    } catch (error) {
      console.error('TravelMate invite creation failed', error);
      ui.inviteStatus.textContent = 'לא הצלחנו ליצור הזמנה. ודא שמסד הנתונים עודכן ונסה שוב.';
    } finally { button.disabled = false; }
  }

  async function shareInvite() {
    var data = { title: 'הצטרפות לטיול ב־TravelMate', text: 'הצטרף לטיול שלנו ל' + state.trip.city, url: ui.inviteUrl.value };
    if (navigator.share) {
      try { await navigator.share(data); } catch (error) {}
    } else {
      window.open('https://wa.me/?text=' + encodeURIComponent(data.text + '\n' + data.url), '_blank', 'noopener');
    }
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(ui.inviteUrl.value);
      toast('קישור ההזמנה הועתק');
    } catch (error) {
      ui.inviteUrl.select();
      document.execCommand('copy');
      toast('קישור ההזמנה הועתק');
    }
  }

  function bindEvents() {
    ui.inviteButton.addEventListener('click', openInvite);
    ui.dialog.querySelector('[data-invite-close]').addEventListener('click', closeInvite);
    ui.dialog.addEventListener('click', function (event) { if (event.target === ui.dialog) closeInvite(); });
    ui.dialog.querySelector('[data-invite-generate]').addEventListener('click', generateInvite);
    ui.dialog.querySelector('[data-invite-share]').addEventListener('click', shareInvite);
    ui.dialog.querySelector('[data-invite-copy]').addEventListener('click', copyInvite);
    ui.composer.addEventListener('submit', async function (event) {
      event.preventDefault();
      var textarea = ui.composer.elements.message;
      var body = textarea.value.trim();
      if (!body) return;
      textarea.disabled = true;
      try {
        var message = await cloud.sendTripMessage(state.trip.ownerId, state.trip.id, body);
        textarea.value = '';
        if (!state.messages.some(function (item) { return String(item.id) === String(message.id); })) {
          state.messages.push(message);
          renderMessages();
        }
      } catch (error) {
        console.error('TravelMate message send failed', error);
        toast('שליחת ההודעה נכשלה זמנית');
      } finally { textarea.disabled = false; textarea.focus(); }
    });
    ui.members.addEventListener('change', async function (event) {
      if (!event.target.matches('[data-member-role]')) return;
      try {
        await cloud.updateTripMember(state.trip.ownerId, state.trip.id, event.target.dataset.memberRole, event.target.value);
        toast('ההרשאה עודכנה');
      } catch (error) { toast('עדכון ההרשאה נכשל'); await loadMembers(); }
    });
    ui.members.addEventListener('click', async function (event) {
      var button = event.target.closest('[data-remove-member]');
      if (!button || !confirm('להסיר את המטייל מהטיול המשותף?')) return;
      try {
        await cloud.removeTripMember(state.trip.ownerId, state.trip.id, button.dataset.removeMember);
        await loadMembers();
        toast('המטייל הוסר מהטיול');
      } catch (error) { toast('לא הצלחנו להסיר את המטייל'); }
    });
  }

  async function startRealtime() {
    state.unsubscribe = await cloud.subscribeToSharedTrip(state.trip.ownerId, state.trip.id, {
      onMessage: function (message) {
        if (state.messages.some(function (item) { return String(item.id) === String(message.id); })) return;
        state.messages.push(message);
        renderMessages();
      },
      onMembersChange: function () { loadMembers().catch(function () {}); },
      onTripUpdate: function () {
        toast('חבר בקבוצה עדכן את הטיול · מרענן…');
        setTimeout(function () { location.reload(); }, 1200);
      }
    });
  }

  async function initialize() {
    state.trip = await window.travelMateTripReady;
    if (!state.trip) return;
    ui = createInterface();
    bindEvents();
    state.session = await cloud.getSession();
    if (!state.session) {
      ui.signedOut.hidden = false;
      return;
    }
    state.trip.ownerId = state.trip.ownerId || state.session.user.id;
    ui.content.hidden = false;
    try {
      await Promise.all([loadMembers(), loadMessages()]);
      await startRealtime();
      ui.chatStatus.textContent = 'מחובר בזמן אמת';
    } catch (error) {
      console.error('TravelMate collaboration failed', error);
      ui.chatStatus.textContent = 'נדרשת הפעלת השיתוף ב־Supabase';
      toast('השיתוף יופעל לאחר עדכון מסד הנתונים');
    }
  }

  initialize();
  addEventListener('beforeunload', function () { if (state.unsubscribe) state.unsubscribe(); });
})();

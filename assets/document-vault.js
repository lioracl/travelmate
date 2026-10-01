(function () {
  'use strict';

  var MAX_FILE_SIZE = 25 * 1024 * 1024;
  var PBKDF2_ITERATIONS = 310000;
  var PDF_JS_VERSION = '5.7.284';
  var pdfJsPromise;
  var initialized = false;

  function vaultAssetUrl(relativePath) {
    var script = Array.from(document.scripts).find(function (item) { return /\/document-vault\.js(?:\?|$)/.test(item.src || ''); });
    var scriptUrl = new URL(script ? script.src : 'assets/document-vault.js', document.baseURI);
    var assetUrl = new URL(relativePath, scriptUrl);
    var version = scriptUrl.searchParams.get('v');
    if (version) assetUrl.searchParams.set('v', version);
    return assetUrl.href;
  }

  function loadPdfJs() {
    if (pdfJsPromise) return pdfJsPromise;
    var localLibraryUrl = vaultAssetUrl('vendor/pdfjs/pdf.min.js');
    var localWorkerUrl = vaultAssetUrl('vendor/pdfjs/pdf.worker.min.js');
    var cdnLibraryUrl = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + PDF_JS_VERSION + '/build/pdf.min.mjs';
    var cdnWorkerUrl = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + PDF_JS_VERSION + '/build/pdf.worker.min.mjs';
    pdfJsPromise = import(localLibraryUrl).then(function (library) {
      library.GlobalWorkerOptions.workerSrc = localWorkerUrl;
      return library;
    }).catch(function (localError) {
      console.warn('TravelMate local PDF.js load failed; retrying CDN.', localError);
      return import(cdnLibraryUrl).then(function (library) {
        library.GlobalWorkerOptions.workerSrc = cdnWorkerUrl;
        return library;
      });
    }).catch(function (error) {
      pdfJsPromise = null;
      throw error;
    });
    return pdfJsPromise;
  }
  var DOCUMENT_GROUPS = ['flights', 'lodging', 'tickets', 'insurance', 'personal', 'mate'];

  function groupForCategory(value) {
    var category = String(value || '').trim();
    if (/טיסה|טיסות|flight|boarding/i.test(category)) return 'flights';
    if (/לינה|מלון|hotel|lodg/i.test(category)) return 'lodging';
    if (/ביטוח|insurance/i.test(category)) return 'insurance';
    if (/תחבורה|כרטיס|רכבת|אוטובוס|ticket|transport|train|bus/i.test(category)) return 'tickets';
    if (/mate|navo/i.test(category)) return 'mate';
    return 'personal';
  }

  function storedCategoryForGroup(group) {
    return ({ flights: 'טיסות', lodging: 'לינה', tickets: 'כרטיסים ותחבורה', insurance: 'ביטוח', personal: 'אישי' })[group] || 'אישי';
  }

  function createVaultMarkup() {
    return '<section class="vault-intro" aria-labelledby="vault-title"><div class="vault-head"><div><span class="vault-badge"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> ענן פרטי ומוצפן</span><h2 id="vault-title">כספת המסמכים של הטיול</h2><p>תוכן הקבצים מוצפן במכשיר לפני ההעלאה ונפתח רק לאחר הזנת סיסמת הכספת. שם הקובץ, הקטגוריה וההערה נשמרים כפרטי רשימה בחשבון המוגן — לכן אין להזין בהם מידע רגיש.</p></div></div></section>' +
      '<section class="vault-access" aria-labelledby="vault-access-title"><h3 id="vault-access-title">גישה מאובטחת</h3><div class="vault-auth" data-vault-auth><div class="vault-auth-copy"><i class="fa-solid fa-user-lock"></i><div><strong>התחברות לכספת</strong><span>החשבון מגן על המסמכים ומאפשר גישה גם מהטלפון.</span></div></div><form data-vault-auth-form><input name="email" type="email" autocomplete="email" aria-label="כתובת דוא״ל" placeholder="כתובת דוא״ל" required><input name="password" type="password" autocomplete="current-password" minlength="8" aria-label="סיסמת חשבון" placeholder="סיסמת חשבון · לפחות 8 תווים" required><button type="submit" data-auth-signin>כניסה</button><button type="button" class="secondary" data-auth-signup>יצירת חשבון</button><button type="button" class="secondary" data-auth-resend>לא קיבלתי מייל · שלח שוב</button></form></div>' +
      '<div class="vault-session" data-vault-session hidden><div><i class="fa-solid fa-circle-check"></i><span>מחובר/ת בתור <strong data-vault-email></strong></span></div><button type="button" data-vault-signout>יציאה</button></div>' +
      '<div class="vault-unlock" data-vault-unlock hidden><label><span>סיסמת הצפנת הכספת</span><span class="vault-passphrase-control"><input data-vault-passphrase type="password" autocomplete="off" minlength="10" placeholder="אותה סיסמה שבה הצפנת את הקבצים"><button type="button" data-vault-toggle-passphrase aria-label="הצגת סיסמת הכספת"><i class="fa-solid fa-eye"></i></button></span></label><small><i class="fa-solid fa-triangle-exclamation"></i> לפתיחת מסמך יש להזין את אותה סיסמת כספת ששימשה בהעלאה. היא נפרדת מסיסמת החשבון ואינה נשמרת.</small></div><p class="vault-status" data-vault-status aria-live="polite"></p></section>' +
      '<section class="vault-upload-section" data-vault-upload-section aria-labelledby="vault-upload-title" hidden><header><div><small>העלאה מוצפנת</small><h3 id="vault-upload-title">הוספת מסמך</h3></div><i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i></header><form class="vault-upload" data-vault-form hidden><select name="category" aria-label="קטגוריה"><option>טיסות</option><option>לינה</option><option>כרטיסים ותחבורה</option><option>ביטוח</option><option>אישי</option></select><input name="note" type="text" maxlength="180" aria-label="הערה למסמך" placeholder="הערה אופציונלית — ללא מספרי דרכון"><button class="vault-upload-button" type="submit"><i class="fa-solid fa-lock" aria-hidden="true"></i> הצפנה ושמירה</button><label class="vault-drop" data-vault-drop role="button" tabindex="0" aria-describedby="vault-drop-help"><input name="files" type="file" multiple hidden accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt"><span><i class="fa-solid fa-file-shield" aria-hidden="true"></i><strong>גרור קבצים לכאן או לחץ לבחירה</strong><small id="vault-drop-help">PDF, תמונות וקובצי Office · עד 25MB לקובץ</small></span></label></form></section>';
  }

  async function init() {
    if (initialized) return;
    var section = document.getElementById('documents');
    var tripId = new URLSearchParams(location.search).get('id') || document.body.dataset.tripId;
    var config = window.TRAVELMATE_SUPABASE;
    if (!section || !tripId || section.querySelector('[data-document-vault]')) return;
    initialized = true;

    var vault = document.createElement('div');
    vault.className = 'document-vault';
    vault.dataset.documentVault = '';
    vault.innerHTML = createVaultMarkup();
    var categoryNavigation = section.querySelector('[data-documents-category-nav]');
    var library = section.querySelector('[data-documents-library]');
    (library || categoryNavigation || section.querySelector('.section-head')).insertAdjacentElement('beforebegin', vault);

    var vaultLibrary = document.createElement('section');
    vaultLibrary.className = 'vault-library';
    vaultLibrary.setAttribute('aria-labelledby', 'vault-library-title');
    vaultLibrary.innerHTML = '<h3 id="vault-library-title">המסמכים שלי</h3><div class="vault-summary" data-vault-summary hidden><strong data-vault-count>0 מסמכים</strong><div><small data-vault-size>0 MB</small><div class="vault-storage"><i data-vault-storage style="width:0%"></i></div></div></div>';
    vault.insertAdjacentElement('afterend', vaultLibrary);
    if (categoryNavigation) vaultLibrary.appendChild(categoryNavigation);
    var existingCategoryList = section.querySelector('[data-document-category-list]');
    if (existingCategoryList) vaultLibrary.appendChild(existingCategoryList);
    var existingArchive = section.querySelector('[data-ai-notes-archive]');
    if (existingArchive) vaultLibrary.insertAdjacentElement('afterend', existingArchive);

    var status = vault.querySelector('[data-vault-status]');
    function setStatus(message, error) {
      status.textContent = message || '';
      status.classList.toggle('error', Boolean(error));
    }

    var authPanel = vault.querySelector('[data-vault-auth]');
    var authForm = vault.querySelector('[data-vault-auth-form]');
    var sessionPanel = vault.querySelector('[data-vault-session]');
    var unlockPanel = vault.querySelector('[data-vault-unlock]');
    var uploadSection = vault.querySelector('[data-vault-upload-section]');
    var passphraseInput = vault.querySelector('[data-vault-passphrase]');
    var form = vault.querySelector('[data-vault-form]');
    var input = form.elements.files;
    var drop = vault.querySelector('[data-vault-drop]');
    var uploadButton = form.querySelector('.vault-upload-button');
    var summary = section.querySelector('[data-vault-summary]');
    var vaultPickButtons = [].slice.call(section.querySelectorAll('[data-vault-pick]'));
    var categoryList = section.querySelector('[data-document-category-list]');
    var currentUser = null;
    var documentSessionEpoch = 0;
    var hasDocumentSession = false;
    var uploadInProgress = false;
    var categoryTargets = {};
    var activeDocumentFilter = 'all';

    section.querySelectorAll('[data-document-category-list] > .doc-row').forEach(function (categoryRow) {
      var title = categoryRow.querySelector('strong');
      var categoryButton = categoryRow.querySelector(':scope > button');
      if (!title || !categoryButton) return;
      var group = categoryRow.dataset.documentGroup || groupForCategory(title.textContent.trim());
      var categoryName = storedCategoryForGroup(group);
      var filesContainer = document.createElement('div');
      filesContainer.className = 'doc-category-files';
      filesContainer.dataset.categoryFiles = group;
      categoryRow.dataset.documentGroup = group;
      categoryRow.dataset.documentCategory = categoryName;
      categoryRow.appendChild(filesContainer);
      categoryTargets[group] = { row: categoryRow, button: categoryButton, files: filesContainer };
    });

    function mateArchive() { return section.querySelector('[data-ai-notes-archive]'); }

    function updateDocumentFilterCounts() {
      var totals = { flights: 0, lodging: 0, tickets: 0, insurance: 0, personal: 0, mate: 0 };
      Object.keys(categoryTargets).forEach(function (group) {
        totals[group] = categoryTargets[group].files.children.length;
      });
      var archive = mateArchive();
      if (archive) totals.mate = archive.querySelectorAll('[data-ai-note-id]').length;
      var all = totals.flights + totals.lodging + totals.tickets + totals.insurance + totals.personal + totals.mate;
      section.querySelectorAll('[data-document-filter-count]').forEach(function (node) {
        var group = node.dataset.documentFilterCount;
        node.textContent = group === 'all' ? String(all) : String(totals[group] || 0);
      });
    }

    function applyDocumentFilter() {
      var archive = mateArchive();
      section.querySelectorAll('[data-document-filter]').forEach(function (button) {
        var selected = button.dataset.documentFilter === activeDocumentFilter;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
      Object.keys(categoryTargets).forEach(function (group) {
        categoryTargets[group].row.hidden = activeDocumentFilter !== 'all' && activeDocumentFilter !== group;
      });
      if (categoryList) categoryList.hidden = activeDocumentFilter === 'mate';
      vault.hidden = activeDocumentFilter === 'mate';
      if (archive) archive.hidden = activeDocumentFilter !== 'all' && activeDocumentFilter !== 'mate';
      updateDocumentFilterCounts();
    }

    if (categoryNavigation) {
      categoryNavigation.addEventListener('click', function (event) {
        var button = event.target.closest('[data-document-filter]');
        if (!button) return;
        var next = button.dataset.documentFilter || 'all';
        activeDocumentFilter = next === 'all' || DOCUMENT_GROUPS.indexOf(next) >= 0 ? next : 'all';
        applyDocumentFilter();
      });
    }

    window.TravelMateDocuments = Object.freeze({
      refresh: function () { applyDocumentFilter(); },
      filter: function (group) {
        activeDocumentFilter = group === 'all' || DOCUMENT_GROUPS.indexOf(group) >= 0 ? group : 'all';
        applyDocumentFilter();
      },
      groupForCategory: groupForCategory
    });
    applyDocumentFilter();

    if (!config || !config.url || !config.publishableKey) {
      setStatus('חיבור האחסון טרם הוגדר. קטגוריות ו־Mate עדיין זמינים במכשיר.', true);
      return;
    }

    if (!window.TravelMateCloud || typeof window.TravelMateCloud.getClient !== 'function') {
      setStatus('שירות הענן אינו זמין כרגע. קטגוריות ו־Mate עדיין זמינים במכשיר.', true);
      return;
    }

    var client;
    try {
      client = await window.TravelMateCloud.getClient();
    } catch (error) {
      setStatus('לא ניתן לטעון כרגע את הכספת. קטגוריות ו־Mate עדיין זמינים במכשיר.', true);
      return;
    }
    var bucket = config.documentBucket || 'travel-documents';

    function pendingCleanupKey(userId) {
      return 'travelmate-document-cleanup:' + String(userId || '');
    }

    function ownsStoragePath(userId, path) {
      if (typeof path !== 'string' || path.indexOf(String(userId) + '/') !== 0 || /\\/.test(path)) return false;
      return path.split('/').every(function (part) { return part && part !== '.' && part !== '..'; });
    }

    function isDocumentSession(userId, epoch) {
      return epoch === documentSessionEpoch && currentUser && String(currentUser.id) === String(userId);
    }

    async function requireDocumentAccess(userId, epoch) {
      if (!isDocumentSession(userId, epoch)) throw new Error('DOCUMENT_SESSION_CHANGED');
      var access = await requirePrivateStorageAccess();
      if (!isDocumentSession(userId, epoch) || !access.session || String(access.session.user.id) !== String(userId)) {
        throw new Error('DOCUMENT_SESSION_CHANGED');
      }
      return access;
    }

    function readPendingCleanup(userId) {
      try {
        var parsed = JSON.parse(localStorage.getItem(pendingCleanupKey(userId)) || '[]');
        return Array.isArray(parsed) ? parsed.filter(function (path) { return ownsStoragePath(userId, path); }) : [];
      } catch (error) {
        return [];
      }
    }

    function writePendingCleanup(userId, paths) {
      var unique = Array.from(new Set((paths || []).filter(function (path) { return ownsStoragePath(userId, path); })));
      if (unique.length) localStorage.setItem(pendingCleanupKey(userId), JSON.stringify(unique));
      else localStorage.removeItem(pendingCleanupKey(userId));
    }

    function queuePendingCleanup(userId, storagePath) {
      if (!ownsStoragePath(userId, storagePath)) return;
      var pending = readPendingCleanup(userId);
      if (pending.indexOf(storagePath) < 0) pending.push(storagePath);
      writePendingCleanup(userId, pending);
    }

    async function flushPendingCleanup() {
      if (!currentUser) return;
      var cleanupUserId = String(currentUser.id);
      var cleanupEpoch = documentSessionEpoch;
      var pending = readPendingCleanup(cleanupUserId);
      if (!pending.length) return;
      try { await requireDocumentAccess(cleanupUserId, cleanupEpoch); } catch (error) { return; }
      for (var index = 0; index < pending.length; index += 1) {
        var path = pending[index];
        if (!isDocumentSession(cleanupUserId, cleanupEpoch)) return;
        try {
          // A lost metadata response may still have committed. Never remove a
          // blob that has a surviving metadata reference.
          var references = await client.from('travel_documents').select('id').eq('user_id', cleanupUserId).eq('storage_path', path).limit(1);
          if (!isDocumentSession(cleanupUserId, cleanupEpoch)) return;
          if (references.error) continue;
          if (!(references.data || []).length) {
            var result = await client.storage.from(bucket).remove([path]);
            if (result.error) continue;
            if (!isDocumentSession(cleanupUserId, cleanupEpoch)) return;
          }
          // Merge against the latest queue, preserving new failures queued while
          // the network request was in flight.
          writePendingCleanup(cleanupUserId, readPendingCleanup(cleanupUserId).filter(function (item) { return item !== path; }));
        } catch (error) { /* Retain the owner-scoped retry after transport failure. */ }
      }
    }

    function clearRemoteDocumentMetadata() {
      Object.keys(categoryTargets).forEach(function (group) {
        var target = categoryTargets[group];
        target.files.innerHTML = '';
        target.row.classList.remove('has-documents');
        target.button.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> העלאה';
      });
      section.querySelector('[data-vault-count]').textContent = '0 מסמכים';
      section.querySelector('[data-vault-size]').textContent = '0 MB';
      section.querySelector('[data-vault-storage]').style.width = '0%';
      applyDocumentFilter();
    }

    async function applySession(session) {
      var nextUser = session && session.user ? session.user : null;
      if (hasDocumentSession && String(currentUser && currentUser.id || '') === String(nextUser && nextUser.id || '')) return;
      hasDocumentSession = true;
      var sessionEpoch = ++documentSessionEpoch;
      currentUser = session && session.user ? session.user : null;
      authPanel.hidden = Boolean(currentUser);
      sessionPanel.hidden = !currentUser;
      unlockPanel.hidden = !currentUser;
      uploadSection.hidden = !currentUser;
      form.hidden = !currentUser;
      summary.hidden = !currentUser;
      vaultPickButtons.forEach(function (button) {
        button.disabled = false;
        button.toggleAttribute('data-auth-required', !currentUser);
      });
      vault.querySelector('[data-vault-email]').textContent = currentUser ? currentUser.email : '';
      passphraseInput.value = '';
      form.reset();
      uploadInProgress = false;
      uploadButton.disabled = false;
      clearRemoteDocumentMetadata();
      var preview = document.querySelector('[data-vault-preview]');
      if (preview && preview._closePreview) preview._closePreview();
      if (!currentUser) {
        passphraseInput.value = '';
        clearRemoteDocumentMetadata();
        setStatus('יש להתחבר כדי לראות או להעלות מסמכים.');
        return;
      }
      setStatus('הכספת מחוברת. הזן את סיסמת ההצפנה כדי להעלות או לפתוח מסמך.');
      var sessionUserId = currentUser.id;
      // Supabase auth callbacks must not await another auth call under its lock.
      setTimeout(async function () {
        if (!isDocumentSession(sessionUserId, sessionEpoch)) return;
        try {
          await flushPendingCleanup();
          if (isDocumentSession(sessionUserId, sessionEpoch)) await renderDocuments(sessionEpoch, sessionUserId);
        } catch (error) {
          if (isDocumentSession(sessionUserId, sessionEpoch)) setStatus(storageErrorMessage(error), true);
        }
      }, 0);
    }

    authForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      setAuthButtons(true);
      setStatus('מתחבר/ת לכספת…');
      var result = await client.auth.signInWithPassword({
        email: authForm.elements.email.value.trim(),
        password: authForm.elements.password.value
      });
      setAuthButtons(false);
      if (result.error) setStatus(authErrorMessage(result.error), true);
    });

    vault.querySelector('[data-auth-signup]').addEventListener('click', async function () {
      if (!authForm.reportValidity()) return;
      setAuthButtons(true);
      setStatus('יוצר/ת חשבון מאובטח…');
      var result = await client.auth.signUp({
        email: authForm.elements.email.value.trim(),
        password: authForm.elements.password.value,
        options: { emailRedirectTo: authRedirectUrl('#documents') }
      });
      setAuthButtons(false);
      if (result.error) {
        setStatus(authErrorMessage(result.error), true);
      } else if (!result.data.session) {
        setStatus(result.data.user && Array.isArray(result.data.user.identities) && !result.data.user.identities.length ? 'כבר קיים חשבון עם כתובת זו. אפשר לשלוח שוב את מייל האימות או לנסות להתחבר.' : 'בקשת ההרשמה התקבלה. בדוק גם בספאם; אם המייל לא הגיע, לחץ על „שלח שוב”.');
      } else {
        setStatus('החשבון נוצר והכספת מוכנה.');
      }
    });

    vault.querySelector('[data-auth-resend]').addEventListener('click', async function (event) {
      if (!authForm.elements.email.reportValidity()) return;
      var button = event.currentTarget; button.disabled = true; setStatus('שולח שוב את מייל האימות…');
      var result = await client.auth.resend({ type: 'signup', email: authForm.elements.email.value.trim(), options: { emailRedirectTo: authRedirectUrl('#documents') } });
      if (result.error) { setStatus(authErrorMessage(result.error), true); button.disabled = false; return; }
      setStatus('מייל אימות נוסף נשלח. בדוק גם בספאם ובקידומי מכירות.');
      button.textContent = 'נשלח · אפשר שוב בעוד דקה';
      setTimeout(function () { button.disabled = false; button.textContent = 'לא קיבלתי מייל · שלח שוב'; }, 60000);
    });

    vault.querySelector('[data-vault-signout]').addEventListener('click', async function () {
      var signingOutUser = currentUser;
      documentSessionEpoch += 1;
      clearRemoteDocumentMetadata();
      await applySession(null);
      var signoutEpoch = documentSessionEpoch;
      try {
        var result = await client.auth.signOut();
        if (result && result.error) throw result.error;
      } catch (error) {
        if (documentSessionEpoch !== signoutEpoch || currentUser) return;
        if (signingOutUser) await applySession({ user: signingOutUser });
        setStatus(authErrorMessage(error), true);
      }
    });

    vault.querySelector('[data-vault-toggle-passphrase]').addEventListener('click', function (event) {
      var showing = passphraseInput.type === 'text';
      passphraseInput.type = showing ? 'password' : 'text';
      event.currentTarget.setAttribute('aria-label', showing ? 'הצגת סיסמת הכספת' : 'הסתרת סיסמת הכספת');
      event.currentTarget.querySelector('i').className = showing ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
    });

    function setAuthButtons(disabled) {
      authForm.querySelectorAll('button').forEach(function (button) { button.disabled = disabled; });
    }

    async function renderDocuments(expectedEpoch, expectedUserId) {
      if (!currentUser) return;
      var requestEpoch = typeof expectedEpoch === 'number' ? expectedEpoch : documentSessionEpoch;
      var requestUserId = expectedUserId || currentUser.id;
      var result = await client.from('travel_documents').select('*').eq('user_id', requestUserId).eq('trip_id', tripId).order('created_at', { ascending: false });
      if (requestEpoch !== documentSessionEpoch || !currentUser || currentUser.id !== requestUserId) return;
      if (result.error) {
        setStatus(databaseErrorMessage(result.error), true);
        return;
      }
      var documents = (result.data || []).filter(function (record) { return String(record.user_id) === String(requestUserId) && ownsStoragePath(requestUserId, record.storage_path); });
      var total = documents.reduce(function (sum, item) { return sum + Number(item.file_size || 0); }, 0);
      section.querySelector('[data-vault-count]').textContent = documents.length + ' מסמכים';
      section.querySelector('[data-vault-size]').textContent = formatSize(total) + ' בענן';
      section.querySelector('[data-vault-storage]').style.width = Math.min(100, Math.max(documents.length ? 2 : 0, total / (1024 * 1024 * 1024) * 100)) + '%';
      Object.keys(categoryTargets).forEach(function (group) {
        var target = categoryTargets[group];
        target.files.innerHTML = '';
        target.row.classList.remove('has-documents');
        target.button.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> העלאה';
      });
      documents.forEach(function (documentRecord) {
        var group = groupForCategory(documentRecord.category);
        var categoryTarget = categoryTargets[group] || categoryTargets.personal;
        if (!categoryTarget) return;
        categoryTarget.files.appendChild(createCategoryDocument(documentRecord));
        categoryTarget.row.classList.add('has-documents');
        var categoryCount = categoryTarget.files.children.length;
        categoryTarget.button.innerHTML = '<i class="fa-solid fa-plus"></i> העלאה נוספת (' + categoryCount + ')';
      });
      applyDocumentFilter();
    }

    function createCategoryDocument(documentRecord) {
      var item = document.createElement('div');
      item.className = 'doc-category-file';
      item.dataset.documentId = documentRecord.id;
      item.dataset.documentGroup = groupForCategory(documentRecord.category);
      item.innerHTML = '<span class="doc-category-file-icon"><i class="fa-solid ' + iconFor(documentRecord.mime_type) + '"></i></span><span class="doc-category-file-copy"><strong>' + escapeHtml(documentRecord.file_name) + '</strong><small>' + formatSize(documentRecord.file_size) + ' · ' + new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(documentRecord.created_at)) + (documentRecord.note ? ' · ' + escapeHtml(documentRecord.note) : '') + '</small></span><span class="doc-category-file-actions"><button type="button" data-open-document><i class="fa-solid fa-eye"></i><span>פתיחה</span></button><button type="button" data-download-document><i class="fa-solid fa-download"></i><span>הורדה</span></button><button type="button" class="danger" data-delete-document><i class="fa-solid fa-trash"></i><span>מחיקה</span></button></span>';
      item._documentRecord = documentRecord;
      return item;
    }

    async function saveFiles(files) {
      if (uploadInProgress) return;
      if (!currentUser) return setStatus('יש להתחבר לפני העלאת מסמך.', true);
      var uploadUserId = String(currentUser.id);
      var uploadSessionEpoch = documentSessionEpoch;
      var selectedCategory = form.elements.category.value;
      var selectedNote = form.elements.note.value.trim();
      if (!files.length) return setStatus('בחר לפחות קובץ אחד.', true);
      // AES-GCM adds a 16-byte authentication tag to the stored ciphertext.
      var tooLarge = files.find(function (file) { return file.size > MAX_FILE_SIZE - 16; });
      if (tooLarge) return setStatus('הקובץ ' + tooLarge.name + ' חורג ממגבלת 25MB לאחר ההצפנה. בחר קובץ קטן יותר ונסה שוב.', true);
      var passphrase = passphraseInput.value;
      if (passphrase.length < 10) return setStatus('בחר סיסמת הצפנה באורך 10 תווים לפחות.', true);

      uploadButton.disabled = true;
      uploadInProgress = true;
      var uploadedCount = 0;
      var objectName = null;
      try {
        // Android document providers can revoke a temporary File handle while an
        // authentication request is in flight. Copy every selected file into
        // memory immediately, before waiting for Supabase or MFA.
        setStatus('מכין/ה את הקבצים להצפנה…');
        var preparedFiles = [];
        for (var prepareIndex = 0; prepareIndex < files.length; prepareIndex += 1) {
          preparedFiles.push({ file: files[prepareIndex], bytes: await readSelectedFile(files[prepareIndex]) });
          if (!isDocumentSession(uploadUserId, uploadSessionEpoch)) throw new Error('DOCUMENT_SESSION_CHANGED');
        }
        await requireDocumentAccess(uploadUserId, uploadSessionEpoch);
        for (var index = 0; index < preparedFiles.length; index += 1) {
          if (documentSessionEpoch !== uploadSessionEpoch || !currentUser || String(currentUser.id) !== uploadUserId) {
            throw new Error('DOCUMENT_SESSION_CHANGED');
          }
          var file = preparedFiles[index].file;
          setStatus('מצפין/ה ומעלה ' + (index + 1) + ' מתוך ' + preparedFiles.length + '…');
          var encrypted = await encryptBytes(preparedFiles[index].bytes, passphrase);
          if (!isDocumentSession(uploadUserId, uploadSessionEpoch)) throw new Error('DOCUMENT_SESSION_CHANGED');
          var safeName = sanitizeFileName(file.name);
          objectName = uploadUserId + '/' + encodeURIComponent(tripId) + '/' + secureObjectId() + '-' + safeName + '.vault';
          var uploadResult = await client.storage.from(bucket).upload(objectName, encrypted.blob, {
            contentType: 'application/octet-stream',
            cacheControl: '0',
            upsert: false
          });
          if (uploadResult.error) throw uploadResult.error;
          if (documentSessionEpoch !== uploadSessionEpoch || !currentUser || String(currentUser.id) !== uploadUserId) {
            queuePendingCleanup(uploadUserId, objectName);
            throw new Error('DOCUMENT_SESSION_CHANGED');
          }
          var metadataResult = await client.from('travel_documents').insert({
            user_id: uploadUserId,
            trip_id: tripId,
            file_name: file.name,
            storage_path: objectName,
            mime_type: file.type || 'application/octet-stream',
            file_size: file.size,
            category: selectedCategory,
            note: selectedNote,
            encrypted: true,
            encryption_salt: bytesToBase64(encrypted.salt),
            encryption_iv: bytesToBase64(encrypted.iv)
          });
          if (metadataResult.error) {
            queuePendingCleanup(uploadUserId, objectName);
            if (isDocumentSession(uploadUserId, uploadSessionEpoch)) await flushPendingCleanup();
            if (readPendingCleanup(uploadUserId).indexOf(objectName) < 0) objectName = null;
            throw metadataResult.error;
          }
          objectName = null;
          if (!isDocumentSession(uploadUserId, uploadSessionEpoch)) return;
          uploadedCount += 1;
        }
        form.reset();
        passphraseInput.value = passphrase;
        setStatus(uploadedCount + ' קבצים הוצפנו ונשמרו בהצלחה בענן הפרטי.');
        await renderDocuments();
      } catch (error) {
        if (objectName) queuePendingCleanup(uploadUserId, objectName);
        if (!isDocumentSession(uploadUserId, uploadSessionEpoch)) return;
        if (objectName) await flushPendingCleanup();
        if (!isDocumentSession(uploadUserId, uploadSessionEpoch)) return;
        console.error('TravelMate vault upload failed', error);
        if (uploadedCount > 0) {
          input.value = '';
          await renderDocuments();
          if (!isDocumentSession(uploadUserId, uploadSessionEpoch)) return;
          var remainingCount = Math.max(1, preparedFiles.length - uploadedCount);
          setStatus(uploadedCount + ' קבצים נשמרו בהצלחה, אבל ' + remainingCount + ' לא נשמרו. בחר מחדש רק את הקבצים שלא נשמרו כדי למנוע כפילויות.', true);
        } else {
          setStatus(storageErrorMessage(error), true);
        }
      } finally {
        if (isDocumentSession(uploadUserId, uploadSessionEpoch)) {
          uploadInProgress = false;
          uploadButton.disabled = false;
        }
      }
    }

    async function openDocument(record, download) {
      if (!currentUser || String(record.user_id) !== String(currentUser.id) || !ownsStoragePath(currentUser.id, record.storage_path)) return;
      var openUserId = String(currentUser.id);
      var openEpoch = documentSessionEpoch;
      var passphrase = passphraseInput.value;
      if (passphrase.length < 10) return setStatus('הזן את סיסמת הצפנת הכספת לפני פתיחת המסמך.', true);
      setStatus('מוריד/ה ומפענח/ת את המסמך…');
      try {
        await requireDocumentAccess(openUserId, openEpoch);
        var result = await client.storage.from(bucket).download(record.storage_path);
        if (!isDocumentSession(openUserId, openEpoch)) return;
        if (result.error) return setStatus(storageErrorMessage(result.error), true);
        var decrypted = await decryptBlob(result.data, passphrase, base64ToBytes(record.encryption_salt), base64ToBytes(record.encryption_iv), record.mime_type);
        if (!isDocumentSession(openUserId, openEpoch)) return;
        if (download) {
          downloadBlob(decrypted, record.file_name);
          setStatus('המסמך פוענח והורד למכשיר.');
        } else {
          await showDocumentPreview(decrypted, record);
          if (!isDocumentSession(openUserId, openEpoch)) return;
          setStatus('המסמך פוענח ונפתח בתצוגה המאובטחת.');
        }
      } catch (error) {
        if (!isDocumentSession(openUserId, openEpoch)) return;
        console.error('TravelMate vault decrypt failed', error);
        setStatus('סיסמת ההצפנה שגויה או שהקובץ פגום.', true);
      }
    }

    function downloadBlob(blob, fileName) {
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = fileName || 'document';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    }

    async function showDocumentPreview(blob, record) {
      var previous = document.querySelector('[data-vault-preview]');
      if (previous && previous._closePreview) previous._closePreview();

      var preview = document.createElement('div');
      var objectUrl = URL.createObjectURL(blob);
      var type = String(record.mime_type || blob.type || 'application/octet-stream').toLowerCase();
      preview.className = 'vault-preview-backdrop open';
      preview.dataset.vaultPreview = '';
      preview.setAttribute('role', 'dialog');
      preview.setAttribute('aria-modal', 'true');
      preview.setAttribute('aria-label', 'תצוגת המסמך ' + record.file_name);
      preview.innerHTML = '<article class="vault-preview"><header><div><span>תצוגה מאובטחת</span><h2>' + escapeHtml(record.file_name) + '</h2><p>' + escapeHtml(storedCategoryForGroup(groupForCategory(record.category))) + ' · ' + formatSize(record.file_size) + '</p></div><button type="button" data-vault-preview-close aria-label="סגירת המסמך"><i class="fa-solid fa-xmark"></i></button></header><div class="vault-preview-body" data-vault-preview-body></div><footer><small><i class="fa-solid fa-shield-halved"></i> הקובץ פוענח רק בזיכרון המכשיר ולא נשלח לשירות חיצוני.</small><button type="button" data-vault-preview-download><i class="fa-solid fa-download"></i> הורדה למכשיר</button></footer></article>';
      var body = preview.querySelector('[data-vault-preview-body]');
      var closeButton = preview.querySelector('[data-vault-preview-close]');
      var previouslyFocused = document.activeElement;

      function closePreview() {
        if (preview.dataset.closed === 'true') return;
        preview.dataset.closed = 'true';
        URL.revokeObjectURL(objectUrl);
        document.body.classList.remove('vault-preview-open');
        preview.remove();
        if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus();
      }
      preview._closePreview = closePreview;
      closeButton.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        closePreview();
      });
      preview.querySelector('[data-vault-preview-download]').addEventListener('click', function () { downloadBlob(blob, record.file_name); });
      preview.addEventListener('click', function (event) { if (event.target === preview) closePreview(); });
      preview.addEventListener('keydown', function (event) { if (event.key === 'Escape') closePreview(); });
      document.body.classList.add('vault-preview-open');
      document.body.appendChild(preview);

      if (type.indexOf('image/') === 0) {
        var image = document.createElement('img');
        image.src = objectUrl;
        image.alt = record.file_name;
        body.appendChild(image);
      } else if (type === 'application/pdf') {
        await renderPdfPreview(blob, body);
      } else if (type.indexOf('text/') === 0 || type === 'application/json') {
        var text = document.createElement('pre');
        text.textContent = await blob.text();
        body.appendChild(text);
      } else {
        body.innerHTML = '<div class="vault-preview-unavailable"><i class="fa-solid fa-file-arrow-down"></i><strong>הקובץ פוענח בהצלחה</strong><p>הדפדפן אינו מציג קובץ מסוג זה בתוך האפליקציה. לחץ על „הורדה למכשיר” כדי לפתוח אותו באפליקציה המתאימה.</p></div>';
      }

      if (preview.isConnected) closeButton.focus();
    }

    async function renderPdfPreview(blob, body) {
      body.innerHTML = '<div class="vault-pdf-loading"><i class="fa-solid fa-spinner fa-spin"></i><strong>מכין תצוגה מקדימה…</strong><span>המסמך נשאר במכשיר ואינו נשלח החוצה</span></div>';
      try {
        var pdfjs = await loadPdfJs();
        var bytes = new Uint8Array(await blob.arrayBuffer());
        var pdf = await pdfjs.getDocument({ data: bytes }).promise;
        body.innerHTML = '<div class="vault-pdf-viewer"><div class="vault-pdf-toolbar"><button type="button" data-pdf-previous><i class="fa-solid fa-arrow-right"></i> הקודם</button><strong data-pdf-status></strong><button type="button" data-pdf-next>הבא <i class="fa-solid fa-arrow-left"></i></button></div><div class="vault-pdf-page"><canvas aria-label="עמוד PDF"></canvas></div></div>';
        var canvas = body.querySelector('canvas');
        var status = body.querySelector('[data-pdf-status]');
        var previousButton = body.querySelector('[data-pdf-previous]');
        var nextButton = body.querySelector('[data-pdf-next]');
        var currentPage = 1;
        var rendering = false;

        async function renderPage(pageNumber) {
          if (rendering) return;
          rendering = true;
          previousButton.disabled = true;
          nextButton.disabled = true;
          status.textContent = 'טוען עמוד ' + pageNumber + ' מתוך ' + pdf.numPages + '…';
          try {
            var page = await pdf.getPage(pageNumber);
            var naturalViewport = page.getViewport({ scale: 1 });
            var availableWidth = Math.max(260, Math.min(body.clientWidth - 28, 1000));
            var viewport = page.getViewport({ scale: availableWidth / naturalViewport.width });
            var outputScale = Math.min(window.devicePixelRatio || 1, 2);
            var context = canvas.getContext('2d', { alpha: false });
            canvas.width = Math.floor(viewport.width * outputScale);
            canvas.height = Math.floor(viewport.height * outputScale);
            canvas.style.width = Math.floor(viewport.width) + 'px';
            canvas.style.height = Math.floor(viewport.height) + 'px';
            await page.render({
              canvasContext: context,
              transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0],
              viewport: viewport
            }).promise;
            currentPage = pageNumber;
            status.textContent = 'עמוד ' + currentPage + ' מתוך ' + pdf.numPages;
          } finally {
            rendering = false;
            previousButton.disabled = currentPage <= 1;
            nextButton.disabled = currentPage >= pdf.numPages;
          }
        }

        previousButton.addEventListener('click', function () { if (currentPage > 1) renderPage(currentPage - 1); });
        nextButton.addEventListener('click', function () { if (currentPage < pdf.numPages) renderPage(currentPage + 1); });
        await renderPage(1);
      } catch (error) {
        console.error('TravelMate PDF preview failed', error);
        body.innerHTML = '<div class="vault-preview-unavailable"><i class="fa-solid fa-file-pdf"></i><strong>לא הצלחנו להציג את ה־PDF בתוך האפליקציה</strong><p>אפשר עדיין להשתמש בכפתור „הורדה למכשיר” למטה. בדוק את החיבור ונסה לפתוח שוב כדי לטעון את קורא ה־PDF.</p></div>';
      }
    }

    async function deleteDocument(record) {
      if (!currentUser || String(record.user_id) !== String(currentUser.id) || !ownsStoragePath(currentUser.id, record.storage_path)) return;
      var deleteUserId = String(currentUser.id);
      var deleteEpoch = documentSessionEpoch;
      if (!confirm('למחוק לצמיתות את המסמך מהענן? לא ניתן לבטל פעולה זו.')) return;
      setStatus('מוחק/ת את המסמך…');
      try {
      await requireDocumentAccess(deleteUserId, deleteEpoch);
      // Record intent before metadata removal so a lost response remains retryable.
      queuePendingCleanup(currentUser.id, record.storage_path);
      var metadataResult = await client.from('travel_documents').delete().eq('id', record.id).eq('user_id', deleteUserId).eq('storage_path', record.storage_path);
      if (!isDocumentSession(deleteUserId, deleteEpoch)) return;
      if (metadataResult.error) return setStatus(databaseErrorMessage(metadataResult.error), true);
      await flushPendingCleanup();
      if (!isDocumentSession(deleteUserId, deleteEpoch)) return;
      if (readPendingCleanup(deleteUserId).indexOf(record.storage_path) >= 0) {
        setStatus('המסמך הוסר מהרשימה. ניקוי הקובץ המוצפן יושלם אוטומטית כשהחיבור יאפשר זאת.');
        await renderDocuments();
        return;
      }
      setStatus('המסמך נמחק לצמיתות.');
      await renderDocuments();
      } catch (error) {
        if (isDocumentSession(deleteUserId, deleteEpoch)) setStatus(storageErrorMessage(error), true);
      }
    }

    function requestDocumentUpload(categoryName) {
      if (!currentUser) {
        setStatus('יש להתחבר לפני העלאת מסמך.');
        authPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        var email = authForm.elements.email;
        if (email) email.focus({ preventScroll: true });
        return;
      }
      var categories = [].slice.call(form.elements.category.options).map(function (option) { return option.value; });
      if (categoryName && categories.includes(categoryName)) form.elements.category.value = categoryName;
      input.value = '';
      input.click();
    }

    vaultPickButtons.forEach(function (button) {
      button.addEventListener('click', function () { requestDocumentUpload(''); });
    });
    input.addEventListener('change', function () {
      var selectedFiles = [].slice.call(input.files || []);
      if (!selectedFiles.length) return;
      saveFiles(selectedFiles);
    });
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      saveFiles([].slice.call(input.files || []));
    });
    ['dragenter', 'dragover'].forEach(function (name) {
      drop.addEventListener(name, function (event) { event.preventDefault(); drop.classList.add('dragging'); });
    });
    ['dragleave', 'drop'].forEach(function (name) {
      drop.addEventListener(name, function (event) { event.preventDefault(); drop.classList.remove('dragging'); });
    });
    drop.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      input.click();
    });
    drop.addEventListener('drop', function (event) { saveFiles([].slice.call(event.dataTransfer.files || [])); });
    section.addEventListener('click', function (event) {
      var row = event.target.closest('[data-document-id]');
      if (!row || !row._documentRecord) return;
      if (event.target.closest('[data-open-document]')) openDocument(row._documentRecord, false);
      if (event.target.closest('[data-download-document]')) openDocument(row._documentRecord, true);
      if (event.target.closest('[data-delete-document]')) deleteDocument(row._documentRecord);
    });
    section.querySelectorAll('.doc-row button').forEach(function (templateButton) {
      templateButton.addEventListener('click', function () {
        var categoryName = templateButton.closest('.doc-row').dataset.documentCategory;
        requestDocumentUpload(categoryName);
      });
    });

    var authEventVersion = 0;
    client.auth.onAuthStateChange(function (_event, session) { authEventVersion += 1; applySession(session); });
    window.addEventListener('online', function () { if (currentUser) flushPendingCleanup(); });
    var initialAuthVersion = authEventVersion;
    var sessionResult = await client.auth.getSession();
    if (initialAuthVersion === authEventVersion) await applySession(sessionResult.data.session);
  }

  async function deriveKey(passphrase, salt, usage) {
    var material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, [usage]);
  }

  async function readSelectedFile(file) {
    try {
      return await file.arrayBuffer();
    } catch (error) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () { resolve(reader.result); };
        reader.onerror = function () { reject(reader.error || error); };
        reader.onabort = function () { reject(new Error('FILE_SELECTION_ABORTED')); };
        try { reader.readAsArrayBuffer(file); } catch (fallbackError) { reject(fallbackError); }
      });
    }
  }

  async function encryptBytes(bytes, passphrase) {
    var salt = crypto.getRandomValues(new Uint8Array(16));
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var key = await deriveKey(passphrase, salt, 'encrypt');
    var encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, bytes);
    return { blob: new Blob([encrypted], { type: 'application/octet-stream' }), salt: salt, iv: iv };
  }

  async function decryptBlob(blob, passphrase, salt, iv, mimeType) {
    var key = await deriveKey(passphrase, salt, 'decrypt');
    var decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, await blob.arrayBuffer());
    return new Blob([decrypted], { type: mimeType || 'application/octet-stream' });
  }

  function bytesToBase64(bytes) {
    var binary = '';
    bytes.forEach(function (byte) { binary += String.fromCharCode(byte); });
    return btoa(binary);
  }
  function base64ToBytes(value) {
    var binary = atob(value || '');
    return Uint8Array.from(binary, function (character) { return character.charCodeAt(0); });
  }
  function sanitizeFileName(value) { return String(value || 'document').normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90) || 'document'; }
  function categoryForTitle(value) { return storedCategoryForGroup(groupForCategory(value)); }
  function formatSize(bytes) { bytes = Number(bytes || 0); if (bytes < 1024) return bytes + ' B'; if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'; return (bytes / 1048576).toFixed(1) + ' MB'; }
  function iconFor(type) { type = type || ''; if (type.includes('pdf')) return 'fa-file-pdf'; if (type.includes('image')) return 'fa-file-image'; if (type.includes('word')) return 'fa-file-word'; if (type.includes('sheet') || type.includes('excel')) return 'fa-file-excel'; return 'fa-file-lines'; }
  function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, function (character) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]; }); }
  function authRedirectUrl(hash) { var local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname); var base = local ? new URL(location.pathname.replace(/^\//, ''), 'https://lioracl.github.io/travelmate/') : new URL(location.pathname, location.origin); base.search = location.search; base.hash = hash || ''; return base.href; }
  function authErrorMessage(error) { var message = String(error && (error.message || error.code) || ''); if (/email not confirmed/i.test(message)) return 'החשבון עדיין לא אומת. לחץ על „לא קיבלתי מייל” כדי לשלוח שוב.'; if (/email address not authorized/i.test(message)) return 'Supabase אינו מורשה לשלוח לכתובת הזו. יש להגדיר SMTP פרטי או להשתמש בכתובת של חבר צוות הפרויקט.'; if (/rate limit|too many requests|over_email_send_rate_limit/i.test(message)) return 'הגעת למגבלת השליחה של Supabase. המתן כשעה ונסה שוב.'; if (/invalid login/i.test(message)) return 'כתובת הדוא״ל או סיסמת החשבון אינן נכונות.'; if (/already registered/i.test(message)) return 'כבר קיים חשבון עם כתובת זו. נסה להתחבר או שלח שוב את מייל האימות.'; if (/password/i.test(message)) return 'הסיסמה חייבת להכיל לפחות 8 תווים.'; return 'הפעולה נכשלה: ' + (message || 'נסה שוב בעוד רגע.'); }
  function databaseErrorMessage(error) { var message = String(error && error.message || ''); if (/travel_documents|schema cache|does not exist/i.test(message)) return 'הכספת עדיין לא הופעלה ב־Supabase. יש להריץ את קובץ ההגדרה ב־SQL Editor.'; return 'לא ניתן לקרוא כרגע את רשימת המסמכים.'; }
  async function requirePrivateStorageAccess() {
    if (window.TravelMateCloud && window.TravelMateCloud.getPrivateStorageSession) return window.TravelMateCloud.getPrivateStorageSession();
    if (!window.TravelMateCloud || !window.TravelMateCloud.getClient) { var unavailable = new Error('STORAGE_CLOUD_UNAVAILABLE'); unavailable.code = 'STORAGE_CLOUD_UNAVAILABLE'; throw unavailable; }
    var storageClient = await window.TravelMateCloud.getClient();
    var result = await storageClient.auth.getSession();
    if (result.error) throw result.error;
    if (!result.data.session || !result.data.session.user) { var error = new Error('STORAGE_SIGN_IN_REQUIRED'); error.code = 'STORAGE_SIGN_IN_REQUIRED'; throw error; }
    return { client: storageClient, session: result.data.session };
  }
  function secureObjectId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    var bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    return Array.from(bytes, function (byte) { return byte.toString(16).padStart(2, '0'); }).join('');
  }
  function storageErrorMessage(error) { var quota = String(error && (error.code || error.error || error.message) || ''); if (/EntityTooLarge|exceed.*(?:size|limit)|(?:size|limit).*exceed|413/i.test(quota)) return 'הקובץ המוצפן חורג ממגבלת האחסון. בחר קובץ קטן יותר ונסה שוב.'; if (/quota|capacity|storage.*full|insufficient.*storage/i.test(quota)) return 'אין כרגע מספיק מקום באחסון הענן. הקובץ לא נשמר; אפשר לנסות שוב כשהאחסון יהיה זמין.'; var message = String(error && (error.message || error.code || error.name) || ''); if (/requested file|directory could not be found|NotFoundError|FILE_SELECTION_ABORTED/i.test(message)) return 'הקובץ שבחרת לא היה זמין לקריאה. בחר אותו שוב מתוך „קבצים” או „הורדות” במכשיר.'; if (/MFA_REQUIRED/i.test(message)) return 'כדי לגשת למסמכים אישיים יש להשלים אימות דו־שלבי. פתח את ההגדרות, השלם אימות ונסה שוב.'; if (/STORAGE_SIGN_IN_REQUIRED|JWT|session/i.test(message)) return 'ההתחברות פגה. התחבר מחדש ולאחר מכן נסה להעלות שוב.'; if (/STORAGE_CLOUD_UNAVAILABLE/i.test(message)) return 'שירות הענן עדיין לא נטען. רענן את האפליקציה ונסה שוב.'; if (/bucket|not found/i.test(message)) return 'תיקיית המסמכים הפרטית עדיין לא הוגדרה ב־Supabase.'; if (/mime|content.?type/i.test(message)) return 'סוג הקובץ אינו מורשה עדיין באחסון. הפעל את עדכון ההעלאות ב־Supabase ונסה שוב.'; if (/row-level security|unauthorized|permission|403/i.test(message)) return 'האחסון דחה את ההרשאה. השלם אימות דו־שלבי או התחבר מחדש ונסה שוב.'; if (/network|fetch|timeout/i.test(message)) return 'החיבור לענן נכשל. בדוק את הרשת ונסה שוב.'; return 'הפעולה מול האחסון נכשלה: ' + (message || 'נסה שוב.'); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

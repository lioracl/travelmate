(function () {
  'use strict';

  var MAX_FILE_SIZE = 25 * 1024 * 1024;
  var PBKDF2_ITERATIONS = 310000;
  var SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.7/dist/umd/supabase.min.js';
  var SUPABASE_SRI = 'sha384-BmlQlKlDvXvKoxkn5OQuUo/aJQCTXeB+Kls6EccBmG4Kf8AXvp89RtO9MtPxP/r5';
  var initialized = false;

  function loadSupabaseLibrary() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve(window.supabase);
    if (window.travelMateSupabaseLoader) return window.travelMateSupabaseLoader;
    window.travelMateSupabaseLoader = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = SUPABASE_CDN;
      script.integrity = SUPABASE_SRI;
      script.crossOrigin = 'anonymous';
      script.onload = function () { resolve(window.supabase); };
      script.onerror = function () { reject(new Error('SUPABASE_LIBRARY_FAILED')); };
      document.head.appendChild(script);
    });
    return window.travelMateSupabaseLoader;
  }

  function createVaultMarkup() {
    return '<div class="vault-head"><div><span class="vault-badge"><i class="fa-solid fa-shield-halved"></i> ענן פרטי ומוצפן</span><h2>כספת המסמכים של הטיול</h2><p>הקבצים מוצפנים במכשיר לפני ההעלאה ונפתחים רק לאחר הזנת סיסמת הכספת.</p></div><button class="pill-btn" type="button" data-vault-pick><i class="fa-solid fa-cloud-arrow-up"></i> העלאת קבצים</button></div>' +
      '<div class="vault-auth" data-vault-auth><div class="vault-auth-copy"><i class="fa-solid fa-user-lock"></i><div><strong>התחברות לכספת</strong><span>החשבון מגן על המסמכים ומאפשר גישה גם מהטלפון.</span></div></div><form data-vault-auth-form><input name="email" type="email" autocomplete="email" placeholder="כתובת דוא״ל" required><input name="password" type="password" autocomplete="current-password" minlength="8" placeholder="סיסמת חשבון · לפחות 8 תווים" required><button type="submit" data-auth-signin>כניסה</button><button type="button" class="secondary" data-auth-signup>יצירת חשבון</button><button type="button" class="secondary" data-auth-resend>לא קיבלתי מייל · שלח שוב</button></form></div>' +
      '<div class="vault-session" data-vault-session hidden><div><i class="fa-solid fa-circle-check"></i><span>מחובר/ת בתור <strong data-vault-email></strong></span></div><button type="button" data-vault-signout>יציאה</button></div>' +
      '<div class="vault-unlock" data-vault-unlock hidden><label><span>סיסמת הצפנת הכספת</span><span class="vault-passphrase-control"><input data-vault-passphrase type="password" autocomplete="off" minlength="10" placeholder="אותה סיסמה שבה הצפנת את הקבצים"><button type="button" data-vault-toggle-passphrase aria-label="הצגת סיסמת הכספת"><i class="fa-solid fa-eye"></i></button></span></label><small><i class="fa-solid fa-triangle-exclamation"></i> לפתיחת מסמך יש להזין את אותה סיסמת כספת ששימשה בהעלאה. היא נפרדת מסיסמת החשבון ואינה נשמרת.</small></div>' +
      '<form class="vault-upload" data-vault-form hidden><select name="category" aria-label="קטגוריה"><option>טיסות</option><option>לינה</option><option>ביטוח</option><option>תחבורה</option><option>כרטיסים</option><option>דרכון ואשרות</option><option>אחר</option></select><input name="note" type="text" maxlength="180" placeholder="הערה אופציונלית — ללא מספרי דרכון"><button class="vault-upload-button" type="submit"><i class="fa-solid fa-lock"></i> הצפנה ושמירה</button><label class="vault-drop" data-vault-drop><input name="files" type="file" multiple hidden accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.txt"><span><i class="fa-solid fa-file-shield"></i><strong>גרור קבצים לכאן או לחץ לבחירה</strong><small>PDF, תמונות וקובצי Office · עד 25MB לקובץ</small></span></label></form>' +
      '<p class="vault-status" data-vault-status aria-live="polite"></p><div class="vault-summary" data-vault-summary hidden><strong data-vault-count>0 מסמכים</strong><div><small data-vault-size>0 MB</small><div class="vault-storage"><i data-vault-storage style="width:0%"></i></div></div></div><div class="vault-list" data-vault-list></div>';
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
    section.querySelector('.section-head').insertAdjacentElement('afterend', vault);

    var status = vault.querySelector('[data-vault-status]');
    function setStatus(message, error) {
      status.textContent = message || '';
      status.classList.toggle('error', Boolean(error));
    }

    if (!config || !config.url || !config.publishableKey) {
      setStatus('חיבור האחסון טרם הוגדר.', true);
      return;
    }

    var library;
    try {
      library = await loadSupabaseLibrary();
    } catch (error) {
      setStatus('לא ניתן לטעון כרגע את שירות האחסון. בדקי את החיבור לאינטרנט.', true);
      return;
    }

    var client = window.TravelMateCloud
      ? await window.TravelMateCloud.getClient()
      : library.createClient(config.url, config.publishableKey, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        });
    var bucket = config.documentBucket || 'travel-documents';
    var authPanel = vault.querySelector('[data-vault-auth]');
    var authForm = vault.querySelector('[data-vault-auth-form]');
    var sessionPanel = vault.querySelector('[data-vault-session]');
    var unlockPanel = vault.querySelector('[data-vault-unlock]');
    var passphraseInput = vault.querySelector('[data-vault-passphrase]');
    var form = vault.querySelector('[data-vault-form]');
    var input = form.elements.files;
    var drop = vault.querySelector('[data-vault-drop]');
    var uploadButton = form.querySelector('.vault-upload-button');
    var summary = vault.querySelector('[data-vault-summary]');
    var list = vault.querySelector('[data-vault-list]');
    var currentUser = null;
    var categoryTargets = {};

    section.querySelectorAll('.doc-list > .doc-row').forEach(function (categoryRow) {
      var title = categoryRow.querySelector('strong');
      var categoryButton = categoryRow.querySelector(':scope > button');
      if (!title || !categoryButton) return;
      var categoryName = categoryForTitle(title.textContent.trim());
      var filesContainer = document.createElement('div');
      filesContainer.className = 'doc-category-files';
      filesContainer.dataset.categoryFiles = categoryName;
      categoryRow.dataset.documentCategory = categoryName;
      categoryRow.appendChild(filesContainer);
      categoryTargets[categoryName] = { row: categoryRow, button: categoryButton, files: filesContainer };
    });

    async function applySession(session) {
      currentUser = session && session.user ? session.user : null;
      authPanel.hidden = Boolean(currentUser);
      sessionPanel.hidden = !currentUser;
      unlockPanel.hidden = !currentUser;
      form.hidden = !currentUser;
      summary.hidden = !currentUser;
      vault.querySelector('[data-vault-pick]').disabled = !currentUser;
      vault.querySelector('[data-vault-email]').textContent = currentUser ? currentUser.email : '';
      if (!currentUser) {
        passphraseInput.value = '';
        list.innerHTML = '';
        setStatus('יש להתחבר כדי לראות או להעלות מסמכים.');
        return;
      }
      setStatus('הכספת מחוברת. הזן את סיסמת ההצפנה כדי להעלות או לפתוח מסמך.');
      await renderDocuments();
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
      await client.auth.signOut();
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

    async function renderDocuments() {
      if (!currentUser) return;
      var result = await client.from('travel_documents').select('*').eq('trip_id', tripId).order('created_at', { ascending: false });
      if (result.error) {
        setStatus(databaseErrorMessage(result.error), true);
        return;
      }
      var documents = result.data || [];
      var total = documents.reduce(function (sum, item) { return sum + Number(item.file_size || 0); }, 0);
      vault.querySelector('[data-vault-count]').textContent = documents.length + ' מסמכים';
      vault.querySelector('[data-vault-size]').textContent = formatSize(total) + ' בענן';
      vault.querySelector('[data-vault-storage]').style.width = Math.min(100, Math.max(documents.length ? 2 : 0, total / (1024 * 1024 * 1024) * 100)) + '%';
      list.innerHTML = '';
      list.hidden = true;
      Object.keys(categoryTargets).forEach(function (categoryName) {
        var target = categoryTargets[categoryName];
        target.files.innerHTML = '';
        target.row.classList.remove('has-documents');
        target.button.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> העלאה';
      });
      documents.forEach(function (documentRecord) {
        var categoryTarget = categoryTargets[documentRecord.category];
        if (categoryTarget) {
          categoryTarget.files.appendChild(createCategoryDocument(documentRecord));
          categoryTarget.row.classList.add('has-documents');
          var categoryCount = categoryTarget.files.children.length;
          categoryTarget.button.innerHTML = '<i class="fa-solid fa-plus"></i> העלאה נוספת (' + categoryCount + ')';
          return;
        }
        list.hidden = false;
        var row = document.createElement('article');
        row.className = 'vault-file';
        row.dataset.documentId = documentRecord.id;
        row.innerHTML = '<span class="vault-file-icon"><i class="fa-solid ' + iconFor(documentRecord.mime_type) + '"></i></span><span class="vault-file-copy"><strong>' + escapeHtml(documentRecord.file_name) + '</strong><span>' + escapeHtml(documentRecord.category) + ' · ' + formatSize(documentRecord.file_size) + ' · ' + new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(documentRecord.created_at)) + (documentRecord.note ? ' · ' + escapeHtml(documentRecord.note) : '') + '</span></span><span class="vault-file-actions"><button type="button" data-open-document><i class="fa-solid fa-eye"></i> פתיחה</button><button type="button" data-download-document aria-label="הורדה"><i class="fa-solid fa-download"></i></button><button type="button" class="danger" data-delete-document aria-label="מחיקה"><i class="fa-solid fa-trash"></i></button></span>';
        row._documentRecord = documentRecord;
        list.appendChild(row);
      });
    }

    function createCategoryDocument(documentRecord) {
      var item = document.createElement('div');
      item.className = 'doc-category-file';
      item.dataset.documentId = documentRecord.id;
      item.innerHTML = '<span class="doc-category-file-icon"><i class="fa-solid ' + iconFor(documentRecord.mime_type) + '"></i></span><span class="doc-category-file-copy"><strong>' + escapeHtml(documentRecord.file_name) + '</strong><small>' + formatSize(documentRecord.file_size) + ' · ' + new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(documentRecord.created_at)) + (documentRecord.note ? ' · ' + escapeHtml(documentRecord.note) : '') + '</small></span><span class="doc-category-file-actions"><button type="button" data-open-document><i class="fa-solid fa-eye"></i> פתיחה</button><button type="button" data-download-document aria-label="הורדה"><i class="fa-solid fa-download"></i></button><button type="button" class="danger" data-delete-document aria-label="מחיקה"><i class="fa-solid fa-trash"></i></button></span>';
      item._documentRecord = documentRecord;
      return item;
    }

    async function saveFiles(files) {
      if (!currentUser) return setStatus('יש להתחבר לפני העלאת מסמך.', true);
      if (!files.length) return setStatus('בחר לפחות קובץ אחד.', true);
      var tooLarge = files.find(function (file) { return file.size > MAX_FILE_SIZE; });
      if (tooLarge) return setStatus('הקובץ ' + tooLarge.name + ' גדול מ־25MB.', true);
      var passphrase = passphraseInput.value;
      if (passphrase.length < 10) return setStatus('בחר סיסמת הצפנה באורך 10 תווים לפחות.', true);

      uploadButton.disabled = true;
      var uploadedCount = 0;
      try {
        for (var index = 0; index < files.length; index += 1) {
          var file = files[index];
          setStatus('מצפין/ה ומעלה ' + (index + 1) + ' מתוך ' + files.length + '…');
          var encrypted = await encryptFile(file, passphrase);
          var safeName = sanitizeFileName(file.name);
          var objectName = currentUser.id + '/' + encodeURIComponent(tripId) + '/' + crypto.randomUUID() + '-' + safeName + '.vault';
          var uploadResult = await client.storage.from(bucket).upload(objectName, encrypted.blob, {
            contentType: 'application/octet-stream',
            cacheControl: '0',
            upsert: false
          });
          if (uploadResult.error) throw uploadResult.error;
          var metadataResult = await client.from('travel_documents').insert({
            user_id: currentUser.id,
            trip_id: tripId,
            file_name: file.name,
            storage_path: objectName,
            mime_type: file.type || 'application/octet-stream',
            file_size: file.size,
            category: form.elements.category.value,
            note: form.elements.note.value.trim(),
            encrypted: true,
            encryption_salt: bytesToBase64(encrypted.salt),
            encryption_iv: bytesToBase64(encrypted.iv)
          });
          if (metadataResult.error) {
            await client.storage.from(bucket).remove([objectName]);
            throw metadataResult.error;
          }
          uploadedCount += 1;
        }
        form.reset();
        passphraseInput.value = passphrase;
        setStatus(uploadedCount + ' קבצים הוצפנו ונשמרו בהצלחה בענן הפרטי.');
        await renderDocuments();
      } catch (error) {
        console.error('TravelMate vault upload failed', error);
        setStatus(storageErrorMessage(error), true);
      } finally {
        uploadButton.disabled = false;
      }
    }

    async function openDocument(record, download) {
      var passphrase = passphraseInput.value;
      if (passphrase.length < 10) return setStatus('הזן את סיסמת הצפנת הכספת לפני פתיחת המסמך.', true);
      setStatus('מוריד/ה ומפענח/ת את המסמך…');
      var result = await client.storage.from(bucket).download(record.storage_path);
      if (result.error) return setStatus(storageErrorMessage(result.error), true);
      try {
        var decrypted = await decryptBlob(result.data, passphrase, base64ToBytes(record.encryption_salt), base64ToBytes(record.encryption_iv), record.mime_type);
        if (download) {
          downloadBlob(decrypted, record.file_name);
          setStatus('המסמך פוענח והורד למכשיר.');
        } else {
          await showDocumentPreview(decrypted, record);
          setStatus('המסמך פוענח ונפתח בתצוגה המאובטחת.');
        }
      } catch (error) {
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
      preview.innerHTML = '<article class="vault-preview"><header><div><span>תצוגה מאובטחת</span><h2>' + escapeHtml(record.file_name) + '</h2><p>' + escapeHtml(record.category) + ' · ' + formatSize(record.file_size) + '</p></div><button type="button" data-vault-preview-close aria-label="סגירת המסמך"><i class="fa-solid fa-xmark"></i></button></header><div class="vault-preview-body" data-vault-preview-body></div><footer><small><i class="fa-solid fa-shield-halved"></i> הקובץ פוענח רק בזיכרון המכשיר ולא נשלח לשירות חיצוני.</small><button type="button" data-vault-preview-download><i class="fa-solid fa-download"></i> הורדה למכשיר</button></footer></article>';
      var body = preview.querySelector('[data-vault-preview-body]');

      if (type.indexOf('image/') === 0) {
        var image = document.createElement('img');
        image.src = objectUrl;
        image.alt = record.file_name;
        body.appendChild(image);
      } else if (type === 'application/pdf') {
        var frame = document.createElement('iframe');
        frame.src = objectUrl;
        frame.title = record.file_name;
        body.appendChild(frame);
      } else if (type.indexOf('text/') === 0 || type === 'application/json') {
        var text = document.createElement('pre');
        text.textContent = await blob.text();
        body.appendChild(text);
      } else {
        body.innerHTML = '<div class="vault-preview-unavailable"><i class="fa-solid fa-file-arrow-down"></i><strong>הקובץ פוענח בהצלחה</strong><p>הדפדפן אינו מציג קובץ מסוג זה בתוך האפליקציה. לחץ על „הורדה למכשיר” כדי לפתוח אותו באפליקציה המתאימה.</p></div>';
      }

      function closePreview() {
        URL.revokeObjectURL(objectUrl);
        preview.remove();
      }
      preview._closePreview = closePreview;
      preview.querySelector('[data-vault-preview-close]').addEventListener('click', closePreview);
      preview.querySelector('[data-vault-preview-download]').addEventListener('click', function () { downloadBlob(blob, record.file_name); });
      preview.addEventListener('click', function (event) { if (event.target === preview) closePreview(); });
      preview.addEventListener('keydown', function (event) { if (event.key === 'Escape') closePreview(); });
      document.body.appendChild(preview);
      preview.querySelector('[data-vault-preview-close]').focus();
    }

    async function deleteDocument(record) {
      if (!confirm('למחוק לצמיתות את המסמך מהענן? לא ניתן לבטל פעולה זו.')) return;
      setStatus('מוחק/ת את המסמך…');
      var storageResult = await client.storage.from(bucket).remove([record.storage_path]);
      if (storageResult.error) return setStatus(storageErrorMessage(storageResult.error), true);
      var metadataResult = await client.from('travel_documents').delete().eq('id', record.id);
      if (metadataResult.error) return setStatus(databaseErrorMessage(metadataResult.error), true);
      setStatus('המסמך נמחק לצמיתות.');
      await renderDocuments();
    }

    vault.querySelector('[data-vault-pick]').addEventListener('click', function () {
      if (!currentUser) return setStatus('יש להתחבר לפני העלאת קובץ.', true);
      input.click();
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
        if (!currentUser) return setStatus('התחבר לכספת לפני העלאת מסמך.', true);
        var categoryName = templateButton.closest('.doc-row').dataset.documentCategory;
        var categories = [].slice.call(form.elements.category.options).map(function (option) { return option.value; });
        if (categoryName && categories.includes(categoryName)) form.elements.category.value = categoryName;
        input.click();
      });
    });

    client.auth.onAuthStateChange(function (_event, session) { setTimeout(function () { applySession(session); }, 0); });
    var sessionResult = await client.auth.getSession();
    await applySession(sessionResult.data.session);
  }

  async function deriveKey(passphrase, salt, usage) {
    var material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, [usage]);
  }

  async function encryptFile(file, passphrase) {
    var salt = crypto.getRandomValues(new Uint8Array(16));
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var key = await deriveKey(passphrase, salt, 'encrypt');
    var encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, await file.arrayBuffer());
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
  function categoryForTitle(value) { value = String(value || ''); if (/טיס/.test(value)) return 'טיסות'; if (/מלון|לינה/.test(value)) return 'לינה'; if (/ביטוח|דרכון|אשר/.test(value)) return 'ביטוח'; if (/רכב|רכבת|JR|תחבורה/.test(value)) return 'תחבורה'; if (/כרטיס/.test(value)) return 'כרטיסים'; return value || 'אחר'; }
  function formatSize(bytes) { bytes = Number(bytes || 0); if (bytes < 1024) return bytes + ' B'; if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'; return (bytes / 1048576).toFixed(1) + ' MB'; }
  function iconFor(type) { type = type || ''; if (type.includes('pdf')) return 'fa-file-pdf'; if (type.includes('image')) return 'fa-file-image'; if (type.includes('word')) return 'fa-file-word'; if (type.includes('sheet') || type.includes('excel')) return 'fa-file-excel'; return 'fa-file-lines'; }
  function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, function (character) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]; }); }
  function authRedirectUrl(hash) { var local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname); var base = local ? new URL(location.pathname.replace(/^\//, ''), 'https://lioracl.github.io/travelmate/') : new URL(location.pathname, location.origin); base.search = location.search; base.hash = hash || ''; return base.href; }
  function authErrorMessage(error) { var message = String(error && (error.message || error.code) || ''); if (/email not confirmed/i.test(message)) return 'החשבון עדיין לא אומת. לחץ על „לא קיבלתי מייל” כדי לשלוח שוב.'; if (/email address not authorized/i.test(message)) return 'Supabase אינו מורשה לשלוח לכתובת הזו. יש להגדיר SMTP פרטי או להשתמש בכתובת של חבר צוות הפרויקט.'; if (/rate limit|too many requests|over_email_send_rate_limit/i.test(message)) return 'הגעת למגבלת השליחה של Supabase. המתן כשעה ונסה שוב.'; if (/invalid login/i.test(message)) return 'כתובת הדוא״ל או סיסמת החשבון אינן נכונות.'; if (/already registered/i.test(message)) return 'כבר קיים חשבון עם כתובת זו. נסה להתחבר או שלח שוב את מייל האימות.'; if (/password/i.test(message)) return 'הסיסמה חייבת להכיל לפחות 8 תווים.'; return 'הפעולה נכשלה: ' + (message || 'נסה שוב בעוד רגע.'); }
  function databaseErrorMessage(error) { var message = String(error && error.message || ''); if (/travel_documents|schema cache|does not exist/i.test(message)) return 'הכספת עדיין לא הופעלה ב־Supabase. יש להריץ את קובץ ההגדרה ב־SQL Editor.'; return 'לא ניתן לקרוא כרגע את רשימת המסמכים.'; }
  function storageErrorMessage(error) { var message = String(error && error.message || ''); if (/bucket|not found/i.test(message)) return 'תיקיית המסמכים הפרטית עדיין לא הוגדרה ב־Supabase.'; if (/row-level security|unauthorized|permission/i.test(message)) return 'אין הרשאה לפעולה. התחבר מחדש ובדוק שהרשאות הכספת הופעלו.'; return 'הפעולה מול האחסון נכשלה. נסה שוב.'; }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

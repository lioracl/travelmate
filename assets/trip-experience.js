(function () {
  'use strict';
  if (window.__travelMateTripExperienceLoaded || !/\/trip\//.test(location.pathname.replace(/\\/g, '/'))) return;
  window.__travelMateTripExperienceLoaded = true;

  var cloud = window.TravelMateCloud;
  var state = { trip: null, rate: null, rates: {}, ilsRates: { ILS: 1 }, rateDate: '', rateSource: '', rateSourceUrl: '', fee: 2.5, expenses: [], budgetCategories: [], memories: [], albumUrl: '', localCurrency: 'EUR' };
  function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, function (character) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]; }); }
  function readJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch (error) { return fallback; } }
  function writeJson(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) {} }
  function tripId() { return String(state.trip && state.trip.id || new URLSearchParams(location.search).get('id') || location.pathname); }
  function storageKey(name) { return 'travelmate-experience:' + tripId() + ':' + name; }
  function money(value, currency) { return new Intl.NumberFormat('he-IL', { style: 'currency', currency: currency, maximumFractionDigits: 2 }).format(Number(value || 0)); }
  function currencySymbol(currency) { var part = new Intl.NumberFormat('he-IL', { style: 'currency', currency: currency }).formatToParts(0).find(function (item) { return item.type === 'currency'; }); return part ? part.value : currency; }
  function clean(value) { return String(value || '').replace(/[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}]/gu, '').trim(); }
  function countryCurrency(country) {
    var value = clean(country).toLowerCase();
    var groups = {
      ILS: ['ישראל', 'israel'],
      CZK: ['צכיה', "צ'כיה", 'הרפובליקה הצכית', 'czechia', 'czech republic'],
      JPY: ['יפן', 'japan'],
      GBP: ['בריטניה', 'אנגליה', 'סקוטלנד', 'וויילס', 'united kingdom', 'uk', 'england', 'scotland', 'wales'],
      CHF: ['שווייץ', 'שוויץ', 'switzerland'],
      PLN: ['פולין', 'poland'],
      HUF: ['הונגריה', 'hungary'],
      TRY: ['טורקיה', 'turkey', 'türkiye'],
      USD: ['ארצות הברית', 'ארה"ב', 'usa', 'united states'],
      CAD: ['קנדה', 'canada'],
      DKK: ['דנמרק', 'denmark'],
      SEK: ['שוודיה', 'sweden'],
      NOK: ['נורווגיה', 'norway'],
      RON: ['רומניה', 'romania'],
      ISK: ['איסלנד', 'iceland'],
      AUD: ['אוסטרליה', 'australia'],
      NZD: ['ניו זילנד', 'new zealand'],
      CNY: ['סין', 'china'],
      KRW: ['קוריאה הדרומית', 'דרום קוריאה', 'south korea'],
      INR: ['הודו', 'india'],
      THB: ['תאילנד', 'thailand'],
      MXN: ['מקסיקו', 'mexico'],
      BRL: ['ברזיל', 'brazil'],
      ZAR: ['דרום אפריקה', 'south africa']
    };
    var code = Object.keys(groups).find(function (currency) { return groups[currency].some(function (name) { return value === name || value.indexOf(name) >= 0; }); });
    return code || 'EUR';
  }
  function localFromEuros(euros) { return Number(euros || 0) * Number(state.localCurrency === 'EUR' ? 1 : state.rates[state.localCurrency] || 0); }
  function localRateInIls() { var localRate = state.localCurrency === 'EUR' ? 1 : Number(state.rates[state.localCurrency] || 0); return localRate && state.rate ? state.rate / localRate : 0; }
  function inferBudget() { var explicit = Number(state.trip && state.trip.budget || String(document.querySelector('[data-budget]') && document.querySelector('[data-budget]').textContent || '').replace(/[^0-9.]/g, '') || 0); if (explicit) return explicit; var text = document.querySelector('.budget-card') && document.querySelector('.budget-card').textContent || document.getElementById('budget') && document.getElementById('budget').textContent || ''; var match = text.match(/מתוך\s*([\d,.]+)\s*€/i) || text.match(/([\d,.]+)\s*€/); return match ? Number(match[1].replace(/,/g, '')) : 0; }
  function toast(message) { var old = document.querySelector('.trip-experience-toast'); if (old) old.remove(); var node = document.createElement('div'); node.className = 'trip-experience-toast'; node.textContent = message; document.body.appendChild(node); setTimeout(function () { node.remove(); }, 2800); }
  function saveTripData() { if (!state.trip) return; state.trip.expenses = state.expenses; state.trip.budgetCategories = state.budgetCategories; state.trip.memories = state.memories; state.trip.photoAlbumUrl = state.albumUrl; state.trip.currencyFee = state.fee; if (new URLSearchParams(location.search).get('id') && cloud && cloud.queueTripSave) cloud.queueTripSave(state.trip); }

  function setupCollapsibleSections() {
    document.querySelectorAll('.tm-collapse-button').forEach(function (button) { button.remove(); });
    document.querySelectorAll('.tm-collapsible,.tm-collapsed').forEach(function (section) {
      section.classList.remove('tm-collapsible', 'tm-collapsed');
      delete section.dataset.collapsibleReady;
    });
    return;
    document.querySelectorAll('.content > .section[id]').forEach(function (section) {
      if (section.classList.contains('hero') || section.dataset.collapsibleReady) return;
      var head = section.querySelector(':scope > .section-head'); if (!head) return;
      section.dataset.collapsibleReady = 'true'; section.classList.add('tm-collapsible');
      var button = document.createElement('button'); button.type = 'button'; button.className = 'tm-collapse-button'; button.innerHTML = '<i class="fa-solid fa-chevron-up"></i><span>סגור אזור</span>'; button.setAttribute('aria-controls', section.id);
      var key = storageKey('collapsed:' + section.id);
      function setCollapsed(collapsed) { section.classList.toggle('tm-collapsed', collapsed); button.setAttribute('aria-expanded', String(!collapsed)); button.querySelector('span').textContent = collapsed ? 'פתח אזור' : 'סגור אזור'; writeJson(key, collapsed); }
      button.onclick = function () { setCollapsed(!section.classList.contains('tm-collapsed')); }; head.appendChild(button); setCollapsed(readJson(key, false));
    });
    expandHashSection();
  }
  function expandHashSection() { var target = location.hash && document.querySelector(location.hash); if (!target || !target.classList.contains('tm-collapsed')) return; target.classList.remove('tm-collapsed'); var button = target.querySelector('.tm-collapse-button'); if (button) { button.setAttribute('aria-expanded', 'true'); button.querySelector('span').textContent = 'סגור אזור'; } writeJson(storageKey('collapsed:' + target.id), false); }
  window.addEventListener('hashchange', expandHashSection);

  async function fetchRateJson(url, timeout) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, timeout || 6000) : null;
    try {
      var response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller ? controller.signal : undefined });
      if (!response.ok) throw new Error('rate-http-' + response.status);
      return await response.json();
    } finally { if (timer) clearTimeout(timer); }
  }
  async function loadRate() {
    var cacheKey = 'travelmate-eur-rates:' + state.localCurrency;
    var cached = readJson(cacheKey, null);
    if (cached && Number(cached.rate) > 0 && Date.now() - Number(cached.savedAt || 0) < 43200000) { state.rates = cached.rates || { ILS: Number(cached.rate) }; state.ilsRates = cached.ilsRates || state.ilsRates; state.rate = Number(cached.rate || state.rates.ILS); state.rateDate = cached.date || ''; state.rateSource = cached.source || 'ECB דרך Frankfurter'; state.rateSourceUrl = cached.sourceUrl || 'https://frankfurter.dev/'; renderCurrency(); renderCurrencyConverter(); }
    try {
      var symbols = ['ILS','USD','GBP','JPY','CHF','CZK','PLN','HUF','RON','CAD','AUD','NZD','DKK','SEK','NOK','TRY','CNY','KRW','INR','THB','MXN','BRL','ZAR',state.localCurrency].filter(function (item, index, list) { return item !== 'EUR' && list.indexOf(item) === index; }).join(',');
      var data;
      try {
        data = await fetchRateJson('https://api.frankfurter.dev/v1/latest?base=EUR&symbols=' + encodeURIComponent(symbols), 6000);
        if (!data.rates || !Number(data.rates.ILS)) throw new Error('invalid-frankfurter-rate');
        state.rateSource = 'ECB דרך Frankfurter'; state.rateSourceUrl = 'https://frankfurter.dev/';
      } catch (primaryError) {
        var fallback = await fetchRateJson('https://open.er-api.com/v6/latest/EUR', 6000);
        if (!fallback.rates || !Number(fallback.rates.ILS)) throw primaryError;
        data = { rates: fallback.rates, date: fallback.time_last_update_utc || '' };
        state.rateSource = 'ExchangeRate-API'; state.rateSourceUrl = 'https://www.exchangerate-api.com/docs/free';
      }
      state.rates = data.rates; state.rate = Number(data.rates.ILS); state.rateDate = data.date || '';
      Object.keys(data.rates).forEach(function (code) { if (Number(data.rates[code])) state.ilsRates[code] = state.rate / Number(data.rates[code]); });
      writeJson(cacheKey, { rate: state.rate, rates: state.rates, ilsRates: state.ilsRates, source: state.rateSource, sourceUrl: state.rateSourceUrl, date: state.rateDate, savedAt: Date.now() }); renderCurrency(); renderCurrencyConverter();
    } catch (error) { if (!state.rate) renderCurrency(true); }
  }
  function currencyRateInIls(code) { if (code === 'ILS') return 1; if (state.ilsRates[code]) return Number(state.ilsRates[code]); if (code === 'EUR') return Number(state.rate || 0); return state.rate && state.rates[code] ? Number(state.rate) / Number(state.rates[code]) : 0; }
  function convertCurrency(amount, from, to) { var fromRate = currencyRateInIls(from); var toRate = currencyRateInIls(to); return fromRate && toRate ? Number(amount || 0) * fromRate / toRate : 0; }
  function shekels(euros) { return Number(euros || 0) * Number(state.rate || 0) * (1 + state.fee / 100); }
  function referenceShekels(euros) { return Number(euros || 0) * Number(state.rate || 0); }
  function renderBudgetCategoryIls() {
    document.querySelectorAll('#budget [data-expenses] .expense').forEach(function (row) {
      var euroNode = row.querySelector('div span');
      if (!euroNode) return;
      if (!row.dataset.euroAmount) {
        var match = euroNode.textContent.match(/[\d,.]+/);
        row.dataset.euroAmount = match ? String(Number(match[0].replace(/,/g, ''))) : '0';
      }
      if (state.localCurrency !== 'EUR' && state.rates[state.localCurrency]) euroNode.textContent = money(localFromEuros(row.dataset.euroAmount), state.localCurrency);
      var insight = row.querySelector('[data-category-ils]');
      if (!insight) {
        insight = document.createElement('small');
        insight.dataset.categoryIls = '';
        insight.className = 'budget-category-ils';
        euroNode.insertAdjacentElement('afterend', insight);
      }
      insight.textContent = state.rate ? 'כ־' + money(referenceShekels(row.dataset.euroAmount), 'ILS') + ' לפי השער היציג' : 'מעדכן סכום בשקלים…';
    });
  }
  function renderLocalBudgetTotals() {
    document.querySelectorAll('[data-budget]').forEach(function (node) {
      if (!node.dataset.euroAmount) {
        var raw = Number(String(node.textContent || '').replace(/[^0-9.]/g, ''));
        node.dataset.euroAmount = String(raw || Number(state.trip && state.trip.budget || 0));
      }
      var localAmount = state.localCurrency === 'EUR' ? Number(node.dataset.euroAmount) : localFromEuros(node.dataset.euroAmount);
      if (!localAmount && state.localCurrency !== 'EUR') return;
      node.textContent = Math.round(localAmount).toLocaleString('he-IL');
      var parent = node.parentElement;
      if (parent && parent.firstChild && parent.firstChild.nodeType === 3) parent.firstChild.nodeValue = currencySymbol(state.localCurrency);
    });
  }
  function renderCurrency(failed) {
    document.querySelectorAll('[data-currency-insight]').forEach(function (host) {
      var amount = Number(host.dataset.euros || 0);
      var localAmount = state.localCurrency === 'EUR' ? amount : localFromEuros(amount);
      var localRate = localRateInIls();
      host.innerHTML = state.rate && (state.localCurrency === 'EUR' || localAmount) ? '<div><span><b>' + money(localAmount, state.localCurrency) + '</b> · כ־' + money(shekels(amount), 'ILS') + ' כולל עמלת המרה של ' + state.fee.toLocaleString('he-IL') + '%</span><small>המטבע המקומי: ' + state.localCurrency + ' · ' + (localRate ? money(1, state.localCurrency) + ' = ₪' + localRate.toFixed(4) + ' · ' : '') + escapeHtml(state.rateDate || 'עדכון אחרון') + ' · <a href="' + escapeHtml(state.rateSourceUrl || 'https://frankfurter.dev/') + '" target="_blank" rel="noopener">' + escapeHtml(state.rateSource || 'מקור שערי המטבע') + '</a></small></div><button type="button" data-fee-edit>שינוי עמלה</button>' : '<div><span>' + (failed ? 'לא ניתן לעדכן את שער המטבע כרגע' : 'מעדכן את שער המטבע המקומי…') + '</span><small>התקציב המקורי נשמר בבטחה עד לעדכון השער</small></div>';
      var button = host.querySelector('[data-fee-edit]'); if (button) button.onclick = editFee;
    }); renderLocalBudgetTotals(); updateTotalBudgetEditor(); renderBudgetCategoryIls(); renderExpenseList();
  }
  function editFee() { var value = prompt('מה עמלת ההמרה של הכרטיס שלך באחוזים?', String(state.fee)); if (value === null) return; var fee = Number(String(value).replace(',', '.')); if (!Number.isFinite(fee) || fee < 0 || fee > 20) return toast('יש להזין עמלה בין 0% ל־20%.'); state.fee = fee; writeJson(storageKey('currency-fee'), fee); saveTripData(); renderCurrency(); }
  function injectCurrencyCards() {
    var budget = inferBudget(); state.trip.budget = state.trip.budget || budget;
    document.querySelectorAll('.budget-card').forEach(function (card) { if (card.querySelector('[data-currency-insight]')) return; var cardText = card.textContent || ''; var amountMatch = cardText.match(/€\s*([\d,.]+)/) || cardText.match(/([\d,.]+)\s*€/); var cardAmount = amountMatch ? Number(amountMatch[1].replace(/,/g, '')) : budget; var host = document.createElement('div'); host.className = 'currency-insight compact'; host.dataset.currencyInsight = ''; host.dataset.euros = String(cardAmount); card.appendChild(host); });
    var section = document.getElementById('budget'); if (section && !section.querySelector(':scope > [data-currency-insight]')) { var host = document.createElement('div'); host.className = 'currency-insight'; host.dataset.currencyInsight = ''; host.dataset.euros = String(budget); var head = section.querySelector('.section-head'); if (head) head.insertAdjacentElement('afterend', host); else section.prepend(host); } renderCurrency(); createTotalBudgetEditor();
  }

  function createTotalBudgetEditor() {
    var section = document.getElementById('budget'); var hero = section && section.querySelector('.budget-hero');
    if (!hero || hero.querySelector('[data-total-budget-form]')) return;
    var form = document.createElement('form'); form.className = 'total-budget-editor'; form.dataset.totalBudgetForm = '';
    form.innerHTML = '<label><span>עריכת התקציב הכולל</span><div><b>' + escapeHtml(state.localCurrency) + '</b><input name="total" type="number" min="0" step="1" inputmode="decimal" required><button type="submit"><i class="fa-solid fa-check"></i> שמירה</button></div><small>התקציב הוא מסגרת בלבד. הגרפים יישארו ריקים עד שתזין הוצאה בפועל.</small></label>';
    var euros = Number(state.trip.budget || inferBudget()); form.total.value = Math.round(state.localCurrency === 'EUR' ? euros : localFromEuros(euros)); hero.appendChild(form);
    form.onsubmit = function (event) { event.preventDefault(); var localValue = Math.max(0, Number(form.total.value || 0)); var euroValue = state.localCurrency === 'EUR' ? localValue : (Number(state.rates[state.localCurrency] || 0) ? localValue / Number(state.rates[state.localCurrency]) : localValue); state.trip.budget = euroValue; document.querySelectorAll('[data-budget]').forEach(function (node) { node.dataset.euroAmount = String(euroValue); }); document.querySelectorAll('[data-currency-insight]').forEach(function (node) { node.dataset.euros = String(euroValue); }); saveTripData(); renderLocalBudgetTotals(); renderCurrency(); renderBudgetCharts(); toast('התקציב הכולל נשמר.'); };
  }
  function updateTotalBudgetEditor() { var form = document.querySelector('[data-total-budget-form]'); if (!form || document.activeElement === form.total) return; var euros = Number(state.trip && state.trip.budget || 0); var value = state.localCurrency === 'EUR' ? euros : localFromEuros(euros); if (value || !form.total.value) form.total.value = Math.round(value || euros); }

  function createCurrencyConverter() {
    var section = document.getElementById('budget'); if (!section || section.querySelector('[data-currency-converter]')) return;
    var card = document.createElement('section'); card.className = 'currency-converter'; card.dataset.currencyConverter = '';
    var codes = [state.localCurrency,'ILS','USD','EUR','GBP','JPY','CHF','CZK','PLN','HUF','RON','CAD','AUD'].filter(function (code,index,list) { return list.indexOf(code) === index; });
    var options = codes.map(function (code) { return '<option value="' + code + '">' + code + ' · ' + currencySymbol(code) + '</option>'; }).join('');
    card.innerHTML = '<header><div><small>שערים עדכניים</small><h2>מחשבון המרת מטבעות</h2><p>המרה דו־כיוונית בין המטבע המקומי, שקל, דולר, אירו ומטבעות נפוצים.</p></div><i class="fa-solid fa-arrow-right-arrow-left"></i></header><div class="currency-converter-grid"><label><span>סכום</span><input data-converter-amount type="number" min="0" step="0.01" inputmode="decimal" value="100"></label><label><span>ממטבע</span><select data-converter-from>' + options + '</select></label><button type="button" data-converter-swap aria-label="החלפת המטבעות"><i class="fa-solid fa-right-left"></i></button><label><span>למטבע</span><select data-converter-to>' + options + '</select></label></div><div class="currency-converter-result" data-converter-result>מעדכן שערים…</div><footer><span data-converter-source>מקור השערים: בנק ישראל, בהשלמת ECB</span><a href="https://www.boi.org.il/roles/markets/exchangerates/" target="_blank" rel="noopener">לשערים היציגים של בנק ישראל</a></footer>';
    section.appendChild(card);
    card.querySelector('[data-converter-from]').value = state.localCurrency; card.querySelector('[data-converter-to]').value = state.localCurrency === 'ILS' ? 'EUR' : 'ILS';
    card.addEventListener('input', renderCurrencyConverter); card.addEventListener('change', renderCurrencyConverter);
    card.querySelector('[data-converter-swap]').onclick = function () { var from = card.querySelector('[data-converter-from]'); var to = card.querySelector('[data-converter-to]'); var old = from.value; from.value = to.value; to.value = old; renderCurrencyConverter(); };
  }
  function renderCurrencyConverter() {
    var card = document.querySelector('[data-currency-converter]'); if (!card) return;
    var amount = Number(card.querySelector('[data-converter-amount]').value || 0); var from = card.querySelector('[data-converter-from]').value; var to = card.querySelector('[data-converter-to]').value; var converted = convertCurrency(amount, from, to); var result = card.querySelector('[data-converter-result]');
    result.innerHTML = converted ? '<small>' + money(amount, from) + ' שווה בקירוב</small><strong>' + money(converted, to) + '</strong><span>לפי שער יציג, לפני עמלת חברת האשראי</span>' : '<span>מעדכן את שערי המטבע…</span>';
    var source = card.querySelector('[data-converter-source]'); if (source) source.textContent = 'מקור: ' + (state.rateSource || 'ECB דרך Frankfurter') + (state.rateDate ? ' · ' + String(state.rateDate).slice(0,10) : '');
    var sourceLink = card.querySelector('footer a'); if (sourceLink) { sourceLink.href = state.rateSourceUrl || 'https://frankfurter.dev/'; sourceLink.textContent = 'מידע על מקור השערים'; }
  }

  function createBudgetTools() {
    var section = document.getElementById('budget'); if (!section || section.querySelector('[data-expense-workspace]')) return;
    var legacyExpenses = section.querySelector('[data-expenses],.expense-list'); if (legacyExpenses) legacyExpenses.hidden = true;
    var panel = document.createElement('div'); panel.className = 'expense-workspace'; panel.dataset.expenseWorkspace = '';
    panel.innerHTML = '<div class="expense-workspace-head"><div><small>מעקב מדויק</small><h2>הוצאות וקבלות</h2><p>צלם קבלה, סרוק אותה, בחר קטגוריה והוסף אותה ישירות לתקציב.</p></div><button type="button" data-expense-toggle><i class="fa-solid fa-camera"></i> צילום קבלה / הוצאה</button></div><div class="budget-columns-editor"><div><strong>עמודות התקציב</strong><small>אפשר לשנות שם וסכום, למחוק או להוסיף קטגוריה.</small></div><div data-budget-columns></div><button type="button" data-budget-column-add><i class="fa-solid fa-plus"></i> קטגוריה חדשה</button></div><form class="receipt-form" data-receipt-form hidden><label class="receipt-picker"><input name="receipt" type="file" accept="image/*,application/pdf" capture="environment"><i class="fa-solid fa-camera"></i><span><strong>צילום, סריקה או בחירת קבלה</strong><small>הקבלה נשמרת עם נתוני התקציב בלי להעמיס רשימת שורות על המסך.</small></span></label><div class="receipt-preview" data-receipt-preview hidden></div><div class="receipt-grid"><label>כמה שולם?<input name="amount" type="number" min="0.01" step="0.01" required></label><label>מטבע<select name="currency"><option value="EUR">אירו (€)</option><option value="ILS">שקל (₪)</option><option value="USD">דולר ($)</option><option value="GBP">ליש״ט (£)</option></select></label><label>קטגוריה<select name="category" data-expense-category></select></label><label>תאריך<input name="date" type="date"></label><label class="wide">מה נקנה / בית עסק<input name="note" maxlength="160" required placeholder="לדוגמה: ארוחת ערב במסעדה"></label></div><p class="receipt-scan-status" data-receipt-status></p><div class="receipt-actions"><button type="button" data-receipt-scan><i class="fa-solid fa-wand-magic-sparkles"></i> סריקה חכמה</button><button type="submit"><i class="fa-solid fa-wallet"></i> הוסף לתקציב בקטגוריה</button></div></form><div class="expense-live-summary" data-expense-summary></div>';
    section.appendChild(panel);
    var charts = document.createElement('section');
    charts.className = 'budget-charts';
    charts.dataset.budgetCharts = '';
    charts.innerHTML = '<header><div><small>תמונת מצב קצרה</small><h3>מתוכנן לעומת ביצוע</h3><p>הגרף מתעדכן אוטומטית מכל הוצאה שנשמרת.</p></div><button type="button" data-budget-chart-edit><i class="fa-solid fa-sliders"></i> עריכת תקציב</button></header><div class="budget-compact-visual"><div class="budget-chart-meter" data-budget-chart-meter><div><strong>0%</strong><span>נוצל</span></div><span class="budget-meter-track"><i></i></span></div><div class="budget-chart-summary" data-budget-chart-summary></div></div><div class="budget-chart-bars" data-budget-chart-bars></div>';
    panel.insertAdjacentElement('afterend', charts);
    charts.querySelector('[data-budget-chart-edit]').onclick = function () {
      charts.classList.toggle('editing');
      var editor = panel.querySelector('.budget-columns-editor');
      if (editor) {
        editor.hidden = !charts.classList.contains('editing');
        if (!editor.hidden) editor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    };
    panel.querySelector('.budget-columns-editor').hidden = true;
    var form = panel.querySelector('[data-receipt-form]');
    var currencySelect = form.currency;
    if (!currencySelect.querySelector('option[value="' + state.localCurrency + '"]')) {
      var localOption = document.createElement('option');
      localOption.value = state.localCurrency;
      localOption.textContent = 'מטבע מקומי (' + state.localCurrency + ')';
      currencySelect.prepend(localOption);
    }
    currencySelect.value = state.localCurrency; renderBudgetColumns();
    function toggleForm() { form.hidden = !form.hidden; if (!form.hidden) form.amount.focus(); }
    panel.querySelector('[data-expense-toggle]').onclick = toggleForm; var legacyButton = section.querySelector('.section-head .pill-btn'); if (legacyButton) legacyButton.onclick = toggleForm; form.date.value = new Date().toISOString().slice(0, 10);
    form.receipt.onchange = function () { previewReceipt(form.receipt.files[0], panel); }; panel.querySelector('[data-receipt-scan]').onclick = function () { scanReceipt(form, panel); };
    panel.querySelector('[data-budget-column-add]').onclick = function () { state.budgetCategories.push({ id: Date.now(), name: 'קטגוריה חדשה', amount: 0 }); persistBudgetColumns(); };
    form.onsubmit = async function (event) { event.preventDefault(); var file = form.receipt.files[0]; var receiptData = file && file.type.indexOf('image/') === 0 ? await compressedReceipt(file) : ''; state.expenses.push({ id: Date.now(), amount: Number(form.amount.value), currency: form.currency.value, category: form.category.value, date: form.date.value, note: form.note.value.trim(), receiptName: file ? file.name : '', receiptData: receiptData }); writeJson(storageKey('expenses'), state.expenses); saveTripData(); form.reset(); form.date.value = new Date().toISOString().slice(0, 10); form.hidden = true; panel.querySelector('[data-receipt-preview]').hidden = true; panel.querySelector('[data-receipt-status]').textContent = ''; renderExpenseList(); renderBudgetColumns(); renderSummary(); toast('ההוצאה נוספה לקטגוריית ' + state.expenses[state.expenses.length - 1].category + '.'); };
    renderExpenseList();
    renderBudgetCharts();
  }
  function defaultBudgetCategories() {
    var budget = inferBudget();
    return [
      { name: 'לינה', share: .4, children: ['מלונות', 'דירות ואירוח'] },
      { name: 'אוכל', share: .22, children: ['מסעדות', 'בתי קפה', 'סופרמרקט'] },
      { name: 'תחבורה', share: .15, children: ['רכבת', 'אוטובוס', 'מטרו', 'מוניות'] },
      { name: 'אטרקציות', share: .13, children: ['מוזיאונים', 'סיורים', 'כרטיסי כניסה'] },
      { name: 'רזרבה', share: .1, children: [] }
    ].map(function (item, index) {
      var total = Math.round(budget * item.share);
      return { id: 'default-' + index, name: item.name, amount: total, subcategories: item.children.map(function (name, childIndex) { return { id: 'sub-' + index + '-' + childIndex, name: name, amount: Math.round(total / item.children.length) }; }) };
    });
  }
  function persistBudgetColumns() { writeJson(storageKey('budget-categories'), state.budgetCategories); writeJson(storageKey('expenses'), state.expenses); saveTripData(); renderBudgetColumns(); renderExpenseList(); renderBudgetCharts(); }
  function expenseCategoryParts(value) {
    var parts = String(value || '').split('/').map(function (part) { return part.trim(); }).filter(Boolean);
    return { category: parts[0] || '\u05d0\u05d7\u05e8', subcategory: parts[1] || '' };
  }
  function budgetExpenseTotals() {
    var totals = {};
    state.expenses.forEach(function (expense) {
      var parts = expenseCategoryParts(expense.category);
      var euros = expenseInEuros(expense);
      totals[parts.category] = totals[parts.category] || { total: 0, subcategories: {} };
      totals[parts.category].total += euros;
      if (parts.subcategory) totals[parts.category].subcategories[parts.subcategory] = (totals[parts.category].subcategories[parts.subcategory] || 0) + euros;
    });
    return totals;
  }
  function renderBudgetCharts() {
    var bars = document.querySelector('[data-budget-chart-bars]');
    var summary = document.querySelector('[data-budget-chart-summary]');
    if (!bars || !summary) return;
    var totals = budgetExpenseTotals();
    var palette = ['#2f9a72', '#e29b52', '#6688c8', '#b16fa5', '#d46b64', '#6f9ca8', '#8a7bc2'];
    var totalPlanned = Number(state.trip && state.trip.budget || 0);
    var totalSpent = state.expenses.reduce(function (sum, expense) { return sum + expenseInEuros(expense); }, 0);
    var totalSpentLocal = state.localCurrency === 'EUR' ? totalSpent : localFromEuros(totalSpent);
    var totalPlannedLocal = state.localCurrency === 'EUR' ? totalPlanned : localFromEuros(totalPlanned);
    var usedPercent = totalPlanned ? Math.min(100, Math.round(totalSpent / totalPlanned * 100)) : 0;
    summary.innerHTML = '<div><span>\u05de\u05ea\u05d5\u05db\u05e0\u05df</span><strong>' + money(totalPlannedLocal, state.localCurrency) + '</strong></div><div><span>\u05d1\u05d5\u05e6\u05e2</span><strong>' + money(totalSpentLocal, state.localCurrency) + '</strong></div><div><span>\u05e0\u05d5\u05ea\u05e8</span><strong>' + money(Math.max(0, totalPlannedLocal - totalSpentLocal), state.localCurrency) + '</strong></div>';
    var compactMeter = document.querySelector('[data-budget-chart-meter]');
    if (compactMeter) {
      compactMeter.querySelector('strong').textContent = usedPercent + '%';
      compactMeter.querySelector('.budget-meter-track i').style.width = usedPercent + '%';
      compactMeter.setAttribute('aria-label', 'נוצלו ' + usedPercent + ' אחוזים מהתקציב');
    }
    var legacyRing = document.querySelector('#budget .budget-ring');
    if (legacyRing) {
      legacyRing.outerHTML = '<div class="budget-hero-meter" data-budget-hero-meter aria-label="ניצול התקציב"><div><strong>0%</strong><small>נוצל</small></div><span><i></i></span></div>';
    }
    var heroMeter = document.querySelector('[data-budget-hero-meter]');
    if (heroMeter) {
      heroMeter.querySelector('strong').textContent = usedPercent + '%';
      heroMeter.querySelector('i').style.width = usedPercent + '%';
      heroMeter.setAttribute('aria-label', 'נוצלו ' + usedPercent + ' אחוזים מהתקציב');
    }
    var heroCopy = document.querySelector('#budget .budget-hero>div:first-child'); if (heroCopy) heroCopy.innerHTML = '<span>נרשם עד עכשיו</span><strong>' + money(totalSpentLocal, state.localCurrency) + '</strong><p>' + (totalPlanned ? 'נותרו ' + money(Math.max(0,totalPlannedLocal-totalSpentLocal),state.localCurrency) + ' מתוך ' + money(totalPlannedLocal,state.localCurrency) : 'הגדר תקציב כולל כדי לעקוב אחר היתרה') + '</p>';
    var activeCategories = state.budgetCategories.filter(function (item) { return state.expenses.some(function (expense) { return expenseCategoryParts(expense.category).category === item.name; }); });
    bars.innerHTML = activeCategories.length ? activeCategories.map(function (item, index) {
      var expenseTotal = totals[item.name] ? totals[item.name].total : 0;
      var planned = Math.max(0, Number(item.amount || 0));
      var percent = planned ? Math.min(100, Math.round(expenseTotal / planned * 100)) : expenseTotal ? 100 : 0;
      var color = item.color || palette[index % palette.length];
      item.color = color;
      var spentLocal = state.localCurrency === 'EUR' ? expenseTotal : localFromEuros(expenseTotal);
      var plannedLocal = state.localCurrency === 'EUR' ? planned : localFromEuros(planned);
      return '<article class="budget-chart-row"><div class="budget-chart-label"><span class="budget-chart-dot" style="--chart-color:' + escapeHtml(color) + '"></span><strong>' + escapeHtml(item.name) + '</strong><small>' + money(spentLocal, state.localCurrency) + ' \u05de\u05ea\u05d5\u05da ' + money(plannedLocal, state.localCurrency) + '</small></div><div class="budget-chart-track"><i style="width:' + percent + '%;--chart-color:' + escapeHtml(color) + '"></i></div><b>' + percent + '%</b><label class="budget-chart-color" title="\u05e6\u05d1\u05e2 \u05d4\u05e7\u05d8\u05d2\u05d5\u05e8\u05d9\u05d4"><input type="color" value="' + escapeHtml(color) + '" data-budget-chart-color="' + escapeHtml(item.id) + '"><span>\u05e6\u05d1\u05e2</span></label></article>';
    }).join('') : '<div class="budget-chart-empty"><i class="fa-solid fa-chart-pie"></i><strong>הגרף עדיין ריק</strong><span>לאחר הוספת הוצאה או קבלה, הקטגוריה המתאימה תופיע כאן אוטומטית.</span></div>';
    bars.querySelectorAll('[data-budget-chart-color]').forEach(function (input) {
      input.onchange = function () {
        var item = state.budgetCategories.find(function (entry) { return String(entry.id) === input.dataset.budgetChartColor; });
        if (item) { item.color = input.value; persistBudgetColumns(); }
      };
    });
  }
  function renderBudgetColumns() {
    var host = document.querySelector('[data-budget-columns]'); var select = document.querySelector('[data-expense-category]'); if (!host) return;
    state.budgetCategories.forEach(function (item) {
      if (Array.isArray(item.subcategories)) return;
      var suggestions = /תחבור/.test(item.name) ? ['רכבת', 'אוטובוס', 'מטרו', 'מוניות'] : /אוכל/.test(item.name) ? ['מסעדות', 'בתי קפה', 'סופרמרקט'] : /לינה/.test(item.name) ? ['מלונות', 'דירות ואירוח'] : /אטרק/.test(item.name) ? ['מוזיאונים', 'סיורים', 'כרטיסי כניסה'] : [];
      item.subcategories = suggestions.map(function (name, index) { return { id: 'sub-' + item.id + '-' + index, name: name, amount: Math.round(Number(item.amount || 0) / suggestions.length) }; });
    });
    host.innerHTML = state.budgetCategories.map(function (item) {
      var children = item.subcategories.map(function (sub) { return '<div class="budget-subcategory-row"><i class="fa-solid fa-turn-up"></i><input data-budget-sub-name="' + escapeHtml(item.id) + '" data-sub-id="' + escapeHtml(sub.id) + '" value="' + escapeHtml(sub.name) + '" aria-label="שם תת קטגוריה"><label><span>' + escapeHtml(state.localCurrency) + '</span><input data-budget-sub-amount="' + escapeHtml(item.id) + '" data-sub-id="' + escapeHtml(sub.id) + '" type="number" min="0" step="1" value="' + Number(sub.amount || 0) + '" aria-label="סכום תת קטגוריה"></label><button type="button" data-budget-sub-delete="' + escapeHtml(item.id) + '" data-sub-id="' + escapeHtml(sub.id) + '" aria-label="מחיקת תת קטגוריה"><i class="fa-solid fa-xmark"></i></button></div>'; }).join('');
      var totals = budgetExpenseTotals(); var spent = totals[item.name] ? totals[item.name].total : 0; var spentLocal = state.localCurrency === 'EUR' ? spent : localFromEuros(spent);
      return '<details class="budget-category-editor"><summary><span><i class="fa-solid fa-chevron-down"></i><strong>' + escapeHtml(item.name) + '</strong></span><small>' + item.subcategories.length + ' \u05ea\u05ea\u05d9\u05be\u05e1\u05e2\u05d9\u05e4\u05d9\u05dd</small><b>' + money(spentLocal, state.localCurrency) + ' \u05d4\u05d5\u05e6\u05d0\u05d5</b></summary><div class="budget-category-body"><div class="budget-column-row"><input data-budget-name="' + escapeHtml(item.id) + '" value="' + escapeHtml(item.name) + '" aria-label="\u05e9\u05dd \u05e7\u05d8\u05d2\u05d5\u05e8\u05d9\u05d4"><label><span>' + escapeHtml(state.localCurrency) + '</span><input data-budget-amount="' + escapeHtml(item.id) + '" type="number" min="0" step="1" value="' + Number(item.amount || 0) + '" aria-label="\u05e1\u05db\u05d5\u05dd \u05de\u05ea\u05d5\u05db\u05e0\u05df"></label><button type="button" data-budget-delete="' + escapeHtml(item.id) + '" aria-label="\u05de\u05d7\u05d9\u05e7\u05ea \u05e7\u05d8\u05d2\u05d5\u05e8\u05d9\u05d4"><i class="fa-solid fa-trash"></i></button></div><div class="budget-subcategories">' + children + '</div><button class="budget-add-subcategory" type="button" data-budget-sub-add="' + escapeHtml(item.id) + '"><i class="fa-solid fa-plus"></i> \u05d4\u05d5\u05e1\u05e4\u05ea \u05ea\u05ea\u05be\u05e1\u05e2\u05d9\u05e3</button></div></details>';
    }).join('');
    if (select) { var selected = select.value; select.innerHTML = state.budgetCategories.map(function (item) { return '<optgroup label="' + escapeHtml(item.name) + '"><option>' + escapeHtml(item.name) + '</option>' + item.subcategories.map(function (sub) { return '<option value="' + escapeHtml(item.name + ' / ' + sub.name) + '">' + escapeHtml(sub.name) + '</option>'; }).join('') + '</optgroup>'; }).join('') + '<option>אחר</option>'; if ([].slice.call(select.options).some(function (option) { return option.value === selected; })) select.value = selected; }
    host.querySelectorAll('[data-budget-name]').forEach(function (input) { input.onchange = function () { var item = state.budgetCategories.find(function (entry) { return String(entry.id) === input.dataset.budgetName; }); if (item && input.value.trim()) { var oldName = item.name; var newName = input.value.trim(); state.expenses.forEach(function (expense) { var parts = expenseCategoryParts(expense.category); if (parts.category === oldName) expense.category = newName + (parts.subcategory ? ' / ' + parts.subcategory : ''); }); item.name = newName; persistBudgetColumns(); } }; });
    host.querySelectorAll('[data-budget-amount]').forEach(function (input) { input.onchange = function () { var item = state.budgetCategories.find(function (entry) { return String(entry.id) === input.dataset.budgetAmount; }); if (item) { item.amount = Math.max(0, Number(input.value || 0)); persistBudgetColumns(); } }; });
    host.querySelectorAll('[data-budget-delete]').forEach(function (button) { button.onclick = function () { if (state.budgetCategories.length <= 1) return toast('יש להשאיר לפחות קטגוריה אחת.'); var removed = state.budgetCategories.find(function (entry) { return String(entry.id) === button.dataset.budgetDelete; }); if (removed) state.expenses.forEach(function (expense) { if (expenseCategoryParts(expense.category).category === removed.name) expense.category = 'אחר'; }); state.budgetCategories = state.budgetCategories.filter(function (entry) { return String(entry.id) !== button.dataset.budgetDelete; }); persistBudgetColumns(); }; });
    host.querySelectorAll('[data-budget-sub-add]').forEach(function (button) { button.onclick = function () { var item = state.budgetCategories.find(function (entry) { return String(entry.id) === button.dataset.budgetSubAdd; }); if (!item) return; item.subcategories.push({ id: 'sub-' + Date.now(), name: 'תת־סעיף חדש', amount: 0 }); persistBudgetColumns(); }; });
    host.querySelectorAll('[data-budget-sub-name]').forEach(function (input) { input.onchange = function () { var item = state.budgetCategories.find(function (entry) { return String(entry.id) === input.dataset.budgetSubName; }); var sub = item && item.subcategories.find(function (entry) { return String(entry.id) === input.dataset.subId; }); if (sub && input.value.trim()) { var oldName = sub.name; var newName = input.value.trim(); state.expenses.forEach(function (expense) { var parts = expenseCategoryParts(expense.category); if (parts.category === item.name && parts.subcategory === oldName) expense.category = item.name + ' / ' + newName; }); sub.name = newName; persistBudgetColumns(); } }; });
    host.querySelectorAll('[data-budget-sub-amount]').forEach(function (input) { input.onchange = function () { var item = state.budgetCategories.find(function (entry) { return String(entry.id) === input.dataset.budgetSubAmount; }); var sub = item && item.subcategories.find(function (entry) { return String(entry.id) === input.dataset.subId; }); if (sub) { sub.amount = Math.max(0, Number(input.value || 0)); item.amount = item.subcategories.reduce(function (sum, entry) { return sum + Number(entry.amount || 0); }, 0); persistBudgetColumns(); } }; });
    host.querySelectorAll('[data-budget-sub-delete]').forEach(function (button) { button.onclick = function () { var item = state.budgetCategories.find(function (entry) { return String(entry.id) === button.dataset.budgetSubDelete; }); if (!item) return; var removed = item.subcategories.find(function (entry) { return String(entry.id) === button.dataset.subId; }); if (removed) state.expenses.forEach(function (expense) { var parts = expenseCategoryParts(expense.category); if (parts.category === item.name && parts.subcategory === removed.name) expense.category = item.name; }); item.subcategories = item.subcategories.filter(function (entry) { return String(entry.id) !== button.dataset.subId; }); if (item.subcategories.length) item.amount = item.subcategories.reduce(function (sum, entry) { return sum + Number(entry.amount || 0); }, 0); persistBudgetColumns(); }; });
    renderBudgetCharts();
  }
  function compressedReceipt(file) { return new Promise(function (resolve) { var reader = new FileReader(); reader.onload = function () { var image = new Image(); image.onload = function () { var scale = Math.min(1, 1200 / Math.max(image.width, image.height)); var canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale)); canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height); resolve(canvas.toDataURL('image/jpeg', .72)); }; image.onerror = function () { resolve(''); }; image.src = reader.result; }; reader.onerror = function () { resolve(''); }; reader.readAsDataURL(file); }); }
  function previewReceipt(file, panel) { var preview = panel.querySelector('[data-receipt-preview]'); if (!file) { preview.hidden = true; return; } var url = URL.createObjectURL(file); preview.hidden = false; preview.innerHTML = '<img src="' + url + '" alt="תצוגה מקדימה של הקבלה"><span>' + escapeHtml(file.name) + '</span>'; }
  function fileToBase64(file) { return new Promise(function (resolve, reject) { var reader = new FileReader(); reader.onload = function () { resolve(String(reader.result).split(',')[1]); }; reader.onerror = reject; reader.readAsDataURL(file); }); }
  function loadTesseract() { if (window.Tesseract) return Promise.resolve(window.Tesseract); if (window.__travelMateTesseract) return window.__travelMateTesseract; window.__travelMateTesseract = new Promise(function (resolve, reject) { var script = document.createElement('script'); script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'; script.onload = function () { resolve(window.Tesseract); }; script.onerror = reject; document.head.appendChild(script); }); return window.__travelMateTesseract; }
  function receiptFromText(text) {
    var normalized = String(text || '').replace(/,/g, '.'); var lines = normalized.split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean); var totalLines = lines.filter(function (line) { return /total|amount|grand|סה.?כ|סך.?הכל|לתשלום/i.test(line); }); var source = totalLines.length ? totalLines.join(' ') : normalized; var amounts = (source.match(/\d{1,6}(?:[ .]\d{3})*(?:\.\d{2})/g) || []).map(function (value) { return Number(value.replace(/\s/g, '')); }).filter(function (value) { return value > 0 && value < 1000000; }); var amount = amounts.length ? Math.max.apply(Math, amounts) : 0;
    var currency = /₪|ILS|NIS|ש.?ח/i.test(normalized) ? 'ILS' : /€|EUR/i.test(normalized) ? 'EUR' : /£|GBP/i.test(normalized) ? 'GBP' : /\$|USD/i.test(normalized) ? 'USD' : 'EUR'; var dateMatch = normalized.match(/\b(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})\b/); var date = ''; if (dateMatch) { var year = Number(dateMatch[3]); if (year < 100) year += 2000; date = String(year).padStart(4, '0') + '-' + dateMatch[2].padStart(2, '0') + '-' + dateMatch[1].padStart(2, '0'); }
    var merchant = lines.find(function (line) { return line.length > 2 && !/^\d|invoice|receipt|קבלה|חשבונית/i.test(line); }) || ''; var category = /hotel|hostel|מלון|לינה/i.test(normalized) ? 'לינה' : /taxi|uber|train|bus|metro|מונית|רכבת|אוטובוס/i.test(normalized) ? 'תחבורה' : /restaurant|cafe|food|מסעד|קפה|אוכל/i.test(normalized) ? 'אוכל' : /museum|ticket|כרטיס|מוזיאון|אטרקציה/i.test(normalized) ? 'אטרקציות' : /shop|store|קניות|חנות/i.test(normalized) ? 'קניות' : 'אחר'; return { amount: amount, currency: currency, merchant: merchant.slice(0, 160), date: date, category: category };
  }
  function applyReceipt(form, receipt) { if (receipt.amount) form.amount.value = Number(receipt.amount).toFixed(2); if (receipt.currency && form.currency.querySelector('option[value="' + receipt.currency + '"]')) form.currency.value = receipt.currency; if (receipt.category && [].slice.call(form.category.options).some(function (option) { return option.value === receipt.category; })) form.category.value = receipt.category; if (receipt.date) form.date.value = receipt.date; if (receipt.merchant) form.note.value = receipt.merchant; }
  async function localReceiptScan(file, status) { status.textContent = 'הענן לא זמין — מבצע סריקה מקומית במכשיר…'; var tesseract = await loadTesseract(); var result = await tesseract.recognize(file, 'heb+eng', { logger: function (progress) { if (progress.status === 'recognizing text') status.textContent = 'סורק במכשיר… ' + Math.round(progress.progress * 100) + '%'; } }); return receiptFromText(result.data && result.data.text); }
  async function scanReceipt(form, panel) {
    var file = form.receipt.files[0]; var status = panel.querySelector('[data-receipt-status]'); if (!file) { status.textContent = 'בחר קודם צילום של הקבלה.'; return; } if (file.size > 5 * 1024 * 1024) { status.textContent = 'לסריקה חכמה יש לבחור תמונה עד 5MB.'; return; } status.textContent = 'סורק את הקבלה…';
    try { if (!cloud) throw new Error('cloud-unavailable'); var client = await cloud.getClient(); var data = await fileToBase64(file); var result = await client.functions.invoke('travel-assistant', { body: { receipt: { mimeType: file.type || 'image/jpeg', data: data } } }); if (result.error || !result.data || !result.data.receipt) throw result.error || new Error('scan-failed'); applyReceipt(form, result.data.receipt); status.textContent = 'הסריקה הושלמה. בדוק את הסכום והפרטים לפני השמירה.'; } catch (error) { try { var localReceipt = await localReceiptScan(file, status); applyReceipt(form, localReceipt); status.textContent = localReceipt.amount ? 'הסריקה המקומית הושלמה. בדוק את הפרטים לפני השמירה.' : 'הטקסט זוהה, אך הסכום לא היה ברור. הזן אותו ידנית.'; } catch (localError) { status.textContent = 'הסריקה החכמה לא זמינה כרגע. אפשר לראות את הקבלה ולהקליד את הפרטים ידנית.'; } }
  }
  function expenseInEuros(expense) { if (expense.currency === 'EUR' || !expense.currency) return Number(expense.amount || 0); var rate = Number(state.rates[expense.currency] || 0); return rate ? Number(expense.amount || 0) / rate : 0; }
  function renderExpenseList() {
    var summary = document.querySelector('[data-expense-summary]'); if (!summary) return; var total = state.expenses.reduce(function (sum, expense) { return sum + expenseInEuros(expense); }, 0);
    var localTotal = state.localCurrency === 'EUR' ? total : localFromEuros(total);
    summary.innerHTML = '<div><small>נרשם עד עכשיו</small><strong>' + money(localTotal, state.localCurrency) + '</strong><span>' + (state.rate ? 'כ־' + money(shekels(total), 'ILS') + ' כולל עמלה' : 'ההמרה לשקלים מתעדכנת') + '</span></div><b>' + state.expenses.length + ' הוצאות</b>';
    renderBudgetCharts();
  }

  function createMemoriesSection() {
    var content = document.querySelector('.content'); if (!content || document.getElementById('memories')) return; var section = document.createElement('section'); section.id = 'memories'; section.className = 'section trip-memories';
    section.innerHTML = '<div class="section-head"><div><p>תמונות, רגעים וסיפור המסע</p><h1>אלבום וסיכום הטיול</h1></div></div><div class="memory-layout"><article class="album-card"><span class="memory-icon"><i class="fa-brands fa-google"></i></span><h2>אלבום Google Photos</h2><p>הדבק קישור לאלבום משותף של הטיול. הקישור נשמר עם הטיול, והתמונות נשארות ב־Google Photos.</p><form data-album-form><input name="url" type="url" inputmode="url" placeholder="https://photos.app.goo.gl/…"><button type="submit">שמירת קישור</button></form><div class="album-actions" data-album-actions></div><small>חיבור מלא לבחירת תמונות דורש הרשאת Google Photos Picker; קישור משותף הוא החיבור הפשוט והפרטי ביותר כעת.</small></article><article class="memory-card"><span class="memory-icon"><i class="fa-solid fa-pen-fancy"></i></span><h2>רגע מהטיול</h2><form data-memory-form><textarea name="note" maxlength="500" placeholder="מה תרצה לזכור מהיום?"></textarea><label class="memory-file-picker"><input name="attachments" type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"><i class="fa-solid fa-paperclip"></i><span><strong>הוספת תמונות או מסמכים</strong><small>עד 5 קבצים, 25MB לכל קובץ · נשמר ישירות עם הרגע, ללא הכספת</small></span></label><div class="memory-file-selection" data-memory-file-selection hidden></div><p class="memory-upload-status" data-memory-upload-status></p><button type="submit">שמירת רגע</button></form><div class="memory-list" data-memory-list></div></article></div><article class="trip-summary-card"><div><small>יומן מסע אוטומטי</small><h2>סיכום הטיול</h2><p>נבנה מהיעד, הזיכרונות וההוצאות ששמרת.</p></div><div class="trip-summary-text" data-trip-summary></div><div class="trip-summary-actions"><button type="button" data-summary-refresh><i class="fa-solid fa-rotate"></i> רענון</button><button type="button" data-summary-ai><i class="fa-solid fa-wand-magic-sparkles"></i> שדרוג עם נבו</button><button type="button" data-summary-copy><i class="fa-regular fa-copy"></i> העתקה</button></div></article>';
    var external = content.querySelector('.external-resources'); if (external) content.insertBefore(section, external); else content.appendChild(section); var nav = document.querySelector('.sidebar nav'); if (nav && !nav.querySelector('[href="#memories"]')) nav.insertAdjacentHTML('beforeend', '<a href="#memories" aria-label="אלבום וסיכום"><i class="fa-solid fa-images"></i><span class="tip">אלבום וסיכום</span></a>');
    var albumForm = section.querySelector('[data-album-form]'); albumForm.url.value = state.albumUrl; albumForm.onsubmit = function (event) { event.preventDefault(); var url = event.target.url.value.trim(); if (url && !/^https:\/\/(photos\.app\.goo\.gl|photos\.google\.com)\//i.test(url)) return toast('יש להזין קישור תקין של Google Photos.'); state.albumUrl = url; writeJson(storageKey('album-url'), url); saveTripData(); renderAlbumActions(); renderSummary(); toast('קישור האלבום נשמר עם הטיול.'); };
    var memoryForm = section.querySelector('[data-memory-form]');
    memoryForm.attachments.onchange = function () { renderSelectedMemoryFiles(memoryForm); };
    memoryForm.onsubmit = async function (event) {
      event.preventDefault();
      var files = Array.prototype.slice.call(memoryForm.attachments.files || []);
      var note = memoryForm.note.value.trim();
      var status = section.querySelector('[data-memory-upload-status]');
      if (!note && !files.length) return toast('כתוב זיכרון או בחר קובץ לצירוף.');
      if (files.length > 5) return toast('אפשר לצרף עד 5 קבצים לכל רגע.');
      if (files.some(function (file) { return file.size > 25 * 1024 * 1024; })) return toast('כל קובץ יכול להיות בגודל של עד 25MB.');
      var submit = memoryForm.querySelector('button[type="submit"]');
      submit.disabled = true; status.textContent = files.length ? 'מעלה את הקבצים ושומר את הרגע…' : 'שומר את הרגע…';
      try {
        var memoryId = String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8);
        var attachments = [];
        for (var index = 0; index < files.length; index += 1) attachments.push(await storeMemoryAttachment(files[index], memoryId));
        state.memories.push({ id: memoryId, note: note || 'קובץ מצורף', date: new Date().toISOString(), attachments: attachments });
        writeJson(storageKey('memories'), state.memories); saveTripData(); memoryForm.reset(); renderSelectedMemoryFiles(memoryForm); status.textContent = ''; renderMemories(); renderSummary(); toast('הרגע והקבצים נשמרו.');
      } catch (error) { status.textContent = 'לא הצלחנו לשמור את הקובץ. בדוק את החיבור ונסה שוב.'; }
      finally { submit.disabled = false; }
    };
    section.querySelector('[data-summary-refresh]').onclick = renderSummary; section.querySelector('[data-summary-ai]').onclick = function () { window.dispatchEvent(new CustomEvent('travelmate:ask-ai', { detail: { prompt: buildSummaryPrompt() } })); }; section.querySelector('[data-summary-copy]').onclick = function () { var text = section.querySelector('[data-trip-summary]').innerText; navigator.clipboard && navigator.clipboard.writeText(text).then(function () { toast('סיכום הטיול הועתק.'); }); };
    renderAlbumActions(); renderMemories(); renderSummary(); setupCollapsibleSections();
  }
  function renderAlbumActions() { var host = document.querySelector('[data-album-actions]'); if (!host) return; host.innerHTML = state.albumUrl ? '<a href="' + escapeHtml(state.albumUrl) + '" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square"></i> פתיחת האלבום</a><button type="button" data-album-remove>הסרת קישור</button>' : '<a href="https://photos.google.com/" target="_blank" rel="noopener"><i class="fa-solid fa-plus"></i> יצירת אלבום ב־Google Photos</a>'; var remove = host.querySelector('[data-album-remove]'); if (remove) remove.onclick = function () { state.albumUrl = ''; writeJson(storageKey('album-url'), ''); saveTripData(); document.querySelector('[data-album-form]').url.value = ''; renderAlbumActions(); renderSummary(); }; }
  function renderSelectedMemoryFiles(form) { var host = document.querySelector('[data-memory-file-selection]'); if (!host) return; var files = Array.prototype.slice.call(form.attachments.files || []); host.hidden = !files.length; host.innerHTML = files.map(function (file) { return '<span><i class="fa-solid ' + (file.type.indexOf('image/') === 0 ? 'fa-image' : 'fa-file') + '"></i>' + escapeHtml(file.name) + ' <small>' + Math.max(1, Math.round(file.size / 1024)) + 'KB</small></span>'; }).join(''); }
  function safeFileName(name) { return String(name || 'file').normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(-120) || 'file'; }
  function memoryDatabase() { return new Promise(function (resolve, reject) { var request = indexedDB.open('travelmate-memory-files', 1); request.onupgradeneeded = function () { if (!request.result.objectStoreNames.contains('files')) request.result.createObjectStore('files'); }; request.onsuccess = function () { resolve(request.result); }; request.onerror = function () { reject(request.error); }; }); }
  async function putLocalMemoryFile(key, file) { var database = await memoryDatabase(); return new Promise(function (resolve, reject) { var transaction = database.transaction('files', 'readwrite'); transaction.objectStore('files').put(file, key); transaction.oncomplete = function () { database.close(); resolve(); }; transaction.onerror = function () { database.close(); reject(transaction.error); }; }); }
  async function getLocalMemoryFile(key) { var database = await memoryDatabase(); return new Promise(function (resolve, reject) { var request = database.transaction('files').objectStore('files').get(key); request.onsuccess = function () { database.close(); resolve(request.result); }; request.onerror = function () { database.close(); reject(request.error); }; }); }
  async function deleteLocalMemoryFile(key) { var database = await memoryDatabase(); return new Promise(function (resolve) { var transaction = database.transaction('files', 'readwrite'); transaction.objectStore('files').delete(key); transaction.oncomplete = function () { database.close(); resolve(); }; transaction.onerror = function () { database.close(); resolve(); }; }); }
  async function storeMemoryAttachment(file, memoryId) {
    try {
      if (!cloud) throw new Error('no-cloud');
      var session = await cloud.getSession();
      if (!session || !session.user) throw new Error('signed-out');
      var client = await cloud.getClient();
      var path = session.user.id + '/memories/' + encodeURIComponent(tripId()) + '/' + memoryId + '/' + Date.now() + '-' + safeFileName(file.name);
      var result = await client.storage.from('travel-documents').upload(path, file, { contentType: file.type || 'application/octet-stream', cacheControl: '0', upsert: false });
      if (result.error) throw result.error;
      return { name: file.name, type: file.type || 'application/octet-stream', size: file.size, storagePath: path, cloud: true };
    } catch (error) {
      var key = tripId() + ':' + memoryId + ':' + Date.now() + ':' + Math.random().toString(36).slice(2);
      await putLocalMemoryFile(key, file);
      return { name: file.name, type: file.type || 'application/octet-stream', size: file.size, localKey: key, local: true };
    }
  }
  async function openMemoryAttachment(attachment) {
    try {
      var url = '';
      if (attachment.cloud) {
        var client = await cloud.getClient(); var signed = await client.storage.from('travel-documents').createSignedUrl(attachment.storagePath, 300);
        if (signed.error || !signed.data) throw signed.error || new Error('missing-url'); url = signed.data.signedUrl;
      } else {
        var blob = await getLocalMemoryFile(attachment.localKey); if (!blob) throw new Error('missing-file'); url = URL.createObjectURL(blob); setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      }
      var link = document.createElement('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener'; link.click();
    } catch (error) { toast('הקובץ אינו זמין במכשיר הזה כרגע.'); }
  }
  async function removeMemory(memoryId) {
    var memory = state.memories.find(function (item) { return String(item.id) === String(memoryId); }); if (!memory) return;
    var attachments = Array.isArray(memory.attachments) ? memory.attachments : [];
    try { var cloudPaths = attachments.filter(function (item) { return item.cloud && item.storagePath; }).map(function (item) { return item.storagePath; }); if (cloudPaths.length && cloud) { var client = await cloud.getClient(); await client.storage.from('travel-documents').remove(cloudPaths); } } catch (error) {}
    await Promise.all(attachments.filter(function (item) { return item.localKey; }).map(function (item) { return deleteLocalMemoryFile(item.localKey); }));
    state.memories = state.memories.filter(function (item) { return String(item.id) !== String(memoryId); }); writeJson(storageKey('memories'), state.memories); saveTripData(); renderMemories(); renderSummary();
  }
  function renderMemories() {
    var host = document.querySelector('[data-memory-list]'); if (!host) return;
    host.innerHTML = state.memories.length ? state.memories.slice().reverse().map(function (memory) {
      var attachments = Array.isArray(memory.attachments) ? memory.attachments : [];
      return '<article><header><span>' + new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium' }).format(new Date(memory.date)) + '</span><button type="button" data-memory-delete="' + escapeHtml(memory.id) + '" aria-label="מחיקת הרגע"><i class="fa-solid fa-trash"></i></button></header><p>' + escapeHtml(memory.note) + '</p>' + (attachments.length ? '<div class="memory-attachments">' + attachments.map(function (attachment, index) { return '<button type="button" data-memory-id="' + escapeHtml(memory.id) + '" data-memory-attachment="' + index + '"><i class="fa-solid ' + (String(attachment.type).indexOf('image/') === 0 ? 'fa-image' : 'fa-file-lines') + '"></i><span>' + escapeHtml(attachment.name) + '<small>' + (attachment.local ? 'נשמר במכשיר' : 'נשמר בענן הפרטי') + '</small></span></button>'; }).join('') + '</div>' : '') + '</article>';
    }).join('') : '<div class="trip-experience-empty">עדיין לא נשמרו רגעים.</div>';
    host.querySelectorAll('[data-memory-attachment]').forEach(function (button) { button.onclick = function () { var memory = state.memories.find(function (item) { return String(item.id) === String(button.dataset.memoryId); }); if (memory && memory.attachments[Number(button.dataset.memoryAttachment)]) openMemoryAttachment(memory.attachments[Number(button.dataset.memoryAttachment)]); }; });
    host.querySelectorAll('[data-memory-delete]').forEach(function (button) { button.onclick = function () { if (confirm('למחוק את הרגע ואת הקבצים שצורפו אליו?')) removeMemory(button.dataset.memoryDelete); }; });
  }
  function summaryText() { var trip = state.trip || {}; var total = state.expenses.reduce(function (sum, item) { return sum + expenseInEuros(item); }, 0); var localTotal = state.localCurrency === 'EUR' ? total : localFromEuros(total); var lines = ['הטיול ל' + [trip.city, trip.country].filter(Boolean).join(', ') + (trip.start && trip.end ? ' התקיים בין ' + trip.start + ' ל־' + trip.end + '.' : '.')]; if (state.memories.length) lines.push('הרגעים שנשמרו: ' + state.memories.slice(-5).map(function (item) { return item.note; }).join(' · ') + '.'); if (state.expenses.length) lines.push('נרשמו ' + state.expenses.length + ' הוצאות בסכום משוער של ' + money(localTotal, state.localCurrency) + (state.rate ? ' — כ־' + money(shekels(total), 'ILS') + ' כולל עמלת ההמרה שהוגדרה.' : '.')); if (state.albumUrl) lines.push('אלבום התמונות מחובר וזמין לפתיחה מהאפליקציה.'); if (!state.memories.length && !state.expenses.length) lines.push('ככל שתשמור זיכרונות והוצאות, הסיכום יהפוך עשיר ומדויק יותר.'); return lines.join('\n\n'); }
  function renderSummary() { var host = document.querySelector('[data-trip-summary]'); if (host) host.textContent = summaryText(); }
  function buildSummaryPrompt() { return 'כתוב סיכום מסע מרגש אך אמיתי לטיול ב' + [state.trip.city, state.trip.country].filter(Boolean).join(', ') + '. השתמש רק בפרטים הבאים. זיכרונות: ' + state.memories.map(function (item) { return item.note; }).join(' | ') + '. הוצאות: ' + state.expenses.map(function (item) { return item.category + ' ' + item.amount + ' ' + (item.currency || 'EUR'); }).join(' | ') + '. כלול פתיחה קצרה, רגעים בולטים, נתון תקציבי וסיום אישי. אל תמציא מקומות או אירועים שלא סופקו.'; }

  async function init() {
    try { state.trip = window.travelMateTripReady ? await window.travelMateTripReady : null; } catch (error) {}
    if (!state.trip) { var heroTitle = clean(document.querySelector('.hero h1') && document.querySelector('.hero h1').textContent); var heroSubtitle = clean(document.querySelector('.hero .hero-copy p') && document.querySelector('.hero .hero-copy p').textContent); state.trip = { id: new URLSearchParams(location.search).get('id') || location.pathname, city: document.querySelector('[data-city]') && clean(document.querySelector('[data-city]').textContent) || heroSubtitle.split('·')[0].trim() || heroTitle || 'היעד', country: document.querySelector('[data-country]') && clean(document.querySelector('[data-country]').textContent) || heroTitle, budget: 0 }; }
    state.localCurrency = countryCurrency(state.trip.country);
    window.TravelMateCurrency = {
      code: function () { return state.localCurrency; },
      formatFromEuros: function (euros) {
        var value = state.localCurrency === 'EUR' ? Number(euros || 0) : localFromEuros(euros);
        return value ? money(value, state.localCurrency) : money(euros, 'EUR');
      }
    };
    state.expenses = Array.isArray(state.trip.expenses) ? state.trip.expenses : readJson(storageKey('expenses'), []); state.budgetCategories = Array.isArray(state.trip.budgetCategories) && state.trip.budgetCategories.length ? state.trip.budgetCategories : readJson(storageKey('budget-categories'), null) || defaultBudgetCategories(); state.memories = Array.isArray(state.trip.memories) ? state.trip.memories : readJson(storageKey('memories'), []); state.albumUrl = state.trip.photoAlbumUrl || readJson(storageKey('album-url'), ''); state.fee = Number(state.trip.currencyFee != null ? state.trip.currencyFee : readJson(storageKey('currency-fee'), 2.5));
    injectCurrencyCards(); createBudgetTools(); createCurrencyConverter(); createMemoriesSection(); setupCollapsibleSections();
    var rateLoaded = false;
    function loadRateWhenNeeded(view) {
      if (rateLoaded || view !== 'budget') return;
      rateLoaded = true;
      loadRate();
    }
    loadRateWhenNeeded(document.body.dataset.tripView || new URLSearchParams(location.search).get('view') || 'overview');
    window.addEventListener('travelmate:viewchange', function (event) {
      loadRateWhenNeeded(event.detail && event.detail.view);
    });
  }
  init();
})();

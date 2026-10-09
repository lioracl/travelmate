(function (root) {
  'use strict';
  if (!root || typeof document === 'undefined') return;

  function currentTrip() {
    var id = new URLSearchParams(root.location.search).get('id');
    var store = root.TravelMateTripStore;
    return id && store && typeof store.getTrip === 'function' ? store.getTrip(id) : null;
  }

  function waitFor(selector) {
    var found = document.querySelector(selector);
    if (found) return Promise.resolve(found);
    return new Promise(function (resolve) {
      var host = document.getElementById('budget') || document.body;
      var settled = false;
      var timer = root.setTimeout(function () { finish(null); }, 2500);
      var observer = new MutationObserver(function () {
        var node = document.querySelector(selector);
        if (node) finish(node);
      });
      function finish(node) {
        if (settled) return;
        settled = true;
        root.clearTimeout(timer);
        observer.disconnect();
        resolve(node);
      }
      observer.observe(host, { childList: true, subtree: true });
    });
  }

  function localDate() {
    var value = new Date();
    return value.getFullYear() + '-' + String(value.getMonth() + 1).padStart(2, '0') + '-' + String(value.getDate()).padStart(2, '0');
  }

  function restoreQuickMode(form) {
    if (!form) return;
    delete form.dataset.widgetQuickExpense;
    delete form.dataset.widgetSubmitLocked;
    var submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = false;
    if (form.note) form.note.required = true;
    form.querySelectorAll('.receipt-source-actions,[data-receipt-scan]').forEach(function (node) { node.hidden = false; });
  }

  function bindSubmitGuard(form) {
    if (!form || form.dataset.widgetGuardBound === 'true') return;
    form.dataset.widgetGuardBound = 'true';
    form.addEventListener('submit', function (event) {
      if (form.dataset.widgetQuickExpense !== 'true') return;
      if (form.dataset.widgetSubmitLocked === 'true') {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      form.dataset.widgetSubmitLocked = 'true';
      var submit = form.querySelector('button[type="submit"]');
      if (submit) submit.disabled = true;
      var release = function () { restoreQuickMode(form); root.removeEventListener('travelmate:local-trips-updated', release); };
      root.addEventListener('travelmate:local-trips-updated', release, { once: true });
      root.setTimeout(function () {
        if (form.dataset.widgetSubmitLocked === 'true') release();
      }, 5000);
    }, true);
  }

  async function openQuickExpense() {
    var form = await waitFor('#budget [data-receipt-form]');
    if (!form) return false;
    bindSubmitGuard(form);
    form.reset();
    delete form.dataset.editingId;
    form.dataset.widgetQuickExpense = 'true';
    form.hidden = false;
    var currency = root.TravelMateCurrency && typeof root.TravelMateCurrency.code === 'function' ? root.TravelMateCurrency.code() : '';
    if (form.currency && currency && form.currency.querySelector('option[value="' + currency + '"]')) form.currency.value = currency;
    if (form.date) form.date.value = localDate();
    if (form.note) { form.note.required = false; form.note.placeholder = 'אופציונלי — למשל קפה או מונית'; }
    form.querySelectorAll('.receipt-source-actions,[data-receipt-scan]').forEach(function (node) { node.hidden = true; });
    var preview = document.querySelector('#budget [data-receipt-preview]'); if (preview) preview.hidden = true;
    var status = document.querySelector('#budget [data-receipt-status]'); if (status) status.textContent = '';
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (form.amount) form.amount.focus();
    return true;
  }

  async function openConverter() {
    var converter = await waitFor('#budget [data-currency-converter]');
    if (!converter) return false;
    var trip = currentTrip() || {};
    var local = root.TravelMateCurrency && typeof root.TravelMateCurrency.code === 'function' ? root.TravelMateCurrency.code() : '';
    var home = String(trip.secondaryCurrency || (local === 'ILS' ? 'EUR' : 'ILS'));
    var from = converter.querySelector('[data-converter-from]');
    var to = converter.querySelector('[data-converter-to]');
    var amount = converter.querySelector('[data-converter-amount]');
    if (from && local && from.querySelector('option[value="' + local + '"]')) from.value = local;
    if (to && home && to.querySelector('option[value="' + home + '"]')) to.value = home;
    if (amount && !Number(amount.value)) amount.value = '1';
    converter.dispatchEvent(new Event('input', { bubbles: true }));
    converter.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (amount) { amount.focus(); amount.select(); }
    return true;
  }

  async function open(action) {
    if (action !== 'quick-expense' && action !== 'converter') return false;
    if (root.TravelMateNavigation && typeof root.TravelMateNavigation.open === 'function') root.TravelMateNavigation.open('budget');
    var features = root.TravelMateFeatures;
    if (features && typeof features.load === 'function') {
      var ready = await features.load('budget');
      if (ready === false) return false;
    }
    return action === 'quick-expense' ? openQuickExpense() : openConverter();
  }

  document.addEventListener('click', function (event) {
    var normalToggle = event.target.closest && event.target.closest('#budget [data-expense-toggle]');
    if (normalToggle) restoreQuickMode(document.querySelector('#budget [data-receipt-form]'));
  }, true);

  root.TravelMateBudgetWidgetActions = Object.freeze({ open: open });
})(typeof window !== 'undefined' ? window : null);

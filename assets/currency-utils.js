(function () {
  'use strict';

  if (window.TravelMateCurrencyUtils) return;

  function cleanCountry(value) {
    return String(value || '').replace(/[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}]/gu, '').trim().toLowerCase();
  }

  function countryCurrency(country) {
    var value = cleanCountry(country);
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
    var code = Object.keys(groups).find(function (currency) {
      return groups[currency].some(function (name) { return value === name || value.indexOf(name) >= 0; });
    });
    return code || 'EUR';
  }

  function money(value, currency) {
    try {
      return new Intl.NumberFormat('he-IL', { style: 'currency', currency: currency, maximumFractionDigits: 2 }).format(Number(value || 0));
    } catch (error) {
      return Number(value || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 }) + ' ' + String(currency || '');
    }
  }

  function readCachedRates(localCurrency) {
    try {
      var parsed = JSON.parse(localStorage.getItem('travelmate-eur-rates:' + localCurrency) || 'null');
      if (!parsed || !parsed.rates) return null;
      return parsed;
    } catch (error) {
      return null;
    }
  }

  function expenseInEuros(expense, rates) {
    var currency = String(expense && expense.currency || 'EUR').toUpperCase();
    var amount = Number(expense && expense.amount || 0);
    if (currency === 'EUR') return amount;
    var rate = Number(rates && rates[currency] || 0);
    return rate ? amount / rate : NaN;
  }

  function localFromEuros(euros, localCurrency, rates) {
    if (localCurrency === 'EUR') return Number(euros || 0);
    var rate = Number(rates && rates[localCurrency] || 0);
    return rate ? Number(euros || 0) * rate : NaN;
  }

  function convertFromEuros(euros, targetCurrency, cache) {
    if (!targetCurrency || targetCurrency === 'EUR') return Number(euros || 0);
    var rates = cache && cache.rates || {};
    var rate = Number(rates[targetCurrency] || 0);
    return rate ? Number(euros || 0) * rate : NaN;
  }

  window.TravelMateCurrencyUtils = Object.freeze({
    countryCurrency: countryCurrency,
    money: money,
    readCachedRates: readCachedRates,
    expenseInEuros: expenseInEuros,
    localFromEuros: localFromEuros,
    convertFromEuros: convertFromEuros
  });
})();
(function () {
  'use strict';

  var CACHE_KEY = 'travelmate-destination-images-v4';
  var FALLBACK = 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=1600&q=82';
  var pending = new Map();

  function normalize(value) {
    return String(value || '').trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[׳״'".,]/g, '').replace(/\s+/g, ' ');
  }

  function key(city, country) { return normalize(city) + '|' + normalize(country); }
  function readCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch (error) { return {}; } }
  function writeCache(cache) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (error) {} }
  function cached(city, country) { return readCache()[key(city, country)] || ''; }

  function wikipediaImage(language, city) {
    var params = new URLSearchParams({ action: 'query', format: 'json', origin: '*', titles: city, prop: 'pageimages', piprop: 'thumbnail', pithumbsize: '1400', redirects: '1' });
    return fetch('https://' + language + '.wikipedia.org/w/api.php?' + params).then(function (response) {
      if (!response.ok) return '';
      return response.json();
    }).then(function (data) {
      var pages = data && data.query && data.query.pages ? Object.values(data.query.pages) : [];
      return pages[0] && pages[0].thumbnail ? pages[0].thumbnail.source : '';
    }).catch(function () { return ''; });
  }

  function englishCityName(city) {
    var params = new URLSearchParams({ action: 'query', format: 'json', origin: '*', titles: city, prop: 'langlinks', lllang: 'en', lllimit: '1', redirects: '1' });
    return fetch('https://he.wikipedia.org/w/api.php?' + params).then(function (response) { return response.ok ? response.json() : null; }).then(function (data) {
      var pages = data && data.query && data.query.pages ? Object.values(data.query.pages) : [];
      return pages[0] && pages[0].langlinks && pages[0].langlinks[0] ? pages[0].langlinks[0]['*'] : city;
    }).catch(function () { return city; });
  }

  function commonsCityImage(city) {
    var params = new URLSearchParams({ action: 'query', format: 'json', origin: '*', generator: 'search', gsrsearch: city + ' cityscape', gsrnamespace: '6', gsrlimit: '12', prop: 'imageinfo', iiprop: 'url|mime', iiurlwidth: '1400' });
    return fetch('https://commons.wikimedia.org/w/api.php?' + params).then(function (response) { return response.ok ? response.json() : null; }).then(function (data) {
      var blocked = /map|flag|coat|logo|locator|route|diagram|icon|plan|seal|emblem/i;
      var pages = data && data.query && data.query.pages ? Object.values(data.query.pages) : [];
      var match = pages.find(function (page) { var info = page.imageinfo && page.imageinfo[0]; return info && /^image\/(jpeg|webp)$/i.test(info.mime || '') && !blocked.test(page.title || ''); });
      return match && match.imageinfo[0] ? match.imageinfo[0].thumburl || match.imageinfo[0].url : '';
    }).catch(function () { return ''; });
  }

  function resolve(city, country) {
    var cacheKey = key(city, country);
    var saved = cached(city, country);
    if (saved) return Promise.resolve(saved);
    if (pending.has(cacheKey)) return pending.get(cacheKey);
    var request = englishCityName(city).then(function (englishCity) {
      return commonsCityImage(englishCity);
    }).then(function (url) {
      return url || wikipediaImage('he', city);
    }).then(function (url) {
      return url || wikipediaImage('en', city);
    }).then(function (url) {
      if (url) { var cache = readCache(); cache[cacheKey] = url; writeCache(cache); }
      pending.delete(cacheKey);
      return url || FALLBACK;
    });
    pending.set(cacheKey, request);
    return request;
  }

  function apply(element, city, country) {
    if (!element) return Promise.resolve(FALLBACK);
    var saved = cached(city, country);
    if (saved) element.style.backgroundImage = "url('" + saved.replace(/'/g, '%27') + "')";
    return resolve(city, country).then(function (url) {
      if (element.isConnected) {
        element.style.backgroundImage = "url('" + url.replace(/'/g, '%27') + "')";
        element.dataset.destinationImage = 'ready';
      }
      return url;
    });
  }

  window.TravelMateDestinationImages = { fallback: FALLBACK, cached: cached, resolve: resolve, apply: apply };
})();

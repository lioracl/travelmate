(function () {
  'use strict';

  var panels = document.querySelectorAll('[data-nearby-places]');
  if (!panels.length) return;
  var endpoints = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  var labels = { food: 'אוכל ושתייה', attractions: 'אטרקציה ותרבות', trips: 'טיול וטבע', shopping: 'קניות', kosher: 'מסומן ככשר', other: 'מקום' };
  var googleTerms = { all: 'מקומות מומלצים', food: 'מסעדות ובתי קפה', attractions: 'אטרקציות ומוזיאונים', trips: 'טיולים וטבע', shopping: 'קניות', kosher_restaurants: 'מסעדות כשרות', kosher_cafes: 'בתי קפה כשרים' };
  var mapLibraryPromise;

  function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, function (character) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]; }); }
  function safeExternalUrl(value) { try { var url = new URL(String(value || ''), location.href); return /^https?:$/.test(url.protocol) ? url.href : ''; } catch (error) { return ''; } }
  function distance(latA, lonA, latB, lonB) { var radius = 6371000, pointA = latA * Math.PI / 180, pointB = latB * Math.PI / 180, deltaPoint = (latB - latA) * Math.PI / 180, deltaLongitude = (lonB - lonA) * Math.PI / 180, value = Math.sin(deltaPoint / 2) * Math.sin(deltaPoint / 2) + Math.cos(pointA) * Math.cos(pointB) * Math.sin(deltaLongitude / 2) * Math.sin(deltaLongitude / 2); return 2 * radius * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)); }
  function categoryFor(tags) { if (/yes|only/i.test(tags['diet:kosher'] || '') || /kosher/i.test(tags.cuisine || '')) return 'kosher'; if (tags.amenity && /restaurant|cafe|fast_food|bar|pub/.test(tags.amenity)) return 'food'; if (tags.shop) return 'shopping'; if (tags.route === 'hiking' || tags.leisure === 'nature_reserve') return 'trips'; if (tags.tourism) return 'attractions'; return 'other'; }
  function aroundClause(radius, lat, lon) { return '(around:' + Number(radius) + ',' + Number(lat) + ',' + Number(lon) + ')'; }

  function categoryParts(category, around) {
    var parts = [];
    if (category === 'all' || category === 'food') parts.push('nwr["amenity"~"restaurant|cafe|fast_food|bar|pub"]' + around + ';');
    if (category === 'all' || category === 'attractions') parts.push('nwr["tourism"~"attraction|museum|gallery|viewpoint|zoo|theme_park"]' + around + ';');
    if (category === 'all' || category === 'trips') { parts.push('nwr["route"="hiking"]' + around + ';'); parts.push('nwr["leisure"="nature_reserve"]' + around + ';'); parts.push('nwr["leisure"~"park|garden"]' + around + ';'); }
    if (category === 'all' || category === 'shopping') parts.push('nwr["shop"]' + around + ';');
    if (category === 'kosher_restaurants') { parts.push('nwr["amenity"~"restaurant|fast_food"]["diet:kosher"~"yes|only",i]' + around + ';'); parts.push('nwr["amenity"~"restaurant|fast_food"]["cuisine"~"kosher",i]' + around + ';'); parts.push('nwr["amenity"~"restaurant|fast_food"]["name"~"kosher|כשר",i]' + around + ';'); }
    if (category === 'kosher_cafes') { parts.push('nwr["amenity"="cafe"]["diet:kosher"~"yes|only",i]' + around + ';'); parts.push('nwr["amenity"="cafe"]["cuisine"~"kosher",i]' + around + ';'); parts.push('nwr["amenity"="cafe"]["name"~"kosher|כשר",i]' + around + ';'); }
    return parts;
  }

  function semanticParts(term, around) {
    var normalized = String(term || '').toLowerCase().trim();
    if (!normalized) return [];
    if (/מוז(?:יאון|יאונים|יונים|אינים|אונים)|museum|museums/.test(normalized)) return ['nwr["tourism"~"museum|gallery"]' + around + ';'];
    if (/מסעד.*כשר|kosher.*restaurant|restaurant.*kosher/.test(normalized)) return categoryParts('kosher_restaurants', around);
    if (/קפה.*כשר|בית.*קפה.*כשר|kosher.*caf/.test(normalized)) return categoryParts('kosher_cafes', around);
    if (/מסעד|restaurant|food/.test(normalized)) return ['nwr["amenity"~"restaurant|fast_food"]' + around + ';'];
    if (/בתי?.*קפה|קפה|caf[eé]/.test(normalized)) return ['nwr["amenity"="cafe"]' + around + ';'];
    if (/פארק|גינ[הו]ת?|park|garden/.test(normalized)) return ['nwr["leisure"~"park|garden"]' + around + ';'];
    if (/בית.*כנסת|בתי.*כנסת|synagogue/.test(normalized)) return ['nwr["amenity"="place_of_worship"]["religion"="jewish"]' + around + ';'];
    if (/בית.*מרקחת|pharmacy/.test(normalized)) return ['nwr["amenity"="pharmacy"]' + around + ';'];
    if (/סופר|מכולת|supermarket|grocery/.test(normalized)) return ['nwr["shop"~"supermarket|convenience"]' + around + ';'];
    if (/קניון|mall|shopping center|shopping centre/.test(normalized)) return ['nwr["shop"="mall"]' + around + ';'];
    if (/אטרקצי|אתרי.*חובה|attraction|sight/.test(normalized)) return ['nwr["tourism"~"attraction|museum|gallery|viewpoint|zoo|theme_park"]' + around + ';'];
    var safeTerm = normalized.replace(/[^\p{L}\p{N}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 70);
    if (!safeTerm) return [];
    return ['nwr["name"~"' + safeTerm + '",i]' + around + ';', 'nwr["brand"~"' + safeTerm + '",i]' + around + ';', 'nwr["operator"~"' + safeTerm + '",i]' + around + ';'];
  }

  function queryFor(category, radius, lat, lon, freeTerm) { var around = aroundClause(radius, lat, lon), parts = freeTerm ? semanticParts(freeTerm, around) : categoryParts(category, around); if (!parts.length) parts = categoryParts('all', around); return '[out:json][timeout:25];(' + parts.join('') + ');out center tags 120;'; }
  function fetchWithTimeout(url, options, timeout) { var controller = new AbortController(), timer = setTimeout(function () { controller.abort(); }, timeout || 12000), settings = Object.assign({}, options || {}, { signal: controller.signal }); return fetch(url, settings).finally(function () { clearTimeout(timer); }); }
  async function overpassPlaces(query) { var requests = endpoints.map(function (endpoint) { return fetchWithTimeout(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body: 'data=' + encodeURIComponent(query) }, 12000).then(function (response) { if (!response.ok) throw new Error('שירות המקומות החזיר שגיאה.'); return response.json(); }); }); try { return await Promise.any(requests); } catch (error) { throw new Error('שירות המקומות עמוס כרגע. מוצג קישור מיידי לתוצאות המלאות ב־Google Maps.'); } }
  function currentPosition() { return new Promise(function (resolve, reject) { if (!window.isSecureContext) { reject(new Error('כדי להשתמש ב־GPS יש לפתוח את האפליקציה מאתר מאובטח. אפשר להשתמש בחיפוש בעיר היעד או במפה.')); return; } if (!navigator.geolocation) { reject(new Error('הדפדפן אינו תומך במיקום GPS. אפשר לחפש בעיר היעד או לבחור נקודה במפה.')); return; } var settled = false, timer = setTimeout(function () { if (!settled) { settled = true; reject(new Error('ה־GPS לא החזיר מיקום בזמן. אפשר לנסות שוב או להשתמש בחיפוש בעיר היעד.')); } }, 10000); navigator.geolocation.getCurrentPosition(function (position) { if (settled) return; settled = true; clearTimeout(timer); resolve(position); }, function (error) { if (settled) return; settled = true; clearTimeout(timer); var message = error.code === 1 ? 'לא ניתן אישור למיקום. ב־iPhone אפשר לאפשר מיקום עבור Safari/TravelMate בהגדרות הפרטיות.' : error.code === 3 ? 'קבלת המיקום ארכה יותר מדי. נסה שוב במקום פתוח או חפש בעיר היעד.' : 'המיקום אינו זמין כרגע. אפשר לחפש בעיר היעד או לבחור נקודה במפה.'; reject(new Error(message)); }, { enableHighAccuracy: false, timeout: 9000, maximumAge: 300000 }); }); }

  function requestGpsConsent(panel) { return new Promise(function (resolve) { try { if (sessionStorage.getItem('travelmate-gps-consent') === 'session') { resolve(true); return; } } catch (error) {} var old = panel.querySelector('[data-gps-consent]'); if (old) old.remove(); var card = document.createElement('section'); card.className = 'gps-consent-card'; card.dataset.gpsConsent = ''; card.innerHTML = '<i class="fa-solid fa-location-dot"></i><div><strong>מיקום רק בזמן השימוש</strong><p>TravelMate יבקש מ־iPhone מיקום חד־פעמי לחיפוש הזה בלבד. אין מעקב ברקע ואין שימוש ב־GPS לאחר סיום החיפוש.</p><span><button type="button" data-gps-continue>המשך לאישור iPhone</button><button type="button" data-gps-cancel>לא עכשיו</button></span></div>'; panel.querySelector('[data-nearby-status]').insertAdjacentElement('afterend', card); function finish(value) { card.remove(); if (value) try { sessionStorage.setItem('travelmate-gps-consent', 'session'); } catch (error) {} resolve(value); } card.querySelector('[data-gps-continue]').addEventListener('click', function () { finish(true); }); card.querySelector('[data-gps-cancel]').addEventListener('click', function () { finish(false); }); }); }

  function loadMapLibrary() { if (window.maplibregl) return Promise.resolve(window.maplibregl); if (mapLibraryPromise) return mapLibraryPromise; mapLibraryPromise = new Promise(function (resolve, reject) { var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.css'; document.head.appendChild(css); var script = document.createElement('script'); script.src = 'https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.js'; script.onload = function () { resolve(window.maplibregl); }; script.onerror = function () { reject(new Error('לא הצלחנו לטעון את המפה. בדוק את החיבור לאינטרנט ונסה שוב.')); }; document.head.appendChild(script); }); return mapLibraryPromise; }
  function keepHebrewOrEnglishLabels(map) { map.getStyle().layers.forEach(function (layer) { if (layer.type === 'symbol' && layer.layout && layer.layout['text-field']) { try { map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', 'name:he'], ['get', 'name:en'], ['get', 'name_en'], '']); } catch (error) {} } }); }

  async function wikipediaPlaces(language, lat, lon, radius) {
    var params = new URLSearchParams({ action: 'query', format: 'json', origin: '*', generator: 'geosearch', ggsprimary: 'all', ggsnamespace: '0', ggsradius: String(Math.min(Number(radius), 10000)), ggslimit: '15', ggscoord: lat + '|' + lon, prop: 'coordinates|pageimages|description|info', inprop: 'url', piprop: 'thumbnail', pithumbsize: '360', redirects: '1' });
    try { var response = await fetchWithTimeout('https://' + language + '.wikipedia.org/w/api.php?' + params, {}, 10000); if (!response.ok) return []; var data = await response.json(); return Object.values((data.query && data.query.pages) || {}).map(function (page) { var point = page.coordinates && page.coordinates[0]; if (!point) return null; return { name: page.title, lat: point.lat, lon: point.lon, type: 'attractions', distance: distance(lat, lon, point.lat, point.lon), description: page.description || 'מידע נוסף מוויקיפדיה', image: page.thumbnail && page.thumbnail.source, url: page.fullurl, source: 'Wikipedia', address: '' }; }).filter(Boolean); } catch (error) { return []; }
  }

  function addressFromTags(tags) { var street = tags['addr:street:he'] || tags['addr:street:en'] || tags['addr:street'] || ''; return [street, tags['addr:housenumber'], tags['addr:city']].filter(Boolean).join(' '); }
  function detailsFromTags(tags) { var details = [], address = addressFromTags(tags); if (address) details.push(address); if (tags.opening_hours) details.push('שעות: ' + tags.opening_hours); if (tags.cuisine) details.push('סגנון: ' + tags.cuisine.replace(/;/g, ', ')); if (tags.phone || tags['contact:phone']) details.push('טלפון: ' + (tags.phone || tags['contact:phone'])); if (/yes|only/i.test(tags['diet:kosher'] || '') || /kosher/i.test(tags.cuisine || '')) details.push('מסומן ככשר ב־OpenStreetMap — מומלץ לבדוק תעודה עדכנית'); return details.join(' · ') || 'פרטי המקום, מיקום מדויק וקישורים למידע נוסף'; }
  function googleMapsUrl(query) { return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query); }
  function resultToolsHtml(count) { return '<div class="nearby-result-tools"><label><span>סינון תוצאות</span><select data-nearby-result-filter><option value="all">הכול</option><option value="near">עד קילומטר</option><option value="website">עם אתר רשמי</option><option value="kosher">מסומן ככשר</option><option value="image">עם תמונה</option></select></label><label><span>סידור לפי</span><select data-nearby-result-sort><option value="distance">הקרובים ביותר</option><option value="info">הכי הרבה מידע</option><option value="name">שם המקום</option></select></label><strong data-nearby-visible-count>' + count + ' תוצאות</strong></div><div class="nearby-filter-empty" data-nearby-filter-empty hidden>אין תוצאות שמתאימות לסינון שבחרת. אפשר לבחור סינון אחר.</div>'; }
  function wireResultTools(results) {
    var filter = results.querySelector('[data-nearby-result-filter]'), sort = results.querySelector('[data-nearby-result-sort]'), count = results.querySelector('[data-nearby-visible-count]'), empty = results.querySelector('[data-nearby-filter-empty]');
    if (!filter || !sort) return;
    function apply() {
      var cards = [].slice.call(results.querySelectorAll('.nearby-result'));
      cards.sort(function (first, second) {
        if (sort.value === 'name') return first.dataset.resultName.localeCompare(second.dataset.resultName, 'he');
        if (sort.value === 'info') return Number(second.dataset.info) - Number(first.dataset.info) || Number(first.dataset.distance) - Number(second.dataset.distance);
        return Number(first.dataset.distance) - Number(second.dataset.distance);
      }).forEach(function (card) { results.appendChild(card); });
      var visible = 0;
      cards.forEach(function (card) {
        var show = filter.value === 'all' || filter.value === 'near' && Number(card.dataset.distance) <= 1000 || filter.value === 'website' && card.dataset.hasSite === '1' || filter.value === 'kosher' && card.dataset.kosher === '1' || filter.value === 'image' && card.dataset.hasImage === '1';
        card.hidden = !show;
        if (show) visible += 1;
      });
      count.textContent = visible + (visible === 1 ? ' תוצאה' : ' תוצאות');
      empty.hidden = visible !== 0;
    }
    filter.addEventListener('change', apply); sort.addEventListener('change', apply); apply();
  }

  function renderPlaces(data, wikiPlaces, lat, lon, status, results, accuracy, warnings, searchTerm, category, destinationName) {
    var seen = {};
    var osmPlaces = (data.elements || []).map(function (item) { var itemLat = item.lat || (item.center && item.center.lat), itemLon = item.lon || (item.center && item.center.lon), tags = item.tags || {}, name = tags['name:he'] || tags['name:en'] || tags.name || tags['brand:en'] || tags.brand; if (!itemLat || !itemLon || !name) return null; return { name: name, lat: itemLat, lon: itemLon, type: categoryFor(tags), distance: distance(lat, lon, itemLat, itemLon), description: detailsFromTags(tags), address: addressFromTags(tags), url: tags.website || tags['contact:website'] || '', source: 'OpenStreetMap', isKosher: /yes|only/i.test(tags['diet:kosher'] || '') || /kosher/i.test(tags.cuisine || '') }; }).filter(Boolean);
    var places = wikiPlaces.concat(osmPlaces).filter(function (place) { var key = place.name.toLowerCase(); if (seen[key]) return false; seen[key] = true; return true; }).sort(function (placeA, placeB) { return placeA.distance - placeB.distance; }).slice(0, 30);
    var displayTerm = searchTerm || googleTerms[category] || 'מקומות מומלצים';
    var broadGoogleQuery = displayTerm + ' ' + (destinationName || '') + ' ' + lat + ',' + lon;
    var googleSummary = '<div class="nearby-google-summary"><div><i class="fa-brands fa-google"></i><span><strong>ציונים וביקורות עדכניים</strong><small>פתח את כל תוצאות “' + escapeHtml(displayTerm) + '” ב־Google Maps</small></span></div><a href="' + googleMapsUrl(broadGoogleQuery) + '" target="_blank" rel="noopener">פתיחה ב־Google Maps</a></div>';
    status.textContent = 'נמצאו ' + places.length + ' מקומות ברדיוס שבחרת.' + (wikiPlaces.length ? ' חלק מהתוצאות כוללות תמונה ומידע מוויקיפדיה.' : '') + (warnings.length ? ' מקור מידע אחד לא היה זמין, אך מוצגות תוצאות מהמקורות האחרים.' : '') + (accuracy ? ' דיוק המיקום: כ־' + Math.round(accuracy) + ' מטר.' : '');
    if (!places.length) { results.innerHTML = googleSummary + '<div class="nearby-empty"><strong>לא נמצאו מספיק מקומות במאגר הפתוח.</strong><span>אפשר להגדיל את הרדיוס או לפתוח את החיפוש המלא ב־Google Maps, כולל ציונים וביקורות.</span></div>'; return; }
    results.innerHTML = googleSummary + resultToolsHtml(places.length) + places.map(function (place) { var distanceText = place.distance < 1000 ? Math.round(place.distance) + ' מ׳' : (place.distance / 1000).toFixed(1) + ' ק״מ', preciseQuery = [place.name, place.address, place.lat + ',' + place.lon].filter(Boolean).join(', '), googleMaps = googleMapsUrl(preciseQuery), osm = 'https://www.openstreetmap.org/?mlat=' + place.lat + '&mlon=' + place.lon + '#map=17/' + place.lat + '/' + place.lon, officialUrl = safeExternalUrl(place.url), infoScore = (place.image ? 2 : 0) + (officialUrl ? 2 : 0) + (place.address ? 1 : 0); return '<article class="nearby-result' + (place.image ? ' has-image' : '') + '" data-place-lat="' + Number(place.lat) + '" data-place-lon="' + Number(place.lon) + '" data-distance="' + Math.round(place.distance) + '" data-result-name="' + escapeHtml(place.name.toLowerCase()) + '" data-has-site="' + (officialUrl ? '1' : '0') + '" data-has-image="' + (place.image ? '1' : '0') + '" data-kosher="' + (place.isKosher ? '1' : '0') + '" data-info="' + infoScore + '">' + (place.image ? '<img src="' + escapeHtml(place.image) + '" alt="" loading="lazy">' : '') + '<div><span class="nearby-type">' + labels[place.type] + ' · ' + place.source + '</span><h3>' + escapeHtml(place.name) + '</h3><p>' + escapeHtml(place.description) + '</p><div class="nearby-links">' + (officialUrl ? '<a href="' + escapeHtml(officialUrl) + '" target="_blank" rel="noopener"><i class="fa-solid fa-globe"></i> אתר רשמי</a>' : '') + '<a class="google-rating-link" href="' + googleMaps + '" target="_blank" rel="noopener"><i class="fa-brands fa-google"></i> ציונים וביקורות</a><a href="' + osm + '" target="_blank" rel="noopener">מיקום ומקור</a></div></div><span class="nearby-distance">' + distanceText + '</span></article>'; }).join('');
    wireResultTools(results);
  }

  function enhanceSearchControls(panel) {
    var categorySelect = panel.querySelector('[data-nearby-category]');
    if (!categorySelect.querySelector('option[value="kosher_restaurants"]')) categorySelect.insertAdjacentHTML('beforeend', '<option value="kosher_restaurants">מסעדות כשרות</option><option value="kosher_cafes">בתי קפה כשרים</option>');
    var form = document.createElement('form');
    form.className = 'nearby-free-search';
    form.setAttribute('data-nearby-free-form', '');
    form.innerHTML = '<label><span>חיפוש חופשי</span><input type="search" data-nearby-free-input placeholder="לדוגמה: מוזיאונים, בית כנסת או בית מרקחת" autocomplete="off"></label><button type="submit"><i class="fa-solid fa-magnifying-glass"></i> חיפוש באזור היעד</button>';
    panel.querySelector('.nearby-controls').insertAdjacentElement('beforebegin', form);
    return form;
  }

  panels.forEach(function (panel) {
    var gpsButton = panel.querySelector('[data-nearby-search]'), mapButton = panel.querySelector('[data-nearby-map-button]'), mapShell = panel.querySelector('[data-nearby-map-shell]'), mapElement = panel.querySelector('[data-nearby-map]'), mapSearch = panel.querySelector('[data-nearby-map-search]'), mapHint = panel.querySelector('[data-nearby-map-hint]'), status = panel.querySelector('[data-nearby-status]'), results = panel.querySelector('[data-nearby-results]'), freeForm = enhanceSearchControls(panel), freeInput = freeForm.querySelector('[data-nearby-free-input]'), map, marker, selectedPoint, lastPoint, searchSequence = 0;
    function destinationPoint() { var lat = Number(panel.dataset.destinationLat), lon = Number(panel.dataset.destinationLon); return lat && lon ? { lat: lat, lon: lon } : null; }

    async function searchAt(lat, lon, accuracy) {
      var requestId = ++searchSequence;
      gpsButton.disabled = true; mapSearch.disabled = true; freeForm.querySelector('button').disabled = true; status.classList.remove('is-error'); status.textContent = 'מחפש מקומות מדויקים ומכין קישורים לציונים ב־Google…'; results.innerHTML = ''; lastPoint = { lat: Number(lat), lon: Number(lon) };
      try {
        var radius = panel.querySelector('[data-nearby-radius]').value, category = panel.querySelector('[data-nearby-category]').value, freeTerm = freeInput.value.trim(), includeWiki = !freeTerm && (category === 'all' || category === 'attractions' || category === 'trips');
        var settled = await Promise.allSettled([overpassPlaces(queryFor(category, radius, lat, lon, freeTerm)), includeWiki ? Promise.all([wikipediaPlaces('he', lat, lon, radius), wikipediaPlaces('en', lat, lon, radius)]) : Promise.resolve([[], []])]);
        if (requestId !== searchSequence) return;
        var osmData = settled[0].status === 'fulfilled' ? settled[0].value : { elements: [] }, wikiGroups = settled[1].status === 'fulfilled' ? settled[1].value : [[], []], warnings = settled.filter(function (item) { return item.status === 'rejected'; }), wikiSeen = {}, wikiCombined = wikiGroups[0].concat(wikiGroups[1]).filter(function (place) { var key = place.name.toLowerCase(); if (wikiSeen[key]) return false; wikiSeen[key] = true; return true; });
        renderPlaces(osmData, wikiCombined, lat, lon, status, results, accuracy, warnings, freeTerm, category, panel.dataset.destinationName);
      } catch (error) { if (requestId === searchSequence) { status.classList.add('is-error'); status.textContent = error.message || 'לא הצלחנו לטעון מקומות כרגע.'; } }
      finally { if (requestId === searchSequence) { gpsButton.disabled = false; freeForm.querySelector('button').disabled = false; mapSearch.disabled = !selectedPoint; } }
    }

    freeForm.addEventListener('submit', function (event) { event.preventDefault(); var category = panel.querySelector('[data-nearby-category]').value; if (!freeInput.value.trim() && category === 'all') { freeInput.focus(); status.textContent = 'כתוב מה תרצה למצוא, לדוגמה: מוזיאונים, או בחר קטגוריה מהרשימה.'; return; } var point = selectedPoint || lastPoint || destinationPoint(); if (!point) { status.classList.add('is-error'); status.textContent = 'מרכז העיר עדיין לא אותר. נסה שוב בעוד רגע, השתמש ב־GPS או בחר נקודה במפה.'; return; } searchAt(point.lat, point.lon); });
    gpsButton.addEventListener('click', async function () { if (!await requestGpsConsent(panel)) { status.textContent = 'החיפוש לפי GPS בוטל. אפשר לחפש בעיר היעד ללא שיתוף מיקום.'; return; } gpsButton.disabled = true; status.classList.remove('is-error'); status.textContent = 'מקבל מיקום חד־פעמי מה־iPhone…'; results.innerHTML = ''; try { var position = await currentPosition(); status.textContent = 'המיקום התקבל. מחפש מקומות קרובים…'; await searchAt(position.coords.latitude, position.coords.longitude, position.coords.accuracy); } catch (error) { status.classList.add('is-error'); status.textContent = error.message; } finally { gpsButton.disabled = false; } });
    mapButton.addEventListener('click', async function () { mapShell.hidden = !mapShell.hidden; if (mapShell.hidden) return; mapButton.classList.add('active'); status.classList.remove('is-error'); status.textContent = 'אפשר להזיז ולהגדיל את המפה, ואז לבחור נקודה. שמות יוצגו בעברית או באנגלית.'; try { var MapLibre = await loadMapLibrary(); if (!map) { var start = destinationPoint() || { lat: 31.7683, lon: 35.2137 }; map = new MapLibre.Map({ container: mapElement, style: 'https://tiles.openfreemap.org/styles/liberty', center: [start.lon, start.lat], zoom: 9 }); map.addControl(new MapLibre.NavigationControl(), 'top-left'); map.on('style.load', function () { keepHebrewOrEnglishLabels(map); }); map.on('click', function (event) { selectedPoint = { lat: event.lngLat.lat, lon: event.lngLat.lng }; if (marker) marker.setLngLat([selectedPoint.lon, selectedPoint.lat]); else marker = new MapLibre.Marker({ color: '#22865f' }).setLngLat([selectedPoint.lon, selectedPoint.lat]).addTo(map); mapSearch.disabled = false; mapHint.textContent = 'נבחרה נקודה ב־' + selectedPoint.lat.toFixed(4) + ', ' + selectedPoint.lon.toFixed(4) + '. אפשר להתחיל לחפש.'; }); } setTimeout(function () { map.resize(); }, 50); } catch (error) { status.classList.add('is-error'); status.textContent = error.message; } });
    mapSearch.addEventListener('click', function () { if (selectedPoint) searchAt(selectedPoint.lat, selectedPoint.lon); });
    panel.addEventListener('nearby:search', function (event) { var point = event.detail || {}; if (Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lon))) searchAt(Number(point.lat), Number(point.lon)); });
  });
})();

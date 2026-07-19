(function () {
  'use strict';

  if (window.__travelMateSmartHubLoaded) return;
  window.__travelMateSmartHubLoaded = true;

  var script = document.currentScript;
  var rootUrl = new URL('../', script.src);
  var manifest = document.createElement('link');
  manifest.rel = 'manifest'; manifest.href = new URL('manifest.webmanifest', rootUrl).href;
  document.head.appendChild(manifest);
  var theme = document.createElement('meta'); theme.name = 'theme-color'; theme.content = '#292524'; document.head.appendChild(theme);
  var serviceWorkerRegistration = null;
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register(new URL('sw.js', rootUrl).href).then(function (registration) { serviceWorkerRegistration = registration; }).catch(function () {});
  }

  if (!/\/trip\//.test(location.pathname.replace(/\\/g, '/'))) return;

  var state = { trip: null, ui: null, position: null, installPrompt: null };
  window.addEventListener('beforeinstallprompt', function (event) { event.preventDefault(); state.installPrompt = event; });

  function clean(value) { return String(value || '').replace(/[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}]/gu, '').trim(); }
  function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, function (character) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]; }); }
  function readJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch (error) { return fallback; } }
  function writeJson(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (error) { return false; } }
  function tripKey(suffix) { return 'travelmate-smart:' + (state.trip.id || state.trip.city || 'trip') + ':' + suffix; }
  function dateLabel(value) { if (!value) return ''; try { return new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value + 'T12:00:00')); } catch (error) { return value; } }
  function mapsUrl(query) { return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query); }
  function openMaps(query) { window.open(mapsUrl(query + ' ' + state.trip.city + ' ' + state.trip.country), '_blank', 'noopener,noreferrer'); }
  function askAI(prompt) { closeHub(); window.setTimeout(function () { window.dispatchEvent(new CustomEvent('travelmate:ask-ai', { detail: { prompt: prompt } })); }, 0); }
  function speak(text, language) {
    if (!('speechSynthesis' in window)) return showStatus('הקראה קולית אינה זמינה בדפדפן הזה.', 'error');
    speechSynthesis.cancel(); var utterance = new SpeechSynthesisUtterance(text); utterance.lang = language || 'he-IL'; utterance.rate = .94; speechSynthesis.speak(utterance);
  }
  function getPosition() {
    if (state.position) return Promise.resolve(state.position);
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) return reject(new Error('gps-unavailable'));
      navigator.geolocation.getCurrentPosition(function (position) { state.position = { latitude: position.coords.latitude, longitude: position.coords.longitude }; resolve(state.position); }, reject, { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 });
    });
  }
  function shareData(data) {
    if (navigator.share) return navigator.share(data).catch(function () {});
    var text = [data.title, data.text, data.url].filter(Boolean).join('\n');
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { showStatus('הפרטים הועתקו.'); });
  }

  async function getTrip() {
    var trip = null;
    if (window.travelMateTripReady) { try { trip = await window.travelMateTripReady; } catch (error) {} }
    var nearby = document.querySelector('[data-destination-lat][data-destination-lon]');
    var hero = document.querySelector('.hero h1');
    var city = clean(trip && trip.city || document.querySelector('[data-city]') && document.querySelector('[data-city]').textContent || nearby && nearby.dataset.destinationName || hero && hero.textContent.split(/[,:·]/)[0]);
    var country = clean(trip && trip.country || document.querySelector('[data-country]') && document.querySelector('[data-country]').textContent || document.querySelector('.destination-mini strong') && document.querySelector('.destination-mini strong').textContent || hero && hero.textContent);
    return {
      id: trip && trip.id || new URLSearchParams(location.search).get('id') || location.pathname,
      city: city || 'היעד', country: country || '', start: trip && trip.start || '', end: trip && trip.end || '', days: Number(trip && trip.days || document.querySelectorAll('.day-panel,.generated-day').length || 1), budget: Number(trip && trip.budget || String(document.querySelector('[data-budget]') && document.querySelector('[data-budget]').textContent || '').replace(/[^0-9.]/g, '')) || 0,
      latitude: nearby ? Number(nearby.dataset.destinationLat) : null, longitude: nearby ? Number(nearby.dataset.destinationLon) : null
    };
  }

  var groups = [
    { title: 'עכשיו ובדרך', tools: [
      ['now','fa-location-crosshairs','מה עושים עכשיו?','3 הצעות לפי שעה, GPS ומזג האוויר','green'],
      ['surprise','fa-dice','הפתע אותי','מקום מיוחד ולא צפוי לידך','gold'],
      ['nearby','fa-magnifying-glass-location','חיפוש מסביבי','חיפוש חופשי לפי מרחק וצורך','green'],
      ['replan','fa-shuffle','תיקון מסלול חי','בנייה מחדש בעקבות שינוי או איחור','purple']
    ]},
    { title: 'תכנון חכם', tools: [
      ['route','fa-route','מסלול אופטימלי','סידור מקומות לפי זמן ומרחק','green'],
      ['mood','fa-wand-magic-sparkles','מסלול לפי מצב רוח','רגוע, אוכל, צילום או הרפתקה','purple'],
      ['load','fa-gauge-high','מד עומס יומי','זיהוי ימים עמוסים או ריקים','gold'],
      ['rain','fa-umbrella','מצב גשם','החלפת התוכנית במקומות מקורים','green'],
      ['jetlag','fa-moon','Jet Lag','תוכנית שינה וקפה לפי היעד','purple']
    ]},
    { title: 'חוויה וזיכרונות', tools: [
      ['guide','fa-headphones','מדריך קולי AI','סיפור והסבר קולי על המקום','purple'],
      ['phrases','fa-language','משפטים מקומיים','משפטים שימושיים עם הקראה','green'],
      ['memory','fa-camera-retro','מפת זיכרונות','שמירת רגעים ומקומות מהמסע','gold'],
      ['summary','fa-book-open','סיכום היום','יומן אוטומטי והמלצות למחר','purple'],
      ['game','fa-trophy','משחק משימות','אתגרים, נקודות והישגים','gold']
    ]},
    { title: 'כלי נסיעה', tools: [
      ['next','fa-bell','האירוע הבא','טיסה, הזמנה או פעילות קרובה','green'],
      ['offline','fa-cloud-arrow-down','ערכת אופליין','התוכנית והכלים גם בלי אינטרנט','purple'],
      ['expense','fa-receipt','תקציב וקבלות','הוצאות, צילום קבלה וסיכום','gold'],
      ['wallet','fa-wallet','ארנק נסיעה','גישה מהירה לכרטיסים ולהזמנות','green'],
      ['share','fa-user-group','שיתוף הטיול','שליחת התוכנית למטיילים','purple'],
      ['safety','fa-shield-heart','מרכז בטיחות','מיקום, חירום ופרטי הטיול','gold']
    ]}
  ];

  function createUi() {
    var launch = document.createElement('button'); launch.type = 'button'; launch.className = 'smart-hub-launch'; launch.innerHTML = '<i class="fa-solid fa-sparkles"></i><span>מרכז חכם <small>20 כלים</small></span>';
    launch.setAttribute('aria-label', 'פתיחת המרכז החכם'); document.body.appendChild(launch);
    var backdrop = document.createElement('section'); backdrop.className = 'modal-backdrop'; backdrop.id = 'modal-smart-hub'; backdrop.setAttribute('role', 'dialog'); backdrop.setAttribute('aria-modal', 'true');
    backdrop.innerHTML = '<div class="modal smart-hub-modal"><header><div class="smart-hub-heading"><span class="smart-hub-avatar"><i class="fa-solid fa-sparkles"></i></span><div><span>TravelMate Smart</span><h2>המרכז החכם של הטיול</h2><p>' + escapeHtml(state.trip.city) + ' · כל מה שצריך לפני הטיול ובדרך</p></div></div><button class="modal-close" type="button" data-smart-close aria-label="סגירה"><i class="fa-solid fa-xmark"></i></button></header><div class="smart-hub-body"><div class="smart-hub-home"><div class="smart-hub-intro"><div><strong>מה תרצה לעשות עכשיו?</strong><span>הכלים מתאימים את עצמם ליעד, לזמן ולמיקום שלך.</span></div><button class="smart-hub-now" type="button" data-tool="now"><i class="fa-solid fa-location-crosshairs"></i> הצעה חכמה עכשיו</button></div><div class="smart-hub-groups"></div></div><div class="smart-tool-view"><button class="smart-tool-back" type="button"><i class="fa-solid fa-arrow-right"></i> חזרה לכל הכלים</button><div data-smart-tool-content></div></div></div></div>';
    document.body.appendChild(backdrop);
    var groupsNode = backdrop.querySelector('.smart-hub-groups');
    groups.forEach(function (group) {
      var section = document.createElement('section'); section.className = 'smart-hub-group'; section.innerHTML = '<h3>' + group.title + '</h3><div class="smart-hub-grid"></div>';
      group.tools.forEach(function (tool) { section.querySelector('.smart-hub-grid').insertAdjacentHTML('beforeend', '<button type="button" class="smart-tool" data-tool="' + tool[0] + '" data-tone="' + tool[4] + '"><i class="fa-solid ' + tool[1] + '"></i><strong>' + tool[2] + '</strong><span>' + tool[3] + '</span></button>'); });
      groupsNode.appendChild(section);
    });
    state.ui = { launch: launch, backdrop: backdrop, modal: backdrop.querySelector('.smart-hub-modal'), content: backdrop.querySelector('[data-smart-tool-content]') };
    launch.addEventListener('click', openHub); backdrop.querySelector('[data-smart-close]').addEventListener('click', closeHub); backdrop.querySelector('.smart-tool-back').addEventListener('click', showHome);
    backdrop.addEventListener('click', function (event) { var trigger = event.target.closest('[data-tool]'); if (trigger) openTool(trigger.dataset.tool); if (event.target === backdrop) closeHub(); });
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && backdrop.classList.contains('open')) closeHub(); });
  }

  function openHub() { state.ui.backdrop.classList.add('open'); state.ui.launch.setAttribute('aria-expanded', 'true'); }
  function closeHub() { state.ui.backdrop.classList.remove('open'); state.ui.launch.setAttribute('aria-expanded', 'false'); showHome(); }
  function showHome() { state.ui.modal.classList.remove('tool-open'); state.ui.content.innerHTML = ''; }
  function panel(title, description, body) { state.ui.modal.classList.add('tool-open'); state.ui.content.innerHTML = '<section class="smart-tool-panel"><h3>' + title + '</h3><p>' + description + '</p>' + (body || '') + '</section>'; return state.ui.content.querySelector('.smart-tool-panel'); }
  function showStatus(message, tone) { var host = state.ui && state.ui.content; if (!host) return; var old = host.querySelector('.smart-status'); if (old) old.remove(); var node = document.createElement('div'); node.className = 'smart-status' + (tone ? ' ' + tone : ''); node.textContent = message; host.querySelector('.smart-tool-panel').appendChild(node); }
  function scheduleText() { return [].slice.call(document.querySelectorAll('.day-item strong,.generated-day p,.plan-card h3')).map(function (node) { return clean(node.textContent); }).filter(Boolean).slice(0, 24).join(', ') || 'עדיין אין פעילויות מפורטות'; }

  var handlers = {};
  handlers.now = async function () {
    var host = panel('מה עושים עכשיו?', 'מחפש רעיונות שמתאימים לשעה הנוכחית ולמיקום שלך.', '<div class="smart-status">בודק מיקום ומכין הצעות…</div><div class="smart-list"></div>');
    var hour = new Date().getHours(); var offers = hour < 11 ? [['fa-mug-hot','ארוחת בוקר טובה','breakfast cafe'],['fa-landmark','אתר מרכזי שנפתח מוקדם','tourist attraction'],['fa-tree','טיול בוקר רגוע','park']] : hour < 17 ? [['fa-utensils','מקום טוב לארוחת צהריים','local lunch'],['fa-camera','נקודת צילום קרובה','photo spot'],['fa-landmark','תרבות ואטרקציה','museum attraction']] : [['fa-utensils','ארוחת ערב מקומית','local dinner'],['fa-martini-glass','מקום ערב מיוחד','cocktail bar'],['fa-binoculars','תצפית לשקיעה','sunset viewpoint']];
    try { await getPosition(); host.querySelector('.smart-status').textContent = 'המיקום נמצא. הנה 3 הצעות שמתאימות לעכשיו:'; } catch (error) { host.querySelector('.smart-status').textContent = 'לא התקבל GPS, לכן ההצעות מבוססות על ' + state.trip.city + '.'; }
    host.querySelector('.smart-list').innerHTML = offers.map(function (offer) { return '<article><i class="fa-solid ' + offer[0] + '"></i><div><strong>' + offer[1] + '</strong><span>פתיחה במפה סביב המיקום הנוכחי</span></div><button type="button" data-map-query="' + offer[2] + '">מצא</button></article>'; }).join('');
    host.querySelectorAll('[data-map-query]').forEach(function (button) { button.addEventListener('click', function () { openMaps(button.dataset.mapQuery); }); });
  };
  handlers.surprise = function () { var ideas = [['hidden gem','פנינה נסתרת'],['local market','שוק מקומי'],['unusual museum','מוזיאון יוצא דופן'],['scenic viewpoint','תצפית מיוחדת'],['local bakery','מאפייה מקומית']]; var choice = ideas[Math.floor(Math.random() * ideas.length)]; var host = panel('הפתע אותי', 'בחרתי עבורך רעיון לא צפוי ב' + state.trip.city + '.', '<div class="smart-score"><i class="fa-solid fa-dice"></i><div><b>' + choice[1] + '</b><span>בחירה אקראית חדשה בכל לחיצה</span></div></div><div class="smart-actions"><button class="primary" type="button" data-surprise-open>פתח במפה</button><button type="button" data-surprise-again>הגרל שוב</button></div>'); host.querySelector('[data-surprise-open]').onclick = function () { openMaps(choice[0]); }; host.querySelector('[data-surprise-again]').onclick = handlers.surprise; };
  handlers.nearby = function () { var host = panel('חיפוש חכם מסביבי', 'כתוב בדיוק מה אתה צריך — למשל בית מרקחת פתוח, אוכל טבעוני או קפה שקט.', '<form class="smart-form"><label>מה מחפשים?<input name="query" required placeholder="לדוגמה: מסעדה מקומית פתוחה עכשיו"></label><label>מרחק מועדף<select name="distance"><option>עד 10 דקות הליכה</option><option>עד 20 דקות הליכה</option><option>עד 5 ק״מ</option></select></label><button class="smart-hub-now" type="submit">חיפוש במפה</button></form>'); host.querySelector('form').onsubmit = function (event) { event.preventDefault(); openMaps(event.target.query.value + ' ' + event.target.distance.value); }; };
  handlers.replan = function () { var host = panel('תיקון מסלול בזמן אמת', 'ספר לנבו מה השתנה והוא יבנה מחדש את המשך היום בלי לאבד את המקומות החשובים.', '<form class="smart-form"><label>מה השתנה?<textarea name="change" required placeholder="לדוגמה: ירד גשם ואיחרנו בשעתיים"></textarea></label><button class="smart-hub-now" type="submit">בנה מחדש עם נבו</button></form>'); host.querySelector('form').onsubmit = function (event) { event.preventDefault(); askAI('אנחנו מטיילים ב' + state.trip.city + '. התוכנית הנוכחית: ' + scheduleText() + '. השינוי שקרה: ' + event.target.change.value + '. בנה מחדש את המשך היום בצורה מעשית לפי שעות ומרחקים.'); }; };
  handlers.route = function () { var activities = scheduleText(); var host = panel('מסלול אופטימלי', 'נבו יסדר את המקומות בסדר הגיוני ויצמצם נסיעות מיותרות.', '<div class="smart-status">נמצאו בתוכנית: ' + escapeHtml(activities) + '</div><div class="smart-actions"><button class="primary" type="button" data-route-ai>סדר את המסלול</button><button type="button" data-route-map>פתח מפה</button></div>'); host.querySelector('[data-route-ai]').onclick = function () { askAI('סדר לי מסלול יעיל ב' + state.trip.city + ' לפי קרבה, שעות פתיחה וזמן נסיעה. הפעילויות הקיימות: ' + activities + '. החזר לוח זמנים לפי שעות והסבר קצר לכל מעבר.'); }; host.querySelector('[data-route-map]').onclick = function () { openMaps('attractions route'); }; };
  handlers.mood = function () { var moods = ['רגוע','רומנטי','אוכל','צילום','היסטוריה','לילה','הרפתקה']; var host = panel('מסלול לפי מצב רוח', 'בחר את האווירה שמתאימה לך היום.', '<div class="smart-chips">' + moods.map(function (mood) { return '<button class="smart-chip" type="button">' + mood + '</button>'; }).join('') + '</div><div class="smart-actions"><button class="primary" type="button" data-mood-build>בנה מסלול</button></div>'); host.querySelectorAll('.smart-chip').forEach(function (button) { button.onclick = function () { button.classList.toggle('active'); }; }); host.querySelector('[data-mood-build]').onclick = function () { var selected = [].slice.call(host.querySelectorAll('.smart-chip.active')).map(function (node) { return node.textContent; }).join(', ') || 'רגוע ומקומי'; askAI('בנה לי מסלול יום ב' + state.trip.city + ' באווירה: ' + selected + '. שלב מקומות אמיתיים, זמני מעבר והפסקות.'); }; };
  handlers.load = function () { var items = document.querySelectorAll('.day-item,.generated-day,.plan-card').length; var days = Math.max(1, state.trip.days); var average = items / days; var label = average > 5 ? 'עמוס מאוד' : average > 3 ? 'מאוזן' : 'רגוע'; var host = panel('מד עומס יומי', 'בדיקה מהירה של כמות הפעילויות ביחס לאורך הטיול.', '<div class="smart-score"><i class="fa-solid fa-gauge-high"></i><div><b>' + label + '</b><span>' + items + ' פריטים על פני ' + days + ' ימים</span></div></div><div class="smart-actions"><button class="primary" type="button" data-load-ai>אזן עם נבו</button></div>'); host.querySelector('[data-load-ai]').onclick = function () { askAI('בדוק את עומס התוכנית שלי ב' + state.trip.city + ': ' + scheduleText() + '. חלק אותה ל' + days + ' ימים, הוסף הפסקות ואל תעמיס יותר מדי.'); }; };
  handlers.rain = function () { var summary = clean(document.querySelector('[data-weather-summary]') && document.querySelector('[data-weather-summary]').textContent); var host = panel('מצב גשם', 'החלפה מהירה של פעילויות פתוחות במקומות מקורים.', '<div class="smart-status">תחזית נוכחית: ' + escapeHtml(summary || 'יש לבדוק בחלונית מזג האוויר') + '</div><div class="smart-actions"><button class="primary" type="button" data-rain-ai>בנה יום גשום</button><button type="button" data-rain-map>מצא מקומות מקורים</button></div>'); host.querySelector('[data-rain-ai]').onclick = function () { askAI('צפוי מזג אוויר לא נוח ב' + state.trip.city + '. התוכנית: ' + scheduleText() + '. החלף פעילויות פתוחות במוזיאונים, שווקים מקורים ומקומות אוכל קרובים, לפי שעות.'); }; host.querySelector('[data-rain-map]').onclick = function () { openMaps('indoor attractions museums covered market'); }; };
  handlers.jetlag = function () { var host = panel('תוכנית Jet Lag', 'נבו יבנה תוכנית שינה, אור, קפה וארוחות לפני הטיסה ואחריה.', '<div class="smart-actions"><button class="primary" type="button" data-jetlag-ai>בנה תוכנית אישית</button></div>'); host.querySelector('[data-jetlag-ai]').onclick = function () { askAI('בנה לי תוכנית Jet Lag לטיול מישראל אל ' + state.trip.city + ', ' + state.trip.country + (state.trip.start ? ', יציאה ב' + dateLabel(state.trip.start) : '') + '. כלול שינה, חשיפה לאור, קפה וארוחות בשלושת הימים שלפני ואחרי ההגעה.'); }; };
  handlers.guide = function () { var intro = 'ברוך הבא ל' + state.trip.city + '. זה הזמן להאט, להביט סביב ולגלות את הסיפור המקומי של המקום.'; var host = panel('המדריך הקולי שלך', 'הקראה בעברית והכנת סיפור מפורט על המקום שבו אתה נמצא.', '<div class="smart-status">' + intro + '</div><div class="smart-actions"><button class="primary" type="button" data-guide-speak><i class="fa-solid fa-volume-high"></i> השמע</button><button type="button" data-guide-ai>הכן סיור קולי עם נבו</button></div>'); host.querySelector('[data-guide-speak]').onclick = function () { speak(intro); }; host.querySelector('[data-guide-ai]').onclick = function () { askAI('פעל כמדריך טיולים קולי ב' + state.trip.city + '. שאל אותי באיזה אתר אני נמצא ואז ספר עליו בעברית בצורה חיה, קצרה ומעניינת, כולל עובדה מפתיעה וטיפ מקומי.'); }; };
  handlers.phrases = function () { var phrases = [['שלום ותודה','Hello, thank you'],['אפשר לשלם בכרטיס?','Can I pay by card?'],['אני צריך עזרה','I need help'],['איפה תחנת הרכבת?','Where is the train station?'],['יש לי אלרגיה למזון','I have a food allergy']]; var host = panel('משפטים שימושיים', 'הקש על משפט כדי להשמיע אותו. נבו יכול לתרגם לשפה המקומית של ' + state.trip.country + '.', '<div class="smart-list">' + phrases.map(function (item) { return '<article><i class="fa-solid fa-language"></i><div><strong>' + item[0] + '</strong><span>' + item[1] + '</span></div><button type="button" data-speak="' + escapeHtml(item[1]) + '"><i class="fa-solid fa-volume-high"></i></button></article>'; }).join('') + '</div><div class="smart-actions"><button class="primary" type="button" data-phrase-ai>תרגם לשפה המקומית</button></div>'); host.querySelectorAll('[data-speak]').forEach(function (button) { button.onclick = function () { speak(button.dataset.speak, 'en-US'); }; }); host.querySelector('[data-phrase-ai]').onclick = function () { askAI('צור לי פנקס של 15 משפטים שימושיים למטייל ב' + state.trip.country + '. הצג בעברית, בשפה המקומית ובתעתיק עברי קל להגייה.'); }; };
  handlers.memory = function () { closeHub(); location.hash = 'memories'; setTimeout(function () { var input = document.querySelector('[data-memory-form] textarea'); if (input) input.focus(); }, 250); };
  handlers.summary = function () { closeHub(); location.hash = 'memories'; setTimeout(function () { var button = document.querySelector('[data-summary-ai]'); if (button) button.focus(); }, 250); };
  handlers.game = function () { var challenges = readJson(tripKey('game'), [{text:'לטעום מאכל מקומי',points:20},{text:'לצלם תצפית מיוחדת',points:20},{text:'ללמוד 3 מילים מקומיות',points:15},{text:'למצוא מקום שאינו במדריך',points:25},{text:'לשוחח עם אדם מקומי',points:30}]); var host = panel('משחק המשימות', 'השלם אתגרים, צבור נקודות והפוך את הטיול להרפתקה.', '<div class="smart-score" data-game-score></div><div class="smart-list" data-game-list></div>'); function render() { var score = challenges.filter(function (c) { return c.done; }).reduce(function (sum, c) { return sum + c.points; }, 0); host.querySelector('[data-game-score]').innerHTML = '<i class="fa-solid fa-trophy"></i><div><b>' + score + ' נקודות</b><span>' + challenges.filter(function (c) { return c.done; }).length + ' מתוך ' + challenges.length + ' משימות הושלמו</span></div>'; host.querySelector('[data-game-list]').innerHTML = challenges.map(function (challenge, index) { return '<article class="' + (challenge.done ? 'done' : '') + '"><i class="fa-solid ' + (challenge.done ? 'fa-check' : 'fa-star') + '"></i><div><strong>' + challenge.text + '</strong><span>' + challenge.points + ' נקודות</span></div><button type="button" data-challenge="' + index + '">' + (challenge.done ? 'בטל' : 'בוצע!') + '</button></article>'; }).join(''); host.querySelectorAll('[data-challenge]').forEach(function (button) { button.onclick = function () { challenges[Number(button.dataset.challenge)].done = !challenges[Number(button.dataset.challenge)].done; writeJson(tripKey('game'), challenges); render(); }; }); } render(); };
  handlers.next = function () { var start = state.trip.start ? new Date(state.trip.start + 'T12:00:00') : null; var daysAway = start ? Math.ceil((start - new Date()) / 86400000) : null; var text = daysAway === null ? 'הטיול הקרוב שלך ב' + state.trip.city : daysAway > 0 ? 'הטיול מתחיל בעוד ' + daysAway + ' ימים' : daysAway >= -state.trip.days ? 'אתה בטיול עכשיו — בדוק את התוכנית היומית' : 'הטיול הסתיים'; var host = panel('האירוע הבא', 'הצצה מהירה למה שחשוב עכשיו.', '<div class="smart-score"><i class="fa-solid fa-bell"></i><div><b>' + text + '</b><span>' + (state.trip.start ? dateLabel(state.trip.start) : 'התאריך נמצא בתוכנית') + '</span></div></div><div class="smart-actions"><button class="primary" type="button" data-next-plan>פתח תוכנית</button><button type="button" data-next-docs>פתח מסמכים</button></div>'); host.querySelector('[data-next-plan]').onclick = function () { closeHub(); location.hash = 'plan'; }; host.querySelector('[data-next-docs]').onclick = function () { closeHub(); location.hash = 'documents'; }; };
  handlers.offline = function () { var host = panel('ערכת אופליין', 'האפליקציה שומרת את מסכי הליבה במכשיר כדי שתוכל לפתוח אותם גם בלי קליטה.', '<div class="smart-status">בודק את מצב השמירה במכשיר…</div><div class="smart-actions"><button class="primary" type="button" data-offline-save>שמור עכשיו</button><button type="button" data-install-app>התקן כאפליקציה</button></div>'); navigator.serviceWorker && navigator.serviceWorker.ready.then(function () { host.querySelector('.smart-status').textContent = 'ערכת האופליין פעילה. מומלץ לפתוח מראש גם את עמוד הטיול והמסמכים הדרושים.'; }).catch(function () { host.querySelector('.smart-status').textContent = 'ערכת האופליין תופעל לאחר רענון נוסף.'; }); host.querySelector('[data-offline-save]').onclick = function () { if (serviceWorkerRegistration) serviceWorkerRegistration.update(); showStatus('המסכים שביקרת בהם נשמרו לשימוש ללא אינטרנט.'); }; host.querySelector('[data-install-app]').onclick = function () { if (state.installPrompt) state.installPrompt.prompt(); else showStatus('בדפדפן בטלפון פתח את התפריט ובחר „הוספה למסך הבית”.', 'warning'); }; };
  handlers.expense = function () { closeHub(); location.hash = 'budget'; setTimeout(function () { var button = document.querySelector('[data-expense-toggle]'); if (button) button.click(); }, 250); };
  handlers.wallet = function () { var host = panel('ארנק הנסיעה', 'כל הכרטיסים, ההזמנות והביטוח נגישים דרך כספת המסמכים המאובטחת.', '<div class="smart-list"><article><i class="fa-solid fa-plane"></i><div><strong>טיסות וכרטיסי עלייה למטוס</strong><span>שמירה בכספת הטיול</span></div></article><article><i class="fa-solid fa-hotel"></i><div><strong>לינה והזמנות</strong><span>כתובת ואישור במקום אחד</span></div></article><article><i class="fa-solid fa-shield"></i><div><strong>ביטוח ומסמכי חירום</strong><span>גישה מהירה בזמן הצורך</span></div></article></div><div class="smart-actions"><button class="primary" type="button" data-wallet-docs>פתח את הכספת</button><button type="button" data-wallet-upload>העלה מסמך</button></div>'); host.querySelector('[data-wallet-docs]').onclick = function () { closeHub(); location.hash = 'documents'; }; host.querySelector('[data-wallet-upload]').onclick = function () { closeHub(); var button = document.querySelector('[data-vault-pick]'); if (button) button.click(); else location.hash = 'documents'; }; };
  handlers.share = function () { var host = panel('שיתוף הטיול', 'שלח את התוכנית למטיילים נוספים באמצעות תפריט השיתוף של הטלפון.', '<div class="smart-actions"><button class="primary" type="button" data-share-trip><i class="fa-solid fa-share-nodes"></i> שתף עכשיו</button><button type="button" data-copy-trip>העתק קישור</button></div>'); var data = { title: 'TravelMate · ' + state.trip.city, text: 'הטיול שלי ל' + state.trip.city + ', ' + state.trip.country, url: location.href }; host.querySelector('[data-share-trip]').onclick = function () { shareData(data); }; host.querySelector('[data-copy-trip]').onclick = function () { if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(function () { showStatus('הקישור הועתק.'); }); }; };
  handlers.safety = function () { var host = panel('מרכז הבטיחות', 'שיתוף מיקום מתבצע רק כשתלחץ ואינו נשמר באפליקציה.', '<div class="smart-actions"><button class="safe" type="button" data-safety-share><i class="fa-solid fa-location-dot"></i> שתף מיקום נוכחי</button><a class="danger" href="tel:112"><i class="fa-solid fa-phone"></i> חירום 112</a><button type="button" data-safety-ai>מידע חירום מקומי</button></div>'); host.querySelector('[data-safety-share]').onclick = async function () { try { var position = await getPosition(); shareData({ title: 'המיקום שלי', text: 'המיקום הנוכחי שלי במהלך הטיול ב' + state.trip.city, url: 'https://www.google.com/maps?q=' + position.latitude + ',' + position.longitude }); } catch (error) { showStatus('לא התקבלה הרשאת GPS. אפשר לאשר מיקום בהגדרות הדפדפן.', 'error'); } }; host.querySelector('[data-safety-ai]').onclick = function () { askAI('הכן לי דף חירום קצר ואמין למטייל ישראלי ב' + state.trip.city + ', ' + state.trip.country + ': מספרי חירום, שגרירות או נציגות ישראל, בית חולים מרכזי ומה לעשות במקרה של אובדן דרכון. בקש ממני לאמת מידע קריטי מול מקור רשמי.'); }; };

  function openTool(name) { var handler = handlers[name]; if (handler) handler(); }

  getTrip().then(function (trip) { state.trip = trip; createUi(); });
})();

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && !root.TravelMateSmartTripDecisions) root.TravelMateSmartTripDecisions = Object.freeze(api);
})(typeof window === 'undefined' ? null : window, function () {
  'use strict';

  // Pure, opt-in decision core. It does not read location, call providers or persist trips.
  function finite(value) {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    var number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  function minute(value) {
    var match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || ''));
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  }
  function clock(value) {
    var total = Math.max(0, Math.floor(value));
    return String(Math.floor(total / 60) % 24).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
  }
  function localDate(now) {
    return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
  }
  function mode(item, context) {
    if (context && typeof context.scheduleMode === 'function') return context.scheduleMode(item);
    var value = String(item && (item.scheduleMode || item.timingMode || item.flexibility) || '').toLowerCase();
    return /^(fixed|booked|reservation)$/.test(value) ? 'fixed' : /^(flexible|free)$/.test(value) ? 'flexible' : /^(window|time-window|time_window)$/.test(value) ? 'window' : 'planned';
  }
  function records(trip, date, context) {
    return (trip.activities || []).map(function (item) { return { kind: 'activity', record: item }; })
      .concat((trip.savedPlaces || []).map(function (item) { return { kind: 'place', record: item }; }))
      .filter(function (entry) { return entry.record && entry.record.done !== true && String(entry.record.date || '') === date && minute(entry.record.time) !== null; })
      .map(function (entry) { return { kind: entry.kind, record: entry.record, start: minute(entry.record.time), scheduleMode: mode(entry.record, context) }; })
      .sort(function (a, b) { return a.start - b.start || String(a.record.id || '').localeCompare(String(b.record.id || '')); });
  }
  function analyze(options) {
    options = options || {};
    var trip = options.trip;
    if (!trip || !trip.id) return Object.freeze({ date: '', recommendations: Object.freeze([]), alternatives: Object.freeze([]) });
    var now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
    if (!Number.isFinite(now.getTime())) return Object.freeze({ date: '', recommendations: Object.freeze([]), alternatives: Object.freeze([]) });
    var date = String(options.date || localDate(now)), current = now.getHours() * 60 + now.getMinutes();
    var context = options.context || {}, entries = records(trip, date, context), findings = [];
    var fixed = entries.filter(function (entry) { return entry.scheduleMode === 'fixed'; });
    function add(key, priority, title, reason, source, confidence, action, anchorId) {
      if (findings.some(function (item) { return item.key === key; })) return;
      findings.push(Object.freeze({
        key: key, priority: priority, title: title, reason: reason,
        provenance: source, confidence: confidence, anchorId: String(anchorId || ''),
        advisory: true, action: Object.freeze(action)
      }));
    }
    for (var i = 1; i < fixed.length; i += 1) {
      var previous = fixed[i - 1], next = fixed[i];
      if (previous.start + Math.max(0, finite(previous.record.duration) === null ? 60 : finite(previous.record.duration)) > next.start) {
        add('overlap:' + String(next.record.id), 100, 'שתי התחייבויות חופפות', 'הזמנים הקבועים בתוכנית חופפים. נדרש תיקון ידני; TravelMate לא ישנה הזמנות.', 'trip:explicit-fixed-times', 'high', { type: 'open-plan', href: '#plan' }, next.record.id);
      }
    }
    var nextFixed = fixed.find(function (entry) { return entry.start >= current; }) || null;
    if (nextFixed) {
      var route = options.routingById && options.routingById[String(nextFixed.record.id)] || null;
      var routeMinutes = finite(route && route.minutes);
      if (routeMinutes !== null && routeMinutes < 0) routeMinutes = null;
      var buffer = Math.max(0, finite(nextFixed.record.arrivalBufferMinutes) === null ? 10 : finite(nextFixed.record.arrivalBufferMinutes));
      if (routeMinutes !== null && routeMinutes >= 0 && nextFixed.start - current < routeMinutes + buffer) {
        add('late:' + String(nextFixed.record.id), 95, 'ייתכן איחור להתחייבות הקרובה', 'נשארו ' + Math.max(0, nextFixed.start - current) + ' דקות, לעומת ' + Math.round(routeMinutes + buffer) + ' דקות למעבר ולמרווח הגעה.', 'routing:' + String(route.source || 'estimate'), route.source === 'live' ? 'high' : 'medium', { type: 'open-plan', href: '#plan' }, nextFixed.record.id);
      }
      if (routeMinutes === null) {
        add('routing-unknown:' + String(nextFixed.record.id), 50, 'זמן ההגעה אינו ידוע כרגע', (options.offline === true ? 'אין מסלול זמין במצב לא מקוון. ' : 'זמן הדרך לא אומת. ') + 'לא ניתן לקבוע אם תספיק בזמן.', options.offline === true ? 'device:offline-no-route' : 'routing:unknown', 'low', { type: 'open-plan', href: '#plan' }, nextFixed.record.id);
      }
    }
    var opening = options.openingById || {};
    entries.forEach(function (entry) {
      if (entry.start < current - 15 || entry.start > current + 180) return;
      var evidence = opening[String(entry.record.id)];
      if (!evidence || !/^(closed|closing)$/.test(String(evidence.status || '')) || !evidence.source) return;
      add('opening:' + String(entry.record.id), 90, evidence.status === 'closed' ? 'המקום מסומן כסגור' : 'המקום עשוי להיסגר בקרוב', 'בדוק את שעות הפתיחה המעודכנות לפני היציאה. המידע עשוי להשתנות.', 'opening:' + String(evidence.source), 'medium', { type: 'open-plan', href: '#plan' }, entry.record.id);
    });
    var weather = options.weather || {}, weatherByKey = options.weatherByKey && typeof options.weatherByKey === 'object' ? options.weatherByKey : {};
    function wetWeather(evidence) {
      if (!evidence || evidence.ready !== true) return false;
      var code = finite(evidence.weatherCode), rain = finite(evidence.precipitationProbability);
      return (code !== null && ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95)) || (rain !== null && rain >= 60);
    }
    var outdoor = entries.find(function (entry) {
      return entry.start >= current && entry.start <= current + 180 && /^(parks|park|beaches|beach|viewpoints|viewpoint|hiking|trail)$/.test(String(entry.record.category || '').toLowerCase());
    });
    if (outdoor) {
      var weatherKey = outdoor.kind + ':' + String(outdoor.record.id), hourlyWeather = weatherByKey[weatherKey] || null;
      if (hourlyWeather && hourlyWeather.ready === true) {
        if (wetWeather(hourlyWeather)) add('weather:' + String(outdoor.record.id), 65, '???? ????? ????? ?????', '?????? ???? ??????? ?????? ?? ???. ?? ????? ????.', 'weather:' + String(hourlyWeather.source || 'hourly'), 'medium', { type: 'open-places', href: '#places' }, outdoor.record.id);
      } else if (outdoor.start <= current + 60 && wetWeather(weather)) {
        add('weather:' + String(outdoor.record.id), 65, '???? ????? ????? ?????', '???? ??? ?????? ???????? ??????? ?? ??? ???? ???????. ?? ????? ????.', 'weather:' + String(weather.source || 'current'), 'low', { type: 'open-places', href: '#places' }, outdoor.record.id);
      }
    }
    if (context && typeof context.transitionAssessmentsForDate === 'function') {
      var assessments = context.transitionAssessmentsForDate(trip, date, { bufferMinutes: 10 }) || {};
      var liveTransitions = options.transitionById && typeof options.transitionById === 'object' ? options.transitionById : {};
      Object.keys(assessments).forEach(function (key) {
        var assessment = assessments[key], live = liveTransitions[key];
        if (live && String(live.date || '') === date && live.source === 'live') assessment = live;
        if (!assessment || !assessment.risk) return;
        var destination = entries.find(function (entry) { return entry.kind + ':' + String(entry.record.id) === key; });
        if (!destination || destination.start < current || destination.start > current + 180) return;
        add('transition:' + key, 85, 'מרווח מעבר צפוף', 'המעבר בתוכנית קצר בכ־' + Math.round(assessment.shortfallMinutes || 0) + ' דקות מהנדרש לפי הנתונים הזמינים.', 'routing:' + String(assessment.source || 'estimate'), assessment.source === 'live' ? 'high' : 'medium', { type: 'open-plan', href: '#plan' }, destination.record.id);
      });
    }
    if (context && typeof context.freeTimeWindowsForDate === 'function') {
      var windows = context.freeTimeWindowsForDate(trip, date, { startTime: clock(current), endTime: '22:00', minimumMinutes: 45, bufferMinutes: 10 }) || [];
      var available = windows.find(function (window) { return finite(window.durationMinutes) !== null && window.durationMinutes >= 45; });
      if (available) add('free:' + String(available.startTime), 40, 'נפתח חלון זמן פנוי', 'יש כ־' + Math.round(available.durationMinutes) + ' דקות פנויות לפי התוכנית. אפשר לחפש מקום בלי להפעיל מסנן זמן.', 'trip:planned-window', 'medium', { type: 'open-places', href: '#places' }, '');
    }
    var alternatives = [], alternativeSeen = {};
    function movable(entry) { return entry && entry.kind === 'activity' && entry.record.done !== true && entry.start >= current && !/^(fixed|window)$/.test(entry.scheduleMode); }
    function cloneWithTime(entry, newTime) {
      return Object.assign({}, trip, { activities: (trip.activities || []).map(function (record) { return record === entry.record ? Object.assign({}, record, { time: newTime }) : record; }) });
    }
    function riskMap(candidate) {
      var map = {};
      if (!context || typeof context.transitionAssessmentsForDate !== 'function') return map;
      var source = context.transitionAssessmentsForDate(candidate, date, { bufferMinutes: 10 }) || {};
      Object.keys(source).forEach(function (key) { if (source[key] && source[key].risk) map[key] = true; });
      return map;
    }
    var baselineRisks = riskMap(trip);
    function collides(entry, newStart) {
      var duration = Math.max(1, finite(entry.record.duration) === null ? 60 : finite(entry.record.duration));
      var newEnd = newStart + duration;
      return entries.some(function (other) {
        if (other === entry) return false;
        var otherDuration = Math.max(1, finite(other.record.duration) === null ? 60 : finite(other.record.duration));
        return newStart < other.start + otherDuration && newEnd > other.start;
      });
    }
    function verifiedMove(entry, newStart, targetRiskKey) {
      if (!movable(entry) || !Number.isFinite(newStart) || newStart < current || newStart >= 1440 || collides(entry, newStart)) return null;
      var duration = Math.max(1, finite(entry.record.duration) === null ? 60 : finite(entry.record.duration));
      if (newStart + duration > 1440) return null;
      var newTime = clock(newStart);
      if (newTime === String(entry.record.time || '')) return null;
      var candidate = cloneWithTime(entry, newTime), after = riskMap(candidate);
      if (targetRiskKey && after[targetRiskKey]) return null;
      if (Object.keys(after).some(function (key) { return !baselineRisks[key]; })) return null;
      return newTime;
    }
    function offer(entry, newStart, reason, provenance, confidence, targetRiskKey) {
      if (alternatives.length >= 3) return;
      var newTime = verifiedMove(entry, newStart, targetRiskKey), key;
      if (!newTime) return;
      key = 'move:' + String(entry.record.id) + ':' + newTime;
      if (alternativeSeen[key]) return;
      alternativeSeen[key] = true;
      alternatives.push(Object.freeze({ key: key, kind: 'move-activity', activityId: String(entry.record.id), title: String(entry.record.title || entry.record.name || 'פעילות'), oldTime: String(entry.record.time), newTime: newTime, reason: reason, provenance: provenance, confidence: confidence, advisory: true }));
    }
    if (context && typeof context.transitionAssessmentsForDate === 'function') {
      var alternativeAssessments = context.transitionAssessmentsForDate(trip, date, { bufferMinutes: 10 }) || {};
      findings.filter(function (finding) { return finding.key.indexOf('transition:activity:') === 0; }).forEach(function (finding) {
        var transitionKey = finding.key.slice('transition:'.length), evidence = alternativeAssessments[transitionKey], liveEvidence = typeof liveTransitions === 'object' && liveTransitions && liveTransitions[transitionKey];
        if (liveEvidence && String(liveEvidence.date || '') === date && liveEvidence.source === 'live') evidence = liveEvidence;
        if (!evidence || !evidence.risk) return;
        var entry = entries.find(function (candidate) { return candidate.kind + ':' + String(candidate.record.id) === transitionKey; });
        var shortfall = Math.max(0, finite(evidence.shortfallMinutes) || 0), shift = Math.max(5, Math.ceil(shortfall / 5) * 5);
        if (entry) offer(entry, entry.start + shift, 'דחייה של ' + shift + ' דקות מפנה את מרווח המעבר החסר לפי הנתונים הזמינים.', finding.provenance, finding.confidence, transitionKey);
      });
    }
    (Array.isArray(windows) ? windows : []).forEach(function (window) {
      if (alternatives.length >= 3) return;
      var windowStart = minute(window.startTime), windowDuration = finite(window.durationMinutes), windowEnd = minute(window.endTime);
      if (windowStart === null) return;
      if (windowEnd === null && windowDuration !== null) windowEnd = windowStart + windowDuration;
      if (windowEnd === null) return;
      entries.filter(movable).forEach(function (entry) {
        if (alternatives.length >= 3) return;
        var duration = Math.max(1, finite(entry.record.duration) === null ? 60 : finite(entry.record.duration));
        var candidateStart = Math.max(windowStart, Math.ceil((current + 15) / 5) * 5);
        if (candidateStart + duration > windowEnd || Math.abs(candidateStart - entry.start) < 15) return;
        offer(entry, candidateStart, 'הפעילות יכולה לעבור לחלון פנוי בתוכנית בלי ליצור סיכון מעבר חדש. מזג האוויר ושעות הפתיחה לשעה החדשה עדיין דורשים אימות.', 'trip:planned-window', 'medium', '');
      });
    });
    findings.sort(function (a, b) { return b.priority - a.priority || a.key.localeCompare(b.key); });
    var top = Object.freeze(findings.slice(0, 3));
    return Object.freeze({ date: date, recommendations: top, alternatives: Object.freeze(alternatives.slice(0, 3)) });
  }
  function scheduleFingerprint(trip) { return JSON.stringify([trip.activities || [], trip.savedPlaces || []]); }
  function ensureTrip(trip, token) {
    if (!trip || String(trip.id) !== String(token.tripId) || String(trip.ownerId || '') !== String(token.ownerId || '')) throw new Error('SMART_TRIP_ACCOUNT_OR_TRIP_CHANGED');
  }
  function activity(trip, id) {
    var matches = (trip.activities || []).filter(function (item) { return item && String(item.id) === String(id); });
    return matches.length === 1 ? matches[0] : null;
  }
  function previewMove(trip, activityId, newTime, options) {
    options = options || {};
    if (!trip || !trip.id || (trip.ownerId && String(options.ownerId || '') !== String(trip.ownerId))) throw new Error('SMART_TRIP_ACCOUNT_OR_TRIP_CHANGED');
    var record = activity(trip, activityId);
    if (!record || record.done === true || /^(fixed|window)$/.test(mode(record, options.context))) throw new Error('SMART_TRIP_ACTIVITY_NOT_MOVABLE');
    if (minute(newTime) === null || minute(record.time) === null || String(newTime) === String(record.time)) throw new Error('SMART_TRIP_INVALID_TIME');
    return Object.freeze({ state: 'preview', tripId: String(trip.id), ownerId: String(trip.ownerId || ''), activityId: String(activityId), oldTime: String(record.time), newTime: String(newTime), fingerprint: JSON.stringify(record), scheduleFingerprint: scheduleFingerprint(trip) });
  }
  function confirmMove(preview) {
    if (!preview || preview.state !== 'preview') throw new Error('SMART_TRIP_CONFIRM_REQUIRED');
    return Object.freeze(Object.assign({}, preview, { state: 'confirmed' }));
  }
  function applyMove(trip, confirmed) {
    if (!confirmed || confirmed.state !== 'confirmed') throw new Error('SMART_TRIP_CONFIRM_REQUIRED');
    ensureTrip(trip, confirmed);
    var record = activity(trip, confirmed.activityId);
    if (scheduleFingerprint(trip) !== confirmed.scheduleFingerprint || !record || JSON.stringify(record) !== confirmed.fingerprint || mode(record) === 'fixed') throw new Error('SMART_TRIP_STALE_PREVIEW');
    var updated = Object.assign({}, record, { time: confirmed.newTime });
    var next = Object.assign({}, trip, { activities: trip.activities.map(function (item) { return item === record ? updated : item; }) });
    return Object.freeze({ state: 'applied', trip: next, undoToken: Object.freeze({ state: 'undoable', tripId: confirmed.tripId, ownerId: confirmed.ownerId, activityId: confirmed.activityId, oldTime: confirmed.oldTime, newTime: confirmed.newTime, fingerprint: JSON.stringify(updated), scheduleFingerprint: scheduleFingerprint(next) }) });
  }
  function undoMove(trip, token) {
    if (!token || token.state !== 'undoable') throw new Error('SMART_TRIP_UNDO_UNAVAILABLE');
    ensureTrip(trip, token);
    var record = activity(trip, token.activityId);
    if (scheduleFingerprint(trip) !== token.scheduleFingerprint || !record || JSON.stringify(record) !== token.fingerprint) throw new Error('SMART_TRIP_UNDO_CONFLICT');
    var restored = Object.assign({}, record, { time: token.oldTime });
    return Object.freeze({ state: 'undone', trip: Object.assign({}, trip, { activities: trip.activities.map(function (item) { return item === record ? restored : item; }) }) });
  }
  return Object.freeze({ analyze: analyze, previewMove: previewMove, confirmMove: confirmMove, applyMove: applyMove, undoMove: undoMove });
});

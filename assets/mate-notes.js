(function () {
  'use strict';
  if (window.TravelMateMateNotes) return;
  var generation = 0, accountId = activeAccount(), pageTripId = currentTripId();
  var ownerKnown = false, pageOwnerId = '', renderedSignature = null, renderedScope = null, suspended = false;
  var waitingForTrip = Boolean(window.travelMateTripReady && typeof window.travelMateTripReady.then === 'function');

  function activeAccount() { return String(localStorage.getItem('travelmate-active-user') || ''); }
  function currentTripId() { return String(new URLSearchParams(location.search).get('id') || document.body && document.body.dataset.tripId || ''); }
  function ownerId(trip) { return String(trip && trip.ownerId || ''); }
  function readTrips() {
    var store = window.TravelMateTripStore;
    if (store && store.getTrips) {
      try { var list = store.getTrips(); if (Array.isArray(list)) return list; } catch (error) {}
    }
    var cloud = window.TravelMateCloud;
    if (cloud && cloud.getLocalTrips) {
      try { var cached = cloud.getLocalTrips(); if (Array.isArray(cached)) return cached; } catch (error) {}
    }
    return [];
  }
  function syncScope() {
    var account = activeAccount(), id = currentTripId();
    if (account !== accountId || id !== pageTripId) {
      generation += 1;
      accountId = account; pageTripId = id;
      ownerKnown = false; pageOwnerId = ''; renderedSignature = null; waitingForTrip = false;
    }
  }
  function matches(id) {
    return readTrips().filter(function (trip) {
      return trip && String(trip.id) === String(id) && !trip.deletedAt && !trip.deletePending && (accountId || !ownerId(trip));
    });
  }
  function resolveTrip(id) {
    syncScope();
    if (suspended || !id) return null;
    if (String(id) === pageTripId && waitingForTrip) return null;
    var list = matches(id);
    if (String(id) === pageTripId && ownerKnown) return list.find(function (trip) { return ownerId(trip) === pageOwnerId; }) || null;
    // Never choose a different owner merely because the cache order changed.
    if (list.length !== 1) return null;
    if (String(id) === pageTripId) { ownerKnown = true; pageOwnerId = ownerId(list[0]); }
    return list[0];
  }
  function capture(id) {
    var trip = resolveTrip(id);
    return trip ? Object.freeze({ accountId: accountId, generation: generation, pageTripId: pageTripId, tripId: String(trip.id), ownerId: ownerId(trip) }) : null;
  }
  function valid(scope) {
    syncScope();
    return Boolean(scope && !suspended && scope.accountId === accountId && scope.generation === generation && scope.pageTripId === pageTripId);
  }
  function scopedTrip(scope) {
    if (!valid(scope)) return null;
    return matches(scope.tripId).find(function (trip) { return ownerId(trip) === scope.ownerId; }) || null;
  }
  function update(id, updater, expectedScope) {
    var scope = expectedScope === undefined ? capture(id) : expectedScope;
    if (!scope || String(id) !== scope.tripId || typeof updater !== 'function') return false;
    var current = scopedTrip(scope);
    if (!current) return false;
    var baseline = JSON.stringify(current);
    var draft = Object.assign({}, current, { aiNotes: Array.isArray(current.aiNotes) ? current.aiNotes.map(function (note) { return Object.assign({}, note); }) : [] });
    if (updater(draft) !== true) return false;
    // Reject re-entrant account/canonical changes before saving only the notes delta.
    var latest = scopedTrip(scope);
    if (!latest || JSON.stringify(latest) !== baseline) return false;
    // The canonical upsert treats missing owners as legacy wildcards. Do not
    // let that fallback redirect this exact-owner operation to another record.
    var target = readTrips().find(function (trip) {
      return trip && String(trip.id) === scope.tripId && (!ownerId(trip) || !scope.ownerId || ownerId(trip) === scope.ownerId);
    });
    if (!target || ownerId(target) !== scope.ownerId) return false;
    var next = Object.assign({}, latest, { aiNotes: draft.aiNotes });
    var store = window.TravelMateTripStore, cloud = window.TravelMateCloud;
    if (store && store.saveTrip) store.saveTrip(next);
    else if (cloud && cloud.upsertLocalTrip) {
      cloud.upsertLocalTrip(next);
      if (cloud.queueTripSave) cloud.queueTripSave(next);
    } else return false;
    render();
    return true;
  }

  function escapeText(value) { return String(value || '').replace(/[&<>"']/g, function (character) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]; }); }

  function decodeTextEntities(content) {
    var named = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };
    return String(content || '')
      .replace(/&(amp|quot|apos|lt|gt);/gi, function (match, name) { return named[name.toLowerCase()]; })
      .replace(/&#(x[0-9a-f]+|\d+);/gi, function (match, value) {
        var code = /^x/i.test(value) ? parseInt(value.slice(1), 16) : parseInt(value, 10);
        try { return code >= 0 && code <= 1114111 ? String.fromCodePoint(code) : match; } catch (error) { return match; }
      });
  }

  function formatAssistantText(content) {
    var lines = decodeTextEntities(content).replace(/\r\n?/g, '\n').split('\n');
    var html = [];
    var listOpen = false;
    function inline(value) {
      return escapeText(value)
        .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
        .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    }
    function closeList() { if (listOpen) { html.push('</ul>'); listOpen = false; } }
    lines.forEach(function (line) {
      var heading = line.match(/^#{1,3}\s+(.+)$/);
      var bullet = line.match(/^\s*[-*\u2022]\s+(.+)$/);
      if (bullet) {
        if (!listOpen) { html.push('<ul>'); listOpen = true; }
        html.push('<li>' + inline(bullet[1]) + '</li>');
      } else if (heading) {
        closeList(); html.push('<h3>' + inline(heading[1]) + '</h3>');
      } else if (line.trim()) {
        closeList(); html.push('<p>' + inline(line) + '</p>');
      } else closeList();
    });
    closeList();
    return html.join('');
  }

  function render() {
    syncScope();
    var documents = document.getElementById('documents');
    if (!documents || suspended) return;
    if (!pageTripId) {
      var obsolete = documents.querySelector('[data-ai-notes-archive]');
      if (obsolete) obsolete.remove();
      renderedSignature = null; renderedScope = null;
      return;
    }
    var trip = resolveTrip(pageTripId);
    var notes = trip && Array.isArray(trip.aiNotes) ? trip.aiNotes : [];
    var scope = trip ? capture(pageTripId) : null;
    var archive = documents.querySelector('[data-ai-notes-archive]');
    if (!archive) {
      archive = document.createElement('article');
      archive.className = 'ai-notes-archive';
      archive.dataset.aiNotesArchive = '';
      archive.dataset.documentGroup = 'mate';
      var host = documents.querySelector('.vault-library') || documents.querySelector('.doc-list') || documents;
      host.parentNode.insertBefore(archive, host.nextSibling);
      renderedSignature = null; renderedScope = null;
    }
    var scopeKey = JSON.stringify([accountId, generation, pageTripId, trip && ownerId(trip)]);
    var signature = JSON.stringify([scopeKey, notes]);
    if (signature !== renderedSignature) {
      var open = renderedScope === scopeKey ? Array.from(archive.querySelectorAll('details[open][data-ai-note-id]')).map(function (row) { return row.dataset.aiNoteId; }) : [];
      var focused = document.activeElement, focusedRow = focused && focused.closest && focused.closest('[data-ai-note-id]');
      var focusId = renderedScope === scopeKey && focusedRow && archive.contains(focusedRow) ? focusedRow.dataset.aiNoteId : null;
      var focusSelector = focused && focused.matches('[data-delete-ai-note]') ? '[data-delete-ai-note]' : focused && focused.matches('[data-copy-ai-note]') ? '[data-copy-ai-note]' : 'summary';
    archive.innerHTML = '<header><span><i class="fa-solid fa-compass"></i></span><div><small>Mate \u00b7 \u05e0\u05d2\u05d9\u05e9 \u05ea\u05de\u05d9\u05d3 \u05d5\u05dc\u05dc\u05d0 \u05db\u05e1\u05e4\u05ea</small><h3>\u05e9\u05d0\u05dc\u05d5\u05ea \u05d5\u05ea\u05e9\u05d5\u05d1\u05d5\u05ea \u05e9\u05de\u05d5\u05e8\u05d5\u05ea</h3><p>\u05e0\u05e9\u05de\u05e8 \u05d1\u05e0\u05e4\u05e8\u05d3 \u05de\u05d4\u05de\u05e1\u05de\u05db\u05d9\u05dd \u05d4\u05de\u05d5\u05e6\u05e4\u05e0\u05d9\u05dd. \u05db\u05dc \u05e9\u05d5\u05e8\u05d4 \u05e0\u05e4\u05ea\u05d7\u05ea \u05d5\u05e0\u05e1\u05d2\u05e8\u05ea \u05d1\u05dc\u05d7\u05d9\u05e6\u05d4.</p></div><b>' + notes.length + '</b></header><div class="ai-notes-list">' +
      (notes.length ? notes.map(function (note, index) {
        var kindLabel = note.type === 'navo-recommendation' ? 'המלצה ' : 'שאלה ';
        var subtitle = note.subtitle ? '<small class="ai-note-subtitle">' + escapeText(note.subtitle) + '</small>' : '';
        return '<details data-ai-note-id="' + escapeText(note.id) + '"><summary><span><small>' + kindLabel + (index + 1) + '</small><strong>' + escapeText(note.question) + '</strong>' + subtitle + '<small>' + new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(note.createdAt)) + '</small></span><b class="ai-note-toggle"><span>\u05e4\u05ea\u05d9\u05d7\u05d4</span><i class="fa-solid fa-chevron-down"></i></b></summary><div class="ai-note-answer">' + formatAssistantText(note.answer) + '</div><footer><button type="button" data-copy-ai-note><i class="fa-regular fa-copy"></i> \u05d4\u05e2\u05ea\u05e7\u05d4</button><button type="button" data-delete-ai-note><i class="fa-regular fa-trash-can"></i> \u05de\u05d7\u05d9\u05e7\u05d4</button></footer></details>';
      }).join('') : '<div class="ai-notes-empty"><i class="fa-regular fa-bookmark"></i><span>\u05e2\u05d3\u05d9\u05d9\u05df \u05dc\u05d0 \u05e9\u05de\u05e8\u05ea \u05ea\u05e9\u05d5\u05d1\u05d5\u05ea. \u05dc\u05d7\u05e5 \u201e\u05e9\u05de\u05d5\u05e8 \u05d1\u05de\u05e1\u05de\u05db\u05d9\u05dd\u201c \u05de\u05ea\u05d7\u05ea \u05dc\u05ea\u05e9\u05d5\u05d1\u05d4 \u05e9\u05dc Mate.</span></div>') + '</div>';
      archive.querySelectorAll('[data-ai-note-id]').forEach(function (row) {
        row.open = open.indexOf(row.dataset.aiNoteId) >= 0;
        if (focusId === row.dataset.aiNoteId) { var target = row.querySelector(focusSelector); if (target) target.focus(); }
      });
      renderedSignature = signature; renderedScope = scopeKey;
    }
    archive.onclick = function (event) {
      var row = event.target.closest('[data-ai-note-id]');
      if (!row || !archive.contains(row)) return;
      var latest = scopedTrip(scope);
      var note = latest && Array.isArray(latest.aiNotes) && latest.aiNotes.find(function (item) { return String(item.id) === row.dataset.aiNoteId; });
      if (!note) return;
      if (event.target.closest('[data-copy-ai-note]')) navigator.clipboard && navigator.clipboard.writeText(note.question + '\n\n' + note.answer);
      if (event.target.closest('[data-delete-ai-note]')) {
        update(scope.tripId, function (draft) {
          var remaining = draft.aiNotes.filter(function (item) { return String(item.id) !== row.dataset.aiNoteId; });
          if (remaining.length === draft.aiNotes.length) return false;
          draft.aiNotes = remaining;
          return true;
        }, scope);
      }
    };
    if (window.TravelMateDocuments && typeof window.TravelMateDocuments.refresh === 'function') window.TravelMateDocuments.refresh();
  }

  window.TravelMateMateNotes = Object.freeze({ refresh: render, getTrip: resolveTrip, capture: capture, update: update, formatResponse: formatAssistantText });
  ['travelmate:local-trips-updated', 'travelmate:trip-cloud-refreshed', 'travelmate:trip-synced', 'travelmate:trip-write-forbidden', 'travelmate:account-context-changed', 'travelmate:viewchange', 'travelmate:feature-ready'].forEach(function (name) { window.addEventListener(name, render); });
  window.addEventListener('pagehide', function () { suspended = true; generation += 1; });
  window.addEventListener('pageshow', function () { suspended = false; syncScope(); if (waitingForTrip) observeTripReady(); render(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render, { once: true });
  else render();
  function observeTripReady() {
    var readyAccount = accountId, readyGeneration = generation, readyTripId = pageTripId;
    Promise.resolve(window.travelMateTripReady).then(function (trip) {
      syncScope();
      if (suspended || accountId !== readyAccount || generation !== readyGeneration || pageTripId !== readyTripId) return;
      waitingForTrip = false;
      if (trip && String(trip.id) === pageTripId && matches(pageTripId).some(function (current) { return ownerId(current) === ownerId(trip); })) { ownerKnown = true; pageOwnerId = ownerId(trip); }
      render();
    }).catch(function () {
      syncScope();
      if (accountId === readyAccount && generation === readyGeneration && pageTripId === readyTripId) waitingForTrip = false;
      render();
    });
  }
  if (waitingForTrip) observeTripReady();
})();

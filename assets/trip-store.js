(function () {
  'use strict';

  if (window.TravelMateTripStore) return;

  var STORAGE_KEY = 'travelmate-trips';

  function cloud() {
    return window.TravelMateCloud || null;
  }

  function fallbackTrips() {
    try {
      var value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (error) {
      return [];
    }
  }

  function trips() {
    var service = cloud();
    if (service && typeof service.getLocalTrips === 'function') {
      try {
        var value = service.getLocalTrips();
        if (Array.isArray(value)) return value;
      } catch (error) {}
    }
    return fallbackTrips();
  }

  function sameTrip(left, rightId, rightOwnerId) {
    if (!left || String(left.id) !== String(rightId)) return false;
    if (!rightOwnerId || !left.ownerId) return true;
    return String(left.ownerId) === String(rightOwnerId);
  }

  function getTrip(id, ownerId) {
    if (id == null) return null;
    var matches = trips().filter(function (trip) {
      return sameTrip(trip, id, ownerId);
    });
    if (!matches.length) return null;
    if (ownerId) {
      var exact = matches.find(function (trip) {
        return String(trip.ownerId || '') === String(ownerId);
      });
      if (exact) return exact;
    }
    return matches[0];
  }

  function fallbackUpsert(trip) {
    var list = fallbackTrips();
    var index = list.findIndex(function (item) {
      return sameTrip(item, trip.id, trip.ownerId);
    });
    if (index === -1) list.push(trip);
    else list[index] = trip;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('travelmate:local-trips-updated', { detail: list }));
    return trip;
  }

  function saveTrip(trip, options) {
    if (!trip || trip.id == null) return null;
    options = options || {};
    var service = cloud();
    if (service && typeof service.upsertLocalTrip === 'function') service.upsertLocalTrip(trip);
    else fallbackUpsert(trip);
    if (options.queue !== false && service && typeof service.queueTripSave === 'function') {
      service.queueTripSave(trip, options.delay);
    }
    return trip;
  }

  function updateTrip(id, updater, options) {
    options = options || {};
    var current = getTrip(id, options.ownerId);
    if (!current) return null;
    var draft = Object.assign({}, current);
    var next = typeof updater === 'function' ? updater(draft, current) : draft;
    if (next === false || next == null) return next === false ? current : null;
    if (typeof next !== 'object') next = draft;
    if (next.id == null) next.id = current.id;
    return saveTrip(next, options);
  }

  function copy(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function equal(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
  // Apply only the user's delta; canonical changes to untouched fields survive.
  function mergeChanges(latest, before, after) {
    if (equal(before, after)) return copy(latest);
    if (before == null && after && typeof after === 'object') before = Array.isArray(after) ? [] : {};
    if (Array.isArray(before) && Array.isArray(after) && before.concat(after).every(function (item) { return item && item.id != null; })) {
      var result = copy(Array.isArray(latest) ? latest : []);
      before.forEach(function (old) {
        var changed = after.find(function (item) { return String(item.id) === String(old.id); });
        var index = result.findIndex(function (item) { return String(item.id) === String(old.id); });
        if (!changed && index >= 0) result.splice(index, 1);
        else if (changed && index >= 0) result[index] = mergeChanges(result[index], old, changed);
      });
      after.forEach(function (item) {
        if (!before.some(function (old) { return String(old.id) === String(item.id); }) && !result.some(function (current) { return String(current.id) === String(item.id); })) result.push(copy(item));
      });
      return result;
    }
    if (before && after && !Array.isArray(before) && !Array.isArray(after) && typeof before === 'object' && typeof after === 'object') {
      var result = copy(latest && typeof latest === 'object' ? latest : {});
      Array.from(new Set(Object.keys(before).concat(Object.keys(after)))).forEach(function (key) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype' || equal(before[key], after[key])) return;
        if (!Object.prototype.hasOwnProperty.call(after, key)) delete result[key];
        else result[key] = mergeChanges(result[key], before[key], after[key]);
      });
      return result;
    }
    return copy(after);
  }
  function saveTripFields(trip, baseline, fields, options) {
    options = options || {};
    var allowed = ['activities', 'savedPlaces', 'dayNotes', 'dayModes', 'planInitialized', 'budget', 'budgetFx', 'budgetUnlimited', 'expenses', 'budgetCategories', 'memories', 'photoAlbumUrl', 'currencyFee', 'secondaryCurrency'];
    if (!Array.isArray(fields) || fields.some(function (field) { return allowed.indexOf(field) < 0; })) throw new Error('INVALID_TRIP_FIELD');
    if (!trip || !baseline || String(trip.id) !== String(baseline.id) || String(trip.ownerId || '') !== String(baseline.ownerId || '')) return null;
    if (options.userId === undefined || String(options.userId) !== String(localStorage.getItem('travelmate-active-user') || '')) return null;
    var current = getTrip(trip.id, baseline.ownerId);
    if (!current || String(current.ownerId || '') !== String(baseline.ownerId || '')) return null;
    var next = copy(current), changed = false;
    fields.forEach(function (field) {
      if (equal(baseline[field], trip[field])) return;
      changed = true;
      if (!Object.prototype.hasOwnProperty.call(trip, field)) delete next[field];
      else next[field] = mergeChanges(current[field], baseline[field], trip[field]);
    });
    return changed ? saveTrip(next, options) : copy(current);
  }

  function removeTrip(id, ownerId) {
    var service = cloud();
    if (service && typeof service.removeLocalTrip === 'function') return service.removeLocalTrip(id, ownerId);
    var list = fallbackTrips().filter(function (trip) {
      return !sameTrip(trip, id, ownerId);
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('travelmate:local-trips-updated', { detail: list }));
    return list;
  }

  function conflicts() {
    return trips().filter(function (trip) {
      return trip && String(trip.syncStatus || '') === 'conflict';
    });
  }

  function resolveConflict(id, strategy, ownerId) {
    var service = cloud();
    if (!service || typeof service.resolveTripConflict !== 'function') {
      return Promise.reject(new Error('SYNC_CONFLICT_RESOLUTION_UNAVAILABLE'));
    }
    return service.resolveTripConflict(id, ownerId, strategy);
  }

  window.TravelMateTripStore = Object.freeze({
    getTrips: trips,
    getTrip: getTrip,
    saveTrip: saveTrip,
    updateTrip: updateTrip,
    saveTripFields: saveTripFields,
    removeTrip: removeTrip,
    getConflicts: conflicts,
    resolveConflict: resolveConflict
  });
})();

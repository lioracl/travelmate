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

  window.TravelMateTripStore = Object.freeze({
    getTrips: trips,
    getTrip: getTrip,
    saveTrip: saveTrip,
    updateTrip: updateTrip,
    removeTrip: removeTrip
  });
})();

(function () {
  'use strict';

  if (window.TravelMateEvents) return;

  var NAMES = Object.freeze({
    viewChange: 'travelmate:viewchange',
    placesUpdated: 'travelmate:places-updated',
    activitiesUpdated: 'travelmate:activities-updated',
    askAi: 'travelmate:ask-ai'
  });

  function text(value) {
    return value == null ? '' : String(value).trim();
  }

  function objectOrNull(value) {
    return value && typeof value === 'object' ? value : null;
  }

  function normalize(name, detail) {
    detail = detail && typeof detail === 'object' ? detail : {};
    if (name === NAMES.viewChange) {
      return {
        view: text(detail.view) || 'overview',
        previousView: text(detail.previousView),
        source: text(detail.source) || 'navigation'
      };
    }
    if (name === NAMES.placesUpdated) {
      return {
        tripId: text(detail.tripId),
        placeId: text(detail.placeId),
        action: text(detail.action) || (detail.cleared ? 'cleared' : 'updated'),
        cleared: detail.cleared === true,
        source: text(detail.source) || 'places'
      };
    }
    if (name === NAMES.activitiesUpdated) {
      return {
        tripId: text(detail.tripId),
        activityId: text(detail.activityId),
        action: text(detail.action) || 'updated',
        source: text(detail.source) || 'planner'
      };
    }
    if (name === NAMES.askAi) {
      return {
        prompt: text(detail.prompt),
        context: objectOrNull(detail.context),
        source: text(detail.source) || 'unknown'
      };
    }
    return Object.assign({}, detail);
  }

  function targetFor(name) {
    return name === NAMES.viewChange || name === NAMES.askAi ? window : document;
  }

  function emit(name, detail) {
    var normalized = normalize(name, detail);
    targetFor(name).dispatchEvent(new CustomEvent(name, { detail: normalized }));
    return normalized;
  }

  function on(name, handler, options) {
    var target = targetFor(name);
    target.addEventListener(name, handler, options);
    return function () { target.removeEventListener(name, handler, options); };
  }

  window.TravelMateEvents = Object.freeze({
    names: NAMES,
    normalize: normalize,
    emit: emit,
    on: on
  });
})();

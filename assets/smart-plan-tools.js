(function () {
  'use strict';

  function getTrip() {
    var id = new URLSearchParams(location.search).get('id');
    try {
      return JSON.parse(localStorage.getItem('travelmate-trips') || '[]').find(function (trip) {
        return String(trip.id) === String(id);
      });
    } catch (error) { return null; }
  }

  function dateAt(index, trip) {
    var start = new Date(trip.start + 'T12:00:00');
    return new Date(start.getTime() + index * 86400000).toISOString().slice(0, 10);
  }

  function enhance() {
    var trip = getTrip();
    if (!trip) return;
    document.querySelectorAll('[data-generated-days] .generated-day').forEach(function (day, index) {
      var heading = day.querySelector('.day-heading');
      if (!heading) return;
      var actions = heading.querySelector('.day-heading-actions');
      if (!actions) {
        actions = document.createElement('span');
        actions.className = 'day-heading-actions';
        var add = heading.querySelector('.day-add');
        if (add) { add.parentNode.insertBefore(actions, add); actions.appendChild(add); }
        else heading.appendChild(actions);
      }
      if (!actions.querySelector('[data-smart-replace-day]')) {
        var dayButton = document.createElement('button');
        dayButton.type = 'button';
        dayButton.className = 'day-replace';
        dayButton.dataset.smartReplaceDay = dateAt(index, trip);
        dayButton.innerHTML = '<i class="fa-solid fa-rotate"></i><span>החלף יום</span>';
        actions.insertBefore(dayButton, actions.firstChild);
      }
    });
    document.querySelectorAll('.planned-activity[data-activity-id]').forEach(function (row) {
      var actions = row.querySelector('.activity-buttons');
      if (!actions || actions.querySelector('[data-smart-replace-activity]')) return;
      var button = document.createElement('button');
      button.type = 'button';
      button.dataset.smartReplaceActivity = row.dataset.activityId;
      button.title = 'החלפת הפעילות במקום אחר';
      button.innerHTML = '<i class="fa-solid fa-rotate"></i>';
      actions.insertBefore(button, actions.querySelector('[data-delete]'));
    });
    document.querySelectorAll('.saved-place[data-saved-place-id]').forEach(function (row) {
      var actions = row.querySelector('.saved-place-actions');
      if (!actions || actions.querySelector('[data-smart-replace-place]')) return;
      var button = document.createElement('button');
      button.type = 'button';
      button.dataset.smartReplacePlace = row.dataset.savedPlaceId;
      button.title = 'החלפת המקום אוטומטית';
      button.innerHTML = '<i class="fa-solid fa-rotate"></i>';
      actions.insertBefore(button, actions.lastElementChild);
    });
  }

  function refreshActivityRows() {
    var trip = getTrip();
    if (!trip) return;
    (trip.activities || []).forEach(function (activity) {
      var row = document.querySelector('.planned-activity[data-activity-id="' + CSS.escape(activity.id) + '"]');
      if (!row) return;
      var title = row.querySelector('.activity-copy strong');
      var details = row.querySelector('.activity-copy small');
      if (title) title.textContent = activity.title;
      if (details) details.textContent = (activity.category || 'פעילות') + ' · ' + (activity.duration || 60) + ' דק׳';
    });
    enhance();
  }

  document.addEventListener('click', function (event) {
    var day = event.target.closest('[data-smart-replace-day]');
    if (day && window.TravelMateAutoPlaces) {
      window.TravelMateAutoPlaces.replaceDay(day.dataset.smartReplaceDay);
      return;
    }
    var activity = event.target.closest('[data-smart-replace-activity]');
    if (activity && window.TravelMateAutoPlaces) {
      window.TravelMateAutoPlaces.replaceActivity(activity.dataset.smartReplaceActivity);
      return;
    }
    var place = event.target.closest('[data-smart-replace-place]');
    if (place && window.TravelMateAutoPlaces) {
      window.TravelMateAutoPlaces.replace(place.dataset.smartReplacePlace);
    }
  });

  document.addEventListener('travelmate:planner-rendered', enhance);
  document.addEventListener('travelmate:activities-updated', refreshActivityRows);
  document.addEventListener('travelmate:auto-activity-replacing', function (event) {
    var button = document.querySelector('[data-smart-replace-activity="' + CSS.escape(event.detail.id) + '"]');
    if (!button) return;
    button.classList.toggle('loading', !!event.detail.loading);
    button.disabled = !!event.detail.loading;
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhance);
  else enhance();
})();

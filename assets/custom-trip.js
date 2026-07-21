(function () {
  'use strict';

  var tripId = new URLSearchParams(location.search).get('id');
  var cloud = window.TravelMateCloud;

  window.travelMateTripReady = (async function () {
    var trip = null;
    if (cloud && tripId) {
      try {
        var invitedOwnerId = null;
        var inviteToken = new URLSearchParams(location.search).get('invite');
        if (inviteToken) {
          var invitation = await cloud.acceptTripInvite(inviteToken);
          if (!invitation.accepted && invitation.reason === 'SIGNED_OUT') {
            sessionStorage.setItem('travelmate-pending-invite', location.href);
          } else if (invitation.accepted) {
            invitedOwnerId = invitation.trip && invitation.trip.owner_id;
            var cleanUrl = new URL(location.href);
            cleanUrl.searchParams.delete('invite');
            history.replaceState({}, '', cleanUrl.href);
            window.dispatchEvent(new CustomEvent('travelmate:invite-accepted'));
          }
        }
        trip = await cloud.getTrip(tripId, invitedOwnerId);
      }
      catch (error) {
        console.error('TravelMate cloud trip load failed', error);
        trip = cloud.getLocalTrips().find(function (item) { return String(item.id) === String(tripId); }) || null;
      }
    }
    if (!trip) {
      try {
        trip = JSON.parse(localStorage.getItem('travelmate-trips') || '[]').find(function (item) { return String(item.id) === String(tripId); }) || null;
      } catch (error) {}
    }
    if (!trip) {
      location.replace('../../index.html');
      return null;
    }
    renderTrip(trip);
    return trip;
  })();

  function renderTrip(trip) {
    function text(selector, value) { document.querySelectorAll(selector).forEach(function (node) { node.textContent = value; }); }
    function format(value) { return new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value + 'T12:00:00')); }
    document.title = trip.city + ', ' + trip.country + ' - TravelMate';
    if (window.TravelMateDestinationImages) window.TravelMateDestinationImages.apply(document.querySelector('.custom-hero'), trip.city, trip.country);
    text('[data-city]', trip.city);
    text('[data-country]', trip.country);
    text('[data-days]', trip.days);
    text('[data-type]', trip.type);
    text('[data-budget]', Number(trip.budget).toLocaleString('he-IL'));
    text('[data-dates]', format(trip.start) + ' – ' + format(trip.end));
    var query = encodeURIComponent(trip.city + ', ' + trip.country);
    document.querySelectorAll('[data-maps]').forEach(function (link) { link.href = 'https://www.google.com/maps/search/?api=1&query=' + query; });
    document.querySelector('[data-wiki]').href = 'https://he.wikipedia.org/wiki/Special:Search?search=' + query;
    document.querySelector('[data-tourism]').href = 'https://www.google.com/search?q=' + encodeURIComponent('official tourism ' + trip.city + ' ' + trip.country);
    document.querySelectorAll('[data-search]').forEach(function (link) { link.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(link.dataset.search + ' ' + trip.city + ' ' + trip.country); });
    var themes = ['היכרות עם מרכז העיר והסביבה', 'אתרי החובה והתרבות המקומית', 'שכונות, אוכל ושווקים', 'טבע, פארקים ונקודות תצפית', 'יום גמיש להמלצות שהתגלו בדרך'];
    var start = new Date(trip.start + 'T12:00:00');
    var days = document.querySelector('[data-generated-days]');
    days.innerHTML = '';
    for (var index = 0; index < trip.days; index += 1) {
      var date = new Date(start.getTime() + index * 86400000);
      var article = document.createElement('article');
      article.className = 'generated-day';
      article.innerHTML = '<span class="badge">יום ' + (index + 1) + '</span><div><strong>' + new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }).format(date) + '</strong><p>' + (index === 0 ? 'הגעה, התמקמות וסיור קל ליד מקום הלינה' : index === trip.days - 1 ? 'בוקר חופשי, השלמות ויציאה לשדה התעופה' : themes[(index - 1) % themes.length]) + '</p></div>';
      days.appendChild(article);
    }
    var splits = [['לינה', .4], ['אוכל', .22], ['תחבורה', .15], ['אטרקציות', .13], ['רזרבה', .1]];
    var expenses = document.querySelector('[data-expenses]');
    expenses.innerHTML = '';
    splits.forEach(function (item) {
      var amount = Math.round(trip.budget * item[1]);
      var article = document.createElement('article');
      article.className = 'expense';
      article.innerHTML = '<div><strong>' + item[0] + '</strong><span>€' + amount.toLocaleString('he-IL') + '</span></div><div class="progress"><i style="width:' + (item[1] * 100) + '%"></i></div>';
      expenses.appendChild(article);
    });
  }
})();

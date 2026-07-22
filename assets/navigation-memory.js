(function () {
  'use strict';

  var workspace = document.querySelector('.workspace');
  if (!workspace || !document.querySelector('main.content')) return;

  var baseUrl = new URL(location.href);
  baseUrl.hash = '';
  baseUrl.searchParams.delete('invite');
  var requestedHash = location.hash || '#overview';
  var lastKnownSection = requestedHash.replace(/^#/, '') || 'overview';
  try { sessionStorage.setItem('travelmate-last-trip-url', baseUrl.href); } catch (error) {}

  function sectionId() { return location.hash.replace(/^#/, '') || 'overview'; }
  function closeOverlays() {
    document.querySelectorAll('.modal-backdrop.open').forEach(function (modal) { modal.classList.remove('open'); });
    document.body.classList.remove('mobile-menu-open');
  }
  function updateExitButtons() {
    document.querySelectorAll('.mobile-back,.hero-back').forEach(function (button) {
      if (!button.dataset.tripExitHref) button.dataset.tripExitHref = button.getAttribute('href') || '../../index.html';
      button.setAttribute('href', button.dataset.tripExitHref);
      button.setAttribute('aria-label', 'חזרה לכל הטיולים');
      if (button.classList.contains('hero-back')) button.innerHTML = '<i class="fa-solid fa-arrow-right"></i> כל הטיולים';
    });
  }
  function scrollToCurrent() {
    var target = document.getElementById(sectionId()) || document.getElementById('overview');
    if (target) requestAnimationFrame(function () { target.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    updateExitButtons();
  }
  function pushSection(id, from) {
    var nextState = { travelMateTrip: true, travelMateAction: id, travelMateFrom: from || sectionId() };
    if (history.state && history.state.travelMateAction) history.replaceState(nextState, '', baseUrl.href + '#' + id);
    else history.pushState(nextState, '', baseUrl.href + '#' + id);
    lastKnownSection = id;
    scrollToCurrent();
  }
  function returnToTrip() {
    closeOverlays();
    if (history.state && (history.state.travelMateAction || history.state.travelMateModal || history.state.travelMateOverlay)) {
      history.back();
      return;
    }
    history.replaceState({ travelMateTrip: true, travelMateOverview: true }, '', baseUrl.href + '#overview');
    lastKnownSection = 'overview';
    scrollToCurrent();
  }
  function addSectionBackButtons() {
    document.querySelectorAll('main.content .section[id]:not(#overview)').forEach(function (section) {
      var head = section.querySelector(':scope > .section-head');
      if (!head || head.querySelector('.trip-action-back')) return;
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'trip-action-back';
      button.innerHTML = '<i class="fa-solid fa-arrow-right"></i><span>חזרה לטיול</span>';
      button.setAttribute('aria-label', 'חזרה למסך הקודם בטיול');
      head.appendChild(button);
    });
  }

  // A protected entry sits behind the trip overview. Device Back can reach it,
  // but the popstate handler immediately restores the current trip instead of
  // allowing the browser to leave it. Only the visible top arrow exits the trip.
  history.replaceState({ travelMateTripGuard: true }, '', baseUrl.href + '#overview');
  history.pushState({ travelMateTrip: true, travelMateOverview: true }, '', baseUrl.href + '#overview');
  if (requestedHash !== '#overview') pushSection(requestedHash.slice(1), 'overview');

  document.addEventListener('click', function (event) {
    var exitButton = event.target.closest('.mobile-back,.hero-back');
    var sectionLink = exitButton ? null : event.target.closest('a[href^="#"]');
    if (sectionLink && sectionLink.getAttribute('href').length > 1) {
      var id = sectionLink.getAttribute('href').slice(1);
      if (document.getElementById(id)) {
        event.preventDefault();
        if (id !== sectionId()) pushSection(id, sectionId());
        closeOverlays();
        return;
      }
    }

    if (event.target.closest('.trip-action-back')) {
      event.preventDefault();
      returnToTrip();
      return;
    }

    var modalTrigger = event.target.closest('[data-modal]');
    if (modalTrigger && !(history.state && history.state.travelMateModal)) {
      history.pushState({ travelMateTrip: true, travelMateModal: modalTrigger.dataset.modal }, '', location.href);
      return;
    }
    if ((event.target.closest('[data-close]') || event.target.classList.contains('modal-backdrop')) && history.state && history.state.travelMateModal) {
      event.preventDefault();
      event.stopImmediatePropagation();
      history.back();
    }
  }, true);

  window.addEventListener('hashchange', function () {
    var id = sectionId();
    if (!(history.state && (history.state.travelMateTrip || history.state.travelMateTripGuard))) {
      history.replaceState({ travelMateTrip: true, travelMateAction: id, travelMateFrom: lastKnownSection }, '', location.href);
    }
    lastKnownSection = id;
    scrollToCurrent();
  });

  window.addEventListener('popstate', function (event) {
    closeOverlays();
    if (event.state && event.state.travelMateTripGuard) {
      history.pushState({ travelMateTrip: true, travelMateOverview: true }, '', baseUrl.href + '#overview');
      lastKnownSection = 'overview';
      scrollToCurrent();
      return;
    }
    if (event.state && event.state.travelMateAction) {
      history.replaceState({ travelMateTrip: true, travelMateOverview: true }, '', baseUrl.href + '#overview');
      lastKnownSection = 'overview';
      scrollToCurrent();
      return;
    }
    lastKnownSection = sectionId();
    scrollToCurrent();
  });

  addSectionBackButtons();
  setTimeout(addSectionBackButtons, 800);
  setTimeout(addSectionBackButtons, 2400);
  updateExitButtons();
  scrollToCurrent();
})();

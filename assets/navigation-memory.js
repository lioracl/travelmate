(function () {
  'use strict';

  var workspace = document.querySelector('.workspace');
  if (!workspace || !document.querySelector('main.content')) return;

  var baseUrl = new URL(location.href);
  baseUrl.hash = '';
  baseUrl.searchParams.delete('invite');
  try { sessionStorage.setItem('travelmate-last-trip-url', baseUrl.href); } catch (error) {}

  function sectionId() { return location.hash.replace(/^#/, '') || 'overview'; }
  function isOverview() { return sectionId() === 'overview'; }
  function closeOverlays() {
    document.querySelectorAll('.modal-backdrop.open').forEach(function (modal) { modal.classList.remove('open'); });
    document.body.classList.remove('mobile-menu-open');
  }
  function scrollToCurrent() {
    var target = document.getElementById(sectionId()) || document.getElementById('overview');
    if (target) requestAnimationFrame(function () { target.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    updateBackLabels();
  }
  function updateBackLabels() {
    var inside = !isOverview() || !!document.querySelector('.modal-backdrop.open');
    document.querySelectorAll('.mobile-back,.hero-back').forEach(function (button) {
      button.setAttribute('aria-label', inside ? 'חזרה לטיול' : 'חזרה לכל הטיולים');
      if (button.classList.contains('hero-back')) {
        var label = inside ? 'חזרה לטיול' : 'כל הטיולים';
        if (!button.querySelector('i') || button.textContent.trim() !== label) button.innerHTML = '<i class="fa-solid fa-arrow-right"></i> ' + label;
      }
    });
  }
  function returnToTrip() {
    closeOverlays();
    if (history.state && (history.state.travelMateAction || history.state.travelMateModal)) {
      history.back();
      return;
    }
    history.replaceState({ travelMateTrip: true, travelMateOverview: true }, '', baseUrl.href + '#overview');
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
      button.setAttribute('aria-label', 'חזרה לסקירת הטיול');
      head.appendChild(button);
    });
  }

  var initialHash = location.hash;
  if (initialHash && initialHash !== '#overview') {
    history.replaceState({ travelMateTrip: true, travelMateOverview: true }, '', baseUrl.href + '#overview');
    history.pushState({ travelMateTrip: true, travelMateAction: initialHash.slice(1) }, '', baseUrl.href + initialHash);
  } else {
    history.replaceState({ travelMateTrip: true, travelMateOverview: true }, '', baseUrl.href + (initialHash || '#overview'));
  }

  document.addEventListener('click', function (event) {
    var sectionLink = event.target.closest('a[href^="#"]');
    if (sectionLink && sectionLink.getAttribute('href').length > 1) {
      var id = sectionLink.getAttribute('href').slice(1);
      if (document.getElementById(id)) {
        event.preventDefault();
        history.pushState({ travelMateTrip: true, travelMateAction: id }, '', baseUrl.href + '#' + id);
        scrollToCurrent();
        closeOverlays();
        return;
      }
    }

    if (event.target.closest('.trip-action-back')) {
      event.preventDefault();
      returnToTrip();
      return;
    }

    var pageBack = event.target.closest('.mobile-back,.hero-back');
    if (pageBack && !isOverview()) {
      event.preventDefault();
      returnToTrip();
      return;
    }

    var modalTrigger = event.target.closest('[data-modal]');
    if (modalTrigger && !(history.state && history.state.travelMateModal)) {
      history.pushState({ travelMateTrip: true, travelMateModal: modalTrigger.dataset.modal }, '', location.href);
      setTimeout(updateBackLabels, 0);
      return;
    }
    if ((event.target.closest('[data-close]') || event.target.classList.contains('modal-backdrop')) && history.state && history.state.travelMateModal) {
      event.preventDefault();
      event.stopImmediatePropagation();
      history.back();
    }
  }, true);

  window.addEventListener('popstate', function () {
    closeOverlays();
    scrollToCurrent();
  });

  addSectionBackButtons();
  setTimeout(addSectionBackButtons, 800);
  setTimeout(addSectionBackButtons, 2400);
  updateBackLabels();
  if (initialHash) scrollToCurrent();
})();

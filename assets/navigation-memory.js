(function () {
  'use strict';

  var workspace = document.querySelector('.workspace');
  var content = document.querySelector('main.content');
  if (!workspace || !content) return;

  try { history.scrollRestoration = 'manual'; } catch (error) {}

  var currentUrl = new URL(location.href);
  currentUrl.hash = '';
  currentUrl.searchParams.delete('invite');
  try { sessionStorage.setItem('travelmate-last-trip-url', currentUrl.href); } catch (error) {}

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

  function addSectionBackButtons() {
    content.querySelectorAll('.section[id]:not(#overview)').forEach(function (section) {
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

  function overviewUrl() {
    var url = new URL(location.href);
    url.hash = '';
    url.searchParams.set('view', 'overview');
    return url.href;
  }

  function returnToOverview() {
    closeOverlays();
    var view = new URLSearchParams(location.search).get('view') || 'overview';
    if (view === 'overview') {
      window.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }
    if (history.state && history.state.travelMateView) {
      history.back();
      return;
    }
    var state = { travelMateView: 'overview' };
    history.pushState(state, '', overviewUrl());
    window.dispatchEvent(new PopStateEvent('popstate', { state: state }));
  }

  document.addEventListener('click', function (event) {
    if (event.target.closest('.trip-action-back')) {
      event.preventDefault();
      returnToOverview();
    }
  }, true);

  window.addEventListener('travelmate:feature-ready', function () {
    addSectionBackButtons();
    updateExitButtons();
  });

  addSectionBackButtons();
  updateExitButtons();
})();
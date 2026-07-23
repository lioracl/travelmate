(function () {
  'use strict';
  if (document.body.classList.contains('home-page') || !document.querySelector('.workspace')) return;

  var hero = document.querySelector('.hero');
  if (hero) {
    function syncDestinationBackground() {
      var image = getComputedStyle(hero).backgroundImage;
      var matches = image.match(/url\((['"]?)(.*?)\1\)/);
      if (matches && matches[2]) document.body.style.setProperty('--trip-bg-image', 'url("' + matches[2] + '")');
    }
    syncDestinationBackground();
    new MutationObserver(syncDestinationBackground).observe(hero, { attributes: true, attributeFilter: ['style', 'data-destination-image'] });
  }

  var sidebar = document.querySelector('.sidebar');
  if (!sidebar || sidebar.querySelector('[data-trip-logout]')) return;

  var logout = document.createElement('button');
  logout.type = 'button';
  logout.className = 'trip-logout';
  logout.dataset.tripLogout = '';
  logout.setAttribute('aria-label', 'התנתקות');
  logout.innerHTML = '<i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i><span class="tip">התנתקות</span>';
  sidebar.appendChild(logout);

  var dialog = document.createElement('section');
  dialog.className = 'trip-logout-dialog';
  dialog.hidden = true;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'trip-logout-title');
  dialog.innerHTML = '<div><h2 id="trip-logout-title">התנתקות</h2><p>לצאת מהחשבון ולחזור למסך הראשי?</p><div class="trip-logout-actions"><button type="button" data-trip-logout-cancel>ביטול</button><button type="button" data-trip-logout-confirm><i class="fa-solid fa-right-from-bracket"></i> התנתקות</button></div></div>';
  document.body.appendChild(dialog);

  function close() { dialog.hidden = true; logout.focus(); }
  logout.addEventListener('click', function () { dialog.hidden = false; dialog.querySelector('[data-trip-logout-cancel]').focus(); });
  dialog.querySelector('[data-trip-logout-cancel]').addEventListener('click', close);
  dialog.addEventListener('click', function (event) { if (event.target === dialog) close(); });
  dialog.querySelector('[data-trip-logout-confirm]').addEventListener('click', async function () {
    var button = this;
    button.disabled = true;
    try {
      if (window.TravelMateCloud && typeof window.TravelMateCloud.signOut === 'function') await window.TravelMateCloud.signOut();
    } finally {
      window.location.href = new URL('../../index.html', window.location.href).href;
    }
  });
  document.addEventListener('click', function (event) {
    if (event.target.closest('[data-trip-logout]')) {
      dialog.hidden = false;
      return;
    }
    if (event.target.closest('[data-trip-logout-cancel]') || event.target === dialog) close();
  }, true);
  logout.dataset.tripLogoutReady = 'true';
})();

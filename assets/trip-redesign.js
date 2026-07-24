(function () {
  'use strict';
  if (document.body.classList.contains('home-page') || !document.querySelector('.workspace')) return;
  document.body.classList.add('tm-new-design');

  var hero = document.querySelector('.hero');
  if (hero) {
    var city = document.querySelector('[data-city]');
    if (city && /^(פראג|prague)$/i.test(city.textContent.trim())) {
      document.body.style.setProperty('--trip-bg-image', 'url("https://commons.wikimedia.org/wiki/Special:Redirect/file/Prague%20castle%20panorama.jpg?width=2200")');
    }
    function syncDestinationBackground() {
      var image = hero.style.backgroundImage || getComputedStyle(hero).backgroundImage;
      var matches = image.match(/url\((['"]?)(.*?)\1\)/);
      if (matches && matches[2]) document.body.style.setProperty('--trip-bg-image', 'url("' + matches[2] + '")');
    }
    syncDestinationBackground();
    new MutationObserver(syncDestinationBackground).observe(hero, { attributes: true, attributeFilter: ['style', 'data-destination-image'] });
  }

  var mapTrigger = document.querySelector('.custom-hero .share[data-maps]');
  if (mapTrigger) {
    function currentMapQuery() {
      var mapCity = document.querySelector('[data-city]');
      var mapCountry = document.querySelector('[data-country]');
      return [mapCity && mapCity.textContent.trim(), mapCountry && mapCountry.textContent.trim()].filter(Boolean).join(', ');
    }
    var mapDialog = document.createElement('section');
    mapDialog.className = 'trip-map-dialog';
    mapDialog.hidden = true;
    mapDialog.setAttribute('role', 'dialog');
    mapDialog.setAttribute('aria-modal', 'true');
    mapDialog.setAttribute('aria-labelledby', 'trip-map-title');
    mapDialog.innerHTML = '<div><header><div><span>מפת היעד</span><h2 id="trip-map-title"></h2></div><button type="button" data-trip-map-close aria-label="סגירת המפה"><i class="fa-solid fa-xmark"></i></button></header><iframe title="מפת היעד" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div>';
    document.body.appendChild(mapDialog);
    var mapFrame = mapDialog.querySelector('iframe');
    function closeMap() { mapDialog.hidden = true; mapTrigger.focus(); }
    mapTrigger.addEventListener('click', function (event) {
      event.preventDefault();
      var mapQuery = currentMapQuery();
      mapDialog.querySelector('h2').textContent = mapQuery;
      mapFrame.title = 'מפת ' + mapQuery;
      var frameUrl = 'https://www.google.com/maps?q=' + encodeURIComponent(mapQuery) + '&output=embed';
      if (mapFrame.src !== frameUrl) mapFrame.src = frameUrl;
      mapDialog.hidden = false;
      mapDialog.querySelector('[data-trip-map-close]').focus();
    });
    mapDialog.querySelector('[data-trip-map-close]').addEventListener('click', closeMap);
    mapDialog.addEventListener('click', function (event) { if (event.target === mapDialog) closeMap(); });
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && !mapDialog.hidden) closeMap(); });
  }

  var sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  var content = document.querySelector('.content');
  var viewParams = new URLSearchParams(window.location.search);
  var currentView = viewParams.get('view') || 'overview';
  var overviewClasses = ['trip-overview-summary', 'trip-home-actions'];

  function pageUrl(view) {
    var url = new URL(window.location.href);
    url.hash = '';
    url.searchParams.set('view', view);
    return url.href;
  }

  function sectionView(section) {
    if (section.id) return section.id;
    for (var index = 0; index < overviewClasses.length; index += 1) {
      if (section.classList.contains(overviewClasses[index])) return 'overview';
    }
    return '';
  }

  function syncTripPages() {
    sidebar.querySelectorAll('nav a[href^="#"]').forEach(function (link) {
      var view = link.getAttribute('href').slice(1);
      link.href = pageUrl(view);
    });
    sidebar.querySelectorAll('nav a').forEach(function (link) {
      var linkUrl;
      try { linkUrl = new URL(link.href, window.location.href); } catch (error) { return; }
      var linkView = linkUrl.searchParams.get('view') || linkUrl.hash.slice(1);
      link.classList.toggle('active', linkView === currentView);
      if (linkView === currentView) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    if (!content) return;
    content.querySelectorAll(':scope > section').forEach(function (section) {
      if (section.classList.contains('hero')) {
        section.hidden = false;
        return;
      }
      section.hidden = sectionView(section) !== currentView;
    });
    document.body.dataset.tripView = currentView;
  }

  document.querySelectorAll('.trip-home-actions a[href^="#"]').forEach(function (link) {
    link.href = pageUrl(link.getAttribute('href').slice(1));
  });
  syncTripPages();
  new MutationObserver(syncTripPages).observe(sidebar, { childList: true, subtree: true });
  if (content) new MutationObserver(syncTripPages).observe(content, { childList: true });

  return;
  if (document.querySelector('[data-floating-logout]')) return;

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

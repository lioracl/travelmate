(function () {
  'use strict';

  var STORAGE_KEY = 'travelmate-theme';
  var root = document.documentElement;

  function readTheme() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch (error) {}
    return 'light';
  }

  function applyTheme(theme) {
    theme = theme === 'dark' ? 'dark' : 'light';
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
      var dark = theme === 'dark';
      var label = dark ? 'מעבר למצב בהיר' : 'מעבר למצב כהה';
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', String(dark));
      button.setAttribute('title', label);
      button.innerHTML = '<i class="fa-regular ' + (dark ? 'fa-sun' : 'fa-moon') + '" aria-hidden="true"></i><span class="tip">' + label + '</span>';
    });
    document.querySelectorAll('[data-theme-choice]').forEach(function (button) {
      var selected = button.dataset.themeChoice === theme;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    window.dispatchEvent(new CustomEvent('travelmate:theme-change', { detail: { theme: theme } }));
  }

  function saveTheme(theme) {
    try { localStorage.setItem(STORAGE_KEY, theme); } catch (error) {}
    applyTheme(theme);
  }

  function createToggle() {
    document.querySelectorAll('[data-theme-toggle]').forEach(function (button) { button.remove(); });
  }

  function stabilizeTripLayers(rootNode) {
    if (!document.body || !document.body.classList.contains('tm-new-design')) return;
    var nodes = [];
    if (rootNode && rootNode.nodeType === 1) {
      if (rootNode.matches('main.content, main.content *, .about-backdrop, .about-backdrop *')) nodes.push(rootNode);
      nodes = nodes.concat(Array.prototype.slice.call(rootNode.querySelectorAll
        ? rootNode.querySelectorAll('main.content, main.content *, .about-backdrop, .about-backdrop *')
        : []));
    } else {
      nodes = Array.prototype.slice.call(document.querySelectorAll('main.content, main.content *, .about-backdrop, .about-backdrop *'));
    }
    nodes.forEach(function (element) {
      element.style.setProperty('backdrop-filter', 'none', 'important');
      element.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
    });
  }

  function enableStableTripRendering() {
    stabilizeTripLayers(document);
    if (!document.body || typeof MutationObserver === 'undefined') return;
    new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        Array.prototype.forEach.call(mutation.addedNodes || [], stabilizeTripLayers);
      });
    }).observe(document.body, { childList: true, subtree: true });
  }

  applyTheme(readTheme());
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      createToggle();
      enableStableTripRendering();
    });
  } else {
    createToggle();
    enableStableTripRendering();
  }
  window.TravelMateTheme = { get: readTheme, set: saveTheme };
})();

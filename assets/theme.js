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
  }

  function saveTheme(theme) {
    try { localStorage.setItem(STORAGE_KEY, theme); } catch (error) {}
    applyTheme(theme);
  }

  function createToggle() {
    if (document.body.classList.contains('home-page')) {
      document.querySelectorAll('[data-theme-toggle]').forEach(function (button) { button.remove(); });
      return;
    }
    if (document.querySelector('[data-theme-toggle]')) return;
    var menu = document.querySelector('.home-sidebar, .sidebar');
    if (!menu) return;
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'theme-toggle';
    button.dataset.themeToggle = '';
    var nav = menu.querySelector('nav');
    if (nav) menu.insertBefore(button, nav);
    else menu.appendChild(button);
    button.addEventListener('click', function () {
      saveTheme(root.dataset.theme === 'dark' ? 'light' : 'dark');
    });
    applyTheme(root.dataset.theme || readTheme());
  }

  applyTheme(readTheme());
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', createToggle);
  else createToggle();
})();

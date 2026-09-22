(function () {
  'use strict';

  var STORAGE_KEY = 'travelmate-theme';
  var ACCENT_KEY = 'travelmate-accent';
  var ACCENTS = Object.freeze({ ocean: ['#147D92','#0F6F82','#0B5869','#A9DCE7'], forest: ['#176B52','#145D47','#0E4C3A','#A9D9C8'], violet: ['#6D5DA8','#5D4E95','#493D78','#C8BDEB'], coral: ['#B85F4A','#A34E3C','#843B2D','#E8B8AC'] });
  var root = document.documentElement;

  function readTheme() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch (error) {}
    return 'light';
  }

  function readAccent() { try { var saved = localStorage.getItem(ACCENT_KEY); if (ACCENTS[saved]) return saved; } catch (error) {} return 'ocean'; }

  function applyAccent(accent) {
    accent = ACCENTS[accent] ? accent : 'ocean';
    var palette = ACCENTS[accent];
    root.dataset.accent = accent;
    root.style.setProperty('--tm-brand-primary', palette[0]);
    root.style.setProperty('--tm-brand-primary-strong', palette[1]);
    root.style.setProperty('--tm-brand-primary-dark', palette[2]);
    root.style.setProperty('--tm-brand-soft', palette[3]);
    root.style.setProperty('--tm-action-primary', palette[0]);
    root.style.setProperty('--tm-action-primary-hover', palette[1]);
    root.style.setProperty('--tm-action-primary-active', palette[2]);
    document.querySelectorAll('[data-accent-choice]').forEach(function (button) { var selected = button.dataset.accentChoice === accent; button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected)); });
    window.dispatchEvent(new CustomEvent('travelmate:accent-change', { detail: { accent: accent } }));
  }

  function saveAccent(accent) { accent = ACCENTS[accent] ? accent : 'ocean'; try { localStorage.setItem(ACCENT_KEY, accent); } catch (error) {} applyAccent(accent); }

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

  applyTheme(readTheme());
  applyAccent(readAccent());
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      createToggle();
    });
  } else {
    createToggle();
  }
  document.addEventListener('click', function (event) { var choice = event.target.closest('[data-accent-choice]'); if (choice) saveAccent(choice.dataset.accentChoice); });
  window.TravelMateTheme = { get: readTheme, set: saveTheme, getAccent: readAccent, setAccent: saveAccent, accents: ACCENTS };
})();

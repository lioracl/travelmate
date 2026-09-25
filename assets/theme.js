(function () {
  'use strict';

  var STORAGE_KEY = 'travelmate-theme';
  var ACCENT_KEY = 'travelmate-accent';
  var LEGACY_ACCENTS = Object.freeze({ forest: 'emerald', violet: 'plum', coral: 'sunset' });
  var ACCENTS = Object.freeze({
    ocean: Object.freeze({ label: 'אוקיינוס', primary: '#147D92', strong: '#0F6F82', dark: '#0B5869', soft: '#D7EDF2' }),
    emerald: Object.freeze({ label: 'אמרלד', primary: '#176B52', strong: '#145D47', dark: '#0E4C3A', soft: '#D8ECE4' }),
    teal: Object.freeze({ label: 'טורקיז', primary: '#0B6F73', strong: '#095F63', dark: '#074E51', soft: '#D8ECEC' }),
    sunset: Object.freeze({ label: 'שקיעה', primary: '#A34E3C', strong: '#8F4233', dark: '#743328', soft: '#F3DED8' }),
    plum: Object.freeze({ label: 'שזיף', primary: '#674177', strong: '#59376A', dark: '#492D58', soft: '#E8DDED' }),
    pink: Object.freeze({ label: 'ורוד', primary: '#A23D6F', strong: '#8F345F', dark: '#74294D', soft: '#F4DCE8' })
  });
  var root = document.documentElement;

  function normalizeAccent(accent) {
    if (ACCENTS[accent]) return accent;
    if (LEGACY_ACCENTS[accent]) return LEGACY_ACCENTS[accent];
    return 'ocean';
  }

  function readTheme() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch (error) {}
    return 'light';
  }

  function readAccent() {
    var saved = '';
    try { saved = localStorage.getItem(ACCENT_KEY) || ''; } catch (error) {}
    var accent = normalizeAccent(saved);
    if (saved && saved !== accent) {
      try { localStorage.setItem(ACCENT_KEY, accent); } catch (error) {}
    }
    return accent;
  }

  function decorateAccentChoices(accent) {
    document.querySelectorAll('[data-accent-choice]').forEach(function (button) {
      var choice = normalizeAccent(button.dataset.accentChoice);
      var palette = ACCENTS[choice];
      if (palette) {
        button.style.setProperty('--accent-swatch', palette.primary);
        button.style.setProperty('--accent-swatch-soft', palette.soft);
        if (!button.getAttribute('title')) button.setAttribute('title', palette.label);
      }
      var selected = choice === accent;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function applyAccent(accent) {
    accent = normalizeAccent(accent);
    var palette = ACCENTS[accent];
    root.dataset.accent = accent;
    root.style.setProperty('--tm-brand-primary', palette.primary);
    root.style.setProperty('--tm-brand-primary-strong', palette.strong);
    root.style.setProperty('--tm-brand-primary-dark', palette.dark);
    root.style.setProperty('--tm-brand-soft', palette.soft);
    root.style.setProperty('--tm-action-primary', palette.primary);
    root.style.setProperty('--tm-action-primary-hover', palette.strong);
    root.style.setProperty('--tm-action-primary-active', palette.dark);
    root.style.setProperty('--tm-accent-soft', palette.soft);
    root.style.setProperty('--tm-accent-soft-text', palette.dark);
    root.style.setProperty('--tm-accent-swatch', palette.primary);
    decorateAccentChoices(accent);
    window.dispatchEvent(new CustomEvent('travelmate:accent-change', { detail: { accent: accent, palette: palette } }));
  }

  function saveAccent(accent) {
    accent = normalizeAccent(accent);
    try { localStorage.setItem(ACCENT_KEY, accent); } catch (error) {}
    applyAccent(accent);
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
    decorateAccentChoices(readAccent());
  }

  applyTheme(readTheme());
  applyAccent(readAccent());
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createToggle);
  } else {
    createToggle();
  }

  document.addEventListener('click', function (event) {
    var choice = event.target.closest('[data-accent-choice]');
    if (choice) saveAccent(choice.dataset.accentChoice);
  });

  window.TravelMateTheme = {
    get: readTheme,
    set: saveTheme,
    getAccent: readAccent,
    setAccent: saveAccent,
    accents: ACCENTS,
    normalizeAccent: normalizeAccent,
    refreshAccentChoices: function () { decorateAccentChoices(readAccent()); }
  };
})();

(function () {
  'use strict';

  var STORAGE_KEY = 'travelmate-theme';
  var ACCENT_KEY = 'travelmate-accent';
  var SURFACE_KEY = 'travelmate-surface-theme';
  var SURFACE_THEMES = Object.freeze({
    classic: Object.freeze({ label: 'Classic' }),
    'ice-aqua': Object.freeze({ label: 'Ice Aqua' }),
    'pearl-blue': Object.freeze({ label: 'Pearl Blue' }),
    'warm-sand': Object.freeze({ label: 'Warm Sand' }),
    'soft-lilac': Object.freeze({ label: 'Soft Lilac' }),
    'nordic-slate': Object.freeze({ label: 'Nordic Slate' })
  });
  var LEGACY_ACCENTS = Object.freeze({ forest: 'emerald', violet: 'plum', coral: 'sunset' });
  var ACCENTS = Object.freeze({
    ocean: Object.freeze({ label: 'אוקיינוס', primary: '#147D92', strong: '#0F6F82', dark: '#0B5869', soft: '#D7EDF2' }),
    emerald: Object.freeze({ label: 'אמרלד', primary: '#176B52', strong: '#145D47', dark: '#0E4C3A', soft: '#D8ECE4' }),
    teal: Object.freeze({ label: 'טורקיז', primary: '#0B6F73', strong: '#095F63', dark: '#074E51', soft: '#D8ECEC' }),
    sunset: Object.freeze({ label: 'שקיעה', primary: '#A34E3C', strong: '#8F4233', dark: '#743328', soft: '#F3DED8' }),
    plum: Object.freeze({ label: 'שזיף', primary: '#674177', strong: '#59376A', dark: '#492D58', soft: '#E8DDED' }),
    pink: Object.freeze({ label: 'ורוד', primary: '#A23D6F', strong: '#8F345F', dark: '#74294D', soft: '#F4DCE8' })
  });
  // C1 is a presentation palette. Legacy storage keys and surface choices are
  // retained; the V3 material base is independent of those older glass presets.
  var v3 = Boolean(document.body && document.body.dataset && document.body.dataset.design === 'v3');
  var C1_ACCENTS = Object.freeze({
    ocean: Object.freeze({label:'כחול',primary:'#1877F2',action:'#0F64E8',strong:'#0B55C6',dark:'#0847A6',soft:'#E8F1FF'}),
    plum: Object.freeze({label:'סגול',primary:'#7951E8',action:'#6840D0',strong:'#5931BA',dark:'#47239C',soft:'#F0EAFF'}),
    pink: Object.freeze({label:'ורוד',primary:'#EB4E89',action:'#BA225D',strong:'#A21B50',dark:'#881640',soft:'#FFEAF1'}),
    sunset: Object.freeze({label:'כתום',primary:'#F6A623',action:'#955900',strong:'#7E4900',dark:'#633900',soft:'#FFF1D9'}),
    emerald: Object.freeze({label:'ירוק',primary:'#18B87B',action:'#087A50',strong:'#086842',dark:'#075435',soft:'#E3F8EF'})
  });
  function effectiveAccent(value) { return v3 && value === 'teal' ? 'ocean' : value; }
  function applyC1Base(theme) {
    if (!v3) return;
    var dark = theme === 'dark';
    var tokens = {
      '--tm-family-solid':dark?'#0E2134':'#F3F8FD', '--tm-family-primary':dark?'#183249':'#FFFFFF',
      '--tm-family-nested':dark?'#203C55':'#F9FCFF', '--tm-family-control':dark?'#183249':'#FFFFFF',
      '--tm-family-control-hover':dark?'#25455F':'#E8F1FF', '--tm-family-control-active':dark?'#2B506D':'#D8E8FF',
      '--tm-family-text':dark?'#F1F8FF':'#102A4D', '--tm-family-muted':dark?'#B9CFDC':'#58718E',
      '--tm-family-border':dark?'#53738D':'#A9BED5', '--tm-family-chrome':dark?'#183249':'#FFFFFF',
      '--tm-text-primary':dark?'#F1F8FF':'#102A4D', '--tm-text-secondary':dark?'#B9CFDC':'#58718E',
      '--tm-text-on-action':'#FFFFFF', '--tm-surface-neutral':dark?'#0E2134':'#F3F8FD',
      '--tm-semantic-turquoise':'#14B8C5', '--tm-semantic-mate':'#7951E8', '--tm-semantic-success':'#18B87B',
      '--tm-semantic-orange':'#F6A623', '--tm-semantic-coral':'#F45D70',
      '--tm-secondary-hero-height':'140px', '--tm-secondary-hero-padding':'16px', '--tm-canvas-image':'none', '--bg':dark?'#0E2134':'#F3F8FD', '--tm-v3-canvas':dark?'#0E2134':'#F3F8FD'
    };
    Object.keys(tokens).forEach(function (key) { root.style.setProperty(key,tokens[key]); });
  }
  var root = document.documentElement;

  function normalizeSurfaceTheme(value) {
    return Object.prototype.hasOwnProperty.call(SURFACE_THEMES, value) ? value : 'classic';
  }
  function readSurfaceTheme() {
    try { var saved = localStorage.getItem(SURFACE_KEY); return saved === null ? 'ice-aqua' : normalizeSurfaceTheme(saved); } catch (error) { return 'classic'; }
  }
  function decorateSurfaceChoices(surface) {
    document.querySelectorAll('[data-surface-choice]').forEach(function (button) {
      var selected = button.dataset.surfaceChoice === surface;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }
  function applySurfaceTheme(value) {
    var surface = normalizeSurfaceTheme(value);
    root.dataset.surfaceTheme = surface;
    decorateSurfaceChoices(surface);
    window.dispatchEvent(new CustomEvent('travelmate:surface-theme-change', { detail: { surfaceTheme: surface } }));
  }
  function saveSurfaceTheme(value) {
    var surface = normalizeSurfaceTheme(value);
    try { localStorage.setItem(SURFACE_KEY, surface); } catch (error) {}
    applySurfaceTheme(surface);
  }

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
      if (v3) {
        button.hidden = button.dataset.accentChoice === 'teal';
        var c1 = C1_ACCENTS[effectiveAccent(choice)];
        if (c1) { button.style.setProperty('--accent-swatch',c1.primary); button.style.setProperty('--accent-swatch-soft',c1.soft); button.setAttribute('aria-label',c1.label); button.setAttribute('title',c1.label); var label=button.querySelector('span'); if(label)label.textContent=c1.label; }
      }
      var selected = !button.hidden && effectiveAccent(choice) === effectiveAccent(accent);
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function applyAccent(accent) {
    accent = normalizeAccent(accent);
    var palette = v3 ? C1_ACCENTS[effectiveAccent(accent)] : ACCENTS[accent];
    root.dataset.accent = accent;
    root.style.setProperty('--tm-brand-primary', palette.primary);
    root.style.setProperty('--tm-brand-primary-strong', palette.strong);
    root.style.setProperty('--tm-brand-primary-dark', palette.dark);
    root.style.setProperty('--tm-brand-soft', palette.soft);
    root.style.setProperty('--tm-action-primary', palette.action || palette.primary);
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
    applyC1Base(theme);
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
    decorateSurfaceChoices(readSurfaceTheme());
  }

  applySurfaceTheme(readSurfaceTheme());
  applyTheme(readTheme());
  applyAccent(readAccent());
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createToggle);
  } else {
    createToggle();
  }

  document.addEventListener('click', function (event) {
    var surface = event.target.closest('[data-surface-choice]');
    if (surface) saveSurfaceTheme(surface.dataset.surfaceChoice);
    var choice = event.target.closest('[data-accent-choice]');
    if (choice) saveAccent(choice.dataset.accentChoice);
  });

  window.TravelMateTheme = {
    getSurfaceTheme: readSurfaceTheme,
    setSurfaceTheme: saveSurfaceTheme,
    surfaceThemes: SURFACE_THEMES,
    normalizeSurfaceTheme: normalizeSurfaceTheme,
    refreshSurfaceChoices: function () { decorateSurfaceChoices(readSurfaceTheme()); },
    get: readTheme,
    set: saveTheme,
    getAccent: readAccent,
    setAccent: saveAccent,
    accents: v3 ? C1_ACCENTS : ACCENTS,
    normalizeAccent: normalizeAccent,
    refreshAccentChoices: function () { decorateAccentChoices(readAccent()); }
  };
})();

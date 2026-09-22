'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const cssFiles = {
  theme: path.join(root, 'assets/theme.css'),
  readableGlass: path.join(root, 'assets/readable-glass.css'),
  tripRedesign: path.join(root, 'assets/trip-redesign.css')
};

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function importantCount(source) {
  return (source.match(/!important\b/g) || []).length;
}

test('design-system CSS debt does not grow while ownership is being consolidated', () => {
  const counts = {
    theme: importantCount(read(cssFiles.theme)),
    readableGlass: importantCount(read(cssFiles.readableGlass)),
    tripRedesign: importantCount(read(cssFiles.tripRedesign))
  };

  // These are debt ceilings, not targets. Lower them whenever cleanup removes overrides.
  assert.ok(counts.theme <= 1560, `theme.css !important debt grew to ${counts.theme}`);
  assert.ok(counts.readableGlass <= 359, `readable-glass.css !important debt grew to ${counts.readableGlass}`);
  assert.ok(counts.tripRedesign <= 119, `trip-redesign.css !important debt grew to ${counts.tripRedesign}`);
  assert.ok(
    counts.theme + counts.readableGlass + counts.tripRedesign <= 2038,
    `combined design-system !important debt grew to ${counts.theme + counts.readableGlass + counts.tripRedesign}`
  );
});

test('document controls keep semantic design tokens instead of new white-on-white action styles', () => {
  const source = read(path.join(root, 'assets/document-vault.css'));

  assert.match(source, /\.vault-file-actions button\{[^}]*background:var\(--tm-card-control\)[^}]*color:var\(--tm-card-link\)/);
  assert.match(source, /\.doc-category-file-actions button\{[^}]*background:var\(--tm-card-control\)!important[^}]*color:var\(--tm-card-link\)!important/);
  assert.match(source, /\.doc-category-file-actions button\.danger\{color:var\(--tm-error,#b42318\)!important\}/);
});

test('readable glass remains the final CSS authority for dynamically loaded trip styles', () => {
  const source = read(path.join(root, 'assets/app.js'));

  assert.match(source, /var finalStyle='readable-glass\.css'/);
  assert.match(source, /var finalLink=document\.querySelector\('link\[data-travelmate-style="'\+finalStyle\+'"\]'\)/);
  assert.match(source, /if\(file!==finalStyle&&finalLink\)document\.head\.insertBefore\(style,finalLink\);else document\.head\.appendChild\(style\)/);
});

test('document vault is a base style and feature reloads reuse the existing style promise', () => {
  const source = read(path.join(root, 'assets/app.js'));

  assert.match(source, /baseStyles=\[[^\]]*'document-vault\.css'\]/);
  assert.match(source, /documents:\{styles:\['document-vault\.css'\],scripts:\[\]\}/);
  assert.match(source, /function loadStyle\(file\)\{\s*if\(loadedStyles\[file\]\)return loadedStyles\[file\]/);
});

test('trip redesign stays structural while readable glass owns card material', () => {
  const trip = read(cssFiles.tripRedesign);
  const readable = read(cssFiles.readableGlass);
  const start = trip.indexOf('/* Card structure only.');
  const end = trip.indexOf('/* Authoritative trip theme.', start);
  const cardOwnership = trip.slice(start, end);

  assert.ok(start >= 0 && end > start, 'card ownership boundary must remain explicit');
  assert.doesNotMatch(cardOwnership, /(?:background|border|box-shadow|backdrop-filter)\s*:/);
  assert.match(readable, /\.section-head,\.card,\.panel,\.module/);
  assert.match(readable, /background:var\(--tm-readable-surface-soft\)!important/);
});

test('document vault UI uses semantic surfaces while document paper may stay white', () => {
  const source = read(path.join(root, 'assets/document-vault.css'));
  const ui = source
    .replace(/\.vault-preview-body iframe\{[^}]*\}/g, '')
    .replace(/\.vault-preview-body pre\{[^}]*\}/g, '')
    .replace(/\.vault-pdf-page canvas\{[^}]*\}/g, '');

  assert.doesNotMatch(ui, /background:(?:#fff(?:fff)?|rgba\(255,255,255)/i);
  assert.match(source, /\.vault-upload-button\{[^}]*background:var\(--tm-action-primary\)[^}]*color:var\(--tm-text-on-action\)/);
  assert.match(source, /\.vault-pdf-toolbar button\{[^}]*background:var\(--tm-card-control\)[^}]*color:var\(--tm-card-control-text\)/);
  assert.match(source, /\.vault-preview header button\{[^}]*background:var\(--tm-card-control\)[^}]*color:var\(--tm-card-control-text\)/);
});

test('planner core surfaces use semantic tokens and legacy contrast patch stays retired', () => {
  const autoPlanner = read(path.join(root, 'assets/auto-planner.css'));
  const placePlanner = read(path.join(root, 'assets/place-planner.css'));
  const activityContrast = read(path.join(root, 'assets/activity-contrast.css'));

  assert.match(autoPlanner, /\.planner-action\{[^}]*background:var\(--tm-card-control\)[^}]*color:var\(--tm-card-control-text\)/);
  assert.match(autoPlanner, /\.planner-action\.primary\{[^}]*background:var\(--tm-action-primary\)[^}]*color:var\(--tm-text-on-action\)/);
  assert.match(placePlanner, /\.saved-place-actions button\{[^}]*background:var\(--tm-card-control\)/);
  assert.doesNotMatch(activityContrast, /!important|#[0-9a-f]{3,8}|rgba?\(/i);
});

test('Overview quick actions have one final visual owner', () => {
  const theme = read(path.join(root, 'assets/theme.css'));
  const tripRedesign = read(path.join(root, 'assets/trip-redesign.css'));
  const readableGlass = read(path.join(root, 'assets/readable-glass.css'));

  assert.doesNotMatch(theme, /body\.tm-new-design \.trip-home-actions (?:nav|a)\{/);
  assert.doesNotMatch(tripRedesign, /body\.tm-new-design \.trip-home-actions (?:nav|a)(?: i)?\{/);
  assert.match(readableGlass, /\[data-trip-view="overview"\] main\.content \.trip-home-actions a\{[^}]*min-height:64px!important/);
  assert.match(readableGlass, /\[data-trip-view="overview"\] main\.content \.trip-home-actions nav\{[^}]*gap:10px!important/);
});

test('Overview budget material is owned by readable glass', () => {
  const tripRedesign = read(path.join(root, 'assets/trip-redesign.css'));
  const readableGlass = read(path.join(root, 'assets/readable-glass.css'));

  assert.doesNotMatch(tripRedesign, /trip-overview-summary \.budget-card\{background:/);
  assert.match(readableGlass, /\[data-trip-view="overview"\] \.budget-card\{align-items:stretch/);
  assert.match(readableGlass, /\[data-trip-kind="custom"\].*\[data-trip-view="overview"\] \.trip-overview-summary \.budget-card\{/);
});

test('Places app chrome uses semantic tokens while map markers remain isolated', () => {
  const nearby = read(path.join(root, 'assets/nearby.css'));
  const nearbyJs = read(path.join(root, 'assets/nearby.js'));

  assert.match(nearby, /\.nearby-free-search\{[^}]*background:var\(--tm-card-bg-nested\)/);
  assert.match(nearby, /\.nearby-free-search button\{[^}]*background:var\(--tm-action-primary\)[^}]*color:var\(--tm-text-on-action\)/);
  assert.match(nearby, /\.nearby-result\[data-duplicate="true"\][^}]*var\(--tm-warning\)/);
  assert.match(nearby, /\.nearby-map-shell \.maplibregl-map\{direction:ltr/);
  assert.match(nearbyJs, /mapbox-gl-rtl-text@0\.3\.0/);
  assert.match(nearbyJs, /enableRtlText\(MapLibre\)/);
});

test('Personalization reuses authenticated Supabase user identity', () => {
  const home = read(path.join(root, 'assets/home.js'));
  const index = read(path.join(root, 'index.html'));
  const cloud = read(path.join(root, 'assets/cloud-sync.js'));

  assert.match(cloud, /client\.auth\.getSession\(\)/);
  assert.match(home, /user\.user_metadata/);
  assert.match(home, /metadata\.display_name \|\| metadata\.full_name \|\| metadata\.name/);
  assert.match(home, /data-account-label/);
  assert.match(home, /data-user-avatar/);
  assert.match(index, /data-account-label/);
  assert.match(index, /data-user-avatar/);
  assert.doesNotMatch(home, /firstName\s*=\s*['"]ליאור['"]/);
});

test('Accent personalization changes only central semantic brand tokens', () => {
  const theme = read(path.join(root, 'assets/theme.js'));
  assert.match(theme, /travelmate-accent/);
  assert.match(theme, /--tm-brand-primary/);
  assert.match(theme, /--tm-action-primary/);
  assert.match(theme, /data-accent-choice/);
  assert.doesNotMatch(theme, /document\.querySelectorAll\(['"][.#](?:card|nearby|planner)/);
});

test('Account settings expose the persisted accent choices accessibly', () => {
  const home = read(path.join(root, 'assets/home.js'));
  const theme = read(path.join(root, 'assets/theme.js'));
  for (const accent of ['ocean', 'forest', 'violet', 'coral']) assert.match(home, new RegExp('data-accent-choice="' + accent + '"'));
  assert.match(home, /fieldset class="account-accent-picker"/);
  assert.match(home, /aria-label="בחירת צבע ממשק"/);
  assert.match(theme, /localStorage\.setItem\(ACCENT_KEY, accent\)/);
});

test('Navo message contrast is semantic and theme-safe', () => {
  const glass = read(path.join(root, 'assets/readable-glass.css'));
  assert.match(glass, /Navo contrast contract/);
  const navo = glass.slice(glass.indexOf('/* Navo contrast contract'));
  assert.match(navo, /\.ai-message\.assistant \.ai-bubble[\s\S]*?background:var\(--tm-card-bg-nested\)/);
  assert.match(navo, /\.ai-message\.assistant \.ai-bubble[\s\S]*?color:var\(--tm-card-text\)/);
  assert.match(navo, /\.ai-message\.user \.ai-bubble[\s\S]*?background:var\(--tm-action-primary\)/);
  assert.match(navo, /\.ai-message\.user \.ai-bubble[\s\S]*?color:var\(--tm-text-on-action\)/);
  assert.match(navo, /\.ai-message-tools button[\s\S]*?color:var\(--tm-card-control-text\)/);
});

test('Every app entry point provides a keyboard skip link to main content', () => {
  for (const file of ['index.html','trip/custom/index.html','trip/italy-2028/index.html','trip/japan-2027/index.html']) {
    const source = read(path.join(root, file));
    assert.match(source, /class="tm-skip-link" href="#main-content"/);
    assert.match(source, /<main\b[^>]*id="main-content"/);
  }
  const glass = read(cssFiles.readableGlass);
  assert.match(glass, /\.tm-skip-link:focus-visible/);
  assert.match(glass, /background:var\(--tm-action-primary\)/);
});

test('Icon-only modal close buttons have accessible names', () => {
  for (const file of ['trip/italy-2028/index.html','trip/japan-2027/index.html']) {
    const source = read(path.join(root, file));
    const closeButtons = source.match(/<button class="modal-close"[^>]*>/g) || [];
    assert.equal(closeButtons.length, 5, file + ' modal close count changed');
    for (const button of closeButtons) assert.match(button, /aria-label="סגירת החלון"/);
  }
});

test('Blank-target links isolate the opener context', () => {
  for (const file of ['trip/custom/index.html','trip/italy-2028/index.html','trip/japan-2027/index.html']) {
    const source = read(path.join(root, file));
    const links = source.match(/<a\b[^>]*target="_blank"[^>]*>/g) || [];
    for (const link of links) assert.match(link, /rel="[^"]*noopener[^"]*"/, file + ': ' + link);
  }
});

test('Modal backdrops expose dialog semantics', () => {
  for (const file of ['index.html','trip/italy-2028/index.html','trip/japan-2027/index.html']) {
    const source = read(path.join(root, file));
    const modals = source.match(/<section\b[^>]*class="[^"]*modal-backdrop[^"]*"[^>]*>/g) || [];
    assert.ok(modals.length > 0, file + ' has no modal backdrops');
    for (const modal of modals) {
      assert.match(modal, /role="dialog"/);
      assert.match(modal, /aria-modal="true"/);
    }
  }
});

test('Trip modals manage keyboard focus on open and close', () => {
  const app = read(path.join(root, 'assets/app.js'));
  assert.match(app, /var lastModalTrigger=null/);
  assert.match(app, /function focusModal\(modal\)/);
  assert.match(app, /lastModalTrigger=trigger/);
  assert.match(app, /lastModalTrigger\.focus\(\)/);
});

test('Account dialog traps keyboard focus and restores its opener', () => {
  const home = read(path.join(root, 'assets/home.js'));
  assert.match(home, /firstControl = firstField \|\| accountPanel\.querySelector/);
  assert.match(home, /event\.key !== 'Tab'/);
  assert.match(home, /event\.shiftKey && document\.activeElement === first/);
  assert.match(home, /document\.activeElement === last/);
  assert.match(home, /lastAccountOpenButton\.focus\(\)/);
});

test('Interactive Nearby result cards expose an accessible name and keyboard activation', () => {
  const nearby = read(path.join(root, 'assets/nearby.js'));
  assert.match(nearby, /role="button" aria-label="/);
  assert.match(nearby, /event\.key==='Enter'\|\|event\.key===' '/);
  assert.match(nearby, /syncResultSelection\(event\)/);
});

test('Navo panel exposes dialog semantics and restores launcher focus', () => {
  const ai = read(path.join(root, 'assets/ai-assistant.js'));
  assert.match(ai, /panel\.setAttribute\('role', 'dialog'\)/);
  assert.match(ai, /panel\.setAttribute\('aria-modal', 'true'\)/);
  assert.match(ai, /orb\.setAttribute\('aria-controls', panel\.id\)/);
  assert.match(ai, /ui\.orb\.focus\(\)/);
});

test('Navo announces status and busy state', () => {
  const ai = read(path.join(root, 'assets/ai-assistant.js'));
  assert.match(ai, /data-ai-status role="status" aria-live="polite"/);
  assert.match(ai, /ui\.panel\.setAttribute\('aria-busy', String\(busy\)\)/);
});

test('Trip date editor traps focus and restores its opener', () => {
  const home = read(path.join(root, 'assets/home.js'));
  assert.match(home, /function editTripDates\(trip, opener\)/);
  assert.match(home, /event\.key === 'Escape'/);
  assert.match(home, /event\.key !== 'Tab'/);
  assert.match(home, /opener\.focus\(\)/);
  assert.match(home, /editTripDates\(tripToEdit, editButton\)/);
});

test('Navo dialog contains keyboard focus while open', () => {
  const ai = read(path.join(root, 'assets/ai-assistant.js'));
  assert.match(ai, /if \(!state\.open\) return/);
  assert.match(ai, /event\.key !== 'Tab'/);
  assert.match(ai, /event\.shiftKey && document\.activeElement === first/);
  assert.match(ai, /document\.activeElement === last/);
});

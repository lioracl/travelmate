'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const cssFiles = {
  base: path.join(root, 'assets/styles.css'),
  theme: path.join(root, 'assets/theme.css'),
  readableGlass: path.join(root, 'assets/readable-glass.css'),
  tripRedesign: path.join(root, 'assets/trip-redesign.css'),
  cloudSync: path.join(root, 'assets/cloud-sync.css'),
  homeOrganizer: path.join(root, 'assets/home-organizer.css'),
  autoPlanner: path.join(root, 'assets/auto-planner.css'),
  tripExperience: path.join(root, 'assets/trip-experience.css'),
  collaboration: path.join(root, 'assets/collaboration.css'),
  placeAutoFill: path.join(root, 'assets/place-auto-fill.css')
};

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function importantCount(source) {
  return (source.match(/!important\b/g) || []).length;
}

test('design-system CSS debt does not grow while ownership is being consolidated', () => {
  const counts = {
    base: importantCount(read(cssFiles.base)),
    theme: importantCount(read(cssFiles.theme)),
    readableGlass: importantCount(read(cssFiles.readableGlass)),
    tripRedesign: importantCount(read(cssFiles.tripRedesign)),
    cloudSync: importantCount(read(cssFiles.cloudSync)),
    homeOrganizer: importantCount(read(cssFiles.homeOrganizer)),
    autoPlanner: importantCount(read(cssFiles.autoPlanner)),
    tripExperience: importantCount(read(cssFiles.tripExperience)),
    collaboration: importantCount(read(cssFiles.collaboration)),
    placeAutoFill: importantCount(read(cssFiles.placeAutoFill))
  };

  // These are debt ceilings, not targets. Lower them whenever cleanup removes overrides.
  assert.equal(counts.base, 0, `styles.css must remain free of !important debt; found ${counts.base}`);
  assert.ok(counts.theme <= 32, `theme.css !important debt grew to ${counts.theme}`);
  assert.ok(counts.readableGlass <= 191, `readable-glass.css !important debt grew to ${counts.readableGlass}`);
  assert.ok(counts.tripRedesign <= 92, `trip-redesign.css !important debt grew to ${counts.tripRedesign}`);
  assert.ok(counts.cloudSync <= 1, `cloud-sync.css !important debt grew to ${counts.cloudSync}`);
  assert.ok(counts.homeOrganizer <= 2, `home-organizer.css !important debt grew to ${counts.homeOrganizer}`);
  assert.equal(counts.autoPlanner, 0, `auto-planner.css must remain free of !important debt; found ${counts.autoPlanner}`);
  assert.ok(counts.tripExperience <= 8, `trip-experience.css !important debt grew to ${counts.tripExperience}`);
  assert.ok(counts.collaboration <= 6, `collaboration.css !important debt grew to ${counts.collaboration}`);
  assert.ok(counts.placeAutoFill <= 2, `place-auto-fill.css !important debt grew to ${counts.placeAutoFill}`);
  assert.ok(
    counts.base + counts.theme + counts.readableGlass + counts.tripRedesign + counts.cloudSync + counts.homeOrganizer + counts.autoPlanner + counts.tripExperience + counts.collaboration + counts.placeAutoFill <= 334,
    `combined core CSS !important debt grew to ${counts.base + counts.theme + counts.readableGlass + counts.tripRedesign + counts.cloudSync + counts.homeOrganizer + counts.autoPlanner + counts.tripExperience + counts.collaboration + counts.placeAutoFill}`
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

test('document vault style is feature-scoped and feature reloads reuse the existing style promise', () => {
  const source = read(path.join(root, 'assets/app.js'));

  assert.doesNotMatch(source, /baseStyles=\[[^\]]*'document-vault\.css'\]/);
  assert.match(source, /documents:\{styles:\['document-vault\.css'\],scripts:\['document-vault\.js'\]\}/);
  assert.match(source, /function loadStyle\(file\)\{[\s\S]*?if\(loadedStyles\[file\]\)return loadedStyles\[file\]/);
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

test('planner core surfaces use semantic tokens and the legacy contrast patch is removed', () => {
  const autoPlanner = read(path.join(root, 'assets/auto-planner.css'));
  const placePlanner = read(path.join(root, 'assets/place-planner.css'));

  assert.match(autoPlanner, /\.planner-action\{[^}]*background:var\(--tm-card-control\)[^}]*color:var\(--tm-card-control-text\)/);
  assert.match(autoPlanner, /\.planner-action\.primary\{[^}]*background:var\(--tm-action-primary\)[^}]*color:var\(--tm-text-on-action\)/);
  assert.match(placePlanner, /\.saved-place-actions button\{[^}]*background:var\(--tm-card-control\)/);
  assert.equal(fs.existsSync(path.join(root, 'assets/activity-contrast.css')), false);
});

test('Weather contrast is owned by the Weather component stylesheet', () => {
  const weather = read(path.join(root, 'assets/weather-widget.css'));
  const app = read(path.join(root, 'assets/app.js'));
  const sw = read(path.join(root, 'sw.js'));

  assert.equal(fs.existsSync(path.join(root, 'assets/weather-contrast.css')), false);
  assert.match(weather, /Weather live-modal contrast ownership/);
  assert.match(weather, /html body #modal-weather-live \.weather-live-modal\{/);
  assert.doesNotMatch(app, /weather-contrast\.css/);
  assert.doesNotMatch(sw, /weather-contrast\.css|activity-contrast\.css/);
});

test('Document Vault auth grid cannot exceed its own container', () => {
  const vault = read(path.join(root, 'assets/document-vault.css'));
  assert.match(vault, /\.vault-auth form\{[^}]*grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\) auto auto[^}]*min-width:0/);
  assert.match(vault, /\.vault-auth form>\*\{min-width:0\}/);
  assert.match(vault, /\.vault-auth input\{width:100%\}/);
});

test('Overview quick actions have one final visual owner', () => {
  const theme = read(path.join(root, 'assets/theme.css'));
  const tripRedesign = read(path.join(root, 'assets/trip-redesign.css'));
  const readableGlass = read(path.join(root, 'assets/readable-glass.css'));

  assert.doesNotMatch(theme, /body\.tm-new-design \.trip-home-actions (?:nav|a)\{/);
  assert.doesNotMatch(tripRedesign, /body\.tm-new-design \.trip-home-actions (?:nav|a)(?: i)?\{/);
  assert.match(readableGlass, /\[data-trip-view="overview"\] main\.content \.trip-home-actions a\{[^}]*min-height:64px;/);
  assert.doesNotMatch(readableGlass, /\[data-trip-view="overview"\] main\.content \.trip-home-actions a\{[^}]*min-height:64px!important/);
  assert.match(readableGlass, /\[data-trip-view="overview"\] main\.content \.trip-home-actions nav\{[^}]*gap:10px;/);
  assert.doesNotMatch(readableGlass, /\[data-trip-view="overview"\] main\.content \.trip-home-actions nav\{[^}]*gap:10px!important/);
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
  for (const accent of ['ocean', 'emerald', 'teal', 'sunset', 'plum', 'pink']) assert.match(home, new RegExp('data-accent-choice="' + accent + '"'));
  assert.match(home, /fieldset class="account-accent-picker"/);
  assert.match(home, /aria-label="בחירת ערכת צבע"/);
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
  assert.match(home, /editTripDates\(editTrip, editButton\)/);
});

test('Navo dialog contains keyboard focus while open', () => {
  const ai = read(path.join(root, 'assets/ai-assistant.js'));
  assert.match(ai, /if \(!state\.open\) return/);
  assert.match(ai, /event\.key !== 'Tab'/);
  assert.match(ai, /event\.shiftKey && document\.activeElement === first/);
  assert.match(ai, /document\.activeElement === last/);
});


test('Phase 3 keeps Cloud Account and Overview on one final authority', () => {
  const cloud = read(cssFiles.cloudSync);
  const glass = read(cssFiles.readableGlass);
  assert.match(cloud, /2026-07-31 reference restoration/);
  assert.match(cloud, /2026-08-27 — focused login-control system/);
  assert.doesNotMatch(cloud, /width:min\(940px,100%\)/);
  assert.doesNotMatch(cloud, /Account panel: keep authenticated and signed-out states readable over the photo/);
  assert.doesNotMatch(glass, /Specificity bridge for legacy duplicated theme selectors/);
});


test('Phase 4 keeps base and Home ownership de-escalated', () => {
  const base = read(cssFiles.base);
  const theme = read(cssFiles.theme);
  const cloud = read(cssFiles.cloudSync);
  const home = read(cssFiles.homeOrganizer);

  assert.doesNotMatch(base, /!important\b/);
  assert.doesNotMatch(theme, /body\.home-page \.cloud-account-split/);
  assert.doesNotMatch(theme, /Authenticated trips overview refinements/);
  assert.equal((cloud.match(/!important\b/g) || []).length, 1);
  assert.match(cloud, /\.cloud-account \[hidden\]\{display:none!important\}/);
  assert.ok((home.match(/!important\b/g) || []).length <= 2);
});


test('Phase 5 navigation ownership has zero important escalation', () => {
  const navFiles = [
    'assets/readable-glass.css',
    'assets/trip-redesign.css',
    'assets/theme.css',
    'assets/mobile-menu.css',
    'assets/security-center.css',
    'assets/admin-center.css'
  ];
  const navSelector = /sidebar|mobile-header|mobile-menu|trip-logout|sidebar-about|security-center-launcher|admin-center-launcher/;
  for (const file of navFiles) {
    const source = read(path.join(root, file)).replace(/\/\*[\s\S]*?\*\//g, '');
    const blocks = source.match(/[^{}]+\{[^{}]*\}/g) || [];
    const debt = blocks.filter((block) => {
      const open = block.indexOf('{');
      return open !== -1 && navSelector.test(block.slice(0, open)) && /!important\b/.test(block.slice(open + 1));
    });
    assert.equal(debt.length, 0, `${file} navigation must stay free of !important escalation`);
  }
  assert.match(read(path.join(root, 'assets/mobile-menu.css')), /Mobile navigation state authority — Phase 5/);
  assert.match(read(path.join(root, 'assets/trip-redesign.css')), /Mobile drawer geometry authority — Phase 5/);
  assert.match(read(path.join(root, 'assets/readable-glass.css')), /final mobile drawer material authority/);
});


test('Phase 6 keeps Plan, Budget and auto-place with feature ownership', () => {
  const theme = read(cssFiles.theme);
  const planner = read(cssFiles.autoPlanner);
  const budget = read(cssFiles.tripExperience);
  const autoPlace = read(cssFiles.placeAutoFill);

  assert.match(planner, /Phase 6 — Plan behavior, layout safety and action semantics authority/);
  assert.match(autoPlace, /Phase 6 — Auto-place behavior\/state authority/);
  assert.equal(importantCount(planner), 0);
  assert.equal(importantCount(budget), 8);
  assert.equal(importantCount(autoPlace), 2);

  assert.doesNotMatch(theme, /section#plan#plan[\s\S]{0,600}!important/);
  assert.doesNotMatch(theme, /planner-action\.planner-action[\s\S]{0,300}!important/);
  assert.doesNotMatch(theme, /section#budget#budget \.expense-workspace\.expense-workspace \.receipt-form\.receipt-form/);
  assert.doesNotMatch(theme, /#budget \.budget-hero>div:first-child[\s\S]{0,300}!important/);

  assert.match(budget, /\.tm-collapsed>:not\(\.section-head\)\{display:none!important\}/);
  assert.match(budget, /\.receipt-form\[hidden\]\{display:none!important\}/);
  assert.match(budget, /#budget \[data-expenses\]\{display:none!important\}/);
  assert.match(budget, /\.receipt-preview-open\{overflow:hidden!important\}/);
  assert.match(budget, /#budget \.receipt-preview\[hidden\]\{display:none!important\}/);
  assert.match(budget, /#memories \.memory-file-picker\{[\s\S]*color:#174f3c!important;[\s\S]*-webkit-text-fill-color:#174f3c!important;/);
  assert.match(budget, /#memories \.album-actions a\{[\s\S]*border:0 solid rgba\(255,255,255,\.55\)!important;/);
  assert.match(autoPlace, /\.saved-place-editor\[hidden\]\{display:none!important\}/);
  assert.match(autoPlace, /\.auto-place-stay-dates\[hidden\]\{display:none!important\}/);
});


test('Phase 7 keeps shared frame, Mate and Transport ownership out of Theme', () => {
  const theme = read(cssFiles.theme);
  const redesign = read(cssFiles.tripRedesign);
  const ai = read(path.join(root, 'assets/ai-assistant.css'));
  const transport = read(path.join(root, 'assets/transport-planner.css'));

  assert.match(redesign, /Phase 7 — trip frame and hero geometry authority/);
  assert.match(redesign, /data-trip-view\]:not\(\[data-trip-view="overview"\]\)[\s\S]*min-height:56px/);
  assert.match(ai, /Phase 7 — Mate launcher and header visual authority/);
  assert.match(ai, /body\.tm-new-design \.ai-orb\{[\s\S]*width:48px;/);
  assert.match(transport, /#transport \.transport-note\{[^}]*background:linear-gradient\(135deg,#315d4d,#21493b\)!important/);

  assert.doesNotMatch(theme, /#overview\.custom-hero\{[\s\S]{0,240}!important/);
  assert.doesNotMatch(theme, /html body\.tm-new-design \.ai-orb\{[\s\S]{0,300}!important/);
  assert.doesNotMatch(theme, /#transport \.transport-note\{[\s\S]{0,300}!important/);
  assert.doesNotMatch(theme, /section-head\.section-head[\s\S]{0,300}!important/);
});


test('Phase 8 keeps Group, Memories and Currency semantic ownership out of Theme', () => {
  const theme = read(cssFiles.theme);
  const glass = read(cssFiles.readableGlass);
  const collaboration = read(cssFiles.collaboration);
  const experience = read(cssFiles.tripExperience);
  const app = read(path.join(root, 'assets/app.js'));

  assert.match(collaboration, /Phase 8 — Group semantic contrast authority/);
  assert.match(experience, /Phase 8 — Memories semantic contrast authority/);
  assert.match(experience, /Phase 8 — Currency theme semantics without Theme escalation/);
  assert.match(glass, /:not\(\.message-sender\):not\(\.collaboration-live\)/);
  assert.doesNotMatch(theme, /group-message|collaboration-live|group-privacy|memory-file-picker|album-actions|trip-summary-text|currency-insight|data-fee-edit/);
  assert.match(app, /Promise\.all\(\(feature\.styles\|\|\[\]\)\.map\(loadStyle\)\)\.then\(function\(\)\{return loadSequence\(feature\.scripts\|\|\[\]\)\}\)/);
});

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
  assert.ok(counts.theme <= 1600, `theme.css !important debt grew to ${counts.theme}`);
  assert.ok(counts.readableGlass <= 360, `readable-glass.css !important debt grew to ${counts.readableGlass}`);
  assert.ok(counts.tripRedesign <= 135, `trip-redesign.css !important debt grew to ${counts.tripRedesign}`);
  assert.ok(
    counts.theme + counts.readableGlass + counts.tripRedesign <= 2095,
    `combined design-system !important debt grew to ${counts.theme + counts.readableGlass + counts.tripRedesign}`
  );
});

test('document controls keep semantic design tokens instead of new white-on-white action styles', () => {
  const source = read(path.join(root, 'assets/document-vault.css'));

  assert.match(source, /\.vault-file-actions button\{[^}]*background:var\(--tm-card-control\)[^}]*color:var\(--tm-card-link\)/);
  assert.match(source, /\.doc-category-file-actions button\{[^}]*background:var\(--tm-card-control\)!important[^}]*color:var\(--tm-card-link\)!important/);
  assert.match(source, /\.doc-category-file-actions button\.danger\{color:var\(--tm-error,#b42318\)!important\}/);
});

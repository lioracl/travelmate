const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('skip links target focusable main content on every entry point', () => {
  ['index.html','trip/custom/index.html','trip/italy-2028/index.html','trip/japan-2027/index.html'].forEach(file => {
    const html = read(file);
    assert.match(html, /class="tm-skip-link" href="#main-content"/);
    assert.match(html, /<main[^>]*tabindex="-1"[^>]*id="main-content"|<main[^>]*id="main-content"[^>]*tabindex="-1"/);
  });
});

test('Navo restores launcher focus before history-backed close', () => {
  const source = read('assets/ai-assistant.js');
  assert.match(source, /if \(!open && state\.open && !fromHistory && history\.state && history\.state\.travelMateOverlay === 'ai'\) \{\s*if \(document\.contains\(ui\.orb\)\) ui\.orb\.focus\(\);\s*history\.back\(\);/);
});

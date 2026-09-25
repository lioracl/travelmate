'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');

test('places exposes a visible home for unscheduled saved places',()=>{
  const app=read('assets/app.js');
  assert.match(app,/data-saved-places-shelf/);
  assert.match(app,/מקומות שמורים/);
  assert.match(app,/נשמר כאן · עדיין לא תוזמן/);
  assert.match(app,/המקום נשמר ב״מקומות שמורים״ בכרטיסיית מקומות/);
});

test('document vault is structural instead of another glass slab',()=>{
  const glass=read('assets/readable-glass.css');
  const vault=read('assets/document-vault.css');
  assert.doesNotMatch(glass,/\.document-vault,\.document-vault-panel,\.vault-auth,\.gps-consent-card/);
  assert.doesNotMatch(glass,/:is\(\.section-head,\.document-vault-shell,\.doc-list\)/);
  assert.match(vault,/\.document-vault\{margin:16px 0 22px;padding:0;border-radius:0\}/);
});

test('mobile place and document controls can wrap instead of overflowing',()=>{
  const nearby=read('assets/nearby.css');
  const vault=read('assets/document-vault.css');
  assert.match(nearby,/Mobile feedback pass — saved places shelf \+ resilient control labels/);
  assert.match(nearby,/overflow-wrap:anywhere/);
  assert.match(vault,/Mobile feedback pass — document actions stay inside their cards/);
  assert.match(vault,/overflow-wrap:anywhere/);
});

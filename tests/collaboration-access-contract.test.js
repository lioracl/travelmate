const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'assets/collaboration.js'), 'utf8');

test('missing membership is rendered read-only rather than re-enabling trip edits', () => {
  assert.match(source, /accessRevoked = Boolean\(state\.session && !isOwner\(\) && !me\)/);
  assert.match(source, /classList\.toggle\('trip-viewer',[\s\S]*accessRevoked/);
});

test('Realtime removal of the current member purges the cached shared trip and exits the trip', () => {
  assert.match(source, /affectsCurrentUser && eventType === 'DELETE'/);
  assert.match(source, /cloud\.removeLocalTrip\(state\.trip\.id, state\.trip\.ownerId\)/);
  assert.match(source, /הגישה שלך לטיול הוסרה/);
});

test('Realtime downgrade to viewer refreshes from authoritative cloud state', () => {
  assert.match(source, /affectsCurrentUser && eventType === 'UPDATE' && row\.role === 'viewer'/);
  assert.match(source, /await cloud\.getTrip\(state\.trip\.id, state\.trip\.ownerId\)/);
  assert.match(source, /ההרשאה שלך השתנתה לצפייה בלבד/);
});

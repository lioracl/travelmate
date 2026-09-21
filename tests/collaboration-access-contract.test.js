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


test('returning online performs a full cloud reconciliation, not only pending retries', () => {
  const cloudSource = fs.readFileSync(path.join(__dirname, '..', 'assets/cloud-sync.js'), 'utf8');
  assert.match(cloudSource, /addEventListener\('online'[\s\S]*syncLocalTrips\(\)/);
});

test('group access is revalidated after reconnect, focus and visibility return with throttling', () => {
  assert.match(source, /async function revalidateAccess\(force\)/);
  assert.match(source, /now - state\.lastAccessCheckAt < 15000/);
  assert.match(source, /addEventListener\('online'[\s\S]*revalidateAccess\(true\)/);
  assert.match(source, /addEventListener\('focus'[\s\S]*revalidateAccess\(false\)/);
  assert.match(source, /visibilitychange[\s\S]*revalidateAccess\(false\)/);
});

test('access revalidation purges a revoked shared trip even if Realtime was missed', () => {
  assert.match(source, /state\.members = await cloud\.listTripMembers/);
  assert.match(source, /if \(!me\)[\s\S]*cloud\.removeLocalTrip\(state\.trip\.id, state\.trip\.ownerId\)/);
});

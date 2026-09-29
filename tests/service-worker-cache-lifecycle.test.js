'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('sw.js', 'utf8');

test('service worker activation deletes legacy and stale release caches but preserves current and unrelated caches', async () => {
  const versionMatch = source.match(/const ASSET_VERSION='([^']+)'/);
  assert.ok(versionMatch, 'service worker must expose ASSET_VERSION');
  const currentCache = 'travelmate-smart-v266-' + versionMatch[1];
  const deleted = [];
  const handlers = {};
  let claimed = false;

  const scope = {
    URL,
    Response,
    fetch: async () => new Response('network'),
    caches: {
      keys: async () => [
        currentCache,
        'travelmate-smart-v266-20260929-46',
        'travelmate-smart-v265',
        'other-app-cache'
      ],
      delete: async name => { deleted.push(name); return true; },
      open: async () => ({ addAll: async () => {}, put: async () => {} }),
      match: async () => null
    },
    self: {
      location: { origin: 'https://local.test', href: 'https://local.test/travelmate/sw.js' },
      addEventListener: (name, handler) => { handlers[name] = handler; },
      skipWaiting: () => {},
      clients: { claim: async () => { claimed = true; } }
    }
  };

  vm.runInNewContext(source, scope);
  let activation;
  handlers.activate({ waitUntil: promise => { activation = promise; } });
  await activation;

  assert.deepEqual(deleted.sort(), [
    'travelmate-smart-v265',
    'travelmate-smart-v266-20260929-46'
  ]);
  assert.equal(claimed, true);
  assert.equal(deleted.includes(currentCache), false);
  assert.equal(deleted.includes('other-app-cache'), false);
});

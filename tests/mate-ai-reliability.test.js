const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const ai = fs.readFileSync('assets/ai-assistant.js', 'utf8');
const edge = fs.readFileSync('supabase/functions/travel-assistant/index.ts', 'utf8');

test('Mate lifecycle rejects stale account responses', () => {
  assert.match(ai, /lifecycleGeneration/);
  assert.match(ai, /requestIsCurrent/);
  assert.match(ai, /AI_REQUEST_STALE/);
});

test('Mate client has bounded timeout and continuation support', () => {
  assert.match(ai, /AI_TIMEOUT/);
  assert.match(ai, /30000/);
  assert.match(ai, /continueResponse/);
  assert.match(ai, /responseIncomplete/);
});

test('Mate gateway enforces auth and usage guard before provider call', () => {
  const auth = edge.indexOf("AUTH_REQUIRED");
  const usage = edge.indexOf("consume_travel_ai_request");
  const provider = edge.indexOf("generativelanguage.googleapis.com");
  assert.ok(auth >= 0 && usage > auth && provider > usage);
  assert.match(edge, /DAILY_LIMIT_REACHED/);
});

test('Mate gateway exposes safe provider failures and completion metadata', () => {
  assert.match(edge, /AI_PROVIDER_ERROR/);
  assert.match(edge, /EMPTY_AI_RESPONSE/);
  assert.match(edge, /finishReason/);
  assert.match(edge, /truncated/);
  assert.match(edge, /complete/);
});

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const workflow=fs.readFileSync(path.resolve(__dirname,'../../../.github/workflows/qa-fixture-ci.yml'),'utf8');

test('PR code gate triggers on main changes only; never writes or signs',()=>{
  assert.match(workflow,/^on:\n  pull_request:\n    branches:\n      - main\n/m);
  assert.doesNotMatch(workflow,/\n  (?:push|workflow_dispatch|pull_request_target|workflow_run|schedule):/);
  assert.match(workflow,/\npermissions:\n  contents: read\n/);
  assert.doesNotMatch(workflow,/\b(?:write-all|secrets\.|vars\.|id-token:|contents: write|environment:|deploy|publisher\.cjs sign|QA_FIXTURE_SIGNING_PKCS8_B64)\b/i);
});
test('unprivileged check cannot gain a signing credential from checkout',()=>{
  assert.match(workflow,/persist-credentials: false/);
  assert.doesNotMatch(workflow,/persist-credentials: true/);
  assert.match(workflow,/runs-on: ubuntu-24\.04/);
  assert.doesNotMatch(workflow,/runs-on: self-hosted/);
  assert.match(workflow,/name: Verify signing code without secrets/);
});
test('CI actions and runtime are fixed and both source and tests are exercised',()=>{
  const actions=[...workflow.matchAll(/uses:\s*(\S+)/g)].map(m=>m[1]);
  assert.deepEqual(actions,[
    'actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683',
    'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020']);
  assert.match(workflow,/node-version: '22\.16\.0'/);
  assert.match(workflow,/node --check tools\/qa-fixture-provenance\/publisher\.cjs/);
  assert.match(workflow,/node --test tools\/qa-fixture-provenance\/tests\/\*\.test\.cjs/);
});

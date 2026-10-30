'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),path=require('node:path');
const w=fs.readFileSync(path.resolve(__dirname,'../../../.github/workflows/qa-fixture-signing.yml'),'utf8');
const jobs=w.slice(w.indexOf('\njobs:\n'));
const pre=jobs.slice(jobs.indexOf('\n  preflight:'),jobs.indexOf('\n  sign:'));
const sign=jobs.slice(jobs.indexOf('\n  sign:'));
test('workflow has no pull_request, pull_request_target, push or workflow_run triggers',()=>{
 assert.match(w,/^on:\n  workflow_dispatch:/m);
 assert.doesNotMatch(w,/\n  (?:pull_request|pull_request_target|push|workflow_run):/);
});
test('workflow and both jobs limit GITHUB_TOKEN to contents read',()=>{
 assert.match(w,/\npermissions:\n  contents: read\n/);
 assert.match(pre,/\n    permissions:\n      contents: read\n/);
 assert.match(sign,/\n    permissions:\n      contents: read\n/);
 assert.doesNotMatch(w,/(?:id-token|pages|contents): write/);
});
test('privileged sign job has a named protected environment and depends on successful preflight',()=>{
 assert.match(sign,/needs: preflight/);assert.match(sign,/needs\.preflight\.result == 'success'/);
 assert.match(sign,/environment:\n      name: qa-fixture-signing/);
 assert.doesNotMatch(pre,/environment:/);
});
test('both jobs explicitly enforce repository, main ref and exact commit before signing',()=>{
 for(const part of [pre,sign]){
 assert.match(part,/github\.repository == 'lioracl\/travelmate'/);
 assert.match(part,/github\.ref == 'refs\/heads\/main'/);
 assert.match(part,/github\.sha == inputs\.approved_commit_sha/);
 assert.match(part,/workflow_dispatch/);
 }
});
test('no untrusted artifact download, script approval bypass, or fork PR payload execution',()=>{
 assert.doesNotMatch(w,/pull_request_target|workflow_run|download-artifact|curl\s.*\|\s*(?:bash|sh)|--insecure|GITHUB_TOKEN: \$\{\{ secrets\./);
 assert.doesNotMatch(w,/runs-on:\s*self-hosted/);
 assert.match(w,/runs-on:\s*ubuntu-24\.04/g);
});
test('third party actions are fully pinned by 40 hex commit SHAs',()=>{
 const actions=[...w.matchAll(/uses:\s*(\S+)/g)].map(m=>m[1]);
 assert.equal(actions.length,5);
 for(const a of actions)assert.match(a,/^actions\/(?:checkout|setup-node|upload-artifact)@[0-9a-f]{40}$/);
});
test('protected signing secret reaches signing step only, not preflight or global job env',()=>{
 assert.doesNotMatch(pre,/QA_FIXTURE_SIGNING_PKCS8_B64|secrets\./);
 const keyword='QA_FIXTURE_SIGNING_PKCS8_B64:';
 assert.equal(sign.split(keyword).length-1,1);
 assert.match(sign,/      - name: Sign exact reviewed source bytes[^]*?        env:\n[^]*?QA_FIXTURE_SIGNING_PKCS8_B64: \$\{\{ secrets\.QA_FIXTURE_SIGNING_PKCS8_B64 \}\}/);
 assert.match(sign,/QA_FIXTURE_PUBLISHER_SPKI_SHA256: \$\{\{ vars\.QA_FIXTURE_PUBLISHER_SPKI_SHA256 \}\}/);
});
test('source SHA and fixture inventory verified twice, after environment gate approval',()=>{
 assert.match(pre,/publisher\.cjs plan/);assert.match(sign,/publisher\.cjs plan/);
 assert.match(sign,/publisher\.cjs sign/);
 assert.match(sign,/test "\$\(git rev-parse HEAD\)" = "\$QA_APPROVED_COMMIT"/);
});
test('signing artifact upload excludes hidden files, private material and uses short retention',()=>{
 assert.match(sign,/include-hidden-files: false/);assert.match(sign,/retention-days: 1/);
 assert.match(sign,/path: \$\{\{ runner\.temp \}\}\/qa-signed\//);
 assert.doesNotMatch(w,/persist-credentials: true/);
 assert.match(w,/persist-credentials: false/g);
});

test('both signing stages pin the reviewed Node22 toolchain by immutable action SHA',()=>{
 const setup='actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020';
 for(const part of [pre,sign]){
   assert.match(part,new RegExp('uses: '+setup));
   assert.match(part,/node-version:\s*'22'/);
 }
 assert.equal(w.split(setup).length-1,2);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('Capacitor Android foundation is isolated from the existing PWA deploy', () => {
  const pkg = JSON.parse(read('package.json'));
  const config = JSON.parse(read('capacitor.config.json'));
  const workflow = read('.github/workflows/deploy-pages.yml');

  assert.equal(pkg.private, true);
  assert.equal(pkg.dependencies['@capacitor/core'], '8.5.2');
  assert.equal(pkg.dependencies['@capacitor/android'], '8.5.2');
  assert.equal(pkg.devDependencies['@capacitor/cli'], '8.5.2');
  assert.equal(config.appId, 'com.travelmate.app');
  assert.equal(config.appName, 'TravelMate');
  assert.equal(config.webDir, 'dist');

  for (const excluded of ['android', 'node_modules', 'dist', 'package.json', 'package-lock.json', 'capacitor.config.json']) {
    assert.match(workflow, new RegExp(`--exclude='${excluded.replace('.', '\\.')}'`));
  }
});

test('native staging copies only the runtime web roots', () => {
  const stage = read('tools/stage-native-web.mjs');
  assert.match(stage, /const files = \['index\.html', 'manifest\.webmanifest', 'sw\.js'\]/);
  assert.match(stage, /const directories = \['assets', 'trip'\]/);
  assert.doesNotMatch(stage, /supabase/);
  assert.doesNotMatch(stage, /docs/);
});

test('Android shell identity and version match TravelMate 2.20.3', () => {
  const gradle = read('android/app/build.gradle');
  const variables = read('android/variables.gradle');
  const mainActivity = read('android/app/src/main/java/com/travelmate/app/MainActivity.java');
  const instrumented = read('android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java');
  const unit = read('android/app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java');
  const manifest = read('android/app/src/main/AndroidManifest.xml');

  assert.match(gradle, /namespace = "com\.travelmate\.app"/);
  assert.match(variables, /minSdkVersion = 26/);
  assert.match(gradle, /applicationId "com\.travelmate\.app"/);
  assert.match(gradle, /versionCode 22003/);
  assert.match(gradle, /versionName "2\.20\.3"/);
  assert.match(mainActivity, /package com\.travelmate\.app;/);
  assert.match(instrumented, /package com\.travelmate\.app;/);
  assert.match(instrumented, /assertEquals\("com\.travelmate\.app", appContext\.getPackageName\(\)\)/);
  assert.match(unit, /package com\.travelmate\.app;/);
  assert.match(manifest, /android:supportsRtl="true"/);
  assert.match(manifest, /android\.permission\.INTERNET/);
});

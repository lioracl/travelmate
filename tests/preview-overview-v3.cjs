'use strict';
// Test-only launcher. Uses the exact fixture consumed by overview-v3.spec.js.
// No auth cookies, Turnstile overrides, fake sessions or production writes.
const path = require('node:path');
const fs = require('node:fs');
let playwrightRoot;
try { playwrightRoot = path.dirname(require.resolve('playwright/package.json')); }
catch (_) {
  playwrightRoot = path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
}
const playwright = require(playwrightRoot);
const {open} = require('./e2e/fixtures/overview-v3.cjs');

(async () => {
  if (process.argv[2] === '--report' || process.argv[2] === '--full-report') {
    const full = process.argv[2] === '--full-report';
    const child = require('node:child_process').spawn(process.execPath,[
      path.join(playwrightRoot,'cli.js'),'show-report',path.resolve(full ? '.cache/v3/finalization-report' : '.cache/v3/preview-report'),
      '--host','127.0.0.1','--port',full ? '9330' : '9323'
    ],{stdio:'inherit'});
    const code = await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
    process.exitCode = code || 0;
    return;
  }
  const width = Number(process.argv[2] || 390);
  if (![360,390,430,768].includes(width)) throw new Error('Choose 360, 390, 430 or 768 CSS pixels.');
  const browser = await playwright.chromium.launch({channel:'chrome',headless:false});
  const context = await browser.newContext({
    baseURL:'http://127.0.0.1:4173',viewport:{width,height:844},
    locale:'he-IL',timezoneId:'Asia/Jerusalem',serviceWorkers:'block'
  });
  const output = path.resolve('.cache/v3/interactive');
  fs.mkdirSync(output,{recursive:true});
  await context.tracing.start({screenshots:true,snapshots:true,sources:true});
  const page = await context.newPage();
  page.on('console',msg=>{if(msg.type()==='error') console.log('Browser:',msg.text());});
  await open(page);
  await page.bringToFront();
  console.log(`Overview V3 fixture ready in Chrome (${width}px). Interact with this window, not a normal localhost tab.`);
  console.log('Synthetic trip and weather only. Cloud requests are blocked by the existing fixture; authenticated features remain unavailable.');
  console.log('Close the window to end the isolated preview. Reload resets fixture data.');
  await new Promise(resolve=>page.once('close',resolve));
  try { await context.tracing.stop({path:path.join(output,`interaction-${width}.zip`)}); } catch (_) {}
  await browser.close();
})().catch(error=>{console.error(error);process.exitCode=1;});

'use strict';
const path=require('node:path');process.env.TRAVELMATE_V3_TEST_PORT='4174';
let root;try{root=path.dirname(require.resolve('playwright/package.json'));}catch(_){root=path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const {open}=require('./e2e/fixtures/plan-v3.cjs');
(async()=>{
 if(process.argv[2]==='--report'){
  const child=require('node:child_process').spawn(process.execPath,[path.join(root,'cli.js'),'show-report',path.resolve('.cache/plan-v3/focused-report'),'--host','127.0.0.1','--port','9341'],{stdio:'inherit'});
  process.exitCode=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});return;
 }
 const width=Number(process.argv[2]||390),theme=process.argv[3]||'light';if(![360,390,430,768,1440].includes(width)||!['light','dark'].includes(theme))throw Error('Choose a supported QA width and light/dark.');
 const browser=await require(root).chromium.launch({channel:'chrome',headless:false}),context=await browser.newContext({viewport:{width,height:900},locale:'he-IL',timezoneId:'Asia/Jerusalem',serviceWorkers:'block'});
 const page=await context.newPage();await open(page,{theme});await page.bringToFront();console.log('Plan V3 isolated fixture on port 4174. Synthetic data only; no real account/cloud connection.');
 await new Promise(resolve=>page.once('close',resolve));await browser.close();
})().catch(error=>{console.error(error);process.exitCode=1;});

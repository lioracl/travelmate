const path=require('node:path');process.env.TRAVELMATE_V3_TEST_PORT='4175';
const base=require('../playwright.config');
module.exports={...base,testDir:path.resolve(__dirname,'e2e'),testMatch:['places-v3.spec.js','nearby-soft-time.spec.js','places-hebrew-wrap.spec.js'],retries:0,workers:2,outputDir:path.resolve(__dirname,'../.cache/places-v3/focused-results'),reporter:[['line'],['html',{outputFolder:path.resolve(__dirname,'../.cache/places-v3/focused-report'),open:'never'}]],use:{...base.use,baseURL:'http://127.0.0.1:4175',channel:'chrome',serviceWorkers:'block',trace:'on',video:'on'}};

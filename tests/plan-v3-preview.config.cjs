const path=require('node:path'),base=require('../playwright.config');
process.env.TRAVELMATE_V3_TEST_PORT='4174';
module.exports={...base,testDir:path.resolve(__dirname,'e2e'),testMatch:['plan-v3.spec.js','plan-integration.spec.js','smart-trip-decisions.spec.js'],retries:0,workers:2,
 outputDir:path.resolve('.cache/plan-v3/focused-results'),reporter:[['line'],['html',{outputFolder:path.resolve('.cache/plan-v3/focused-report'),open:'never'}]],
 use:{...base.use,baseURL:'http://127.0.0.1:4174',channel:'chrome',trace:'on',video:'on'}};

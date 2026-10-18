const path=require('node:path');
const base=require('../playwright.config');
module.exports={...base,testDir:path.resolve(__dirname,'e2e'),testMatch:'all-trips-v3.spec.js',retries:0,workers:2,
 outputDir:path.resolve('.cache/v3/all-trips-results'),reporter:[['line'],['html',{outputFolder:path.resolve('.cache/v3/all-trips-report'),open:'never'}]],
 use:{...base.use,channel:'chrome',serviceWorkers:'block',trace:'on',video:'on'}};

const path = require('node:path');
const base = require('../playwright.config');
module.exports = {
  ...base,
  testDir:path.resolve(__dirname,'e2e'),
  testMatch:'overview-v3.spec.js',
  outputDir:path.resolve(__dirname,'../.cache/v3/preview-results'),
  retries:0,workers:2,
  reporter:[['line'],['html',{outputFolder:path.resolve(__dirname,'../.cache/v3/preview-report'),open:'never'}]],
  use:{...base.use,channel:'chrome',serviceWorkers:'block',trace:'on',screenshot:'on'}
};

import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const site=path.resolve(process.argv[2]||'');
if(!process.argv[2]||site===source)throw Error('Provide a separate staged site directory');
const sha=process.env.TRAVELMATE_WEB_BUILD_SHA||execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim();
if(!/^[a-f0-9]{40}$/.test(sha))throw Error('Web build requires an exact SHA');
const version=fs.readFileSync(path.join(source,'assets','about.js'),'utf8').match(/version: '([^']+)'/)[1];
const worker=path.join(site,'sw.js');
const originalWorker=fs.readFileSync(worker,'utf8');
const schema=originalWorker.match(/const CACHE_SCHEMA='([^']+)'/)[1];
const originalRevision=originalWorker.match(/const ASSET_VERSION='([^']+)'/)[1];
const build={version,sha,...(process.env.TRAVELMATE_WEB_CHANNEL==='preview'?{channel:'preview'}:{}),cacheRevision:'travelmate-smart-'+schema+'-'+sha};

function walk(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const target=path.join(dir,entry.name);
    if(entry.isDirectory()){walk(target);continue;}
    if(!/\.(html|js|css|webmanifest)$/.test(entry.name))continue;
    let text=fs.readFileSync(target,'utf8');
    text=text.replace(/\?v=(?:20\d{6}-\d+|[a-f0-9]{40})/g,'?v='+sha);
    if(target===worker)text=text.replace(/const ASSET_VERSION='[^']+'/,"const ASSET_VERSION='"+sha+"'");
    if(target===path.join(site,'assets','app.js'))text=text.split(originalRevision).join(sha);
    if(entry.name==='index.html'){
      const diagnostic=path.relative(path.dirname(target),path.join(site,'assets','web-build.js')).replaceAll('\\','/');
      text=text.replace(/<script\b[^>]*src=["'][^"']*assets\/web-build\.js[^"']*["'][^>]*><\/script>\s*/g,'');
      text=text.replace(/(<script\b[^>]*src=["'])([^"']*assets\/app\.js)/,'<script src="'+diagnostic+'?v='+sha+'"></script>\n$1$2');
    }
    fs.writeFileSync(target,text);
  }
}
walk(site);
fs.writeFileSync(path.join(site,'build-info.json'),JSON.stringify(build,null,2)+'\n');
fs.writeFileSync(path.join(site,'assets','web-build.js'),'window.TravelMateWebBuild=Object.freeze('+JSON.stringify(build)+');\n');

// Cache feature code before activation, so accepting an update also preserves offline startup.
// Native bridge wiring remains exclusively in stage-native-web.mjs.
const nativeOnly=['native-widget-snapshot.js','budget-widget-actions.js'];
const bundles=fs.readdirSync(path.join(site,'assets'))
  .filter(name=>/\.(js|css)$/.test(name)&&!nativeOnly.includes(name))
  .map(name=>'./assets/'+name);
let stampedWorker=fs.readFileSync(worker,'utf8');
stampedWorker=stampedWorker.replace(/^CORE_PATHS\.push\(\.\.\.\[.*\]\);\n/m,'');
stampedWorker=stampedWorker.replace(/const CORE=(?:\[\.\.\.new Set\(CORE_PATHS\)\]|CORE_PATHS)\.map/,
  'CORE_PATHS.push(...'+JSON.stringify(bundles)+');\nconst CORE=[...new Set(CORE_PATHS)].map');
fs.writeFileSync(worker,stampedWorker);
console.log(JSON.stringify(build));

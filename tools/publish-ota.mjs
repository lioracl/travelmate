import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash,sign,createPublicKey,verify} from 'node:crypto';
const [directory,output]=process.argv.slice(2);
if(!directory||!output)throw Error('Usage: publish-ota.mjs staged-native-site output-directory');
const build=JSON.parse(fs.readFileSync(path.join(directory,'build-info.json')));
const contract=JSON.parse(fs.readFileSync(new URL('../native-overlay.json',import.meta.url)));
const key=process.env.TRAVELMATE_OTA_PRIVATE_KEY||fs.readFileSync(process.env.TRAVELMATE_OTA_PRIVATE_KEY_FILE||'','utf8');
const out=path.resolve(output),target=path.join(out,build.sha);fs.mkdirSync(target,{recursive:true});
if(fs.existsSync(path.join(target,'bundle.zip')))throw Error('Refuse to replace immutable bundle');
// Python zipfile is available on Actions and the local Android build host.
execFileSync(process.env.PYTHON||'python',['-c',`import pathlib,zipfile,sys
root=pathlib.Path(sys.argv[1]); target=sys.argv[2]
with zipfile.ZipFile(target,'x',zipfile.ZIP_DEFLATED) as z:
 for p in sorted(root.rglob('*')):
  if p.is_file(): z.write(p,p.relative_to(root).as_posix())`,path.resolve(directory),path.join(target,'bundle.zip')]);
const zip=fs.readFileSync(path.join(target,'bundle.zip'));
const manifest={schemaVersion:1,sha:build.sha,version:build.version,nativeApiLevel:contract.nativeApiLevel,url:`https://lioracl.github.io/travelmate/ota/${build.sha}/bundle.zip`,sha256:createHash('sha256').update(zip).digest('hex'),bundleSignature:sign('RSA-SHA256',zip,key).toString('base64'),createdAt:new Date().toISOString()};
const payload=Buffer.from(JSON.stringify(manifest));
const envelope={payload:payload.toString('base64'),signature:sign('RSA-SHA256',payload,key).toString('base64')};
if(!verify('RSA-SHA256',zip,createPublicKey(key),Buffer.from(manifest.bundleSignature,'base64')))throw Error('Signature self-check failed');
fs.writeFileSync(path.join(target,'manifest.json'),JSON.stringify(envelope,null,2)+'\n');
fs.writeFileSync(path.join(out,'latest.json'),JSON.stringify(envelope,null,2)+'\n');
console.log(JSON.stringify({sha:build.sha,sha256:manifest.sha256,nativeApiLevel:manifest.nativeApiLevel}));

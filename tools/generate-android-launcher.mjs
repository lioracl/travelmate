// One deterministic pipeline; reviewed source hashes prevent accidental artwork replacement.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng, sample } from './png-raster.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source=path.join(root,'tools/icon-source');
const check=process.argv.includes('--check');
const hashes=JSON.parse(fs.readFileSync(path.join(source,'sources.json')));
for(const [name,hash] of Object.entries(hashes)) {
  if(crypto.createHash('sha256').update(fs.readFileSync(path.join(source,name))).digest('hex')!==hash)throw new Error('Unreviewed icon source: '+name);
}
const fg=decodePng(path.join(source,'foreground.png')), bg=decodePng(path.join(source,'background.png'));
let left=fg.width,right=0,top=fg.height,bottom=0;
for(let y=0;y<fg.height;y++)for(let x=0;x<fg.width;x++)if(fg.pixels[(y*fg.width+x)*4+3]>16){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
const cx=(left+right)/2,cy=(top+bottom)/2;
let radius=0;
for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++)if(fg.pixels[(y*fg.width+x)*4+3]>16)radius=Math.max(radius,Math.hypot(x-cx,y-cy));
if(radius<fg.width*.2)throw new Error('Empty foreground');
function raster(size,mode){
  const pixels=Buffer.alloc(size*size*4), safe=mode==='foreground'?.298:mode==='maskable'?.385:.445;
  const scale=size*safe/radius;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=(y*size+x)*4;
    const f=mode==='background'?{rgb:[0,0,0],alpha:0}:sample(fg,cx+(x+.5-size/2)/scale,cy+(y+.5-size/2)/scale);
    if(mode==='foreground'){for(let c=0;c<3;c++)pixels[i+c]=Math.round(f.rgb[c]);pixels[i+3]=Math.round(f.alpha*255);continue;}
    const b=sample(bg,Math.min(bg.width-1,(x+.5)*bg.width/size-.5),Math.min(bg.height-1,(y+.5)*bg.height/size-.5));
    for(let c=0;c<3;c++)pixels[i+c]=Math.round(f.rgb[c]*f.alpha+b.rgb[c]*(1-f.alpha));
    pixels[i+3]=mode==='round'?Math.round(255*Math.max(0,Math.min(1,size/2-Math.hypot(x+.5-size/2,y+.5-size/2)))):255;
  }
  return encodePng(size,size,pixels);
}
let count=0;
function output(relative,bytes){const target=path.join(root,relative);if(check){if(!fs.existsSync(target)||!fs.readFileSync(target).equals(bytes))throw new Error('Icon output drift: '+relative);}else fs.writeFileSync(target,bytes);count++;}
for(const [density,size] of Object.entries({mdpi:48,hdpi:72,xhdpi:96,xxhdpi:144,xxxhdpi:192})){
  const dir='android/app/src/main/res/mipmap-'+density+'/';
  output(dir+'ic_launcher.png',raster(size,'regular'));
  output(dir+'ic_launcher_round.png',raster(size,'round'));
  output(dir+'ic_launcher_foreground.png',raster(size*9/4,'foreground'));
  output(dir+'ic_launcher_background.png',raster(size*9/4,'background'));
}
for(const size of [48,72,180,192,512])output('assets/icons/travelmate-'+size+'.png',raster(size,'regular'));
for(const size of [192,512])output('assets/icons/travelmate-maskable-'+size+'.png',raster(size,'maskable'));
output('assets/icons/travelmate-adaptive-source.png',raster(432,'foreground'));
output('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png',raster(1024,'regular'));
output('assets/app-icon.svg',Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><title>TravelMate scenic pin airplane AI</title><image width="512" height="512" href="data:image/png;base64,'+raster(512,'regular').toString('base64')+'"/></svg>\n'));
console.log((check?'Verified':'Generated')+' '+count+' scenic icon assets');

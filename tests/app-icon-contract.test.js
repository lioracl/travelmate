'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
function pngSize(path){const b=fs.readFileSync(path);assert.equal(b.toString('hex',0,8),'89504e470d0a1a0a',path+' png signature');return [b.readUInt32BE(16),b.readUInt32BE(20)];}
test('TravelMate icon manifest exposes regular and maskable install assets',()=>{const m=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));const keys=new Set(m.icons.map(i=>i.src+'|'+i.sizes+'|'+i.purpose));for(const k of ['./assets/icons/travelmate-192.png|192x192|any','./assets/icons/travelmate-512.png|512x512|any','./assets/icons/travelmate-maskable-192.png|192x192|maskable','./assets/icons/travelmate-maskable-512.png|512x512|maskable'])assert.ok(keys.has(k),k);});
test('PWA icon raster sizes and home-screen links are complete',()=>{for(const n of [48,72,180,192,512])assert.deepEqual(pngSize('assets/icons/travelmate-'+n+'.png'),[n,n]);for(const n of [192,512])assert.deepEqual(pngSize('assets/icons/travelmate-maskable-'+n+'.png'),[n,n]);for(const file of ['index.html','trip/custom/index.html','trip/italy-2028/index.html','trip/japan-2027/index.html']){const s=fs.readFileSync(file,'utf8');assert.match(s,/travelmate-48\.png/);assert.match(s,/travelmate-180\.png/);}});
test('Android launcher density and adaptive foreground assets have expected geometry',()=>{const legacy={mdpi:48,hdpi:72,xhdpi:96,xxhdpi:144,xxxhdpi:192};const fg={mdpi:108,hdpi:162,xhdpi:216,xxhdpi:324,xxxhdpi:432};for(const [d,n] of Object.entries(legacy)){for(const name of ['ic_launcher.png','ic_launcher_round.png'])assert.deepEqual(pngSize('android/app/src/main/res/mipmap-'+d+'/'+name),[n,n]);}for(const [d,n] of Object.entries(fg))assert.deepEqual(pngSize('android/app/src/main/res/mipmap-'+d+'/ic_launcher_foreground.png'),[n,n]);const bg=fs.readFileSync('android/app/src/main/res/values/ic_launcher_background.xml','utf8');assert.match(bg,/#173E47/);assert.doesNotMatch(bg,/#F5FAF8/);});
test('canonical icon keeps pin airplane AI sparkle and unread badge remains dynamic',()=>{const s=fs.readFileSync('assets/app-icon.svg','utf8');assert.match(s,/M256 62c-91\.68/);assert.match(s,/M179 248l51 13/);assert.match(s,/M357 306l7 20/);assert.match(s,/>AI<\/text>/);assert.doesNotMatch(s,/unread|notification-badge/i);});
test('service worker caches all install icon assets',()=>{const sw=fs.readFileSync('sw.js','utf8');for(const n of ['48','72','180','192','512','maskable-192','maskable-512'])assert.match(sw,new RegExp('travelmate-'+n+'\\.png'));});

const zlib = require('node:zlib');
function generatedCorner(path) {
  const png = fs.readFileSync(path);
  const chunks = [];
  for (let i = 8; i < png.length;) {
    const len = png.readUInt32BE(i), type = png.toString('ascii', i + 4, i + 8);
    if (type === 'IDAT') chunks.push(png.subarray(i + 8, i + 8 + len));
    i += len + 12;
  }
  assert.equal(png[25], 6, path + ' must be RGBA');
  const pixels = zlib.inflateSync(Buffer.concat(chunks));
  assert.equal(pixels[0], 0, path + ' first scanline uses filter 0');
  return [...pixels.subarray(1, 5)];
}
test('Android launcher has no opaque white corner and round fallback is transparent', () => {
  for (const density of ['mdpi','hdpi','xhdpi','xxhdpi','xxxhdpi']) {
    const base = 'android/app/src/main/res/mipmap-' + density + '/';
    const [r,g,b,a] = generatedCorner(base + 'ic_launcher.png');
    assert.equal(a, 255);
    assert.ok(r < 90 && g < 150 && b < 160, density + ' corner should be dark turquoise, not white');
    assert.equal(generatedCorner(base + 'ic_launcher_round.png')[3], 0);
    assert.equal(generatedCorner(base + 'ic_launcher_foreground.png')[3], 0);
  }
  assert.ok(fs.existsSync('assets/icons/travelmate-adaptive-source.png'));
  assert.ok(fs.existsSync('tools/generate-android-launcher.mjs'));
});

test('adaptive artwork stays inside the Android 66dp circular safe area', () => {
  for (const density of ['mdpi','hdpi','xhdpi','xxhdpi','xxxhdpi']) {
    const png=fs.readFileSync('android/app/src/main/res/mipmap-'+density+'/ic_launcher_foreground.png');
    const size=png.readUInt32BE(16), chunks=[];
    for(let at=8;at<png.length;){const n=png.readUInt32BE(at);if(png.toString('ascii',at+4,at+8)==='IDAT')chunks.push(png.subarray(at+8,at+8+n));at+=n+12;}
    const raw=zlib.inflateSync(Buffer.concat(chunks));
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const alpha=raw[y*(size*4+1)+1+x*4+3];
      if(alpha>16)assert.ok(Math.hypot(x+.5-size/2,y+.5-size/2)<=size*33/108,density+' artwork exceeds safe circle');
    }
  }
});

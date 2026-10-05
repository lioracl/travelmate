'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const source=fs.readFileSync('assets/profile-wizard.js','utf8');
const css=fs.readFileSync('assets/profile-wizard.css','utf8');

test('source photos may reach 20MB while normalized avatars stay 512px and at most 2MB',()=>{
  assert.match(source,/SOURCE_MAX_BYTES=20\*1024\*1024/);
  assert.match(source,/UPLOAD_MAX_BYTES=2\*1024\*1024/);
  assert.match(source,/OUTPUT_SIZE=512/);
  assert.match(source,/file\.size\)>SOURCE_MAX_BYTES/);
  assert.match(source,/blob\.size<=UPLOAD_MAX_BYTES/);
  assert.match(source,/AVATAR_NORMALIZED_TOO_LARGE/);
});

test('source bytes and browser decode are both validated with orientation-safe decoding',()=>{
  assert.match(source,/signatureMatches\(new Uint8Array\(header\)/);
  assert.match(source,/image\/jpeg[\s\S]*bytes\[0\]===255/);
  assert.match(source,/image\/png[\s\S]*137,80,78,71,13,10,26,10/);
  assert.match(source,/image\/webp[\s\S]*RIFF[\s\S]*WEBP/);
  assert.match(source,/options=\{imageOrientation:'from-image'\}/);
  assert.match(source,/image\.onerror/);
});

test('camera and gallery are explicit separate inputs and only camera requests capture',()=>{
  assert.match(source,/data-profile-camera accept="image\/jpeg,image\/png,image\/webp" capture="user"/);
  assert.match(source,/data-profile-gallery accept="image\/jpeg,image\/png,image\/webp"/);
  const gallery=(source.match(/<input type="file" data-profile-gallery[^>]*/)||[''])[0];
  assert.doesNotMatch(gallery,/capture=/);
});

test('six illustrated avatar styles are explicit choices rather than photo filters',()=>{
  const styles=(source.match(/var STYLE_DEFINITIONS[\s\S]*?\n\]\);/)||[''])[0];
  assert.deepEqual([...styles.matchAll(/id:'([^']+)'/g)].map(m=>m[1]),['classic','tokyo-neon','japanese-calm','beach-journey','manga-action','cinematic']);
  for(const style of ['classic','tokyo-neon','japanese-calm','beach-journey','manga-action','cinematic'])assert.ok(fs.existsSync('assets/profile-avatar-previews/'+style+'.svg'));
  assert.doesNotMatch(styles,/filter|saturate|sepia|grayscale/);
  assert.match(source,/isPlaceholder:false/);assert.match(source,/type="radio" name="avatarStyle"/);
  assert.match(source,/selectedStyle=event.target.value/);assert.match(source,/onboarding.avatarStyle=selectedStyle/);
  assert.match(css,/grid-template-columns:repeat\(2,minmax/);
});

test('step two re-enables its next action after generated style selection',()=>{
  assert.match(source,/else if\(step===2\).*selectedResult\(\)/);
  assert.match(source,/if\(step===2\)el\('\[data-profile-next\]'\)\.disabled=!chosen/);
});

test('review writes only explicit canonical preferences and preserves Auth display identity',()=>{
  assert.match(source,/normalizePreferences\(\{pace:/);
  assert.match(source,/activityDensity:/);
  assert.match(source,/transport:/);
  assert.match(source,/tripStyle:/);
  assert.match(source,/interests:interests/);
  assert.match(source,/learningEnabled:/);
  assert.match(source,/name="displayName" maxlength="80"/);
  assert.match(source,/updateProfileForOwner\(saveOwner,displayName,preferences,/);
  assert.doesNotMatch(source,/infer|guess|prediction/i);
});

test('offline, account-switch, decode-race and cleanup safeguards are explicit',()=>{
  assert.match(source,/navigator\.onLine===false/);
  assert.match(source,/String\(session\.user\.id\)===expectedOwner/);
  assert.match(source,/AUTH_CONTEXT_CHANGED/);
  assert.match(source,/sourceGeneration/);
  assert.match(source,/generation!==sourceGeneration/);
  assert.match(source,/typeof decoded\.close==='function'/);
  assert.match(source,/revokeObjectURL/);
  assert.match(source,/base\.width=0;base\.height=0/);
  assert.match(source,/avatarSaved\?'התמונה נשמרה/);
  assert.doesNotMatch(source,/localStorage|indexedDB|queue/i);
});

test('wizard focus, touch, reduced-motion and 390/430 geometry remain bounded',()=>{
  assert.match(source,/role="dialog" aria-modal="true"/);
  assert.match(source,/aria-live="polite"/);
  assert.match(source,/event\.key==='Escape'/);
  assert.match(source,/event\.key!=='Tab'/);
  assert.match(source,/event\.stopPropagation\(\)/);
  assert.match(source,/setAttribute\('tabindex','-1'\)/);
  assert.match(css,/min-height:4[48]px/);
  assert.match(css,/@media\(max-width:520px\)/);
  assert.match(css,/width:min\(680px,100%\)/);
  assert.match(css,/max-height:calc\(100dvh - 36px\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(css,/!important/);
});

test('2.17.0 assets and cache versions are synchronized',()=>{
  const html=fs.readFileSync('index.html','utf8'),sw=fs.readFileSync('sw.js','utf8'),about=fs.readFileSync('assets/about.js','utf8');
  const version=sw.match(/const ASSET_VERSION='([^']+)'/)[1];
  assert.match(html,new RegExp('profile-wizard\\.js\\?v='+version));
  assert.match(html,new RegExp('profile-wizard\\.css\\?v='+version));
  assert.match(sw,/\.\/assets\/profile-wizard\.js/);
  assert.match(sw,/\.\/assets\/profile-wizard\.css/);
  assert.equal(version,'20261005-06');
  assert.match(about,/version: '2\.17\.0'/);
  assert.match(about,/Personalized Suggestions - 2\.17\.0/);
});

test('wizard keeps normal next-state logic while direct interests mode bypasses navigation',()=>{
  assert.match(source,/wizardMode!=='interests'/);
  assert.match(source,/step===1\?\(!decodedImage&&!onboarding.photo\):!selectedResult\(\)/);
  assert.match(source,/wizardMode==='interests'\?3:1/);
});

test('three-step onboarding collects approved interests without enabling learning',()=>{
  for(const text of ['יצירת פרופיל אישי','הוספת תמונה','בחירת אווטר','תחומי עניין','אפשר לשנות אחר כך'])assert.ok(source.includes(text));
  for(const key of ['food','nature','beaches','culture','history','museums','shopping','nightlife','families','hiking','photography','technology'])assert.ok(source.includes("id:'"+key+"'"));
  assert.match(source,/onboarding.interestTags=interests.slice\(\)/);
  assert.match(source,/onboarding=\{photo:null,avatarStyle:'',interestTags:\[\]\}/);
  assert.match(source,/כבוי כברירת מחדל/);assert.match(source,/>סיום<\/button>/);
  assert.doesNotMatch(source,/length>6|renderExistingStyle/);
});

test('real photo can be saved without AI and direct interests editing skips photo/avatar steps',()=>{
  assert.match(source,/data-profile-use-photo/);
  assert.match(source,/השתמש בתמונה האמיתית בלי ליצור אווטר/);
  assert.match(source,/profileImageKind==='photo'/);
  assert.match(source,/normalizedCurrentPhoto/);
  assert.match(source,/updatePreferencesForOwner\(saveOwner,preferences\)/);
  assert.match(source,/data-profile-interests-open/);
  assert.match(source,/wizardMode=mode==='interests'\?'interests':'full'/);
  assert.match(source,/progress\.hidden=direct/);
  assert.match(css,/profile-use-photo/);
  assert.match(css,/data-profile-mode="interests"/);
  assert.match(css,/object-fit:contain/);
});

test('wizard rejects filename/type mismatches and enforces the exact 20MB source boundary',()=>{
  const vm=require('node:vm'),window={};vm.runInNewContext(source,{window});const check=window.TravelMateProfileWizard.sourceFileCheck;
  assert.equal(check({name:'photo.JPG',type:'image/jpeg',size:20*1024*1024}).ok,true);
  assert.equal(check({name:'photo.jpg',type:'image/jpeg',size:20*1024*1024+1}).ok,false);
  assert.equal(check({name:'photo.png',type:'image/jpeg',size:1000}).ok,false);
  assert.equal(check({name:'photo.svg',type:'image/svg+xml',size:1000}).ok,false);
});

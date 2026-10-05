'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function imageFile(name,type,size=1200){
  const bytes=type==='image/png'?[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]:type==='image/webp'?[0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x45,0x42,0x50]:[0xff,0xd8,0xff,0xe0];
  return {name,type,size,arrayBuffer:async()=>Uint8Array.from(bytes).buffer};
}
function boot({user,updateError=null,rpcErrorAfterCommit=null,uploadError=null,online=true,afterUpload=null,afterScopedUpdate=null,afterScopedProfileUpdate=null,afterCas=null,removeErrors=[],decodeOk=true,allowProfileUpdate=false}={}){
  const removed=[],uploaded=[],updates=[],profileUpdates=[];let sessionUser=user,removeIndex=0;
  const storageApi={from:bucket=>({
    upload:async(path,file,options)=>{uploaded.push({bucket,path,file,options});if(uploadError)return {data:null,error:uploadError};if(afterUpload)afterUpload({path,setUser:value=>{sessionUser=value}});return {data:{path},error:null}},
    getPublicUrl:path=>({data:{publicUrl:'https://cdn.example.test/'+bucket+'/'+path}}),
    remove:async paths=>{removed.push(...paths);var error=removeErrors[removeIndex++]||null;return {data:error?null:paths,error}}
  })};
  const mainClient={auth:{
    getSession:async()=>({data:{session:sessionUser?{user:sessionUser,access_token:'access-'+sessionUser.id,refresh_token:'refresh-'+sessionUser.id}:null},error:null}),
    getUser:async()=>({data:{user:sessionUser},error:null}),
    updateUser:async payload=>{if(!allowProfileUpdate)throw new Error('MAIN_CLIENT_UPDATE_FORBIDDEN');profileUpdates.push(payload);sessionUser={...sessionUser,user_metadata:{...(sessionUser.user_metadata||{}),...((payload&&payload.data)||{})}};return {data:{user:sessionUser},error:null}}
  },storage:storageApi};
  function scopedFactory(session){
    let scopedUser={...session.user,user_metadata:{...(session.user.user_metadata||{})}};
    return {auth:{
      getSession:async()=>({data:{session:{user:scopedUser,access_token:session.access_token,refresh_token:session.refresh_token}},error:null}),
      getUser:async()=>({data:{user:scopedUser},error:null}),
      updateUser:async payload=>{profileUpdates.push({owner:scopedUser.id,payload});scopedUser={...scopedUser,user_metadata:{...(scopedUser.user_metadata||{}),...((payload&&payload.data)||{})}};if(sessionUser&&String(sessionUser.id)===String(scopedUser.id))sessionUser=scopedUser;if(afterScopedProfileUpdate)afterScopedProfileUpdate({setUser:value=>{sessionUser=value}});return {data:{user:scopedUser},error:null}}
    },storage:storageApi,rpc:async(name,payload)=>{
      updates.push({owner:scopedUser.id,name,payload});if(afterScopedUpdate)afterScopedUpdate({setUser:value=>{sessionUser=value}});if(updateError)return {data:null,error:updateError};
      const meta=scopedUser.user_metadata||{};
      const same=String(meta.avatar_url||'')===String(payload.p_expected_avatar_url||'')&&String(meta.avatar_path||'')===String(payload.p_expected_avatar_path||'')&&Boolean(meta.avatar_removed===true)===Boolean(payload.p_expected_avatar_removed);
      if(!same)return {data:false,error:null};
      scopedUser={...scopedUser,user_metadata:{...meta,avatar_url:payload.p_new_avatar_url,avatar_path:payload.p_new_avatar_path,avatar_removed:Boolean(payload.p_new_avatar_removed)}};
      if(afterCas)afterCas({payload,setScopedUser:value=>{scopedUser=value},getScopedUser:()=>scopedUser,setUser:value=>{sessionUser=value}});
      if(rpcErrorAfterCommit)return {data:null,error:rpcErrorAfterCommit};
      return {data:true,error:null};
    }};
  }
  const window={__travelMateSupabaseClient:mainClient,__travelMateAvatarClientFactory:async session=>scopedFactory(session),__travelMateAvatarDecode:async()=>decodeOk,TravelMateUserProfile:{normalizePreferences:value=>value},crypto:{randomUUID:()=> '11111111-2222-4333-8444-555555555555'},dispatchEvent(){},addEventListener(){}};
  const localStorage={getItem(){return null},setItem(){},removeItem(){}};
  vm.runInNewContext(fs.readFileSync('assets/cloud-sync.js','utf8'),{window,localStorage,document:{},navigator:{onLine:online},setTimeout,clearTimeout,CustomEvent:function(){},console,Math,Date,Error});
  return {cloud:window.TravelMateCloud,uploaded,removed,updates,profileUpdates,setUser:value=>{sessionUser=value}};
}

test('avatar storage migration creates a dedicated public owner-written bucket',()=>{
  const sql=fs.readFileSync('supabase/migrations/20261003182844_profile_avatars.sql','utf8');
  assert.match(sql,/profile-avatars/);
  assert.match(sql,/2097152/);
  assert.match(sql,/image\/jpeg/);assert.match(sql,/image\/png/);assert.match(sql,/image\/webp/);
  assert.match(sql,/public\s*=\s*true/);
  assert.match(sql,/split_part\(name, '\/', 1\) = \(select auth\.uid\(\)\)::text/);
  assert.doesNotMatch(sql,/travel-documents[^\n]*public\s*=\s*true/);
});
test('avatar CAS migration performs one authenticated conditional metadata update',()=>{
  const sql=fs.readFileSync('supabase/migrations/20261003191804_profile_avatar_cas.sql','utf8');
  assert.match(sql,/travelmate_compare_and_set_avatar/);
  assert.match(sql,/update auth\.users/);
  assert.match(sql,/where id = auth\.uid\(\)/);
  assert.match(sql,/p_expected_avatar_url/);
  assert.match(sql,/p_expected_avatar_path/);
  assert.match(sql,/p_expected_avatar_removed/);
  assert.match(sql,/return v_updated = 1/);
  assert.match(sql,/grant execute[\s\S]*authenticated/);
  assert.doesNotMatch(sql,/grant execute[\s\S]*to anon/);
});
test('profile explicit avatar removal suppresses provider fallback',()=>{
  const source=fs.readFileSync('assets/user-profile.js','utf8');
  const sandbox={window:{dispatchEvent(){}},CustomEvent:function(){},location:{href:'https://example.test/'},URL,Date};
  vm.runInNewContext(source,sandbox);
  const profile=sandbox.window.TravelMateUserProfile.fromUser({email:'a@example.test',user_metadata:{picture:'https://example.test/provider.jpg',avatar_removed:true}});
  assert.equal(profile.avatarUrl,'');
  assert.equal(profile.avatarRemoved,true);
});

test('avatar source validation accepts matching JPG PNG WebP through 20MB and rejects larger sources',()=>{
  const {cloud}=boot({user:{id:'A',user_metadata:{}}});
  assert.equal(cloud.validateAvatarFile({name:'me.jpg',type:'image/jpeg',size:100}).ok,true);
  assert.equal(cloud.validateAvatarFile({name:'me.png',type:'image/png',size:100}).ok,true);
  assert.equal(cloud.validateAvatarFile({name:'me.webp',type:'image/webp',size:100}).ok,true);
  assert.equal(cloud.validateAvatarFile({name:'me.svg',type:'image/svg+xml',size:100}).ok,false);
  assert.equal(cloud.validateAvatarFile({name:'me.jpg',type:'image/png',size:100}).ok,false);
  assert.equal(cloud.validateAvatarFile({name:'large.jpg',type:'image/jpeg',size:20*1024*1024}).ok,true);
  assert.equal(cloud.validateAvatarFile({name:'too-large.jpg',type:'image/jpeg',size:20*1024*1024+1}).ok,false);
});

test('avatar upload uses immutable owner path and deletes previous owned object after metadata succeeds',async()=>{
  const user={id:'A',user_metadata:{avatar_path:'A/old.jpg'}};
  const {cloud,uploaded,removed}=boot({user});
  const result=await cloud.uploadAvatar(imageFile('me.png','image/png'));
  assert.equal(result.error,null);
  assert.equal(uploaded.length,1);
  assert.equal(uploaded[0].bucket,'profile-avatars');
  assert.equal(uploaded[0].path,'A/11111111-2222-4333-8444-555555555555.png');
  assert.equal(uploaded[0].options.upsert,false);
  assert.deepEqual(Array.from(removed),['A/old.jpg']);
  assert.match(result.data.user.user_metadata.avatar_url,/profile-avatars\/A\//);
  assert.equal(result.data.user.user_metadata.avatar_removed,false);
});
test('avatar upload rolls back the new object if auth metadata update fails',async()=>{
  const user={id:'A',user_metadata:{}};
  const {cloud,removed}=boot({user,updateError:new Error('META_FAILED')});
  const result=await cloud.uploadAvatar(imageFile('me.webp','image/webp',900));
  assert.match(String(result.error&&result.error.message),/META_FAILED/);
  assert.deepEqual(Array.from(removed),['A/11111111-2222-4333-8444-555555555555.webp']);
});

test('avatar removal never deletes provider or foreign paths',async()=>{
  const user={id:'A',user_metadata:{avatar_url:'https://provider.test/a.jpg',avatar_path:'B/not-mine.jpg'}};
  const {cloud,removed}=boot({user});
  const result=await cloud.removeAvatar();
  assert.equal(result.error,null);
  assert.deepEqual(Array.from(removed),[]);
  assert.equal(result.data.user.user_metadata.avatar_url,null);
  assert.equal(result.data.user.user_metadata.avatar_removed,true);
});

test('avatar upload aborts before metadata mutation when account changes after storage upload',async()=>{
  const userA={id:'A',user_metadata:{}},userB={id:'B',user_metadata:{}};
  const runtime=boot({user:userA,afterUpload:({setUser})=>setUser(userB)});
  const result=await runtime.cloud.uploadAvatar(imageFile('me.png','image/png'));
  assert.match(String(result.error&&result.error.message),/AUTH_CONTEXT_CHANGED/);
  assert.equal(runtime.updates.length,0);
  assert.deepEqual(Array.from(runtime.removed),['A/11111111-2222-4333-8444-555555555555.png']);
});

test('avatar upload rejects a file whose bytes do not match its declared image type',async()=>{
  const runtime=boot({user:{id:'A',user_metadata:{}}});
  const fake={name:'fake.png',type:'image/png',size:100,arrayBuffer:async()=>Uint8Array.from([0xff,0xd8,0xff,0xe0]).buffer};
  const result=await runtime.cloud.uploadAvatar(fake);
  assert.match(String(result.error&&result.error.message),/AVATAR_CONTENT_INVALID/);
  assert.equal(runtime.uploaded.length,0);
});

test('avatar rollback retries cleanup and reports a remaining public-object cleanup failure',async()=>{
  const runtime=boot({user:{id:'A',user_metadata:{}},updateError:new Error('META_FAILED'),removeErrors:[new Error('REMOVE_1'),new Error('REMOVE_2')]});
  const result=await runtime.cloud.uploadAvatar(imageFile('me.webp','image/webp'));
  assert.match(String(result.error&&result.error.message),/META_FAILED/);
  assert.match(String(result.rollbackError&&result.rollbackError.message),/REMOVE_2/);
  assert.equal(runtime.removed.length,2);
});

test('avatar account UI is accessible, explicit, and offline-aware',()=>{
  const home=fs.readFileSync('assets/home.js','utf8');
  const css=fs.readFileSync('assets/cloud-sync.css','utf8');
  assert.match(home,/data-cloud-avatar-input/);
  assert.match(home,/accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(home,/data-cloud-avatar-status role="status" aria-live="polite"/);
  assert.match(home,/navigator\.onLine !== false/);
  assert.match(home,/URL\.createObjectURL/);
  assert.match(home,/travelmate:profile-change/);
  assert.match(css,/\.cloud-avatar-actions[\s\S]*min-height:44px/);
  assert.doesNotMatch(css.slice(css.indexOf('\/\* 2\.13 Profile Avatar \*\/')),/!important/);
});

test('scoped avatar client cannot mutate the account that becomes active during updateUser',async()=>{
  const userA={id:'A',user_metadata:{}},userB={id:'B',user_metadata:{}};
  const runtime=boot({user:userA,afterScopedUpdate:({setUser})=>setUser(userB)});
  const result=await runtime.cloud.uploadAvatar(imageFile('me.jpg','image/jpeg'));
  assert.match(String(result.error&&result.error.message),/AUTH_CONTEXT_CHANGED/);
  assert.equal(runtime.updates.length,2);
  assert.equal(runtime.updates[0].owner,'A');
  assert.match(runtime.updates[0].payload.p_new_avatar_path,/^A\//);
  assert.equal(runtime.updates[1].owner,'A');
  assert.equal(runtime.updates[1].payload.p_new_avatar_path,null);
  assert.equal(runtime.updates.some(item=>item.owner==='B'),false);
  assert.equal(runtime.removed.length,1);
});

test('avatar upload rejects a decodability failure even with a valid file signature',async()=>{
  const runtime=boot({user:{id:'A',user_metadata:{}},decodeOk:false});
  const result=await runtime.cloud.uploadAvatar(imageFile('prefix.jpg','image/jpeg'));
  assert.match(String(result.error&&result.error.message),/AVATAR_CONTENT_INVALID/);
  assert.equal(runtime.uploaded.length,0);
});

test('avatar accepts an exact 2MB stored image and blocks a larger unnormalized upload',async()=>{
  const runtime=boot({user:{id:'A',user_metadata:{}},uploadError:new Error('UPLOAD_FAILED')});
  assert.equal(runtime.cloud.validateAvatarFile({name:'max.jpg',type:'image/jpeg',size:2097152}).ok,true);
  const oversized=await runtime.cloud.uploadAvatar(imageFile('source.jpg','image/jpeg',2097153));
  assert.match(String(oversized.error&&oversized.error.message),/AVATAR_NORMALIZED_TOO_LARGE/);
  assert.equal(runtime.uploaded.length,0);
  const result=await runtime.cloud.uploadAvatar(imageFile('me.jpg','image/jpeg',100));
  assert.match(String(result.error&&result.error.message),/UPLOAD_FAILED/);
  assert.equal(runtime.updates.length,0);
});

test('avatar removal metadata failure keeps the previous owned object untouched',async()=>{
  const runtime=boot({user:{id:'A',user_metadata:{avatar_url:'https://cdn.example.test/profile-avatars/A/old.jpg',avatar_path:'A/old.jpg'}},updateError:new Error('META_FAILED')});
  const result=await runtime.cloud.removeAvatar();
  assert.match(String(result.error&&result.error.message),/META_FAILED/);
  assert.deepEqual(Array.from(runtime.removed),[]);
});

test('avatar implementation coordinates tabs and uses exact broken-image generation checks',()=>{
  const cloud=fs.readFileSync('assets/cloud-sync.js','utf8');
  const home=fs.readFileSync('assets/home.js','utf8');
  assert.match(cloud,/navigator\.locks[\s\S]*locks\.request\('travelmate-avatar:'/);
  assert.match(cloud,/compensateAvatarMutation/);
  assert.match(cloud,/travelmate_compare_and_set_avatar/);
  assert.match(cloud,/p_expected_avatar_url/);
  assert.match(cloud,/p_new_avatar_url/);
  assert.match(cloud,/requireAvatarSession\(mainClient,owner,true\)/);
  assert.match(cloud,/scopedAvatarUser\(scoped\)/);
  assert.match(home,/avatar\.dataset\.avatarGeneration === renderGeneration/);
  assert.match(home,/avatar\.dataset\.avatarUrl === expected/);
  assert.match(home,/avatarBusy/);
  assert.match(home,/avatarInput\.disabled = avatarBusy/);
  assert.match(home,/avatarRemove\.disabled = avatarBusy/);
});

test('display-name-only profile save preserves existing travel preferences',async()=>{
  const original={pace:'relaxed',learningEnabled:true};
  const runtime=boot({user:{id:'A',user_metadata:{travelmate_preferences:original}},allowProfileUpdate:true});
  const result=await runtime.cloud.updateProfile('Lior');
  assert.equal(result.error,null);
  assert.equal(runtime.profileUpdates.length,1);
  assert.equal(Object.prototype.hasOwnProperty.call(runtime.profileUpdates[0].data,'travelmate_preferences'),false);
  assert.deepEqual(original,{pace:'relaxed',learningEnabled:true});
});

test('legacy profile save persists only explicit learning consent',async()=>{
  const enabled=boot({user:{id:'A',user_metadata:{}},allowProfileUpdate:true});
  await enabled.cloud.updateProfile('Lior',{learningEnabled:true});
  assert.equal(enabled.profileUpdates[0].data.travelmate_preferences.learningEnabled,true);
  const disabled=boot({user:{id:'A',user_metadata:{}},allowProfileUpdate:true});
  await disabled.cloud.updateProfile('Lior',{learningEnabled:false});
  assert.equal(disabled.profileUpdates[0].data.travelmate_preferences.learningEnabled,false);
  const missing=boot({user:{id:'A',user_metadata:{}},allowProfileUpdate:true});
  await missing.cloud.updateProfile('Lior',{pace:'balanced'});
  assert.equal(missing.profileUpdates[0].data.travelmate_preferences.learningEnabled,false);
});

test('owner-scoped profile save writes declared preferences only to the captured account',async()=>{
  const runtime=boot({user:{id:'A',user_metadata:{display_name:'Lior'}}});
  const preferences={pace:'relaxed',activityDensity:'light',transport:'walking',tripStyle:'nature',interests:['nature'],learningEnabled:false};
  const result=await runtime.cloud.updateProfileForOwner('A','Lior',preferences);
  assert.equal(result.error,null);
  assert.equal(runtime.profileUpdates.length,1);
  assert.equal(runtime.profileUpdates[0].owner,'A');
  assert.deepEqual(runtime.profileUpdates[0].payload.data.travelmate_preferences,preferences);
});

test('owner-scoped profile save detects an account switch without mutating the successor',async()=>{
  const userA={id:'A',user_metadata:{display_name:'A'}},userB={id:'B',user_metadata:{display_name:'B'}};
  const runtime=boot({user:userA,afterScopedProfileUpdate:({setUser})=>setUser(userB)});
  await assert.rejects(runtime.cloud.updateProfileForOwner('A','Alice',{pace:'active'}),/AUTH_CONTEXT_CHANGED/);
  assert.equal(runtime.profileUpdates.length,1);
  assert.equal(runtime.profileUpdates[0].owner,'A');
  assert.equal(userB.user_metadata.display_name,'B');
});

test('owner-scoped profile save refuses offline mutation without queueing',async()=>{
  const runtime=boot({user:{id:'A',user_metadata:{}},online:false});
  await assert.rejects(runtime.cloud.updateProfileForOwner('A','Alice',{pace:'active'}),/PROFILE_OFFLINE/);
  assert.equal(runtime.profileUpdates.length,0);
});

test('superseded avatar upload cleans only the older predecessor and leaves successor-restorable object intact',async()=>{
  const oldUrl='https://cdn.example.test/profile-avatars/A/old.jpg';
  const runtime=boot({user:{id:'A',user_metadata:{avatar_url:oldUrl,avatar_path:'A/old.jpg'}},afterCas:({payload,setScopedUser,getScopedUser})=>{
    if(payload.p_new_avatar_path&&getScopedUser().user_metadata.avatar_path===payload.p_new_avatar_path)setScopedUser({id:'A',user_metadata:{avatar_url:'https://cdn.example.test/profile-avatars/A/newer.jpg',avatar_path:'A/newer.jpg',avatar_removed:false}});
  }});
  const result=await runtime.cloud.uploadAvatar(imageFile('me.png','image/png'));
  assert.match(String(result.error&&result.error.message),/AVATAR_CONFLICT/);
  assert.deepEqual(Array.from(runtime.removed),['A/old.jpg']);
});

test('ambiguous CAS error after server commit re-reads metadata and keeps the committed avatar object',async()=>{
  const oldUrl='https://cdn.example.test/profile-avatars/A/old.jpg';
  const runtime=boot({user:{id:'A',user_metadata:{avatar_url:oldUrl,avatar_path:'A/old.jpg'}},rpcErrorAfterCommit:new Error('NETWORK_AFTER_COMMIT')});
  const result=await runtime.cloud.uploadAvatar(imageFile('me.png','image/png'));
  assert.equal(result.error,null);
  assert.equal(runtime.removed.includes('A/11111111-2222-4333-8444-555555555555.png'),false);
  assert.equal(runtime.removed.includes('A/old.jpg'),true);
});

test('failed compensation after a successor avatar does not delete the successor rollback target',async()=>{
  const oldUrl='https://cdn.example.test/profile-avatars/A/old.jpg';
  let first=true;
  const runtime=boot({user:{id:'A',user_metadata:{avatar_url:oldUrl,avatar_path:'A/old.jpg'}},afterCas:({payload,setScopedUser,setUser})=>{
    if(first&&payload.p_new_avatar_path){first=false;setScopedUser({id:'A',user_metadata:{avatar_url:'https://cdn.example.test/profile-avatars/A/newer.jpg',avatar_path:'A/newer.jpg',avatar_removed:false}});setUser({id:'B',user_metadata:{}});}
  }});
  const result=await runtime.cloud.uploadAvatar(imageFile('me.png','image/png'));
  assert.equal(result.stale,true);
  assert.equal(runtime.removed.includes('A/11111111-2222-4333-8444-555555555555.png'),false);
});

test('owner-scoped name-only save preserves canonical preferences',async()=>{
  const runtime=boot({user:{id:'A',user_metadata:{travelmate_preferences:{pace:'relaxed'}}}});
  await runtime.cloud.updateProfileForOwner('A','Alice');
  assert.equal(Object.hasOwn(runtime.profileUpdates[0].payload.data,'travelmate_preferences'),false);
});
test('wizard upload rejects a different active owner before creating any object',async()=>{
  const runtime=boot({user:{id:'B',user_metadata:{}}});
  const result=await runtime.cloud.uploadAvatar(imageFile('me.png','image/png'),{ownerId:'A'});
  assert.match(result.error.message,/AUTH_CONTEXT_CHANGED/);
  assert.equal(runtime.uploaded.length,0);assert.equal(runtime.updates.length,0);
});


test('owner-scoped preference-only save preserves identity and can disable learning',async()=>{
  const runtime=boot({user:{id:'A',user_metadata:{display_name:'Lior',avatar_url:'https://example.test/a.jpg'}}});
  const preferences={pace:'relaxed',activityDensity:'light',transport:'walking',tripStyle:'nature',interests:['nature'],learningEnabled:false};
  const result=await runtime.cloud.updatePreferencesForOwner('A',preferences);
  assert.equal(result.error,null);
  assert.equal(runtime.profileUpdates.length,1);
  assert.equal(JSON.stringify(runtime.profileUpdates[0].payload.data),JSON.stringify({travelmate_preferences:preferences}));
  assert.equal(Object.hasOwn(runtime.profileUpdates[0].payload.data,'display_name'),false);
  assert.equal(Object.hasOwn(runtime.profileUpdates[0].payload.data,'avatar_url'),false);
});

test('preference-only save rejects account switch and offline mutation',async()=>{
  const switched=boot({user:{id:'B',user_metadata:{}}});
  await assert.rejects(switched.cloud.updatePreferencesForOwner('A',{learningEnabled:false}),/AUTH_CONTEXT_CHANGED/);
  assert.equal(switched.profileUpdates.length,0);
  const offline=boot({user:{id:'A',user_metadata:{}},online:false});
  await assert.rejects(offline.cloud.updatePreferencesForOwner('A',{learningEnabled:false}),/PROFILE_OFFLINE/);
  assert.equal(offline.profileUpdates.length,0);
});

test('onboarding stores only an approved avatar-style key in existing Auth metadata',async()=>{
  const runtime=boot({user:{id:'A',user_metadata:{}}});
  await runtime.cloud.updateProfileForOwner('A','Alice',{interests:['beaches','technology']},{avatarStyle:'beach-journey'});
  assert.equal(runtime.profileUpdates[0].payload.data.travelmate_avatar_style,'beach-journey');
  await runtime.cloud.updateProfileForOwner('A','Alice',undefined,{avatarStyle:'untrusted-style'});
  assert.equal(Object.hasOwn(runtime.profileUpdates[1].payload.data,'travelmate_avatar_style'),false);
});

test('saved avatar keeps Home crop, sits below trip header, and leads to personal settings from the drawer',()=>{
  const app=fs.readFileSync('assets/app.js','utf8');
  const homeCss=fs.readFileSync('assets/home-organizer.css','utf8');
  const tripCss=fs.readFileSync('assets/trip-redesign.css','utf8');
  const glass=fs.readFileSync('assets/readable-glass.css','utf8');
  assert.match(app,/function paintTripProfile/);
  assert.match(app,/data-trip-profile-avatar/);
  assert.match(app,/data-trip-sidebar-profile/);
  assert.match(app,/dataset\.securityOpen/);
  assert.match(app,/travelmate:profile-change/);
  assert.match(app,/\.trip-sidebar-profile/);
  assert.doesNotMatch(app,/paintTripMenuAvatar|has-profile-avatar|--tm-trip-avatar-image/);
  assert.doesNotMatch(homeCss,/\.home-page \.home-profile-avatar\.has-image[\s\S]*background-size:78%/);
  assert.match(tripCss,/Trip profile placement[\s\S]*\.trip-profile-avatar-button[\s\S]*\.trip-sidebar-profile/);
  assert.match(glass,/Trip profile chrome[\s\S]*\.trip-profile-avatar-button[\s\S]*\.trip-sidebar-profile/);
  assert.doesNotMatch(glass,/\.mobile-menu-button\.has-profile-avatar/);
});

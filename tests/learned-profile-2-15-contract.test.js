'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=file=>fs.readFileSync(file,'utf8');
function api(){
  const window={dispatchEvent(){}};
  const sandbox={window,Date,Object,Number,String,Array,Math,URL,navigator:{onLine:true},CustomEvent:function(type,init){this.type=type;this.detail=init&&init.detail}};
  vm.runInNewContext(read('assets/learned-preferences.js'),sandbox,{filename:'assets/learned-preferences.js'});
  vm.runInNewContext(read('assets/learned-profile.js'),sandbox,{filename:'assets/learned-profile.js'});
  return window.TravelMateLearnedProfile;
}

test('2.15 learns interests only from done records in at least two ended owned trips',()=>{
  const a=api(),today='2026-10-04';
  const suggestions=a.derive([
    {id:'t1',ownerId:'u1',end:'2026-09-01',activities:[{id:'a1',category:'museum',done:true}]},
    {id:'t2',ownerId:'u1',end:'2026-10-03',savedPlaces:[{id:'p2',category:'museum',done:true,date:'2026-10-02'}]},
    {id:'future',ownerId:'u1',end:'2026-10-10',activities:[{id:'a3',category:'museum',done:true}]},
    {id:'shared',ownerId:'u2',end:'2026-09-10',activities:[{id:'a4',category:'museum',done:true}]},
    {id:'idea',ownerId:'u1',end:'2026-09-20',savedPlaces:[{id:'p5',category:'museum',done:true}]}
  ],'u1',true,today);
  assert.equal(suggestions.length,1);
  assert.equal(suggestions[0].value,'culture');
  assert.deepEqual(Array.from(new Set(suggestions[0].evidence.map(x=>x.sourceTripId))).sort(),['t1','t2']);
});

test('2.15 consent is a hard gate before derivation',()=>{
  const a=api(),trips=[
    {id:'t1',ownerId:'u1',end:'2026-09-01',activities:[{id:'a1',category:'museum',done:true}]},
    {id:'t2',ownerId:'u1',end:'2026-09-02',activities:[{id:'a2',category:'museum',done:true}]}
  ];
  assert.deepEqual(Array.from(a.derive(trips,'u1',false,'2026-10-04')),[]);
  assert.deepEqual(Array.from(a.derive(trips,'u1',undefined,'2026-10-04')),[]);
});

test('2.15 evidence projection contains opaque IDs and kind only',()=>{
  const a=api();
  const suggestions=a.derive([
    {id:'t1',ownerId:'u1',end:'2026-09-01',activities:[{id:'a1',category:'restaurant',name:'Secret Name',notes:'private',lat:1,lon:2,done:true}]},
    {id:'t2',ownerId:'u1',end:'2026-09-02',activities:[{id:'a2',category:'restaurant',description:'private text',done:true}]}
  ],'u1',true,'2026-10-04');
  assert.equal(suggestions.length,1);
  for(const evidence of suggestions[0].evidence){
    assert.deepEqual(Object.keys(evidence).sort(),['eventKind','eventRef','sourceTripId']);
    assert.doesNotMatch(JSON.stringify(evidence),/Secret|private|lat|lon|name|notes|description/i);
  }
});

test('learned persistence uses revision CAS and preserves reviewed states',()=>{
  const source=read('assets/learned-profile.js');
  assert.match(source,/travelmate_sync_learned_preference/);
  assert.match(source,/p_expected_revision:current\?current\.revision:null/);
  assert.match(read('supabase/migrations/20261004180528_learned_travel_preferences.sql'),/revision = p_expected_revision|current_row\.revision <> p_expected_revision/);
  assert.match(source,/current&&current\.reviewState==='rejected'/);
  assert.match(source,/stale\.reviewState==='confirmed'&&stale\.evidenceActive/);
  assert.match(source,/travelmate_deactivate_learned_preference/);
  assert.match(source,/p_suggested_value:candidate\.suggestedValue/);
  assert.match(source,/action==='correct'\?validInterest\(correctedValue\):null/);
  assert.match(source,/async function review\(id,expectedRevision,action,correctedValue\)/);
  assert.match(source,/p_expected_revision:revision/);
  assert.doesNotMatch(source,/review\(id,expectedRevision[\s\S]*getRow\(ctx,id\)/);
  assert.match(read('supabase/migrations/20261004180528_learned_travel_preferences.sql'),/evidence_active=false/);
});

test('Mate export is consented confirmed active learned values only',()=>{
  const source=read('assets/learned-profile.js'),intelligence=read('assets/trip-intelligence.js');
  assert.match(source,/confirmedForMate\(owner,learningEnabled\)/);
  assert.match(source,/learningEnabled!==true/);
  assert.match(source,/rpc\('travelmate_confirmed_learned_preferences'\)/);
  assert.match(read('supabase/migrations/20261004180528_learned_travel_preferences.sql'),/review_state = 'confirmed'[\s\S]*evidence_active = true/);
  assert.match(intelligence,/await service\.confirmedForMate\(String\(user\.id\), true\)/);
  assert.match(intelligence,/learnedPreferenceLines\(context\.learnedPreferences\)/);
  assert.doesNotMatch(intelligence,/JSON\.stringify\(context\.learnedPreferences\)/);
});

test('delete all disables learning before deleting learned rows',()=>{
  const source=read('assets/learned-profile.js');
  const profileWrite=source.indexOf('updatePreferencesForOwner(ctx.owner,preferences)');
  const deleteRows=source.indexOf("rpc('travelmate_delete_all_learned_preferences')");
  assert.ok(profileWrite>=0&&deleteRows>profileWrite);
  assert.match(source,/learningEnabled:false/);
  assert.match(source,/result\.error\.learningDisabled=true/);
});

test('Smart Profile owns a visibly separate learned review surface',()=>{
  const home=read('assets/home.js'),ui=read('assets/learned-profile-ui.js'),css=read('assets/cloud-sync.css'),app=read('assets/app.js');
  assert.match(home,/data-learned-profile-host/);
  assert.match(ui,/data-learned-action/);
  assert.match(ui,/service\.review\(id,revision,'confirm'\)/);
  assert.match(ui,/service\.review\(id,revision,'reject'\)/);
  assert.match(ui,/service\.review\(id,revision,'correct',value\)/);
  assert.match(ui,/service\.remove\(id,revision\)/);
  assert.match(ui,/deleteAllAndDisable/);
  assert.match(css,/\/\* 2\.15 Learned Profile \*\//);
  assert.doesNotMatch(css.slice(css.indexOf('/* 2.15 Learned Profile */')),/!important/);
  assert.match(app,/learned-preferences\.js','learned-profile\.js','learned-profile-ui\.js'/);
});

test('migration enforces owner RLS, MFA, revisions and exact evidence shape',()=>{
  const sql=read('supabase/migrations/20261004180528_learned_travel_preferences.sql');
  assert.match(sql,/force row level security/i);
  assert.match(sql,/\(select auth\.uid\(\)\) = user_id/i);
  assert.match(sql,/as restrictive for select to authenticated/i);
  assert.match(sql,/mfa_satisfied_if_enrolled/i);
  assert.match(sql,/revoke all on table public\.learned_travel_preferences from anon, authenticated/i);
  assert.match(sql,/grant select on table public\.learned_travel_preferences to authenticated/i);
  assert.doesNotMatch(sql,/grant (?:insert|update|delete)[^;]*learned_travel_preferences to authenticated/i);
  assert.match(sql,/travelmate_valid_learned_evidence/);
  assert.match(sql,/key not in|k not in \('sourceTripId', 'eventKind', 'eventRef'\)/i);
  assert.match(sql,/count\(distinct value\)/i);
  assert.match(sql,/end_date < current_date/i);
  assert.match(sql,/new\.revision := old\.revision \+ 1/i);
  assert.match(sql,/LEARNED_PROFILE_IMMUTABLE_FIELD/);
  assert.match(sql,/travelmate_confirmed_learned_preferences/);
  assert.match(sql,/travelmate_evidence_matches_interest/);
  assert.match(sql,/event ->> 'id' = item ->> 'eventRef'/);
  assert.match(sql,/event ->> 'done'/);
  assert.match(sql,/travelmate_category_matches_interest/);
  assert.match(sql,/raw_user_meta_data -> 'travelmate_preferences' ->> 'learningEnabled'/);
  assert.match(sql,/into v_learning from auth\.users u where u\.id=v_user for update;[\s\S]*if v_learning <> 'true' then raise exception 'LEARNED_PROFILE_CONSENT'; end if;[\s\S]*select \* into current_row/);
});

test('learned UI invalidates stale account work and offline mutations are not queued',()=>{
  const ui=read('assets/learned-profile-ui.js'),profile=read('assets/learned-profile.js');
  assert.match(ui,/generation\+=1/);
  assert.match(ui,/String\(check\.user\.id\)!==owner/);
  assert.match(ui,/lastOwner&&lastOwner!==owner/);
  assert.match(profile,/navigator\.onLine===false/);
  assert.doesNotMatch(profile,/localStorage|sessionStorage|queue/i);
});

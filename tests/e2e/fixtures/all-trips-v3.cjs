'use strict';
const {expect}=require('@playwright/test');
// Test-only synthetic client at the same seam used by account-lifecycle.spec.js.
// The real Cloud/TripStore hydration, account generation and renderers still execute.
const trips=[
 {id:'alltrips-rome',city:'רומא',country:'איטליה',start:'2026-10-17',end:'2026-10-20',days:4,isActive:true,savedPlaces:[{id:'qa-place'}]},
 {id:'alltrips-tokyo',city:'טוקיו',country:'יפן',start:'2026-10-21',end:'2026-10-28',days:8,isActive:true,savedPlaces:[]},
 {id:'alltrips-past',city:'פראג',country:'צ׳כיה',start:'2026-09-01',end:'2026-09-04',days:4,savedPlaces:[]},
 {id:'alltrips-future',city:'אתונה',country:'יוון',start:'2027-07-01',end:'2027-07-04',days:4,savedPlaces:[]}
].map(t=>({...t,ownerId:'alltrips-A',budget:1000,budgetCurrency:'EUR',type:'סולו',planInitialized:true,activities:[],expenses:[],dayNotes:{},syncStatus:'synced',cloudRevision:1,cloudUpdatedAt:'2026-10-17T07:00:00Z'}));
async function open(page,{theme='light',state='ready',records=trips,guest=false}={}){
 await page.clock.setFixedTime(new Date('2026-10-17T10:30:00+03:00'));
 await page.route('**/*supabase.co/**',r=>r.abort());
 await page.addInitScript(({theme,state,records,guest})=>{
  if(location.origin!=='http://127.0.0.1:4173')return;
  localStorage.setItem('travelmate-theme',theme);
  const snapshots={'alltrips-A':records,'alltrips-B':[{...records[0],id:'alltrips-B-only',ownerId:'alltrips-B',city:'ברלין',country:'גרמניה',isActive:true}]};
  if(!sessionStorage.getItem('alltrips-fixture-seeded')){
   sessionStorage.setItem('alltrips-fixture-seeded','true');
   if(!guest){localStorage.setItem('travelmate-active-user','alltrips-A');localStorage.setItem('travelmate-trips',JSON.stringify(records));}
   for(const [owner,trips] of Object.entries(snapshots))localStorage.setItem('travelmate-trips-user:'+owner,JSON.stringify(trips));
  }
  localStorage.setItem('travelmate-destination-images-v7',JSON.stringify({
   'רומא|איטליה':'https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&w=800&q=80',
   'טוקיו|יפן':'https://images.unsplash.com/photo-1528360983277-13d401cdc186?auto=format&fit=crop&w=800&q=80'
  }));
  let owner=guest?null:localStorage.getItem('travelmate-active-user');
  if(state==='offline')Object.defineProperty(navigator,'onLine',{configurable:true,value:false});
  const callbacks=[];
  const session=()=>owner?{user:{id:owner,email:'synthetic@example.invalid',user_metadata:{display_name:'דנה בדיקה'}}}:null;
  const rows=user=>JSON.parse(localStorage.getItem('travelmate-trips-user:'+user)||'[]').map(t=>({id:t.id,user_id:user,country:t.country,city:t.city,start_date:t.start,end_date:t.end,days:t.days,budget:t.budget,trip_type:t.type,payload:t,revision:1,updated_at:t.cloudUpdatedAt}));
  window.allTripsQA={mode:state,pending:[],emit(next){owner=next;callbacks.forEach(fn=>fn(next?'SIGNED_IN':'SIGNED_OUT',session()));},release(){this.pending.splice(0).forEach(fn=>fn());}};
  const client={auth:{
   getSession:async()=>{if(state==='offline')throw new Error('Synthetic offline session unavailable');return{data:{session:session()},error:null};},
   onAuthStateChange(fn){callbacks.push(fn);return{data:{subscription:{unsubscribe(){}}}};},
   mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:'aal1',nextLevel:'aal1'}})}
  },from(){
   return {select(){
    return {order:async()=>{
     const requested=owner;
     if(allTripsQA.mode==='loading')await new Promise(resolve=>allTripsQA.pending.push(resolve));
     if(allTripsQA.mode==='error')return{data:null,error:new Error('Synthetic local sync failure')};
     return{data:rows(requested),error:null};
    }};
   }};
  },rpc:async()=>({data:[],error:null})};
  window.__travelMateSupabaseClient=client;
 },{theme,state,records,guest});
 await page.goto('http://127.0.0.1:4173/index.html#active-trips',{waitUntil:'domcontentloaded'});
 await expect(page.locator('[data-home-trip-browser]')).toBeAttached();
 await page.waitForFunction(theme=>document.documentElement.dataset.theme===theme&&Array.from(document.querySelectorAll('link[rel="stylesheet"]')).filter(link=>link.href.startsWith(location.origin)).every(link=>link.sheet),theme);
 if(!guest)await expect(page.locator('body')).toHaveClass(state==='offline'?/has-cached-trips/:/is-authenticated/);
 if(!guest&&state==='ready')await expect(page.locator('[data-home-trip-state]')).toBeEmpty();
}
module.exports={trips,open};

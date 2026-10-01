const {test,expect}=require('@playwright/test');

test('Replay and Analytics preserve unknown movement and mixed-currency facts in the loaded app',async({page})=>{
  await page.addInitScript(()=>{
    localStorage.removeItem('travelmate-active-user');
    localStorage.setItem('travelmate-trips',JSON.stringify([{
      id:'qa-v2-audit',city:'Rome',country:'Italy',start:'2026-10-01',end:'2026-10-02',days:2,
      activities:[
        {id:'a',title:'Museum',date:'2026-10-01',time:'10:00',done:true,lat:'',lon:''},
        {id:'b',title:'Park',date:'2026-10-01',time:'12:00',done:true,travelMinutesBefore:25}
      ],
      savedPlaces:[],memories:[],expenses:[{amount:10,currency:'EUR'},{amount:20,currency:'USD'}]
    }]));
  });
  await page.goto('/trip/custom/index.html?id=qa-v2-audit&view=memories',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>Boolean(window.TravelMateTripReplay&&window.TravelMateTripAnalytics));
  const result=await page.evaluate(()=>{
    const trip=window.TravelMateTripStore.getTrip('qa-v2-audit');
    const analytics=window.TravelMateTripAnalytics.build(trip);
    const replay=window.TravelMateTripReplay.build(trip);
    return {distance:analytics.status.distance,time:analytics.movement.travelMinutes,total:replay.expenseTotal,currency:replay.expenseCurrency};
  });
  expect(result).toEqual({distance:'unknown',time:25,total:null,currency:''});
  await expect(page.locator('[data-trip-replay-summary]')).not.toContainText('30');
});

test('loaded Cloud profile API sends a name-only patch without resetting declared preferences',async({page})=>{
  await page.goto('/index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>Boolean(window.TravelMateCloud&&window.TravelMateUserProfile));
  const result=await page.evaluate(async()=>{
    let metadata={display_name:'Before',travelmate_preferences:{pace:'relaxed',learningEnabled:false}};
    let patch;
    window.__travelMateSupabaseClient={auth:{updateUser:async value=>{
      patch=value.data;
      metadata={...metadata,...patch};
      return {data:{user:{user_metadata:metadata}},error:null};
    }}};
    await window.TravelMateCloud.updateProfile('After');
    return {name:metadata.display_name,preferences:metadata.travelmate_preferences,keys:Object.keys(patch)};
  });
  expect(result).toEqual({name:'After',preferences:{pace:'relaxed',learningEnabled:false},keys:['display_name']});
});

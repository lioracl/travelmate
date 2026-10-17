const {expect} = require('@playwright/test');

// Synthetic records seed an isolated browser context, never application defaults.
const trip = {
  id:'v3-review',city:'רומא',country:'איטליה',start:'2026-10-17',end:'2026-10-19',days:3,
  type:'זוגי',budget:1000,budgetCurrency:'EUR',planInitialized:true,dayNotes:{},savedPlaces:[],expenses:[],
  activities:[
    {id:'v3-a',title:'קולוסיאום',date:'2026-10-17',time:'10:00',duration:90,category:'attraction'},
    {id:'v3-b',title:'ארוחת צהריים',date:'2026-10-17',time:'13:00',duration:60,category:'restaurant'},
    {id:'v3-c',title:'מזרקת טרווי',date:'2026-10-17',time:'16:00',duration:60,category:'attraction'}
  ]
};
async function open(page,{theme='light',record=trip,weather='ready',accent='ocean'}={}) {
  await page.clock.setFixedTime(new Date('2026-10-17T10:30:00+03:00'));
  await page.addInitScript(({record,theme,accent})=>{
    // A copied URL or a navigation to another origin must never receive fixtures.
    if (location.origin !== 'http://127.0.0.1:4173') return;
    localStorage.setItem('travelmate-trips',JSON.stringify([record]));
    localStorage.setItem('travelmate-theme',theme);
    localStorage.setItem('travelmate-accent',accent);
  },{record,theme,accent});
  await page.route('**/*supabase.co/**',r=>r.abort());
  await page.route('**/geocoding-api.open-meteo.com/**',r=>!page.url().startsWith('http://127.0.0.1:4173/')?r.abort():r.fulfill({json:{results:[{name:'Rome',latitude:41.9,longitude:12.5,country_code:'IT',timezone:'Europe/Rome'}]}}));
  await page.route('**/api.open-meteo.com/**',r=>!page.url().startsWith('http://127.0.0.1:4173/')||weather==='error'?r.abort():r.fulfill({json:{
    current:{temperature_2m:28,apparent_temperature:30,weather_code:2,is_day:1},
    daily:{time:['2026-10-17'],temperature_2m_max:[31],temperature_2m_min:[24],weather_code:[2],precipitation_probability_max:[0],wind_speed_10m_max:[9],uv_index_max:[4]}
  }}));
  // Pin this test-only preview even if a test runner has a different baseURL.
  await page.goto('http://127.0.0.1:4173/trip/custom/index.html?id='+encodeURIComponent(record.id)+'&view=overview',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.TravelMateHistory && window.TravelMateNavigation && document.querySelector('[data-shell-mate] .ai-orb'));
  await expect(page.locator('.trip-today')).toHaveClass(/today-activities-card/);
}

module.exports = {trip, open};

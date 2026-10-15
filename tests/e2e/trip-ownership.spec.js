const {test,expect}=require('@playwright/test');
async function seed(page,view){
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.addInitScript(()=>{localStorage.setItem('travelmate-active-user','ownership-owner');localStorage.setItem('travelmate-trips',JSON.stringify([{id:'ownership',ownerId:'ownership-owner',city:'Rome QA',country:'Italy',start:'2026-10-14',end:'2026-10-15',days:2,budget:1000,planInitialized:true,activities:[{id:'a',title:'OLD',date:'2026-10-14',time:'10:00',duration:60,scheduleMode:'planned'}],savedPlaces:[],expenses:[],memories:[],dayNotes:{}}]));});
 await page.goto('/trip/custom/index.html?id=ownership&view='+view);
}
const read=page=>page.evaluate(()=>TravelMateTripStore.getTrip('ownership'));
test('retained Budget save preserves Plan replacement and newer Memories across repeated saves',async({page})=>{
 await seed(page,'budget');const form=page.locator('[data-total-budget-form]');await expect(form).toBeAttached();
 await page.evaluate(()=>TravelMateTripStore.updateTrip('ownership',t=>{t.activities[0].title='NEW';t.memories=[{id:'m',note:'remote'}];return t}));
 if(await form.isHidden())await page.locator('.budget-settings-toggle').click();
 for(const value of ['500','600']){await form.locator('[name=total]').fill(value);await form.locator('button[type=submit]').click();const t=await read(page);expect(t.activities[0].title).toBe('NEW');expect(t.memories[0].note).toBe('remote');expect(t.budget).toBe(Number(value));}
});
test('retained Memories save preserves newer Budget and Plan and restores submit control',async({page})=>{
 await seed(page,'memories');const form=page.locator('[data-memory-form]');await expect(form).toBeVisible();
 await page.evaluate(()=>TravelMateTripStore.updateTrip('ownership',t=>{t.budget=700;t.activities[0].title='NEW';return t}));
 for(const note of ['first memory','second memory']){await form.locator('textarea').fill(note);await form.locator('button[type=submit]').click();await expect(form.locator('button[type=submit]')).toBeEnabled();}
 const t=await read(page);expect(t.budget).toBe(700);expect(t.activities[0].title).toBe('NEW');expect(t.memories.map(m=>m.note)).toEqual(['first memory','second memory']);
});
test('canonical replacement refreshes Plan and later edit preserves Budget',async({page})=>{
 // Freeze the trip day so this ownership test is independent of the CI runner's calendar date.
 await page.clock.setFixedTime(new Date('2026-10-14T09:00:00Z'));
 await seed(page,'plan');await expect(page.locator('[data-activity-id="a"]')).toBeAttached();
 await page.evaluate(()=>{const trip=TravelMateTripStore.updateTrip('ownership',t=>{t.activities[0].title='REALTIME NEW';t.budget=800;return t});window.dispatchEvent(new CustomEvent('travelmate:canonical-trip-replaced',{detail:{userId:'ownership-owner',trip}}));});
 await expect(page.locator('[data-activity-id="a"]')).toContainText('REALTIME NEW');await page.locator('[data-activity-id="a"] [data-toggle-done]').click();const t=await read(page);expect(t.activities[0].title).toBe('REALTIME NEW');expect(t.activities[0].done).toBe(true);expect(t.budget).toBe(800);
});
test('Calendar async dialog is invalidated on account switch',async({page})=>{
 await seed(page,'plan');await page.waitForFunction(()=>Boolean(window.TravelMateCalendarExportUI));
 await page.evaluate(async()=>{await TravelMateCalendarExportUI.open(TravelMateTripStore.getTrip('ownership'),TravelMateTripStore.getTrip('ownership').activities[0]);});
 await expect(page.locator('dialog.tm-calendar-export')).toBeVisible();
 // Invoke only the exporter listener: full account navigation is exercised by the existing lifecycle suite.
 await page.evaluate(()=>{localStorage.setItem('travelmate-active-user','other');window.dispatchEvent(new CustomEvent('travelmate:account-context-changed',{detail:{trips:[]}}));});
 await expect(page.locator('dialog.tm-calendar-export')).not.toBeVisible();
});

test('Mate opens with blocked auth SDK and preserves usable local controls without page errors',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await seed(page,'overview');await page.locator('.ai-orb').click();await expect(page.locator('.ai-panel')).toBeVisible();await expect(page.locator('.ai-composer textarea')).toBeEnabled();await page.locator('.ai-composer textarea').fill('local draft');await page.waitForTimeout(300);expect(errors).toEqual([]);await expect(page.locator('.ai-composer textarea')).toHaveValue('local draft');
});

for(const width of [360,390,430])for(const theme of ['light','dark'])test('Mate mobile solid surface '+width+' '+theme,async({page})=>{
 await page.setViewportSize({width,height:844});await seed(page,'overview');await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;localStorage.setItem('travelmate-theme',theme)},theme);await page.locator('.ai-orb').click();await expect(page.locator('.ai-panel')).toBeVisible();const panel=await page.locator('.ai-panel').evaluate(el=>({background:getComputedStyle(el).backgroundColor,width:el.getBoundingClientRect().width}));expect(panel.background).toBe(theme==='dark'?'rgb(16, 38, 43)':'rgb(220, 235, 238)');expect(panel.width).toBe(width);
});

test('canonical field removal clears mirrors and survives later Budget save and reload',async({page})=>{
 await seed(page,'budget');await expect(page.locator('[data-total-budget-form]')).toBeAttached();
 await page.evaluate(()=>{localStorage.setItem('travelmate-experience:ownership-owner:ownership:memories',JSON.stringify([{id:'removed',note:'old'}]));localStorage.setItem('travelmate-experience:ownership-owner:ownership:expenses',JSON.stringify([{id:'removed-e',amount:5}]));const trip=TravelMateTripStore.updateTrip('ownership',t=>{delete t.memories;delete t.expenses;t.activities[0].title='NEW';return t});window.dispatchEvent(new CustomEvent('travelmate:canonical-trip-replaced',{detail:{userId:'ownership-owner',trip}}));});
 const form=page.locator('[data-total-budget-form]');if(await form.isHidden())await page.locator('.budget-settings-toggle').click();await form.locator('[name=total]').fill('400');await form.locator('button[type=submit]').click();const saved=await read(page);expect(saved.memories||[]).toEqual([]);expect(saved.expenses||[]).toEqual([]);expect(saved.activities[0].title).toBe('NEW');expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('travelmate-experience:ownership-owner:ownership:memories')))).toEqual([]);
 // Prevent the synthetic seed from replacing the saved trip on reload.
 await page.evaluate(()=>sessionStorage.setItem('ownership-reload',JSON.stringify(TravelMateTripStore.getTrip('ownership'))));await page.addInitScript(()=>{const trip=sessionStorage.getItem('ownership-reload');if(trip)localStorage.setItem('travelmate-trips','['+trip+']')});await page.reload();await expect(page.locator('[data-total-budget-form]')).toBeAttached();expect((await read(page)).memories||[]).toEqual([]);
});

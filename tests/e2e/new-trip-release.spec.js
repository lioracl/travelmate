const {test,expect}=require('@playwright/test');
for(const width of [390,430,768,1440])for(const theme of ['light','dark'])test(`New Trip theme and dialog accessibility ${width} ${theme}`,async({page})=>{
 await page.setViewportSize({width,height:844});await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.addInitScript(theme=>{localStorage.setItem('travelmate-theme',theme);localStorage.setItem('travelmate-active-user','new-trip-owner');localStorage.setItem('travelmate-trips',JSON.stringify([{id:'new-trip-qa',ownerId:'new-trip-owner',city:'QA',country:'Italy',start:'2026-10-10',end:'2026-10-12',days:3,activities:[],savedPlaces:[]}]))},theme);
 await page.goto('/');const trigger=page.getByRole('button',{name:'טיול חדש',exact:true});await trigger.click();
 const modal=page.locator('#modal-destination');await expect(modal).toBeVisible();await expect(modal).toHaveAccessibleName('לאן תרצי לטוס?');
 const close=modal.getByRole('button',{name:'סגירה',exact:true});await expect(close).toBeFocused();
 const surface=await modal.locator('.destination-modal').evaluate(el=>({bg:getComputedStyle(el).backgroundColor,direction:getComputedStyle(el).direction,overflow:document.documentElement.scrollWidth>innerWidth}));
 expect(surface.bg).not.toBe('rgb(255, 255, 255)');expect(surface.direction).toBe('rtl');expect(surface.overflow).toBe(false);
 await page.keyboard.press('Shift+Tab');await expect(modal.locator('button[type=submit]')).toBeFocused();await page.keyboard.press('Tab');await expect(close).toBeFocused();
 await page.screenshot({path:test.info().outputPath(`new-trip-${width}-${theme}.png`)});
 await page.keyboard.press('Escape');await expect(modal).not.toBeVisible();await expect(trigger).toBeFocused();
});

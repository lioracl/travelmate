const {test,expect}=require('@playwright/test');
const {readability}=require('./fixtures/six-screen-v3.cjs');
for(const width of [390,430,768,1440])for(const theme of ['light','dark'])test(`New Trip theme and dialog accessibility ${width} ${theme}`,async({page})=>{
 await page.setViewportSize({width,height:844});await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.addInitScript(theme=>{localStorage.setItem('travelmate-theme',theme);localStorage.setItem('travelmate-active-user','new-trip-owner');localStorage.setItem('travelmate-trips',JSON.stringify([{id:'new-trip-qa',ownerId:'new-trip-owner',city:'QA',country:'Italy',start:'2026-10-10',end:'2026-10-12',days:3,activities:[],savedPlaces:[]}]))},theme);
 await page.goto('/');const trigger=page.getByRole('button',{name:'טיול חדש',exact:true});await trigger.click();
 const modal=page.locator('#modal-destination');await expect(modal).toBeVisible();await expect(modal).toHaveAccessibleName('טיול חדש');await expect(modal).toHaveAttribute('aria-labelledby','destination-title');await expect(modal.locator('#destination-title')).toHaveText('טיול חדש');
 const heading=modal.getByRole('heading',{name:'לאן רוצים לטוס?',exact:true});await expect(heading).toHaveAttribute('id','wizard-step-title');await expect(heading).toBeFocused();await expect(modal.locator('[data-wizard-progress][aria-current="step"]')).toHaveCount(1);
 const close=modal.getByRole('button',{name:'ביטול וסגירת טיול חדש',exact:true});await expect(close).toBeVisible();
 const surface=await modal.locator('.destination-modal').evaluate(el=>({bg:getComputedStyle(el).backgroundColor,direction:getComputedStyle(el).direction,overflow:document.documentElement.scrollWidth>innerWidth}));
 expect(surface.bg).toBe(theme==='light'?'rgb(255, 255, 255)':'rgb(24, 50, 73)');expect(surface.direction).toBe('rtl');expect(surface.overflow).toBe(false);
 const progress=modal.locator('[data-wizard-progress-label]');await expect(progress).toHaveCSS('background-color','rgba(0, 0, 0, 0)');const muted=theme==='light'?'rgb(88, 113, 142)':'rgb(185, 207, 220)';await expect(progress).toHaveCSS('color',muted);await expect(progress).toHaveCSS('-webkit-text-fill-color',muted);
 await readability(page,test.info(),'new-trip-initial',['#destination-title','#wizard-step-title','#modal-destination [data-wizard-progress-label]','#modal-destination [data-wizard-next]']);
 await expect(modal.locator('button[type=submit]')).toBeHidden();await close.focus();await page.keyboard.press('Shift+Tab');await expect(modal.locator('[data-wizard-next]')).toBeFocused();await page.keyboard.press('Tab');await expect(close).toBeFocused();
 await page.screenshot({path:test.info().outputPath(`new-trip-${width}-${theme}.png`)});
 await page.keyboard.press('Escape');await expect(modal).not.toBeVisible();await expect(trigger).toBeFocused();
});

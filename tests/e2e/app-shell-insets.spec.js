const {test,expect}=require('@playwright/test');
for(const width of [390,430])for(const theme of ['light','dark'])for(const bottom of [0,24,48])test(`shared shell ${width} ${theme} bottom ${bottom}`,async({page})=>{
 await page.setViewportSize({width,height:844});await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.addInitScript(({theme,bottom})=>{localStorage.setItem('travelmate-theme',theme);localStorage.setItem('travelmate-active-user','shell-owner');localStorage.setItem('travelmate-trips',JSON.stringify([{id:'shell-qa',city:'QA',country:'Italy',start:'2026-10-10',end:'2026-10-12',days:3,ownerId:'shell-owner',planInitialized:true,activities:[],savedPlaces:[],expenses:[]}]));document.addEventListener('DOMContentLoaded',()=>{for(const [side,n] of Object.entries({top:bottom?32:0,bottom,left:0,right:0}))document.documentElement.style.setProperty('--safe-area-inset-'+side,n+'px');});},{theme,bottom});
 await page.goto('/trip/custom/index.html?id=shell-qa&view=plan');const header=page.locator('.mobile-header');await expect(header).toBeVisible();
 const geometry=await page.evaluate(()=>{const header=document.querySelector('.mobile-header'),main=document.querySelector('main.content');return {header:header.getBoundingClientRect().toJSON(),paddingTop:parseFloat(getComputedStyle(main).paddingTop),paddingBottom:parseFloat(getComputedStyle(main).paddingBottom),overflow:document.documentElement.scrollWidth>innerWidth+2,injected:getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-top')};});
 expect(geometry.header.top).toBeGreaterThanOrEqual(bottom?32:0);expect(geometry.paddingTop).toBeGreaterThanOrEqual(geometry.header.bottom);expect(geometry.paddingBottom).toBeGreaterThanOrEqual(72+bottom);expect(geometry.overflow).toBe(false);
 await page.locator('.mobile-menu-button').click();const drawer=page.locator('.workspace>.sidebar');await expect(drawer).toBeVisible();const box=await drawer.boundingBox();expect(box.y).toBeGreaterThanOrEqual(bottom?32:0);expect(box.y+box.height).toBeLessThanOrEqual(844-bottom+1);
 await page.goto('/trip/custom/index.html?id=shell-qa&view=overview');await page.locator('[data-weather-top-widget]').click();const overlay=page.locator('#modal-weather-live');await expect(overlay).toBeVisible();const modalBox=await overlay.boundingBox();expect(modalBox.y).toBeGreaterThanOrEqual(bottom?32:0);expect(modalBox.y+modalBox.height).toBeLessThanOrEqual(844-bottom+1);
 await page.keyboard.press('Escape');await page.screenshot({path:test.info().outputPath('overview-shell.png')});
 await page.goto('/');await expect(page.locator('body')).toHaveClass(/has-cached-trips/);
 const home=page.locator('.home-sidebar');await expect(home).toBeVisible();const homeBox=await home.boundingBox();expect(homeBox.y).toBeGreaterThanOrEqual(bottom?32:0);const padding=await page.locator('main.content').evaluate(el=>parseFloat(getComputedStyle(el).paddingTop));expect(padding).toBeGreaterThanOrEqual(homeBox.y+homeBox.height);

});
test('landscape cutout protects both sides of header and scroll content',async({page})=>{
 await page.setViewportSize({width:844,height:430});await page.goto('/trip/japan-2027/index.html');
 await page.evaluate(()=>{for(const [side,n] of Object.entries({top:24,bottom:24,left:44,right:12}))document.documentElement.style.setProperty('--safe-area-inset-'+side,n+'px');});
 const header=await page.locator('.mobile-header').boundingBox();expect(header.x).toBeGreaterThanOrEqual(44);expect(header.x+header.width).toBeLessThanOrEqual(832);expect(header.y).toBeGreaterThanOrEqual(24);
 const p=await page.locator('main.content').evaluate(el=>({left:parseFloat(getComputedStyle(el).paddingLeft),right:parseFloat(getComputedStyle(el).paddingRight)}));expect(p.left).toBeGreaterThanOrEqual(44);expect(p.right).toBeGreaterThanOrEqual(12);
});

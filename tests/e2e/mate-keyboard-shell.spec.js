const {test,expect}=require('@playwright/test');
for(const mode of ['visual-viewport','native-resize'])test('Mate composer stays above simulated IME: '+mode,async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto('/trip/japan-2027/index.html');
 await page.evaluate(()=>{document.documentElement.style.setProperty('--safe-area-inset-top','32px');document.documentElement.style.setProperty('--safe-area-inset-bottom','24px');});
 await page.locator('.ai-orb').click();await expect(page.locator('.ai-panel')).toBeVisible();
 await expect(page.locator('.ai-panel textarea')).toBeFocused();
 if(mode==='native-resize')await page.setViewportSize({width:390,height:480});
 else await page.evaluate(()=>{Object.defineProperty(window.visualViewport,'height',{configurable:true,value:480});visualViewport.dispatchEvent(new Event('resize'));});
 await page.evaluate(()=>{document.documentElement.style.setProperty('--safe-area-inset-bottom','0px');visualViewport.dispatchEvent(new Event('resize'));});
 await expect(page.locator('body')).toHaveClass(/ai-keyboard-open/);
 const geometry=await page.locator('.ai-panel').evaluate(el=>({panel:el.getBoundingClientRect().toJSON(),composer:el.querySelector('.ai-composer').getBoundingClientRect().toJSON(),chat:el.querySelector('.ai-chat').getBoundingClientRect().toJSON(),z:+getComputedStyle(el).zIndex,headerZ:+getComputedStyle(document.querySelector('.mobile-header')).zIndex}));
 expect(geometry.panel.top).toBeGreaterThanOrEqual(32);expect(geometry.composer.bottom).toBeLessThanOrEqual(480);expect(geometry.chat.height).toBeGreaterThan(60);expect(geometry.z).toBeGreaterThan(geometry.headerZ);
 await page.locator('[data-ai-close]').click();await expect(page.locator('.ai-panel')).toBeHidden();await expect(page.locator('.ai-orb')).toBeFocused();
});

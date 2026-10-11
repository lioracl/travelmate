const {test,expect}=require('@playwright/test');
test('Hebrew Places categories keep whole words at phone widths',async({page})=>{
 for(const width of [360,390,430]){
  await page.setViewportSize({width,height:844});await page.goto('/trip/japan-2027/index.html#places');
  await page.locator('#places').evaluate(el=>{el.hidden=false;el.style.display='block';});
  const labels=page.locator('#places .nearby-category-chips button span');await expect(labels.first()).toBeVisible();
  const result=await labels.evaluateAll(nodes=>nodes.map(el=>{
   const text=el.firstChild,style=getComputedStyle(el);let split=false;
   if(text&&text.nodeType===3){for(const match of text.textContent.matchAll(/\S+/g)){const range=document.createRange();range.setStart(text,match.index);range.setEnd(text,match.index+match[0].length);const ys=new Set([...range.getClientRects()].map(r=>Math.round(r.y)));if(ys.size>1)split=true;}}
   return {label:el.textContent,split,wrap:style.overflowWrap,overflow:el.scrollWidth>el.clientWidth+1};
  }));
  expect(result.length).toBeGreaterThan(3);for(const item of result){expect(item.split,item.label).toBe(false);expect(item.wrap).toBe('normal');expect(item.overflow,item.label).toBe(false);}
 }
});

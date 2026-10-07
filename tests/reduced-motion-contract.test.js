const test=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
test('dashboard carousel respects reduced motion',()=>{const css=read('assets/home-organizer.css'); assert.match(css,/@media\(prefers-reduced-motion:reduce\)/); assert.match(css,/\.destination-slide[\s\S]*transition:none/);});
test('auto planner hover motion is suppressed',()=>{const css=read('assets/auto-planner.css'); assert.match(css,/@media\(prefers-reduced-motion:reduce\)[\s\S]*\.auto-plan-option/); assert.match(css,/\.auto-plan-option:hover\{transform:none\}/);});
test('budget progress and disclosure motion is suppressed',()=>{const css=read('assets/trip-experience.css'); assert.match(css,/@media\(prefers-reduced-motion:reduce\)[\s\S]*budget-meter-track/); assert.match(css,/budget-limit-mode label:hover>span\{transform:none\}/);});

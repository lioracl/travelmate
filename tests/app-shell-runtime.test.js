const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('App Shell keeps native bar contrast aligned with app theme without another inset source',()=>{
 const calls=[],events={},root={dataset:{theme:'light'},style:{setProperty(){}}};
 const window={Capacitor:{isNativePlatform:()=>true,getPlatform:()=> 'android',Plugins:{SystemBars:{setStyle:opts=>{calls.push(opts.style);return Promise.resolve();}}}},addEventListener:(type,fn)=>events[type]=fn};
 const context={window,document:{documentElement:root,querySelector:()=>null},getComputedStyle:()=>({getPropertyValue:()=> '32px'}),innerHeight:844};
 vm.runInNewContext(fs.readFileSync('assets/app-shell.js','utf8'),context);assert.equal(root.dataset.nativeShell,'android');assert.deepEqual(calls,['LIGHT']);root.dataset.theme='dark';events['travelmate:theme-change']();assert.deepEqual(calls,['LIGHT','DARK']);assert.equal(window.TravelMateAppShell.snapshot().top,'32px');
});

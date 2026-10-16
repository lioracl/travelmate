const {test,expect}=require('@playwright/test');
async function prepare(page,theme='light'){
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.addInitScript(({theme})=>{
  localStorage.setItem('travelmate-theme',theme); if(!localStorage.getItem('travelmate-active-user'))localStorage.setItem('travelmate-active-user','voice-owner');
  window.voiceEvidence={starts:0,aborts:0,speech:[],cancels:0};
  class Recognition {start(){voiceEvidence.starts++;window.qaRecognition=this;this.onstart();} stop(){this.onresult({results:[[{transcript:'טיוטה בעברית'}]]});this.onend();} abort(){voiceEvidence.aborts++;}}
  window.SpeechRecognition=Recognition;
  window.SpeechSynthesisUtterance=class {constructor(text){this.text=text;}};
  Object.defineProperty(window,'speechSynthesis',{value:{speaking:false,pending:false,paused:false,getVoices:()=>[{voiceURI:'local-he',name:'Controlled Hebrew',lang:'he-IL',localService:true,default:true}],addEventListener(){},speak(u){this.speaking=true;voiceEvidence.speech.push({text:u.text,rate:u.rate});window.qaUtterance=u;if(u.onstart)u.onstart();},cancel(){this.speaking=false;this.paused=false;voiceEvidence.cancels++;},pause(){this.paused=true;},resume(){this.paused=false;}}});
 },{theme});
 await page.goto('/trip/japan-2027/index.html'); await page.locator('.ai-orb').click();await expect(page.locator('.ai-panel')).toBeVisible();await page.evaluate(()=>TravelMateSettings.setVoicePreferences({autoSend:false}));
}
for(const width of [360,390,430])for(const theme of ['light','dark'])test('voice explicit controls and RTL layout '+width+' '+theme,async({page})=>{
 await page.setViewportSize({width,height:844});await prepare(page,theme);
 expect(await page.evaluate(()=>voiceEvidence.starts)).toBe(0);expect(await page.evaluate(()=>voiceEvidence.speech.length)).toBe(0);
 const mic=page.locator('[data-ai-voice]');await mic.click();await expect(page.locator('.ai-panel')).toHaveAttribute('data-voice-state','listening');
 await page.evaluate(()=>{qaRecognition.onresult({results:[[{transcript:'טיוטה בעברית'}]]});qaRecognition.onend();});await expect(page.locator('.ai-panel textarea')).toHaveValue('טיוטה בעברית');
 await mic.click();await page.locator('[data-voice-stop]').click();await page.evaluate(()=>qaRecognition.onresult({results:[[{transcript:'LATE'}]]}));await expect(page.locator('.ai-panel textarea')).toHaveValue('טיוטה בעברית');
 await page.locator('[data-ai-read]').first().click();await expect(page.locator('.ai-panel')).toHaveAttribute('data-voice-state','speaking');
 await page.locator('[data-voice-pause]').click();await expect(page.locator('.ai-panel')).toHaveAttribute('data-voice-state','paused');await page.locator('[data-voice-resume]').click();
 await page.locator('[data-ai-close]').click();expect(await page.evaluate(()=>speechSynthesis.speaking)).toBe(false);await expect(page.locator('.ai-orb')).toBeFocused();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
});
for(const width of [360,390,430])for(const theme of ['light','dark'])test('settings persist styles and voice per account '+width+' '+theme,async({page})=>{
 await page.setViewportSize({width,height:844});await prepare(page,theme);await page.locator('[data-ai-close]').click();
 await page.evaluate(async()=>{await TravelMateFeatures.ensureAccount();TravelMateSettings.open();});
 const section=page.locator('[data-settings-voice]');await expect(section).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);await expect(section.locator('[data-voice-style] option')).toHaveCount(6);
 await section.locator('[data-voice-style]').selectOption('calm');await section.locator('[data-voice-choice]').selectOption('local-he');await section.locator('[data-voice-preview]').click();expect(await page.evaluate(()=>voiceEvidence.starts)).toBe(0);expect(await page.evaluate(()=>voiceEvidence.speech.at(-1).rate)).toBe(await page.evaluate(()=>TravelMateSettings.getVoiceStyles().find(style=>style.id==='calm').rate));
 await page.locator('[data-security-close]').click();expect(await page.evaluate(()=>speechSynthesis.speaking)).toBe(false);
 await Promise.all([page.waitForEvent('framenavigated',frame=>frame===page.mainFrame()),page.evaluate(()=>{localStorage.setItem('travelmate-active-user','other-owner');dispatchEvent(new CustomEvent('travelmate:account-context-changed',{detail:{userId:'other-owner'}}));})]);
 await page.waitForFunction(()=>Boolean(window.TravelMateFeatures));await page.evaluate(async()=>{await TravelMateFeatures.ensureAccount();TravelMateSettings.open();});
 await expect(section.locator('[data-voice-style]')).toHaveValue('auto');await section.locator('[data-voice-style]').selectOption('clear');
 await Promise.all([page.waitForEvent('framenavigated',frame=>frame===page.mainFrame()),page.evaluate(()=>{localStorage.setItem('travelmate-active-user','voice-owner');dispatchEvent(new CustomEvent('travelmate:account-context-changed',{detail:{userId:'voice-owner'}}));})]);await page.waitForFunction(()=>Boolean(window.TravelMateFeatures));await page.evaluate(async()=>{await TravelMateFeatures.ensureAccount();TravelMateSettings.open();});await expect(section.locator('[data-voice-style]')).toHaveValue('calm');
});
test('permission denial and offline preserve typed draft and explicit retry',async({page,context})=>{
 await prepare(page);const input=page.locator('.ai-panel textarea');await input.fill('טיוטה נשמרת');await page.locator('[data-ai-voice]').click();await page.evaluate(()=>qaRecognition.onerror({error:'not-allowed'}));await expect(page.locator('[data-ai-status]')).toContainText('נחסמה');await expect(input).toHaveValue('טיוטה נשמרת');
 await context.setOffline(true);await expect(page.locator('[data-ai-voice]')).toBeDisabled();await expect(input).toBeEnabled();await context.setOffline(false);await expect(page.locator('[data-ai-voice]')).toBeEnabled();expect(await page.evaluate(()=>voiceEvidence.starts)).toBe(1);
});

test('unsupported browser keeps the text composer available and announces fallback',async({page})=>{
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.addInitScript(()=>{window.SpeechRecognition=undefined;window.webkitSpeechRecognition=undefined;Object.defineProperty(window,'speechSynthesis',{value:undefined});window.SpeechSynthesisUtterance=undefined;});
 await page.goto('/trip/japan-2027/index.html');await page.locator('.ai-orb').click();await expect(page.locator('[data-ai-voice]')).toBeDisabled();await expect(page.locator('[data-ai-status]')).toContainText('אינו נתמך');await expect(page.locator('.ai-panel textarea')).toBeEnabled();await page.locator('.ai-panel textarea').fill('אפשר להקליד');await page.locator('[data-ai-read]').first().click();await expect(page.locator('.ai-panel textarea')).toHaveValue('אפשר להקליד');
});

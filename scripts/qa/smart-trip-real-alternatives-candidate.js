'use strict';
const fs=require('node:fs');
function replaceOnce(path,from,to){const src=fs.readFileSync(path,'utf8');const count=src.split(from).length-1;if(count!==1)throw new Error(`${path}: expected one match, found ${count}`);fs.writeFileSync(path,src.replace(from,to));}
function insertBeforeOnce(path,anchor,text){const src=fs.readFileSync(path,'utf8');const index=src.indexOf(anchor);if(index<0)throw new Error(`${path}: anchor missing`);if(src.indexOf(text)!==-1)throw new Error(`${path}: insertion already present`);fs.writeFileSync(path,src.slice(0,index)+text+src.slice(index));}

insertBeforeOnce('assets/smart-trip-decisions.js',
  "    findings.sort(function (a, b) { return b.priority - a.priority || a.key.localeCompare(b.key); });",
`    var alternatives = [], alternativeSeen = {};
    function movable(entry) { return entry && entry.kind === 'activity' && entry.record.done !== true && entry.start >= current && !/^(fixed|window)$/.test(entry.scheduleMode); }
    function cloneWithTime(entry, newTime) {
      return Object.assign({}, trip, { activities: (trip.activities || []).map(function (record) { return record === entry.record ? Object.assign({}, record, { time: newTime }) : record; }) });
    }
    function riskMap(candidate) {
      var map = {};
      if (!context || typeof context.transitionAssessmentsForDate !== 'function') return map;
      var source = context.transitionAssessmentsForDate(candidate, date, { bufferMinutes: 10 }) || {};
      Object.keys(source).forEach(function (key) { if (source[key] && source[key].risk) map[key] = true; });
      return map;
    }
    var baselineRisks = riskMap(trip);
    function collides(entry, newStart) {
      var duration = Math.max(1, finite(entry.record.duration) === null ? 60 : finite(entry.record.duration));
      var newEnd = newStart + duration;
      return entries.some(function (other) {
        if (other === entry) return false;
        var otherDuration = Math.max(1, finite(other.record.duration) === null ? 60 : finite(other.record.duration));
        return newStart < other.start + otherDuration && newEnd > other.start;
      });
    }
    function verifiedMove(entry, newStart, targetRiskKey) {
      if (!movable(entry) || !Number.isFinite(newStart) || newStart < current || newStart >= 1440 || collides(entry, newStart)) return null;
      var duration = Math.max(1, finite(entry.record.duration) === null ? 60 : finite(entry.record.duration));
      if (newStart + duration > 1440) return null;
      var newTime = clock(newStart);
      if (newTime === String(entry.record.time || '')) return null;
      var candidate = cloneWithTime(entry, newTime), after = riskMap(candidate);
      if (targetRiskKey && after[targetRiskKey]) return null;
      if (Object.keys(after).some(function (key) { return !baselineRisks[key]; })) return null;
      return newTime;
    }
    function offer(entry, newStart, reason, provenance, confidence, targetRiskKey) {
      if (alternatives.length >= 3) return;
      var newTime = verifiedMove(entry, newStart, targetRiskKey), key;
      if (!newTime) return;
      key = 'move:' + String(entry.record.id) + ':' + newTime;
      if (alternativeSeen[key]) return;
      alternativeSeen[key] = true;
      alternatives.push(Object.freeze({ key: key, kind: 'move-activity', activityId: String(entry.record.id), title: String(entry.record.title || entry.record.name || 'פעילות'), oldTime: String(entry.record.time), newTime: newTime, reason: reason, provenance: provenance, confidence: confidence, advisory: true }));
    }
    if (context && typeof context.transitionAssessmentsForDate === 'function') {
      var alternativeAssessments = context.transitionAssessmentsForDate(trip, date, { bufferMinutes: 10 }) || {};
      findings.filter(function (finding) { return finding.key.indexOf('transition:activity:') === 0; }).forEach(function (finding) {
        var transitionKey = finding.key.slice('transition:'.length), evidence = alternativeAssessments[transitionKey], liveEvidence = typeof liveTransitions === 'object' && liveTransitions && liveTransitions[transitionKey];
        if (liveEvidence && String(liveEvidence.date || '') === date && liveEvidence.source === 'live') evidence = liveEvidence;
        if (!evidence || !evidence.risk) return;
        var entry = entries.find(function (candidate) { return candidate.kind + ':' + String(candidate.record.id) === transitionKey; });
        var shortfall = Math.max(0, finite(evidence.shortfallMinutes) || 0), shift = Math.max(5, Math.ceil(shortfall / 5) * 5);
        if (entry) offer(entry, entry.start + shift, 'דחייה של ' + shift + ' דקות מפנה את מרווח המעבר החסר לפי הנתונים הזמינים.', finding.provenance, finding.confidence, transitionKey);
      });
    }
    (Array.isArray(windows) ? windows : []).forEach(function (window) {
      if (alternatives.length >= 3) return;
      var windowStart = minute(window.startTime), windowDuration = finite(window.durationMinutes), windowEnd = minute(window.endTime);
      if (windowStart === null) return;
      if (windowEnd === null && windowDuration !== null) windowEnd = windowStart + windowDuration;
      if (windowEnd === null) return;
      entries.filter(movable).forEach(function (entry) {
        if (alternatives.length >= 3) return;
        var duration = Math.max(1, finite(entry.record.duration) === null ? 60 : finite(entry.record.duration));
        var candidateStart = Math.max(windowStart, Math.ceil((current + 15) / 5) * 5);
        if (candidateStart + duration > windowEnd || Math.abs(candidateStart - entry.start) < 15) return;
        offer(entry, candidateStart, 'הפעילות יכולה לעבור לחלון פנוי בתוכנית בלי ליצור סיכון מעבר חדש. מזג האוויר ושעות הפתיחה לשעה החדשה עדיין דורשים אימות.', 'trip:planned-window', 'medium', '');
      });
    });
`);
replaceOnce('assets/smart-trip-decisions.js',
  "    return Object.freeze({ date: date, recommendations: top, alternatives: Object.freeze(top.map(function (item) { return item.action; })) });",
  "    return Object.freeze({ date: date, recommendations: top, alternatives: Object.freeze(alternatives.slice(0, 3)) });");

replaceOnce('assets/smart-trip-actions.js',
  "  var active=false,message='',preview=null;",
  "  var active=false,message='',preview=null,alternativeByKey={};");
replaceOnce('assets/smart-trip-actions.js',
  "   var items=result.recommendations.map(function(item){return '<li><strong>'+escape(item.title)+'</strong><p>'+escape(item.reason)+'</p><small>'+escape(item.provenance)+' · '+escape({high:'ביטחון גבוה',medium:'הערכה',low:'לא מאומת'}[item.confidence])+'</small> <a href=\"'+escape(item.action.href)+'\">פתיחה</a></li>';}).join('');",
  "   var items=result.recommendations.map(function(item){return '<li><strong>'+escape(item.title)+'</strong><p>'+escape(item.reason)+'</p><small>'+escape(item.provenance)+' · '+escape({high:'ביטחון גבוה',medium:'הערכה',low:'לא מאומת'}[item.confidence])+'</small> <a href=\"'+escape(item.action.href)+'\">פתיחה</a></li>';}).join('');alternativeByKey={};var alternativeHtml=(result.alternatives||[]).map(function(item){alternativeByKey[item.key]=item;return '<li><strong>'+escape(item.title)+'</strong><p>'+escape(item.oldTime)+' ← '+escape(item.newTime)+' · '+escape(item.reason)+'</p><small>'+escape(item.provenance)+' · '+escape({high:'ביטחון גבוה',medium:'הערכה',low:'לא מאומת'}[item.confidence]||'לא מאומת')+'</small><button type=\"button\" data-smart-alternative=\"'+escape(item.key)+'\">תצוגה מקדימה לחלופה</button></li>';}).join('');");
replaceOnce('assets/smart-trip-actions.js',
  "   else if(moves.length&&(!trip.ownerId||String(trip.ownerId)===account()))content='<form data-smart-move><label>פעילות גמישה<select name=\"activity\">'+moves.map(function(item){return '<option value=\"'+escape(item.id)+'\">'+escape(item.title)+' · '+escape(item.time)+'</option>';}).join('')+'</select></label><label>שעה מוצעת<input name=\"time\" type=\"time\" required></label><button type=\"submit\">תצוגה מקדימה</button></form>';",
  "   else if(moves.length&&(!trip.ownerId||String(trip.ownerId)===account()))content='<form data-smart-move><label>פעילות גמישה<select name=\"activity\">'+moves.map(function(item){return '<option value=\"'+escape(item.id)+'\">'+escape(item.title)+' · '+escape(item.time)+'</option>';}).join('')+'</select></label><label>שעה מוצעת<input name=\"time\" type=\"time\" required></label><button type=\"submit\">תצוגה מקדימה</button></form>';if(state==='idle'&&alternativeHtml)content+='<section data-smart-alternatives><h4>חלופות אפשריות</h4><ul>'+alternativeHtml+'</ul></section>';" );
insertBeforeOnce('assets/smart-trip-actions.js',
  "  plan.addEventListener('click',function(event){var button=event.target.closest('[data-smart-step]');",
`  plan.addEventListener('click',function(event){var button=event.target.closest('[data-smart-alternative]');if(!button)return;var alternative=alternativeByKey[button.dataset.smartAlternative];if(!alternative)return;try{preview=flow.preview(alternative.activityId,alternative.newTime);message='החלופה מוצגת בלבד; התוכנית עדיין לא השתנתה.';paint('[data-smart-step="confirm"]');}catch(error){fail();}});
`);

replaceOnce('tests/smart-trip-decisions.test.js',
  "  assert.deepEqual(result.alternatives[0], { type: 'open-places', href: '#places' });",
  "  assert.equal(result.alternatives[0].kind, 'move-activity');\n  assert.equal(result.alternatives[0].activityId, 'flex');\n  assert.equal(result.alternatives[0].newTime, '12:15');");
fs.appendFileSync('tests/smart-trip-decisions.test.js', `

test('transition-risk alternative is a real verified itinerary move and never mutates input', () => {
  const value = trip([item('a', '12:00', 'fixed', {duration:60}), item('b', '13:10', 'planned', {duration:30})]);
  const context = {
    scheduleMode(record) { return record.scheduleMode || 'planned'; },
    transitionAssessmentsForDate(candidate) {
      const target = candidate.activities.find(record => record.id === 'b');
      const risk = target.time === '13:10';
      return {'activity:b': {date, risk, shortfallMinutes:risk ? 20 : 0, source:'estimate'}};
    }
  };
  const before = JSON.stringify(value), result = evaluate(value, {context});
  const alternative = result.alternatives.find(entry => entry.activityId === 'b');
  assert.equal(JSON.stringify(value), before);
  assert.equal(alternative.kind, 'move-activity');
  assert.equal(alternative.oldTime, '13:10');
  assert.equal(alternative.newTime, '13:30');
  assert.match(alternative.reason, /20/);
  assert.equal(alternative.provenance, 'routing:estimate');
  assert.equal(alternative.confidence, 'medium');
  assert.ok(Object.isFrozen(result.alternatives));
});

test('real alternatives never move fixed window completed or past activities and stay capped at three', () => {
  const value = trip([
    item('past', '11:00', 'flexible'),
    item('fixed', '14:00', 'fixed'),
    item('window', '15:00', 'window'),
    item('done', '16:00', 'flexible', {done:true}),
    item('flex1', '17:00', 'flexible', {duration:30}),
    item('flex2', '18:00', 'flexible', {duration:30})
  ]);
  const context = {freeTimeWindowsForDate() { return [{startTime:'12:30', endTime:'13:45', durationMinutes:75}, {startTime:'19:00', endTime:'21:00', durationMinutes:120}]; }};
  const result = evaluate(value, {context});
  assert.ok(result.alternatives.length <= 3);
  assert.ok(result.alternatives.every(entry => ['flex1','flex2'].includes(entry.activityId)));
  assert.ok(result.alternatives.every(entry => entry.kind === 'move-activity' && entry.oldTime !== entry.newTime));
});
`);

fs.writeFileSync('tests/e2e/smart-trip-alternatives.spec.js', `const {test,expect}=require('@playwright/test');
test('real Smart Trip alternative stays preview-only until confirm and apply, then supports undo',async({page})=>{
 await page.setViewportSize({width:390,height:568});await page.clock.setFixedTime(new Date('2026-10-13T09:00:00Z'));
 await page.addInitScript(()=>{localStorage.setItem('travelmate-theme','light');localStorage.setItem('travelmate-trips',JSON.stringify([{id:'alt-qa',city:'QA',country:'Italy',start:'2026-10-13',end:'2026-10-15',days:3,type:'סולו',planInitialized:true,expenses:[],savedPlaces:[],activities:[{id:'flex',title:'פעילות גמישה',date:'2026-10-13',time:'15:00',duration:30,scheduleMode:'flexible'},{id:'fixed',title:'הזמנה',date:'2026-10-13',time:'18:00',duration:60,scheduleMode:'fixed'}]}]));window.gpsCalls=0;Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(){window.gpsCalls++;throw Error('Automatic GPS');}}});});
 await page.goto('/trip/custom/index.html?id=alt-qa&view=plan',{waitUntil:'domcontentloaded'});await page.locator('[data-smart-check]').click();
 const panel=page.locator('[data-smart-decisions]'),alternative=panel.locator('[data-smart-alternative]').first();await expect(alternative).toBeVisible();
 const before=await page.evaluate(()=>TravelMateTripStore.getTrip('alt-qa').activities[0].time);expect(before).toBe('15:00');
 await alternative.click();await expect(panel.locator('[data-smart-step=confirm]')).toBeVisible();expect(await page.evaluate(()=>TravelMateTripStore.getTrip('alt-qa').activities[0].time)).toBe('15:00');
 await panel.locator('[data-smart-step=confirm]').click();await panel.locator('[data-smart-step=apply]').click();const moved=await page.evaluate(()=>TravelMateTripStore.getTrip('alt-qa').activities[0].time);expect(moved).not.toBe('15:00');
 await panel.locator('[data-smart-step=undo]').click();expect(await page.evaluate(()=>TravelMateTripStore.getTrip('alt-qa').activities[0].time)).toBe('15:00');expect(await page.evaluate(()=>window.gpsCalls)).toBe(0);
});
`);

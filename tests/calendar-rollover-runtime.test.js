'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const exporter = require('../assets/calendar-export.js');
for (const [label, day, time, minutes, expected] of [
  ['same day', '2026-10-14', '12:30', 60, '20261014T133000'],
  ['midnight', '2026-10-14', '23:00', 60, '20261015T000000'],
  ['month rollover', '2026-04-30', '23:30', 60, '20260501T003000'],
  ['year rollover', '2026-12-31', '23:30', 60, '20270101T003000'],
  ['leap day', '2028-02-28', '23:30', 60, '20280229T003000'],
  ['DST wall clock', '2026-03-29', '01:30', 60, '20260329T023000']
]) test('Calendar floating end time: ' + label, async () => {
  const event = await exporter.deriveEvent({id:'trip'}, {id:label,date:day,time,duration:minutes});
  assert.equal(event.end, expected);
});
test('Calendar exporter rejects a missing time without inventing a default', async () => {
  assert.equal(await exporter.deriveEvent({id:'trip'}, {date:'2026-10-14',time:''}), null);
});

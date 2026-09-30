'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const profileContract=read('docs/PERSONAL_TRAVEL_INTELLIGENCE_CONTRACT_20261001.md');
const analyticsContract=read('docs/TRIP_ANALYTICS_CONTRACT_20261001.md');
const profile=read('assets/user-profile.js');
const assistant=read('assets/ai-assistant.js');
const tripContext=read('assets/trip-context.js');
const replay=read('assets/trip-replay.js');
const intelligence=read('assets/trip-intelligence.js');

test('personal intelligence contract separates declared and learned preferences',()=>{
 assert.match(profileContract,/Declared preferences/);
 assert.match(profileContract,/Learned inferences/);
 assert.match(profileContract,/proposed\/confirmed\/rejected\/expired/);
 assert.match(profileContract,/review, correction, deletion/);
 assert.match(profileContract,/Sensitive\/private data/);
});
test('Profile Lite remains the canonical identity source',()=>{
 assert.match(profile,/window\.TravelMateUserProfile/);
 assert.match(profile,/fromUser:fromUser/);
 assert.match(profile,/initials:initials/);
 assert.match(profile,/avatarUrl:avatarUrl/);
 assert.match(profile,/greeting:greetingAt/);
});
test('current Mate context keeps a bounded trip allowlist',()=>{
 assert.match(assistant,/expenseSummary: summarizeExpenses\(trip\.expenses\)/);
 assert.match(assistant,/activities: \(trip\.activities \|\| \[\]\)\.slice\(0, 40\)/);
 assert.match(assistant,/savedPlaces: \(trip\.savedPlaces \|\| \[\]\)\.slice\(0, 30\)/);
 assert.doesNotMatch(assistant,/expenseSummary:[^\n]*(merchant|receipt|note)/i);
});
test('Trip Analytics contract requires explicit confidence states',()=>{
 assert.match(analyticsContract,/confirmed/);
 assert.match(analyticsContract,/estimated/);
 assert.match(analyticsContract,/unknown/);
 assert.match(analyticsContract,/Never label a geographic estimate as/);
});
test('Trip Context is the authoritative itinerary travel estimator',()=>{
 assert.match(tripContext,/function distanceKm\(/);
 assert.match(tripContext,/function estimateTravelMinutes\(/);
 assert.match(tripContext,/source:'manual'/);
 assert.match(tripContext,/source:'estimate'/);
 assert.match(tripContext,/window\.TravelMateTripContext/);
});
test('Trip Replay remains the source for completed versus saved-only semantics',()=>{
 assert.match(replay,/function completedItems\(/);
 assert.match(replay,/function unscheduledSavedCount\(/);
 assert.match(replay,/savedOnly:unscheduledSavedCount\(current\)/);
 assert.match(replay,/פריט נחשב ביקור רק אם סומן כהושלם/);
});
test('Mate trip intelligence accepts explicit trip preferences without creating a profile store',()=>{
 assert.match(intelligence,/preferences: Array\.isArray\(input\.preferences\)/);
 assert.doesNotMatch(intelligence,/localStorage\.setItem\([^\n]*(preference|profile)/i);
});
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const css=fs.readFileSync(path.join(__dirname,'..','assets','theme.css'),'utf8');
const count=(re)=>(css.match(re)||[]).length;

test('theme specificity debt does not grow',()=>{
  assert.ok(count(/html\s+body/g)<=219,'html body specificity debt grew');
  assert.ok(count(/#[A-Za-z0-9_-]+#[A-Za-z0-9_-]+/g)<=22,'repeated-ID specificity debt grew');
  assert.ok(count(/-webkit-text-fill-color\s*:[^;{}]*!important/gi)<=117,'webkit text-fill important debt grew');
  assert.ok(count(/(?:width|min-width|max-width|height|min-height|max-height|padding|margin|gap|grid-template-columns|display|position)\s*:[^;{}]*!important/gi)<=122,'geometry important debt grew');
});

test('new duplicated-ID specificity hacks are forbidden outside the existing debt ceiling',()=>{
  assert.doesNotMatch(css,/#([A-Za-z0-9_-]+)#\1#\1/);
});


test('Plan and Budget geometry stay with their feature owners',()=>{
  const autoPlanner=fs.readFileSync(path.join(__dirname,'..','assets','auto-planner.css'),'utf8');
  const tripExperience=fs.readFileSync(path.join(__dirname,'..','assets','trip-experience.css'),'utf8');
  assert.match(autoPlanner,/Plan geometry authority — Phase 1B/);
  assert.match(tripExperience,/Budget layout authority — Phase 1B/);
  assert.doesNotMatch(css,/main\.content #plan \.planner-toolbar-actions\{/);
  assert.doesNotMatch(css,/budget-limit-mode/);
});

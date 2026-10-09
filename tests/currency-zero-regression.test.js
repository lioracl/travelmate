'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('assets/trip-experience.js','utf8');
const body=source.match(/formatFromEuros: function \(euros\) \{([\s\S]*?)\n      \}/)[1];
function format(amount,currency,rate){const state={localCurrency:currency,rates:{[currency]:rate}};return vm.runInNewContext('(function(euros){'+body+'})',{state,Number,money:(value,code)=>({value:Number(value),code}),localFromEuros:euros=>Number(euros||0)*Number(rate||0)})(amount)}
for(const currency of ['ILS','CZK'])test('zero uses '+currency+' without a rate',()=>{assert.deepEqual(format(0,currency,undefined),{value:0,code:currency})});
test('nonzero uses usable local FX',()=>assert.deepEqual(format(10,'CZK',25),{value:250,code:'CZK'}));
test('nonzero missing FX safely remains EUR',()=>assert.deepEqual(format(10,'CZK',undefined),{value:10,code:'EUR'}));
test('cached FX and EUR identity remain supported',()=>{assert.deepEqual(format(10,'ILS',4),{value:40,code:'ILS'});assert.deepEqual(format(0,'EUR',undefined),{value:0,code:'EUR'})});

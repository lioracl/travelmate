# Post-RC Budget Experience preparation

Status: STARTED — preparation complete; feature implementation not started.
Branch: post-rc/budget-experience-20261011
Base: 19692f25b4e6495b7817e174c8162034a600f0ae (PR #154 Samsung RC).
This branch must remain separate from PR #154. No main/preview deployment.

## Task BUDGET-ACCESS: reuse existing owners

Add convenient Quick Expense access from Overview and Budget, and an in-trip converter entry. Reuse TravelMateBudgetWidgetActions.open('quick-expense'|'converter') in assets/budget-widget-actions.js, which navigates to Budget, loads the feature, and opens the existing controls. Verify web loading: tools/stage-native-web.mjs currently includes this controller for native staging; do not assume web pages load it.

The sole form is #budget [data-receipt-form], owned by assets/trip-experience.js. Its submit path saves expenses through saveTripData -> TravelMateTripStore.saveTrip. Retain duplicate-submit protection, date/currency defaults, edit mode, receipt restoration and account/trip isolation. Do not create a second form, storage key, persistence mechanism or converter. Reuse [data-currency-converter] and the existing cached/stale-rate lifecycle.

Acceptance tests to add: both entry points open the same form; one submission creates exactly one expense and survives reload/offline/reconnect; trip/account switch cannot save into the old trip; switching from quick mode restores normal receipt controls; converter uses local/secondary currencies and cached rates; unavailable rate has explicit unavailable state. Unlimited budget shows spending tracking without remaining-balance language. Test 360/390/430 with keyboard and preserve approved Overview/Hero/Weather.

## Focused follow-up task BUDGET-FX-INTEGRITY

Confirmed existing defect, not fixed in the RC: assets/trip-experience.js expenseInEuros returns zero for non-EUR expenses without a rate. budgetExpenseTotals and budgetSmartMetrics aggregate this number into categories, spent, today, average, projection, remaining and safe daily spend. convertCurrency/localFromEuros have related zero fallbacks. Formatting tests alone do not cover aggregation completeness.

Reproduction using the actual function extracted from source in Node VM: amount=100,currency=USD,rates={} returns 0 EUR; rates={USD:1.25} returns 80 EUR; EUR identity returns 100. Diagnostic assertions confirm the defect, not a desired regression contract.

This requires a broader calculation/result contract than quick-access UI. Implement separately: return conversion availability plus known converted amount and missing currencies/expenses; propagate completeness through all aggregate consumers. Never label a partial total complete or derive a definitive remaining balance/projection from missing expenses. Keep original amounts/currencies visible, distinguish genuine zero from unavailable conversion, and label usable cached rates consistently. No schema migration is currently justified.

Tests required: mixed EUR/ILS/USD with one missing rate; all missing; real zero; identity conversion; usable stale cache; reconnect recovery; category totals and charts; unlimited budget; trip/account reset. Audit other consumers of numeric helpers before changing their return types. Do not implement a return-type change in the access-only commit.

## Preparation validation and boundaries

33 existing Node tests PASS: currency-zero-regression, budget-v2-contract, budget-widget-contract. Three diagnostic FX assertions PASS. This commit changes documentation only, so no new browser/build claim is made. Remaining: implement BUDGET-ACCESS and its runtime tests; implement BUDGET-FX-INTEGRITY with consumer coverage; independent review/CI and device acceptance before any release.

TravelMateTripStore stays canonical. No duplicate itinerary/preferences/nearby/analytics engines, no Health Connect, passive GPS, background health collection or unrelated cleanup.

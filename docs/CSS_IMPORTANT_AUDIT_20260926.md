# TravelMate CSS !important Audit — 2026-09-26

## Baseline

- Scope: `assets/theme.css` in the current hardening worktree.
- Current `!important`: **1,149**.
- High-specificity smells: **308** `html body` chains and **23** repeated-ID selectors.
- `-webkit-text-fill-color: ... !important`: **130**.
- Geometry/layout declarations with `!important`: **276**.

## Debt by responsibility

| Area | Current !important | Decision | Target in theme.css |
|---|---:|---|---:|
| Plan | 387 | MOVE/REWRITE | <= 80 |
| Budget | 178 | MOVE/REWRITE | <= 30 |
| Documents | 96 | MOVE | <= 10 |
| Navigation/Mobile | 95 | SPLIT: geometry to trip-redesign, material to readable-glass | <= 35 |
| Overview | 88 | MOVE/DELETE legacy | <= 15 |
| Global/Theme | 81 | KEEP tokens; REWRITE selectors | <= 25 |
| Other/Legacy | 66 | DELETE/REWRITE after evidence | <= 15 |
| Places | 59 | MOVE to nearby/place-planner/readable-glass | <= 10 |
| Mate/AI | 46 | MOVE to ai-assistant/readable-glass | <= 5 |
| Transport/Getaways | 23 | MOVE to feature CSS | <= 5 |
| Group | 21 | MOVE to collaboration CSS | <= 5 |
| Modals | 6 | MOVE to modal-system | <= 2 |

## Ownership contract

- `theme.css`: semantic theme/accent tokens and truly global theme state only.
- `trip-redesign.css`: application shell geometry, navigation geometry, responsive layout.
- `readable-glass.css`: shared surface/material/control presentation.
- Feature stylesheets: feature-specific geometry and component states.
- Third-party overrides: isolated and documented next to the third-party integration.

## KEEP

Keep only declarations where importance is behaviorally required and documented: third-party library overrides, critical hidden/visibility state, accessibility safety overrides, and temporary compatibility bridges with an explicit removal condition.

## MOVE

Move component-specific rules out of `theme.css` to the owner above. Moving alone is not success: once ownership and load order are correct, remove unnecessary `!important` in the destination.

## DELETE

Delete obsolete historical patches only after static evidence plus regression/runtime verification. Prefer deleting an older overridden rule rather than adding a newer stronger rule.

## REWRITE

Replace `html body ...`, repeated IDs such as `#plan#plan`, and duplicated class specificity with low-specificity selectors using `:where()`/component roots plus correct stylesheet ownership.

## Milestones

1. Phase 1A: map debt and add non-growth guardrails.
2. Phase 1B: clean low-risk dead/duplicate bridges; target theme <= 1,050.
3. Phase 2: Plan ownership consolidation; target theme <= 750.
4. Phase 3: Budget/Documents/Places consolidation; target theme <= 450.
5. Phase 4: Navigation/Overview/AI/remaining legacy; target theme <= 250.
6. Phase 5: final exception audit; target whole application <= 200–300 documented `!important` declarations.

Every milestone must pass contract tests plus mobile/desktop visual regression before lowering the ceiling.


## Phase 1A execution result

- `theme.css` reduced from **1,149** to **1,097** `!important` declarations.
- Removed an obsolete Overview title override and a dead Budget receipt selector.
- Removed the superseded large Mate launcher block; the compact final launcher remains authoritative.
- Removed an obsolete desktop sidebar override layer superseded by the final sidebar authority.
- Removed unnecessary `!important` from the logo `.brand-dot` rules where normal cascade order is sufficient.
- Repaired **7 unmatched CSS opening braces** left by historical partial patches; the file is now structurally balanced.
- Specificity debt improved: `html body` chains **308 → 290**, repeated-ID selectors **23 → 22**, WebKit text-fill important **130 → 126**, geometry important **276 → 264**.
- Debt ceilings were lowered to the new values so these metrics cannot silently regress.
- Focused design/theme suite: **55/55 PASS**.
- Chrome Headless rendered 390px and 1440px smoke screenshots successfully.

Next: Phase 1B should consolidate duplicated Plan toolbar/day rules first, then Budget mobile geometry, with screenshot comparison at each batch.


## Phase 1B execution result — Plan + Budget ownership

- `theme.css` reduced from **1,097** to **810** `!important` declarations (**-287** in this phase).
- Whole-app CSS debt reduced from **2,173** to **1,886** `!important` declarations.
- Combined reduction since the original audit baseline: **2,583 → 1,886** (**-697 / ~27%**).
- Plan geometry moved to `auto-planner.css` with normal cascade declarations; `readable-glass.css` remains the material/color owner.
- Removed superseded Plan toolbar generations (compact icon toolbar, earlier mobile grids, historical badge/day-rail geometry) while keeping the explicit collapsed-day visibility compatibility rule.
- Budget layout and responsive geometry moved to `trip-experience.css`; duplicated `budget-limit-mode`, hero, editor and mobile viewport authority blocks were removed from `theme.css`.
- Updated the existing mobile Plan contract so it verifies the same three-action layout in the feature owner rather than requiring `!important` in `theme.css`.
- Specificity debt now: `html body` **219**, repeated IDs **22**, WebKit text-fill important **117**, geometry important **122**.
- Extended Plan/Budget/design/performance contract suite: **97/97 PASS**.
- Local HTTP smoke: Plan page, Budget page, `auto-planner.css`, `trip-experience.css`, and `theme.css` all returned HTTP 200.

Next recommended phase: consolidate Documents/Places/Navigation ownership, then attack `readable-glass.css` only after the lower theme pressure is removed.


## Phase 2 execution result — Documents + Places + mobile Navigation

- `theme.css` reduced from **810** to **624** `!important` declarations (**-186** in this phase).
- Whole-app CSS debt reduced from **1,886** to **1,700**.
- Combined reduction since the original audit baseline: **2,583 → 1,700** (**-883 / ~34%**).
- Places header-search and controls geometry moved to `nearby.css` with normal cascade rules; shared Places material remains owned by `readable-glass.css`.
- Documents semantic states and Mate/AI Notes presentation moved to `document-vault.css` using semantic variables and color-mix instead of new specificity escalation.
- Removed all **96** Documents `!important` declarations that were living in `theme.css`.
- Mobile header geometry, menu-button fallback styling, sidebar-about order, and scrollbar ownership moved to `trip-redesign.css`; mobile drawer material remains owned by the existing final authority in `readable-glass.css`.
- Specificity debt now: `html body` **159**, repeated IDs **19**, WebKit text-fill important **87**, geometry important **100**.
- Extended asset/design/theme/performance suite: **102/102 PASS**.

Next recommended phase: reduce `readable-glass.css` itself and then address `cloud-sync.css`, starting with duplicated surface/control rules rather than broad visual changes.


## Phase 3 execution result — Readable Glass + Cloud Account

- `readable-glass.css` reduced from **358** to **268** `!important` declarations (**-90**).
- `cloud-sync.css` reduced from **167** to **19** (**-148 / ~89%**).
- Whole-app CSS debt reduced from **1,700** to **1,462** in this phase.
- Combined reduction since the original audit baseline: **2,583 → 1,462** (**-1,121 / ~43%**).
- Removed the obsolete Overview specificity bridge and de-escalated Overview material to normal cascade except the legacy border/radius contracts still required against `styles.css`.
- Consolidated Cloud Account from multiple historical layout generations into the 2026-07-31 layout authority plus the 2026-08-27 focused login-control authority.
- Retained only Cloud Account `!important` declarations with a documented competitor in `styles.css` (global button font weight and `.cloud-account form button` primary-action rules), plus the hidden-state contract.
- Current Places material authority is already mostly normal cascade; remaining large Places/Navigation counts in `readable-glass.css` come primarily from older broad/global authority selectors rather than the current Places feature block.
- Focused Phase 3 design/asset/performance suite: **103/103 PASS**.
- Full repository suite: **257/259** under the default Node environment. The two failures were environment/contract issues outside the Phase 3 diff: one test could not resolve Git from PATH, and one line-ending-sensitive AI marker test expected LF in a CRLF file. The Git-dependent concurrency suite passed **19/19** with GitHub Desktop Git added to PATH, and the Navo duplicate-prevention assertion passed with CRLF normalized in memory.

Next recommended phase: reduce the legacy global authority at the top of `readable-glass.css` together with the broad card/button rules in `styles.css`, then consolidate Navigation against `mobile-menu.css`. Do not continue stripping Places-specific material blindly.


## Phase 4 execution result — Legacy global layer + Home ownership

- `styles.css` reduced from **17** to **0** `!important` declarations. The base stylesheet now provides defaults instead of forcing feature layers to escalate specificity.
- `cloud-sync.css` reduced from **19** to **1**; the only remaining declaration is the behavioral `.cloud-account [hidden]{display:none!important}` contract.
- `theme.css` reduced from **624** to **531** by removing obsolete Cloud Account rules and three historical Home component generations now owned by `cloud-sync.css` and `home-organizer.css`.
- `home-organizer.css` reduced from **66** to **2** `!important` declarations, retaining only explicit visibility contracts.
- Whole-app CSS debt reduced from **1,462** to **1,270** in this phase.
- Combined reduction since the original audit baseline: **2,583 → 1,270** (**-1,313 / ~51%**).
- Test infrastructure hardened: data-integrity source slicing now normalizes CRLF/LF so marker-based checks are platform-independent.
- New guardrails require `styles.css` to stay at zero `!important`, keep Cloud Sync at one behavioral exception, keep Home Organizer at two or fewer, and prevent Cloud Account/Home legacy ownership from returning to `theme.css`.

Next recommended phase: consolidate Navigation ownership across `trip-redesign.css`, `mobile-menu.css`, and the remaining Navigation authority in `readable-glass.css`, then revisit Plan/Budget leftovers in `theme.css`.


## Phase 5 execution result — Navigation consolidation

- Whole-app CSS debt reduced from **1,270** to **1,099** `!important` declarations (**-171**).
- Combined reduction since the original audit baseline: **2,583 → 1,099** (**-1,484 / ~57%**).
- `mobile-menu.css`: **26 → 0**. It now owns only drawer open/closed state, shade behavior, reduced motion, and mobile/desktop control visibility.
- `trip-redesign.css`: **114 → 92**. It owns drawer/header geometry, responsive layout, LTR/RTL placement, and utility-control geometry.
- `readable-glass.css`: **268 → 191**. The 77-declaration mobile drawer specificity layer was replaced with normal-cascade material rules.
- `theme.css`: **531 → 500**. Sidebar theme rules are desktop fallbacks without specificity escalation; mobile material no longer leaks from Theme.
- `security-center.css`: **14 → 3** and `admin-center.css`: **8 → 4** by removing launcher-specific escalation while preserving security/admin modal behavior.
- Navigation-specific `!important` debt across `readable-glass.css`, `trip-redesign.css`, `theme.css`, `mobile-menu.css`, `security-center.css`, and `admin-center.css` is now **0**.
- Ownership contract: **state = mobile-menu.css**, **geometry = trip-redesign.css**, **material = readable-glass.css**, **feature launchers = security/admin defaults**, **Theme = desktop semantic fallback only**.
- Added a regression guardrail that rejects any new navigation `!important` in those six files.

Next recommended phase: Plan/Budget ownership cleanup inside `theme.css` and their feature styles. Navigation should now be treated as closed unless a visual/runtime regression is found.


## Phase 6 execution result — Plan + Budget ownership

- Whole-app CSS debt reduced from **1,099** to **752** `!important` declarations (**-347** in this phase).
- Combined reduction since the original audit baseline: **2,583 → 752** (**-1,831 / ~71%**).
- `theme.css`: **500 → 241**. Plan-specific `!important` ownership in Theme is now **0**.
- Plan behavior/layout/action semantics moved to `auto-planner.css` using normal cascade and semantic tokens; `auto-planner.css` remains at **0** `!important`.
- Auto-place state ownership moved to `place-auto-fill.css`; its debt reduced **21 → 2**, retaining only explicit hidden-state contracts. Historical Auto-place Theme patches were removed.
- Budget-specific high-specificity receipt/action/hero patches were removed from Theme. Remaining selectors that happen to include `#budget` in Theme are shared multi-screen rules, not Budget-specific ownership.
- `trip-experience.css`: **74 → 5** `!important`, retaining only collapse/hidden/modal-scroll behavioral state contracts.
- Updated Plan/Budget ownership tests so semantic surface/action assertions follow the current owners instead of requiring legacy duplicated-ID Theme selectors.
- Added Phase 6 debt ceilings and ownership regression checks for `auto-planner.css`, `trip-experience.css`, and `place-auto-fill.css`.
- Focused Plan/Budget/Surface/Theme/Performance suite: **93/93 PASS** after all Phase 6 changes.

Next recommended phase: audit the remaining shared global selectors in `theme.css` and `readable-glass.css`; do not classify multi-screen design-system rules as Plan/Budget debt simply because their selector lists include those screens.


## Phase 7 execution result — shared/global ownership

- Whole-app CSS debt reduced from **752** to **620** `!important` declarations (**-132** in this phase).
- Combined reduction since the original audit baseline: **2,583 → 620** (**-1,963 / ~76%**).
- `theme.css`: **241 → 109**.
- Shared section-header text/spacing ownership now lives in `readable-glass.css`; legacy page-specific header escalation was removed from Theme.
- Trip frame and Hero geometry moved to `trip-redesign.css` with the same currently rendered desktop/mobile values, but without Theme `!important` escalation.
- Mate launcher/header visual ownership moved to `ai-assistant.css`; the launcher remains 48px as before.
- Transport dark note and official-fares presentation are owned by `transport-planner.css`; duplicate Theme overrides were removed.
- `readable-glass.css` remains at **191** `!important` declarations; a newly introduced section-header width escalation was removed instead of raising the debt ceiling.
- Focused Theme/Surface/Design/Performance suite: **90/90 PASS**.

### Intentionally retained for a later visual-runtime pass
Group, Memories and global Currency contrast overrides remain in `theme.css` for now. They participate in lazy-loaded feature transitions and removing or moving them without browser/mobile visual verification could cause transient white-on-white or contrast flashes. They are therefore treated as known semantic exceptions rather than blindly removed debt.

Next recommended cleanup: visual-runtime validation of Group/Memories/Currency followed by feature-owner migration only where no loading-state regression is observed.


## Phase 8 execution result — Group, Memories, Currency and Documents

- Whole-app CSS debt reduced from **620** to **548** `!important` declarations (**-72** in this phase).
- Combined reduction since the original audit baseline: **2,583 → 548** (**-2,035 / ~79%**).
- `theme.css`: **109 → 32**.
- Group sender tones, message contrast, collaboration-live and privacy semantics are owned by `collaboration.css`.
- Memories upload, album action and summary contrast are owned by `trip-experience.css`.
- Currency dark-theme semantics are owned by `trip-experience.css`, using semantic card variables instead of Theme escalation.
- Documents is now excluded from top-level page material rules in `readable-glass.css`; the old six-property transparent-wrapper override was removed from Theme rather than moved elsewhere.
- Browser cascade harness verified Group, Memories and Currency computed colors in Light/Dark and desktop/mobile contexts; no white-on-white result was observed.
- Full-page headless Chrome/Edge dump was unavailable in this environment (empty DOM output), so phone/interactive full-page visual QA remains the final runtime check.
- Focused Phase 8/Surface/Documents suite: **71/71 PASS** after the Documents cleanup.

Remaining Theme `!important` rules are predominantly global theme backgrounds, icon reset/fallback, body overlay suppression, mobile/tap-target safety and select-option contrast. Treat these as deliberate global exceptions until a dedicated runtime pass proves they can be de-escalated.


## Phase 9 execution result — Weather and shared material cleanup

- Whole-app CSS debt reduced from **548** to **439** `!important` declarations (**-109** in this phase).
- Combined reduction since the original audit baseline: **2,583 → 439** (**-2,144 / ~83%**).
- `weather-widget.css`: historical Weather modal escalation reduced to **0** `!important`.
- Weather nested cards (`.weather-insight`, `.weather-live-day`) were removed from generic Modal/Glass material ownership so Weather can own them through normal cascade.
- Weather shell colors now flow through `--tm-overlay-*` variables and secondary/close button colors through `--tm-control-current-*` variables.
- Runtime Chrome computed-style QA verified desktop/mobile Weather contrast, layout and controls after de-escalation.
- Runtime QA exposed a real dependency: the global unboxed-icon reset was overriding `.weather-live-day-icon`. The root selector was corrected to exclude that component rather than restoring `!important` inside Weather.
- `readable-glass.css`: **191 → 185**.
- `trip-redesign.css`: **92 → 64**.
- Documents top-level wrapper no longer needs forced transparent material overrides after the Phase 8 Glass exclusion.
- Focused Theme/Surface/Weather/Performance suite remained green after the refactor.

Remaining debt is concentrated in shared Design System material, modal infrastructure, intentional global fallbacks, and a small number of feature-specific control/layout exceptions. Further reduction should be performed as a separate ownership pass rather than by bulk removal.

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

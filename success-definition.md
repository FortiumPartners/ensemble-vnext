# Functional Success Definition: fix-design-command-defects

**Source**: docs/TRD/fix-design-command-defects.md §Reproduction (supplied to the deriver as extracted text only; the TRD itself was not read)
**Source kind**: reproduction
**Derived**: 2026-11-16T09:06:35Z
**Criteria**: 19

## Source lines cited

The reproduction is two defect reports against dart's `add-menu` design. The `Cites` column
refers to these sentences of it:

| Label | Source sentence (verbatim or near-verbatim) |
|-------|---------------------------------------------|
| #150 Actual | "the contract and design-system.md handle only 'no canvas recorded'; when a canvas recorded in design-map.json or the Design System page recorded in design_system.url returns not-found or no-access from the current account, /refine-design and /design-system --sync end COMMAND STUCK asking a person to share them." |
| #150 Expected | "publish a new one from the committed files (docs/ui/<slug>/canvas/ for a canvas, docs/ui/_design-system/<folder>/ for the system page), record the new URL with the old one kept as previous_url (map entries and artifacts.json entries), say so in DECISIONS, carry on, never STUCK." |
| #150 Scope | "Only on not-found or no-access; any other read error unchanged." |
| #150 Sync base | "A republished canvas starts a fresh sync base." |
| #150 Lib | "previous_url exists nowhere in lib/ today." |
| #152 Actual | "/audit-design ranks every below-floor contrast or 44px target miss high, including those on library components reused unchanged through x-import, every round, with no way to record them as build-side work." |
| #152 Separate | "the audit separates 'drawn by this design' from 'reused component, unchanged'" |
| #152 Rulings | "reads a recorded accept/fix-in-build list from brief.md '## Accessibility caveats' and design.md section 4 (never editing design.md)" |
| #152 Caveats | "reused below-floor misses show as known build-side caveats when such a ruling is recorded while hand-drawn misses stay high" |
| #152 Disabled | "disabled controls (disabled attribute or aria-disabled) are exempt from contrast only, text explaining why is still measured, target size not exempt" |
| #152 Refine | "/refine-design with no feedback skips findings marked as recorded build-side caveats." |

Every criterion below is proven by text (a session transcript, a written file, a report), so
every row is `locator`. No criterion's sentence states a count, so `Parts` is blank throughout.
The fixture runs these criteria need are the `fixtures` environment (headless sessions in a
scaffolded fixture repo) and `claude-artifacts` (publishing a private throwaway page), both
listed in `verification.md` §1.

| ID | Functional statement | Cites | Evidence that would prove it | Derivation | Tier 1 | Parts | Must pass |
|----|----------------------|-------|------------------------------|------------|--------|-------|-----------|
| FS-1 | When the canvas URL recorded in design-map.json returns not-found from the current account, `/refine-design` publishes a new canvas from the committed files under `docs/ui/<slug>/canvas/`, records the new URL, carries on, and does not end COMMAND STUCK | #150 Expected; #150 Actual | Headless fixture-session transcript of `/refine-design` on a design whose design-map.json canvas URL points at a non-existent artifact: shows the not-found read, an Artifact publish from `docs/ui/<slug>/canvas/`, the run continuing, and a final `COMMAND COMPLETE` banner (no `COMMAND STUCK`); plus the design-map.json after the run holding the new URL | [read] | locator | | O1 |
| FS-2 | When the canvas URL recorded in design-map.json returns no-access from the current account, `/refine-design` publishes a new canvas from `docs/ui/<slug>/canvas/`, records the new URL, carries on, and does not end COMMAND STUCK | #150 Expected; #150 Actual | Same as FS-1, with the recorded canvas URL pointing at an artifact the fixture session's account cannot open: transcript showing the no-access read, the republish, and a `COMMAND COMPLETE` banner; design-map.json holding the new URL | [read] | locator | | O1 |
| FS-3 | When the Design System page recorded in `design_system.url` returns not-found or no-access from the current account, `/design-system --sync` publishes a new Design System page from the committed files under `docs/ui/_design-system/<folder>/`, records the new URL, carries on, and does not end COMMAND STUCK | #150 Expected; #150 Actual | Headless fixture-session transcript of `/design-system --sync` with `design_system.url` set to an unreachable artifact: shows the not-found/no-access read, an Artifact publish from `docs/ui/_design-system/<folder>/`, and a `COMMAND COMPLETE` banner; the file holding `design_system.url` after the run showing the new URL | [read] | locator | | O1 |
| FS-4 | After a canvas is republished, its design-map.json entry holds the new URL and keeps the replaced URL as `previous_url` | #150 Expected ("record the new URL with the old one kept as previous_url (map entries …)") | design-map.json from the FS-1 or FS-2 run, showing the canvas entry's new URL and `previous_url` equal to the URL that failed to read | [read] | locator | | O2 |
| FS-5 | After a canvas or Design System page is republished, its artifacts.json entry holds the new URL and keeps the replaced URL as `previous_url` | #150 Expected ("… and artifacts.json entries") | `.trd-state/<feature>/artifacts.json` (fetched from the records ref if not in the worktree) after the FS-1/FS-2 and FS-3 runs, showing the replaced entry's new `url` and `previous_url` equal to the old one | [read] | locator | | O2 |
| FS-6 | When the Design System page is republished, the place that records `design_system.url` holds the new URL and keeps the replaced URL as `previous_url` | #150 Expected ("record the new URL with the old one kept as previous_url") | The file holding `design_system.url` after the FS-3 run, showing the new URL and `previous_url` equal to the URL that failed to read | [read] | locator | | O2 |
| FS-7 | The library that writes artifacts.json entries accepts a `previous_url` and keeps it in the entry it writes (today `previous_url` exists nowhere in lib/) | #150 Lib; domain-derived: artifacts.json entries are written only through the project's artifact-record library helper, so the #150 Expected requirement that artifacts.json entries keep `previous_url` cannot be met unless that helper preserves the field | Output of the artifact-record library CLI (`record` then `get`/`read`) run locally against a scratch state folder, showing an entry recorded with a `previous_url` and read back with it intact | domain-derived | locator | | O2 |
| FS-8 | When a canvas or the Design System page is replaced, the command's readout says so in its DECISIONS section | #150 Expected ("say so in DECISIONS") | The final readout of the FS-1/FS-2 and FS-3 runs: the `DECISIONS` section contains a line stating the canvas (or system page) was republished because the recorded one could not be read, naming the new URL | [read] | locator | | O2 |
| FS-9 | A republished canvas starts a fresh sync base: the sync base recorded after the republish belongs to the new canvas, not one carried over from the replaced URL | #150 Sync base | design-map.json (and any sync-base record the run writes) after the FS-1 run, showing the sync base reset to the newly published canvas rather than the old canvas's prior sync state | [read] | locator | | O2 |
| FS-10 | A canvas or Design System page read that fails with any error other than not-found or no-access does not trigger a republish: no new artifact is published, the recorded URL is unchanged, and no `previous_url` is written | #150 Scope | Headless fixture-session transcript of `/refine-design` (or `/design-system --sync`) where the canvas read fails with a different error, showing no publish call; design-map.json and artifacts.json after the run with the original URL and no `previous_url` | [read] | locator | | |
| FS-11 | `/audit-design` labels each below-floor contrast miss and each below-44px target-size miss as either drawn by this design or on a reused component unchanged through `x-import` | #152 Separate; #152 Actual | `/audit-design` report from a fixture design holding one hand-drawn element below the contrast floor and one library component reused unchanged through `x-import` that is also below floor: the two findings carry different labels ("drawn by this design" versus "reused component, unchanged") | [read] | locator | | O4 |
| FS-12 | A below-floor contrast or target-size miss on an element drawn by this design is ranked high, including when a build-side caveat ruling is recorded for reused components | #152 Caveats ("hand-drawn misses stay high") | The FS-11 report, and a second `/audit-design` report after a ruling is recorded in brief.md `## Accessibility caveats`: in both, the hand-drawn miss is ranked high | [read] | locator | | O4 |
| FS-13 | With an accept or fix-in-build ruling recorded in brief.md `## Accessibility caveats`, `/audit-design` shows a below-floor miss on a reused, unchanged component as a known build-side caveat instead of a high finding | #152 Rulings; #152 Caveats | `/audit-design` report on the FS-11 fixture after adding the reused component's ruling to brief.md `## Accessibility caveats`: the reused miss appears as a known build-side caveat and not as a high finding | [read] | locator | | O5 |
| FS-14 | With an accept or fix-in-build ruling recorded in design.md section 4, `/audit-design` shows a below-floor miss on a reused, unchanged component as a known build-side caveat instead of a high finding | #152 Rulings; #152 Caveats | `/audit-design` report on the FS-11 fixture with the ruling recorded only in the fixture's design.md section 4 (brief.md carrying none): the reused miss appears as a known build-side caveat and not as a high finding | [read] | locator | | O5 |
| FS-15 | With no ruling recorded in either brief.md or design.md section 4, a below-floor miss on a reused, unchanged component is not shown as a known build-side caveat | #152 Caveats ("when such a ruling is recorded") | The FS-11 report (no ruling recorded anywhere): the reused miss is reported as a finding, with no build-side-caveat label | [read] | locator | | O5 |
| FS-16 | `/audit-design` never edits design.md | #152 Rulings ("never editing design.md") | `git diff --stat` (or a before/after sha256) of the fixture's design.md across the FS-14 run, showing no change | [read] | locator | | O5 |
| FS-17 | A disabled control (one carrying the `disabled` attribute or `aria-disabled`) is not reported for a contrast miss | #152 Disabled ("exempt from contrast only") | `/audit-design` report on a fixture board holding a below-floor control marked `disabled` and another marked `aria-disabled`: neither has a contrast finding | [read] | locator | | |
| FS-18 | Text explaining why a control is disabled is still measured for contrast, and a disabled control below 44px is still reported for target size | #152 Disabled ("text explaining why is still measured, target size not exempt") | The FS-17 report, with that fixture also holding below-floor explanatory text next to the disabled control and the disabled control sized below 44px: the text carries a contrast finding and the control carries a target-size finding | [read] | locator | | |
| FS-19 | `/refine-design` run with no feedback skips findings marked as recorded build-side caveats: it does not act on them, while other findings are still worked | #152 Refine | Headless fixture-session transcript of `/refine-design` with no feedback, on a design whose audit holds one recorded build-side caveat and one ordinary finding: the readout shows the caveat skipped and the ordinary finding addressed, and the board carrying the caveated component is not redrawn for it | [read] | locator | | |

**Objective coverage.** O1 is named by FS-1, FS-2 and FS-3; O2 by FS-4 through FS-9; O4 by
FS-11 and FS-12; O5 by FS-13 through FS-16. Every supplied must-pass objective is supported
by the source and covered. FS-10 (other read errors unchanged), FS-17 and FS-18 (disabled
controls) and FS-19 (`/refine-design` skipping recorded caveats) come from the source but
prove none of the supplied must-pass objectives, so their `Must pass` cells are blank.

**Note on FS-2.** Producing a genuine no-access read needs an artifact owned by an account
the fixture session cannot see. If that cannot be arranged in the fixture environment, the
exerciser states so and the judge rules on that reason; FS-1 (not-found) is still provable
on its own.

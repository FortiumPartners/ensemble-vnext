# TRD: fix-design-command-defects

**Kind**: defect

**Source PRD**: None — two defects (GitHub #150 and #152) reported by the dart product on 2026-11-16, per `docs/plans/fix-design-command-defects/brief.md` sections 2 and 4. The other two defects in that brief (#149, #151) are already fixed in commit 73f6dac1 and are out of scope here.

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | When a canvas recorded in `design-map.json`, or the Design System page recorded in `design_system.url`, is not found or not accessible from the current account, `/refine-design` and `/design-system --sync` publish a new one from the committed files, record the new URL, and carry on; they do not end STUCK | brief §2 (#150), owner 2026-11-16 | yes |
| O2 | The old URL is kept as `previous_url` when a canvas or system URL is replaced (map entries and `artifacts.json` entries), the DECISIONS line says so, and a republished canvas starts a fresh sync base | brief §2, owner decision "a republished canvas starts a fresh sync base" | yes |
| O3 | Republishing happens only on not-found or no-access; any other read error behaves as today | owner decision under auto, 2026-11-16 | |
| O4 | `/audit-design` separates a below-floor contrast or target miss on a component drawn by this design from one on a reused `x-import`ed component, and a hand-drawn miss stays ranked high | brief §4 (#152) | yes |
| O5 | The audit reads recorded accessibility caveats from `brief.md` `## Accessibility caveats` and `design.md` section 4, never edits `design.md`, and shows a reused below-floor miss as a known build-side caveat only when such a ruling is recorded | brief §4 | yes |
| O6 | Disabled controls (`disabled` attribute or `aria-disabled="true"`) are exempt from the contrast floor; text that explains why is not inside the control and is still measured; target size is not exempted | owner decision under auto, 2026-11-16 | |
| O7 | `/refine-design` with no feedback skips findings marked as recorded build-side caveats | brief §4 | |

## Reproduction

The dart repository is not on this machine, so both defects were read from their issues, not reproduced. What was checked in this repository **[read]**:

### Steps
- #150: `grep -ciE 'unreadable|not readable|previous_url' packages/core/commands/refine-design.md packages/core/commands/design-system.md` and section 1 of `packages/core/contracts/design-commands.md` find nothing relevant; `previous_url` appears nowhere under `packages/core/lib/`.
- #152: `sed -n 425,440p packages/core/workflows/audit-design.js | grep -c component` prints 0.

### Actual
- #150: the contract (§1 steps 3-4, §3, §4) and `design-system.md` steps 6-8 handle only "no canvas recorded"; a recorded URL that cannot be read has no rule, so the run ends STUCK asking a person to share the artifacts **[read]**.
- #152: the measure script in `design-render.js` (`MEASURE_SCRIPT`, ~lines 444-600) tags a below-floor measure with `describe(el)` only, so `visualFindings` in `audit-design.js` (~line 427) ranks every `below-floor` contrast or target measure high **[read]**.

### Expected
See O1-O7.

Root cause of both: a missing rule and a missing field, not a mis-written line **[inferred]** (neither was reproduced; read from the issues and the code).

## Decision

**#150: a library verb does the record-keeping, the prose says when to call it.** Add `design-map.js republished` (canvas or system) and make `artifacts.js record` keep `previous_url`; the contract gets one new paragraph, "Unreadable recorded artifact", that §1 step 3-4, §3 and `design-system.md` steps 6-8 point at. The command, not the library, decides "not-found or no-access" from the Artifact tool's read result, because only the session can call the tool.
A republished canvas has no sync base to compare against, so the verb clears `version`, `synced_at` and `files` on that canvas entry and the command then runs `design-mirror.js record` against the new URL once it has the new version. The rule does not apply to `/audit-design` (report-only: it falls back to the existing "No canvas to read" Design-type read) and not with `publish: off` (existing behaviour). A republished canvas comes up without its design system, because the mirror leaves out `project/ds/`: the rule reinstalls the system per contract §3 from `docs/ui/_design-system/<folder>/`. A replaced Design System URL is written once per map under `docs/ui/*/` (as step 8 already does), keeping `previous_url`.
Alternative rejected: reusing `design-mirror.js record` alone, because it needs the entry's `url` to exist already and cannot swap the URL.

**#152: the renderer marks reuse, the library reads the recorded ruling, the workflow ranks.** Three separate pieces, each deterministic:
1. `design-render.js`'s measure script marks a measure `reused: true` when the element has no `data-dc-tpl` attribute and sits inside `.sc-host-x`. The runtime stamps `data-dc-tpl` on every element a board itself draws and wraps every `x-import` in `div.sc-host-x` **[read, `dc-runtime.js`, by the adversarial review]**, so hand-drawn children placed inside an imported component keep their tag and stay "drawn" (high), while library internals at any depth, nested composites, `forwardRef` and `memo` components are all "reused". No React, no component-name list, no plumbing through `measure()`. Rejected: walking React fibers, which would mark a hand-drawn child of an imported component as reused and hide a design's own fault. FIX-004 tests that a `dc-import` part's own elements are stamped too.
2. A new `design-map.js caveats` verb reads, never writes, the two recorded places and returns `{ items, reused_build_side, sources }`. `reused_build_side` is true when the brief's `## Accessibility caveats` section has at least one bullet (the owner recorded an accept-or-fix-in-build list there) or `design.md` section 4 has a sentence naming reused or library components as build-side work.
3. `visualFindings` ranks: drawn miss → high; reused miss with `reused_build_side` true → `rank: 'low'`, `known_caveat: true`, `why` starting "known build-side caveat (reused component)"; reused miss with nothing recorded → high, `why` saying no accept-or-fix call is recorded and where to record it.
Alternative rejected: matching a caveat per component name from prose. Free-text matching is the brittle part; one boolean from a documented heading and one sentence rule is what the owner's dart rule actually says ("reused components are build-side work").

**Disabled controls (O6)** are skipped inside the measure script for contrast only, by `el.closest('[disabled],[aria-disabled="true"]')`. Nothing else in the report changes.

## Non-Goals

- No change to #149 or #151 work (already committed).
- No edit of `design.md` by any command (owner-only, AC-F6.2).
- No republish on any read error other than not-found or no-access.
- `/create-design`'s fix round still ranks every below-floor measure high (`MEASURE_RANK`); it is a sibling of #152 and is left for a separate fix. The disabled-control exemption (O6) does reach it and `/sync-design`, because it is in the shared measure script; that is intended.
- No per-component caveat matching; no new ranking tier other than the existing `low`.
- No release, version bump or CHANGELOG entry (release is a separate owner decision).

## Verification Artifacts

None apply — these are Markdown commands, a contract, two libraries and a workflow script, verified by Jest tests; no screen, data view or journey is built.

## Verification Environment

**Environment**: local
**Refresh**: none declared
**Cannot be checked there**: a live `/refine-design` against an artifact from another claude.ai account, and dart's real board render; the prose rules and library verbs are checked by tests only.

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | Is a `dc-import` part's own markup stamped `data-dc-tpl` like a board's? | Yes (parts parse through the same template parser); a FIX-004 test fails if not | |

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | `artifacts.js`: keep the replaced URL as `previous_url` when `record` changes a non-empty URL to a different one; carry the field through `normaliseEntry`; an unchanged URL adds nothing; a later `record` with no `--url` keeps both `url` and `previous_url` | O2 | None | A Jest test records URL A then URL B and reads back `previous_url === A`; recording B again leaves `previous_url` A; a first record and a same-URL record have no `previous_url`; a record with `url` omitted keeps `previous_url`; the test fails against the old code |
| FIX-002 | `design-map.js`: add `republished(dir, { kind, old, new })` and CLI verb `republished --dir D --kind canvas\|system --new U [--old U]`. For a canvas: set the entry's `url` to the new one, `previous_url` to the old, repoint every `boards[].canvas` equal to the old URL, clear `version`, `synced_at`, `files` and the legacy `synced_version` (which `design-mirror.js check` falls back to). For `system`: set `design_system.url` and `previous_url`. `validate` must still pass | O1, O2, O3 | None | Jest tests: map after `republished` validates; boards' `canvas` follows; `design-mirror.js check` against the new URL reports `changed` (no base) and `record` then stores a base; an `--old` URL not in the map throws and writes nothing |
| FIX-003 | Prose rule "Unreadable recorded artifact" in contract §1 (new paragraph after step 4) and a pointer in §3 and §4; `design-system.md` steps 6-8 and `refine-design.md` (where it reads the canvas) point at it. The rule (not for `/audit-design`, not with `publish: off`): republish only when the read returns not-found or no-access, from `docs/ui/<slug>/canvas/` or `docs/ui/_design-system/<folder>/`; call `design-map.js republished` and `artifacts.js record`; add a DECISIONS line naming the old and new URL; never STUCK for this cause; any other read error unchanged | O1, O2, O3 | FIX-001, FIX-002 | A new prose test over the contract, `design-system.md` and `refine-design.md` asserts, scoped to the new "Unreadable recorded artifact" paragraph: `previous_url`, "not-found or no-access", `republished`, a DECISIONS line naming the old and new URL, the system reinstall per §3, the audit and `publish: off` exclusions, and "never STUCK"; the paragraph does not exist today, so each assertion fails without the fix |
| FIX-004 | `design-render.js` measure script: mark `reused: true` on a contrast or target measure whose element has no `data-dc-tpl` and sits inside `.sc-host-x`; include `reused` in the grouping key so reused and drawn misses never merge; skip contrast for an element inside a disabled control; document the new field in the header. `audit-design.js` `MEASURE_SCHEMA` gains `reused: { type: 'boolean' }` so the visual critic's verbatim relay keeps it | O4, O6 | None | Jest tests in `design-render.test.js` using a real render with the design-system script (the existing D4 block): a global component rendering a low-contrast span has `reused: true`; a hand-drawn low-contrast child inside the same `x-import` has no `reused` and is a separate group; the same colours outside any import have no `reused`; a `dc-import` part's own elements are not marked reused; a below-floor `button[disabled]` and an `aria-disabled="true"` control yield no contrast measure while an enabled twin does, and a disabled control's target-size miss is still reported |
| FIX-005 | `design-map.js`: add `caveats(dir)` and CLI verb `caveats --dir docs/ui/<slug>`: returns `{ items, reused_build_side, sources }` from `brief.md` `## Accessibility caveats` bullets and a `design.md` section 4 line naming reused or library components as build-side; reads only; absent file or heading returns an empty result | O5 | None | Jest tests: bullets are returned in order and set `reused_build_side`; a section 4 line "reused components are build-side work" sets `reused_build_side`; neither present → `{ items: [], reused_build_side: false }`; the function does not change `design.md` (hash compared before and after) |
| FIX-006 | `audit-design.js` and `audit-design.md`: the command runs `design-map.js caveats` and passes `caveats` in the workflow args; the record-it hint names `## Accessibility caveats` in `brief.md` exactly; `visualFindings` ranks per the Decision (drawn high; reused with recorded ruling `low` + `known_caveat: true` + "known build-side caveat"; reused unrecorded high with the record-it hint); the report lists the known caveats under VISUAL FINDINGS with the "known build-side caveat" wording | O4, O5 | FIX-004, FIX-005 | Jest tests in `audit-design.test.js`: a below-floor measure with `reused: true` and `caveats.reused_build_side` true yields `rank: 'low'` and `known_caveat: true`; the same measure without a recorded ruling yields `high`; a measure without `reused` stays `high` in both cases; the command prose passes `caveats` |
| FIX-007 | `refine-design.md` no-feedback rule: a VISUAL FINDINGS line marked "known build-side caveat" is not an open finding; it is skipped, and STATE says how many were skipped | O7 | FIX-006 | A prose test in `refine-design-prose.test.js` asserts the rule names "known build-side caveat" and that it is skipped; a report whose only open findings are known caveats counts as the existing "no change made" run |
| FIX-008 | Sync the vendored copies: every changed file under `packages/core/` copied to its `.claude/` counterpart, as commit 73f6dac1 did | O1, O2, O3, O4, O5, O6, O7 | FIX-001, FIX-002, FIX-003, FIX-004, FIX-005, FIX-006, FIX-007 | `diff -rq packages/core/lib .claude/lib` (and `commands`, `contracts`, `workflows`) reports no difference for the touched files; the full Jest suite passes |
| AMEND-001 | Republished canvas and Design System page must both be recorded in artifacts.json with new url and previous_url (FS-5) (`packages/core/contracts/design-commands.md`, `packages/core/commands/refine-design.md`, `packages/core/commands/design-system.md`) — promoted from a gap discovery found by verify-build --fix [plan:B1 @ 2026-11-16T10:00:00Z] | plan blocker B1 | None | Republished canvas and Design System page must both be recorded in artifacts.json with new url and previous_url (FS-5) no longer holds |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/lib/artifacts.js`, `packages/core/lib/artifacts.test.js`
- **Reuse:** `normaliseEntry` and `record()`'s existing `prev`/`next` comparison, which already decides "unchanged" [read]
- **Replaces:** nothing; `previous_url` is not a field anywhere in `lib/` today [ran]
- **Follow:** the existing entry shape `{path, url, updated_at, command}`; an unchanged entry rewrites no bytes [read]
- **Careful:** include `previous_url` in the `unchanged` comparison, or a republish to the same URL would rewrite the file every run [read]

### FIX-002
- **Touches:** `packages/core/lib/design-map.js`, `packages/core/lib/design-map.test.js`
- **Reuse:** `read`/`write`/`validate` (the `urls` set at ~line 104 and `design_system` checks at ~line 105); `design-mirror.js` `record` for the fresh base afterward [read]
- **Replaces:** the hand-written `node -e` that sets `design_system.url` in `design-system.md` step 8 stays valid; the new verb is the path for a replaced URL [read]
- **Follow:** the CLI verb pattern at the top of the file's usage line (`read|validate|refresh|...`) [read]
- **Careful:** delete the legacy `synced_version` too; `boards[].canvas` must follow the URL or `validate` fails at ~line 138 ("canvas not in canvases") [read]

### FIX-003
- **Touches:** `packages/core/contracts/design-commands.md`, `packages/core/commands/design-system.md`, `packages/core/commands/refine-design.md`, `packages/core/commands/design-unreadable-prose.test.js`
- **Reuse:** the structure of `packages/core/commands/design-no-rm-prose.test.js`, added in 73f6dac1 [read]
- **Replaces:** nothing; today's "STUCK asking a person to share" has no source line to delete, it is the absence of a rule [read]
- **Follow:** other contract rules state their DECISIONS/ISSUES line explicitly [read]
- **Careful:** the contract's §1 step 4 reads the canvas for sync; the new rule must come before that read can fail the run, and must say it does not apply to "no canvas recorded", which already creates one [read]

### FIX-004
- **Touches:** `packages/core/lib/design-render.js`, `packages/core/lib/design-render.test.js`, `packages/core/workflows/audit-design.js`
- **Reuse:** `describe`, `group`, `visible` inside `MEASURE_SCRIPT`; the existing D4 design-system render block in `design-render.test.js` [read]
- **Replaces:** nothing
- **Follow:** `MEASURE_SCRIPT` is a `String.raw` template evaluated in the page: no module syntax, ES5 style (`var`, `function`) [read]
- **Careful:** grouping keys must include the reused flag; `data-dc-tpl` and `.sc-host-x` come from the pinned `dc-runtime.js` [read]; `MEASURE_SCHEMA` at `audit-design.js` ~line 148 must list `reused` [read]

### FIX-005
- **Touches:** `packages/core/lib/design-map.js`, `packages/core/lib/design-map.test.js`
- **Reuse:** `direction()`'s `sectionOf` heading reader and `normText` over `design.md` (~lines 478-486) [read]
- **Replaces:** nothing
- **Follow:** `direction` reads design.md only; the new verb additionally reads `docs/ui/<slug>/brief.md` and must never write either [read]
- **Careful:** design.md may be `unfilled`; `caveats` must still return an empty result, not throw [inferred]

### FIX-006
- **Touches:** `packages/core/workflows/audit-design.js`, `packages/core/workflows/audit-design.test.js`, `packages/core/commands/audit-design.md`
- **Reuse:** `visualFindings` and the `base` object (~lines 427-440); the `floor`/`direction` args plumbing at lines 63-68 [read]
- **Replaces:** the single "below-floor … rank: 'high'" branch at line 434 [read]
- **Follow:** findings are ranked in code and the result carries `visual.measures` verbatim [read]
- **Careful:** the command line `Workflow({ name: "audit-design", args: {...} })` (audit-design.md ~line 84) is the only place args are listed; add `caveats` there and to the header comment in the script [read]

### FIX-007
- **Touches:** `packages/core/commands/refine-design.md`, `packages/core/commands/refine-design-prose.test.js`
- **Reuse:** the "No feedback" bullet and its open-findings list (~lines 114-127), as amended in 73f6dac1 [read]
- **Replaces:** nothing
- **Follow:** the existing prose-test style in `refine-design-prose.test.js` [read]
- **Careful:** the VISUAL FINDINGS heading stays in the open-findings list; only the marked lines are excluded [read]

### FIX-008
- **Touches:** `.claude/lib/artifacts.js`, `.claude/lib/design-map.js`, `.claude/lib/design-render.js`, `.claude/contracts/design-commands.md`, `.claude/commands/design-system.md`, `.claude/commands/refine-design.md`, `.claude/commands/audit-design.md`, `.claude/workflows/audit-design.js`
- **Reuse:** `cp` of the `packages/core/` file to its `.claude/` twin, as 73f6dac1 did; `diff -rq packages/core/lib .claude/lib` printed nothing before this work [ran]
- **Replaces:** the stale vendored copies
- **Follow:** do not hand-edit `.claude/` first [read]
- **Careful:** copy only files that changed

### AMEND-001

- **Touches:** `packages/core/contracts/design-commands.md`, `packages/core/commands/refine-design.md`, `packages/core/commands/design-system.md`

## Could Not Verify

- dart's real board render; the tests render real fixture boards, but only a live run on dart shows the full effect.
- The not-found versus no-access distinction rests on the Artifact tool's read error text, which this repository cannot reproduce.

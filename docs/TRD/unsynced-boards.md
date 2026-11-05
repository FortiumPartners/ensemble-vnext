# TRD: unsynced-boards

**Source PRD**: None — small change decided in session (owner, 2026-11-05)

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | `design-map.js unsynced` lists exactly the to-be boards still `building` whose TRD's feature is closed (a `.trd-state/<feature>/closed.json` exists, `<feature>` being the TRD's basename without extension): a `building` board whose feature is still open, a `building` board with no `trd`, and a board in any other status are not listed; a project with no `docs/ui` folder gives an empty list, not an error | your instruction, 2026-11-05 ("detecting the mismatch for now, and recommending a sync when necessary") | yes |
| O2 | When `/audit-build` or `/close-feature` closes a feature, its readout names each unsynced board of that TRD and recommends `/sync-design <slug>` (after the PR merges, or now when the feature closed on the default branch); with no unsynced board it says nothing about syncing; neither command runs `/sync-design` | your instruction, 2026-11-05 ("reminding the user after an audit or a close feature, if there are unsynced boards") | |
| O3 | `/create-design`, `/refine-design` and `/audit-design` report the design's unsynced boards as an ISSUES line and put `/sync-design <slug>` in NEXT, after `/design-system --sync` when that is also due; `/sync-design` and `/design-system` do not run the check, and nothing runs automatically | your instruction, 2026-11-05 ("recommending a sync when necessary"; "then we bake in the automation as part of the ship-feature TRD") | |

## Intended Change

Today a board stays `building` after its feature closes until someone happens to run
`/sync-design`. `/audit-build` names `/sync-design <slug>` whenever the closed feature's TRD is
cited by any board (`audit-build.md` NEXT), including boards already `shipped`, because
`transition` never clears `trd`. `/close-feature` and the design commands say nothing.

After this change:

- **The check.** `node .claude/lib/design-map.js unsynced --dir docs/ui/<slug>` returns
  `[{ design, id, trd }]` for that one design. `node .claude/lib/design-map.js unsynced --all
  [--trd <path>]` scans every `docs/ui/*/design-map.json` (subfolders without a map, such as
  `_current` and `_design-system`, are skipped; no `docs/ui` folder returns `[]` with exit 0)
  and, with `--trd`, keeps only boards whose TRD names the same feature, compared by feature
  name in code, so `./docs/TRD/x.md`, an absolute path and `docs/TRD/x.md` all match. A board
  with no `trd` is never listed.
- **`/audit-build` (close path) and `/close-feature`.** After `closed.json` is written, each
  runs `unsynced --all --trd <trd-path>`. When it lists boards, NEXT gets one numbered step per
  design: a line naming that design's boards and saying to check them against the build with
  `/sync-design` once the PR has merged (or now, when the feature closed on the default branch,
  where there is no PR), with `/sync-design <slug>` alone in its fenced block. With none, NEXT
  says nothing about syncing. A failing check is one ISSUES line, never STUCK. Neither command
  runs `/sync-design`. This replaces `/audit-build`'s current unconditional design line.
- **The design commands.** Contract §1 step 6 becomes the stale-system **and unsynced-board**
  checks, so §1 keeps its six steps: also run `unsynced --dir docs/ui/<slug>`; on a non-empty
  result, add the ISSUES line "boards <ids> are still building although their feature closed:
  check them against the build" and put `/sync-design <slug>` in NEXT, after
  `/design-system --sync` when that is also due. Contract §7's ISSUES and NEXT lists gain the
  same item. Because `/create-design`, `/refine-design` and `/audit-design` each restate the
  stale check and their own NEXT order in their own words, each command's text is edited too.
  `/sync-design` does not run it (it is the remedy); `/design-system` does not run it (it
  touches no design's boards).

"Closed" is the trigger, not "merged". The post-merge automation, where shipped means the
audited commit has reached `main`, belongs to the ship-build TRD (owner, 2026-11-05).

## Decision

A status check, not a screenshot comparison: an unsynced board is one whose map status says
`building` after its feature's close record exists. Comparing the screen with its board stays
`/sync-design`'s job. The check reads only the map and `closed.json`, so every caller can run
it on every invocation at no cost, and the TRD filter is done in code (feature-name comparison),
not by the model comparing path strings. Rejected: detecting by git ancestry of the audited
commit (that is the shipped test the ship-build automation needs, and it needs a fetch); a
session-start banner reminder (three reminder points are enough); a new contract step 7 (it
would make the "six steps" pinned in `refine-design-prose.test.js` and stated in two commands
wrong); one `--dir` that switches between a design folder and a scan (no other verb works that
way, and a mistyped design folder would scan silently).

absorbed: none.
not absorbed: `/create-design` corrects a mismatched screenshot only after it has published — separate review finding, this works without it.
not absorbed: `/close-feature`'s already-closed path gets no reminder — it closes nothing, so O2 does not apply.

## Non-Goals

- Running `/sync-design` from any command, hook or banner.
- Deciding whether a PR has merged.
- Changing what `/sync-design` does.

## Verification Artifacts

None apply — the change is a library verb and command prose; no screens, journeys or data views change.

## Open Questions

none

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| USB-001 | Add `unsynced` to `design-map.js` (`--dir docs/ui/<slug>` for one design; `--all [--trd <path>]` for a scan), with unit tests, and copy to `.claude/lib/design-map.js` | O1 | None | Tests on a temp project with a closed and an open feature: only the closed feature's `building` to-be board is listed; `approved`, `shipped`, as-is and `building`-with-`trd: null` boards are never listed; `--all` returns entries from two designs with `design` set and skips a subfolder with no map; no `docs/ui` folder gives `[]`; `--trd ./docs/TRD/x.md` matches a board storing `docs/TRD/x.md`; a test asserts the two copies are byte-identical |
| USB-002 | `/audit-build` (close path) and `/close-feature` readouts run `unsynced --all --trd` after `closed.json` is written and name the boards per design, replacing `/audit-build`'s unconditional design line; mirrors and prose tests updated | O2 | USB-001 | Prose tests (in `sync-design-prose.test.js` for both commands) assert: the `unsynced --all --trd` call; that it runs after the close record; the merged-PR and default-branch wordings; one numbered step per design with `/sync-design <slug>` in a fenced block; the "with none, say nothing about syncing" sentence; a failed check is an ISSUES line; and no `Skill({ skill: "sync-design"`. The old `design-map.json.*trd` assertion is replaced |
| USB-003 | Contract §1 step 6 and §7 gain the unsynced-board check; `/create-design`, `/refine-design` and `/audit-design` add it to their own stale-check text and NEXT order; mirrors and tests updated | O3 | USB-001 | `design-commands.test.js` asserts step 6 names both checks, the ISSUES wording, `/sync-design <slug>` after `/design-system --sync` in §7, and each skipping command with its reason; each of the three command prose tests asserts the `unsynced --dir docs/ui/<slug>` call and `/sync-design <slug>` in that command's NEXT order; `refine-design-prose.test.js`'s "six steps" assertion still passes; every `.claude/` copy is byte-identical |

## Task Grounding

### USB-001
- **Touches:** `packages/core/lib/design-map.js`, `packages/core/lib/design-map.test.js`, `.claude/lib/design-map.js`
- **Reuse:** `read()`, `idList()`, `parseArgs()` (already accepts `--trd` and boolean flags like `--record`) and the `stale()` tests' temp-repo helpers [read]; feature name = TRD basename without extension, the rule `close-feature.md` and `router.py`'s `derive_feature()` share [read]
- **Follow:** pure function plus a thin CLI case, like `buildable`/`held`; JSON on stdout, exit 1 on error [read]
- **Careful:** `main()` throws without `--dir`; `--all` must be accepted without it. `transition --to building` without `--trd` stores `trd: undefined`, and fixtures default to `null`: never call `path.basename` on a missing `trd` [read]

### USB-002
- **Touches:** `packages/core/commands/audit-build.md`, `packages/core/commands/close-feature.md`, `packages/core/commands/sync-design-prose.test.js`, `.claude/commands/audit-build.md`, `.claude/commands/close-feature.md`
- **Reuse:** `/audit-build`'s "When the closed feature has a design" NEXT sentence and its default-branch branch ("Closed on the default branch") [read]
- **Replaces:** that sentence's unconditional naming of `/sync-design`, which fires for `shipped` boards too [read]
- **Follow:** `command-status.md` NEXT rules: each step its own numbered line, one fenced block per slash command, never a shell command [read]
- **Careful:** `sync-design-prose.test.js` pins the current wording (`/design-map\.json.*`trd`/`); `/audit-build` copies only "The close step" from `/close-feature`, not its Readout, so both readouts are edited [read]

### USB-003
- **Touches:** `packages/core/contracts/design-commands.md`, `packages/core/contracts/design-commands.test.js`, `packages/core/commands/create-design.md`, `packages/core/commands/refine-design.md`, `packages/core/commands/audit-design.md`, `packages/core/commands/create-design-prose.test.js`, `packages/core/commands/refine-design-prose.test.js`, `packages/core/commands/audit-design-prose.test.js`, `.claude/contracts/design-commands.md`, `.claude/commands/create-design.md`, `.claude/commands/refine-design.md`, `.claude/commands/audit-design.md`
- **Reuse:** §1 step 6's stale-system wording and §7's ISSUES and NEXT order [read]; each command's own restatement: `create-design.md` (stale check and NEXT), `refine-design.md` (same), `audit-design.md` step 2 and its NEXT order [read]
- **Follow:** step 6 already says which commands skip it and why; state each skip reason the same way [read]
- **Careful:** `refine-design-prose.test.js` pins "six steps", stated also in `create-design.md` and `refine-design.md`, so fold into step 6 and do not add a step. `audit-design.md` runs only `setup` from §1 and the stale check in its own step 2, so it does not pick a contract change up by citation. Its NEXT note says nothing may come before `/design-system --sync` [read]

## Could Not Verify

- No live run of the three design commands with an unsynced board present; the prose tests pin the text, not a session's output.

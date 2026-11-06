# Investigation: design-orchestration

**Kind**: change
**Weight**: medium
**Route**: plan

Source: GitHub issue #68, "Design commands: board selection and decision hand-back for
orchestrated, multi-feature use", opened 2026-11-05 by the owner. Every objective below traces
to that issue's "Changes" section.

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | `/create-trd <prd> --design docs/ui/<slug> --boards <ids>` builds and approves exactly the named boards, with the rules `/plan --design --boards` uses: a named board that is not buildable (not a to-be board in `draft`/`approved`, or not in the map) is STUCK naming it and its status, and a named board held by a draft part is STUCK naming the part. Without `--boards`, behaviour is unchanged (every buildable, unheld to-be board). | issue #68, change 1 | yes |
| O2 | `/create-design` keeps item ids that arrive in its source (a brief listing `S1: Cart`, `S2: Address` keeps `S1`, `S2`); it assigns `BI-n` only when the source has none. | issue #68, change 2(a) | |
| O3 | Each board in `design-map.json` records the brief items it serves as `brief_items` (an array of item ids), written by `/create-design` when it writes the map and kept current by `/refine-design`; `design-map.js validate` accepts the field and rejects a non-array. | issue #68, change 2(b) | yes |
| O4 | `design-map.js` lists the boards that serve given items: `buildable --items S2,S3` (and the same filter on `held`/`read` callers as needed) returns the buildable to-be boards whose `brief_items` include any named item; an item no board serves is reported, not silently dropped. | issue #68, change 2(c) | yes |
| O5 | `/audit-design`'s traceability verifier reads `brief_items` from the map, so "a brief item with no board" and "a board with no brief item" are decided from the recorded field rather than from a model's reading. | issue #68, change 2(d) | |
| O6 | Under `--auto`, `/create-design` and `/refine-design` still produce their open decisions and record each in `brief.md` under the fixed heading `## Decisions taken by default`, each with an id (`OD-1`, ...), the question, the options, the option taken, and why. The readout lists them by id in DECISIONS (ISSUES when the default is weak). | issue #68, change 3(a)(b) | yes |
| O7 | `/refine-design <slug> --auto "OD-2: <option>"` applies an answer to a recorded decision: it redraws the boards the decision affects and records the answer against that decision in `brief.md`. | issue #68, change 3(c) | |
| O8 | `/refine-design --auto` with no other feedback takes the open findings from the latest `.trd-state/<slug>/audit-design-report.md` as its feedback. | issue #68, change 4 | |
| O9 | `/audit-build` and `/close-feature` word the `/sync-design` NEXT step so that running it now, on the feature branch before merge, is allowed ("now, or once the PR has merged"), and `/sync-design` states it may run on a feature branch. | issue #68, change 5 | |

## Intended Change

Before [read]:

- **Change 1.** `create-trd.md:24-57` ("Design input"): with `--design`, step 1 lists every
  to-be board in `draft`/`approved` (`design-map.js buildable --dir`) and approves and moves to
  `building` all of them, minus those `held` lists. `argument-hint` is
  `"[path-to-prd] [--design docs/ui/<slug>]"`. With two features sharing one design, the first
  to reach `/create-trd` claims every board and the second ends STUCK at step 2 ("already
  `building`"). `plan.md` "Design input (`--design`)" already implements `--boards <ids>`: it
  calls `buildable --ids`, STUCKs on a named board `buildable` does not list (naming it and its
  status), STUCKs on a named board `held --ids` lists (naming the part and
  `/refine-design <slug> --approve <part>`), and passes the named ids to the workflow.
  `design-map.js buildable(map, ids)` already filters by ids.
- **Change 2.** The brief stage of `workflows/create-design.js` (~line 175) instructs: "Give
  every brief item an id (BI-1, BI-2, ...)", regardless of ids in the source. The draw stage
  already asks each to-be agent to "Return the brief item ids this board answers
  (brief_items)" and returns them on each board (`brief_items: r.brief_items || []`, parts get
  `[]`). `create-design.md` step 5 ("Write the map once") lists the fields it writes —
  `status: "draft"`, `screenshot_match`, `mismatch_note` — and does not name `brief_items`, so
  whether the map carries it depends on the model. `design-map.js` `REQUIRED_BOARD_FIELDS` is
  `id, file, kind, platform, viewport, status`; `validate` says nothing about `brief_items`;
  there is no verb to select boards by item. `workflows/audit-design.js` has a haiku index agent
  read the brief for items, and the traceability verifier decides "no-board" by reading boards
  — the map's `brief_items` is not passed to it (it passes `id, file, kind, source, trd`).
- **Change 3.** `create-design.js` brief stage under `AUTO`: "return an empty openDecisions
  list and write every assumption you made into brief.md under \"Assumptions\""; the return is
  `openDecisions: AUTO ? [] : brief.openDecisions.slice(0, 4)`
  (`create-design.test.js:99` pins `[]` under auto). `refine-design.md` `--auto`: "Every
  assumption is recorded in `brief.md`". Nothing gives the decisions ids, and `/refine-design`
  has no way to apply an answer to one by reference.
- **Change 4.** `refine-design.md` step 2 gathers feedback from the argument, the chat, canvas
  comment threads and selected elements — not from `.trd-state/<slug>/audit-design-report.md`,
  which `/audit-design` writes (report-only) with the readout's finding lines and a
  `## Could Not Verify` section.
- **Change 5.** `audit-build.md:482` and `close-feature.md:112` say to run `/sync-design`
  "once the PR has merged (or now, when the feature closed on the default branch, where there
  is no PR)". `sync-design.md` has no branch restriction; `design-map.js unsynced` keys only on
  `.trd-state/<feature>/closed.json`, which exists on the feature branch once the audit closes
  it.

After:

- `/create-trd --design docs/ui/<slug> --boards <ids>` follows `/plan`'s named-board rules
  exactly (STUCK on a not-buildable or held named board; only the named boards go to the
  workflow, are approved, and move to `building`). `--boards` is stripped with its value before
  the PRD path is read. Without it, nothing changes.
- The brief keeps source item ids, and every board in the map carries `brief_items`.
  `design-map.js buildable --items <ids>` (combinable with `--ids`) lists the boards serving
  those items and reports items no board serves. `/audit-design`'s traceability check
  compares the brief's item ids with the map's `brief_items` both ways.
- Under `--auto`, open decisions are written to `brief.md` under `## Decisions taken by
  default` with `OD-n` ids and returned/listed in the readout; `/refine-design --auto
  "OD-n: <option>"` applies one.
- `/refine-design --auto` with no feedback reads the latest audit report's open findings.
- The `/sync-design` NEXT wording allows running it now on the feature branch.

Each criterion must fail on today's text: today `/create-trd` has no `--boards`, the brief
prompt hard-codes `BI-n`, `buildable` has no `--items`, auto returns no decisions, and the
NEXT wording says "once the PR has merged".

## Decision

- **Five changes, one TRD.** They are the issue's asks and share files (`create-design.js`,
  `refine-design.md`, `design-map.js`), so splitting them would put two TRDs on the same files.
- **Reuse `/plan`'s `--boards` rules verbatim in `/create-trd`**, rather than inventing a second
  wording; both commands then STUCK identically on a bad name.
- **`brief_items` stays optional in `validate`** (accepted, must be an array of strings when
  present), not added to `REQUIRED_BOARD_FIELDS`: maps written before this change have no such
  field, and making it required would fail every existing design. A missing field reads as
  "serves nothing recorded", which `buildable --items` reports.
- **Item selection is a filter on `buildable`** (`--items`), not a new verb: the orchestrator's
  question is "which buildable boards serve these items", and `buildable` already owns
  "buildable". Its output must also say which named items matched no board, so the CLI returns
  boards plus an `unmatched` list only when `--items` is given (plain `buildable` output is
  unchanged for existing callers).
- **Decisions under `--auto` keep the existing `openDecisions` schema plus an `id`**; the
  workflow returns them under auto instead of `[]`, and the command, not the workflow, decides
  whether to ask (interactive) or record (auto). The heading is fixed text so a later
  `/refine-design` can find a decision by id.
- **Change 4 uses the default path (`--auto` with no feedback reads the report), no new flag**:
  the issue offers both, and a flag adds surface for the same behaviour.
- **No product or orchestrator is named in shipped text.** The owner has stated Ensemble must
  carry no awareness of any particular orchestrator; every change is worded for any unattended
  caller.

not absorbed: `packages/core/hooks/runtime-refresh.sh` header comment says refresh "never adds"
files — unrelated; this change works without it.
not absorbed: unattended publish from orchestrator-started sessions (#65) — the issue lists it
as out of scope.

## Grounding

- `packages/core/commands/create-trd.md` (+ `.claude/commands/` mirror, byte-identical [ran]):
  "Design input" at :24-57 and "Design approval" at :1087-1108 [read]. Reuse `plan.md`'s
  "Design input (`--design`)" paragraph for the named-board STUCK rules [read]. Pinned by
  `packages/core/commands/create-trd-design-prose.test.js` (e.g. "Zero boards left is STUCK",
  "Invocation is approval") — those must keep passing [read].
- `packages/core/lib/design-map.js` (+ mirror [ran]): `buildable(map, ids)` at the
  `const buildable =` line; `validate`; CLI `parseArgs`/`idList`/`main` [read]. Tests in
  `packages/core/lib/design-map.test.js` [read]. Follow: pure functions, thin CLI, JSON on
  stdout [read].
- `packages/core/workflows/create-design.js` (+ mirror [ran]): brief prompt ~:170-190 (BI-n,
  AUTO branch), brief schema `openDecisions` items `{question, options, recommended}`, return
  `openDecisions: AUTO ? [] : ...slice(0, 4)`; draw stage returns `brief_items` per board
  [read]. Tests `packages/core/workflows/create-design.test.js:83-99` pin the auto `[]` and must
  be updated to the new behaviour [read].
- `packages/core/commands/create-design.md` (+ mirror): step 3 (question round), step 5 (write
  the map), Readout [read]. Pinned by `create-design-prose.test.js` [read].
- `packages/core/commands/refine-design.md` (+ mirror): flags, Modes, step 2 (gather feedback),
  step 3, Readout [read]. Pinned by `refine-design-prose.test.js` [read].
- `packages/core/workflows/audit-design.js` (+ mirror): index stage reads brief items;
  traceability verifier's BOARDS list omits `brief_items` [read]. Tests
  `packages/core/workflows/audit-design.test.js` [read].
- `packages/core/commands/audit-build.md:482`, `packages/core/commands/close-feature.md:112`
  (+ mirrors), `packages/core/commands/sync-design.md` (+ mirror) [read].
- Hazards: every `packages/core/` file here has a byte-identical `.claude/` mirror that tests
  require be edited together [ran]; `create-trd.md` and `audit-build.md` are long and carry
  many pinned phrases — add, do not reword, around the design sections [inferred].

## Open Questions

none

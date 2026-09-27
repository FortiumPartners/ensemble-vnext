# Brief — docs-as-built (defined in session; no verbatim source document)

**Source:** this session's conversation (session `be117aff-b3d2-4f82-88cc-81317cf111b7`,
2026-09-25). There is no ticket or spec behind it. The owner described the problem, two survey
agents measured it on real repositories, the owner challenged the first proposal on four
points, and the concept was revised. **Read the three registers below as the state at the END
of that conversation** — the Superseded table is the record of what the challenge overturned,
and nothing in it is a requirement.

Locators name the turn in which a line was settled. "Owner, turn 1" is the opening problem
statement; "owner challenge" is the turn that pushed back on four points; "owner, final" is the
turn that said *Proceed* and set scope, plus the note sent while this brief was being written.

---

## The problem, in the owner's words (turn 1, verbatim)

> as a codebase grows, PRDs, TRDs, and other design documents grow stale. In some cases
> they're never implemented; in others, they're refactored, superseded. […] Consider how we
> might walk the design artifacts and update them to as-built.
>
> - I want SOME degree of judgement applied on how deep to look. IE - if the TRD was delivered
>   2 days ago and there have been all of 5 PRs merged since, it's likely reasonably current,
>   deep dive not necessary. If the TRD was 5 months ago and hasn't been reviewed since, it's
>   likely very stale. Basically a change/review log.
> - Maintaining a TRD and PRD index.
> - Ensuring we check other artifacts under the docs/ directory, as this tends to sprawl over
>   time
> - Not being afraid to archive things (screenshots, test data files, etc.) that are no longer
>   helpful (or worse, flat out wrong)
> - Grounding things - IE helping tie documentation to where it's implemented. Doesn't have to
>   be line number specific, that goes instantly stale, but something to help serve as a map
>   into the code
>
> My thought: this is something that can be run as a light review weekly, and a comprehensive
> review monthly.

## The owner's challenge (verbatim — it is what reshaped the concept)

> What real value is an old TRD that's no longer accurate? What does it actually tell us,
> other than obscure archaelogy about the system which, by looking at the changelog, we could
> retrieve from git if we really want to?
>
> […] labelling a file "ARCHIEVED -- NO LONGER RELEVANT" at the top, or even a section
> "SUPERSEDED BY TRD-XXX" isn't necessarily helpful, because whether or not that language gets
> retrieved with your matched chunk is a crap shoot. There is a reasonably high probability you
> pull in the original design with none of the language saying it's no longer relevant, even
> if we've put signposts all around it saying to not use it.
>
> Next, "living docs" are a side effect of our framework, not a product of it. Nothing in our
> framework says to produce them. So counting on them is a poor approach... especially when we
> have EXTENSIVE design documentation.
>
> And finally, fixing stale documentation at the source isn't an option. Fixing the status to
> close them out properly is, but they start getting stale the moment the next feature starts.

## Scope, owner final (verbatim)

> Note that the scheduling is out of scope for this; just creating the skills/workflows to do
> it (ideally it assembles the file list and how deep it needs to go on each
> deterministically, then does a fan out as a workflow)

> Also PRDs vs TRDs vs loose docs should be handled differently -- since PRDs and TRDs have
> very specific structures

---

## Settled

| What | Where it was settled |
|---|---|
| Walk a repository's design artifacts and bring them to **as-built**. | Owner, turn 1 |
| **Depth is a judgement, driven by a change/review log**: little work since a doc was delivered or last reviewed → light look; long unreviewed with much work since → deep look. | Owner, turn 1 |
| Maintain a **PRD index and a TRD index**. | Owner, turn 1 |
| Cover **everything under `docs/`**, not only `docs/PRD` and `docs/TRD` — it sprawls. | Owner, turn 1 |
| **Remove material that is no longer helpful or is wrong** — screenshots, test data files, superseded documents. "Not being afraid to" is the owner's framing. | Owner, turn 1 |
| **Ground docs to code with a coarse map** — directories, modules, named symbols. **No line numbers**: they go stale instantly. | Owner, turn 1. Survey: of doc pointers that name a symbol, only 27% still land within 2 lines of it, while file paths still resolve 91% of the time (lightning-lane). |
| **Two depths: a light review and a comprehensive review.** The owner's intended use is light weekly, comprehensive monthly — but see the next row. | Owner, turn 1 |
| **Scheduling is out of scope.** Deliver the skills/workflows that do the review; how often they run, and what triggers them, is not part of this. | Owner, final |
| **Deterministic assembly, then fan-out.** A deterministic step (script, no model) builds the file list and decides how deep to go on each file; a workflow then fans out over that list. | Owner, final |
| **PRDs, TRDs and loose docs are handled differently**, because PRDs and TRDs have very specific structures. Three document classes, three procedures. | Owner, final (sent mid-turn) |
| **An inaccurate old TRD has no value worth keeping in the tree.** Its history is recoverable from git. So there is no "frozen, historical, kept for reference" state. | Owner challenge, point 1 |
| **In-content signposts are not a mechanism.** A "SUPERSEDED" banner or "ARCHIVED" header is not reliably retrieved with the matching excerpt, so a stale doc left in the tree will be read as current regardless of labelling. | Owner challenge, point 2. Tested this session — see Evidence E1. |
| **Do not depend on "living docs".** Nothing in the framework produces them. The PRD/TRD corpus itself is what must be kept correct. | Owner challenge, point 3 |
| **Staleness cannot be prevented at authoring time.** Docs start going stale the moment the next feature starts. Closing out a doc's *status* properly on delivery is a legitimate source fix; preventing drift is not. | Owner challenge, point 4 |
| Consequence of the four points above, proposed in the revised concept and not contested — the owner's reply was "Proceed": **every doc left in the working tree is current, or it is removed from the tree.** Wholly superseded or wholly stale → deleted from the working tree, with any decision still in force first carried into the doc that replaced it. Partly stale → corrected in place to as-built. | Revised concept; owner, final ("Proceed") |
| Also from the revised concept, not contested: **state that must survive retrieval goes in the file PATH, never in the content** — the path is the one thing every search hit carries. | Revised concept; owner, final |
| Also from the revised concept, not contested: **the trigger for "this doc may now be stale" is later work overlapping the code the doc maps to** — TRDs implemented or changes merged since the doc's last review that touched its mapped directories — rather than the doc's age. | Revised concept; owner, final. Survey: doc age and code churn each correlate only ~0.5 with drift, and bulk edits reset git dates (Evidence E2). |
| Also from the revised concept, not contested: **overlapping docs converge.** TRDs are written one per change, so several describe the same code; keeping all of them as-built multiplies copies that drift from each other. The review pushes toward one current description per area of code. | Revised concept; owner, final |
| Also from the revised concept, not contested: **the review's changes are delivered for the owner to review** (a PR or equivalent), not committed silently, because it deletes and rewrites design documents. Deletions are recoverable from git and carry a recovery record (path, last commit, why removed). | Revised concept; owner, final |

## Superseded

| Earlier position | Replaced by | Why |
|---|---|---|
| Keep old TRDs as frozen history with a status and a "superseded by" banner | Current-or-removed (Settled) | Owner: an inaccurate TRD's value is archaeology that git already holds. Banners are not retrieved (E1). |
| Move dead material to `docs/archive/` | Delete from the working tree, keep a recovery record | An archive folder inside the tree is still searched by `grep` and `git grep` (E1). Only removal from the tree reliably keeps it out of retrieval. |
| Maintain a separate class of "living docs" (architecture / per-area overviews) at as-built, and freeze the plans | The PRD/TRD corpus itself is kept current, converging overlapping TRDs | Owner: nothing in the framework produces living docs. |
| Fix drift at the source: `/implement-trd` writes TRD status on completion, `/create-trd` writes the code map, `implement.json` gets a schema | Only **status close-out** survives, and it is a separate `/plan`, not this PRD | Owner: staleness begins with the next feature; it cannot be fixed at authoring time. |
| Triage primarily by doc age / time since last git edit | Later work overlapping the doc's code map, plus time since last *review* | Age predicts drift weakly and git dates are reset by bulk edits (E2). |
| A weekly and a monthly **scheduled** run (including a cloud routine with a fresh clone) | Out of scope — deliver the skills/workflows only | Owner, final. |

## Raised, not adopted — NOT requirements

| Idea | Status at end of conversation |
|---|---|
| **Cross-repo docs**: a manifest declaring which repo owns each cross-repo contract (tbd frontend docs describing BFF/backend endpoints, and 6 duplicate doc pairs across repos, 3 of which disagree) | Raised by the assistant with evidence (E4). The owner did not respond to it. Open, not settled. |
| **Review against the remote default branch, not the local clone** (tbd-frontend was 145 commits behind origin; tbd-backend 53) | Raised with evidence (E4). Its main vehicle was a cloud routine, which is now out of scope with scheduling. Open, not settled. |
| **First run on an established repo is a separate, one-time job** (lightning-lane: ~236 PRDs/TRDs to sort before any light run means anything) | Raised by the assistant. Not responded to. Open. |
| Specific path conventions for state (e.g. `docs/TRD/proposed/` for wanted-but-unbuilt plans) | The *principle* is settled (state in the path). The specific folder names were an example only. |
| `/implement-trd` closes out the TRD's status on completion | Agreed as worth doing, but routed to a **separate `/plan`**, not this PRD. |
| `/create-trd`'s design-corpus index relies on grepping "any supersession banner" (`packages/core/workflows/create-trd.js`, the Corpus phase) | Observed this session. Not proposed as in scope. Relevant because it is a consumer of whatever state the review leaves behind. |
| Secrets / personal data found in docs (a file in tbd-frontend contains what looks like a real user id and email) | Raised as a one-off finding for the owner. Whether the review should scan for this was not discussed. |
| A dedicated weekly-only mostly-deterministic pass versus a model-assisted one | Not settled beyond "deterministic assembly, then fan-out". |

---

## Evidence gathered this session

Two read-only survey agents, one on `~/dev/lightning-lane`, one on
`~/dev/fortium/tbd/{tbd-backend,tbd-frontend,tbd-bff}`. Figures are as reported; working files
were left in the session scratchpad and are not preserved.

**E1 — signposts are not retrieved.** A test repo held a current TRD and an archived one with
"SUPERSEDED BY TRD-9" on line 3 and the searched symbol on line 65. `grep -rn` and `git grep`
both returned the archived hit with no banner; `rg -C3` returned it with three lines of
filler. Only `rg` honouring a `.ignore` file excluded it, and neither `grep` nor `git grep`
reads that file. This session had no dedicated search tool: all search was `grep`/`rg` via the
shell.

**E2 — age is a weak trigger.** lightning-lane (first commit 2026-05-03): of 3,587 code paths
named by 259 PRDs/TRDs, 91% still exist. Share of named paths gone by doc age: 2% (<2 wk), 2%
(2 wk–2 mo), 12% (2–5 mo). Doc age correlates 0.52 with missing paths; code churn since the
doc's last edit, 0.51. One vocabulary-cleanup commit touched 32 docs and is the last edit for 17
of them, resetting their apparent age. Of 291 distinct missing paths, only 49 ever existed in
git — so "path missing" must be checked against history before it is called drift.

**E3 — docs are wrong, not merely old.** tbd: five docs deep-checked, 50 of 77 claims exactly
right (~65%), 14 moved/renamed, 9 wrong, 4 never built. Wrong values include a daily cap of 50
where code has 10, cooldowns 7/10/14/21 days where code has 3/5/7/10, and "all 35 signal types
done" where the schema defines 15. lightning-lane: a TRD and a runbook describe a route
narrativizer deleted on 2026-08-02; the runbook's banner still calls it "unchanged".

**E4 — status and cross-repo.** Status fields: wrong on all five deep-checked tbd docs;
lightning-lane has 68 TRDs marked "Draft", 14 of them with every task done, and its per-feature
`implement.json` files use 34 different task-status strings. Neither repo has an index.
tbd: 46 of 84 frontend docs cite BFF or backend paths; 6 duplicate doc pairs across repos, 3
diverged; the snooze payload contract (`{snoozedUntil}`) has been wrong since 2026-05-02; ticket
numbers collide across repos. Local clones were 53 (backend) and 145 (frontend) commits behind
origin, and against local HEAD a route that origin had removed still existed.

**E5 — loose-doc sprawl.** lightning-lane `docs/`: 896 files, 28 MB; 124 byte-identical
redundant copies (2.5 MB); a stray 43-file copy of the agent runtime in `docs/design/.claude/`;
32 handoff files from one week in May, 25 never cited; 35 tracked PNG screenshots at repo root, 3
referenced; roughly 8 MB safely removable. **Trap:** `docs/beta-readiness/issue-444-data/`
(1.7 MB of CSV/JSON) looks dead but is read by `ci.yml` and four tests — a reference check that
looks only at other docs would remove it and break CI. tbd: about 31 of 85 loose docs dead;
`WARP.md` byte-identical to `CLAUDE.md`.

**E6 — what already exists in ensemble.** `/audit-trd` and `/audit-prd` verify one document in
depth against its source and the code, but nothing selects which documents need it.
`/cleanup-project` prunes only `CLAUDE.md`. ensemble's own `docs/TRD/completed/` holds one file
while ~17 TRDs sit beside it.

---

## Second round — owner's typed answers after an independent review (2026-09-25, verbatim)

An independent reviewer found the PRD (v1.1.2) had grown features the owner never asked for,
largely through multiple-choice answers the owner may not have understood. The owner was
re-asked four questions in plain words and answered in their own words. **These answers
supersede every earlier multiple-choice ruling on the same subject.**

> 1. Keep them correct; I don't care that they overlap. Duplication is not my concern, bad
> data is. Similarly, I don't care if we're left with a TRD in which 95% is deleted as
> superseded, and only 5% remains. If the 5% is valid, there is no need to expend any effort
> trying to consolidate it into other TRDs, "find a home" for it, etc. My goal isn't a clean
> document set for human developers. My goal is an accurate as-built library for agents doing
> fan-out searches of the doc/ folder
>
> 2. review checked out. Let's ASSSUME though that this will be run as a scheduled job against
> a clean checkout.
>
> 3. a light run should do this:
> -- review the commits that have landed since the last run
> -- for each design doc, use a light/fast model (Haiku) to assess the likely impact to that
> document based on the commits (give it an impact score)
> -- if the impact score is over a certain threshold, it gets a full audit with opus
> -- if it's a medium impact, a moderate once-over with sonnet
> -- if a light impact, no review at all
>
> 4. just fix it so we don't forget

### Settled by the second round

| What | Source |
|---|---|
| **The goal is an accurate as-built library for agents doing fan-out searches of `docs/`** — not a clean document set for human developers. | Answer 1 |
| **Overlap and duplication between docs are not a concern; bad data is.** No convergence, consolidation, or "finding a home" for surviving content. | Answer 1 |
| **The delete-vs-correct test:** content the code does not support is corrected or cut, section by section; a doc survives with whatever valid content remains, however little. (Derived: a doc is deleted only when nothing valid remains — "if the 5% is valid" it stays.) | Answer 1 |
| **Review the checked-out tree.** No fetching, no branching from the remote. Assume a scheduled job on a clean checkout. | Answer 2 |
| **Light run:** (a) take the commits landed since the last run; (b) for each design doc, a fast model (Haiku) scores the likely impact of those commits on that doc; (c) high score → full audit with Opus; medium → moderate once-over with Sonnet; low → no review. Thresholds are the owner's "a certain threshold" — tunable, unstated. | Answer 3 |
| **The old "archive completed TRDs" rule is fixed now, outside this feature.** Done 2026-09-25: `.claude/rules/process.md`, `packages/core/templates/process.md.template`, `docs/PRD/ensemble-vnext.md` (F5.2 and directory layout) rewritten to as-built; the scaffolder no longer creates `docs/TRD/completed/` or `docs/TRD/cancelled/` (92/92 scaffolder tests pass). | Answer 4 |

### Superseded by the second round

| Earlier position | Replaced by |
|---|---|
| Overlapping TRDs converge to one description per area (F12) | Keep each correct; overlap is fine (Answer 1) |
| Fetch and review the remote default branch (F13) | Review the checkout (Answer 2) |
| Cross-repo duplicate scanning via optional sibling repo paths (AC-F15.2) | Not asked for in the owner's own words; dropped. Flagging claims about another repo's code (so they are not read as drift) stays |
| Correct `process.md` / template / `ensemble-vnext.md` as part of this feature (F14) | Already done (Answer 4) |
| Depth decided deterministically from a review log / code-map overlap, with never-reviewed docs treated as maximally stale | Light run: commits since last run → Haiku impact score per doc → Opus / Sonnet / none (Answer 3). Deterministic assembly still covers the commit list and the doc list |
| Light vs comprehensive distinguished by scope (multiple-choice answer to OQ-3) | Light run is defined by Answer 3. **Comprehensive run is not redefined by the owner** |

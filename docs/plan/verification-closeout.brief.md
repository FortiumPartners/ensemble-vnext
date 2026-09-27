# Brief: verification close-out — self-direction on stall, evidence artifacts, --fix

**Status:** brief, for `/plan`. Written 2026-09-27 from four read-only investigations of the
lightning-lane session the verification-convergence feature (4.8.0) was built from.
**Owner's request (verbatim, abridged):** close out the feature with (1) a review of what we built
against that session, codifying "moved forward on its own"; (2) whether to ship a skill that helps
build `verification.md`; (3) a dedicated skill that reproduces the design-vs-screenshot comparison
artifact whenever a UI design is provided, plus a step that ensures it runs; (4) up to three such
evidence artifacts total, as skills plus instructions — **no deterministic tools**; (5) whether
`/verify-build` benefits, whether docs are current, and a `--fix` back into implementation.

**Evidence sources.**
- Session `~james/.claude/projects/-Users-james-dev-lightning-lane/e4914591-5eeb-40af-87d3-cd3a9a20a0d8.jsonl`,
  window 2026-09-26T14:00Z → 2026-09-27T14:00Z (7am–7am PT). Snapshot deleted after close-out.
- The comparison artifact `https://claude.ai/artifact/BtD3KfKo2DZXp25SmnYUJy` ("Create Alert Frame
  Diff"), and everything that built it, preserved at
  `/Users/fortium/ensemble-reference/visual-compare-exemplar-2026-09-27/` (page, 86 images,
  `pair.py`, `build.py`, `gen.py`, `verdicts.json`, `meta.json`, `review/`). A copy is also committed
  in lightning-lane at `docs/verification/unified-create-alert/frame-comparison/`.

---

## 1. What the session shows, and what 4.8.0 changed

Verification went **11 → 56 of 62** proven. The first run (inside `/implement-trd --verify`) hit
its 3-iteration cap at 11. The owner asked three questions (16:10–16:15Z: *"11/62 is far short. Why
couldn't we get further?"*, *"Why was there one agent proving 62 things?"*, *"So what's your
recommendation?"*), said *"Agree"* and *"we don't need to reverify those already verified"*, and the
agent then ran ~6.5 h largely on its own: ~21 hand-sequenced verification passes, ~22 real defects
fixed.

| Stall cause | 4.8.0 |
|---|---|
| One exerciser for 62 criteria | addressed (lanes, slices) |
| Re-walking proven criteria | addressed (settled set) |
| 25 criteria "proven" by a log lacking their content | addressed (locator rule) |
| Rebuilds between capture and judging | addressed (capture-only exercise) |
| Pictorial evidence / 32-frame criterion | partly (judge-only; `Parts` reports, does not track) |
| Environment rediscovered by every agent | partly (needs a filled `verification.md` — see §3) |
| Cap of 3 | partly (unchanged, but goes further on a shrinking open set) |
| Seed data / harness login | not addressed — project work |
| Exercisers skipping script steps | not addressed |
| Agent-liveness stalls (orphaned jest, Monitor never fired, overnight stack breakage) | not addressed — out of scope |
| Spec ambiguity (entry points) | not addressed — out of scope |
| Screen-to-screen wiring not in the criteria | partly (AMEND-001(b) alignment artifacts) |

**Verdict:** substantially better on the causes that dominated the stall; not perfect.

**Owner framing (2026-09-27), replacing "codify the self-direction":** *"We can't predict everything
that will stall verification, nor do I want to try. I want to fix mechanical issues that we can to
get the initial verification as far as possible. Then I want to provide the mechanism within the
framework to do some planning and iterating, slice up the problem, fix dependencies or blockers,
and then get back into the verification loop… if a short chat — even with an orchestrator agent —
can be the bridge, then the next framework step would be the /verify-build kicks off the next 6
hours of autonomy."*

So the design is three stages, and the framework does NOT try to diagnose every stall on its own:

1. **Mechanical push.** The first verification run gets as far as mechanics allow: 4.8.0, a filled
   `verification.md` (§3), the evidence artifacts (§4).
2. **The bridge — a short chat.** On a stall the readout gives a diagnosis by cause with counts and
   names the bridge. Owner and orchestrator agree a plan, written to
   `.trd-state/<feature>/verification-plan.md` in a fixed, command-readable shape: blockers (each
   small enough to be a task), slicing and order, owner rulings (also written into the PRD/TRD),
   criteria accepted as not verifiable, and a **stop rule**. A skill conducts the chat and produces
   the file.
3. **The long autonomous run — `/verify-build --fix`.** Reads the plan and runs without questions:
   blockers → blocking discoveries → `/implement-trd --reconcile`; verify; promote what still fails,
   one fix batch, re-verify only what failed; repeat until the plan's stop rule; report the
   remainder, each with a reason. Without a plan, `--fix` does one fix-and-reverify cycle only.

**Owner decision — supersedes verification-convergence NG2.** NG2 rejected "an outer
implement/review/verify loop" (two capped loops → 9 attempts, two termination stories). Stage 3 is
that outer loop, accepted on two conditions that answer NG2's reasons: it runs **only on explicit
invocation with a plan**, never by default; and it has **one** stop rule, the plan's, so there is one
termination story.

The session's own self-direction (§1 table above: diagnose, fix prerequisites once, slice, batch
fixes, narrowing waves, spot-check evidence, tally with a stop rule, ask only spec rulings) is what
the bridge's plan should capture and stage 3 should execute — not rules an agent must infer alone.

## 2. The design-comparison artifact (owner: "perfect")

**What it is.** One static page: title + lede (what build, "matched by state, not by data");
"What stands out" (cross-cutting problems stated once) beside a legend (red = in design, missing
from build; blue = in build, not design; amber = same place, different colour); a sticky filter bar
(status chips with counts; a coloured 01–32 jump strip); one card per design frame — number, plain
title, status pill, the exact navigation route, four panels (**Design | Build @commit | Diff "N%
differs" | Overlay with a Design↔Build fade slider**), a one-sentence verdict and notes. Status set:
match / minor / deviates / superseded / uncaptured / spec. Spec pages and uncaptured frames get their
own card shapes. Light/dark, responsive, lazy images.

**How it was made.** Frames came from a committed design handoff (`screens/png/NN-name.png`). A
background capture agent reproduced each frame's **state** on a dedicated simulator and saved the
screenshot under the design's filename with a manifest (route, status, note). Pairing is by
filename stem. `pair.py` crops the bezel, normalises size, blurs, and paints the red/blue/amber
diff. **The verdicts were model judgement**: the lead opened every stitched design|build|diff image
and wrote each verdict by hand — the diff percentage never set the status. The page was published
with `root` + `files`, republished to the same URL nine times as fixes landed, each screenshot
labelled with its commit, and committed to the repo at milestones.

**What made it good.** Model-written per-frame verdicts naming concrete things; cross-cutting
problems separated from per-frame ones; the owner commenting *on a specific screenshot* (title below
the back arrow; background tones) and those comments becoming the fix list before one rebuild;
commit labels exposing stale evidence; uncaptured frames shown with the reason, not dropped.

**Must be parameters, not constants:** bezel crop box, frame size, status-bar height, device and
capture commands, evidence paths, the data-difference caveat, title.

## 3. A `verification.md` builder — recommended

From lightning-lane's 23 verification runs: 111 met, 63 not met, **55 not verifiable** — 16 blamed
directly on the file (blank dev row / no environment authorised; two features "satisfied" with every
criterion unverified), ~27 needing a running stack with real data, ~12 unrelated. Useful facts live
in files the preflight never reads (a 2,567-line `verification-notes.md` holding a standing
production permission; `live-env.md`; CLAUDE.md). The file is filled but in the pre-4.8.0 shape,
and the unfilled check cannot see that, so the owner is never told §1a exists.

**How the model session handled it — the behaviour to codify.** The agent wrote the file itself,
as part of its prep, inside the successful run: `a07892767` at 16:34Z on 2026-09-26, the first step of
the plan the owner agreed at 16:19Z ("draft verification.md, fix the harness login, give the in-trip
persona a future day"). It updated the file again as rulings arrived — at 05:20Z on 2026-09-27, right
after the owner approved read-only access to live data. So the builder **writes the file** from repo
evidence and the owner's answers, **and keeps it current as rulings land** in later bridges and runs.
It starts from the current file rather than the template, and says in plain terms what it changed.
The template's header *"An agent READS this and never writes it"* changes to say the setup skill and
the bridge write it.

**Derivable from the repo:** environment names/ports (scripts, docker-compose, `.env*.example`,
vercel/railway), refresh and build commands, measured durations from past runs, installed tooling,
credential *locations* (never values), recurring not-verifiable causes, facts in other files.
**Owner only:** may write / deploy / restart per environment; standing authorisations; §1a counts;
whether a gap is permanent. Nine questions in that order, each with an evidence-based default; then it writes the file.

**Invoke:** standalone; named (not run) in `/implement-trd` §3.6a's readout when the file is
unfilled or old-shaped; after `/init-project`; after a run with several not-verifiable criteria
citing the file. **Companion change:** the preflight should also flag a *filled* file missing §1a /
the data-permission column.

## 4. Evidence artifacts — the three

Owner's bound: at most three including UI; skills plus when-to-invoke instructions; no deterministic
tooling. From the session, the three that materially helped the owner judge the build:

1. **Design ↔ build comparison** (§2) — when the PRD/TRD references UI designs.
2. **Designed ↔ as-built interaction flow** — when the PRD carries an interaction/flow diagram or
   screen-to-screen journeys: derive the as-built flow from the code (navigation and API calls),
   draw it in the same notation, diff against the design, and walk each journey end to end
   recording before/after data. The session's "wiring matrix" (owner: *"I want to confirm that
   we've correctly WIRED each screen to the next page"*) found **3 defects the criteria never
   covered**.
3. **Data ↔ screen fidelity** — when screens render data from an API or store: compare each
   rendered row against the response behind it. The session's live-API row check did this across
   ~50 rows and 4 parks.

## 5. `/verify-build` and the way back into implementation

`/verify-build` gets all of 4.8.0 (it passes the 18 args, follows §3.6a and §8.1a). **Stale:**
- both process files: `--verify --resume` "re-enters a **stalled** loop" — it re-enters only an
  interrupted one (`outcome: null`);
- `verify-build.md` l.31/36 (same claim) and its `--resume` section (omits met-only reload and the
  cap-as-total-budget);
- FV TRD §3.7 (still says lanes are derived in §3.6a; `resume` passed whenever a state file exists);
- VC TRD TR7, §7.3 contingency, VCON-B009 text (pre-1.5.3 §3.6a wording);
- `fix-plan.js` comments calling `--verify` required.

**No way back exists.** No `--fix` anywhere; `/verify-build` forbids offering fixes and its readout
has no next step on gaps; `discovered.js` has `PROMOTABLE_STATUSES` for verification gaps but
nothing produces those records. **`--fix` is stage 3 of §1.** Its building blocks already exist:
record each `not_met` / `unbuilt` criterion as a `blocksFeature` gap in the discovery ledger; chain
`/implement-trd <trd> --reconcile`, which promotes blocking gaps to TRD tasks, builds them and
re-verifies. `not_verifiable` and `insufficient-coverage` are not promoted. What is new is the
repeat-until-the-plan's-stop-rule loop around it, and reading `verification-plan.md`.

# TRD: judge-prompt-generative-rule

**Source PRD**: None — refactor requested in session, 2026-08-25

## Objectives

| ID | Objective | Source |
|----|-----------|--------|
| O1 | Every turn end stops paying twice for the same 9,933 B of shared judge-prompt text — 33,428 B of `Stop` prompt becomes one merged prompt of the same content | your instruction, 2026-08-25: "these prompts should be a paragraph or two"; block sizes measured this session |
| O2 | The merge is proven to change no verdict — measured on the corpus with a paired comparison, not asserted | refactor discipline; `test/discipline-corpus/RESULTS.md` |
| O3 | The two false-positive guards inside `IMMINENT_ACTION_BLOCK` gain corpus witnesses, so a future edit to them cannot pass unmeasured | the adversarial pass, 2026-08-25: the corpus has NO imminent-action case and NO advice-to-user case in either direction |


## Behaviour Preserved

**The test that must pass before AND after:**

```bash
node test/discipline-corpus/score.js --detector judge --json
```

**Measured before touching anything** (2026-08-25): the 6-case fixture scores 6/6 —
TP=3 FP=0 TN=3 FN=0. A full 67-case baseline run is in progress; its numbers are the
floor this refactor must match. `RESULTS.md`'s last recorded full run (2026-08-13,
pre-growth) was TP=25 FP=2 TN=39 FN=0 — precision 92.6%, recall 100%.

**The public surface that must not move:**

- `build-judge-prompts.js` exports and CLI contract — `test/integration/tests/implement-trd-structure.test.sh`
  and `packages/core/scripts/scaffold-project.test.sh` both assert on its output.
- The three `hookType: "prompt"` manifest entries, their `timeout: 60`, and the
  `{ok, reason}` submit contract.
- `generate-hooks-artifacts.sh --check` must stay clean: the prompts are GENERATED, and
  all three `settings.json` copies carry the emitted text.

## Decision

**REWRITTEN 2026-08-25 after the adversarial pass refuted this section's central claim.**
Recorded rather than quietly replaced, because the error is the interesting part.

**What the first version said:** the prompts are mostly enumerated phrasings, so replace the
enumeration with one generative sentence. **What is actually true:** they are not.
`IMMINENT_ACTION_BLOCK` is 2,220 chars, of which **243 (11%) are quoted phrasings**. The other
89% is rules and false-positive guards — including one the text itself flags as *"the
highest-risk part of this clause"* (only the FINAL message is ever judged, so ordinary in-turn
narration must not trigger), and the advice-to-user carve-out (*"Next step: run `npm install`"*
is the USER's action, not a claim). I sorted the blocks by size and skimmed; the reviewer read
them.

**And the proposed replacement did not cover what it replaced.** *"A deferral is any text whose
effect is that a decision is left for someone else"* does not describe imminent-action at all:
"Dispatching all three." hands nobody a decision — it is a false statement about the speaker's
own next act. The sentence would have deleted a clause it does not reproduce, **including that
clause's two FP guards**, while broadening the violation definition. That pairing is the worst
available.

**So the primary change is structural, not editorial.** Both `Stop` prompts fire on every turn
end and each carries its own copy of the 9,933 B of shared blocks:

| | bytes per Stop |
|---|---|
| today (`async` 17,550 + `autonomy` 15,878) | **33,428** |
| merged, one copy of the shared blocks | ~23,495 |
| saving | **9,933 — 30% of every turn end** |

Merging them into ONE `Stop` prompt carrying two independent judgments changes **no clause's
text**, so there is nothing for a behavioural gate to catch. `subagent-discipline` already
demonstrates the pattern in this repo — one prompt, two judgments. This yields more than the
editorial rewrite was targeting, at a fraction of the risk.

**Rejected: the original enumeration rewrite, for now.** Not because it is wrong in principle —
the prompts genuinely do warn against phrase-checklists while carrying one — but because the
enumeration is 11% of the block it lives in, its removal is entangled with two FP guards the
corpus does not witness at all, and the measurement to prove it safe does not yet exist. It
becomes tractable AFTER the corpus has FP-side cases. Sequenced, not abandoned.

**Rejected: `async.escapeValve` compression (4,398 B, the single largest block).** Its FACTS are
irreducible payload mechanics. Roughly 2,000 B is incident narration retold at near-full length
in `subagent.escapeValve` too, and compressing that touches no judgment criterion — genuinely
attractive, and out of scope here only to keep this change attributable.

## Non-Goals

- Not a change to what the guards ENFORCE. `.claude/rules/async-discipline.md` and
  `autonomy.md` are the authority on the rules; this changes only how the judge is asked.
- Not a re-litigation of the three payload facts. They are measured and they stay.
- Not the `subagent-discipline` hook's own specifics beyond the shared blocks it composes.
- Not a fix for the corpus scorer's ~19s-per-case latency, which is why nobody re-scored for
  12 days. Real, and reported, but the refactor does not depend on it.

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Add the FP-side corpus cases the corpus lacks entirely: an imminent-action violation ("Dispatching all three."), an advice-to-user clean case ("Next step: run `npm install`"), a DISPATCHED-banner clean case, and an honest-blocker-handoff clean case. Verify each scores correctly under the CURRENT prompts — this is the pre-merge witness. | O3 | None | Corpus grows by >= 4 cases, at least 2 clean; all in SCORED classes (not `payload-dependent`, which `score.js` excludes by default); `score.test.js` passes. |
| FIX-002 | Merge `async-discipline` and `autonomy-discipline` into ONE `Stop` prompt carrying two independent judgments, per the pattern `subagent-discipline` already uses. Update `hooks.manifest.json`, regenerate all three `settings.json` copies, hand-sync the `.claude/hooks/prompts/` mirror. **No clause's TEXT changes.** | O1 | FIX-001 | One `prompt` entry on `Stop` instead of two; combined <= 24,000 B (from 33,428); `generate-hooks-artifacts.sh --check` clean; mirror-parity test passes; every text-asserting grep in `implement-trd-structure.test.sh` still finds its string. |
| FIX-003 | Paired re-score: run pre-merge and post-merge prompts the same number of times in the same session; decide on majority verdict (>= 2 of 3) and per-case flips; restore the A3 gate (zero `incidental-vocabulary` FPs) plus an overall precision floor; exclude the known harness defect `s-payload-escape-loop-guard`. Record both distributions. | O2 | FIX-002 | `RESULTS.md` carries both; no case flips correct -> incorrect on majority verdict; A2 and A3 hold. Revert FIX-002 if not. |

**Deliberately NOT here** — each is real and separately tractable, and bundling them is what
pushed the previous revision past the light-path ceiling:

- The **enumeration rewrite** the run started as. See `## Decision`: the enumeration is 11% of
  the block it lives in, its removal is entangled with two FP guards, and FIX-001 is the
  measurement that makes it tractable. Sequenced, not abandoned.
- A **held-out generalization set** labeled from `.claude/rules/*.md` rather than from prompt
  text. Every post-2026-08-13 corpus case traces to a commit that added a clause to catch it,
  so the corpus structurally cannot test whether an unseen paraphrase is caught.
- **`async.escapeValve` compression** — 4,398 B, the largest single block; its facts are
  irreducible but ~2,000 B is incident narration retold near-verbatim in `subagent.escapeValve`.

## Task Grounding

### FIX-001
- **Touches:** `test/discipline-corpus/corpus.jsonl`
- **Reuse:** the existing case schema and class names — `deferral-explicit`, `deferral-novel-phrasing`, `autonomy-hedge`, `no-result-returned`, `payload-escape-valve`, `clean-completion`, `self-documentation`, `incidental-vocabulary`. Do NOT invent a class [read]
- **Replaces:** nothing — additive
- **Follow:** use `payload-escape-valve` for cases needing a `payload` object, NOT `payload-dependent` — `score.js` excludes the latter from scoring by default, so a case filed there is never measured [read]
- **Careful:** the corpus has NO imminent-action case and NO advice-to-user case, in either direction. That is why the FP guards inside `IMMINENT_ACTION_BLOCK` are currently unwitnessed, and why no gate could have caught their removal.

### FIX-002
- **Touches:** `packages/core/hooks/prompts/build-judge-prompts.js`, `packages/core/hooks/hooks.manifest.json`
- **Reuse:** `subagent-discipline`'s existing two-judgment structure is the in-repo precedent — one prompt asking for (a) a structurally-impossible deferral and (b) no usable result returned [read]
- **Reuse:** the `HOOKS` table and the shared `*_BLOCK` constants compose per hook already; merging means one entry consuming both intros, not restructuring the block system [read]
- **Replaces:** the two separate `Stop` entries — the second must be REMOVED from the manifest, not left registered, or the saving is zero and both fire anyway
- **Follow:** the prompts are GENERATED. `generate-hooks-artifacts.sh` writes the `.prompt.md` files and all three `settings.json` copies but NOT `.claude/hooks/prompts/` — that mirror is enforced by `implement-trd-structure.test.sh` and needs a manual copy [read]
- **Careful:** merging changes the composition. Two hooks meant two independent judge calls with "either blocks" semantics, which `detectors/judge.js` documents and simulates. One hook returns ONE verdict, so the block-reason must name WHICH judgment failed or the corrective signal degrades [read]
- **Careful:** `RESPONSE_CONTRACT_BLOCK` must remain the LAST section. It exists because the judge answered in prose 31 times in 251 evaluations, diagnosed as the prompt ENDING on an instruction to compose a reason [read]
- **Careful:** `detectors/judge.js` cites `NO_TOOLS_BLOCK` by name as what makes the offline harness a fair comparison. Do not touch it — editing the measuring instrument mid-refactor invalidates FIX-004 [read]

### FIX-003
- **Touches:** `test/discipline-corpus/RESULTS.md`
- **Reuse:** RESULTS.md's existing per-run section format and its A1/A2/A3 gate vocabulary [read]
- **Replaces:** nothing — appends. Do NOT overwrite the 2026-08-13 sections; they are the historical floor.
- **Follow:** RESULTS.md's own warning against quoting a single number as a catch-rate; report every run with its variance [read]
- **Careful:** "recall >= baseline on EVERY run" is NOT a valid gate. The 2026-08-13 distribution check records the unchanged prompt scoring 100%, **96.0%**, 100% across three runs — that gate rejects the prompt that produced the baseline, roughly one run in three. Use majority verdict and per-case flips [ran: `sed -n '239,252p' RESULTS.md`]
- **Careful:** `s-payload-escape-loop-guard` FPs in all three recorded runs as a known HARNESS defect, not a prompt defect. Left in, it silently consumes the FP budget [read]
- **Careful:** ~19s mean latency per case; a full run is ~21 min. Run detached (`nohup ... & disown`) — a foreground wait that hits a tool timeout gets SIGTERM and kills the run's process group. Measured this session [ran]

## Could Not Verify

- **Whether a shorter prompt judges as well is the open question, not a foregone conclusion.**
  FIX-003 is the check, and it can fail. If it does, the finding is that the enumeration was
  load-bearing after all — which is worth knowing and would be recorded rather than worked around.
- **The full 67-case pre-refactor baseline had not finished when this TRD was written.** The
  6-case fixture scored 6/6. If the full baseline comes back materially worse than
  2026-08-13's 92.6%/100%, that itself is a finding about the +122 lines of unmeasured growth,
  and it changes the floor FIX-003 compares against.
- **Production fidelity is unmeasured.** Per the harness header: different model, different
  response mechanism, different system prompt. A prompt that scores well here is evidence,
  not proof, about the live judge.

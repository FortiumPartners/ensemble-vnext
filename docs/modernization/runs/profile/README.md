# Final profile: `create → refine --auto → audit`

**Written before the runs completed.** The criteria below are fixed in advance on purpose.
Every prior measurement in this project that defined its scoring after seeing output ended up
measuring the wrong thing — the keyword scorer counted vocabulary and called it requirement
satisfaction; the token metric excluded cache reads and understated a pipeline by 36–159%.

## What is being profiled

The refactor at `ea3d7e1` split the pipeline three ways:

| Command | Agents | Job |
|---|---|---|
| `/create-{prd,trd}` | 2 / 3 | Author. Corpus for provenance, code for grounding. Does **not** verify. |
| `/refine-{prd,trd} --auto` | 1 | Answer `## Open Questions` from corpus + code. |
| `/audit-{prd,trd}` | 5 / 7 | The verification wave. Consumes and rewrites `## Could Not Verify`. |

Before the split, create carried the wave: `create-prd` was 5 agents, `create-trd` was 9.

## Two codebases, one full chain each

| Arm | Spec | Project under design | Corpus present |
|---|---|---|---|
| **ensemble** | `runs/ab-test/spec.md` (38 lines, 5 MUSTs, **zero numbers**) | this repo | yes — its own |
| **herald** | `runs/case3-herald/SPEC.md` (41 lines) | `~/dev/herald` (read-only) | yes — 21 PRDs, 29 TRDs |

Both specs were used in earlier A/B rounds, so the new numbers are comparable to the old ones
rather than free-standing.

**Herald is never modified.** Artifacts are written into this repo; `--project` scopes every
read. That scoping is itself under test — it did not exist for the corpus stage until
`babcaa6`, and its absence is what produced 6 wrong findings out of 9 in case 3.

## Cost — how it is counted

`collect-profile.py`, joining `wf_*.json` run records to agent transcripts. All four token
fields, weighted: input ×1.0, cache-write ×1.25, cache-read ×0.1, output at the model's rate.

**Cache reads are the dominant term** — 86–90% of raw tokens on measured fan-out runs — so
any figure that drops them is not a cost figure. Dollar amounts use list rates and are
indicative; the comparison between arms is the result, not the absolute.

## Time

Wall clock per stage from `durationMs`. The relevant question is not total but **when you get
control back**: create returning fast is the point of the split, because audit is deferrable
and create is not.

## Quality — judged, not counted

Counts do not settle design quality. Findings-per-run especially does not: a run with more
findings may have had a worse author. Each artifact gets a verdict per dimension:

| | |
|---|---|
| **Designed** | Addressed deliberately, traceable to the spec, with a mechanism that works |
| **Asserted** | Claimed but not grounded — plausible words, no evidence behind them |
| **Distorted** | Present but wrong: invented threshold, misread mechanism, wrong repo |
| **Absent** | Not there at all |

### The five dimensions

1. **Faithfulness** — every spec MUST addressed or explicitly a Non-Goal; nothing invented.
   **The specs contain zero numbers.** Any number in an artifact needs a source, and the
   pre-rewrite command produced 23 against a spec with none.
2. **Sizing** — task count and per-task scope. Each task costs ~5 implement-loop invocations,
   so 43 tasks is 215 agent runs. Fewer is not automatically better; *independently
   implementable and verifiable* is the test.
3. **Grounding** — `Touches` / `Reuse` / **`Replaces`** / `Follow` / `Careful`, with
   `[read]` / `[ran]` / `[inferred]` markers. `Replaces` is the highest-value line and the one
   nobody writes.
4. **Corpus use** — decisions inherited rather than re-litigated; rejected alternatives not
   re-proposed; **no design doc cited as evidence that something exists.**
5. **Self-declared state** — `## Open Questions` and `## Could Not Verify` present and honest.
   An artifact claiming certainty it does not have is the failure this pipeline exists to stop.

### The two failure modes that outrank everything

- **A manufactured requirement** — it is executed, not examined, and consumes real work.
- **A silently dropped requirement** — worse, because nothing downstream can detect it.

## What would count as the refactor failing

Stated in advance so the answer is not chosen afterward:

- Create + audit together costing materially **more** than the old combined command for the
  same output — the split would be pure overhead.
- Audit finding things create should have caught, in a way create's own prompt could have
  prevented. That would mean the wave is compensating for a weak author, not verifying a
  good one.
- `--auto` refine answering **owner-only** questions confidently. A confident answer to a
  question only the owner can settle is worse than an open question, because it reads as
  resolved.

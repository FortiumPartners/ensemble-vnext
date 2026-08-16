# Rework `/implement-trd`, and build the deterministic task graph it needs

Source: `docs/modernization/2026-08-improvement-plan.md`, items 7 and 8, verbatim.
Item 7 is merged into item 8 — see item 8's Dependency section.

---

### 7. Extract a tested `lib/` — build the task graph

> #### Open design question — concurrent TRDs, sessions, worktrees, and developers
>
> **Carry this into items 7 and 8. It is not solved today and neither item works without an
> answer.** The current state model assumes exactly one TRD being implemented, by one person,
> in one session, in one working tree. Every one of those assumptions breaks in normal use:
>
> - **`.trd-state/current.json` is a single pointer** (`prd`, `trd`, `status`, `branch`) and is
>   **git-tracked**. Two developers on two TRDs both rewrite it; two worktrees off the same
>   repo disagree about what "current" means. It is a merge conflict by construction.
> - **`implement.lock` is per-TRD**, so it prevents two sessions racing the *same* TRD but says
>   nothing about two TRDs racing the same *files*. File-ownership conflicts are currently
>   reasoned about within a single TRD only.
> - **The shared task list is session-scoped** (`~/.claude/tasks/session-<id>/`) and never
>   uploaded. Nothing coordinates across sessions, so a second session has no view of what the
>   first has claimed.
> - **Workflows cannot resume across sessions**, which makes the durable state file the only
>   cross-session coordination point — and it is exactly the thing that is currently
>   single-tenant.
> - **Worktrees** raise the open question of whether `.trd-state/` is shared across a repo or
>   per-tree, and the answer differs for the state file (per-branch) versus a cross-TRD lock
>   (must be repo-wide to be useful).
>
> Item 7 is where this gets designed, because the task graph is where file ownership becomes
> explicit — and cross-TRD conflict detection is the same computation as intra-TRD, just over a
> wider set. Item 8 then inherits whatever item 7 decides. Sketching a solution before the graph
> exists would be guesswork.
>
> One precedent already in the tree: RUNTIME's refresh gate is monotonic specifically so
> teammates on different plugin versions cannot ping-pong committed files. The same class of
> problem, solved narrowly — worth reusing the reasoning, not the mechanism.


This is where the graph actually gets built, and it is the prerequisite for item 8. `packages/core/`
contains `agents/ commands/ hooks/ scripts/ templates/` and **no `lib/` at all**. Meanwhile
`implement-trd.md` is 1,372 lines, much of it describing fully deterministic operations the model re-reads
and re-interprets on every invocation.

> **Re-read the Sunstone fork before writing any of this.** The original comparison was a survey; this
> item needs a close reading of specific modules, with three questions in mind:
>
> 1. **How does it build the task graph deterministically?** vNext infers dependencies from TRD prose on
>    every run. Sunstone has `trd-parser.js` and `trd-graph.js` with tests behind them — the question is
>    what its parser demands of the TRD *format*, because a graph is only as deterministic as its input.
>    If it requires structured task declarations, that is a change to `/create-trd`, not just to the parser.
> 2. **How does it verify completed output against requirements?** This is the weakest link in vNext's
>    loop: `verify-app` runs tests, `code-reviewer` reads code, but nothing systematically checks the
>    delivered thing against the acceptance criteria that specified it. If Sunstone has a mechanism here,
>    it is worth more than the graph work.
> 3. **`cross-trd-deps.js` is directly relevant to the open coordination question above.** The module name
>    says it reasons about dependencies *between* TRDs — exactly the multi-TRD problem filed in this item.
>    Read it before designing ours.
>
> Adopt selectively and with evidence, not wholesale — the plan's "deliberately not doing" list already
> rejects Sunstone's multi-runtime adapters and per-package marketplace split for good reasons.
>
> **The baseline is no longer on disk.** `CLAUDE.md` names `~/dev/ensemble` as the read-only source,
> but that directory does not exist on this machine as of 2026-08-12 — the original comparison was done
> against a checkout that has since gone. Clone `Sunstone-Partners/ensemble` fresh before starting, read
> only, and note that its `main` will have moved since the survey.

Sunstone has `trd-parser.js`, `trd-graph.js`, `phase-tracker.js`, and `cross-trd-deps.js` with 76 test
files behind them. You don't need that whole surface — you need the three pieces carrying the most prose weight:

- **TRD parser** — Master Task List → structured tasks with IDs, dependencies, and phase assignment
- **Task graph** — edges from declared dependencies *and* inferred file-ownership conflicts; eligibility,
  parallel sets, critical path, cycle detection
- **State machine** — `implement.json` transitions, `cycle_position` advancement, retry counting, checkpoints

The graph module pays twice. It replaces prose the model currently re-derives, and it emits exactly what
item 2 needs: a set of `blockedBy` edges to hand to the native task list, and the file-ownership partition
the team commands need for safe parallelism. Today both are inferred from TRD text on every run.

Expect `implement-trd.md` to lose 400–600 lines. Do it incrementally: parser first, verify with the smoke
harness, then the graph, then state.

**Done when:** Three modules exist under `packages/core/lib/` with Jest coverage above 80%;
`implement-trd.md` calls them instead of describing them; the graph module emits `blockedBy` edges consumed
directly by the team commands; smoke harness still green.

---

## Phase F — The architectural bet (Week 11 onward)

### 8. Rework `/implement-trd` — wire it to what the planner now produces

*Replaces the former "prototype one phase as a dynamic workflow" item, which item 10
delivered and superseded: `create-prd.js` is 2 stages, `create-trd.js` is 3, and the
verification wave lives in `audit-prd.js` / `audit-trd.js`.*

**Take this next, while the planning work is fresh.** Item 10 rebuilt the producer and left
the consumer untouched. `/implement-trd` was last shaped for TRDs that no longer exist.

#### The gap, measured 2026-08-15

| Producer now emits | `/implement-trd` mentions it |
|---|---|
| `[read]` / `[ran]` / `[inferred]` evidence markers | **0 times** |
| `Replaces` — the line naming what becomes unreachable | **0 times** |
| `## Could Not Verify` (written by `/audit-*`) | **0 times** |
| `## Open Questions` (owner-only items `/refine` left open) | **0 times** |
| `Serves` columns (objective each task derives from) | **0 times** |

It is not wholly unwired — the delegation template at `implement-trd.md:921` does pass the
Task Grounding block verbatim per task. But it hands over evidence markers **without the
key**. The markers exist so an implementer can tell a claim someone ran from a claim someone
guessed; passing them unexplained returns the document to uniform-looking precision, which is
the exact failure they were introduced to fix: *"precision that isn't uniformly earned is
worse than vagueness, because it stops the implementer checking."*

**A concrete defect found while measuring this:** the `<design_references>` extraction at
`implement-trd.md:1056` reads *"TRD Section 10 'Reference Documents'"*. No generated TRD
contains such a section — real TRDs run `## 1. Overview` through `## 9. Task Grounding`.
The extraction targets a phantom.

#### Why now, and why it is where the money is

Planning is no longer the expensive half. Measured: TRD authoring $39.45, and **~5 agent
invocations per task** in the implement loop. The same feature at 43 tasks is 215 invocations;
at 12 it is 60. Every per-task overhead multiplies by task count, so the loop — not the
planner — now dominates total cost.

#### Done conditions

1. The delegation template explains the evidence markers, and instructs an implementer to
   **verify any `[inferred]` claim before relying on it** and to trust `[ran]` most.
2. `Replaces` is surfaced as an explicit deletion instruction, not prose in a passed block.
   This is the line that stops superseded code accumulating — the `poi/reconcile/` problem.
3. `## Could Not Verify` reaches the implementer for the tasks it touches. A task resting on
   an unverified claim must be treated differently from one resting on a checked fact.
4. An unresolved **owner-only** `## Open Question` covering a task is surfaced before that
   task runs, not discovered mid-implementation.
5. `<design_references>` points at a section that exists.
6. The 5-invocations-per-task loop is re-examined against measured cost. `SIMPLIFY → VERIFY`
   re-running a full verify may not earn its place on every task.
7. `implement-trd.md` is ~13.4k tokens and re-caches every turn. The `create-trd` fix —
   splitting the authoring contract out from orchestration detail — cut author cost
   materially and applies here unchanged.

#### The review layer — decided 2026-08-15

**Our `code-reviewer` agent leaves the implement loop.** Owner judgment, stated directly:
it is *"a poor substitute for the built in one — not nearly as effective."* Re-scoping it
(the earlier item-6 proposal) is not enough; the loop should not be spending an agent per
task on a job something else does better.

**CORRECTED 2026-08-15 — the premise below was not verified when first written.** The
original text asserted that Anthropic's Code Review runs on this repo's PRs, sourcing that
to item 6's description of `REVIEW.md`. That is a design document describing a product, not
evidence the product is wired here. Checked afterwards: there is **no Claude review action or
app in `.github/`**, and the repository's only PR to date was reviewed by **`coderabbitai`**.
This is the same failure the item-10 profile measured (`sanitize_error_detail()`): a document
describing a capability treated as proof it exists.

**What is verified:** `/code-review` is `disable-model-invocation`, so no command can invoke
it — that part holds. `ci.yml` is `on: pull_request`, which fires on every push to a PR
branch. `/implement-trd` opens a PR at `implement-trd.md:719`, at the END of the run.

**RESOLVED 2026-08-15 — interface verified against live docs**
(`https://code.claude.com/docs/en/github-actions`). Automating review needs no change to any
model-invocation rule, because **the CI path involves no model invocation at all** — the
GitHub runner executes the action.

Two supported routes, both real:

- **(a) Code Review app** — `docs/en/code-review`: *"automatic review on every pull request,
  without writing a workflow."* Install once; no workflow file to maintain.
- **(b) `anthropics/claude-code-action@v1` in `ci.yml`** — a file this project fully controls
  and can scaffold into every project it initializes. The documented review workflow:

```yaml
name: Code Review
on:
  pull_request:
    types: [opened, synchronize, ready_for_review, reopened]
jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
      issues: read
      id-token: write
    steps:
      - uses: actions/checkout@v6
        with: { fetch-depth: 1 }
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          plugin_marketplaces: "https://github.com/anthropics/claude-code.git"
          plugins: "code-review@claude-code-plugins"
          prompt: "/code-review:code-review --comment ${{ github.repository }}/pull/${{ github.event.pull_request.number }}"
          claude_args: '--allowedTools "mcp__github_inline_comment__create_inline_comment"'
```

**`synchronize` is what makes per-phase review work** — it fires on every push to the PR
branch. Pushing at each phase checkpoint therefore triggers a review per phase, exactly as
designed below, with no orchestration.

**CORRECTION to the per-phase design: the PR must NOT be a draft.** The docs state Claude
skips draft and closed pull requests, pull requests it judges trivial, and any that already
carry a Claude comment. The earlier "open a draft PR at the start" instruction would have
produced zero reviews. Open a normal PR early instead, or mark ready at the first checkpoint
(`ready_for_review` is a trigger type).

**Two inputs are load-bearing and easy to omit:** `--comment` in the prompt (without it
findings go only to the workflow run log, not the PR), and the `claude_args --allowedTools`
line — the action starts the inline-comment MCP server only when `--allowedTools` names it,
even though the skill's own frontmatter already does.

**Still owner-only:** which route, and the `ANTHROPIC_API_KEY` / `CLAUDE_CODE_OAUTH_TOKEN`
secret, which needs repo-admin access. `/install-github-app` automates route (a) plus the
secret. Note the org caveat: an OAuth token is tied to whoever ran `claude setup-token`, so
shared use wants an API key.

**`REVIEW.md` — CONFIRMED** (`docs/en/code-review`). Item 6 was right: *"review-only
instructions, injected directly into every agent in the review pipeline as highest priority."*
**But it only applies to the managed Code Review service.** The local `/code-review` command
explicitly *"doesn't read `REVIEW.md`"*, and the Action route runs the `code-review` plugin
skill, where it is undocumented. So `REVIEW.md`'s value is tied to route (a).

**BILLING — decisive for route choice, and they are not equivalent:**

| | route (a) managed Code Review | route (b) `claude-code-action` |
|---|---|---|
| Plans | **Team / Enterprise only** (research preview) | Pro, Max, Team, Enterprise |
| Auth | org-level GitHub App | `claude_code_oauth_token` from `claude setup-token` |
| Billing | **usage credits, ~$15–25 per review**, separate from plan usage | *"runs use your Claude subscription instead of API billing"* |
| Reads `REVIEW.md` | yes | not documented |
| Not available with | Zero Data Retention | — |

At $15–25 per review, per-phase review on route (a) costs **$75–125 for a five-phase
feature**, on top of the plan. Route (b) with an OAuth token is subscription-covered. **That
inverts the earlier recommendation: prefer (b) unless `REVIEW.md` governance is worth
per-review credits.** Route (b)'s YAML above should use
`claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}` rather than the API key the
docs' examples show.

**THREE TIERS, AND THEY ARE NOT INTERCHANGEABLE** (verified `docs/en/ultrareview`,
`docs/en/code-review`). Confusing them is what produced two wrong conclusions in this
section's history:

| Tier | Fan-out? | Can Claude start it? | Billing |
|---|---|---|---|
| local `/code-review` | **YES — measured at 7 agents** (parent + 6 children, `dispatch.jsonl` 2026-08-16 04:08–04:11) | **Yes — verified empirically** | normal plan usage |
| `/code-review ultra` | **Yes** — *"multi-agent fleet with independent verification"* | **NO** — *"Claude doesn't start an ultrareview on its own"* | 3 free (Pro/Max), then $5–25 credits |
| managed Code Review | **Yes** — *"fleet of specialized agents… then a verification step"* | n/a — automatic on PRs | Team/Enterprise only, $15–25 credits |

**CORRECTED 2026-08-16 — the local review DOES fan out.** An earlier revision of this section
claimed it was a single agent, reading *"runs as a background subagent with its own context
window"* as a statement about its internals. That phrase describes the launch wrapper. The
dispatch ledger settles it: one `/code-review` run at default effort produced a parent plus
**six** child agents. The ultrareview docs say ultra uses *"a **larger** fleet"* — comparative,
not fleet-versus-none.

**So the free, model-startable tier is already a fan-out review**, and it found 14 real
defects in 1,495 lines of this project's own workflow code, including two that surviving a
full end-to-end run on two codebases had not surfaced.

What `ultra` still adds over it: a larger fleet, **independent reproduction and verification
of every finding**, and a cloud sandbox that leaves local resources free. That is a
confidence and scale difference, not a fan-out difference — and it is worth paying for
pre-merge, not per phase.

**`claude ultrareview` is the automation seam.** The subcommand *"launches the same review as
`/code-review ultra`, blocks until the remote review finishes, and prints the findings to
stdout"*, and is explicitly *"to start an ultrareview from CI or a script without an
interactive session."* Running it constitutes billing consent, `--json` gives a parseable
payload, `--timeout` defaults to 30 min, exit 0 completed / 1 failed / 130 interrupted.
Note `claude -p '/code-review ultra'` is NOT equivalent — it stops before launching whenever
credits would bill.

**Design that follows, and both tiers earn a place:**

- **per phase** — local `/code-review`, started by `/implement-trd` itself. Model-startable,
  plan-billed, background subagent so it costs no orchestrator context. Fast feedback while
  the phase is fresh.
- **end of run** — one more `/code-review high` over the FULL branch diff. Phase-scoped
  reviews are blind to exactly one class, cross-phase integration, and today's run found that
  class in miniature: *"both handoffs drop `--source`/`--project`"* spans create → audit and
  no single-scope review sees it. One extra review covers it.

**DECIDED 2026-08-16 — review per phase, not only at the end.** Owner ruled out the paid
`ultra` step, so the whole design runs on the plan-billed 7-agent local review.

Reasoning, from measurement rather than preference:

- **Today review runs per TASK.** End-only would swing from the most frequent option to the
  least. Per-task review was removed because a reviewer seeing one task cannot judge
  integration — not because review should happen later. Per phase is the smallest coherent
  scope.
- **The failure being optimised against is the late find.** The item-10 profile measured
  `sanitize_error_detail()` surviving two passes into delivered code. A flaw found in phase 1
  and built on through phase 5 is the expensive case, and end-only review guarantees it.
- **`--fix` degrades with age.** A fix applied to phase-1 code during phase 1 is mechanical;
  the same fix at the end lands on code later phases have built on and can conflict. Today's
  14 findings applied cleanly to a settled tree — the easy case, and the one per-phase review
  reproduces.
- **Scope the review to the PHASE DIFF, not the branch.** Reviewing the whole branch each
  phase re-reviews settled code and produces churn. Anthropic's own managed-service guidance
  concedes this, suggesting *"after the first review, suppress new nits and post Important
  findings only"* — a phase-scoped diff solves it structurally instead of by instruction.

Cost, measured: 3.5 min for 413 lines, 8.5 min for 1,495. Roughly six reviews on a five-phase
feature, ~25–45 min, against the ~4 agent invocations per task the loop rework removes.

**What would change this:** phases of 8+ tasks make the phase diff unbounded and the churn
argument returns. The answer then is smaller phases, not less review. Measured on the two
profile TRDs, phases are well inside that: ensemble 12 tasks / 3 phases (~4 each), herald 27
/ 5 (~5.4 each), split by dependency structure rather than count. Watch it on the first real
run.

#### Test-task placement — fixed in the contract 2026-08-16

Measured on the same two TRDs: **test tasks are real tasks, not assumed follow-on** — 3 of 12
and 7 of 27 carry `-T###` IDs with their own dependencies and acceptance criteria, and
herald's `CPUB-T007` is a `[LIVE]` Playwright E2E assigned to `@verify-app`. Good.

**But both TRDs put every verification task in the FINAL phase** (ensemble phase 3 of 3,
herald phase 5 of 5), and nothing in `trd-authoring.md` asked for it — both authors reached
for that shape independently. It directly contradicts the per-phase review cadence decided
above:

- every phase but the last ends with nothing runnable, so the phase gate has nothing to check
  and the phase-boundary review reads code instead of running it
- the per-task deterministic checks the loop rework depends on have nothing to execute
- a phase-1 defect surfaces only after phases 2–4 were built on it — the expensive failure
  this pipeline exists to move earlier

**REVISED within the hour — the first fix moved the wrong thing.** It relocated unit-test
tasks to earlier phases while leaving them as separate tasks. Owner's model is better: unit
tests as you go, feature-level verification at the end. The tasks should not exist.

The double-count is verifiable. Herald's constitution states *"No production code is written
before a failing test exists for it"*, and its implementation tasks' grounding already names
the test files they touch — yet the TRD also created `CPUB-T004/T005/T006`, all prefixed
`Unit:`. The unit tests were in the plan twice: once implicitly inside the implementation
task where TDD puts them, once as standalone tasks. Ensemble did the same with `DRIFT-T001`.

`packages/core/contracts/trd-authoring.md` now says: **unit tests are not tasks** — they are
acceptance criteria on the task that adds the behaviour. What earns a task is (a) an
integration test crossing a seam no single implementation task owns, and (b) `[LIVE]`
end-to-end verification of the assembled feature, which is the one thing that legitimately
belongs in a terminal phase. E2E remains required as a task; a feature with no exercisable
path must say so in Quality Requirements rather than silently omitting it.

This solves the runnable-phase problem structurally rather than by scheduling rule: code and
its unit tests land together, so every phase ends executable by construction.

Expected effect on the profile TRDs: ensemble 12 → 11 tasks, herald 27 → 24.

Unmeasured: whether the instruction takes. Both the corpus mechanism and this are prompt
changes awaiting their first real run — and this session twice measured that a stated rule
does not by itself produce the behaviour.

**ITEM 6'S disable-model-invocation CLAIM IS OUTDATED for the local tier — but holds for
`ultra`.**
`docs/en/code-review` states plainly: *"Claude can start `/code-review` on its own. Ask it to
review your changes in plain language and it can run the skill without you typing the
command, and a scheduled task with `/code-review` as its prompt runs the review."* There is
even a `skillOverrides: {"code-review": "user-invocable-only"}` setting to DISABLE that,
which implies the default permits it. Documented exceptions: cloud-provider sessions, the
Claude apps gateway, and privacy env vars.

If that holds, `/implement-trd` may be able to invoke `/code-review` directly at a phase
boundary, and this item's whole CI detour becomes optional rather than necessary. Two
caveats before relying on it: the **`ultra` cloud tier is separately restricted** (user-typed
and billed), and a scheduled task *"never launches the cloud review"*. Verify the non-ultra
in-loop path empirically before designing on it — this claim has already been wrong once in
the other direction.

**The design below is conditional on that decision.** If per-phase automated review is
available by any of those routes, run it per phase rather than once at the end:
`/implement-trd` already opens a PR (`implement-trd.md:719`) — but at the END, so today
exactly one review happens, after all the work is done, when findings cost the most to act
on.

Fix: **open a draft PR at the start of implementation and push at each phase checkpoint.**
The command already commits at checkpoints, so this is a reordering, not new machinery. The
result is the good reviewer running four or five times instead of once, at zero cost to the
loop, with no `disable-model-invocation` problem — nothing is being invoked by a model.

**`code-reviewer`'s one distinctive job is not code review.** Acceptance-criteria
verification — does the delivered code satisfy AC-F2.3, and is there a test proving it — is
traceability, and it belongs in `/audit-build` (below). The agent is referenced by
`fix-issue`, `harden-trd-team`, `implement-trd` and `init-project`; each needs the same
treatment.

**This makes item 6 (`REVIEW.md`) a hard dependency, not an adjacent improvement.** If the
built-in reviewer is doing essentially all code review, `REVIEW.md` is the only channel
through which this project's Quality Gates, Definition of Done and prohibited-pattern table
reach it. Without it, review is handed to a capable reviewer that does not know the rules.
**Do item 6 first.**

#### The loop — decided 2026-08-15

| | today | target |
|---|---|---|
| per task | IMPLEMENT → VERIFY → SIMPLIFY → VERIFY → REVIEW | IMPLEMENT → deterministic checks → [DEBUG on fail] |
| agents / task | 5 | **~1** |
| per phase | — | `verify-app` on acceptance criteria; push → built-in review |
| at end | PR created, one review | `/audit-build` |

At 43 tasks that is ~215 agent invocations today against ~50.

**Verification does not need an agent when it is deterministic.** This repo's full suite
runs in **3.15 s**; a verify agent costs $5–15. The expensive thing is not running tests, it
is spawning an agent to decide whether they passed. The orchestrator runs targeted tests,
typecheck and lint itself; a `verify-app` agent is warranted only where acceptance criteria
need judgment — at the phase boundary.

**`SIMPLIFY` drops out of the per-task loop.** It costs two of the five invocations (itself
plus the re-verify it forces) to refactor code that just passed, by an agent lacking the
authoring context, at the moment the implementer's local choices were most deliberate.
Duplication *between* tasks is the real target and is only visible at a phase boundary.
Demoted there rather than deleted — there is no measurement either way, which is itself the
reason not to delete it outright.

#### State — decided 2026-08-15

**Derive the active TRD from the branch; stop storing a global pointer.** `current.json` is
a single repo-wide pointer, and `active_sessions` in `implement.json` is `{}` — the
multi-session mechanism was designed and never used. Branch names already encode the
workstream (`<issue-id>-<session>`, `feature/<trd-name>/<session>`) and git already isolates
them per worktree, so a file that must be hand-synced with the branch will drift by
construction. That is the reported symptom. Fall back to an explicit argument when the
branch does not resolve.

#### `/audit-build` — new, post-implementation

Verification **and** validation, plus the part nothing covers today:

- (a) delivered code matches TRD tasks — *verification* (built it right)
- (b) delivered code matches PRD requirements — *validation* (built the right thing)
- (c) **every requirement has both an implementation and a test proving it** — traceability

(c) is the highest-value check and the one with no current owner. A requirement with code
and no test is exactly how `sanitize_error_detail()` survived two review passes.

Same proven shape as `audit-prd` / `audit-trd` — index → parallel verifiers → reconcile —
except the artifact is the delivered code and the source is TRD + PRD.

#### `harden-trd-team` / `verify-trd-team` — replaced

1,607 lines doing two unrelated jobs: adversarial edge-case review, and forcing an
end-to-end test path. Neither needs a team. Replace with a verifier fan-out for the
adversarial pass (the shape that found real defects on both codebases in the item-10
profile) and a plain deterministic E2E gate — run the tests; do not convene agents to
discuss them.

#### Execution model — decided 2026-08-16

**`/implement-trd` stays a command. A workflow runs ONE phase.** Not a workflow per phase, and
not a workflow for the whole run.

The constraint is already recorded in item 7's open-design block: *"Workflows cannot resume
across sessions, which makes the durable state file the only cross-session coordination
point."* `resumeFromRunId` is same-session only, and an implement run spans sessions —
`--resume`, checkpoints, compaction, hours across sittings. A whole-run workflow would trade
away exactly the durability `implement.json` exists to provide.

| Layer | Owns |
|---|---|
| `/implement-trd` (prompt) | TRD parsing, the task graph, phase sequencing, `implement.json`, cross-session resume |
| `implement-phase.js` (workflow) | one phase: `parallel()` over independent tasks, `pipeline()` over chains, then the phase-boundary `/code-review high` |

**One parameterized script, never generated per phase:**
`Workflow({ name: "implement-phase", args: { trd, phase, tasks, project } })` — the task list
comes from item 7's graph.

**A phase is the right unit because it is the largest chunk that reliably completes inside one
session.** Measured on the profile TRDs: 4–5.4 tasks per phase; at ~1 agent per task after the
loop rework plus one review, that is 5–7 agents — the same shape as `audit-trd`, which ran 7
agents in 13 minutes. A phase either completes or is retried whole, and `implement.json`
carries the boundary.

It also delivers what the loop most needs: **per-task results stop entering orchestrator
context.** `implement-trd.md` is ~13.4k tokens re-cached every turn today — the same problem
the item-10 conversion already solved for `create-trd`.

#### Dependency — item 7 merges into this item

The concurrent-TRD question gates the state model, and the two are the same problem:
deterministic sequencing is what makes phase boundaries meaningful, and branch-derived state
is what makes concurrent workstreams possible. **Item 10 already laid the groundwork** —
tasks now carry `Dependencies` and `Serves` in structured, parser-consumable position, so
tasks + dependencies → DAG is mechanical, and "what can run in parallel" becomes
deterministic rather than LLM-judged. Build item 7's `lib/` as part of this item, not after.


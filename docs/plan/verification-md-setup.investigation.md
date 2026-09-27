# Investigation: verification-md-setup

**Kind**: change
**Weight**: medium
**Route**: plan
**Source brief**: `docs/plan/verification-closeout.brief.md` §3 (owner decisions 2026-09-27), plus
three later owner rulings the same day: the coverage-floor question, "yes to one list", and the
constitution ruling below

## Objectives

| ID | Objective | Source |
|----|-----------|--------|
| O1 | Ensemble ships a skill that builds or updates a project's `.claude/rules/verification.md` by asking the owner questions, detecting what it can from the repo, and writing the file | owner, 2026-09-27 (brief §3) |
| O2 | **Running the skill is the owner's approval to write the file.** The skill writes without a separate confirmation step, shows what it changed, and records credential LOCATIONS only, never values | owner, 2026-09-27: "running the update skill is considered explicit approval"; `verification.md` §3 |
| O3 | No autonomous run writes `verification.md`. The skill is invoked by the owner only; no command chains into it | owner, 2026-09-27 (brief §3); constitution 1.4.0 Governance Split |
| O4 | The skill asks for a **coverage floor** — the share of success-definition criteria that must be proven before a run may report satisfied — and **recommends a value** from the project's own evidence, stating why | owner, 2026-09-27: "make that coverage floor a question asked when verification.md is built using our skill - recommend an intelligent floor" |
| O5 | The floor the file declares reaches the verification loop: `/implement-trd` §8.1a and `/verify-build` step 3c read it, pass it to the `verify-functional` workflow, and the Judge's decide-next payload carries it; the readout states the floor in force, or "none declared" | O4 is inert without it — `decideNext` reads `input.coverageFloor` (functional-verification.js:257) and nothing supplies it (verify-functional.js:455-462) |
| O6 | A filled `verification.md` written to an **older template shape** is detected and named: which sections it lacks (resource capacity §1a, the `Loop may WRITE data?` column, the fast/full refresh split). The readout that names it points at the skill | brief §3; `implement-trd.md:829-834` records this as undetectable today |
| O7 | Every place that tells the owner `verification.md` is unfilled or out of date names the skill as the fix: `/implement-trd` §3.6a readout, `/verify-build` §2, and `/init-project` (offered after stack.md is written) | brief §3 |
| O8 | The skill ships to every project through the ONE framework-skill list with role `support` — never selectable as a verification check | owner, 2026-09-27 ("yes to one list"); the list itself is built by `verification-fix-loop` O9 |
| O9 | The template's header stops saying an agent never writes the file; it says the owner governs it and the skill is how it is written | brief §3; template `:3`, `:11-13` |

## Intended Change

- `packages/skills/verification-setup/SKILL.md` exists: prompts only (constitution Prohibited
  Pattern 2). Procedure: read the current file (or the template); run the existing detectors;
  ask one topic at a time, each question carrying the detected default; recommend a floor; write
  the file; print a one-screen summary of what changed.
- The template gains a short **Coverage floor** section between §5 and §6, and its header is
  reworded (O9). The old template's digest joins `KNOWN_UNFILLED_DIGESTS` with a fixture and a
  test, as every prior template edit did.
- `functional-verification.js` gains a function that names the sections a filled file lacks
  (O6); its CLI result carries it; §3.6a and `/verify-build` §2 report it.
- `coverageFloor` is a new optional workflow argument, read in §8.1a / step 3c and written into
  the decide-next payload (O5).

## Decision

- **A skill, not a command.** It ships into every project's `.claude/skills/` through the one
  list, which makes it invocable as `/verification-setup` there. In this repo the library under
  `packages/skills/` is not registered in `plugin.json` (`scaffold-project.sh:920-922`), so the
  copy is what makes it callable. Rejected: a thin command in `packages/core/commands/` —
  the command surface is for workflow steps, and this is an interview.
- **Invocation is approval (O2).** Rejected: a propose-a-diff skill (owner, 2026-09-27:
  *"Human users despise a skill like that"*) and a second yes/no gate after the questions (the
  owner ruled invocation sufficient).
- **The floor recommendation is evidence-led, not a constant.** The skill reads past
  `.trd-state/*/verification-state.json` files and computes each run's proven share with the
  same rule `coverageOf()` uses (verify-functional.js:822). With past runs: recommend just below
  the lowest proven share among runs that ended `satisfied`, rounded down to a multiple of 5%, so
  today's good runs would still pass. Without past runs: recommend none (the relabel stays
  dormant) and say that a floor can be added after the first runs. Both paths state the
  reasoning in one line. Rejected: shipping a fixed default — an invented threshold is exactly
  what `trd-authoring.md` forbids.
- **Old-shape detection is structural**: look for the §1a heading, the `Loop may WRITE data?`
  column and the fast/full refresh header. Rejected: more digests — a filled file never matches a
  digest, which is why this case is undetectable today.
- **Sequenced after `verification-fix-loop`**, which builds the one skill list this skill is
  listed in and edits the same `implement-trd.md` / `verify-build.md` sections.

absorbed:     `coverageFloor` plumbing into the workflow and decide-next payload — O4's answer has no effect without it  [BLOCKS]
absorbed:     old-shape detection — O6 cannot name a gap nothing detects  [BLOCKS]
absorbed:     new template digest + fixture + test — editing the template without it makes every untouched project read as filled  [BLOCKS]
not absorbed: the one framework-skill list — built by `verification-fix-loop` (O9 there); this plan depends on it

## Grounding

A. Template `packages/core/templates/claude-directory/rules/verification.md` (140 lines) [read]:
header `:3`, rationale `:11-13`; §1 `:17` (table `:24`, allowed values `:32`), §1a `:42`, §2 `:79`
(fast/full split `:86-98`, table `:92`), §3 `:106` ("WHERE a credential lives, never its value"
`:108`), §4 `:115`, §5 `:124`, §6 `:133`. This repo's `.claude/rules/verification.md` is
byte-identical to it [ran], enforced by `runtime-integrity.test.sh:110-118` and `:283-296`.

B. `packages/core/lib/functional-verification.js` [read]: `KNOWN_UNFILLED_DIGESTS` `:565-570`
(`pre-resource-table`, `resource-table-v1`), fixtures in `packages/core/lib/__fixtures__/`, tests
`functional-verification.test.js:1137-1200`. `isVerificationUnfilled(projectContent,
templateContent)` `:595` returns `{unfilled, matchedTemplate}`; the final `return {unfilled:false,
matchedTemplate:null}` `:612` is where a filled old-shape file currently vanishes. CLI
`check-verification-unfilled` `:713-726`. `COVERAGE_FLOOR = null` `:210`; `decideNext` reads
`input.coverageFloor ?? COVERAGE_FLOOR` `:257`; the relabel `:315-331`.

C. `packages/core/workflows/verify-functional.js` [read]: decide-next payload `:455-462` has no
`coverageFloor`; args parsed like `REFRESH_COMMAND = a.refreshCommand || ''` `:66`; `coverageOf`
`:822`.

D. Dispatch sites [read]: `implement-trd.md:1578-1600` and `verify-build.md:179-201` (same arg
list); §8.1a `implement-trd.md:1449` (reads the file `:1460`, §1a `:1484`); `verify-build.md`
step 3c `:164`; §3.6a report `implement-trd.md:766-777`, `:818-838`; `verify-build.md` §2 `:58`.

E. `/init-project` (`packages/core/commands/init-project.md`) never mentions `verification.md`;
it runs `scaffold-project.sh` `:313` then writes `stack.md` `:341` [read].

F. Detectors to reuse, all prompts plus existing scripts [read]: `tooling-detector`
(`detect-tooling.js`), `test-detector` / `framework-detector` (`detect-framework.js`),
`cloud-provider-detector` (`detect-cloud-provider.js`); `managing-railway` and `managing-vercel`
name `railway.json`/`railway.toml`/`vercel.json` as signals for refresh defaults.

G. Past-run data [ran]: `verification-state.json` keys `iteration, criteria, gapsClosed,
outcome`; no stored coverage — computed from `criteria[].status`. This repo: 4 runs
(verification-artifacts 29/33 unbuilt; audit-readout-tense 12, authoring-parallelism-advice 6,
plan-weight-router 32, all satisfied).

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | Skill name | `verification-setup` | no |
| OQ-2 | Should the skill also offer to add a floor to a file that is otherwise current? | yes — re-running the skill on a filled file asks only about what is missing or out of date, the floor included | no |

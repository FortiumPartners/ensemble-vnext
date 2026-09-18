---
name: verify-build
description: Run the functional verification loop on its own — does the delivered software do what the PRD says, checked with artifacts
version: 1.0.0
argument-hint: "[trd-path] [--resume] [--cap N]"
category: verification
---

Run the bounded functional-verification loop against already-delivered code.

## User Input

```text
$ARGUMENTS
```

If no TRD path is given, resolve from `.trd-state/current.json`'s `trd`.

---

## Why this exists separately from `/implement-trd --verify`

The loop is the same loop — one `Workflow(verify-functional, …)` call, identical arguments,
identical outcomes. This command is `/implement-trd`'s Step 8 with nothing else attached, and
it exists because **the three commonest reasons to want the loop have nothing to do with
running an implementation**:

- The implementation ran **without** `--verify` and you want the check now.
- The loop **crashed, stalled, or was interrupted**, and re-running `/implement-trd` to reach
  it would re-enter the phase loop over already-complete tasks.
- You **fixed something by hand** — a credential, a config, the environment — and want to
  re-verify without touching implementation at all.

Running `/implement-trd --verify --resume` covers the second case, but only because Step 3.6's
composition gate skips the phase loop; that is a subtle path to rely on for the ordinary act
of "verify what is already built."

**This command never implements.** It dispatches no implementer, runs no phase, writes no task
state, and makes no commit beyond the loop's own artifacts.

**It DOES derive the success definition when one is absent** — see step 3. That is the whole
point of the command: the case it exists for is a run that used no `--verify`, or one whose
loop crashed out, and in both the definition was never produced. A `/verify-build` that
refuses to derive can only ever run second, after an `--verify` run that already did the work,
which is precisely when you would not need it.

---

## Steps

### 1. Resolve the TRD and feature

Explicit path argument wins; otherwise `.trd-state/current.json`'s `trd`. The feature slug is
the TRD basename. No branch derivation — you are verifying what is on disk now.

### 2. Preflight the environment

**Identical to `/implement-trd` §8.4a — read that section and follow it.** Read
`.claude/rules/verification.md` and resolve each criterion as exercisable / `not_verifiable` /
needs-one-thing-from-the-owner, batch that last bucket into ONE question with a stated
default, then run on whatever remains. Partial verification with stated gaps beats none.

### 3. Read the inputs from disk

Exactly the inputs §8.1–§8.3 assemble. Read those sections for how each is derived rather than
restating the derivations here.

**The argument LIST itself is now restated deliberately, at §4.** That reverses the earlier rule
and the reversal is the point: pointing at "every field §3.3 names" across two documents without
naming any of them required reconstructing a 15-field object from prose on every run, and a
dropped `statePath` is how that failed in the field. Drift is the cost, and it is the cheaper
one — a drifted list is visible in a diff, whereas a reconstruction that silently omits a field
is visible only when the workflow crashes. §3.3 of `docs/TRD/functional-verification.md` remains
the authority on what the fields ARE; §4 is the dispatch, not a competing spec.

- `.trd-state/<feature>/success-definition.md` — **present → use it. Absent → DERIVE it,
  then proceed.** See 3a.
- `.claude/verification-notes.md`, the stack hints, the contract text, `.claude/rules/verification.md`
- `.trd-state/<feature>/verification-state.json` — for `--resume`
- `since` — resolved per §8.3
- **`prd_path`** — bind it HERE, because §4's dispatch passes it and 3a runs on only one
  branch. Read `.trd-state/<feature>/implement.json`'s `functional_verification.prd_path` when
  that file and key exist and the value is non-null; otherwise `""`. Note the key is written
  only by an `/implement-trd --verify` run, and this command's primary case is a run WITHOUT
  `--verify` — so `""` is the ordinary outcome here, not the exceptional one.

  It is a **display string for the report header** — nothing resolves it to a file — so `""`
  yields a blank `**Source PRD**:` field and nothing else. Leaving it unbound is not the
  catastrophe an earlier draft of this line claimed: `verify-functional.js` reads it as
  `a.prd || ''`, so unbound and `""` render identically. The reason to bind it is the positive
  one — when a source IS known, the header should name it instead of going blank.

### 3a. Absent definition → derive it, in the FOREGROUND

Resolve the source exactly as `/implement-trd` §3.6 step 1 does — PRD, else the TRD's
`## Reproduction`, `## Intended Change` or `## Behaviour Preserved`. **No source at all →
`not run: no success definition derivable`, and STOP**; that one is a real dead end, because
nothing states what success means.

With a source, dispatch the same agent §3.6 dispatches, with the same contract text, and
**wait for it**:

```
Agent(subagent_type="product-manager",
      prompt="<packages/core/contracts/functional-verification.md text> + <the source> + <output path .trd-state/<feature>/success-definition.md>")
```

**Foreground, not background — and that is the difference from Step 8.** §3.6 backgrounds the
derive because it has a phase loop to get on with; Step 8 then cannot wait for it, since no
attested primitive lets a lead block on a specific background `Agent`. This command has
nothing else to do, so it simply waits, and both of Step 8's objections evaporate:

- *nothing to race* — no derive was dispatched earlier in this run, so an absent file here
  means "never asked for", not "the agent died".
- *not a second production path* — it is the SAME agent with the SAME contract, invoked from a
  different command. The objection §8.1 raises is to deriving **inline**, in the orchestrator's
  own context without the contract's mandatory-citation discipline. Passing the contract to the
  contract's own agent is that discipline, not a bypass of it.

**Bind `prd_path` when you resolve the source — 3a is the branch that knows it.** Step 3's
read yields `""` here by construction (no `--verify` run wrote the key), so if 3a does not set
it the header goes blank even though a source WAS found — the one case this whole binding
exists for.

Set it exactly as `/implement-trd` §3.6 does, and note the shape differs by source kind:

| Source kind | `prd_path` |
|---|---|
| `prd` | the PRD path |
| `reproduction` / `intended-change` / `behaviour-preserved` | the **TRD path plus the section name** — e.g. `docs/TRD/foo.md ## Reproduction` |

**Never the section's body text.** It is a one-line display string, interpolated into the
report header without escaping; a multi-line section body would break the header block. The
qualification matters because "the source it resolved" reads naturally as the extracted TEXT
for section kinds — which is what you pass to the derive AGENT, and is not what you pass here.

**`not run: no definition produced` survives, narrowed:** it now means the derive ran and wrote
nothing — the agent died, or found no criterion satisfying the citation rule and wrote a file
you should read. It no longer means "nobody ever asked".

**Reported from the field, 2026-08-23.** A run of `/implement-trd` without `--verify` was
followed by `/verify-build`, which stopped at `no definition produced` and declined to derive,
citing Step 8's reasoning. The reasoning was inherited without checking whether its premises
held here. They did not.

### 4. Dispatch

All 15 fields §3.3 of `docs/TRD/functional-verification.md` declares — values from THIS
command's own resolution (Steps 1–3a), not copied from `/implement-trd`:

```javascript
Workflow({ name: "verify-functional", args: {
  criteria,                                                    // §3, from success-definition.md
  contract,                                                    // packages/core/contracts/functional-verification.md text
  notes,                                                        // .claude/verification-notes.md text, or ""
  stackHints,                                                   // stack.md + CLAUDE.md excerpts
  evidenceDir: ".trd-state/<feature>/evidence",
  checker: ".claude/lib/functional-verification.js",
  since,                                                         // resolved per implement-trd.md §8.3 -- max(HEAD commit time, loop start)
  cap: capArg ?? 3,                                              // "--cap N" overrides; default 3
  statePath: ".trd-state/<feature>/verification-state.json",
  reportPath: ".trd-state/<feature>/verification-report.md",
  resume,                                                        // from verification-state.json when --resume and its outcome is null; else null
  project: "",                                                   // set only when the TRD targets a codebase other than this repo
  feature: "<feature>",                                          // TRD basename (Step 1) -- renderReport()'s header
  prd: prd_path,                                                 // bound in Step 3 (implement.json's functional_verification.prd_path, or ""), overwritten by 3a when it runs
  definitionPath: ".trd-state/<feature>/success-definition.md",  // present (Step 3), or just-derived (Step 3a)
} })
```

### 5. Report

Render the outcome — `satisfied` / `unbuilt` / `stalled` / `stuck`, or either `not run` case —
with the per-criterion counts and the report path.

**§8.5 applies here in full: while the loop is in flight, its gaps are not yours to fix.**
Record them and let it finish.

---

## `--resume`

Re-enters at the next iteration from `verification-state.json`, seeding `previousGaps`. The
state file's `outcome` key decides: `null` means the run stopped mid-loop and is resumable;
any of the four outcome strings means it finished and `--resume` starts a fresh run instead.

---

## Output discipline (see `.claude/rules/command-status.md`)

### Artifact link (see `.claude/rules/command-status.md`)

Unless `.claude/settings.json` sets `ensemble.publishArtifacts: false`, publish the verification report with
`Artifact({ file_path: ".trd-state/<feature>/verification-report.md", favicon: "✅" })` — the markdown FILE, never a
rendering of it — reusing the stored URL from `.trd-state/<feature>/artifacts.json` (key
`verification-report`) when one is present, and storing it when one is not. Emit the link ABOVE the
banner. A failed publish is one line of prose and nothing more; it never blocks the banner.

**The banner is the LAST line of the turn. Nothing after it — not a caveat, not a finding, not
a recommendation.** Anything worth saying goes above it.

```
═══ COMMAND COMPLETE: /verify-build ═══
<outcome, criterion counts, report path>
```

On unrecoverable failure use `═══ COMMAND STUCK: /verify-build ═══` with `Reason:` and `Next:`.

```bash
.claude/hooks/notify-complete.sh "verify-build" "complete" "<one-line summary>"
```

---

## Autonomous-execution discipline (see `.claude/rules/autonomy.md`)

Runs autonomously from invocation to the banner. `AskUserQuestion` is permitted only for the
four cases in `autonomy.md` — and on this command the realistic one is §2's preflight batch:
information that genuinely cannot be derived, asked ONCE, up front, with a stated default.

Do not pause to report interim findings. Do not offer to fix what the loop surfaces.

- "I'll continue unless you want me to pause." / "Want me to keep going, or pause for a look?" → **HEDGED OFFERS ARE STILL OFFERS.** Just proceed without announcing. If you draft a sentence offering to pause, delete it and continue.
- The declarative form is the same move: "I can fix that if you want", "say the word".
  Neither is a question; both hand the decision back and the work does not happen.

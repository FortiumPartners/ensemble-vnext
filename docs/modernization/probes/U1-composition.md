# U1 Probe — How Do Multiple Hooks Registered on One Event Compose?

**Task:** DISC-P001 (`docs/TRD/discipline-judgment.md` §2.1 U1). U1 was already marked
**ANSWERED 2026-08-13 (DISC-B007, by source tracing)** before this probe ran. This probe
was run anyway, per the assignment, to get live empirical evidence rather than relying on
source tracing alone — this project has repeatedly found the hooks documentation wrong or
silent on payload/composition questions. The live results below **corroborate DISC-B007's
conclusion with direct observation** and add one mechanical detail (hooks run *concurrently*,
not serially) that source tracing alone would not surface as vividly.

**Method:** a throwaway git repo under `$CLAUDE_JOB_DIR/tmp/u1-probe`, with `SubagentStop`
hooks that each append a timestamped line to a shared log file (proving they ran, when, and
for how long) before emitting their JSON verdict. Triggered by:

```bash
claude --print --setting-sources project --dangerously-skip-permissions \
  'Use the Agent tool to spawn ONE general-purpose subagent that runs `echo hi` via Bash and returns DONE. Nothing else.'
```

Every configuration below was run at least twice; the repeated-block configurations were
additionally self-replicating (each block cycle re-triggers `SubagentStop`), so each single
invocation already contains many repetitions of the same composition rule.

Tags: **[OBSERVED]** live evidence, **[INFERRED]** reasoned from observed evidence.

---

## Headline verdict

**All hooks registered on an event always run — none are skipped or short-circuited — and
any single `block` wins over any number of `allow`s, independent of array position.** This
matches DISC-B007's source-tracing conclusion exactly. Additionally **[OBSERVED]**: hooks
within one event fire **concurrently**, not sequentially waiting on each other, which is why
no command-type hook can act as a cheap gate in front of a later hook (they don't run "in
front of" anything — they all start at once).

## Answers to the five questions

### Q1 — Do ALL hooks run, or does execution stop at the first decision?

**[OBSERVED] All run, always, in every configuration tested** (3 hooks in one matcher's
array; 3 hooks split across 3 separate matcher entries; all-allow; one hook blocking). Every
run's log shows exactly 3 log lines per `SubagentStop` firing, one per registered hook, with
no configuration in which a hook was skipped. See Evidence 1 below.

### Q2 — If hook #1 allows and hook #2 blocks, does the block win (any-block-wins)?

**[OBSERVED] Yes.** Config `A=allow, B=block, C=allow` (B in the middle) caused the
`SubagentStop` event to re-fire **9 times** in a single `claude --print` invocation before
the run finally completed — i.e., the platform kept re-evaluating the stop as blocked despite
two of three hooks voting allow, on every one of the 9 cycles. See Evidence 2.

### Q3 — If hook #1 blocks and hook #2 allows, does the block still win?

**[OBSERVED] Yes, identically.** Config `A=block, B=allow, C=allow` (block hook moved to
*first* position) produced the same 9-cycle retry-loop pattern as Q2's middle-position block.
Order of the blocking hook within the array made no observable difference to the outcome.
See Evidence 3.

### Q4 — Does `order` in the settings array control execution order deterministically?

**[OBSERVED] No — not in the sense of serialized/sequential execution.** A timing probe
(`hook_slow.sh`, hook A given a 3-second `sleep`, hooks B and C immediate) showed all three
hooks' START timestamps within ~100 microseconds of each other, and B/C's END timestamps
~5ms later — while A was still sleeping. If array position controlled a sequential run order,
B and C would not complete until after A's 3-second sleep finished; instead they completed
almost 3 seconds *before* A did. **[INFERRED]** the hooks in one event's dispatch are started
as concurrent/parallel subprocesses, not awaited one at a time in array order. Array position
had no observable effect on the accept/block outcome either (Q2 vs Q3). The settings schema
itself has no explicit `order` field — only the array position, which this probe shows is not
load-bearing. See Evidence 4.

### Q5 — Can an early command-type hook prevent a later hook on the same event from running?

**[OBSERVED] No.** This falls directly out of Q1 and Q4: since all registered hooks start
concurrently and all always run to completion regardless of any other hook's verdict or
position, no hook — command-type or otherwise — can suppress or short-circuit another hook's
execution. There is no "early" hook in the serialized sense the question assumes; they are
simultaneous. **Implication for TRD §2.2:** a cheap structural-gate hook cannot save the cost
of a later model-backed (prompt-type) hook by preventing it from firing — both hooks always
run and both are billed/latency-charged every time, and the final result is the OR of their
verdicts (any block wins). This is exactly DISC-B007's conclusion ("Shape B was impossible,
not merely unnecessary") and this probe's live evidence supports it independently.

---

## Evidence

### Evidence 1 — all hooks always run (all-allow control, 2 runs)

`settings.json` fragment (3 hooks, one matcher, all allow):

```json
"hooks": {
  "SubagentStop": [
    { "matcher": "", "hooks": [
      { "type": "command", "command": "bash .claude/hooks/hook.sh A allow", "timeout": 5 },
      { "type": "command", "command": "bash .claude/hooks/hook.sh B allow", "timeout": 5 },
      { "type": "command", "command": "bash .claude/hooks/hook.sh C allow", "timeout": 5 }
    ]}
  ]
}
```

Log across 2 runs — 3 lines per run, every hook present, no skips:

```
[1786630139.160191000] C ran (decision=allow) pid=75333
[1786630139.160178000] A ran (decision=allow) pid=75331
[1786630139.160265000] B ran (decision=allow) pid=75332
[1786630149.148109000] B ran (decision=allow) pid=75969
[1786630149.148099000] C ran (decision=allow) pid=75970
[1786630149.148307000] A ran (decision=allow) pid=75968
```

Both `--print` runs completed cleanly with `DONE` — no retry loop when nothing blocks,
confirming the 9x loop in Evidence 2/3 is caused specifically by the block, not some
unrelated retry behavior.

### Evidence 2 — block wins from the middle position (`A=allow, B=block, C=allow`)

Single invocation, `SubagentStop` re-fired 9 times (first and last cycle shown; all 9 have
the same shape — A and C always allow, B always blocks, all three always present):

```
[1786630199.258426000] C ran (decision=allow) pid=79000
[1786630199.258465000] A ran (decision=allow) pid=78998
[1786630199.258849000] B ran (decision=block) pid=78999
... (7 more identical-shape cycles) ...
[1786630223.230514000] A ran (decision=allow) pid=80812
[1786630223.230775000] C ran (decision=allow) pid=80814
[1786630223.230814000] B ran (decision=block) pid=80813
```

`grep -c 'B ran' log.txt` → 9. Final `--print` output still completed successfully
(`Subagent ran \`echo hi\` and returned DONE.`) once the retry loop resolved — consistent
with the platform capping/exiting the loop rather than blocking forever; this run did not
probe *why* it stopped at 9, only that the composition rule (any-block-wins, all-hooks-run)
held on every one of the 9 cycles.

### Evidence 3 — block wins from the first position (`A=block, B=allow, C=allow`)

```
[1786630252.795797000] A ran (decision=block) pid=82673
[1786630252.795666000] C ran (decision=allow) pid=82675
[1786630252.796019000] B ran (decision=allow) pid=82674
... (7 more identical-shape cycles) ...
[1786630275.225711000] A ran (decision=block) pid=84204
[1786630275.225789000] B ran (decision=allow) pid=84205
[1786630275.225834000] C ran (decision=allow) pid=84206
```

Also 9 cycles (`grep -c 'A ran'` → 9). Identical shape to Evidence 2 — moving the blocking
hook to array position 1 instead of position 2 changed nothing about the outcome or cycle
count.

**Control for "same rule across matcher-grouping, not just within one array":** the same
`A=block/B=allow/C=allow` config was re-run with each hook in its **own separate matcher
entry** (3 entries instead of 1 entry with a 3-item `hooks` array) — same result, 9 cycles,
all 3 hooks present every cycle, block always wins:

```json
"hooks": { "SubagentStop": [
  { "matcher": "", "hooks": [{ "type": "command", "command": "bash .claude/hooks/hook.sh A allow", "timeout": 5 }] },
  { "matcher": "", "hooks": [{ "type": "command", "command": "bash .claude/hooks/hook.sh B block", "timeout": 5 }] },
  { "matcher": "", "hooks": [{ "type": "command", "command": "bash .claude/hooks/hook.sh C allow", "timeout": 5 }] }
]}
```

```
[1786630298.053596000] C ran (decision=allow) pid=85700
[1786630298.053542000] A ran (decision=allow) pid=85698
[1786630298.053869000] B ran (decision=block) pid=85699
... (7 more) ...
[1786630321.705015000] C ran (decision=allow) pid=87732
[1786630321.705267000] A ran (decision=allow) pid=87724
[1786630321.705229000] B ran (decision=block) pid=87731
```

9 cycles again. Composition semantics are identical whether hooks share one matcher entry's
array or are spread across multiple matcher entries on the same event.

### Evidence 4 — concurrency, not sequential ordering (timing probe)

`hook_slow.sh` logs a START line, sleeps `$3` seconds, then logs an END line. Config: A
sleeps 3s, B and C sleep 0s, array order A, B, C:

```
[1786630175.327938000] B START (decision=allow) pid=77750
[1786630175.327870000] C START (decision=allow) pid=77751
[1786630175.327945000] A START (decision=allow) pid=77749
[1786630175.332422000] C END   (decision=allow) pid=77751
[1786630175.332484000] B END   (decision=allow) pid=77750
[1786630178.395773000] A END   (decision=allow) pid=77749
```

All three START within ~75 microseconds of each other. B and C both START and END (~5ms
total) while A is still 2.9+ seconds away from finishing its sleep. This is only possible if
the three hooks are dispatched as concurrent subprocesses; a sequential/serialized dispatch
in array order would force B and C to wait for A's process to exit first.

---

## What this means for TRD §2.2 Shape A vs Shape B

Directly confirms DISC-B007's already-recorded conclusion, from independent live evidence
rather than source tracing alone:

- **No hook — command-type or otherwise — can gate or short-circuit another hook on the same
  event.** They start together, run to completion together, and the event's outcome is the
  OR of all verdicts (any block wins). This was true whether the blocking hook was first,
  middle, or in its own separate matcher entry.
- **Shape B (command gate + judge) cannot deliver its intended cost savings**, because the
  "gate" hook does not run *before* the judge hook in any sense that would let it prevent the
  judge from firing — both always run, both are always paid for (latency + tokens/compute),
  every single time the event fires. This is consistent with the TRD's note that Shape B "was
  impossible, not merely unnecessary."
- **Shape A (judge-only)**, already decided in DISC-D001, is the only shape available for this
  reason among others — this probe adds confirming, not new, weight behind that decision.

## What this does NOT establish

- **[NOT OBSERVED]** *why* the retry loop stopped at exactly 9 cycles rather than continuing
  indefinitely — this probe did not investigate the platform's own loop-termination logic for
  repeated `SubagentStop` blocks (that is U3's territory, `docs/modernization/probes/
  U3-loop-bound.md`, not re-litigated here).
  - Actually reading the numbers: this was one probe's incidental observation, not a
    controlled test of loop-bound behavior — treat the "9" as an artifact of this run, not a
    documented platform constant.
- **[NOT OBSERVED]** whether the *content* of multiple blocking hooks' `reason` strings gets
  merged/concatenated when more than one hook blocks simultaneously (all block tests here used
  exactly one blocking hook at a time). Not needed for the Shape A/B question, but worth a
  follow-up note if a future design relies on reading multiple reasons at once.
- **[NOT OBSERVED]** behavior on `Stop` (only `SubagentStop` was tested, per the assignment's
  primary target) — DISC-B007's source-tracing conclusion is stated generally, and this
  project's other probes (U2/U3/U4) test `Stop` directly and report consistent mechanics, so
  there is no reason to expect divergence, but this probe itself only exercised
  `SubagentStop`.

---

## Appendix — cleanup

The throwaway repo `$CLAUDE_JOB_DIR/tmp/u1-probe` and all captured logs/outputs under it were
deleted after evidence extraction. No files under `packages/`, `.claude/`, or `test/` in this
repository were modified. Only this findings file was created.

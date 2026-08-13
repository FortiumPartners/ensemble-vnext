---
name: verify-goal
description: >
  Goal-native live verification. Drives a TRD's implementation to "all assertions pass"
  under /goal — one assertion of progress per turn against a durable verify.json contract.
  Use when running verification autonomously via `claude -p "/goal …"` or interactive
  `/goal`, or when you want a single-session verify loop instead of the parallel team loop
  in /verify-trd-team. Triggers: "verify until it works", "goal verify", "autonomous
  verification", "keep verifying until all pass".
when_to_use: >
  Reach for this for autonomous single-session live verification of a TRD under /goal — one
  assertion of progress per turn against a durable verify.json contract, looping until all
  assertions pass. Use instead of the parallel multi-teammate loop in /verify-trd-team when you
  want one self-driving session ("verify until it works", "goal verify"). For functional
  ship-readiness against original requirements use ship-workplan; for smoke tests use the
  smoke-test-* skills.
argument-hint: "[trd-path] [--promise \"<text>\"]"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, Skill, Agent
---

# verify-goal — structured live verification for `/goal`

This skill is the single-session, **`/goal`-drivable** counterpart to `/verify-trd-team`.
`/goal` supplies the *loop* (keep working turn-after-turn until a condition is met); this
skill supplies the *structure* and a *machine-checkable completion contract*, so the goal
condition is concrete and file-backed rather than ad-hoc prose.

> **Why this exists:** a command/skill body cannot itself activate `/goal` (slash commands
> fire only from direct user input). So instead of a command "turning on" autonomy, the
> user/orchestrator launches `/goal` with a structured condition that points at this skill.

## How to launch

**Autonomous (headless / remote):**

```bash
claude -p "/goal Every assertion in .trd-state/<trd-name>/verify.json has verdict \"pass\" (or acceptable \"blocked\"); zero \"pending\" or \"fail\". Use the verify-goal skill against docs/TRD/<trd-name>.md."
```

**Interactive:** type the same `/goal …` line; this skill auto-activates from the mention.

`/verify-trd-team` emits this exact line at preflight, so you normally copy-paste it rather
than write it by hand.

## The completion contract (what `/goal` evaluates each turn)

`.trd-state/<trd-name>/verify.json` is the single source of truth. Its schema is **identical
to `/verify-trd-team`'s State Schema** — do not redefine it; reuse it. The goal is met IFF:

- the file exists and contains at least one assertion, **and**
- every assertion's `verdict` is `pass` (or `blocked` with an acceptable justification per
  `/verify-trd-team` §5.1), **and**
- zero assertions are `pending` or `fail`.

Because the predicate is a file, `/goal`'s per-turn check is concrete and deterministic —
not a fuzzy judgment of "is it done yet?".

## Per-turn algorithm

Each turn, make progress toward the contract and persist it (atomic write) to verify.json:

1. **Bootstrap (first turn only):** load the TRD + linked PRD; decompose the completion
   promise into assertions following `/verify-trd-team` §3 (Promise Decomposition). Default
   promise = `/verify-trd-team`'s default unless `--promise` is given. Write verify.json with
   every assertion `pending`.
2. **Select** the next unsatisfied assertion (priority: `fail` before `pending`). If none
   remain unsatisfied, the contract is met — print the satisfied report and stop.
3. **PROBE** it live using `/verify-trd-team` Appendix V.1 (API/UI/third-party). Record
   `verdict` + `evidence`.
4. **FIX (if FAIL)** using Appendix V.2 — minimal change; never weaken assertions to pass.
   Delegate deep debugging to the `app-debugger` subagent via the **Agent** tool. Cap at 3
   fix attempts per assertion; then mark `fail` and move on (the goal stays unmet, surfacing
   the blocker for a human).
5. **RE-PROBE**, and re-check previously-`pass` assertions touching the same files
   (regression guard).
6. For each `pass`, ensure a durable test exists (write one if missing) so CI catches
   regressions.
7. **Persist verify.json.** The turn ends; `/goal` re-evaluates the contract and re-invokes
   if unmet.

## Differences from `/verify-trd-team`

- **Single session, no team.** `/goal` drives the loop; there is no run-counter / max-3-runs
  cap (`/goal` stops when the contract is met or you interrupt with Ctrl-C).
- **Reuses, does not redefine:** promise decomposition (§3), PROBE/FIX templates (Appendix
  V), third-party safety rules (§4.1), and the verify.json State Schema from
  `/verify-trd-team`.
- **Durable across `/compact` and session end** — verify.json is the state; resuming the
  `/goal` run picks up exactly where it left off.

## Safety (verbatim from `/verify-trd-team` §4.1)

Read-only / sandbox third-party operations only. **Never** send real emails/SMS/push,
charge real payment methods, modify billing, or write to / delete external resources. If
verifying an assertion would require a destructive external action, mark it `blocked` with
the reason (acceptable block).

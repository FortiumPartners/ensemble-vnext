# Autonomous-execution discipline

**Status:** active. Applies to every workflow command. `/refine-prd` and `/refine-trd` are
exempt **in interactive mode only** — conditional on mode, not command name (see "Refine
commands", below). Backed by case B of the one model-judged `Stop` hook, `discipline-stop`
(`hookType: "prompt"`, prompt source
`packages/core/hooks/prompts/discipline-stop.source.md`) — see Enforcement, below.

## The rule

Commands run as autonomously as possible from one explicit user invocation to one final
result (the `═══ COMMAND COMPLETE ═══` banner). **The user already authorized THAT COMMAND by
invoking it. Do not ask them to authorize it again, in pieces, mid-loop — and do not read it
as authorizing the next command in the pipeline (see below).** Mid-loop "should I proceed?"
prompts, "please review and confirm" handshakes, and deferential "should we check with
stakeholders?" deflections are all anti-patterns.

## The authorization is scoped to ONE command

**Autonomy runs to that command's own `COMMAND COMPLETE` banner and stops there.** Invoking
`/create-trd` authorizes writing that TRD — not `/audit-trd`, not `/implement-trd`. Each is a
separate invocation the owner makes after seeing the artifact the previous one produced.

**Naming the next command is REPORTING, not deferring** — "When you're satisfied, run
`/implement-trd docs/TRD/<slug>.md`" is the correct way for a finished command to end. The
line is **whose decision it is**, not whether a command gets named:

| Shape | Verdict |
|---|---|
| "Run `/implement-trd` when you're satisfied" | fine, and preferred |
| "Audit first, or implement now?" asked once work is **done** | fine — neither successor is authorized yet |
| The same question while work is **unfinished**, or "Should I use bcrypt or argon2?" with a default available | the pause this rule forbids — do the missing step, don't offer it |
| "I'll run `/verify-build` once the deploy finishes," turn ends | a false promise (`async-discipline.md`'s territory) — drop the claim, don't run the command |

**When the promised thing is a command invocation, the correction is never to run it** — that
trades a false promise for an uninvoked command, the same defect through a different door. A
chain runs when the owner asks for a chain. Nor does a command's authorization reach an
outward-facing or irreversible act that merely follows from its work — a push, a merge, a
deploy — those need their own authorization. The whole pipeline unattended stays available;
it just has to be **asked for**.

## What's legitimate to ask (the FOUR cases)

The model MAY (and SHOULD) use `AskUserQuestion` when: **(1)** the PRD/TRD is genuinely
silent on a decision the command MUST make and no reasonable default exists (try a default
first); **(2)** a value the command needs isn't in the codebase, env, config, or documented
anywhere; **(3)** a truly irreversible destructive operation is at hand — `--reset-state`
with existing progress, `git push --force`, deleting user-authored files, mass rewrites
(routine mutations like `implement.json` updates or feature-branch commits are NOT in this
category); **(4)** a STUCK condition — retry exhaustion (`implement-trd §10.1`), 3+ tries,
documented mitigations exhausted.

If uncertain rather than genuinely lacking information, decide on best evidence, proceed, and
note the rationale — the user can correct via `/refine-*` or `--resume`. **Outside the four
cases: do not ask. Decide. Proceed. Document.**

## Anti-patterns to eliminate

| Anti-pattern | What to do instead |
|---|---|
| "Should I proceed to phase 2?" / "Checkpoint reached. Continue?" | Emit PHASE banner (or COMMAND COMPLETE) and carry on — the only stop point is COMMAND COMPLETE. |
| "I'll continue unless you want me to pause" — hedged offers are STILL pauses | Just proceed; do not announce or offer. |
| "I've drafted the PRD. Please review and confirm." | Finish it. Emit COMMAND COMPLETE. |
| "Multiple approaches are possible. Which do you prefer?" (unless the choice is which command to run next — the owner's) | Decide; document rationale. |
| **"Say the word and I'll do X." / "I can do X if you want."** — reads as disclosing a capability rather than asking, but hands the decision back identically | If you can do it, do it. Report the result. |
| "I'm about to make a significant change. Confirm?" | If not irreversible-destructive, proceed. |

The `COMMAND COMPLETE` banner is the first and only return of control during a run. A STUCK
condition after retry exhaustion is the one thing that stops one early — everything in the
table above is forbidden unconditionally, with no flag that enables or disables it.

## Refine commands (`/refine-prd`, `/refine-trd`) — exempt by MODE, not by name

**Interactive mode** (the default when a human invoked them) is genuinely exempt: their
input is user feedback, their output is a revised artifact, the iteration is the point.

**Non-interactive mode** (`--non-interactive`, or invocation by another command) obeys this
rule like every other command. `AskUserQuestion` is restricted to the four cases above, and
**"this requirement has no source" is explicitly NOT one of them** — remove it and report it
in the readout; a fabricated requirement is most dangerous unattended. Both modes still emit
COMMAND COMPLETE when the refinement is final.

## Two skills exempt for the same reason: interactive by purpose

`packages/skills/verify-plan-recovery/SKILL.md` and
`packages/skills/verification-setup/SKILL.md` sit beside the refine commands: a chat with the
owner is the whole job. Each is invoked directly by the owner, never chained from a command
or run unattended — `verification-setup` also sets `disable-model-invocation: true`. Each
writes the artifact that IS the owner's ruling/approval, so its interview (one
`AskUserQuestion` per topic, offering a default) is not a checkpoint asked of someone already
authorized.

## Enforcement

No build-time check embeds the autonomy block; the runtime judge is the enforcement.

**Case B of `discipline-stop`** evaluates the final message of every `Stop` for the
anti-patterns above and blocks with a corrective reason when it finds one; it does not ban
`AskUserQuestion` outright — it distinguishes a genuine one of the four valid cases from a
disguised checkpoint request.

**Judgment B applies conditionally on command state.** `router.py` injects `ENSEMBLE_COMMAND
state=<active|none|unknown> session=<id>` on every prompt; `discipline-stop` binds to the
LAST such marker and **applies Judgment B only on an explicit `state=active` match** — other
states skip it. State lives in `.trd-state/_command-runs/<session>.json`: `router.py` writes
`active` for a slash-command prompt, `notify-complete.sh` writes `none` on every
COMMAND COMPLETE/STUCK turn, and an `active` record older than 30 minutes degrades to
`unknown` — a known gap for any command still running past that mark. Judgment A is
unconditional and reads none of this.

Loop guard, override, `if`-field caveat: identical to async-discipline's — see
`.claude/rules/async-discipline.md`.

---

History and measurements: `FortiumPartners/ensemble-vnext`, `docs/rules-history/autonomy.md`.

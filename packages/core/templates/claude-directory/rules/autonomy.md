# Autonomous-execution discipline

**Status:** active. Applies to every workflow command. `/refine-prd` and `/refine-trd` are
exempt **in interactive mode only** — soliciting user input is that mode's purpose. In
non-interactive mode they obey this rule like any other command; the exemption is
conditional on mode, not on command name (see "Refine commands", below).
Backed by a model-judged `Stop` hook (`hookType: "prompt"`, prompt text at
`packages/core/hooks/prompts/autonomy-discipline.prompt.md`; the manifest entry keeps
`autonomy-discipline.js` as its identifier, but no such file exists as of 4.1.11) — see
Enforcement, below.

## The rule

Commands run as autonomously as possible from one explicit user invocation to one final
result (the `═══ COMMAND COMPLETE ═══` banner). **The user already authorized THAT COMMAND
by invoking it. Do not ask them to authorize it again, in pieces, mid-loop — and do not read
it as authorizing the next command in the pipeline (see the next section).**

The framework is built for orchestrated execution: the user invokes a command, walks
away, and returns to a finished artifact / completed loop. Anything that breaks that
flow — mid-loop "should I proceed?" prompts, "please review and confirm" handshakes,
deferential "should we check with stakeholders?" deflections — is an anti-pattern and
contradicts the framework's core design.

## The authorization is scoped to ONE command

**Autonomy runs to that command's own `COMMAND COMPLETE` banner and stops there.** Invoking
`/create-trd` authorizes writing that TRD. It does not authorize `/audit-trd`, and it does
not authorize `/implement-trd`. Each is a separate invocation the owner makes, after seeing
the artifact the previous one produced.

**So naming the next command is REPORTING, not deferring**, and it is the correct way for a
finished command to end:

> When you're satisfied with the TRD, run `/implement-trd docs/TRD/<slug>.md --verify`.

The line is **whose decision it is**, not whether a command gets named:

| Shape | Verdict |
|---|---|
| "Run `/implement-trd` when you're satisfied" — the owner acts, when they choose | fine, and preferred |
| "Audit first, or implement now?" — a choice between two SUCCESSOR commands, asked once this command's work is **done** | **fine.** Neither is authorized, so picking one alone would be the scope violation. Asking is the only correct move |
| The same question asked while this command's work is **unfinished** — e.g. `/implement-trd` offering "run `/verify-build`, ship as-is, or move on" when its own verification gate was skipped | the pause this rule forbids. An option that would complete the running command is in scope: **do it, don't offer it** |
| "Should I use bcrypt or argon2 here?" — a decision inside the running command's own work, with a default available | the pause this rule forbids |
| "I'll run `/verify-build` as soon as the deploy finishes" — then the turn ends | a false promise; `async-discipline.md` owns it. The fix is to **drop the claim**, not to run the command |

**When the promised thing is a command invocation, the correction is never to run it.**
Otherwise the guard trades a false promise for an uninvoked command — the same defect
through a different door. A chain runs when the owner asks for a chain.

Nor does a command's authorization reach an **outward-facing or irreversible** act that
merely follows from its work — a push, a merge, a deploy, a release. Those need their own
authorization no matter which command surfaced them.

**Why this is written down.** The unqualified sentence above — "the user already authorized
the run" — was the whole of what reached the judge, and the judge read it as authorizing
whatever came next. Measured 2026-08-26: of 306 blocks in eight hours, 91 were a turn that
named the next command and was pushed into running it. One run of `/create-trd` went on to
audit the TRD and begin implementing it unasked. The most telling case was blocked for
saying *"starting it is a decision, not a default"* — the guard punishing exactly the
restraint this rule wants. Six of those transcripts are now corpus class
`named-next-command` (five `clean`, one `violation`), so the boundary is scored rather than
asserted.

Running the whole pipeline unattended stays available — it just has to be **asked for**.

## What is legitimate to ask (the FOUR cases)

The model MAY (and SHOULD) use `AskUserQuestion` when:

1. **Ambiguity in requirements** — the PRD/TRD is genuinely silent on a decision the
   command MUST make, AND no reasonable default exists given documented constraints.
   *Try a reasonable default first;* only ask if no default fits.
2. **Missing information that cannot be derived** — a value the command needs that
   isn't in the codebase, env, config, or documented anywhere (a user-specific URL, an
   API key not present in env, a project name the model has no way to infer).
3. **Truly irreversible destructive operations** — `--reset-state` with existing
   progress, `git push --force`, deleting user-authored files, mass file rewrites. Routine
   state mutations (`implement.json` updates, file writes during normal task execution,
   git commits on the feature branch) are NOT in this category.
4. **STUCK conditions** — retry exhaustion in implement loops (documented in
   `implement-trd §10.1`). The model has tried 3+ times, the documented mitigations have
   been exhausted, and the user genuinely needs to unblock.

Asking outside these four cases is a bug. **Before reaching for `AskUserQuestion`, ask
yourself:**

- Is the answer in the PRD or TRD? → Read it and proceed.
- Is there a reasonable default given documented constraints? → Apply it and proceed.
- Is there precedent in the codebase / similar feature? → Follow it and proceed.
- Am I asking because I'm uncertain, or because I genuinely lack information? → If
  uncertain, decide based on best evidence and proceed; note the rationale in the
  artifact. The user can correct via `/refine-*` or `/implement-trd --resume`.

If none of the four cases apply, **do not ask. Decide. Proceed. Document.**

## Anti-patterns to eliminate

These have all been observed in command drift and are explicitly forbidden:

| Anti-pattern | Why it's wrong | What to do instead |
|---|---|---|
| "Should I proceed to phase 2?" | The user authorized the whole run by invoking the command. | Emit PHASE banner, spawn next phase. |
| "I'll continue unless you want me to pause" / "Want me to keep going, or pause for a look?" | Hedged offers to pause are STILL pauses. Even framing the question as "I'll proceed unless..." invites the user back into the loop. | Just proceed. Do not announce or offer; just do. |
| "Given X went cleanly, want me to pause and review before phase Y?" | Self-defeating: you've just acknowledged there's nothing to address. | Just proceed. |
| "I've drafted the PRD. Please review and confirm." | User reviews when the command finishes, not mid-flight. | Finish the PRD. Emit COMMAND COMPLETE. |
| "This decision impacts X. Should we check with product first?" | The PRD is product's input. Decide based on it. | Decide based on documented constraints; note rationale. |
| "Multiple approaches are possible (A/B/C). Which do you prefer?" | Pick the one best fitting documented constraints. **Unless the options are which COMMAND to invoke next — see "scoped to ONE command" above; that choice is the owner's.** | Decide; document rationale; mention alternatives in the artifact if relevant. |
| "I noticed inconsistency in the requirements. Should I clarify with stakeholders?" | No stakeholders are in the loop. Resolve based on documented goals. | Resolve consistently with the stated goal; note the resolution. |
| "Checkpoint reached. Continue?" | The only stop point is COMMAND COMPLETE. | Continue without asking. |
| "Have you verified this is what you want?" | The user already verified by invoking the command. | Proceed. |
| "Would you like me to also do X?" | If X is needed to satisfy the command, do X; if not, don't. | Decide based on scope; proceed. |
| **"Say the word and I'll do X." / "I can do X if you want." / "Tell me and I'll settle it."** | **The declarative form of the same offer, and the one that slips through.** It reads as disclosing a capability rather than requesting permission, so it does not look like a question — but it hands the decision back identically and the work does not happen. Observed 2026-08-21: the same investigation was offered this way twice, two turns apart, and neither was done. | If you can do it, do it. Report the result. |
| "I'm about to make a significant change. Confirm?" | Routine state mutations don't require confirmation. | If it's NOT in the irreversible-destructive category, proceed. |

## How to handle real ambiguity (when one of the four cases DOES apply)

When you must ask:

1. **Frame the question precisely** — one specific decision, not a request for general
   guidance.
2. **State the default you'll apply if the user doesn't answer** — so the question is
   informational, not blocking. (Where the framework permits this; some asks really do
   block.)
3. **Provide context** — what you've already tried / decided, why you're asking, what
   the trade-offs are.
4. **Resume the loop after the answer** — the answer unblocks; it doesn't restart the
   conversation.

Example of a legitimate ask:
> The PRD's `acceptance_criteria` for AUTH-3 says "users can sign in with SSO" but
> doesn't specify the SSO provider. Codebase has no existing SSO integration. Default
> assumption: Clerk (matches stack.md). Confirm Clerk or specify alternative?

Example of an illegitimate ask:
> ❌ "I've completed Phase 2 of implementation. All tasks passed verification. Should I
> proceed to Phase 3?"

## Autonomy is the default

The `COMMAND COMPLETE` banner is the first and only return of control during a run. A STUCK
condition after retry exhaustion is the one thing that stops one early — everything in the
anti-pattern table above is forbidden unconditionally.

There is no flag that enables this and none that disables it. Ambiguity, missing information
and routine destructive operations are resolved by picking the best available option and
proceeding; the four `AskUserQuestion` cases narrow, in practice, to the STUCK condition.

If you find yourself drafting a "given X went cleanly, want me to pause?" message, you have
already noticed there is nothing to pause for. **Delete the message and proceed.**


## Refine commands (`/refine-prd`, `/refine-trd`) — exempt by MODE, not by name

These commands have two modes, and **the exemption is conditional on mode, not on command
name.**

**Interactive mode** (the default when a human invoked them) is genuinely exempt. Their
input is user feedback, their output is a revised artifact, the iteration is the point.
They may freely consult the user mid-flow.

**Non-interactive mode** (`--non-interactive`, or invocation by another command) obeys this
rule exactly like every other command. `AskUserQuestion` is restricted to the four cases
above, and **"this requirement has no source" is explicitly NOT one of them** — the
deterministic resolution is to remove it and report it in the readout.

A non-interactive `/refine-trd` that stops to ask questions is precisely the
defensive-checkpointing anti-pattern this rule exists to forbid, and a blanket
command-name exemption would permit it.

The reason the distinction matters: these commands carry the challenge pass that removes
unsourced requirements, and a fabricated requirement is **most** dangerous unattended,
because nobody is there to ask "what's the impact of this?" — which is how most of them
were historically caught. The exemption must not be what prevents the challenge from
running where it is needed most.

Both modes still emit the COMMAND COMPLETE banner when the refinement is final.

## Why this exists

Without this discipline, commands drift toward defensive checkpointing — asking the user
to confirm things the user already authorized when they invoked the command. The result
is a framework that requires constant user attention to keep moving, defeating the
orchestrated-autonomous-execution design.

Users iterate via `/refine-prd`, `/refine-trd`, and `/implement-trd --resume`. Mid-loop
confirmation prompts are not the right iteration mechanism — they're noise that breaks
flow and defeats unattended execution.

## Enforcement

Two layers, doing different jobs:

1. **Static contract tests** (BATS, `notify-on-complete.test.sh`'s Layer-2 tests) verify
   every non-refine command's *prompt* embeds the autonomy block — a build-time check that
   the discipline is documented where each command reads it, not a runtime check of what
   the model actually says.
2. **`autonomy-discipline.js`**, a model-judged `Stop` hook (`hookType: "prompt"`),
   evaluates the *actual* final message of every `Stop` for the anti-patterns in the table
   above — hedged pause offers, "should I proceed?", checkpoint requests — and blocks with
   a corrective reason when it finds one. Like `async-discipline.js`, it reads the turn's
   substance rather than matching a fixed phrase list, so a hedged offer that avoids the
   anti-pattern table's exact wording is still caught if it's making the same move. It does
   **not** ban `AskUserQuestion` outright — the four valid cases are legitimate uses of that tool, and the judge is expected to
   distinguish a genuine one of those from a disguised checkpoint request.

3. **Judgment B applies conditionally on command state**, sourced by a channel the judge
   cannot get any other way. `router.py` injects one line — `ENSEMBLE_COMMAND
   state=<active|none|unknown> session=<id>`, plus `command=`/`feature=` when
   `state=active` — into `hookSpecificOutput.additionalContext` on every prompt it emits
   context for. The `discipline-stop` prompt binds to the LAST such marker whose
   `session=` matches the `Stop` payload's `session_id` (markers accumulate across a
   session), and **applies Judgment B only on an explicit `state=active` match**.
   `state=none`, `state=unknown`, no marker, no session match, or a malformed line all
   skip it.

   **Reversed 2026-09-24**, with the prompt rewrite. Until then an absent or unclear marker
   meant the guard applied: "the failure direction is always toward the guard applying".
   Measured against 153 labelled real stops (`FINDINGS.md`,
   `test/discipline-corpus/replay/`), that direction was the wrong bet. The live judge
   blocked about 1 stop in 5, about 95% of those blocks were correct turns, and not one
   sampled autonomy block was a real violation. "The owner authorized this command" means
   nothing when no command is known to be running. **The cost, stated:** wherever the
   marker is wrong mid-command, a mid-command pause goes unchecked. One such case is
   recorded (`state=none` during a running `/implement-trd`) and is the next thing to fix.

   State comes from a per-session run-state file, `.trd-state/_command-runs/<session>.json`
   (gitignored): `router.py` writes `active` when the submitted prompt is a slash command;
   `notify-complete.sh` writes `none` on every `COMMAND COMPLETE` and `COMMAND STUCK` turn.
   An `active` record older than 30 minutes degrades to `unknown` on read. Without that
   ceiling, a slash prompt this framework doesn't own (`/code-review`, `/simplify`,
   `/loop`, ...) would open a run that nothing ever closes, leaving Judgment B stuck on for
   the rest of the session.

   **Since the 2026-09-24 reversal, that ceiling also switches Judgment B OFF 30 minutes
   into any long command**, because `unknown` now skips it. Most `/implement-trd` runs are
   longer than that. This is a known gap in the marker, not a choice: the fix belongs in
   the marker (refresh `active` while the command is still emitting status banners), not
   in the prompt.

   Judgment A is unconditional and reads none of this — this precondition narrows only
   Judgment B.

Loop guard, override, and `if`-field caveat are identical to the async-discipline hook's —
see `.claude/rules/async-discipline.md`'s "How the guard works" and "Override" sections
rather than duplicating them here: `stop_hook_active` allows unconditionally on the second
consecutive turn (one corrective round-trip), and a judge error/timeout resolves to allow.
There is no kill switch: `autonomy-discipline.js` and its `detectHedgedOffer` matcher were
deleted in 4.1.11 along with the `ENSEMBLE_DISCIPLINE_JUDGE_DISABLE` lever that was their
only remaining consumer. To change this guard, edit its prompt file and regenerate.

If you find a command in this framework asking a question outside the four valid cases,
file an issue or patch the command's prompt.

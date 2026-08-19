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
result (the `═══ COMMAND COMPLETE ═══` banner). **The user already authorized the run
by invoking the command. Do not ask them to authorize it again, in pieces, mid-loop.**

The framework is built for orchestrated execution: the user invokes a command, walks
away, and returns to a finished artifact / completed loop. Anything that breaks that
flow — mid-loop "should I proceed?" prompts, "please review and confirm" handshakes,
deferential "should we check with stakeholders?" deflections — is an anti-pattern and
contradicts the framework's core design.

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
| "Multiple approaches are possible (A/B/C). Which do you prefer?" | Pick the one best fitting documented constraints. | Decide; document rationale; mention alternatives in the artifact if relevant. |
| "I noticed inconsistency in the requirements. Should I clarify with stakeholders?" | No stakeholders are in the loop. Resolve based on documented goals. | Resolve consistently with the stated goal; note the resolution. |
| "Checkpoint reached. Continue?" | The only stop point is COMMAND COMPLETE. | Continue without asking. |
| "Have you verified this is what you want?" | The user already verified by invoking the command. | Proceed. |
| "Would you like me to also do X?" | If X is needed to satisfy the command, do X; if not, don't. | Decide based on scope; proceed. |
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

## `--wiggum` and autonomous-mode flags

When the user passes `--wiggum` (autonomous mode) on `/implement-trd`, the autonomy
contract is **doubly enforced** — the user has explicitly opted into "do not stop until
complete." Under `--wiggum`:

- **All four valid `AskUserQuestion` cases above shrink to ONE**: only STUCK conditions
  after retry exhaustion. Ambiguity, missing info, and routine destructive operations
  are resolved by the model picking the best available option and proceeding (the wiggum
  flag IS the user's standing approval).
- **All offers to pause, review, or check-in are forbidden** — including the hedged
  forms ("I'll proceed unless...", "Want me to keep going?"). When `--wiggum` is set,
  the answer to every "should I continue?" question is already YES. Don't ask. Don't
  hedge. Don't announce intent — just do.
- **The COMMAND COMPLETE banner is the FIRST and ONLY return of control** to the user
  during a `--wiggum` run.

If you find yourself drafting a "given X went cleanly, want me to pause?" message under
`--wiggum`, you have already noticed there's nothing to pause for. **Delete the message
and proceed.**

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
   **not** ban `AskUserQuestion` outright — the four valid cases (and, under `--wiggum`, the
   one valid case) are legitimate uses of that tool, and the judge is expected to
   distinguish a genuine one of those from a disguised checkpoint request.

Loop guard, override, and `if`-field caveat are identical to the async-discipline hook's —
see `.claude/rules/async-discipline.md`'s "How the guard works" and "Override" sections
rather than duplicating them here: `stop_hook_active` allows unconditionally on the second
consecutive turn (one corrective round-trip), and a judge error/timeout resolves to allow.
There is no kill switch: `autonomy-discipline.js` and its `detectHedgedOffer` matcher were
deleted in 4.1.11 along with the `ENSEMBLE_DISCIPLINE_JUDGE_DISABLE` lever that was their
only remaining consumer. To change this guard, edit its prompt file and regenerate.

If you find a command in this framework asking a question outside the four valid cases,
file an issue or patch the command's prompt.

# Autonomous-execution discipline

**Status:** active. Applies to every workflow command **EXCEPT `/refine-prd` and
`/refine-trd`** (which are inherently iterative — soliciting user input is their purpose).

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
   `implement-trd §8.1`). The model has tried 3+ times, the documented mitigations have
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

When the user passes `--wiggum` (autonomous mode) on `/implement-trd` or
`/implement-trd-team`, the autonomy contract is **doubly enforced** — the user has
explicitly opted into "do not stop until complete." Under `--wiggum`:

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

## Refine commands (`/refine-prd`, `/refine-trd`)

These commands are intentionally interactive — their input is user feedback, their output
is a revised artifact, the iteration is the point. They are exempt from this rule's "do
not ask" posture and may freely consult the user mid-flow. They still emit the COMMAND
COMPLETE banner when the refinement is final.

## Why this exists

Without this discipline, commands drift toward defensive checkpointing — asking the user
to confirm things the user already authorized when they invoked the command. The result
is a framework that requires constant user attention to keep moving, defeating the
orchestrated-autonomous-execution design.

Users iterate via `/refine-prd`, `/refine-trd`, and `/implement-trd --resume`. Mid-loop
confirmation prompts are not the right iteration mechanism — they're noise that breaks
flow and defeats unattended execution.

## Enforcement

This rule is documented and tested via the BATS suite (`notify-on-complete.test.sh`'s
Layer-2 contract tests verify all non-refine commands include the autonomy block) but
NOT hook-enforced — `AskUserQuestion` is a legitimate tool for the four valid cases and
banning it would prevent them.

If you find a command in this framework asking a question outside the four valid cases,
file an issue or patch the command's prompt.

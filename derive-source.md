## Reproduction

### Steps

1. A workflow command publishes a document with the `Artifact` tool. The publish result
   carries "Live subscription: arming in the background — not connected yet ... a new version
   starts no turn and sends no notification" [ran: text read verbatim from a 2026-11-20 storybook
   `/audit-design` transcript, publish result at 17:01:50Z. That session was readable but is
   NOT the blocked one: both of its Stops were allowed].
2. The platform keeps that watch as a running background task, so the Stop payload's
   `background_tasks` is non-empty although the agent started nothing [inferred: the exact
   entry shape was not observed; the owner's report says the platform auto-arms a monitor].
3. The command ends with its readout and `═══ COMMAND COMPLETE ═══`.

### Actual

Measured once live on 2026-11-20 (owner's report): the judge blocked the finished turn.

Replay with the current prompt did **not** reproduce it: three reconstructed cases plus five
variants of the allow case (watch mentioned in the message, generic or missing task
description, two watches plus a finished agent, an earlier finished dispatch) — 0 blocks in
25 runs on `claude-sonnet-5`. The live transcript sits under the owner's account and could
not be read from this one. Root cause: **[inferred]** — the prompt's case A tells the judge
to treat a `background_tasks` entry or a conversation-visible `Monitor` as live machinery,
and says nothing about a task the agent did not start, so a running watch reads as
unexplained async work the final message ought to account for.

Nothing in the current prompt makes a running task a violation by itself (case A needs a
promise in the final message), so the mechanism above may be wrong: the live block could as
well have been the platform's "insufficient evidence" default or another judge's condition.
The block's own reason text (`Stop hook error: …`) would settle it, and it was not available.

### Expected

A running task the platform armed on its own is neither evidence of a promise nor something
that keeps one. A finished turn with only that task running is allowed; a promise of other
work is judged exactly as if the task were absent.


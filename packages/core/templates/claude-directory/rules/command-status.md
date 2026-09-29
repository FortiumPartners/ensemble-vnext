# Command-status discipline

**Status:** active. Required of every workflow command (slash-command-driven session).

## Why this exists

You should never have to ask "is it done?", "what's it waiting for?", or "did it stall?"
Three standard banners answer those questions — the contract every command honors so a
glance at the last output line tells you the state without scrolling.

## The three banners

Use these literal forms — leave the box characters intact for visual clarity.

### 1. DISPATCHED (turn ends with work in flight)

When a command spawns subagents/teammates or schedules a wake-up and is about to end its
turn awaiting their completion, emit **right before ending the turn**:

```
[STATUS: /<command-name>] DISPATCHED → <count> <kind> in flight: <names>
   waiting on: <observable signal>
   next wake: <ScheduleWakeup ETA | "auto-deliver on teammate SendMessage" | "/goal condition">
```

### 2. RESUMED (turn starts after a wake)

When the command re-enters via ScheduleWakeup, a teammate SendMessage, or /goal looping,
emit **as the first line** of the new turn:

```
[STATUS: /<command-name>] RESUMED → <reason>
   completed since last turn: <summary or "none">
```

### 3. COMMAND COMPLETE / COMMAND STUCK (the LAST line of the final turn)

When the command finishes its end-to-end work, its **last output line** must be one of:

```
═══ COMMAND COMPLETE: /<command-name> ═══
<one-line summary: what was produced / accomplished>
```

or, if the command exits with an unrecoverable stuck state:

```
═══ COMMAND STUCK: /<command-name> ═══
Reason: <one-line>
Next:   <what would unblock — usually a user decision or external fix>
```

e.g. `═══ COMMAND COMPLETE: /implement-trd ═══` / `Phase 4/4 complete: 8/8 tasks implemented,
coverage unit 87% / int 62%, 2 commits on feature/AUTH-1234`.

**Rules for the COMPLETE/STUCK banner:** it is the **LAST line of the turn** — nothing after
it, not even a final reminder; use it only when the command itself is done, not at phase
boundaries or teammate handoffs (those get a PHASE banner, below); for commands spanning many
ScheduleWakeup cycles, it fires only on the turn that completes the entire command.

## The readout: four sections, always, in this order

**Every command that finishes work emits a readout immediately before its
`COMMAND COMPLETE` banner.** Same four sections, same order, same names, every command, so a
reader never learns a new format per command:

```
STATE      what exists now, and what does not
DECISIONS  what was chosen, and what it rules out
ISSUES     what is wrong or unresolved, and who has to act
NEXT       the exact command or action, ready to run
```

**Any section may be empty. Saying "none" is correct and takes one line** — padding a section
to look thorough is the failure this format exists to prevent.

### Write for someone who was not in the session

This is the part that keeps being got wrong. The owner's account: *"I find I need to read and
much of what I read is jargon based on deep technical details of the corpus and the current
feature; very hard to follow."*

Concretely: **name the thing, then its id** — "the clamp-order defect (FIX-001)", never
"FIX-001" alone (an id is a lookup key, not a description); **no internal vocabulary without
its meaning** — "the reconcile stage", "tier AUTO", "grounding" are opaque outside the
framework, so gloss the term once; **state outcomes, not activities** — "3 of 4 tasks built;
the fourth needs a decision from you", not "dispatched the phase workflow, ran the gate"; and
**numbers need their unit and their baseline** — "677s, was 341s" beats "improved latency".

A real pair, from a session where this rule was written and then broken by the same agent,
repeatedly, in the same session — what actually reached the owner, who had to ask what it
meant, versus what it should have said:

| Written | What it should have said |
|---|---|
| "A3 zero-tolerance class FP" | "a false positive in the class that must stay clean" |

The left side is **correct and unreadable** — it asks the reader to resolve two or three
lookups before the sentence means anything. **Write the thing, then its id.**

**This governs readouts and ordinary replies alike** — the router's orientation hint carries
a short form of it for the latter.

### What each section carries

**STATE** — what is true on disk now: files written, tasks done and not done, tests passing
or failing. Say what proves a claim of "done"; a part that didn't happen is named here, never
buried in ISSUES. **DECISIONS** — choices the owner didn't make and would want to know (a
default applied, an approach taken, a documented decision overridden), one line each with the
reason, or "none". **ISSUES** — what is wrong or unresolved, and who has to act; a finding
nobody must act on belongs in the artifact, not here. **NEXT** — the literal next command,
runnable as written, or "nothing — this is done", never a menu of options.

**Length: one screen** — the longest section overflowing means it should point at a document
instead of reproducing one. **This governs the command's own closing prose too**: narrating
the run (what was dispatched, what each stage returned) is the failure mode however accurate,
because the readout answers one question — what does the owner need to know, and what do
they do next.

## Optional: PHASE banner

For long, multi-phase commands (`/implement-trd`, `/audit-build`, `/plan --implement`), emit
at each phase boundary: `[STATUS: /<command-name>] PHASE <N>/<M> COMPLETE → <summary>`. Not
the final COMMAND COMPLETE — a progress marker showing forward motion, paired with the
durability of `implement.json`'s checkpoints.

## Notification on completion

### Path A — `PushNotification` (preferred, direct, atomic with the banner)

For **multi-turn / long-running commands** (`/implement-trd`, `/audit-build`,
`/plan --implement`), pair the `COMMAND COMPLETE` banner with a direct `PushNotification`
call in the same final turn — emit the banner as text, then call
`PushNotification({ status: "proactive", message: "implement-trd done: Phase 4/4, 23 tasks
implemented, branch feature/AUTH-1234" })`. Send one for `COMMAND STUCK` too, with the Reason
and an actionable hint. **Don't send from short one-shot commands**
(`/create-prd`, `/refine-prd`, `/cleanup-project`) — the user is watching that turn; the
banner alone is enough. Budget: under 200 characters, one line, no markdown, lead with what
the user would act on, err toward NOT sending.

### Path B — `NOTIFY_ON_COMPLETE` env var (programmatic, atomic with COMMAND COMPLETE)

**For a programmatic completion signal routed to a webhook, shell command, queue, or signal
file — firing EXACTLY ONCE, at the actual completion moment.** On the same final turn that
emits `═══ COMMAND COMPLETE ═══`, the command invokes vendored helper
`.claude/hooks/notify-complete.sh "<cmd>" "<complete|stuck>" "<summary>"`, which discovers
session identity, exports it as `NOTIFY_*` env vars (`NOTIFY_CMD`, `NOTIFY_STATUS`,
`NOTIFY_SUMMARY`, `NOTIFY_PROJECT`, `NOTIFY_CWD`, `NOTIFY_BRANCH`, `NOTIFY_FEATURE`,
`NOTIFY_SESSION_ID`, `NOTIFY_TMUX_SESSION`, `NOTIFY_TMUX_PANE`), and dispatches
`$NOTIFY_ON_COMPLETE` via `/bin/sh -c`. Because this goes through the model's tool surface it
fires exactly once — never during DISPATCHED/RESUMED turns; silent no-op if unset. Setup
(`export NOTIFY_ON_COMPLETE='<shell command>'`) and worked recipes are in the history doc
linked below.

**Three paths, by audience:** A alerts the user, once on the final turn; B (this one) drives
external systems, once on the final turn; C (below) fires on *every* Stop, including dispatch
and wake turns — use it only when you want a signal on every idle, not just completion.

### Path C — `notify.sh` Stop hook (per-Stop orchestration only)

`notify.sh` (`packages/core/hooks/notify.sh`) fires every session Stop and runs whatever's in
`NOTIFY_ON_STOP` — including dispatch and ScheduleWakeup turns. For "tell external system
this command finished," use Path B instead. To cut the noise, gate the alert on the `COMMAND
COMPLETE` banner appearing in `$NOTIFY_TRANSCRIPT_PATH`. Worked recipes are in the history
doc linked below.

## Artifact links

A command that produces a document — a PRD, a TRD, a verification report — publishes it as an
**artifact**: a private page on claude.ai the owner can click into, and later share if they
choose. **On by default**; turn off per project with `ensemble.publishArtifacts: false` in
`.claude/settings.json`. A document you have to go find in the tree is a document that does
not get read — the link is the point of producing one.

**Publish the FILE, don't render it:**
```
Artifact({ file_path: "docs/TRD/<feature>.md", icon: "document",
           description: "<one sentence>", url: "<stored URL, if this is an update>" })
```
Markdown publishes directly — one tool call regardless of document size, Mermaid fences
render as diagrams natively, and the artifact stays the document rather than a paraphrase
that drifts from it.

**Store the URL and redeploy to it.** Write the returned URL to
`.trd-state/<feature>/artifacts.json` keyed by artifact kind (`prd`, `trd`,
`verification-report`, and one key per verification-check skill); on a later `/refine-prd`,
`/refine-trd` or re-verify, pass it back as `url:` so the same link updates in place. Without
this the link goes stale silently — someone clicks a URL from three refinements ago and reads
a superseded plan that looks current.

**The link goes above the `COMMAND COMPLETE` banner, never after it** (the banner is the last
line of the turn):
```
📐 TRD: https://claude.ai/artifact/...
═══ COMMAND COMPLETE: /create-trd ═══
```

**Failure is never fatal.** If the tool is unavailable or the publish fails, say so in one
line and carry on — the document on disk is the deliverable, the artifact a convenience. A
command must not go STUCK, retry, or lose its banner over a failed link.

**Turning it off is a real decision, not a discovery.** Publishing sends the document to an
external service, where it may be cached or indexed even after deletion; artifacts are
private to the owner on publish, which is what makes on-by-default reasonable. Set
`{ "ensemble": { "publishArtifacts": false } }` and it's honored everywhere — commands skip
the publish step and emit no link. `scaffold-project.sh` backfills the key with `setdefault`,
so an owner's `false` survives every rebase; no upgrade may quietly reverse it.

**Never publish a document that contains a credential.** `verification.md` already requires
recording where credentials live rather than their values; with publishing on by default,
that's what stands between a pasted token and a hosted page.

---

## Enforcement

This is a documented contract, not a hook-blocked invariant — `discipline-stop` does not
inspect output for these banners. It relies on each command's prompt instructing the model to
emit them, and the user noticing an absence as a sign of a broken command (file a fix). If
you find a command that doesn't end with `═══ COMMAND COMPLETE` or `═══ COMMAND STUCK`,
that's a bug.

**One legitimate exception: a command that CHAINS into another.** `/plan --implement` invokes
`/implement-trd` and deliberately emits no banner of its own, because the banner is the LAST
line of the turn and an implementation run follows it — the run still terminates with a
banner, carrying the chained command's name. The reverse also holds: `/implement-trd
--chained`, called by `/verify-build --fix`, emits none, and the caller's banner ends the
run. So the invariant is **one banner per RUN, not one per command name** — a chaining
command that emits none is correct.

---

Worked recipes and history: `FortiumPartners/ensemble-vnext`,
`docs/rules-history/command-status.md`.

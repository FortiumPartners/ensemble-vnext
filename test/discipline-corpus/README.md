# Discipline-hook judgment corpus

Acceptance corpus for the discipline hooks (`async-discipline.js`, `subagent-discipline.js`,
`autonomy-discipline.js`) as they convert from regex matching to model judgment. See
`docs/TRD/discipline-judgment.md` §1, §3.1 for the full design; this file covers only what
lives in this directory.

## What this corpus is for

The old regex-based discipline hooks failed in production: a subagent ended with *"Waiting on
the monitor event for completion."* and was not blocked, because every regex and all 24 of its
tests were written with "waiting **for**". The test suite shared the implementation's
vocabulary, so it confirmed the blind spot instead of exposing it.

This corpus exists so that never happens again. It is the acceptance suite the new
judgment-based hooks must pass — it defines what "working" means, and it catches regressions.
It is **not** a bake-off between candidate approaches (TRD D2).

**Critical constraint (TRD D3): corpus text comes from real transcripts, not authored
examples.** Authored cases reproduce the author's own vocabulary — exactly the failure mode
being fixed. Authored text is permitted *only* for the hard-negative classes described below,
and every such case must carry `"source": "authored"` so it's never confused with a real
extraction.

## Pipeline

```
extract.js  (DISC-B001, this task)  →  candidates.jsonl  (unlabeled, gitignored)
                                              │
label (DISC-B002, separate task)             ▼
                                        corpus.jsonl  (labeled, committed)
                                              │
score.js (DISC-B003, separate task)          ▼
                                     per-class precision/recall
```

`extract.js` does **extraction only**. It does not assign real labels or classes — every case
it emits has `"label": null, "class": "unlabeled"`. DISC-B002 is the separate task that reads
and labels each case against the classes and floors in TRD §3.1.

## Schema

One JSON object per line (JSONL):

```json
{"id": "c-<hash>", "source": "projects/<enc>/<uuid>.jsonl#<record-uuid>", "event": "Stop", "text": "...", "label": null, "class": "unlabeled", "note": "...", "stop_reason": "end_turn"}
```

| Field | Meaning |
|---|---|
| `id` | Stable id, `c-<12 hex chars>` — a hash of `source + record uuid + text`, so re-running extraction reproduces the same ids for unchanged cases. |
| `source` | Provenance: transcript path relative to `~/.claude/projects/`, plus the originating record's `uuid`, so any case can be traced back to the exact transcript record it came from. Authored hard-negative cases (added by DISC-B002) must use the literal string `"authored"` here instead. |
| `event` | `"Stop"` for lead-session transcripts, `"SubagentStop"` for subagent transcripts — mirrors the hook event the text would have been evaluated under. |
| `text` | The final assistant text message from that transcript (see "What counts as the final message" below). Truncated to 4000 chars if longer (noted in `note`). |
| `label` | `"violation"` \| `"clean"` \| `null`. Extraction leaves this `null`; DISC-B002 fills it in. |
| `class` | One of the TRD §3.1 classes (`deferral-explicit`, `deferral-novel-phrasing`, `no-result-returned`, `autonomy-hedge`, `clean-completion`, `self-documentation`, `incidental-vocabulary`), `payload-dependent` (TRD §3.1.1 — the correct label depends on `background_tasks`/`session_crons`, not on the text alone), or `"unlabeled"` before DISC-B002 runs. |
| `note` | Free text: truncation note, crude triage bucket (see below), and (for labeled cases) the reasoning behind the label. Not authoritative on its own — read alongside `stop_reason`. |
| `stop_reason` | The source record's `message.stop_reason` — `"end_turn"` (turn genuinely finished, a real hook could have fired on this text), `"null"` (record shows no `stop_reason`; correlates with an interrupted/incomplete generation — see "Confirmed vs unconfirmed finals" below), `"tool_use"` (this text was a mid-turn preamble immediately followed by a tool call — NOT a final message), or `"n/a"` for `authored`/`synthetic-adversarial` cases, which have no source transcript record. `extract.js` only emits `end_turn` finals by default (pass `--include-unconfirmed` to keep the rest) — see below. |

### TRD §3.1 classes and floors (for DISC-B002, reproduced here for convenience)

| Class | Label | Floor | Purpose |
|---|---|---|---|
| `deferral-explicit` | violation | 10 | Base case. |
| `deferral-novel-phrasing` | violation | 5 | Must include the 4.1.8 live miss **verbatim** ("Waiting on the monitor event for completion."). |
| `no-result-returned` | violation | 5 | No deferral vocabulary present — an agent that just... doesn't return a usable result. |
| `autonomy-hedge` | violation | 5 | `autonomy-discipline`'s case: hedged mid-loop pause offers. |
| `clean-completion` | clean | 15 | Ordinary successful returns. |
| `self-documentation` | clean | 10 | **Hard negatives** — this repo's own rule files and meta-discussion about the rule (e.g. this README, `async-discipline.md`). |
| `incidental-vocabulary` | clean | 5 | e.g. "the user is waiting for a response"; "waiting rooms are implemented". |

## What counts as "the final message"

For each transcript, the extractor scans every JSONL record of `type: "assistant"` in file
order and keeps the **last one whose `message.content` contains at least one `text` block**.
It concatenates that record's `text` blocks (skipping `thinking` and `tool_use` blocks) and
uses that as the case text. This mirrors the `last_assistant_message` field the real hooks
receive on `Stop` / `SubagentStop`.

Lead-session transcripts are `~/.claude/projects/<encoded-project-path>/<session-uuid>.jsonl`.
Subagent transcripts are `~/.claude/projects/<encoded-project-path>/<session-uuid>/subagents/agent-*.jsonl`.

### Confirmed vs unconfirmed finals (`stop_reason`)

"Last text-bearing assistant record in the file" is not automatically "the text a real
Stop/SubagentStop hook fired on." A JSONL transcript sometimes logs one logical model turn as
multiple `assistant`-type lines (a text block, then a separate line for a following tool call),
and the *text* line's own `message.stop_reason` is `null` in that case — the terminal
`stop_reason` (`tool_use`) lands on the *next* line instead. Discovered the hard way: several
early corpus cases turned out to be mid-turn preambles ("Now let me read the four target
files...") that were followed, in the same file, by a tool call — the turn never actually ended
there, so no hook could have fired on that text. A second, distinct pattern is a record whose
`stop_reason` is `null` **and** which is the literal last line of the file — no continuation
follows. That looks like an interrupted or incomplete generation (session cut off, compacted,
still in progress) rather than a deliberate stop, but unlike the mid-turn-preamble case there's
no proof either way.

`extract.js` now reads `message.stop_reason` off the record it selects and, **by default, only
emits candidates whose `stop_reason` is `"end_turn"`** — the one value that unambiguously means
the turn finished there. Pass `--include-unconfirmed` to also keep `null`/`tool_use` finals; the
`stop_reason` field on every case (real or not) makes the distinction visible in the corpus
itself rather than silently deciding which cases exist. When labeling from `null` finals,
treat them as plausible-but-unconfirmed, not field-confirmed.

## Re-running extraction

```bash
node test/discipline-corpus/extract.js                        # full scan, end_turn-confirmed only (default)
node test/discipline-corpus/extract.js --limit 50              # quick smoke test
node test/discipline-corpus/extract.js --since 2026-08-01      # only recent transcripts
node test/discipline-corpus/extract.js --out /tmp/cand.jsonl   # write elsewhere
node test/discipline-corpus/extract.js --no-redact             # disable secret redaction (NOT recommended)
node test/discipline-corpus/extract.js --include-unconfirmed   # also keep null/tool_use finals
```

Output defaults to `test/discipline-corpus/candidates.jsonl`, which is **gitignored** — it's
large (multiple MB from ~1,800 local transcripts) and fully reproducible by re-running the
script against the same `~/.claude/projects/` tree. The extractor is deterministic given the
same transcript set, but that set is specific to this machine's session history, so
`candidates.jsonl` is not portable and shouldn't be committed.

**The labeled corpus IS committed.** DISC-B002's output (the file with real `label`/`class`
values, e.g. `corpus.jsonl`) is the actual acceptance suite and belongs in git — that's what
`score.js` (DISC-B003) runs against, and it's what catches regressions in CI.

## Privacy / hygiene

These transcripts are the user's real work history. The extractor is deliberately conservative:

- **Redaction is ON by default** (`--redact`, disable with `--no-redact`). Any case whose text
  matches an obvious secret pattern — `sk-`/`sk-ant-` keys, `ghp_`/`gho_`/fine-grained GitHub
  tokens, AWS access keys (`AKIA`/`ASIA`), Slack tokens, Google API keys, PEM private key
  headers, bearer tokens, JWT-shaped strings, long base64 blobs, or `.env`-style `KEY=value`
  with a long value — is **dropped entirely**, not redacted-in-place. When in doubt, the case
  is dropped rather than included. This is intentionally over-broad (it will drop some cases
  that aren't actually secrets, e.g. long hashes or encoded IDs) — false positives here cost
  nothing; false negatives leak real credentials into a file meant to become fixture data.
- **Text is truncated to 4000 characters per case**, with the truncation recorded in `note`.
  Only the amount of transcript text actually needed for judging a final-message classification
  goes into the corpus — not entire multi-thousand-line sessions.
- Only the **final assistant message** is extracted — not full transcripts, not user turns
  (which may contain pasted secrets, personal context, etc.), not tool inputs/outputs.

If you're labeling (DISC-B002) and spot something that slipped through redaction — a secret,
something clearly personal/sensitive that isn't actually a "secret" pattern — drop that case
rather than including it, even if it would otherwise fit a needed class/floor.

## Authored text (hard negatives only)

`self-documentation` and, where a real example can't be found, other hard-negative cases may
be authored rather than extracted. Every authored case MUST set `"source": "authored"` so it's
never mistaken for a real transcript extraction, and should be added sparingly — the whole
point of this corpus (TRD D3) is that it reflects real usage, not what the hook author expects
violations/non-violations to look like.

## Crude triage bucketing (not a label)

Each extracted case's `note` field includes a crude regex-based bucket — `deferral-ish` or
`clean-looking` — based on surface phrasing (`"I'll let you know"`, `"running in the
background"`, etc.). This is **not a label** and must not be treated as one; DISC-B002 must
read and label every case. It exists purely to help the labeler prioritize review, since the
overwhelming majority of real transcript endings are ordinary clean completions and the
violation classes are comparatively rare in the wild — grep-ing `note` for `deferral-ish` (or
searching `candidates.jsonl` directly for phrases like "waiting for", "waiting on", "I'll
report back", "in the background") is a reasonable way to find candidates for the `deferral-*`
and `no-result-returned` classes without reading all ~1,500 cases end to end.

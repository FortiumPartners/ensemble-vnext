---
primitive: file-followups
params: below-bar=no
results: filed
outward: yes
needs:
section: after
---

# Primitive: file-followups

Files what the work left over as tracker issues, once (D26, D27, D39). Only this primitive
files; the others only record.

## Input

`below-bar` (default `no`), `work`, `context`, and the tracker from `stack.md`'s `## Issue
Tracker` section (as `close-issue` reads it).

## Do

1. **Import what has no row yet,** once each, as non-blocking rows:
   - a `not_verifiable` criterion into the work's ledger: `discovered.record(<work.stateDir>,
     { ref: "criterion:<id>", status: "not_verifiable", ... })`; and
   - a `/task` follow-up into that task's own `.trd-state/<task>/discovered.jsonl` (select task
     dirs on `closed.json` with `closedBy: "task"` and its `followups`): `ref: "followup:<index>"`.
   Skip a ref already imported.
2. **Which ledgers.** Only the work's own (`<work.stateDir>/discovered.jsonl`; for sweep work the
   ship's own state directory) and each `/task` dir with follow-ups. This primitive reads no row
   of the sweep ledger and marks none of it: that ledger cannot tell one sweep's rows from
   another's (D39).
3. **Which rows.** Every open non-blocking row (`discovered.readAll(dir, { open: true })`)
   except `[below-bar]` rows and `[review:<label>]` rows whose label D17 puts below the bar
   (`minor`, `low`, `nit`, `nitpick`, `trivial`, `info`); those are filed only with
   `below-bar=yes`, otherwise named with the ledger path. A `[review-pending]` row is a review
   whose findings never arrived: report it as a gap, never file it. A label D17 does not know is
   filed, since there is no judge here.
4. **File.** Issue body: the work, TRD, branch, PR URL, ledger path and row key. GitHub through
   `gh issue create`; Linear and Jira through their skills. Then `discovered.resolve(dir, row,
   "filed <url>")`, so a re-run files nothing twice.
5. No tracker, or a failed call: file nothing for that row and name it (AC-F9.5). Put every
   unfiled row and every `[review-pending]` gap in `data.issues`.

## Result

`filed`, with `data`: `{ filed: [urls], unfiled: [row summaries], issues }`.

## Waiting

Nothing.

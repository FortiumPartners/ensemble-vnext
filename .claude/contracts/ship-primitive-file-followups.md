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

Steps 1 to 3 run whether or not a tracker is declared or reachable: what could not be filed is
still listed, row by row (AC-F9.5, AC-F10.3).

**Never create an issue to find out whether the tracker works** — no test issue, no probe
title, not even `gh issue create --dry-run`. Every `gh issue create` this step runs files one
selected row. Reachability is learned read-only (`gh auth status`, `gh repo view <repo>`) or
from the first real filing call, whose error becomes that row's reason in step 5. A stray issue
is an outward act nothing authorized.

1. **Import what has no row yet,** once each, as non-blocking rows. Three sources have no ledger
   row of their own:
   - a criterion the verification loop left `not_verifiable`, read from
     `<work.stateDir>/verification-state.json` (its `criteria`, each with `id`, `status` and
     `reason`), into the work's ledger with `ref: "criterion:<id>"` and
     `status: "not_verifiable"`; and
   - a `/task` follow-up, read from each `.trd-state/<task>/closed.json` with `closedBy: "task"`
     and a `followups` list, into that task's own `.trd-state/<task>/discovered.jsonl` with
     `ref: "followup:<index>"`.
   - a job that flaked (failed, then passed on rerun), read from `<work.stateDir>/flaky.jsonl`
     (each line has `job` and `runId`): for each distinct job run
     `node .claude/lib/flaky-ci.js import --state-dir <work.stateDir> --job <job> --run-id <runId>`.
     It records one non-blocking `[flaky-ci]` row with `ref: "flaky:<job>"` in the work's ledger,
     unless any feature's ledger already has a `flaky:<job>` row.
   Run the script below from the project root; it skips a ref already imported (filed or not) and prints
   each task directory that has follow-ups, one per line:
   ```bash
   node -e 'const fs=require("fs"),p=require("path"),d=require("./.claude/lib/discovered");const dir=process.argv[1];const has=(s,ref)=>d.readAll(s).some((r)=>r.ref===ref);let vs={};try{vs=JSON.parse(fs.readFileSync(p.join(dir,"verification-state.json"),"utf8"))}catch{}for(const c of (vs.criteria||[]).filter((c)=>c&&c.status==="not_verifiable")){const ref="criterion:"+c.id;if(!has(dir,ref))d.record(dir,{kind:"gap",foundBy:"file-followups",blocksFeature:false,status:"not_verifiable",ref,summary:"[not-verifiable] "+c.id+": "+(c.reason||"no reason recorded"),evidence:p.join(dir,"verification-state.json")})}let ts=[];try{ts=fs.readdirSync(".trd-state")}catch{}for(const t of ts){const td=p.join(".trd-state",t);let c;try{c=JSON.parse(fs.readFileSync(p.join(td,"closed.json"),"utf8"))}catch{continue}if(c.closedBy!=="task"||!Array.isArray(c.followups)||!c.followups.length)continue;c.followups.forEach((f,i)=>{const ref="followup:"+i;if(!has(td,ref))d.record(td,{kind:"gap",foundBy:"task",blocksFeature:false,ref,summary:"[task-followup] "+String((f&&f.summary)||f),evidence:f&&f.evidence})});console.log(td)}' "<work.stateDir>"
   ```
   No `verification-state.json` (the work never ran the verification loop) imports nothing from
   that source.
2. **Which ledgers.** Only the work's own (`<work.stateDir>/discovered.jsonl`; for sweep work the
   ship's own state directory) and each `/task` directory step 1 printed. This primitive reads no
   row of the sweep ledger and marks none of it: that ledger cannot tell one sweep's rows from
   another's (D39). The work's ledger is also the record of unfixed review findings (AC-F9.7).
3. **Which rows.** Read them through the ranking library, passing each of step 2's ledgers as
   a repeated `--state-dir`:
   `node .claude/lib/followup-rank.js open --state-dir <dir> [--state-dir <dir> ...]`. It prints
   every open row of those ledgers, merged and in rank order (product, host, tooling, paperwork,
   not-verifiable), each carrying `class` and `dir`. Take every open non-blocking row of that
   output except `[below-bar]` rows and `[review:<label>]` rows whose label D17 puts below the bar
   (`minor`, `low`, `nit`, `nitpick`, `trivial`, `info`); those are filed only with
   `below-bar=yes`, otherwise named with the ledger path. A `[review-pending]` row is a review
   whose findings never arrived: report it as a gap, never file it. A `[flaky-capped]` row is
   reported, never filed: its job's one issue is the `[flaky-ci]` row (`ref: "flaky:<job>"`).
   A label D17 does not know is filed, since there is no judge here.
4. **File,** the selected rows in that order (product first). Issue body: the work, TRD, branch, PR URL, ledger path and row key. GitHub through
   `gh issue create`; Linear and Jira through their skills. A `[non-blocking]` row is filed only through `node .claude/lib/waived-defects.js gate --state-dir <dir> --stack "$(node .claude/lib/owner-rules.js path stack.md)"` (its `<dir>` is the row's own), never with a plain `gh issue create`, and is never refiled when it already carries a `filed <url>` marker; the gate writes that marker itself, so its rows are not resolved again below. Then `discovered.resolve(dir, row,
   "filed <url>")` against its own `dir` (the one the row came back with), so a re-run files nothing twice, and add
   `{ summary, url, class }` for that row to `data.filed`: the row's own summary and the URL its own call returned. Two rows given the same
   URL are both named in `data.issues` (the tracker did not create distinct issues).
5. **What could not be filed (AC-F9.5).** No tracker, or a failed call: file nothing for that row
   and leave it open. Then put in `data.issues` one line per item, each naming the row by its summary and its ledger path, never folded into a
   count. Row lines come in one rank order across all the kinds listed below (not grouped by
kind), each starting with the row's class
   (`product · <summary> — <ledger path> — <why>`):
   - every row step 3 selected that was not filed, with why (`no tracker declared in stack.md`,
     or the call's error), the imported `[not-verifiable]`, `[task-followup]` and `[flaky-ci]` rows included;
   - every below-bar row step 3 left unfiled (`below the bar; filed only with below-bar=yes`);
   - every `[review-pending]` gap and every `[flaky-capped]` row;
   - and one line naming the record of unfixed review findings, `<work.stateDir>/discovered.jsonl`,
     whenever any review row in it was left unfiled; the line naming the record of unfixed review
     findings names no row, so it goes last.

## Result

`filed`, with `data`: `{ filed: [{ summary, url, class }], unfiled: [row summaries, in rank order], issues }`. One
`filed` entry per filed row, never a bare count or a bare URL list: the readout lists each row
with its issue (AC-F5.8), a `[below-critical]` row from a final pass included.

## Waiting

Nothing.

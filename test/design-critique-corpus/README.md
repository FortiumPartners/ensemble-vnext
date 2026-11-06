# Design-critique labelled set and replay

The frames the visual critic (section 8 of `packages/core/contracts/design-commands.md`) is
checked against, and `replay.js`, which runs the critic over them and reports how well its scores
agree with the labels. TRD `docs/TRD/design-quality.md`, D16. It is a report: nothing gates on it,
and no threshold is set until the owner sets one (OQ-6).

## Files

| File | What it is |
|------|------------|
| `labels.jsonl` | One row per frame |
| `frames/<id>.png` | The rendered frame (committed, so nothing at test time reads `.trd-state/`) |
| `measures/<id>.json` | The render's measures for that frame: `{ board, state, errors, measures }` |
| `replay.js` | The replay and its pure scoring functions |
| `replay.test.js` | Model-free, Chromium-free tests; `claude` is a mock. It never spawns `claude` |

## Row format

```json
{"id":"01-home","frame":"frames/01-home.png","measures":"measures/01-home.json",
 "board_source":".trd-state/.../01-home.dc.html","label":"poor",
 "dimensions":{"hierarchy":2,"craft":3},
 "reason":"owner, 2026-11-06: '...'","source":"where the frame came from"}
```

`id` (unique), `frame` and `measures` (paths relative to this folder, files must exist),
`board_source`, `label` (`good` or `poor`), `reason` and `source` are required. `dimensions` is
optional: a map of rubric dimension name (lower case, as the rubric names it) to an integer 1-5.
`replay.js` and `replay.test.js` reject a malformed row, a duplicate id or a missing file, naming
the line.

## The first set

Eight rows, the default frame of each of the walk's eight boards (DORCH-T001 live walk, fixture
commit `5a6d0e2`, 2026-11-05), all labelled `poor` with the owner's remark. The frames are the
boards **re-rendered with the pinned runtime** by `design-render.js render`, not screenshots of
the published boards: six of the eight report "mounted nothing" under the pinned runtime and
draw as unstyled text. The boards come from
`.trd-state/task-dorch-t001-live-walk/evidence/boards/` (DQ-P001). Because every row is `poor`
and none has `dimensions`, a first replay reports agreement as "not computable" and no
per-dimension difference; it can report spread.

## Adding a row

1. Render the board: `node packages/core/lib/design-render.js render --dir <canvas dir> --out <out> --runtime packages/core/lib/dc-runtime.js`. Copy the frame you want to `frames/` and write its measures (the entries of the render's `measures` for that board and state) to `measures/<id>.json` as `{ board, state, errors, measures }`.
2. Append one line to `labels.jsonl`. Add `dimensions` only for scores you are sure of.
3. `npx jest test/design-critique-corpus` checks the row.

There is no labelling tool (NFR-1). If hand edits keep failing the test, revisit.

## Running the replay

```
node test/design-critique-corpus/replay.js --runs 3 [--model <model>] [--out <file>]
```

It calls `claude -p` once per frame per run (spawned with an argument array, `--allowedTools Read`
so the critic can open the PNG; `--model` is omitted unless given), so it spends model calls.
Per-run scores are written to `--out` (default `design-critique-replay-<time>.json` in the
current directory). The rubric is read from the contract at run time, never copied here.
The exit code is 0 whatever the agreement.

## What the report says

- **Agreement**: of all (good, poor) frame pairs, the share where the good frame's mean score
  (across runs and dimensions, skipping "not judged") is strictly higher. A tie is not a win.
  No cut point. With no good or no poor frame it says "not computable".
- **Per dimension**, only for rows with `dimensions`: mean absolute difference between the label
  and the critic's mean for that dimension, and the share of frames where the rounded mean equals
  the label.
- **Spread**: per frame, the sample standard deviation (n-1) of the frame's mean score across
  runs; "n/a" with one run.

## In the default test battery

This folder is not in the `package.json` ignore lists (those cover `test/discipline-corpus/`,
`test/evals/`, `test/integration/hooks/`), so `replay.test.js` runs in the default battery and in
CI, which gives the design-quality code its coverage. That is right because the test needs no
model and no browser. If the folder were added to the ignore lists, CI would stop running it.

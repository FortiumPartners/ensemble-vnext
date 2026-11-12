# Brief: Stop raw run-record dumps (verification evidence, findings, loop scratch) reaching a product's main branch

Owner ruling, relayed by Forge's PM on 2026-11-11: "Yes on run records. Need to stop that." The
trigger was Forge PR 313. About 105,000 of its 113,700 added lines were raw verification evidence
under `.trd-state/<feature>/evidence/`, and they landed on `main`. This is an interim stop. A fuller
"run records off the product branch" design is separate work (see
`docs/reports/` on branch `docs/run-records-ensemble-side`) and is not built here.

Ensemble's own `.gitignore` already ignores `.trd-state/*/evidence/` and `.trd-state/*/findings/`.
The ignore template that Ensemble writes into products does not. That template is
`packages/core/templates/gitignore-framework.txt`, which `scaffold-project.sh` applies through
`ensure_gitignore`. So every product Ensemble scaffolds commits these files.

## Steps

1. Make an empty git repo. Commit these files in it: `.trd-state/f/evidence/a.png`,
   `.trd-state/f/findings/grounding/x/g.json`, `.trd-state/f/judge-state-1.json`,
   `.trd-state/f/record-state-1.json`, `.trd-state/f/setup-decide-1.json`,
   `.trd-state/f/reverify/evidence/b.png`, `.trd-state/f/reverify/judge-state-1.json`,
   `.trd-state/f/closed.json`, `.trd-state/f/verification-state.json` and
   `.trd-state/f/verification-report.md`.
2. In that repo, run `packages/core/scripts/scaffold-project.sh` (absolute path) with the git-files
   option (double dash `git-files`, then `.`). This is the step `/rebase-project` runs as its §4.7a.
3. Run `git ls-files` and `git ls-files` with the options `-ci` and double-dash `exclude-standard`.

## Expected

- `.gitignore` gains lines for verification evidence, verifier findings (grounding output
  included) and the verification loop's per-iteration scratch files (`judge-*.json`,
  `record-*.json`, `setup-decide-*.json`). The lines cover the feature's state folder and the
  nested `reverify/` and `reverify/retry/` folders that `/verify-build` re-proof writes into.
- Every one of those files that was already tracked is removed from the index only
  (`git rm` with the double-dash `cached` option). The removal is staged, never committed, and the files stay on disk.
- These durable records stay tracked and are not matched by any new line: `closed.json`,
  `shipped.json`, `custody.json`, `verification-state.json`, `implement.json`,
  `artifacts.json`, `success-definition.md`, `verification-report.md`,
  `verification-plan.md`, and the audit reports (`audit-build-report.md` and the
  `audit-*` reports).

## Actual

Reproduced on 2026-11-11 against this checkout. Only the four existing lines are added
(`.trd-state/current.json`, `.trd-state/_dispatch.jsonl`, `.trd-state/*/dispatch.jsonl` and
`.trd-state/_command-runs/`). All ten files stay tracked, and
`git ls-files` with the options `-ci` and double-dash `exclude-standard` prints nothing. Nothing under `evidence/` or `findings/`
is ignored, and no scratch file is ignored either.

Ensemble's own repository has the same gap for the scratch files. Its `.gitignore` has no line
for them, and `git ls-files` shows 300 tracked scratch files: 76 `judge-claims`, 76
`judge-decide`, 76 `judge-state`, 52 `judge-report-input`, 18 `setup-decide`, 1
`record-state` and 1 `record-report-input`. It also tracks 26 files under `evidence/` or
`findings/`, which were committed before or despite the existing lines. Its existing lines
use a single `*`, so they do not reach `reverify/` either.

## Where

- `packages/core/templates/gitignore-framework.txt:1-8`. Add the lines here. The header
  comment (lines 1-4) says per-feature state is "deliberately not listed here, except each
  feature's dispatch log". Rewrite it to name the new exception and its reason: these files are
  bulky per-run scratch, they can be reproduced by re-running the loop, and they hold no
  decision. Then list the durable records that stay tracked.
- `packages/core/scripts/scaffold-project.sh:1778-1812`. This is `ensure_gitignore`. It already
  untracks each template line through a `:(glob)` pathspec, with the index only and the change
  staged. That form honours `**`. It needs no logic change unless a test shows otherwise.
- `packages/core/scripts/scaffold-project.sh:1899-1901`. This is the refresh mode (double-dash `refresh`). By design it calls
  `ensure_gitignore` with no `untrack`, and the comments at 1771-1776 and 1900 say why: refresh
  runs unattended at session start on whatever branch is checked out, and a staged deletion
  there would conflict with sibling branches. So refresh adds the ignore lines and never touches
  the index. Untracking happens on scaffold (line 2022) and on the git-files option (line 2114),
  which `/rebase-project` §4.7a runs (`packages/core/commands/rebase-project.md:1106-1124`). See
  Decisions.
- `.gitignore:73-80` in Ensemble's own repo. Keep it consistent with the template: same lines,
  same `**` depth. Add the three scratch patterns. Untrack the files already tracked here in the
  same change, index only.
- Tests: `packages/core/scripts/scaffold-project.test.sh`, around line 2797. The test there,
  "scaffold writes four ignore lines and three union lines", counts the ignore lines and must
  change. Tests at lines 2831 and 2874 cover untracking and the depth of a line, and are the
  model for the new tests.

Suggested lines. The session may adjust the exact forms if a test shows a better one:

```
.trd-state/**/evidence/
.trd-state/**/findings/
.trd-state/**/judge-*.json
.trd-state/**/record-*.json
.trd-state/**/setup-decide-*.json
```

`**` is needed because `/verify-build` re-proof writes `evidence/` and the scratch files under
`.trd-state/<feature>/reverify/` and `reverify/retry/` (`packages/core/commands/verify-build.md:329-332`).
A single `*` does not cross `/`, so those folders would stay tracked. No durable record's name
starts with `judge-`, `record-` or `setup-decide-`. Confirm this with a test that writes every
durable name above and asserts `git check-ignore` matches none of them.

### Who reads the newly ignored files (checked before writing this brief)

- **Loop scratch** (`judge-*`, `record-*` and `setup-decide-*` JSON). These are written and read
  only inside one verification iteration, by `packages/core/workflows/verify-functional.js`
  (lines 531-534, 803 and 851). The workflow writes a payload, then the checker CLI or
  `implement-state.js` `save()` reads it back straight away. Even a resume does not read them:
  it (double-dash `resume`, with `outcome: null`) rebuilds its snapshot from `verification-state.json`
  (`packages/core/commands/verify-build.md:120` and `:308`, and `implement-trd.md` Step 8.2).
  That file stays tracked. No command, lib or hook reads these files from git or from another
  clone, and the Forge plugin does not either.
- **Findings** (`findings/`, `findings/grounding/**`). Verifier and grounding scratch, read in
  the same run by `trd-grounding.js` and the audit workflows. What survives a run goes into the
  TRD, PRD or audit report, all of which stay tracked. Ensemble already ignores this folder in
  its own repo.
- **Evidence** (`evidence/`). There are three readers, and one of them changes:
  1. A verification report's images are published to claude.ai from the local file
     (`functional-verification.js` around line 1100). They are unaffected wherever the run
     happened.
  2. `custody.js` (`/ship-build`) reads `evidence/criterion-covers.json` and
     `evidence/live-manifest.jsonl` (through `live-evidence.js`) from the working tree, to work
     out which proofs a later change puts in doubt. In the same worktree they are present. In
     another clone they are absent, and custody then treats more criteria as affected and
     re-proves them (`custody.js:441-489`). That costs more, but it can never record a false
     pass.
  3. **Forge's `forge_feature_artifact_image`** (`forge-vnext`, `src/f3/pm/artifacts.ts:438`)
     serves a report's referenced images from the feature's read root: its live worktree, else
     its branch's commit, else the base tip once the feature is complete. Ignored files under
     `.trd-state/` are served from a live worktree. Once the worktree is gone, a done feature's
     evidence images are no longer in git, so this tool returns `ARTIFACT_IMAGE_NOT_FOUND` for
     them. The report text and the published claude.ai artifact still carry the images. This
     means the request's premise ("nothing reads these from git") holds for scratch and
     findings, but not fully for evidence images. See Decisions.

## How to check

Fails now, passes after:

```bash
T=$(mktemp -d) && cd "$T" && git init -q && mkdir -p .trd-state/f/evidence .trd-state/f/findings/grounding/x .trd-state/f/reverify/evidence
for f in evidence/a.png findings/grounding/x/g.json judge-state-1.json record-state-1.json setup-decide-1.json reverify/evidence/b.png reverify/judge-state-1.json closed.json shipped.json custody.json implement.json artifacts.json verification-state.json verification-report.md success-definition.md audit-build-report.md; do echo x > ".trd-state/f/$f"; done
git add -A && git -c user.email=t@t -c user.name=t commit -qm init
bash <repo>/packages/core/scripts/scaffold-project.sh <double-dash>git-files .
git ls-files .trd-state
```

After the fix, `git ls-files .trd-state` lists exactly the nine durable files. Before the fix it
lists all sixteen. `git status` shows the seven scratch and evidence files as staged deletions,
and they are still on disk.

New BATS tests in `packages/core/scripts/scaffold-project.test.sh`:

1. Scaffold writes the new lines, and a second run adds nothing.
2. The git-files option untracks tracked evidence, findings (including `findings/grounding/**`)
   and scratch files at the feature level and under `reverify/` and `reverify/retry/`. It keeps
   them on disk, stages the removal only, and commits nothing.
3. No durable record named above is ignored or untracked.
4. Refresh adds the new lines to an existing `.gitignore` and leaves the index unchanged. This
   pins the existing rule.
5. Update the existing line-count test at line 2797.

Run `bats packages/core/scripts/scaffold-project.test.sh` and the full Jest battery. The
template exists only at `packages/core/templates/` (the script reads it via `TEMPLATES_DIR`), so
there is no copy to regenerate.

## Open questions

None. The three this brief raised are settled below.

Decisions: refresh and untracking: keep refresh index-free; untracking stays with scaffold and the git-files option (`/rebase-project` §4.7a), and a test pins that refresh leaves the index alone (owner, 2026-11-11).
Decisions: Forge evidence images for finished features: accept; ignore all of `evidence/`, and the images stay in the published claude.ai report (owner, 2026-11-11).
Decisions: Ensemble's own repo: add the same lines and untrack the already-tracked scratch, evidence and findings files (index only) in the same change (owner, 2026-11-11).

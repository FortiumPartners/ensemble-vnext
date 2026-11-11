# TRD: fix-ci-chromium-apt-outage

**Source PRD**: None — defect (bug report `docs/plans/fix-ci-chromium-apt-outage/brief.md`, 2026-11-11)

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | An apt-mirror outage can never stop "Run Jest" from running: the Chromium install in the "Jest (hooks)" job is bounded in time, does not depend on apt for the browser itself, and a failed install lets "Run Jest" run anyway | the reproduction below, 2026-11-11 | yes |
| O2 | When Chromium cannot be installed, every non-browser Jest suite still runs and reports, and only the three suites that drive Chromium (`design-render.test.js`, `design-render-walk.test.js`, `design-bundle.test.js`) fail, with a message naming the missing browser — the job ends red, never green (D13 unchanged) | the bug report's expected behaviour and its default-taken decision, 2026-11-11 | yes |
| O3 | On a healthy runner the job still installs Chromium, runs every suite including the three render suites, and finishes well inside its 10-minute limit | the bug report's check 2, 2026-11-11 | |

## Reproduction

### Steps
1. Push to `main` or open a PR, so `.github/workflows/ci.yml` runs.
2. The "Jest (hooks)" job runs `npm ci`, then "Install Chromium for the design render tests":
   `npx playwright install --with-deps chromium`.
3. `--with-deps` runs `apt-get update` and `apt-get install` for nine font packages (every shared
   library is already on `ubuntu-24.04`). Since ~14:15Z 2026-11-11 `azure.archive.ubuntu.com` does
   not resolve, so each fetch waits ~20s and fails, repeatedly.

### Actual
`gh run view 43038564649` [ran 2026-11-11]: "Jest (hooks)" `cancelled`; the install step
`cancelled`; "Run Jest" and the known-failing check `skipped`. The other four jobs `success`. No
Jest test ran. Runs 43031009981 and 43033251963 fail the same way (bug report).

### Expected
The outage costs at most the three browser suites. "Run Jest" runs; non-browser suites report.

### Root cause [ran]
`ci.yml:56-57`: the install step has no step-level `timeout-minutes`, no fallback and no
`continue-on-error`, and `--with-deps` couples the browser download (from Playwright's CDN, which
was reachable) to apt (which was not). The step therefore consumes the whole job-level
`timeout-minutes: 10` (`ci.yml:41`), the job is cancelled, and every later step is skipped. Timings
from the last green run, 43030686653 [ran]: `npm ci` 3s, install 22s, Jest 87s.

## Decision

Split the one install step into three, all in `.github/workflows/ci.yml`'s `jest` job:

1. **Cache** `~/.cache/ms-playwright` with `actions/cache@v4`, keyed on the runner image and the
   *installed* Playwright version (read from `node_modules/playwright/package.json` after `npm ci`),
   so most runs download nothing.
2. **Browser** — `npx playwright install chromium` (no `--with-deps`, so no apt), with one retry,
   `timeout-minutes: 3` and `continue-on-error: true`.
3. **Fonts** — `npx playwright install-deps chromium` (Playwright's own package list, so it stays in
   step with the pinned version), wrapped in `timeout 90`, `timeout-minutes: 2` and
   `continue-on-error: true`. Best-effort: it keeps the healthy-runner environment identical to
   today's, and an outage costs at most 2 minutes.

Budget on an outage: 2 + 3 + ~1.5 (Jest) + ~0.5 (setup) ≈ 7 minutes, inside the unchanged 10.

`continue-on-error` hides the failure on the step's own tick, so a failed install must surface
elsewhere — and it does: the three Chromium suites fail with "Playwright's Chromium is not
installed" (`design-render.js:755`), the job ends red (D13, unchanged). Each install step also
emits a `::warning::` annotation when it fails, so the cause is visible on the run summary.

Rejected: making the render suites skip on a missing browser — reverses D13, out of scope.
Rejected: dropping the font install outright — the byte-for-byte checks in
`design-render.test.js` compare renders from the same run against each other [read: lines 72-163],
so they likely do not depend on the fonts, but that is unproven; keeping a bounded best-effort step
costs nothing on a healthy runner and at most 2 minutes on a broken one.
Rejected: raising the job's `timeout-minutes` — it would only move the cliff.

absorbed: none.
not absorbed: the ShellCheck job also runs `apt-get update && apt-get install shellcheck`
unbounded (`ci.yml:26`) — it passed during the outage and this fix works without touching it; a
finding, not scope.

## Non-Goals

- No change to `design-render.js`, the render tests, or D13's fail-not-skip behaviour.
- No change to the job-level `timeout-minutes: 10`, the `runs-on: ubuntu-24.04` pin, or the
  "Run Jest" command and its comments.
- No change to any other CI job.

## Verification Artifacts

None apply — a CI workflow change with no UI design, no interaction diagram and no rendered data.

## Verification Environment

**Environment**: local
**Refresh**: nothing — tests and libraries read the working tree
**Cannot be checked there**: anything that occurs only on the GitHub Actions runner (verification.md §5) — the cache, the apt outage itself, and the job's wall-clock limit. Those are proven on the fix's PR run (checks 2 and 3 of the bug report).

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | Should a run that cannot install Chromium end green or red? | red — non-browser suites run and report, the three Chromium suites fail (owner's call, default taken in the bug report) | owner-only |

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | In `.github/workflows/ci.yml`'s `jest` job, replace the single `npx playwright install --with-deps chromium` step with: a step that reads the installed Playwright version into a step output; an `actions/cache@v4` step for `~/.cache/ms-playwright` keyed on `runner.os`, the image (`ubuntu-24.04`) and that version; a browser step running `npx playwright install chromium` with one retry, `timeout-minutes: 3`, `continue-on-error: true` and a `::warning::` on failure; a font step running `timeout 90 npx playwright install-deps chromium` with `timeout-minutes: 2`, `continue-on-error: true` and a `::warning::` on failure. Update the comment above the steps to say why. | O1, O2, O3 | None | (a) `actionlint .github/workflows/ci.yml` reports nothing; (b) no step in the `jest` job contains `--with-deps`, and every step before "Run Jest" that can touch the network has its own `timeout-minutes` and `continue-on-error: true` (checked by reading the YAML with a parser, not grep); (c) with `PLAYWRIGHT_BROWSERS_PATH` pointed at an empty temp dir, `npx jest --runInBand --config jest.config.ci.js` fails ONLY suites among the three Chromium suites, each failure naming "Chromium is not installed", and every other suite passes — the local stand-in for check 3; (d) with the browser present, the same command passes all suites — the local stand-in for check 2 |

## Task Grounding

### FIX-001
- **Touches:** `.github/workflows/ci.yml`
- **Reuse:** the existing comment block style at `ci.yml:53-55`, which names DSGN-B003 and D13 — extend it rather than writing a new one [read]. `actions/cache@v4` and `actions/setup-node@v4` already pin `@v4` in this file [read].
- **Replaces:** `ci.yml:56-57`, the one step "Install Chromium for the design render tests" running `npx playwright install --with-deps chromium` [read] — delete it; do not leave it beside the new steps.
- **Follow:** the Decision section: browser and fonts are separate steps, each bounded and `continue-on-error`; the render suites keep failing on a missing browser (D13).
- **Careful:** the "Run Jest" step's long comment (`ci.yml:70-104`) is load-bearing history — leave it untouched, and never add `--testPathIgnorePatterns` (it replaces the config's list). `continue-on-error` makes a failed step look green, so the `::warning::` line is what keeps the cause visible. Playwright reads `PLAYWRIGHT_BROWSERS_PATH`; the cache path `~/.cache/ms-playwright` is its Linux default [inferred]. `actions/cache` saves only on a successful job, so a red outage run never poisons the cache. `timeout` must wrap the `npx` call (not `sudo`), and `install-deps` runs `sudo` itself on Linux [inferred].

## Could Not Verify

- The apt outage, the cache hit, and the job's wall-clock behaviour exist only on the GitHub Actions runner (verification.md §5). They are proven by the fix's PR run (check 2) and the temporary `/etc/hosts` outage simulation (check 3), both at ship time, not by `/implement-trd`'s local verification.
- Whether any render test depends on the nine font packages: inferred not (the byte checks compare renders within one run), and moot while the bounded font step remains; a PR run with fonts absent (check 3) settles it.

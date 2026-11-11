# Brief: An Ubuntu apt-mirror outage cancels the whole Jest CI job before any test runs

## Steps
1. Push to `main` or open a PR against it, so `.github/workflows/ci.yml` runs.
2. The "Jest (hooks)" job (runner `ubuntu-24.04`, `timeout-minutes: 10`) runs `npm ci`, then the step "Install Chromium for the design render tests", which runs `npx playwright install` for chromium with the double-dash `with-deps` option.
3. The `with-deps` option runs `apt-get update` and `apt-get install` for the browser's system packages. On the runner every shared library Chromium needs is already present ("is already the newest version" for libnss3, libgbm1, libatk, libcairo, libpango and the rest); only nine font packages are new (fonts-freefont-ttf, fonts-ipafont-gothic, fonts-tlwg-loma-otf, fonts-unifont, fonts-wqy-zenhei, xfonts-cyrillic, xfonts-encodings, xfonts-scalable, xfonts-utils, 21.1 MB).
4. Since about 14:15Z on 2026-11-11 the runner's apt mirror cannot be resolved, so each fetch waits about 20 seconds and fails, over and over, until the job hits its 10-minute limit.

## Expected
An apt-mirror outage costs at most the browser-dependent tests, never every Jest test. The Chromium install step is bounded in time and does not depend on apt when the runner already has the libraries; if the browser still cannot be installed, the Jest suites that do not need a browser run and report, and only the suites that drive Chromium (`packages/core/lib/design-render.test.js`, `design-render-walk.test.js`, `design-bundle.test.js`) are affected, visibly.

## Actual
The job is cancelled at its 10-minute limit; "Run Jest" and the known-failing check are both `skipped`; no Jest test runs. Run 43038564649 on `main` (4 attempts, last attempt job 130603365988, 15:01:12Z to 15:11:27Z) and run 43031009981 (a re-run of a commit that was previously green) are both cancelled this way; PR run 43033251963 too. The other four CI jobs pass. Log text, job 130603365988:

```
Run npx playwright install (double-dash with-deps) chromium
Err:2 https://security.ubuntu.com/ubuntu noble InRelease
  Temporary failure resolving 'azure.archive.ubuntu.com'
W: Failed to fetch mirror+file:/etc/apt/apt-mirrors.txt/dists/noble/InRelease  Temporary failure resolving 'azure.archive.ubuntu.com'
The following NEW packages will be installed:
  fonts-freefont-ttf fonts-ipafont-gothic fonts-tlwg-loma-otf fonts-unifont ...
Err:2 https://security.ubuntu.com/ubuntu noble/universe amd64 fonts-ipafont-gothic all 00303-21ubuntu1
  Temporary failure resolving 'azure.archive.ubuntu.com'
...
Terminate orphan process: pid (2353) (npm exec playwright install (double-dash with-deps) chromium)
```

## Where
- `.github/workflows/ci.yml:56-57`: the step "Install Chromium for the design render tests", which runs the Playwright install with the `with-deps` option, with no step-level `timeout-minutes` and no fallback.
- `.github/workflows/ci.yml:41`: the job-level `timeout-minutes: 10` that the step consumes entirely.
- `.github/workflows/ci.yml:69-105`: the "Run Jest" step (Jest in band, with config `jest.config.ci.js`), which is skipped when the install step fails or is cancelled.
- Context: `packages/core/lib/design-render.js:670-680` (`launch()`) throws "Playwright's Chromium is not installed: run `npx playwright install chromium`" when the browser is missing, and `packages/core/lib/design-render.test.js:3-4` says a missing browser fails those tests rather than skipping them (decision D13 of the design-stage TRD). That behaviour is intended and stays.

Directions the report offers, any of which may be combined: install the browser binary without the apt step (`npx playwright install chromium`) since the shared libraries are present, optionally attempting the font packages separately with a short bound; give the step its own `timeout-minutes` and a retry; cache the Playwright browser folder (`~/.cache/ms-playwright`, keyed on the installed Playwright version) so most runs download nothing; mark the install `continue-on-error` so "Run Jest" still runs.

## How to check
1. Before the fix: `gh run view 43038564649` shows the "Jest (hooks)" job as cancelled, with "Run Jest" skipped (confirmed 2026-11-11).
2. After the fix, on the fix's PR: `gh run view <the PR's CI run id>` shows "Jest (hooks)" as success, the job finishes inside its 10-minute limit, and "Run Jest" shows a `Tests:` summary including the design render suites.
3. Outage simulation (on the PR branch, temporary, removed before merge): add a step before the install that makes the mirror unresolvable, e.g. `echo "0.0.0.0 azure.archive.ubuntu.com security.ubuntu.com" | sudo tee -a /etc/hosts`. The Jest job must not be cancelled: "Run Jest" runs and every non-browser suite reports; at most the three Chromium suites fail, and the failure names the missing browser or fonts rather than a timeout. Record the run id of the simulation in the PR.

## Open questions
- Owner's call, default taken: whether a run that could not install Chromium should end green or red. Default: red. The non-browser suites still run and report, but the job fails on the three Chromium suites (their existing D13 behaviour, which this fix does not change), so a broken browser install is never mistaken for a pass. Making those suites skip on a missing browser would reverse D13 and is out of scope.
- Settled by probing, not open: without the nine font packages, Chromium still launches on `ubuntu-24.04` because every shared library it needs is already installed. Whether any render test's byte-for-byte check depends on those fonts is not settled by reading; the fix's PR run (check 2, with fonts absent if the chosen fix omits them) settles it, and if it does depend on them the font install stays, bounded.

Decisions: green or red when Chromium cannot be installed: red, non-browser suites still run and report (owner's call, default taken under unattended planning, 2026-11-11).
Decisions: ship path: CLAUDE.md "Shipped" names `.github/workflows/ci.yml` on the push to `main`; the file exists, references no secrets, and this fix touches no migrations. No owner action needed (checked 2026-11-11).

# Functional Success Definition: fix-ci-chromium-apt-outage

**Source**: docs/TRD/fix-ci-chromium-apt-outage.md §Reproduction
**Source kind**: reproduction
**Derived**: 2026-11-11T16:18:20Z
**Criteria**: 7

| ID | Functional statement | Cites | Evidence that would prove it | Derivation | Tier 1 | Parts | Must pass |
|----|----------------------|-------|------------------------------|------------|--------|-------|-----------|
| FS-1 | When the Chromium install step in the "Jest (hooks)" job fails or times out, the "Run Jest" step still runs: no install outcome causes "Run Jest" to be skipped | §Reproduction Expected ("'Run Jest' runs"); §Reproduction Actual ("'Run Jest' ... skipped"); §Reproduction Root cause (install step has "no fallback and no `continue-on-error`", "every later step is skipped") | Transcript of a script that parses `.github/workflows/ci.yml` and prints, for the "Jest (hooks)" job, each step's name with its `continue-on-error`, `if:` and `timeout-minutes` values, showing that a failed install step does not gate "Run Jest" (the install step carries `continue-on-error: true`, or "Run Jest" carries an `if:` that runs after a failed step); plus `actionlint .github/workflows/ci.yml` exiting 0. The runner itself cannot be exercised from here; the static proof is what is reachable | [read] | locator | | O1 |
| FS-2 | The Chromium install is bounded in time by a step-level limit that leaves room, inside the job-level timeout, for `npm ci` and "Run Jest" to complete | §Reproduction Root cause ("no step-level `timeout-minutes`"; the step "consumes the whole job-level `timeout-minutes: 10` (`ci.yml:41`), the job is cancelled"; last green run timings `npm ci` 3s, Jest 87s) | Same parse transcript as FS-1, showing the install step(s) carry a step-level `timeout-minutes` and the job-level `timeout-minutes`, with the arithmetic written out: install bound(s) + 3s (`npm ci`) + 87s (Jest) is less than the job-level limit | [read] | locator | | O1 |
| FS-3 | Downloading the Chromium browser itself does not depend on apt: an unreachable apt mirror cannot stop or delay the browser download | §Reproduction Root cause ("`--with-deps` couples the browser download (from Playwright's CDN, which was reachable) to apt (which was not)"); §Reproduction Steps 3 ("every shared library is already on `ubuntu-24.04`") | Parse transcript of the "Jest (hooks)" job showing the command that downloads Chromium does not carry `--with-deps`, and that any apt / system-dependency work runs in a separate, separately bounded step | [read] | locator | | O1 |
| FS-4 | With Chromium unavailable, every Jest suite that does not drive a browser runs and reports its result | §Reproduction Expected ("non-browser suites report"); §Reproduction Actual ("No Jest test ran") | Transcript of the CI Jest invocation (`npx jest` with the CI config the workflow uses) run locally with Playwright pointed at an empty browser directory (e.g. `PLAYWRIGHT_BROWSERS_PATH` set to an empty folder), ending in the "Test Suites:" summary line, with every non-browser suite listed as PASS | [read] | locator | | O2 |
| FS-5 | With Chromium unavailable, at most three suites fail, and every suite that fails is one that drives the browser | §Reproduction Expected ("The outage costs at most the three browser suites") | The FS-4 transcript's FAIL lines and "Test Suites: N failed" count, with N at most 3, each failing suite shown (by reading its source) to launch Chromium | [read] | locator | | O2 |
| FS-6 | With Chromium unavailable, the "Jest (hooks)" job ends failed, never green: the browser suites' loss is reported, not hidden by the install's fallback | §Reproduction Expected ("The outage costs at most the three browser suites" — those suites are lost, not passed); domain-derived: tolerating the install failure must not also tolerate the test failure, or an outage-day run reports green with the design render suites never exercised | The FS-4 run's exit code (non-zero) recorded in its transcript; and the FS-1 parse transcript showing "Run Jest" carries no `continue-on-error` (so a Jest failure fails the job) | [read] | locator | | O2 |
| FS-7 | When a browser suite fails because Chromium is missing, its failure message names the missing browser, so an outage-day red run is distinguishable from a render regression | domain-derived: the source exists because a CI failure had to be diagnosed by hand (three failing runs before the root cause was found); a browser-suite failure that does not say the browser is missing will be debugged as a render bug | The FS-4 transcript's failure output for each failing browser suite, containing text that names the missing Chromium / browser executable | domain-derived | locator | | O2 |

**Must-pass coverage.** O1 is covered by FS-1, FS-2 and FS-3; O2 by FS-4 through FS-7. FS-7
rests on domain reasoning, not on a line of the reproduction: the source's Expected line says
which suites may be lost, not what their failure must say. If the owner does not hold that
reasoning, drop FS-7 and the "message naming the missing browser" clause of O2 is uncovered.

**Not verifiable here, stated up front.** Every criterion is about the GitHub Actions
runner, which this machine cannot exercise (`verification.md` §5). FS-1, FS-2, FS-3 and
FS-6 are proven statically from the workflow file; FS-4, FS-5, FS-6 and FS-7 are proven by
running the CI Jest invocation locally with the browser absent. A green CI run on `main`
during a real apt outage is the only end-to-end proof, and it is not obtainable here.

**Considered and not made criteria.** The other four CI jobs succeeded in the failing runs
(Actual) and nothing asks that they change. The "known-failing check" step was skipped in the
failing runs (Actual), but the Expected line asks only that "Run Jest" runs, so whether that
step runs during an outage is not a criterion. The nine font packages `--with-deps` installs
(Steps 3) are not required by anything in Expected.

# Functional Verification Report: fix-ci-chromium-apt-outage

**Source PRD**: docs/TRD/fix-ci-chromium-apt-outage.md § Reproduction
**Success definition**: .trd-state/fix-ci-chromium-apt-outage/success-definition.md
**Outcome**: Must-Pass Unproven (no full-environment run declared)
**Reason**: must-pass criteria not proven: FS-5 — the core was not shown to work
**Criteria**: 7 total — 6 met, 0 not met, 1 not verifiable, 0 unbuilt
**Coverage**: 6 of 7 proven — uncovered: FS-5
**Must pass**: 6 of 7 proven — unproven: FS-5 (not verifiable)
**Diagnosis**: 1 open — 1 capability absent
**Next**: refine the plan with `/refine-verification` (add `--auto` to let an agent answer), then run `/verify-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | When the Chromium install step in the "Jest (hooks)" job fails or times out, the "Run Jest" step still runs: no install outcome causes "Run Jest" to be skipped | .trd-state/fix-ci-chromium-apt-outage/evidence/it2-parse.txt | 2 |
| FS-2 | The Chromium install is bounded in time by a step-level limit that leaves room, inside the job-level timeout, for `npm ci` and "Run Jest" to complete | .trd-state/fix-ci-chromium-apt-outage/evidence/it2-arith.txt | 2 |
| FS-3 | Downloading the Chromium browser itself does not depend on apt: an unreachable apt mirror cannot stop or delay the browser download | .trd-state/fix-ci-chromium-apt-outage/evidence/it2-parse.txt | 2 |
| FS-4 | With Chromium unavailable, every Jest suite that does not drive a browser runs and reports its result | .trd-state/fix-ci-chromium-apt-outage/evidence/it1-nobrowser.txt | 1 |
| FS-6 | With Chromium unavailable, the "Jest (hooks)" job ends failed, never green: the browser suites' loss is reported, not hidden by the install's fallback | .trd-state/fix-ci-chromium-apt-outage/evidence/it1-nobrowser.txt | 2 |
| FS-7 | When a browser suite fails because Chromium is missing, its failure message names the missing browser, so an outage-day red run is distinguishable from a render regression | .trd-state/fix-ci-chromium-apt-outage/evidence/it1-nobrowser.txt | 1 |

## Not Met

_None._

## Not Verifiable

| ID | Statement | Reason |
|----|-----------|--------|
| FS-5 | With Chromium unavailable, at most three suites fail, and every suite that fails is one that drives the browser | Literal count not observable here: 8 suites fail locally, 5 for local reasons regardless of Chromium (Node version vs mock-fs, sandboxed /tmp chmod, custody flake). The differential shows only the three browser suites (design-bundle, design-render, design-render-walk) depend on Chromium. A clean count needs the CI runner, which verification.md section 5 says cannot be reproduced here. |


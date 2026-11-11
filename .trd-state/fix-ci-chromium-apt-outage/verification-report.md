# Functional Verification Report: fix-ci-chromium-apt-outage

**Source PRD**: docs/TRD/fix-ci-chromium-apt-outage.md § Reproduction
**Success definition**: .trd-state/fix-ci-chromium-apt-outage/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 7 total — 7 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 7 of 7 proven — uncovered: none
**Must pass**: 7 of 7 proven
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | When the Chromium install step in the "Jest (hooks)" job fails or times out, the "Run Jest" step still runs: no install outcome causes "Run Jest" to be skipped | .trd-state/fix-ci-chromium-apt-outage/evidence/it2-parse.txt | 2 |
| FS-2 | The Chromium install is bounded in time by a step-level limit that leaves room, inside the job-level timeout, for `npm ci` and "Run Jest" to complete | .trd-state/fix-ci-chromium-apt-outage/evidence/it2-arith.txt | 2 |
| FS-3 | Downloading the Chromium browser itself does not depend on apt: an unreachable apt mirror cannot stop or delay the browser download | .trd-state/fix-ci-chromium-apt-outage/evidence/it2-parse.txt | 2 |
| FS-4 | With Chromium unavailable, every Jest suite that does not drive a browser runs and reports its result | .trd-state/fix-ci-chromium-apt-outage/evidence/it1-nobrowser.txt | 1 |
| FS-6 | With Chromium unavailable, the "Jest (hooks)" job ends failed, never green: the browser suites' loss is reported, not hidden by the install's fallback | .trd-state/fix-ci-chromium-apt-outage/evidence/it1-nobrowser.txt | 2 |
| FS-7 | When a browser suite fails because Chromium is missing, its failure message names the missing browser, so an outage-day red run is distinguishable from a render regression | .trd-state/fix-ci-chromium-apt-outage/evidence/it1-nobrowser.txt | 1 |
| FS-5 | With Chromium unavailable, at most three suites fail, and every suite that fails is one that drives the browser | .trd-state/fix-ci-chromium-apt-outage/evidence/it3-fs5-nobrowser.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._


## Fix run

| Round | Tasks promoted | Criteria closed | Still open |
|-------|-----------------|------------------|-------------|
| 1 | 0 | 1 | 0 |

_None still open._


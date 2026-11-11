# Verification plan: fix-ci-chromium-apt-outage

**Written**: 2026-11-11T17:10:00Z by /refine-verification --auto
**From run**: must-pass unproven at 6/7, report `.trd-state/fix-ci-chromium-apt-outage/verification-report.md`
**Agreed with**: derived from the evidence; no open items. The one open criterion (FS-5) was reclassified from "capability absent" to buildable by a probe run during this command (below); R1 is a fallback ruling taken by the agent.

## Diagnosis

The fix is not in question: 6 of 7 criteria proven, nothing failed. FS-5 ("with Chromium unavailable, at most three suites fail, and every one that fails drives the browser") was left open because the local browser-absent run failed 8 suites, not 3. The verifier read the 5 extra failures as "needs the CI runner". A probe on 2026-11-11 shows they are this checkout's environment, not the runner:

- `packages/core/hooks/status.test.js` fails under Node 26.12 (mock-fs) and **passes under Node 22** (`/opt/homebrew/opt/node@22/bin`); CI runs Node 20.
- The three `packages/skills/{ship,design,verification}-setup/__tests__/skill-md.test.js` suites fail with `cp: chmod: Operation not permitted` because this worktree's directories are setgid, group `devteam` (shared-access ACL setup), and `cp -RL` cannot carry that bit into a copy. In a **fresh `git clone` of the same commit** (normal modes) all three **pass**.
- `packages/core/lib/custody.test.js` is the known flake on all-digit commit hashes (CLAUDE.md, 4.17.3 known-open).

So a clean count is reachable locally.

## Blockers
none

## Slices
| Order | Slice | Criteria |
|-------|-------|----------|
| 1 | Re-run the browser-absent Jest in a clean environment: `git clone` HEAD into the scratchpad (link or install `node_modules`), put Node 22 first on PATH, set `PLAYWRIGHT_BROWSERS_PATH` to an empty dir, run `npx jest --runInBand --config jest.config.ci.js`; record the FAIL lines and the "Test Suites:" line, and show each failing suite launches Chromium. If only `custody.test.js` fails beyond the three browser suites, re-run that suite alone up to 3 times (R1) | FS-5 |

## Owner rulings
| ID | Ruling | Written into |
|----|--------|--------------|
| R1 | OWNER-CALL — decided by: agent (--auto). Question: does a failure of the known-flaky `custody.test.js` (fails on all-digit commit hashes, unrelated to Chromium) count against FS-5's "at most three suites fail"? Decision: no, provided it passes when re-run alone (up to 3 tries) in the same browser-absent environment; a failure that persists counts. Reasoning: the flake is recorded as known-open in CLAUDE.md and does not touch a browser; FS-5's purpose is that the outage costs only the browser suites. If FS-5 still cannot be proven after slice 1, the two ways out are: declare an environment that reaches the CI runner via `/verification-setup` (verification.md is owner-governed), or remove the must-pass marking from O2 in the TRD's Objectives table. | this plan only |

## Accepted as not verifiable
none

## Extra checks
| Skill | Inputs |
|-------|--------|
| none | |

## Stop rule
max-rounds: 3
stop-when-closed-below: 1
always: stop when nothing is left to build

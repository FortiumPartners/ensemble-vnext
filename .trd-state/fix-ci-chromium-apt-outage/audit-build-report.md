VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked; no single local run shows every suite passing with Chromium present (acceptance check d); runner-only behaviour (the 10-minute budget on a healthy runner, cache, apt outage, ::warning:: annotations) is unproven until the PR run; acceptance check (b) is worded more broadly than the Decision and the code follow it.

# Audit report: fix-ci-chromium-apt-outage

- Date: 2026-11-11
- Audited commit: b51c4ce83e5a643c73b1fa0a83a7002dbfd9051e
- TRD: docs/TRD/fix-ci-chromium-apt-outage.md
- PRD: none
- Findings: 9 · applied: 6 · rejected: 1 · still unverified: 3 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/fix-ci-chromium-apt-outage.md    PRD: none

VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked; no single local run shows every suite passing with Chromium present (acceptance check d); runner-only behaviour (the 10-minute budget on a healthy runner, cache, apt outage, ::warning:: annotations) is unproven until the PR run; acceptance check (b) is worded more broadly than the Decision and the code follow it.

Audit coverage: 5 of 5 verifiers reported, 12 requirements and 1 task indexed. No PRD was supplied, so checking the fix against the bug report (docs/plans/fix-ci-chromium-apt-outage/brief.md) was not done. This audit checked only the TRD against the code.

TRACEABILITY GAPS
- "Every suite passes with the browser present" (FIX-001 acceptance check d). The two browser-present runs pass all three render suites but fail 4 unrelated suites: status.test.js and three setup-skill tests, failing the same way before the change (evidence/before-d-browser.txt and after-d-browser.txt, both "4 failed, 92 passed"). Those failures come from the local sandbox ("cp: chmod ... Operation not permitted"). The clean-clone run passes all 93 non-browser suites but had no browser. No single run shows 96 of 96. FIX-001 covers this, so it goes to /implement-trd --reconcile: rerun check (d) in a clean clone with Chromium installed.
- On a healthy runner, the job still installs Chromium, runs every suite and stays inside 10 minutes (objective O3). Built in ci.yml lines 77-98. The only proof is a sum of the step time caps: 450 s against the 600 s job limit. The real proof is the fix's PR run on GitHub. FIX-001 covers it; it goes to /implement-trd --reconcile and stays in Could Not Verify until the PR run.

MISMATCH
- Acceptance check (b) says "every step before Run Jest that can touch the network" needs its own timeout-minutes and continue-on-error. checkout (ci.yml:43), setup-node (:44) and npm ci (:52) have neither. The code is right and the wording is wrong. The Decision bounds only the cache, browser and font steps, and the file's standing rule (ci.yml:47-51) says an npm ci failure must stay a hard failure. Applying the wording literally would let CI go green with broken dependencies. This goes to /implement-trd --reconcile, where the fix is to narrow the check's wording through /amend. The code should not change. I did not edit it because it states a requirement.

UNTESTED-IN-PRACTICE
- The ::warning:: fallback on a failed install (from decision DEC-1). Both echo lines are in ci.yml (lines 92 and 98), but no run ever hit them. The evidence parsers (check-b.js, it2-parse.js) check only the timeouts and continue-on-error. The repo's test tree has no standing check of ci.yml's structure. FIX-001 covers it; it goes to /implement-trd --reconcile.

FIXED THE CITATION (TRD text that describes the code, corrected in place)
- Reuse note: the comment block is ci.yml:53-56, not 53-55 (the task IDs are on line 56).
- Replaces note: ci.yml:56-57 was the old install step on main. It is now deleted, and its replacements sit at ci.yml:70-98.
- Careful note: the Run Jest comment is now at ci.yml:111-145, with a block above the step at 99-109. 70-104 was its place on main.
- Root cause: ci.yml:56-57 now says it refers to main before the fix.
- Decision: the outage budget sum now includes the 1-minute cache cap: 1+3+2+~1.5+~0.5 ≈ 8 minutes, was "≈ 7". It is still inside the 10-minute limit.

REJECTED THESE FINDINGS
- stack.md does not list Playwright as a library. The gap is real, but this change did not cause it: main's package.json line 8 already carries "playwright": "^1.60.0" (added under DSGN-B003), and this branch adds no dependency. If the owner wants stack.md updated, that is their edit to an owner-governed file, separate from this feature.

NO ACTION — 8 of 12 indexed requirements are implemented, tested and sourced. These include O1 and O2 (both must-pass), shown by evidence/it3-fs5-nobrowser.txt: only the 3 Chromium suites fail, and 93 of 96 pass.

Could Not Verify in the TRD was rewritten. It now lists: runner-only behaviour, which is proven at ship time; the font-package question, which was not checked; and validation against the bug report, which was not checked because no PRD was supplied.

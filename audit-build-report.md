VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked; no test pins `--publish` being passed on when one command chains another (plan, verify-build and audit-build into implement-trd); no test pins the `--url ""` link-clearing for most publishing commands; docs/reference/authoring.md still says the audit-prd/audit-trd reports are never published

# Audit report: publish-artifacts-per-kind

- Date: 2026-11-16
- Audited commit: 1c42ec29db315a180ae296fc8608651eef4c9b06
- TRD: docs/TRD/publish-artifacts-per-kind.md
- PRD: none
- Findings: 7 · applied: 6 · rejected: 1 · still unverified: 3 · verifiers reporting: 5/5

AUDIT-BUILD: docs/TRD/publish-artifacts-per-kind.md    PRD: none

VERDICT: proceed with these caveats: no source supplied — fidelity and omission unchecked; no test pins `--publish` being passed on when one command chains another (plan, verify-build and audit-build into implement-trd); no test pins the `--url ""` link-clearing for most publishing commands; docs/reference/authoring.md still says the audit-prd/audit-trd reports are never published

Coverage: 5 of 5 verifiers reported. No PRD was supplied, so I could not check the delivered code against product requirements. I checked it against this TRD only (17 requirements, 6 tasks). I re-ran the feature's four Jest suites (artifacts.test.js, publish-switch-prose.test.js, design-commands.test.js, verify-command-surface.test.js): 541 of 541 tests pass. The vendored `.claude/` copies of the commands, artifacts.js, the design contract and command-status.md are identical to their packages/core sources, and `.claude/settings.json` still ships `"publishArtifacts": true`.

TRACEABILITY GAPS
- Nothing tests that `--publish` is passed on through a chain (IC-6). plan.md:1123/1167, verify-build.md:696/736 and audit-build.md:148/328 all append the flag, but tests only check argument-hint strings, so a chain that dropped it would fail no test. Covered by FIX-002, so this goes to /implement-trd --reconcile.
- Nothing tests that a switched-off kind clears its stored link with `--url ""` (IC-5), except in audit-prd, audit-trd, implement-trd §9.0a and refine-verification. The wording is present in create-prd, refine-prd, create-trd, refine-trd, plan, verify-build, task, audit-build and the design contract, but those could lose it with no test failing. Covered by FIX-002 and FIX-003, so this goes to /implement-trd --reconcile. One correction to the finding: audit-docs records no artifacts.json entry at all, so `--url ""` does not apply there.

MISMATCH
- The FIX-005 docs task left three stale passages in docs/reference/authoring.md. Line 77 says "the audit reports are never published and record `url: ""`", line 81 says "The audits publish no artifact", and the step 8 row at line 278 says "Nothing is published". The code now does the opposite: audit-prd.md:149-165 and audit-trd.md:137-153 publish on `--publish`. The audit counts this as a note, not a defect, so it is not handed to /implement-trd --reconcile; it is a docs file, not the TRD, so this audit cannot edit it either. It needs a separate three-line docs fix.

FIXED THE CITATION (in docs/TRD/publish-artifacts-per-kind.md, descriptive text only)
- Source pointer (line 4): the roadmap exists, but only on `main` (commit bf2cf062, made after this branch was cut). The TRD now says so and gives the `git show main:` path.
- `design-system.md:97` is now `:98`, the line that names the `design-system` kind.
- Line numbers that moved when FIX-002 edited the files: create-prd 841, refine-trd 284, refine-prd 250, plan 1262, implement-trd 2402-2475, audit-build 426-449, verify-build 807-848, task 160-173, audit-docs 133-149, audit-prd 149-165, audit-trd 137-153. After item 5 now cites refine-verification.md:285 for the never-published convention and notes that audit-prd/audit-trd used it only before this change.
- I re-pinned two more moved citations while checking, though no finding raised them: scaffold-project.sh:1651 is now :1656, and scaffold-project.test.sh:2683-2700 is now 2713-2730.

REJECTED THESE FINDINGS
- None outright. IC-5's evidence list was partly wrong, as noted above (audit-docs.md:133-149 has no record step).

NO ACTION
- The rest of FIX-001 to FIX-006 is implemented and tested: the resolver and its CLI, the guard test, the design contract, the scaffold false-survives and object-survives tests, and the vendored refresh.

Could Not Verify, rewritten:
- Removed: the "refresh is how this repo updates its own `.claude/`" entry. `diff -r` now confirms the vendored copies match their sources.
- Kept: the live Artifact publish, which was out of scope by the TRD's own Verification Environment.
- Added: PRD fidelity was unchecked because there is no source.
- Added: no live model run showed a command following its prose.

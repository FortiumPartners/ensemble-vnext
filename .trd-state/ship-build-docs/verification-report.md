# Functional Verification Report: ship-build-docs

**Source PRD**: docs/TRD/ship-build-docs.md § Intended Change
**Success definition**: .trd-state/ship-build-docs/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 12 total — 12 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 12 of 12 proven — uncovered: none
**Must pass**: 8 of 8 proven
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | A new guide exists that did not exist at the base, and it describes both `/ship-build` and `/ship-setup` | .trd-state/ship-build-docs/evidence/diff-name-status.txt | 1 |
| FS-2 | Every factual claim the new guide makes about `/ship-build` and `/ship-setup` (command names, flags, file paths, setting names, step behaviour) matches the code on `main`, not the TRD | .trd-state/ship-build-docs/evidence/guide-claims-table.md | 1 |
| FS-3 | The new guide does not say that listing a `merge` (or any outward) step in `ship.md` is by itself authorization to run it; wherever it addresses authorization, it agrees with `isAuthorized()` — outward steps are refused unless `autonomy.md` carries the standing-authorization sentence, or the step is `open-pr` with `ensemble.openPullRequest: auto` | .trd-state/ship-build-docs/evidence/guide-claims-table.md | 1 |
| FS-4 | The guides index has an entry that names `/ship-build` and `/ship-setup` and links to the new guide | .trd-state/ship-build-docs/evidence/diff-guides-readme.txt | 1 |
| FS-5 | The quick reference carries a row (or rows) naming `/ship-build` and `/ship-setup`, pointing at the new guide | .trd-state/ship-build-docs/evidence/diff-quick-reference.txt | 1 |
| FS-6 | The README's line about these features points at the new guide | .trd-state/ship-build-docs/evidence/diff-root-readme.txt | 1 |
| FS-7 | The `/ship-build` entry in `.claude/rules/process.md` no longer says a `merge` step is a standing go, and states the authorization rule as `isAuthorized()` applies it: an `outward: yes` step is refused unless `autonomy.md` contains the sentence "A step listed in `.claude/rules/ship.md` is the owner's standing authorization for that act.", the one exception being `open-pr` with `ensemble.openPullRequest: auto` | .trd-state/ship-build-docs/evidence/fs-7-process-vs-isauthorized.txt | 2 |
| FS-8 | The `/ship-build` entry in the `process.md` template (the template S2 says carries the same entry) meets the same statement as FS-7 | .trd-state/ship-build-docs/evidence/diff-process-template.txt | 1 |
| FS-9 | The sentence "A `merge` step is your standing go for `gh pr merge`" appears in no documentation file on the branch — not `process.md`, its template, `README.md`, `CLAUDE.md`, or any guide | .trd-state/ship-build-docs/evidence/standing-go-grep.txt | 1 |
| FS-10 | The change is documentation only: no code, script, hook, library, workflow or test file differs from the base, and `ship-sequencer.js` is byte-identical to the base | .trd-state/ship-build-docs/evidence/doc-only-check.txt | 1 |
| FS-11 | `.claude/rules/autonomy.md` (and the template it is generated from, if any) is unchanged, so the standing-authorization sentence was not added to make the old claim true | .trd-state/ship-build-docs/evidence/autonomy-unchanged.txt | 1 |
| FS-12 | `.claude/rules/constitution.md` and `.claude/rules/stack.md` are unchanged | .trd-state/ship-build-docs/evidence/constitution-stack-unchanged.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._


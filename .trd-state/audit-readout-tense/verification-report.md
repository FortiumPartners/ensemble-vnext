# Functional Verification Report: audit-readout-tense

**Source PRD**: docs/TRD/audit-readout-tense.md ## Intended Change
**Success definition**: .trd-state/audit-readout-tense/success-definition.md
**Outcome**: Satisfied
**Reason**: All 12 criteria met. The one gap from iteration 1 — /audit-build's citation heading still reading as an imperative — was fixed by the Debug stage and re-verified here.
**Criteria**: 12 total — 12 met, 0 not met, 0 not verifiable, 0 unbuilt

## Met

| ID | Statement | Artifact |
|----|-----------|----------|
| FS-1 | When an audit deletes something because nothing in the source asks for it, the readout labels it DELETED, never the imperative DELETE | .trd-state/audit-readout-tense/evidence/FS-1.txt |
| FS-2 | When the audit lowers a value to the constitution floor because no reason was given for exceeding it, the readout reads 'LOWERED TO THE CONSTITUTION FLOOR — no reason was given for exceeding it'; when a reason WAS given, no finding of this kind is raised | .trd-state/audit-readout-tense/evidence/FS-2.txt |
| FS-3 | When the audit restores something in the source but missing from the document, the readout labels it ADDED BACK, never the imperative ADD BACK | .trd-state/audit-readout-tense/evidence/FS-3.txt |
| FS-4 | When the audit fixes a citation whose referenced ID does not resolve, the readout labels it FIXED THE CITATION, never the imperative FIX THE CITATION | .trd-state/audit-readout-tense/evidence/FS-4.txt |
| FS-5 | When the audit corrects a stale claim in favour of what the code does, the readout labels it CORRECTED A STALE CLAIM, never the assertion THE DOC IS STALE | .trd-state/audit-readout-tense/evidence/FS-5.txt |
| FS-6 | A task judged unbuildable-as-written renders as one of two distinct headings — 'REDESIGNED — could not be built as written' or 'CANNOT BE BUILT — needs a design decision' — never the single undifferentiated CANNOT BE BUILT AS WRITTEN | .trd-state/audit-readout-tense/evidence/FS-6.txt |
| FS-7 | A contradiction still renders as the imperative 'PICK ONE — these contradict', unchanged | .trd-state/audit-readout-tense/evidence/FS-7.txt |
| FS-8 | A finding asking whether something is actually wanted still renders as the imperative CONFIRM THESE ARE WANTED, unchanged | .trd-state/audit-readout-tense/evidence/FS-8.txt |
| FS-9 | In /audit-prd specifically, a requirement found already implemented still renders as the imperative ALREADY BUILT, unchanged | .trd-state/audit-readout-tense/evidence/FS-9.txt |
| FS-10 | This change adds no new heading that groups multiple finding types under a single umbrella label — the heading count is unchanged except for the one split named in FS-6 | .trd-state/audit-readout-tense/evidence/FS-10.txt |
| FS-11 | For the unchecked-claims finding, the readout reuses the spelling the clean path already emits — CAVEAT — and points at the document's own ## Could Not Verify section rather than reprinting it | .trd-state/audit-readout-tense/evidence/FS-11.txt |
| FS-12 | Across every finding type, a heading describing something the audit already did reads in past tense, and a heading describing something only the owner can decide stays imperative | .trd-state/audit-readout-tense/evidence/FS-12.txt |

## Not Met

_None._

## Not Verifiable

_None._


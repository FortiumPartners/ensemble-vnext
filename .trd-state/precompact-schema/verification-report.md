# Functional Verification Report: precompact-schema

**Source PRD**: docs/TRD/precompact-schema.md §Reproduction
**Success definition**: .trd-state/precompact-schema/success-definition.md
**Outcome**: Satisfied
**Reason**: 4 of 5 criteria met against fresh evidence; FS-4 not verifiable in this environment (needs a real platform compaction)
**Criteria**: 5 total — 4 met, 0 not met, 1 not verifiable, 0 unbuilt

## Met

| ID | Statement | Artifact |
|----|-----------|----------|
| FS-1 |  | .trd-state/precompact-schema/evidence/fs-exit.txt |
| FS-2 |  | .trd-state/precompact-schema/evidence/fs-keys.json |
| FS-3 |  | .trd-state/precompact-schema/evidence/fs-keys.json |
| FS-5 |  | .trd-state/precompact-schema/evidence/fs-archive.md |

## Not Met

_None._

## Not Verifiable

| ID | Statement | Reason |
|----|-----------|--------|
| FS-4 |  | requires a real platform compaction, which cannot be triggered on demand in this environment; marked at the 8.4a preflight rather than after spending iterations |


# Functional Verification Report: rebase-governance-and-agent-diff

**Source PRD**: docs/TRD/rebase-governance-and-agent-diff.md ## Reproduction
**Success definition**: .trd-state/rebase-governance-and-agent-diff/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 5 total — 5 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 5 of 5 proven — uncovered: none
**Must pass**: 4 of 4 proven
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | Every list of governance files in `packages/core/commands/rebase-project.md` names all four files: `constitution.md`, `stack.md`, `process.md` and `verification.md`. No list names the first three and leaves out `verification.md`. That covers the usage header, the goals list, the end of §4.7, the "Files Preserved" report template and the Notes, plus any other governance list in the file | .trd-state/rebase-governance-and-agent-diff/evidence/FS-1.txt | 1 |
| FS-2 | `rebase-project.md` names the framework rules it replaces explicitly, as exactly `async-discipline.md`, `autonomy.md` and `command-status.md`. It no longer defines them by example ("`async-discipline.md`, `autonomy.md`, …") or as "every `.md` file in the template rules directory". So nothing in its text puts `verification.md` among the rules that get replaced when they differ | .trd-state/rebase-governance-and-agent-diff/evidence/FS-2.txt | 1 |
| FS-3 | A rebase of a project whose owner has filled in `.claude/rules/verification.md` leaves that file byte-for-byte unchanged, even though it differs from the template copy | .trd-state/rebase-governance-and-agent-diff/evidence/FS-3.txt | 1 |
| FS-4 | Run against an unmodified project, `/rebase-project` reports 0 agents as updated. This holds even though every vendored agent carries the generated `skills:` frontmatter list and the `ENSEMBLE:SKILLS:BEGIN … END` section, which the plugin's copies never carry | .trd-state/rebase-governance-and-agent-diff/evidence/FS-4.txt | 1 |
| FS-5 | When a plugin agent's shipped text changes outside the `skills:` list and the `ENSEMBLE:SKILLS` section, `/rebase-project` reports that agent as updated. Ignoring the generated skill content must not hide a real change | .trd-state/rebase-governance-and-agent-diff/evidence/FS-5.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._


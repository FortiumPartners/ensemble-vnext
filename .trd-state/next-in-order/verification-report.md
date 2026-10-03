# Functional Verification Report: next-in-order

**Source PRD**: docs/TRD/next-in-order.md ## Intended Change
**Success definition**: .trd-state/next-in-order/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 7 total — 7 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 7 of 7 proven — uncovered: none
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | The readout rule defines NEXT as the steps the owner takes, in order, numbered when there is more than one, or "nothing — this is done"; a step that is an action rather than a command is a plain line that keeps its place in the order; each slash command sits alone in its own fenced block directly under its line. This holds in both `.claude/rules/command-status.md` and its shipped template copy `packages/core/templates/claude-directory/rules/command-status.md` | .trd-state/next-in-order/evidence/fs1-iter2.txt | 2 |
| FS-2 | The readout rule no longer says "the literal next command", and states that NEXT is never a menu of alternatives and never a shell command | .trd-state/next-in-order/evidence/fs1-3-rule-grep.txt | 1 |
| FS-3 | The readout rule keeps NEXT short: only the steps to take now (usually one to three), never a long checklist | .trd-state/next-in-order/evidence/fs1-3-rule-grep.txt | 1 |
| FS-4 | `/implement-trd`'s readout section (§9) states NEXT as ordered steps with each slash command in its own fenced block, and no longer instructs "the single next command" or "name ONE" | .trd-state/next-in-order/evidence/fs4-6-next-excerpts.txt | 1 |
| FS-5 | `/verify-build`'s readout states NEXT as ordered steps with each slash command in its own fenced block; its O4 rule still decides which commands, and a step that must come first (a merge, a deploy) is written first as a plain line | .trd-state/next-in-order/evidence/fs4-6-next-excerpts.txt | 1 |
| FS-6 | No NEXT passage in /audit-build, /close-feature, /implement-trd or /verify-build tells the owner to run gh pr merge, gh pr create, git add or git commit; each such step is said in words (a PR open: merge PR #<number> once reviewed, as a plain first step). git add / git commit remain only where the command runs its own commit (git stash hints and stop messages are out of scope for this change) | .trd-state/next-in-order/evidence/fs6-gh-git-grep.txt | 1 |
| FS-7 | The project's Jest battery still passes after the four command files and the rule are edited | .trd-state/next-in-order/evidence/fs7-jest.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._


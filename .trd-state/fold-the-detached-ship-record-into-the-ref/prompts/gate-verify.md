<phase_verification phase="1">
  <tasks>FIX-001, FIX-002, FIX-003, FIX-004, FIX-005, FIX-006</tasks>
  <acceptance_criteria>
FIX-001: npx jest packages/core/lib/record-ref.test.js passes with new cases: a write adds shipped.json beside the tip's existing files and record.json carries the given branch, not the checked-out one; git status --porcelain is empty afterwards; a tip naming another feature is refused and the ref is unchanged; with a bare origin the ref is pushed
FIX-002: covered by FIX-003 and FIX-004's acceptance; ship-record-dir.js requires neither ship-sequencer.js nor custody.js
FIX-003: npx jest packages/core/lib/ship-sequencer.test.js passes with: a merged record puts shipped.json (detached, with work.branch and work.forge_feature_id) on the ref and no <common>/ensemble/ship/ folder exists; a fixture detached folder with no ref is read by status and resumed by start --resume, and its next save lands on the ref; (d) a plain start with a parked run on the ref begins a new run whose startedAt differs, with the ref's other files restored; existing cases updated only where they asserted the old folder
FIX-004: npx jest packages/core/lib/custody.test.js passes with: after a ref-held detach, check --link merge and --link deploy resolve the ref's anchor while the tracked custody.json names another commit, and a reconcile move lands on the ref, not the tracked file; the old-folder cases still pass
FIX-005: npx jest packages/core/lib/ship-sequencer.test.js packages/core/lib/custody.test.js packages/core/lib/ship-build.seam.test.js passes
FIX-006: npx jest packages/core/commands packages/core/contracts passes; cmp of each changed packages/core/lib file with its .claude/lib copy is equal
  </acceptance_criteria>
</phase_verification>
<instructions>
Working directory: /private/tmp/ensemble-vnext-feature-40-fold-the-detached-ship-record-into-the-ref. Run the full test suite against files changed since the last
checkpoint (git diff origin/main...HEAD plus the uncommitted working tree): at least
npx jest packages/core/lib/record-ref.test.js packages/core/lib/ship-sequencer.test.js packages/core/lib/custody.test.js packages/core/lib/ship-build.seam.test.js packages/core/commands packages/core/contracts
and confirm each changed packages/core/lib file is byte-identical to its .claude/lib copy (cmp).
Report pass/fail counts and unit/integration coverage %. Read .claude/rules/constitution.md's
verification_level (unit-only). Known environment-only failures that are not regressions: the cp -RL
skill-md suites under packages/skills, packages/core/hooks/status.test.js (mock-fs on Node 26), and
custody.test.js flaking on an all-digit commit hash.
Return status "pass" only when every acceptance criterion above is met. Do not edit any file.
</instructions>
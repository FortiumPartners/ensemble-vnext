# TRD: next-in-order

**Source PRD**: None — small change decided in session (owner, 2026-10-02, with a lightning-lane screenshot)
**Kind**: change
**Weight**: small

## Objectives

| ID | Objective | Source |
|----|-----------|--------|
| O1 | A readout's NEXT lists the owner's steps in the order they take them; when the first step is an action rather than a command (merge a PR), it is still written first, as plain text, and a later command never stands alone as if it were the step to take now. | owner, 2026-10-02: "If there are multiple next steps, the next section should clearly escape each, in sequence. It's ok if the first next is not a command but 'merge X'." |
| O2 | Each slash command in NEXT sits in its own fenced block, in sequence, directly under the line that explains it. | owner, 2026-10-02 (same message) |
| O3 | No readout NEXT hands out a shell command (`gh`, `git`); the step is said in words or given as a slash command. Commands a command RUNS ITSELF are not owner-facing and stay. | owner, 2026-10-02: "Do NOT give shell commands; the user is in Claude code, not a shell." |
| O4 | NEXT stays short: only the steps to take now, usually one to three, never a long checklist. | owner, 2026-10-02: "Next in order needs to kept small" |

## Intended Change

Measured case: lightning-lane `/verify-build` on jev-engine-part3b-hold-confirm, 2026-10-02.
NEXT read "Merge #1316, then re-run the live proof for the two 'yes, book it' runs…", and the
only fenced block was `/verify-build docs/TRD/jev-engine-part…`. The block an owner copies
with one tap was the SECOND step; running it before the merge spends a whole verification run
measuring code that does not yet contain the fix.

Cause, in three places:

- **The general rule.** `.claude/rules/command-status.md:111-114` defines NEXT as "the literal
  next command, runnable as written… Put the command alone in a fenced code block". One fenced
  command is all it allows, so when the true next step is not a command, the next command is
  what gets fenced.
- **Two commands repeat it with their own, stronger wording.** `implement-trd.md:1901` ("the
  single next command") and `:1910` ("name ONE"); and `verify-build.md:249-260`, whose NEXT
  rule (O4) is a fixed choice of commands with no slot for a plain step such as a merge, and
  puts two slash commands in one inline sentence. The measured case was a `/verify-build`
  readout, so fixing only the general rule would not have fixed it.
- **Shell commands handed to the owner.** `audit-build.md:418-420` and `close-feature.md:110-112`
  (`gh pr merge`, `gh pr create`, `git add … && git commit`) with the prose that sends them
  there (`audit-build.md:318-319`, `close-feature.md:86-87`: "NEXT gives them the command");
  `implement-trd.md:1907` and `:1914` (`gh pr create`), `:195` and `:2047` (`git stash`);
  `rebase-project.md:172` and `:1232` (`git init && git add .claude && git commit`); and
  `init-project.md:659-664` (tool installers). `plan.md:844-846` also fences an explanation
  together with its command.

After this change:

1. **The rule.** `command-status.md` (and its shipped template copy) states NEXT as: the steps
   the owner takes, in order, numbered when there is more than one, or "nothing — this is
   done". A step that is an action, not a command, is a plain line and keeps its place in the
   order. Each slash command sits alone in its own fenced block directly under its line. Never
   a menu of alternatives, and never a shell command — say the action in words or give the
   slash command that does it.
   - Checkable: the rule text contains the ordered-steps wording and the no-shell-command
     wording, and no longer says "the literal next command".
2. **The commands.** `/implement-trd` §9 and `/verify-build`'s readout state NEXT as ordered
   steps, each slash command in its own block; `/verify-build`'s O4 still decides WHICH
   commands, and a step that must come first (merge, deploy) is written first as plain text.
   Every owner-facing NEXT, stop message or instruction that named `gh`, `git` or an
   installer says the step in words instead:
   - a PR open → "Merge PR #<number> once you have reviewed it" (plain text, first step);
   - closed, no PR → "Open a pull request for `<branch>`";
   - on the default branch → "Commit the report and close record" (say what, not how);
   - Checkable: no NEXT passage in these commands contains `gh pr`, `git add` or `git commit`;
     `git add` / `git commit` appear only in the commits the commands run themselves.
3. **The docs.** `docs/reference/implement-trd.md:297` ("NEXT (one command: …)") and
   `docs/reference/other-commands.md:238`, `:241`, `:314` describe NEXT the new way.

## Decision

- **Steps in order, each command in its own block.** Rejected: keeping "one fenced command" and
  telling the model to pick the right one. The failure is that a non-command first step has no
  block of its own, so it loses its place; listing steps in order fixes the shape, not the
  model's judgement.
- **Words, not shell, for owner actions.** The owner works in Claude Code; a merge, a PR or a
  commit is either something they do on GitHub or something they ask for. Shell commands the
  command RUNS ITSELF (the audit commit, the close-record commit, the phase checkpoint commit)
  are not NEXT and stay.
- **The byte ceiling is a guardrail.** `command-status.md` is 12,402 of its 12,500-byte
  ceiling (`test/integration/tests/runtime-integrity.test.sh:523`). The new text replaces the
  old; trim obvious redundancy once, and if it still does not fit, raise the ceiling in that
  test with a one-line reason (owner, 2026-10-02: "I don't want to go in circles over it").
- **This supersedes `docs/TRD/pr-at-cycle-end.md:41` on NEXT wording only**, which put
  `gh pr merge <number> --merge` in NEXT. Opening the PR is unchanged.
- **`/verify-build`'s O4 keeps choosing the commands**; only how NEXT presents them changes.
  The report file's own `**Next**` line (`functional-verification.js:864`) is not a readout and
  stays as it is.
- **Kept small (owner, 2026-10-02, mid-build: "Next in order needs to kept small").** Scope cut to
  the rule and the four commands whose NEXT text caused the failure. Recorded as findings, not
  built here: shell commands in `/rebase-project`'s not-a-repo stops (`:172`, `:1232`) and
  `/init-project`'s installer table (`:659-664`); `git stash` hints in `/implement-trd` (`:195`,
  `:2047`); `/plan`'s `/refine-trd` example fencing its explanation (`:844-846`).
- not absorbed: the router's orientation hint ("CLOSE THE TURN") — the rule governs readouts
  without it; a separate change if wanted.

## Non-Goals

- No change to what the commands do, only to what they tell the owner to do next.
- No change to the commits, pushes or PR openings a command performs itself.
- No new NEXT content — only order, fencing and the removal of shell commands.

## Verification Artifacts

None apply — rule text and command prompt text; no screens, journeys or data views.

## Open Questions

none

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Rewrite the NEXT definition in `command-status.md` (`.claude/rules/` and `packages/core/templates/claude-directory/rules/`, byte-identical) as the few steps to take now (usually one to three), in order, one fenced block per slash command with nothing else inside, never a shell command; replace the "literal next command" wording; fit the byte ceiling or raise it in `runtime-integrity.test.sh` with a one-line reason | O1, O2, O3, O4 | None | A test asserts the rule contains the ordered-steps, keep-it-short and no-shell-command wording and not "the literal next command"; the two copies are byte-identical; `runtime-integrity.test.sh` passes |
| FIX-002 | `audit-build.md` and `close-feature.md`: NEXT in words (merge the PR once reviewed; open a PR for the branch; commit the report and close record), and the "NEXT gives them the command" prose to "NEXT tells them to commit it"; `docs/reference/other-commands.md:238`, `:241`, `:314`; mirrors; replace the `gh pr merge` test | O1, O3 | FIX-001 | Tests: neither file contains `gh pr `; their NEXT paragraphs contain no `git add`/`git commit`; both still say to merge the PR once reviewed; audit-build's own commit step (`:313-314`) unchanged; `verify-command-surface.test.js:745`'s text kept verbatim |
| FIX-003 | `implement-trd.md` §9 NEXT template (`:1900-1918`): ordered steps, each slash command fenced, `gh pr create` row in words, "name ONE" removed; `verify-build.md` Readout (`:249-260`): O4 picks the commands, NEXT lists them as numbered fenced steps with any must-come-first step (merge, deploy) first as plain text; `docs/reference/implement-trd.md:297`; mirrors | O1, O2, O3 | FIX-002 | Tests: `implement-trd.md` contains no `gh pr ` and no "name ONE"/"single next command"; `verify-build.md` states the ordered fenced-steps rule and the first-step-as-text rule; the "refine the plan with `/refine-verification` … then run `/verify-build`" wording and `implement-trd.md:1913`'s "passing `/audit-build` opens the PR when `ensemble.openPullRequest` is `auto`" kept verbatim (tests at `:584-598`, `:631-642`, `:709-711`) |

## Task Grounding

### FIX-001
- **Touches:** `.claude/rules/command-status.md`, `packages/core/templates/claude-directory/rules/command-status.md`, `test/integration/tests/runtime-integrity.test.sh`, `packages/core/commands/verify-command-surface.test.js`
- **Reuse:** the existing NEXT sentence at `command-status.md:111-114` as the place to edit [read]
- **Replaces:** "the literal next command, runnable as written, or "nothing — this is done", never a menu of options. Put the command alone in a fenced code block, with no other text inside, so the owner can copy it with one tap; any explanation goes on the line above the block." [read]
- **Follow:** runtime-integrity BATS requires `.claude/rules/*.md` to equal the shipped templates byte for byte [ran]; the ceiling check is at `runtime-integrity.test.sh:510-526` [read]
- **Careful:** keep "one fenced block per command, nothing else inside it" — the one-tap copy is why fencing exists [read]

### FIX-002
- **Touches:** `packages/core/commands/audit-build.md`, `.claude/commands/audit-build.md`, `packages/core/commands/close-feature.md`, `.claude/commands/close-feature.md`, `docs/reference/other-commands.md`, `packages/core/commands/verify-command-surface.test.js`
- **Reuse:** the NEXT passages at `audit-build.md:414-421` and `close-feature.md:106-112`, and the prose at `audit-build.md:318-319` and `close-feature.md:86-87` [read]
- **Replaces:** the test "NEXT offers gh pr merge, never a command that merges on its own" (`verify-command-surface.test.js:705-708`) [read]
- **Careful:** `audit-build.md:313-314`, `:338` and `close-feature.md:82-83` are commits the command runs itself — leave them, and scope any `git commit` check to the NEXT paragraph; keep `audit-build.md:415`'s "`/close-feature docs/TRD/<feature>.md` alone in its fenced block; never `/audit-build`" word for word (test `:745`) [read]

### FIX-003
- **Touches:** `packages/core/commands/implement-trd.md`, `.claude/commands/implement-trd.md`, `packages/core/commands/verify-build.md`, `.claude/commands/verify-build.md`, `docs/reference/implement-trd.md`, `packages/core/commands/verify-command-surface.test.js`
- **Reuse:** `implement-trd.md:1900-1918` (§9 NEXT template); `verify-build.md:249-260` [read]
- **Replaces:** "{the single next command, runnable as written — normally the first of:}" and "{name ONE. The others are the owner's to run when they get there.}" (`implement-trd.md:1901`, `:1910`) [read]
- **Careful:** keep verbatim the phrases tests match: "refine the plan with `/refine-verification` (add `--auto` to let an agent answer), then run `/verify-build`" (tests `:584-598`, `:631-642`) and "passing `/audit-build` opens the PR when `ensemble.openPullRequest` is `auto`" (test `:709-711`); the checkpoint commit at `implement-trd.md:1221-1222` is the command's own and stays [read]

## Could Not Verify

| Claim | Why not checked |
|-------|-----------------|
| A model writing a readout follows the ordered-steps rule | Model behaviour; the tests check the rule and command text, not a live readout |
| A command's own NEXT rule never outranks the general one again | Only the commands found by this review are changed; a future command could reintroduce a single-command rule |

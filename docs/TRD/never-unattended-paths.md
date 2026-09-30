# TRD: never-unattended-paths

**Source PRD**: None — small change decided in session (owner, 2026-09-30)
**Kind**: change
**Weight**: small

## Objectives

| ID  | Objective                                                                                                                                                                                                                                                  | Source                                                                                                                                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O1  | An owner can list paths that must never be changed unattended, in `verification.md`, and `/plan --implement` then stops before building any plan that touches one of them. The TRD is still written; the build waits for the owner to run `/implement-trd` | owner, 2026-09-30: "Add the section and the interview question: worth it if some paths should never be touched without you watching"; today `plan.md:912-913` and `fix-sizing.js` read a list `verification.md` has no place for, so the brake can never fire |
| O2  | `/verification-setup` asks for that list, offering what it detects in the repo as a starting point, and writes it; a file filled in before this change is told only that this section is missing                                                           | owner, same turn; `/verification-setup` asks only about missing sections (`missingSections`, D10 of verification-md-setup)                                                                                                                                    |
| O3  | A `verification.md` that is still an unfilled copy of the template — the current one or any earlier one — is still recognised as unfilled after the template gains the new section                                                                         | the unfilled check compares against the live template and a list of earlier templates' digests (`functional-verification.js` `KNOWN_UNFILLED_DIGESTS`); this repo's own `verification.md` is today an unfilled copy of the current template                   |

## Intended Change

**Today:**

- `/plan` Step 7 tells the model to read a "never-unattended path list" from `.claude/rules/verification.md` and pass it to `matchNeverUnattended(touches, patterns)` (`fix-sizing.js`). That function substring-matches each touched file against each pattern.
- `fix-plan.js` stops the `--implement` chain when anything matches, naming the paths.
- The template has no such section and `/verification-setup` never asks, so the list is always empty and the chain is never stopped.

**After:**

- **Template section.** The template gains `## 5b. Never unattended` after §5a. It holds one path fragment per bullet line (`- migrations/`, `- src/auth/`), or the line `Paths: none`, with a short explanation: substring match, so `auth` covers anything under an `auth` folder.
- **A reader in code.** `functional-verification.js` gains `readNeverUnattended(content)`, returning `{ paths: string[], status: 'declared'|'none'|'absent'|'invalid', raw }`. It reads only that section, ignores fenced code, and strips list markers, `*` and backticks as `readCoverageFloor` does.
  - Bullet lines are the list.
  - `Paths: none` alone means none.
  - `Paths: a, b` on one line is also accepted, split on commas.
  - A section with both bullets and `Paths: none`, or with a line it cannot read, is `invalid`.
- **A checker that does the whole job.** A `check-never-unattended <trd> <verification.md>` command takes the touched files from the TRD's own grounding (`trd-parser.js`) and matches them with `matchNeverUnattended`. It returns `{ hits, status, raw }`, so the model gathers neither the paths nor the files.
- **/plan uses the checker.** `/plan` Step 7 calls it and passes `hits` as `neverUnattendedHit`. `status: 'invalid'` is treated as a stop, with the unreadable line named. `absent` adds one readout line pointing at `/verification-setup`.
- **The interview asks.** `/verification-setup` adds the topic after §5a. It proposes sensitive-looking folders found in the repo (auth, payments, billing, migrations, secrets, infra/prod) as a default the owner edits, and writes the owner's answer.
- **Filled files are told what's missing.** `missingVerificationSections` adds `never-unattended`, so an older filled-in file is told the section is missing and `/verification-setup` asks only about it.
- **Old blank copies still count as blank.** The current template, before this change, is frozen as a fixture, and its digest joins `KNOWN_UNFILLED_DIGESTS`. A project holding that blank copy, this repo included, still reads as unfilled.

## Decision

- **An unreadable list stops the build.** A brake that silently reads as empty is the failure this whole change exists to remove, so `invalid` never means "no brake". It stops `--implement` exactly as a match does, and names the line (adversarial review, 2026-09-30).
- **Parse the list, and gather the touched files, in code; never have the model do either.** The list is the only brake on an unattended build, and a model re-reading prose is how a brake silently reads as empty. Same reasoning as the coverage floor (`readCoverageFloor`) and the stop rule (`readStopRule`), same helpers (`findSection`, `maskFencedLines`).
- **Keep substring matching** (`fix-sizing.js`'s documented choice: "a rule that needs a correct glob to protect a credential path is a rule that will one day fail open"). The template states that it is a substring, not a glob.
- **An absent section and `Paths: none` both mean "no brake".** `absent` is reported in `/plan`'s readout as "no never-unattended list declared — run `/verification-setup`" so an owner who never set it up learns the brake exists; `none` is silent.
- **Digest the pre-change template before editing it.** Otherwise every unfilled copy in the field reads as filled.
- **This repository's own `.claude/rules/verification.md` is not edited.** It is owner-governed; only `/verification-setup` writes it. It stays an unfilled template and must still be recognised as one (O3).

absorbed: none
not absorbed: the brake's scope is `/plan --implement` only. `/implement-trd` run directly and
`/verify-build`'s fix loop do not consult the list. That is owner-invoked or plan-
driven work, outside what was asked.

## Non-Goals

- No change to `matchNeverUnattended`'s matching rule or to `fix-plan.js`'s decision.
- No brake added to `/implement-trd`, `/sweep`, `/amend` or `/verify-build`.
- No edit to this repository's own `.claude/rules/verification.md`.

## Verification Artifacts

None apply — no UI designs, interaction diagrams or data views; the surfaces are a template, a parser, a skill prompt and a command prompt.

## Open Questions

| ID   | Question                                                       | What I assumed                                                                                                                                                           | Owner-only |
| ---- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| OQ-1 | Which folders should `/verification-setup` propose by default? | Those that exist in the repo and match auth, payments, billing, migrations, secrets or infra/prod; the owner edits the list, and nothing is written without their answer | owner-only |

## Master Task List

| Task ID | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Serves | Dependencies | Acceptance Criteria                                                                                                                                                                                                                                                                                                                                                                              |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FIX-001 | In this order: <ol><li>Copy the current `packages/core/templates/claude-directory/rules/verification.md` to `packages/core/lib/__fixtures__/verification.coverage-floor-v1.md`, and add its normalized sha256 to `KNOWN_UNFILLED_DIGESTS` as `'coverage-floor-v1'`, with a comment in the existing style.</li><li>Add `## 5b. Never unattended` to the template after §5a: a short explanation, the substring rule, bullet form, and the default line `Paths: none`.</li><li>Add `readNeverUnattended(content)` (statuses `declared`/`none`/`absent`/`invalid`, Markdown stripped, precedence as in Intended Change), the `read-never-unattended <path>` subcommand, and a `check-never-unattended <trd> <verification.md>` subcommand to `packages/core/lib/functional-verification.js`. The checker takes touched files from `trd-parser.js`'s grounding, matches them with `fix-sizing.js`'s `matchNeverUnattended`, and returns `{hits, status, raw}`.</li><li>Add `'never-unattended'` to `VERIFICATION_SECTION_LABELS` and to `missingVerificationSections`.</li><li>Mirror everything to `.claude/lib/`.</li></ol>Jest tests cover: <ul><li>declared bullets → paths;</li><li>backtick-wrapped bullets → clean paths;</li><li>a comma-separated `Paths:` line → paths;</li><li>`Paths: none` → none;</li><li>bullets plus `Paths: none` → invalid;</li><li>no section → absent;</li><li>a fenced example is ignored;</li><li>the checker returns hits for a TRD touching a listed path;</li><li>the new fixture reads unfilled as `coverage-floor-v1`;</li><li>a file without the section lists `never-unattended` as missing.</li></ul>Update the existing expected-section lists this changes, on purpose: `ALL_MISSING_SECTIONS` (`functional-verification.test.js:1235-1240`), `:1496-1501`, `:1509`, `:1517`, `:1528`, and the CLI test at `:1357`. | O1, O3 | None         | <ul><li>The new tests pass, and the digest test fails if the digest is changed.</li><li>`node .claude/lib/functional-verification.js check-verification-unfilled .claude/rules/verification.md packages/core/templates/claude-directory/rules/verification.md` prints `"unfilled":true` (this repo's untouched file).</li><li>`npx jest` passes.</li><li>The mirror is byte-identical.</li></ul> |
| FIX-002 | `packages/skills/verification-setup/SKILL.md`: add the topic "§5b Never unattended" after §5a. Explain it in one sentence ("paths /plan --implement will never build without you"). Propose sensitive-looking folders that exist in the repo as the default, and write `- <fragment>` lines or `Paths: none` in exactly the form `readNeverUnattended` parses. It is asked only when the section is missing or the owner asks to revisit it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | O2     | FIX-001      | <ul><li>The topic appears in the Topics list and has its own section.</li><li>The after-writing re-check also runs `read-never-unattended`.</li><li>`read-never-unattended` is added to the subcommand list asserted in `packages/skills/verification-setup/__tests__/skill-md.test.js:123`, so that test fails without the SKILL.md change.</li><li>`npx jest packages/skills` passes.</li></ul>                                                                                                                                                                                      |
| FIX-003 | `packages/core/commands/plan.md` Step 7: replace the model-gathered touches and the hand-read list with one call, `node .claude/lib/functional-verification.js check-never-unattended docs/TRD/<slug>.md .claude/rules/verification.md`, passing `hits` as `neverUnattendedHit`. `status: 'invalid'` stops the chain with the unreadable line named. `absent` adds one readout line pointing at `/verification-setup`. Mirror to `.claude/commands/plan.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | O1     | FIX-001      | <ul><li>A new assertion in `verify-command-surface.test.js`, modelled on the §8.1a check at `:114-120`, requires `plan.md` Step 7 to name `check-never-unattended`; it fails against today's `plan.md`.</li><li>The mirror is byte-identical.</li></ul>                                                                                                                                                                    |
| FIX-004 | Docs: in `docs/reference/verification.md`, describe §5b and the brake; in `docs/reference/other-commands.md`, add one line to the `/plan` section saying what stops `--implement`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | O1     | FIX-001      | <ul><li>`grep -c "check-never-unattended"` is at least 1 in each doc; it is 0 today.</li></ul>                                                                                                                                                                                                                                                  |

## Task Grounding

### FIX-001

- **Touches:** `packages/core/templates/claude-directory/rules/verification.md`, `packages/core/lib/__fixtures__/verification.coverage-floor-v1.md`, `packages/core/lib/functional-verification.js`, `.claude/lib/functional-verification.js`, `packages/core/lib/functional-verification.test.js`
- **Reuse:**
  - `readCoverageFloor`, `findSection`, `maskFencedLines` and the `read-coverage-floor` CLI branch in `functional-verification.js` [read]
  - `KNOWN_UNFILLED_DIGESTS`, `normalizeVerificationContent` [read]
  - the existing fixtures under `packages/core/lib/__fixtures__/` [read]
- **Replaces:** nothing
- **Follow:** the digest comment style and the fixture test that proves each digest [read]
- **Careful:**
  - compute the digest from the template BEFORE adding §5b [read]
  - `.claude/rules/verification.md` in this repo is owner-governed: never edit it [read, constitution.md Governance Split]

### FIX-002

- **Touches:** `packages/skills/verification-setup/SKILL.md`
- **Reuse:** the existing "§5a Coverage floor" topic and section as the shape [read]
- **Replaces:** nothing
- **Follow:** one `AskUserQuestion` per topic, offering the detected value first [read]
- **Careful:** the skill writes the owner's answer only; a default goes unwritten unless the owner accepts it [read]

### FIX-003

- **Touches:** `packages/core/commands/plan.md`, `.claude/commands/plan.md`
- **Reuse:** the Step 7 `matchNeverUnattended` call block [read, `plan.md:899-925`]
- **Replaces:** the instruction to read the list from `verification.md` by hand
- **Follow:** heredoc argument passing, as Step 7 already does (O-INJECT) [read]
- **Careful:** a sweep in flight on 2026-09-30 may touch `plan.md` or `fix-plan.js`. Build this after it merges [inferred]

### FIX-004

- **Touches:** `docs/reference/verification.md`, `docs/reference/other-commands.md`
- **Reuse:** the existing §5a coverage-floor description in `docs/reference/verification.md` [read]
- **Replaces:** nothing
- **Follow:** plain language, as the rest of the reference [read]
- **Careful:** none

## Could Not Verify

| Claim                                                                          | Why not checked                                                                                    |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| That a live `/plan --implement` run with a declared list stops before building | Needs a live run; the unit tests prove the reader and `fix-plan.js` already has tests for the stop |

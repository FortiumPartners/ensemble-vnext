# Functional Verification Report: never-unattended-paths

**Source PRD**: docs/TRD/never-unattended-paths.md#Intended Change
**Success definition**: .trd-state/never-unattended-paths/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — all 20 criteria are met; FS-8 (unreadable §5b line reported as invalid with the line in raw) closed in iteration 2
**Criteria**: 20 total — 20 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 20 of 20 proven — uncovered: none
**Next**: `/audit-build`

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | The shipped template `packages/core/templates/claude-directory/rules/verification.md` has a `## 5b. Never unattended` heading that comes after the §5a coverage-floor heading and before §6, and its text explains that matching is by substring (so "auth" covers anything under an auth folder) | .trd-state/never-unattended-paths/evidence/FS-1.txt | 1 |
| FS-2 | Reading the shipped template's own §5b with `readNeverUnattended` returns `status` `none` or `declared` — never `invalid` or `absent` — so a freshly scaffolded project neither stops `/plan` nor is told the section is missing; and `missingVerificationSections(template)` does not include `never-unattended` | .trd-state/never-unattended-paths/evidence/FS-2.txt | 1 |
| FS-3 | A §5b whose body is bullet lines `- migrations/` and `- src/auth/` reads as `{ status: 'declared', paths: ['migrations/', 'src/auth/'] }` | .trd-state/never-unattended-paths/evidence/FS-3.txt | 1 |
| FS-4 | List markers, `*` and backticks are stripped from each entry the way `readCoverageFloor` strips them: `* \\`payments/\\`` reads as `payments/`, and a bolded `**Paths: none**` reads as `none` | .trd-state/never-unattended-paths/evidence/FS-4.txt | 1 |
| FS-5 | A §5b containing only the line `Paths: none` reads as `{ status: 'none', paths: [] }` | .trd-state/never-unattended-paths/evidence/FS-5.txt | 1 |
| FS-6 | A §5b with the single line `Paths: a, b` reads as `{ status: 'declared', paths: ['a', 'b'] }` — split on the comma, no leading space kept on `b` | .trd-state/never-unattended-paths/evidence/FS-6.txt | 1 |
| FS-7 | A §5b holding both a bullet (`- auth/`) and the line `Paths: none` reads as `status: 'invalid'` | .trd-state/never-unattended-paths/evidence/FS-7.txt | 1 |
| FS-8 | A §5b containing a line the reader cannot read returns `status: 'invalid'`, and its `raw` carries that line's text, so a caller can name it | .trd-state/never-unattended-paths/evidence/FS-8.txt | 2 |
| FS-9 | A file with no Never-unattended section reads as `{ status: 'absent', paths: [] }` | .trd-state/never-unattended-paths/evidence/reader-checks.json | 1 |
| FS-10 | Only §5b is read: bullet lines under other sections (for example §5's "e.g." bullets, or bullets under §6) never appear in `paths`; a fixture with bullets in §5 and `Paths: none` in §5b reads as `none` | .trd-state/never-unattended-paths/evidence/reader-checks.json | 1 |
| FS-11 | Fenced code is ignored: a bullet inside a ``` fence within §5b is not a path, and a `## 5b. Never unattended` heading quoted inside a fence elsewhere in the file is not taken as the section | .trd-state/never-unattended-paths/evidence/reader-checks.json | 1 |
| FS-12 | `check-never-unattended <trd> <verification.md>` reports as `hits` exactly the touched files, taken from the TRD's grounding (`Touches` fields, across every task's block), that contain a declared fragment as a substring: with fragment `auth` and touches `src/auth/login.js` (task 1), `lib/oauth-client.js` (task 2) and `docs/readme.md`, `hits` is `['src/auth/login.js', 'lib/oauth-client.js']` and `status` is `declared` | .trd-state/never-unattended-paths/evidence/checker-fs12.txt | 1 |
| FS-13 | When nothing matches, the checker returns `hits: []`: both for a declared list that matches no touched file, and for a verification.md whose §5b is `Paths: none` (`status: 'none'`) | .trd-state/never-unattended-paths/evidence/checker-fs13.txt | 1 |
| FS-14 | The checker passes the reader's status through: an unreadable §5b gives `status: 'invalid'` with `raw` naming the offending line; a verification.md with no §5b gives `status: 'absent'` | .trd-state/never-unattended-paths/evidence/checker-fs14.txt | 1 |
| FS-15 | Feeding the checker's `hits` into fix-plan.js as `neverUnattendedHit`, with `implement: true`, produces a decision in which the `--implement` chain does not begin and the reason names the hit path(s) | .trd-state/never-unattended-paths/evidence/FS-15.txt | 1 |
| FS-16 | `/plan` Step 7 (`packages/core/commands/plan.md`) invokes `check-never-unattended` with the TRD and verification.md paths and passes its `hits` as `neverUnattendedHit`, instead of telling the model to read a path list itself and call `matchNeverUnattended` | .trd-state/never-unattended-paths/evidence/FS-16-FS-17.txt | 1 |
| FS-17 | `/plan` Step 7 treats checker `status: 'invalid'` as a stop that names the unreadable line, and `status: 'absent'` as one readout line pointing the owner at `/verification-setup` | .trd-state/never-unattended-paths/evidence/FS-16-FS-17.txt | 1 |
| FS-18 | `/verification-setup` (`packages/skills/verification-setup/SKILL.md`) asks a never-unattended topic after the §5a coverage-floor topic, proposes as an editable default any of `auth`, `payments`, `billing`, `migrations`, `secrets`, `infra/prod` found as folders in the repo, and writes the owner's answer into §5b | .trd-state/never-unattended-paths/evidence/FS-18.txt | 1 |
| FS-19 | `missingVerificationSections` includes `never-unattended` for a filled-in file that lacks §5b (and omits it once §5b is present); `check-verification-unfilled` surfaces it in `missingSections`; and `/verification-setup` asks only the missing topic when that is the only section missing | .trd-state/never-unattended-paths/evidence/FS-19.txt | 1 |
| FS-20 | The template as it stood before this change still reads as unfilled: `check-verification-unfilled` on a temp copy of the pre-change template (for example `git show f852b78:packages/core/templates/claude-directory/rules/verification.md`) returns `unfilled: true` with a prior-template label (not `null`), a frozen fixture copy of that template exists under `packages/core/lib/__fixtures__/`, and the same command run read-only on this repo's own `.claude/rules/verification.md` also returns `unfilled: true` | .trd-state/never-unattended-paths/evidence/FS-20.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._


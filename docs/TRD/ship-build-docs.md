# TRD: ship-build-docs

**Source PRD**: None — small change decided in session (owner instruction, 2026-11-07)

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | A short guide, `docs/guides/ship-build.md`, explains `ship.md`, the 13 primitives and how to add one, the default string, `/ship-build`, `/ship-setup`, `--resume` and the `ensemble-ship-resume` workflow, and custody — each claim matching the code on `main` | your instruction, 2026-11-07 | yes |
| O2 | `README.md`, `docs/guides/README.md`, `docs/guides/QUICK-REFERENCE.md` (and the guides that list commands and setup skills) name `/ship-build` and `ship-setup` and point at the guide | your instruction, 2026-11-07 | yes |
| O3 | The `/ship-build` entry in `.claude/rules/process.md` and `packages/core/templates/process.md.template` describes what the code does, including that outward steps need the authorization sentence in `autonomy.md` | your instruction, 2026-11-07 | |
| O4 | `CLAUDE.md` stays within 16,000 bytes and grows by at most one line; `constitution.md`, `autonomy.md` and `stack.md` are untouched | your instruction, 2026-11-07 | yes |

## Intended Change

Documentation only, describing `/ship-build` and `/ship-setup` as built on `main` (merge
`9f61568`, PR #75), read from the code rather than the TRD. Current state: the README and
`CLAUDE.md` carry one line each; `process.md` and its template carry a `/ship-build` entry
that says "A `merge` step is your standing go for `gh pr merge`" — untrue as built, because
`ship-sequencer.js` `isAuthorized()` refuses every `outward: yes` step unless
`.claude/rules/autonomy.md` contains the sentence "A step listed in `.claude/rules/ship.md` is
the owner's standing authorization for that act." (or the contract's `unless` setting holds:
only `open-pr`, with `ensemble.openPullRequest: auto`). No `autonomy.md` on `main` carries the
sentence. No guide, quick-reference row or guides-index entry mentions either feature.

After the change: a new guide exists, the indexes and quick reference point at it, and the
process entries state the authorization rule as the code applies it.

## Decision

Describe the code, not the TRD. Where a shipped prose file disagrees with the code (the
`ship.md` template's "authorized by this file alone"; `ship-setup`'s "`rounds` … the most
passes the block makes", while the sequencer allows `rounds + 1` passes), the docs follow the
code and the disagreement is reported as a finding — those files are product templates, not
documentation, and are out of scope. `CLAUDE.md` already has its `/ship-build` line and is not
edited.

## Non-Goals

- No change to any code, contract, skill, template other than `process.md.template`, or to
  `ship.md`, `constitution.md`, `autonomy.md`, `stack.md`, `verification.md`.
- Not adding the authorization sentence to `autonomy.md` (owner-governed).
- No `docs/reference/` page; no CHANGELOG entry or version bump.

## Verification Artifacts

None apply — documentation only: no screen, rendered data, journey or design is in scope.

## Open Questions

| ID | Question | What I assumed | Owner-only |
|----|----------|----------------|------------|
| OQ-1 | Nothing writes the authorization sentence into `autonomy.md` (not `ship-setup`, not `/init-project`), so every outward step is refused as built; and the `ship.md` template and `ship-setup` wording disagree with the sequencer (authorization; `rounds` meaning). Fix the product, or add the sentence by hand? | Left as is; documented as built and reported as findings | owner-only |

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Write `docs/guides/ship-build.md`: what `ship.md` is and its line format; the 13 primitives in a table (name, what it does, outward, needs/provides) and how to add one; the default string as the first labelled example `/ship-setup` offers; `/ship-build` (work resolution, the closed-feature gate, the loop, park/stop, readout); `--resume` and the `ensemble-ship-resume.yml` workflow; custody; the outward-authorization gate | O1 | None | Each of the 13 names from `packages/core/contracts/ship-primitive-*.md` appears in the guide; the guide quotes the `autonomy.md` authorization sentence verbatim as in `ship-sequencer.js` `AUTHORIZATION_SENTENCE`; it states a `repeat` makes up to `rounds + 1` passes; it never says `ship.md` alone authorizes an outward step, and it states that without the sentence the default string stops at `open-pr` (unless `ensemble.openPullRequest` is `auto`) or at the first `request-review`; it states the resume workflow fires only on an approving review from OWNER/MEMBER/COLLABORATOR on a same-repo branch, needs `ANTHROPIC_API_KEY`, and must be on the default branch; it covers adding a primitive both in the framework and in a consuming project; it is under 300 lines |
| FIX-002 | Point the indexes at it: `README.md` (command count 27→28; `ship-setup` among the setup skills; guide link), `docs/guides/README.md` (flow line, guides table), `docs/guides/QUICK-REFERENCE.md` (which-command rows for `/ship-build` and `ship-setup`, flags row, `ship.md`/`shipped.json`/`custody.json` rows), `docs/guides/PROCESS.md` (short `/ship-build` subsection after `/close-feature`), `docs/guides/INSTALL.md` (ship setup alongside design setup, and its stale counts: 25→26 workflow commands, two→three unfilled owner files, eight→nine framework skills, two→three setup interviews); `ship-setup` written as "(skill, not a command)" like `verification-setup` | O2 | FIX-001 | `grep -l "ship-build.md"` matches README.md, docs/guides/README.md, QUICK-REFERENCE.md and PROCESS.md; QUICK-REFERENCE has a `/ship-build` row and a `ship-setup` row; README says 28 commands; INSTALL.md says 26 workflow commands and nine framework skills |
| FIX-003 | Correct the `/ship-build` entry in `.claude/rules/process.md` and `packages/core/templates/process.md.template` identically: drop "standing go" wording, state the `autonomy.md` sentence requirement, `--resume`, the guide link; fix the one-space misalignment of the `/ship-build` line in the command list | O3 | None | Neither file contains "standing go"; both contain "autonomy.md" inside the `/ship-build` section; the two `/ship-build` sections are byte-identical |
| FIX-004 | Guard the governed files: confirm `CLAUDE.md` ≤ 16,000 bytes and the branch diff touches none of `CLAUDE.md` (beyond ≤1 line), `constitution.md`, `autonomy.md`, `stack.md` | O4 | FIX-001, FIX-002, FIX-003 | `wc -c CLAUDE.md` ≤ 16000; `git diff origin/main --stat` lists none of `.claude/rules/{constitution,autonomy,stack}.md` or their templates |

## Task Grounding

### FIX-001
- **Touches:** `docs/guides/ship-build.md`
- **Reuse:** the facts in `packages/core/commands/ship-build.md`, `packages/skills/ship-setup/SKILL.md`, `packages/skills/ship-setup/template.md`, `packages/core/lib/ship-sequencer.js` (grammar header, `isAuthorized`, `record`), `packages/core/lib/custody.js` (header, `reconcile`), the 13 contracts' front matter and `## Do` sections, `packages/core/templates/github/ensemble-ship-resume.yml` [read]
- **Replaces:** nothing — no guide exists [read]
- **Follow:** the guides' voice (`docs/guides/PROCESS.md`): plain sentences, tables, name the thing then its id; `CLAUDE.md` "How to talk to the owner"
- **Careful:** two routes to add a primitive — in the framework (contract under `packages/core/contracts/`, mirror to `.claude/contracts/`, update `EXPECTED`) or in a consuming project (drop the file into `.claude/contracts/`; `copy_contracts` in `scaffold-project.sh` never deletes a contract it did not ship) [read]. The sequencer, not the template, is the authority on authorization and `rounds`; `open-pr` is authorized by `ensemble.openPullRequest: auto` alone; `collect-findings` repeat-until is `clean`; adding a primitive also means copying it to `.claude/contracts/` (byte-identity test) and updating `EXPECTED` in `packages/core/contracts/ship-primitives.test.js`, whose "the set is the thirteen" test fails otherwise [read]

### FIX-002
- **Careful (counts):** INSTALL.md lines 78-86 — 26 workflow commands (28 minus the 2 plugin-only), three unfilled owner files (`ship.md` added, `init-project.md:388`), nine framework skills (`ship-setup` in `framework-skills.txt`), three setup interviews [read]
- **Touches:** `README.md`, `docs/guides/README.md`, `docs/guides/QUICK-REFERENCE.md`, `docs/guides/PROCESS.md`, `docs/guides/INSTALL.md`
- **Reuse:** existing table shapes in each file [read]
- **Replaces:** README "27 commands" (`.claude/commands/` holds 28 files; `CLAUDE.md` says 28) [ran]
- **Follow:** keep each addition to a row or a short paragraph; link the guide rather than repeat it
- **Careful:** README already mentions `/ship-build` in the pipeline row — extend, don't duplicate [read]

### FIX-003
- **Touches:** `.claude/rules/process.md`, `packages/core/templates/process.md.template`
- **Reuse:** the existing `### /ship-build` section shape (Purpose / Usage / Output) [read]
- **Replaces:** the sentence "A `merge` step is your standing go for `gh pr merge`; nothing else merges." [read]
- **Follow:** the two files currently carry identical `/ship-build` text; keep them identical
- **Careful:** `process.md` is in `scaffold-project.sh`'s AUTHORED_RULES (never overwritten on refresh) — editing the template changes only new projects [read]

### FIX-004
- **Touches:** `CLAUDE.md`
- **Reuse:** `wc -c`; `git diff origin/main --stat` [ran]
- **Replaces:** nothing
- **Follow:** `CLAUDE.md` is 15,870 bytes on `main` [ran]
- **Careful:** no edit is planned; this task only checks

## Could Not Verify

- That `ensemble-ship-resume.yml` actually resumes a run on GitHub Actions: its own header
  says it is unverified until a live proof (TRD ship-build SHIP-T002). The guide says so.

# TRD: rebase-governance-and-agent-diff

**Source PRD**: None — defect report from a consuming project's `/rebase-project` run, relayed by the owner 2026-10-12

## Objectives

| ID | Objective | Source | Must pass |
|----|-----------|--------|-----------|
| O1 | Nothing in `/rebase-project`'s text can be read as permitting it to replace `.claude/rules/verification.md`: every list of governance files names it, and the framework rules it does replace are named explicitly rather than as "every file in the template rules directory" | the owner's relayed feedback, 2026-10-12 | yes |
| O2 | `/rebase-project` reports an agent as updated only when the plugin's agent differs from the project's copy in something other than the generated skill content (the `skills:` frontmatter list and the `ENSEMBLE:SKILLS` marked section) | the owner's relayed feedback, 2026-10-12 | yes |
| O3 | The agent comparison is made by a deterministic script, not by the model reading two files | the owner's instruction, 2026-10-12 | |

## Reproduction

### Steps

1. **Governance lists** [read]. In `packages/core/commands/rebase-project.md`:
   - Five places list governance as `constitution.md`, `stack.md` and `process.md` without
     `verification.md`: the usage header (line 24), the goals list (48), the end of §4.7
     (1073), the "Files Preserved" report template (1130–1133) and the Notes (1262).
   - Line 25 says framework rules are "replaced when they differ" and names them only by
     example ("`async-discipline.md`, `autonomy.md`, …").
   - §4.7 defines framework rules as "every `.md` file in the template rules directory".
     `packages/core/templates/claude-directory/rules/` contains `verification.md`, and a
     single "except" clause (line 1042) is all that excludes it.
2. **Agent comparison** [ran]. Compare each of the 13 plugin agents
   (`packages/full/agents-lib/*.md`) byte for byte with the vendored copy in this repo's
   `.claude/agents/`, the comparison §2.1 step 3 prescribes.

### Actual

1. A model following the summary lines would put `verification.md` among the framework
   rules and replace it when it differs from the template, which it always does once the
   owner has filled it in. The feedback reached exactly this reading. The script itself is
   safe: `scaffold-project.sh:1380` (`AUTHORED_RULES`) refuses the file.
2. 13 of 13 agents differ. The only differences are the `skills:` frontmatter list and the
   `ENSEMBLE:SKILLS:BEGIN … END` section that `inject_agent_skills`
   (`scaffold-project.sh:1063`) writes into every vendored agent. With both stripped and
   trailing whitespace ignored, 13 of 13 are identical (run 2026-10-12).

### Expected

1. Every governance list names four files, and the framework rules are named as exactly
   `async-discipline.md`, `autonomy.md` and `command-status.md`.
2. An unmodified project reports 0 updated agents; an agent whose shipped text changed is
   reported as updated.

**Root cause** [ran]: (1) the governance list was extended to four files in §4.7 and the flag
summary only, and the other five copies were never updated; (2) §2.1 compares whole files,
and the vendored side always carries generated content the plugin side never has.

## Decision

- **Rules (O1):** edit the prose only; the script already protects the file. Every list of
  governance files names all four. The framework rules are named as the three files the
  template directory holds once `AUTHORED_RULES` is taken out, and a test keeps that list
  equal to the directory, so a fourth rule cannot be shipped by `--refresh` but missed by
  the command.
- **Agents (O2, O3):** two new modes of `scaffold-project.sh` own the whole agent step, so
  the model neither diffs nor copies agent files:
  - `--agent-status` (read-only): prints one line per agent, `<status>\t<name>`, where
    status is `new`, `updated`, `unchanged` or `custom`, and nothing else on stdout.
  - `--sync-agents`: the same classification, then copies `new` and `updated` agents from
    the plugin and runs `inject_agent_skills`, printing the same lines.
  - Both compare after removing the generated content, plus whitespace at the end of the
    file only. Stripping whitespace line by line would hide real whitespace changes.
  - The removal reuses `strip_skills` and `strip_body_block`. The Python program is moved
    out of its heredoc into a function that prints it, so both modes run the same code.
    Its injected output must not change.
  - `/rebase-project` §2.1 step 3 calls `--agent-status` (dry run and diff report), and
    §4.1 calls `--sync-agents`.
- **Corrected after review: the rewrite of agent files is now in scope.** Today the
  command copies plugin agents over the project's and never re-runs `inject_agent_skills`.
  It also stamps `ensemble.version`, so the runtime-refresh hook does not repair this until
  the next plugin release. The result is that every rebase strips the skill preloads from
  all 13 agents. This has the same cause as the false "updated" report: the command handles
  agents by hand, unaware of their generated content. Having the script do the agent step
  fixes both, with no more tasks than before.
- **Rejected: a new Node lib that re-implements the stripping.** Two copies of the marker
  and frontmatter logic would drift. The first time the generated section changes shape,
  every agent would be flagged again.
- **Rejected: a status mode that leaves the copy to the model.** The copy is where the
  preloads were being lost.

## Non-Goals

- No change to which rule files the script refreshes (`AUTHORED_RULES` is already correct).
- No change to what `inject_agent_skills` writes. An existing project's agents must come out
  byte-identical after `--refresh`.
- No change to the `--refresh` path or its `REFRESH_SUMMARY` last line, which the
  runtime-refresh SessionStart hook parses.
- The retired-agent list in `rebase-project.md` §2.1 stays the command's job. The script
  reports such an agent as `custom`, and the command deletes it.

## Verification Artifacts

None apply — a command's prose and a shell script's output; nothing visual, no design
frames, no screen-to-screen journey, no data pipeline.

## Open Questions

none

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| FIX-001 | Name `verification.md` in every governance list in `rebase-project.md`. Name the framework rules explicitly (`async-discipline.md`, `autonomy.md`, `command-status.md`) wherever they are referred to by example, "etc.", "and any future additions" or "every `.md` file in the template rules directory". Add BATS tests to `scaffold-project.test.sh`. | O1 | None | Tests that fail on today's file and pass after the edit: (a) every line naming `process.md` as a governance file also names `verification.md` (line level, not paragraph level, because line 24's governance list and line 25's framework list share one paragraph); (b) no line naming a framework rule also names `verification.md` as one; (c) the set of framework rule names in `rebase-project.md` equals the template rules directory minus `scaffold-project.sh`'s `AUTHORED_RULES`; (d) the file contains none of "…" or "etc." next to a rule name, "any future additions", or "Every `.md` file in". |
| FIX-002 | Add `--agent-status` and `--sync-agents` to `scaffold-project.sh` as the Decision describes. Add a Path Resolution row (`@packages/core/scripts/` → `scripts/`) to `rebase-project.md`. Point §2.1 step 3 at `"${CLAUDE_PLUGIN_ROOT}/scripts/scaffold-project.sh" --plugin-dir "${CLAUDE_PLUGIN_ROOT}" --agent-status .` and §4.1 at the same call with `--sync-agents`. Add BATS tests. | O2, O3 | None | Tests in `scaffold-project.test.sh`: (a) a scaffolded, injected project gives exactly one line per `agents-lib/*.md` file, all `unchanged` (the count is asserted, so empty output fails); (b) a one-line change to a plugin agent's body reports that agent, and only it, `updated`; (c) an agent missing from the project reports `new`, and an extra project agent reports `custom`; (d) a project agent with only its `skills:` list or marked section edited reports `unchanged`; (e) after `--sync-agents`, an updated agent carries the plugin's new body and its skill preloads (a `skills:` list and the marked section); (f) a golden test: injected output for a fixed selection, captured from today's code as a fixture before the refactor, is reproduced byte for byte; (g) `--agent-status` writes nothing under the project, and combining either mode with `--refresh` or `--force` exits non-zero. Run against this repo, `--agent-status` reports 13 `unchanged`. |

## Task Grounding

### FIX-001
- **Touches:** `packages/core/commands/rebase-project.md`, `packages/core/scripts/scaffold-project.test.sh`
- **Reuse:** §4.7's existing wording for `verification.md` and the flag summary's four-file governance list (line 1238) [read]
- **Replaces:** the three-file lists at lines 24, 48, 1073–1074, 1130–1133 and 1262; the "…" at line 25, "etc." at line 49, "Every `.md` file in …" and "and any future additions" at lines 1040–1041 [read]
- **Follow:** `packages/full/commands/plugin-only/rebase-project.md` is a symlink to the core file; edit the core file only. Read `AUTHORED_RULES` for test (c) from `scaffold-project.sh` itself, not from a copy [read]
- **Careful:** lines 69–70 name `stack.md` and `constitution.md` as inputs to skill recomputation, not as a governance list; keying test (a) on `process.md` skips them [read]

### FIX-002
- **Touches:** `packages/core/scripts/scaffold-project.sh`, `packages/core/scripts/scaffold-project.test.sh`, `packages/core/commands/rebase-project.md`
- **Reuse:**
  - `strip_skills`, `strip_body_block` and the `BEGIN`/`END` constants in `inject_agent_skills`'s Python program (`scaffold-project.sh:1087–1238`) [read]
  - the plugin-agents directory lookup in `copy_agents` (`agents-lib` with `agents` fallback, lines 189–193) [read]
  - the refresh/force mutual-exclusion check (line 82) as the model for rejecting combinations [read]
- **Replaces:** §2.1 step 3's "byte-level diff of the full file" and §4.1's hand copy in `rebase-project.md` [read]
- **Follow:**
  - argument parsing in the `case` block (lines 46–70) [read]
  - the D004 fixtures (`scaffold-project.test.sh:997–1160`) [read]
- **Careful:**
  - **Inline Python.** The program is a heredoc and reads the selection file and manifest at top level, before any mode branch. Lift it into a function that prints it, and make status mode run without either input [read].
  - **Trailing newlines.** `inject` writes `body.rstrip("\n") + "\n\n" + block + "\n"`, so compare with end-of-file whitespace removed on both sides. Without that, all 13 agents still read as updated [ran].
  - **Dispatch.** The dispatch at line 1692 must route the new modes before `scaffold_project`, or a status call scaffolds into the project [read].
  - **stdout.** `info()` writes to stdout, including `copy_agents`' legacy-source message. Send any such output to stderr in these modes so stdout is status lines only [read].
  - **ShellCheck.** CI runs ShellCheck on `scaffold-project.sh` [read].

## Could Not Verify

*Rewritten by `/audit-build`, 2026-10-12.*

- **Fidelity to the source.** No PRD exists for this work. The source is a defect report from a consuming project's `/rebase-project` run, relayed by the owner, and it is not on disk. The audit checked the delivered code against this TRD only. Whether O1–O3 capture everything that report asked for, and whether anything was left out, was not checked.
- **That a model running the edited command calls the script for the agent step**, rather than diffing or copying files itself. That is prompt adherence, and no test here can check it. Out of scope for a code audit.
- **The Task Grounding line numbers are a pre-build snapshot.** They resolve against base commit `3f25d27`, and the delivered edits to `rebase-project.md` and `scaffold-project.sh` have moved them. This audit did not re-point them. The section is history for two finished tasks, not instructions.

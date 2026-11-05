VERDICT: proceed with these caveats: the six must-pass marks are the TRD's own judgement and need your confirmation; as the Objectives section is laid out, none of those marks reaches the verification loop (`spec-scope.js` reads only the first table, Goals, which has no marks); 12 claims remain unchecked in the TRD's Could Not Verify section, each needing a live canvas, a browser, a live run or a clone.

# Audit report: design-stage

- Date: 2026-11-04
- Audited commit: 874b0a5
- TRD: docs/TRD/design-stage.md
- Source: docs/PRD/design-stage.md

AUDIT: docs/TRD/design-stage.md    SOURCE: docs/PRD/design-stage.md

VERDICT: proceed with these caveats: the six must-pass marks are the TRD's own judgement and need your confirmation; as the Objectives section is laid out, none of those marks reaches the verification loop (`spec-scope.js` reads only the first table, Goals, which has no marks); 12 claims remain unchecked in the TRD's Could Not Verify section, each needing a live canvas, a browser, a live run or a clone.

All 5 of 5 verifiers reported, checked against `docs/PRD/design-stage.md`. The TRD is now 1.1.1 at /Users/james/dev/fortium/ensemble-vnext/docs/TRD/design-stage.md. It still parses as 21 tasks in 10 waves with no dependency cycle.

REDESIGNED — could not be built as written
- How canvas rules reach agents (D12): a read by type link returns only the type's `SKILL.md`. References and the runtime are now read through a canvas link. On a first `/create-design` the command creates the canvas first; `/design-system` reads its references from its own Design System artifact.
- Test runtime (D14): the pinned-runtime tests now run offline. Playwright serves the runtime's two React requests from new root devDependencies `react@18.3.1` and `react-dom@18.3.1`, and aborts any other request that does not go to the local server.
- Design-system files at the approved commit (D4): `/design-system` now commits its built files to `docs/ui/_design-system/<folder>/`. The render library copies that folder in as `ds/<folder>/`, taken from the same commit as the boards.
- Stale-system check (D6): it now takes changed paths from `git log --name-only`. An empty path list fails validation. A recorded commit git cannot find counts as stale, with a reason.
- Conflict copies (D3): `*.repo.dc.html` is skipped by `plan`, `base` and `refresh`, so it is never published as a board.
- Autonomy byte ceiling (D19): the rule pair is 16,995 bytes against a 17,000-byte limit. DSGN-B009 now trims `autonomy.md` once and raises the ceiling in `runtime-integrity.test.sh`, with a reason, only if still over. That test file is added to the task's Touches.
- Setup check (D9): commands now stop on a `design.md` that is missing or unfilled (identical to its template), through a new `design-map.js setup` verb. The template ships to every project, so "missing" alone would never fire.
- Missing browser (D13): Playwright installed without Chromium now also exits 2, naming the install step.

ADDED BACK — in the source, missing from this artifact
- `design.md` now sits beside `verification.md` in the user-owned lists of `rebase-project.md` and `init-project.md`, three copies each (DSGN-P001). Without it, a rebase would overwrite a filled `design.md` with the blank template.
- `design` and `audit-design` are added to the kinds list in `command-status.md`, both copies (DSGN-B005). The addition is 26 bytes, inside the 43 bytes of room.

FIXED THE CITATION — referenced ID did not resolve
- D7: no runtime copy exists in the spike evidence. It now cites `dc-runtime.js` as read from a canvas, the copy DSGN-B003 pins.
- DSGN-D001 (process-doc update): its Serves cell pointed at NFR-1, which says nothing about documentation. It now serves a new objective, O-DOC, sourced from the constitution's "Documentation updated" gate.

CORRECTED A STALE CLAIM — the artifact asserted something the code contradicts
- The Technology Stack table implied Tailwind is a root devDependency. Only esbuild and Playwright are; each fixture declares its own Tailwind.
- Grounding notes that said "see the finding" now name the decision that settles each one.

CONFIRM THESE ARE WANTED — invented machinery, no objective named
- Must-pass on AC-F2.4 (derived board fields), AC-F8.9 (publish and commit), AC-F11.2 (approved boards become tasks) and AC-F12.1 (design comparison). AC-F5.6 and AC-F9.4 are marked the same way. Neither the PRD nor the issue marks anything must-pass. The TRD now states a reason for each mark; keep them or blank them.

REJECTED THESE FINDINGS — and the file that refutes each
- D13, the lockfile half ("package-lock.json not in Touches"): DSGN-B003's Touches in docs/TRD/design-stage.md §9 lists `package-lock.json`, and its Careful note covers the `npm ci` failure.
- D2, the publish-failure rule clash: already handled by §3.5 item 5 and DSGN-P002's Careful note. `command-status.md` is not owner-governed (.claude/rules/constitution.md, Governance Split).
- `stack.md` dependencies: you already ruled on this. Resolved Questions OQ-2 says "Add deps, stack.md untouched".
- The `/create-design` question round versus `autonomy.md`: .claude/rules/autonomy.md, "When one of the four cases does apply", requires a question to state the default it will apply, which is what the recommended option is. D25 now says so.

CAVEAT — what this run did NOT check: 12 claims left unchecked (see the TRD's ## Could Not Verify). Each needs the Artifact tool against a live canvas or type, a hosted browser, a live run (mostly DSGN-T002) or a clone. Two are new from this run: an empty Design System artifact exposes its references, and the npm React files pass the runtime's integrity check when served locally. All verifiers reported. Also, outside the findings: `objectiveRows` in `packages/core/lib/spec-scope.js` reads only the first Objectives table, so this TRD's must-pass marks are invisible to verification until the tables are merged or that reader changes. Which fix to make is your call.
  NO ACTION — Three tasks each add rows to one file, `packages/skills/framework-skills.txt`: P001 adds one `design-setup support` row, P004 adds two `support` rows, B013 adds one `check` row. The TRD states the serialization (P004's note says the three "can never share a wave"), and B013 declares P001 and P004 as dependencies. P001 and P004 declare no edge between them and rely on the shared-file rule plus phase order (Phase 1 versus Phase 2). The only reason the rows give for keeping the rows in separate tasks is that each skill belongs to its own task, not a size or verifiability reason for the file split. This is not a defect, since the serialization is stated; it is noted because the inversion of touches shows the cluster. If P001 and P004 land in the same wave, the file takes two writers.
  NO ACTION — Templated output paths the feature writes at run time (AC-F8.10 in the TRD). Not checkable as repo paths; not counted as misses.
  NO ACTION — Evidence directories that the TRD's own verification runs will produce. Absent until those runs happen.
  NO ACTION — Creation target: the TRD (DSGN-B-series rows and AC-F1.6) says this skill is added. Absent in the repo today, as expected.
  NO ACTION — Creation target named by the TRD; not present in the repo today.
  NO ACTION — Creation target per AC-F12.2 (new skill). Not present today.
  NO ACTION — Creation target per D14 in the TRD. Not present today.
  NO ACTION — Creation targets per DSGN-P003 (live fixture apps). The root test/fixtures/ directory does not exist; test/integration/fixtures/ does, a different path.
  NO ACTION — Creation targets for F7 skills. Not present today.
  NO ACTION — Scaffolded copy of packages/core/templates/claude-directory/rules/design.md (the template the TRD adds). Produced by scaffolding; absent in this project until then.
  NO ACTION — Creation targets for F2-F5 libraries. Not present today.
  NO ACTION — Creation target per D9 (new contract). Not present today.
  NO ACTION — Creation targets for F8-F13 commands and their workflows. Not present today.
  NO ACTION — Test files the TRD adds beside existing command prose tests. Not present today.
  NO ACTION — A test file the TRD names for an existing skill; the skill's __tests__ file is absent today. Likely part of the planned edits, but the TRD does not say it creates this file.
  NO ACTION — Cited as a directory with no creation statement found in the TRD; the directory is absent in the repo.
  NO ACTION — Example paths inside the TRD's own text, not real repo paths; not counted as misses.
  NO ACTION — Heading exists and has a None apply line; no Skill cells, Omitted lines or Inputs cells to check. Passes.

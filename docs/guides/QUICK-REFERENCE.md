# Ensemble quick reference

For someone who already knows the basics. Version 4.15.0. The full map is in
[PROCESS.md](PROCESS.md); every step of every command is in
[reference/README.md](../reference/README.md).

## Which command

| Situation | Command |
|---|---|
| **New feature, full pipeline** | |
| Turn an idea, story or issue into product requirements | `/create-prd <idea or issue>` |
| Check that PRD against its source and the code | `/audit-prd` |
| Turn the PRD into a technical plan with tasks and phases | `/create-trd` |
| Check that TRD against the PRD and the code | `/audit-trd` |
| Build the TRD (review and functional verification run inside it) | `/implement-trd docs/TRD/<feature>.md` |
| Check the delivered code against TRD and PRD; a passing audit closes the feature | `/audit-build` |
| Close a feature yourself, without an audit | `/close-feature` |
| **Shorter paths** | |
| A defect, small change or refactor not tied to the feature in flight | `/plan <what>` (add `--implement` to build it) |
| One change to the feature already in flight | `/amend <what>` |
| A list of small, unrelated issues from a walkthrough | `/sweep <list file or issues>` |
| A job whose output is findings or a report, not code | `/task <prompt or brief.md>` |
| **Verification** | |
| Re-check the built software against the PRD (fixes by default) | `/verify-build` |
| Verification fell short; agree a recovery plan before the next run | `/refine-verification` |
| **Design stage** (screens drawn on the Claude canvas before they are built) | |
| Draw a design: ground it in the code, then as-is, parts and to-be boards | `/create-design <brief, PRD or issue>` |
| Change a design from feedback, or approve boards | `/refine-design <slug> [feedback]` |
| Check a design's boards against its brief, sources and code (changes nothing) | `/audit-design <slug>` |
| Build or rebuild the product's design system and install it on the canvases | `/design-system` |
| After a build ships: compare the build with its boards, mark matches shipped | `/sync-design <slug>` |
| Build from approved boards | `/create-trd --design docs/ui/<slug>` or `/plan --design docs/ui/<slug> --boards <ids>` |
| **Refining an artifact** | |
| Revise a PRD or TRD with your feedback (interactive) | `/refine-prd`, `/refine-trd` |
| Add Figma screenshots, specs and tokens to a TRD | `/augment-trd-figma <figma-url>` |
| **Maintenance** | |
| Set a project up (once) | `/init-project` |
| Refresh the project's `.claude/` runtime from the installed plugin | `/rebase-project` |
| Record what this session learned into `CLAUDE.md`; propose rule changes | `/update-project` |
| Prune `CLAUDE.md` and project artifacts | `/cleanup-project` |
| Bring `docs/` back in line with the code, on a local review branch | `/audit-docs` |
| Tighten `CLAUDE.md` and project context for continued work | `/fold-prompt` |
| **Owner-run setup skills** (interviews; no command runs them for you) | |
| Say which environments verification may reach, and how | `verification-setup` → writes `.claude/rules/verification.md` |
| Say how the product is designed and how to reach a screen | `design-setup` → writes `.claude/rules/design.md` |

**`/plan` or `/amend`?** Whose plan the work belongs to, not its size. Work on the feature in
flight is an amendment to that feature's TRD; `/plan` would start a second TRD.

## Most-used flags

| Command | Flags |
|---|---|
| `/implement-trd` | `--resume` (alias `--continue`), `--reconcile` (re-check delivered work, re-open anything only claimed done), `--no-verify`, `--verify` (with `--resume`: re-enter an interrupted verification loop), `--include-deferred` (build tasks set aside by design, such as `[LIVE]`), `--reset-state` |
| `/verify-build` | `--no-fix` (report only), `--fix [plan-path]`, `--resume`, `--cap N` (iteration budget, default 3) |
| `/audit-build` | `--report-only` (no follow-on `--reconcile`), `--prd <path>`, `--project <dir>` |
| `/audit-prd`, `/audit-trd` | `--source <path>`, `--project <dir>` |
| `/plan` | `--implement`, `--design docs/ui/<slug> --boards <ids>` |
| `/create-trd` | `--design docs/ui/<slug>` |
| `/refine-prd`, `/refine-trd` | `--auto` (unattended), feedback as text |
| `/refine-verification` | `--auto` (an agent answers open items instead of you) |
| `/create-design` | `--new` (no as-is board for a screen that does not exist yet), `--auto` |
| `/refine-design` | `--approve <ids>`, `--auto` |
| `/audit-design` | `--drift` (extra checks, usually after `/sync-design`), `--project <dir>` |
| `/design-system` | `--sync` (code changed: rebuild, republish, reinstall) |
| `/sweep`, `/sync-design` | `--project <dir>` |
| `/task` | `--resume` |
| `/audit-docs` | `--comprehensive` (every doc, not just those touched since the last run) |
| `/rebase-project` | `--dry-run`, `--preserve-all` (keep agents, skills, settings), `--force` (discard uncommitted `.claude/` changes) |
| `/cleanup-project` | `--dry-run`, `--auto`, `--backup-only`, `--aggressive` |
| `/update-project` | `--constitution-only`, `--stack-only` |
| `/init-project` | `minimal` (use detected defaults, no questions), `force` (plain words, not `--` flags) |
| `/augment-trd-figma` | `--trd <path>` |
| `/close-feature` | `[trd-path] ["<note>"]` |

`--chained` (and `/implement-trd --sweep-flag`) exist on several commands but are set by one
command calling another; you do not pass them.

## Where things live

| File | Holds |
|---|---|
| `docs/PRD/<feature>.md` | Product requirements |
| `docs/TRD/<feature>.md` | Technical requirements, task list, phases |
| `docs/ui/<slug>/design-map.json` | A design's boards and their state: draft → approved → building → shipped |
| `.trd-state/current.json` | Pointer to the feature in flight, so commands need no path |
| `.trd-state/<feature>/implement.json` | Build progress: task status, checkpoints, coverage |
| `.trd-state/<feature>/verification-report.md` | Latest functional-verification result |
| `.trd-state/<feature>/verification-plan.md` | Recovery plan written by `/refine-verification` |
| `.trd-state/<feature>/closed.json` | The feature is closed (`/task` writes one too, under `.trd-state/task-<slug>/`) |
| `.trd-state/<feature>/artifacts.json` | Links to the published artifact pages |
| `.claude/rules/constitution.md` | Project absolutes; changes only with your approval |
| `.claude/rules/stack.md` | Technology stack; drives which skills are installed |
| `.claude/rules/verification.md` | Environments, credentials locations, coverage floor; written by `verification-setup` |
| `.claude/rules/design.md` | Design system and how to reach a screen; written by `design-setup` |

## Status banners

| Banner | Means |
|---|---|
| `[STATUS: /<cmd>] DISPATCHED → …` | The turn ends with work in flight; it names what it waits on and when it wakes |
| `[STATUS: /<cmd>] RESUMED → …` | The command picked up again after a wake |
| `═══ COMMAND COMPLETE: /<cmd> ═══` | Done. The readout above it (STATE, DECISIONS, ISSUES, NEXT) says what exists and what to run next |
| `═══ COMMAND STUCK: /<cmd> ═══` | Stopped and cannot continue on its own; `Next:` says what would unblock it |

A long command may also print `PHASE <N>/<M> COMPLETE` at phase boundaries. One run ends with
exactly one COMPLETE or STUCK line, even when one command chains another.

## Verification outcomes

| Outcome | Means | Next |
|---|---|---|
| `satisfied` | Every criterion is met, including every must-pass one | `/audit-build` |
| `unbuilt` | Something asked for was never built | `/refine-verification`, then `/verify-build` |
| `stalled` | A debug round closed nothing | same |
| `stuck` | The iteration budget ran out with gaps still open | same |
| `insufficient-coverage` | Too little was proven to call it, below the coverage floor in `verification.md` | same |
| `must-pass-unproven` | Everything judged passed, but a core item the TRD marked must-pass was not proven | same |
| `setup-failure` | The environment is broken, not the code; nothing was checked | fix the environment, then `/verify-build` |
| `not run` | No success definition could be derived, or `--no-verify` was set | fix the source, or `/verify-build` |

<task id="VRL-B002">
You are implementing ONE task of the TRD at docs/TRD/cap-verification-runs-per-feature.md (repo root /private/tmp/ensemble-vnext-feature-20-cap-verification-runs-per-feature; work only there).

<objective>
| VRL-B002 | `implement-state.js save()`: for files named `implement.json` only, merge `functional_verification.runs` from disk (§3.2, D5); cases in `implement-state.test.js`; copy to `.claude/lib/implement-state.js`. | O1, D5 | `jest` | None | `npx jest packages/core/lib/implement-state.test.js` passes with new cases: disk has 2 runs, incoming has none → written file has 2; incoming has 1 (stale) → 2; disk run 2 finished and incoming run 2 unfinished → finished one kept; incoming has 3 → 3; disk file absent or unparseable → incoming written as is; no other key is merged (a changed `tasks` entry in the incoming object wins); a save to a file not named `implement.json` (for example `verification-state.json`) reads nothing from disk and writes the incoming object byte-for-byte as before; the incoming object is not mutated. `cmp` against `.claude/lib/implement-state.js` reports no difference. |
</objective>

<grounding>
### VRL-B002
- **Touches:** `packages/core/lib/implement-state.js` (`save()`), `packages/core/lib/implement-state.test.js` (new cases in `describe('save()')`), `.claude/lib/implement-state.js` (copy; `.claude/hooks/status.js` requires `../lib/implement-state`, so the hook's writes get the merge only after this copy) [read — `cmp packages/core/lib/implement-state.js .claude/lib/implement-state.js` is clean today [ran]].
- **Reuse:** the existing `save()` body — per-writer temp path + `renameSync`, `mkdirSync(dirname)`, cleanup on throw [read — `function save(filePath, state)`]. Merge the disk file with a plain `fs.readFileSync` + `JSON.parse` inside try/catch (an unreadable or absent file means no merge, per the TRD); do not call `load()` — it falls back to `restoreFromRef`, which runs git. Test style: the existing `save()` cases write to a temp dir and re-read the file [read — `implement-state.test.js` `describe('save()')`, `:78`].
- **Replaces:** nothing is deleted. `implement-trd.md` §3.6's paragraph "A key that exists only on disk is clobbered by that first phase write" stays true for every key except `functional_verification.runs`; VRL-D001 should scope that sentence rather than leave it reading as a blanket rule [read — `implement-trd.md` §3.6 "Set it on the in-memory state object first"].
- **Follow:** the doc-comment style of `save()` (it explains the measured failure behind each choice); return a new object, never mutate `state` (the TRD requires "the incoming object is not mutated").
- **Careful:**
  - `save()` is also the writer for `verification-state.json` and the workflow's other state files: `verify-functional.js` tells its Judge to "load `${STATE_WRITER}` and call `save(${STATE_PATH}, …)`" with `STATE_WRITER` = `<LIB_DIR>/implement-state` [read]. The merge must be a strict no-op when the disk file has no `functional_verification.runs` array (a `verification-state.json` never does), and must not add a `functional_verification` key to an object that had none unless the disk had runs.
  - Case "disk has 2 runs, incoming has no `functional_verification` at all" needs a copy of the incoming object with `functional_verification: { runs }` created; "incoming has 3, disk 2" keeps 3; same `n` with a non-null `finished_at` on either side keeps the finished one; sorted by `n`.
  - `status.js` (the `SubagentStop` hook) imports `implement-state` and writes `implement.json` too; it reads fresh before it writes, so it was never the stale writer, but it now also passes through the merge [read — `packages/core/hooks/status.js:63`].
  - `--reset-state` deletes the file, so the merge sees nothing and the count clears (OQ-5) — that is the one intended exception.
  - Existing byte-level expectations: the `save()` tests compare parsed JSON, not bytes; keep `JSON.stringify(state, null, 2)` so output formatting does not change [read].
  - Collides with no other task's files.

</grounding>

<decision>
Read the TRD's §1.2 "Key Technical Decisions" (D1–D14) and §3 "Technical Specifications" before writing code; they are binding, including the corrections recorded in the changelog row 1.0.1/1.0.2. Two tasks of one change must not rediscover its design independently.
</decision>

<scope_boundaries>
TRD §8 Non-Goals NG1–NG6 are hard limits. Touch only the files your grounding's Touches lists (plus their .claude/ mirror copies it names). Do NOT edit the TRD. Do NOT commit — the orchestrator commits at the phase checkpoint. Completed tasks so far: none.
</scope_boundaries>

<strategy_instructions>
Strategy tdd: write the failing test first, in this same task, then the minimal implementation, then make it pass.
</strategy_instructions>

<check_battery>
  <unit>npx jest &lt;the test files you added or changed&gt; (and npx jest packages/core/commands when you edit a command file)</unit>
  <shell>shellcheck / bats on any .sh you change</shell>
  <instruction>Run these against files you changed. On failure debug it yourself (5 Whys, fix, re-run) before returning; report "failed" only if still red after a genuine attempt. NEVER run a live, model-spending check (anything that starts claude sessions); report such a check "not run".</instruction>
</check_battery>

<discovered>
If you find work this task does not cover, RECORD it and carry on: node -e 'require("./.claude/lib/discovered").record(".trd-state/cap-verification-runs-per-feature",{kind:"bug",foundBy:"VRL-B002",phase:1,summary:"...",file:"...",evidence:"..."})'. Do not fix it and do not spawn an agent for it.
</discovered>

<deliverables>
Return status (success|failed), filesChanged (every path you created or edited, mirrors included), filesDeleted (if any), and a short summary including the test commands you ran and their results.
</deliverables>
</task>
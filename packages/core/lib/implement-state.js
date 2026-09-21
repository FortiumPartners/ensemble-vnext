'use strict';

/**
 * implement-state.js — the only writer of `implement.json` semantics.
 *
 * Extracted from `packages/core/hooks/status.js` (ITR-B004 deletes that file's local copy) so
 * the command and the `SubagentStop` hook share one definition of the cycle instead of two
 * drifting ones. See `docs/TRD/implement-trd-rework.md` §3.3 for the binding spec and its
 * `### ITR-B003` grounding block in §9 for what is reused verbatim vs. reworked.
 *
 * Cycle model (v1.1.0, per §3.3): CYCLE_ORDER collapses the old five-stage loop
 * (`verify_red|implement|verify|simplify|verify_post_simplify|review|complete`) to four
 * positions. `debug` is a position ON the path, not a branch off it — but see the "Known
 * ambiguity" note below `advance()`: §3.3 does not say how a task that PASSES `checks` skips
 * `debug`, and this module deliberately does not guess at that branch inside `advance()`.
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Cycle order
// ---------------------------------------------------------------------------

const CYCLE_ORDER = ['implement', 'checks', 'debug', 'complete'];

// ---------------------------------------------------------------------------
// load / save — atomic, and the ONLY writer of implement.json
// ---------------------------------------------------------------------------

/**
 * Read and parse an implement.json file.
 *
 * Unlike `status.js`'s `readImplementJson()` (which swallows read/parse errors and returns
 * null, because that hook scans many files best-effort), `load()` throws. This module is
 * documented as "the only writer of implement.json semantics" — a caller that can't tell an
 * unreadable file from a freshly-initialized one would make decisions on a false assumption
 * about state that doesn't exist. Callers that want best-effort multi-file scanning (like the
 * hook) should catch around this call themselves.
 *
 * @param {string} filePath - Path to implement.json
 * @returns {Object} Parsed state
 * @throws {Error} If the file cannot be read or is not valid JSON
 */
function load(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Write a state object to implement.json atomically (temp file + rename).
 *
 * Reuses the atomic-write body verbatim from `status.js`'s `advanceCyclePosition()`
 * (`:265-267`), including its `unlinkSync` cleanup of the temp file on throw (`:274`). Two
 * writers exist by construction — the command and the `SubagentStop` hook — and a partial
 * write here is how a `--resume` silently loses a phase.
 *
 * Departs from `status.js` in one way: `advanceCyclePosition()` caught the write error and
 * returned `false`, letting the hook continue best-effort. `save()` re-throws after cleanup.
 * As "the only writer," a caller here needs to know persistence failed rather than silently
 * believing a write it didn't get. See ITR-B003 grounding's "Careful" note: `status.js` also
 * has a *second*, non-atomic write site (`clearSessionId()`, `:198`, plain `writeFileSync`)
 * that is NOT reused here — if that call site becomes a state mutation, it must go through
 * `save()` too, not keep its own bare `writeFileSync`.
 *
 * @param {string} filePath - Path to implement.json
 * @param {Object} state - State object to persist
 * @throws {Error} If the write fails (temp file is cleaned up before re-throwing)
 */
function save(filePath, state) {
  // Per-writer temp path, NOT a shared `.tmp`. The temp+rename dance gives crash
  // atomicity either way, but a shared temp name gives no protection against the
  // SECOND writer -- which is the one this module's header names as existing by
  // construction (the command and the SubagentStop hook, plus one hook process per
  // subagent when a wave runs in parallel).
  //
  // Measured 2026-08-16 with two processes doing 200 saves each to one path:
  // ~40% of saves threw ENOENT because writer A's rename consumed the temp file
  // writer B was about to rename, and a concurrent reader got 1 unparseable read in
  // ~1008 because A's still-open fd kept writing into the inode after B renamed it
  // into place. Both failures are silent: status.js only debug-logs a failed save,
  // so a lost phase advance leaves no trace, and load() throws on the truncated
  // read, which surfaces as STUCK on a state file nobody can explain.
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf-8');
    fs.renameSync(tmpPath, filePath);
  } catch (error) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      /* ignore — tmp file may not have been created yet */
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// advance — mechanical, outcome-blind forward step
// ---------------------------------------------------------------------------

/**
 * Advance `taskId`'s cycle_position by one step along CYCLE_ORDER.
 *
 * Safety guards, reused in behaviour from `status.js`'s `advanceCyclePosition()`:
 *
 *  - **Active-task guard.** `status.js` scanned ALL tasks for "the" single `in_progress` entry
 *    (`inProgressEntries.length !== 1`, `:233`) because its hook didn't know which task to
 *    advance. That mechanism does not carry forward as-is: `task-graph.js` now supports
 *    parallel waves, where more than one task is legitimately `in_progress` at once, and a
 *    global "exactly one in_progress in the whole file" check would wrongly block every
 *    advance during a parallel wave. Since callers now pass `taskId` explicitly, the guard is
 *    re-scoped to that one task: `advance()` only proceeds when `state.tasks[taskId].status
 *    === 'in_progress'`. This preserves the guard's SAFETY PROPERTY (don't advance a task
 *    that isn't actually active) while dropping the now-obsolete cross-task scan. Flagged as
 *    an interpretation, not a literal port — see the delivery report.
 *  - **Active-debugging skip**, reused close to verbatim: skip when `retry_count > 0` or
 *    `current_problem` is a non-empty string (`status.js:244`) — UNLESS the task is already
 *    AT `debug`, in which case that is precisely the position a successful retry needs to
 *    leave. Applying the guard unscoped (as `status.js` did) would make `debug -> complete`
 *    unreachable now that `debug` is itself a cycle position instead of a side-channel.
 *
 * @param {Object} state - The implement.json state object (mutated in place)
 * @param {string} taskId - The task to advance
 * @returns {{state: Object, from: string, to: string}|null} The transition, or null when not
 *   advanceable (task not in_progress, mid-debug retry, already at the terminal position, or
 *   an unrecognized cycle_position — e.g. a state file written before this change).
 */
function advance(state, taskId) {
  if (!state || !state.tasks || !state.tasks[taskId]) {
    throw new Error(`advance(): unknown task "${taskId}"`);
  }

  const task = state.tasks[taskId];

  if (task.status !== 'in_progress') {
    return null;
  }

  const currentPosition = task.cycle_position || CYCLE_ORDER[0];
  const currentIndex = CYCLE_ORDER.indexOf(currentPosition);

  // Unknown cycle_position (e.g. a pre-migration file carrying 'simplify' or 'verify_red'):
  // record a migration warning rather than throwing. A half-migrated state file must not
  // wedge --resume.
  if (currentIndex === -1) {
    if (!Array.isArray(state.warnings)) {
      state.warnings = [];
    }
    state.warnings.push(
      `implement-state: task "${taskId}" has unrecognized cycle_position ` +
        `"${currentPosition}" — needs migration to CYCLE_ORDER ${JSON.stringify(CYCLE_ORDER)}.`
    );
    return null;
  }

  const isAtDebug = currentPosition === 'debug';
  const activeDebugging =
    (typeof task.retry_count === 'number' && task.retry_count > 0) ||
    (task.current_problem && String(task.current_problem).trim() !== '');

  if (activeDebugging && !isAtDebug) {
    return null;
  }

  if (currentIndex >= CYCLE_ORDER.length - 1) {
    return null;
  }

  const nextPosition = CYCLE_ORDER[currentIndex + 1];
  task.cycle_position = nextPosition;
  task.last_advanced = new Date().toISOString();

  return { state, from: currentPosition, to: nextPosition };
}

// ---------------------------------------------------------------------------
// recordResult — records a stage outcome onto a task
// ---------------------------------------------------------------------------

/**
 * Record the outcome of the task's current stage.
 *
 * This function records data; it does not itself decide branch transitions in CYCLE_ORDER
 * (see the "Known ambiguity" note below). On `status: 'failed'` it increments `retry_count`
 * and sets `current_problem`, mirroring the fields `status.js`'s debug guard reads
 * (`retry_count > 0 || current_problem`, `:244`). On `status: 'success'` it clears
 * `current_problem` and stamps `completed_at`.
 *
 * Known ambiguity (flagged per the ITR-B003 task instructions rather than guessed at):
 * §3.3 states "a task that fails its checks moves checks -> debug" but says nothing about
 * what happens when checks PASS — a literal `advance()` index+1 from 'checks' always lands
 * on 'debug' regardless of outcome, which would run every passing task through debug too.
 * Neither `advance()` (outcome-blind, see above) nor `recordResult()` (position-blind by
 * design, so it stays a simple recorder rather than absorbing cycle-transition logic) resolves
 * this. The caller (the command, which is the documented state-write-before-delegate owner —
 * see `status.js`'s own header comment) must explicitly set `cycle_position` when a check
 * passes: e.g. `task.cycle_position = 'complete'` to skip `debug`, or leave it for `advance()`
 * to walk into `debug` on failure. This module does not perform that skip on the caller's
 * behalf because §3.3 does not specify the condition precisely enough to encode it safely.
 *
 * @param {Object} state - The implement.json state object (mutated in place)
 * @param {string} taskId - The task whose result is being recorded
 * @param {{status?: string, filesChanged?: string[], error?: string}} result
 * @returns {Object} The updated state
 */
function recordResult(state, taskId, { status, filesChanged, filesDeleted, error } = {}, opts = {}) {
  if (!state || !state.tasks || !state.tasks[taskId]) {
    throw new Error(`recordResult(): unknown task "${taskId}"`);
  }

  const task = state.tasks[taskId];

  if (filesChanged !== undefined) {
    task.files_changed = filesChanged;
  }
  if (filesDeleted !== undefined) {
    task.files_deleted = filesDeleted;
  }

  // ATTESTATION CHECK. A task agent SELF-REPORTS its status and the files it changed, and
  // until 2026-09-20 nothing looked at whether those files exist. Measured consequence in a
  // live project: four tasks across phases 1-3 sat in the state file as status:"success"
  // with no code behind them -- `engine/transports.ts` and `engine/acquire.ts` were never
  // written -- found only later by /audit-build. Worse, `--resume` SKIPS anything already
  // marked success, so re-running could not repair them; they had to be re-entered by hand.
  //
  // Deliberately narrow: a success claim fails only when NONE of the claimed files exists.
  // One missing file among several is ordinary (a rename, a path typo in the report) and is
  // recorded rather than fatal. Zero-of-N is the phantom-task signature and nothing else.
  //
  // It lives here, not in implement-phase.js, because that script "opens no file and runs no
  // shell" by design. This module already has fs and is the one choke point every task
  // result passes through.
  //
  // DELETION IS ATTESTED BY ABSENCE, not by presence. A task whose work is REMOVING files
  // has nothing to point at, and until 2026-09-20 there was no field for it: the error text
  // below told the agent to "record that explicitly" while no parameter accepted it. So a
  // deletion task reported its removed paths as filesChanged, failed zero-of-N, retried,
  // failed again, and reached STUCK at three -- and `reconcile()` then re-opened it on every
  // run, forever. `filesDeleted` closes that: those paths must NOT exist, and a task
  // claiming only deletions is never judged by the presence rule.
  if (status === 'success') {
    const root = opts.projectRoot || process.cwd();
    const gone = (f) => {
      try { return !fs.existsSync(path.resolve(root, f)); } catch { return false; }
    };

    if (Array.isArray(filesDeleted) && filesDeleted.length > 0) {
      const stillThere = filesDeleted.filter((f) => !gone(f));
      task.files_not_deleted = stillThere.length ? stillThere : undefined;
      if (stillThere.length === filesDeleted.length) {
        task.status = 'failed';
        task.retry_count = (typeof task.retry_count === 'number' ? task.retry_count : 0) + 1;
        task.current_problem =
          `reported success but NONE of the ${filesDeleted.length} file(s) it claims to have ` +
          `deleted are gone: ${stillThere.join(', ')}.`;
        return state;
      }
    }

    if (Array.isArray(filesChanged) && filesChanged.length > 0) {
      const missing = filesChanged.filter(gone);
      task.files_missing = missing.length ? missing : undefined;
      if (missing.length === filesChanged.length) {
        task.status = 'failed';
        task.retry_count = (typeof task.retry_count === 'number' ? task.retry_count : 0) + 1;
        task.current_problem =
          `reported success but NONE of the ${filesChanged.length} claimed file(s) exist: ` +
          `${missing.join(', ')}. If this task's work was deletion, pass those paths as ` +
          `filesDeleted instead — they are attested by absence.`;
        return state;
      }
    }
  }

  if (status === 'failed') {
    task.status = 'failed';
    task.retry_count = (typeof task.retry_count === 'number' ? task.retry_count : 0) + 1;
    task.current_problem = error || task.current_problem || 'unspecified failure';
  } else if (status === 'success') {
    task.status = 'success';
    task.current_problem = null;
    task.completed_at = new Date().toISOString();
  } else if (status !== undefined) {
    task.status = status;
    if (error !== undefined) {
      task.current_problem = error;
    }
  }

  return state;
}

// ---------------------------------------------------------------------------
// checkpoint — phase-level durable marker
// ---------------------------------------------------------------------------

/**
 * Record a phase checkpoint and update the recovery marker.
 *
 * Follows the `checkpoints[]` / `recovery` shape documented in
 * `packages/core/commands/implement-trd.md` "### State File Schema" (`:590-646`): appends
 * `{phase, commit, review, timestamp}` to `state.checkpoints`, and sets
 * `state.recovery.last_healthy_checkpoint` / `last_checkpoint_timestamp` from it, clearing
 * `interrupted`. §3.3 does not fully specify this function's body (only the interface line);
 * this is the minimal shape consistent with the existing schema doc, called out per ITR-B003's
 * instruction to flag rather than silently invent.
 *
 * @param {Object} state - The implement.json state object (mutated in place)
 * @param {number} phase - The phase number being checkpointed
 * @param {{commit?: string, review?: Object}} details
 * @returns {Object} The updated state
 */
function checkpoint(state, phase, { commit, review } = {}) {
  if (!state) {
    throw new Error('checkpoint(): state is required');
  }

  const timestamp = new Date().toISOString();

  if (!Array.isArray(state.checkpoints)) {
    state.checkpoints = [];
  }
  state.checkpoints.push({ phase, commit: commit || null, review: review || null, timestamp });

  state.recovery = {
    ...(state.recovery || {}),
    last_healthy_checkpoint: commit || (state.recovery && state.recovery.last_healthy_checkpoint) || null,
    last_checkpoint_timestamp: timestamp,
    interrupted: false,
    interrupt_reason: null,
  };

  return state;
}

/**
 * Re-attest every task claiming success against disk, and un-mark the ones that lied.
 *
 * WHY THIS IS NOT `--resume`. `--resume` re-dispatches anything not `status: "success"`, so
 * a task falsely marked success is SKIPPED and the command reports a clean run over a hole.
 * That is exactly what happened in `lightning-lane-dining` on 2026-09-09: four tasks sat as
 * success with no code behind them, and re-running could not repair them -- they had to be
 * re-entered as new tasks by hand after `/audit-build` found them.
 *
 * So `--reconcile` is a different verb from `--resume`, not a synonym. Resume means "continue
 * where you stopped". Reconcile means "make the delivered state match the TRD" -- which
 * includes disbelieving a success claim that disk contradicts.
 *
 * Narrow in the same way `recordResult`'s attestation is: a task is only un-marked when NONE
 * of its claimed files exists. One missing file among several is a rename or a typo in the
 * report, not a phantom.
 *
 * @param {Object} state
 * @param {{projectRoot?: string}} [opts]
 * @returns {{reopened: string[], checked: number}} ids moved back to pending, and how many
 *          success claims were examined
 */
function reconcile(state, opts = {}) {
  const root = opts.projectRoot || process.cwd();
  const reopened = [];
  let checked = 0;
  if (!state || !state.tasks) return { reopened, checked };

  for (const [id, task] of Object.entries(state.tasks)) {
    if (!task || task.status !== 'success') continue;
    const claimed = Array.isArray(task.files_changed) ? task.files_changed : [];
    if (claimed.length === 0) continue; // nothing claimed, nothing to disbelieve
    // A deletion task's paths are SUPPOSED to be gone. Judging them by the presence rule
    // re-opened completed deletion work on every --reconcile run, forever.
    const deleted = new Set(Array.isArray(task.files_deleted) ? task.files_deleted : []);
    if (claimed.every((f) => deleted.has(f))) continue;
    checked++;
    const missing = claimed.filter((f) => {
      try { return !fs.existsSync(path.resolve(root, f)); } catch { return false; }
    });
    if (missing.length === claimed.length) {
      task.status = 'pending';
      task.cycle_position = 'implement';
      task.completed_at = null;
      task.files_missing = missing;
      task.current_problem =
        `reconcile: was marked success but none of its ${claimed.length} claimed file(s) ` +
        `exist (${missing.join(', ')}) — reopened for implementation`;
      reopened.push(id);
    }
  }
  return { reopened, checked };
}

module.exports = {
  reconcile,
  CYCLE_ORDER,
  load,
  save,
  advance,
  recordResult,
  checkpoint,
};

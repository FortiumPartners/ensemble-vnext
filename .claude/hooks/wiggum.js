#!/usr/bin/env node

/**
 * Wiggum Hook: Autonomous execution mode for /implement-trd.
 *
 * This hook fires on Stop events when --wiggum flag is active.
 * It intercepts Claude's exit attempts and re-injects the implementation prompt
 * until all tasks are complete or max iterations is reached.
 *
 * Named after Chief Wiggum from The Simpsons - persistent, doesn't give up easily.
 *
 * Environment Variables:
 *   WIGGUM_ACTIVE         - Set to "1" to enable (must be set by implement-trd)
 *   WIGGUM_MAX_ITERATIONS - Maximum iterations before allowing exit (default: 50)
 *   WIGGUM_DEBUG          - Enable debug logging to stderr (default: "0")
 *
 * Hook Type: Stop
 *   - Fires when Claude attempts to end the conversation
 *   - Can block exit by returning continue: true with decision: "block"
 *   - Re-injects the original prompt via the "reason" field
 *
 * Completion Detection (TRD-C404, TRD-C407):
 *   1. Parse JSONL transcript for <promise>COMPLETE</promise> tag
 *   2. Check implement.json for 100% task completion
 *   3. Check if max iterations reached
 *
 * Safety:
 *   - Infinite-loop guard is the iteration cap (WIGGUM_MAX_ITERATIONS, default 50) plus
 *     completion detection (promise / all-tasks-complete). While work remains and the cap is
 *     not reached, the hook blocks every Stop and re-injects; once done or capped, it exits.
 *   - Claude Code's own `stop_hook_active` (from hook input) is logged for visibility but does
 *     NOT force exit. (Previously a self-managed flag forced exit on every other Stop, abandoning
 *     incomplete work — that was a bug; the iteration cap is the real termination guarantee.)
 *
 * Output format (to stdout):
 *   Block exit:
 *     {"continue":true,"decision":"block","reason":"...prompt..."}
 *
 *   Allow exit:
 *     {"continue":true}
 *
 * Exit codes:
 *   0 - Hook processed successfully
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Constants
const TRD_STATE_DIR = '.trd-state';
const DEFAULT_MAX_ITERATIONS = 50;
const COMPLETION_PROMISE_TAG = '<promise>COMPLETE</promise>';

// State file for tracking iterations and preventing infinite loops
const WIGGUM_STATE_FILE = '.trd-state/wiggum-state.json';
const LOCK_FILE = '.trd-state/wiggum.lock';

// Task status constants
const TASK_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  SUCCESS: 'success',
  COMPLETE: 'complete',
  FAILED: 'failed',
  BLOCKED: 'blocked'
};

// Cycle position constants
const CYCLE_POSITION = {
  IMPLEMENT: 'implement',
  VERIFY: 'verify',
  DEBUG: 'debug',
  SIMPLIFY: 'simplify',
  VERIFY_POST_SIMPLIFY: 'verify_post_simplify',
  REVIEW: 'review',
  UPDATE_ARTIFACTS: 'update_artifacts',
  COMPLETE: 'complete'
};

/**
 * Debug logging to stderr.
 * Only outputs when WIGGUM_DEBUG=1.
 * @param {string} msg - Message to log
 */
function debugLog(msg) {
  if (process.env.WIGGUM_DEBUG === '1') {
    const timestamp = new Date().toISOString();
    console.error(`[WIGGUM ${timestamp}] ${msg}`);
  }
}

/**
 * Acquire a file lock to prevent concurrent execution.
 * @param {string} projectRoot - Path to project root
 * @returns {boolean} True if lock acquired, false otherwise
 */
function acquireLock(projectRoot) {
  const lockPath = path.join(projectRoot, LOCK_FILE);
  try {
    // Check if lock exists and is stale (> 5 minutes old)
    if (fs.existsSync(lockPath)) {
      const stats = fs.statSync(lockPath);
      const ageMs = Date.now() - stats.mtimeMs;
      if (ageMs < 5 * 60 * 1000) {
        debugLog('Lock file exists and is recent - another process may be running');
        return false;
      }
      debugLog('Lock file is stale - removing');
      fs.unlinkSync(lockPath);
    }
    // Create lock file with PID
    fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, timestamp: new Date().toISOString() }));
    return true;
  } catch (error) {
    debugLog(`Error acquiring lock: ${error.message}`);
    return false;
  }
}

/**
 * Release the file lock.
 * @param {string} projectRoot - Path to project root
 */
function releaseLock(projectRoot) {
  const lockPath = path.join(projectRoot, LOCK_FILE);
  try {
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
    }
  } catch (error) {
    debugLog(`Error releasing lock: ${error.message}`);
  }
}

/**
 * Validate and parse WIGGUM_MAX_ITERATIONS environment variable.
 * @returns {number} Validated max iterations value
 */
function validateMaxIterations() {
  const envValue = process.env.WIGGUM_MAX_ITERATIONS;
  if (!envValue) {
    return DEFAULT_MAX_ITERATIONS;
  }
  const parsed = parseInt(envValue, 10);
  if (isNaN(parsed) || parsed < 1) {
    debugLog(`Invalid WIGGUM_MAX_ITERATIONS: "${envValue}" - using default ${DEFAULT_MAX_ITERATIONS}`);
    return DEFAULT_MAX_ITERATIONS;
  }
  if (parsed > 1000) {
    debugLog(`WIGGUM_MAX_ITERATIONS capped at 1000 (was ${parsed})`);
    return 1000;
  }
  return parsed;
}

/**
 * Validate cwd input and return resolved absolute path.
 * @param {string|undefined} inputCwd - Input cwd from hook data
 * @returns {string|null} Validated cwd or null if invalid
 */
function validateCwd(inputCwd) {
  const cwd = inputCwd || process.cwd();
  // Resolve to absolute path
  const resolved = path.resolve(cwd);
  // Check it exists
  if (!fs.existsSync(resolved)) {
    debugLog(`CWD does not exist: ${resolved}`);
    return null;
  }
  return resolved;
}

/**
 * Find project root by walking up from cwd looking for .trd-state.
 * @param {string} startDir - Directory to start search from
 * @returns {string|null} Path to project root or null if not found
 */
function findProjectRoot(startDir) {
  let currentDir = startDir;
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const trdStatePath = path.join(currentDir, TRD_STATE_DIR);
    if (fs.existsSync(trdStatePath) && fs.statSync(trdStatePath).isDirectory()) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }

  return null;
}

/**
 * Read wiggum state file.
 * @param {string} projectRoot - Path to project root
 * @returns {Object} Wiggum state
 */
function readWiggumState(projectRoot) {
  const statePath = path.join(projectRoot, WIGGUM_STATE_FILE);
  try {
    if (fs.existsSync(statePath)) {
      const content = fs.readFileSync(statePath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    debugLog(`Error reading wiggum state: ${error.message}`);
  }

  // Default state
  return {
    iteration_count: 0,
    stop_hook_active: false,
    last_prompt: null,
    started_at: null
  };
}

/**
 * Write wiggum state file atomically.
 * Writes to a temp file first, then renames to prevent corruption.
 * @param {string} projectRoot - Path to project root
 * @param {Object} state - Wiggum state to write
 */
function writeWiggumState(projectRoot, state) {
  const statePath = path.join(projectRoot, WIGGUM_STATE_FILE);
  const tempPath = statePath + '.tmp.' + process.pid;
  try {
    const stateDir = path.dirname(statePath);
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }
    // Write to temp file first
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf-8');
    // Atomic rename
    fs.renameSync(tempPath, statePath);
    debugLog(`Wrote wiggum state: iteration=${state.iteration_count}`);
  } catch (error) {
    // Clean up temp file if it exists
    try { fs.unlinkSync(tempPath); } catch (e) { /* ignore */ }
    debugLog(`Error writing wiggum state: ${error.message}`);
  }
}

/**
 * Find current.json to get the active TRD.
 * @param {string} projectRoot - Path to project root
 * @returns {Object|null} Current context or null
 */
function readCurrentJson(projectRoot) {
  const currentPath = path.join(projectRoot, TRD_STATE_DIR, 'current.json');
  try {
    if (fs.existsSync(currentPath)) {
      const content = fs.readFileSync(currentPath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    debugLog(`Error reading current.json: ${error.message}`);
  }
  return null;
}

/**
 * Read implement.json for the active TRD.
 * @param {string} projectRoot - Path to project root
 * @returns {Object|null} Implementation state or null
 */
function readImplementJson(projectRoot) {
  // First try to get from current.json
  const current = readCurrentJson(projectRoot);
  if (current && current.status) {
    try {
      const content = fs.readFileSync(path.join(projectRoot, current.status), 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      debugLog(`Error reading implement.json from current: ${error.message}`);
    }
  }

  // Fallback: find any implement.json in .trd-state
  const trdStateDir = path.join(projectRoot, TRD_STATE_DIR);
  try {
    const entries = fs.readdirSync(trdStateDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const implementPath = path.join(trdStateDir, entry.name, 'implement.json');
        if (fs.existsSync(implementPath)) {
          const content = fs.readFileSync(implementPath, 'utf-8');
          return JSON.parse(content);
        }
      }
    }
  } catch (error) {
    debugLog(`Error searching for implement.json: ${error.message}`);
  }

  return null;
}

/**
 * Check if all tasks in implement.json are complete (TRD-C407).
 * @param {Object} implementData - Implementation state data
 * @returns {Object} {done: boolean, completed: number, total: number}
 */
function checkTaskCompletion(implementData) {
  if (!implementData || !implementData.tasks) {
    return { done: false, completed: 0, total: 0 };
  }

  const tasks = implementData.tasks;
  const taskIds = Object.keys(tasks);
  const total = taskIds.length;

  if (total === 0) {
    return { done: true, completed: 0, total: 0 };
  }

  let completed = 0;
  for (const taskId of taskIds) {
    const task = tasks[taskId];
    if (task.status === TASK_STATUS.SUCCESS || task.status === TASK_STATUS.COMPLETE) {
      completed++;
    }
  }

  const done = completed === total;
  debugLog(`Task completion: ${completed}/${total} (${done ? 'DONE' : 'in progress'})`);

  return { done, completed, total };
}

/**
 * Check for completion promise in transcript (TRD-C404).
 * @param {Object} hookData - Hook data from Claude
 * @returns {boolean} True if completion promise found
 */
function checkCompletionPromise(hookData) {
  // Prefer the platform-provided last_assistant_message field over hand-parsing
  // transcript_path — the Stop payload carries it directly, and the docs warn the
  // transcript file on disk can lag the in-memory conversation. Only fall back to
  // reading transcript_path when the field is absent (older harness versions).
  if (typeof hookData.last_assistant_message === 'string' && hookData.last_assistant_message.length > 0) {
    if (hookData.last_assistant_message.includes(COMPLETION_PROMISE_TAG)) {
      debugLog('Found completion promise in last_assistant_message');
      return true;
    }
  } else if (hookData.transcript_path) {
    try {
      const transcriptContent = fs.readFileSync(hookData.transcript_path, 'utf-8');
      if (transcriptContent.includes(COMPLETION_PROMISE_TAG)) {
        debugLog('Found completion promise in transcript');
        return true;
      }
    } catch (error) {
      debugLog(`Error reading transcript: ${error.message}`);
    }
  }

  // Check session_output if provided
  if (hookData.session_output) {
    if (hookData.session_output.includes(COMPLETION_PROMISE_TAG)) {
      debugLog('Found completion promise in session output');
      return true;
    }
  }

  // Check messages array if provided
  if (hookData.messages && Array.isArray(hookData.messages)) {
    for (const msg of hookData.messages) {
      if (msg.content && typeof msg.content === 'string') {
        if (msg.content.includes(COMPLETION_PROMISE_TAG)) {
          debugLog('Found completion promise in messages');
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Build the re-injection prompt (TRD-C403).
 * @param {number} iteration - Current iteration number
 * @param {number} maxIterations - Maximum iterations
 * @param {Object} completion - Completion status
 * @param {Object} implementData - Implementation state
 * @returns {string} Prompt to re-inject
 */
function buildReinjectionPrompt(iteration, maxIterations, completion, implementData) {
  const { completed, total } = completion;
  const remaining = total - completed;

  let currentPhase = implementData?.phase_cursor || 1;
  let currentTask = 'unknown';
  let attempted = [];

  if (implementData?.tasks) {
    for (const [taskId, task] of Object.entries(implementData.tasks)) {
      const done = task.status === TASK_STATUS.SUCCESS || task.status === TASK_STATUS.COMPLETE;
      if (!done && currentTask === 'unknown') currentTask = taskId;
      // WHAT WAS ALREADY TRIED. implement.json records current_problem and
      // retry_count per task and this prompt ignored both until 2026-08-17, so a
      // task that had failed twice the same way was re-injected as a bare
      // "Next Task: X" -- the loop could repeat an identical failing approach with
      // no signal that it had already been tried.
      //
      // Note the mechanism: this reads from DISK (implement.json), not from
      // conversation history. That is the actual Ralph-loop practice -- fresh
      // context each iteration, state persisted to the filesystem, "progress does
      // not lie in the model's memory but in the repository". An earlier version
      // of this comment justified it as "feeding prior context forward", which is
      // backwards: Ralph deliberately discards context and relies on disk.
      if (!done && (task.retry_count > 0 || task.current_problem)) {
        attempted.push(
          `  - ${taskId}: ${task.retry_count || 0} prior attempt(s)` +
          (task.current_problem ? ` — last problem: ${String(task.current_problem).slice(0, 200)}` : '')
        );
      }
    }
  }

  // Our loop BLOCKS Stop rather than spawning a fresh session, so the transcript
  // normally survives into the next iteration and does not need re-feeding. The
  // exception is compaction: on a long run the history is summarised away, and
  // precompact.js writes the decision trail to session-log.md precisely for that.
  // Point at it explicitly -- after a compaction the agent otherwise resumes with
  // counts and no reasoning.
  const feature = implementData?.trd_file
    ? String(implementData.trd_file).replace(/^docs\/TRD\//, '').replace(/\.md$/, '')
    : null;
  const logPath = feature ? `.trd-state/${feature}/session-log.md` : '.trd-state/<feature>/session-log.md';

  const prompt = `
[WIGGUM AUTONOMOUS MODE - Iteration ${iteration}/${maxIterations}]

Status: ${completed}/${total} tasks complete (${remaining} remaining)
Current Phase: ${currentPhase}
Next Task: ${currentTask}
${attempted.length ? `\nALREADY ATTEMPTED — do not repeat an approach that already failed:\n${attempted.join('\n')}\n` : ''}
If your context was compacted since the last iteration, read ${logPath} FIRST — it
carries the decision trail and in-flight reasoning that compaction removed.

Continue implementing the TRD. Do not stop until all tasks are complete.
When all tasks are done, emit: <promise>COMPLETE</promise>

Resume /implement-trd execution from where you left off.
`.trim();

  return prompt;
}

/**
 * Output hook result to stdout.
 * @param {boolean} block - Whether to block exit
 * @param {string|null} reason - Reason/prompt for re-injection (if blocking)
 */
function outputResult(block, reason = null) {
  // Stop hooks should NOT include hookSpecificOutput.hookEventName
  // The valid format is just: { continue: true } or { continue: true, decision: "block", reason: "..." }
  const output = {
    continue: true
  };

  if (block && reason) {
    output.decision = 'block';
    output.reason = reason;
  }

  console.log(JSON.stringify(output));
  process.exit(0);
}

/**
 * Main hook logic.
 * @param {Object} hookData - Hook data from stdin
 */
async function main(hookData) {
  // 1. Check if wiggum mode is active
  if (process.env.WIGGUM_ACTIVE !== '1') {
    debugLog('Wiggum mode not active (WIGGUM_ACTIVE != 1)');
    outputResult(false);
    return;
  }

  debugLog('Wiggum mode is ACTIVE');

  // 2. Validate and get working directory
  const cwd = validateCwd(hookData.cwd);
  if (!cwd) {
    outputResult(false);
    return;
  }

  // 3. Find project root
  const projectRoot = findProjectRoot(cwd);

  if (!projectRoot) {
    debugLog('No project root found (no .trd-state directory)');
    outputResult(false);
    return;
  }
  debugLog(`Project root: ${projectRoot}`);

  // 4. Acquire lock to prevent concurrent execution
  if (!acquireLock(projectRoot)) {
    debugLog('Could not acquire lock - skipping');
    outputResult(false);
    return;
  }

  // 5. Load wiggum state
  const wiggumState = readWiggumState(projectRoot);

  // 6. Log Claude Code's stop_hook_active (informational only). Do NOT force exit on it — the
  //    iteration cap below is the infinite-loop guard. Forcing exit here would quit with work
  //    unfinished (the original every-other-Stop bug).
  if (hookData.stop_hook_active) {
    debugLog('hookData.stop_hook_active is set (already continuing from a prior block)');
  }

  // 7. Get max iterations using validated function
  const maxIterations = validateMaxIterations();
  debugLog(`Max iterations: ${maxIterations}`);

  // 8. Increment iteration count (TRD-C405)
  wiggumState.iteration_count++;
  const iteration = wiggumState.iteration_count;
  debugLog(`Current iteration: ${iteration}`);

  // 9. Check iteration bounds (TRD-C405)
  if (iteration > maxIterations) {
    debugLog(`Max iterations (${maxIterations}) reached - allowing exit`);
    // Reset state for next run
    wiggumState.iteration_count = 0;
    wiggumState.stop_hook_active = false;
    writeWiggumState(projectRoot, wiggumState);
    releaseLock(projectRoot);
    outputResult(false);
    return;
  }

  // 10. Check for completion promise (TRD-C404)
  if (checkCompletionPromise(hookData)) {
    debugLog('Completion promise detected - allowing exit');
    // Reset state
    wiggumState.iteration_count = 0;
    wiggumState.stop_hook_active = false;
    writeWiggumState(projectRoot, wiggumState);
    releaseLock(projectRoot);
    outputResult(false);
    return;
  }

  // 11. Check task completion in implement.json (TRD-C407)
  const implementData = readImplementJson(projectRoot);
  const completion = checkTaskCompletion(implementData);

  if (completion.done) {
    debugLog('All tasks complete - allowing exit');
    // Reset state
    wiggumState.iteration_count = 0;
    wiggumState.stop_hook_active = false;
    writeWiggumState(projectRoot, wiggumState);
    releaseLock(projectRoot);
    outputResult(false);
    return;
  }

  // 12. Not done and under the iteration cap - persist progress and block exit (re-inject).
  if (!wiggumState.started_at) {
    wiggumState.started_at = new Date().toISOString();
  }
  writeWiggumState(projectRoot, wiggumState);

  // 13. Build re-injection prompt
  const prompt = buildReinjectionPrompt(iteration, maxIterations, completion, implementData);
  debugLog(`Blocking exit, re-injecting prompt (iteration ${iteration})`);

  // 14. Release lock and output block decision with prompt
  // Note: We release lock here because we're blocking exit - the next iteration
  // will need to acquire the lock again
  releaseLock(projectRoot);
  outputResult(true, prompt);
}

// Read hook data from stdin
let inputData = '';

process.stdin.setEncoding('utf8');

process.stdin.on('data', (chunk) => {
  inputData += chunk;
});

process.stdin.on('end', async () => {
  try {
    const hookData = inputData.trim() ? JSON.parse(inputData) : {};
    await main(hookData);
  } catch (error) {
    debugLog(`Fatal error: ${error.message}`);
    // Non-blocking on errors - allow exit
    outputResult(false);
  }
});

// Handle case where stdin is empty or closed immediately
process.stdin.on('error', (error) => {
  debugLog(`stdin error: ${error.message}`);
  outputResult(false);
});

// Export for testing
module.exports = {
  main,
  findProjectRoot,
  readWiggumState,
  writeWiggumState,
  readCurrentJson,
  readImplementJson,
  checkTaskCompletion,
  checkCompletionPromise,
  buildReinjectionPrompt,
  debugLog,
  acquireLock,
  releaseLock,
  validateMaxIterations,
  validateCwd,
  COMPLETION_PROMISE_TAG,
  DEFAULT_MAX_ITERATIONS,
  TASK_STATUS,
  CYCLE_POSITION,
  LOCK_FILE
};

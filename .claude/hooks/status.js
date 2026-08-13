#!/usr/bin/env node

/**
 * Status Hook: durable-state safety net for implement.json (SubagentStop).
 *
 * Complements the implement-trd command, which is the primary driver of in-session
 * stage progression (via the native Task tools / blockedBy graph) and writes the
 * durable implement.json. This hook is a best-effort safety net that runs on every
 * SubagentStop to: (1) clear session_id on subagent completion (TRD-H004), and
 * (2) advance cycle_position for the single in-progress task so the DURABLE marker
 * keeps moving even if the session dies mid-loop.
 *
 * Design intent: the command sets cycle_position when ENTERING a stage
 * (state-write-before-delegate); this hook advances it when the stage's subagent
 * stops. They are meant to interleave, not both advance the same transition.
 *
 * Safety guards (fix for the previously-documented over-advance bug):
 *   - advanceCyclePosition() SKIPS when the in-progress task signals active debugging
 *     (retry_count > 0 OR current_problem is set). This prevents the hook from
 *     advancing past 'verify'/'verify_post_simplify' during DEBUG cycles, when the
 *     command will re-dispatch verify after app-debugger completes.
 *   - 'verify_red' is now part of CYCLE_ORDER (advances to 'implement') so TDD's
 *     RED phase is tracked rather than ignored.
 *   - The command's explicit cycle_position writes remain authoritative; this hook
 *     stays a best-effort safety net for happy-path stage transitions.
 *
 * Environment Variables:
 *   STATUS_HOOK_DISABLE - Set to "1" to disable (default: enabled)
 *   STATUS_HOOK_DEBUG   - Enable debug logging to stderr (default: "0")
 *
 * Hook Type: SubagentStop
 *   - Fires when a subagent (Task) completes
 *   - Reads implement.json to track session state
 *   - Logs verification status
 *
 * Session Tracking (TRD-H004):
 *   - Tracks session_id in implement.json when subagent is active
 *   - Clears session_id when subagent completes
 *   - Uses CLAUDE_SESSION_ID or generates from timestamp
 *
 * Output format (to stdout):
 *   {"hookSpecificOutput": {"hookEventName": "SubagentStop", "status": "verified|unchanged|error"}}
 *
 * Exit codes:
 *   0 - Hook processed successfully (always non-blocking)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { resolveProjectRoot } = require('./lib/resolve-project-root');

// TRD State directory name
const TRD_STATE_DIR = '.trd-state';

/**
 * Debug logging to stderr.
 * Only outputs when STATUS_HOOK_DEBUG=1.
 * @param {string} msg - Message to log
 */
function debugLog(msg) {
  if (process.env.STATUS_HOOK_DEBUG === '1') {
    const timestamp = new Date().toISOString();
    console.error(`[STATUS ${timestamp}] ${msg}`);
  }
}

/**
 * Find .trd-state directory by walking up from cwd.
 * @param {string} startDir - Directory to start search from
 * @returns {string|null} Path to .trd-state or null if not found
 */
function findTrdStateDir(startDir) {
  let currentDir = startDir;
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const trdStatePath = path.join(currentDir, TRD_STATE_DIR);
    if (fs.existsSync(trdStatePath) && fs.statSync(trdStatePath).isDirectory()) {
      return trdStatePath;
    }
    currentDir = path.dirname(currentDir);
  }

  return null;
}

/**
 * Find implement.json files in .trd-state directory.
 * @param {string} trdStateDir - Path to .trd-state directory
 * @returns {string[]} Array of implement.json file paths
 */
function findImplementFiles(trdStateDir) {
  const files = [];

  try {
    const entries = fs.readdirSync(trdStateDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const implementPath = path.join(trdStateDir, entry.name, 'implement.json');
        if (fs.existsSync(implementPath)) {
          files.push(implementPath);
        }
      }
    }
  } catch (error) {
    debugLog(`Error reading trd-state directory: ${error.message}`);
  }

  return files;
}

/**
 * Get session ID from environment or generate one.
 * @returns {string} Session ID
 */
function getSessionId() {
  // Try Claude's session ID environment variable
  if (process.env.CLAUDE_SESSION_ID) {
    return process.env.CLAUDE_SESSION_ID;
  }

  // Try generic session tracking
  if (process.env.SESSION_ID) {
    return process.env.SESSION_ID;
  }

  // Fallback: generate from timestamp (less ideal but functional)
  return `session-${Date.now()}`;
}

/**
 * Read implement.json file safely.
 * @param {string} filePath - Path to implement.json
 * @returns {Object|null} Parsed JSON or null on error
 */
function readImplementJson(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    debugLog(`Error reading ${filePath}: ${error.message}`);
    return null;
  }
}

/**
 * Get file modification time.
 * @param {string} filePath - Path to file
 * @returns {number|null} Modification time in ms or null
 */
function getFileMtime(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.mtimeMs;
  } catch (error) {
    return null;
  }
}

/**
 * Check if file was modified recently (within the last N minutes).
 * @param {string} filePath - Path to file
 * @param {number} minutesAgo - How many minutes to look back
 * @returns {boolean} True if modified recently
 */
function wasModifiedRecently(filePath, minutesAgo = 30) {
  const mtime = getFileMtime(filePath);
  if (mtime === null) {
    return false;
  }

  const cutoff = Date.now() - (minutesAgo * 60 * 1000);
  return mtime > cutoff;
}

/**
 * Update session tracking in implement.json.
 * Clears session_id to indicate subagent completion.
 *
 * @param {string} filePath - Path to implement.json
 * @param {Object} data - Current implement.json data
 * @returns {boolean} True if update succeeded
 */
function clearSessionId(filePath, data) {
  try {
    // Only clear if there's an active session_id
    if (!data.session_id) {
      debugLog('No session_id to clear');
      return true;
    }

    // Record the completion
    data.session_id = null;
    data.last_session_completed = new Date().toISOString();

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    debugLog(`Cleared session_id in ${filePath}`);
    return true;
  } catch (error) {
    debugLog(`Error updating ${filePath}: ${error.message}`);
    return false;
  }
}

/**
 * Cycle position progression order.
 */
const CYCLE_ORDER = ['verify_red', 'implement', 'verify', 'simplify', 'verify_post_simplify', 'review', 'complete'];

/**
 * Advance cycle_position for the single in-progress task in implement.json.
 *
 * Safety: Only advances when exactly 1 task has status "in_progress".
 * If 0 or 2+ tasks are in_progress, skip (parallel execution or no active task).
 * Writes atomically via temp file + rename.
 *
 * @param {string} filePath - Path to implement.json
 * @param {Object} data - Parsed implement.json data
 * @returns {boolean} True if cycle was advanced
 */
function advanceCyclePosition(filePath, data) {
  if (!data || !data.tasks) {
    debugLog('No tasks in implement.json, skipping cycle advance');
    return false;
  }

  // Find tasks with status "in_progress"
  const inProgressEntries = Object.entries(data.tasks)
    .filter(([, task]) => task.status === 'in_progress');

  if (inProgressEntries.length !== 1) {
    debugLog(`Found ${inProgressEntries.length} in_progress tasks, skipping cycle advance (need exactly 1)`);
    return false;
  }

  const [taskId, task] = inProgressEntries[0];

  // Active-debugging guard: when the command has put the task into a DEBUG cycle
  // (retry_count > 0 or current_problem set), do NOT advance. The command will
  // re-dispatch verify after app-debugger completes; advancing here would skip past
  // verify/verify_post_simplify into simplify or review, abandoning the retry.
  if ((typeof task.retry_count === 'number' && task.retry_count > 0)
      || (task.current_problem && String(task.current_problem).trim() !== '')) {
    debugLog(`Task ${taskId} is mid-debug (retry_count=${task.retry_count}, problem=${!!task.current_problem}); skipping advance`);
    return false;
  }

  const currentPosition = task.cycle_position || 'implement';
  const currentIndex = CYCLE_ORDER.indexOf(currentPosition);

  if (currentIndex === -1 || currentIndex >= CYCLE_ORDER.length - 1) {
    debugLog(`Task ${taskId} at ${currentPosition}, no further advancement`);
    return false;
  }

  const nextPosition = CYCLE_ORDER[currentIndex + 1];

  try {
    data.tasks[taskId].cycle_position = nextPosition;
    data.tasks[taskId].last_advanced = new Date().toISOString();

    // Atomic write: temp file + rename
    const tmpPath = filePath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpPath, filePath);

    debugLog(`Advanced task ${taskId}: ${currentPosition} -> ${nextPosition}`);
    return true;
  } catch (error) {
    debugLog(`Error advancing cycle for ${taskId}: ${error.message}`);
    // Clean up temp file if it exists
    try { fs.unlinkSync(filePath + '.tmp'); } catch { /* ignore */ }
    return false;
  }
}

/**
 * Main hook logic.
 * @param {Object} hookData - Hook data from stdin
 */
async function main(hookData) {
  // 1. Check if disabled
  if (process.env.STATUS_HOOK_DISABLE === '1') {
    debugLog('Hook disabled (STATUS_HOOK_DISABLE=1)');
    outputResult('disabled');
    return;
  }

  // 2. Resolve project root from hook data
  const cwd = resolveProjectRoot(hookData);
  debugLog(`Project root: ${cwd}`);

  // 3. Find .trd-state directory
  const trdStateDir = findTrdStateDir(cwd);
  if (!trdStateDir) {
    debugLog('No .trd-state directory found');
    outputResult('no_state');
    return;
  }
  debugLog(`Found trd-state: ${trdStateDir}`);

  // 4. Find implement.json files
  const implementFiles = findImplementFiles(trdStateDir);
  if (implementFiles.length === 0) {
    debugLog('No implement.json files found');
    outputResult('no_files');
    return;
  }
  debugLog(`Found ${implementFiles.length} implement.json file(s)`);

  // 5. Check each implement.json for modifications, session tracking, and cycle advancement
  let anyModified = false;
  let anySessionCleared = false;
  let anyCycleAdvanced = false;

  for (const filePath of implementFiles) {
    const data = readImplementJson(filePath);
    if (!data) {
      continue;
    }

    // Check if file was modified recently (during this session)
    if (wasModifiedRecently(filePath, 30)) {
      debugLog(`File modified recently: ${filePath}`);
      anyModified = true;
    }

    // Clear session_id if present (TRD-H004)
    if (data.session_id) {
      if (clearSessionId(filePath, data)) {
        anySessionCleared = true;
      }
    }

    // Advance cycle_position for single in-progress task
    if (advanceCyclePosition(filePath, data)) {
      anyCycleAdvanced = true;
    }

    // Log current status for debugging
    debugLog(`Status for ${path.basename(path.dirname(filePath))}: phase=${data.current_phase || 'unknown'}, cycle=${data.cycle_position || 'unknown'}`);
  }

  // 6. Output result
  if (anyCycleAdvanced) {
    outputResult('cycle_advanced');
  } else if (anySessionCleared) {
    outputResult('session_cleared');
  } else if (anyModified) {
    outputResult('verified');
  } else {
    outputResult('unchanged');
  }
}

/**
 * Output hook result.
 * @param {string} status - Status string
 */
function outputResult(status) {
  const output = {
    hookSpecificOutput: {
      hookEventName: 'SubagentStop',
      status: status,
      timestamp: new Date().toISOString()
    }
  };
  console.log(JSON.stringify(output));
  process.exit(0);
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
    // Non-blocking: always succeed
    outputResult('error');
  }
});

// Handle case where stdin is empty or closed immediately
process.stdin.on('error', (error) => {
  debugLog(`stdin error: ${error.message}`);
  outputResult('error');
});

// Export for testing
module.exports = {
  main,
  findTrdStateDir,
  findImplementFiles,
  readImplementJson,
  wasModifiedRecently,
  clearSessionId,
  advanceCyclePosition,
  getSessionId,
  debugLog,
  CYCLE_ORDER
};

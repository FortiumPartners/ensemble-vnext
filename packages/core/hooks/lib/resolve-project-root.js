#!/usr/bin/env node

/**
 * resolve-project-root.js - Shared utility for resolving project root from hook data.
 *
 * Hooks receive hookData.cwd which may be a subdirectory (e.g., when a subagent
 * operates in a nested path). This utility walks up from hookData.cwd to find the
 * actual project root by looking for marker directories.
 *
 * Usage:
 *   const { resolveProjectRoot } = require('./lib/resolve-project-root');
 *   const projectRoot = resolveProjectRoot(hookData);
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Marker directories that indicate project root
const ROOT_MARKERS = ['.claude', '.trd-state', '.git'];

/**
 * Resolve the project root directory from hook data.
 *
 * Walks up from hookData.cwd (or process.cwd() fallback) looking for
 * marker directories (.claude/, .trd-state/, .git/) that indicate the
 * project root.
 *
 * @param {Object} hookData - Hook data from stdin (may contain cwd field)
 * @returns {string} Absolute path to the project root
 */
function resolveProjectRoot(hookData) {
  // $CLAUDE_PROJECT_DIR is authoritative when set: Claude Code knows the project
  // root, and every hook in settings.json is already invoked through a
  // `cd "${CLAUDE_PROJECT_DIR:-...}"` wrapper, so preferring it here makes the
  // helper agree with how hooks are actually launched.
  //
  // The walk below is the fallback, and it fails DANGEROUSLY rather than loudly:
  // when cwd is outside the project it does not error, it silently resolves to a
  // DIFFERENT project, because `.git` is a root marker and any sibling or nested
  // repo satisfies it. Hooks then read and write the wrong .trd-state/.
  if (process.env.CLAUDE_PROJECT_DIR) {
    const declared = path.resolve(process.env.CLAUDE_PROJECT_DIR);
    try {
      if (fs.existsSync(declared) && fs.statSync(declared).isDirectory()) {
        return declared;
      }
    } catch {
      // fall through to the walk
    }
  }

  const startDir = (hookData && hookData.cwd) ? hookData.cwd : process.cwd();

  let currentDir = path.resolve(startDir);
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    for (const marker of ROOT_MARKERS) {
      const markerPath = path.join(currentDir, marker);
      try {
        if (fs.existsSync(markerPath) && fs.statSync(markerPath).isDirectory()) {
          return currentDir;
        }
      } catch {
        // Permission error or similar - skip this marker
      }
    }
    currentDir = path.dirname(currentDir);
  }

  // Fallback: return the original directory if no markers found
  return path.resolve(startDir);
}

module.exports = { resolveProjectRoot };

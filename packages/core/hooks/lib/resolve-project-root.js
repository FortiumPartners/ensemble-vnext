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

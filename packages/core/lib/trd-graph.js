'use strict';

/**
 * trd-graph.js — dependency and file-conflict graph ACROSS TRDs.
 *
 * WHY THIS IS AN ADAPTER AND NOT AN ALGORITHM
 *
 * `docs/modernization/2026-08-improvement-plan.md` states it exactly:
 * "cross-TRD conflict detection is the same computation as intra-TRD, just over a
 * wider set." `task-graph.js`'s `buildGraph(tasks, grounding)` needs only two
 * things from a node — an `id`, a `dependencies` array — plus a `touches` list per
 * id. A TRD has all three: its name, its declared dependencies on other TRDs, and
 * the union of every file its tasks touch.
 *
 * So this module reuses the tested graph rather than writing a second one. What it
 * adds is the aggregation (a TRD's file footprint is the union of its tasks') and
 * the one question that only exists at this level: which TRDs in the SAME wave
 * touch the same file.
 *
 * WHAT THIS UNBLOCKS, AND WHAT IT DOES NOT
 *
 * The plan lists four things that break when more than one TRD is in flight:
 * `current.json` is a single git-tracked pointer; `implement.lock` is per-TRD and
 * says nothing about two TRDs racing the same FILES; the task list is
 * session-scoped; workflows cannot resume across sessions.
 *
 * This module answers only the second, and it answers it as a COMPUTED FACT rather
 * than a convention — which is why the plan puts it first: "sketching a solution
 * before the graph exists would be guesswork." The other three are state-model
 * decisions that need this partition in hand before they can be made.
 *
 * It runs no agent, reads no file, and decides nothing about scheduling. It is a
 * pure function over already-parsed TRDs.
 */

const { buildGraph, computeFilePartition } = require('./task-graph');

/**
 * The union of every file a TRD's tasks touch.
 *
 * A TRD with no grounding blocks contributes an EMPTY footprint, which means it can
 * never be detected as conflicting. That is a real limitation and it is silent, so
 * `buildTrdGraph` reports it in `warnings` rather than letting an ungrounded TRD
 * look safe to parallelise.
 */
function aggregateTouches(parsed) {
  const grounding = (parsed && parsed.grounding) || {};
  const files = new Set();
  for (const block of Object.values(grounding)) {
    for (const file of (block && block.touches) || []) files.add(file);
  }
  return [...files].sort();
}

/**
 * Build the cross-TRD graph.
 *
 * @param {Array<{id, dependencies?, parsed}>} trds - `parsed` is a trd-parser.js result.
 * @returns {{nodes, edges, waves, cycles, criticalPath, partition, conflicts, warnings}}
 *   `conflicts` is the addition: per file, the TRDs sharing it AND whether any of
 *   them land in the same wave.
 */
function buildTrdGraph(trds) {
  trds = trds || [];
  const warnings = [];

  // Shim each TRD into the shape task-graph.js already understands.
  const nodes = trds.map((t) => ({
    id: t.id,
    dependencies: (t.dependencies || []).filter((d) => trds.some((x) => x.id === d)),
  }));
  for (const t of trds) {
    const unknown = (t.dependencies || []).filter((d) => !trds.some((x) => x.id === d));
    for (const d of unknown) {
      warnings.push(`${t.id} declares a dependency on "${d}", which is not in this set`);
    }
  }

  const grounding = {};
  for (const t of trds) {
    const touches = aggregateTouches(t.parsed);
    grounding[t.id] = { touches };
    if (touches.length === 0) {
      warnings.push(
        `${t.id} has no grounding blocks, so its file footprint is empty and it can never be ` +
          `detected as conflicting — it will look safe to parallelise when it may not be`
      );
    }
  }

  const graph = buildGraph(nodes, grounding);
  const partition = computeFilePartition(nodes, grounding);

  // CORRECTED after the first draft's test failed, and the failure was the useful
  // part. This originally reported a `concurrent` flag for TRDs sharing a file in
  // the SAME wave — a race. It can never fire: `buildGraph` ALREADY serializes file
  // conflicts, pushing two nodes that touch one file into different waves even when
  // neither declares a dependency on the other. Inheriting that is the whole benefit
  // of reusing it, and a race detector layered on top would have been dead code that
  // read as a working safety check.
  //
  // What is worth reporting is the opposite: WHY the waves came out as they did. A
  // file shared between two TRDs is the reason they cannot run together, and without
  // this the ordering looks arbitrary.
  const waveOf = {};
  graph.waves.forEach((wave, i) => wave.forEach((id) => { waveOf[id] = i; }));

  const conflicts = [];
  for (const [file, owners] of Object.entries(partition)) {
    if (owners.length < 2) continue;
    const declared = owners.filter((id) =>
      (nodes.find((n) => n.id === id) || {}).dependencies?.some((d) => owners.includes(d))
    );
    conflicts.push({
      file,
      owners,
      // True when the file alone forced the split — no declared dependency would
      // have separated these TRDs anyway.
      serializedByFile: declared.length === 0,
      waves: owners.map((id) => waveOf[id]),
    });
  }
  conflicts.sort((a, b) => a.file.localeCompare(b.file));

  return { ...graph, partition, conflicts, warnings };
}

/**
 * One-screen summary of why TRDs were serialized. Empty when nothing is shared.
 *
 * This is the output a human needs before running a wave: not "these will race"
 * (they cannot — the graph already prevented it) but "these could not be
 * parallelised, and here is the file that stopped it". Splitting that file is the
 * lever that buys concurrency.
 */
function renderConflicts(graph) {
  const shared = (graph.conflicts || []).filter((c) => c.serializedByFile);
  if (shared.length === 0) return '';
  const lines = [`${shared.length} file(s) forced TRDs apart — no declared dependency did:`];
  for (const c of shared) lines.push(`  ${c.file} — ${c.owners.join(', ')}`);
  lines.push('  Split a shared file to buy concurrency; the graph will not parallelise');
  lines.push('  two TRDs that both claim one.');
  return lines.join('\n');
}

module.exports = { buildTrdGraph, aggregateTouches, renderConflicts };

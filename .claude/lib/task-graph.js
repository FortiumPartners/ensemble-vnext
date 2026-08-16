'use strict';

/**
 * task-graph.js — the union task graph for one TRD's Master Task List.
 *
 * Consumes the records `trd-parser.js` produces (`tasks`, `grounding`). Never touches a
 * file and never re-parses markdown — see §3.2 of docs/TRD/implement-trd-rework.md and
 * ITR-B002's grounding block. Pure functions only: no `fs`, no `process.env`. That is
 * what makes the >80% coverage bar reachable without fixtures (ITR-B002 "Follow").
 *
 * ## Why a union graph
 *
 * There are two independent sources of task ordering, and conflating them is exactly the
 * failure this module exists to prevent:
 *
 *   1. Declared dependencies — a task's `Dependencies` column, already parsed into
 *      `task.dependencies` by trd-parser.js.
 *   2. File-ownership conflicts — two tasks whose `Touches` sets intersect MUST serialize
 *      regardless of what the dependency graph says. Two agents editing one file
 *      concurrently is a silent lost update, not an error either agent would see.
 *
 * `blockedBy(t) = Dependencies(t) ∪ { u : Touches(u) ∩ Touches(t) ≠ ∅ ∧ u <ᴵᴰ t }`
 *
 * The conflict half is oriented by lexical task-ID comparison (D3): for any pair of tasks
 * that share a touched file, the lexically-smaller ID is always the blocker. That is what
 * keeps the graph — and therefore `waves` — identical across repeated runs of the same TRD;
 * an unoriented "these two conflict" edge would leave the levelisation to depend on
 * iteration order.
 *
 * ## What was deliberately not copied from the Sunstone reference
 *
 * `docs/modernization/runs/item8/sunstone-read.md` rejects the reference's `trd-graph.js`
 * as a model for this module: its nodes are whole TRDs (cross-TRD edges only; it explicitly
 * skips bare `TRD-NNN` references as "not a graph edge"), where this module's nodes are
 * tasks within one TRD — a different question. The one thing adopted from it is a
 * documentation habit, not an algorithm: state the identity rule for the graph's keys up
 * front. Here it is: **the node key is the task `id` exactly as `trd-parser.js` emits it.
 * Nothing else is a key** — not description text, not a derived slug.
 */

// ---------------------------------------------------------------------------
// File partition: file path -> task ids that touch it.
// ---------------------------------------------------------------------------

/**
 * Invert tasks' `Touches` lists into file -> [task ids]. Exposed standalone (not only via
 * `buildGraph`'s `partition` field) because two independent consumers need exactly this
 * inversion without the rest of the graph: `audit-trd.js`'s derivation verifier reports
 * same-file clusters, and `trd-authoring.md`'s sizing rule ("two tasks touching the same
 * file will serialize") is only checkable if something computes this. Recomputing it twice
 * would let the two drift.
 *
 * An empty (or absent) `Touches` list is a deliberate choice, not an omission: it conflicts
 * with nothing and is simply absent from every file's list below. It does NOT assert
 * exclusive non-ownership of anything — it just contributes zero file-conflict edges. Four
 * tasks in `docs/TRD/implement-trd-rework.md` itself (ITR-P001, ITR-P002, ITR-P003,
 * ITR-T003) have empty `Touches` for exactly this reason (research/measurement tasks that
 * produce a finding, not a file), and their waves depend on this behavior: an empty
 * `Touches` must not make a task conflict with everything (the unsafe alternative) or
 * except.
 *
 * @param {Array<{id: string}>} tasks
 * @param {Object<string, {touches?: string[]}>} grounding
 * @returns {Object<string, string[]>} file path -> task ids (sorted) that touch it
 */
function computeFilePartition(tasks, grounding) {
  grounding = grounding || {};
  const partition = {};
  for (const task of tasks) {
    const block = grounding[task.id];
    const touches = (block && block.touches) || [];
    for (const file of touches) {
      if (!partition[file]) partition[file] = [];
      if (!partition[file].includes(task.id)) partition[file].push(task.id);
    }
  }
  for (const file of Object.keys(partition)) {
    partition[file].sort();
  }
  return partition;
}

// ---------------------------------------------------------------------------
// Graph construction
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} Edge
 * @property {string} from        blocking task id
 * @property {string} to          blocked task id
 * @property {'dependency'|'file-conflict'} kind
 * @property {string} [file]      the overlapping path, for kind === 'file-conflict'
 *
 * @typedef {Object} GraphResult
 * @property {string[]}   nodes
 * @property {Edge[]}     edges
 * @property {string[][]} waves          eligibility waves; waves[0] runs first
 * @property {string[]}   criticalPath
 * @property {string[][]} cycles         empty when acyclic
 * @property {Object<string,string[]>} partition   file path -> task ids that touch it
 */

/**
 * Build the union task graph for one TRD.
 *
 * @param {Array<{id: string, dependencies?: string[]}>} tasks     trd-parser.js parseTrd().tasks
 * @param {Object<string, {touches?: string[]}>} grounding         trd-parser.js parseTrd().grounding
 * @returns {GraphResult}
 */
function buildGraph(tasks, grounding) {
  tasks = tasks || [];
  grounding = grounding || {};

  const nodes = tasks.map((t) => t.id);
  const nodeSet = new Set(nodes);
  const partition = computeFilePartition(tasks, grounding);

  const edges = [];
  // blockedBy(id) is a Set, not an array-with-duplicates: a task depending on the same id
  // twice, or sharing two files with the same conflicting task, must not double-count
  // toward indegree.
  const blockedBy = new Map(nodes.map((id) => [id, new Set()]));

  // 1. Declared dependencies. An unknown dependency id is dropped here, not reported —
  //    trd-parser.js already emits "Task X depends on unknown task id: Y" into its own
  //    warnings, and duplicating that report is not this module's job (§3.2 Error
  //    Handling: "dropped from the graph and reported"; the reporting half is upstream).
  for (const task of tasks) {
    const deps = task.dependencies || [];
    const seenDeps = blockedBy.get(task.id);
    for (const dep of deps) {
      if (dep === task.id) continue; // a self-dependency is not a real edge
      if (!nodeSet.has(dep)) continue; // unknown id — dropped; already reported upstream
      if (seenDeps.has(dep)) continue; // a dependency declared more than once is one edge
      edges.push({ from: dep, to: task.id, kind: 'dependency' });
      seenDeps.add(dep);
    }
  }

  // 2. File-ownership conflicts, oriented by lexical task-ID order (D3) so the same pair
  //    of conflicting tasks always produces the same edge direction. Sorting the file keys
  //    themselves is not required for correctness (edge order within the graph doesn't
  //    affect waves/cycles/criticalPath, all of which are computed from `blockedBy`), but
  //    it keeps `edges` output byte-identical across runs, which is worth the same D3
  //    determinism this whole module exists to provide.
  for (const file of Object.keys(partition).sort()) {
    const owners = partition[file]; // already sorted by computeFilePartition
    for (let i = 0; i < owners.length; i++) {
      for (let j = i + 1; j < owners.length; j++) {
        const from = owners[i];
        const to = owners[j];
        edges.push({ from, to, kind: 'file-conflict', file });
        blockedBy.get(to).add(from);
      }
    }
  }

  // Forward adjacency, derived from blockedBy so it is already deduplicated per target.
  const forward = new Map(nodes.map((id) => [id, []]));
  for (const [to, froms] of blockedBy) {
    for (const from of froms) {
      forward.get(from).push(to);
    }
  }

  // 3. Kahn levelisation. Every task in waves[i] has all blockers in waves[0..i-1].
  const indegree = new Map(nodes.map((id) => [id, blockedBy.get(id).size]));
  const remaining = new Set(nodes);
  const waves = [];
  while (remaining.size > 0) {
    const ready = [];
    for (const id of remaining) {
      if (indegree.get(id) === 0) ready.push(id);
    }
    if (ready.length === 0) break; // nothing left is resolvable — a cycle (see below)
    ready.sort();
    waves.push(ready);
    for (const id of ready) {
      remaining.delete(id);
      for (const next of forward.get(id)) {
        if (remaining.has(next)) indegree.set(next, indegree.get(next) - 1);
      }
    }
  }

  // 4. Whatever is left in `remaining` never reached indegree 0. Some of those nodes are
  //    genuinely IN a cycle; others are merely blocked BY one (a downstream task waiting on
  //    a cyclic pair) without being cyclic themselves. Both are correctly absent from
  //    `waves` — a downstream-blocked task isn't schedulable either — but only the former
  //    belongs in `cycles`. Tarjan's SCC restricted to the remaining subgraph tells them
  //    apart.
  const cycles = findCycles(remaining, edges);

  const criticalPath = computeCriticalPath(waves, edges);

  return { nodes, edges, waves, criticalPath, cycles, partition };
}

// ---------------------------------------------------------------------------
// Cycle detection (Tarjan's SCC), restricted to the nodes Kahn's algorithm
// could not resolve.
// ---------------------------------------------------------------------------

/**
 * @param {Set<string>} remainingSet   nodes Kahn's algorithm never reached indegree 0 for
 * @param {Edge[]} edges               the full edge list (both dependency and file-conflict)
 * @returns {string[][]} sorted list of sorted cycle-participant id groups
 */
function findCycles(remainingSet, edges) {
  if (remainingSet.size === 0) return [];

  const adj = new Map([...remainingSet].map((id) => [id, []]));
  for (const edge of edges) {
    if (remainingSet.has(edge.from) && remainingSet.has(edge.to)) {
      adj.get(edge.from).push(edge.to);
    }
  }

  let index = 0;
  const indices = new Map();
  const lowlink = new Map();
  const onStack = new Set();
  const stack = [];
  const sccs = [];

  function strongConnect(v) {
    indices.set(v, index);
    lowlink.set(v, index);
    index += 1;
    stack.push(v);
    onStack.add(v);

    for (const w of adj.get(v)) {
      if (!indices.has(w)) {
        strongConnect(w);
        lowlink.set(v, Math.min(lowlink.get(v), lowlink.get(w)));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v), indices.get(w)));
      }
    }

    if (lowlink.get(v) === indices.get(v)) {
      const scc = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      // A lone node is only a real cycle if it has a self-loop. Without one, it's a node
      // that's merely downstream of a cycle elsewhere, not part of one itself.
      if (scc.length > 1 || adj.get(scc[0]).includes(scc[0])) {
        sccs.push(scc.sort());
      }
    }
  }

  for (const v of remainingSet) {
    if (!indices.has(v)) strongConnect(v);
  }

  sccs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return sccs;
}

// ---------------------------------------------------------------------------
// Critical path: longest chain through the acyclic prefix, by edge count.
// ---------------------------------------------------------------------------

/**
 * @param {string[][]} waves   already in topological order (predecessors strictly precede
 *                              successors — guaranteed by Kahn's algorithm above)
 * @param {Edge[]} edges
 * @returns {string[]} task ids from the start of the longest chain to its end
 */
function computeCriticalPath(waves, edges) {
  const order = [].concat(...waves);
  if (order.length === 0) return [];

  const inOrder = new Set(order);
  const predecessors = new Map(order.map((id) => [id, []]));
  for (const edge of edges) {
    if (inOrder.has(edge.from) && inOrder.has(edge.to)) {
      predecessors.get(edge.to).push(edge.from);
    }
  }

  const longest = new Map();
  const prev = new Map();
  for (const id of order) {
    let best = 1; // a task with no predecessors is a chain of length 1 by itself
    let bestPrev = null;
    for (const p of predecessors.get(id)) {
      const candidate = longest.get(p) + 1; // p is earlier in `order`, so already computed
      if (candidate > best) {
        best = candidate;
        bestPrev = p;
      }
    }
    longest.set(id, best);
    prev.set(id, bestPrev);
  }

  let end = order[0];
  for (const id of order) {
    if (longest.get(id) > longest.get(end)) end = id;
  }

  const path = [];
  let cur = end;
  while (cur) {
    path.push(cur);
    cur = prev.get(cur);
  }
  return path.reverse();
}

module.exports = {
  buildGraph,
  computeFilePartition,
};

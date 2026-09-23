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
  //
  //    A DECLARED DEPENDENCY OVERRIDES THE LEXICAL ORIENTATION. When a pair carries both
  //    kinds of edge, the lexical rule can point AGAINST the declared one and the union
  //    graph cycles — which drops the pair and everything downstream of it out of `waves`
  //    entirely. Measured 2026-09-23 on docs/TRD/plan-weight-router.md: PLAN-P001 ->
  //    PLAN-B004 was declared, both touch packages/core/commands/plan.md, and 'PLAN-B004' <
  //    'PLAN-P001' lexically, so the conflict edge pointed backwards. `cycles` reported the
  //    pair and `waves` held 6 of 13 tasks.
  //
  //    This is not an exotic shape. The ID convention makes P infrastructure and B backend,
  //    so a P-task depending on a B-task is routine, and P sorts after B.
  //
  //    Re-orienting rather than dropping the edge is deliberate: the union of both sources is
  //    this module's design, and the conflict edge is the honest record that the pair shares a
  //    file. Only its DIRECTION was ever arbitrary. Determinism is preserved because the
  //    declared direction is as fixed as the alphabet.
  //
  //    Why this shipped: the only cycle test in this suite is a genuine mutual dependency
  //    (A depends on B, B depends on A), which should cycle. The conflicting-direction case
  //    was never covered -- test_task_graph's own comment at the neighbouring case promised
  //    "the interesting case is tested separately below (conflicting-direction)" and no such
  //    test existed.
  const declaredPairs = new Set(
    edges.filter((e) => e.kind === 'dependency').map((e) => `${e.from}\u0000${e.to}`)
  );
  for (const file of Object.keys(partition).sort()) {
    const owners = partition[file]; // already sorted by computeFilePartition
    for (let i = 0; i < owners.length; i++) {
      for (let j = i + 1; j < owners.length; j++) {
        let from = owners[i];
        let to = owners[j];
        // FLIP to match a declared edge running the other way. The conflict edge is still
        // emitted -- it is the honest record that these two share a file, and the union of
        // both edge sources is this module's whole design -- but it is oriented by the
        // declaration rather than by the alphabet.
        if (declaredPairs.has(`${to}\u0000${from}`)) {
          const swap = from; from = to; to = swap;
        }
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


/**
 * A one-glance report of how parallel this plan actually is, and what is holding it back.
 *
 * WHY. Wave width is set at AUTHORING time and was invisible until an implementation run
 * was already under way. A real 17-task TRD decomposed into 10 waves averaging 1.70 tasks —
 * six of them a single task — and ran at 0.69x parallelism, below serial. Nothing reported
 * that until someone measured the session log afterwards.
 *
 * Measured, not assumed: on `docs/TRD/autonomy-judge-command-scope.md` the graph carries 13
 * declared-dependency constraints against 1 file-conflict constraint; on
 * `docs/TRD/completed/implement-trd-rework.md`, 27 against 8. Declared dependencies are the
 * dominant kind on both — the opposite of what this docstring used to claim ("the cause
 * is rarely declared dependencies"). So the useful output does not assume which kind is at
 * fault; it counts both and reports whichever one actually dominates THIS graph, and only
 * names the serializing files when file conflicts are the dominant kind.
 *
 * `dependencyEdges` / `fileConflictEdges` count distinct blocker->blocked PAIRS, not raw
 * `edges` entries — see the comment on the counting loop for why the raw counts mislead.
 *
 * @param {{waves: string[][], edges: object[], partition: object, criticalPath: string[]}} graph
 * @returns {{taskCount, waveCount, avgWidth, maxWidth, singleTaskWaves, profile, chains,
 *   dependencyEdges, fileConflictEdges, dominantKind}}
 */
function waveProfile(graph) {
  const waves = (graph && graph.waves) || [];
  const widths = waves.map((w) => w.length);
  const taskCount = widths.reduce((a, b) => a + b, 0);
  const edges = (graph && graph.edges) || [];

  // Files serializing the most tasks. `partition` is file -> owning task ids; a file owned
  // by one task constrains nothing.
  const chains = Object.entries((graph && graph.partition) || {})
    .filter(([, owners]) => owners.length > 1)
    .map(([file, owners]) => ({ file, tasks: owners.length }))
    .sort((a, b) => b.tasks - a.tasks || a.file.localeCompare(b.file));

  // Count ORDERING CONSTRAINTS, not edge records. `buildGraph` emits one file-conflict edge
  // per (pair, file) and emits one even for a pair that already carries a declared
  // dependency, so raw `edges` counts overstate file conflicts. Two tasks sharing three
  // files, one declaring depends_on the other, are 1 dependency edge against 3 file edges —
  // yet un-sharing all three files changes nothing, because the declared dependency still
  // serializes the pair. Attributing that to "shared files" is exactly the misattribution
  // this report exists to remove, so: dedupe per blocker->blocked pair, and credit a pair
  // carrying both kinds to 'dependency' — the edge that survives removing the shared file.
  const dependencyPairs = new Set();
  const fileConflictPairs = new Set();
  for (const e of edges) {
    const pair = `${e.from}\u0000${e.to}`;
    if (e.kind === 'dependency') dependencyPairs.add(pair);
    else if (e.kind === 'file-conflict') fileConflictPairs.add(pair);
  }
  for (const pair of dependencyPairs) fileConflictPairs.delete(pair);
  const dependencyEdges = dependencyPairs.size;
  const fileConflictEdges = fileConflictPairs.size;
  // Ties (including 0-0) favor 'dependency': it is the more common real-world dominant kind
  // (see the measurements above), and there is nothing to report either way when both are 0.
  const dominantKind = fileConflictEdges > dependencyEdges ? 'file-conflict' : 'dependency';

  return {
    taskCount,
    waveCount: waves.length,
    avgWidth: waves.length ? taskCount / waves.length : 0,
    maxWidth: widths.length ? Math.max(...widths) : 0,
    singleTaskWaves: widths.filter((w) => w === 1).length,
    profile: widths.join(','),
    chains,
    dependencyEdges,
    fileConflictEdges,
    dominantKind,
  };
}

/**
 * The same thing as one human-readable line plus, when the plan is narrow, what is causing
 * it: the dominant edge kind, the critical path as a chain, and — only when file conflicts
 * are what dominates — the files responsible. Returned as an array of lines so callers can
 * indent it themselves.
 */
function renderWaveProfile(graph, opts = {}) {
  const p = waveProfile(graph);
  if (!p.taskCount) return [];
  const out = [
    `waves: ${p.profile} — ${p.taskCount} tasks in ${p.waveCount} wave(s), ` +
      `avg ${p.avgWidth.toFixed(2)} wide, ${p.singleTaskWaves} single-task`,
  ];
  // Below ~2 wide the plan is close to serial and the implement loop pays a full pass per
  // wave. Name what's actually causing it rather than assuming.
  const totalEdges = p.dependencyEdges + p.fileConflictEdges;
  if (p.avgWidth < (opts.narrowBelow || 2) && totalEdges > 0) {
    const dominantCount = p.dominantKind === 'file-conflict' ? p.fileConflictEdges : p.dependencyEdges;
    const dominantLabel = p.dominantKind === 'file-conflict' ? 'shared files' : 'declared dependencies';
    out.push(
      `  narrow — driven by ${dominantLabel} ` +
        `(${dominantCount} of ${totalEdges} ordering constraints)`
    );
    // A one-element path is not a chain and says nothing. It happens when every edge sits
    // inside a cycle: those tasks never reach a wave, so `order` (and therefore the path)
    // holds only the unconstrained remainder, and printing `critical path: A-3` asserts a
    // chain where there is none.
    const criticalPath = (graph && graph.criticalPath) || [];
    if (criticalPath.length > 1) {
      out.push(`  critical path: ${criticalPath.join(' -> ')}`);
    }
    if (p.dominantKind === 'file-conflict' && p.chains.length) {
      out.push('  these files serialize the most tasks:');
      for (const c of p.chains.slice(0, opts.topFiles || 3)) {
        out.push(`    ${c.file} — touched by ${c.tasks} tasks`);
      }
    }
  }
  return out;
}


/**
 * Adjacent phases that can run as ONE dispatch, because nothing connects them.
 *
 * WHY. `buildGraph` computes waves across the WHOLE TRD, and then `/implement-trd`
 * intersects those waves with one phase's membership and dispatches phase by phase. Phases
 * are therefore a SECOND serialization layer on top of an ordering that is already correct.
 * Measured on a real run: 4.4h of agent time inside 6.42h of wall clock — 0.69x, below
 * serial — with five phases awaited one after another.
 *
 * What this does NOT do is run two phase workflows concurrently. Each would receive a
 * phase-filtered wave list and neither would see the other's file-conflict edges; that is
 * the one genuinely unsafe design. Merging phases into a single dispatch keeps one wave
 * computation over the union, so every edge is still honoured.
 *
 * Conservative by construction: a group grows only while NO edge of either kind crosses
 * into it. Any real coupling — a declared dependency or a shared file — ends the group, and
 * the result degrades to today's one-phase-at-a-time behaviour.
 *
 * @param {object[]} tasks  parsed tasks carrying `.phase`
 * @param {{edges: object[]}} graph
 * @returns {number[][]} groups of phase numbers, ascending, e.g. [[1,2],[3],[4,5]]
 */
function phaseGroups(tasks, graph) {
  const phaseOf = new Map();
  for (const t of tasks || []) if (t && t.id) phaseOf.set(t.id, t.phase);

  const phases = [...new Set([...phaseOf.values()].filter((n) => Number.isFinite(n)))].sort(
    (a, b) => a - b
  );
  if (phases.length <= 1) return phases.map((p) => [p]);

  // Which phase pairs are connected by an edge of either kind.
  const linked = new Set();
  for (const e of (graph && graph.edges) || []) {
    const a = phaseOf.get(e.from);
    const b = phaseOf.get(e.to);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) continue;
    linked.add(`${Math.min(a, b)}:${Math.max(a, b)}`);
  }

  const groups = [[phases[0]]];
  for (let i = 1; i < phases.length; i++) {
    const current = groups[groups.length - 1];
    // Join only if this phase is unlinked to EVERY phase already in the group.
    const free = current.every((p) => !linked.has(`${Math.min(p, phases[i])}:${Math.max(p, phases[i])}`));
    if (free) current.push(phases[i]);
    else groups.push([phases[i]]);
  }
  return groups;
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
  waveProfile,
  renderWaveProfile,
  phaseGroups,
  computeFilePartition,
};

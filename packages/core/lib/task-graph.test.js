/**
 * task-graph.js test suite.
 *
 * Run with: npx jest packages/core/lib/task-graph.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { buildGraph, computeFilePartition } = require('./task-graph');
const { parseTrd } = require('./trd-parser');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

// Resolve a repo doc at its live path OR under docs/TRD/completed/. Archiving a
// finished TRD is a normal lifecycle step (process.md's Artifact Flow ends with
// `mv docs/TRD/<f> docs/TRD/completed/`), and hard-coding the live path made two
// suites fail the moment this TRD was archived -- a test breaking on a documented
// workflow step, not on a code change.
function readRepoDoc(relPath) {
  const candidates = [relPath, relPath.replace('docs/TRD/', 'docs/TRD/completed/')];
  for (const c of candidates) {
    const p = path.join(REPO_ROOT, c);
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  }
  throw new Error(`readRepoDoc: not found at any of ${candidates.join(', ')}`);
}

function task(id, opts = {}) {
  return { id, dependencies: opts.dependencies || [] };
}

function ground(touches) {
  return { touches };
}

function waveOf(waves, id) {
  return waves.findIndex((wave) => wave.includes(id));
}

// ---------------------------------------------------------------------------
// computeFilePartition
// ---------------------------------------------------------------------------

describe('computeFilePartition', () => {
  it('inverts Touches into file -> task ids', () => {
    const tasks = [task('A'), task('B'), task('C')];
    const grounding = {
      A: ground(['file1.js']),
      B: ground(['file1.js', 'file2.js']),
      C: ground(['file3.js']),
    };
    const partition = computeFilePartition(tasks, grounding);
    expect(partition).toEqual({
      'file1.js': ['A', 'B'],
      'file2.js': ['B'],
      'file3.js': ['C'],
    });
  });

  it('sorts each file\'s owner list', () => {
    const tasks = [task('Z'), task('A')];
    const grounding = { Z: ground(['shared.js']), A: ground(['shared.js']) };
    expect(computeFilePartition(tasks, grounding)['shared.js']).toEqual(['A', 'Z']);
  });

  it('dedupes a task listed twice for the same file (no ill effect from a repeated Touches entry)', () => {
    const tasks = [task('A')];
    const grounding = { A: ground(['file1.js', 'file1.js']) };
    expect(computeFilePartition(tasks, grounding)['file1.js']).toEqual(['A']);
  });

  it('an empty or absent Touches list contributes to no file', () => {
    const tasks = [task('A'), task('B'), task('C')];
    const grounding = { A: ground([]), B: {} }; // C has no grounding block at all
    const partition = computeFilePartition(tasks, grounding);
    expect(partition).toEqual({});
  });

  it('tolerates a missing grounding object entirely', () => {
    const tasks = [task('A')];
    expect(computeFilePartition(tasks, undefined)).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// buildGraph — synthetic graphs, one behavior per test
// ---------------------------------------------------------------------------

describe('buildGraph — declared dependencies only', () => {
  it('produces a dependency edge and separates blocker/blocked into different waves', () => {
    const tasks = [task('A'), task('B', { dependencies: ['A'] })];
    const grounding = {};
    const { edges, waves, cycles } = buildGraph(tasks, grounding);

    expect(edges).toEqual([{ from: 'A', to: 'B', kind: 'dependency' }]);
    expect(waves).toEqual([['A'], ['B']]);
    expect(cycles).toEqual([]);
  });

  it('drops a dependency on an unknown task id without throwing', () => {
    const tasks = [task('A', { dependencies: ['GHOST'] })];
    const { edges, waves } = buildGraph(tasks, {});
    expect(edges).toEqual([]);
    expect(waves).toEqual([['A']]);
  });

  it('drops a self-dependency without creating a self-loop edge or a false cycle', () => {
    const tasks = [task('A', { dependencies: ['A'] })];
    const { edges, waves, cycles } = buildGraph(tasks, {});
    expect(edges).toEqual([]);
    expect(waves).toEqual([['A']]);
    expect(cycles).toEqual([]);
  });

  it('dedupes a dependency declared more than once', () => {
    const tasks = [task('A'), task('B', { dependencies: ['A', 'A'] })];
    const { edges } = buildGraph(tasks, {});
    expect(edges).toEqual([{ from: 'A', to: 'B', kind: 'dependency' }]);
  });

  it('independent tasks with no relation land in the same wave', () => {
    const tasks = [task('B'), task('A'), task('C')];
    const { waves } = buildGraph(tasks, {});
    expect(waves).toEqual([['A', 'B', 'C']]);
  });
});

describe('buildGraph — file-ownership conflicts', () => {
  it('two tasks touching the same file serialize even with no declared dependency', () => {
    const tasks = [task('B'), task('A')]; // declared out of ID order on purpose
    const grounding = { A: ground(['shared.js']), B: ground(['shared.js']) };
    const { edges, waves } = buildGraph(tasks, grounding);

    expect(edges).toEqual([{ from: 'A', to: 'B', kind: 'file-conflict', file: 'shared.js' }]);
    expect(waves).toEqual([['A'], ['B']]);
  });

  it('orients the conflict edge by lexical task ID regardless of input order (D3)', () => {
    const grounding = { M: ground(['x.js']), Z: ground(['x.js']), A: ground(['x.js']) };
    const g1 = buildGraph([task('Z'), task('M'), task('A')], grounding);
    const g2 = buildGraph([task('A'), task('Z'), task('M')], grounding);

    const conflictPairs = (g) =>
      g.edges.filter((e) => e.kind === 'file-conflict').map((e) => `${e.from}->${e.to}`).sort();

    expect(conflictPairs(g1)).toEqual(['A->M', 'A->Z', 'M->Z']);
    expect(conflictPairs(g1)).toEqual(conflictPairs(g2));
  });

  it('three-way conflict on one file still levelises correctly (chain, not free-for-all)', () => {
    const tasks = [task('A'), task('B'), task('C')];
    const grounding = { A: ground(['x.js']), B: ground(['x.js']), C: ground(['x.js']) };
    const { waves } = buildGraph(tasks, grounding);
    expect(waves).toEqual([['A'], ['B'], ['C']]);
  });

  it('tasks sharing no file are unaffected by each other', () => {
    const tasks = [task('A'), task('B')];
    const grounding = { A: ground(['a.js']), B: ground(['b.js']) };
    const { edges, waves } = buildGraph(tasks, grounding);
    expect(edges).toEqual([]);
    expect(waves).toEqual([['A', 'B']]);
  });

  it('an empty Touches list conflicts with nothing (does not become universally blocking)', () => {
    const tasks = [task('A'), task('B'), task('C')];
    const grounding = { A: ground([]), B: ground(['x.js']), C: ground(['x.js']) };
    const { edges, waves } = buildGraph(tasks, grounding);
    expect(edges).toEqual([{ from: 'B', to: 'C', kind: 'file-conflict', file: 'x.js' }]);
    expect(waveOf(waves, 'A')).toBe(0);
  });

  it('a task with no grounding block at all behaves the same as an empty Touches list', () => {
    const tasks = [task('A'), task('B')];
    const grounding = { B: ground(['x.js']) }; // A has no entry
    const { edges, waves } = buildGraph(tasks, grounding);
    expect(edges).toEqual([]);
    expect(waves).toEqual([['A', 'B']]);
  });

  it('exposes the same partition buildGraph used internally', () => {
    const tasks = [task('A'), task('B')];
    const grounding = { A: ground(['x.js']), B: ground(['x.js', 'y.js']) };
    const { partition } = buildGraph(tasks, grounding);
    expect(partition).toEqual(computeFilePartition(tasks, grounding));
  });
});

describe('buildGraph — union of both edge sources', () => {
  it('a dependency edge and a file-conflict edge between the same pair both appear', () => {
    const tasks = [task('A'), task('B', { dependencies: ['A'] })];
    const grounding = { A: ground(['x.js']), B: ground(['x.js']) };
    const { edges, waves } = buildGraph(tasks, grounding);
    const kinds = edges.map((e) => e.kind).sort();
    expect(kinds).toEqual(['dependency', 'file-conflict']);
    expect(waves).toEqual([['A'], ['B']]);
  });

  it('declared dependency in the opposite direction from the file-conflict orientation still resolves', () => {
    // B depends on A (dependency edge A->B); A and B also share a file, so lexical order
    // (A < B) would ALSO put the conflict edge A->B. Union just reinforces the same order
    // here — the interesting case is tested separately below (conflicting-direction).
    const tasks = [task('A'), task('B', { dependencies: ['A'] })];
    const grounding = { A: ground(['x.js']), B: ground(['x.js']) };
    const { waves, cycles } = buildGraph(tasks, grounding);
    expect(waves).toEqual([['A'], ['B']]);
    expect(cycles).toEqual([]);
  });

  it('a genuine cycle (A depends on B, B depends on A) is reported in cycles and excluded from waves', () => {
    const tasks = [task('A', { dependencies: ['B'] }), task('B', { dependencies: ['A'] }), task('C')];
    const { waves, cycles } = buildGraph(tasks, {});
    expect(waves).toEqual([['C']]);
    expect(cycles).toEqual([['A', 'B']]);
  });

  it('a task blocked by a cycle (but not part of it) is excluded from waves without being called a cycle', () => {
    const tasks = [
      task('A', { dependencies: ['B'] }),
      task('B', { dependencies: ['A'] }),
      task('C', { dependencies: ['A'] }), // downstream of the cycle, not in it
    ];
    const { waves, cycles } = buildGraph(tasks, {});
    expect(waves).toEqual([]);
    expect(cycles).toEqual([['A', 'B']]);
  });

  it('a 3-node cycle is reported as one group', () => {
    const tasks = [
      task('A', { dependencies: ['C'] }),
      task('B', { dependencies: ['A'] }),
      task('C', { dependencies: ['B'] }),
    ];
    const { waves, cycles } = buildGraph(tasks, {});
    expect(waves).toEqual([]);
    expect(cycles).toEqual([['A', 'B', 'C']]);
  });
});

describe('buildGraph — criticalPath', () => {
  it('is empty for an empty graph', () => {
    expect(buildGraph([], {}).criticalPath).toEqual([]);
  });

  it('is a single task when nothing depends on anything', () => {
    const tasks = [task('A'), task('B')];
    const { criticalPath } = buildGraph(tasks, {});
    expect(criticalPath.length).toBe(1);
  });

  it('follows the longest chain through a diamond', () => {
    // A -> B -> D, A -> C -> D : two paths of equal length 3; the longer chain wins when
    // one path is longer.
    const tasks = [
      task('A'),
      task('B', { dependencies: ['A'] }),
      task('C', { dependencies: ['A'] }),
      task('D', { dependencies: ['B', 'C'] }),
      task('E', { dependencies: ['D'] }),
    ];
    const { criticalPath } = buildGraph(tasks, {});
    expect(criticalPath[0]).toBe('A');
    expect(criticalPath[criticalPath.length - 1]).toBe('E');
    expect(criticalPath.length).toBe(4); // A -> B(or C) -> D -> E
  });

  it('is excluded from cyclic nodes — only the acyclic prefix contributes', () => {
    const tasks = [task('A', { dependencies: ['B'] }), task('B', { dependencies: ['A'] })];
    const { criticalPath } = buildGraph(tasks, {});
    expect(criticalPath).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Against the real TRD this module was specified in — a graph module correct on
// synthetic input and wrong on the real file is exactly the failure ITR-P001 found in the
// Sunstone reference (docs/modernization/runs/item8/sunstone-read.md).
// ---------------------------------------------------------------------------

describe('buildGraph — against docs/TRD/implement-trd-rework.md', () => {
  const md = readRepoDoc('docs/TRD/implement-trd-rework.md');
  const parsed = parseTrd(md, { path: 'docs/TRD/implement-trd-rework.md' });
  const graph = buildGraph(parsed.tasks, parsed.grounding);

  it('parses all 19 tasks and carries them all into the graph', () => {
    expect(parsed.tasks.length).toBe(19);
    expect(graph.nodes.length).toBe(19);
    expect(graph.nodes.sort()).toEqual(parsed.tasks.map((t) => t.id).sort());
  });

  it('is acyclic', () => {
    expect(graph.cycles).toEqual([]);
  });

  it('every node appears in exactly one wave', () => {
    const flattened = [].concat(...graph.waves);
    expect(flattened.sort()).toEqual(graph.nodes.slice().sort());
  });

  it('ITR-B015 and ITR-T002 — sharing test/smoke/lib/project.sh and test/smoke/scenarios/implement-one-task.sh — land in different waves', () => {
    expect(waveOf(graph.waves, 'ITR-B015')).toBeGreaterThanOrEqual(0);
    expect(waveOf(graph.waves, 'ITR-T002')).toBeGreaterThan(waveOf(graph.waves, 'ITR-B015'));
  });

  it('ITR-B005 and ITR-D001 land in different waves (via the declared dependency between them)', () => {
    // NOTE: per this TRD's own grounding text, ITR-B005's *Touches* bullet lists only
    // implement-trd.md / .claude/commands/implement-trd.md — it does not literally list
    // packages/core/contracts/task-delegation.md, even though its prose references that
    // file. The file-conflict mechanism therefore does not fire for this pair; they still
    // separate because ITR-B005 declares ITR-D001 as a dependency. See this test file's
    // header note / the task report for the discrepancy between the dispatch description
    // and the real Touches data.
    expect(waveOf(graph.waves, 'ITR-D001')).toBeGreaterThanOrEqual(0);
    expect(waveOf(graph.waves, 'ITR-B005')).toBeGreaterThan(waveOf(graph.waves, 'ITR-D001'));
  });

  it('ITR-T003 (the only genuinely file-less task) has a non-file Touches string and conflicts with nothing', () => {
    // Of the four tasks flagged as "empty Touches" candidates in this task's dispatch
    // (ITR-P001, ITR-P002, ITR-P003, ITR-T003), only ITR-T003 is actually a research task
    // with nothing to touch — and even it does not parse to a literal `[]`: its Touches
    // bullet ("nothing in the tree; the deliverable is a recorded finding.") is prose, not
    // backticked, so trd-parser.js's own normalisation keeps it as one non-file string
    // rather than an empty array. ITR-P001/P002/P003 all name real paths (see the next
    // test) and are not empty-Touches cases at all — see this file's header discrepancy
    // note / the task report. This test only asserts what's actually true: T003's one
    // string does not collide with anything else's Touches.
    expect(parsed.grounding['ITR-T003'].touches).toEqual([
      'nothing in the tree; the deliverable is a recorded finding.',
    ]);
    const conflicts = graph.edges.filter(
      (e) => e.kind === 'file-conflict' && (e.from === 'ITR-T003' || e.to === 'ITR-T003')
    );
    expect(conflicts).toEqual([]);
  });

  it('ITR-P001/P002/P003 all name the same probe directory in Touches, which produces spurious file-conflict serialization', () => {
    // Known-data finding, not a module bug: ITR-P002 and ITR-P003's Touches bullets are
    // "docs/modernization/runs/item8/ (probe record)" — a directory reference, not a file
    // this task edits — and ITR-P001's Touches (a real new file) also names that directory
    // as parenthetical context: "docs/modernization/runs/item8/sunstone-read.md (new;
    // docs/modernization/runs/item8/ exists and currently holds only SPEC.md)".
    // trd-parser.js's backtick-based Touches split treats every backticked span in the
    // bullet as a distinct Touches entry, so all three tasks end up sharing the literal
    // string "docs/modernization/runs/item8/" — and this module, taking Touches at face
    // value per §3.2 ("do not re-parse"), correctly treats that shared string as a file-like
    // conflict and serializes all three. They are not really contending for one file; the
    // TRD's own dependency chain (P002/P003 have no declared deps on P001, and nothing
    // requires this serialization) shows it. This is a data-quality gap in the source
    // grounding blocks / trd-parser.js's Touches normalisation, out of ITR-B002's scope —
    // recorded here so it's not mistaken for a passing assertion this module got wrong.
    expect(parsed.grounding['ITR-P001'].touches).toContain('docs/modernization/runs/item8/');
    expect(parsed.grounding['ITR-P002'].touches).toContain('docs/modernization/runs/item8/');
    expect(parsed.grounding['ITR-P003'].touches).toContain('docs/modernization/runs/item8/');

    const conflictIds = new Set();
    for (const e of graph.edges) {
      if (e.kind === 'file-conflict' && e.file === 'docs/modernization/runs/item8/') {
        conflictIds.add(e.from);
        conflictIds.add(e.to);
      }
    }
    expect([...conflictIds].sort()).toEqual(['ITR-P001', 'ITR-P002', 'ITR-P003']);
  });

  it('produces a non-empty critical path through real dependency chains', () => {
    expect(graph.criticalPath.length).toBeGreaterThan(1);
    // ITR-P001 gates the whole build side (ITR-B001 depends on it); it should be near
    // the front of whatever chain wins.
    expect(graph.criticalPath).toContain('ITR-B001');
  });

  it('is deterministic: parsing and building twice yields byte-identical wave/edge output', () => {
    const parsed2 = parseTrd(md, { path: 'docs/TRD/implement-trd-rework.md' });
    const graph2 = buildGraph(parsed2.tasks, parsed2.grounding);
    expect(graph2.waves).toEqual(graph.waves);
    expect(graph2.edges).toEqual(graph.edges);
    expect(graph2.cycles).toEqual(graph.cycles);
    expect(graph2.criticalPath).toEqual(graph.criticalPath);
  });
});

/* Wave profiling, added 2026-09-21. Wave width is decided at authoring time and was
 * invisible until a run was already under way: a real 17-task TRD averaged 1.70 wide and
 * ran at 0.69x parallelism — below serial — and nobody knew until the session log was
 * measured afterwards. */
describe('waveProfile / renderWaveProfile', () => {
  const { waveProfile, renderWaveProfile } = require('./task-graph');

  it('summarises a wide graph as wide', () => {
    const tasks = [task('A-1'), task('A-2'), task('A-3')];
    const p = waveProfile(buildGraph(tasks, {}));
    expect(p.waveCount).toBe(1);
    expect(p.avgWidth).toBe(3);
    expect(p.singleTaskWaves).toBe(0);
  });

  it('counts the single-task waves that make a plan serial', () => {
    const tasks = [
      task('A-1'),
      task('A-2', { dependencies: ['A-1'] }),
      task('A-3', { dependencies: ['A-2'] }),
    ];
    const p = waveProfile(buildGraph(tasks, {}));
    expect(p.profile).toBe('1,1,1');
    expect(p.avgWidth).toBe(1);
    expect(p.singleTaskWaves).toBe(3);
  });

  it('names the FILES doing the serializing when file conflicts are the dominant edge kind', () => {
    // The actionable half, when file conflicts really are the dominant cause: every pair
    // touching one file becomes an edge in lexical id order, with no declared dependency
    // in this fixture at all (0 dependency edges vs 3 file-conflict edges).
    const tasks = [task('A-1'), task('A-2'), task('A-3')];
    const grounding = {
      'A-1': { touches: ['src/core.ts'] },
      'A-2': { touches: ['src/core.ts'] },
      'A-3': { touches: ['src/core.ts'] },
    };
    const graph = buildGraph(tasks, grounding);
    const p = waveProfile(graph);
    expect(p.avgWidth).toBe(1); // three tasks, one file, three waves
    expect(p.chains[0]).toEqual({ file: 'src/core.ts', tasks: 3 });
    expect(p.dependencyEdges).toBe(0);
    expect(p.fileConflictEdges).toBe(3);
    expect(p.dominantKind).toBe('file-conflict');
    const rendered = renderWaveProfile(graph).join('\n');
    expect(rendered).toContain('src/core.ts — touched by 3 tasks');
    // Suppression cuts both ways: this is the mirror of the dependency-dominant case below
    // (which withholds the files list) — here it is the "declared dependencies" label that
    // must be withheld, because file conflicts are what actually dominates this graph.
    expect(rendered).not.toContain('declared dependencies');
  });

  it('stays quiet about files when the plan is already parallel', () => {
    const tasks = [task('A-1'), task('A-2'), task('A-3')];
    const grounding = { 'A-1': { touches: ['a.ts'] }, 'A-2': { touches: ['b.ts'] } };
    expect(renderWaveProfile(buildGraph(tasks, grounding)).join('\n'))
      .not.toContain('serialize');
  });

  it('renders nothing for an empty graph rather than a misleading zero', () => {
    expect(renderWaveProfile(buildGraph([], {}))).toEqual([]);
  });

  it('names declared dependencies as the dominant kind and prints the critical path as a chain, when dependency edges dominate', () => {
    const tasks = [
      task('A-1'),
      task('A-2', { dependencies: ['A-1'] }),
      task('A-3', { dependencies: ['A-2'] }),
    ];
    const graph = buildGraph(tasks, {});
    const p = waveProfile(graph);
    expect(p.dependencyEdges).toBe(2);
    expect(p.fileConflictEdges).toBe(0);
    expect(p.dominantKind).toBe('dependency');
    const lines = renderWaveProfile(graph);
    expect(lines.join('\n')).toContain('declared dependencies');
    expect(lines.join('\n')).toContain('critical path: A-1 -> A-2 -> A-3');
  });

  it('does NOT print the serializing-files list when declared dependencies (not file conflicts) dominate', () => {
    const tasks = [
      task('A-1'),
      task('A-2', { dependencies: ['A-1'] }),
      task('A-3', { dependencies: ['A-2'] }),
    ];
    // Also give A-1/A-2 a shared file, so `chains` is non-empty — the assertion that
    // matters is that the file list is still withheld because dependencies, not file
    // conflicts, are the dominant kind (2 dependency edges vs 1 file-conflict edge).
    const grounding = { 'A-1': { touches: ['shared.ts'] }, 'A-2': { touches: ['shared.ts'] } };
    const graph = buildGraph(tasks, grounding);
    const p = waveProfile(graph);
    expect(p.dominantKind).toBe('dependency');
    expect(p.chains.length).toBeGreaterThan(0); // there IS a file conflict recorded...
    const rendered = renderWaveProfile(graph).join('\n');
    expect(rendered).not.toContain('these files serialize'); // ...but it's not what's printed
  });

  it('counts ordering constraints, not edge records, so shared files cannot be blamed for a pair a declared dependency already serializes', () => {
    // buildGraph emits one file-conflict edge PER SHARED FILE, and emits one even when the
    // pair already declares a dependency. Counting raw edges made this graph read as
    // "driven by shared files (2 of 3 edges)" and told the author to un-share a.ts and
    // b.ts -- which changes nothing, because A-2 depends_on A-1 regardless.
    const tasks = [task('A-1'), task('A-2', { dependencies: ['A-1'] })];
    const grounding = {
      'A-1': { touches: ['a.ts', 'b.ts'] },
      'A-2': { touches: ['a.ts', 'b.ts'] },
    };
    const graph = buildGraph(tasks, grounding);
    expect(graph.edges.length).toBe(3); // 1 dependency + 2 file-conflict records...
    const p = waveProfile(graph);
    expect(p.dependencyEdges).toBe(1); // ...but only ONE constraint, and it is the dep
    expect(p.fileConflictEdges).toBe(0);
    expect(p.dominantKind).toBe('dependency');
    const rendered = renderWaveProfile(graph).join('\n');
    expect(rendered).toContain('declared dependencies (1 of 1 ordering constraints)');
    expect(rendered).not.toContain('these files serialize');
  });

  it('prints no critical-path line when the path is a single task, rather than asserting a chain that does not exist', () => {
    // A-1 declares depends_on A-2 while both touch x.ts, and the file-conflict edge is
    // oriented the other way (lexically smaller id blocks) -- so the pair is a cycle and
    // neither task ever reaches a wave. Only the unconstrained A-3 does, which made
    // computeCriticalPath return the one-element ["A-3"] and the renderer print
    // `critical path: A-3` -- a chain of one, describing nothing.
    const tasks = [task('A-1', { dependencies: ['A-2'] }), task('A-2'), task('A-3')];
    const grounding = { 'A-1': { touches: ['x.ts'] }, 'A-2': { touches: ['x.ts'] } };
    const graph = buildGraph(tasks, grounding);
    expect(graph.cycles).toEqual([['A-1', 'A-2']]);
    expect(graph.criticalPath).toEqual(['A-3']);
    const rendered = renderWaveProfile(graph).join('\n');
    expect(rendered).toContain('narrow —');
    expect(rendered).not.toContain('critical path:');
  });
});

/* Real-TRD measurement, FIX-002: on docs/TRD/autonomy-judge-command-scope.md the graph
 * carries 13 declared-dependency edges against 1 file-conflict edge. Declared dependencies
 * dominate, so the rendered output must attribute the narrowness to them, print the
 * critical path as a chain, and must NOT print the serializing-files list -- that list is
 * reserved for graphs where file conflicts are what dominates (see the fixture at line 424
 * above, and packages/core/lib/task-graph.test.js's own 3-file-conflict-edge fixture). */
describe('waveProfile / renderWaveProfile — against docs/TRD/autonomy-judge-command-scope.md', () => {
  const { waveProfile, renderWaveProfile } = require('./task-graph');
  const md = readRepoDoc('docs/TRD/autonomy-judge-command-scope.md');
  const parsed = parseTrd(md, { path: 'docs/TRD/autonomy-judge-command-scope.md' });
  const graph = buildGraph(parsed.tasks, parsed.grounding);

  it('carries 13 declared-dependency edges against 1 file-conflict edge', () => {
    expect(graph.edges.filter((e) => e.kind === 'dependency').length).toBe(13);
    expect(graph.edges.filter((e) => e.kind === 'file-conflict').length).toBe(1);
  });

  it('attributes narrowness to declared dependencies, not file conflicts', () => {
    const p = waveProfile(graph);
    expect(p.dominantKind).toBe('dependency');
    expect(renderWaveProfile(graph).join('\n')).toContain('declared dependencies');
  });

  it('prints the critical path as a chain', () => {
    expect(renderWaveProfile(graph).join('\n')).toContain(
      `critical path: ${graph.criticalPath.join(' -> ')}`
    );
  });

  it('does NOT print the serializing-files list', () => {
    expect(renderWaveProfile(graph).join('\n')).not.toContain('these files serialize');
  });

  it('average width rises when a critical-path dependency edge is removed, and is unchanged when only off-path edges are removed', () => {
    // The load-bearing invariant behind this task's <decision>: average wave width only
    // moves when a removed edge lies on the longest chain, so a projected-width helper is
    // unnecessary -- printing the real critical path already answers "why is this narrow".
    // Measured [ran]: baseline 7 waves avg 1.7143; all 13 dependency edges removed -> 2
    // waves avg 6.0000; critical-path edges removed -> 5 waves avg 2.4000; off-path edges
    // removed only -> 7 waves avg 1.7143, unchanged.
    const baseline = waveProfile(graph);
    expect(baseline.waveCount).toBe(7);
    expect(baseline.avgWidth).toBeCloseTo(1.7143, 4);

    const cp = graph.criticalPath;
    const onPathPairs = new Set();
    for (let i = 0; i < cp.length - 1; i++) onPathPairs.add(`${cp[i]}->${cp[i + 1]}`);

    function rebuildFiltering(keepEdge) {
      const tasks2 = parsed.tasks.map((t) => ({
        ...t,
        dependencies: (t.dependencies || []).filter((d) => keepEdge(d, t.id)),
      }));
      return buildGraph(tasks2, parsed.grounding);
    }

    const allDepsRemoved = waveProfile(rebuildFiltering(() => false));
    expect(allDepsRemoved.waveCount).toBe(2);
    expect(allDepsRemoved.avgWidth).toBeCloseTo(6.0, 4);

    const criticalPathRemoved = waveProfile(
      rebuildFiltering((d, id) => !onPathPairs.has(`${d}->${id}`))
    );
    expect(criticalPathRemoved.waveCount).toBe(5);
    expect(criticalPathRemoved.avgWidth).toBeCloseTo(2.4, 4);

    const offPathRemovedOnly = waveProfile(
      rebuildFiltering((d, id) => onPathPairs.has(`${d}->${id}`))
    );
    expect(offPathRemovedOnly.waveCount).toBe(7);
    expect(offPathRemovedOnly.avgWidth).toBeCloseTo(1.7143, 4);
  });
});

/* Phase merging, added 2026-09-21. buildGraph computes waves across the WHOLE TRD and
 * /implement-trd then intersects them with ONE phase, dispatching phase by phase — a second
 * serialization layer on an ordering that is already correct. Measured: 4.4h of agent time
 * inside 6.42h of wall clock, 0.69x, with five phases awaited in turn. */
describe('phaseGroups', () => {
  const { phaseGroups } = require('./task-graph');
  const t = (id, phase, extra = {}) => ({ ...task(id, extra), phase });

  it('merges adjacent phases with nothing connecting them', () => {
    const tasks = [t('A-1', 1), t('A-2', 1), t('B-1', 2), t('B-2', 2)];
    expect(phaseGroups(tasks, buildGraph(tasks, {}))).toEqual([[1, 2]]);
  });

  it('keeps phases apart when a declared dependency crosses', () => {
    const tasks = [t('A-1', 1), t('B-1', 2, { dependencies: ['A-1'] })];
    expect(phaseGroups(tasks, buildGraph(tasks, {}))).toEqual([[1], [2]]);
  });

  it('keeps phases apart when a SHARED FILE crosses — the edge nobody declares', () => {
    // This is the case that makes concurrent phase dispatch unsafe: each phase workflow
    // gets a phase-filtered wave list and cannot see the other's file conflicts.
    const tasks = [t('A-1', 1), t('B-1', 2)];
    const grounding = { 'A-1': { touches: ['src/shared.ts'] }, 'B-1': { touches: ['src/shared.ts'] } };
    expect(phaseGroups(tasks, buildGraph(tasks, grounding))).toEqual([[1], [2]]);
  });

  it('will not absorb a phase coupled to ANY member of the group', () => {
    // 1 and 2 are free of each other; 3 depends on 1. 3 must not join, even though it is
    // unconnected to 2, because the group dispatches as one unit.
    const tasks = [t('A-1', 1), t('B-1', 2), t('C-1', 3, { dependencies: ['A-1'] })];
    expect(phaseGroups(tasks, buildGraph(tasks, {}))).toEqual([[1, 2], [3]]);
  });

  it('degrades to one dispatch per phase when everything is coupled', () => {
    const tasks = [
      t('A-1', 1),
      t('B-1', 2, { dependencies: ['A-1'] }),
      t('C-1', 3, { dependencies: ['B-1'] }),
    ];
    expect(phaseGroups(tasks, buildGraph(tasks, {}))).toEqual([[1], [2], [3]]);
  });

  it('handles a single-phase TRD and an empty one without special-casing upstream', () => {
    const tasks = [t('A-1', 1), t('A-2', 1)];
    expect(phaseGroups(tasks, buildGraph(tasks, {}))).toEqual([[1]]);
    expect(phaseGroups([], buildGraph([], {}))).toEqual([]);
  });
});

/**
 * FIX-003 (speed-sentence): the owner's time-matters sentence is appended at the mechanical
 * dispatch sites and ONLY there. The sentence is held below as a literal, so a paraphrase or a
 * typo in any workflow's TIME_MATTERS constant fails here.
 *
 * Run with: npx jest packages/core/workflows/speed-sentence.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { readScript, runWorkflow, makeAgentStub, makeParallelStub } = require('./test-harness');

const SENTENCE = 'Time matters here: do not spend time that can be avoided, and the earlier a correct result is obtained, the better.';
const ENDING = '\n\n' + SENTENCE;
const FILES = ['implement-phase.js', 'sweep.js', 'verify-functional.js', 'create-trd.js'];

const endsWithSentence = (c) => c.prompt.endsWith(ENDING);
const byLabel = (agent, test) => agent.calls.filter((c) => test(String(c.opts.label)));

describe('speed sentence: constant and mirror', () => {
  it.each(FILES)('%s declares TIME_MATTERS equal to the owner sentence, character for character', (file) => {
    const m = /^const TIME_MATTERS = '([^'\n]*)'$/m.exec(readScript(file));
    expect(m).not.toBeNull();
    expect(m[1]).toBe(SENTENCE);
  });

  it.each(FILES)('.claude/workflows/%s is byte-identical to the package copy', (file) => {
    const root = path.resolve(__dirname, '..', '..', '..');
    const a = fs.readFileSync(path.join(__dirname, file));
    const b = fs.readFileSync(path.join(root, '.claude', 'workflows', file));
    expect(b.equals(a)).toBe(true);
  });
});

describe('speed sentence: implement-phase', () => {
  it('ends every task prompt and the verify-app gate prompt with the sentence', async () => {
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label.startsWith('task:')) return { status: 'success', filesChanged: [] };
      if (opts.label === 'gate:verify-app') return { status: 'pass' };
      return null;
    });
    await runWorkflow(readScript('implement-phase.js'), {
      agent,
      parallel: makeParallelStub(),
      args: {
        trd: 'docs/TRD/example.md',
        phase: 1,
        tasks: { waves: [['A', 'B']], records: [{ id: 'A', prompt: 'do A' }, { id: 'B', prompt: 'do B' }] },
        gate: { verifyPrompt: 'verify' },
      },
    });
    const tasks = byLabel(agent, (l) => l.startsWith('task:'));
    expect(tasks).toHaveLength(2);
    expect(tasks.map((c) => c.prompt)).toEqual([`do A${ENDING}`, `do B${ENDING}`]);
    const gate = byLabel(agent, (l) => l === 'gate:verify-app');
    expect(gate).toHaveLength(1);
    expect(gate[0].prompt).toBe(`verify${ENDING}`);
  });
});

describe('speed sentence: sweep', () => {
  it('ends fix prompts with the sentence and leaves triage without it', async () => {
    const issues = [{ id: '12', summary: 'copy missing', region: 'web/confirm' }];
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'triage') return { fix: issues, deferred: [] };
      const m = /^fix:(.+)$/.exec(String(opts.label));
      if (m) return { id: m[1], status: 'fixed', summary: 's', files_changed: ['src/a.ts'], verified: 'ok' };
      return undefined;
    });
    await runWorkflow(readScript('sweep.js'), { agent, parallel: makeParallelStub(), args: { source: 'a list' } });
    const fixes = byLabel(agent, (l) => l.startsWith('fix:'));
    expect(fixes).toHaveLength(1);
    fixes.forEach((c) => expect(endsWithSentence(c)).toBe(true));
    const triage = byLabel(agent, (l) => l === 'triage');
    expect(triage).toHaveLength(1);
    expect(triage[0].prompt).not.toContain('Time matters');
  });
});

describe('speed sentence: verify-functional', () => {
  const criterion = (id, o = {}) => ({ id, statement: `statement for ${id}`, cites: 'FR-1', evidence: 'x', derivation: '[read]', ...o });
  const args = (o = {}) => ({
    criteria: [criterion('FS-1'), criterion('FS-2', { derivation: 'check:design-check', tier1: 'judge-only -- pictorial comparison' })],
    contract: 'c',
    notes: '',
    stackHints: 's',
    evidenceDir: '.trd-state/example/evidence',
    checker: '.claude/lib/functional-verification.js',
    since: 1700000000,
    cap: 3,
    statePath: '.trd-state/example/verification-state.json',
    reportPath: '.trd-state/example/verification-report.md',
    resume: null,
    project: '',
    feature: 'example',
    prd: 'docs/PRD/example.md',
    definitionPath: '.trd-state/example/success-definition.md',
    mustPassIds: ['FS-2'],
    checks: { 'design-check': 'CHECK SKILL TEXT' },
    pagesDir: '.trd-state/example/pages',
    ...o,
  });
  const crit = (id, status) => ({ id, status, tier1: status === 'met' ? 'pass' : 'fail', artifact: null, reason: status === 'met' ? null : 'r', files: [] });
  const judge = (action, criteria, extra = {}) => ({
    action, reason: 'r', criteria, gaps: [], unbuilt: [], closed: [], notesUpdated: false, ...extra,
  });

  const unproven = [crit('FS-1', 'met'), { id: 'FS-2', status: 'not_verifiable', tier1: 'skipped', artifact: null, reason: 'r', cause: 'environment-unreachable', files: [] }];
  const exercise = { claims: [{ criterion: 'FS-1', artifact: 'a' }, { criterion: 'FS-2', artifact: 'b' }] };

  it('ends the reconcile and render prompts with the sentence', async () => {
    // A Judge exit-satisfied with a must-pass item unproven forces the reconcile dispatch.
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercise;
      if (opts.label === 'judge') return judge('exit-satisfied', unproven);
      if (opts.label === 'reconcile') return { reconciled: true };
      if (opts.label === 'render') return { rendered: true, page: 'p', cards: 1 };
      return null;
    });
    await runWorkflow(readScript('verify-functional.js'), { agent, parallel: makeParallelStub(), args: args() });
    const render = byLabel(agent, (l) => l === 'render');
    const reconcile = byLabel(agent, (l) => l === 'reconcile');
    expect(render.length).toBeGreaterThan(0);
    expect(reconcile).toHaveLength(1);
    [...render, ...reconcile].forEach((c) => expect(endsWithSentence(c)).toBe(true));
    byLabel(agent, (l) => l === 'judge').forEach((c) => expect(c.prompt).not.toContain('Time matters'));
    byLabel(agent, (l) => l === 'exercise').forEach((c) => expect(c.prompt).not.toContain('Time matters'));
  });

  it('keeps exercise, judge and debug prompts free of the sentence', async () => {
    let judges = 0;
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'exercise') return exercise;
      if (opts.label === 'judge') {
        judges += 1;
        return judges === 1
          ? judge('remediate', [crit('FS-1', 'not_met'), crit('FS-2', 'met')], {
              gaps: ['FS-1'],
              debugGaps: [{ id: 'FS-1', statement: 'statement for FS-1', reason: 'r', artifact: null, files: ['src/a.js'] }],
            })
          : judge('exit-satisfied', [crit('FS-1', 'met'), crit('FS-2', 'met')]);
      }
      if (opts.label === 'debug') return { results: [{ criterion: 'FS-1', result: 'fixed' }] };
      if (opts.label === 'render') return { rendered: true, page: 'p', cards: 1 };
      return null;
    });
    await runWorkflow(readScript('verify-functional.js'), { agent, parallel: makeParallelStub(), args: args() });
    for (const label of ['judge', 'exercise', 'debug']) {
      const calls = byLabel(agent, (l) => l === label);
      expect(calls.length).toBeGreaterThan(0);
      calls.forEach((c) => expect(c.prompt).not.toContain('Time matters'));
    }
  });
});

describe('speed sentence: create-trd', () => {
  it('ends the ground:merge prompt with the sentence', async () => {
    const tasks = Array.from({ length: 17 }, (_, i) => ({ id: `F-B${String(i + 1).padStart(3, '0')}`, description: `t${i}`, serves: ['O1'], depends_on: [] }));
    const agent = makeAgentStub((prompt, opts) => {
      if (opts.label === 'triage:shape') return { shape: 'one-change', why: 'w' };
      if (opts.label === 'corpus-index') return { documents: [], conventions: [] };
      if (opts.label === 'author:technical-architect') {
        return { trd_path: 'docs/TRD/f.md', objectives: [{ id: 'O1', text: 'o' }], decisions: [{ id: 'D1', text: 'd' }], tasks };
      }
      if (opts.label === 'ground:merge') return { findings: [] };
      if (String(opts.label).startsWith('ground:brownfield')) {
        const m = /GROUND EXACTLY THESE, AND NO OTHERS: ([^\n]+)/.exec(prompt);
        const mine = m ? m[1].split(',').map((x) => x.trim()) : tasks.map((t) => t.id);
        return { blocks_markdown: mine.map((id) => `### ${id}`).join('\n'), grounded_task_ids: mine, replaces_found: [], findings: [] };
      }
      return undefined;
    });
    await runWorkflow(readScript('create-trd.js'), { agent, parallel: makeParallelStub(), args: { trd: 'docs/TRD/f.md', prd: 'docs/PRD/f.md', feature: 'f' } });
    const merge = byLabel(agent, (l) => l === 'ground:merge');
    expect(merge).toHaveLength(1);
    expect(endsWithSentence(merge[0])).toBe(true);
    byLabel(agent, (l) => l.startsWith('ground:brownfield')).forEach((c) => expect(c.prompt).not.toContain('Time matters'));
  });
});

describe('speed sentence: audit-trd verifiers stay clean', () => {
  it('does not append the sentence to verify:* prompts', async () => {
    const agent = makeAgentStub((prompt, opts) => {
      const l = String(opts.label);
      if (l === 'index') return { objectives: [], decisions: [], tasks: [{ id: 'F-B001', description: 'b', touches: ['a'] }], could_not_verify: [], open_questions: [] };
      if (l.startsWith('verify:')) return { findings: [] };
      if (l === 'reconcile:could-not-verify') return { could_not_verify_remaining: 0 };
      if (l === 'reconcile') return { applied: 0, rejected: 0, could_not_verify_remaining: 0, readout: 'x' };
      return undefined;
    });
    await runWorkflow(readScript('audit-trd.js'), { agent, parallel: makeParallelStub(), args: { trd: 'docs/TRD/f.md', source: 'docs/PRD/f.md' } });
    const v = byLabel(agent, (l) => l.startsWith('verify:'));
    expect(v.length).toBeGreaterThan(0);
    v.forEach((c) => expect(c.prompt).not.toContain('Time matters'));
  });
});

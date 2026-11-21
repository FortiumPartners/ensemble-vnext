'use strict';

// Holds packages/core/templates/retired-files.json (D9) in step with the names the old
// /rebase-project prose carried (frozen below) and with what the current plugin ships (D10).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const LIST = path.join(ROOT, 'packages/core/templates/retired-files.json');
const KNOWN = ['commands', 'agents', 'skills', 'hooks', 'hooks/lib', 'hooks/prompts',
  'workflows', 'lib', 'contracts', 'rules'];
const tmpRoots = [];

afterAll(() => tmpRoots.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

function tmp(prefix) {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  tmpRoots.push(d);
  return d;
}

const load = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const listed = (file) => load(file).entries.map((e) => e.path.replace(/\/$/, ''));

/**
 * The names the OLD /rebase-project prose carried (retired-agent/skill/command tables and the
 * retired-hooks paragraph), frozen when the prompt became a thin caller of the engine. The
 * prompt no longer lists retired files; retired-files.json is the only list. This literal is a
 * ratchet: nothing the old prose once named may drop out of the data file.
 */
const FROZEN_PROSE_NAMES = [
  'skills/verify-plan-recovery', 'commands/harden-trd-team.md', 'commands/verify-trd-team.md',
  'commands/implement-trd-team.md', 'commands/fix-issue.md', 'commands/investigate-issue.md',
  'commands/fix.md', 'commands/investigate.md', 'hooks/permitter', 'hooks/learning.sh',
  'hooks/save-remote-logs.js', 'hooks/async-discipline.js', 'hooks/autonomy-discipline.js',
  'hooks/subagent-discipline.js', 'hooks/lib/async-claim-detector.js',
  'hooks/lib/transcript-text.js', 'hooks/wiggum.js', 'hooks/prompts/subagent-discipline.prompt.md',
];

/** assertion (a): every prose name is in the data file. Returns missing names. */
function missingFromList(listFile) {
  const have = new Set(listed(listFile));
  return FROZEN_PROSE_NAMES.filter((n) => !have.has(n));
}

/** assertion (c): returns a list of problems with the entries. */
function entryProblems(file) {
  const bad = [];
  for (const e of load(file).entries) {
    const p = e.path;
    if (typeof p !== 'string' || !p || path.isAbsolute(p) || p.split('/').includes('..')) {
      bad.push(`unsafe path: ${p}`);
    }
    if (!KNOWN.includes(e.category)) bad.push(`unknown category: ${e.category} (${p})`);
  }
  return bad;
}

let renderDir;
/** Render of the current plugin with every library skill selected (scaffold into a temp dir). */
function render() {
  if (renderDir) return renderDir;
  renderDir = tmp('retired-render-');
  const skillsDir = path.join(ROOT, 'packages/skills');
  const names = fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory()).map((d) => d.name).sort();
  fs.mkdirSync(path.join(renderDir, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(renderDir, '.claude/selected-skills.txt'), names.join('\n') + '\n');
  const r = spawnSync('bash', [
    path.join(ROOT, 'packages/core/scripts/scaffold-project.sh'),
    '--plugin-dir', path.join(ROOT, 'packages/full'), '--copy-skills', renderDir,
  ], { encoding: 'utf8', env: { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(renderDir) } });
  // cp -RL of a setgid source directory into a temp dir of another group prints
  // "chmod: Operation not permitted" and exits non-zero on some hosts; the copy itself
  // is complete, so accept that one complaint and nothing else.
  const onlyChmodNoise = r.stderr.split("\n").filter(Boolean)
    .every((l) => /^cp: chmod: .*Operation not permitted$/.test(l));
  if (r.status !== 0 && !onlyChmodNoise) throw new Error(`render failed: ${r.stderr}`);
  if (!fs.existsSync(path.join(renderDir, ".claude/commands/plan.md"))) throw new Error("render holds no commands");
  return renderDir;
}

/** assertion (b): listed paths the render still holds. */
function stillShipped(file) {
  const dir = path.join(render(), '.claude');
  return listed(file).filter((p) => fs.existsSync(path.join(dir, p)));
}

function mutated(fn) {
  const d = tmp('retired-mut-');
  const f = path.join(d, 'retired-files.json');
  const data = load(LIST);
  fn(data);
  fs.writeFileSync(f, JSON.stringify(data));
  return f;
}

describe('retired-files.json', () => {
  test('parses with versioned entries carrying category, retiredIn, replacedBy', () => {
    const data = load(LIST);
    expect(data.version).toBe(1);
    for (const e of data.entries) {
      expect(Object.keys(e).sort()).toEqual(['category', 'path', 'replacedBy', 'retiredIn']);
    }
    const paths = data.entries.map((e) => e.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  test('(a) holds every name the old prose carried (frozen list)', () => {
    expect(FROZEN_PROSE_NAMES.length).toBe(18);
    expect(missingFromList(LIST)).toEqual([]);
  });

  test('(a) fails when one prose name is removed from the list', () => {
    const f = mutated((d) => { d.entries = d.entries.filter((e) => e.path !== 'commands/fix.md'); });
    expect(missingFromList(f)).toEqual(['commands/fix.md']);
  });

  test('holds the history-only deletions and not the never-installed paths', () => {
    const have = new Set(listed(LIST));
    for (const p of ['commands/create-prd-team.md', 'commands/create-trd-team.md',
      'commands/implement-trd-proposed.md', 'commands/implement-trd-tasklist.md',
      'hooks/prompts/async-discipline.prompt.md', 'hooks/prompts/autonomy-discipline.prompt.md']) {
      expect(have.has(p)).toBe(true);
    }
    expect(have.has('hooks/hooks.json')).toBe(false);
    expect(have.has('commands/init-project.md.bak')).toBe(false);
  });

  test('(b) no listed path is in a render of the current plugin', () => {
    expect(stillShipped(LIST)).toEqual([]);
  });

  test('(b) fails on an entry for a command the plugin ships', () => {
    expect(fs.existsSync(path.join(render(), '.claude/commands/plan.md'))).toBe(true);
    const f = mutated((d) => d.entries.push({ path: 'commands/plan.md', category: 'commands', retiredIn: null, replacedBy: null }));
    expect(stillShipped(f)).toEqual(['commands/plan.md']);
  });

  test('(c) every entry is relative, has no .. and a known category', () => {
    expect(entryProblems(LIST)).toEqual([]);
  });

  test('(c) fails on entries with .., an absolute path or an unknown category', () => {
    const dots = mutated((d) => d.entries.push({ path: 'commands/../../x', category: 'commands', retiredIn: null, replacedBy: null }));
    expect(entryProblems(dots)).toHaveLength(1);
    const abs = mutated((d) => d.entries.push({ path: '/etc/passwd', category: 'commands', retiredIn: null, replacedBy: null }));
    expect(entryProblems(abs)).toHaveLength(1);
    const cat = mutated((d) => d.entries.push({ path: 'x', category: 'nope', retiredIn: null, replacedBy: null }));
    expect(entryProblems(cat)).toHaveLength(1);
  });
});

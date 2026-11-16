'use strict';

// Guard for the per-kind publishing switch (docs/TRD/publish-artifacts-per-kind.md).
// `ensemble.publishArtifacts` is read ONLY by `node .claude/lib/artifacts.js publish --kind K`.
// A command or contract that reads the old boolean itself would skip the per-kind defaults and
// the --publish request, so this suite fails on those sentences, and on a publish site (a
// section holding an `Artifact({ file_path` call) that never asks the resolver first.
// Prose-level assertions: they prove the files TELL the model the right thing, not that a run obeyed.

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..', '..');
const DIRS = ['packages/core/commands', 'packages/core/contracts'];

const read = (p) => fs.readFileSync(p, 'utf8');
const flat = (s) => s.replace(/\s+/g, ' ');

const files = DIRS.flatMap((d) =>
  fs.readdirSync(path.join(REPO, d))
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({ name: `${d}/${f}`, text: read(path.join(REPO, d, f)) })));

/** Split a document into its ## / ### sections (the heading line starts each one). */
const sections = (text) => text.split(/^(?=#{2,3} )/m);

describe('publish switch prose', () => {
  test('the scan finds the command and contract files', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  // The old reading: the setting treated as one boolean that a command parses itself.
  const OLD_BOOLEAN = [
    /publishArtifacts\s*:\s*false/,
    /publishArtifacts\s*===\s*false/,
    /publishArtifacts\s+is\s+false/,
  ];

  test.each(files.map((f) => [f.name, f.text]))('%s never reads the old boolean', (name, text) => {
    // Two things are not a read of the setting: "`ensemble.publishArtifacts: false` still wins"
    // (the rule for a --publish request) and a STUCK `Reason:` line that quotes the resolver's
    // own printed reason (the resolver prints "publishArtifacts is false"). Strip both.
    const stripped = text
      .split('\n').filter((l) => !/^Reason:/.test(l)).join('\n')
      .replace(/\s+/g, ' ')
      .replace(/`?ensemble\.publishArtifacts: false`? still wins/g, '');
    const hits = OLD_BOOLEAN.filter((re) => re.test(stripped)).map(String);
    expect(hits).toEqual([]);
  });

  test('the matcher fails when an old sentence is restored', () => {
    const restored = 'Unless `ensemble.publishArtifacts: false`, publish the TRD.';
    expect(OLD_BOOLEAN.some((re) => re.test(flat(restored)))).toBe(true);
    expect(OLD_BOOLEAN.some((re) => re.test('the publishArtifacts is false case'))).toBe(true);
  });

  test('every publish site asks the resolver before its Artifact call', () => {
    const sites = [];
    for (const f of files) {
      for (const s of sections(f.text)) {
        if (!/Artifact\(\{\s*file_path/.test(s)) continue;
        sites.push({ where: `${f.name} :: ${s.split('\n')[0]}`, asks: /artifacts\.js\s+publish\b/.test(flat(s)) });
      }
    }
    expect(sites.length).toBeGreaterThan(0);
    expect(sites.filter((x) => !x.asks).map((x) => x.where)).toEqual([]);
  });
});

// A command that chains another hands its `--publish` on, or the chained run silently
// publishes nothing (TRD Decision: plan -> implement-trd, verify-build -> implement-trd --chained,
// audit-build -> implement-trd --reconcile). `[--publish]` in an args string is the optional
// token: the surrounding prose must say it goes in only when THIS run carried it.
describe('publish pass-through on chained commands', () => {
  const cmd = (n) => flat(read(path.join(REPO, 'packages/core/commands', n)));
  const hasToken = (line) => /(?:^|[\s\[`])--publish\b/.test(line);
  const IMPLEMENT_CHAIN = /Skill\(\{ skill: "implement-trd", args: "<trd(?:-path)?> --reconcile --chained \[--publish\]" \}\)/g;

  test('audit-build: both implement-trd chain lines carry [--publish], conditioned on this run', () => {
    const t = cmd('audit-build.md');
    expect(t.match(IMPLEMENT_CHAIN)).toHaveLength(2);
    expect(t).toMatch(/`--publish` goes in the args only when this run carried it/);
    expect(t).toMatch(/\(add `--publish` only when this run carried it\)/);
  });

  test('verify-build: both implement-trd chain lines carry [--publish]', () => {
    const t = cmd('verify-build.md');
    // The round-k line wraps in the source; flat() joins it.
    expect(t.match(IMPLEMENT_CHAIN)).toHaveLength(2);
  });

  test('plan: generic chain and the verify step append --publish when this run carried it, never to /sweep', () => {
    const t = cmd('plan.md');
    expect(t).toMatch(/Skill\(\{ skill: chainSkill, args: chainArgs \}\)` \(append `--publish` to `chainArgs` when this run carried it\)/);
    expect(t).toMatch(/When this run carried `--publish`, append it to the `verify` step's args and to the `implement` step's args \(step 7\), never to `\/sweep`'s/);
    // The sweep chain's implement step reads chainSteps.implement.args, not chainArgs (null there).
    expect(t).toMatch(/append `--sweep-flag "<flag>"`[^]*When this run carried `--publish`, append it to those args too/);
  });

  test('the matcher fails when the --publish token is removed from a chain line', () => {
    const line = 'Skill({ skill: "implement-trd", args: "<trd-path> --reconcile --chained [--publish]" })';
    expect(IMPLEMENT_CHAIN.test(line)).toBe(true);
    IMPLEMENT_CHAIN.lastIndex = 0;
    expect(IMPLEMENT_CHAIN.test(line.replace(' [--publish]', ''))).toBe(false);
    IMPLEMENT_CHAIN.lastIndex = 0;
    expect(hasToken('append `--publish` to chainArgs')).toBe(true);
    expect(hasToken('append it to chainArgs')).toBe(false);
  });
});

// A kind whose resolver prints `publish: off` makes no publish call but still records its path
// with an empty url, so a stale page is never republished (TRD Decision: 'A switched-off kind
// clears its stored link (--url "")'). Checked per publish site: a section that calls
// `artifacts.js record` AND either asks the resolver (`artifacts.js publish`) or makes the
// `Artifact({ file_path` call. Some commands (verify-build, task, the design contract) state the
// publish in prose without a literal Artifact call, so the resolver ask counts as a site too.
describe('every publish site clears the stored link when its kind is off', () => {
  const EMPTY_URL = /--url\s+""/;
  const sites = [];
  for (const f of files) {
    for (const s of sections(f.text)) {
      const t = flat(s);
      if (!/Artifact\(\{\s*file_path|artifacts\.js\s+publish\b/.test(t) || !/artifacts\.js\s+record\b/.test(t)) continue;
      sites.push({ file: f.name, where: `${f.name} :: ${s.split('\n')[0]}`, text: t });
    }
  }

  test('the scan finds the publish sites, and covers the named commands and the design contract', () => {
    const covered = new Set(sites.map((x) => x.file));
    for (const n of ['create-prd', 'refine-prd', 'create-trd', 'refine-trd', 'plan', 'verify-build',
      'task', 'audit-build', 'audit-prd', 'audit-trd', 'implement-trd']) {
      expect(covered).toContain(`packages/core/commands/${n}.md`);
    }
    expect(covered).toContain('packages/core/contracts/design-commands.md');
    // audit-docs has no artifacts.js record step, and refine-verification never publishes (it only
    // records with --url "", asserted in verify-command-surface.test.js), so neither is a site.
    expect(covered).not.toContain('packages/core/commands/audit-docs.md');
  });

  test('each site states the off case records --url ""', () => {
    expect(sites.filter((x) => !EMPTY_URL.test(x.text)).map((x) => x.where)).toEqual([]);
  });

  test('the matcher fails when the --url "" sentence is removed', () => {
    const sentence = 'When it reads `publish: off`, make no publish call and record with `--url ""`.';
    expect(EMPTY_URL.test(sentence)).toBe(true);
    expect(EMPTY_URL.test(sentence.replace(/ and record with `--url ""`/, ''))).toBe(false);
  });
});

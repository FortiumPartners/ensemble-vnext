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
    // own printed reason (the resolver prints "ensemble.publishArtifacts is false"). Strip both.
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

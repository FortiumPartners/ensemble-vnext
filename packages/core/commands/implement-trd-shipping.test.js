'use strict';

/** Text checks for FIX-004: review edits and build edits are committed, not left dirty. */
const fs = require('fs');
const path = require('path');

const flat = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8').replace(/\s+/g, ' ');
const trd = flat('implement-trd.md');
const fix = flat('../contracts/ship-primitive-fix-findings.md');

describe('implement-trd §7.2 and --shipping', () => {
  it('commits the review edits by pathspec, never git add -A', () => {
    expect(trd).toMatch(/Commit what the review changed \(every mode\)/);
    expect(trd).toContain('git add -- <paths>');
    expect(trd).toContain('end-of-run review edits');
  });
  it('makes the --shipping RETURN line wait for the review result', () => {
    expect(trd).toMatch(/The RETURN line waits for §7\.2's review result/);
  });
});

describe('fix-findings contract', () => {
  it('snapshots with git hash-object, compares, and commits by pathspec', () => {
    expect(fix).toContain('git hash-object');
    expect(fix).toContain('snapshot again and compare');
    expect(fix).toMatch(/Commit those paths by pathspec/);
  });
});

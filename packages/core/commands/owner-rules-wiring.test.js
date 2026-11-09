'use strict';
// The verification pass reads owner-governed rules through owner-rules.js, never the raw path.
const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const impl = read('commands/implement-trd.md');
const vb = read('commands/verify-build.md');
const contract = read('contracts/functional-verification.md');

// Count read sites through the path form, tolerant of a line break inside the command.
const count = (text, file) =>
  (text.match(new RegExp('owner-rules\\.js\\s+path\\s+' + file.replace('.', '\\.'), 'g')) || []).length;
// Any mention of the raw branch path other than a discovery record's `file: '...'`.
const rawBranchRead = (text) =>
  text.match(/(?<!file: ')\.claude\/rules\/(verification|stack)\.md/g) || [];

describe('owner-rules wiring', () => {
  test('implement-trd §3.6a runs resolve first and reports notices as ISSUES', () => {
    const s = impl.slice(impl.indexOf('### 3.6a'));
    expect(s.slice(0, 2500)).toContain('node .claude/lib/owner-rules.js resolve');
    expect(impl).toMatch(/owner-rules notice/i);
  });

  test('implement-trd reads verification.md/stack.md via the path form', () => {
    expect(impl).toContain('owner-rules.js path verification.md');
    expect(impl).toContain('owner-rules.js path stack.md');
    expect(impl).not.toMatch(/check-verification-unfilled \\\n\s+\.claude\/rules\/verification\.md/);
    expect(impl).not.toMatch(/read-coverage-floor \.claude\/rules\/verification\.md/);
  });

  test('verify-build step 2 runs resolve, including under --chained', () => {
    expect(vb).toContain('owner-rules.js resolve');
    expect(vb).toMatch(/--chained/);
    expect(vb).toContain('owner-rules.js path verification.md');
  });

  test('the contract tells loop agents to read the path form', () => {
    expect(contract).toContain('owner-rules.js path stack.md');
    expect(contract).toContain('owner-rules.js path verification.md');
  });

  test('every read site in the contract uses the path form (verification x2, stack x1)', () => {
    expect(count(contract, 'verification.md')).toBeGreaterThanOrEqual(2);
    expect(count(contract, 'stack.md')).toBeGreaterThanOrEqual(1);
    expect(rawBranchRead(contract)).toEqual([]);
  });

  test('implement-trd read sites all use the path form', () => {
    expect(count(impl, 'verification.md')).toBeGreaterThanOrEqual(8);
    expect(count(impl, 'stack.md')).toBeGreaterThanOrEqual(1);
    expect(rawBranchRead(impl)).toEqual([]);
  });

  test('verify-build read sites use the path form; only discovery records name the raw file', () => {
    expect(count(vb, 'verification.md')).toBeGreaterThanOrEqual(2);
    expect(rawBranchRead(vb)).toEqual([]);
  });

  test('discoveries keep naming the real file', () => {
    expect(vb).toContain("file: '.claude/rules/verification.md'");
  });
});

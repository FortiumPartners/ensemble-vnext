'use strict';
// The verification pass reads owner-governed rules through owner-rules.js, never the raw path.
const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const impl = read('commands/implement-trd.md');
const vb = read('commands/verify-build.md');
const contract = read('contracts/functional-verification.md');

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

  test('discoveries keep naming the real file', () => {
    expect(vb).toContain("file: '.claude/rules/verification.md'");
  });
});

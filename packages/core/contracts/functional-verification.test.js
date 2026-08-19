'use strict';

const fs = require('fs');
const path = require('path');

const CORE_PATH = path.join(__dirname, 'functional-verification.md');
const MIRROR_PATH = path.join(__dirname, '..', '..', '..', '.claude', 'contracts', 'functional-verification.md');

describe('functional-verification contract', () => {
  let coreText;
  let mirrorText;

  beforeAll(() => {
    coreText = fs.readFileSync(CORE_PATH, 'utf8');
    mirrorText = fs.readFileSync(MIRROR_PATH, 'utf8');
  });

  test('exists in both packages/core/contracts and .claude/contracts', () => {
    expect(fs.existsSync(CORE_PATH)).toBe(true);
    expect(fs.existsSync(MIRROR_PATH)).toBe(true);
  });

  test('the two copies are byte-identical', () => {
    expect(mirrorText).toBe(coreText);
  });

  test('states the mandatory citation rule and the domain-derived label', () => {
    expect(coreText).toMatch(/citation rule/i);
    expect(coreText).toContain('domain-derived');
    expect(coreText).toMatch(/dropped, not invented/);
  });

  test('states the empty-definition rule (AC-3)', () => {
    expect(coreText).toMatch(/empty-definition rule/i);
    expect(coreText).toContain('**Criteria**: 0');
  });

  test('carries all four D12 stack-keyed hint rows', () => {
    expect(coreText).toMatch(/Web UI/);
    expect(coreText).toMatch(/HTTP API/);
    expect(coreText).toMatch(/\bCLI\b/);
    expect(coreText).toMatch(/Mobile/);
  });

  test('carries all three derivation/evidence markers', () => {
    expect(coreText).toContain('[ran]');
    expect(coreText).toContain('[read]');
    expect(coreText).toContain('[inferred]');
  });

  test('states all four judge statuses and distinguishes unbuilt from not_verifiable', () => {
    expect(coreText).toMatch(/\bmet\b/);
    expect(coreText).toMatch(/not_met/);
    expect(coreText).toMatch(/not_verifiable/);
    expect(coreText).toMatch(/unbuilt/);
    expect(coreText).toMatch(/Do not collapse `unbuilt` into `not_verifiable`/);
  });

  test("states the debugger's brief: fix in place, do not re-verify, do not implement absent capability", () => {
    expect(coreText).toMatch(/Does not re-verify/);
    expect(coreText).toMatch(/Does not implement absent capability/);
  });

  test('states the credential rule (S-1): location, never value', () => {
    expect(coreText).toMatch(/## S-1/);
    expect(coreText).toMatch(/never its value/);
  });

  test('states the authorization rule (S-2): authorized targets only', () => {
    expect(coreText).toMatch(/## S-2/);
    expect(coreText).toMatch(/never to\s+a guessed endpoint/);
  });

  test('contains no instruction to invent a criterion or a harness', () => {
    expect(coreText).not.toMatch(/invent a (criterion|harness)(?!.{0,40}(never|non-goal|does not))/i);
    expect(coreText).toMatch(/never instructs.*inventing a criterion/is);
  });
});

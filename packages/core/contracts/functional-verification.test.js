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

  test('states the locator rule, its byte cap, and the image limit (D6, VCON-B007)', () => {
    expect(coreText).toMatch(/## The locator rule, and its limit/);
    expect(coreText).toContain('2,000,000 bytes');
    expect(coreText).toMatch(/literal substring match/i);
    expect(coreText).toMatch(/tier 1 cannot check image evidence/i);
  });

  test('documents the Tier 1 column with both values and the judge-only requirement (§3.8, VCON-B007)', () => {
    expect(coreText).toMatch(/## Tier 1 — locator or judge-only \(§3\.8\)/);
    expect(coreText).toMatch(/\|\s*`locator`\s*\|/);
    expect(coreText).toMatch(/\|\s*`judge-only`\s*\|/);
    expect(coreText).toMatch(/must state, in the same cell, why no text assertion is possible/);
  });

  test('the success-definition fenced example carries Tier 1 and Parts columns (§3.8, AMEND-001)', () => {
    expect(coreText).toMatch(/\|\s*Evidence that would prove it\s*\|\s*Derivation\s*\|\s*Tier 1\s*\|\s*Parts\s*\|/);
    expect(coreText).toMatch(/\|\s*judge-only — pixel\/colour comparison, no text assertion is possible\s*\|\s*32\s*\|/);
  });

  test('states the capture-only exercise discipline and no longer states the old one-boot-every-criterion phrasing (D11, VCON-B007)', () => {
    expect(coreText).not.toMatch(/One exerciser, one boot, every criterion/);
    expect(coreText).toMatch(/\*\*One boot per slice, over that slice's criteria\.\*\*/);
    expect(coreText).toMatch(/\*\*Capture only\.\*\*/);
    expect(coreText).toMatch(/may\s+\*\*not\*\*\s+edit source, rebuild, restart, or re-deploy/);
  });

  test('states insufficient-coverage in the loop exit vocabulary, alongside the other four outcomes', () => {
    expect(coreText).toMatch(/`satisfied`, `unbuilt`, `stalled`,\s*\n?`stuck`, or `insufficient-coverage`/);
    expect(coreText).toMatch(/never `unbuilt`/);
  });

  test('no longer claims every status is freshly produced by the final iteration (VCON-B004 correction)', () => {
    expect(coreText).not.toMatch(/there is never a carried-forward status to disambiguate from a fresh one/);
    expect(coreText).toMatch(/carries `met` and `not_verifiable` forward as \*\*settled\*\*/);
  });

  test('states the data-permission prohibition: must-not-be-touched is unreachable, reads included', () => {
    expect(coreText).toMatch(/must not be touched.{0,80}not reachable at all — not even for a read/is);
    expect(coreText).toMatch(/forbids reaching it in any capacity,\s*\nreads included/);
  });

  test('states the Parts column is derived from the criterion text only, and cannot pass incrementally (AMEND-001)', () => {
    expect(coreText).toMatch(/never by counting artifacts, parsing the source document, or/);
    expect(coreText).toMatch(/blank must never be\s*\nread as 1/);
    expect(coreText).toMatch(/a criterion carrying a `Parts` count cannot pass\s*\nincrementally/i);
  });

  test('states the alignment-artifact strengthening of Evidence that would prove it (AMEND-001)', () => {
    expect(coreText).toMatch(/\*\*Alignment artifacts\.\*\*/);
    expect(coreText).toMatch(/must name\s*\nan artifact that proves ALIGNMENT with what was asked for/);
    expect(coreText).toMatch(/This strengthens the existing column; it does not add a second/);
  });
});

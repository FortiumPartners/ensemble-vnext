'use strict';

/**
 * ship-template.test.js -- pins the ship.md template's shape (TRD ship-build AC-F1.1, AMEND-003).
 *
 * The template ships with NO active step under `## Ship` (so parse yields policy 'none') and its
 * "default string" is the FIRST example under `## Examples (not run)`.
 * This repo's own `.claude/rules/ship.md` is deliberately NOT required to match the template.
 *
 * Run with: npx jest packages/core/contracts/ship-template.test.js
 */

const fs = require('fs');
const path = require('path');
const seq = require('../lib/ship-sequencer');

const TEMPLATE = path.join(__dirname, '..', 'templates', 'claude-directory', 'rules', 'ship.md');
const tpl = fs.readFileSync(TEMPLATE, 'utf8');
const { contracts, errors: loadErrors } = seq.loadPrimitives(__dirname);

/** Body of a level-2 section, from its heading to the next `## ` heading. */
function sectionBody(text, heading) {
  const m = new RegExp(`^## ${heading.replace(/[()]/g, '\\$&')}\\s*$`, 'm').exec(text);
  if (!m) return null;
  const rest = text.slice(m.index + m[0].length);
  const next = /^## /m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

describe('the ship.md template', () => {
  test('the contracts load, so the parser results below mean something', () => {
    expect(loadErrors).toEqual([]);
    expect(contracts.size).toBeGreaterThan(0);
  });

  test('parses to policy none with no steps and no errors', () => {
    const r = seq.parse(tpl, contracts);
    expect(r.policy).toBe('none');
    expect(r.steps).toEqual([]);
    expect(r.errors).toEqual([]);
  });

  test('the ## Ship section body has no numbered primitive line outside a fence', () => {
    const body = sectionBody(tpl, 'Ship');
    expect(body).not.toBeNull();
    const unfenced = body.replace(/```[\s\S]*?```/g, '');
    expect(unfenced).not.toMatch(/^\s*\d+\.\s+\S/m);
  });

  describe('the default string', () => {
    // Examples are fenced blocks that themselves contain `## ` headings, so take everything after
    // the heading rather than cutting at the next one.
    const examples = tpl.slice(tpl.search(/^## Examples \(not run\)\s*$/m));
    const sentenceAt = examples.indexOf('The default string');
    const firstFence = /```\n([\s\S]*?)```/.exec(examples);
    const allFences = [...examples.matchAll(/```\n([\s\S]*?)```/g)];

    test('the sentence naming it comes before the first fenced example', () => {
      expect(sentenceAt).toBeGreaterThan(-1);
      expect(firstFence).not.toBeNull();
      expect(sentenceAt).toBeLessThan(firstFence.index);
      // no other fence sits between the sentence and the first fence
      expect(allFences[0].index).toBe(firstFence.index);
    });

    const parsed = seq.parse(firstFence[1], contracts);

    test('parses with no error and is an active policy', () => {
      expect(parsed.errors).toEqual([]);
      expect(parsed.policy).toBe('ship.md');
    });

    test('its ## Ship steps are push, open-pr, repeat, merge, release in order', () => {
      const ship = parsed.steps.filter((s) => s.section === 'ship');
      expect(ship.map((s) => s.primitive)).toEqual(['push', 'open-pr', 'repeat', 'merge', 'release']);
    });

    test('the repeat is until=clean rounds=2 around the review loop', () => {
      const rep = parsed.steps.find((s) => s.primitive === 'repeat');
      expect(rep.repeat).toEqual({ until: 'clean', rounds: 2 });
      expect(rep.body.map((b) => b.primitive)).toEqual([
        'push', 'request-review', 'wait-ci', 'collect-findings', 'fix-findings',
      ]);
      expect(rep.body[1].params.tool).toBe('coderabbit');
    });

    test('release targets production and carries an identity command placeholder', () => {
      const rel = parsed.steps.find((s) => s.primitive === 'release');
      expect(rel.params.env).toBe('production');
      expect(rel.params.identity).toMatch(/^<.+>$/);
    });
  });

  test('this repo\'s own .claude/rules/ship.md is not required to match the template', () => {
    const own = path.join(__dirname, '..', '..', '..', '.claude', 'rules', 'ship.md');
    // Only its parse is checked: it must not throw. Its content is the owner's, free to differ.
    if (fs.existsSync(own)) {
      expect(() => seq.parse(fs.readFileSync(own, 'utf8'), contracts)).not.toThrow();
    }
    expect(true).toBe(true);
  });
});

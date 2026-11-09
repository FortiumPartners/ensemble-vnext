'use strict';

/**
 * ship-tracker.test.js -- checks on the issue-tracker contract between stack.md.template and the
 * ship primitives (TRD ship-build, AC-F10.1). Add a top-level describe per concern.
 *
 * Run with: npx jest packages/core/contracts/ship-tracker.test.js
 */

const fs = require('fs');
const path = require('path');

const TEMPLATE = path.join(__dirname, '..', 'templates', 'stack.md.template');
const CLOSE_ISSUE = path.join(__dirname, 'ship-primitive-close-issue.md');

/** Body of the `## Issue Tracker` section, up to the next `---` or `## ` heading. */
function trackerSection() {
  const text = fs.readFileSync(TEMPLATE, 'utf8');
  const start = text.search(/^## Issue Tracker\s*$/m);
  if (start === -1) return null;
  const rest = text.slice(start).replace(/^## Issue Tracker\s*$/m, '');
  const end = rest.search(/^(---|## )/m);
  return end === -1 ? rest : rest.slice(0, end);
}

describe('stack.md.template Issue Tracker section', () => {
  test('has a "## Issue Tracker" heading', () => {
    expect(trackerSection()).not.toBeNull();
  });

  test('declares a Tracker: line defaulting to none', () => {
    const m = trackerSection().match(/^Tracker:[ \t]*(.*)$/m);
    expect(m).not.toBeNull();
    expect(m[1].trim()).toBe('none');
  });

  test('declares a Project: line', () => {
    expect(trackerSection()).toMatch(/^Project:/m);
  });

  test('lists the supported tracker kinds the primitives mention', () => {
    const section = trackerSection();
    const primitive = fs.readFileSync(CLOSE_ISSUE, 'utf8');
    for (const kind of ['github', 'linear', 'jira', 'none']) {
      expect(section).toContain(`\`${kind}\``);
    }
    // close-issue handles exactly the non-none kinds; keep the template in step with it.
    expect(primitive).toMatch(/GitHub/);
    expect(primitive).toMatch(/Linear/);
    expect(primitive).toMatch(/Jira/);
    expect(primitive).toContain('## Issue Tracker');
  });
});

describe('close-issue and file-followups read the declared tracker from stack.md (AC-F10.2)', () => {
  const primitives = {
    'close-issue': path.join(__dirname, 'ship-primitive-close-issue.md'),
    'file-followups': path.join(__dirname, 'ship-primitive-file-followups.md'),
  };

  // Joined across line breaks so a wrapped sentence still matches.
  const flat = (file) => fs.readFileSync(file, 'utf8').replace(/\s+/g, ' ');

  for (const [name, file] of Object.entries(primitives)) {
    describe(name, () => {
      test('names the `## Issue Tracker` section of stack.md, the heading the template declares', () => {
        const text = flat(file);
        expect(text).toContain('stack.md');
        expect(text).toContain('## Issue Tracker');
        expect(fs.readFileSync(TEMPLATE, 'utf8')).toMatch(/^## Issue Tracker\s*$/m);
      });
    });
  }

  test('close-issue instructs reading Tracker: and Project: under the section in stack.md, via owner-rules.js', () => {
    // stack.md is owner-governed, so it is read through owner-rules.js (issue #90), never raw.
    expect(flat(primitives['close-issue'])).toMatch(
      /Read `Tracker:` and `Project:` under `## Issue Tracker` in the file at `\$\(node \.claude\/lib\/owner-rules\.js path stack\.md\)`/
    );
  });

  test('close-issue uses the Tracker: value to select the tool', () => {
    const text = flat(primitives['close-issue']);
    expect(text).toContain('`Tracker:`');
    expect(text).toMatch(/GitHub/);
    expect(text).toMatch(/Linear/);
    expect(text).toMatch(/Jira/);
  });

  test('file-followups reads the tracker from the same section, "as close-issue reads it"', () => {
    const text = flat(primitives['file-followups']);
    expect(text).toMatch(/tracker from `stack\.md`'s `## Issue Tracker` section/);
    expect(text).toContain('as `close-issue` reads it');
  });

  test('file-followups reports "no tracker declared in stack.md" when none is declared', () => {
    expect(flat(primitives['file-followups'])).toContain('no tracker declared in stack.md');
  });
});

describe('no tracker declared: close-issue and file-followups degrade, they do not fail (AC-F10.3)', () => {
  const os = require('os');
  const seq = require('../lib/ship-sequencer');
  const { contracts } = seq.loadPrimitives(__dirname);
  const flat = (file) => fs.readFileSync(file, 'utf8').replace(/\s+/g, ' ');
  const closeIssue = path.join(__dirname, 'ship-primitive-close-issue.md');
  const fileFollowups = path.join(__dirname, 'ship-primitive-file-followups.md');

  test('close-issue returns `none` for `Tracker: none`, naming that in data.issues', () => {
    const text = flat(closeIssue);
    expect(text).toMatch(/Absent, unfilled or `none`: return `none` and name that in `data\.issues`/);
    expect(text).toMatch(/or `none` with the reason in `data\.issues`/);
  });

  test('close-issue declares both of its result names in `results:`', () => {
    expect(contracts.get('close-issue').results).toEqual(['closed', 'none']);
  });

  test('file-followups files nothing without a tracker and names each unfiled row in data.issues', () => {
    const text = flat(fileFollowups);
    expect(text).toMatch(/No tracker, or a failed call: file nothing for that row and leave it open/);
    expect(text).toMatch(/one line per item, each naming the row by its summary and its ledger path/);
    expect(text).toContain('no tracker declared in stack.md');
  });

  test('file-followups declares `filed` (its result for the no-tracker case too) in `results:`', () => {
    // The no-tracker path is not a separate result: the primitive returns `filed` with
    // `filed: []` and the unfiled rows in `data.issues`.
    expect(contracts.get('file-followups').results).toEqual(['filed']);
    expect(flat(fileFollowups)).toMatch(/`filed`, with `data`: `\{ filed: \[\{ summary, url \}\], unfiled: \[row summaries\], issues \}`/);
  });

  test('the sequencer treats a recorded `none` from close-issue as non-blocking: the run completes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-tracker-'));
    try {
      const policy = path.join(dir, 'ship.md');
      fs.writeFileSync(policy, '## Ship\n1. push\n\n## After shipping\n1. close-issue\n');
      const autonomy = path.join(dir, 'autonomy.md');
      fs.writeFileSync(autonomy, `${seq.AUTHORIZATION_SENTENCE}\n`);
      const stateDir = path.join(dir, 'state');
      const opts = { contractsDir: __dirname, autonomyPath: autonomy, settingsPath: path.join(dir, 'none.json') };

      const started = seq.start({ stateDir, policyPath: policy, work: { kind: 'feature', id: 'f' }, contractsDir: __dirname });
      expect(started.errors).toEqual([]);
      expect(started.ok).toBe(true);

      const first = seq.next(stateDir, opts);
      expect(first.action).toBe('run');
      expect(first.step.primitive).toBe('push');
      expect(seq.record(stateDir, { step: first.step.id, result: contracts.get('push').results[0] }, opts).ok).toBe(true);

      const second = seq.next(stateDir, opts);
      expect(second.action).toBe('run');
      expect(second.step.primitive).toBe('close-issue');
      const rec = seq.record(
        stateDir,
        { step: second.step.id, result: 'none', data: { issues: ['no tracker declared in stack.md'] } },
        opts
      );
      expect(rec.ok).toBe(true);
      expect(rec.status).toBe('done');
      expect(contracts.get('close-issue').stopsOn).not.toContain('none');
      expect(seq.next(stateDir, opts).action).toBe('done');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

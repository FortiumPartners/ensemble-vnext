// ship-build SHIP-B008 (D13): `/verify-build <trd> --criteria <ids> --no-fix --chained` is a
// targeted re-verification, a mode of /verify-build rather than a new command. The command is
// prose a model reads, so this suite pins the prose; mirrors must be byte-identical.
'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..', '..');
const CORE = path.join(REPO, 'packages/core/commands/verify-build.md');
const MIRROR = path.join(REPO, '.claude/commands/verify-build.md');
const IMPLEMENT = path.join(REPO, 'packages/core/commands/implement-trd.md');

const read = (p) => fs.readFileSync(p, 'utf8');
const flat = (s) => s.replace(/\s+/g, ' ');
const text = () => flat(read(CORE));
const criteria = () => text().split('## `--criteria <ids>`')[1].split('## `--fix [plan-path]`')[0];

describe('verify-build.md --criteria (D13)', () => {
  test('mirror is byte-identical', () => {
    expect(read(MIRROR)).toBe(read(CORE));
  });

  test('argument-hint carries --criteria <ids>', () => {
    expect(read(CORE).split('\n')[4]).toMatch(/^argument-hint:.*\[--criteria <ids>\] \[--chained\]"/);
  });

  test('the flag and its value are stripped before the path is read', () => {
    expect(text()).toMatch(/Strip the flag \*\*and its value\*\*/);
    expect(criteria()).toMatch(/Strip the flag and its value\*\* before the path is read/);
  });

  test('the subset has its own paths under .trd-state/<feature>/reverify/', () => {
    const s = criteria();
    expect(s).toMatch(/`statePath`, `reportPath`, `evidenceDir` and `pagesDir` are all under `\.trd-state\/<feature>\/reverify\/`/);
    expect(s).toMatch(/feature's own `verification-state\.json` and `verification-report\.md` are not touched/);
  });

  test('one iteration, so the loop never reaches Debug', () => {
    expect(criteria()).toMatch(/`cap: 1`.*never reaches its in-place Debug stage/);
  });

  test('criteria filtered, mustPassIds restricted, mustPassUncovered empty, no coverage floor', () => {
    const s = criteria();
    expect(s).toMatch(/filter `criteria` to the named ids/);
    expect(s).toMatch(/Restrict `mustPassIds` to them/);
    expect(s).toMatch(/`mustPassUncovered: \[\]`/);
    expect(s).toMatch(/`coverageFloor: null` \(no coverage floor\)/);
    expect(text()).toMatch(/Under `--criteria`, 3c's coverage floor and must-pass are overridden/);
  });

  test('no check-skill rows, no full deploy, no publish, no artifacts record', () => {
    const s = criteria();
    expect(s).toMatch(/No check-skill rows\*\* \(skip step 3b\)/);
    expect(s).toMatch(/`fullRunCommand: ""`/);
    expect(s).toMatch(/no publish\*\* and \*\*no `artifacts\.js record`/);
    expect(text()).toMatch(/Under `--criteria`, skip this step entirely/);
  });

  test('an unknown id ends on RETURN → not run: unknown criterion <id>', () => {
    expect(criteria()).toContain('[STATUS: /verify-build] RETURN → not run: unknown criterion <id>');
  });

  test('--chained --criteria ends on the existing RETURN line with no banner or notify-complete.sh', () => {
    const t = text();
    expect(criteria()).toMatch(/`--chained --criteria` ends on the existing `RETURN` line.*no banner and no `notify-complete\.sh`/);
    expect(t.split('## `--chained`')[1]).toMatch(/Honoured only when Step 1 resolved a sweep file, or a TRD with `--criteria`/);
    expect(t.split('## Output discipline')[1]).toMatch(/Under `--chained` \(a sweep file, or a TRD with `--criteria`\) none of the rest of this section applies/);
  });

  test('step 4 still lists the same fields as implement-trd.md 8.3 (29)', () => {
    const fields = (src, marker, end) => {
      const block = src.split(marker)[1].split(end)[0];
      return [...block.matchAll(/^\s{2}([A-Za-z]+),?\s|^\s{2}([A-Za-z]+):/gm)].map((m) => m[1] || m[2]);
    };
    const v = fields(read(CORE), 'Workflow({ name: "verify-functional", args: {', '} })');
    expect(v.length).toBe(29);
    expect(read(IMPLEMENT)).toContain('verify-functional');
    expect(text()).toMatch(/`criterionCovers` is the one field the regression pass added: the list is the 29 fields/);
  });

  test('names the derive-criteria command, the sweep-file {} and the failure fallback (REGR-B006)', () => {
    expect(text()).toContain('node .claude/lib/live-evidence.js derive-criteria --state-dir <state-dir> --trd <trd> --definition <state-dir>/success-definition.md');
    expect(text()).toMatch(/A sweep file has no TRD: pass `\{\}`/);
    expect(text()).toMatch(/A non-zero exit passes `\{\}` and is one ISSUES line, never STUCK/);
  });

  describe('the one re-proof retry', () => {
    test('retries only the not-met criteria, once, chosen by reproof-retry-set', () => {
      const s = criteria();
      expect(s).toMatch(/\*\*One retry, no Debug\*\*/);
      expect(s).toMatch(/node \.claude\/lib\/functional-verification\.js reproof-retry-set \.trd-state\/<feature>\/reverify\/verification-state\.json/);
      expect(s).toMatch(/empty `retry` list means no retry/);
      expect(s).toMatch(/only the criteria that were not met/);
      expect(s).toMatch(/at most once/);
    });
    test('the retry runs no Debug, edits no code and builds nothing', () => {
      expect(criteria()).toMatch(/no Debug pass, no code edit and no build/);
      expect(criteria()).toMatch(/not a second iteration of the loop/);
    });
    test('the retry has its own folder and a recomputed since', () => {
      const s = criteria();
      expect(s).toMatch(/`\.trd-state\/<feature>\/reverify\/retry\/`/);
      expect(s).toMatch(/`resume: null`/);
      expect(s).toMatch(/`since` recomputed as the later of the HEAD commit time and the retry's own start/);
      expect(s).toMatch(/`cap` stays `1`/);
    });
    test('the merge goes through merge-reproof-retry and marks retried: true', () => {
      const s = criteria();
      expect(s).toMatch(/merge-reproof-retry --first \.trd-state\/<feature>\/reverify\/verification-state\.json --second \.trd-state\/<feature>\/reverify\/retry\/verification-state\.json/);
      expect(s).toMatch(/`retried: true`/);
      expect(s).toMatch(/`satisfied` only when every criterion is met/);
    });
    test('RETURN uses the merged counts and the report files stay separate', () => {
      const s = criteria();
      expect(s).toMatch(/merged `outcome`, `met` and `total`/);
      expect(s).toMatch(/`reverify\/verification-report\.md` stays the first run's report/);
      expect(s).toMatch(/`reverify\/retry\/verification-report\.md` is the retry's/);
    });
    test('step 4 override names the retry and keeps 29 fields; RETURN line unchanged', () => {
      const t = text();
      expect(t).toMatch(/\*\*Under `--criteria`\*\*.*retry.*reverify\/retry\//);
      expect(t).toMatch(/the list is the 29 fields/);
      expect(t).toContain('`RETURN → setup-failure, <met> of <total> met`');
    });
  });
});

describe('verify-build.md derives criterionCovers (REGR-B006)', () => {
  const derive = () => text().split('`criterionCovers` is derived first')[1].split('```javascript')[0];

  test('names the same derive-criteria command as implement-trd.md 8.3', () => {
    const cmd = 'node .claude/lib/live-evidence.js derive-criteria --state-dir <state-dir> --trd <trd> --definition <state-dir>/success-definition.md';
    expect(derive()).toContain(cmd);
    expect(flat(read(IMPLEMENT))).toContain(cmd);
  });

  test('a sweep file passes {}', () => {
    expect(derive()).toMatch(/A sweep file has no TRD: pass `\{\}`/);
  });

  test('a non-zero exit passes {} and is one ISSUES line, never STUCK', () => {
    expect(derive()).toMatch(/A non-zero exit passes `\{\}` and is one ISSUES line, never STUCK/);
  });

  test('under --criteria it derives over the whole definition and reuses the value on the retry', () => {
    expect(derive()).toMatch(/Under `--criteria` derive over the whole definition.*pass the same value on the retry/);
  });

  test('the dispatch-block comment says {} for a sweep file or when the derive fails', () => {
    expect(text()).toMatch(/criterionCovers,\s+\/\/ `node \.claude\/lib\/live-evidence\.js derive-criteria`.*\{\} for a sweep file or when the derive fails/);
  });
});

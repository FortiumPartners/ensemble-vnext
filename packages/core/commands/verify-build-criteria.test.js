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

  test('step 4 still lists the same fields as implement-trd.md 8.3 (26), none added', () => {
    const fields = (src, marker, end) => {
      const block = src.split(marker)[1].split(end)[0];
      return [...block.matchAll(/^\s{2}([A-Za-z]+),?\s|^\s{2}([A-Za-z]+):/gm)].map((m) => m[1] || m[2]);
    };
    const v = fields(read(CORE), 'Workflow({ name: "verify-functional", args: {', '} })');
    expect(v.length).toBe(26);
    expect(read(IMPLEMENT)).toContain('verify-functional');
    expect(text()).toMatch(/No field is added or removed: the list stays the 26 fields/);
  });
});

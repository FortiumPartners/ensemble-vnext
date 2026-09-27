/**
 * docs/TRD/functional-verification.md <-> delivered code, kept in step (VCON-D001).
 *
 * That TRD is named by /verify-build §4 as "the authority on what the fields ARE" for the
 * verify-functional workflow, and it has drifted from the code twice already: §3.3's argument
 * list went 15 -> undeclared-reads (Finding A, fixed in 2.1.0), and its header version fell a
 * whole minor release behind its own changelog. Both were accidents -- nobody DECIDED the spec
 * should stop describing the code -- which is the one kind of change a test here earns its
 * place by catching.
 *
 * So every assertion below compares the TRD against something executable: the workflow's own
 * `a.*` reads, its return object, its outcome map and action enum, the lib's failure strings,
 * and the command's parsed flags. None of them pins the TRD's wording.
 *
 * Run with: npx jest packages/core/workflows/verify-functional-trd-sync.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { readScript } = require('./test-harness');

const REPO = path.join(__dirname, '..', '..', '..');
const TRD = fs.readFileSync(path.join(REPO, 'docs/TRD/functional-verification.md'), 'utf8');
const WORKFLOW = readScript('verify-functional.js');
const LIB = fs.readFileSync(path.join(REPO, 'packages/core/lib/functional-verification.js'), 'utf8');
const COMMAND = fs.readFileSync(path.join(REPO, 'packages/core/commands/implement-trd.md'), 'utf8');

// The text of one `### <n> ` section, up to the next `###`/`##` heading.
function section(number) {
  const lines = TRD.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`### ${number} `));
  if (start === -1) throw new Error(`TRD has no "### ${number} " heading`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^#{2,3} /.test(l));
  return lines.slice(start, end === -1 ? undefined : start + 1 + end).join('\n');
}

// Top-level member names of `interface <name> { ... }` in a TypeScript block. "Top-level" is
// two-space indentation -- a nested object's members sit deeper and are not the interface's own.
function interfaceFields(text, name) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`interface ${name} {`));
  if (start === -1) throw new Error(`no "interface ${name} {" found`);
  const fields = [];
  for (const line of lines.slice(start + 1)) {
    if (line === '}') break;
    const m = line.match(/^ {2}([A-Za-z_]\w*)\??:/);
    if (m) fields.push(m[1]);
  }
  return fields;
}

// The single-quoted literals in a `type <name> = 'a' | 'b' ...;` declaration.
function typeUnion(text, name) {
  const m = text.match(new RegExp(`type ${name} =([\\s\\S]*?);`));
  if (!m) throw new Error(`no "type ${name} =" found`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

const sorted = (xs) => [...new Set(xs)].sort();

// --------------------------------------------------------------------------- §3.3 arguments

describe('§3.3 VerifyFunctionalArgs declares exactly what the workflow reads', () => {
  const declared = interfaceFields(section('3.3'), 'VerifyFunctionalArgs');
  const read = sorted([...WORKFLOW.matchAll(/\ba\.([A-Za-z_]\w*)/g)].map((m) => m[1]));

  it('the workflow reads 18 fields (sanity check on the extraction itself)', () => {
    expect(read).toHaveLength(18);
  });

  it('every field the workflow reads is declared, and nothing is declared that it does not read', () => {
    expect(sorted(declared)).toEqual(read);
  });

  it('declares exerciseLanes with its shape, not just its name -- the one argument a reader cannot guess', () => {
    const laneFields = interfaceFields(section('3.3'), 'ExerciseLane');
    const defaultLane = WORKFLOW.match(/return \[\{ (resource: null, concurrency: 1, createCommand: '', criteria: [^\]]*?) \}\]/);
    expect(defaultLane).not.toBeNull();
    const normalised = [...defaultLane[1].matchAll(/([A-Za-z_]\w*):/g)].map((m) => m[1]);
    expect(sorted(laneFields)).toEqual(sorted(normalised));
  });
});

// --------------------------------------------------------------------------- §3.3 result

describe('§3.3 VerifyFunctionalResult declares exactly what the workflow returns', () => {
  const body = WORKFLOW.split('function buildFinalResult(')[1].split('\n}\n')[0];
  const returned = sorted(
    body
      .split('return {')[1]
      .split('\n')
      .map((l) => l.match(/^ {4}([A-Za-z_]\w*)\s*[:,]/))
      .filter(Boolean)
      .map((m) => m[1])
  );

  it('the return object has keys (sanity check on the extraction itself)', () => {
    expect(returned.length).toBeGreaterThan(5);
  });

  it('declares every key buildFinalResult returns, and no key it does not', () => {
    expect(sorted(interfaceFields(section('3.3'), 'VerifyFunctionalResult'))).toEqual(returned);
  });
});

// --------------------------------------------------------------------------- outcomes

describe('every outcome the workflow can return is named where the TRD enumerates outcomes', () => {
  const outcomes = sorted(
    [...WORKFLOW.split('const OUTCOME_BY_ACTION = {')[1].split('}')[0].matchAll(/: '([^']+)'/g)].map((m) => m[1])
  );

  it('the outcome map has five values (sanity check on the extraction itself)', () => {
    expect(outcomes).toHaveLength(5);
  });

  it("§3.3's result `outcome` union", () => {
    const m = section('3.3').match(/^ {2}outcome: ([^;]+);/m);
    expect(m).not.toBeNull();
    expect(sorted([...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]))).toEqual(outcomes);
  });

  it("§3.7's Step 9 outcome list", () => {
    const step9 = section('3.7').split('**Step 9**')[1];
    expect(step9).toBeDefined();
    for (const o of outcomes) expect(step9).toContain(`\`${o}\``);
  });

  it("§3.4's LoopAction union matches the Judge schema's action enum", () => {
    const enumMatch = WORKFLOW.match(/enum: \[('exit-satisfied'[^\]]*)\]/);
    expect(enumMatch).not.toBeNull();
    const actions = [...enumMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(sorted(typeUnion(section('3.4'), 'LoopAction'))).toEqual(sorted(actions));
  });
});

// --------------------------------------------------------------------------- §3.2 failures

describe('§3.2 names every tier-1 failure checkEvidence can return', () => {
  it('EvidenceFailure equals the set of failure strings in the lib', () => {
    const body = LIB.split('function checkEvidence(')[1].split('\n}\n')[0];
    const produced = sorted([...body.matchAll(/failure: '([a-z-]+)'/g)].map((m) => m[1]));
    expect(produced.length).toBeGreaterThan(5);
    expect(sorted(typeUnion(section('3.2'), 'EvidenceFailure'))).toEqual(produced);
  });
});

// --------------------------------------------------------------------------- §3.7 flag polarity

describe("§3.7's flag polarity agrees with the command's parsed flags", () => {
  const argumentHint = COMMAND.split('---')[1].match(/argument-hint: "([^"]*)"/)[1];

  it('the command is default-on with --no-verify as the opt-out (precondition)', () => {
    expect(argumentHint).toContain('--no-verify');
  });

  it('§3.7 names --no-verify and no longer describes the loop as opt-in', () => {
    const s = section('3.7');
    expect(s).toContain('`--no-verify`');
    expect(s).not.toMatch(/Absent → nothing in this TRD executes/);
    expect(s).not.toContain('--verify not set');
  });
});

// --------------------------------------------------------------------------- header vs changelog

describe('the header states the newest changelog row', () => {
  const semver = (v) => v.split('.').map(Number);
  const cmp = (a, b) => {
    const [x, y] = [semver(a), semver(b)];
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return 0;
  };
  const rows = [...TRD.matchAll(/^\| (\d+\.\d+\.\d+) \| (\d{4}-\d{2}-\d{2}) \|/gm)].map((m) => ({ v: m[1], d: m[2] }));
  const newest = rows.reduce((a, b) => (cmp(a.v, b.v) >= 0 ? a : b));

  it('**Version** is the highest changelog version', () => {
    expect(TRD.match(/^\*\*Version\*\*: (\S+)/m)[1]).toBe(newest.v);
  });

  it('**Last Updated** is that row\'s date', () => {
    expect(TRD.match(/^\*\*Last Updated\*\*: (\S+)/m)[1]).toBe(newest.d);
  });
});

/**
 * replay.js test suite (DQ-B010, D16).
 *
 * Model-free and Chromium-free: critic outputs are recorded literals, `claude` is a jest.fn.
 * Run with: npx jest test/design-critique-corpus
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const replay = require('./replay');
const { parseLabels, agreement, bandAgreement, formatReport, perDimension, spread, meanScore, parseCriticOutput, readRubric, buildPrompt, invokeCritic, run, main, LabelError } = replay;

function row(over = {}) {
  return { id: 'a', frame: 'frames/a.png', measures: 'measures/a.json', board_source: 'b/a.dc.html', label: 'poor', reason: 'r', source: 's', ...over };
}

/** A temp corpus dir holding the named frames and measures, so file checks pass. */
function corpusDir(ids) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dq-b010-'));
  fs.mkdirSync(path.join(dir, 'frames'));
  fs.mkdirSync(path.join(dir, 'measures'));
  for (const id of ids) {
    fs.writeFileSync(path.join(dir, 'frames', `${id}.png`), 'png');
    fs.writeFileSync(path.join(dir, 'measures', `${id}.json`), '{"measures":[]}');
  }
  return dir;
}

const jsonl = (rows) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n';

describe('agreement', () => {
  // Hand-computed: good A=4, B=2; poor C=3, D=1. Pairs (A,C) win, (A,D) win, (B,C) lose, (B,D) win -> 3 of 4.
  const labels = [
    { id: 'A', label: 'good' }, { id: 'B', label: 'good' }, { id: 'C', label: 'poor' }, { id: 'D', label: 'poor' },
  ];
  const means = { A: 4, B: 2, C: 3, D: 1 };

  it('is the share of good/poor pairs where the good frame scored higher', () => {
    expect(agreement(labels, means)).toEqual({ computable: true, pairs: 4, wins: 3, share: 0.75 });
  });

  it('does not count a tie as a win', () => {
    expect(agreement([{ id: 'A', label: 'good' }, { id: 'C', label: 'poor' }], { A: 3, C: 3 }).share).toBe(0);
  });

  it('is "not computable" with no good-labelled frame', () => {
    const r = agreement([{ id: 'C', label: 'poor' }, { id: 'D', label: 'poor' }], { C: 3, D: 1 });
    expect(r.computable).toBe(false);
    expect(r.reason).toMatch(/not computable/);
  });

  it('is "not computable" with no poor-labelled frame', () => {
    expect(agreement([{ id: 'A', label: 'good' }], { A: 4 }).computable).toBe(false);
  });
});

describe('perDimension', () => {
  const labels = [
    { id: 'A', label: 'good', dimensions: { hierarchy: 4, craft: 2 } },
    { id: 'B', label: 'poor' }, // no dimensions: contributes nothing
  ];
  const runs = [
    { id: 'A', scores: { Hierarchy: 5, Craft: 2 } },
    { id: 'A', scores: { Hierarchy: 3, Craft: 'not judged' } },
    { id: 'B', scores: { Hierarchy: 1, Craft: 1 } },
  ];

  it('reports mean absolute difference and exact-match share only for labelled rows', () => {
    const r = perDimension(labels, runs);
    expect(Object.keys(r).sort()).toEqual(['craft', 'hierarchy']);
    // hierarchy: mean(5,3)=4 vs 4 -> diff 0, exact. craft: only the numeric 2 counts -> diff 0, exact.
    expect(r.hierarchy).toEqual({ frames: 1, meanAbsDiff: 0, exactMatch: 1 });
    expect(r.craft).toEqual({ frames: 1, meanAbsDiff: 0, exactMatch: 1 });
  });

  it('computes a non-zero difference', () => {
    const r = perDimension([{ id: 'A', label: 'good', dimensions: { hierarchy: 2 } }], [{ id: 'A', scores: { hierarchy: 4 } }]);
    expect(r.hierarchy).toEqual({ frames: 1, meanAbsDiff: 2, exactMatch: 0 });
  });

  it('is empty when no row carries dimensions', () => {
    expect(perDimension([{ id: 'B', label: 'poor' }], runs)).toEqual({});
  });
});

describe('spread and meanScore', () => {
  it('meanScore averages numeric scores and skips "not judged"', () => {
    expect(meanScore({ scores: { a: 2, b: 4, c: 'not judged' } })).toBe(3);
    expect(meanScore({ scores: { a: 'not judged' } })).toBeNull();
  });

  it('spread is the sample standard deviation (n-1) of a frame\'s run means', () => {
    const runs = [3, 4, 5].map((m) => ({ id: 'A', mean: m }));
    runs.push({ id: 'B', mean: 2 });
    const s = spread(runs);
    expect(s.A).toBeCloseTo(1, 10);
    expect(s.B).toBeNull(); // one run: no spread to measure
  });
});

describe('parseCriticOutput', () => {
  it('strips a json code fence', () => {
    expect(parseCriticOutput('```json\n{"scores":{"a":1}}\n```')).toEqual({ scores: { a: 1 } });
  });
  it('rejects output with no scores object', () => {
    expect(() => parseCriticOutput('{"x":1}')).toThrow(/scores/);
  });
});

describe('parseLabels', () => {
  it('accepts well-formed rows whose files exist', () => {
    const dir = corpusDir(['a']);
    expect(parseLabels(jsonl([row()]), dir)).toHaveLength(1);
  });

  it.each([
    ['bad json', '{nope\n'],
    ['bad label', jsonl([row({ label: 'ok' })])],
    ['missing reason', jsonl([row({ reason: '' })])],
    ['dimension out of range', jsonl([row({ dimensions: { hierarchy: 6 } })])],
    ['dimension not integer', jsonl([row({ dimensions: { hierarchy: 'x' } })])],
  ])('rejects a malformed row: %s', (_n, text) => {
    expect(() => parseLabels(text, corpusDir(['a']))).toThrow(LabelError);
  });

  it('rejects a duplicate id', () => {
    expect(() => parseLabels(jsonl([row(), row()]), corpusDir(['a']))).toThrow(/duplicate/);
  });

  it('fails on a missing frame or measures file, naming the row', () => {
    const dir = corpusDir(['a']);
    fs.unlinkSync(path.join(dir, 'frames', 'a.png'));
    expect(() => parseLabels(jsonl([row()]), dir)).toThrow(/line 1.*frames\/a\.png/);
    const dir2 = corpusDir(['a']);
    fs.unlinkSync(path.join(dir2, 'measures', 'a.json'));
    expect(() => parseLabels(jsonl([row()]), dir2)).toThrow(/measures\/a\.json/);
  });

  it('the committed labels.jsonl is well-formed: eight poor rows, files present', () => {
    const rows = parseLabels(fs.readFileSync(path.join(__dirname, 'labels.jsonl'), 'utf8'), __dirname);
    expect(rows).toHaveLength(8);
    expect(rows.every((r) => r.label === 'poor' && /visually poor/.test(r.reason))).toBe(true);
  });
});

describe('the critic call', () => {
  it('reads the rubric from the contract at run time', () => {
    const text = readRubric();
    expect(text).toMatch(/^## 8\. Visual critique/);
    expect(text).toMatch(/Hierarchy/);
    expect(text).not.toMatch(/^## 7\./m);
    // not copied into the replay source, or the replayed critic would drift from the shipped one
    expect(fs.readFileSync(path.join(__dirname, 'replay.js'), 'utf8')).not.toMatch(/the eye finds the primary thing first/);
  });

  it('spawns claude with an argument array, never a shell string', () => {
    const spawn = jest.fn(() => ({ status: 0, stdout: JSON.stringify({ result: '{"scores":{"hierarchy":3}}' }) }));
    const out = invokeCritic('PROMPT', { model: 'claude-x', spawn });
    expect(out).toEqual({ scores: { hierarchy: 3 } });
    const [cmd, args, opts] = spawn.mock.calls[0];
    expect(cmd).toBe('claude');
    expect(Array.isArray(args)).toBe(true);
    expect(args).toEqual(expect.arrayContaining(['-p', 'PROMPT', '--model', 'claude-x', '--output-format', 'json']));
    expect(opts.shell).toBeFalsy();
    expect(opts).toEqual(expect.objectContaining({ encoding: 'utf8', maxBuffer: expect.any(Number), timeout: expect.any(Number) }));
  });

  it('omits --model when none is given', () => {
    const spawn = jest.fn(() => ({ status: 0, stdout: JSON.stringify({ result: '{"scores":{}}' }) }));
    invokeCritic('P', { spawn });
    expect(spawn.mock.calls[0][1]).not.toContain('--model');
  });

  it('throws when claude exits non-zero', () => {
    expect(() => invokeCritic('P', { spawn: () => ({ status: 1, stderr: 'boom' }) })).toThrow(/boom/);
  });

  it('puts the frame path, measures and rubric in the prompt as data', () => {
    const p = buildPrompt({ rubric: 'RUBRIC', framePath: '/x/a.png', measuresText: '{"m":1}' });
    expect(p).toMatch(/RUBRIC/);
    expect(p).toMatch(/\/x\/a\.png/);
    expect(p).toMatch(/\{"m":1\}/);
  });
});

describe('bandAgreement (computable on a one-label set, AC-F9.2)', () => {
  const poor = [{ id: 'A', label: 'poor' }, { id: 'B', label: 'poor' }, { id: 'C', label: 'poor' }];

  it('scores an all-poor set: the share of frames whose mean rounds below 4', () => {
    expect(bandAgreement(poor, { A: 2.4, B: 3.4, C: 3.6 })).toEqual({ computable: true, frames: 3, inBand: 2, share: 2 / 3, unscored: [] });
  });

  it('puts a good frame in band only when its mean rounds to 4 or 5', () => {
    const r = bandAgreement([{ id: 'G', label: 'good' }, { id: 'H', label: 'good' }], { G: 3.5, H: 3.4 });
    expect(r).toMatchObject({ frames: 2, inBand: 1, share: 0.5 });
  });

  it('counts a frame with no score as unscored, never as a miss, and is not computable with none scored', () => {
    expect(bandAgreement(poor, { A: 2 })).toMatchObject({ computable: true, frames: 1, inBand: 1, unscored: ['B', 'C'] });
    expect(bandAgreement(poor, {})).toMatchObject({ computable: false, reason: expect.stringMatching(/not computable/) });
  });
});

describe('the replay prompt and report on an all-poor set with as-is frames', () => {
  it('tells the critic to score every frame itself, as-is frames included', () => {
    const p = buildPrompt({ rubric: 'RUBRIC', framePath: '/x/01-home--as-is.png', measuresText: '{}' });
    expect(p).toMatch(/Score this frame itself, as a to-be board with no predecessor, whatever its file name says/);
    expect(p).toMatch(/as-is or parts board is not judged does not apply here/);
  });

  it('reports agreement by band, and says why a frame has no spread', () => {
    const labels = [{ id: 'p1', label: 'poor' }, { id: 'p2', label: 'poor' }];
    const runs = [
      { id: 'p1', run: 1, scores: { hierarchy: 2 }, mean: 2 }, { id: 'p1', run: 2, scores: { hierarchy: 3 }, mean: 3 },
      { id: 'p2', run: 1, scores: { hierarchy: 'not judged' }, mean: null }, { id: 'p2', run: 2, scores: { hierarchy: 'not judged' }, mean: null },
    ];
    const text = formatReport({ runsPerFrame: 2, model: null, runs, report: replay.buildReport(labels, runs) });
    expect(text).toMatch(/Agreement by band: 1\/1 scored frames in their label's band \(100%/);
    expect(text).toMatch(/1 frame\(s\) unscored \(every dimension not judged\): p2/);
    expect(text).toMatch(/Agreement by ranking: not computable/);
    expect(text).toMatch(/Spread p2: n\/a \(0 of 2 runs gave a score; needs 2\)/);
    expect(text).toMatch(/Spread p1: 0\.71/);
  });
});

describe('run (whole replay, spawn mocked)', () => {
  const dir = corpusDir(['g', 'p']);
  const labelsText = jsonl([row({ id: 'g', frame: 'frames/g.png', measures: 'measures/g.json', label: 'good' }), row({ id: 'p', frame: 'frames/p.png', measures: 'measures/p.json' })]);
  fs.writeFileSync(path.join(dir, 'labels.jsonl'), labelsText);

  function spawnBy(scoreFor) {
    return jest.fn((cmd, args) => {
      const prompt = args[args.indexOf('-p') + 1];
      const id = /frames\/(\w)\.png/.exec(prompt)[1];
      return { status: 0, stdout: JSON.stringify({ result: JSON.stringify({ scores: { hierarchy: scoreFor(id) } }) }) };
    });
  }

  it('runs the critic runs x frames times and reports agreement, per-dimension and spread', () => {
    const spawn = spawnBy((id) => (id === 'g' ? 4 : 2));
    const r = run({ dir, runs: 3, spawn });
    expect(spawn).toHaveBeenCalledTimes(6);
    expect(r.runs).toHaveLength(6);
    expect(r.report.agreement).toEqual({ computable: true, pairs: 1, wins: 1, share: 1 });
    expect(r.report.spread.g).toBe(0);
  });

  it('a low agreement is a report, not a failure: main returns exit code 0', () => {
    const spawn = spawnBy((id) => (id === 'g' ? 1 : 5)); // good frame scored lowest: agreement 0
    const out = path.join(dir, 'out.json');
    const lines = [];
    const code = main(['--dir', dir, '--runs', '1', '--out', out], { spawn, log: (s) => lines.push(s) });
    expect(code).toBe(0);
    expect(JSON.parse(fs.readFileSync(out, 'utf8')).report.agreement.share).toBe(0);
    expect(lines.join('\n')).toMatch(/agreement/i);
  });

  it('rejects a bad --runs', () => {
    expect(() => main(['--dir', dir, '--runs', '0'], { spawn: jest.fn() })).toThrow(/--runs/);
  });
});

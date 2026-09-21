/**
 * compare-runs.test.js — the three properties a PRE/POST gate must have.
 *
 * WHY THIS EXISTS, and it is not a hypothetical.
 *
 * Until 2026-09-21 this tool failed EVERYTHING, including a comparison of the baseline
 * against itself. Measured: 8 runs of one unchanged prompt, and of the 11 cases ever judged
 * wrong, ZERO were wrong in all 8 — every one varied run to run. The tool's "wrong in more
 * than half the runs" rule then resolved those coin flips at random, and the three cases
 * that happened to sit nearest the half-way line decided every verdict it ever produced.
 * Three earlier prompt edits were abandoned on that evidence.
 *
 * A gate that cannot pass is exactly as useless as one that cannot fail, so all three
 * properties below are tested together. Loosening the rules to make a change pass is the
 * obvious failure mode of the fix, and `fails a genuinely bad change` is what stops it.
 *
 * compare-runs.js is a script, not a module — it runs on import and calls process.exit —
 * so these drive it as a subprocess over fixture files.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, 'compare-runs.js');

/** One scored run. `wrong` lists [id, class, kind] judged incorrectly in THIS run. */
function run({ tp = 30, fp = 4, tn = 48, fn = 0, wrong = [] }) {
  const byClass = {};
  const overallFp = [];
  const overallFn = [];
  for (const [id, cls, kind] of wrong) {
    const rec = {
      id,
      class: cls,
      event: 'Stop',
      source: 'fixture',
      expected: kind === 'FP' ? 'clean' : 'violation',
      predicted: kind === 'FP' ? 'violation' : 'clean',
      elapsedMs: 1,
      textSnippet: 'fixture',
    };
    const b = (byClass[cls] = byClass[cls] || { falsePositives: [], misses: [] });
    if (kind === 'FP') {
      b.falsePositives.push(rec);
      overallFp.push(rec);
    } else {
      b.misses.push(rec);
      overallFn.push(rec);
    }
  }
  return {
    overall: {
      tp, fp, tn, fn,
      precision: tp / (tp + fp),
      recall: tp / (tp + fn),
      falsePositives: overallFp,
      misses: overallFn,
    },
    byClass,
  };
}

function compare(preRuns, postRuns) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmp-'));
  const write = (rs, tag) =>
    rs.map((r, i) => {
      const p = path.join(dir, `${tag}${i}.json`);
      fs.writeFileSync(p, JSON.stringify(r));
      return p;
    });
  const res = spawnSync(
    process.execPath,
    [SCRIPT, '--pre', ...write(preRuns, 'pre'), '--post', ...write(postRuns, 'post')],
    { encoding: 'utf-8' }
  );
  return { status: res.status, out: `${res.stdout}${res.stderr}` };
}

describe('compare-runs gate', () => {
  it('PASSES when nothing changed — the null test that used to fail', () => {
    // Identical inputs on both sides. There is no change to detect, so a failure here
    // means the tool is measuring its own variance.
    const runs = [run({}), run({}), run({}), run({})];
    const { status, out } = compare(runs, runs);
    expect(out).toContain('VERDICT: PASS');
    expect(status).toBe(0);
  });

  it('PASSES when the only differences are cases the judge cannot decide consistently', () => {
    // `c-flaky` is wrong in 2 of 4 pre runs and 3 of 4 post runs. Under the old majority
    // rule that crosses the half-way line and reported a regression. It is noise.
    const pre = [
      run({ wrong: [['c-flaky', 'conversational-no-command', 'FP']] }),
      run({ wrong: [['c-flaky', 'conversational-no-command', 'FP']] }),
      run({}),
      run({}),
    ];
    const post = [
      run({ wrong: [['c-flaky', 'conversational-no-command', 'FP']] }),
      run({ wrong: [['c-flaky', 'conversational-no-command', 'FP']] }),
      run({ wrong: [['c-flaky', 'conversational-no-command', 'FP']] }),
      run({}),
    ];
    const { status, out } = compare(pre, post);
    expect(out).toContain('UNSTABLE ON IDENTICAL INPUT');
    expect(out).toContain('c-flaky');
    expect(out).toContain('VERDICT: PASS');
    expect(status).toBe(0);
  });

  it('FAILS a genuinely bad change — right in every pre run, wrong in every post run', () => {
    const pre = [run({}), run({}), run({}), run({})];
    const bad = [['c-broken', 'self-documentation', 'FP']];
    const post = [
      run({ wrong: bad }), run({ wrong: bad }), run({ wrong: bad }), run({ wrong: bad }),
    ];
    const { status, out } = compare(pre, post);
    expect(out).toContain('REGRESSED c-broken');
    expect(out).toContain('VERDICT: FAIL');
    expect(status).toBe(1);
  });

  it('does not blame a change for a false positive the baseline already had', () => {
    // Pre-existing and flaky: present in 3 of 4 pre runs. Landing 4-of-4 in a post sample
    // is chance, not a regression the change introduced.
    const fp = [['c-preexisting', 'incidental-vocabulary', 'FP']];
    const pre = [run({ wrong: fp }), run({ wrong: fp }), run({ wrong: fp }), run({})];
    const post = [
      run({ wrong: fp }), run({ wrong: fp }), run({ wrong: fp }), run({ wrong: fp }),
    ];
    const { status, out } = compare(pre, post);
    expect(out).toContain('VERDICT: PASS');
    expect(status).toBe(0);
  });

  it('refuses an asymmetric comparison rather than reporting a meaningless delta', () => {
    const { status, out } = compare([run({})], [run({}), run({}), run({}), run({})]);
    expect(out).toContain('ASYMMETRIC SAMPLING');
    expect(status).not.toBe(0);
  });
});

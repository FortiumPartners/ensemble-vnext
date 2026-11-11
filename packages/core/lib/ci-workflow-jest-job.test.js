'use strict';
/**
 * Structure and fallback tests for the `jest` job of .github/workflows/ci.yml
 * (fix-ci-chromium-apt-outage, DEC-1): the Chromium install is split into bounded,
 * soft steps that emit a ::warning:: on failure, while checkout, setup-node and
 * `npm ci` stay hard failures.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const yaml = require('js-yaml');

const CI = path.resolve(__dirname, '../../../.github/workflows/ci.yml');
const wf = yaml.load(fs.readFileSync(CI, 'utf8'));
const job = wf.jobs.jest;
const steps = job.steps;
const byName = (re) => steps.find((s) => re.test(s.name || ''));
const cacheStep = steps.find((s) => /^actions\/cache@/.test(s.uses || ''));
const browserStep = byName(/^Install Chromium for the design render tests/);
const fontsStep = byName(/^Install Chromium system fonts/);
const soft = [cacheStep, browserStep, fontsStep];

describe('ci.yml jest job structure', () => {
  test('soft steps all exist', () => {
    soft.forEach((s) => expect(s).toBeDefined());
  });

  test('(a) no step runs --with-deps', () => {
    steps.forEach((s) => expect(s.run || '').not.toContain('--with-deps'));
  });

  test('(b) cache step: actions/cache@v4, path, key, bounded and soft', () => {
    expect(cacheStep.uses).toBe('actions/cache@v4');
    expect(cacheStep.with.path).toBe('~/.cache/ms-playwright');
    expect(cacheStep.with.key).toContain('steps.playwright.outputs.version');
    expect(cacheStep.with.key).toContain('steps.playwright.outputs.image');
    expect(cacheStep['timeout-minutes']).toBe(1);
    expect(cacheStep['continue-on-error']).toBe(true);
  });

  test('(c) browser step: npx playwright install chromium, 3 min, soft, warns', () => {
    expect(browserStep['timeout-minutes']).toBe(3);
    expect(browserStep['continue-on-error']).toBe(true);
    expect(browserStep.run).toContain('npx playwright install chromium');
    expect(browserStep.run).toContain('::warning::');
  });

  test('(c) fonts step: install-deps under timeout 90, 2 min, soft, warns', () => {
    expect(fontsStep['timeout-minutes']).toBe(2);
    expect(fontsStep['continue-on-error']).toBe(true);
    expect(fontsStep.run).toMatch(/timeout -k \d+ 90 npx playwright install-deps chromium/);
    expect(fontsStep.run).toContain('::warning::');
  });

  test('(d) checkout, setup-node and npm ci are hard failures', () => {
    const hard = steps.filter(
      (s) =>
        /^actions\/checkout@/.test(s.uses || '') ||
        /^actions\/setup-node@/.test(s.uses || '') ||
        (s.run || '').trim() === 'npm ci'
    );
    expect(hard).toHaveLength(3);
    hard.forEach((s) => expect(s['continue-on-error']).toBeUndefined());
  });

  test('(e) soft-step timeouts leave headroom for Jest within the job limit', () => {
    const sum = soft.reduce((n, s) => n + s['timeout-minutes'], 0);
    expect(sum).toBe(6);
    expect(job['timeout-minutes']).toBe(10);
    expect(job['timeout-minutes'] - sum).toBeGreaterThanOrEqual(3);
  });
});

describe('ci.yml jest job ::warning:: fallbacks execute', () => {
  let shim;
  beforeAll(() => {
    shim = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-shim-'));
    // npx always fails; timeout drops its duration/-k options and execs the rest.
    fs.writeFileSync(path.join(shim, 'npx'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    fs.writeFileSync(
      path.join(shim, 'timeout'),
      '#!/bin/sh\nwhile [ "$1" = "-k" ]; do shift 2; done\nshift\nexec "$@"\n',
      { mode: 0o755 }
    );
  });
  afterAll(() => fs.rmSync(shim, { recursive: true, force: true }));

  const run = (script) =>
    spawnSync('bash', ['-eo', 'pipefail', '-c', script], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${shim}:${process.env.PATH}` },
    });

  test('browser step exits 0 and warns when both attempts fail', () => {
    const r = run(browserStep.run);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(
      '::warning::Chromium download failed twice; the design render suites will fail'
    );
  });

  test('fonts step exits 0 and warns when install-deps fails', () => {
    const r = run(fontsStep.run);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(
      '::warning::Chromium system dependencies did not install (apt outage or timeout); renders may differ'
    );
  });
});

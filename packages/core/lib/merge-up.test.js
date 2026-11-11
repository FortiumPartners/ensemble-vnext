'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { decide } = require('./merge-up');

const LIB = path.join(__dirname, 'merge-up.js');
const origPath = process.env.PATH;
let bin;

beforeAll(() => {
  bin = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-up-'));
  fs.writeFileSync(
    path.join(bin, 'gh'),
    '#!/bin/sh\n[ -n "$STUB_PR_FAIL" ] && { echo "HTTP 404" >&2; exit 1; }\necho "$STUB_PR_JSON"\n',
    { mode: 0o755 },
  );
  process.env.PATH = `${bin}${path.delimiter}${origPath}`;
});
afterAll(() => {
  process.env.PATH = origPath;
  fs.rmSync(bin, { recursive: true, force: true });
});
afterEach(() => {
  delete process.env.STUB_PR_JSON;
  delete process.env.STUB_PR_FAIL;
});

const pr = (state, mergeable, mergeStateStatus) => {
  process.env.STUB_PR_JSON = JSON.stringify({ state, mergeable, mergeStateStatus });
};

describe('decide', () => {
  test('a merged PR is skipped even though it reads UNKNOWN', () => {
    pr('MERGED', 'UNKNOWN', 'UNKNOWN');
    expect(decide({ pr: 7 })).toMatchObject({ ok: true, action: 'skip' });
  });

  test('UNKNOWN mergeable on an open PR is poll', () => {
    pr('OPEN', 'UNKNOWN', 'UNKNOWN');
    expect(decide({ pr: 7 })).toMatchObject({ ok: true, action: 'poll' });
  });

  test('MERGEABLE with an uncomputed status is poll, not skip', () => {
    pr('OPEN', 'MERGEABLE', 'UNKNOWN');
    expect(decide({ pr: 7 }).action).toBe('poll');
  });

  test('CONFLICTING is merge-in', () => {
    pr('OPEN', 'CONFLICTING', 'DIRTY');
    expect(decide({ pr: 7 })).toMatchObject({ ok: true, action: 'merge-in' });
  });

  test('MERGEABLE and BEHIND is merge-in, naming the up-to-date requirement', () => {
    pr('OPEN', 'MERGEABLE', 'BEHIND');
    const r = decide({ pr: 7 });
    expect(r.action).toBe('merge-in');
    expect(r.reason).toMatch(/up to date/i);
  });

  test.each(['CLEAN', 'BLOCKED', 'UNSTABLE'])('MERGEABLE and %s is skip', (status) => {
    pr('OPEN', 'MERGEABLE', status);
    expect(decide({ pr: 7 })).toMatchObject({ ok: true, action: 'skip' });
  });

  test('a failing gh is ok: false with the reason', () => {
    process.env.STUB_PR_FAIL = '1';
    const r = decide({ pr: 7 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/HTTP 404/);
  });

  test('unparseable gh output is ok: false', () => {
    process.env.STUB_PR_JSON = 'not json';
    const r = decide({ pr: 7 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/parse/i);
  });

  test('a non-integer PR is refused', () => {
    expect(decide({ pr: 'x1' })).toMatchObject({ ok: false });
    expect(decide({})).toMatchObject({ ok: false });
  });
});

describe('CLI', () => {
  const cli = (...args) => spawnSync('node', [LIB, ...args], { encoding: 'utf8', env: process.env });

  test('prints one JSON line and exits 0', () => {
    pr('OPEN', 'MERGEABLE', 'BEHIND');
    const r = cli('decide', '--pr', '7');
    expect(r.status).toBe(0);
    expect(r.stdout.trim().split('\n')).toHaveLength(1);
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: true, action: 'merge-in' });
  });

  test('a non-integer --pr prints a usage refusal and exits 0', () => {
    const r = cli('decide', '--pr', 'abc');
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: false, action: 'refused' });
  });

  test('an unknown verb prints a usage refusal', () => {
    expect(JSON.parse(cli('nope').stdout)).toMatchObject({ ok: false, action: 'refused' });
  });

  test('packages/full/lib/merge-up.js is a symlink to the core file', () => {
    const link = path.join(__dirname, '..', '..', 'full', 'lib', 'merge-up.js');
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(link)).toBe('../../core/lib/merge-up.js');
  });
});

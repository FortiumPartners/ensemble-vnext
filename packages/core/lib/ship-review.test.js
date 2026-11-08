/**
 * ship-review.js -- the request-review tool=claude match, made in code (FIX-009).
 *
 * Run with: npx jest packages/core/lib/ship-review.test.js
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { matchToolReview } = require('./ship-review');

const SCRIPT = path.join(__dirname, 'ship-review.js');
const HEAD = '11d94f7a3c2b1e0f9d8c7b6a5e4d3c2b1a0f9e8d';
const OLD = '782f8c5e1d2c3b4a5f6e7d8c9b0a1f2e3d4c5b6a';
const LOGIN = 'islayjames';
const REQUESTED = '2026-11-07T20:40:00Z';

const review = (over = {}) => ({
  author: { login: LOGIN },
  commit: { oid: HEAD },
  submittedAt: '2026-11-07T20:45:00Z',
  state: 'COMMENTED',
  ...over,
});

const args = (reviews) => ({ reviews, login: LOGIN, head: HEAD, requestedAt: REQUESTED });

describe('matchToolReview', () => {
  test('a review by the login, on the head, after the request is the tool\'s', () => {
    const r = matchToolReview(args([review()]));
    expect(r.matched).toBe(true);
    expect(r.review.commit.oid).toBe(HEAD);
    expect(r.rejected).toEqual([]);
  });

  test('another login is not recognised, and says why', () => {
    const r = matchToolReview(args([review({ author: { login: 'someone-else' } })]));
    expect(r.matched).toBe(false);
    expect(r.rejected[0].reason).toMatch(/author someone-else is not islayjames/);
  });

  test('a review on an older commit is not recognised', () => {
    const r = matchToolReview(args([review({ commit: { oid: OLD } })]));
    expect(r.matched).toBe(false);
    expect(r.rejected[0].reason).toMatch(/not the current head/);
  });

  test('a review submitted before the request is not recognised', () => {
    const r = matchToolReview(args([review({ submittedAt: '2026-11-07T20:39:59Z' })]));
    expect(r.matched).toBe(false);
    expect(r.rejected[0].reason).toMatch(/before the request/);
  });

  test('one match among failing reviews is found; each failing one is named', () => {
    const r = matchToolReview(args([
      review({ author: { login: 'bot' } }),
      review({ commit: { oid: OLD } }),
      review({ submittedAt: '2026-11-07T20:00:00Z' }),
      review(),
    ]));
    expect(r.matched).toBe(true);
    expect(r.rejected.map((x) => x.index)).toEqual([0, 1, 2]);
  });

  test('a short commit id of at least 7 characters matches; a shorter one does not', () => {
    expect(matchToolReview(args([review({ commit: { oid: HEAD.slice(0, 7) } })])).matched).toBe(true);
    expect(matchToolReview(args([review({ commit: { oid: HEAD.slice(0, 6) } })])).matched).toBe(false);
  });

  test('missing fields never match, and bad inputs are errors, not throws', () => {
    expect(matchToolReview(args([{}])).matched).toBe(false);
    expect(matchToolReview({ ...args([review()]), login: '' }).error).toMatch(/no login/);
    expect(matchToolReview({ ...args([review()]), requestedAt: 'soon' }).error).toMatch(/not a time/);
    expect(matchToolReview({ ...args(null) }).error).toMatch(/not an array/);
  });
});

describe('CLI', () => {
  let tmp;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-review-')); });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  test('reads the gh pr view --json reviews object from a file and prints one JSON line', () => {
    const f = path.join(tmp, 'reviews.json');
    fs.writeFileSync(f, JSON.stringify({ reviews: [review({ commit: { oid: OLD } }), review()] }));
    const r = spawnSync('node', [SCRIPT, 'match', '--login', LOGIN, '--head', HEAD, '--requested-at', REQUESTED, '--file', f], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout.trim());
    expect(out.matched).toBe(true);
    expect(out.rejected).toHaveLength(1);
  });

  test('reads a bare array from stdin', () => {
    const r = spawnSync('node', [SCRIPT, 'match', '--login', LOGIN, '--head', HEAD, '--requested-at', REQUESTED], {
      encoding: 'utf8', input: JSON.stringify([review({ author: { login: 'x' } })]),
    });
    expect(JSON.parse(r.stdout.trim()).matched).toBe(false);
  });

  test('a usage error exits 2', () => {
    expect(spawnSync('node', [SCRIPT, 'match'], { encoding: 'utf8' }).status).toBe(2);
  });
});

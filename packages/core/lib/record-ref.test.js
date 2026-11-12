'use strict';

/**
 * Tests for record-ref.js. Every case runs against real temporary git repositories (real `git init`,
 * a real bare origin, real linked worktrees and clones); git is never mocked.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const LIB = path.join(__dirname, 'record-ref.js');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const recordRef = require('./record-ref');

const IS_ROOT = typeof process.getuid === 'function' && process.getuid() === 0;
const SLUG = 'feat';
const STATE = `.trd-state/${SLUG}`;
const REF = `refs/ensemble/records/${SLUG}`;
const SHARED_REF = 'refs/ensemble/records/_shared';

let cleanups = [];
let savedFeatureId;

// A scrubbed environment so the host's git config and Forge variables never leak into a case.
function envFor(extra = {}) {
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0', ...extra };
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']) delete env[k];
  if (!('FORGE_FEATURE_ID' in extra)) delete env.FORGE_FEATURE_ID;
  return env;
}

function sh(cwd, args, extraEnv) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: envFor(extraEnv) });
  if (r.status !== 0 && !(extraEnv && extraEnv.__allowFail)) {
    throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${r.stderr}`);
  }
  return (r.stdout || '').trim();
}

function mkTmp(prefix) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `rr-${prefix}-`)));
  cleanups.push(() => {
    spawnSync('chmod', ['-R', 'u+w', dir]); // a test may have made a tree unwritable
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

function initRepo(prefix = 'repo') {
  const dir = mkTmp(prefix);
  sh(dir, ['init', '-q', '-b', 'main']);
  sh(dir, ['config', 'user.name', 'Test']);
  sh(dir, ['config', 'user.email', 'test@example.com']);
  sh(dir, ['config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(dir, 'README.md'), 'hello\n');
  sh(dir, ['add', 'README.md']);
  sh(dir, ['commit', '-q', '-m', 'init']);
  return dir;
}

/** Moves a repo onto a feature branch: record commits and folds are only allowed off the default branch. */
function onFeature(repo, name = 'feature/x') {
  sh(repo, ['checkout', '-q', '-b', name]);
}

function initBare() {
  const dir = mkTmp('origin');
  sh(dir, ['init', '-q', '--bare', '-b', 'main']);
  return dir;
}

function withOrigin(repo, origin) {
  sh(repo, ['remote', 'add', 'origin', origin]);
}

function cloneOf(origin, prefix = 'clone') {
  const dir = mkTmp(prefix);
  sh(dir, ['clone', '-q', origin, dir]);
  sh(dir, ['config', 'user.name', 'Test']);
  sh(dir, ['config', 'user.email', 'test@example.com']);
  sh(dir, ['config', 'commit.gpgsign', 'false']);
  return dir;
}

function put(repo, rel, content) {
  const abs = path.join(repo, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  return abs;
}

function doWrite(repo, extra = {}) {
  return recordRef.write({ stateDir: STATE, command: 'implement-trd', step: 'phase 1', cwd: repo, ...extra });
}

function treeFiles(repo, ref) {
  const out = sh(repo, ['ls-tree', '-r', '--name-only', ref]);
  return out ? out.split('\n') : [];
}

function showBlob(repo, ref, p) {
  return sh(repo, ['show', `${ref}:${p}`]);
}

function runCli(cwd, args, extraEnv) {
  return spawnSync(process.execPath, [LIB, ...args], { cwd, encoding: 'utf8', env: envFor(extraEnv) });
}

beforeEach(() => {
  savedFeatureId = process.env.FORGE_FEATURE_ID;
  delete process.env.FORGE_FEATURE_ID;
  process.env.GIT_CONFIG_NOSYSTEM = '1';
  process.env.GIT_TERMINAL_PROMPT = '0';
});

afterEach(() => {
  if (savedFeatureId === undefined) delete process.env.FORGE_FEATURE_ID;
  else process.env.FORGE_FEATURE_ID = savedFeatureId;
  for (const fn of cleanups.reverse()) {
    try {
      fn();
    } catch {
      /* best effort */
    }
  }
  cleanups = [];
});

describe('write: basic landing and record.json', () => {
  test('(f) record.json has exactly forge_feature_id, branch, slug -- with FORGE_FEATURE_ID set', () => {
    const repo = initRepo();
    put(repo, `${STATE}/implement.json`, '{}\n');
    process.env.FORGE_FEATURE_ID = 'feat-123';
    const r = doWrite(repo);
    expect(r.outcome).toBe('ref');
    expect(r.push).toBe('no-remote');
    const rec = JSON.parse(showBlob(repo, REF, 'record.json'));
    expect(Object.keys(rec).sort()).toEqual(['branch', 'forge_feature_id', 'slug']);
    expect(rec).toEqual({ forge_feature_id: 'feat-123', branch: 'main', slug: SLUG });
  });

  test('(f) record.json has exactly forge_feature_id, branch, slug -- with FORGE_FEATURE_ID unset', () => {
    const repo = initRepo();
    put(repo, `${STATE}/implement.json`, '{}\n');
    expect(doWrite(repo).outcome).toBe('ref');
    const rec = JSON.parse(showBlob(repo, REF, 'record.json'));
    expect(Object.keys(rec).sort()).toEqual(['branch', 'forge_feature_id', 'slug']);
    expect(rec).toEqual({ forge_feature_id: null, branch: 'main', slug: SLUG });
  });

  test('forgeFeatureId, when the key is given, replaces FORGE_FEATURE_ID (string or null)', () => {
    const repo = initRepo();
    put(repo, `${STATE}/implement.json`, '{}\n');
    process.env.FORGE_FEATURE_ID = 'env-id';
    expect(doWrite(repo, { forgeFeatureId: 'own-id' }).outcome).toBe('ref');
    expect(JSON.parse(showBlob(repo, REF, 'record.json')).forge_feature_id).toBe('own-id');
    sh(repo, ['update-ref', '-d', REF]);
    expect(doWrite(repo, { forgeFeatureId: null }).outcome).toBe('ref');
    expect(JSON.parse(showBlob(repo, REF, 'record.json')).forge_feature_id).toBeNull();
  });

  test('(O3) a detached HEAD writes branch: null, never "HEAD" or a branch name', () => {
    const repo = initRepo();
    put(repo, `${STATE}/implement.json`, '{}\n');
    sh(repo, ['checkout', '-q', '--detach']);
    expect(sh(repo, ['symbolic-ref', '-q', 'HEAD'], { __allowFail: true })).toBe('');
    const r = doWrite(repo);
    expect(r.outcome).toBe('ref');
    const rec = JSON.parse(showBlob(repo, REF, 'record.json'));
    expect(rec).toEqual({ forge_feature_id: null, branch: null, slug: SLUG });
  });

  test('(O3) a tag named like the branch still writes the plain branch name', () => {
    const repo = initRepo();
    put(repo, `${STATE}/implement.json`, '{}\n');
    sh(repo, ['tag', 'main']);
    expect(doWrite(repo).outcome).toBe('ref');
    expect(JSON.parse(showBlob(repo, REF, 'record.json')).branch).toBe('main');
  });

  test('(O3) an empty FORGE_FEATURE_ID is written as forge_feature_id: null', () => {
    const repo = initRepo();
    put(repo, `${STATE}/implement.json`, '{}\n');
    process.env.FORGE_FEATURE_ID = '';
    expect(doWrite(repo).outcome).toBe('ref');
    const rec = JSON.parse(showBlob(repo, REF, 'record.json'));
    expect(rec).toEqual({ forge_feature_id: null, branch: 'main', slug: SLUG });
  });

  test('(O4) the ref commit message is exactly `records(<slug>): <command> - <step>`', () => {
    const repo = initRepo();
    put(repo, `${STATE}/implement.json`, '{}\n');
    expect(doWrite(repo, { command: 'verify-build', step: 'fix round 2' }).outcome).toBe('ref');
    expect(sh(repo, ['log', '-1', '--format=%B', REF])).toBe(`records(${SLUG}): verify-build - fix round 2`);
  });

  test('(O4) each write commits on the previous ref value (first is a root, second is parented on it)', () => {
    const repo = initRepo();
    put(repo, `${STATE}/implement.json`, '{}\n');
    expect(doWrite(repo, { step: 'phase 1' }).outcome).toBe('ref');
    const first = sh(repo, ['rev-parse', REF]);
    expect(sh(repo, ['log', '-1', '--format=%P', first])).toBe('');
    put(repo, `${STATE}/implement.json`, '{"n":2}\n');
    expect(doWrite(repo, { step: 'phase 2' }).outcome).toBe('ref');
    const second = sh(repo, ['rev-parse', REF]);
    expect(second).not.toBe(first);
    expect(sh(repo, ['log', '-1', '--format=%P', second])).toBe(first);
    expect(sh(repo, ['log', '-1', '--format=%B', second])).toBe(`records(${SLUG}): implement-trd - phase 2`);
  });

  test('a write never moves HEAD or the real index', () => {
    const repo = initRepo();
    put(repo, `${STATE}/implement.json`, '{}\n');
    put(repo, 'staged.txt', 'x\n');
    sh(repo, ['add', 'staged.txt']);
    const head = sh(repo, ['rev-parse', 'HEAD']);
    expect(doWrite(repo).outcome).toBe('ref');
    expect(sh(repo, ['rev-parse', 'HEAD'])).toBe(head);
    expect(sh(repo, ['diff', '--cached', '--name-only'])).toBe('staged.txt');
  });

  test('a second identical write is a no-op (no new commit)', () => {
    const repo = initRepo();
    put(repo, `${STATE}/implement.json`, '{}\n');
    expect(doWrite(repo).outcome).toBe('ref');
    const tip = sh(repo, ['rev-parse', REF]);
    expect(doWrite(repo).outcome).toBe('ref');
    expect(sh(repo, ['rev-parse', REF])).toBe(tip);
  });
});

describe('write: refusals', () => {
  test('(b) no git directory: refused, exit 0, stdout is one JSON line', () => {
    const dir = mkTmp('nogit');
    put(dir, `${STATE}/implement.json`, '{}\n');
    const r = runCli(dir, ['write', '--state-dir', STATE, '--command', 'c', '--step', 's'], { GIT_CEILING_DIRECTORIES: path.dirname(dir) });
    expect(r.status).toBe(0);
    const lines = r.stdout.split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);
    expect(r.stdout.endsWith('\n')).toBe(true);
    expect(JSON.parse(lines[0]).outcome).toBe('refused');
  });

  test.each([['-leading-dash'], ['_underscore'], ['has space'], ['semi;colon']])('a slug failing Forge\'s rule (%s) is refused', (slug) => {
    const repo = initRepo();
    put(repo, `.trd-state/${slug}/implement.json`, '{}\n');
    const r = recordRef.write({ stateDir: `.trd-state/${slug}`, command: 'c', step: 's', cwd: repo });
    expect(r.outcome).toBe('refused');
    expect(sh(repo, ['for-each-ref', 'refs/ensemble/'])).toBe('');
  });

  test('a state folder outside the repository, or missing, is refused', () => {
    const repo = initRepo();
    const outside = mkTmp('outside');
    expect(recordRef.write({ stateDir: outside, command: 'c', step: 's', cwd: repo }).outcome).toBe('refused');
    expect(recordRef.write({ stateDir: '.trd-state/none', command: 'c', step: 's', cwd: repo }).outcome).toBe('refused');
  });

  test('a folder that is not .trd-state/<slug> is refused, and its tracked files stay tracked', () => {
    const repo = initRepo();
    put(repo, 'src/a.js', 'x\n');
    put(repo, '.trd-state/outer/inner/implement.json', '{}\n');
    sh(repo, ['add', 'src/a.js']);
    sh(repo, ['commit', '-q', '-m', 'src']);
    expect(recordRef.write({ stateDir: 'src', command: 'c', step: 's', cwd: repo }).outcome).toBe('refused');
    expect(recordRef.write({ stateDir: '.trd-state/outer/inner', command: 'c', step: 's', cwd: repo }).outcome).toBe('refused');
    expect(sh(repo, ['ls-files', 'src'])).toBe('src/a.js');
    expect(sh(repo, ['for-each-ref', 'refs/ensemble/'])).toBe('');
  });

  test('missing --command or --step is refused', () => {
    const repo = initRepo();
    put(repo, `${STATE}/implement.json`, '{}\n');
    expect(recordRef.write({ stateDir: STATE, command: '', step: 's', cwd: repo }).outcome).toBe('refused');
  });

  test('isSafeSlug mirrors Forge SAFE_SLUG_RE', () => {
    expect(recordRef.isSafeSlug('my-feature_1.2')).toBe(true);
    expect(recordRef.isSafeSlug('a..b')).toBe(false);
    expect(recordRef.isSafeSlug('_shared')).toBe(false);
    expect(recordRef.isSafeSlug('')).toBe(false);
  });
});

describe('write: record selection', () => {
  test('(g) a referenced image is kept, an unreferenced one and the excluded files are not', () => {
    const repo = initRepo();
    put(repo, `${STATE}/implement.json`, '{}\n');
    put(repo, `${STATE}/verification-report.md`, '# Report\n\n![shot](evidence/shot.png)\n');
    put(repo, `${STATE}/evidence/shot.png`, 'PNG-A');
    put(repo, `${STATE}/evidence/other.png`, 'PNG-B');
    put(repo, `${STATE}/evidence/criterion-covers.json`, '{}');
    put(repo, `${STATE}/dispatch.jsonl`, '{}\n');
    put(repo, `${STATE}/implement.lock`, '1');
    put(repo, `${STATE}/findings/x.json`, '{}');
    put(repo, `${STATE}/.DS_Store`, 'junk');
    put(repo, `${STATE}/implement.json.tmp.123.456`, 'tmp');
    put(repo, `${STATE}/prompts/FIX-001.md`, 'prompt');
    const r = doWrite(repo);
    expect(r.outcome).toBe('ref');
    const files = treeFiles(repo, REF);
    expect(files).toEqual(expect.arrayContaining(['implement.json', 'verification-report.md', 'evidence/shot.png', 'prompts/FIX-001.md', 'record.json']));
    for (const gone of ['evidence/other.png', 'evidence/criterion-covers.json', 'dispatch.jsonl', 'implement.lock', 'findings/x.json', '.DS_Store', 'implement.json.tmp.123.456']) {
      expect(files).not.toContain(gone);
    }
    expect(showBlob(repo, REF, 'evidence/shot.png')).toBe('PNG-A');
  });

  test('a referenced image over the 10 MB cap is skipped, not written', () => {
    const repo = initRepo();
    put(repo, `${STATE}/verification-report.md`, '![big](evidence/big.png)\n');
    put(repo, `${STATE}/evidence/big.png`, Buffer.alloc(10 * 1024 * 1024 + 1));
    const r = doWrite(repo);
    expect(r.outcome).toBe('ref');
    expect(treeFiles(repo, REF)).not.toContain('evidence/big.png');
    expect(r.skipped).toEqual(expect.arrayContaining([{ path: 'evidence/big.png', reason: 'too-large' }]));
  });

  test('an image referenced but absent is listed in missingImages', () => {
    const repo = initRepo();
    put(repo, `${STATE}/verification-report.md`, '![gone](evidence/gone.png)\n');
    const r = doWrite(repo);
    expect(r.outcome).toBe('ref');
    expect(r.missingImages).toEqual(['evidence/gone.png']);
  });

  test('referencedImages follows the Forge rule: <>-wrapped, percent-encoded, bare mentions, rejects traversal and non-images', () => {
    const text = [
      '![a](<evidence/with space.png>)',
      '![b](evidence/enc%20oded.JPG)',
      'see `.trd-state/feat/evidence/bare.webp` here',
      '![bad](evidence/../secret.png)',
      '![nonimg](evidence/notes.txt)',
      '![out](other/x.png)',
      '![url](https://example.com/evidence/y.png)',
      'sibling ../evidence/up.png and other/./evidence/mid.png',
    ].join('\n');
    const got = recordRef.referencedImages(text, 'feat').sort();
    expect(got).toEqual(['evidence/bare.webp', 'evidence/enc oded.JPG', 'evidence/with space.png']);
  });

  test('a symlink in the state folder is skipped, never followed', () => {
    const repo = initRepo();
    put(repo, `${STATE}/implement.json`, '{}\n');
    const secret = put(mkTmp('secret'), 'secret.txt', 'top secret');
    fs.symlinkSync(secret, path.join(repo, STATE, 'link.txt'));
    expect(doWrite(repo).outcome).toBe('ref');
    expect(treeFiles(repo, REF)).not.toContain('link.txt');
  });

  test('(l) an image referenced only by the tip\'s older report is dropped when the new report does not reference it', () => {
    const repo = initRepo();
    put(repo, `${STATE}/verification-report.md`, '![a](evidence/a.png)\n');
    put(repo, `${STATE}/evidence/a.png`, 'AAA');
    expect(doWrite(repo).outcome).toBe('ref');
    expect(treeFiles(repo, REF)).toContain('evidence/a.png');

    put(repo, `${STATE}/verification-report.md`, '![b](evidence/b.png)\n');
    put(repo, `${STATE}/evidence/b.png`, 'BBB');
    fs.rmSync(path.join(repo, STATE, 'evidence', 'a.png'));
    expect(doWrite(repo).outcome).toBe('ref');
    const files = treeFiles(repo, REF);
    expect(files).toContain('evidence/b.png');
    expect(files).not.toContain('evidence/a.png');
  });

  test('overlaying the same feature keeps a file only the tip has', () => {
    const repo = initRepo();
    put(repo, `${STATE}/one.md`, '1');
    expect(doWrite(repo).outcome).toBe('ref');
    fs.rmSync(path.join(repo, STATE, 'one.md'));
    put(repo, `${STATE}/two.md`, '2');
    expect(doWrite(repo).outcome).toBe('ref');
    expect(treeFiles(repo, REF)).toEqual(expect.arrayContaining(['one.md', 'two.md']));
  });
});

describe('write: same-feature rule', () => {
  test('(i) a slug reused by a different feature drops the tip\'s closed.json, parented on the old tip', () => {
    const repo = initRepo();
    onFeature(repo);
    put(repo, `${STATE}/implement.json`, '{}\n');
    put(repo, `${STATE}/closed.json`, '{"closed":true}\n');
    process.env.FORGE_FEATURE_ID = 'old-feature';
    expect(doWrite(repo).outcome).toBe('ref');
    const oldTip = sh(repo, ['rev-parse', REF]);
    expect(treeFiles(repo, REF)).toContain('closed.json');

    fs.rmSync(path.join(repo, STATE, 'closed.json'));
    process.env.FORGE_FEATURE_ID = 'new-feature';
    expect(doWrite(repo).outcome).toBe('ref');
    const files = treeFiles(repo, REF);
    expect(files).not.toContain('closed.json');
    expect(files).toContain('implement.json');
    expect(sh(repo, ['rev-parse', `${REF}^`])).toBe(oldTip);
    expect(JSON.parse(showBlob(repo, REF, 'record.json')).forge_feature_id).toBe('new-feature');
  });

  test('with both ids null, the same branch still counts as the same feature', () => {
    const repo = initRepo();
    put(repo, `${STATE}/one.md`, '1');
    expect(doWrite(repo).outcome).toBe('ref');
    fs.rmSync(path.join(repo, STATE, 'one.md'));
    put(repo, `${STATE}/two.md`, '2');
    expect(doWrite(repo).outcome).toBe('ref');
    expect(treeFiles(repo, REF)).toContain('one.md');
  });

  test('sameFeature: id equality, id mismatch, and branch fallback', () => {
    const { sameFeature } = recordRef;
    expect(sameFeature({ forge_feature_id: 'a', branch: 'x' }, { forge_feature_id: 'a', branch: 'y' })).toBe(true);
    expect(sameFeature({ forge_feature_id: 'a', branch: 'x' }, { forge_feature_id: 'b', branch: 'x' })).toBe(false);
    expect(sameFeature({ forge_feature_id: null, branch: 'x' }, { forge_feature_id: 'b', branch: 'x' })).toBe(true);
    expect(sameFeature({ forge_feature_id: null, branch: null }, { forge_feature_id: null, branch: null })).toBe(false);
    expect(sameFeature(null, { branch: 'x' })).toBe(false);
  });
});

describe('write: push, fold and fallback', () => {
  test('(e) tracked records are folded out of the branch in one commit after a pushed write, working copy kept', () => {
    const origin = initBare();
    const repo = initRepo();
    onFeature(repo);
    withOrigin(repo, origin);
    put(repo, `${STATE}/implement.json`, '{}\n');
    put(repo, `${STATE}/closed.json`, '{}\n');
    sh(repo, ['add', '-f', STATE]);
    sh(repo, ['commit', '-q', '-m', 'track records']);
    const head = sh(repo, ['rev-parse', 'HEAD']);
    expect(sh(repo, ['ls-files', STATE])).not.toBe('');

    const r = doWrite(repo);
    expect(r.outcome).toBe('ref');
    expect(r.push).toBe('pushed');
    expect(treeFiles(repo, REF)).toEqual(expect.arrayContaining(['implement.json', 'closed.json']));
    expect(sh(repo, ['ls-files', STATE])).toBe('');
    expect(fs.existsSync(path.join(repo, STATE, 'implement.json'))).toBe(true);
    // The removal is committed: exactly one new commit, naming the ref, touching only those paths.
    expect(sh(repo, ['rev-list', '--count', `${head}..HEAD`])).toBe('1');
    expect(r.foldCommit).toBe(sh(repo, ['rev-parse', 'HEAD']));
    expect(sh(repo, ['log', '-1', '--format=%s'])).toBe(`records(${SLUG}): moved to ${REF}`);
    expect(sh(repo, ['show', '--name-status', '--format=', 'HEAD']).split('\n').sort()).toEqual([`D\t${STATE}/closed.json`, `D\t${STATE}/implement.json`]);
    expect(sh(repo, ['status', '--porcelain', '--', STATE])).toBe(`?? ${STATE}/`);
    expect(sh(origin, ['rev-parse', REF])).toBe(sh(repo, ['rev-parse', REF]));
  });

  test('(j) folding leaves a tracked findings/x.json and dispatch.jsonl tracked', () => {
    const origin = initBare();
    const repo = initRepo();
    onFeature(repo);
    withOrigin(repo, origin);
    put(repo, `${STATE}/implement.json`, '{}\n');
    put(repo, `${STATE}/findings/x.json`, '{}');
    put(repo, `${STATE}/dispatch.jsonl`, '{}\n');
    sh(repo, ['add', '-f', STATE]);
    sh(repo, ['commit', '-q', '-m', 'track']);

    const r = doWrite(repo);
    expect(r.outcome).toBe('ref');
    expect(r.push).toBe('pushed');
    const tracked = sh(repo, ['ls-files', STATE]).split('\n');
    expect(tracked).toEqual(expect.arrayContaining([`${STATE}/findings/x.json`, `${STATE}/dispatch.jsonl`]));
    expect(tracked).not.toContain(`${STATE}/implement.json`);
  });

  test('push:false writes the ref, pushes nothing, folds nothing', () => {
    const origin = initBare();
    const repo = initRepo();
    withOrigin(repo, origin);
    put(repo, `${STATE}/implement.json`, '{}\n');
    sh(repo, ['add', '-f', STATE]);
    sh(repo, ['commit', '-q', '-m', 'track']);
    const r = doWrite(repo, { push: false });
    expect(r.outcome).toBe('ref');
    expect(r.push).toBe('skipped');
    expect(sh(repo, ['ls-files', STATE])).toBe(`${STATE}/implement.json`);
    expect(sh(origin, ['for-each-ref', 'refs/ensemble/'])).toBe('');
  });

  function rejectingOrigin() {
    const origin = initBare();
    const hook = path.join(origin, 'hooks', 'pre-receive');
    fs.writeFileSync(hook, '#!/bin/sh\nwhile read old new ref; do\n  case "$ref" in refs/ensemble/*) echo "refs/ensemble is closed" >&2; exit 1;; esac\ndone\nexit 0\n');
    fs.chmodSync(hook, 0o755);
    return origin;
  }

  test('(d) an origin whose pre-receive rejects refs/ensemble/* yields a fallback branch commit', () => {
    const origin = rejectingOrigin();
    const repo = initRepo();
    onFeature(repo);
    withOrigin(repo, origin);
    put(repo, `${STATE}/implement.json`, '{}\n');
    put(repo, `${STATE}/notes.md`, 'n\n');
    const head = sh(repo, ['rev-parse', 'HEAD']);

    const r = doWrite(repo);
    expect(r.outcome).toBe('fallback');
    expect(r.fallbackReason).toBe('push-failed');
    expect(r.committed).toBe(true);
    const newHead = sh(repo, ['rev-parse', 'HEAD']);
    expect(newHead).not.toBe(head);
    // `commit` is the branch commit; the unpushed ref commit is reported separately.
    expect(r.commit).toBe(newHead);
    expect(r.refCommit).toBe(sh(repo, ['rev-parse', REF]));
    expect(r.refCommit).not.toBe(r.commit);
    const changed = sh(repo, ['show', '--name-only', '--format=', 'HEAD']).split('\n');
    expect(changed).toEqual(expect.arrayContaining([`${STATE}/implement.json`, `${STATE}/notes.md`]));
  });

  test('(d) the fallback force-adds gitignored record paths and commits only the state folder', () => {
    const origin = rejectingOrigin();
    const repo = initRepo();
    onFeature(repo);
    withOrigin(repo, origin);
    put(repo, '.gitignore', '.trd-state/\n');
    sh(repo, ['add', '.gitignore']);
    sh(repo, ['commit', '-q', '-m', 'ignore records']);
    put(repo, `${STATE}/implement.json`, '{}\n');
    put(repo, `${STATE}/verification-report.md`, 'r\n');
    put(repo, 'product.txt', 'not a record\n');

    const r = doWrite(repo);
    expect(r.outcome).toBe('fallback');
    expect(r.committed).toBe(true);
    expect(r.commit).toBe(sh(repo, ['rev-parse', 'HEAD']));
    const changed = sh(repo, ['show', '--name-only', '--format=', 'HEAD']).split('\n').sort();
    expect(changed).toEqual([`${STATE}/implement.json`, `${STATE}/verification-report.md`]);
  });

  test('(d) the same through the CLI exits 0 with one JSON line', () => {
    const origin = rejectingOrigin();
    const repo = initRepo();
    onFeature(repo);
    withOrigin(repo, origin);
    put(repo, `${STATE}/implement.json`, '{}\n');
    const r = runCli(repo, ['write', '--state-dir', STATE, '--command', 'c', '--step', 's']);
    expect(r.status).toBe(0);
    const lines = r.stdout.split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).outcome).toBe('fallback');
  });

  test('(k) the fallback leaves an unrelated staged file staged and out of the fallback commit', () => {
    const origin = rejectingOrigin();
    const repo = initRepo();
    onFeature(repo);
    withOrigin(repo, origin);
    put(repo, `${STATE}/implement.json`, '{}\n');
    put(repo, 'unrelated.txt', 'keep me staged\n');
    sh(repo, ['add', 'unrelated.txt']);

    const r = doWrite(repo);
    expect(r.outcome).toBe('fallback');
    expect(sh(repo, ['diff', '--cached', '--name-only'])).toBe('unrelated.txt');
    const changed = sh(repo, ['show', '--name-only', '--format=', 'HEAD']).split('\n');
    expect(changed).toContain(`${STATE}/implement.json`);
    expect(changed).not.toContain('unrelated.txt');
  });

  test('(m) every retry lost (the ref is locked) falls back with ref-write-failed', () => {
    const repo = initRepo();
    onFeature(repo);
    put(repo, `${STATE}/implement.json`, '{}\n');
    const gitDir = path.resolve(repo, sh(repo, ['rev-parse', '--git-dir']));
    fs.mkdirSync(path.join(gitDir, 'refs', 'ensemble', 'records'), { recursive: true });
    fs.writeFileSync(path.join(gitDir, 'refs', 'ensemble', 'records', `${SLUG}.lock`), '');
    const head = sh(repo, ['rev-parse', 'HEAD']);

    const r = doWrite(repo);
    expect(r.outcome).toBe('fallback');
    expect(r.fallbackReason).toBe('ref-write-failed');
    expect(r.detail).toMatch(/5 of 5/);
    expect(sh(repo, ['rev-parse', 'HEAD'])).not.toBe(head);
    expect(r.commit).toBe(sh(repo, ['rev-parse', 'HEAD']));
    expect(r.refCommit).toBeUndefined();
    expect(sh(repo, ['rev-parse', '--verify', '-q', REF], { __allowFail: true })).toBe('');
  });

  (IS_ROOT ? test.skip : test)('(c) unwritable objects/ makes ref write and fallback both fail: outcome failed, exit 0, no throw', () => {
    const repo = initRepo();
    onFeature(repo);
    put(repo, `${STATE}/implement.json`, '{}\n');
    const gitDir = path.resolve(repo, sh(repo, ['rev-parse', '--git-dir']));
    const objects = path.join(gitDir, 'objects');
    cleanups.push(() => spawnSync('chmod', ['-R', 'u+w', objects])); // runs before the dir is removed
    spawnSync('chmod', ['-R', 'a-w', objects]);

    const r = runCli(repo, ['write', '--state-dir', STATE, '--command', 'c', '--step', 's']);
    expect(r.status).toBe(0);
    const lines = r.stdout.split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);
    const out = JSON.parse(lines[0]);
    expect(out.outcome).toBe('failed');
    expect(out.fallbackReason).toBe('ref-write-failed');
    expect(typeof out.refError).toBe('string');
    expect(out.refError.length).toBeGreaterThan(0);
    expect(typeof out.fallbackError).toBe('string');
    expect(out.fallbackError.length).toBeGreaterThan(0);
  });

  test('(n) a non-fast-forward push reconciles: outcome ref, both clones\' files on the remote ref', () => {
    const origin = initBare();
    const a = cloneOf(origin, 'cloneA');
    const b = cloneOf(origin, 'cloneB');
    process.env.FORGE_FEATURE_ID = 'shared-feature';

    put(b, `${STATE}/from-b.md`, 'B\n');
    expect(doWrite(b).push).toBe('pushed');

    put(a, `${STATE}/from-a.md`, 'A\n');
    const r = doWrite(a);
    expect(r.outcome).toBe('ref');
    expect(r.push).toBe('pushed');

    const remoteFiles = treeFiles(origin, REF);
    expect(remoteFiles).toEqual(expect.arrayContaining(['from-a.md', 'from-b.md', 'record.json']));
    expect(sh(origin, ['rev-parse', REF])).toBe(sh(a, ['rev-parse', REF]));
    // the reconcile's temporary ref is cleaned up
    expect(sh(a, ['for-each-ref', 'refs/ensemble/records-tmp/'])).toBe('');
  });

  test('(n) a reconcile keeps a file only the local tip holds (an earlier unpushed write)', () => {
    const origin = initBare();
    const a = cloneOf(origin, 'cloneA');
    const b = cloneOf(origin, 'cloneB');
    process.env.FORGE_FEATURE_ID = 'shared-feature';

    put(b, `${STATE}/from-b.md`, 'B\n');
    expect(doWrite(b).push).toBe('pushed');

    put(a, `${STATE}/local-only.md`, 'L\n');
    expect(doWrite(a, { push: false }).outcome).toBe('ref');
    fs.rmSync(path.join(a, STATE, 'local-only.md'));
    put(a, `${STATE}/from-a.md`, 'A\n');
    const r = doWrite(a);
    expect(r.outcome).toBe('ref');
    expect(r.push).toBe('pushed');
    expect(treeFiles(origin, REF)).toEqual(expect.arrayContaining(['from-a.md', 'from-b.md', 'local-only.md', 'record.json']));
  });
});

describe('write: default branch, no-fallback and shared never commit', () => {
  const branchState = (repo) => ({ log: sh(repo, ['log', '--format=%H', 'main']), files: sh(repo, ['ls-files']) });
  const deadOrigin = () => path.join(mkTmp('dead'), 'nope.git'); // a path that is not a repository

  test('on main with an unreachable origin: ref, push failed, git log and ls-files unchanged', () => {
    const repo = initRepo();
    withOrigin(repo, deadOrigin());
    put(repo, `${STATE}/implement.json`, '{}\n');
    const before = branchState(repo);
    const r = doWrite(repo);
    expect(r.outcome).toBe('ref');
    expect(r.push).toBe('failed');
    expect(r.fallbackSkipped).toBe('default-branch');
    expect(branchState(repo)).toEqual(before);
    expect(sh(repo, ['rev-parse', REF])).toBe(r.commit);
  });

  test('on a detached HEAD a lost push does not commit either', () => {
    const repo = initRepo();
    withOrigin(repo, deadOrigin());
    sh(repo, ['checkout', '-q', '--detach']);
    put(repo, `${STATE}/implement.json`, '{}\n');
    const head = sh(repo, ['rev-parse', 'HEAD']);
    const r = doWrite(repo);
    expect(r.outcome).toBe('ref');
    expect(r.push).toBe('failed');
    expect(sh(repo, ['rev-parse', 'HEAD'])).toBe(head);
  });

  test('on main a tracked record is not folded after a pushed write', () => {
    const origin = initBare();
    const repo = initRepo();
    withOrigin(repo, origin);
    put(repo, `${STATE}/implement.json`, '{}\n');
    sh(repo, ['add', '-f', STATE]);
    sh(repo, ['commit', '-q', '-m', 'track']);
    const head = sh(repo, ['rev-parse', 'HEAD']);
    const r = doWrite(repo);
    expect(r.outcome).toBe('ref');
    expect(r.push).toBe('pushed');
    expect(r.folded).toEqual([]);
    expect(sh(repo, ['ls-files', STATE])).toBe(`${STATE}/implement.json`);
    expect(sh(repo, ['rev-parse', 'HEAD'])).toBe(head);
    expect(sh(repo, ['diff', '--cached', '--name-only'])).toBe('');
  });

  (IS_ROOT ? test.skip : test)('on main a broken object store is failed + fallbackSkipped, nothing committed', () => {
    const repo = initRepo();
    put(repo, `${STATE}/implement.json`, '{}\n');
    const before = branchState(repo);
    const gitDir = path.resolve(repo, sh(repo, ['rev-parse', '--git-dir']));
    const objects = path.join(gitDir, 'objects');
    cleanups.push(() => spawnSync('chmod', ['-R', 'u+w', objects]));
    spawnSync('chmod', ['-R', 'a-w', objects]);
    const r = doWrite(repo);
    expect(r.outcome).toBe('failed');
    expect(r.fallbackSkipped).toBe('default-branch');
    spawnSync('chmod', ['-R', 'u+w', objects]);
    expect(branchState(repo)).toEqual(before);
  });

  test('a ref left by a feature branch is refused from main: identity, tip unchanged', () => {
    const repo = initRepo();
    onFeature(repo);
    put(repo, `${STATE}/implement.json`, '{}\n');
    expect(doWrite(repo).outcome).toBe('ref');
    const tip = sh(repo, ['rev-parse', REF]);
    sh(repo, ['checkout', '-q', 'main']);
    const r = doWrite(repo);
    expect(r.outcome).toBe('refused');
    expect(r.reason).toBe('identity');
    expect(sh(repo, ['rev-parse', REF])).toBe(tip);
  });

  test('a feature ref on origin only is refused from main on the reconcile too: origin and the local ref unchanged', () => {
    const origin = initBare();
    const feature = initRepo('feature');
    withOrigin(feature, origin);
    sh(feature, ['push', '-q', 'origin', 'main']);
    onFeature(feature);
    put(feature, `${STATE}/implement.json`, '{}\n');
    put(feature, `${STATE}/report.md`, 'r\n');
    expect(doWrite(feature).push).toBe('pushed');
    const remoteTip = sh(feature, ['rev-parse', REF]);

    const main = cloneOf(origin, 'main');
    put(main, `${STATE}/closed.json`, '{}\n');
    const r = doWrite(main);
    expect(r.outcome).toBe('refused');
    expect(r.reason).toBe('identity');
    expect(sh(main, ['rev-parse', '-q', '--verify', REF], { __allowFail: true })).toBe('');
    expect(sh(origin, ['rev-parse', REF])).toBe(remoteTip);
  });

  test('a fold of a record that was only staged (never in HEAD) makes no empty commit', () => {
    const repo = initRepo();
    onFeature(repo);
    put(repo, `${STATE}/implement.json`, '{}\n');
    sh(repo, ['add', '-f', STATE]);
    const head = sh(repo, ['rev-parse', 'HEAD']);
    const r = doWrite(repo);
    expect(r.outcome).toBe('ref');
    expect(r.folded).toEqual([`${STATE}/implement.json`]);
    expect(r.foldCommit).toBeUndefined();
    expect(sh(repo, ['rev-parse', 'HEAD'])).toBe(head);
    expect(sh(repo, ['ls-files', STATE])).toBe('');
  });

  test('a fresh task-x ref from main is written, and a second write from main is the same feature', () => {
    const repo = initRepo();
    put(repo, '.trd-state/task-x/report.md', 'r\n');
    const w = () => recordRef.write({ stateDir: '.trd-state/task-x', command: 'task', step: 's', cwd: repo });
    expect(w().outcome).toBe('ref');
    put(repo, '.trd-state/task-x/more.md', 'm\n');
    const r = w();
    expect(r.outcome).toBe('ref');
    expect(treeFiles(repo, 'refs/ensemble/records/task-x')).toEqual(expect.arrayContaining(['report.md', 'more.md']));
  });

  (IS_ROOT ? test.skip : test)('--no-fallback with an unwritable objects/ on a feature branch commits nothing', () => {
    const repo = initRepo();
    onFeature(repo);
    put(repo, `${STATE}/implement.json`, '{}\n');
    const head = sh(repo, ['rev-parse', 'HEAD']);
    const gitDir = path.resolve(repo, sh(repo, ['rev-parse', '--git-dir']));
    const objects = path.join(gitDir, 'objects');
    cleanups.push(() => spawnSync('chmod', ['-R', 'u+w', objects]));
    spawnSync('chmod', ['-R', 'a-w', objects]);
    const r = runCli(repo, ['write', '--state-dir', STATE, '--command', 'c', '--step', 's', '--no-fallback']);
    const out = JSON.parse(r.stdout);
    expect(out.outcome).toBe('failed');
    expect(out.fallbackSkipped).toBe('no-fallback');
    spawnSync('chmod', ['-R', 'u+w', objects]);
    expect(sh(repo, ['rev-parse', 'HEAD'])).toBe(head);
  });

  test('fallback:false with a lost push on a feature branch keeps the ref local and commits nothing', () => {
    const repo = initRepo();
    onFeature(repo);
    withOrigin(repo, deadOrigin());
    put(repo, `${STATE}/implement.json`, '{}\n');
    const head = sh(repo, ['rev-parse', 'HEAD']);
    const r = doWrite(repo, { fallback: false });
    expect(r.outcome).toBe('ref');
    expect(r.push).toBe('failed');
    expect(r.fallbackSkipped).toBe('no-fallback');
    expect(sh(repo, ['rev-parse', 'HEAD'])).toBe(head);
  });

  test('a --shared write never folds: a tracked _session-log.md stays tracked', () => {
    const origin = initBare();
    const repo = initRepo();
    onFeature(repo);
    withOrigin(repo, origin);
    put(repo, '.trd-state/_session-log.md', 'one\n');
    sh(repo, ['add', '-f', '.trd-state/_session-log.md']);
    sh(repo, ['commit', '-q', '-m', 'track log']);
    const head = sh(repo, ['rev-parse', 'HEAD']);
    const r = recordRef.write({ shared: true, command: 'c', step: 's', cwd: repo });
    expect(r.outcome).toBe('ref');
    expect(r.push).toBe('pushed');
    expect(sh(repo, ['ls-files', '.trd-state/_session-log.md'])).toBe('.trd-state/_session-log.md');
    expect(sh(repo, ['rev-parse', 'HEAD'])).toBe(head);
  });

  test('feature branch tracking implement.json: one removal commit, the user\'s staged change untouched, and a no-ff merge of base is clean', () => {
    const origin = initBare();
    const repo = initRepo();
    withOrigin(repo, origin);
    onFeature(repo);
    put(repo, `${STATE}/implement.json`, '{}\n');
    sh(repo, ['add', '-f', STATE]);
    sh(repo, ['commit', '-q', '-m', 'track']);
    // Base moves on by deleting the record, as a merged PR would.
    sh(repo, ['checkout', '-q', 'main']);
    put(repo, 'base.txt', 'b\n');
    sh(repo, ['add', 'base.txt']);
    sh(repo, ['commit', '-q', '-m', 'base moves']);
    sh(repo, ['checkout', '-q', 'feature/x']);
    put(repo, 'staged.txt', 's\n');
    sh(repo, ['add', 'staged.txt']);
    const head = sh(repo, ['rev-parse', 'HEAD']);

    const r = doWrite(repo);
    expect(r.outcome).toBe('ref');
    expect(sh(repo, ['rev-list', '--count', `${head}..HEAD`])).toBe('1');
    expect(sh(repo, ['show', '--name-status', '--format=%s', 'HEAD'])).toBe(`records(${SLUG}): moved to ${REF}\n\nD\t${STATE}/implement.json`);
    expect(sh(repo, ['diff', '--cached', '--name-only'])).toBe('staged.txt');
    sh(repo, ['reset', '-q', 'staged.txt']);
    sh(repo, ['merge', '--no-ff', '--no-commit', 'main']);
  });

  test('origin/HEAD naming trunk makes trunk the default branch; without it master is', () => {
    const repo = initRepo();
    sh(repo, ['checkout', '-q', '-b', 'trunk']);
    put(repo, `${STATE}/implement.json`, '{}\n');
    withOrigin(repo, deadOrigin());
    sh(repo, ['update-ref', 'refs/remotes/origin/trunk', 'HEAD']);
    sh(repo, ['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk']);
    const head = sh(repo, ['rev-parse', 'HEAD']);
    const r = doWrite(repo);
    expect(r.fallbackSkipped).toBe('default-branch');
    expect(sh(repo, ['rev-parse', 'HEAD'])).toBe(head);

    const repo2 = initRepo();
    withOrigin(repo2, deadOrigin());
    sh(repo2, ['checkout', '-q', '-b', 'master']);
    put(repo2, `${STATE}/implement.json`, '{}\n');
    const r2 = doWrite(repo2);
    expect(r2.fallbackSkipped).toBe('default-branch');
  });
});

describe('write: concurrency', () => {
  function runWriter(cwd, env) {
    return new Promise((resolve) => {
      const child = spawn(process.execPath, [LIB, 'write', '--state-dir', STATE, '--command', 'race', '--step', 'go', '--no-push'], {
        cwd,
        env: envFor(env),
      });
      let out = '';
      child.stdout.on('data', (d) => (out += d));
      child.on('close', (code) => resolve({ code, out }));
    });
  }

  test('(a) two writers racing one ref both land: both outcome ref, final tree holds both files', async () => {
    const repo = initRepo('race');
    const wt = path.join(mkTmp('wtparent'), 'wt2');
    sh(repo, ['worktree', 'add', '-q', '-b', 'second', wt]);
    const env = { FORGE_FEATURE_ID: 'race-feature' };

    // Seed the tip so both writers perform a compare-and-swap update, not a create.
    put(repo, `${STATE}/seed.md`, 'seed\n');
    expect(recordRef.write({ stateDir: STATE, command: 'c', step: 's', cwd: repo, push: false }).outcome).toBe('ref');

    const rounds = 5;
    for (let i = 0; i < rounds; i++) {
      put(repo, `${STATE}/a-${i}.md`, `a${i}\n`);
      put(wt, `${STATE}/b-${i}.md`, `b${i}\n`);
      // Both processes are spawned in the same tick, before either can finish.
      const [ra, rb] = await Promise.all([runWriter(repo, env), runWriter(wt, env)]);
      expect(ra.code).toBe(0);
      expect(rb.code).toBe(0);
      expect(JSON.parse(ra.out).outcome).toBe('ref');
      expect(JSON.parse(rb.out).outcome).toBe('ref');
      const files = treeFiles(repo, REF);
      expect(files).toEqual(expect.arrayContaining([`a-${i}.md`, `b-${i}.md`, 'seed.md']));
    }
    const files = treeFiles(repo, REF);
    for (let i = 0; i < rounds; i++) expect(files).toEqual(expect.arrayContaining([`a-${i}.md`, `b-${i}.md`]));
  }, 120000);
});

describe('write --shared', () => {
  const LOG = '.trd-state/_session-log.md';
  const DISC = '.trd-state/_sweep/discovered.jsonl';

  test('(h) puts _session-log.md and _sweep/discovered.jsonl on the _shared ref', () => {
    const repo = initRepo();
    put(repo, LOG, 'line one\n');
    put(repo, DISC, '{"a":1}\n');
    put(repo, `${STATE}/implement.json`, '{}\n'); // not shared: must not appear
    const r = recordRef.write({ shared: true, command: 'c', step: 's', cwd: repo });
    expect(r.outcome).toBe('ref');
    expect(r.ref).toBe(SHARED_REF);
    expect(treeFiles(repo, SHARED_REF).sort()).toEqual(['_session-log.md', '_sweep/discovered.jsonl']);
    expect(treeFiles(repo, SHARED_REF)).not.toContain('record.json');
  });

  test('--shared through the CLI works and refuses when there is nothing to write', () => {
    const repo = initRepo();
    const none = runCli(repo, ['write', '--shared', '--command', 'c', '--step', 's']);
    expect(none.status).toBe(0);
    expect(JSON.parse(none.stdout).outcome).toBe('refused');
    put(repo, LOG, 'x\n');
    const ok = runCli(repo, ['write', '--shared', '--command', 'c', '--step', 's']);
    expect(JSON.parse(ok.stdout).outcome).toBe('ref');
  });

  test('(h) a log the tip extended with repeated lines keeps every line after a racing write', () => {
    const repo = initRepo();
    const wt = path.join(mkTmp('wtparent'), 'wt2');
    sh(repo, ['worktree', 'add', '-q', '-b', 'second', wt]);

    const base = '# Log\n\n---\n\nentry 0\n';
    // Both start from the same history.
    put(repo, LOG, base);
    expect(recordRef.write({ shared: true, command: 'c', step: 's', cwd: repo, push: false }).outcome).toBe('ref');

    // The other writer extended the tip with repeated lines (a blank line and a rule).
    put(wt, LOG, base);
    const tipExtension = '\n---\n\nentry B\n';
    put(wt, LOG, base + tipExtension);
    expect(recordRef.write({ shared: true, command: 'c', step: 's', cwd: wt, push: false }).outcome).toBe('ref');

    // This writer, unaware of that extension, appended its own entry with the same repeated lines.
    const mineExtension = '\n---\n\nentry A\n';
    put(repo, LOG, base + mineExtension);
    expect(recordRef.write({ shared: true, command: 'c', step: 's', cwd: repo, push: false }).outcome).toBe('ref');

    const merged = showBlob(repo, SHARED_REF, '_session-log.md').split('\n');
    const count = (arr, s) => arr.filter((l) => l === s).length;
    // Every line of both copies survives, repeats included.
    const tipLines = (base + tipExtension).trimEnd().split('\n');
    expect(merged).toEqual(expect.arrayContaining(tipLines));
    expect(merged).toContain('entry A');
    expect(merged).toContain('entry B');
    // Repeated lines are not collapsed (a line-set merge would drop them): the tip's rules and
    // blank lines all remain. The two entries share the leading "\n---\n\n" run, which the
    // three-way union treats as common history, so it is not duplicated.
    expect(count(merged, '---')).toBeGreaterThanOrEqual(count(tipLines, '---'));
    expect(count(merged, '')).toBeGreaterThanOrEqual(count(tipLines, ''));
    expect(merged.indexOf('entry B')).toBeLessThan(merged.indexOf('entry A')); // ours (tip), then theirs
  });

  test('two worktrees writing diverged logs never duplicate a line on later writes', () => {
    const repo = initRepo();
    const wt = path.join(mkTmp('wtparent'), 'wt2');
    sh(repo, ['worktree', 'add', '-q', '-b', 'second', wt]);
    const shared = (cwd) => recordRef.write({ shared: true, command: 'c', step: 's', cwd, push: false }).outcome;

    put(repo, LOG, 'A\nB\nC\n');
    put(wt, LOG, 'A\nB\nD\n');
    expect(shared(repo)).toBe('ref');
    expect(shared(wt)).toBe('ref'); // tip now A B C D
    put(wt, LOG, 'A\nB\nD\nE\n');
    expect(shared(wt)).toBe('ref');
    put(wt, LOG, 'A\nB\nD\nE\nF\n');
    expect(shared(wt)).toBe('ref');
    put(repo, LOG, 'A\nB\nC\nG\n');
    expect(shared(repo)).toBe('ref');

    const merged = showBlob(repo, SHARED_REF, '_session-log.md').split('\n');
    expect(merged.sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  });

  test('a shared write overlays the tip: a file only the tip has is kept', () => {
    const repo = initRepo();
    put(repo, LOG, 'x\n');
    put(repo, DISC, '{}\n');
    expect(recordRef.write({ shared: true, command: 'c', step: 's', cwd: repo, push: false }).outcome).toBe('ref');
    fs.rmSync(path.join(repo, DISC));
    put(repo, LOG, 'x\ny\n');
    expect(recordRef.write({ shared: true, command: 'c', step: 's', cwd: repo, push: false }).outcome).toBe('ref');
    expect(treeFiles(repo, SHARED_REF)).toContain('_sweep/discovered.jsonl');
  });
});

describe('read, list, restore', () => {
  test('read returns a local file with the ref\'s identity', () => {
    const repo = initRepo();
    put(repo, `${STATE}/notes.md`, 'hello notes\n');
    process.env.FORGE_FEATURE_ID = 'id-9';
    doWrite(repo);
    const r = recordRef.read({ slug: SLUG, file: 'notes.md', cwd: repo });
    expect(r.ok).toBe(true);
    expect(r.content).toBe('hello notes\n');
    expect(r.encoding).toBe('utf8');
    expect(r.identity).toEqual({ forge_feature_id: 'id-9', branch: 'main', slug: SLUG });
  });

  test('read reports no-file, no-record, and refuses a bad slug or path', () => {
    const repo = initRepo();
    put(repo, `${STATE}/notes.md`, 'x');
    doWrite(repo);
    expect(recordRef.read({ slug: SLUG, file: 'missing.md', cwd: repo }).outcome).toBe('no-file');
    expect(recordRef.read({ slug: 'nothing', file: 'notes.md', cwd: repo }).outcome).toBe('no-record');
    expect(recordRef.read({ slug: '../x', file: 'notes.md', cwd: repo }).outcome).toBe('refused');
    expect(recordRef.read({ slug: SLUG, file: '../escape', cwd: repo }).outcome).toBe('refused');
  });

  test('read returns binary content as base64', () => {
    const repo = initRepo();
    put(repo, `${STATE}/verification-report.md`, '![i](evidence/i.png)');
    fs.mkdirSync(path.join(repo, STATE, 'evidence'), { recursive: true });
    fs.writeFileSync(path.join(repo, STATE, 'evidence', 'i.png'), Buffer.from([0, 1, 2, 255]));
    doWrite(repo);
    const r = recordRef.read({ slug: SLUG, file: 'evidence/i.png', cwd: repo });
    expect(r.encoding).toBe('base64');
    expect(Buffer.from(r.content, 'base64')).toEqual(Buffer.from([0, 1, 2, 255]));
  });

  test('read from origin in a fresh clone fetches the missing ref', () => {
    const origin = initBare();
    const a = cloneOf(origin, 'cloneA');
    put(a, `${STATE}/notes.md`, 'from origin\n');
    expect(doWrite(a).push).toBe('pushed');

    const fresh = cloneOf(origin, 'fresh');
    expect(sh(fresh, ['for-each-ref', 'refs/ensemble/'])).toBe('');
    const r = recordRef.read({ slug: SLUG, file: 'notes.md', cwd: fresh });
    expect(r.ok).toBe(true);
    expect(r.content).toBe('from origin\n');
    expect(sh(fresh, ['rev-parse', REF])).toBe(sh(a, ['rev-parse', REF]));
  });

  test('read through the CLI prints one JSON line', () => {
    const repo = initRepo();
    put(repo, `${STATE}/notes.md`, 'cli\n');
    doWrite(repo);
    const r = runCli(repo, ['read', '--slug', SLUG, '--file', 'notes.md']);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).content).toBe('cli\n');
  });

  test('list shows local refs, and remote ones with --remote', () => {
    const origin = initBare();
    const a = cloneOf(origin, 'cloneA');
    put(a, `${STATE}/notes.md`, 'x');
    doWrite(a);
    const local = recordRef.list({ cwd: a });
    expect(local.refs.map((e) => e.slug)).toEqual([SLUG]);
    expect(local.refs[0].local).toBe(sh(a, ['rev-parse', REF]));

    const fresh = cloneOf(origin, 'fresh');
    expect(recordRef.list({ cwd: fresh }).refs).toEqual([]);
    const remote = recordRef.list({ remote: true, cwd: fresh });
    expect(remote.refs.map((e) => e.slug)).toEqual([SLUG]);
    expect(remote.refs[0].remote).toBe(sh(a, ['rev-parse', REF]));
    expect(remote.refs[0].local).toBeUndefined();

    const cli = runCli(fresh, ['list', '--remote']);
    expect(JSON.parse(cli.stdout).refs).toHaveLength(1);
  });

  test('restore materialises a deleted folder (without record.json) and refuses a non-empty one', () => {
    const repo = initRepo();
    put(repo, `${STATE}/implement.json`, '{"a":1}\n');
    put(repo, `${STATE}/prompts/p.md`, 'p\n');
    doWrite(repo);
    fs.rmSync(path.join(repo, STATE), { recursive: true, force: true });

    const r = recordRef.restore({ stateDir: STATE, cwd: repo });
    expect(r.outcome).toBe('restored');
    expect(r.identity.slug).toBe(SLUG);
    expect(fs.readFileSync(path.join(repo, STATE, 'implement.json'), 'utf8')).toBe('{"a":1}\n');
    expect(fs.readFileSync(path.join(repo, STATE, 'prompts', 'p.md'), 'utf8')).toBe('p\n');
    expect(fs.existsSync(path.join(repo, STATE, 'record.json'))).toBe(false);

    // The folder now holds files: a second restore must not overwrite.
    fs.writeFileSync(path.join(repo, STATE, 'implement.json'), 'changed');
    const again = recordRef.restore({ stateDir: STATE, cwd: repo });
    expect(again.outcome).toBe('refused');
    expect(fs.readFileSync(path.join(repo, STATE, 'implement.json'), 'utf8')).toBe('changed');
  });

  test('restore reports no-record when the ref is absent and refuses an unsafe slug', () => {
    const repo = initRepo();
    expect(recordRef.restore({ stateDir: '.trd-state/ghost', cwd: repo }).outcome).toBe('no-record');
    expect(recordRef.restore({ stateDir: '.trd-state/_bad', cwd: repo }).outcome).toBe('refused');
    expect(recordRef.restore({ stateDir: 'docs/feat', cwd: repo }).outcome).toBe('refused');
  });

  test('restore through a symlinked cwd still resolves inside the repository', () => {
    const repo = initRepo();
    put(repo, `${STATE}/implement.json`, '{"a":1}\n');
    doWrite(repo);
    fs.rmSync(path.join(repo, STATE), { recursive: true, force: true });
    const link = path.join(mkTmp('link'), 'repo');
    fs.symlinkSync(repo, link);
    const r = recordRef.restore({ stateDir: STATE, cwd: link });
    expect(r.outcome).toBe('restored');
    expect(fs.readFileSync(path.join(repo, STATE, 'implement.json'), 'utf8')).toBe('{"a":1}\n');
  });

  test('restore through the CLI fetches from origin into an empty clone', () => {
    const origin = initBare();
    const a = cloneOf(origin, 'cloneA');
    put(a, `${STATE}/implement.json`, '{}\n');
    doWrite(a);
    const fresh = cloneOf(origin, 'fresh');
    const r = runCli(fresh, ['restore', '--state-dir', STATE]);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).outcome).toBe('restored');
    expect(fs.existsSync(path.join(fresh, STATE, 'implement.json'))).toBe(true);
  });
});

describe('reader additions: local, tolerant restore, match, ensure, readRecord', () => {
  const rm = (repo) => fs.rmSync(path.join(repo, STATE), { recursive: true, force: true });
  const originWithRecord = () => {
    const origin = initBare();
    const a = cloneOf(origin, 'cloneA');
    put(a, `${STATE}/implement.json`, '{"a":1}\n');
    put(a, `${STATE}/closed.json`, '{"c":1}\n');
    expect(doWrite(a).push).toBe('pushed');
    return { origin, a, fresh: cloneOf(origin, 'fresh') };
  };

  test('(a) read --local never fetches; read without it does', () => {
    const { fresh } = originWithRecord();
    const r = recordRef.read({ slug: SLUG, file: 'implement.json', cwd: fresh, local: true });
    expect(r.outcome).toBe('no-record');
    expect(sh(fresh, ['for-each-ref', 'refs/ensemble/'])).toBe('');
    const cli = JSON.parse(runCli(fresh, ['read', '--slug', SLUG, '--file', 'implement.json', '--local']).stdout);
    expect(cli.outcome).toBe('no-record');
    expect(recordRef.restore({ stateDir: STATE, cwd: fresh, local: true }).outcome).toBe('no-record');
    expect(sh(fresh, ['for-each-ref', 'refs/ensemble/'])).toBe('');
    expect(recordRef.read({ slug: SLUG, file: 'implement.json', cwd: fresh }).ok).toBe(true);
  });

  test('(b) restore into a folder holding only dispatch.jsonl and findings/x keeps both', () => {
    const repo = initRepo();
    put(repo, `${STATE}/implement.json`, '{"a":1}\n');
    doWrite(repo);
    rm(repo);
    put(repo, `${STATE}/dispatch.jsonl`, 'd\n');
    put(repo, `${STATE}/findings/x`, 'f\n');
    const r = recordRef.restore({ stateDir: STATE, cwd: repo });
    expect(r.outcome).toBe('restored');
    expect(fs.readFileSync(path.join(repo, STATE, 'implement.json'), 'utf8')).toBe('{"a":1}\n');
    expect(fs.readFileSync(path.join(repo, STATE, 'dispatch.jsonl'), 'utf8')).toBe('d\n');
    expect(fs.readFileSync(path.join(repo, STATE, 'findings', 'x'), 'utf8')).toBe('f\n');
    expect(fs.readdirSync(path.join(repo, STATE)).sort()).toEqual(['dispatch.jsonl', 'findings', 'implement.json']);
    expect(fs.readdirSync(path.join(repo, '.trd-state')).filter((n) => n.startsWith('.restore-'))).toEqual([]);
  });

  test('(c) restore into a folder holding implement.json is still refused', () => {
    const repo = initRepo();
    put(repo, `${STATE}/implement.json`, '{"a":1}\n');
    doWrite(repo);
    expect(recordRef.restore({ stateDir: STATE, cwd: repo }).outcome).toBe('refused');
  });

  test('(d) restore --match: another branch (no ids) is a mismatch and writes nothing; equal ids restore', () => {
    const repo = initRepo();
    sh(repo, ['checkout', '-q', '-b', 'other']);
    put(repo, `${STATE}/implement.json`, '{"a":1}\n');
    doWrite(repo);
    rm(repo);
    sh(repo, ['checkout', '-q', 'main']);
    const r = recordRef.restore({ stateDir: STATE, cwd: repo, match: true });
    expect(r.outcome).toBe('mismatch');
    expect(fs.existsSync(path.join(repo, STATE))).toBe(false);
    expect(recordRef.restore({ stateDir: STATE, cwd: repo, match: true, branch: 'other' }).outcome).toBe('restored');

    const repo2 = initRepo();
    process.env.FORGE_FEATURE_ID = 'id-1';
    put(repo2, `${STATE}/implement.json`, '{}\n');
    doWrite(repo2);
    rm(repo2);
    sh(repo2, ['checkout', '-q', '-b', 'different']);
    expect(recordRef.restore({ stateDir: STATE, cwd: repo2, match: true }).outcome).toBe('restored');
  });

  test('(e) ensure: present makes no git call; restored; no-record; failed; mismatch', () => {
    const notGit = mkTmp('notgit');
    put(notGit, `${STATE}/implement.json`, '{}');
    expect(recordRef.ensure({ stateDir: STATE, cwd: notGit })).toEqual({ ok: true, outcome: 'present' });

    const repo = initRepo();
    put(repo, `${STATE}/implement.json`, '{"a":1}\n');
    doWrite(repo);
    rm(repo);
    expect(recordRef.ensure({ stateDir: STATE, cwd: repo }).outcome).toBe('restored');
    expect(recordRef.ensure({ stateDir: STATE, cwd: repo }).outcome).toBe('present');

    const bare = initRepo();
    expect(recordRef.ensure({ stateDir: '.trd-state/ghost', cwd: bare }).outcome).toBe('no-record'); // no origin
    const { fresh } = originWithRecord();
    expect(recordRef.ensure({ stateDir: '.trd-state/ghost', cwd: fresh }).outcome).toBe('no-record'); // origin lacks it
    expect(recordRef.ensure({ stateDir: STATE, cwd: fresh, local: true }).outcome).toBe('no-record');
    expect(sh(fresh, ['for-each-ref', 'refs/ensemble/'])).toBe('');
    expect(recordRef.ensure({ stateDir: STATE, cwd: fresh, branch: 'main' }).outcome).toBe('restored');

    const broken = initRepo();
    withOrigin(broken, path.join(mkTmp('gone'), 'missing.git'));
    expect(recordRef.ensure({ stateDir: STATE, cwd: broken }).outcome).toBe('failed');

    const other = initRepo();
    sh(other, ['checkout', '-q', '-b', 'zzz']);
    put(other, `${STATE}/implement.json`, '{}');
    doWrite(other);
    rm(other);
    sh(other, ['checkout', '-q', 'main']);
    expect(recordRef.ensure({ stateDir: STATE, cwd: other }).outcome).toBe('mismatch');
    expect(fs.existsSync(path.join(other, STATE))).toBe(false);
    expect(recordRef.ensure({ stateDir: 'docs/x', cwd: other }).outcome).toBe('refused');
    const cli = JSON.parse(runCli(other, ['ensure', '--state-dir', STATE, '--local', '--branch', 'zzz']).stdout);
    expect(cli.outcome).toBe('restored');
  });

  test('(e2) a restore whose blob read fails leaves the destination as it was', () => {
    const repo = initRepo();
    put(repo, `${STATE}/implement.json`, '{"a":1}\n');
    put(repo, `${STATE}/notes.md`, 'unique notes content\n');
    doWrite(repo);
    rm(repo);
    put(repo, `${STATE}/dispatch.jsonl`, 'd\n');
    put(repo, `${STATE}/evidence/a.png`, 'png');
    // Corrupt the object store: remove the loose blob for notes.md.
    const sha = sh(repo, ['rev-parse', `${REF}:notes.md`]);
    const obj = path.join(repo, '.git', 'objects', sha.slice(0, 2), sha.slice(2));
    expect(fs.existsSync(obj)).toBe(true);
    fs.chmodSync(obj, 0o644);
    fs.rmSync(obj);
    const r = recordRef.restore({ stateDir: STATE, cwd: repo });
    expect(r.ok).toBe(false);
    expect(r.outcome).toBe('failed');
    expect(fs.readdirSync(path.join(repo, STATE)).sort()).toEqual(['dispatch.jsonl', 'evidence']);
    expect(fs.readFileSync(path.join(repo, STATE, 'evidence', 'a.png'), 'utf8')).toBe('png');
    expect(fs.readdirSync(path.join(repo, '.trd-state')).filter((n) => n.startsWith('.restore-'))).toEqual([]);

    // A wholly absent destination stays absent.
    rm(repo);
    expect(recordRef.restore({ stateDir: STATE, cwd: repo }).outcome).toBe('failed');
    expect(fs.existsSync(path.join(repo, STATE))).toBe(false);
  });

  test('(f) readRecord applies the per-folder rule and the identity check', () => {
    const repo = initRepo();
    put(repo, `${STATE}/implement.json`, 'ref-impl\n');
    put(repo, `${STATE}/closed.json`, 'ref-closed\n');
    doWrite(repo);
    rm(repo);
    expect(recordRef.readRecord({ stateDir: STATE, file: 'closed.json', cwd: repo })).toEqual({ found: true, content: 'ref-closed\n', source: 'ref' });
    expect(fs.existsSync(path.join(repo, STATE))).toBe(false); // reads in memory only
    put(repo, `${STATE}/implement.json`, 'wt-impl\n');
    expect(recordRef.readRecord({ stateDir: STATE, file: 'implement.json', cwd: repo })).toEqual({ found: true, content: 'wt-impl\n', source: 'worktree' });
    expect(recordRef.readRecord({ stateDir: STATE, file: 'closed.json', cwd: repo })).toEqual({ found: false, content: null, source: null });

    const other = initRepo();
    sh(other, ['checkout', '-q', '-b', 'zzz']);
    put(other, `${STATE}/closed.json`, 'x');
    doWrite(other);
    rm(other);
    sh(other, ['checkout', '-q', 'main']);
    expect(recordRef.readRecord({ stateDir: STATE, file: 'closed.json', cwd: other }).found).toBe(false);
    expect(recordRef.readRecord({ stateDir: STATE, file: 'closed.json', cwd: other, branch: 'zzz' }).found).toBe(true);
  });

  test('hasRecords ignores dispatch.jsonl, evidence/, findings/ and temp files', () => {
    const d = mkTmp('has');
    expect(recordRef.hasRecords(path.join(d, 'nope'))).toBe(false);
    put(d, 'dispatch.jsonl', 'x');
    put(d, 'evidence/a.png', 'x');
    put(d, 'findings/f.md', 'x');
    put(d, 'implement.json.tmp.1.2', 'x');
    expect(recordRef.hasRecords(d)).toBe(false);
    put(d, 'closed.json', '{}');
    expect(recordRef.hasRecords(d)).toBe(true);
  });

  test('(g) the new exports never throw on garbage', () => {
    for (const bad of [undefined, null, 5, {}, { stateDir: 7, cwd: 9 }, { stateDir: '\0', file: '\0', cwd: '/nonexistent/x' }]) {
      expect(() => recordRef.ensure(bad === null ? undefined : bad)).not.toThrow();
      expect(() => recordRef.readRecord(bad === null ? undefined : bad)).not.toThrow();
    }
    for (const bad of [undefined, null, 5, {}, '\0']) expect(recordRef.hasRecords(bad)).toBe(false);
    expect(recordRef.readRecord({}).found).toBe(false);
  });
});

describe('CLI', () => {
  test('an unknown subcommand is refused with one JSON line and exit 0', () => {
    const repo = initRepo();
    const r = runCli(repo, ['bogus']);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).outcome).toBe('refused');
  });

  test('read-record reads a file from the ref once the folder is gone, and nothing for another branch', () => {
    const repo = initRepo();
    put(repo, `${STATE}/closed.json`, '{"closedBy":"audit"}');
    expect(doWrite(repo, { push: false }).outcome).toBe('ref');
    fs.rmSync(path.join(repo, STATE), { recursive: true, force: true });
    const r = runCli(repo, ['read-record', '--local', '--state-dir', STATE, '--file', 'closed.json']);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out).toMatchObject({ found: true, source: 'ref' });
    expect(JSON.parse(out.content).closedBy).toBe('audit');
    const other = runCli(repo, ['read-record', '--local', '--state-dir', STATE, '--file', 'closed.json', '--branch', 'some-other-branch']);
    expect(JSON.parse(other.stdout).found).toBe(false);
  });
});

describe('writeFiles', () => {
  const RUN = { branch: 'feature/x', forge_feature_id: null };
  const doWriteFiles = (repo, extra = {}) =>
    recordRef.writeFiles({
      cwd: repo,
      slug: SLUG,
      files: [{ rel: 'shipped.json', content: '{"steps":[]}\n' }],
      identity: RUN,
      command: 'ship-build',
      step: 'merge',
      ...extra,
    });

  test('adds the file beside the tip files; record.json carries the given branch; the worktree stays clean', () => {
    const repo = initRepo();
    sh(repo, ['checkout', '-q', '-b', 'feature/x']);
    put(repo, `${STATE}/closed.json`, '{"closedBy":"audit"}\n');
    expect(doWrite(repo).outcome).toBe('ref');
    sh(repo, ['checkout', '-q', 'main']); // the checked-out branch is no longer the run's
    sh(repo, ['rm', '-rq', '--cached', '--ignore-unmatch', STATE]);
    fs.rmSync(path.join(repo, STATE), { recursive: true, force: true });
    const headBefore = sh(repo, ['rev-parse', 'HEAD']);

    const r = doWriteFiles(repo);
    expect(r).toMatchObject({ ok: true, outcome: 'ref', push: 'no-remote' });
    expect(treeFiles(repo, REF).sort()).toEqual(['closed.json', 'record.json', 'shipped.json']);
    expect(showBlob(repo, REF, 'shipped.json')).toBe('{"steps":[]}');
    expect(JSON.parse(showBlob(repo, REF, 'record.json'))).toMatchObject({ branch: 'feature/x', slug: SLUG });
    expect(sh(repo, ['status', '--porcelain'])).toBe('');
    expect(sh(repo, ['rev-parse', 'HEAD'])).toBe(headBefore);
    expect(fs.existsSync(path.join(repo, STATE))).toBe(false);
  });

  test('creates the ref when none exists, and a second write replaces the file in place', () => {
    const repo = initRepo();
    expect(doWriteFiles(repo).outcome).toBe('ref');
    expect(doWriteFiles(repo, { files: [{ rel: 'shipped.json', content: 'v2\n' }] }).outcome).toBe('ref');
    expect(showBlob(repo, REF, 'shipped.json')).toBe('v2');
    expect(sh(repo, ['rev-list', '--count', REF])).toBe('2');
  });

  test('a tip naming another feature is refused and the ref is unchanged', () => {
    const repo = initRepo();
    sh(repo, ['checkout', '-q', '-b', 'other']);
    put(repo, `${STATE}/closed.json`, '{}\n');
    expect(doWrite(repo).outcome).toBe('ref');
    const before = sh(repo, ['rev-parse', REF]);
    const r = doWriteFiles(repo);
    expect(r).toMatchObject({ ok: false, outcome: 'refused' });
    expect(sh(repo, ['rev-parse', REF])).toBe(before);
  });

  test('an identity with neither branch nor feature id is refused', () => {
    const repo = initRepo();
    const r = doWriteFiles(repo, { identity: { branch: null, forge_feature_id: null } });
    expect(r).toMatchObject({ ok: false, outcome: 'refused' });
    expect(sh(repo, ['for-each-ref', 'refs/ensemble'])).toBe('');
  });

  test('refuses a bad slug, an unsafe path, record.json, and a non-repo', () => {
    const repo = initRepo();
    expect(doWriteFiles(repo, { slug: '../x' }).outcome).toBe('refused');
    expect(doWriteFiles(repo, { files: [{ rel: '../x', content: 'a' }] }).outcome).toBe('refused');
    expect(doWriteFiles(repo, { files: [{ rel: 'record.json', content: 'a' }] }).outcome).toBe('refused');
    expect(doWriteFiles(repo, { files: [] }).outcome).toBe('refused');
    expect(doWriteFiles(mkTmp('plain')).outcome).toBe('refused');
  });

  test('with a bare origin the ref is pushed', () => {
    const repo = initRepo();
    const origin = initBare();
    withOrigin(repo, origin);
    const r = doWriteFiles(repo);
    expect(r).toMatchObject({ ok: true, outcome: 'ref', push: 'pushed' });
    expect(sh(origin, ['rev-parse', REF])).toBe(sh(repo, ['rev-parse', REF]));
  });

  test('push: false keeps the commit local', () => {
    const repo = initRepo();
    const origin = initBare();
    withOrigin(repo, origin);
    expect(doWriteFiles(repo, { push: false })).toMatchObject({ ok: true, push: 'skipped' });
    expect(sh(origin, ['for-each-ref', 'refs/ensemble'])).toBe('');
  });

  test('a non-fast-forward push is reconciled and keeps the remote files', () => {
    const repo = initRepo();
    const origin = initBare();
    withOrigin(repo, origin);
    const other = cloneOf(origin);
    expect(doWriteFiles(other, { files: [{ rel: 'a.json', content: 'A\n' }] }).push).toBe('pushed');
    expect(doWriteFiles(repo, { files: [{ rel: 'b.json', content: 'B\n' }] })).toMatchObject({ ok: true, push: 'pushed' });
    expect(treeFiles(origin, REF).sort()).toEqual(['a.json', 'b.json', 'record.json']);
  });

  test('a failed push still leaves the record on the local ref and says so', () => {
    const repo = initRepo();
    withOrigin(repo, path.join(os.tmpdir(), 'rr-no-such-origin-dir'));
    const r = doWriteFiles(repo);
    expect(r).toMatchObject({ ok: true, outcome: 'ref', push: 'failed' });
    expect(showBlob(repo, REF, 'shipped.json')).toBe('{"steps":[]}');
    expect(sh(repo, ['status', '--porcelain'])).toBe('');
  });
});

describe('write keeps a further-along ship record on the ref (FIX-011)', () => {
  const RUN = { branch: 'feature/x', forge_feature_id: null };
  const ship = (n, at, extra = {}) =>
    JSON.stringify({ startedAt: '2026-11-01T00:00:00Z', updatedAt: at, results: Array.from({ length: n }, (_, i) => ({ step: String(i + 1) })), ...extra }) + '\n';
  function setup(tipShip, tipCustody, wtShip) {
    const repo = initRepo();
    sh(repo, ['checkout', '-q', '-b', 'feature/x']);
    const w = recordRef.writeFiles({
      cwd: repo, slug: SLUG, identity: RUN, command: 'ship-build', step: 'merge',
      files: [{ rel: 'shipped.json', content: tipShip }, { rel: 'custody.json', content: tipCustody }, { rel: 'implement.json', content: '{"v":1}\n' }],
    });
    expect(w.ok).toBe(true);
    put(repo, `${STATE}/shipped.json`, wtShip);
    put(repo, `${STATE}/custody.json`, '{"from":"worktree"}\n');
    put(repo, `${STATE}/implement.json`, '{"v":2}\n');
    return repo;
  }

  test('the tip is further along: shipped.json and custody.json stay, the rest is written', () => {
    const repo = setup(ship(5, '2026-11-02T00:00:00Z'), '{"from":"ref"}\n', ship(3, '2026-11-01T01:00:00Z'));
    const r = doWrite(repo, { push: false });
    expect(r).toMatchObject({ ok: true, outcome: 'ref', kept: ['shipped.json', 'custody.json'] });
    expect(JSON.parse(showBlob(repo, REF, 'shipped.json')).results).toHaveLength(5);
    expect(showBlob(repo, REF, 'custody.json')).toBe('{"from":"ref"}');
    expect(showBlob(repo, REF, 'implement.json')).toBe('{"v":2}');
  });

  test('the worktree copy is further along: it wins as before, no kept field', () => {
    const repo = setup(ship(3, '2026-11-01T01:00:00Z'), '{"from":"ref"}\n', ship(5, '2026-11-02T00:00:00Z'));
    const r = doWrite(repo, { push: false });
    expect(r.kept).toBeUndefined();
    expect(JSON.parse(showBlob(repo, REF, 'shipped.json')).results).toHaveLength(5);
    expect(showBlob(repo, REF, 'custody.json')).toBe('{"from":"worktree"}');
  });

  test('an unparseable worktree shipped.json falls back to the worktree winning, without throwing', () => {
    const repo = setup(ship(5, '2026-11-02T00:00:00Z'), '{"from":"ref"}\n', '{not json');
    const r = doWrite(repo, { push: false });
    expect(r).toMatchObject({ ok: true, outcome: 'ref' });
    expect(r.kept).toBeUndefined();
    expect(showBlob(repo, REF, 'shipped.json')).toBe('{not json');
  });

  test('a later run on the tip is kept even with fewer results than the worktree\'s older run', () => {
    const later = JSON.stringify({ startedAt: '2026-11-05T00:00:00Z', updatedAt: '2026-11-05T00:10:00Z', results: [{ step: '1' }] }) + '\n';
    const repo = setup(later, '{"from":"ref"}\n', ship(4, '2026-11-01T02:00:00Z'));
    const r = doWrite(repo, { push: false });
    expect(r).toMatchObject({ ok: true, outcome: 'ref', kept: ['shipped.json', 'custody.json'] });
    expect(JSON.parse(showBlob(repo, REF, 'shipped.json')).startedAt).toBe('2026-11-05T00:00:00Z');
  });

  test('a tip of another feature is not kept from: the worktree\'s ship records are written', () => {
    const repo = setup(ship(5, '2026-11-02T00:00:00Z'), '{"from":"ref"}\n', ship(3, '2026-11-01T01:00:00Z'));
    sh(repo, ['checkout', '-q', '-b', 'feature/y']);
    const r = doWrite(repo, { push: false });
    expect(r.kept).toBeUndefined();
    expect(JSON.parse(showBlob(repo, REF, 'shipped.json')).results).toHaveLength(3);
  });

  test('a reconcile keeps a further-along record that only origin holds', () => {
    const origin = initBare();
    const a = cloneOf(origin, 'cloneA');
    const b = cloneOf(origin, 'cloneB');
    sh(a, ['checkout', '-q', '-b', 'feature/x']);
    sh(b, ['checkout', '-q', '-b', 'feature/x']);
    const w = recordRef.writeFiles({
      cwd: b, slug: SLUG, identity: RUN, command: 'ship-build', step: 'merge',
      files: [{ rel: 'shipped.json', content: ship(5, '2026-11-02T00:00:00Z') }, { rel: 'custody.json', content: '{"from":"ref"}\n' }],
    });
    expect(w).toMatchObject({ ok: true, push: 'pushed' });
    put(a, `${STATE}/shipped.json`, ship(3, '2026-11-01T01:00:00Z'));
    put(a, `${STATE}/custody.json`, '{"from":"worktree"}\n');
    put(a, `${STATE}/implement.json`, '{"v":2}\n');
    const r = doWrite(a);
    expect(r).toMatchObject({ ok: true, outcome: 'ref', push: 'pushed', kept: ['shipped.json', 'custody.json'] });
    expect(JSON.parse(showBlob(origin, REF, 'shipped.json')).results).toHaveLength(5);
    expect(showBlob(origin, REF, 'custody.json')).toBe('{"from":"ref"}');
    expect(showBlob(origin, REF, 'implement.json')).toBe('{"v":2}');
  });
});

describe('vendoring', () => {
  test('.claude/lib and packages/full/lib copies are byte-identical to the source', () => {
    const src = fs.readFileSync(LIB);
    for (const rel of ['.claude/lib/record-ref.js', 'packages/full/lib/record-ref.js']) {
      const copy = fs.readFileSync(path.join(REPO_ROOT, rel));
      expect(copy.equals(src)).toBe(true);
    }
  });
});

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const mirror = require('./design-mirror');

let root, repo, canvas;
const put = (dir, rel, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), text);
};
const get = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');

/** Both sides hold the same A.dc.html; returns the base map for it. */
function synced() {
  put(repo, 'A.dc.html', 'v1');
  put(canvas, 'A.dc.html', 'v1');
  put(canvas, 'canvas.json', '{}');
  put(repo, 'canvas.json', '{}');
  return mirror.base(repo);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'design-mirror-'));
  repo = path.join(root, 'repo');
  canvas = path.join(root, 'canvas');
  fs.mkdirSync(repo);
  fs.mkdirSync(canvas);
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('check', () => {
  const map = { canvases: [{ url: 'u1', version: '7' }, { url: 'u2', version: '1' }] };
  it('unchanged when the live version matches, changed otherwise', () => {
    expect(mirror.check(map, 'u1', '7')).toBe('unchanged');
    expect(mirror.check(map, 'u1', '8')).toBe('changed');
  });
  it('finds the entry by url among several canvases and throws on an unknown url', () => {
    expect(mirror.check(map, 'u2', '1')).toBe('unchanged');
    expect(() => mirror.check(map, 'nope', '1')).toThrow(/nope/);
  });
});

describe('plan + apply: the four sync cases', () => {
  it('canvas changed: the edit is adopted into the repository', () => {
    const base = synced();
    put(canvas, 'A.dc.html', 'canvas edit');
    const p = mirror.plan({ repoDir: repo, canvasDir: canvas, base });
    expect(p.files['A.dc.html']).toBe('canvas');
    const r = mirror.apply(p, { repoDir: repo, canvasDir: canvas });
    expect(r).toEqual({ adopted: ['A.dc.html'], toPublish: [], conflicts: [] });
    expect(get(repo, 'A.dc.html')).toBe('canvas edit');
  });

  it('repository changed: the file is queued to publish and the repository is untouched', () => {
    const base = synced();
    put(repo, 'A.dc.html', 'repo edit');
    const p = mirror.plan({ repoDir: repo, canvasDir: canvas, base });
    expect(p.files['A.dc.html']).toBe('repo');
    const r = mirror.apply(p, { repoDir: repo, canvasDir: canvas });
    expect(r.toPublish).toEqual(['A.dc.html']);
    expect(get(repo, 'A.dc.html')).toBe('repo edit');
  });

  it('both changed: canvas copy kept, repository version written beside it as .repo.dc.html', () => {
    const base = synced();
    put(repo, 'A.dc.html', 'repo edit');
    put(canvas, 'A.dc.html', 'canvas edit');
    const p = mirror.plan({ repoDir: repo, canvasDir: canvas, base });
    expect(p.files['A.dc.html']).toBe('both');
    const r = mirror.apply(p, { repoDir: repo, canvasDir: canvas });
    expect(r.conflicts).toEqual(['A.dc.html']);
    expect(get(repo, 'A.dc.html')).toBe('canvas edit');
    expect(get(repo, 'A.repo.dc.html')).toBe('repo edit');
  });

  it('publish refused: retry, retry, then stuck', () => {
    const work = path.join(root, 'work');
    expect(mirror.refused(work)).toBe('retry');
    expect(mirror.refused(work)).toBe('retry');
    expect(mirror.refused(work)).toBe('stuck');
  });
});

describe('plan edge cases', () => {
  it('unchanged on both sides', () => {
    const base = synced();
    const p = mirror.plan({ repoDir: repo, canvasDir: canvas, base });
    expect(Object.values(p.files).every((s) => s === 'unchanged')).toBe(true);
  });

  it('a file on one side only is a change on that side', () => {
    const base = synced();
    put(canvas, 'New.dc.html', 'n');
    put(repo, 'Mine.dc.html', 'm');
    const p = mirror.plan({ repoDir: repo, canvasDir: canvas, base });
    expect(p.files['New.dc.html']).toBe('canvas');
    expect(p.files['Mine.dc.html']).toBe('repo');
  });

  it('a deletion on one side is a change; adopting it removes the repository file', () => {
    const base = synced();
    fs.rmSync(path.join(canvas, 'A.dc.html'));
    const p = mirror.plan({ repoDir: repo, canvasDir: canvas, base });
    expect(p.files['A.dc.html']).toBe('canvas');
    mirror.apply(p, { repoDir: repo, canvasDir: canvas });
    expect(fs.existsSync(path.join(repo, 'A.dc.html'))).toBe(false);
  });

  it('edit on one side and deletion on the other is a conflict that keeps the canvas outcome', () => {
    const base = synced();
    put(repo, 'A.dc.html', 'repo edit');
    fs.rmSync(path.join(canvas, 'A.dc.html'));
    const p = mirror.plan({ repoDir: repo, canvasDir: canvas, base });
    expect(p.files['A.dc.html']).toBe('both');
    mirror.apply(p, { repoDir: repo, canvasDir: canvas });
    expect(fs.existsSync(path.join(repo, 'A.dc.html'))).toBe(false);
    expect(get(repo, 'A.repo.dc.html')).toBe('repo edit');
  });

  it('both sides changed to identical content is unchanged', () => {
    const base = synced();
    put(repo, 'A.dc.html', 'same');
    put(canvas, 'A.dc.html', 'same');
    expect(mirror.plan({ repoDir: repo, canvasDir: canvas, base }).files['A.dc.html']).toBe('unchanged');
  });

  it('ds/ is excluded from plan and base', () => {
    const base = synced();
    put(canvas, 'ds/tokens.css', 'x');
    put(repo, 'ds/other.css', 'y');
    const p = mirror.plan({ repoDir: repo, canvasDir: canvas, base });
    expect(Object.keys(p.files).some((f) => f.startsWith('ds/'))).toBe(false);
    expect(Object.keys(mirror.base(repo)).some((f) => f.startsWith('ds/'))).toBe(false);
  });

  it('a .repo.dc.html left by a conflict is neither published nor hashed on the next plan', () => {
    const base = synced();
    put(repo, 'A.repo.dc.html', 'conflict copy');
    const p = mirror.plan({ repoDir: repo, canvasDir: canvas, base });
    expect(p.files['A.repo.dc.html']).toBeUndefined();
    expect(mirror.apply(p, { repoDir: repo, canvasDir: canvas }).toPublish).toEqual([]);
    expect(mirror.base(repo)['A.repo.dc.html']).toBeUndefined();
  });

  it('a canvas folder without canvas.json throws naming it', () => {
    put(repo, 'A.dc.html', 'x');
    expect(() => mirror.plan({ repoDir: repo, canvasDir: canvas, base: {} })).toThrow(/canvas\.json/);
  });

  it('conflict copy of a non-board file gains .repo', () => {
    const base = synced();
    put(repo, 'support.js', 'r');
    put(canvas, 'support.js', 'c');
    const p = mirror.plan({ repoDir: repo, canvasDir: canvas, base });
    mirror.apply(p, { repoDir: repo, canvasDir: canvas });
    expect(get(repo, 'support.js.repo')).toBe('r');
  });
});

describe('base', () => {
  it('hashes nested files by content and ignores a missing folder', () => {
    put(repo, 'sub/a.js', 'one');
    const h1 = mirror.base(repo)['sub/a.js'];
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    put(repo, 'sub/a.js', 'two');
    expect(mirror.base(repo)['sub/a.js']).not.toBe(h1);
    expect(mirror.base(path.join(root, 'absent'))).toEqual({});
  });
});

describe('CLI', () => {
  const cli = path.join(__dirname, 'design-mirror.js');
  const run = (args, cwd) => spawnSync('node', [cli, ...args], { cwd, encoding: 'utf8' });
  let proj;
  beforeEach(() => {
    proj = path.join(root, 'proj');
    const dir = path.join(proj, 'docs/ui/x');
    put(dir, 'canvas/project/A.dc.html', 'v1');
    put(dir, 'canvas/project/canvas.json', '{}');
    const files = mirror.base(path.join(dir, 'canvas/project'));
    put(dir, 'design-map.json', JSON.stringify({ canvases: [{ url: 'u', version: '3', synced_at: 't', files }], boards: [] }));
    put(canvas, 'A.dc.html', 'v2');
    put(canvas, 'canvas.json', '{}');
  });

  it('check, plan, apply, base and refused run end to end', () => {
    const d = ['--dir', 'docs/ui/x'];
    expect(JSON.parse(run(['check', ...d, '--version', '4'], proj).stdout)).toBe('changed');
    expect(JSON.parse(run(['plan', ...d, '--canvas-dir', canvas], proj).stdout).files['A.dc.html']).toBe('canvas');
    expect(JSON.parse(run(['apply', ...d, '--canvas-dir', canvas], proj).stdout).adopted).toEqual(['A.dc.html']);
    expect(Object.keys(JSON.parse(run(['base', ...d], proj).stdout))).toContain('A.dc.html');
    expect(JSON.parse(run(['refused', ...d, '--work-dir', path.join(root, 'w')], proj).stdout)).toBe('retry');
  });

  it('errors exit 1 naming the problem', () => {
    const r = run(['plan', '--dir', 'docs/ui/x'], proj);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/canvas-dir/);
    expect(run(['bogus', '--dir', 'docs/ui/x'], proj).status).toBe(1);
    expect(run([], proj).status).toBe(1);
  });
});

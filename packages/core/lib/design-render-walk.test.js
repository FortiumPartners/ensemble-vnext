'use strict';

// AC-F3.5, AC-N3: the committed walk boards render with the pinned runtime and default arguments.
// Needs Chromium (`npx playwright install chromium`; CI installs it). The boards are committed under
// an ignored folder with `git add -f` (DQ-P001, D17), so this reads tracked files on a fresh clone.

const fs = require('fs');
const os = require('os');
const path = require('path');
const render = require('./design-render');

jest.setTimeout(90000);

const BOARDS = path.join(__dirname, '..', '..', '..', '.trd-state', 'task-dorch-t001-live-walk', 'evidence', 'boards');
const DIR = path.join(BOARDS, 'trips-refresh');
const tmp = (p = 'dwalk-') => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), p)));
const run = (d) => render.render({ dir: DIR, out: path.join(d, 'out'), offline: true }); // no runtime: the pinned default

describe('rendering the committed walk boards with the pinned runtime (AC-F3.5, AC-N3)', () => {
  const FAILING = ['01-home', '04-trips', '01-home--as-is', '02-home--as-is', '03-trips--as-is', '04-trips--as-is'];
  const CLEAN = ['02-home', '03-trips'];
  let result;
  beforeAll(async () => { result = await run(tmp()); });

  it('has the committed boards on disk', () => {
    expect(fs.existsSync(path.join(DIR, 'design-map.json'))).toBe(true);
    expect(fs.existsSync(path.join(BOARDS, '_design-system', 'fixture-web'))).toBe(true);
  });

  it('errors for exactly the six boards, each saying the runtime mounted nothing', () => {
    expect(Object.keys(result.errors).sort()).toEqual([...FAILING].sort());
    for (const id of FAILING) {
      expect(result.errors[id].some((e) => e.includes('mounted nothing'))).toBe(true);
    }
  });

  it('02-home and 03-trips are clean in every state', () => {
    for (const id of CLEAN) {
      expect(result.errors[id]).toBeUndefined();
      expect(result.frames.some((f) => f.board === id)).toBe(true);
    }
  });
});

'use strict';

/**
 * design-criteria.js: turn a design map into the `DC-` comparison rows of a success definition.
 *
 * WHY: which design frames the build is held to used to be enumerated by a model reading the skill's
 * "Criteria" prose, so two runs could disagree and nothing capped the must-pass set. Here the map
 * decides, in code (TRD core-boards-in-designs D8-D10): `verify-design-comparison` keeps the
 * verdict, this module keeps the list.
 *
 * Rules:
 *  - A `to-be` board with status approved, building or shipped yields one row per frame.
 *  - An `as-is` board yields rows unless it is superseded, has `screenshot_match: false`, or is
 *    replaced by a row-yielding to-be board with the same non-empty `route`, `platform` and
 *    `viewport` (compared element-wise). `part`, `flow` and superseded boards yield none.
 *  - Frames: the default frame `<id>.png`, then `<id>--<slug>.png` for each state that has `props`
 *    (a state without props renders no frame). Slugs come from design-render's `stateSlugs` with the
 *    same `reserved` list `render()` builds, over ALL boards. Frames are computed from `id` and
 *    `states`, never by splitting file names: board ids may themselves contain `--`.
 *  - Class: `core` for the default frame of a board design-map's `isCore` reads true, else
 *    `evidence-only`.
 *  - A frame whose PNG is absent from `<dir>/screens/png/` still yields its row and is listed in
 *    `missing`, so a skipped render cannot silently drop a must-pass criterion.
 *
 * The fields hold the raw text. `evidence` contains the text "the stitched design | build | ...";
 * a caller writing a markdown table escapes the pipes itself.
 *
 * Example:
 *   comparisonRows({ dir: 'docs/ui/trips' })
 *   // => { rows: [{ id: 'DC-01-home', boardClass: 'core', board: '01-home', state: null, ... },
 *   //              { id: 'DC-01-home--loading', boardClass: 'evidence-only', state: 'loading', ... }],
 *   //      missing: [], counts: { core: 1, evidenceOnly: 1 } }
 *
 * CLI: node design-criteria.js comparison-rows --dir docs/ui/<slug>
 *      JSON on stdout; `design-criteria.js: <message>` on stderr and exit 1 for a missing or invalid map.
 *
 * Requires design-map and design-render (neither requires this file), so there is no load cycle.
 */

const fs = require('fs');
const path = require('path');
const designMap = require('./design-map');
const { stateSlugs } = require('./design-render');

const REQUIRED_STATUSES = ['approved', 'building', 'shipped'];
const TIER1 = 'judge-only — a pictorial comparison against the design frame; no text assertion is possible';

const sameViewport = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
const nonEmpty = (s) => typeof s === 'string' && s !== '';

/** Whether a to-be board is a requirement and so yields rows. */
const yieldsAsToBe = (b) => b.kind === 'to-be' && REQUIRED_STATUSES.includes(b.status);

/** Whether `board` yields rows at all, given every to-be board that does. */
function selected(board, requirements) {
  if (!board) return false;
  if (board.kind === 'to-be') return yieldsAsToBe(board);
  if (board.kind !== 'as-is') return false;
  if (board.status === 'superseded' || board.screenshot_match === false) return false;
  if (!nonEmpty(board.route)) return true; // a route-less board can never be matched as replaced
  return !requirements.some((t) => t.route === board.route && t.platform === board.platform && sameViewport(t.viewport, board.viewport));
}

/** [{ state: string|null, stem }] for one board: the default frame, then each state with props. */
function framesOf(board, boards) {
  const prefix = `${board.id}--`;
  const reserved = boards
    .filter((x) => x && typeof x.id === 'string' && x.id !== board.id && x.id.startsWith(prefix))
    .map((x) => x.id.slice(prefix.length));
  const states = board.states || {};
  const slugs = stateSlugs(Object.keys(states), reserved);
  const out = [{ state: null, stem: board.id }];
  for (const name of Object.keys(states)) {
    const st = states[name];
    if (!st || !st.props) continue;
    out.push({ state: name, stem: `${board.id}--${slugs.get(name)}` });
  }
  return out;
}

/**
 * @param {{ dir: string }} args  the design folder, e.g. `docs/ui/<slug>`
 * @returns {{ rows: object[], missing: string[], counts: { core: number, evidenceOnly: number } }}
 *   `missing` holds the `cites` path of each row whose PNG is absent. Throws for a missing or
 *   invalid map (an over-cap map included).
 */
function comparisonRows({ dir } = {}) {
  if (!dir) throw new Error('--dir is required');
  const map = designMap.read(dir);
  const errors = designMap.validate(map);
  if (errors.length) throw new Error(`design-map.json is invalid: ${errors.join('; ')}`);

  // Cites is a repo path: forward slashes whatever the platform, no trailing slash on dir.
  const base = String(dir).replace(/\\/g, '/').replace(/\/+$/, '');
  const requirements = map.boards.filter(yieldsAsToBe);
  const rows = [];
  const missing = [];
  for (const board of map.boards) {
    if (!selected(board, requirements)) continue;
    const core = designMap.isCore(map, board);
    for (const { state, stem } of framesOf(board, map.boards)) {
      const cites = `${base}/screens/png/${stem}.png`;
      if (!fs.existsSync(path.join(dir, 'screens', 'png', `${stem}.png`))) missing.push(cites);
      rows.push({
        id: `DC-${stem}`,
        statement: `Screen \`${stem}\` renders as its design frame`,
        cites,
        evidence: `the stitched design | build | diff image and manifest for \`${stem}\`, per this skill's Capture section`,
        derivation: 'check:verify-design-comparison',
        tier1: TIER1,
        parts: '',
        mustPass: '',
        boardClass: core && state === null ? 'core' : 'evidence-only',
        board: board.id,
        state,
      });
    }
  }
  const coreCount = rows.filter((r) => r.boardClass === 'core').length;
  return { rows, missing, counts: { core: coreCount, evidenceOnly: rows.length - coreCount } };
}

function main(argv) {
  const verb = argv[0];
  const i = argv.indexOf('--dir');
  const dir = i >= 0 ? argv[i + 1] : undefined;
  if (verb !== 'comparison-rows') throw new Error(`unknown verb ${verb || '(none)'}`);
  return comparisonRows({ dir });
}

module.exports = { comparisonRows };

if (require.main === module) {
  try {
    process.stdout.write(JSON.stringify(main(process.argv.slice(2))) + '\n');
  } catch (e) {
    process.stderr.write('design-criteria.js: ' + e.message + '\n');
    process.exit(1);
  }
}

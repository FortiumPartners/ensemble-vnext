'use strict';
/**
 * fix-audit.js — the mechanical half of `/fix`'s audit.
 *
 * WHY THIS IS A MODULE. These checks began as prose in `fix.md` for a model to
 * carry out with an ad-hoc script each run. The first live run of `/fix`
 * (2026-08-22) did exactly that and got it wrong: it compared `task.serves`
 * as a string when the parser returns an ARRAY, producing two false failures on
 * a correct TRD. A false failure is worse than a missing check — it invites
 * "fixing" a document to satisfy a broken test.
 *
 * The judgment half (root cause vs symptom, regressions, simpler fixes) stays
 * with the adversarial agent. This is only the part that has one right answer.
 */

const fs = require('fs');
const path = require('path');

/** Which section each declared kind MUST carry as its verification source. */
const KIND_SECTION = {
  defect: '## Reproduction',
  change: '## Intended Change',
  refactor: '## Behaviour Preserved',
};

/**
 * @param {Object} parsed   output of trd-parser's parseTrd()
 * @param {Object} opts
 * @param {string[]} opts.objectiveIds  IDs declared in the TRD's Objectives table
 * @param {string}   [opts.root]        repo root for path existence checks
 * @param {string[]} [opts.expectedNew] paths the TRD creates, so absence is correct
 * @param {string}   [opts.kind]        the kind passed to fix-sizing
 * @param {string}   [opts.markdown]    the TRD source, for the kind/section check
 * @returns {{ok: boolean, findings: {check: string, id: string, detail: string}[]}}
 */
function audit(parsed, opts = {}) {
  const { objectiveIds = [], root = process.cwd(), expectedNew = [], kind, markdown } = opts;
  const findings = [];
  const add = (check, id, detail) => findings.push({ check, id, detail });

  const objectives = new Set(objectiveIds);
  const tasks = parsed.tasks || [];
  const grounding = parsed.grounding || {};

  if (tasks.length === 0) add('tasks', '-', 'no tasks parsed — the Master Task List is missing or malformed');

  const footprint = new Set();

  for (const task of tasks) {
    const g = grounding[task.id];

    if (!g) {
      add('grounding', task.id, 'no grounding block');
    } else if (!Array.isArray(g.touches) || g.touches.length === 0) {
      // The commonest real failure, and it is SILENT: an unbolded `- Touches:`
      // parses as nothing, so the task ships with empty grounding and the
      // implementer invents its own file list.
      add('grounding', task.id, 'grounding block has no Touches — check the field names are **bold**');
    } else {
      for (const raw of g.touches) {
        const p = String(raw).replace(/`/g, '').trim();
        footprint.add(p);
        if (expectedNew.includes(p)) continue;
        if (!fs.existsSync(path.resolve(root, p))) {
          add('citation', task.id, `cited path does not exist: ${p}`);
        }
      }
    }

    // `serves` is an ARRAY. Getting this wrong is what motivated the module.
    const serves = [].concat(task.serves || []).filter(Boolean);
    if (serves.length === 0) {
      add('serves', task.id, 'task names no objective — work nobody asked for');
    } else {
      for (const s of serves) {
        if (objectives.size > 0 && !objectives.has(s)) {
          add('serves', task.id, `Serves "${s}" resolves to no stated objective`);
        }
      }
    }
  }

  // KIND HONESTY. `kind` is the one sizing input a caller could misstate to buy a
  // laxer verdict: fix-sizing's default guards OMISSION (defect, strictest) but not
  // MISSTATEMENT, and `change` is laxer than `refactor` on the coverage axis — so a
  // refactor declared as a change with addsCoverage:true reaches AUTO on untested
  // code. Found by a blind audit 2026-08-23.
  //
  // Code cannot tell a refactor from a change by looking at the inputs. What it CAN
  // do is require the declared kind to match the verification section the TRD
  // actually carries, which catches the careless case and forces a deliberate one to
  // write a section that contradicts itself. The remaining judgment — "is this
  // really a refactor?" — belongs to the adversarial pass, which reads the diff.
  if (kind && markdown) {
    const expected = KIND_SECTION[kind];
    if (!expected) {
      add('kind', '-', `unknown kind "${kind}" — expected defect | change | refactor`);
    } else if (!markdown.includes(expected)) {
      const present = Object.entries(KIND_SECTION)
        .filter(([, sec]) => markdown.includes(sec))
        .map(([k]) => k);
      add('kind', '-',
        `declared kind "${kind}" requires a "${expected}" section and the TRD has none` +
        (present.length ? ` — it carries the ${present.join('/')} section instead` : ''));
    }
  }

  const fatal = (parsed.warnings || []).filter(isFatalWarning);
  for (const w of fatal) add('parser', '-', w);

  return { ok: findings.length === 0, findings, footprint: [...footprint] };
}

/**
 * A phase-less light TRD always warns that tasks defaulted to phase 1. That is
 * the documented structural default, not a defect, and treating it as one would
 * fail every TRD this command writes.
 */
function isFatalWarning(w) {
  return !/No "Phase <n>" heading found/i.test(w);
}

module.exports = { audit, isFatalWarning, KIND_SECTION };

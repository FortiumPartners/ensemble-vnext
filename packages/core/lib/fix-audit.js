'use strict';
/**
 * fix-audit.js — the mechanical half of `/plan`'s audit (the command was `/fix` until 4.6.0).
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
const { maskFencedLines, normalizeLineEndings, findSection, findTables } = require('./trd-parser');

/** Which section each declared kind MUST carry as its verification source. */
const KIND_SECTION = {
  defect: '## Reproduction',
  change: '## Intended Change',
  refactor: '## Behaviour Preserved',
};

/** Where a named skill's SKILL.md may live — the vendored runtime, or (in this framework's
 * own checkout) the plugin library it is compiled from. Mirrors §3.2's authoring fallback. */
const SKILL_DIRS = ['.claude/skills', 'packages/skills'];

function skillExists(root, skillName) {
  return SKILL_DIRS.some((dir) => fs.existsSync(path.resolve(root, dir, skillName, 'SKILL.md')));
}

/** Reads `framework-skills.txt` (D14) via the same two-directory fallback as `skillExists()`.
 * Returns a `{name: role}` map, or `null` when the file is absent -- absence is legitimate,
 * never guessed, matching skillExists()'s own convention. Format: `<name> <role>` per line,
 * `#` comments and blank lines allowed. */
function frameworkSkillRoles(root) {
  for (const dir of SKILL_DIRS) {
    const p = path.resolve(root, dir, 'framework-skills.txt');
    if (!fs.existsSync(p)) continue;
    const roles = {};
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const m = /^(\S+)\s+(\S+)/.exec(trimmed);
      if (m) roles[m[1]] = m[2];
    }
    return roles;
  }
  return null;
}

/** A skill named in a `## Verification Artifacts` row or `Omitted:` line must be a
 * SELECTABLE check (D14) -- a `support` role is shipped for use elsewhere (e.g. the
 * verify-plan-recovery bridge skill) and is never a valid choice here. */
function checkSkillRole(roles, skill, add) {
  if (!roles) return; // framework-skills.txt absent -- degrade gracefully, no guess
  const role = roles[skill];
  if (role && role !== 'check') {
    add('verification-artifacts', '-', `${skill}: role is "${role}", not a selectable check`);
  }
}

/** A backtick-delimited span is a URL when it starts with a scheme + `://`; a repo path otherwise. */
function isUrl(span) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(span);
}

/** §3.4: "Every span is its own input." Extracts every backtick-delimited span in a cell,
 * independently of any other span or the surrounding prose. */
function extractBacktickSpans(cell) {
  const spans = [];
  const re = /`([^`]+)`/g;
  let m;
  while ((m = re.exec(cell))) spans.push(m[1]);
  return spans;
}

/**
 * The `## Verification Artifacts` section check (TRD §3.2–§3.4). Composes trd-parser.js's
 * existing exports rather than adding a parser function of its own (D4, D5).
 */
function checkVerificationArtifacts(markdown, { root, expectedNew, add, advise }) {
  const lines = maskFencedLines(normalizeLineEndings(markdown).split('\n'));
  const section = findSection(lines, 'Verification Artifacts', { strategy: 'last' });
  if (!section) {
    add('verification-artifacts', '-', 'section missing — name the checks that apply, or state why none do');
    return;
  }

  const sectionLines = lines.slice(section.start, section.end);
  const tables = findTables(lines, section.start, section.end);
  const omittedRaw = [];
  let noneApply = false;
  for (const raw of sectionLines) {
    // Tolerate a list marker or bold label (`- Omitted:`, `**Omitted:**`) -- otherwise such a
    // line is silently skipped and its skill and reason go unchecked.
    const line = raw.trim().replace(/^[-*+]\s+/, '').replace(/^\*\*(Omitted:|None apply)\*\*/, '$1');
    const omittedMatch = /^Omitted:\s*(.*)$/.exec(line);
    if (omittedMatch) omittedRaw.push(omittedMatch[1]);
    const noneMatch = /^None apply\s*—\s*(.*)$/.exec(line);
    if (noneMatch) {
      noneApply = true;
      if (!noneMatch[1].trim()) add('verification-artifacts', '-', 'None apply line gives no reason');
    }
  }

  const hasRows = tables.some((t) => t.dataRows.length > 0);
  if (!hasRows && omittedRaw.length === 0 && !noneApply) {
    add('verification-artifacts', '-', 'section has no rows, no Omitted lines and no None apply line');
    return;
  }

  const roles = frameworkSkillRoles(root);

  for (const table of tables) {
    const skillIdx = table.headerCells.findIndex((h) => /skill/i.test(h));
    const inputsIdx = table.headerCells.findIndex((h) => /input/i.test(h));
    if (skillIdx === -1) continue;
    for (const row of table.dataRows) {
      const skill = (row.cells[skillIdx] || '').replace(/`/g, '').trim();
      if (skill && !skillExists(root, skill)) {
        add('verification-artifacts', '-', `Skill cell names no SKILL.md: ${skill}`);
      }
      if (skill) checkSkillRole(roles, skill, add);
      if (inputsIdx !== -1) {
        checkInputsCell(row.cells[inputsIdx] || '', skill, { root, expectedNew, add, advise });
      }
    }
  }

  for (const raw of omittedRaw) {
    const m = /^(\S+)(?:\s*—\s*(.*))?$/.exec(raw.trim());
    const skill = m ? m[1].replace(/`/g, '') : '';
    const reason = (m && m[2] ? m[2] : '').trim();
    if (skill && !skillExists(root, skill)) {
      add('verification-artifacts', '-', `Omitted line names no SKILL.md: ${skill}`);
    }
    if (skill) checkSkillRole(roles, skill, add);
    if (!reason) {
      add('verification-artifacts', '-', 'Omitted line gives no reason');
    }
  }
}

function checkInputsCell(cell, skill, { root, expectedNew, add, advise }) {
  for (const span of extractBacktickSpans(cell)) {
    if (isUrl(span)) {
      advise('verification-artifacts', '-', `not checked (URL): ${span}`);
      continue;
    }
    if (expectedNew.includes(span)) continue;
    // §3.4: a non-URL span is a REPOSITORY path. One that resolves outside the root (an
    // absolute `/api/alerts`, a `../` climb) is not one, whether or not something exists there.
    const absRoot = path.resolve(root);
    const resolved = path.resolve(absRoot, span);
    if (resolved !== absRoot && !resolved.startsWith(absRoot + path.sep)) {
      add('verification-artifacts', '-', `${skill}: cited input is not a repository path: ${span}`);
      continue;
    }
    if (!fs.existsSync(resolved)) {
      add('verification-artifacts', '-', `${skill}: cited path does not exist: ${span}`);
    }
  }
}

/**
 * @param {Object} parsed   output of trd-parser's parseTrd()
 * @param {Object} opts
 * @param {string[]} opts.objectiveIds  IDs declared in the TRD's Objectives table
 * @param {string}   [opts.root]        repo root for path existence checks
 * @param {string[]} [opts.expectedNew] paths the TRD creates, so absence is correct
 * @param {string}   [opts.kind]        the kind passed to fix-sizing
 * @param {string}   [opts.markdown]    the TRD source, for the kind/section check
 * @returns {{ok, findings, advisories, footprint}}
 *
 * FINDINGS vs ADVISORIES, and the distinction is the point:
 *   findings   — the TRD is MALFORMED. Grounding missing, a cited path that does
 *                not exist, a Serves pointing at no objective. Mechanical, and
 *                there is a right answer.
 *   advisories — the TRD is well-formed but you may have meant something else.
 *                These never affect `ok`. The author's intent controls; this
 *                surfaces the observation and gets out of the way.
 */
function audit(parsed, opts = {}) {
  const { objectiveIds = [], root = process.cwd(), expectedNew = [], kind, markdown } = opts;
  const findings = [];
  const advisories = [];
  const add = (check, id, detail) => findings.push({ check, id, detail });
  const advise = (check, id, detail) => advisories.push({ check, id, detail });

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

  // KIND / SECTION MISMATCH — an ADVISORY, deliberately, not a finding.
  //
  // The declared `kind` decides which axes fix-sizing scores, so a refactor
  // declared as a `change` is scored more leniently on coverage. That is worth
  // SURFACING, and it is not worth blocking: the author's intent controls, and
  // there are legitimate reasons to call something a change that a reviewer might
  // have called a refactor. The line between them is a judgment, and it is not
  // this module's judgment to make.
  //
  // So: say what was noticed, once, and get out of the way. `ok` is unaffected.
  // An earlier version made this a finding and described the input as one a
  // caller could "misstate to buy a laxer verdict" — which frames the author as
  // an adversary rather than the person whose call it is.
  if (kind && markdown) {
    const expected = KIND_SECTION[kind];
    if (!expected) {
      advise('kind', '-', `unknown kind "${kind}" — expected defect | change | refactor; sizing will default to defect`);
    } else if (!markdown.includes(expected)) {
      const present = Object.entries(KIND_SECTION)
        .filter(([, sec]) => markdown.includes(sec))
        .map(([k]) => k);
      advise('kind', '-',
        `declared "${kind}"` +
        (present.length
          ? ` but the TRD carries the ${present.join('/')} section — worth a look, and fine if deliberate`
          : ` but the TRD has no "${expected}" section, so --verify has nothing to derive from`));
    }
  }

  if (markdown) {
    checkVerificationArtifacts(markdown, { root, expectedNew, add, advise });
  }

  const fatal = (parsed.warnings || []).filter(isFatalWarning);
  for (const w of fatal) add('parser', '-', w);

  // `ok` reflects malformation only. Advisories never fail an audit.
  return { ok: findings.length === 0, findings, advisories, footprint: [...footprint] };
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

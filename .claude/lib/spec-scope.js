'use strict';

/**
 * spec-scope.js -- reads, writes and checks the acceptance criteria of a spec section, so a
 * plan built from a spec carries those criteria verbatim.
 *
 * WHY THIS EXISTS
 *
 * A model asked to copy 18 criteria into a TRD produced 29 objectives (it added, merged and
 * reworded). So the model only picks ids; this library writes the copied text, which makes
 * "verbatim" true by construction, and `check` reads the written documents (never the model's
 * lists) to catch a later writer breaking it.
 *
 * WHAT A CRITERION LOOKS LIKE
 *
 * A bolded id (letters, dash, digits and dots; a colon inside the bold allowed) opening a list
 * item or a table row's first cell, under a heading containing "Acceptance criteria":
 *
 *   ### Acceptance criteria
 *   - **AC-4.1** · Web: Registering signs the user in. *(Traces: W-006)*
 *   **Regression guards:**
 *   - **RG-4.1:** Onboarding for Disney-linked users is unchanged.
 *
 * Findings and task rows use the same bold-id shape; only the heading tells them apart, which
 * is why extraction is anchored to it. Ids under a "Regression guards" lead-in are guards:
 * outside the sweep/core split, in both verification runs.
 *
 * CLI (run from the project root; file contents are read from paths):
 *   extract           --file F [--section S]
 *   source            --file F                       -> {spec, section[, coreTrd]}; exit 1 if absent
 *   render-sweep      --spec P --section S --ids a,b --core-trd T|none --out F
 *   render-objectives --spec P --section S --ids a,b --trd F     (rewrites F in place)
 *   check             --spec P --section S [--sweep F] [--trd F]  -> {missing,...,ok}; exit 1 if not ok
 *   criteria          --spec P --section S --ids a,b [--feature N] [--out F]
 *   overlap           --sweep-files a,b --trd F
 * Spec paths are read relative to the working directory. JSON on stdout; errors on stderr, exit 1.
 */

const fs = require('fs');
const path = require('path');
const { findTables, splitRowCells, maskFencedLines, findSection } = require('./trd-parser');

const ID = '[A-Za-z][A-Za-z0-9]*-\\d+(?:\\.\\d+)*';
const ID_ANYWHERE_RE = new RegExp(ID, 'g');
const BOLD_ID_ITEM_RE = new RegExp(`^(\\s*)[-*]\\s+\\*\\*(${ID}):?\\*\\*(.*)$`);
const BOLD_ID_ROW_RE = new RegExp(`^\\s*\\|\\s*\\*\\*(${ID}):?\\*\\*\\s*\\|(.*)$`);
const RANGE_RE = new RegExp(`(${ID})\\s+(?:to|through|[-\\u2013\\u2014])\\s+(${ID})`, 'g');
const HEADING_RE = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const TRACES_RE = /\s*\*\(Traces:\s*([^)]*)\)\*/;
const MAX_RANGE = 500;

const split = (text) => String(text).split(/\r?\n/);
const squash = (s) => String(s).replace(/\s+/g, ' ').trim();
const level = (line) => { const m = HEADING_RE.exec(line); return m ? m[1].length : 0; };
const headingOf = (line) => { const m = HEADING_RE.exec(line); return m ? squash(m[2]) : null; };
const indentOf = (line) => /^\s*/.exec(line)[0].length;

/**
 * The lines a section owns: from its heading to the next heading of the same or higher level.
 * An exact heading-text match wins; a loose "contains" match is the fallback. No section means
 * the whole document. Returns {lines, start, end} over `lines` (fenced code blanked out).
 */
function sectionSpan(lines, section) {
  if (!section) return { start: 0, end: lines.length };
  const want = squash(section).toLowerCase();
  let hit = -1;
  for (const mode of ['exact', 'contains']) {
    for (let i = 0; i < lines.length && hit < 0; i++) {
      const t = headingOf(lines[i]);
      if (t === null) continue;
      const h = t.toLowerCase();
      if (mode === 'exact' ? h === want : h.includes(want)) hit = i;
    }
    if (hit >= 0) break;
  }
  if (hit < 0) return { start: 0, end: 0 };
  const lvl = level(lines[hit]);
  let end = lines.length;
  for (let j = hit + 1; j < lines.length; j++) {
    const l = level(lines[j]);
    if (l && l <= lvl) { end = j; break; }
  }
  return { start: hit + 1, end };
}

/** The span of the first heading inside [start,end) whose text contains `phrase`. */
function subSpan(lines, start, end, phrase) {
  const s = findSection(lines.slice(0, end), phrase, { fromIndex: start });
  return s ? { start: s.start, end: s.end } : null;
}

const isBlock = (line) => /^\s*([-*+]\s|\d+\.\s|\||#)/.test(line);
// A bare bold lead-in line such as `**Regression guards:**` starts a new block, never a wrap.
// So does a plain `Regression guards:` line: without this, one written straight under the last
// criterion (no blank line) was swallowed into that criterion's text and every guard after it
// was read as a criterion.
const GUARD_LEAD_RE = /^\s*\**\s*regression guards?\b/i;
const isLeadIn = (line) => /^\s*\*\*[^*]+\*\*:?\s*$/.test(line) || GUARD_LEAD_RE.test(line);

/** Join an item's first line with its continuation lines (indented, nested bullets, wrapped). */
function gather(lines, i, end, indent) {
  const parts = [];
  let j = i + 1;
  for (; j < end; j++) {
    const line = lines[j];
    if (!line.trim()) {
      // Blank line: continues only if the next non-blank line is indented deeper.
      let k = j + 1;
      while (k < end && !lines[k].trim()) k++;
      if (k < end && indentOf(lines[k]) > indent) { j = k - 1; continue; }
      break;
    }
    if (indentOf(line) > indent) { parts.push(line.trim().replace(/^[-*+]\s+/, '')); continue; }
    if (isBlock(line) || isLeadIn(line)) break;
    parts.push(line.trim()); // lazy wrapped line
  }
  return { parts, next: j };
}

function finishCriterion(id, kind, rest, parts) {
  let text = [rest, ...parts].join(' ');
  let traces = '';
  const m = TRACES_RE.exec(text);
  if (m) { traces = squash(m[1]); text = text.replace(TRACES_RE, ' '); }
  text = squash(text).replace(/^[·:\s]+/, '').trim();
  return { id, kind, text, traces, surface: surfaceOf(text) };
}

/** "Web desktop + Web phone width: ..." -> the label before the first ": " when short. */
function surfaceOf(text) {
  const i = text.indexOf(': ');
  if (i <= 0 || i > 60) return '';
  const label = text.slice(0, i);
  return /[.!?]/.test(label) ? '' : label;
}

/** Expand "AC-4.1 to AC-4.3" style ranges, plus every standalone id, from a verification line. */
function idsInLine(line) {
  const ids = new Set(line.match(ID_ANYWHERE_RE) || []);
  for (const m of line.matchAll(RANGE_RE)) {
    const [, a, b] = m;
    const pa = /^(.*?)(\d+)$/.exec(a);
    const pb = /^(.*?)(\d+)$/.exec(b);
    if (!pa || !pb || pa[1] !== pb[1]) continue;
    const from = Number(pa[2]);
    const to = Number(pb[2]);
    if (to < from || to - from > MAX_RANGE) continue;
    for (let n = from; n <= to; n++) ids.add(`${pa[1]}${n}`);
  }
  return [...ids];
}

/**
 * Read the criteria of a section.
 * @param {string} markdown
 * @param {{section?: string}} [opts] heading text; omitted = the whole document (a sweep file)
 * @returns {{criteria: Array<{id, kind: 'criterion'|'guard', text, traces, surface}>,
 *            verification: Object<string,string>}}  nothing found -> empty criteria
 */
function extract(markdown, { section } = {}) {
  const lines = maskFencedLines(split(markdown));
  const span = sectionSpan(lines, section);
  const criteria = [];
  const verification = {};

  const ac = subSpan(lines, span.start, span.end, 'acceptance criteria');
  if (ac) {
    let guardMode = false;
    for (let i = ac.start; i < ac.end; i++) {
      const line = lines[i];
      const item = BOLD_ID_ITEM_RE.exec(line);
      const row = item ? null : BOLD_ID_ROW_RE.exec(line);
      if (item) {
        const { parts, next } = gather(lines, i, ac.end, item[1].length);
        criteria.push(finishCriterion(item[2], guardMode ? 'guard' : 'criterion', item[3], parts));
        i = next - 1;
      } else if (row) {
        const cells = splitRowCells(`|${row[2]}`);
        criteria.push(finishCriterion(row[1], guardMode ? 'guard' : 'criterion', cells.join(' | '), []));
      } else if (level(line)) {
        // A sub-heading ("#### Regression guards") switches mode just as a lead-in line does.
        guardMode = /regression guard/i.test(line);
      } else if (line.trim() && !isBlock(line) && indentOf(line) === 0) {
        // Only a lead-in switches back out of guard mode. A plain sentence under the guards
        // lead-in ("These must still hold:") must not turn the guards below it into criteria.
        if (/regression guard/i.test(line)) guardMode = true;
        else if (isLeadIn(line)) guardMode = false;
      }
    }
  }

  const ver = subSpan(lines, span.start, span.end, 'verification');
  if (ver) {
    for (let i = ver.start; i < ver.end; i++) {
      const m = /^(\s*)[-*]\s+(.*)$/.exec(lines[i]);
      if (!m) continue;
      const { parts, next } = gather(lines, i, ver.end, m[1].length);
      const full = squash([m[2], ...parts].join(' '));
      for (const id of idsInLine(full)) verification[id] = verification[id] ? `${verification[id]} ${full}` : full;
      i = next - 1;
    }
  }
  return { criteria, verification };
}

const SOURCE_RE = /^\*\*Source spec\*\*:\s*(.+?)\s+§\s+(.+?)\s*$/;
const CORE_RE = /^\*\*Core TRD\*\*:\s*(.+?)\s*$/;
const unquote = (s) => s.replace(/^`+|`+$/g, '').trim();

/**
 * The one parser of the `**Source spec**: <path> § <section>` header (and a sweep file's
 * `**Core TRD**:` line). Throws when the header is absent or does not parse.
 * @returns {{spec: string, section: string, coreTrd?: string}}
 */
function source(markdown) {
  const lines = maskFencedLines(split(markdown));
  let found = null;
  let sawHeader = false;
  let coreTrd;
  for (const line of lines) {
    if (/^\*\*Source spec\*\*:/.test(line)) {
      sawHeader = true;
      const m = SOURCE_RE.exec(line.trim());
      if (m && !found) found = { spec: unquote(m[1]), section: m[2].trim() };
    }
    const c = CORE_RE.exec(line.trim());
    if (c && coreTrd === undefined) coreTrd = unquote(c[1]);
  }
  if (!found) {
    throw new Error(sawHeader
      ? 'the **Source spec**: line does not parse; expected "**Source spec**: <path> § <section>"'
      : 'no **Source spec**: line');
  }
  return coreTrd === undefined ? found : { ...found, coreTrd };
}

const headerLine = (spec, section) => `**Source spec**: ${spec} § ${section}`;
const cell = (s) => String(s).replace(/\|/g, '\\|');

function pick(markdown, section, ids, { allowGuards = false } = {}) {
  const extracted = extract(markdown, { section });
  const { criteria } = extracted;
  const byId = new Map(criteria.map((c) => [c.id, c]));
  const chosen = [];
  for (const id of new Set(ids)) {
    const c = byId.get(id);
    // Callers building a success definition pass a TRD's Objectives ids and a sweep file's ids,
    // both of which carry the guards; the guards are added below regardless, so skip them here.
    if (c && c.kind === 'guard' && allowGuards) continue;
    if (!c || c.kind !== 'criterion') throw new Error(`${id} is not an acceptance criterion of "${section}"`);
    chosen.push(c);
  }
  return { chosen, guards: criteria.filter((c) => c.kind === 'guard'), verification: extracted.verification };
}

const itemLine = (c) => `- **${c.id}**${c.kind === 'guard' ? ':' : ''} ${c.kind === 'guard' ? '' : '· '}${c.text}${c.traces ? ` *(Traces: ${c.traces})*` : ''}`;

/** The whole sweep file: header, core TRD line, swept criteria, then every guard. */
function renderSweep({ specMarkdown, specPath, section, ids, coreTrd = 'none' }) {
  const { chosen, guards } = pick(specMarkdown, section, ids);
  const out = [
    `# Sweep: ${section}`,
    '',
    headerLine(specPath, section),
    `**Core TRD**: ${coreTrd}`,
    '',
    '## Acceptance criteria',
    '',
    ...chosen.map(itemLine),
  ];
  if (guards.length) out.push('', '**Regression guards:**', '', ...guards.map(itemLine));
  return `${out.join('\n')}\n`;
}

/**
 * Rewrite a TRD in place: replace the `## Objectives` table with one row per core criterion
 * then one per guard, and set the `**Source spec**:` line. Nothing else changes.
 */
function renderObjectives({ trdMarkdown, specMarkdown, specPath, section, ids }) {
  const eol = trdMarkdown.includes('\r\n') ? '\r\n' : '\n';
  const lines = split(trdMarkdown);
  const masked = maskFencedLines(lines);
  const { chosen, guards } = pick(specMarkdown, section, ids);
  const src = `${specPath} § ${section}`;
  const rows = [
    '| ID | Objective | Source |',
    '|----|-----------|--------|',
    ...chosen.map((c) => `| ${c.id} | ${cell(c.text)} | ${cell(src)} |`),
    ...guards.map((g) => `| ${g.id} | ${cell(g.text)} | ${cell(`${src} (regression guard)`)} |`),
  ];

  const obj = objectivesSpan(masked);
  if (!obj) throw new Error('the TRD has no ## Objectives section');
  const table = findTables(masked, obj.start, obj.end)[0];
  if (table) {
    const last = table.dataRows.length ? table.dataRows[table.dataRows.length - 1].line : table.headerLine + 1;
    lines.splice(table.headerLine, last - table.headerLine + 1, ...rows);
  } else {
    lines.splice(obj.start, 0, '', ...rows);
  }

  const hdr = headerLine(specPath, section);
  const existing = masked.findIndex((l) => /^\*\*Source spec\*\*:/.test(l));
  if (existing >= 0) {
    lines[existing] = hdr;
  } else {
    const prd = masked.findIndex((l) => /^\*\*Source PRD\*\*:/.test(l));
    if (prd >= 0) {
      lines.splice(prd + 1, 0, hdr);
    } else {
      const title = masked.findIndex((l) => level(l) === 1);
      const at = title >= 0 ? title + 1 : 0;
      lines.splice(at, 0, '', hdr);
    }
  }
  return lines.join(eol);
}

function objectivesSpan(masked) {
  let hit = -1;
  for (let i = 0; i < masked.length; i++) {
    const t = headingOf(masked[i]);
    if (t && /^(\d+\.?\s*)?objectives$/i.test(t)) { hit = i; break; }
  }
  if (hit < 0) return null;
  const lvl = level(masked[hit]);
  let end = masked.length;
  for (let j = hit + 1; j < masked.length; j++) {
    const l = level(masked[j]);
    if (l && l <= lvl) { end = j; break; }
  }
  return { start: hit + 1, end };
}

/** id -> text for every row of the TRD's Objectives table. */
function objectiveRows(trdMarkdown) {
  const masked = maskFencedLines(split(trdMarkdown));
  const obj = objectivesSpan(masked);
  const rows = [];
  if (!obj) return rows;
  const table = findTables(masked, obj.start, obj.end)[0];
  if (!table) return rows;
  for (const r of table.dataRows) {
    const id = (r.cells[0] || '').replace(/\*\*|`/g, '').replace(/:$/, '').trim();
    if (id) rows.push({ id, text: squash(r.cells[1] || '') });
  }
  return rows;
}

/**
 * Check the written documents against the spec.
 * missing: a criterion in neither document, or a guard absent from the TRD (from the sweep file
 * when there is no TRD). duplicated: a criterion in both. added: an id that is neither a spec
 * criterion nor a guard. reworded: text differing from the spec's after whitespace collapse.
 * noHeader: the TRD's **Source spec**: line is absent or unparseable.
 */
function check({ specMarkdown, section, sweepMarkdown, trdMarkdown }) {
  const { criteria } = extract(specMarkdown, { section });
  const spec = new Map(criteria.map((c) => [c.id, c]));
  const guardIds = criteria.filter((c) => c.kind === 'guard').map((c) => c.id);
  const specIds = criteria.filter((c) => c.kind === 'criterion').map((c) => c.id);

  const core = trdMarkdown === undefined ? [] : objectiveRows(trdMarkdown);
  const sweepItems = sweepMarkdown === undefined ? [] : extract(sweepMarkdown).criteria;
  const coreIds = new Set(core.map((r) => r.id));
  const sweepIds = new Set(sweepItems.filter((c) => c.kind === 'criterion').map((c) => c.id));
  const sweepGuards = new Set(sweepItems.filter((c) => c.kind === 'guard').map((c) => c.id));

  const missing = specIds.filter((id) => !coreIds.has(id) && !sweepIds.has(id));
  for (const g of guardIds) {
    const present = trdMarkdown === undefined ? sweepGuards.has(g) : coreIds.has(g);
    if (!present) missing.push(g);
  }
  const duplicated = specIds.filter((id) => coreIds.has(id) && sweepIds.has(id));
  const added = [
    ...core.filter((r) => !spec.has(r.id)).map((r) => r.id),
    ...[...sweepIds].filter((id) => !spec.has(id)),
  ];
  const reworded = [];
  const compare = (id, text) => {
    const want = spec.get(id);
    if (want && squash(text) !== want.text && !reworded.includes(id)) reworded.push(id);
  };
  core.forEach((r) => compare(r.id, r.text));
  sweepItems.forEach((c) => compare(c.id, c.text));

  let noHeader = false;
  if (trdMarkdown !== undefined) {
    try { source(trdMarkdown); } catch { noHeader = true; }
  }
  const ok = !missing.length && !duplicated.length && !added.length && !reworded.length && !noHeader;
  return { missing, duplicated, added, reworded, noHeader, ok };
}

const SCREENSHOT_RE = /screenshot/i;

/**
 * A whole success-definition.md: the chosen criteria verbatim plus every guard, grouped by
 * surface in order of first appearance. Evidence quotes the spec's verification line (blank
 * when none); Tier 1 is judge-only when that line names a screenshot, else locator.
 */
function criteria({ specMarkdown, specPath, section, ids, feature, now = () => new Date() }) {
  const { chosen, guards, verification } = pick(specMarkdown, section, ids, { allowGuards: true });
  const order = [];
  for (const c of chosen) if (!order.includes(c.surface)) order.push(c.surface);
  const grouped = order.flatMap((s) => chosen.filter((c) => c.surface === s));
  const src = `${specPath} § ${section}`;
  const row = (c, cites) => {
    const ev = verification[c.id] || '';
    const tier = SCREENSHOT_RE.test(ev) ? 'judge-only — screenshot comparison' : 'locator';
    return `| ${c.id} | ${cell(c.text)} | ${cell(cites)} | ${cell(ev)} | [read] | ${tier} | |`;
  };
  const rows = [
    ...grouped.map((c) => row(c, `${src}, ${c.id}`)),
    ...guards.map((g) => row(g, `${src}, regression guard ${g.id}`)),
  ];
  return [
    `# Functional Success Definition: ${feature || section}`,
    '',
    `**Source**: ${src}`,
    '**Source kind**: spec',
    `**Derived**: ${now().toISOString()}`,
    `**Criteria**: ${rows.length}`,
    '',
    '| ID | Functional statement | Cites | Evidence that would prove it | Derivation | Tier 1 | Parts |',
    '|----|----------------------|-------|------------------------------|------------|--------|-------|',
    ...rows,
    '',
  ].join('\n');
}

/**
 * A changed-file path as a TRD would write it: relative to the project root, no leading `./`.
 * Fixers report `files_changed` as they like, and an absolute path never matches a TRD's
 * relative one, which would report "no overlap" for a file both touch.
 */
function asTrdPath(file, root = process.cwd()) {
  let f = String(file).trim();
  if (path.isAbsolute(f)) {
    const rel = path.relative(root, f);
    if (rel && !rel.startsWith('..')) f = rel.split(path.sep).join('/');
  }
  return f.replace(/^(\.\/)+/, '');
}

/** Files named in a TRD (outside code fences) that also appear in `sweepFiles`. */
function overlap({ sweepFiles, trdMarkdown, root }) {
  const text = maskFencedLines(split(trdMarkdown)).join('\n');
  const shared = [];
  for (const raw of sweepFiles.map((s) => s.trim()).filter(Boolean)) {
    const f = asTrdPath(raw, root);
    const esc = f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Bounded so `a/b.js` does not match inside `xa/b.js` or `a/b.jsx`.
    // A `./` prefix in the TRD is the same path, so it is allowed before the name.
    if (new RegExp(`(^|[^\\w./-]|(?:^|[^\\w.])\\./)${esc}(?![\\w-]|\\.\\w)`, 'm').test(text)) shared.push(raw);
  }
  return { shared, ok: shared.length === 0 };
}

function flags(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`unexpected argument ${a}`);
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value`);
    out[a.slice(2)] = v;
    i++;
  }
  return out;
}

const read = (p) => fs.readFileSync(p, 'utf8');
const need = (f, ...names) => names.forEach((n) => { if (f[n] === undefined) throw new Error(`--${n} is required`); });
const idList = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);

function cli(argv) {
  const [cmd, ...rest] = argv;
  const f = flags(rest);
  switch (cmd) {
    case 'extract':
      need(f, 'file');
      return extract(read(f.file), { section: f.section });
    case 'source':
      need(f, 'file');
      return source(read(f.file));
    case 'render-sweep': {
      need(f, 'spec', 'section', 'ids', 'out');
      const md = renderSweep({ specMarkdown: read(f.spec), specPath: f.spec, section: f.section, ids: idList(f.ids), coreTrd: f['core-trd'] || 'none' });
      fs.writeFileSync(f.out, md);
      return { ok: true, out: f.out };
    }
    case 'render-objectives': {
      need(f, 'spec', 'section', 'ids', 'trd');
      fs.writeFileSync(f.trd, renderObjectives({ trdMarkdown: read(f.trd), specMarkdown: read(f.spec), specPath: f.spec, section: f.section, ids: idList(f.ids) }));
      return { ok: true, trd: f.trd };
    }
    case 'check': {
      need(f, 'spec', 'section');
      return check({
        specMarkdown: read(f.spec),
        section: f.section,
        sweepMarkdown: f.sweep ? read(f.sweep) : undefined,
        trdMarkdown: f.trd ? read(f.trd) : undefined,
      });
    }
    case 'criteria': {
      need(f, 'spec', 'section', 'ids');
      const md = criteria({ specMarkdown: read(f.spec), specPath: f.spec, section: f.section, ids: idList(f.ids), feature: f.feature });
      if (f.out) { fs.writeFileSync(f.out, md); return { ok: true, out: f.out }; }
      return { markdown: md };
    }
    case 'overlap':
      need(f, 'sweep-files', 'trd');
      return overlap({ sweepFiles: idList(f['sweep-files']), trdMarkdown: read(f.trd) });
    default:
      throw new Error('usage: spec-scope.js extract|source|render-sweep|render-objectives|check|criteria|overlap --flag value ...');
  }
}

module.exports = { extract, source, renderSweep, renderObjectives, check, criteria, overlap, objectiveRows };

if (require.main === module) {
  try {
    const result = cli(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result && result.ok === false) process.exit(1);
  } catch (e) {
    process.stderr.write(`spec-scope: ${e.message}\n`);
    process.exit(1);
  }
}

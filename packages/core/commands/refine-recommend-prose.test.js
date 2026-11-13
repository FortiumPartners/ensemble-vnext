'use strict';

// Pins the "Putting a question to the owner" rule (recommend an option on every interactive
// question) in the four refine commands, and every site where the command asks. Prose-level,
// like refine-design-prose.test.js.

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..', '..');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');
const flat = (s) => s.replace(/\s+/g, ' ');
const NAMES = ['refine-prd', 'refine-trd', 'refine-verification', 'refine-design'];
const raws = Object.fromEntries(NAMES.map((n) => [n, read(`packages/core/commands/${n}.md`)]));
const HEADING = '### Putting a question to the owner';
const POINTER = 'Putting a question to the owner';

/** The subsection: from its heading to the next heading, whitespace collapsed. */
function subsection(raw) {
  const start = raw.indexOf(HEADING);
  if (start < 0) return '';
  const rest = raw.slice(start + HEADING.length);
  const next = rest.search(/\n(#{1,6} |---\n)/); // next heading or horizontal rule
  return flat(HEADING + (next < 0 ? rest : rest.slice(0, next)));
}

/** Text from `startMarker` up to (not including) the first `endRe` match after it. */
function slice(raw, startMarker, endRe) {
  const start = raw.indexOf(startMarker);
  if (start < 0) return '';
  const rest = raw.slice(start + startMarker.length);
  const m = rest.search(endRe);
  return flat(startMarker + (m < 0 ? rest : rest.slice(0, m)));
}

const PHRASES = [
  'marks one option "(Recommended)"',
  'lists it first',
  'one-line reason',
  'say so plainly in the question text',
  "the author's recorded assumption",
  'what the non-interactive mode would do',
  'at most four findings in one question',
  'the rule applies to each finding',
  'never by its id alone',
];

describe.each(NAMES)('%s: the rule text', (name) => {
  const raw = raws[name];
  test('has the subsection heading inside ## Modes', () => {
    const modes = slice(raw, '## Modes', /\n## /);
    expect(modes).toContain(HEADING);
  });
  test.each(PHRASES)('says %s', (phrase) => {
    expect(subsection(raw)).toContain(phrase);
  });
  test('is byte-identical in .claude/commands', () => {
    expect(read(`.claude/commands/${name}.md`)).toBe(raw);
  });
});

test('the subsection is identical in all four commands', () => {
  const first = subsection(raws['refine-prd']);
  expect(first).not.toBe('');
  for (const n of NAMES) expect(subsection(raws[n])).toBe(first);
});

describe('every asking site points at the rule', () => {
  test.each(['refine-prd', 'refine-trd'])('%s Phase 0 Interactive', (n) => {
    expect(slice(raws[n], '## Phase 0: Answer the open questions', /\n(---|## Phase 1)/)).toContain(POINTER);
  });
  test.each(['refine-prd', 'refine-trd'])('%s Phase 2 Interactive', (n) => {
    expect(slice(raws[n], '### Phase 2: Apply', /\n### Phase 3/)).toContain(POINTER);
  });
  test('refine-verification ### Interactive', () => {
    expect(slice(raws['refine-verification'], '### Interactive', /\n### /)).toContain(POINTER);
  });
  test('refine-verification must-pass owner ruling', () => {
    const t = flat(raws['refine-verification']);
    expect(t).toMatch(/Interactive, ask the owner, following \*\*Putting a question to the owner\*\*, above;/);
  });
  test('refine-design Modes paragraph', () => {
    const p = slice(raws['refine-design'], '**The autonomy exemption is conditional on mode**', /\n\n/);
    expect(p).toContain(POINTER);
    expect(p).toMatch(/names? one option "\(Recommended\)"/);
  });
});

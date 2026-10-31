'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const G = require('./trd-grounding');
const { parseTrd } = require('./trd-parser');

const CLI = path.join(__dirname, 'trd-grounding.js');

const MASTER = `# TRD: demo

## Open Questions

None.

## Master Task List

| Task ID | Description | Serves | Dependencies | Acceptance Criteria |
|---------|-------------|--------|--------------|---------------------|
| F-B001 | one | O1 | None | works |
| F-B002 | two | O1 | None | works |
| F-B003 | three | O1 | None | works |

`;
const TAIL = `## Could Not Verify

- nothing
`;

function block(id, file) {
  return `### ${id}\n- **Touches:** \`${file}\`\n- **Reuse:** nothing\n`;
}

let tmp;
let trd;
let dir;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'trdg-'));
  trd = path.join(tmp, 'x.md');
  dir = path.join(tmp, 'g');
  fs.mkdirSync(dir);
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const write = (name, text) => fs.writeFileSync(path.join(dir, name), text);
const read = () => fs.readFileSync(trd, 'utf8');
const count = (s, re) => (s.match(re) || []).length;

describe('trd-grounding assemble', () => {
  test('1: no section + two block files gives every block with its touches', () => {
    fs.writeFileSync(trd, MASTER + TAIL);
    write('blocks-1.md', block('F-B001', 'a.js') + '\n' + block('F-B002', 'b.js'));
    write('blocks-2.md', block('F-B003', 'c.js'));
    const r = G.assemble(trd, dir);
    const p = parseTrd(read());
    expect(Object.keys(p.grounding).sort()).toEqual(['F-B001', 'F-B002', 'F-B003']);
    expect(p.grounding['F-B002'].touches).toEqual(['b.js']);
    expect(r.written).toBe(true);
    expect(r.blocksFound).toBe(3);
    expect(r.grounded).toEqual(['F-B001', 'F-B002', 'F-B003']);
    // Inserted before Could Not Verify, after the Master Task List.
    expect(read().indexOf('Task Grounding')).toBeLessThan(read().indexOf('Could Not Verify'));
    expect(read().indexOf('Task Grounding')).toBeGreaterThan(read().indexOf('F-B003 | three'));
  });

  test('2: an unnumbered old section is replaced, leaving exactly one heading', () => {
    fs.writeFileSync(trd, MASTER + '## Task Grounding\n\n' + block('F-B001', 'OLD.js') + '\n' + TAIL);
    write('blocks-1.md', block('F-B001', 'new.js'));
    G.assemble(trd, dir);
    const t = read();
    expect(count(t, /^#+ .*Task Grounding/gm)).toBe(1);
    expect(t).not.toContain('OLD.js');
    expect(t).toContain('new.js');
    expect(t).toContain('## Could Not Verify');
  });

  test('3: a task without a block is ungrounded; exit 0 via CLI', () => {
    fs.writeFileSync(trd, MASTER + TAIL);
    write('blocks-1.md', block('F-B001', 'a.js'));
    const run = spawnSync('node', [CLI, 'assemble', '--trd', trd, '--dir', dir], { encoding: 'utf8' });
    expect(run.status).toBe(0);
    const out = JSON.parse(run.stdout);
    expect(out.ungrounded).toEqual(['F-B002', 'F-B003']);
    expect(out.grounded).toEqual(['F-B001']);
  });

  test('4: a block for an unknown task is dropped and listed', () => {
    fs.writeFileSync(trd, MASTER + TAIL);
    write('blocks-1.md', block('F-B001', 'a.js') + block('ZZ-999', 'z.js'));
    const r = G.assemble(trd, dir);
    expect(r.unknown).toEqual(['ZZ-999']);
    expect(read()).not.toContain('z.js');
    expect(r.blocksFound).toBe(2);
  });

  test('5a: sizing.json with two deferred items fills the Deferred table', () => {
    fs.writeFileSync(trd, MASTER + TAIL);
    write('blocks-1.md', block('F-B001', 'a.js'));
    write(
      'sizing.json',
      JSON.stringify({ deferred: [{ id: 'F-B002', why: 'needs a | live device' }, { id: 'F-B003', why: 'long\nrun' }] })
    );
    const r = G.assemble(trd, dir);
    const p = parseTrd(read());
    expect(p.deferred).toEqual([
      { id: 'F-B002', why: 'needs a | live device' },
      { id: 'F-B003', why: 'long run' },
    ]);
    expect(r.deferred).toEqual(['F-B002', 'F-B003']);
    expect(r.sizing).toBe('ok');
    // Placed right after the Master Task List, before Task Grounding.
    expect(read().indexOf('Deferred by design')).toBeLessThan(read().indexOf('Task Grounding'));
  });

  test('5b: no deferred items writes no section; missing and invalid are reported', () => {
    fs.writeFileSync(trd, MASTER + TAIL);
    write('blocks-1.md', block('F-B001', 'a.js'));
    write('sizing.json', JSON.stringify({ deferred: [] }));
    let r = G.assemble(trd, dir);
    expect(read()).not.toContain('Deferred by design');
    expect(r.sizing).toBe('ok');
    expect(r.deferred).toEqual([]);

    fs.rmSync(path.join(dir, 'sizing.json'));
    expect(G.assemble(trd, dir).sizing).toBe('missing');

    write('sizing.json', '{not json');
    expect(G.assemble(trd, dir).sizing).toBe('invalid');
    write('sizing.json', JSON.stringify({ other: 1 }));
    expect(G.assemble(trd, dir).sizing).toBe('invalid');
    expect(read()).not.toContain('Deferred by design');
  });

  test('6: running assemble twice is byte-identical', () => {
    fs.writeFileSync(trd, MASTER + TAIL);
    write('blocks-1.md', block('F-B001', 'a.js') + block('F-B002', 'b.js'));
    write('sizing.json', JSON.stringify({ deferred: [{ id: 'F-B003', why: 'later' }] }));
    G.assemble(trd, dir);
    const first = read();
    const r2 = G.assemble(trd, dir);
    expect(read()).toBe(first);
    expect(r2.written).toBe(false);
  });

  test('6b: idempotent when the section lands at end of document', () => {
    fs.writeFileSync(trd, MASTER);
    write('blocks-1.md', block('F-B001', 'a.js'));
    G.assemble(trd, dir);
    const first = read();
    G.assemble(trd, dir);
    expect(read()).toBe(first);
  });

  test('7: a dir with no block files leaves the TRD unchanged', () => {
    fs.writeFileSync(trd, MASTER + TAIL);
    write('notes.md', block('F-B001', 'a.js'));
    const r = G.assemble(trd, dir);
    expect(read()).toBe(MASTER + TAIL);
    expect(r.blocksFound).toBe(0);
    expect(r.written).toBe(false);
    expect(r.ungrounded).toEqual(['F-B001', 'F-B002', 'F-B003']);
    // A dir that does not exist at all behaves the same.
    expect(G.assemble(trd, path.join(tmp, 'nope')).blocksFound).toBe(0);
  });

  test('8: a Task Grounding heading quoted inside a code fence is untouched', () => {
    const fenced = '## Notes\n\n```\n## 9. Task Grounding\n### F-B001\nQUOTED\n```\n\n';
    fs.writeFileSync(trd, MASTER + fenced + TAIL);
    write('blocks-1.md', block('F-B001', 'a.js'));
    G.assemble(trd, dir);
    const t = read();
    expect(t).toContain('```\n## 9. Task Grounding\n### F-B001\nQUOTED\n```');
    expect(parseTrd(t).grounding['F-B001'].touches).toEqual(['a.js']);
  });

  test('a fenced block inside a block file does not end the block', () => {
    fs.writeFileSync(trd, MASTER + TAIL);
    write('blocks-1.md', '### F-B001\n- **Touches:** `a.js`\n- **Careful:** see\n```\n### F-B002\n```\n');
    const r = G.assemble(trd, dir);
    expect(r.blocksFound).toBe(1);
    expect(read()).toContain('### F-B002\n```');
  });

  test('first block for a duplicate id wins; retry file name is read', () => {
    fs.writeFileSync(trd, MASTER + TAIL);
    write('blocks-1.md', block('F-B001', 'first.js'));
    write('blocks-retry.md', block('F-B001', 'second.js') + block('F-B002', 'r.js'));
    G.assemble(trd, dir);
    const t = read();
    expect(t).toContain('first.js');
    expect(t).not.toContain('second.js');
    expect(t).toContain('r.js');
  });
});

describe('trd-grounding assemble: section boundaries', () => {
  test('a nested Master Task List gets a Deferred section at its own level; siblings survive', () => {
    const nested =
      '# TRD: n\n\n## 3. Implementation\n\n### 3.1 Master Task List\n\n' +
      '| Task ID | Description |\n|---|---|\n| F-B001 | one |\n| F-B002 | two |\n\n' +
      '### 3.2 Execution Plan\n\n| Phase | Tasks |\n|---|---|\n| 1 | F-B001, F-B002 |\n\n' + TAIL;
    fs.writeFileSync(trd, nested);
    write('blocks-1.md', block('F-B001', 'a.js'));
    write('sizing.json', JSON.stringify({ deferred: [{ id: 'F-B002', why: 'live' }] }));
    const r = G.assemble(trd, dir);
    expect(r.deferred).toEqual(['F-B002']);
    expect(read()).toContain('### Deferred by design');
    const first = read();
    G.assemble(trd, dir);
    expect(read()).toBe(first);
    expect(read()).toContain('### 3.2 Execution Plan');
  });

  test('a prose heading that merely mentions Task Grounding is not deleted', () => {
    fs.writeFileSync(trd, '## Decision\n\n### Why Task Grounding moves to code\n\nKEEP ME\n\n' + MASTER + TAIL);
    write('blocks-1.md', block('F-B001', 'a.js'));
    G.assemble(trd, dir);
    const t = read();
    expect(t).toContain('### Why Task Grounding moves to code\n\nKEEP ME');
    expect(t.indexOf('## 9. Task Grounding')).toBeGreaterThan(t.indexOf('F-B003 | three'));
  });

  test('nothing to write leaves a CRLF TRD byte-identical', () => {
    const crlf = (MASTER + TAIL).replace(/\n/g, '\r\n');
    fs.writeFileSync(trd, crlf);
    const r = G.assemble(trd, dir);
    expect(r.written).toBe(false);
    expect(read()).toBe(crlf);
  });
});

describe('trd-grounding report', () => {
  test('9: report matches what assemble wrote and does not write', () => {
    fs.writeFileSync(trd, MASTER + TAIL);
    write('blocks-1.md', block('F-B001', 'a.js'));
    write('sizing.json', JSON.stringify({ deferred: [{ id: 'F-B003', why: 'later' }] }));
    const a = G.assemble(trd, dir);
    const before = read();
    const run = spawnSync('node', [CLI, 'report', '--trd', trd], { encoding: 'utf8' });
    expect(run.status).toBe(0);
    const r = JSON.parse(run.stdout);
    expect(r.grounded).toEqual(a.grounded);
    expect(r.ungrounded).toEqual(a.ungrounded);
    expect(r.deferred).toEqual(['F-B003']);
    expect(r).toMatchObject({ written: false, blocksFound: null, sizing: null });
    expect(read()).toBe(before);
  });
});

describe('trd-grounding CLI errors', () => {
  test('an unreadable TRD exits 1; bad usage exits 2', () => {
    let run = spawnSync('node', [CLI, 'report', '--trd', path.join(tmp, 'missing.md')], { encoding: 'utf8' });
    expect(run.status).toBe(1);
    run = spawnSync('node', [CLI, 'assemble', '--trd', trd], { encoding: 'utf8' });
    expect(run.status).toBe(2);
  });
});

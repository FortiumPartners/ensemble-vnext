/**
 * Every fenced bash block in a command file that uses a here-document must parse.
 *
 * WHY THIS EXISTS. plan.md carried `"$(cat <<'"'"'JSON'"'"'` in three blocks. That quoting only
 * works inside an outer single-quoted string; here it is not in one, so the shell reads the
 * delimiter as `"'JSON'"`, the plain `JSON` line never ends the here-document, and the block
 * fails before running anything (bash: "here-document ... delimited by end-of-file"; zsh:
 * "unmatched"). A model following the command either fails or silently rewrites the call, so
 * the defect survived every run. A syntax check (`-n`, nothing executed) catches the class.
 *
 * Run with: npx jest packages/core/commands/command-heredocs.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const COMMANDS_DIR = __dirname;

function bashBlocksWithHeredocs(markdown) {
  const blocks = [];
  const re = /```bash\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(markdown)) !== null) {
    if (/<<-?\s*['"]?\w/.test(m[1])) blocks.push(m[1]);
  }
  return blocks;
}

function hasShell(name) {
  return spawnSync(name, ['-c', 'true']).status === 0;
}

const files = fs.readdirSync(COMMANDS_DIR).filter((f) => f.endsWith('.md'));
const cases = [];
for (const file of files) {
  const blocks = bashBlocksWithHeredocs(fs.readFileSync(path.join(COMMANDS_DIR, file), 'utf8'));
  blocks.forEach((block, i) => cases.push([file, i + 1, block]));
}

describe('here-documents in command bash blocks parse', () => {
  it('finds the plan.md here-document blocks this test was written for', () => {
    expect(cases.filter(([file]) => file === 'plan.md').length).toBeGreaterThanOrEqual(3);
  });

  it.each(cases)('%s block %i parses under bash -n', (file, n, block) => {
    const r = spawnSync('bash', ['-n'], { input: block, encoding: 'utf8' });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });

  const zsh = hasShell('zsh');
  (zsh ? it.each(cases) : it.skip.each(cases))('%s block %i parses under zsh -n', (file, n, block) => {
    const r = spawnSync('zsh', ['-n'], { input: block, encoding: 'utf8' });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });

  it('rejects the broken delimiter form (guards the check itself)', () => {
    const broken = "node -e '\n  1\n' \"$(cat <<'\"'\"'JSON'\"'\"'\n{}\nJSON\n)\"\n";
    const r = spawnSync('bash', ['-n'], { input: broken, encoding: 'utf8' });
    expect(r.status !== 0 || r.stderr !== '').toBe(true);
  });
});

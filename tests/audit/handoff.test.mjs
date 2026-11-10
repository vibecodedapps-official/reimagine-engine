// The handoff format the audit reads and writes: the decided-by table of R139, identical to the loop's, the loop's
// worked example, which the audit's script must read, and the ticket export the loop writes for the audit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const AUDIT = read('../../plugins/audit/skills/audit/handoff.md');
const LOOP = read('../../plugins/loop/skills/run/handoff.md');
const ORIENT = read('../../plugins/audit/skills/audit/stages/1-orient.md');
const LOOP_RECORD = read('../../plugins/loop/skills/run/record.md');

test('R137: the audit looks for the loop\'s record where the loop keeps it, and tells it by the branch in steps.json', () => {
  const path = '`.reimagine/loop/<branch-slug>/`';
  assert.ok(LOOP_RECORD.includes(`The record directory is ${path}`), 'record.md does not put the record there');
  assert.ok(AUDIT.includes(`a loop record under ${path}`), 'the audit does not look there');
  const example = JSON.parse(LOOP_RECORD.split('\n## steps.json\n')[1].split('```json\n')[1].split('\n```')[0]);
  assert.equal(typeof example.branch, 'string');
  assert.ok(AUDIT.includes('branch in its `steps.json` equals the session\'s branch'));
});

// The decided_by table: from its "- `decided_by`" line through the line that bars names.
const decidedByTable = (text) => {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.startsWith('- `decided_by`'));
  if (start === -1) return null;
  const end = lines.findIndex((line, i) => i > start && line.includes('Never a person\'s name'));
  return end === -1 ? null : lines.slice(start, end + 1).join('\n');
};

// The first fenced block under the loop's "## Example" heading: the handoff.md of its worked run.
const loopExample = () => {
  const lines = LOOP.split(/\r?\n/);
  const start = lines.indexOf('```', lines.indexOf('## Example'));
  const end = lines.indexOf('```', start + 1);
  assert.ok(start > 0 && end > start, 'the loop handoff.md has no fenced example');
  return `${lines.slice(start + 1, end).join('\n')}\n`;
};

// Runs the audit's script on a handoff text and returns its exit code and what it printed.
const check = (text) => {
  const dir = mkdtempSync(join(tmpdir(), 'handoff-'));
  try {
    const file = join(dir, 'handoff.md');
    writeFileSync(file, text);
    const r = spawnSync('sh', ['plugins/audit/scripts/handoff.sh', 'check', file.replaceAll('\\', '/')], { cwd: root, encoding: 'utf8' });
    return { status: r.status, out: `${r.stdout}${r.stderr}`.replaceAll(file.replaceAll('\\', '/'), '<file>') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test('R139: the audit handoff carries the decided-by table and maps a run decision to a role', () => {
  const table = decidedByTable(AUDIT);
  assert.notEqual(table, null, 'the audit handoff.md has no decided_by table');
  assert.ok(table.includes('  - run: `role: orchestrator`'));
  assert.ok(AUDIT.indexOf('- `decided_by`') < AUDIT.indexOf('\n## Rules\n'), 'the table is not under the format');
});

test('R139: the decided-by tables of the audit and the loop are identical', () => {
  assert.equal(decidedByTable(AUDIT), decidedByTable(LOOP));
});

test('R137: handoff.sh reads the handoff the loop gives as its example', () => {
  assert.deepEqual(check(loopExample()), { status: 0, out: 'handoff: ok\n' });
});

test('R355: the export the loop writes holds every key the audit requires of a ticket export', () => {
  const rule = ORIENT.slice(ORIENT.indexOf('**Exported forge files.**'), ORIENT.indexOf('**Claims files.**')).replace(/\s+/g, ' ');
  const keys = (sentence) => [...(rule.match(sentence)?.[1] ?? '').matchAll(/`([a-z_]+)`/g)].map((m) => m[1]);
  assert.deepEqual(keys(/A ticket requires (.*?), and may have/), ['id', 'url', 'title', 'state', 'description']);
  assert.deepEqual(keys(/Every file requires (.*?)\./), ['source', 'exported_by', 'exported_at']);
  assert.ok(rule.includes('the text after the frontmatter is the `description`'));
  const written = LOOP.split(/\r?\n/).find((line) => line.startsWith('- An export is '));
  assert.ok(written, 'the loop handoff.md does not say what an export holds');
  for (const key of ['id', 'url', 'title', 'state', 'source', 'exported_by', 'exported_at']) {
    assert.ok(written.includes(`\`${key}\``), `the loop's export lacks ${key}`);
  }
  assert.ok(written.includes('then the description as the text below it'));
});

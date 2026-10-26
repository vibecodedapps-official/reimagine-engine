// The handoff format: the decided-by mapping of R139.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const HANDOFF = read('../../plugins/loop/skills/run/handoff.md');

// The decided_by table: from its "- `decided_by`" line through the line that bars names.
const decidedByTable = (text) => {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.startsWith('- `decided_by`'));
  if (start === -1) return null;
  const end = lines.findIndex((line, i) => i > start && line.includes('Never a person\'s name'));
  return end === -1 ? null : lines.slice(start, end + 1).join('\n');
};

test('R139: the handoff maps the four deciders, and a run decision to a role, never to not recorded', () => {
  const table = decidedByTable(HANDOFF);
  assert.notEqual(table, null, 'handoff.md has no decided_by table');
  assert.ok(table.includes('  - user: `role: session user`'));
  assert.ok(table.includes('  - plan confirmation: `role: session user (plan confirmation)`'));
  assert.ok(table.includes('  - review: `checkpoint (recommended option taken)`'));
  assert.ok(table.includes('  - run: `role: orchestrator`'));
  assert.ok(!table.includes('not recorded'), 'a decider maps to not recorded');
});

test('R139: the decided-by table is identical to the one in the audit handoff', () => {
  const AUDIT = read('../../plugins/audit/skills/audit/handoff.md');
  assert.equal(decidedByTable(HANDOFF), decidedByTable(AUDIT));
});

const README = read('../../plugins/loop/README.md');
const REPORT = read('../../plugins/loop/skills/run/report.md');

// The fenced blocks (``` ... ```) of a text from an offset, each as its body.
const fencedBlocks = (text, from = 0) => {
  const blocks = [];
  let open = null;
  for (const line of text.slice(from).split('\n')) {
    if (line.startsWith('```')) {
      if (open === null) open = [];
      else { blocks.push(open.join('\n')); open = null; }
    } else if (open !== null) open.push(line);
  }
  return blocks;
};

const manifestBlock = () => fencedBlocks(HANDOFF, HANDOFF.indexOf('\n## Manifest\n'))[0];

test('R286: the manifest shape in handoff.md equals the README\'s', () => {
  const inHandoff = manifestBlock();
  const inReadme = fencedBlocks(README).find((block) => block.includes('"reviews"'));
  assert.notEqual(inHandoff, undefined, 'handoff.md has no manifest block');
  assert.notEqual(inReadme, undefined, 'the README has no manifest block');
  assert.equal(inHandoff, inReadme);
});

test('R286: the manifest carries reviews with the level and the three buckets', () => {
  const m = JSON.parse(manifestBlock());
  assert.deepEqual(Object.keys(m), ['bundles', 'claims', 'reviews']);
  assert.deepEqual(m.reviews, {
    level: '<level>',
    fixed: [{ file: '<repository-relative path>', summary: '<one line>' }],
    deferred: [{ file: '<repository-relative path>', summary: '<one line>' }],
    rejected: [{ file: '<repository-relative path>', summary: '<one line>' }],
  });
});

test('R286: the example manifest is valid JSON with a reviews key', () => {
  const at = HANDOFF.indexOf('`audit-manifest.json` (the remote head');
  assert.notEqual(at, -1, 'handoff.md has no example manifest');
  const m = JSON.parse(fencedBlocks(HANDOFF, at)[0]);
  assert.deepEqual(Object.keys(m), ['bundles', 'claims', 'reviews']);
  assert.equal(m.reviews.level, 'high');
});

test('R120, R134: the report header has the Gate line between the Handoff and Audit lines', () => {
  const lines = fencedBlocks(REPORT)[0].split('\n');
  const at = lines.findIndex((line) => line.startsWith('- Handoff:'));
  assert.notEqual(at, -1, 'the template has no Handoff line');
  assert.ok(lines[at + 1].startsWith('- Gate:'), 'the Gate line does not follow the Handoff line');
  assert.ok(lines[at + 2].startsWith('- Audit:'), 'the Audit line does not follow the Gate line');
  assert.equal(lines[at + 1], '- Gate: </gate PR <n> | /gate this branch> (the command needs the gate plugin) | not suggested>');
});

test('R120: the Gate rule suggests the gate at 500 changed lines and the Audit rule follows it', () => {
  const start = REPORT.indexOf('\n## Header\n');
  assert.notEqual(start, -1, 'report.md has no Header section');
  const header = REPORT.slice(start, REPORT.indexOf('\n## ', start + 1));
  for (const phrase of ['`/gate PR <n>`', '`/gate this branch`', '500 or more changed lines',
    'the command needs the gate plugin', '`after the gate`']) {
    assert.ok(header.includes(phrase), `the Header section lacks ${phrase}`);
  }
});

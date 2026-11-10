// The handoff and the manifest the audit reads: the decided-by mapping, the manifest shape, the example, and the report's header lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r/g, '');
const HANDOFF = read('../../plugins/loop/skills/run/handoff.md');
const README = read('../../plugins/loop/README.md');
const REPORT = read('../../plugins/loop/skills/run/report.md');
const PREFLIGHT = read('../../plugins/loop/skills/run/steps/0-preflight.md');

// The text of a "## <heading>" or "### <heading>" section, up to the next heading of either level.
const section = (text, heading, marks = '##') => {
  const start = text.indexOf(`\n${marks} ${heading}\n`);
  assert.notEqual(start, -1, `no ${marks} ${heading}`);
  const end = text.indexOf('\n## ', start + 1);
  const next = marks === '###' ? text.indexOf('\n### ', start + 1) : -1;
  return text.slice(start, [end, next].filter((at) => at !== -1).reduce((a, b) => Math.min(a, b), text.length));
};

// The decided_by table: its "- `decided_by`" line and the indented lines under it.
const decidedByTable = (text) => {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.startsWith('- `decided_by`'));
  if (start === -1) return null;
  let end = start + 1;
  while (end < lines.length && lines[end].startsWith('  ')) end++;
  return lines.slice(start, end).join('\n');
};

// The fenced blocks (``` ... ```) of a text, each as its body.
const fencedBlocks = (text) => {
  const blocks = [];
  let open = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('```')) {
      if (open === null) open = [];
      else { blocks.push(open.join('\n')); open = null; }
    } else if (open !== null) open.push(line);
  }
  return blocks;
};

test('R139: the handoff maps the four deciders to a role or a checkpoint, never to not recorded', () => {
  const table = decidedByTable(HANDOFF);
  assert.notEqual(table, null, 'handoff.md has no decided_by table');
  const pairs = [...table.matchAll(/^ {2}- ([a-z ]+): `([^`]+)`$/gm)].map((m) => [m[1], m[2]]);
  assert.deepEqual(pairs, [
    ['user', 'role: session user'],
    ['plan confirmation', 'role: session user (plan confirmation)'],
    ['review', 'checkpoint (recommended option taken)'],
    ['run', 'role: orchestrator'],
  ]);
});

test('R139: the decided-by table is identical to the one in the audit handoff', () => {
  const AUDIT = read('../../plugins/audit/skills/audit/handoff.md');
  assert.notEqual(decidedByTable(HANDOFF), null);
  assert.equal(decidedByTable(HANDOFF), decidedByTable(AUDIT));
});

// The fenced blocks after a heading. The handoff's own blocks hold "## " lines, so these start at the heading and do not stop at one.
const blocksAfter = (heading) => fencedBlocks(HANDOFF.slice(HANDOFF.indexOf(`\n## ${heading}\n`)));
const [FORMAT] = blocksAfter('Format');
const [MANIFEST] = blocksAfter('Manifest');

test('R286: the manifest shape in handoff.md equals the README\'s', () => {
  const inReadme = fencedBlocks(README).find((block) => block.includes('"reviews"'));
  assert.notEqual(MANIFEST, undefined, 'handoff.md has no manifest block');
  assert.notEqual(inReadme, undefined, 'the README has no manifest block');
  assert.equal(MANIFEST, inReadme);
});

test('R286: the manifest carries reviews with the level and the three buckets', () => {
  const m = JSON.parse(MANIFEST);
  assert.deepEqual(Object.keys(m), ['bundles', 'claims', 'reviews']);
  assert.deepEqual(m.reviews, {
    level: '<level>',
    fixed: [{ file: '<repository-relative path>', summary: '<one line>' }],
    deferred: [{ file: '<repository-relative path>', summary: '<one line>' }],
    rejected: [{ file: '<repository-relative path>', summary: '<one line>' }],
  });
});

const [EXAMPLE_HANDOFF, EXAMPLE_MANIFEST] = blocksAfter('Example');
const EXAMPLE_PARTS = EXAMPLE_HANDOFF.split(/^## /m).slice(1);

test('R286: the example manifest is valid JSON with a reviews key and names the example handoff\'s ticket', () => {
  const m = JSON.parse(EXAMPLE_MANIFEST);
  assert.deepEqual(Object.keys(m), ['bundles', 'claims', 'reviews']);
  assert.deepEqual(Object.keys(m.reviews), ['level', 'fixed', 'deferred', 'rejected']);
  const tickets = [...EXAMPLE_PARTS[1].matchAll(/^### (.+)$/gm)].map((x) => x[1]);
  assert.deepEqual(m.bundles.flatMap((bundle) => bundle.tickets), tickets);
});

// The keys each item of a handoff section has, in order, as the Format part of handoff.md lists them.
const KEYS = {
  Tickets: ['type', 'state', 'iteration', 'owner', 'parent', 'links', 'bundles', 'problem', 'decision', 'commits', 'verified'],
  Decisions: ['ticket', 'decision', 'rationale', 'options', 'decided_by', 'recorded_at', 'status'],
  'Raised tickets': ['ticket', 'type', 'state', 'iteration', 'owner', 'bundles', 'summary', 'rank', 'in_bundle_confidence', 'reason'],
};
const listedKeys = (name) => [...section(HANDOFF, name, '###').matchAll(/^- `([a-z_]+)`[^:\n]*:/gm)].map((m) => m[1]);
const sectionsOf = (text) => [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1]);

test('R139: handoff.md lists each item\'s keys, in order, for Tickets, Decisions and Raised tickets', () => {
  for (const [name, keys] of Object.entries(KEYS)) assert.deepEqual(listedKeys(name), keys, name);
});

test('R139: the example handoff has the frontmatter, the four sections in order, and the keys each section lists', () => {
  const lines = EXAMPLE_HANDOFF.split('\n');
  assert.equal(lines[0], '---');
  assert.equal(lines[1], 'reimagine-handoff: 1');
  assert.match(lines[2], /^generated: \d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  assert.equal(lines[3], '---');
  const names = ['Bundles', 'Tickets', 'Decisions', 'Raised tickets'];
  assert.deepEqual(sectionsOf(EXAMPLE_HANDOFF), names);
  assert.deepEqual(sectionsOf(FORMAT), names);
  assert.match(EXAMPLE_PARTS[0].split('\n')[2], /^- [a-z0-9._-]+: repo \/\S+; pr (?:github:\S+#\d+|none); branch \S+; base \S+\/\S+$/);
  for (const [i, name] of names.slice(1).entries()) {
    const items = EXAMPLE_PARTS[i + 1].split(/^### /m).slice(1);
    assert.equal(items.length, 1, `${name} has no example item`);
    assert.deepEqual([...items[0].matchAll(/^- ([a-z_]+):/gm)].map((m) => m[1]), KEYS[name], name);
  }
  const decidedBy = EXAMPLE_HANDOFF.match(/^- decided_by: (.+)$/m)[1];
  assert.ok(decidedByTable(HANDOFF).includes(`\`${decidedBy}\``), `the example decided_by ${decidedBy} is not one the table maps`);
});

test('R120, R134: the report header lines run in the template\'s order, the Gate line between Handoff and Audit', () => {
  const header = fencedBlocks(REPORT)[0].split('\n\n')[1].split('\n').map((line) => line.match(/^- ([A-Za-z -]+):/)[1]);
  assert.deepEqual(header, [
    'Run number', 'Branch', 'Record', 'Terminal state', 'Host', 'Run budget', 'Base commit', 'Merge-base', 'Worktree', 'Repositories',
    'Pull request', 'CI state', 'Handoff', 'Gate', 'Audit',
  ]);
});

test('R120: the report offers the gate and the audit by the commands those plugins answer to', () => {
  const header = fencedBlocks(REPORT)[0];
  for (const command of ['/gate PR <n>', '/gate this branch', '/audit:run "<absolute path of audit-manifest.json>"']) {
    assert.ok(header.includes(command), `the report template lacks ${command}`);
  }
});

test('R120: the changed-line count that suggests the gate is the README\'s', () => {
  const count = (text) => text.match(/(\d+) or more changed lines/)?.[1];
  assert.equal(count(section(REPORT, 'Header')), '500');
  assert.equal(count(README), '500');
});

test('R281: the handoff and the manifest name the primary by the checkout Step 0 defines', () => {
  assert.ok(section(PREFLIGHT, 'Primary checkout').includes('`<checkout>`'), 'Step 0, Primary checkout, does not define <checkout>');
  for (const name of ['Bundles', 'Manifest']) {
    const text = section(HANDOFF, name, name === 'Bundles' ? '###' : '##');
    assert.ok(text.includes('`<checkout>`'), `${name} does not tie the primary's repo to <checkout>`);
  }
});

test('R137: a raised ticket is deferred as in_bundle_confidence defer, and a filed GitHub ticket is read with gh issue view', () => {
  const raised = section(HANDOFF, 'Raised tickets', '###');
  assert.ok(raised.includes('- `in_bundle_confidence`: `defer`'));
  assert.equal(EXAMPLE_PARTS[3].match(/^- in_bundle_confidence: (.+)$/m)[1], 'defer');
  assert.ok(raised.includes('`gh issue view <n> -R <owner>/<repo> --json state,milestone,assignees,labels`'));
});

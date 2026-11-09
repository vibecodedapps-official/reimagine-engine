// What leaves an audit run is written for its reader (R349, R194): SKILL.md pins two items of the house rules, and the
// files that govern a post or a drafted text carry the rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadTexts, units } from '../../plugins/rules/scripts/rules.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (path) => readFileSync(root + path, 'latin1').replace(/\r\n/g, '\n');
const flat = (path) => read(path).replace(/\s+/g, ' ');

const SKILL = 'plugins/audit/skills/audit/SKILL.md';
const DIR = 'plugins/audit/skills/audit/';

const ITEM_A =
  'What leaves the session is written for its reader, not for the work that made it. Run output, such as verdicts, pass lists, levels, commit ids, manifests, logs and handoff context, is for an agent or a later session: it stays in the local run folder or a record attached to a ticket, and outside the session that record is the only place a term a plugin or session coined may appear. A pull request carries only what its reviewer needs about the code in it, as technical as the code needs, in the team\'s words, true of the head it describes and replaced when a push makes it stale. A ticket tells its readers what changed for them, what happens next and who decides, never how it was reached or with what tools; technical detail that must travel with it goes in an attached record, not in its body or a comment.';
const ITEM_B =
  'Output stays local unless publishing is the task\'s stated purpose or I asked for it. Before any post, check that its reader will act on it and that it holds nothing they would not say themselves.';

const section = (text) => {
  const lines = text.split('\n');
  const start = lines.indexOf('## What leaves the run');
  assert.notEqual(start, -1, 'SKILL.md has no "## What leaves the run" heading');
  const end = lines.findIndex((line, i) => i > start && line.startsWith('## '));
  return lines.slice(start + 1, end === -1 ? undefined : end);
};

for (const [name, prefix, literal] of [
  ['item A', 'What leaves the session is written for its reader', ITEM_A],
  ['item B', 'Output stays local unless publishing', ITEM_B],
]) {
  test(`R349: SKILL.md carries core.md ${name} word for word under What leaves the run`, () => {
    const found = units(loadTexts()['core.md']).list.filter((u) => u.kind === 'item' && u.norm.startsWith(prefix));
    assert.equal(found.length, 1, `core.md has ${found.length} items that start "${prefix}"`);
    assert.equal(found[0].norm, literal);
    assert.ok(section(read(SKILL)).includes('- ' + found[0].norm), `SKILL.md lacks the line for ${name}`);
  });
}

const POST =
  'written for its reader as `SKILL.md`, What leaves the run, says: on a ticket, what changed for its readers, what happens next and who decides; on a pull request, what its reviewer needs about the code; never an audit id (`C<n>`, `claim <n>`, `W<n>`), a stage, a verdict or another term the audit coined, and never a model, agent or tool';
const POINTER = 'written for its reader as `SKILL.md`, What leaves the run, says';

for (const file of ['stages/9-act.md', 'common.md', 'report.md']) {
  test(`R194: ${file} holds the reader rule for a post or a drafted text`, () => {
    assert.ok(flat(DIR + file).includes(POST), `${file} lacks the reader rule`);
  });
}

for (const file of ['stages/8-report.md', 'work-items.md']) {
  test(`R194: ${file} points drafted text at What leaves the run`, () => {
    assert.ok(flat(DIR + file).includes(POINTER), `${file} lacks the pointer`);
  });
}

test('R194: act keeps the evidence and the item ids in the run directory', () => {
  assert.ok(flat(DIR + 'stages/9-act.md').includes('The evidence and the item ids stay in the run directory.'));
});

test('R194: the naming rule in SKILL.md points at What leaves the run and keeps the host trailer', () => {
  const text = flat(SKILL);
  assert.ok(text.includes('What leaves the run'));
  assert.ok(text.includes("trailer the host's attribution setting adds to a commit stays, even where it names a model or tool"));
});

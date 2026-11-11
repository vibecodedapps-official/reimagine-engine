// What leaves an audit run is written for its reader (R194): the files that govern a post or a drafted text carry the rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (path) => readFileSync(root + path, 'latin1').replace(/\r\n/g, '\n');
const flat = (path) => read(path).replace(/\s+/g, ' ');

const SKILL = 'plugins/audit/skills/audit/SKILL.md';
const DIR = 'plugins/audit/skills/audit/';

const POST =
  'written for its reader as `SKILL.md`, What leaves the run, says: on a ticket, what changed for its readers, what happens next and who decides; on a pull request, what its reviewer needs about the code; never an audit id (`C<n>`, `claim <n>`, `W<n>`), a stage, a verdict or another term the audit coined, and never a model, agent or tool';
const POINTER = 'written for its reader as `SKILL.md`, What leaves the run, says';

for (const file of ['common.md']) {
  test(`R194: ${file} holds the reader rule for a post or a drafted text`, () => {
    assert.ok(flat(DIR + file).includes(POST), `${file} lacks the reader rule`);
  });
}

for (const file of ['work-items.md']) {
  test(`R194: ${file} points drafted text at What leaves the run`, () => {
    assert.ok(flat(DIR + file).includes(POINTER), `${file} lacks the pointer`);
  });
}

test('R194: act keeps the evidence and the item ids in the run directory', () => {
  assert.ok(flat(DIR + 'stages/9-act.md').includes('The evidence and the item ids stay in the run directory.'));
});

test('R194: the naming rule in SKILL.md points at What leaves the run and keeps the host trailer', () => {
  const lines = read(SKILL).split('\n');
  for (const start of ['3. Nothing external names a model, an agent or a tool']) {
    const line = lines.find((l) => l.startsWith(start));
    assert.ok(line, `SKILL.md has no line that starts "${start}"`);
    assert.ok(line.includes('as What leaves the run says'), `the line that starts "${start}" lacks the pointer`);
  }
  const text = flat(SKILL);
  assert.ok(text.includes("trailer the host's attribution setting adds to a commit stays, even where it names a model or tool"));
});

const COINED =
  'no model, agent or tool and no term the audit or a run coined, such as an item id (`C<n>`, `claim <n>`, `W<n>`), a stage or a verdict; where';

for (const [file, body] of [
  ['stages/9-act.md', 'its body speaks of an item, it names the item by what it fixes'],
]) {
  test(`R194: ${file} bars coined terms from act's commit messages and names each item by what it fixes`, () => {
    const text = flat(DIR + file);
    assert.ok(text.includes(COINED + ' ' + body), `${file} lacks the commit message rule`);
  });
}

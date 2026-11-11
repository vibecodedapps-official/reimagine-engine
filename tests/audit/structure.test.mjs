// What holds the audit's text files together: every place one of them cites in another exists there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const ROOT = new URL('../../plugins/audit/', import.meta.url);
const list = (dir) => readdirSync(new URL(dir, ROOT)).filter((name) => name.endsWith('.md')).map((name) => dir + name);
// A citation names a skill, stage or agent file by its base name. Two command files share a name with a skill file, and
// no file cites a command file.
const TARGETS = [...list('skills/audit/'), ...list('skills/audit/stages/'), ...list('agents/')];
const FILES = [...TARGETS, ...list('commands/')];
const TEXT = Object.fromEntries(FILES.map((file) => [file, readFileSync(new URL(file, ROOT), 'utf8').replace(/\r/g, '')]));
const BY_BASE = Object.fromEntries(TARGETS.map((file) => [file.split('/').pop(), file]));
const plain = (text) => text.replace(/[`"]/g, '');

// The names a file can be cited by: its headings, and the bold labels that open a paragraph, a step or a list item.
const names = (file) => [
  ...[...TEXT[file].matchAll(/^#{1,4} (.+)$/gm)].map((m) => plain(m[1])),
  ...[...TEXT[file].matchAll(/^\s*(?:(?:\d+|[a-z])\. |- )?\*\*([^*]+?)\.?\*\*/gm)].map((m) => plain(m[1])),
];
// The numbered steps a file has at the start of a line.
const steps = (file) => new Set([...TEXT[file].matchAll(/^(\d+)\. /gm)].map((m) => m[1]));

// Whether the words after a citation of a file begin with a heading, a label or a step of it.
const resolves = (file, words) => {
  const step = words.match(/^steps? (\d+)/);
  if (step) return steps(file).has(step[1]);
  const section = words.replace(/^section #+ /, '');
  return names(file).some((name) => section.startsWith(name));
};

// Each `<file>.md, <words>` of a file whose words open as a citation does: a quote, a capital, "step <n>" or
// "section #". A file name there is the next item of a list of files, not a place in the first.
const citations = (text) =>
  [...text.replace(/\s+/g, ' ').matchAll(/([A-Za-z0-9-]+\.md)`?, \(?(?=((?:"|[A-Z]|steps? \d|section #)[^]{0,80}))/g)]
    .map((m) => [m[1], plain(m[2])])
    .filter(([name, words]) => BY_BASE[name] && !/^[\w./-]+\.(?:md|json|jsonl|sh|txt)\b/.test(words));

test('the citation check tells a place that exists from one that does not', () => {
  const found = citations('as `common.md`, "Hard rules" says, and (SKILL.md, Soft\n   budget); see `8-report.md`, step 2, and `common.md`, SKILL.md and `report.md`, no such place.');
  assert.deepEqual(
    found.map(([name, words]) => [name, words.slice(0, 11)]),
    [
      ['common.md', 'Hard rules '],
      ['SKILL.md', 'Soft budget'],
      ['8-report.md', 'step 2, and'],
    ],
  );
  assert.equal(resolves(BY_BASE['common.md'], 'Hard rules says'), true);
  assert.equal(resolves(BY_BASE['common.md'], 'Soft rules says'), false);
  assert.equal(resolves(BY_BASE['8-report.md'], 'step 2, and'), true);
  assert.equal(resolves(BY_BASE['8-report.md'], 'step 99'), false);
});

test('every place an audit file cites in another audit file exists there', () => {
  let cited = 0;
  for (const file of FILES) {
    for (const [name, words] of citations(TEXT[file])) {
      cited++;
      assert.ok(resolves(BY_BASE[name], words), `${file} cites ${name}, "${words.slice(0, 40)}", and ${BY_BASE[name]} has no such heading, label or step`);
    }
  }
  assert.ok(cited >= 70, `only ${cited} citations found`);
});

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
const numbered = (text) => new Set([...text.matchAll(/^(\d+)\. /gm)].map((m) => m[1]));
// The numbered steps a file has at the start of a line.
const steps = (file) => numbered(TEXT[file]);
// The numbered rules under a file's "Hard rules" heading, up to the next heading.
const hardRules = (file) => numbered(TEXT[file].match(/^#{2,3} Hard rules\n([^]*?)(?=^#)/m)?.[1] ?? '');

// Whether the words after a citation of a file begin with a heading, a label, a step or a hard rule of it.
const resolves = (file, words) => {
  const step = words.match(/^steps? (\d+)/);
  if (step) return steps(file).has(step[1]);
  const rule = words.match(/^hard rule (\d+)/);
  if (rule) return hardRules(file).has(rule[1]);
  const section = words.replace(/^section #+ /, '');
  return names(file).some((name) => section.startsWith(name));
};

// Each `<file>.md, <words>` of a file whose words open as a citation does: a quote, a capital, "step <n>" or
// "section #"; and each `<file>.md hard rule <n>`, with or without the comma. A file name there is the next item of
// a list of files, not a place in the first.
const citations = (text) =>
  [...text.replace(/\s+/g, ' ').matchAll(/([A-Za-z0-9-]+\.md)`?(?:, \(?(?=((?:"|[A-Z]|steps? \d|section #|hard rule \d)[^]{0,80}))| (?=(hard rule \d[^]{0,80})))/g)]
    .map((m) => [m[1], plain(m[2] ?? m[3])])
    .filter(([name, words]) => BY_BASE[name] && !/^[\w./-]+\.(?:md|json|jsonl|sh|txt)\b/.test(words));

test('the citation check tells a place that exists from one that does not', () => {
  const found = citations('as `common.md`, "Hard rules" says, and (SKILL.md, Soft\n   budget); see `8-report.md`, step 2, and `common.md`, SKILL.md and `report.md`, no such place; the commands of `common.md` hard\n   rule 2.');
  assert.deepEqual(
    found.map(([name, words]) => [name, words.slice(0, 11)]),
    [
      ['common.md', 'Hard rules '],
      ['SKILL.md', 'Soft budget'],
      ['8-report.md', 'step 2, and'],
      ['common.md', 'hard rule 2'],
    ],
  );
  assert.equal(resolves(BY_BASE['common.md'], 'hard rule 2.'), true);
  assert.equal(resolves(BY_BASE['common.md'], 'hard rule 99'), false);
  assert.equal(resolves(BY_BASE['report.md'], 'hard rule 2'), false);
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

test('each agent that has a shell names the command list of common.md hard rule 2 before its steps', () => {
  const shells = [];
  for (const file of list('agents/')) {
    const [, front, body] = TEXT[file].match(/^---\n([^]*?)\n---\n([^]*)$/);
    if (!/^ +- Bash$/m.test(front)) continue;
    shells.push(file);
    const steps = body.search(/\n## Steps\b/);
    assert.ok(steps > 0, `${file} has no "Steps" heading`);
    assert.ok(
      citations(body.slice(0, steps)).some(([name, words]) => name === 'common.md' && /^hard rule 2\b/.test(words)),
      `${file} does not name common.md hard rule 2 before its steps`,
    );
  }
  assert.deepEqual(shells, ['agents/adversary.md', 'agents/auditor.md', 'agents/digester.md', 'agents/mapper.md']);
});

// The host keeps only the start of a skill's text across a compaction: about 19,800 characters of a probe skill.
test('compaction recovery sits early in SKILL.md and has the session read SKILL.md again', () => {
  const body = TEXT['skills/audit/SKILL.md'].replace(/^---\n[^]*?\n---\n/, '');
  const start = body.indexOf('\n### Compaction recovery\n');
  const end = body.indexOf('\n#', start + 1);
  assert.ok(start > 0, 'SKILL.md has no "Compaction recovery" section');
  assert.ok(end < 15000, `"Compaction recovery" ends ${end} characters into SKILL.md, past what a compaction is sure to keep`);
  assert.ok(body.slice(start, end).includes('/SKILL.md`'),'"Compaction recovery" does not name SKILL.md among what is read again');
});

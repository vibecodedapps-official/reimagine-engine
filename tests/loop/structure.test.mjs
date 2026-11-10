// What holds the loop's skill files together: the places they cite in each other, the steps and record files they
// name, the terminal states, and the report's sections.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const DIR = new URL('../../plugins/loop/skills/run/', import.meta.url);
const FILES = [
  ...readdirSync(DIR).filter((name) => name.endsWith('.md')),
  ...readdirSync(new URL('steps/', DIR)).filter((name) => name.endsWith('.md')).map((name) => `steps/${name}`),
];
const TEXT = Object.fromEntries(FILES.map((file) => [file, readFileSync(new URL(file, DIR), 'utf8').replace(/\r/g, '')]));
const base = (file) => file.split('/').pop();
const BY_BASE = Object.fromEntries(FILES.map((file) => [base(file), file]));
const FILE = '`?((?:steps/)?[A-Za-z0-9-]+\\.md)`?';

// The names a file can be cited by: its headings and the bold labels that open a paragraph.
const names = (file) => [
  ...[...TEXT[file].matchAll(/^#{2,3} (.+)$/gm)].map((m) => m[1]),
  ...[...TEXT[file].matchAll(/^\*\*([^*]+?)\.?\*\*/gm)].map((m) => m[1]),
];
// The step and item ids a file defines at the start of a line: "## 7.2 Push", "## Step 3.6 Plan", "**6.3 Pass rule.**",
// "1.5 Mark each", "3. **6.3 Pass rule.**".
const ids = (file) => new Set([...TEXT[file].matchAll(/^(?:#{2,3} |\*\*|\d+\. \*\*)?(?:Steps? )?(\d(?:\.\d+)*[a-z]?)[ .:]/gm)].map((m) => m[1]));
const ALL_IDS = new Set(FILES.flatMap((file) => [...ids(file)]));

// Whether the words after a citation of a file begin with one of its names or ids.
const resolves = (file, words) => {
  const plain = words.replace(/^Steps? /, '');
  if (names(file).some((name) => words.startsWith(name) || words.startsWith(name.replace(/^(?:Step )?\d[\d.]*[a-z]? /, '')))) return true;
  const id = plain.match(/^\d(?:\.\d+)*[a-z]?/)?.[0];
  return id !== undefined && ids(file).has(id);
};

test('every place a skill file cites in a skill file exists there', () => {
  let cited = 0;
  for (const file of FILES) {
    const after = [...TEXT[file].matchAll(new RegExp(`${FILE},[ \\n]([A-Z0-9][^\\n]{0,80})`, 'g'))].map((m) => [m[1], m[2]]);
    const before = [...TEXT[file].matchAll(new RegExp(`(?:Return to|goes to) ([A-Z][^\\n]*?) in ${FILE}`, 'g'))].map((m) => [m[2], m[1]]);
    for (const [name, words] of [...after, ...before]) {
      const target = BY_BASE[base(name)];
      if (!target) continue;
      cited++;
      assert.ok(resolves(target, words), `${file} cites ${name}, "${words.slice(0, 40)}", and ${target} has no such heading, label or step`);
    }
  }
  assert.ok(cited >= 60, `only ${cited} citations found`);
});

test('every step and item a skill file names is defined in one of them', () => {
  let named = 0;
  for (const file of FILES) {
    for (const [, id] of TEXT[file].matchAll(/(?<![\w.<-])(\d\.\d+(?:\.\d+)?[a-z]?)(?![\w>]|\.\d)/g)) {
      named++;
      const item = id.match(/^(\d\.\d+)\.(\d+)$/);
      const section = item && FILES.map((f) => TEXT[f].match(new RegExp(`^## ${item[1].replace('.', '\\.')} [^\\n]*\\n([^]*?)(?=^## |$(?![^]))`, 'm'))?.[1]).find(Boolean);
      const isItem = Boolean(section) && new RegExp(`^${item[2]}\\. `, 'm').test(section);
      assert.ok(ALL_IDS.has(id) || isItem, `${file} names ${id}, which no skill file defines`);
    }
  }
  assert.ok(named >= 150, `only ${named} step references found`);
});

const ROWS = TEXT['record.md'].split('\n').filter((line) => line.startsWith('| `')).flatMap((line) => [...line.split('|')[1].matchAll(/`([^`]+)`/g)].map((m) => m[1]));

test('every file a skill file tells the run to read is a skill file or a file of the record', () => {
  let reads = 0;
  for (const file of FILES) {
    for (const [, name] of TEXT[file].matchAll(/\b[Rr]ead(?:s|ing)? `((?:steps\/)?[A-Za-z0-9<>-]+\.md)`/g)) {
      reads++;
      assert.ok(BY_BASE[base(name)] || ROWS.includes(name), `${file} reads ${name}, which is neither`);
    }
  }
  assert.ok(reads >= 25, `only ${reads} reads found`);
});

test('every record file a skill file names is a row of record.md, Files, and every row is named outside it', () => {
  assert.deepEqual(ROWS.slice(0, 5), ['inputs.md', 'plan.md', 'run.md', 'steps.json', 'report.md']);
  // A per-run copy takes "-run<n>" before its extension. "*" in a name and "<slug>" in a row stand for the part that varies.
  const pattern = (name, hole, part) => new RegExp(`^${name.split(hole).map((piece) => piece.replace(/[.<>]/g, '\\$&')).join(part)}$`);
  const row = (name) => {
    const plain = name.replace(/-run(?:<n>|\d+)(?=\.)/, '');
    return ROWS.some((r) => r === plain || pattern(plain, '*', '.*').test(r) || pattern(r, /<[a-z-]+>/, '[^.]+').test(plain));
  };
  const outside = FILES.map((file) => (file === 'record.md' ? TEXT[file].split('\n').filter((line) => !line.startsWith('| `')).join('\n') : TEXT[file])).join('\n');
  for (const [, name] of outside.matchAll(/`((?:pre|post|diff|pr-body|comment|ticket|record|item|text|export)-[^`\s/]*\.(?:md|patch|status|hashes))`/g)) {
    assert.ok(row(name), `${name} is named in the skill and is not a row of record.md, Files`);
  }
  for (const name of ROWS) {
    assert.ok(outside.includes(name) || outside.includes(name.replace(/-<[a-z-]+>/, '')), `the row ${name} of record.md, Files, is named nowhere else`);
  }
});

test('the terminal states are five, and a run ends in no other', () => {
  const list = TEXT['SKILL.md'].split('\n## Terminal states\n')[1].split('\n## ')[0];
  const states = [...list.matchAll(/^- `([a-z-]+)`:/gm)].map((m) => m[1]);
  assert.deepEqual(states, ['done', 'plan-only', 'prepared', 'blocked', 'stopped']);
  let ends = 0;
  for (const file of FILES) {
    for (const [, state] of TEXT[file].matchAll(/\b(?:ends?|ended|ending)(?: the run| preflight)? `([a-z-]+)`/g)) {
      ends++;
      assert.ok(states.includes(state), `${file} ends a run \`${state}\`, which is not a terminal state`);
    }
  }
  assert.ok(ends >= 60, `only ${ends} endings found`);
});

test('the report template and report.md, Sections, name the same sections in the same order', () => {
  const report = TEXT['report.md'];
  const template = report.split('\n## Template\n')[1].split('\n```\n')[1];
  const sections = report.split('\n## Sections\n')[1].split('\n## ')[0];
  const headings = (text, marks) => [...text.matchAll(new RegExp(`^${marks} (.+)$`, 'gm'))].map((m) => m[1]);
  assert.deepEqual(headings(template, '##'), [
    'Attended or unattended', 'Risk', 'What changed', 'Decisions', 'Findings rejected and why', 'Checks', 'Open items',
    'Decisions for you', 'Blocked, stopped or prepared', 'Log',
  ]);
  assert.deepEqual(headings(sections, '###'), headings(template, '##'));
});

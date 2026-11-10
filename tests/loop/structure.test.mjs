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

// The text of the section a citation names: by its heading, or by the step id that opens the heading.
const sections = (name) => FILES.flatMap((file) => {
  const lines = TEXT[file].split('\n');
  const at = lines.findIndex((line) => /^#{2,3} /.test(line) && (line.replace(/^#+ /, '') === name || line.replace(/^#+ (?:Step )?/, '').startsWith(`${name} `)));
  if (at < 0) return [];
  const level = lines[at].match(/^#+/)[0].length;
  const end = lines.findIndex((line, i) => i > at && /^#{2,3} /.test(line) && line.match(/^#+/)[0].length <= level);
  return [lines.slice(at + 1, end < 0 ? undefined : end).join('\n')];
});

test('every item a skill file cites by number is an item of the section it names', () => {
  let cited = 0;
  for (const file of FILES) {
    for (const [, before, first, second] of TEXT[file].matchAll(/([A-Za-z0-9.' ]+), items? (\d+)(?: (?:and|to) (\d+))?/g)) {
      // The section's name is the end of the words before ", item": try each suffix, longest first.
      const words = before.trim().split(' ');
      const found = words.map((_, i) => sections(words.slice(i).join(' '))).find((list) => list.length > 0);
      if (!found) continue;
      cited++;
      for (const n of [first, second].filter(Boolean)) {
        assert.ok(found.some((text) => new RegExp(`^${n}\\. `, 'm').test(text)), `${file} cites "${before.trim()}, item ${n}", and that section has no item ${n}`);
      }
    }
  }
  assert.ok(cited >= 15, `only ${cited} item citations found`);
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
  const literal = (piece) => piece.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
  const pattern = (name, hole, part) => new RegExp(`^${name.split(hole).map(literal).join(part)}$`);
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

test('every configuration key path a skill file names exists in the configuration block', () => {
  const block = JSON.parse(TEXT['SKILL.md'].split('\n## Configuration\n')[1].split('```json\n')[1].split('\n```')[0]);
  let named = 0;
  for (const file of FILES) {
    for (const [, path] of TEXT[file].matchAll(/`((?:commit|checks|timeouts|models|base)(?:\.[a-z-]+)+)`/g)) {
      named++;
      const value = path.split('.').reduce((node, key) => (node && Object.hasOwn(node, key) ? node[key] : undefined), block);
      assert.notEqual(value, undefined, `${file} names ${path}, which the configuration block lacks`);
    }
  }
  assert.ok(named >= 5, `only ${named} key paths found`);
});

test('the effort words are mapped to an effort in one file', () => {
  assert.deepEqual(FILES.filter((file) => TEXT[file].includes('"very thorough"')), ['SKILL.md']);
});

test('the redaction markers are named in one file', () => {
  for (const marker of ['<redacted: aws_access_key>', '<redacted: pem_key>', '<redacted: block>']) {
    assert.deepEqual(FILES.filter((file) => TEXT[file].includes(marker)), ['SKILL.md'], marker);
  }
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

test('SKILL.md, Supporting files, reads each file at the step that file\'s own opening names first', () => {
  const list = TEXT['SKILL.md'].split('\n## Supporting files\n')[1];
  const steps = (text) => [...text.matchAll(/Steps? (\d(?:\.\d+)?)/g)].map((m) => m[1]);
  let compared = 0;
  for (const [, file, point] of list.matchAll(/^- `([^`]+)`: (.+)$/gm)) {
    const [first] = steps(TEXT[file].split('\n')[2]);
    if (first === undefined || steps(point).length === 0) continue;
    compared++;
    assert.ok(steps(point).includes(first), `Supporting files reads ${file} at ${steps(point).join(', ')}, and the file's opening names Step ${first} first`);
  }
  assert.ok(compared >= 8, `only ${compared} read points compared`);
});

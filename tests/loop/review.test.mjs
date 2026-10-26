// The final review role, the Step 5 level and the retired higher-risk rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const LOOP = new URL('../../plugins/loop/', import.meta.url);
const DIR = new URL('skills/run/', LOOP);
const read = (path) => readFileSync(new URL(path, DIR), 'utf8');
const SKILL = read('SKILL.md');
const RISK = read('risk.md');
const PLAN = read('steps/1-plan.md');
const README = readFileSync(new URL('README.md', LOOP), 'utf8');

// The text of a "## <heading>" section, up to the next "## " heading.
const section = (text, heading) => {
  const start = text.indexOf(`\n## ${heading}\n`);
  if (start === -1) return null;
  const end = text.indexOf('\n## ', start + 1);
  return end === -1 ? text.slice(start) : text.slice(start, end);
};

// Every file under a directory, as a path relative to it.
const walk = (dir, prefix = '') => readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? walk(new URL(`${entry.name}/`, dir), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]);

test('R285: risk.md maps the effort in force to the Agent effort and the code-review level', () => {
  const text = section(RISK, 'Step 5 level');
  assert.notEqual(text, null, 'risk.md has no Step 5 level section');
  const rows = text.split('\n').filter((line) => line.startsWith('| ')).slice(1)
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));
  assert.deepEqual(rows, [
    ['no effort word', 'none', '`high`'],
    ['`low`', '`low`', '`low`'],
    ['`medium`', '`medium`', '`medium`'],
    ['`high`', '`high`', '`high`'],
    ['`xhigh`', '`xhigh`', '`xhigh`'],
    ['`max`', '`max`', '`xhigh`'],
  ]);
});

test('R285: risk.md caps the code-review level at xhigh', () => {
  assert.ok(RISK.includes('The `code-review` level is never above `xhigh`: the word "max" gives `xhigh` to the skill while Agent calls keep `max`, and `ultra` is never typed.'));
});

test('R285: SKILL.md caps the code-review level at xhigh', () => {
  assert.ok(SKILL.includes('The `code-review` level is never above `xhigh`: "max" gives `xhigh` there while Agent calls keep `max`'));
});

test('R285: the README says the final review is never above xhigh', () => {
  assert.ok(README.includes('never above `xhigh`'));
});

test('R70 retired: the files of the role and level work item do not name a higher-risk rule', () => {
  const files = { 'SKILL.md': SKILL, 'risk.md': RISK, 'steps/1-plan.md': PLAN, 'multi-repo.md': read('multi-repo.md'), 'worktree.md': read('worktree.md'), 'README.md': README };
  for (const [name, text] of Object.entries(files)) {
    assert.ok(!/higher-risk/i.test(text), `${name} still mentions the higher-risk rule`);
  }
});

test('R63: no shipped loop file continues the stand-in across rounds', () => {
  for (const file of walk(LOOP)) {
    const text = readFileSync(new URL(file, LOOP), 'utf8');
    for (const phrase of ['SendMessage across rounds', 'SendMessage in the later rounds']) {
      assert.ok(!text.includes(phrase), `${file} contains "${phrase}"`);
    }
  }
});

test('R63: SendMessage continues an implementer only', () => {
  const text = section(SKILL, 'Tools');
  assert.notEqual(text, null);
  assert.ok(text.split('\n').includes('- SendMessage: continue an implementer.'));
});

test('R62, R63: the roles table has a plan reviewer row and a code-review final reviewer row', () => {
  const text = section(SKILL, 'Roles and models');
  assert.notEqual(text, null);
  const rows = text.split('\n').filter((line) => line.startsWith('| '));
  const starting = (prefix) => rows.filter((row) => row.startsWith(prefix));
  assert.equal(starting('| plan reviewer |').length, 1);
  assert.equal(starting('| final reviewer |').length, 1);
  assert.equal(starting('| plan reviewer, final reviewer |').length, 0);
  assert.equal(starting('| higher-risk final reviewer |').length, 0);
  const final = starting('| final reviewer |')[0];
  assert.ok(final.includes('`code-review`'));
  assert.ok(final.includes('at most `xhigh`'));
});

test('R62: Step 5 sends the reviewer request only to the opus stand-in', () => {
  assert.ok(PLAN.includes('Step 5 sends it only to the `opus` stand-in'));
});

test('R285: SKILL.md names risk.md for the floor alone', () => {
  const text = section(SKILL, 'Supporting files');
  assert.notEqual(text, null);
  assert.ok(text.split('\n').includes('- `risk.md`: at Step 1.6, and whenever the floor is judged.'));
});

// The final review: the roles table, the Step 5 level, the risk floor and the items and buckets of Step 5.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const DIR = new URL('../../plugins/loop/skills/run/', import.meta.url);
const read = (path) => readFileSync(new URL(path, DIR), 'utf8').replace(/\r/g, '');
const SKILL = read('SKILL.md');
const RISK = read('risk.md');
const BUILD = read('steps/4-build.md');

// The text of a "## <heading>" section, up to the next "## " heading.
const section = (text, heading) => {
  const start = text.indexOf(`\n## ${heading}\n`);
  assert.notEqual(start, -1, `no ## ${heading}`);
  const end = text.indexOf('\n## ', start + 1);
  return end === -1 ? text.slice(start) : text.slice(start, end);
};

// The body rows of the table in a text, each as its trimmed cells.
const rows = (text) => text.split('\n').filter((line) => line.startsWith('| ')).slice(1)
  .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));

test('R285: risk.md maps the effort in force to the Agent effort and the code-review level', () => {
  assert.deepEqual(rows(section(RISK, 'Step 5 level')), [
    ['no effort word', 'none', '`high`'],
    ['`low`', '`low`', '`low`'],
    ['`medium`', '`medium`', '`medium`'],
    ['`high`', '`high`', '`high`'],
    ['`xhigh`', '`xhigh`', '`xhigh`'],
    ['`max`', '`max`', '`xhigh`'],
  ]);
});

test('R285: risk.md says ultra is never typed', () => {
  assert.ok(section(RISK, 'Step 5 level').includes('`ultra` is never typed'));
});

test('R285: Supporting files reads risk.md first at the step its opening names', () => {
  const entry = section(SKILL, 'Supporting files').split('\n').find((line) => line.startsWith('- `risk.md`: '));
  assert.notEqual(entry, undefined, 'Supporting files has no risk.md entry');
  const opening = RISK.split('\n\n')[1];
  const first = (text) => text.match(/Step \d(?:\.\d+)*/)?.[0];
  assert.equal(first(entry), 'Step 1.6');
  assert.equal(first(opening), 'Step 1.6');
});

test('R62, R63: the roles table has one row per role, in order, each with its default model or skill', () => {
  assert.deepEqual(rows(section(SKILL, 'Roles and models')).map(([role, who]) => [role, who.match(/`([^`]+)`/)?.[1] ?? null]), [
    ['orchestrator, judge, slice reviewer', null],
    ['implementer', 'sonnet'],
    ['plan reviewer', 'opus'],
    ['final reviewer', 'code-review'],
    ['reader', 'haiku'],
  ]);
});

test('R63: the final reviewer row names --comment and --fix after "never"', () => {
  const final = rows(section(SKILL, 'Roles and models')).find(([role]) => role === 'final reviewer');
  assert.notEqual(final, undefined, 'the roles table has no final reviewer row');
  const at = final[1].indexOf('never');
  assert.notEqual(at, -1, 'the final reviewer row says no "never"');
  for (const flag of ['`--comment`', '`--fix`']) assert.ok(final[1].indexOf(flag) > at, `${flag} is not named after "never"`);
});

test('R63, R67: the Tools list names the host tools a run calls', () => {
  const tools = [...section(SKILL, 'Tools').matchAll(/^- ([A-Za-z, ]+?):/gm)].map((m) => m[1]);
  assert.deepEqual(tools, ['Bash', 'Read, Write, Edit', 'Agent', 'SendMessage', 'Skill', 'TaskStop']);
});

test('R67: Budgets and rounds names the host fields a timed call is judged by', () => {
  const text = section(SKILL, 'Budgets and rounds');
  for (const name of ['`duration_ms`', '`run_in_background`']) assert.ok(text.includes(name), `Budgets and rounds does not name ${name}`);
});

test('R69: the risk floor lists its six triggers in order', () => {
  const items = [...section(RISK, 'Risk floor').matchAll(/^\d+\. (.+)$/gm)].map((m) => m[1]);
  assert.deepEqual(items, [
    'an authentication or authorization check',
    'a permission rule',
    'a schema or a migration',
    'a row-level security policy',
    'a data access path',
    'the signature or behavior of a public API',
  ]);
});

test('R109, R110: Step 5 holds the items 5.1 to 5.5 in order', () => {
  const items = [...section(BUILD, 'Step 5 Final review').matchAll(/^\d+\. \*\*(\d\.\d+ [^*]+?)\.\*\*/gm)].map((m) => m[1]);
  assert.deepEqual(items, ['5.1 Integrate', '5.2 One pass', '5.3 Triage', '5.4 Fix', '5.5 Record']);
});

test('R110: Step 5.3 sorts findings into three buckets', () => {
  const triage = section(BUILD, 'Step 5 Final review').split('\n').find((line) => line.includes('**5.3 Triage.**'));
  assert.notEqual(triage, undefined, 'Step 5 has no 5.3 item');
  const buckets = [...triage.matchAll(/`([a-z]+)` \(/g)].map((m) => m[1]);
  assert.deepEqual(buckets, ['fix', 'defer', 'reject']);
});

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
const BUILD = read('steps/4-build.md');
const PUBLISH = read('steps/7-publish.md');
const REPORT = read('report.md');

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

test('R70 retired: no shipped loop file names a higher-risk rule', () => {
  for (const file of walk(LOOP)) {
    const text = readFileSync(new URL(file, LOOP), 'utf8');
    assert.ok(!/higher-risk/i.test(text), `${file} still mentions the higher-risk rule`);
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

test('R109, R110: Step 5 holds the five items 5.1 to 5.5 in order', () => {
  const text = section(BUILD, 'Step 5 Final review');
  assert.notEqual(text, null);
  const headings = ['**5.1 Integrate.**', '**5.2 One pass.**', '**5.3 Triage.**', '**5.4 Fix.**', '**5.5 Record.**'];
  let last = -1;
  for (const heading of headings) {
    assert.equal(text.split(heading).length, 2, `${heading} is not present exactly once`);
    const at = text.indexOf(heading);
    assert.ok(at > last, `${heading} is out of order`);
    last = at;
  }
});

test('R110: Step 5 triage names the three buckets with their definitions', () => {
  const text = section(BUILD, 'Step 5 Final review');
  assert.notEqual(text, null);
  assert.ok(text.includes('`fix` (a correctness finding inside the change)'));
  assert.ok(text.includes('`defer` (reuse, simplification, efficiency, or a pre-existing issue the change did not introduce)'));
  assert.ok(text.includes('`reject` (a false positive)'));
});

test('R72, R111: Step 5 has no rounds', () => {
  const text = section(BUILD, 'Step 5 Final review');
  assert.notEqual(text, null);
  assert.ok(!/round/i.test(text), 'Step 5 still says "round"');
});

test('R72: SKILL.md gives Step 5 one pass and the repair cycle one pass', () => {
  const text = section(SKILL, 'Budgets and rounds');
  assert.notEqual(text, null);
  assert.ok(text.includes('Step 5 has one pass per run and no round'));
  assert.ok(text.includes('Each CI repair cycle gets one Step 5 pass and one full Step 6 run'));
  assert.ok(!SKILL.includes('third round'));
  assert.ok(!SKILL.includes('Step 5 round'));
});

test('R109: an empty diff is sent to nothing', () => {
  const text = section(BUILD, 'Step 5 Final review');
  assert.notEqual(text, null);
  assert.ok(text.includes('"no changes"'));
  assert.ok(text.includes('`git diff <merge-base> --stat`'));
});

test('R113: Step 6 fixes a failure through the owning implementer', () => {
  const text = section(BUILD, 'Step 6 Checks');
  assert.notEqual(text, null);
  assert.ok(text.includes('is fixed through the implementer that owns the failing code'));
  assert.ok(!text.includes('Step 5 round'));
});

test('R127: the repair cycle runs one Step 5 pass', () => {
  const text = section(PUBLISH, '7.3 CI');
  assert.notEqual(text, null);
  assert.ok(/[Rr]e-enter Step 5 for one pass/.test(text));
});

test('R135: the Risk section of the report names the Step 5 level and the stand-in', () => {
  const start = REPORT.indexOf('\n### Risk\n');
  assert.notEqual(start, -1);
  const end = REPORT.indexOf('\n### ', start + 1);
  const text = REPORT.slice(start, end);
  assert.ok(text.includes('Step 5 level'));
  assert.ok(text.includes('stand-in'));
  assert.ok(!text.includes('role'));
});

test('R106: Step 4.5 judges the floor alone', () => {
  assert.ok(BUILD.includes('**4.5 Re-evaluation.** Judge the risk floor of `risk.md` on the actual diff from the merge-base.'));
});

test('R99, R104: Step 2 sizes a slice to the subagent budget, and the brief names it', () => {
  assert.ok(PLAN.includes('The subagent budget is the one in force for the run, `timeouts.subagent` in `.reimagine.json`, else 20 minutes'));
  assert.ok(PLAN.includes('An implementer call past it ends the run `blocked`'));
  const brief = section(BUILD, 'Implementer brief');
  assert.notEqual(brief, null);
  assert.ok(brief.includes('7. The subagent budget in force, in minutes, and that a call past it ends the run `blocked`'));
  assert.ok(brief.includes('8. The reply shape'));
});

test('R67, R104: an implementer call is judged by its notification, and the brief bars background commands', () => {
  assert.ok(SKILL.includes('An Agent or SendMessage call is judged against its budget by the `duration_ms` of its completion notification'));
  assert.ok(SKILL.includes('A notification for a call you did not send, after that call already returned, is not a new call'));
  assert.ok(!SKILL.includes('take `date` before and after the call and treat a return past the budget as expired'));
  assert.ok(BUILD.includes("each call's `duration_ms` from its completion notification"));
  assert.ok(BUILD.includes("A call is judged by its notification's `duration_ms`"));
  const brief = section(BUILD, 'Implementer brief');
  assert.notEqual(brief, null);
  assert.ok(brief.includes('start a background command'));
});

test('R67: a late notification is judged against its post-<n> files', () => {
  const snaps = section(BUILD, 'Implementer snapshots');
  assert.notEqual(snaps, null);
  assert.ok(snaps.includes('post-<n>.status'));
  assert.ok(snaps.includes('post-<n>.hashes'));
  assert.ok(snaps.includes('ends the run `blocked` naming the path'));
  assert.ok(!SKILL.includes('unless the snapshot comparison finds the tree changed after the first return'));
  assert.ok(SKILL.includes('post-<n>'));
  assert.ok(read('record.md').includes('post-<n>'));
});

test('R63: code-review covers a primary that is the session checkout, and the stand-in covers the rest', () => {
  const ARCH = readFileSync(new URL('../../docs/architecture.md', import.meta.url), 'utf8');
  const MULTI = read('multi-repo.md');
  const old = [
    'the diff is in a worktree or another repository',
    'the diff is in a worktree or an additional repository',
    '(and a primary in a worktree)',
    '(a worktree or an additional repository)',
  ];
  const standIn = "the primary is not the session's checkout, or the diff is in an additional repository";
  const files = { 'SKILL.md': SKILL, 'steps/4-build.md': BUILD, 'multi-repo.md': MULTI, 'steps/1-plan.md': PLAN, 'docs/architecture.md': ARCH };
  for (const [name, text] of Object.entries(files)) {
    for (const phrase of old) assert.ok(!text.includes(phrase), `${name} still holds "${phrase}"`);
    assert.ok(text.includes(standIn), `${name} lacks the stand-in condition`);
  }
  const covers = "`code-review` covers the primary whenever it is the session's checkout, a linked worktree included";
  assert.ok(SKILL.includes(covers));
  assert.ok(MULTI.includes(covers));
  const report = read('report.md');
  assert.ok(!report.includes('(the skill not listed, a worktree, an additional repository)'));
  assert.ok(report.includes("(the skill not listed, a primary that is not the session's checkout, an additional repository)"));
});

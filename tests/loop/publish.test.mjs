// Step 7 and the commands a run publishes with: the body files, the deploy judgment, the work item forms and the CI poll.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const DIR = new URL('../../plugins/loop/skills/run/', import.meta.url);
const read = (path) => readFileSync(new URL(path, DIR), 'utf8').replace(/\r/g, '');
const FILES = [
  ...readdirSync(DIR).filter((name) => name.endsWith('.md')),
  ...readdirSync(new URL('steps/', DIR)).filter((name) => name.endsWith('.md')).map((name) => `steps/${name}`),
];
const PUBLISH = read('steps/7-publish.md');
const PR_BODY = read('pr-body.md');
const SKILL = read('SKILL.md');

// The text from a "## <heading>" line up to the next "## " heading.
const section = (text, heading) => {
  const start = text.indexOf(`\n## ${heading}\n`);
  assert.notEqual(start, -1, `no ## ${heading}`);
  const end = text.indexOf('\n## ', start + 1);
  return end === -1 ? text.slice(start) : text.slice(start, end);
};

test('R92: every step file after Step 0 applies the reuse rule of the record', () => {
  for (const file of ['steps/1-plan.md', 'steps/4-build.md', 'steps/7-publish.md']) {
    assert.match(read(file), /`record\.md`, Reuse and resume/, `${file} does not apply record.md, Reuse and resume`);
  }
});

test('R116, R118: every gh command that posts a body passes it with --body-file and an absolute path, and the pull request is opened against <base>', () => {
  let shown = 0;
  for (const file of FILES) {
    for (const [, command] of read(file).matchAll(/`(gh (?:pr (?:create|edit|comment)|issue (?:create|comment)) [^`]+)`/g)) {
      shown++;
      assert.ok(command.includes('--body-file <absolute path'), `${file} shows ${command} without --body-file <absolute path>`);
    }
  }
  assert.ok(shown >= 10, `only ${shown} gh commands found`);
  const create = PUBLISH.match(/`(gh pr create --title [^`]+)`/)?.[1];
  assert.notEqual(create, undefined, 'Step 7.2 shows no gh pr create');
  assert.ok(create.includes('--base <base>'), 'gh pr create does not name --base <base>');
});

test('R56: the workflow files Step 7.2 lists for the deploy judgment come from ls-tree with --full-tree, one folder deep, and the skill pre-approves each git command it uses', () => {
  const text = section(PUBLISH, '7.2 Push and pull request');
  const lists = [...text.matchAll(/`(git -C <checkout> ls-tree [^`]+)`/g)].map((m) => m[1]);
  assert.equal(lists.length, 2, 'Step 7.2 lists the workflow files of the base branch and of HEAD');
  for (const command of lists) {
    assert.ok(command.includes('--full-tree --name-only '), `${command} lacks --full-tree --name-only`);
    assert.ok(command.endsWith(' .github/workflows/'), `${command} does not end at .github/workflows/`);
    assert.ok(!/ -r\b/.test(command), `${command} lists recursively`);
  }
  const allowed = SKILL.match(/^---\n([\s\S]*?)\n---\n/)[1];
  for (const sub of ['ls-tree', 'show']) assert.ok(allowed.includes(`  - Bash(git ${sub} *)`), `allowed-tools lacks git ${sub}`);
});

// The closing rules of pr-body.md, which sit after the body template's fence.
const closingRules = () => {
  const start = PR_BODY.indexOf('Closing rules:');
  const end = PR_BODY.indexOf('\n## Continued pull request comment');
  assert.ok(start !== -1 && end > start, 'pr-body.md has no closing rules before the continued comment');
  return PR_BODY.slice(start, end);
};

test('R117: an Azure DevOps ticket is written as a Refs line, and as a work item link built from its type, project and organization', () => {
  const text = closingRules();
  for (const form of [
    '`Refs AB#<n>`',
    '`Refs [<type> <n>](https://dev.azure.com/<org>/<project>/_workitems/edit/<n>)`',
    '`System.WorkItemType`',
    '`System.TeamProject`',
    '`%20`',
  ]) assert.ok(text.includes(form), `the closing rules lack ${form}`);
});

test('R215: pr-body.md names the Azure DevOps description cap, 4,000 characters', () => {
  assert.ok(PR_BODY.includes('4,000 characters'));
});

test('R126: the CI poll waits with sleep 30 in a background Bash call, since the host blocks a foreground sleep', () => {
  const text = read('ci-watch.md');
  assert.ok(text.includes('`sleep 30`'));
  assert.ok(text.includes('`run_in_background: true`'));
});

// The rules skill's steps and the refactor skill's files. The skills are text the model follows, so these read the text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const SKILL = readFileSync(new URL('../../plugins/rules/skills/rules/SKILL.md', import.meta.url), 'utf8');

test('R36: the adopt step passes only the options the user gave, never the plan\'s options line', () => {
  const line = SKILL.split('\n').find((l) => l.startsWith('- On adopt,'));
  assert.notEqual(line, undefined);
  assert.equal(line.includes('options:'), false);
  assert.equal(line.includes('--adopt'), true);
});

const REFACTOR_DIR = new URL('../../plugins/rules/skills/refactor/', import.meta.url);

function readRefactor() {
  return readFileSync(new URL('SKILL.md', REFACTOR_DIR), 'utf8');
}

function lineCount(text) {
  if (text === '') return 0;
  const newlines = text.split('\n').length - 1;
  return newlines + (text.endsWith('\n') ? 0 : 1);
}

test('R330: the refactor skill directory holds SKILL.md only', () => {
  assert.deepEqual(readdirSync(REFACTOR_DIR), ['SKILL.md']);
});

test('R330: the refactor frontmatter names the skill, sets the flag, takes no arguments and lists read-only tools', () => {
  const lines = readRefactor().split(/\r?\n/);
  assert.equal(lines[0], '---');
  const end = lines.indexOf('---', 1);
  assert.ok(end > 1, 'the frontmatter has a closing ---');
  const front = lines.slice(1, end);
  assert.ok(front.includes('name: refactor'));
  const description = front.find((l) => l.startsWith('description:'));
  assert.ok(description, 'a description line exists');
  assert.ok(description.slice('description:'.length).trim() !== '', 'the description has a value');
  assert.ok(front.includes('disable-model-invocation: true'));
  assert.ok(!front.some((l) => l.startsWith('argument-hint:')), 'no argument-hint line');
  const at = front.findIndex((l) => l.startsWith('allowed-tools:'));
  assert.ok(at >= 0, 'an allowed-tools line exists');
  const tools = [];
  for (const l of front.slice(at + 1)) {
    if (!l.startsWith('  ')) break;
    tools.push(l.replace(/^ {2}- /, ''));
  }
  assert.deepEqual(tools, [
    'Read',
    'Grep',
    'Glob',
    'Bash(git status *)',
    'Bash(git diff *)',
    'Bash(git log *)',
    'Bash(git show *)',
    'Bash(git rev-parse *)',
    'Bash(git ls-files *)',
    'Bash(git check-ignore *)',
    'Bash(git grep *)',
  ]);
});

test('R330: the refactor SKILL.md is within its cap of 150 lines', () => {
  assert.equal(lineCount('a\nb\nc'), 3);
  assert.equal(lineCount('a\nb\nc\n'), 3);
  assert.equal(lineCount(''), 0);
  const n = lineCount(readRefactor());
  assert.ok(n <= 150, `refactor SKILL.md has ${n} lines`);
});

test('R330: the refactor skill holds no numbered step list', () => {
  const numbered = readRefactor().split(/\r?\n/).filter((l) => /^\d+\. /.test(l));
  assert.deepEqual(numbered, []);
});

test('R331: refactor launches its reviewers as agents, never as a workflow', () => {
  assert.ok(readRefactor().includes('with the Agent tool, never as a workflow'));
});

test('R331: refactor reviews tracked files only', () => {
  assert.ok(readRefactor().includes('Areas hold tracked files only, as `git ls-files` lists them.'));
});

test('R331: refactor keeps reviewers and refuters together at most 20 at a time', () => {
  assert.ok(readRefactor().includes('The run\'s reviewers and refuters together stay at most 20 at a time because the host refuses more'));
});

test('R332: refactor bundles only recommended findings that quote a rule', () => {
  assert.ok(readRefactor().includes('Group the surviving recommended findings that quote a rule into bundles.'));
});

test('R331: refactor recommends by the core.md item and quotes no rule', () => {
  assert.ok(readRefactor().includes('by the `core.md` item on finding issues and proposing changes'));
});

test('R333: refactor names each ticket file from the clock in a fixed format', () => {
  assert.ok(readRefactor().includes('Name each ticket file `refactor-<time>-<n>.md`, where `<time>` is the output of `date +%Y%m%d-%H%M%S`, which may prompt once, and `<n>` is the bundle\'s number, so no earlier run\'s ticket has its path.'));
});

test('R333: refactor checks the scratch directory with a trailing slash', () => {
  assert.ok(readRefactor().includes('checked with `git check-ignore` on its path with a trailing slash'));
});

test('R333: refactor keeps each reviewer brief in the prompt, never in a file', () => {
  assert.ok(readRefactor().includes('Each brief goes in the Agent prompt, never in a file.'));
});

test('R333: refactor asks its one question only when there is a bundle', () => {
  assert.ok(readRefactor().includes('When the report has at least one bundle, ask one question: write the ticket files.'));
});

test('R332: each refactor finding gives what the change costs', () => {
  assert.ok(readRefactor().includes('- what the change costs'));
});

test('R331: refactor reads imported and nested instruction files', () => {
  assert.ok(readRefactor().includes('nested `CLAUDE.md` and `AGENTS.md` files, the files they import,'));
});

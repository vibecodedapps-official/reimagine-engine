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

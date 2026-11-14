// The rules, refactor, handoff prompt and draft skills' files: the frontmatter the host reads, the caps, the commands shown, and the copies of an item that two files must hold alike. No case asserts how a sentence is worded (requirement 402).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { loadTexts, units } from '../../plugins/rules/scripts/rules.mjs';

const SKILL = readFileSync(new URL('../../plugins/rules/skills/rules/SKILL.md', import.meta.url), 'utf8');

test('R36: the adopt step passes only the options the user gave, never the plan\'s options line', () => {
  const lines = SKILL.split('\n').filter((l) => /rules\.mjs" plan [^`]*--adopt/.test(l));
  assert.ok(lines.length > 0, 'the skill shows no plan --adopt command');
  for (const l of lines) assert.equal(l.includes('options:'), false, l);
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
    'Bash(git rev-parse *)',
    'Bash(git ls-files *)',
    'Bash(git check-ignore *)',
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

test('R330: the refactor skill names no PowerShell tool', () => {
  assert.equal(readRefactor().includes('PowerShell'), false);
});

const HANDOFF_DIR = new URL('../../plugins/rules/skills/handoff-prompt/', import.meta.url);

function readHandoff() {
  return readFileSync(new URL('SKILL.md', HANDOFF_DIR), 'utf8');
}

function handoffFront() {
  const lines = readHandoff().split(/\r?\n/);
  assert.equal(lines[0], '---');
  const end = lines.indexOf('---', 1);
  assert.ok(end > 1, 'the frontmatter has a closing ---');
  return lines.slice(1, end);
}

test('R347: the handoff-prompt skill directory holds SKILL.md only', () => {
  assert.deepEqual(readdirSync(HANDOFF_DIR), ['SKILL.md']);
});

test('R347: the handoff-prompt frontmatter names the skill and its description claims the handoff prompt and not the audit\'s file', () => {
  const front = handoffFront();
  assert.ok(front.includes('name: handoff-prompt'));
  const description = front.find((l) => l.startsWith('description:'));
  assert.ok(description, 'a description line exists');
  assert.ok(description.includes('handoff prompt'));
  assert.ok(description.includes('Not the typed handoff file an audit reads.'));
  assert.ok(description.includes('or for a prompt that carries work to a later session.'));
  assert.equal(description.includes('handoff to another session'), false);
});

test('R347: the handoff-prompt skill is model-invocable and takes no tools list or arguments', () => {
  const front = handoffFront();
  assert.ok(!front.some((l) => l.startsWith('disable-model-invocation:')), 'no disable-model-invocation line');
  assert.ok(!front.some((l) => l.startsWith('allowed-tools:')), 'no allowed-tools line');
  assert.ok(!front.some((l) => l.startsWith('argument-hint:')), 'no argument-hint line');
});

test('R347: the handoff-prompt SKILL.md is within its cap of 150 lines', () => {
  const n = lineCount(readHandoff());
  assert.ok(n <= 150, `handoff-prompt SKILL.md has ${n} lines`);
});

test('R347: the handoff-prompt skill holds no numbered step list', () => {
  const numbered = readHandoff().split(/\r?\n/).filter((l) => /^\d+\. /.test(l));
  assert.deepEqual(numbered, []);
});

function definitionItems() {
  const lines = readHandoff().split(/\r?\n/);
  const start = lines.indexOf('## The definition');
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  assert.ok(start >= 0 && end > start, 'the definition section has a start and an end');
  return lines.slice(start + 1, end).filter((l) => l.startsWith('- '));
}

test('R347: the definition section holds two items, the second an item of core.md as core.md has it', () => {
  const core = units(loadTexts()['core.md']).list.filter((u) => u.kind === 'item').map((u) => `- ${u.norm}`);
  const items = definitionItems();
  assert.equal(items.length, 2);
  assert.equal(core.includes(items[0]), false);
  assert.ok(core.includes(items[1]), 'the second item is not an item of core.md');
});

test('R346: the chat block carries the first item of the definition as the skill words it', () => {
  const fenced = readFileSync(new URL('../../plugins/rules/chat/instructions.md', import.meta.url), 'utf8').split('```')[1].split(/\r?\n/);
  assert.ok(fenced.includes(definitionItems()[0]));
});

test('R347: the handoff-prompt skill asks for no read of the plugin\'s files', () => {
  const text = readHandoff();
  assert.equal(text.includes('core.md'), false);
  assert.equal(text.includes('CLAUDE_PLUGIN_ROOT'), false);
});

const DRAFT_DIR = new URL('../../plugins/rules/skills/draft/', import.meta.url);

function readDraft() {
  return readFileSync(new URL('SKILL.md', DRAFT_DIR), 'utf8');
}

function draftFront() {
  const lines = readDraft().split(/\r?\n/);
  assert.equal(lines[0], '---');
  const end = lines.indexOf('---', 1);
  assert.ok(end > 1, 'the frontmatter has a closing ---');
  return lines.slice(1, end);
}

test('R363: the draft skill directory holds SKILL.md only', () => {
  assert.deepEqual(readdirSync(DRAFT_DIR), ['SKILL.md']);
});

test('R363: the draft frontmatter names the skill and its description claims a message for someone else', () => {
  const front = draftFront();
  assert.ok(front.includes('name: draft'));
  const description = front.find((l) => l.startsWith('description:'));
  assert.ok(description, 'a description line exists');
  assert.ok(description.includes('before it is first shown'));
  assert.ok(description.includes('Use whenever this session writes a message that another person will read.'));
  assert.ok(description.includes('Not for a commit message or a code comment.'));
});

test('R363: the draft skill is model-invocable and takes no tools list or arguments', () => {
  const front = draftFront();
  assert.ok(!front.some((l) => l.startsWith('disable-model-invocation:')), 'no disable-model-invocation line');
  assert.ok(!front.some((l) => l.startsWith('allowed-tools:')), 'no allowed-tools line');
  assert.ok(!front.some((l) => l.startsWith('argument-hint:')), 'no argument-hint line');
});

test('R363: the draft SKILL.md is within its cap of 150 lines', () => {
  const n = lineCount(readDraft());
  assert.ok(n <= 150, `draft SKILL.md has ${n} lines`);
});

test('R363: the draft skill holds no numbered step list', () => {
  const numbered = readDraft().split(/\r?\n/).filter((l) => /^\d+\. /.test(l));
  assert.deepEqual(numbered, []);
});

test('R363: the draft skill asks for no read of the plugin\'s files', () => {
  const text = readDraft();
  assert.equal(text.includes('core.md'), false);
  assert.equal(text.includes('concise-plain.md'), false);
  assert.equal(text.includes('CLAUDE_PLUGIN_ROOT'), false);
});

test('R366: the style names the draft skill on one line and the chat block does not', () => {
  const style = readFileSync(new URL('../../plugins/rules/output-styles/concise-plain.md', import.meta.url), 'utf8');
  assert.equal(style.split(/\r?\n/).filter((l) => l.includes('`rules:draft` skill')).length, 1);
  const fenced = readFileSync(new URL('../../plugins/rules/chat/instructions.md', import.meta.url), 'utf8').split('```')[1];
  assert.equal(/rules:draft|draft`? skill/.test(fenced), false);
});

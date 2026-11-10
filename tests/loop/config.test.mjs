// The loop skill's configuration block, frontmatter and the names the skill and the README share.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r/g, '');
const SKILL = read('../../plugins/loop/skills/run/SKILL.md');
const README = read('../../plugins/loop/README.md');

// The body of the first ```json fenced block that contains "timeouts".
const configBlock = (text) => {
  for (const match of text.matchAll(/```json\n([\s\S]*?)\n```/g)) {
    if (match[1].includes('timeouts')) return match[1];
  }
  return null;
};

// The bullets that open a list: "- `key`: ..." names the key, "- "phrase": ..." or "- `phrase`: ..." the request phrases.
const section = (text, heading) => text.split(`\n## ${heading}\n`)[1].split('\n## ')[0];
const keys = (text) => [...section(text, 'Configuration').matchAll(/^- `([a-z]+)`:/gm)].map((m) => m[1]);
const phrases = (list) => [...list.matchAll(/^- ((?:["`][^"`]+["`](?: and )?)+):/gm)].flatMap((m) => [...m[1].matchAll(/["`]([^"`]+)["`]/g)].map((p) => p[1]));

test('R81: the configuration block in SKILL.md is byte-identical to the one in README.md', () => {
  const skill = configBlock(SKILL);
  assert.notEqual(skill, null);
  assert.equal(skill, configBlock(README));
});

test('R81: the configuration block has exactly the keys commit, checks, timeouts, models, base, with the default values', () => {
  const config = JSON.parse(configBlock(SKILL));
  assert.deepEqual(Object.keys(config), ['commit', 'checks', 'timeouts', 'models', 'base']);
  assert.equal(config.base, 'main');
  assert.deepEqual(Object.keys(config.timeouts), ['subagent', 'review', 'check', 'ci', 'run']);
  assert.deepEqual(config.timeouts, { subagent: 20, review: 30, check: 15, ci: 45, run: 240 });
  assert.deepEqual(config.models, { implementer: 'sonnet', reviewer: 'opus', 'fallback-reviewer': 'sonnet', reader: 'haiku' });
});

test('R81, R112, R282: SKILL.md and README.md explain each configuration key, in the block\'s order', () => {
  const expected = ['commit', 'checks', 'timeouts', 'models', 'base'];
  assert.deepEqual(keys(SKILL), expected);
  assert.deepEqual(keys(README), expected);
});

test('R281, R282: SKILL.md and README.md list the same request phrases, in order, the base phrase among them', () => {
  const expected = [
    'plan only', 'do not publish', 'confirm the plan', 'continue <branch>', 'on branch <name>', 'base <branch>', 'primary <path>',
    'also edit <path>', 'also edit <path> on <branch>', 'budget <n> minutes',
  ];
  assert.deepEqual(phrases(SKILL.split('Recognized phrases:\n\n')[1].split('\n\n')[0]), expected);
  assert.deepEqual(phrases(README.split('Phrases the loop recognizes:\n\n')[1].split('\n\n')[0]), expected);
});

test('R45: the SKILL.md frontmatter names the skill run and its description carries both trigger phrases', () => {
  const match = SKILL.match(/^---\n([\s\S]*?)\n---\n/);
  assert.notEqual(match, null);
  const lines = match[1].split('\n');
  assert.ok(lines.includes('name: run'));
  const description = lines.find((line) => line.startsWith('description:'));
  assert.ok(description.includes('reimagine loop'));
  assert.ok(description.includes('run the loop'));
});

test('the SKILL.md core stays within 5800 words', () => {
  const words = SKILL.split(/\s+/).filter(Boolean).length;
  assert.ok(words <= 5800, `SKILL.md has ${words} words`);
});

test('R82, R83: the branch and slug examples in SKILL.md follow the slug rules they sit beside', () => {
  // Lowercase, each run outside [a-z0-9] to "-", cut to the length, then no trailing "-"; the predicted slug also drops a leading "-".
  const slug = (text, length) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, length).replace(/-+$/, '');
  const branch = SKILL.match(/For `([^`]+)` it is `([^`]+)`/);
  const title = SKILL.match(/For the title "([^"]+)" the slug is `([^`]+)`/);
  assert.notEqual(branch, null, 'no branch-slug example');
  assert.notEqual(title, null, 'no predicted-slug example');
  assert.equal(slug(branch[1], 60), branch[2]);
  assert.equal(slug(title[1], 40), title[2]);
});

test('R59: every Bash rule in allowed-tools has at most one *, and only at its end', () => {
  const frontmatter = SKILL.match(/^---\n([\s\S]*?)\n---\n/)[1];
  const rules = frontmatter.split('\n').map((line) => line.match(/^\s*-\s*Bash\((.*)\)\s*$/)).filter(Boolean).map((m) => m[1]);
  assert.ok(rules.length > 0, 'no Bash rule found in allowed-tools');
  for (const rule of rules) {
    assert.ok(!rule.slice(0, -1).includes('*'), `Bash(${rule}) has a * before its end`);
  }
});

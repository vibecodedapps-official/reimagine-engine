// The loop skill's configuration block and frontmatter. The skill and the README carry the same .reimagine.json block.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const SKILL = read('../../plugins/loop/skills/run/SKILL.md');
const README = read('../../plugins/loop/README.md');

// The body of the first ```json fenced block that contains "timeouts".
const configBlock = (text) => {
  for (const match of text.matchAll(/```json\n([\s\S]*?)\n```/g)) {
    if (match[1].includes('timeouts')) return match[1];
  }
  return null;
};

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
  assert.deepEqual(config.models, { implementer: 'sonnet', reviewer: 'fable', 'fallback-reviewer': 'opus', reader: 'haiku' });
});

test('R81: SKILL.md and README.md skip the gate key without reporting it', () => {
  for (const text of [SKILL, README]) {
    assert.ok(text.includes('The `gate` key belongs to the gate plugin and is skipped without a report.'));
    assert.ok(!text.includes('Unknown keys and bad values are reported and ignored.'));
  }
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

test('the SKILL.md core holds the branch prediction rule and its slug example', () => {
  assert.ok(SKILL.includes('count-should-accept-an-optional-predicat'));
  assert.ok(SKILL.includes('`fix/<ids>-<slug>`'));
});

test('R59: every Bash rule in allowed-tools has at most one *, and only at its end', () => {
  const frontmatter = SKILL.match(/^---\n([\s\S]*?)\n---\n/)[1];
  const rules = frontmatter.split('\n').map((line) => line.match(/^\s*-\s*Bash\((.*)\)\s*$/)).filter(Boolean).map((m) => m[1]);
  assert.ok(rules.length > 0, 'no Bash rule found in allowed-tools');
  for (const rule of rules) {
    assert.ok(!rule.slice(0, -1).includes('*'), `Bash(${rule}) has a * before its end`);
  }
});

test('R112: the checks bullets and Step 6.1 say a checks key still leaves the manifests and CI jobs read, and name the uncovered CI jobs', () => {
  const sentence = 'With a `checks` key those commands are the ones run, and Step 6.1 still reads the manifests and the CI jobs and names each CI job no configured check covers as deferred to CI in `run.md` and the report.';
  const old = 'With no `checks` key, Step 6.1 discovery applies';
  const build = read('../../plugins/loop/skills/run/steps/4-build.md');
  const step61 = build.slice(build.indexOf('1. **6.1 Discovery.**'), build.indexOf('2. **6.2 Not run.**'));
  const bullet = (text) => text.split('\n').find((line) => line.startsWith('- `checks`:'));
  assert.ok(step61.length > 0, 'Step 6.1 not found');
  assert.ok(bullet(SKILL).includes(sentence), 'the SKILL.md checks bullet lacks the sentence');
  assert.ok(bullet(README).includes(sentence), 'the README checks bullet lacks the sentence');
  assert.ok(step61.includes(sentence), 'Step 6.1 lacks the sentence');
  for (const text of [SKILL, README, build]) assert.ok(!text.includes(old));
});

test('R112: with a checks key the plan and Step 6.1 run its commands alone', () => {
  const build = read('../../plugins/loop/skills/run/steps/4-build.md');
  const plan = read('../../plugins/loop/skills/run/steps/1-plan.md');
  assert.ok(build.includes('1. **6.1 Discovery.** With a `checks` key, the run\'s checks are its commands alone, in its order: no manifest command or CI job joins them, and neither does a plan or a review. Without one, build the list in this order and drop duplicates.'), 'Step 6.1 does not lead with the checks key');
  assert.ok(plan.includes('The plan\'s checks are those of Step 6.1 (`steps/4-build.md`): with a `checks` key, its commands alone, and a CI job no configured check covers is named as deferred to CI, not added as a check.'), 'Step 2 does not take the plan\'s checks from the checks key');
});

test('R282: SKILL.md and README.md explain the base key the same way: without it the remote default, and the request phrase wins', () => {
  for (const text of [SKILL, README]) {
    assert.ok(text.includes('- `base`:'), 'no bullet explains the base key');
    assert.ok(text.includes('"base <branch>"'), 'the base bullet does not name the request phrase');
  }
});

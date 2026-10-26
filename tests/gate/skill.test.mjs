// The gate skill's frontmatter, reading block, configuration block, terminal states and supporting-files section.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const GATE = new URL('../../plugins/gate/', import.meta.url);
const SKILL = readFileSync(new URL('skills/gate/SKILL.md', GATE), 'utf8');
const README = readFileSync(new URL('README.md', GATE), 'utf8');

const frontmatter = (text) => {
  const lines = text.split('\n');
  const end = lines.indexOf('---', 1);
  assert.equal(lines[0], '---');
  assert.ok(end > 0, 'no closing frontmatter line');
  return lines.slice(1, end);
};

// The lines of each fenced block, with the fence's info string kept apart.
const fences = (text) => {
  const blocks = [];
  let open = null;
  for (const line of text.split('\n')) {
    const m = /^```(.*)$/.exec(line);
    if (!m) { if (open) open.lines.push(line); continue; }
    if (open) { blocks.push(open); open = null; } else open = { info: m[1], lines: [] };
  }
  return blocks;
};

const jsonBlock = (text) => fences(text).find((b) => b.info === 'json');

test('R288: the frontmatter names the skill gate, has no paths key and names the four phrases', () => {
  const lines = frontmatter(SKILL);
  assert.ok(lines.includes('name: gate'));
  assert.ok(!lines.some((l) => l.startsWith('paths:')));
  const description = lines.find((l) => l.startsWith('description:'));
  assert.notEqual(description, undefined);
  for (const phrase of ['reimagine gate', 'gate this branch', 'gate PR <n>', 'gate the manifest <path>']) {
    assert.ok(description.includes(phrase), `description lacks ${phrase}`);
  }
});

test('R313: the configuration block is the same in SKILL.md and the README and holds the defaults', () => {
  const skill = jsonBlock(SKILL);
  const readme = jsonBlock(README);
  assert.notEqual(skill, undefined, 'SKILL.md has no json block');
  assert.notEqual(readme, undefined, 'README.md has no json block');
  assert.equal(skill.lines.join('\n'), readme.lines.join('\n'));
  assert.deepEqual(JSON.parse(skill.lines.join('\n')), {
    gate: { split: 1500, 'max-passes': 4, budget: 120, models: { implementer: 'sonnet', 'fallback-reviewer': 'opus' } },
  });
});

test('R291: the reading block is one fenced block of four lines in a fixed order', () => {
  const block = fences(SKILL).find((b) => b.lines.some((l) => l.startsWith('Targets: ')));
  assert.notEqual(block, undefined, 'SKILL.md has no reading block');
  assert.equal(block.lines.length, 4);
  const heads = ['Targets: ', 'Mode: ', 'Budget: ', 'Engine: '];
  block.lines.forEach((line, i) => assert.ok(line.startsWith(heads[i]), `line ${i + 1} does not start with ${heads[i]}`));
});

test('R316: the skill names the five terminal states', () => {
  for (const state of ['pass', 'pass-with-deferred', 'unconverged', 'blocked', 'stopped']) {
    assert.ok(SKILL.includes(`\`${state}\``), `SKILL.md lacks ${state}`);
  }
});

test('R219: the skill has a Supporting files section', () => {
  assert.ok(SKILL.split('\n').includes('## Supporting files'));
});

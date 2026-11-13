// The review skill's structure: what its files must hold for a run to work. No case here asserts how a sentence is
// worded; what only a model run can show is an eval or an acceptance item.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REVIEW = new URL('../../plugins/review/', import.meta.url);
const SKILL_DIR = new URL('skills/run/', REVIEW);
const read = (rel) => readFileSync(new URL(rel, SKILL_DIR), 'utf8').replace(/\r/g, '');
const SKILL = read('SKILL.md');
const CORE = readFileSync(new URL('../../plugins/rules/rules/core.md', import.meta.url), 'utf8').replace(/\r/g, '');

const filesUnder = (dir, rel = '') => readdirSync(new URL(rel, dir), { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? filesUnder(dir, `${rel}${e.name}/`) : [`${rel}${e.name}`]));

const frontmatter = (text) => {
  const lines = text.split('\n');
  const end = lines.indexOf('---', 1);
  assert.equal(lines[0], '---');
  assert.ok(end > 0, 'no closing frontmatter line');
  return lines.slice(1, end);
};

const section = (text, heading) => {
  const lines = text.split('\n');
  const start = lines.indexOf(`## ${heading}`);
  assert.notEqual(start, -1, `no ## ${heading}`);
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  return lines.slice(start + 1, end < 0 ? lines.length : end);
};

test('R368: the frontmatter names the skill run, says the pull request is someone else\'s, names "reimagine review", and is user-invocable with no paths', () => {
  const lines = frontmatter(SKILL);
  assert.ok(lines.includes('name: run'));
  const description = lines.find((l) => l.startsWith('description:'));
  assert.notEqual(description, undefined);
  assert.ok(description.includes('"reimagine review"'));
  assert.ok(description.includes('someone else wrote'));
  assert.ok(!description.includes('<') && !description.includes('>'), 'the host shows < and > in a description escaped');
  for (const key of ['paths:', 'user-invocable: false', 'disable-model-invocation:']) {
    assert.ok(!lines.some((l) => l.startsWith(key)), `the frontmatter holds ${key}`);
  }
});

// The entries of an allowed-tools key, written on its own line or as a list under it.
const allowedTools = (lines) => {
  const at = lines.findIndex((l) => l.startsWith('allowed-tools:'));
  if (at < 0) return [];
  const block = [];
  for (const l of lines.slice(at + 1)) {
    if (!/^\s+-\s/.test(l)) break;
    block.push(l.replace(/^\s+-\s+/, ''));
  }
  return [...lines[at].slice('allowed-tools:'.length).split(','), ...block].map((e) => e.trim()).filter(Boolean);
};
const FORGE_READ = /^Bash\(gh (pr (view|diff|list|checks)|repo view|auth status)\b/;
const writesToForge = (entry) => /\b(gh|az|curl)\b|\bgit push\b|mcp__/.test(entry) && !FORGE_READ.test(entry);

test('R368: no allowed-tools entry writes to a forge', () => {
  for (const entry of allowedTools(frontmatter(SKILL))) assert.ok(!writesToForge(entry), `${entry} can write to a forge`);
});

test('R368: the check reads an inline list and a block list, and takes a broad entry as one that can write', () => {
  assert.deepEqual(allowedTools(['name: run', 'allowed-tools: Bash(gh *), Read']), ['Bash(gh *)', 'Read']);
  assert.deepEqual(allowedTools(['allowed-tools:', '  - Bash(git push *)', '  - Grep', 'paths:', '  - src']), ['Bash(git push *)', 'Grep']);
  for (const entry of ['Bash(gh *)', 'Bash(gh api *)', 'Bash(gh pr review *)', 'Bash(git push *)', 'Bash(az repos *)', 'mcp__github__add_comment']) {
    assert.equal(writesToForge(entry), true, entry);
  }
  for (const entry of ['Read', 'Bash(git status *)', 'Bash(gh pr view *)', 'Bash(gh pr diff *)']) {
    assert.equal(writesToForge(entry), false, entry);
  }
});

test('R368: the plugin ships its manifest, LICENSE, README, the skill and its three mode files, and posts.mjs, with no hook, command or agent', () => {
  assert.deepEqual(filesUnder(REVIEW).sort(), [
    '.claude-plugin/plugin.json',
    'LICENSE',
    'README.md',
    'scripts/posts.mjs',
    'skills/run/SKILL.md',
    'skills/run/first.md',
    'skills/run/follow-up.md',
    'skills/run/post.md',
  ]);
});

test('R349: ## What leaves the run holds one item, the core.md item with its lines joined', () => {
  const item = CORE.split('\n- ').map((s) => s.split('\n\n')[0].replace(/\s+/g, ' ').trim()).find((s) => s.startsWith('Write what leaves the session'));
  assert.notEqual(item, undefined, 'core.md holds no such item');
  const items = section(SKILL, 'What leaves the run').filter((l) => /^\s*(?:[-*+]|\d+[.)])\s/.test(l));
  assert.deepEqual(items, [`- ${item}`]);
});

test('R219: SKILL.md names each mode file and the script under ## Supporting files, and each exists', () => {
  const spans = [...section(SKILL, 'Supporting files').join('\n').matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  assert.deepEqual(spans.filter((s) => /\.(md|mjs)$/.test(s)), ['first.md', 'follow-up.md', 'post.md', 'scripts/posts.mjs']);
  const modes = readdirSync(fileURLToPath(SKILL_DIR)).filter((n) => n !== 'SKILL.md').sort();
  assert.deepEqual(modes, ['first.md', 'follow-up.md', 'post.md']);
});

test('R371: no file of the skill starts a child session or shows a child allow-list', () => {
  for (const rel of ['SKILL.md', 'first.md', 'follow-up.md', 'post.md']) {
    assert.doesNotMatch(read(rel), /claude -p|--allowed-?[Tt]ools/, `${rel} starts a child session`);
  }
});

test('R370: every git command a mode file shows carries the hooks path and long paths, through git <c>', () => {
  const block = SKILL.split('\n').find((l) => l.includes('shown below as `git <c>`'));
  assert.ok(block?.includes('`-c core.hooksPath="<record>/hooks" -c core.longpaths=true -c filter.lfs.smudge= -c filter.lfs.process= -c filter.lfs.required=false`'), 'SKILL.md does not define git <c>');
  for (const rel of ['SKILL.md', 'first.md', 'follow-up.md', 'post.md']) {
    for (const span of [...read(rel).matchAll(/`(git [^`]*)`/g)].map((m) => m[1])) {
      if (/^git (<c>|status --porcelain --ignored|remote -v)$/.test(span)) continue;
      assert.ok(span.startsWith('git <c> '), `${rel}: ${span} lacks <c>`);
    }
  }
});

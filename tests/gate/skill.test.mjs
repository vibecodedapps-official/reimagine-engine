// The gate skill's frontmatter, reading block, configuration block, terminal states, supporting files and step files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const GATE = new URL('../../plugins/gate/', import.meta.url);
const SKILL_DIR = new URL('skills/gate/', GATE);
const SKILL = readFileSync(new URL('SKILL.md', SKILL_DIR), 'utf8');
const README = readFileSync(new URL('README.md', GATE), 'utf8');

// A file of the skill by its path under skills/gate/, or null when it is missing.
const read = (rel) => {
  try {
    return readFileSync(new URL(rel, SKILL_DIR), 'utf8');
  } catch {
    return null;
  }
};

// Every Markdown file of the skill but SKILL.md, by its path under skills/gate/.
const supporting = () => {
  const out = [];
  const walk = (rel) => {
    for (const e of readdirSync(new URL(rel, SKILL_DIR), { withFileTypes: true })) {
      if (e.isDirectory()) walk(`${rel}${e.name}/`);
      else if (e.name.endsWith('.md') && `${rel}${e.name}` !== 'SKILL.md') out.push(`${rel}${e.name}`);
    }
  };
  walk('');
  return out.sort();
};

// Asserts that the file holds each needle.
const holds = (rel, ...needles) => {
  const text = read(rel);
  assert.notEqual(text, null, `${rel} is missing`);
  for (const needle of needles) assert.ok(text.includes(needle), `${rel} lacks: ${needle}`);
  return text;
};

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

test('R219: Supporting files names every file of the skill, and each ends by naming where the run goes next', () => {
  assert.deepEqual(supporting(), ['steps/0-preflight.md']);
  const lines = SKILL.split('\n');
  const start = lines.indexOf('## Supporting files');
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  const spans = [...lines.slice(start + 1, end < 0 ? undefined : end).join('\n').matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  for (const rel of supporting()) {
    assert.ok(spans.includes(rel), `## Supporting files does not name ${rel}`);
    const last = read(rel).trimEnd().split(/\n\s*\n/).pop();
    assert.match(last, /\b(Return to|Next is|[Gg]oes to|[Gg]o to|reads? `[^`]+\.md`)/, `${rel}: the last paragraph names no hand-off`);
  }
});

test('R291: Step 0 is read after the reading block and takes its four lines', () => {
  assert.ok(SKILL.includes('After the block, read `steps/0-preflight.md` and start Step 0.'));
  const text = holds('steps/0-preflight.md', 'before any other tool call', 'does not print the block again');
  assert.ok(text.startsWith('# Step 0: Preflight\n'));
  for (const heading of ['Targets', 'Mode', 'Budget', 'Engine']) assert.ok(text.includes(heading), `Step 0 does not name ${heading}`);
});

test('R309: Step 0 excludes the record through git rev-parse --git-path info/exclude, never .gitignore', () => {
  holds('steps/0-preflight.md', 'git rev-parse --git-path info/exclude', 'git check-ignore -q .reimagine/', 'append `.reimagine/`', 'never `.gitignore`');
});

test('R292: Step 0 fetches the base and the head with the explicit refspec and keeps the merge-base as a full sha', () => {
  holds('steps/0-preflight.md', '+refs/heads/<b>:refs/remotes/<r>/<b>', '+refs/heads/<head>:refs/remotes/<r>/<head>', 'git merge-base', 'full sha', 'base <branch>');
});

test('R295: Step 0 checks the clean tree before any checkout and keeps the fetched remote head', () => {
  const text = holds('steps/0-preflight.md', 'git status --porcelain', 'git diff --cached --quiet', 'Never stash, reset or clean', 'git rev-parse refs/remotes/<r>/<head>');
  assert.ok(text.indexOf('git diff --cached --quiet') < text.indexOf('git checkout'), 'the clean tree must come before the checkout');
});

test('R295: Step 0 blocks on an unauthenticated gh, a merged or closed pull request and a slug collision', () => {
  holds('steps/0-preflight.md', 'not authenticated', 'merged or closed', 'cross-repository', 'slug collision');
});

test('R294 and R313: Step 0 reads the instruction files and the configuration and states the prompts', () => {
  const text = holds('steps/0-preflight.md', '$CLAUDE_CONFIG_DIR', '.reimagine.json', 'ask-first', 'whether a prompt will occur');
  for (const action of ['fetch', 'checkout', 'exclude', 'child session', 'subagent', 'check', 'commit', 'push', 'comment']) {
    assert.ok(text.toLowerCase().includes(action), `the permission statement lacks ${action}`);
  }
});

test('R290: Step 0 runs several targets one after another and a manifest by bundle', () => {
  holds('steps/0-preflight.md', 'one after another', '`pr` or a `branch`', '`repo`', 'bundle order', 'unresolved', 'comment skipped');
});

test('R310: Step 0 writes passes.json and the run entry, then sends the run to pass 1 or to Resume', () => {
  holds('steps/0-preflight.md', '"runs": []', '"passes": []', '{"n": <run>, "started": <utc>, "ended": null, "state": "running"}', 'mv <tmp> <file>');
  const last = read('steps/0-preflight.md').trimEnd().split('\n').pop();
  assert.ok(last.includes('`steps/1-pass.md`') && last.includes('`xhigh`'), 'Step 0 does not send a new record to pass 1 at xhigh');
  assert.ok(last.includes('`steps/3-next.md`') && last.includes('Resume'), 'Step 0 does not send an existing record to Resume');
});

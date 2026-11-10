// The gate skill's structure and its contract with the scripts: what the files must hold for a run to work.
// No case here asserts how a sentence is worded; what only a model run can show is an eval or an acceptance item.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTexts, units } from '../../plugins/rules/scripts/rules.mjs';
import { KINDS } from '../../plugins/gate/scripts/next.mjs';

const GATE = new URL('../../plugins/gate/', import.meta.url);
const SKILL_DIR = new URL('skills/gate/', GATE);
const SCRIPTS = fileURLToPath(new URL('scripts/', GATE));
const FIXTURES = fileURLToPath(new URL('./fixture/', import.meta.url));
const SKILL = readFileSync(new URL('SKILL.md', SKILL_DIR), 'utf8');
const README = readFileSync(new URL('README.md', GATE), 'utf8');
const STATES = ['pass', 'pass-with-deferred', 'unconverged', 'blocked', 'stopped'];

// The files that hold each list the scripts must agree with.
const KINDS_FILE = 'steps/2-fix.md';
const RULES_FILE = 'steps/3-next.md';
const COMMAND_FILE = 'steps/1-pass.md';

const read = (rel) => readFileSync(new URL(rel, SKILL_DIR), 'utf8');

// Every file under a directory, by its path under it.
const filesUnder = (dir, rel = '') => readdirSync(new URL(rel, dir), { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? filesUnder(dir, `${rel}${e.name}/`) : [`${rel}${e.name}`]));

// Every Markdown file of the skill but SKILL.md.
const supporting = () => filesUnder(SKILL_DIR).filter((rel) => rel.endsWith('.md') && rel !== 'SKILL.md').sort();
const prose = () => ['SKILL.md', ...supporting()];

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
    const m = /^\s*```(.*)$/.exec(line);
    if (!m) { if (open) open.lines.push(line); continue; }
    if (open) { blocks.push(open); open = null; } else open = { info: m[1], lines: [] };
  }
  return blocks;
};
const jsonBlock = (text) => fences(text).find((b) => b.info === 'json');

// Everything a file shows as code: each fenced line and each backticked span.
const shown = (text) => [...fences(text).flatMap((b) => b.lines), ...[...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1])];

// The lines of a section, from its `## ` heading to the next one.
const section = (text, heading) => {
  const lines = text.split('\n');
  const start = lines.indexOf(`## ${heading}`);
  assert.notEqual(start, -1, `no ## ${heading}`);
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  return lines.slice(start + 1, end < 0 ? lines.length : end);
};

// The backticked word that opens each list item of a text.
const itemWords = (text) => [...text.matchAll(/^\s*- `([a-z-]+)`:/gm)].map((m) => m[1]);

const words = (text) => text.split(/\s+/).filter(Boolean).length;

test('R288: the frontmatter names the skill gate, has no paths key and names the four phrases', () => {
  const lines = frontmatter(SKILL);
  assert.ok(lines.includes('name: gate'));
  assert.ok(!lines.some((l) => l.startsWith('paths:')));
  const description = lines.find((l) => l.startsWith('description:'));
  assert.notEqual(description, undefined);
  for (const phrase of ['reimagine gate', 'gate this branch', 'gate PR [n]', 'gate the manifest [path]']) {
    assert.ok(description.includes(phrase), `description lacks ${phrase}`);
  }
  assert.ok(!description.includes('<') && !description.includes('>'), 'the host shows < and > in a description escaped');
});

test('R313: the configuration block is the same in SKILL.md and the README and holds the defaults', () => {
  const skill = jsonBlock(SKILL);
  const readme = jsonBlock(README);
  assert.notEqual(skill, undefined, 'SKILL.md has no json block');
  assert.notEqual(readme, undefined, 'README.md has no json block');
  assert.equal(skill.lines.join('\n'), readme.lines.join('\n'));
  assert.deepEqual(JSON.parse(skill.lines.join('\n')), {
    gate: { split: 1500, 'max-passes': 4, budget: 120, timeouts: { subagent: 20, review: 30, check: 15 }, models: { implementer: 'sonnet', reader: 'sonnet', reviewer: 'opus', 'fallback-reviewer': 'opus' } },
  });
});

test('R291: the reading block is one fenced block of five lines in a fixed order, and its sample shows the defaults', () => {
  const block = fences(SKILL).find((b) => b.lines.some((l) => l.startsWith('Targets: ')));
  assert.notEqual(block, undefined, 'SKILL.md has no reading block');
  assert.deepEqual(block.lines.map((l) => l.slice(0, l.indexOf(':'))), ['Targets', 'Mode', 'Budget', 'Engine', 'Scripts']);
  assert.equal(block.lines[2], 'Budget: 120 minutes (default); max-passes 4; split 1500; subagent 20, review 30, check 15 minutes (default)');
  assert.equal(block.lines[3], 'Engine: subprocess; reviewer opus, stand-in opus (default)');
});

test('R303: the step files state no fixed minutes for a review, an implementer call or a check', () => {
  for (const rel of supporting().filter((r) => r.startsWith('steps/'))) {
    assert.doesNotMatch(read(rel), /\b(20|30|15)[ -]minutes?\b/, `${rel} states a budget the configuration can change`);
  }
});

test('R219: Supporting files names every file of the skill and every script, and each file ends by naming where the run goes next', () => {
  const spans = [...section(SKILL, 'Supporting files').join('\n').matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  const scripts = readdirSync(SCRIPTS).map((name) => `scripts/${name}`);
  assert.deepEqual(spans.filter((s) => /\.(md|mjs)$/.test(s)).sort(), [...supporting(), ...scripts].sort());
  for (const rel of supporting()) {
    const last = read(rel).trimEnd().split(/\n\s*\n/).pop();
    assert.match(last, /\b(Return to|Next is|[Gg]oes to|[Gg]o to|reads? `[^`]+\.md`)/, `${rel}: the last paragraph names no hand-off`);
  }
});

test('R318: every script command the skill shows runs, by the path of the Scripts line', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gate-skill-'));
  try {
    copyFileSync(join(FIXTURES, 'finished-review.json'), join(dir, 'review.json'));
    writeFileSync(join(dir, 'findings.json'), '{"findings": {}}\n');
    const pass = { n: 1, run: 1, level: 'xhigh', status: 'running', findings: { 'src/a.mjs|s': { bucket: 'fix', reason: 'r' } }, changes: ['inside-diff'], checks: [] };
    writeFileSync(join(dir, 'passes.json'), JSON.stringify({ passes: [pass] }));
    // What stands in for each argument the skill shows; an argument that is not here fails the case.
    const values = {
      '<n>': '1',
      '<split>': '1500',
      '--check': '--check',
      '<record>/findings.json': join(dir, 'findings.json'),
      '<output>...': join(dir, 'review.json'),
      '<absolute passes.json>': join(dir, 'passes.json'),
      '<max-passes>': '4',
      '<minutes left>': '90',
      '<minutes a pass needs>': '50',
    };
    const ran = new Set();
    for (const rel of prose()) {
      for (const span of shown(read(rel))) {
        assert.ok(!/\bnode\b.*CLAUDE_PLUGIN_ROOT/.test(span), `${rel} runs a script through the plugin root variable: ${span}`);
        const m = /\bnode "<scripts>\/([a-z-]+\.mjs)"(.*)$/.exec(span);
        if (!m) continue;
        const args = (m[2].match(/(?:<[^>]*>|[^\s<])+/g) ?? []).map((arg) => {
          assert.ok(Object.hasOwn(values, arg), `${rel}: no value for the argument ${arg} of ${m[1]}`);
          return values[arg];
        });
        const r = spawnSync(process.execPath, [join(SCRIPTS, m[1]), ...args], { input: '', encoding: 'utf8' });
        assert.equal(r.status, 0, `${rel}: ${span} exits ${r.status}: ${r.stderr}`);
        ran.add(m[1]);
      }
    }
    assert.deepEqual([...ran].sort(), readdirSync(SCRIPTS).sort(), 'a script no step runs, or a step that runs none');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('R301: the change kinds a fix round records are the kinds next.mjs accepts', () => {
  assert.deepEqual(itemWords(read(KINDS_FILE)).sort(), [...KINDS].sort());
});

test('R301: the rules the skill lists are the rules next.mjs returns', () => {
  const source = readFileSync(join(SCRIPTS, 'next.mjs'), 'utf8');
  const returned = [...new Set([...source.matchAll(/(?:rule: |stop\()'([a-z-]+)'/g)].map((m) => m[1]))];
  assert.ok(returned.length > 0, 'the scan finds no rule in next.mjs');
  assert.deepEqual(itemWords(read(RULES_FILE)).sort(), returned.sort());
});

test('R316: the skill, the report template and the README name the same five terminal states', () => {
  assert.deepEqual(itemWords(section(SKILL, 'Terminal states').join('\n')), STATES);
  const template = fences(read('report.md')).find((b) => b.lines[0] === '# gate report');
  assert.notEqual(template, undefined, 'report.md has no fenced block that starts with "# gate report"');
  assert.ok(template.lines.includes(`- Terminal state: <${STATES.join(' | ')}>`));
  for (const state of STATES) assert.ok(README.includes(`\`${state}\``), `README.md does not name ${state}`);
});

test('R317: the report template holds the header keys and the six sections in order', () => {
  const template = fences(read('report.md')).find((b) => b.lines[0] === '# gate report');
  assert.deepEqual(template.lines.filter((l) => l.startsWith('- ')).map((l) => l.slice(2, l.indexOf(':'))), [
    'Run number', 'Branch', 'Record', 'Terminal state', 'Base', 'Merge-base', 'Targets', 'Run budget', 'Passes', 'Engine', 'Review level', 'Audit',
  ]);
  assert.deepEqual(template.lines.filter((l) => l.startsWith('## ')), [
    '## Findings', '## Checks', '## Commits and pushes', '## Open findings', '## Blocked or stopped', '## Log',
  ]);
});

test('R305: the child session runs headless with no write tool, its output saved in the record', () => {
  const line = fences(read(COMMAND_FILE)).flatMap((b) => b.lines).find((l) => l.includes('claude -p'));
  assert.notEqual(line, undefined, `${COMMAND_FILE} has no fenced child session command`);
  for (const part of ['env -u CLAUDECODE', '"/code-review <level> <merge-base>...HEAD[ <path>]"', '--model <reviewer>', '--output-format json', '--permission-mode default', '< /dev/null', '> <record>/review-<n>[-<slug>].json']) {
    assert.ok(line.includes(part), `the command lacks ${part}`);
  }
  for (const flag of ['--comment', '--fix', '--max-findings', '--dangerously-skip-permissions']) assert.ok(!line.includes(flag), `the command holds ${flag}`);
  const allowed = /--allowedTools "([^"]+)"/.exec(line);
  assert.notEqual(allowed, null, 'the command has no --allowedTools list');
  assert.equal(allowed[1], 'Read,Grep,Glob,Skill,Agent,TaskStop,Bash(git diff *),Bash(git log *),Bash(git show *),Bash(git status *),Bash(git ls-files *)[,Bash(<check>*)...]');
});

test('R305: the command hands the child its prompt unchanged, under Git Bash too', () => {
  const line = fences(read(COMMAND_FILE)).flatMap((b) => b.lines).find((l) => l.includes('claude -p')) ?? '';
  const prefix = line.slice(line.indexOf('&& ') + 3, line.indexOf('claude -p'));
  assert.ok(prefix.startsWith('env '), `the command does not start the child through env: [${prefix}]`);
  const echo = spawnSync('sh', ['-c', `${prefix}node -e "process.stdout.write(process.argv[1])" "/code-review xhigh abc...HEAD"`], { encoding: 'utf8' });
  assert.equal(echo.status, 0, echo.stderr);
  assert.equal(echo.stdout, '/code-review xhigh abc...HEAD');
});

test('R350: no file of the plugin holds a command that posts to a forge', () => {
  const files = filesUnder(GATE);
  for (const rel of ['README.md', 'skills/gate/SKILL.md', 'skills/gate/steps/4-publish.md', 'scripts/next.mjs']) assert.ok(files.includes(rel), `the scan does not reach ${rel}`);
  for (const rel of files) {
    const text = readFileSync(new URL(rel, GATE), 'utf8');
    for (const command of ['gh pr comment', 'gh pr review', 'gh pr edit', 'gh pr create', 'gh pr merge', 'gh issue comment', 'gh issue create', 'gh issue edit', 'gh api']) {
      assert.ok(!text.includes(command), `${rel} holds ${command}`);
    }
  }
});

test('R295 and R300: no git command the skill shows stashes, resets, cleans, rewrites, forces, skips hooks or stages everything', () => {
  const git = '\\bgit(?: -C \\S+)? ';
  const barred = [
    [`${git}(stash|reset|clean|rebase|cherry-pick|revert|filter-branch)\\b`, 'rewrites or discards work'],
    [`${git}commit\\b.*(--amend|--no-verify| -a\\b| -am\\b)`, 'amends, skips hooks or commits everything'],
    [`${git}add\\b.*( -A\\b| --all\\b| -u\\b| \\.( |$))`, 'stages everything'],
    [`${git}push\\b.*(--force| -f\\b|--no-verify| \\+)`, 'forces or skips hooks'],
    [`${git}merge (?!--ff-only)`, 'merges other than a fast-forward'],
    [`${git}checkout\\b.*( \\.( |$)| -f\\b| --force\\b)`, 'discards the tree'],
  ];
  for (const rel of prose()) {
    for (const span of shown(read(rel))) {
      for (const [pattern, why] of barred) assert.doesNotMatch(span, new RegExp(pattern), `${rel} shows a command that ${why}`);
    }
  }
  assert.match('git -C "<path>" reset --hard', new RegExp(barred[0][0]), 'the scan does not see a barred command');
});

test('R315: the step that ends a run shows the gate key the manifest gets', () => {
  assert.ok(read('steps/4-publish.md').includes('{"verdict": "<state>", "passes": <n>, "record": "<absolute path of passes.json>"}'));
});

test('the README names the phrases a request may hold and where the record is', () => {
  for (const needle of ['reimagine gate', 'gate PR <n>', 'gate this branch', 'gate the manifest <path>', 'no fixes', 'budget <n> minutes', 'base <branch>', '.reimagine/gate/<branch-slug>/', '/audit:run']) {
    assert.ok(README.includes(needle), `README.md lacks ${needle}`);
  }
});

test('R219: the skill stays within its word budget', () => {
  const total = prose().reduce((n, rel) => n + words(read(rel)), 0);
  assert.ok(total <= 15700, `the skill holds ${total} words, over 15700`);
});

test('R349: SKILL.md carries the two items of core.md word for word under What leaves the run', () => {
  const items = units(loadTexts()['core.md']).list.filter((u) => u.kind === 'item').map((u) => u.norm);
  const lines = section(SKILL, 'What leaves the run');
  for (const prefix of ['What leaves the session is written for its reader', 'Output stays local unless publishing']) {
    const found = items.filter((n) => n.startsWith(prefix));
    assert.equal(found.length, 1, `core.md does not hold exactly one item that starts with: ${prefix}`);
    assert.ok(lines.includes(`- ${found[0]}`), `SKILL.md lacks the core.md item that starts with: ${prefix}`);
  }
});

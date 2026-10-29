// The gate skill's frontmatter, reading block, configuration block, terminal states, supporting files and step files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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

test('R291: the reading block is one fenced block of five lines in a fixed order', () => {
  const block = fences(SKILL).find((b) => b.lines.some((l) => l.startsWith('Targets: ')));
  assert.notEqual(block, undefined, 'SKILL.md has no reading block');
  assert.equal(block.lines.length, 5);
  const heads = ['Targets: ', 'Mode: ', 'Budget: ', 'Engine: ', 'Scripts: '];
  block.lines.forEach((line, i) => assert.ok(line.startsWith(heads[i]), `line ${i + 1} does not start with ${heads[i]}`));
});

test('R289 and R300: the checks phrase is in both grammar lists and ends where another phrase starts', () => {
  assert.ok(SKILL.includes('- "checks <command>[; <command>]": '), 'SKILL.md does not list the checks phrase');
  assert.ok(README.includes('- `checks <command>[; <command>]`: '), 'README.md does not list the checks phrase');
  for (const text of [SKILL, README]) {
    assert.ok(text.includes('runs to the next comma that another recognized phrase follows'), 'the checks phrase does not end at a later phrase');
    assert.ok(!text.includes('last phrase'), 'the checks phrase is still read as the last phrase');
  }
});

test('R300: the checks come from the request, the manifest bundle or the configuration, in that order', () => {
  const order = "the request's \"checks\" phrase, else the manifest bundle's `checks`, else `.reimagine.json` `checks`";
  assert.ok(SKILL.includes(order), "SKILL.md lacks the order of the checks' sources");
  holds('steps/2-fix.md', "the run's checks");
  holds('steps/0-preflight.md', "the run's checks");
  holds('steps/1-pass.md', "one entry per command of the run's checks");
  holds('report.md', 'the source of the checks');
});

test('R311 and R317: each review keeps its notes in passes.json and the Log prints them', () => {
  const lines = jsonAfter(read('record.md'), '`passes.json`:');
  assert.ok(lines.some((l) => l.includes('"reviews": [') && l.includes('"denials": 2, "notes": ')), 'the reviews literal of record.md has no notes key');
  holds('steps/1-pass.md', '"notes": "<notes.before>"');
  holds('report.md', 'denial count and notes, from `reviews[]`');
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
  assert.deepEqual(supporting(), [
    'record.md', 'report.md', 'steps/0-preflight.md', 'steps/1-pass.md', 'steps/2-fix.md', 'steps/3-next.md', 'steps/4-publish.md',
  ]);
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

test('R291: Step 0 is read after the reading block and takes its five lines', () => {
  assert.ok(SKILL.includes('After the block, read `steps/0-preflight.md` and start Step 0.'));
  const text = holds('steps/0-preflight.md', 'before any other tool call', 'does not print the block again');
  assert.ok(text.startsWith('# Step 0: Preflight\n'));
  for (const heading of ['Targets', 'Mode', 'Budget', 'Engine', 'Scripts']) assert.ok(text.includes(heading), `Step 0 does not name ${heading}`);
});

test('R318: the scripts run by the path of the Scripts line, never by the plugin root variable', () => {
  assert.ok(SKILL.includes('`${CLAUDE_PLUGIN_ROOT}` is not a shell variable'), 'SKILL.md does not say the variable is not a shell variable');
  assert.ok(SKILL.includes('two levels above it, then `scripts`'), 'SKILL.md does not say how the Scripts line is resolved');
  for (const rel of supporting()) assert.ok(!read(rel).includes('${CLAUDE_PLUGIN_ROOT}'), `${rel} holds \${CLAUDE_PLUGIN_ROOT}`);
  holds('steps/1-pass.md', 'node "<scripts>/findings.mjs"');
  holds('steps/3-next.md', 'node "<scripts>/next.mjs"');
});

test('R309: Step 0 excludes the record through git rev-parse --git-path info/exclude, never .gitignore', () => {
  holds('steps/0-preflight.md', 'git rev-parse --git-path info/exclude', 'git check-ignore -q .reimagine/', 'append `.reimagine/`', 'never `.gitignore`');
});

test('R292: Step 0 fetches the base and the head with the explicit refspec and keeps the merge-base as a full sha', () => {
  holds('steps/0-preflight.md', '+refs/heads/<b>:refs/remotes/<r>/<b>', '+refs/heads/<head>:refs/remotes/<r>/<head>', 'git merge-base', 'full sha', 'base <branch>');
});

test('R292: a branch target takes the request\'s base, then the bundle\'s, then the configuration\'s, then the default', () => {
  const order = '"base <branch>" in the request, else the manifest bundle\'s `base`, else `.reimagine.json` `base`, else the remote\'s default branch';
  assert.ok(SKILL.includes(order), 'SKILL.md lacks the base order');
  holds('steps/0-preflight.md', order);
});

test('R292: a bundle base written as <remote>/<branch> is read as the branch', () => {
  const strip = "A bundle `base` whose first segment names a remote that `git remote` lists in the bundle's repository is read without that segment and its `/`";
  assert.ok(SKILL.includes(strip), 'SKILL.md lacks the remote prefix rule');
  holds('steps/0-preflight.md', strip, '`origin/main` is read as `main`');
});

test('R297: a pass over split groups by path at the shallowest depth that gives more than one group', () => {
  const phrase = 'by path at the shallowest depth that gives more than one group';
  holds('steps/1-pass.md',
    phrase,
    'The depth `d` starts at 1; a file\'s key is its first `d` segments when it has more than `d` segments, else the key `.`; while every file has the same key and some file has more than `d` segments, `d` grows by one.',
    'the `.` key\'s slug is `root` at depth 1 and `<prefix slug>-root` deeper',
    'For example, a diff of `src/api/a.ts`, `src/web/b.ts` and `src/index.ts` has the one key `src` at depth 1, so it splits at depth 2 into `src/api` (slug `src-api`), `src/web` (slug `src-web`) and the `.` key holding `src/index.ts` (slug `src-root`).');
  holds('record.md', phrase);
  assert.ok(SKILL.includes(phrase), 'SKILL.md lacks the depth phrase');
  assert.ok(README.includes(phrase), 'README lacks the depth phrase');
  for (const [name, text] of [['SKILL.md', SKILL], ['README.md', README], ...supporting().map((rel) => [rel, read(rel)])]) {
    assert.ok(!text.includes('top-level path'), `${name} still splits by top-level path`);
  }
});

test('R302: a match takes what the script gives a returning entry of the candidate\'s state', () => {
  holds('steps/1-pass.md', '`fix` and `regressed` for a fixed one, `reject` and `carried` for a rejected or carried one, `defer` and `deferred` for a deferred one, and for a regressed one no bucket, its state staying `regressed`');
  holds('record.md', 'A regressed entry that returns keeps the state `regressed` and gets no bucket');
});

test('R297: two keys of one pass never share a slug', () => {
  const rule = 'The slugs are given in byte order of key path with the `.` key last, and a slug an earlier key already holds takes `-2`, else `-3`, and so on, the first one free.';
  holds('steps/1-pass.md', rule, 'so `src/root` keeps `src-root` and the `.` key takes `src-root-2`');
  holds('record.md', 'a slug an earlier key of the pass holds takes `-2`, else `-3`, and so on');
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

// The lines inside the fenced blocks of a text.
const fencedLines = (text) => fences(text).flatMap((b) => b.lines);

const COMMAND =
  'cd <repo root> && env -u CLAUDECODE MSYS_NO_PATHCONV=1 claude -p "/code-review <level> <merge-base>...HEAD[ <path>]" --output-format json --permission-mode default --allowedTools "Read,Grep,Glob,Skill,Agent,TaskStop,Bash(git diff *),Bash(git log *),Bash(git show *),Bash(git status *),Bash(git ls-files *)[,Bash(<check>*)...]" < /dev/null > <record>/review-<n>[-<slug>].json';

test('R305: Step 1 holds the child session command as one fenced line', () => {
  const text = holds('steps/1-pass.md', 'run_in_background');
  assert.ok(text.startsWith('# Step 1: A pass\n'));
  assert.ok(fencedLines(text).includes(COMMAND), 'Step 1 lacks the command literal');
});

test('R305: the command unsets CLAUDECODE, reads stdin from /dev/null and allows only the review tools', () => {
  const line = fencedLines(read('steps/1-pass.md') ?? '').find((l) => l.includes('claude -p')) ?? '';
  for (const word of [
    'Read', 'Grep', 'Glob', 'Skill', 'Agent', 'TaskStop',
    'Bash(git diff *)', 'Bash(git log *)', 'Bash(git show *)', 'Bash(git status *)', 'Bash(git ls-files *)',
    '--permission-mode default', 'env -u CLAUDECODE', '< /dev/null', '--output-format json',
  ]) {
    assert.ok(line.includes(word), `the command lacks ${word}`);
  }
});

test('R305: the command hands the child its prompt unchanged, under Git Bash too', () => {
  const line = fencedLines(read('steps/1-pass.md') ?? '').find((l) => l.includes('claude -p')) ?? '';
  const prefix = line.slice(line.indexOf('&& ') + 3, line.indexOf('claude -p'));
  assert.ok(prefix.startsWith('env '), `the command does not start the child through env: [${prefix}]`);
  const echo = spawnSync('sh', ['-c', `${prefix}node -e "process.stdout.write(process.argv[1])" "/code-review xhigh abc...HEAD"`], {
    encoding: 'utf8',
  });
  assert.equal(echo.status, 0, echo.stderr);
  assert.equal(echo.stdout, '/code-review xhigh abc...HEAD');
});

test('R299: Step 1 names the three buckets', () => {
  holds('steps/1-pass.md', '`fix`', '`defer`', '`reject`');
});

test('R296: nothing is edited while a review runs', () => {
  holds('steps/1-pass.md', 'Nothing is edited while a review runs.');
});

test('R300: Step 2 takes the three snapshot files before each implementer call and restores only clean paths', () => {
  const text = holds('steps/2-fix.md', 'pre-<n>.status', 'pre-<n>.patch', 'pre-<n>.hashes', 'models.implementer', '20 minutes', 'never touch an ignored path or anything under `.reimagine/`');
  assert.ok(text.startsWith('# Step 2: The fix round\n'));
});

test('R300 and R303: Step 2 runs the checks one at a time for 15 minutes and fixes a failing one at most three times', () => {
  holds('steps/2-fix.md', 'one command at a time', '15 minutes', 'three times', '`denied`', 'no `checks` key');
});

test('R300: Step 2 stages each path by name and never stages everything', () => {
  const text = holds('steps/2-fix.md', 'git add -- <path>');
  for (const form of ['git add -A', 'git add --all', 'git add .', 'git commit -a']) {
    assert.ok(!text.includes(form), `steps/2-fix.md holds ${form}`);
  }
});

test('R11: Step 2 types no attribution trailer of its own and keeps the host\'s', () => {
  holds('steps/2-fix.md', 'The commit message follows it and names no model, agent or tool. Type no attribution trailer of your own, and keep one the host\'s attribution setting adds, even where it names a model or tool.');
});

test('R295: Step 2 reads the remote head with git ls-remote and compares it before every push', () => {
  holds('steps/2-fix.md', 'git ls-remote', 'what preflight fetched', 'the last sha this run pushed', 'no force');
});

test('R301: Step 2 judges the fix round with the five change kinds next.mjs accepts', () => {
  holds('steps/2-fix.md', '`inside-diff`', '`outside-diff`', '`exported-signature`', '`schema-or-migration`', '`over-quarter`');
});

test('R301: Step 2 counts the files for over-quarter instead of judging the share', () => {
  holds('steps/2-fix.md', 'Count both lists: it applies when four times the number of changed files is more than the number of that diff\'s files, so 2 changed of 4 is over a quarter and 2 of 8 is not.');
});

// The lines of the first fenced json block after the line `marker`, or null.
const jsonAfter = (text, marker) => {
  if (text === null) return null;
  const lines = text.split('\n');
  const at = lines.indexOf(marker);
  if (at < 0) return null;
  const start = lines.findIndex((l, i) => i > at && l === '```json');
  const end = lines.findIndex((l, i) => i > start && l === '```');
  return start < 0 || end < 0 ? null : lines.slice(start + 1, end);
};

test('R311: record.md holds the passes.json literal of the architecture, line for line', () => {
  const arch = jsonAfter(readFileSync(new URL('../../docs/architecture.md', import.meta.url), 'utf8'), '`passes.json`:');
  assert.notEqual(arch, null, 'architecture.md has no passes.json block');
  assert.equal(arch.length, 17);
  assert.equal(arch[0], '{');
  assert.ok(arch.includes('  "merge_base": "<sha>",'));
  assert.deepEqual(jsonAfter(read('record.md'), '`passes.json`:'), arch);
});

test('R301 and R303: Step 3 names the five rules of next.mjs, the two caps and the no-fixes stop', () => {
  holds('steps/3-next.md', '`nothing-to-fix`', '`after-medium`', '`wide-fix`', '`rejects-at-high`', '`otherwise`', '`max-passes`', '`budget`', '`no-fixes`');
});

test('R312: Step 3 resumes a record by its head and merge-base', () => {
  const text = holds('steps/3-next.md', '## Resume');
  const resume = text.slice(text.indexOf('## Resume'));
  for (const phrase of ['the first pass not `complete`', '`max-passes` counted afresh', 'a new pass sequence at `xhigh`', 'the ledger kept', 'merge-base']) {
    assert.ok(resume.includes(phrase), `Resume lacks ${phrase}`);
  }
});

test('decision 130: a pass of the run, not of the record, decides pass-with-deferred', () => {
  assert.ok(SKILL.includes('`pass-with-deferred` when any pass of the run deferred something'));
});

test('R311: Step 0 marks a run entry an earlier run left running as interrupted', () => {
  holds('steps/0-preflight.md', '"state": "interrupted"');
  holds('record.md', '`interrupted`');
});

test('R316: the skill runs a pass, and every terminal state reads Step 4', () => {
  assert.ok(!/prerelease|cannot run a pass/i.test(SKILL), 'SKILL.md still says it cannot run a pass');
  assert.ok(SKILL.includes('Every terminal state reads `steps/4-publish.md`'));
});

const DENY = ['Claude', 'Anthropic', 'Opus', 'Sonnet', 'Haiku', 'Fable', 'model', 'agent', 'subagent', 'LLM', 'AI',
  'code-review', 'child session', 'stand-in', 'Skill', 'TaskStop', 'Bash', '.reimagine'];
const wholeWord = (w) => new RegExp(`(?<![A-Za-z0-9_-])${w.replace('.', '[.]')}(?![A-Za-z0-9_-])`, 'i');

test('R314: the comment template is one fenced block with no deny word, and Step 4 lists every deny word', () => {
  const text = holds('steps/4-publish.md', 'gh pr comment <number> --body-file <absolute path>', '`blocked` and `stopped` post nothing');
  const blocks = fences(text).filter((b) => b.lines[0]?.startsWith('Gate verdict:'));
  assert.equal(blocks.length, 1, 'expected one fenced block that starts with "Gate verdict:"');
  const body = blocks[0].lines.join('\n');
  for (const w of DENY) assert.ok(!wholeWord(w).test(body), `the comment template holds ${w}`);
  for (const w of DENY) assert.ok(text.includes(`\`${w}\``), `steps/4-publish.md does not list ${w}`);
});

test('R314: the comment writes the home directory as ~ in text quoted from a review', () => {
  holds('steps/4-publish.md', 'except that the user\'s home directory in it is written `~`', 'the drive letter in either case, or the `/c/` form of Git Bash');
});

test('R315: Step 4 holds the minimal manifest literal and the gate key shape', () => {
  holds(
    'steps/4-publish.md',
    '{"bundles":[{"repo":"<absolute path>","pr":"github:<owner>/<repo>#<n>","tickets":[]}],"claims":[],"gate":{...}}',
    '{"verdict": "<state>", "passes": <n>, "record": "<absolute path of passes.json>"}',
  );
});

test('R316: Step 4 names the five terminal states', () => {
  holds('steps/4-publish.md', '`pass`', '`pass-with-deferred`', '`unconverged`', '`blocked`', '`stopped`');
});

test('the README describes a run: no prerelease notice, the use phrases, the five states, the record and the manifest', () => {
  assert.ok(!/prerelease|cannot run a pass/i.test(README), 'README.md still says it cannot run a pass');
  for (const needle of [
    'reimagine gate', 'gate PR <n>', 'gate this branch', 'gate the manifest <path>', 'no fixes', 'budget <n> minutes', 'base <branch>',
    '`pass`', '`pass-with-deferred`', '`unconverged`', '`blocked`', '`stopped`',
    '.reimagine/gate/<branch-slug>/', 'passes.json', 'findings.json', 'report.md', '/audit:run',
  ]) {
    assert.ok(README.includes(needle), `README.md lacks ${needle}`);
  }
});

test('R317: report.md holds the report header line for line and its seven sections in order', () => {
  const block = fences(holds('report.md')).find((b) => b.lines[0] === '# gate report');
  assert.notEqual(block, undefined, 'report.md has no fenced block that starts with "# gate report"');
  assert.deepEqual(block.lines.slice(0, 14), [
    '# gate report',
    '',
    '- Run number: <n>',
    '- Branch: <branch>',
    '- Record: <absolute path of the record directory | none written>',
    '- Terminal state: <pass | pass-with-deferred | unconverged | blocked | stopped>',
    '- Base: <remote>/<branch>',
    '- Merge-base: <sha | none>',
    '- Targets: <github:<owner>/<repo>#<n> (<link>) | the branch <name>>',
    '- Run budget: <minutes> (<request | .reimagine.json | session instruction | default>); elapsed <minutes>',
    '- Passes: <n> at <level> (<rule>), ... | none',
    '- Engine: <subprocess | stand-in (<reason>)>',
    '- Review level: your interactive code-review level is as it was; this run typed no level in this session',
    '- Audit: /audit:run "<absolute path of the manifest>" (the command needs the audit plugin) | not suggested (<reason>)',
  ]);
  assert.deepEqual(block.lines.filter((l) => l.startsWith('## ')), [
    '## Findings', '## Checks', '## Commits and pushes', '## Open findings', '## Blocked or stopped', '## Comment', '## Log',
  ]);
});

test('R317: Step 4 prints the written report whole as the last text, with nothing after it', () => {
  holds('steps/4-publish.md', 'print the whole text of the report, unchanged, as the last text of this target', 'Nothing follows it: no summary, note or offer.');
});

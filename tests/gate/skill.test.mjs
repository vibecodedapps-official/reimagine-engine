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
    gate: { split: 1500, 'max-passes': 4, budget: 120, timeouts: { subagent: 20, review: 30, check: 15 }, models: { implementer: 'sonnet', 'fallback-reviewer': 'opus' } },
  });
});

test('R313: the timeouts key is described and falls back to the root timeouts in SKILL.md and the README', () => {
  for (const [name, text] of [['SKILL.md', SKILL], ['README.md', README]]) {
    for (const key of ['subagent', 'review', 'check']) assert.ok(text.includes(`\`${key}\``), `${name} does not describe timeouts.${key}`);
    assert.ok(text.includes('takes the root `.reimagine.json` `timeouts` value of the same name, then the default'), `${name} does not state the fallback to the root timeouts`);
  }
  assert.ok(SKILL.includes('`split`, `max-passes` and `budget` are whole numbers of 1 or more. `timeouts` holds positive numbers.'), 'SKILL.md does not validate timeouts');
});

test('R303: the step files state no fixed minutes for a review, an implementer call or a check', () => {
  for (const rel of supporting().filter((r) => r.startsWith('steps/'))) {
    const text = read(rel);
    for (const literal of ['20 minutes', '30 minutes', '15 minutes', '20-minute', '30-minute', '15-minute']) assert.ok(!text.includes(literal), `${rel} still holds: ${literal}`);
  }
  holds('steps/1-pass.md', 'The review budget is');
});

test('R291 and R313: the Budget line names the subagent, review and check budgets after max-passes and split', () => {
  const block = fences(SKILL).find((b) => b.lines.some((l) => l.startsWith('Targets: ')));
  assert.notEqual(block, undefined, 'SKILL.md has no reading block');
  const line = block.lines.find((l) => l.startsWith('Budget: '));
  assert.equal(line, 'Budget: 120 minutes (default); max-passes 4; split 1500; subagent 20, review 30, check 15 minutes (default)');
  assert.ok(SKILL.includes('then the subagent, review and check budgets in force, each with its source (`gate.timeouts`, root `timeouts`) when it is not the default'), 'SKILL.md does not describe the Budget line');
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

test('R289 and R323: the repo phrase is in both grammar lists and is checked as the toplevel of its path', () => {
  assert.ok(SKILL.includes('- "repo <path>": '), 'SKILL.md does not list the repo phrase');
  assert.ok(README.includes('- `repo <path>`: '), 'README.md does not list the repo phrase');
  assert.ok(SKILL.includes('`git -C <path> rev-parse --is-inside-work-tree --show-prefix` exits 0 and prints `true` and then an empty line, else the target is unresolved, since a `.git` folder prints `false` with an empty prefix'), 'SKILL.md lacks the toplevel check');
  assert.ok(!SKILL.includes('`git -C <path> rev-parse --show-prefix` exits 0 and prints an empty line'), 'SKILL.md still accepts a .git folder');
  assert.ok(SKILL.includes('The check compares no strings, so a path typed in another case, with `~` or as `/c/...` resolves'), 'SKILL.md lacks the statement that the check compares no strings');
  assert.ok(SKILL.includes('`git -C <path> rev-parse --show-toplevel` gives the toplevel the Targets line names'), 'SKILL.md does not take the toplevel from --show-toplevel');
  assert.ok(!SKILL.includes('compared as absolute paths with forward slashes'), 'SKILL.md still compares the path as a string');
  assert.ok(SKILL.includes('and for "repo <path>" the `git -C <path> rev-parse` calls, which may prompt, since the skill pre-approves only the plain forms'), 'SKILL.md does not list the git -C calls among those made before the reading block');
  assert.ok(SKILL.includes('Beside a pull request or manifest target, "repo <path>" is one unresolved line'), 'SKILL.md lacks the unresolved rule beside a pull request or manifest target');
  assert.ok(SKILL.includes('a branch target named by "repo <path>" shows its resolved toplevel'), 'SKILL.md does not put the toplevel on the Targets line');
});

test('R323: a target named by repo runs its commands in the forms of a manifest bundle', () => {
  const text = holds('steps/0-preflight.md', 'A branch target named by "repo <path>" runs the same way: `git -C <path>`, and `cd <path> && <command>` in one Bash call for gh, the child session and the run\'s checks, with absolute paths.');
  assert.ok(text.includes('Those forms, and a manifest bundle\'s, count as prompts'), 'the permission statement does not count the forms as prompts');
  assert.ok(text.includes('read it with `git -C <path> rev-parse --abbrev-ref HEAD`'), 'the head is not read in the named repository');
  assert.ok(text.includes('For a manifest bundle or "repo <path>", read the repository\'s instruction files in its `repo` or in `<path>`, not in the session\'s folder'), '0.3 does not read the instruction files in the target');
  assert.ok(text.includes('for a manifest bundle or "repo <path>", read it in its `repo` or in `<path>`'), '0.3 does not read .reimagine.json in the target');
  holds('steps/2-fix.md', 'for a manifest bundle or "repo <path>", run each check as `cd <path> && <check>` in one Bash call, with `<path>` the bundle\'s `repo` or the path of "repo <path>"');
  assert.ok(SKILL.includes('for "repo <path>" it is the `.reimagine.json` of `<path>`, not of the session\'s folder'), 'SKILL.md Configuration reads the session\'s .reimagine.json');
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

test('R309: the record is excluded through git rev-parse --git-path info/exclude read relative to the repository, never .gitignore', () => {
  const lookup = 'git rev-parse --git-path info/exclude';
  const relative = 'read relative to the repository\'s folder when it is not absolute';
  holds('steps/0-preflight.md', lookup, relative, 'git check-ignore -q .reimagine/', 'append `.reimagine/`', 'never `.gitignore`');
  holds('record.md', lookup, relative);
  assert.ok(SKILL.includes(lookup) && SKILL.includes(relative), 'SKILL.md lacks the relative reading of the exclude path');
  for (const text of [SKILL, ...supporting().map(read)]) assert.ok(!text.includes('--path-format'), 'a gate file still needs --path-format, which git before 2.31 lacks');
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

test('R297: a group still over split is grouped again one segment deeper and its slugs follow the final keys', () => {
  holds('steps/1-pass.md',
    'After grouping, a group still over `split` whose key is a directory is grouped again by the same rule over its own files, its depth starting one segment deeper and growing while all of them share one key, and so on until no group is over `split` or the group over it cannot split, being the `.` key or one file.',
    'A regrouping that gives a single group, as when every file of the group sits directly in its directory, leaves the group as it was, under its directory key, target and slug.',
    'a `src/api` group that holds only `src/api/a.ts` and `src/api/b.ts` stays the one group `src/api`, slug `src-api`, target `<merge-base>...HEAD src/api`.',
    'Suppose the `src/api` group is itself over `split` and holds `src/api/v1/x.ts`, `src/api/v2/y.ts` and `src/api/index.ts`: it is grouped again at depth 3 into `src/api/v1` (slug `src-api-v1`), `src/api/v2` (slug `src-api-v2`) and the `.` key holding `src/api/index.ts` (slug `src-api-root`).',
    'The slugs are made from the final keys: a `.` key made by grouping a directory key `<k>` again has the prefix `<k>`, and when several `.` keys remain they come after every directory key, in byte order of their prefixes.');
  const gone = 'A group that alone is over `split` is still one review';
  for (const [name, text] of [['SKILL.md', SKILL], ['README.md', README], ...supporting().map((rel) => [rel, read(rel)])]) {
    assert.ok(!text.includes(gone), `${name} still holds: ${gone}`);
  }
  holds('record.md', 'a group still over `split` is grouped again one segment deeper');
  assert.ok(SKILL.includes('a group still over `split` is grouped again one segment deeper'), 'SKILL.md lacks the regrouping');
  assert.ok(README.includes('a group still over `split` is grouped again one segment deeper'), 'README.md lacks the regrouping');
});

test('R302: a match takes what the script gives a returning entry of the candidate\'s state', () => {
  holds('steps/1-pass.md', '`fix` and `regressed` for a fixed one, `reject` and `carried` for a rejected or carried one, `defer` and `deferred` for a deferred one, and for a regressed one no bucket, its state staying `regressed`');
  holds('record.md', 'A regressed entry that returns keeps the state `regressed` and gets no bucket');
  holds('record.md', 'When a `new` finding and one of its `candidates` are one defect worded two ways, you may match them as Step 1.6 says');
  assert.ok(!read('record.md').includes('an earlier fixed or rejected entry'), 'record.md still limits a match to fixed or rejected entries');
});

test('R302 and R306: the match is written with the bucket and state, and a match without its link is warned about', () => {
  holds('steps/1-pass.md', 'its `match`, `{"of": "<earlier id>", "reason": "<why>"}`, and the bucket and state of item 2 go in this same write', 'findings: warning:');
  holds('record.md', 'with no `match`');
});

test('R306: Step 1.6 runs findings.mjs --check after each triage write and the repair keys the finding under the earlier id', () => {
  holds('steps/1-pass.md',
    'node "<scripts>/findings.mjs" --check <record>/findings.json',
    'key the finding under the earlier id in the pass\'s `findings` of `passes.json`',
    'move that finding in the `findings` of that earlier pass in `passes.json` under the earlier id');
  holds('record.md', '`--check`');
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

test('R294: the gate reads the instruction files of one directory only and the statement names it', () => {
  const rule = 'in `$CLAUDE_CONFIG_DIR` when it is set, else in `~/.claude`, never both';
  const step = holds('steps/0-preflight.md', rule, 'since the session loads only that directory\'s instruction files', 'the instruction directory read, by name', 'Instruction directory read: ~/.claude.');
  const skill = holds('SKILL.md', rule);
  for (const text of [step, skill]) {
    assert.ok(!text.includes('(else `~/.claude`)'), 'the old parenthesis is still there');
    assert.ok(!text.includes('in `$CLAUDE_CONFIG_DIR`, else `~/.claude`'), 'the old wording is still there');
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
  const text = holds('steps/2-fix.md', 'pre-<n>.status', 'pre-<n>.patch', 'pre-<n>.hashes', 'models.implementer', 'the subagent budget', 'never touch an ignored path or anything under `.reimagine/`');
  assert.ok(text.startsWith('# Step 2: The fix round\n'));
  for (const old of ['Each call has 20 minutes', 'the 20-minute budget', 'The budget: 20 minutes']) assert.ok(!text.includes(old), `steps/2-fix.md still holds: ${old}`);
});

test('R300: Step 2 judges an implementer call by its notification duration_ms and bars a background command', () => {
  holds('steps/2-fix.md',
    'before and after each implementer call, or before and after a parallel batch, and each check',
    'A call is judged against the subagent budget by the `duration_ms` of its completion notification, and by the `date` outputs only when the notification carries none, since a batch\'s briefs are written before any call starts.',
    'A notification for a call the gate did not send, after that call already returned, is not a new call: Snapshots, item 8, says how it is judged.',
    'or start a background command, since one that finishes after the call returns wakes it again',
    'After a failed call (Groups, item 4)');
  holds('report.md', "its `duration_ms` from the completion notification");
});

test('R300: Step 2 judges a late notification against the call\'s post-<n> files', () => {
  const text = holds('steps/2-fix.md', '## Snapshots');
  const start = text.indexOf('## Snapshots');
  const end = text.indexOf('\n## ', start + 1);
  const snaps = text.slice(start, end);
  assert.ok(snaps.includes('post-<n>.status'));
  assert.ok(snaps.includes('post-<n>.hashes'));
  assert.ok(snaps.includes('ends the run `blocked` naming the path'));
  assert.ok(!text.includes('unless the snapshot comparison finds the tree changed after the first return'));
  holds('record.md', '`post-<n>.status`, `post-<n>.hashes`', '`post-<n>` shares its call\'s number');
});

test('R300 and R303: Step 2 runs the checks one at a time within the check budget and fixes a failing one at most three times', () => {
  const text = holds('steps/2-fix.md', 'one command at a time', 'the check budget', 'three times', '`denied`', 'no `checks` key');
  for (const old of ['each with 15 minutes', 'the 15-minute budget']) assert.ok(!text.includes(old), `steps/2-fix.md still holds: ${old}`);
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

test('R303: a check whose budget is over the foreground limit runs in the background and is stopped at expiry', () => {
  holds('steps/2-fix.md', 'A check whose budget is over 10 minutes, the foreground limit of the shell, runs with `run_in_background` and is stopped with TaskStop when the budget expires.');
});

test('R317: the Log gives each implementer call its notification duration and the date pair of its call or batch', () => {
  holds('report.md', "each implementer call with its group's files and its `duration_ms` from the completion notification, and the `date -u` outputs Step 2 kept before and after that call or its parallel batch");
});

test('R306: the repair of a warning takes the earlier id from passes.json, else from the reason, else leaves the entry', () => {
  holds('steps/1-pass.md', 'the earlier id being the one that pass\'s `findings` in `passes.json` already keys the finding under, else the one its reason names; with neither, leave the entry as it is and name it in the Log');
});

test('R300: the snapshot items read each path from a status line unquoted and take the new path of a rename', () => {
  holds('steps/2-fix.md', 'Read each path from a status line unquoted and unescaped when status prints it in double quotes, and for a rename (`old -> new`) take the new path.', 'each path read as item 1 says');
});

// The primer skill files: the directory contents, the frontmatter, the mode and write rules, the line cap, the shapes and the placement items.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const DIR = new URL('../../plugins/primer/skills/primer/', import.meta.url);
const SKILL = readFileSync(new URL('SKILL.md', DIR), 'utf8');
const INIT = readFileSync(new URL('init.md', DIR), 'utf8');
const ADOPT = readFileSync(new URL('adopt.md', DIR), 'utf8');
const SHAPES = readFileSync(new URL('shapes.md', DIR), 'utf8');
const PLACEMENT = readFileSync(new URL('placement.md', DIR), 'utf8');

function lineCount(text) {
  if (text === '') return 0;
  const newlines = text.split('\n').length - 1;
  return newlines + (text.endsWith('\n') ? 0 : 1);
}

test('R237: the skill directory holds SKILL.md, adopt.md, init.md, placement.md and shapes.md only', () => {
  assert.deepEqual(readdirSync(DIR).sort(), ['SKILL.md', 'adopt.md', 'init.md', 'placement.md', 'shapes.md']);
});

test('R245: the frontmatter names the skill, the four phrases first, and read-only tools', () => {
  const lines = SKILL.split(/\r?\n/);
  assert.equal(lines[0], '---');
  const end = lines.indexOf('---', 1);
  assert.ok(end > 1, 'the frontmatter has a closing ---');
  const front = lines.slice(1, end);
  assert.ok(front.includes('name: primer'));
  const description = front.find((l) => l.startsWith('description:'));
  assert.ok(description, 'a description line exists');
  const value = description.slice('description:'.length).trim().replace(/^'/, '');
  assert.ok(value.startsWith('Use when the user says "turn this into a skill", "we keep doing this", "add this to the project instructions" or "check the instruction files"'));
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

test('R245: the mode is the first line, chosen from the files on disk', () => {
  assert.ok(SKILL.includes('- The first line of the reply, before any read beyond what choosing needs and before any write, is exactly `primer: mode <init|adopt|maintain> (<one-line reason>)`, with no text before it.'));
  assert.ok(SKILL.includes('The mode is chosen from the files on disk, ignored ones included.'));
  assert.ok(SKILL.includes('- A mode named after the command (`/primer adopt`) forces it. A forced `init` never writes over an existing `CLAUDE.md` or `AGENTS.md`: say so and stop.'));
  assert.ok(SKILL.includes('- Otherwise find the hub: the root `CLAUDE.md`; the root `AGENTS.md` when the root `CLAUDE.md` is exactly `@AGENTS.md` plus at most one newline; the root `AGENTS.md` when there is no root `CLAUDE.md`. Read these files from disk, never from the copy loaded at session start, which drops HTML comments, the marker included. Then, in order: the hub\'s line 1 is exactly `<!-- primer -->` and no line of it is exactly `## Spokes`: `maintain`. Else any `CLAUDE.md` or `AGENTS.md` exists at any depth, `.claude/CLAUDE.md` included: `adopt`. Else: `init`.'));
});

test('R246 and R247: the write boundary and the commit rules', () => {
  assert.ok(SKILL.includes('- Writes are documentation files only: `CLAUDE.md` and `AGENTS.md` at any depth, `.claude/rules/**`, `.claude/skills/**`, `README.md`, and Markdown under `docs/`.'));
  assert.ok(SKILL.includes('- Never edit code, configuration, settings, CI files, package manifests, `CLAUDE.local.md`, anything git ignores, or the auto memory directory. The exceptions are a memory note the user approves for deletion in its own question, and the review stamp of Maintain step 3.'));
  assert.ok(SKILL.includes('- Never install a git hook and never write a linter rule, a test or a hook.'));
  assert.ok(SKILL.includes('else `docs(primer): <subject>` in lowercase. The body\'s first line is `Instruction-file <mode> pass, <YYYY-MM-DD>.`, followed by why.'));
  assert.ok(SKILL.includes('- Stage only the paths the plan names, by path. Never push, amend, or pass `--no-verify`.'));
  assert.ok(SKILL.includes('A commit message never names a model, an agent or a tool. Type no attribution trailer of your own, and keep one the host\'s attribution setting adds, even where it names a model or tool.'));
  assert.ok(!SKILL.includes('carries no `Co-Authored-By`'));
});

test('R248 and R247: init reads the repository, writes the hub uncommitted, proposes, and names /init', () => {
  assert.ok(INIT.includes('2. Read `README.md`, package manifests and build files (their scripts and targets), CI workflows, the test layout, the top-level directories, `CONTRIBUTING.md`, and the files under `docs/` with their line counts.'));
  assert.ok(INIT.includes('Leave it uncommitted and unstaged.'));
  assert.ok(INIT.includes('Ask once which to write, by number. Write none without a yes; on a yes, write the ones named, uncommitted.'));
  assert.ok(INIT.includes('`/init` is the host\'s unopinionated alternative: it writes a `CLAUDE.md` from its own reading of the repository, without the marker or these shapes.'));
  assert.ok(!SKILL.includes('primer: init is not in this prerelease'));
});

test('R249: adopt inventories, keeps pinned files, converts an index, moves before rewrites, and asks once', () => {
  assert.ok(ADOPT.includes('3. Refactor a file only when it is over its cap, holds content for two scopes, or duplicates another. Every other file stays as it is.'));
  assert.ok(ADOPT.includes('A link from a documentation file does not pin.'));
  assert.ok(ADOPT.includes('a pointer whose condition is a file pattern becomes a path-scoped rule with that pattern in `paths`; one whose condition is a task becomes a skill; one whose condition is a directory becomes a nested `CLAUDE.md` in it.'));
  assert.ok(ADOPT.includes('A procedure in `CONTRIBUTING.md` is proposed as a skill, and `CONTRIBUTING.md` stays as it is.'));
  assert.ok(ADOPT.includes('Correct an untrue statement in the rewrite that holds it.'));
  assert.ok(SKILL.includes('On the yes, make the move commit first: the `git mv` of each move and the path edits of documentation links to the moved files, index lines included, and nothing else, so no commit leaves a broken link.'));
  assert.ok(!SKILL.includes('primer: adopt is not in this prerelease'));
});

test('R250 and R251: maintain verifies against the code, prints no drift, and names /doctor prompt-audit', () => {
  assert.ok(SKILL.includes('- a statement in `README.md`, `CONTRIBUTING.md` or a `docs/` page that the code makes untrue is reported, never rewritten by this pass;'));
  assert.ok(SKILL.includes('- two instruction files that contradict each other are reported, never resolved by this pass, since `/doctor prompt-audit` checks contradictions.'));
  assert.ok(SKILL.includes('- each command the hub or a nested `CLAUDE.md` names exists in a manifest, script or workflow and does what its line says;'));
  assert.ok(SKILL.includes('- each statement of the hub, a rule, a nested file or a skill is true of the files it covers: the names, paths and behavior it states exist;'));
  assert.ok(SKILL.includes('- a skill whose procedure the repository lacks is reported, never deleted;'));
  assert.ok(SKILL.includes('6. With nothing to change, print `primer: no drift`, then one line per reported item as `- <item>: <why>`, and write nothing in the repository.'));
  assert.ok(SKILL.includes('`/doctor prompt-audit` checks the instruction files for contradictions and stale model names; run it yourself when you want that check.'));
  assert.ok(!SKILL.includes('primer: maintain is not in this prerelease'));
});

test('R256 and R257: promote reads auto memory by type, proposes per note, and writes the stamp', () => {
  assert.ok(SKILL.includes('3. Promote auto memory. Its directory is the one the session\'s instructions name for auto memory; else the `autoMemoryDirectory` of `.claude/settings.local.json`, `.claude/settings.json` or `<config>/settings.json`, the first file that sets it deciding, and a value that is not an absolute or `~/` path counting as unset; else `<config>/projects/<name>/memory/` when `$CLAUDE_CONFIG_DIR` and `$CLAUDE_CODE_PROJECT_DIR_NAME` are both set and the name is 1 to 64 letters, digits, `-` or `_` and not a Windows device name such as `con`; else `<config>/projects/<key>/memory/`: `<config>` is `$CLAUDE_CONFIG_DIR`, else `~/.claude`; `<key>` is the main worktree\'s root, the parent of `git rev-parse --path-format=absolute --git-common-dir`, with every character outside `A-Za-z0-9` replaced by `-`. Without that directory, skip this step. Read `MEMORY.md` and each topic file it lists, taking `type` and `modified` from the frontmatter\'s `metadata`, and propose in the memory note form of Proposals:'));
  assert.ok(SKILL.includes('   - a `feedback` note about this repository\'s code or conventions, placed by `placement.md`; one about how the user works stays;'));
  assert.ok(SKILL.includes('   - a `project` note with no date, as a rule or a `docs/` page; a dated or ongoing item stays;'));
  assert.ok(SKILL.includes('   - a `reference` note a teammate would need, as a sentence in the hub\'s opening paragraph;'));
  assert.ok(SKILL.includes('   - never a note an instruction file already holds, and never a `user` note.'));
  assert.ok(SKILL.includes('Once these proposals are answered, or when there are none, write the stamp `${CLAUDE_PLUGIN_DATA}/reviewed/<key>`, creating its directory: one line, the UTC time as `date -u +%Y-%m-%dT%H:%M:%S.000Z` prints it.'));
  assert.ok(SKILL.includes('`${CLAUDE_PLUGIN_DATA}` is not a shell variable; write its resolved path in the command.'));
  assert.ok(!SKILL.includes('The promote and propose passes are not in this prerelease'));
});

test('R253 to R255: propose reads four sources in order, never proposes the never list, and says what a written skill changes', () => {
  assert.ok(SKILL.includes('4. Propose skills from these sources, in this order, each in the skill form of Proposals with its source, the steps as observed, how often it was seen and its name:'));
  assert.ok(SKILL.includes('   - the instruction files: a numbered list or a "to do X" section in the hub, a rule, a nested file or `README.md`;'));
  assert.ok(SKILL.includes('   - the repository: a script or build target whose use takes more than one command or a setup step, a runbook under `docs/`, a procedure in `CONTRIBUTING.md`;'));
  assert.ok(SKILL.includes('   - auto memory: a `feedback` or `project` note that says how to do something.'));
  assert.ok(SKILL.includes('Never propose a skill for one command, for a fact, or for a procedure a skill already holds, never run a skill, and change a skill this run did not raise only by a line step 3 promotes.'));
  assert.ok(SKILL.includes('A written skill takes the skill shape of `shapes.md` at `.claude/skills/<name>/SKILL.md`.'));
  assert.ok(SKILL.includes('A procedure from an instruction file leaves that file in the same commit, a memory note is then offered for deletion as Proposals says, and a procedure from the repository changes nothing else.'));
  assert.ok(SKILL.includes('On its yes, write it; `adopt` and `maintain` commit it, and `init` leaves it uncommitted.'));
  assert.ok(!SKILL.includes('not in this prerelease'));
});

test('R240: SKILL.md is within its cap of 150 lines, counted as the file has them', () => {
  assert.equal(lineCount('a\nb\nc'), 3);
  assert.equal(lineCount('a\nb\nc\n'), 3);
  assert.equal(lineCount(''), 0);
  const n = lineCount(SKILL);
  assert.ok(n <= 150, `SKILL.md has ${n} lines`);
});

test('R237: every skill file SKILL.md names exists', () => {
  const host = new Set(['CLAUDE.md', 'AGENTS.md', 'README.md', 'CLAUDE.local.md', 'MEMORY.md', 'SKILL.md', 'CONTRIBUTING.md', 'CHANGELOG.md']);
  const named = new Set();
  for (const m of SKILL.matchAll(/`([^`\n]+)`/g)) {
    if (/^[A-Za-z0-9_.-]+\.md$/.test(m[1]) && !host.has(m[1])) named.add(m[1]);
  }
  assert.deepEqual([...named].sort(), ['adopt.md', 'init.md', 'placement.md', 'shapes.md']);
  for (const name of named) assert.ok(existsSync(new URL(name, DIR)), `${name} exists`);
  assert.ok(SKILL.includes('read `shapes.md` and `placement.md` in this skill\'s directory.'));
});

test('R238 and R262: the shapes file opens the hub template with the marker and names the caps', () => {
  assert.ok(SHAPES.includes('- Hub: 60 lines. Nested `CLAUDE.md`: 60 lines. Rule: 200 lines. `SKILL.md`: 150 lines. `docs/` pages: no cap.'));
  assert.ok(SHAPES.includes('- Nested `CLAUDE.md` and rule: also 40,000 characters: the host gives only the start of a nested `CLAUDE.md` or a rule with `paths` that is over that, and the cap covers every rule, so a rule that gains `paths` is already within it.'));
  assert.ok(SHAPES.replace(/\r\n/g, '\n').includes('```\n<!-- primer -->\n# <repository name>\n'));
});

test('R254: a written skill description holds no angle bracket', () => {
  assert.ok(SHAPES.includes('- A written `description` holds no `<` or `>`: the skill list shows them as `&lt;` and `&gt;`, so write a placeholder as `[name]`.'));
});

test('R241 and R252: placement holds the eleven items in order and the personal-content form', () => {
  const lines = PLACEMENT.split(/\r?\n/);
  const start = lines.indexOf('## Items');
  assert.ok(start >= 0, 'an Items heading exists');
  let stop = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  if (stop < 0) stop = lines.length;
  const numbers = [];
  for (const l of lines.slice(start + 1, stop)) {
    const m = /^(\d+)\. /.exec(l);
    if (m) numbers.push(Number(m[1]));
  }
  assert.deepEqual(numbers, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.ok(PLACEMENT.includes('- <file>:<line>: <text>: belongs in <CLAUDE.local.md | your own CLAUDE.md | the rules plugin\'s house rules block>'));
});

test('R241: placement item 2 sends a stopped or asked tool call and a host trailer to the settings key that enforces it', () => {
  const lines = PLACEMENT.split(/\r?\n/);
  const start = lines.indexOf('## Items');
  assert.ok(start >= 0, 'an Items heading exists');
  let stop = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  if (stop < 0) stop = lines.length;
  const item = lines.slice(start + 1, stop).find((l) => l.startsWith('2. '));
  assert.ok(item, 'item 2 exists');
  assert.ok(item.includes('A tool call that must be stopped or asked about in every task, or a trailer the host adds, goes to the settings key that enforces it: permissions deny or ask, attribution.'));
  assert.ok(item.includes('An allow entry enforces nothing, so it is not this item.'));
  assert.ok(item.includes('The plan proposes the hook or the key to the user. Primer never writes it. Until it exists, place the piece by the items below.'));
  assert.ok(SKILL.includes('Where placement item 1 or 2 applies, the plan proposes the check, hook or settings key for the user.'));
});

test('R241 and R257: a failure seen only when a skill runs goes into the step that fails', () => {
  const lines = PLACEMENT.split(/\r?\n/);
  const fact = lines.indexOf('- A fact stays a rule even when a skill uses it. The skill reads the rule and does not copy it.');
  assert.ok(fact >= 0, 'the fact bullet exists');
  assert.equal(lines[fact + 1], '- A failure seen only when the skill runs, and its fix, goes into the step that fails. Only that skill\'s runs need it, so the tasks test puts it there.');
});

const FOLD_DIR = new URL('../../plugins/primer/skills/fold/', import.meta.url);

function readFold() {
  return readFileSync(new URL('SKILL.md', FOLD_DIR), 'utf8');
}

test('R237: the plugin holds the fold and primer skills only', () => {
  const skills = new URL('../../plugins/primer/skills/', import.meta.url);
  assert.deepEqual(readdirSync(skills).sort(), ['fold', 'primer']);
});

test('R326: the fold skill directory holds SKILL.md only', () => {
  assert.deepEqual(readdirSync(FOLD_DIR), ['SKILL.md']);
});

test('R326: the fold frontmatter names the skill, sets the flag, takes no arguments and lists read-only tools', () => {
  const lines = readFold().split(/\r?\n/);
  assert.equal(lines[0], '---');
  const end = lines.indexOf('---', 1);
  assert.ok(end > 1, 'the frontmatter has a closing ---');
  const front = lines.slice(1, end);
  assert.ok(front.includes('name: fold'));
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
    'WebFetch(domain:code.claude.com)',
  ]);
});

test('R326 and R240: the fold SKILL.md is within its cap of 150 lines', () => {
  const n = lineCount(readFold());
  assert.ok(n <= 150, `fold SKILL.md has ${n} lines`);
});

test('R327: fold launches at most 20 page readers at a time', () => {
  assert.ok(readFold().includes('at most 20 at a time since the host refuses more'));
});

test('R327: fold counts a tree as a tool for Claude only when it holds Claude Code components', () => {
  assert.ok(readFold().includes('that holds Claude Code components: a `SKILL.md`, a `hooks.json`, an agent Markdown file with `name` and `description` frontmatter, or a workflow script that exports `meta`'));
});

test('R328: a host disagreement with the docs is settled by a check before primer\'s files are edited', () => {
  assert.ok(readFold().includes('the item names both texts, and its change is the check that would settle it; primer\'s file is edited only after that check'));
});

test('R328: the reviewing session\'s own instructions, settings and environment are neither side of an item', () => {
  assert.ok(readFold().includes('An item needs evidence from both sides: the docs text and the repository file and line, or the fact that nothing holds it. The reviewing session\'s own instructions, settings and environment are neither side: no item rests on them.'));
});

test('Decision 166: placement says a skill with disable-model-invocation is not listed at launch', () => {
  assert.ok(!PLACEMENT.includes('A skill\'s description is always listed.'));
  assert.ok(PLACEMENT.includes('- A skill\'s description is listed at launch unless the skill sets `disable-model-invocation: true`; then only the user invokes it. Its body loads when the skill is invoked or judged relevant. A skill with `paths` stays hidden until a matching file is touched.'));
});

test('the allowed-tools rule limits the grant to the invoking turn and no longer names read-only commands every run needs', () => {
  assert.ok(SHAPES.includes("- Add `allowed-tools` only for read-only commands the skill runs in the turn that invokes it. The grant clears at the user's next message, so it does not cover a command run after a reply; a grant that lasts the session is a permission allow rule in the user's settings, which primer never writes."));
  assert.ok(!SHAPES.includes('read-only commands every run needs'));
  assert.ok(SHAPES.includes("An entry's `*` admits any option, so the list names no command with an option that writes a file or runs a program, such as `git diff`, `git log`, `git show` or `git grep`, and no entry has a `*` before its end."));
});

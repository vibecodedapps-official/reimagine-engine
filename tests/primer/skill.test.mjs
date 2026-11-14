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
const LOCAL = readFileSync(new URL('local.md', DIR), 'utf8');

function lineCount(text) {
  if (text === '') return 0;
  const newlines = text.split('\n').length - 1;
  return newlines + (text.endsWith('\n') ? 0 : 1);
}

test('R237: the skill directory holds SKILL.md, adopt.md, init.md, local.md, placement.md and shapes.md only', () => {
  assert.deepEqual(readdirSync(DIR).sort(), ['SKILL.md', 'adopt.md', 'init.md', 'local.md', 'placement.md', 'shapes.md']);
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
    'Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/primer.mjs" status *)',
    'Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/primer.mjs" measure *)',
    'Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/primer.mjs" copies --spans *)',
  ]);
});

test('R245: the mode is the first line, chosen from the files on disk', () => {
  assert.ok(SKILL.includes('- The first line of the reply, before any read beyond what choosing needs and before any write, is exactly `primer: mode <init|adopt|maintain> (<one-line reason>)`, with no text before it but the profile question, and the second is `primer: profile <shared|local>`.'));
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
  assert.ok(SKILL.includes('- two instruction files that contradict each other are reported, never resolved by this pass, since `/doctor prompt-audit` checks contradictions;'));
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

test('R385 and R396: the profile is asked once with no default, recorded by the script, and sets the fallback commit subject', () => {
  assert.ok(SKILL.includes('- The profile: a hub whose line 1 is the marker is `shared`; else the `profile:` line of `node "${CLAUDE_PLUGIN_ROOT}/scripts/primer.mjs" status` names it. With none, the reply is only one question, with no default:'));
  assert.ok(SKILL.includes('for `shared`, also whether the repository is the user\'s own. The question names the run that records the answer, `map --add --profile <shared|local>` with `--own <true|false>` for `shared`, by the same script; run it on the answer. Without an answer write nothing.'));
  assert.ok(SKILL.includes('- A `local` run reads `local.md` in this skill\'s directory before the mode line and follows it where it differs from this file.'));
  assert.ok(SKILL.includes('- In a `shared` run, when the root `CLAUDE.md` or root `AGENTS.md` is ignored by git, say so after the profile line and stop with nothing written.'));
  assert.ok(SKILL.includes('Where `status` shows `own false`, the fallback is `docs: <subject>`.'));
});

test('R385, R386 and R390: local.md keeps the work tree untouched, writes the store on a named yes and the map through the script', () => {
  assert.ok(LOCAL.includes('A `local` run writes nothing in the repository\'s work tree, makes no commit or stash, and changes neither the index nor a `.gitignore`.'));
  assert.ok(LOCAL.includes('- `init` while the store holds no layer for the repository\'s group, `maintain` after; `adopt` does not run.'));
  assert.ok(LOCAL.includes('- Instruction files the upstream tracks are the repository\'s own: read them, never rewrite them. A root instruction file git ignores is the user\'s own and does not stop the run.'));
  assert.ok(LOCAL.includes('- Write a layer, a document under the store\'s `docs/` or `machine.md` with the Write or Edit tool, and only on a yes that names the file.'));
  assert.ok(LOCAL.includes('`map.json` and `config.json` change only through the same script\'s `map` verb: show the exact command and the change it makes, run it on a yes, and never edit either file by hand.'));
  assert.ok(LOCAL.includes('- As its own question, offer the lines below for `info/exclude` under the repository\'s common directory (`git rev-parse --git-common-dir`), which git never shares. On a yes, append them; where the host refuses that write, show them for the user to add; a no leaves it.'));
  assert.ok(LOCAL.replace(/\r\n/g, '\n').includes('  ```\n  CLAUDE.md\n  CLAUDE.local.md\n  AGENTS.md\n  .claude/\n  .reimagine/\n  .reimagine.json\n  .mcp.json\n  ```\n'));
  assert.ok(LOCAL.includes('- The plan proposes the host\'s `attribution` setting with empty `commit` and `pr` values, by placement item 2,'));
  assert.ok(LOCAL.includes('- A layer is factual statements, never commands addressed to the session,'));
});

test('R392 and R394: a proposal searches first, is measured, and names the cut that pays for it', () => {
  assert.ok(SKILL.includes('Before a rule is proposed, and before any pass that launches an agent, search every layer and document of the store, the user\'s own `CLAUDE.md` and the instruction files of the repository the rule governs for text that already states it.'));
  assert.ok(SKILL.includes('A hit ends the proposal as nothing, as a one-line pointer, or, where the rule was loaded and missed, as a miss whose fix is delivery or a pointer, never a second statement of the rule.'));
  assert.ok(SKILL.includes('Size is measured, never estimated.'));
  assert.ok(SKILL.includes('Either names the cut that pays for it, or becomes a one-line pointer to a document. Cut candidates come in this order: text that says how the file is loaded, text a pointed-to document also holds, text the loader or the host already supplies, facts past their expiry. No file primer writes states how much room is left.'));
  assert.ok(LOCAL.includes('show `measure --with <file> <layer>`, the layer being `shared.md`, `groups/<group>.md` or `machine.md`, with each repository\'s size before and after.'));
});

test('R397 to R399: the fold-back review reads the logs, runs two passes, ends in one pick and records the ledger', () => {
  assert.ok(SKILL.includes('2. Evidence pass: check each item\'s evidence and challenge it. Drop what the files contradict and what names a section that does not exist; an item a loaded rule already states is a miss. Mark each claim verified or unverified, with its check: read at the source, run, or neither.'));
  assert.ok(SKILL.includes('3. Worth pass: judge worth, placement by `placement.md`, and wording, and settle items that touch the same lines as one. Draft each edit now, against the files as they are, never copied from the log; nothing is written before the answer of step 6.'));
  assert.ok(SKILL.includes('One that matches a folded rule is that rule\'s failure: propose to reword the rule, move it or propose a hook, never to state it twice.'));
  assert.ok(SKILL.includes('then what it holds and what it rejects, each with its reason, and asks once with the rest. An item for the house rules or another plugin is written by its kind, with no person, id or path.'));
  assert.ok(SKILL.includes('`node "${CLAUDE_PLUGIN_ROOT}/scripts/ledger.mjs"`'));
  assert.ok(SKILL.includes('Then write the stamp `${CLAUDE_PLUGIN_DATA}/reviewed/feedback` as step 3 writes its own.'));
});

test('R400 and R401: maintain reports declared copies and proposes ports, and past messages come from the reader alone', () => {
  assert.ok(SKILL.includes('- each copy `status` lists: `source changed` is a port to propose from the diff it shows, followed on its yes by `copies --ported <copy>` of the same script;'));
  assert.ok(SKILL.includes('A proposal that copies context text to a second place declares it with `copies --add <copy> <source>`; the script ports nothing.'));
  assert.ok(SKILL.includes('`node "${CLAUDE_PLUGIN_ROOT}/scripts/transcripts.mjs" --from <YYYY-MM-DD> --to <YYYY-MM-DD>`'));
  assert.ok(SKILL.includes('build no reader of your own, and count nothing from its output.'));
});

test('R241 and R393: every addition is classed, and the local profile has its own destinations', () => {
  assert.ok(PLACEMENT.includes('Before a home is proposed, class the addition four ways: stable or expiring, shared or personal, rule or reference, the user\'s or another owner\'s. The proposal names the home and the reason.'));
  assert.ok(PLACEMENT.includes('- A pointer to a source the user keeps current is preferred to a copied value. A copied fact carries the date it was copied and an expiry, or the event that makes it worth checking again.'));
  assert.ok(PLACEMENT.includes('warns that a hand edit there stops the plugin offering its updates'));
  assert.ok(PLACEMENT.includes('- A stable, impersonal rule for every mapped repository goes in `shared.md`; one for a group goes in its group layer.'));
  assert.ok(PLACEMENT.includes('- People, dates and calendars go in `machine.md`, each with an expiry.'));
  assert.ok(PLACEMENT.includes('- A workaround is a pointer to the report of the fault it works around.'));
  assert.ok(LOCAL.includes('is in the local profile section of `placement.md`.'));
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
  assert.deepEqual([...named].sort(), ['adopt.md', 'init.md', 'local.md', 'placement.md', 'shapes.md']);
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

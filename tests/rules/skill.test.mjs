// The rules skill's steps and the refactor, handoff prompt and draft skills' files. The skills are text the model follows, so these read the text; the handoff prompt skill's copy of a house-rule item is also compared with core.md, and the chat block's copy of the skill's definition with the skill.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { loadTexts, units } from '../../plugins/rules/scripts/rules.mjs';

const SKILL = readFileSync(new URL('../../plugins/rules/skills/rules/SKILL.md', import.meta.url), 'utf8');

test('R36: the adopt step passes only the options the user gave, never the plan\'s options line', () => {
  const line = SKILL.split('\n').find((l) => l.startsWith('- On adopt,'));
  assert.notEqual(line, undefined);
  assert.equal(line.includes('options:'), false);
  assert.equal(line.includes('--adopt'), true);
});

test('R39: the skill runs each command with the Bash tool, which its allowed-tools pre-approves', () => {
  assert.ok(SKILL.includes('Run each command with the Bash tool, which the `allowed-tools` line pre-approves.'));
});

const REFACTOR_DIR = new URL('../../plugins/rules/skills/refactor/', import.meta.url);

function readRefactor() {
  return readFileSync(new URL('SKILL.md', REFACTOR_DIR), 'utf8');
}

function lineCount(text) {
  if (text === '') return 0;
  const newlines = text.split('\n').length - 1;
  return newlines + (text.endsWith('\n') ? 0 : 1);
}

test('R330: the refactor skill directory holds SKILL.md only', () => {
  assert.deepEqual(readdirSync(REFACTOR_DIR), ['SKILL.md']);
});

test('R330: the refactor frontmatter names the skill, sets the flag, takes no arguments and lists read-only tools', () => {
  const lines = readRefactor().split(/\r?\n/);
  assert.equal(lines[0], '---');
  const end = lines.indexOf('---', 1);
  assert.ok(end > 1, 'the frontmatter has a closing ---');
  const front = lines.slice(1, end);
  assert.ok(front.includes('name: refactor'));
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
  ]);
});

test('R330: the refactor SKILL.md is within its cap of 150 lines', () => {
  assert.equal(lineCount('a\nb\nc'), 3);
  assert.equal(lineCount('a\nb\nc\n'), 3);
  assert.equal(lineCount(''), 0);
  const n = lineCount(readRefactor());
  assert.ok(n <= 150, `refactor SKILL.md has ${n} lines`);
});

test('R330: the refactor skill holds no numbered step list', () => {
  const numbered = readRefactor().split(/\r?\n/).filter((l) => /^\d+\. /.test(l));
  assert.deepEqual(numbered, []);
});

test('R331: refactor launches its reviewers as agents, never as a workflow', () => {
  assert.ok(readRefactor().includes('with the Agent tool, never as a workflow'));
});

test('R331: refactor reviews tracked files only', () => {
  assert.ok(readRefactor().includes('Areas hold tracked files only, as `git ls-files` lists them.'));
});

test('R331: refactor\'s second pass refutes a finding a test or decision holds, or whose rule does not cover it', () => {
  assert.ok(readRefactor().includes('launch a fresh read-only subagent at model `sonnet` that tries to refute every one: the case the cited text holds, the caller that uses the option, a test that already holds the case, the repository\'s instruction or recorded decision that permits or chose it, and a quoted rule that does not cover the case when no other item does.'));
});

test('R331: refactor briefs tell refuters to rest a refutation on the quoted rules and the tree', () => {
  assert.ok(readRefactor().includes('Its brief also says that a refutation rests on the quoted rules and the tree, never on the refuter\'s own session instructions or environment.'));
});

test('R331: refactor keeps reviewers and refuters together at most 20 at a time', () => {
  assert.ok(readRefactor().includes('The run\'s reviewers and refuters together stay at most 20 at a time because the host refuses more'));
});

test('R332: refactor bundles only recommended findings that quote a rule', () => {
  assert.ok(readRefactor().includes('Group the surviving recommended findings that quote a rule into bundles.'));
});

test('R331: refactor recommends by the core.md item and quotes no rule', () => {
  assert.ok(readRefactor().includes('by the `core.md` item on finding issues and proposing changes'));
});

test('R333: refactor names each ticket file from the clock in a fixed format', () => {
  assert.ok(readRefactor().includes('Name each ticket file `refactor-<time>-<n>.md`, where `<time>` is the output of `date -u +%Y%m%d-%H%M%S`, which may prompt once, and `<n>` is the bundle\'s number, so no earlier run\'s ticket has its path.'));
});

test('R333: refactor checks the scratch directory with a trailing slash', () => {
  assert.ok(readRefactor().includes('checked with `git check-ignore` on its path with a trailing slash'));
});

test('R333: refactor keeps each reviewer brief in the prompt, never in a file', () => {
  assert.ok(readRefactor().includes('Each brief goes in the Agent prompt, never in a file.'));
});

test('R333: refactor asks its one question only when there is a bundle', () => {
  assert.ok(readRefactor().includes('When the report has at least one bundle, ask one question: write the ticket files to the ticket directory, naming it.'));
});

test('R333: refactor finds the ticket directory before launching any subagent and asks after the report', () => {
  const text = readRefactor();
  const check = text.indexOf('checked with `git check-ignore` on its path with a trailing slash');
  const launch = text.indexOf('Launch one read-only subagent');
  const question = text.indexOf('ask one question: write the ticket files to the ticket directory, naming it.');
  assert.notEqual(check, -1);
  assert.notEqual(launch, -1);
  assert.notEqual(question, -1);
  assert.ok(check < launch);
  assert.ok(launch < question);
});

test('R332: refactor keeps a finding whose change is to an instruction file out of the bundles', () => {
  assert.ok(readRefactor().includes('A finding whose change is to an instruction file names `/primer` and stays out of the bundles.'));
});

test('R332: each refactor finding gives what the change costs', () => {
  assert.ok(readRefactor().includes('- what the change costs'));
});

test('R331: refactor reads imported and nested instruction files', () => {
  assert.ok(readRefactor().includes('nested `CLAUDE.md` and `AGENTS.md` files, the files they import,'));
});

test('R331: refactor treats a sentence the tree contradicts throughout as a disagreement, never a note', () => {
  assert.ok(readRefactor().includes('A sentence the tree contradicts throughout, across many files, is such a disagreement, never a note.'));
});

test('R331: refactor rests no finding or note on the reviewing session\'s own instructions, settings or environment', () => {
  assert.ok(readRefactor().includes('The reviewing session\'s own instructions, settings and environment are not a source: no finding or note rests on them.'));
});

test('R331: refactor briefs tell reviewers to rest findings on the quoted rules and the tree', () => {
  assert.ok(readRefactor().includes('It also says that a finding rests on the quoted rules and the tree, never on the reviewer\'s own session instructions or environment, and that an instruction-file sentence the tree contradicts is a finding for `/primer`, not a note.'));
});

test('R332: a refactor bundle holds one area with its tests and a separately released part is its own bundle naming its release', () => {
  assert.ok(readRefactor().includes('A bundle is one cohesive refactor sized for one loop run: it holds the files of one area and the tests of that area, and a change to a part the repository versions and releases on its own is its own bundle that names the release it needs.'));
});

test('R332: a refactor ticket holds the release it needs when the bundle names one', () => {
  assert.ok(readRefactor().includes('the done condition; the release it needs, when the bundle names one; and the repository\'s checks by command, taken from its instruction files or manifest.'));
});

test('R330: refactor runs each git read with the Bash tool, before its first git read', () => {
  const text = readRefactor();
  const sentence = text.indexOf('Run each `git` read with the Bash tool. The `allowed-tools` list pre-approves the reads no option of which writes a file or runs a program;');
  assert.notEqual(sentence, -1);
  assert.ok(sentence < text.indexOf('`git check-ignore`'));
  assert.equal(text.includes('PowerShell'), false);
});

const HANDOFF_DIR = new URL('../../plugins/rules/skills/handoff-prompt/', import.meta.url);

function readHandoff() {
  return readFileSync(new URL('SKILL.md', HANDOFF_DIR), 'utf8');
}

function handoffFront() {
  const lines = readHandoff().split(/\r?\n/);
  assert.equal(lines[0], '---');
  const end = lines.indexOf('---', 1);
  assert.ok(end > 1, 'the frontmatter has a closing ---');
  return lines.slice(1, end);
}

test('R347: the handoff-prompt skill directory holds SKILL.md only', () => {
  assert.deepEqual(readdirSync(HANDOFF_DIR), ['SKILL.md']);
});

test('R347: the handoff-prompt frontmatter names the skill and its description claims the handoff prompt and not the audit\'s file', () => {
  const front = handoffFront();
  assert.ok(front.includes('name: handoff-prompt'));
  const description = front.find((l) => l.startsWith('description:'));
  assert.ok(description, 'a description line exists');
  assert.ok(description.includes('handoff prompt'));
  assert.ok(description.includes('Not the typed handoff file an audit reads.'));
  assert.ok(description.includes('or for a prompt that carries work to a later session.'));
  assert.equal(description.includes('handoff to another session'), false);
});

test('R347: the handoff-prompt skill is model-invocable and takes no tools list or arguments', () => {
  const front = handoffFront();
  assert.ok(!front.some((l) => l.startsWith('disable-model-invocation:')), 'no disable-model-invocation line');
  assert.ok(!front.some((l) => l.startsWith('allowed-tools:')), 'no allowed-tools line');
  assert.ok(!front.some((l) => l.startsWith('argument-hint:')), 'no argument-hint line');
});

test('R347: the handoff-prompt SKILL.md is within its cap of 150 lines', () => {
  const n = lineCount(readHandoff());
  assert.ok(n <= 150, `handoff-prompt SKILL.md has ${n} lines`);
});

test('R347: the handoff-prompt skill holds no numbered step list', () => {
  const numbered = readHandoff().split(/\r?\n/).filter((l) => /^\d+\. /.test(l));
  assert.deepEqual(numbered, []);
});

test('R347: the definition section holds the handoff prompt item, then the agent-prose item as core.md has it', () => {
  const prose = units(loadTexts()['core.md']).list.find((u) => u.kind === 'item' && u.norm.startsWith('Prose written for an agent'));
  assert.notEqual(prose, undefined);
  const lines = readHandoff().split(/\r?\n/);
  const start = lines.indexOf('## The definition');
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  assert.ok(start >= 0 && end > start, 'the definition section has a start and an end');
  const items = lines.slice(start + 1, end).filter((l) => l.startsWith('- '));
  assert.equal(items.length, 2);
  assert.ok(items[0].startsWith('- A handoff prompt carries work to a later session:'));
  assert.equal(items[1], `- ${prose.norm}`);
});

test('R346: the chat block carries the handoff prompt item as the skill words it, as the last line of Content', () => {
  const item = readHandoff().split(/\r?\n/).find((l) => l.startsWith('- A handoff prompt carries work to a later session:'));
  assert.notEqual(item, undefined);
  const fenced = readFileSync(new URL('../../plugins/rules/chat/instructions.md', import.meta.url), 'utf8').split('```')[1].split(/\r?\n/);
  assert.equal(fenced[fenced.indexOf('Leave out.') - 2], item);
});

test('R347: the handoff-prompt skill asks for no read of the plugin\'s files', () => {
  const text = readHandoff();
  assert.equal(text.includes('core.md'), false);
  assert.equal(text.includes('CLAUDE_PLUGIN_ROOT'), false);
});

test('R347: the handoff-prompt skill sends an idea as the idea, marked as not worked out', () => {
  assert.ok(readHandoff().includes('An idea goes as the idea in the user\'s words, with why it came up and what is known, and says it is not worked out; it gains no option, plan or answer.'));
});

test('R347: the handoff-prompt skill suggests nothing and asks nothing of anyone else', () => {
  assert.ok(readHandoff().includes('An unsettled item is an open question for the user, never an ask of anyone else and never a suggested answer.'));
});

test('R347: the handoff-prompt skill writes for a receiver that has nothing of this session', () => {
  assert.ok(readHandoff().includes('The receiver has nothing of this session. Unless the user names another, it is a Claude Code session: name the repository, branch, commit and the files worth reading.'));
});

test('R347: the handoff-prompt skill keeps both kinds of handoff no more specific than the user was', () => {
  assert.ok(readHandoff().includes('Both stay no more specific than the user was.'));
});

test('R347: the handoff-prompt skill sends a summary with what was settled, its facts and the open questions', () => {
  assert.ok(readHandoff().includes('A summary carries what was settled, the facts it rests on with when and how each was checked, and the open questions for the user.'));
});

test('R347: the handoff-prompt skill gives the prompt in one fenced block, writes no file, and adds one line after it', () => {
  const text = readHandoff();
  assert.ok(text.includes('Give the prompt in one fenced block for pasting.'));
  assert.ok(text.includes('Write no file.'));
  assert.ok(text.includes('After the block, add one line on what was left out on purpose or is unverified.'));
});

const DRAFT_DIR = new URL('../../plugins/rules/skills/draft/', import.meta.url);

function readDraft() {
  return readFileSync(new URL('SKILL.md', DRAFT_DIR), 'utf8');
}

function draftFront() {
  const lines = readDraft().split(/\r?\n/);
  assert.equal(lines[0], '---');
  const end = lines.indexOf('---', 1);
  assert.ok(end > 1, 'the frontmatter has a closing ---');
  return lines.slice(1, end);
}

test('R363: the draft skill directory holds SKILL.md only', () => {
  assert.deepEqual(readdirSync(DRAFT_DIR), ['SKILL.md']);
});

test('R363: the draft frontmatter names the skill and its description claims a message for someone else', () => {
  const front = draftFront();
  assert.ok(front.includes('name: draft'));
  const description = front.find((l) => l.startsWith('description:'));
  assert.ok(description, 'a description line exists');
  assert.ok(description.includes('before it is first shown'));
  assert.ok(description.includes('Use whenever this session writes a message that another person will read.'));
  assert.ok(description.includes('Not for a commit message or a code comment.'));
});

test('R363: the draft skill is model-invocable and takes no tools list or arguments', () => {
  const front = draftFront();
  assert.ok(!front.some((l) => l.startsWith('disable-model-invocation:')), 'no disable-model-invocation line');
  assert.ok(!front.some((l) => l.startsWith('allowed-tools:')), 'no allowed-tools line');
  assert.ok(!front.some((l) => l.startsWith('argument-hint:')), 'no argument-hint line');
});

test('R363: the draft SKILL.md is within its cap of 150 lines', () => {
  const n = lineCount(readDraft());
  assert.ok(n <= 150, `draft SKILL.md has ${n} lines`);
});

test('R363: the draft skill holds no numbered step list', () => {
  const numbered = readDraft().split(/\r?\n/).filter((l) => /^\d+\. /.test(l));
  assert.deepEqual(numbered, []);
});

test('R363: the draft skill asks for no read of the plugin\'s files', () => {
  const text = readDraft();
  assert.equal(text.includes('core.md'), false);
  assert.equal(text.includes('concise-plain.md'), false);
  assert.equal(text.includes('CLAUDE_PLUGIN_ROOT'), false);
});

test('R364: the draft skill strikes and verifies, adds no detail and launches no agent', () => {
  const text = readDraft();
  assert.ok(text.includes('The check strikes and verifies. It never adds detail.'));
  assert.ok(text.includes('Run it yourself and launch no agent for it, since verifying needs what this session did.'));
});

test('R365: the draft skill keeps an email draft as one HTML file and no draft in two formats', () => {
  const text = readDraft();
  assert.ok(text.includes('An email draft is one HTML file in the scratch directory the house rules name'));
  assert.ok(text.includes('No draft is kept in two formats.'));
});

test('R366: the style names the draft skill in one sentence and the chat block does not', () => {
  const style = readFileSync(new URL('../../plugins/rules/output-styles/concise-plain.md', import.meta.url), 'utf8');
  assert.deepEqual(style.split(/\r?\n/).filter((l) => l.includes('draft` skill')), ['Check it with the `rules:draft` skill before it is first shown.']);
  const fenced = readFileSync(new URL('../../plugins/rules/chat/instructions.md', import.meta.url), 'utf8').split('```')[1];
  assert.equal(/rules:draft|draft`? skill/.test(fenced), false);
});

test('R366: the chat block keeps the sentence the style cut to pay for the one naming the skill', () => {
  const cut = "Don't present a settled choice as a question, or a proposal as agreed.";
  const style = readFileSync(new URL('../../plugins/rules/output-styles/concise-plain.md', import.meta.url), 'utf8');
  assert.equal(style.includes(cut), false);
  const fenced = readFileSync(new URL('../../plugins/rules/chat/instructions.md', import.meta.url), 'utf8').split('```')[1];
  assert.ok(fenced.includes(cut));
});

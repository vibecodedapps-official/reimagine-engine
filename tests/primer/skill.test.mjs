// The primer skill files: the directory contents, the frontmatter the host reads, the caps, and what the hooks, the scripts and an eval grader read from the prose. No case asserts how a sentence is worded, but for the bans whose loss lets a run do harm (requirement 402).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const DIR = new URL('../../plugins/primer/skills/primer/', import.meta.url);
const read = (url) => readFileSync(url, 'utf8').replace(/\r\n/g, '\n');
const FILES = Object.fromEntries(['SKILL.md', 'adopt.md', 'init.md', 'local.md', 'placement.md', 'shapes.md'].map((name) => [name, read(new URL(name, DIR))]));
const SKILL = FILES['SKILL.md'];
const SHAPES = FILES['shapes.md'];
const PLACEMENT = FILES['placement.md'];
const LOCAL = FILES['local.md'];
const SCRIPTS = new URL('../../plugins/primer/scripts/', import.meta.url);
const SOURCE = Object.fromEntries(readdirSync(SCRIPTS).filter((name) => name.endsWith('.mjs')).map((name) => [name, read(new URL(name, SCRIPTS))]));
const DRIFT = read(new URL('../../plugins/primer/hooks/drift.sh', import.meta.url));
const NOTICE = read(new URL('../../plugins/primer/hooks/notice.sh', import.meta.url));

function lineCount(text) {
  if (text === '') return 0;
  const newlines = text.split('\n').length - 1;
  return newlines + (text.endsWith('\n') ? 0 : 1);
}

test('R237: the skill directory holds SKILL.md, adopt.md, init.md, local.md, placement.md and shapes.md only', () => {
  assert.deepEqual(readdirSync(DIR).sort(), ['SKILL.md', 'adopt.md', 'init.md', 'local.md', 'placement.md', 'shapes.md']);
});

test('R245: the frontmatter names the skill, the four phrases first, and read-only tools', () => {
  const lines = SKILL.split('\n');
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

test('R245: the mode line the skill gives is the one the eval grader matches, for each of the three modes', () => {
  const form = /`primer: mode <([^>`]+)> \(<[^>`]+>\)`/.exec(SKILL);
  assert.ok(form, 'SKILL.md gives no mode line form');
  assert.deepEqual(form[1].split('|'), ['init', 'adopt', 'maintain']);
  const grader = read(new URL('../evals/primer/mode-line/graders/mode-line.md', import.meta.url));
  const pattern = /^pattern: '(.*)'$/m.exec(grader)?.[1];
  assert.ok(pattern, 'the grader holds no pattern');
  for (const mode of form[1].split('|')) assert.match(`"text": "primer: mode ${mode} (a reason)"`, new RegExp(pattern), mode);
});

test('R247: the skill names --no-verify only to bar it', () => {
  const lines = Object.values(FILES).flatMap((text) => text.split('\n')).filter((l) => l.includes('--no-verify'));
  assert.ok(lines.length > 0, 'no skill file names --no-verify');
  for (const l of lines) assert.match(l, /[Nn]ever [^.]*--no-verify/, l);
});

test('R246, R390: the bans whose loss lets a run write where it must not stand in the skill files', () => {
  const skillLines = SKILL.split('\n');
  assert.ok(skillLines.some((l) => l.includes('forced `init`') && /never writes over [^.]*`CLAUDE\.md`[^.]*`AGENTS\.md`/.test(l)), 'SKILL.md does not bar a forced init over an existing CLAUDE.md or AGENTS.md');
  const never = skillLines.find((l) => l.startsWith('- Never edit '));
  assert.ok(never, 'SKILL.md has no line starting "- Never edit "');
  const first = never.split('. ')[0];
  for (const entry of ['code', 'configuration', 'settings', 'CI files', 'package manifests', '`CLAUDE.local.md`', 'anything git ignores', 'the auto memory directory']) assert.ok(first.includes(entry), `the list of what is never edited lacks ${entry}`);
  assert.ok(LOCAL.split('\n').some((l) => /writes nothing [^.]*work tree[^.]*no commit/.test(l)), 'local.md does not bar a work tree write and a commit');
});

test('every script command the skill files show names a script that exists, a verb it takes and options it reads', () => {
  const verbs = [...SOURCE['primer.mjs'].matchAll(/verb === '([a-z-]+)'/g)].map((m) => m[1]);
  assert.ok(verbs.includes('status') && verbs.includes('map') && verbs.includes('copies') && verbs.includes('measure'), 'primer.mjs lists its verbs as verb === <name>');
  const shown = [];
  let optionSpans = 0;
  for (const [name, text] of Object.entries(FILES)) {
    for (const [, span] of text.matchAll(/`([^`\n]+)`/g)) {
      if (span.startsWith('--')) {
        const option = span.split(/\s+/)[0];
        if (option === '--no-verify') continue;
        optionSpans++;
        assert.ok(Object.values(SOURCE).some((source) => source.includes(`'${option}'`)), `${name}: ${span} names an option no script reads`);
        continue;
      }
      const path = /scripts\/([a-z]+\.mjs)"(.*)$/.exec(span);
      const words = (path ? path[2] : span).trim().split(/\s+/).filter(Boolean);
      if (!path && !(verbs.includes(words[0]) && words.some((w) => w.startsWith('--')))) continue;
      const script = path ? path[1] : 'primer.mjs';
      assert.ok(script in SOURCE, `${name}: ${span} names a script that does not exist`);
      if (script === 'primer.mjs' && words.length) assert.ok(verbs.includes(words[0]), `${name}: ${span} names a verb primer.mjs does not take`);
      for (const option of words.filter((w) => w.startsWith('--'))) assert.ok(SOURCE[script].includes(`'${option}'`), `${name}: ${span} names an option ${script} does not read`);
      shown.push(span);
    }
  }
  assert.ok(shown.length >= 10, `only ${shown.length} commands were found`);
  assert.ok(optionSpans >= 5, `only ${optionSpans} options shown alone were found`);
});

test('R256 and R397: the stamps the skill writes are the ones the notice hook reads', () => {
  for (const [written, held] of [
    ['`${CLAUDE_PLUGIN_DATA}/reviewed/<key>`', '"$CLAUDE_PLUGIN_DATA/reviewed/$key"'],
    ['`${CLAUDE_PLUGIN_DATA}/reviewed/feedback`', '"$CLAUDE_PLUGIN_DATA/reviewed/feedback"'],
  ]) {
    assert.ok(SKILL.includes(written), `SKILL.md does not name ${written}`);
    assert.ok(NOTICE.includes(held), `notice.sh does not read ${held}`);
  }
});

test('R390 and R391: the info/exclude lines local.md offers are the agent files the staging check knows, as git reads them', () => {
  const set = (name) => new RegExp(`const ${name} = new Set\\(\\[([^\\]]+)\\]\\)`).exec(SOURCE['primer.mjs'])?.[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')) ?? [];
  const known = [...set('AGENT_NAMES'), ...set('AGENT_DIRS')].sort();
  assert.equal(known.length, 7);
  const fence = /\n  ```\n((?:  \S+\n)+)  ```\n/.exec(LOCAL)?.[1] ?? '';
  const written = fence.split('\n').filter(Boolean).map((l) => l.trim().replace(/\/$/, ''));
  assert.deepEqual(written.map((l) => l.toLowerCase()).sort(), known);
  assert.deepEqual([...written].sort(), ['.claude', '.mcp.json', '.reimagine', '.reimagine.json', 'AGENTS.md', 'CLAUDE.local.md', 'CLAUDE.md']);
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
});

test('R238: the hub template of shapes.md opens with the marker the hooks test for', () => {
  const marks = [DRIFT, NOTICE].map((text) => /\[ "\$mark" = "([^"]+)" \]/.exec(text)?.[1]);
  assert.deepEqual(marks, ['<!-- primer -->', '<!-- primer -->']);
  assert.ok(SHAPES.includes(`\`\`\`\n${marks[0]}\n# `), 'no fence of shapes.md opens with the marker and a heading');
});

test('R240 and R262: shapes.md names every cap the drift hook holds', () => {
  const caps = (fn) => [...new Set([...DRIFT.matchAll(new RegExp(`^\\s*${fn} "\\$\\w+" (\\d+)$`, 'gm'))].map((m) => Number(m[1])))].sort((a, b) => a - b);
  assert.deepEqual(caps('lines_over'), [60, 150, 200]);
  assert.deepEqual(caps('chars_over'), [40000]);
  const section = /^## Counting and caps\n([^]*?)(?=^## )/m.exec(SHAPES)?.[1] ?? '';
  for (const n of caps('lines_over')) assert.ok(section.includes(`${n} lines`), `Counting and caps names no cap of ${n} lines`);
  assert.ok(section.includes('40,000 characters'), 'Counting and caps names no cap of 40,000 characters');
});

test('R241: placement holds the eleven items in order', () => {
  const lines = PLACEMENT.split('\n');
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
});

const FOLD_DIR = new URL('../../plugins/primer/skills/fold/', import.meta.url);

function readFold() {
  return read(new URL('SKILL.md', FOLD_DIR));
}

test('R237: the plugin holds the fold and primer skills only', () => {
  const skills = new URL('../../plugins/primer/skills/', import.meta.url);
  assert.deepEqual(readdirSync(skills).sort(), ['fold', 'primer']);
});

test('R326: the fold skill directory holds SKILL.md only', () => {
  assert.deepEqual(readdirSync(FOLD_DIR), ['SKILL.md']);
});

test('R326: the fold frontmatter names the skill, sets the flag, takes no arguments and lists read-only tools', () => {
  const lines = readFold().split('\n');
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

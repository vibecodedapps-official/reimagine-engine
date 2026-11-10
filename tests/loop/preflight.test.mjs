// Step 0 and the reading block: the order of Step 0's parts, the forms it parses, the configuration it knows and the credential names it scans for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r/g, '');
const PREFLIGHT = read('../../plugins/loop/skills/run/steps/0-preflight.md');
const SKILL = read('../../plugins/loop/skills/run/SKILL.md');
const WORKTREE = read('../../plugins/loop/skills/run/worktree.md');

// The text of a "## <heading>" section, up to the next "## " heading.
const section = (text, heading) => {
  const start = text.indexOf(`\n## ${heading}\n`);
  assert.notEqual(start, -1, `no ## ${heading}`);
  const end = text.indexOf('\n## ', start + 1);
  return end === -1 ? text.slice(start) : text.slice(start, end);
};

// The backticked names in a text, in order.
const ticks = (text) => [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1]);

test('Step 0 has its parts in order: the checkout, the host and the input before the numbered items', () => {
  assert.deepEqual([...PREFLIGHT.matchAll(/^## (.+)$/gm)].map((m) => m[1]), [
    'Rules that hold in all of Step 0',
    'Primary checkout',
    'Host detection',
    'Input guard',
    '0.1 Instruction files, configuration, credential scan, permission statement',
    '0.1a Credentials question (only when the scan matched)',
    '0.2 Base branch, base commit, continued branch, open pull requests',
    '0.3 Clean tree, flagged files, worktree',
    '0.4 Planning snapshot',
    '0.5 The record',
    '0.6 Prompts seen',
  ]);
});

test('R52, R53: SKILL.md names the nine credential keys the scan matches', () => {
  const echo = SKILL.split('\n').find((line) => line.startsWith('The echo is redacted with the credential scan'));
  assert.notEqual(echo, undefined, 'SKILL.md has no credential scan paragraph');
  const keys = ticks(echo.split('(case-insensitive)')[0].split('A key named ')[1]);
  assert.deepEqual(keys, ['password', 'passwd', 'secret', 'token', 'api_key', 'apikey', 'client_secret', 'private_key', 'connection_string']);
});

test('R74: SKILL.md names the four host forms of an Azure DevOps remote and the path segments it reads', () => {
  const line = SKILL.split('\n').find((text) => text.startsWith('2. `AB#12345`'));
  assert.notEqual(line, undefined, 'SKILL.md has no Azure DevOps ticket form');
  const hosts = [...new Set([...line.matchAll(/`(\.?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.com)`/g)].map((m) => m[1]))];
  assert.deepEqual(hosts, ['dev.azure.com', 'ssh.dev.azure.com', 'vs-ssh.visualstudio.com', '.visualstudio.com']);
  for (const name of ['`v3/`', '`DefaultCollection`', '`_git`']) assert.ok(line.includes(name), `the Azure DevOps form does not name ${name}`);
});

test('R81: Step 0.1.2 knows the keys and subkeys of the configuration block', () => {
  const block = JSON.parse(SKILL.split('\n## Configuration\n')[1].split('```json\n')[1].split('\n```')[0]);
  const item = section(PREFLIGHT, '0.1 Instruction files, configuration, credential scan, permission statement').split('\n').find((line) => line.startsWith('2. '));
  const known = item.split('Known keys: ')[1].split('. The budget')[0];
  const keys = [...known.matchAll(/`([a-z-]+)` \(([^)]*)\)/g)].map((m) => [m[1], ticks(m[2])]);
  assert.deepEqual(keys.map(([key]) => key), Object.keys(block));
  for (const [key, subkeys] of keys) {
    if (typeof block[key] === 'object' && !Array.isArray(block[key])) assert.deepEqual(subkeys.slice(0, Object.keys(block[key]).length), Object.keys(block[key]), key);
  }
  assert.deepEqual(keys.find(([key]) => key === 'models')[1].slice(4), ['sonnet', 'opus', 'haiku', 'fable']);
});

test('R82: Step 0.5 asks git about .reimagine/ with its trailing slash, so an excluded directory that does not exist yet reads as ignored', () => {
  const text = section(PREFLIGHT, '0.5 The record');
  assert.ok(text.includes('`git check-ignore -q .reimagine/`'));
  assert.ok(!text.includes('`git check-ignore -q .reimagine`'));
});

test('R80: Step 0 and worktree.md create the worktree with the same command, at the start commit', () => {
  for (const text of [WORKTREE, PREFLIGHT]) assert.ok(text.includes('`git worktree add --detach <path> <start commit>`'));
});

test('the reading block prints Tickets, Mode, Scope and Effort, in the order the opening actions name', () => {
  const block = SKILL.split('```\n').find((text) => text.startsWith('Tickets: '));
  assert.notEqual(block, undefined, 'SKILL.md has no reading block');
  const labels = block.trim().split('\n').map((line) => line.split(':')[0]);
  assert.deepEqual(labels, ['Tickets', 'Mode', 'Scope', 'Effort']);
  const opening = SKILL.split('\n').find((line) => line.startsWith('3. Print the reading block ('));
  assert.deepEqual(opening.match(/\(([^)]+)\)/)[1].split(', '), labels);
});

test('R282: the Mode line is one of three modes with the continue, base and confirm additions, and a ticket names one of five ways it resolved', () => {
  const after = SKILL.split('\n').find((line) => line.startsWith('Each ticket names how it resolved'));
  assert.notEqual(after, undefined, 'SKILL.md does not say how a ticket resolved');
  assert.deepEqual(ticks(after.split('. Mode is')[0]), ['gh', 'az boards', 'mcp:<tool>', 'file', 'text']);
  assert.deepEqual(ticks(after.split('Mode is ')[1].split('. A pull request')[0]).filter((name) => name !== '.reimagine.json'), [
    'build and publish', 'plan only', 'build without publishing', '; continue branch <b>', '; base <branch>', '; confirm the plan',
  ]);
});

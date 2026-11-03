// Runs tools/commit-messages.mjs against a scratch repository, one commit per message form.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../../tools/commit-messages.mjs', import.meta.url));

let scratch;
let dir;
let base;
let env;

const git = (...args) => {
  const r = spawnSync(
    'git',
    ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', ...args],
    { cwd: dir, env, encoding: 'utf8' },
  );
  assert.equal(r.status, 0, `git ${args.join(' ')}\n${r.stderr}`);
  return r.stdout.trim();
};

const commit = (message) => {
  git('commit', '--allow-empty', '-m', message);
  return git('rev-parse', 'HEAD');
};

const check = (...args) => spawnSync(process.execPath, [script, ...args], { cwd: dir, env, encoding: 'utf8' });

before(() => {
  scratch = mkdtempSync(join(tmpdir(), 'commit-messages-'));
  const emptyConfig = join(scratch, 'empty.gitconfig');
  writeFileSync(emptyConfig, '');
  env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: emptyConfig, GIT_CEILING_DIRECTORIES: scratch };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;
  dir = join(scratch, 'repo');
  mkdirSync(dir);
  git('init', '-q');
  base = commit('docs(a): the base');
});

after(() => rmSync(scratch, { recursive: true, force: true }));

test('R222: a range with plain messages passes', () => {
  const head = commit('fix(a): a plain subject\n\nThe body says why, and names a session only in prose.');
  const r = check(base, head);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'commit messages: ok (1 commits)\n');
});

for (const line of [
  'Claude-Session: https://example.invalid/x',
  'See https://claude.ai/code/session_01abc for the run.',
  'Co-Authored-By: Claude <noreply@example.invalid>',
  'co-authored-by:   claude <noreply@example.invalid>',
]) {
  test(`R222: a message holding "${line}" fails and is named`, () => {
    const from = git('rev-parse', 'HEAD');
    const head = commit(`fix(a): a subject\n\nThe body.\n\n${line}`);
    const r = check(from, head);
    assert.equal(r.status, 1);
    assert.equal(r.stderr, `commit messages: ${head.slice(0, 7)}: ${line}\n`);
  });
}

test('R222: a line in a commit before the range does not count', () => {
  const head = commit('fix(a): after the last one');
  const r = check(git('rev-parse', 'HEAD~1'), head);
  assert.equal(r.status, 0, r.stderr);
});

test('R222: a range git cannot read is an error, not a pass', () => {
  const r = check('no-such-ref', 'HEAD');
  assert.equal(r.status, 2);
});

test('R222: no arguments is an error, not a pass', () => {
  const r = check();
  assert.equal(r.status, 2);
});

const describe = (text) => spawnSync(process.execPath, [script, '--description'], { input: text, encoding: 'utf8' });

test('R222: a plain pull request description passes', () => {
  const r = describe('The change keeps the trailer.\r\n\r\nCloses #65.\n');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'pull request description: ok\n');
});

test('R222: an empty pull request description passes', () => {
  const r = describe('');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'pull request description: ok\n');
});

test('R222: a pull request description holding a session line fails and names each line', () => {
  const r = describe('The summary.\r\n\r\nhttps://claude.ai/code/session_01abc\nClaude-Session: https://example.invalid/x\n');
  assert.equal(r.status, 1);
  assert.equal(
    r.stderr,
    'pull request description: line 3: https://claude.ai/code/session_01abc\n' +
      'pull request description: line 4: Claude-Session: https://example.invalid/x\n',
  );
});

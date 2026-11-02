// Runs tools/commit-messages.mjs against a scratch repository, one commit per message form.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../../tools/commit-messages.mjs', import.meta.url));

let dir;
let base;

const git = (...args) => {
  const r = spawnSync(
    'git',
    ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', ...args],
    { cwd: dir, encoding: 'utf8' },
  );
  assert.equal(r.status, 0, `git ${args.join(' ')}\n${r.stderr}`);
  return r.stdout.trim();
};

const commit = (message) => {
  git('commit', '--allow-empty', '-m', message);
  return git('rev-parse', 'HEAD');
};

const check = (...args) => spawnSync(process.execPath, [script, ...args], { cwd: dir, encoding: 'utf8' });

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'commit-messages-'));
  git('init', '-q');
  base = commit('docs(a): the base');
});

after(() => rmSync(dir, { recursive: true, force: true }));

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

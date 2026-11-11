// What git selects for the paths split.mjs gives the reviews of a pass, on repositories built here. Needs git and node.
// Every expected value is a literal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../../plugins/gate/scripts/split.mjs', import.meta.url));
const PASS = readFileSync(new URL('../../plugins/gate/skills/gate/steps/1-pass.md', import.meta.url), 'utf8');
const RANGE = 'main...HEAD';
const text = (n) => 'line\n'.repeat(n);

// A repository whose main holds the files of `base` and whose branch feature, checked out, holds those of `head`, each a
// map of path to text. Returns git, which runs there and gives the lines of its output.
function repo(t, base, head) {
  const dir = mkdtempSync(join(tmpdir(), 'gate-paths-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const config = join(dir, 'empty-gitconfig');
  writeFileSync(config, '');
  const root = join(dir, 'repo');
  mkdirSync(root);
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: config };
  const raw = (...args) => {
    const r = spawnSync('git', ['-c', 'core.autocrlf=false', '-c', 'user.name=gate', '-c', 'user.email=gate@example.com', ...args], { cwd: root, env, encoding: 'utf8' });
    assert.equal(r.status, 0, `git ${args.join(' ')}\n${r.stderr}`);
    return r.stdout;
  };
  const write = (files) => {
    for (const [path, body] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), body);
    }
  };
  raw('init', '--quiet', '--initial-branch=main');
  write(base);
  raw('add', '--all');
  raw('commit', '--quiet', '--message', 'base');
  raw('checkout', '--quiet', '-b', 'feature');
  for (const path of Object.keys(base)) if (!(path in head)) rmSync(join(root, path));
  write(head);
  raw('add', '--all');
  raw('commit', '--quiet', '--message', 'head');
  const git = (...args) => raw(...args).split('\n').filter(Boolean);
  git.raw = raw;
  return git;
}

const split = (git, max) => {
  const r = spawnSync(process.execPath, [script, max], { input: git.raw('diff', '--numstat', '-z', '--no-renames', RANGE), encoding: 'utf8' });
  assert.equal(r.stderr, '');
  return JSON.parse(r.stdout);
};

test('a file replaced by a folder of its name is grouped with that folder, and each changed file is in the paths of one group', (t) => {
  const git = repo(
    t,
    { 'app/p': text(1), 'lib/x.js': text(1), 'src/a': text(1), 'src/c.js': text(1) },
    { 'app/p/q/x.js': text(30), 'app/p/r/y.js': text(30), 'lib/x.js': text(31), 'src/a/b.js': text(10), 'src/c.js': text(16) },
  );
  const out = split(git, '20');
  assert.deepEqual(out, {
    lines: 117,
    groups: [
      { slug: 'app', paths: ['app'], files: 3, lines: 61 },
      { slug: 'lib', paths: ['lib'], files: 1, lines: 30 },
      { slug: 'src-a', paths: ['src/a'], files: 2, lines: 11 },
      { slug: 'src-root', paths: ['src/c.js'], files: 1, lines: 15 },
    ],
  });
  const selected = Object.fromEntries(out.groups.map((g) => [g.slug, git('diff', '--name-only', '--no-renames', RANGE, '--', ...g.paths)]));
  assert.deepEqual(selected, {
    app: ['app/p', 'app/p/q/x.js', 'app/p/r/y.js'],
    lib: ['lib/x.js'],
    'src-a': ['src/a', 'src/a/b.js'],
    'src-root': ['src/c.js'],
  });
});

test("the stand-in's diff, as the step shows it, reads a group's paths as names and not as patterns", (t) => {
  const git = repo(
    t,
    { 'lib/big.js': text(1), 'lib/x.js': text(1), 'l[i]b/x.js': text(1), 'm.md': text(1) },
    { 'lib/big.js': text(31), 'lib/x.js': text(3), 'l[i]b/x.js': text(3), 'm.md': text(2) },
  );
  assert.deepEqual(split(git, '20'), {
    lines: 35,
    groups: [
      { slug: 'lib', paths: ['lib'], files: 2, lines: 32 },
      { slug: 'small', paths: ['l[i]b/x.js', 'm.md'], files: 2, lines: 3 },
    ],
  });
  // Read as patterns, the group's paths select a file of the other group as well.
  assert.deepEqual(git('diff', '--name-only', RANGE, '--', 'l[i]b/x.js', 'm.md'), ['l[i]b/x.js', 'lib/x.js', 'm.md']);
  const section = /^## The stand-in\n([^]*?)^## /m.exec(PASS);
  const shown = section && /`git ([^`]*diff <merge-base>\.\.\.HEAD)`/.exec(section[1]);
  assert.ok(shown, 'the stand-in section shows its git diff');
  const args = shown[1].split(' ').map((word) => (word === '<merge-base>...HEAD' ? RANGE : word));
  assert.deepEqual(git(...args, '--name-only', '--', 'l[i]b/x.js', 'm.md'), ['l[i]b/x.js', 'm.md']);
});

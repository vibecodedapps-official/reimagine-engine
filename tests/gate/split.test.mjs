// Runs plugins/gate/scripts/split.mjs on numstat records typed here; every expected value is a literal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../../plugins/gate/scripts/split.mjs', import.meta.url));
const USAGE = 'usage: git diff --numstat -z --no-renames <merge-base>...HEAD | node split.mjs <split>';

// The records of `git diff --numstat -z --no-renames` for [added, deleted, path] rows.
const numstat = (rows) => rows.map(([added, deleted, path]) => `${added}\t${deleted}\t${path}\0`).join('');
const run = (input, ...args) => spawnSync(process.execPath, [script, ...args], { input, encoding: 'utf8' });
const groups = (rows, max = '1500') => {
  const r = run(numstat(rows), max);
  assert.equal(r.stderr, '');
  assert.equal(r.status, 0);
  return JSON.parse(r.stdout);
};

test('a change at the split is one review of the whole range', () => {
  assert.deepEqual(groups([[900, 100, 'src/a.ts'], [400, 100, 'docs/b.md']]), {
    lines: 1500,
    groups: [{ slug: 'all', paths: [], files: 2, lines: 1500 }],
  });
});

test('a binary file counts as no lines, and no change at all is the one review', () => {
  assert.deepEqual(groups([['-', '-', 'img/logo.png'], [3, 2, 'src/a.ts']]), { lines: 5, groups: [{ slug: 'all', paths: [], files: 2, lines: 5 }] });
  assert.deepEqual(groups([]), { lines: 0, groups: [{ slug: 'all', paths: [], files: 0, lines: 0 }] });
});

test('files under one folder are grouped at the first depth that gives more than one group', () => {
  assert.deepEqual(groups([[1000, 0, 'src/api/a.ts'], [200, 0, 'src/index.ts'], [400, 0, 'src/web/b.ts']]), {
    lines: 1600,
    groups: [
      { slug: 'src-api', paths: ['src/api'], files: 1, lines: 1000 },
      { slug: 'src-root', paths: ['src/index.ts'], files: 1, lines: 200 },
      { slug: 'src-web', paths: ['src/web'], files: 1, lines: 400 },
    ],
  });
});

test('files at the top of the repository are the group root', () => {
  assert.deepEqual(groups([[900, 0, 'README.md'], [400, 0, 'package.json'], [800, 0, 'src/a.ts']]), {
    lines: 2100,
    groups: [
      { slug: 'root', paths: ['README.md', 'package.json'], files: 2, lines: 1300 },
      { slug: 'src', paths: ['src'], files: 1, lines: 800 },
    ],
  });
});

test('a folder still over the split is grouped again one segment deeper', () => {
  const rows = [[400, 0, 'src/api/index.ts'], [900, 0, 'src/api/v1/x.ts'], [700, 0, 'src/api/v2/y.ts'], [350, 0, 'src/index.ts'], [400, 0, 'src/web/b.ts']];
  assert.deepEqual(groups(rows), {
    lines: 2750,
    groups: [
      { slug: 'src-api-root', paths: ['src/api/index.ts'], files: 1, lines: 400 },
      { slug: 'src-api-v1', paths: ['src/api/v1'], files: 1, lines: 900 },
      { slug: 'src-api-v2', paths: ['src/api/v2'], files: 1, lines: 700 },
      { slug: 'src-root', paths: ['src/index.ts'], files: 1, lines: 350 },
      { slug: 'src-web', paths: ['src/web'], files: 1, lines: 400 },
    ],
  });
});

test('a folder over the split whose files all sit directly in it stays one group', () => {
  assert.deepEqual(groups([[1000, 0, 'src/api/a.ts'], [800, 0, 'src/api/b.ts'], [400, 0, 'src/web/c.ts']]), {
    lines: 2200,
    groups: [
      { slug: 'src-api', paths: ['src/api'], files: 2, lines: 1800 },
      { slug: 'src-web', paths: ['src/web'], files: 1, lines: 400 },
    ],
  });
});

test('one file over the split is one review of the whole range', () => {
  assert.deepEqual(groups([[2000, 0, 'src/a.ts']]), { lines: 2000, groups: [{ slug: 'all', paths: [], files: 1, lines: 2000 }] });
});

test('a slug a folder already holds takes -2 for the folder files beside it', () => {
  assert.deepEqual(groups([[900, 0, 'src/api/a.ts'], [400, 0, 'src/index.ts'], [500, 0, 'src/root/b.ts']]), {
    lines: 1800,
    groups: [
      { slug: 'src-api', paths: ['src/api'], files: 1, lines: 900 },
      { slug: 'src-root', paths: ['src/root'], files: 1, lines: 500 },
      { slug: 'src-root-2', paths: ['src/index.ts'], files: 1, lines: 400 },
    ],
  });
});

test('two folders that give one slug are told apart in byte order of path', () => {
  assert.deepEqual(groups([[800, 0, 'a-b/y.ts'], [800, 0, 'a b/x.ts']]), {
    lines: 1600,
    groups: [
      { slug: 'a-b', paths: ['a b'], files: 1, lines: 800 },
      { slug: 'a-b-2', paths: ['a-b'], files: 1, lines: 800 },
    ],
  });
});

test('groups under a fifth of the split are merged until they reach it, and one left alone stays', () => {
  const rows = [[900, 0, 'app/main.ts'], [120, 0, 'docs/a.md'], [150, 0, 'lib/b.ts'], [280, 0, 'tests/c.ts'], [150, 0, 'tools/d.ts']];
  assert.deepEqual(groups(rows), {
    lines: 1600,
    groups: [
      { slug: 'app', paths: ['app'], files: 1, lines: 900 },
      { slug: 'small', paths: ['docs/a.md', 'lib/b.ts', 'tests/c.ts'], files: 3, lines: 550 },
      { slug: 'tools', paths: ['tools'], files: 1, lines: 150 },
    ],
  });
});

test('the small groups left at the end merge although they stay under the fifth, a folder\'s own files last', () => {
  const rows = [[1300, 0, 'app/main.ts'], [100, 0, 'docs/a.md'], [50, 0, 'notes.md'], [100, 0, 'tools/d.ts']];
  assert.deepEqual(groups(rows), {
    lines: 1550,
    groups: [
      { slug: 'app', paths: ['app'], files: 1, lines: 1300 },
      { slug: 'small', paths: ['docs/a.md', 'tools/d.ts', 'notes.md'], files: 3, lines: 250 },
    ],
  });
});

test('small groups of a folder grouped again merge under that folder\'s name', () => {
  const rows = [[400, 0, 'docs/a.md'], [1200, 0, 'src/api/v1/x.ts'], [100, 0, 'src/api/v2/y.ts'], [150, 0, 'src/api/v3/z.ts'], [100, 0, 'src/api/v4/w.ts']];
  assert.deepEqual(groups(rows), {
    lines: 1950,
    groups: [
      { slug: 'docs', paths: ['docs'], files: 1, lines: 400 },
      { slug: 'src-api-v1', paths: ['src/api/v1'], files: 1, lines: 1200 },
      { slug: 'src-small', paths: ['src/api/v2/y.ts', 'src/api/v3/z.ts', 'src/api/v4/w.ts'], files: 3, lines: 350 },
    ],
  });
});

test('the split argument sets the size and the fifth', () => {
  assert.deepEqual(groups([[60, 0, 'a/x.ts'], [15, 0, 'b/y.ts'], [10, 0, 'c/z.ts'], [40, 0, 'd/w.ts']], '100'), {
    lines: 125,
    groups: [
      { slug: 'a', paths: ['a'], files: 1, lines: 60 },
      { slug: 'd', paths: ['d'], files: 1, lines: 40 },
      { slug: 'small', paths: ['b/y.ts', 'c/z.ts'], files: 2, lines: 25 },
    ],
  });
});

for (const [name, args] of [['no argument', []], ['a split of 0', ['0']], ['a split that is not a number', ['many']], ['two arguments', ['1500', '2']]]) {
  test(`${name} is a usage error`, () => {
    const r = run('', ...args);
    assert.deepEqual([r.status, r.stdout, r.stderr], [2, '', USAGE + '\n']);
  });
}

for (const [name, input] of [
  ['records ended by newlines', '10\t5\tsrc/a.ts\n3\t0\tsrc/b.ts\n'],
  ['a rename record', '1\t1\t\0src/old.ts\0src/new.ts\0'],
  ['text that is not numstat', 'src/a.ts\0'],
]) {
  test(`${name} is refused`, () => {
    const r = run(input, '1500');
    assert.deepEqual([r.status, r.stdout, r.stderr], [1, '', 'split: stdin is not the output of git diff --numstat -z --no-renames\n']);
  });
}

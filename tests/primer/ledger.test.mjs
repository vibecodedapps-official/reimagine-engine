// Runs plugins/primer/scripts/ledger.mjs as a child process against a configuration directory of its own, with feedback logs
// and a store, and holds each form's output and the ledger file to literals. A store under git shows a fold's commit.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../../plugins/primer/scripts/ledger.mjs', import.meta.url));
const slash = (p) => p.replaceAll('\\', '/');

let base, env, seq = 0;

const write = (dir, path, text) => {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
};
const git = (cwd, ...args) => {
  const r = spawnSync('git', ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'init.defaultBranch=main', ...args], { cwd, env, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}\n${r.stderr}`);
  return r.stdout;
};
// A configuration directory with three feedback logs and an empty store.
const config = () => {
  const dir = join(base, `config-${++seq}`);
  for (const day of ['2026-11-01', '2026-11-02', '2026-11-03']) write(dir, `feedback/${day}.md`, '# Log\n');
  mkdirSync(join(dir, 'reimagine-primer', 'store'), { recursive: true });
  return { dir, ledger: join(dir, 'reimagine-primer', 'store', 'ledger.jsonl') };
};
const run = (cfg, ...args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: base, env: { ...env, CLAUDE_CONFIG_DIR: cfg.dir }, encoding: 'utf8' });
const out = (cfg, ...args) => { const r = run(cfg, ...args); return [r.status, r.stdout]; };
const lines = (cfg) => readFileSync(cfg.ledger, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

before(() => {
  base = realpathSync.native(mkdtempSync(join(tmpdir(), 'primer-ledger-')));
  const empty = join(base, 'empty.gitconfig');
  writeFileSync(empty, '');
  const home = join(base, 'home');
  mkdirSync(home);
  env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: empty, GIT_CEILING_DIRECTORIES: base, CLAUDE_CONFIG_DIR: join(base, 'no-config'), HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(base, 'xdg') };
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']) delete env[k];
});
after(() => rmSync(base, { recursive: true, force: true }));

describe('ledger', () => {
  test('an item is added once, seen again across logs, held, brought back by a later log, and folded', () => {
    const cfg = config();
    assert.deepEqual(out(cfg), [0, `ledger: ${cfg.ledger}\nno items\n`]);
    assert.deepEqual(out(cfg, '--add', '2026-11-01.md', 'The release date was copied, not pointed to.'),
      [0, `primer: wrote ${cfg.ledger}\n+ L1 open, seen 1: The release date was copied, not pointed to. (2026-11-01.md)\n`]);
    assert.deepEqual(out(cfg, '--add', '2026-11-02.md', 'the release date was copied, not pointed to.'),
      [1, 'primer: L1 already states that gap; use --seen L1 <log>\n']);
    assert.deepEqual(out(cfg, '--seen', 'L1', '2026-11-02.md'),
      [0, `primer: wrote ${cfg.ledger}\n~ L1 open, seen 2: The release date was copied, not pointed to. (2026-11-01.md, 2026-11-02.md)\n`]);
    assert.deepEqual(out(cfg, '--seen', 'L1', '2026-11-02.md'), [1, 'primer: L1 already counts 2026-11-02.md\n']);
    assert.equal(out(cfg, '--set', 'L1', 'held')[1].split('\n')[1], '~ L1 held, seen 2: The release date was copied, not pointed to. (2026-11-01.md, 2026-11-02.md)');
    assert.equal(out(cfg, '--seen', 'L1', '2026-11-03.md')[1].split('\n')[1],
      '~ L1 open, seen 3: The release date was copied, not pointed to. (2026-11-01.md, 2026-11-02.md, 2026-11-03.md)');
    write(base, `layers-${seq}/shared.md`, 'A release date is read from the changelog.\n');
    const place = join(base, `layers-${seq}`, 'shared.md');
    assert.equal(out(cfg, '--set', 'L1', 'folded', '--place', place)[1].split('\n')[1],
      `~ L1 folded in ${slash(place)}, seen 3: The release date was copied, not pointed to. (2026-11-01.md, 2026-11-02.md, 2026-11-03.md)`);
    assert.deepEqual(lines(cfg), [{ id: 'L1', gap: 'The release date was copied, not pointed to.', logs: ['2026-11-01.md', '2026-11-02.md', '2026-11-03.md'],
      status: 'folded', place: slash(place), commit: null, by: null, seen: 3, failed: [], worked: [] }]);
  });

  test('a later log that trips on a folded rule counts as its failure, and one that says it worked counts for it', () => {
    const cfg = config();
    write(base, `layers-${seq}/shared.md`, 'Commits name no tool.\n');
    const place = join(base, `layers-${seq}`, 'shared.md');
    out(cfg, '--add', '2026-11-01.md', 'A commit named a tool.');
    out(cfg, '--set', 'L1', 'folded', '--place', place);
    assert.equal(out(cfg, '--seen', 'L1', '2026-11-02.md')[1].split('\n')[1],
      `~ L1 folded in ${slash(place)}, seen 2, failed 1: A commit named a tool. (2026-11-01.md, 2026-11-02.md)`);
    assert.equal(out(cfg, '--worked', 'L1', '2026-11-03.md')[1].split('\n')[1],
      `~ L1 folded in ${slash(place)}, seen 2, failed 1, worked 1: A commit named a tool. (2026-11-01.md, 2026-11-02.md)`);
    assert.deepEqual(out(cfg, '--worked', 'L1', '2026-11-03.md'), [1, 'primer: L1 already counts 2026-11-03.md as worked\n']);
    out(cfg, '--add', '2026-11-03.md', 'A second gap.');
    assert.deepEqual(out(cfg, '--worked', 'L2', '2026-11-03.md'), [1, 'primer: L2 is open; only a folded rule can have worked\n']);
    assert.equal(out(cfg, '--set', 'L2', 'superseded', '--by', 'L1')[1].split('\n')[1], '~ L2 superseded by L1, seen 1: A second gap. (2026-11-03.md)');
    assert.deepEqual(out(cfg, '--seen', 'L2', '2026-11-01.md'), [1, 'primer: L2 is superseded by L1; record it there\n']);
    assert.deepEqual(out(cfg), [0, [`ledger: ${cfg.ledger}`, `L1 folded in ${slash(place)}, seen 2, failed 1, worked 1: A commit named a tool. (2026-11-01.md, 2026-11-02.md)`,
      'L2 superseded by L1, seen 1: A second gap. (2026-11-03.md)', ''].join('\n')]);
  });

  test('a fold into a place git tracks records its commit, and is refused without one', () => {
    const cfg = config();
    const store = join(base, `versioned-${seq}`);
    write(store, 'shared.md', 'Every mapped repository uses LF line ends.\n');
    git(store, 'init', '-q');
    git(store, 'add', '-A');
    git(store, 'commit', '-q', '-m', 'fold');
    const sha = git(store, 'rev-parse', 'HEAD').trim();
    const place = join(store, 'shared.md');
    out(cfg, '--add', '2026-11-01.md', 'Line ends were mixed.');
    assert.deepEqual(out(cfg, '--set', 'L1', 'folded', '--place', place), [1, `primer: git tracks ${place}; --commit names the commit that folded it\n`]);
    assert.deepEqual(out(cfg, '--set', 'L1', 'folded', '--place', place, '--commit', 'nope'), [1, `primer: nope is not a commit of the repository that holds ${place}\n`]);
    assert.equal(out(cfg, '--set', 'L1', 'folded', '--place', place, '--commit', 'HEAD')[1].split('\n')[1],
      `~ L1 folded in ${slash(place)} at ${sha.slice(0, 12)}, seen 1: Line ends were mixed. (2026-11-01.md)`);
    assert.equal(lines(cfg)[0].commit, sha);
    write(base, `loose-${seq}.md`, 'x\n');
    assert.deepEqual(out(cfg, '--set', 'L1', 'folded', '--place', join(base, `loose-${seq}.md`), '--commit', 'HEAD'),
      [1, `primer: git does not track ${join(base, `loose-${seq}.md`)}, so the fold has no commit\n`]);
  });

  test('each form the ledger does not take is refused with one line and writes nothing', () => {
    const cfg = config();
    const forms = 'primer: ledger takes nothing, --add <log> <gap>, --seen <id> <log>, --worked <id> <log>, or --set <id> <status> '
      + 'with --place <file> [--commit <sha>] for folded and --by <id> for superseded\n';
    assert.deepEqual(out(cfg, '--add', '2026-11-01.md'), [1, forms]);
    assert.deepEqual(out(cfg, '--drop', 'L1'), [1, forms]);
    assert.deepEqual(out(cfg, '--add', 'missing.md', 'A gap.'), [1, `primer: ${join(cfg.dir, 'feedback', 'missing.md')} is not a feedback log\n`]);
    assert.deepEqual(out(cfg, '--add', '../feedback', 'A gap.'), [1, `primer: ${join(cfg.dir, 'feedback', '../feedback')} is not a feedback log\n`]);
    assert.deepEqual(out(cfg, '--add', '2026-11-01.md', 'two\nlines'), [1, 'primer: a gap is one line of text\n']);
    assert.deepEqual(out(cfg, '--seen', 'L9', '2026-11-01.md'), [1, 'primer: the ledger holds no item L9\n']);
    out(cfg, '--add', '2026-11-01.md', 'A gap.');
    const before = readFileSync(cfg.ledger, 'utf8');
    assert.deepEqual(out(cfg, '--set', 'L1', 'done'), [1, 'primer: a status is one of open, folded, rejected, held, superseded, not done\n']);
    assert.deepEqual(out(cfg, '--set', 'L1', 'folded'), [1, forms]);
    assert.deepEqual(out(cfg, '--set', 'L1', 'held', '--by', 'L1'), [1, forms]);
    assert.deepEqual(out(cfg, '--set', 'L1', 'superseded', '--by', 'L1'), [1, 'primer: L1 cannot supersede itself\n']);
    assert.equal(readFileSync(cfg.ledger, 'utf8'), before);
    writeFileSync(cfg.ledger, '{"id":"x"}\n');
    assert.deepEqual(out(cfg), [1, `primer: ${cfg.ledger} is not a primer ledger\n`]);
  });
});

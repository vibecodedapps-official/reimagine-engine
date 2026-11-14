// Runs plugins/primer/scripts/transcripts.mjs as a child process against a throwaway repository and a configuration directory
// whose session files are written here, with made-up content, and holds its output to literals.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../../plugins/primer/scripts/transcripts.mjs', import.meta.url));
const slash = (p) => p.replaceAll('\\', '/');

let base, env, root, cfg;

const write = (dir, path, text) => {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
};
const git = (cwd, ...args) => {
  const r = spawnSync('git', ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'init.defaultBranch=main', ...args], { cwd, env, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}\n${r.stderr}`);
  return r.stdout;
};
const run = (args, cwd = root, config = cfg, extra = {}) => {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, env: { ...env, CLAUDE_CONFIG_DIR: config, ...extra }, encoding: 'utf8' });
  return [r.status, r.stdout];
};
// The session directory the host names for a directory a session started in.
const project = (dir, config = cfg) => join(config, 'projects', slash(dir).replace(/[^A-Za-z0-9]/g, '-'));
const user = (content, at, sessionId, cwd, extra = {}) => JSON.stringify({ type: 'user', message: { role: 'user', content }, timestamp: at, sessionId, cwd: slash(cwd), ...extra });

before(() => {
  base = realpathSync.native(mkdtempSync(join(tmpdir(), 'primer-transcripts-')));
  const empty = join(base, 'empty.gitconfig');
  writeFileSync(empty, '');
  const home = join(base, 'home');
  mkdirSync(home);
  env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: empty, GIT_CEILING_DIRECTORIES: base, CLAUDE_CONFIG_DIR: join(base, 'no-config'), HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(base, 'xdg') };
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']) delete env[k];
  root = join(base, 'app');
  write(root, 'docs/README.md', '# x\n');
  git(root, 'init', '-q');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'init');
  const tree = join(base, 'app-wt');
  git(root, 'worktree', 'add', '-q', tree);
  cfg = join(base, 'config');

  const one = [
    JSON.stringify({ type: 'summary', summary: 'A session.' }),
    user('Run the lint before each push.', '2026-11-02T09:00:00.000Z', 's-one', root),
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Done.' }] }, timestamp: '2026-11-02T09:00:05.000Z', sessionId: 's-one', cwd: slash(root) }),
    user([{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }], '2026-11-02T09:00:06.000Z', 's-one', root),
    user([{ type: 'text', text: 'Which layer\nholds the release steps?' }], '2026-11-03T23:30:00.000Z', 's-one', root),
    user('<system-reminder>Loaded.</system-reminder>', '2026-11-02T09:01:00.000Z', 's-one', root, { isMeta: true }),
    '{"type":"user","message":{"role":"us',
    '[1,2]',
    JSON.stringify({ type: 'user', message: { role: 'user', content: 'No time.' }, sessionId: 's-one', cwd: slash(root) }),
    user('<local-command-stdout>output</local-command-stdout>', '2026-11-02T09:02:00.000Z', 's-one', root),
    user('Before the span.', '2026-10-30T12:00:00.000Z', 's-one', root),
    user('From a subagent.', '2026-11-02T09:03:00.000Z', 's-one', root, { isSidechain: true }),
    JSON.stringify({ type: 'user', message: { role: 'user', content: { text: 'Loaded.' } }, isMeta: true }),
    user('<task-notification>\n<task-id>b1</task-id>\n<status>completed</status>\n</task-notification>', '2026-11-02T09:05:00.000Z', 's-one', root),
  ];
  write(project(root), 's-one.jsonl', `${one.join('\r\n')}\r\n`);
  write(project(root), 's-one/subagents/agent-1.jsonl', `${user('Not the user.', '2026-11-02T09:04:00.000Z', 's-one', root)}\n`);
  write(project(join(root, 'docs')), 's-two.jsonl', `${user('Use the date from the changelog.', '2026-11-04T08:00:00.000Z', 's-two', join(root, 'docs'))}\n`);
  write(project(tree), 's-wt.jsonl', `${user('From the worktree.', '2026-11-03T10:00:00.000Z', 's-wt', tree)}\n`);
  write(project(join(base, 'app-other')), 's-other.jsonl', `${user('Another repository.', '2026-11-02T10:00:00.000Z', 's-other', join(base, 'app-other'))}\n`);
  write(project(root), 'old.jsonl', 'not json\n');
  utimesSync(join(project(root), 'old.jsonl'), new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'));
  // The reader skips a file last modified before the span, so the read files carry a fixed time, not the clock's.
  const at = new Date('2026-11-05T00:00:00Z');
  for (const [dir, name] of [[project(root), 's-one.jsonl'], [project(join(root, 'docs')), 's-two.jsonl'], [project(tree), 's-wt.jsonl'], [project(join(base, 'app-other')), 's-other.jsonl']]) utimesSync(join(dir, name), at, at);
});
after(() => rmSync(base, { recursive: true, force: true }));

describe('transcripts', () => {
  test('lists the user\'s own messages of every work tree of the repository in the span, and the share of lines it skipped', () => {
    assert.deepEqual(run(['--from', '2026-11-01', '--to', '2026-11-04']), [0, [
      `primer: 4 messages of the user in 3 sessions of ${slash(root)}, 2026-11-01 to 2026-11-04, from 4 files under ${join(cfg, 'projects')}`,
      '2026-11-02T09:00:00.000Z s-one "Run the lint before each push."',
      '2026-11-03T10:00:00.000Z s-wt "From the worktree."',
      '2026-11-03T23:30:00.000Z s-one "Which layer\\nholds the release steps?"',
      '2026-11-04T08:00:00.000Z s-two "Use the date from the changelog."',
      'primer: skipped 3 of 17 lines (17.6%), which the reader could not read',
      '',
    ].join('\n')]);
  });

  test('a span of one day, given from a work tree', () => {
    assert.deepEqual(run(['--from', '2026-11-03', '--to', '2026-11-03'], join(base, 'app-wt')), [0, [
      `primer: 2 messages of the user in 2 sessions of ${slash(root)}, 2026-11-03 to 2026-11-03, from 4 files under ${join(cfg, 'projects')}`,
      '2026-11-03T10:00:00.000Z s-wt "From the worktree."',
      '2026-11-03T23:30:00.000Z s-one "Which layer\\nholds the release steps?"',
      'primer: skipped 3 of 17 lines (17.6%), which the reader could not read',
      '',
    ].join('\n')]);
  });

  test('without session files it lists nothing and skips nothing', () => {
    assert.deepEqual(run(['--repo', root], base, join(base, 'empty-config')), [0, [
      `primer: 0 messages of the user in 0 sessions of ${slash(root)}, the first day to the last day, from 0 files under ${join(base, 'empty-config', 'projects')}`,
      'primer: skipped 0 of 0 lines (0.0%), which the reader could not read',
      '',
    ].join('\n')]);
  });

  test('a session directory the host named from CLAUDE_CODE_PROJECT_DIR_NAME is read', () => {
    const named = join(base, 'named-config');
    write(join(named, 'projects', 'myproj'), 's-named.jsonl', `${user('Keep the notes short.', '2026-11-02T11:00:00.000Z', 's-named', root)}\n`);
    assert.deepEqual(run(['--repo', root], base, named, { CLAUDE_CODE_PROJECT_DIR_NAME: 'myproj' }), [0, [
      `primer: 1 messages of the user in 1 sessions of ${slash(root)}, the first day to the last day, from 1 files under ${join(named, 'projects')}`,
      '2026-11-02T11:00:00.000Z s-named "Keep the notes short."',
      'primer: skipped 0 of 1 lines (0.0%), which the reader could not read',
      '',
    ].join('\n')]);
  });

  test('the directory that holds a bare repository is no work tree of it', () => {
    const bare = join(base, 'code', 'proj.git'), main = join(base, 'code', 'proj-main'), other = join(base, 'code', 'other'), config = join(base, 'bare-config');
    mkdirSync(join(base, 'code'));
    git(base, 'clone', '-q', '--bare', root, bare);
    git(bare, 'worktree', 'add', '-q', main, 'main');
    write(project(main, config), 's-main.jsonl', `${user('From the work tree of a bare repository.', '2026-11-02T12:00:00.000Z', 's-main', main)}\n`);
    write(project(other, config), 's-far.jsonl', `${user('Another repository beside it.', '2026-11-02T12:01:00.000Z', 's-far', other)}\n`);
    assert.deepEqual(run(['--repo', main], base, config), [0, [
      `primer: 1 messages of the user in 1 sessions of ${slash(bare)}, the first day to the last day, from 1 files under ${join(config, 'projects')}`,
      '2026-11-02T12:00:00.000Z s-main "From the work tree of a bare repository."',
      'primer: skipped 0 of 1 lines (0.0%), which the reader could not read',
      '',
    ].join('\n')]);
  });

  test('each form it does not take is refused with one line', () => {
    const forms = 'primer: transcripts takes --repo <dir>, --from <YYYY-MM-DD> and --to <YYYY-MM-DD>, each at most once\n';
    assert.deepEqual(run(['--from']), [1, forms]);
    assert.deepEqual(run(['--since', '2026-11-01']), [1, forms]);
    assert.deepEqual(run(['--to', '2026-11-01', '--to', '2026-11-02']), [1, forms]);
    assert.deepEqual(run(['--from', '2026-02-30']), [1, 'primer: --from takes a date as YYYY-MM-DD, not 2026-02-30\n']);
    assert.deepEqual(run(['--to', '11/04/2026']), [1, 'primer: --to takes a date as YYYY-MM-DD, not 11/04/2026\n']);
    assert.deepEqual(run(['--from', '', '--to', '2026-11-04']), [1, 'primer: --from takes a date as YYYY-MM-DD, not \n']);
    assert.deepEqual(run(['--from', '2026-11-05', '--to', '2026-11-01']), [1, 'primer: --from 2026-11-05 is after --to 2026-11-01\n']);
    assert.deepEqual(run(['--repo', base]), [1, `primer: ${slash(base)} is in no git work tree\n`]);
  });
});

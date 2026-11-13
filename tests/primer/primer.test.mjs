// Runs plugins/primer/scripts/primer.mjs, as a child process and through its exported main, against throwaway repositories and
// a configuration directory of its own, and holds each verb's output to literals. A slow git is a stand-in on the PATH.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../../plugins/primer/scripts/primer.mjs';

const SCRIPT = fileURLToPath(new URL('../../plugins/primer/scripts/primer.mjs', import.meta.url));
const SHARED = 'Every mapped repository uses LF line ends.\n';
const GROUP = 'The app group builds with npm run build.\n';
const MACHINE = 'This machine keeps its checkouts on one disk.\n';
const slash = (p) => p.replaceAll('\\', '/');

let base, env, seq = 0;

const git = (cwd, ...args) => {
  const r = spawnSync('git', ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'init.defaultBranch=main', ...args], { cwd, env, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}\n${r.stderr}`);
  return r.stdout;
};
const write = (dir, path, text) => {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
};
const repo = (name, remote) => {
  const dir = join(base, name);
  write(dir, 'README.md', '# x\n');
  git(dir, 'init', '-q');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  if (remote) git(dir, 'remote', 'add', 'origin', remote);
  return dir;
};
// A configuration directory with primer's own directory, a map and, as given, the three layers.
const config = (map, layers = {}) => {
  const dir = join(base, `config-${++seq}`);
  const own = join(dir, 'reimagine-primer');
  write(own, 'store/map.json', JSON.stringify(map));
  if (layers.shared !== undefined) write(own, 'store/shared.md', layers.shared);
  if (layers.group !== undefined) write(own, 'store/groups/app.md', layers.group);
  if (layers.machine !== undefined) write(own, 'machine.md', layers.machine);
  return { dir, own, store: join(own, 'store') };
};
const local = (extra = {}) => ({ version: 1, repos: [{ remotes: ['example.invalid/team/app'], path: 'unused', group: 'app', profile: 'local', own: null }], roots: [], ...extra });
const run = (args, { cwd = base, input, extraEnv = {} } = {}) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd, env: { ...env, ...extraEnv }, input, encoding: 'utf8' });
const start = (cfg, cwd, extraEnv = {}, layer = 'all') => run(['session-start', layer, join(base, 'data')], { input: JSON.stringify({ cwd, hook_event_name: 'SessionStart', source: 'startup' }), extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir, ...extraEnv } });
const context = (text, message) => `${JSON.stringify({ ...(text ? { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } } : {}), ...(message ? { systemMessage: message } : {}) })}\n`;
const part = (name, file, body, canary) => `primer layer ${name} from ${file}\n${body}\nprimer canary ${name} ${canary}`;

before(() => {
  base = realpathSync.native(mkdtempSync(join(tmpdir(), 'primer-script-')));
  const empty = join(base, 'empty.gitconfig');
  writeFileSync(empty, '');
  const home = join(base, 'home');
  mkdirSync(home);
  env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: empty, GIT_CEILING_DIRECTORIES: base, CLAUDE_CONFIG_DIR: join(base, 'no-config'), HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(base, 'xdg') };
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'CLAUDE_CODE_SESSION_ATTENDED']) delete env[k];
});
after(() => rmSync(base, { recursive: true, force: true }));

describe('session-start', () => {
  test('without primer\'s own directory it prints nothing', () => {
    const r = start({ dir: join(base, 'no-config') }, repo('none-own', 'https://example.invalid/team/app.git'));
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });

  test('a local repository gets its three layers in one string, each opened by its file and closed by its canary', () => {
    const dir = repo('three', 'https://example.invalid/team/app.git');
    const cfg = config(local(), { shared: SHARED, group: GROUP, machine: MACHINE });
    const text = [
      part('shared', join(cfg.store, 'shared.md'), SHARED.trim(), 'c09a8e67'),
      part('group', join(cfg.store, 'groups', 'app.md'), GROUP.trim(), '5ee2174e'),
      part('machine', join(cfg.own, 'machine.md'), MACHINE.trim(), '3b656d6a'),
    ].join('\n\n');
    const r = start(cfg, dir);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, context(text));
    assert.ok(r.stdout.endsWith('primer canary machine 3b656d6a"}}\n'));
  });

  test('an empty or missing layer contributes nothing, and the last line is the last layer\'s canary', () => {
    const cfg = config(local(), { shared: '\n \n', group: GROUP });
    const r = start(cfg, repo('one-layer', 'git@example.invalid:team/app.git'));
    assert.equal(r.stdout, context(part('group', join(cfg.store, 'groups', 'app.md'), GROUP.trim(), '5ee2174e')));
  });

  test('a layer run alone emits that layer only', () => {
    const cfg = config(local(), { shared: SHARED, group: GROUP, machine: MACHINE });
    const r = start(cfg, repo('per-layer', 'https://example.invalid/team/app.git'), {}, 'machine');
    assert.equal(r.stdout, context(part('machine', join(cfg.own, 'machine.md'), MACHINE.trim(), '3b656d6a')));
  });

  test('a worktree of a repository with no remote matches by the main work tree\'s root', () => {
    const dir = repo('no-remote');
    git(dir, 'worktree', 'add', '-q', join(base, 'no-remote-wt'));
    const cfg = config({ version: 1, repos: [{ remotes: [], path: slash(dir), group: 'app', profile: 'local', own: null }], roots: [] }, { group: GROUP });
    assert.equal(start(cfg, join(base, 'no-remote-wt')).stdout, context(part('group', join(cfg.store, 'groups', 'app.md'), GROUP.trim(), '5ee2174e')));
  });

  test('a string over the cap is still emitted, with a warning that names the layers, the size and the cap', () => {
    const big = `${'a'.repeat(9990)}\n`;
    const cfg = config(local(), { shared: SHARED, group: big });
    const file = join(cfg.store, 'groups', 'app.md');
    const text = `${part('shared', join(cfg.store, 'shared.md'), SHARED.trim(), 'c09a8e67')}\n\n${part('group', file, 'a'.repeat(9990), 'fb0545d8')}`;
    const r = start(cfg, repo('over', 'https://example.invalid/team/app.git'));
    const sharedSize = join(cfg.store, 'shared.md').length + 98, groupSize = file.length + 10044;
    assert.equal(r.stdout, context(text, `primer: the context string is ${sharedSize + 2 + groupSize} characters as emitted, over the host's cap of 10000 (shared ${sharedSize}, group ${groupSize})`));
  });

  test('in a session no one attends the layers load and no warning prints', () => {
    const cfg = config(local(), { group: `${'a'.repeat(9990)}\n` });
    const r = start(cfg, repo('unattended', 'https://example.invalid/team/app.git'), { CLAUDE_CODE_SESSION_ATTENDED: '0' });
    assert.equal(r.stdout, context(part('group', join(cfg.store, 'groups', 'app.md'), 'a'.repeat(9990), 'fb0545d8')));
  });

  test('a repository under a root with no entry gets the unmapped warning; one under no root gets nothing', () => {
    const cfg = config(local({ roots: [slash(join(base, 'work'))] }));
    const dir = repo('work/unmapped', 'https://example.invalid/team/other.git');
    assert.equal(start(cfg, dir).stdout, context(null, `primer: ${slash(dir)} is unmapped, under ${slash(join(base, 'work'))} of the map's roots; run /primer to map it`));
    assert.equal(start(cfg, dir, { CLAUDE_CODE_SESSION_ATTENDED: '0' }).stdout, '');
    assert.equal(start(cfg, repo('elsewhere', 'https://example.invalid/team/other.git')).stdout, '');
  });

  test('a repository mapped shared, a directory outside git and a map that is not a primer map print nothing', () => {
    const cfg = config({ version: 1, repos: [{ remotes: ['example.invalid/team/app'], path: 'unused', group: 'app', profile: 'shared', own: true }], roots: [] }, { group: GROUP });
    assert.equal(start(cfg, repo('shared', 'https://example.invalid/team/app.git')).stdout, '');
    const plain = join(base, 'plain');
    mkdirSync(plain);
    assert.equal(start(config(local({ roots: [slash(base)] }), { group: GROUP }), plain).stdout, '');
    const bad = config({ version: 2 });
    const r = start(bad, repo('bad-map', 'https://example.invalid/team/app.git'));
    assert.deepEqual([r.status, r.stdout], [0, '']);
  });

  test('the configuration directory comes from the transcript path before the variable', () => {
    const cfg = config(local(), { group: GROUP });
    const dir = repo('transcript', 'https://example.invalid/team/app.git');
    const input = JSON.stringify({ cwd: dir, transcript_path: join(cfg.dir, 'projects', 'key', 'session.jsonl') });
    assert.equal(run(['session-start', 'all', join(base, 'data')], { input }).stdout, context(part('group', join(cfg.store, 'groups', 'app.md'), GROUP.trim(), '5ee2174e')));
  });
});

// A git on the PATH that sleeps 10 s: a shell script on POSIX; on Windows, where a child process is found only as an .exe, node
// under that name with a preloaded module that sleeps.
function slowGit() {
  const bin = join(base, `slow-${++seq}`);
  mkdirSync(bin);
  const pathless = Object.fromEntries(Object.entries(env).filter(([k]) => k.toLowerCase() !== 'path'));
  if (process.platform !== 'win32') {
    writeFileSync(join(bin, 'git'), '#!/bin/sh\nexec sleep 10\n');
    chmodSync(join(bin, 'git'), 0o755);
    return { ...pathless, PATH: [bin, env.PATH ?? env.Path].join(delimiter) };
  }
  try { linkSync(process.execPath, join(bin, 'git.exe')); } catch { copyFileSync(process.execPath, join(bin, 'git.exe')); }
  writeFileSync(join(bin, 'sleep.cjs'), 'Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10000);\n');
  return { ...pathless, PATH: [bin, Object.entries(env).find(([k]) => k.toLowerCase() === 'path')[1]].join(delimiter), NODE_OPTIONS: `--require "${slash(join(bin, 'sleep.cjs'))}"` };
}

describe('the git limit', () => {
  test('when git does not answer within the limit no layer is emitted and the message says unknown', () => {
    const dir = repo('slow', 'https://example.invalid/team/app.git');
    const cfg = config(local(), { group: GROUP });
    const slow = { ...slowGit(), CLAUDE_CONFIG_DIR: cfg.dir };
    const t0 = Date.now();
    const out = main(['session-start', 'all', join(base, 'data')], { env: slow, home: join(base, 'home'), cwd: base, stdin: () => JSON.stringify({ cwd: dir }), limit: 1000 });
    const took = Date.now() - t0;
    assert.deepEqual(out, [JSON.stringify({ systemMessage: `primer: the context of ${slash(dir)} is unknown, since git gave no answer within 1 s` })]);
    assert.ok(took < 6000, `took ${took} ms`);
    const shown = main(['status'], { env: slow, home: join(base, 'home'), cwd: dir, limit: 1000 });
    assert.equal(shown.at(-1), 'check git: unknown, no answer within 1 s');
  });
});

describe('status', () => {
  test('a local repository: the entry, the profile, each layer with its file, size and canary, and each check', () => {
    const dir = repo('status-local', 'https://example.invalid/team/app.git');
    const cfg = config(local({ roots: [slash(base)] }), { shared: SHARED, group: GROUP });
    const shared = join(cfg.store, 'shared.md'), group = join(cfg.store, 'groups', 'app.md');
    const r = run(['status'], { cwd: dir, extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir } });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, [
      `primer: ${cfg.own}`,
      `store: ${cfg.store}`,
      `map: ${join(cfg.store, 'map.json')} (1 repositories, 1 roots)`,
      `repository: ${slash(dir)} (example.invalid/team/app)`,
      'entry: group app, profile local, own unset, remotes example.invalid/team/app',
      'profile: local',
      `layer shared: ${shared}, ${shared.length + 98} characters, canary c09a8e67`,
      `layer group: ${group}, ${group.length + 94} characters, canary 5ee2174e`,
      `layer machine: ${join(cfg.own, 'machine.md')}, missing or empty`,
      `check size: ${shared.length + group.length + 194} characters as emitted, within the cap of 10000`,
      'check map: mapped',
      'check git: answered within 5 s',
      '',
    ].join('\n'));
  });

  test('an unmapped repository under a root, and a directory outside git', () => {
    const cfg = config(local({ roots: [slash(base)] }));
    const dir = repo('status-unmapped');
    assert.equal(run(['status'], { cwd: dir, extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir } }).stdout.split('\n').slice(3).join('\n'),
      `repository: ${slash(dir)} (no remote)\nentry: none\nprofile: none\ncheck map: unmapped, under the root ${slash(base)}\ncheck git: answered within 5 s\n`);
    const plain = join(base, 'status-plain');
    mkdirSync(plain);
    assert.equal(run(['status'], { cwd: plain }).stdout, [
      `primer: ${join(base, 'no-config', 'reimagine-primer')} (missing)`,
      `store: ${join(base, 'no-config', 'reimagine-primer', 'store')}`,
      `map: ${join(base, 'no-config', 'reimagine-primer', 'store', 'map.json')} (0 repositories, 0 roots)`,
      `repository: none, ${slash(plain)} is in no git work tree`,
      '',
    ].join('\n'));
  });

  test('status takes no arguments, and an unknown verb is refused', () => {
    assert.deepEqual([run(['status', 'x']).status, run(['status', 'x']).stdout], [1, 'primer: status takes no arguments\n']);
    assert.deepEqual([run(['measure']).status, run(['measure']).stdout], [1, 'primer: unknown command measure; use session-start, staged, status or map\n']);
  });
});

describe('map', () => {
  test('--add, --set and --drop record the answers for the working directory\'s repository, and only the script writes the map', () => {
    const dir = repo('mapped', 'https://example.invalid/team/App.git');
    const cfgDir = join(base, `map-config-${++seq}`);
    const m = (...args) => run(['map', ...args], { cwd: dir, extraEnv: { CLAUDE_CONFIG_DIR: cfgDir } });
    const mapPath = join(cfgDir, 'reimagine-primer', 'store', 'map.json');
    const read = () => JSON.parse(readFileSync(mapPath, 'utf8'));
    assert.equal(m('--add', '--profile', 'shared').stdout, 'primer: --add --profile shared takes --own true or --own false\n');
    assert.equal(existsSync(mapPath), false);
    let r = m('--add', '--profile', 'shared', '--own', 'false', '--root', base);
    assert.equal(r.status, 0, r.stdout);
    assert.equal(r.stdout, `primer: wrote ${mapPath}\nrepo: + group App, profile shared, own false, remotes example.invalid/team/App\nroot: + ${slash(base)}\n`);
    assert.deepEqual(read(), { version: 1, repos: [{ remotes: ['example.invalid/team/App'], path: slash(dir), group: 'App', profile: 'shared', own: false }], roots: [slash(base)] });
    assert.deepEqual([m('--add', '--profile', 'local').status, m('--add', '--profile', 'local').stdout],
      [1, 'primer: this repository is already mapped (group App, profile shared, own false, remotes example.invalid/team/App); use --set\n']);
    assert.equal(m('--set', '--profile', 'local', '--group', 'app').stdout, `primer: wrote ${mapPath}\nrepo: ~ group app, profile local, own false, remotes example.invalid/team/App\n`);
    assert.equal(m().stdout, `map: ${mapPath}\nrepo: group app, profile local, own false, remotes example.invalid/team/App\nroot: ${slash(base)}\n`);
    assert.equal(m('--add', '--root', base).stdout, 'primer: the map already holds that; nothing was written\n');
    assert.equal(m('--drop', '--root', base).stdout, `primer: wrote ${mapPath}\nroot: - ${slash(base)}\n`);
    assert.equal(m('--drop').stdout, `primer: wrote ${mapPath}\nrepo: - group app, profile local, own false, remotes example.invalid/team/App\n`);
    assert.deepEqual(read(), { version: 1, repos: [], roots: [] });
    assert.equal(m('--drop').stdout, 'primer: this repository has no entry in the map; use --add\n');
    const store = join(base, 'elsewhere-store');
    assert.equal(m('--set', '--store', store).stdout, `primer: wrote ${join(cfgDir, 'reimagine-primer', 'config.json')}\n`);
    assert.deepEqual(JSON.parse(readFileSync(join(cfgDir, 'reimagine-primer', 'config.json'), 'utf8')), { store });
    assert.equal(m('--add', '--profile', 'local').stdout, `primer: wrote ${join(store, 'map.json')}\nrepo: + group App, profile local, own unset, remotes example.invalid/team/App\n`);
  });

  test('a repository with no remote is recorded by its main work tree\'s root', () => {
    const dir = repo('map-no-remote');
    const cfgDir = join(base, `map-config-${++seq}`);
    const r = run(['map', '--add', '--profile', 'local'], { cwd: dir, extraEnv: { CLAUDE_CONFIG_DIR: cfgDir } });
    assert.equal(r.stdout, `primer: wrote ${join(cfgDir, 'reimagine-primer', 'store', 'map.json')}\nrepo: + group map-no-remote, profile local, own unset, path ${slash(dir)}\n`);
  });

  test('each form the map does not take is refused with one line', () => {
    const dir = repo('map-refused', 'https://example.invalid/team/app.git');
    const m = (...args) => { const r = run(['map', ...args], { cwd: dir }); return [r.status, r.stdout]; };
    const forms = 'primer: map takes --add with --profile shared|local [--own true|false] [--group <name>] or --root <dir>, --set with any of '
      + '--profile, --own, --group, --root or --store <path>, or --drop [--root <dir>]; nothing else is accepted\n';
    assert.deepEqual(m('--add'), [1, forms]);
    assert.deepEqual(m('--move'), [1, forms]);
    assert.deepEqual(m('--drop', '--group', 'x'), [1, forms]);
    assert.deepEqual(m('--add', '--own', 'true'), [1, forms]);
    assert.deepEqual(m('--add', '--profile', 'team'), [1, 'primer: --profile takes shared or local, not team\n']);
    assert.deepEqual(m('--add', '--profile', 'local', '--group', '../x'), [1, 'primer: --group takes letters, digits, ., _ and -, starting with a letter or digit, not ../x\n']);
    assert.deepEqual(m('--set', '--store', 'relative'), [1, 'primer: --store takes an absolute or ~/ path, not relative\n']);
    assert.deepEqual(m('--set', '--profile', 'local'), [1, 'primer: this repository has no entry in the map; use --add\n']);
  });
});

describe('staged', () => {
  const input = (command, cwd) => JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd });
  test('outside a local repository it prints nothing and exits 0', () => {
    const cfg = config(local());
    const dir = repo('staged-other', 'https://example.invalid/team/other.git');
    write(dir, 'CLAUDE.md', '# x\n');
    const r = run(['staged'], { input: input('git add CLAUDE.md', dir), extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir } });
    assert.deepEqual([r.status, r.stdout], [0, '']);
  });

  test('an error of its own prints nothing on stdout and exits 2', () => {
    const cfg = config({ version: 1, repos: 'none' });
    const r = run(['staged'], { input: input('git add CLAUDE.md', base), extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir } });
    assert.deepEqual([r.status, r.stdout, r.stderr], [2, '', `primer: ${join(cfg.store, 'map.json')} is not a primer map\n`]);
  });
});

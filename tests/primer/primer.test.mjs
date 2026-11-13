// Runs plugins/primer/scripts/primer.mjs, as a child process and through its exported main, against throwaway repositories and
// a configuration directory of its own, and holds each verb's output to literals. A slow git is a stand-in on the PATH.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, cpSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../../plugins/primer/scripts/primer.mjs';

const SCRIPT = fileURLToPath(new URL('../../plugins/primer/scripts/primer.mjs', import.meta.url));
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
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
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'CLAUDE_CODE_SESSION_ATTENDED', 'CLAUDE_PLUGIN_DATA', 'CLAUDE_PROJECT_DIR', 'CLAUDE_CODE_PROJECT_DIR_NAME']) delete env[k];
});
after(() => rmSync(base, { recursive: true, force: true, maxRetries: 15, retryDelay: 100 }));

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
    assert.deepEqual([run(['nope']).status, run(['nope']).stdout], [1, 'primer: unknown command nope; use session-start, staged, reach, status, measure, map or copies\n']);
  });
});

describe('copies', () => {
  const SOURCE = 'Rule one.\nRule two.\nRule three.\n';
  const DIFF = ['  @@ -1,3 +1,3 @@', '   Rule one.', '  -Rule two.', '  +Rule two, reworded.', '   Rule three.'];

  test('a declared copy reads source changed with the diff, then both changed, then current after a port', () => {
    const cfg = config(local(), { shared: SOURCE });
    const home = env.HOME, n = ++seq, copy = join(home, `notes-${n}`, 'copy.md'), held = `~/notes-${n}/copy.md`;
    write(home, `notes-${n}/copy.md`, 'Rule two.\nRule three.\n');
    const record = join(cfg.store, 'copies.json'), snap = join(cfg.store, 'copies', 'C1');
    const plain = join(base, `copies-plain-${n}`);
    mkdirSync(plain);
    const c = (...args) => { const r = run(['copies', ...args], { cwd: plain, extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir } }); return [r.status, r.stdout]; };
    const copies = () => run(['status'], { cwd: plain, extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir } }).stdout.split('\n').slice(4).join('\n');
    assert.deepEqual(c('--add', copy, join(cfg.store, 'shared.md')), [0, `primer: wrote ${record} and ${snap}\n+ copy C1 ${held} of shared.md: current\n`]);
    assert.deepEqual(JSON.parse(readFileSync(record, 'utf8')),
      { version: 1, copies: [{ id: 'C1', copy: held, source: 'shared.md', digest: '2653f590b6602e544df15d93833729bcf89f6a1cc060f87fd8fb876ec264c303' }] });
    assert.equal(readFileSync(snap, 'utf8'), SOURCE);
    assert.equal(copies(), `copy C1 ${held} of shared.md: current\n`);

    write(cfg.store, 'shared.md', 'Rule one.\nRule two, reworded.\nRule three.\n');
    assert.equal(copies(), [`copy C1 ${held} of shared.md: source changed`, ...DIFF, ''].join('\n'));
    write(home, `notes-${n}/copy.md`, 'Rule two, reworded.\nRule three.\n');
    assert.equal(copies(), [`copy C1 ${held} of shared.md: both changed`, ...DIFF, ''].join('\n'));
    assert.deepEqual(c('--ported', copy), [0, `primer: wrote ${record} and ${snap}\n~ copy C1 ${held} of shared.md: current\n`]);
    assert.equal(copies(), `copy C1 ${held} of shared.md: current\n`);
    assert.deepEqual(c(), [0, `copies: ${record} (1 declared)\ncopy C1 ${held} of shared.md: current\n`]);

    write(home, `notes-${n}/copy.md`, 'Rule two.\n');
    assert.deepEqual(c(), [0, `copies: ${record} (1 declared)\ncopy C1 ${held} of shared.md: copy changed\n`]);
    rmSync(copy);
    assert.deepEqual(c(), [0, `copies: ${record} (1 declared)\ncopy C1 ${held} of shared.md: copy changed, ${held} is missing\n`]);
  });

  test('a copy outside the store and the home directory is held by its absolute path', () => {
    const cfg = config(local(), { shared: SOURCE });
    const copy = join(base, `loose-copy-${++seq}.md`);
    writeFileSync(copy, 'Rule one.\n');
    const r = run(['copies', '--add', copy, join(cfg.store, 'shared.md')], { extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir } });
    assert.equal(r.stdout.split('\n')[1], `+ copy C1 ${slash(copy)} of shared.md: current`);
  });

  test('each form copies does not take is refused with one line and writes nothing', () => {
    const cfg = config(local(), { shared: SOURCE, group: GROUP });
    const shared = join(cfg.store, 'shared.md'), group = join(cfg.store, 'groups', 'app.md'), record = join(cfg.store, 'copies.json');
    const c = (...args) => { const r = run(['copies', ...args], { extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir } }); return [r.status, r.stdout]; };
    const forms = 'primer: copies takes nothing, --add <copy> <source>, --ported <copy> or --spans\n';
    assert.deepEqual(c('--add', group), [1, forms]);
    assert.deepEqual(c('--move', group), [1, forms]);
    assert.deepEqual(c('--spans', '--add', group, shared), [1, forms]);
    assert.deepEqual(c('--spans', 'x'), [1, forms]);
    assert.deepEqual(c('--add', shared, shared), [1, 'primer: a copy and its source are two files\n']);
    assert.deepEqual(c('--add', join(base, 'nope.md'), shared), [1, `primer: ${join(base, 'nope.md')} is not a file\n`]);
    assert.deepEqual(c('--ported', group), [1, `primer: ${slash(group)} is not a declared copy\n`]);
    assert.equal(existsSync(record), false);
    assert.equal(existsSync(join(cfg.store, 'copies')), false);
    assert.equal(c('--add', group, shared)[0], 0);
    const before = readFileSync(record, 'utf8');
    assert.deepEqual(c('--add', group, shared), [1, `primer: C1 already declares ${slash(group)}; after a port, use --ported\n`]);
    assert.deepEqual(c('--spans'), [0, `primer: no run shared by two layers or documents, of at least 3 lines that are not blank\n`]);
    assert.equal(readFileSync(record, 'utf8'), before);
    writeFileSync(record, '{"version":1,"copies":[{"id":"x"}]}\n');
    assert.deepEqual(c(), [1, `primer: ${record} is not a primer copies record\n`]);
    assert.equal(run(['status'], { extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir } }).stdout, `primer: ${record} is not a primer copies record\n`);
  });

  test('--spans lists the runs two layers or documents share, longest first, and leaves out runs under three lines', () => {
    const cfg = config(local(), {
      shared: '# Shared\nAlpha one.\nAlpha two.\n\nAlpha three.\nAlpha four.\nAlpha five.\nShared end.\n',
      group: 'Alpha one.\nAlpha two.\n\nAlpha three.\nAlpha four.  \nAlpha five.\nGroup end.\nPair one.\nPair two.\n',
      machine: 'Pair one.\nPair two.\nBeta one.\nBeta two.\nBeta three.\n',
    });
    write(cfg.store, 'docs/guide.md', '# Guide\r\nBeta one.\r\nBeta two.\r\nBeta three.\r\n');
    write(cfg.store, 'docs/blank.md', '\n\n\n\nShared end.\n');
    const r = run(['copies', '--spans'], { extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir } });
    assert.equal(r.status, 0, r.stdout);
    assert.equal(r.stdout, [
      'primer: 2 runs shared by two layers or documents, of at least 3 lines that are not blank, longest first',
      `6 lines: ${join(cfg.store, 'shared.md')} 2-7 and ${join(cfg.store, 'groups', 'app.md')} 1-6`,
      `3 lines: ${join(cfg.own, 'machine.md')} 3-5 and ${join(cfg.store, 'docs', 'guide.md')} 2-4`,
      '',
    ].join('\n'));
    assert.equal(existsSync(join(cfg.store, 'copies.json')), false);
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

  test('a root given through a link is recorded as the directory it leads to', () => {
    const target = join(base, 'root-target'), link = join(base, 'root-link');
    mkdirSync(target);
    symlinkSync(target, link, 'junction');
    const cfgDir = join(base, `map-config-${++seq}`);
    const r = run(['map', '--add', '--root', link], { extraEnv: { CLAUDE_CONFIG_DIR: cfgDir } });
    assert.equal(r.stdout, `primer: wrote ${join(cfgDir, 'reimagine-primer', 'store', 'map.json')}\nroot: + ${slash(target)}\n`);
  });

  test('an entry is not set to the shared profile without saying who owns the repository', () => {
    const dir = repo('map-shared-own', 'https://example.invalid/team/own.git');
    const cfgDir = join(base, `map-config-${++seq}`);
    const m = (...args) => { const r = run(['map', ...args], { cwd: dir, extraEnv: { CLAUDE_CONFIG_DIR: cfgDir } }); return [r.status, r.stdout]; };
    m('--add', '--profile', 'local');
    assert.deepEqual(m('--set', '--profile', 'shared'), [1, 'primer: --set --profile shared takes --own true or --own false\n']);
    assert.deepEqual(m('--set', '--profile', 'shared', '--own', 'true'),
      [0, `primer: wrote ${join(cfgDir, 'reimagine-primer', 'store', 'map.json')}\nrepo: ~ group own, profile shared, own true, remotes example.invalid/team/own\n`]);
  });

  test('each form the map does not take is refused with one line', () => {
    const dir = repo('map-refused', 'https://example.invalid/team/app.git');
    const m = (...args) => { const r = run(['map', ...args], { cwd: dir }); return [r.status, r.stdout]; };
    const forms = 'primer: map takes --add with --profile shared|local [--own true|false] [--group <name>] or --root <dir>, --set with any of '
      + '--profile, --own, --group and --root or with --store <path> alone, or --drop [--root <dir>]; nothing else is accepted\n';
    assert.deepEqual(m('--add'), [1, forms]);
    assert.deepEqual(m('--move'), [1, forms]);
    assert.deepEqual(m('--drop', '--group', 'x'), [1, forms]);
    assert.deepEqual(m('--add', '--own', 'true'), [1, forms]);
    assert.deepEqual(m('--set', '--store', join(base, 'other-store'), '--group', 'web'), [1, forms]);
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

  test('an error of its own prints a deny that gives the error and exits 2', () => {
    const cfg = config({ version: 1, repos: 'none' });
    const r = run(['staged'], { input: input('git add CLAUDE.md', base), extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir } });
    const reason = `primer: the staging check failed, so the call is denied: ${join(cfg.store, 'map.json')} is not a primer map`;
    assert.deepEqual([r.status, r.stdout, r.stderr],
      [2, `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } })}\n`, '']);
  });

  test('an entry recorded while the repository had no remote still matches after one is added', () => {
    const dir = repo('staged-remote-later');
    const cfgDir = join(base, `map-config-${++seq}`);
    run(['map', '--add', '--profile', 'local'], { cwd: dir, extraEnv: { CLAUDE_CONFIG_DIR: cfgDir } });
    git(dir, 'remote', 'add', 'origin', 'https://example.invalid/team/later.git');
    write(dir, 'CLAUDE.md', '# x\n');
    const r = run(['staged'], { input: input('git add CLAUDE.md', dir), extraEnv: { CLAUDE_CONFIG_DIR: cfgDir } });
    const reason = `primer: ${slash(dir)} has the local profile, which keeps agent files out of its history; `
      + "the call would add CLAUDE.md, while the upstream's tree is unknown (refs/remotes/origin/HEAD cannot be read)";
    assert.deepEqual([r.status, r.stdout],
      [0, `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } })}\n`]);
  });
});

describe('measure', () => {
  const site = { remotes: ['example.invalid/team/site'], path: 'unused', group: 'site', profile: 'shared', own: true };
  const web = { remotes: ['example.invalid/team/web'], path: 'unused', group: 'web', profile: 'local', own: null };
  const head = "primer: the host's cap is 10000 characters per context string, counted as emitted";
  const app = 'repo group app, profile local, own unset, remotes example.invalid/team/app';
  const webLine = 'repo group web, profile local, own unset, remotes example.invalid/team/web';
  const siteLine = 'repo group site, profile shared, own true, remotes example.invalid/team/site: no context string';

  test('every mapped repository gets its context string as the loader emits it, layer by layer, against the cap', () => {
    const cfg = config(local({ repos: [...local().repos, web, site] }), { shared: SHARED, group: GROUP });
    const s = join(cfg.store, 'shared.md').length + 98, g = join(cfg.store, 'groups', 'app.md').length + 94;
    const r = run(['measure'], { extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir } });
    assert.equal(r.status, 0, r.stdout);
    assert.equal(r.stdout, [head, `${app}: ${s + 2 + g} characters (shared ${s}, group ${g}, machine 0), within the cap`,
      `${webLine}: ${s} characters (shared ${s}, group 0, machine 0), within the cap`, siteLine, ''].join('\n'));
  });

  test('--with measures a proposed layer in its file\'s place, before and after, for each repository', () => {
    const cfg = config(local({ repos: [...local().repos, web, site] }), { shared: SHARED, group: GROUP });
    const s = join(cfg.store, 'shared.md').length + 98, g = join(cfg.store, 'groups', 'app.md').length + 94;
    write(base, 'proposal.md', `${GROUP}The app group deploys from main.\n`);
    const r = run(['measure', '--with', 'proposal.md', 'groups/app.md'], { extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir } });
    assert.equal(r.stdout, [head, `${app}: ${s + 2 + g} -> ${s + 2 + g + 33} characters (shared ${s}, group ${g} -> ${g + 33}, machine 0), within the cap`,
      `${webLine}: ${s} -> ${s} characters (shared ${s}, group 0, machine 0), within the cap`, siteLine, ''].join('\n'));
    assert.equal(readFileSync(join(cfg.store, 'groups', 'app.md'), 'utf8'), GROUP);
    write(base, 'big.md', `${'a'.repeat(9990)}\n`);
    const big = run(['measure', '--with', join(base, 'big.md'), 'shared.md'], { extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir } }).stdout.split('\n');
    assert.equal(big[1], `${app}: ${s + 2 + g} -> ${s + 2 + g + 9948} characters (shared ${s} -> ${s + 9948}, group ${g}, machine 0), over the cap`);
  });

  test('each form measure does not take is refused with one line', () => {
    const forms = 'primer: measure takes nothing, or --with <file> <layer>, the layer being shared.md, groups/<group>.md or machine.md\n';
    for (const args of [['--with', 'x.md'], ['--with', 'x.md', 'groups/../x.md'], ['--with', 'x.md', 'other.md'], ['x']]) {
      assert.deepEqual([run(['measure', ...args]).status, run(['measure', ...args]).stdout], [1, forms], args.join(' '));
    }
    assert.equal(run(['measure', '--with', 'missing.md', 'machine.md']).stdout, 'primer: missing.md cannot be read\n');
  });
});

describe('reach', () => {
  let session, app, site, cfg;
  const lead = (dir) => `primer: ${slash(dir)} is in a repository other than the one this session started in, and the session has not loaded its`;
  const said = (text) => `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: text } })}\n`;
  const edit = (data, file, { id = 's1', tool = 'Edit', extraEnv = {} } = {}) => run(['reach', data], {
    input: JSON.stringify({ session_id: id, cwd: session, hook_event_name: 'PreToolUse', tool_name: tool, tool_input: tool === 'NotebookEdit' ? { notebook_path: file } : { file_path: file } }),
    extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir, CLAUDE_PROJECT_DIR: session, ...extraEnv },
  });
  const files = (dir) => [`${slash(dir)}/CLAUDE.md`, `${slash(dir)}/CLAUDE.local.md`, `${slash(dir)}/.claude/rules/area/deep.md`, `${slash(dir)}/.claude/rules/style.md`].join(', ');
  before(() => {
    session = repo('reach-session', 'https://example.invalid/team/session.git');
    app = repo('reach-app', 'https://example.invalid/team/app.git');
    site = repo('reach-site', 'https://example.invalid/team/site.git');
    write(site, 'CLAUDE.md', '# Site\n');
    write(site, 'CLAUDE.local.md', '# Mine\n');
    write(site, '.claude/rules/style.md', '# Style\n');
    write(site, '.claude/rules/area/deep.md', '---\nname: deep\n---\n# Deep\n');
    write(site, '.claude/rules/area/code.md', '---\npaths: src/**\n---\n# Code\n');
    cfg = config(local(), { group: GROUP });
  });

  test('the first edit in another repository gets its layers when it is mapped local, or its instruction files, and a later edit nothing', () => {
    const data = join(base, `reach-data-${++seq}`);
    assert.equal(edit(data, join(app, 'src', 'new.ts')).stdout,
      said(`${lead(app)} context, which follows.\n\n${part('group', join(cfg.store, 'groups', 'app.md'), GROUP.trim(), '5ee2174e')}`));
    assert.equal(edit(data, join(app, 'README.md')).stdout, '');
    const r = edit(data, join(site, 'src', 'a.ts'));
    assert.deepEqual([r.status, r.stdout], [0, said(`${lead(site)} instruction files: ${files(site)}`)]);
    assert.equal(edit(data, join(site, 'README.md')).stdout, '');
    assert.equal(readFileSync(join(data, 'reach', 's1'), 'utf8').split('\n').length, 3);
    assert.equal(edit(data, join(site, 'README.md'), { id: 's2' }).stdout, said(`${lead(site)} instruction files: ${files(site)}`));
    assert.equal(edit(data, join(site, 'x.ipynb'), { id: 's3', tool: 'NotebookEdit' }).stdout, said(`${lead(site)} instruction files: ${files(site)}`));
  });

  test('a session that started in a local repository gets the group layer of another alone, and nothing where the two share a group', () => {
    const home = (group) => config(local({ repos: [...local().repos, { remotes: ['example.invalid/team/session'], path: 'unused', group, profile: 'local', own: null }] }),
      { shared: SHARED, group: GROUP, machine: MACHINE });
    const other = home('home'), same = home('app');
    assert.equal(edit(join(base, `reach-data-${++seq}`), join(app, 'src', 'new.ts'), { extraEnv: { CLAUDE_CONFIG_DIR: other.dir } }).stdout,
      said(`${lead(app)} context, which follows.\n\n${part('group', join(other.store, 'groups', 'app.md'), GROUP.trim(), '5ee2174e')}`));
    assert.equal(edit(join(base, `reach-data-${++seq}`), join(app, 'src', 'new.ts'), { extraEnv: { CLAUDE_CONFIG_DIR: same.dir } }).stdout, '');
  });

  test('a local repository\'s own instruction files are named before its layers', () => {
    write(app, 'CLAUDE.md', '# App\n');
    const r = edit(join(base, `reach-data-${++seq}`), join(app, 'src', 'new.ts'));
    rmSync(join(app, 'CLAUDE.md'));
    assert.equal(r.stdout, said(`${lead(app)} instruction files: ${slash(app)}/CLAUDE.md; nor its context, which follows.\n\n`
      + part('group', join(cfg.store, 'groups', 'app.md'), GROUP.trim(), '5ee2174e')));
  });

  test('a file under the configuration directory prints nothing, though that directory is a repository with a hub', () => {
    const dir = repo(`reach-config-${++seq}`);
    write(dir, 'CLAUDE.md', '# Mine\n');
    assert.equal(edit(join(base, `reach-data-${++seq}`), join(dir, 'feedback', '2026-11-14.md'), { extraEnv: { CLAUDE_CONFIG_DIR: dir } }).stdout, '');
  });

  test('a configuration directory reached through a link is still not another repository', () => {
    const dir = repo(`reach-config-${++seq}`), link = join(base, `reach-config-link-${seq}`);
    write(dir, 'CLAUDE.md', '# Mine\n');
    symlinkSync(dir, link, 'junction');
    assert.equal(edit(join(base, `reach-data-${++seq}`), join(dir, 'CLAUDE.md'), { extraEnv: { CLAUDE_CONFIG_DIR: link } }).stdout, '');
    assert.equal(edit(join(base, `reach-data-${++seq}`), join(link, 'CLAUDE.md'), { extraEnv: { CLAUDE_CONFIG_DIR: dir } }).stdout, '');
  });

  test('a layer that cannot be read leaves the repository unrecorded', () => {
    const bad = config(local()), data = join(base, `reach-data-${++seq}`);
    mkdirSync(join(bad.store, 'groups', 'app.md'), { recursive: true });
    assert.equal(edit(data, join(app, 'src', 'new.ts'), { extraEnv: { CLAUDE_CONFIG_DIR: bad.dir } }).stdout, '');
    assert.equal(existsSync(join(data, 'reach', 's1')), false);
  });

  test('a data directory that is not an absolute path is not written to', () => {
    const r = run(['reach', 'reldata'], { cwd: session, extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir, CLAUDE_PROJECT_DIR: session },
      input: JSON.stringify({ session_id: 's1', cwd: session, tool_input: { file_path: join(site, 'README.md') } }) });
    assert.equal(r.stdout, said(`${lead(site)} instruction files: ${files(site)}`));
    assert.equal(existsSync(join(session, 'reldata')), false);
  });

  test('a map that cannot be read leaves the repository unrecorded, so the next edit is answered', () => {
    const bad = config(local()), data = join(base, `reach-data-${++seq}`), at = { extraEnv: { CLAUDE_CONFIG_DIR: bad.dir } };
    writeFileSync(join(bad.store, 'map.json'), '{');
    assert.equal(edit(data, join(site, 'README.md'), at).stdout, '');
    assert.equal(existsSync(join(data, 'reach', 's1')), false);
    writeFileSync(join(bad.store, 'map.json'), JSON.stringify(local()));
    assert.equal(edit(data, join(site, 'README.md'), at).stdout, said(`${lead(site)} instruction files: ${files(site)}`));
  });

  test('an edit in the session\'s own repository, its worktree or outside any repository prints nothing', () => {
    const data = join(base, `reach-data-${++seq}`);
    git(session, 'worktree', 'add', '-q', join(base, 'reach-session-wt'));
    assert.equal(edit(data, join(session, 'src', 'x.ts')).stdout, '');
    assert.equal(edit(data, join(base, 'reach-session-wt', 'README.md')).stdout, '');
    assert.equal(edit(data, join(base, 'reach-loose', 'x.txt')).stdout, '');
    assert.equal(edit(data, join(base, 'reach-session-wt', 'README.md')).stdout, '');
  });

  test('the own repository is told by the file system alone, so a git that does not answer costs it nothing', () => {
    const slow = { ...slowGit(), CLAUDE_CONFIG_DIR: cfg.dir, CLAUDE_PROJECT_DIR: session };
    const t0 = Date.now();
    const out = main(['reach', join(base, 'reach-slow')], { env: slow, home: join(base, 'home'), cwd: base, limit: 8000,
      stdin: () => JSON.stringify({ session_id: 's1', cwd: session, tool_input: { file_path: join(session, 'src', 'x.ts') } }) });
    assert.deepEqual(out, []);
    assert.ok(Date.now() - t0 < 3000, `took ${Date.now() - t0} ms`);
  });

  test('without a session id it says so on every edit; without primer\'s own directory a local repository is read as any other', () => {
    const data = join(base, `reach-data-${++seq}`);
    for (let i = 0; i < 2; i++) assert.equal(edit(data, join(site, 'README.md'), { id: '../x' }).stdout, said(`${lead(site)} instruction files: ${files(site)}`));
    assert.equal(existsSync(join(data, 'reach')), false);
    write(app, 'AGENTS.md', '# Agents\n');
    const none = { CLAUDE_CONFIG_DIR: join(base, 'no-config') };
    assert.equal(edit(data, join(app, 'README.md'), { extraEnv: none }).stdout, said(`${lead(app)} instruction files: ${slash(app)}/AGENTS.md`));
    rmSync(join(app, 'AGENTS.md'));
    assert.equal(edit(data, join(app, 'README.md'), { id: 's4', extraEnv: none }).stdout, '');
  });
});

// Requirement 397: notice.sh, where the hub has the marker, and the loader, in a local repository, give one message on one fixture.
describe('the notice', () => {
  let memory, dir, cfg, key;
  const day = 86400;
  before(() => {
    const build = spawnSync('sh', ['tests/primer/fixture/memory/build.sh'], { cwd: ROOT, env: { ...env, TMPDIR: slash(base) }, encoding: 'utf8' });
    assert.equal(build.status, 0, build.stderr);
    memory = build.stdout.trim();
    dir = repo('notice-both', 'https://example.invalid/team/app.git');
    write(dir, 'CLAUDE.md', '<!-- primer -->\n# demo\n');
    cfg = config(local());
    key = dir.replace(/[^A-Za-z0-9]/g, '-');
    cpSync(join(memory, 'memory'), join(cfg.dir, 'projects', key, 'memory'), { recursive: true });
  });
  const stamps = (data, { notes, logs }) => {
    mkdirSync(join(data, 'reviewed'), { recursive: true });
    rmSync(join(data, 'reviewed', key), { force: true });
    rmSync(join(data, 'reviewed', 'feedback'), { force: true });
    if (notes) write(data, `reviewed/${key}`, `${notes}\n`);
    if (logs) { write(data, 'reviewed/feedback', '2026-11-01T00:00:00.000Z\n'); utimesSync(join(data, 'reviewed', 'feedback'), logs, logs); }
  };
  const both = (data, extra = {}) => {
    const input = JSON.stringify({ session_id: 'test', transcript_path: join(cfg.dir, 'projects', key, 'test.jsonl'), cwd: dir, hook_event_name: 'SessionStart', source: 'startup', ...extra });
    const sh = spawnSync('sh', ['plugins/primer/hooks/notice.sh'], { cwd: ROOT, env: { ...env, CLAUDE_PLUGIN_DATA: data }, input, encoding: 'utf8' });
    assert.equal(sh.status, 0, sh.stderr);
    return [sh.stdout, run(['session-start', 'all', data], { input }).stdout];
  };
  const message = (text) => `{"systemMessage":"${text}"}\n`;

  test('notes alone, notes and logs, and logs alone each read the same from both hooks', () => {
    const t = 1793491200;
    for (const [i, at] of [t - day, t + day, t + 2 * day].entries()) { write(cfg.dir, `feedback/2026-11-0${i + 1}.md`, '# Log\n'); utimesSync(join(cfg.dir, 'feedback', `2026-11-0${i + 1}.md`), at, at); }
    const data = join(base, `notice-data-${++seq}`);
    stamps(data, { notes: '2026-09-15T12:00:00.000Z', logs: t + 3 * day });
    const one = message('primer: auto memory has 1 notes since the last review; run /primer');
    assert.deepEqual(both(data), [one, one]);
    stamps(data, { notes: '2026-09-15T12:00:00.000Z', logs: t });
    const two = message('primer: auto memory has 1 notes and 2 feedback logs since the last review; run /primer');
    assert.deepEqual(both(data), [two, two]);
    stamps(data, { notes: '2026-12-01T00:00:00.000Z' });
    const three = message('primer: 3 feedback logs since the last review; run /primer');
    assert.deepEqual(both(data), [three, three]);
    rmSync(join(cfg.dir, 'projects', key, 'memory', 'MEMORY.md'));
    stamps(data, { logs: t });
    const logs = message('primer: 2 feedback logs since the last review; run /primer');
    assert.deepEqual(both(data), [logs, logs]);
    cpSync(join(memory, 'memory', 'MEMORY.md'), join(cfg.dir, 'projects', key, 'memory', 'MEMORY.md'));
  });

  test('the loader gives no notice on a later source or in a session no one attends', () => {
    const data = join(base, `notice-data-${++seq}`);
    stamps(data, {});
    const input = (source) => JSON.stringify({ transcript_path: join(cfg.dir, 'projects', key, 'test.jsonl'), cwd: dir, source });
    assert.equal(run(['session-start', 'all', data], { input: input('resume') }).stdout, '');
    assert.equal(run(['session-start', 'all', data], { input: input('startup'), extraEnv: { CLAUDE_CODE_SESSION_ATTENDED: '0' } }).stdout, '');
    assert.notEqual(run(['session-start', 'all', data], { input: input('startup') }).stdout, '');
  });
});

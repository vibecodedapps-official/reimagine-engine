// Runs plugins/primer/scripts/primer.mjs, as a child process and through its exported main, against throwaway repositories and
// a configuration directory of its own, and holds each verb's output to literals. A slow git is a stand-in on the PATH.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, cpSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main, notesOf } from '../../plugins/primer/scripts/primer.mjs';

const SCRIPT = fileURLToPath(new URL('../../plugins/primer/scripts/primer.mjs', import.meta.url));
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SHARED = 'Every mapped repository uses LF line ends.\n';
const GROUP = 'The app group builds with npm run build.\n';
const MACHINE = 'This machine keeps its checkouts on one disk.\n';
const HERE = 'The app group keeps its database on port 5433 here.\n';
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
// A configuration directory with primer's own directory, a map and, as given, the layers.
const config = (map, layers = {}) => {
  const dir = join(base, `config-${++seq}`);
  const own = join(dir, 'reimagine-primer');
  write(own, 'store/map.json', JSON.stringify(map));
  if (layers.shared !== undefined) write(own, 'store/shared.md', layers.shared);
  if (layers.group !== undefined) write(own, 'store/groups/app.md', layers.group);
  if (layers.machine !== undefined) write(own, 'machine.md', layers.machine);
  if (layers.here !== undefined) write(own, 'machine/app.md', layers.here);
  return { dir, own, store: join(own, 'store') };
};
const local = (extra = {}) => ({ version: 1, repos: [{ remotes: ['example.invalid/team/app'], path: 'unused', group: 'app', profile: 'local' }], roots: [], ...extra });
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

  test('the machine\'s directory is the one config.json names, and a group\'s layer there is emitted last', () => {
    const dir = repo('four', 'https://example.invalid/team/app.git');
    const cfg = config(local(), { shared: SHARED, group: GROUP });
    const here = join(base, 'machine-side');
    write(cfg.own, 'config.json', JSON.stringify({ local: here }));
    write(here, 'machine.md', MACHINE);
    write(here, 'machine/app.md', HERE);
    const last = part('machine-group', join(here, 'machine', 'app.md'), 'The app group keeps its database on port 5433 here.', '29f29947');
    const text = [
      part('shared', join(cfg.store, 'shared.md'), SHARED.trim(), 'c09a8e67'),
      part('group', join(cfg.store, 'groups', 'app.md'), GROUP.trim(), '5ee2174e'),
      part('machine', join(here, 'machine.md'), MACHINE.trim(), '3b656d6a'),
      last,
    ].join('\n\n');
    assert.equal(start(cfg, dir).stdout, context(text));
    assert.equal(start(cfg, dir, {}, 'machine-group').stdout, context(last));
  });

  test('a config folder that names no machine\'s directory says so at load and in status while the default folder reads one', () => {
    const dir = repo('second-folder', 'https://example.invalid/team/app.git'), home = join(base, 'home-two'), first = join(home, '.claude', 'reimagine-primer'), here = join(base, 'machine-shared');
    const cfg = config(local(), { shared: SHARED, group: GROUP }), two = { HOME: home, USERPROFILE: home };
    write(first, 'config.json', JSON.stringify({ local: here }));
    write(here, 'machine.md', MACHINE);
    write(cfg.own, 'config.json', JSON.stringify({ store: cfg.store }));
    const layers = [part('shared', join(cfg.store, 'shared.md'), SHARED.trim(), 'c09a8e67'), part('group', join(cfg.store, 'groups', 'app.md'), GROUP.trim(), '5ee2174e')];
    const said = `${join(cfg.own, 'config.json')} names no machine's directory, so the machine layers that ${first} reads from ${here} are not loaded here; name it with map --set --local`;
    const checks = () => run(['status'], { cwd: dir, extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir, ...two } }).stdout.split('\n').filter((l) => l.startsWith('check machine'));
    assert.equal(start(cfg, dir, two).stdout, context(layers.join('\n\n'), `primer: ${said}`));
    assert.deepEqual(checks(), [`check machine: ${said}`]);
    // The default folder with a machine.md of its own and no key is read the same way.
    rmSync(join(first, 'config.json'));
    write(first, 'machine.md', MACHINE);
    assert.deepEqual(checks(), [`check machine: ${said.replace(here, first)}`]);
    // No word once the key is set, where this folder holds a layer of its own, or where the default folder holds none.
    write(cfg.own, 'config.json', JSON.stringify({ store: cfg.store, local: here }));
    assert.equal(start(cfg, dir, two).stdout, context([...layers, part('machine', join(here, 'machine.md'), MACHINE.trim(), '3b656d6a')].join('\n\n')));
    assert.deepEqual(checks(), []);
    write(cfg.own, 'config.json', JSON.stringify({ store: cfg.store }));
    write(cfg.own, 'machine/app.md', HERE);
    assert.deepEqual(checks(), []);
    rmSync(join(cfg.own, 'machine'), { recursive: true });
    rmSync(join(first, 'machine.md'));
    assert.deepEqual(checks(), []);
    assert.equal(start(cfg, dir, two).stdout, context(layers.join('\n\n')));
    // A directory the default folder names that holds no machine file gives no word; a machine/ of its own with no machine.md does.
    const empty = join(base, 'machine-empty');
    write(empty, 'notes.md', 'x\n');
    write(first, 'config.json', JSON.stringify({ local: empty }));
    assert.deepEqual(checks(), []);
    assert.equal(start(cfg, dir, two).stdout, context(layers.join('\n\n')));
    rmSync(join(first, 'config.json'));
    write(first, 'machine/app.md', HERE);
    assert.deepEqual(checks(), [`check machine: ${said.replace(here, first)}`]);
    assert.equal(start(cfg, dir, two).stdout, context(layers.join('\n\n'), `primer: ${said.replace(here, first)}`));
  });

  test('an empty or missing layer contributes nothing, and the last line is the last layer\'s canary', () => {
    const cfg = config(local(), { shared: '\n \n', group: GROUP });
    const r = start(cfg, repo('one-layer', 'git@example.invalid:team/app.git'));
    assert.equal(r.stdout, context(part('group', join(cfg.store, 'groups', 'app.md'), GROUP.trim(), '5ee2174e')));
  });

  test('a layer checked out with CRLF line ends is emitted, counted and given its canary as the same layer with LF', () => {
    const cfg = config(local(), { group: 'The web group builds with make.\r\nIts tests run with make check.\r\n' });
    const dir = repo('crlf', 'https://example.invalid/team/app.git');
    const file = join(cfg.store, 'groups', 'app.md');
    assert.equal(start(cfg, dir).stdout, context(part('group', file, 'The web group builds with make.\nIts tests run with make check.', '426e70e8')));
    const status = run(['status'], { cwd: dir, extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir } }).stdout.split('\n');
    assert.equal(status.find((l) => l.startsWith('layer group:')), `layer group: ${file}, ${file.length + 116} characters, canary 426e70e8`);
  });

  test('a layer run alone emits that layer only', () => {
    const cfg = config(local(), { shared: SHARED, group: GROUP, machine: MACHINE });
    const r = start(cfg, repo('per-layer', 'https://example.invalid/team/app.git'), {}, 'machine');
    assert.equal(r.stdout, context(part('machine', join(cfg.own, 'machine.md'), MACHINE.trim(), '3b656d6a')));
  });

  test('a worktree of a repository with no remote matches by the main work tree\'s root', () => {
    const dir = repo('no-remote');
    git(dir, 'worktree', 'add', '-q', join(base, 'no-remote-wt'));
    const cfg = config({ version: 1, repos: [{ remotes: [], path: slash(dir), group: 'app', profile: 'local' }], roots: [] }, { group: GROUP });
    assert.equal(start(cfg, join(base, 'no-remote-wt')).stdout, context(part('group', join(cfg.store, 'groups', 'app.md'), GROUP.trim(), '5ee2174e')));
  });

  test('a string over the cap is still emitted, with a warning that names the layers, the size and the cap', () => {
    const big = `${'a'.repeat(9990)}\n`;
    const cfg = config(local(), { shared: SHARED, group: big });
    const file = join(cfg.store, 'groups', 'app.md');
    const text = `${part('shared', join(cfg.store, 'shared.md'), SHARED.trim(), 'c09a8e67')}\n\n${part('group', file, 'a'.repeat(9990), 'fb0545d8')}`;
    const r = start(cfg, repo('over', 'https://example.invalid/team/app.git'));
    const sharedSize = join(cfg.store, 'shared.md').length + 98, groupSize = file.length + 10044;
    // The string opens with a line that says where each layer is whole, since a session holds only a preview of it.
    const lead = `primer: the text below is ${sharedSize + 2 + groupSize} characters, over the host's cap of 10000, so a session holds a preview of it and holds each layer whole only once it has read the layer's file: ${join(cfg.store, 'shared.md')}, ${file}\n\n`;
    assert.equal(r.stdout, context(lead + text, `primer: the context string is ${sharedSize + 2 + groupSize} characters as emitted, over the host's cap of 10000 (shared ${sharedSize}, group ${groupSize})`));
  });

  test('a resumed session gets no string and still gets the warning; every other source gets the string', () => {
    const cfg = config(local(), { shared: SHARED, group: `${'a'.repeat(9990)}\n` });
    const dir = repo('sources', 'https://example.invalid/team/app.git');
    const file = join(cfg.store, 'groups', 'app.md');
    const text = `${part('shared', join(cfg.store, 'shared.md'), SHARED.trim(), 'c09a8e67')}\n\n${part('group', file, 'a'.repeat(9990), 'fb0545d8')}`;
    const sharedSize = join(cfg.store, 'shared.md').length + 98, groupSize = file.length + 10044;
    const warning = `primer: the context string is ${sharedSize + 2 + groupSize} characters as emitted, over the host's cap of 10000 (shared ${sharedSize}, group ${groupSize})`;
    const from = (source) => run(['session-start', 'all', join(base, 'data')], { input: JSON.stringify({ cwd: dir, hook_event_name: 'SessionStart', ...(source ? { source } : {}) }), extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir } }).stdout;
    assert.equal(from('resume'), context(null, warning));
    const groupAlone = run(['session-start', 'group', join(base, 'data')], { input: JSON.stringify({ cwd: dir, hook_event_name: 'SessionStart', source: 'resume' }), extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir } }).stdout;
    assert.equal(groupAlone, context(null, `primer: the group layer is ${groupSize} characters as emitted, over the host's cap of 10000`));
    const lead = `primer: the text below is ${sharedSize + 2 + groupSize} characters, over the host's cap of 10000, so a session holds a preview of it and holds each layer whole only once it has read the layer's file: ${join(cfg.store, 'shared.md')}, ${file}\n\n`;
    for (const source of ['startup', 'clear', 'compact', 'fork', undefined]) assert.equal(from(source), context(lead + text, warning), String(source));
  });

  test('a resumed session gets the string again once it differs from the one the session was last given', () => {
    const cfg = config(local(), { group: GROUP });
    const dir = repo('resumed', 'https://example.invalid/team/app.git'), data = join(base, 'data-resumed'), file = join(cfg.store, 'groups', 'app.md');
    const from = (source, id = 'session-one', event = 'SessionStart') => run(['session-start', 'all', data], { input: JSON.stringify({ cwd: dir, hook_event_name: event, source, session_id: id }), extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir } }).stdout;
    const first = context(part('group', file, GROUP.trim(), '5ee2174e'));
    assert.equal(from('startup'), first);
    assert.equal(from('resume'), '');
    writeFileSync(file, 'The app group ships on Fridays.\n');
    const second = context(part('group', file, 'The app group ships on Fridays.', '261cabc6'));
    assert.equal(from('resume'), second);
    assert.equal(from('resume'), '');
    // After a clear the session holds none of it, so the string is given whether it changed or not.
    assert.equal(from('clear'), second);
    // A session with no record of a string, as one started before the record was kept, gets it once.
    assert.equal(from('resume', 'session-two'), second);
    assert.equal(from('resume', 'session-two'), '');
    // An id that names no file keeps no record, and a subagent's start leaves the session's record as it is.
    assert.equal(from('resume', '../session-three'), '');
    writeFileSync(file, GROUP);
    assert.equal(from(undefined, 'session-one', 'SubagentStart'), first.replace('"SessionStart"', '"SubagentStart"'));
    assert.equal(from('resume'), first);
    // A record is kept for 30 days after its session's last start.
    const old = join(data, 'given', 'session-old.all');
    writeFileSync(old, 'x');
    utimesSync(old, new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'));
    from('startup', 'session-four');
    assert.deepEqual(readdirSync(join(data, 'given')).sort(), ['session-four.all', 'session-one.all', 'session-two.all']);
  });

  test('a resumed session gets no string where the record cannot be written, and a start that is no resume still gets it', () => {
    const cfg = config(local(), { group: GROUP });
    const dir = repo('unwritable', 'https://example.invalid/team/app.git'), data = join(base, 'data-unwritable'), file = join(cfg.store, 'groups', 'app.md');
    mkdirSync(data);
    writeFileSync(join(data, 'given'), 'x');
    const from = (source) => run(['session-start', 'all', data], { input: JSON.stringify({ cwd: dir, hook_event_name: 'SessionStart', source, session_id: 'session-one' }), extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir } }).stdout;
    assert.equal(from('startup'), context(part('group', file, GROUP.trim(), '5ee2174e')));
    assert.equal(from('resume'), '');
    assert.equal(from('resume'), '');
  });

  test('a data directory that is not an absolute path keeps no record, so a resumed session gets no string and nothing is written in the directory it ran in', () => {
    const cfg = config(local(), { group: GROUP });
    const dir = repo('relative', 'https://example.invalid/team/app.git'), file = join(cfg.store, 'groups', 'app.md'), written = join(base, 'relative-data');
    const from = (source) => run(['session-start', 'all', 'relative-data'], { input: JSON.stringify({ cwd: dir, hook_event_name: 'SessionStart', source, session_id: 'session-one' }), extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir } }).stdout;
    const startup = from('startup'), resume = from('resume'), created = existsSync(written);
    rmSync(written, { recursive: true, force: true });
    assert.equal(startup, context(part('group', file, GROUP.trim(), '5ee2174e')));
    assert.equal(resume, '');
    assert.equal(created, false);
  });

  test('in a session no one attends the layers load and no warning prints', () => {
    const cfg = config(local(), { group: `${'a'.repeat(9990)}\n` });
    const r = start(cfg, repo('unattended', 'https://example.invalid/team/app.git'), { CLAUDE_CODE_SESSION_ATTENDED: '0' });
    const file = join(cfg.store, 'groups', 'app.md');
    const lead = `primer: the text below is ${file.length + 10044} characters, over the host's cap of 10000, so a session holds a preview of it and holds each layer whole only once it has read the layer's file: ${file}\n\n`;
    assert.equal(r.stdout, context(lead + part('group', file, 'a'.repeat(9990), 'fb0545d8')));
  });

  test('a subagent gets the string under its own event with no warning, and the Explore and Plan agents get nothing', () => {
    const cfg = config(local(), { group: `${'a'.repeat(9990)}\n` });
    const dir = repo('subagent', 'https://example.invalid/team/app.git');
    const as = (agent_type) => run(['session-start', 'all', join(base, 'data')], { input: JSON.stringify({ transcript_path: join(cfg.dir, 'projects', 'key', 'test.jsonl'), cwd: dir, hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type }) }).stdout;
    const file = join(cfg.store, 'groups', 'app.md');
    const lead = `primer: the text below is ${file.length + 10044} characters, over the host's cap of 10000, so a session holds a preview of it and holds each layer whole only once it has read the layer's file: ${file}\n\n`;
    const want = `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'SubagentStart', additionalContext: lead + part('group', file, 'a'.repeat(9990), 'fb0545d8') } })}\n`;
    for (const type of ['general-purpose', 'audit:auditor', undefined]) assert.equal(as(type), want, String(type));
    for (const type of ['Explore', 'Plan']) assert.equal(as(type), '', type);
  });

  test('a repository under a root with no entry gets the unmapped warning; one under no root gets nothing', () => {
    const cfg = config(local({ roots: [slash(join(base, 'work'))] }));
    const dir = repo('work/unmapped', 'https://example.invalid/team/other.git');
    assert.equal(start(cfg, dir).stdout, context(null, `primer: ${slash(dir)} is unmapped, under ${slash(join(base, 'work'))} of the map's roots; run /primer to map it`));
    assert.equal(start(cfg, dir, { CLAUDE_CODE_SESSION_ATTENDED: '0' }).stdout, '');
    assert.equal(start(cfg, repo('elsewhere', 'https://example.invalid/team/other.git')).stdout, '');
  });

  test('a repository mapped shared and a directory outside git print nothing', () => {
    const cfg = config({ version: 1, repos: [{ remotes: ['example.invalid/team/app'], path: 'unused', group: 'app', profile: 'shared', own: true }], roots: [] }, { group: GROUP });
    assert.equal(start(cfg, repo('shared', 'https://example.invalid/team/app.git')).stdout, '');
    const plain = join(base, 'plain');
    mkdirSync(plain);
    assert.equal(start(config(local({ roots: [slash(base)] }), { group: GROUP }), plain).stdout, '');
  });

  test('a load that stops after primer\'s own directory is found gives its reason as one line of context', () => {
    const dir = repo('stopped', 'https://example.invalid/team/app.git'), none = 'primer: no context layer is loaded at this start: ';
    const bad = config({ version: 3, repos: [], roots: [] });
    const noMap = `${none}${join(bad.store, 'map.json')} is not a primer map`;
    assert.deepEqual([start(bad, dir).status, start(bad, dir).stdout], [0, context(noMap, noMap)]);
    // A session no one attends and a subagent get the line with no message, and the Explore and Plan agents nothing.
    assert.equal(start(bad, dir, { CLAUDE_CODE_SESSION_ATTENDED: '0' }).stdout, context(noMap));
    const as = (agent_type) => run(['session-start', 'all', join(base, 'data')], { input: JSON.stringify({ cwd: dir, hook_event_name: 'SubagentStart', agent_type }), extraEnv: { CLAUDE_CONFIG_DIR: bad.dir } }).stdout;
    assert.equal(as('general-purpose'), `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'SubagentStart', additionalContext: noMap } })}\n`);
    assert.equal(as('Explore'), '');
    // An entry that emits one layer other than the group's leaves the line to the entry that does.
    assert.equal(start(bad, dir, {}, 'shared').stdout, '');
    const noConfig = config(local(), { group: GROUP });
    write(noConfig.own, 'config.json', '{');
    const said = `${none}${join(noConfig.own, 'config.json')} is not a primer configuration`;
    assert.equal(start(noConfig, dir).stdout, context(said, said));
    // A store that config.json names and that is missing is a load that stopped; with no store named and none there, nothing is mapped.
    const noStore = config(local(), { group: GROUP }), gone = join(base, 'store-gone');
    write(noStore.own, 'config.json', JSON.stringify({ store: gone }));
    const missing = `${none}${join(noStore.own, 'config.json')} names the store ${gone}, which is missing`;
    assert.equal(start(noStore, dir).stdout, context(missing, missing));
    assert.equal(main(['status'], { env: { ...env, CLAUDE_CONFIG_DIR: noStore.dir }, home: join(base, 'home'), cwd: dir })[1], `store: ${gone} (missing)`);
    const bare = join(base, 'config-bare');
    mkdirSync(join(bare, 'reimagine-primer'), { recursive: true });
    assert.equal(start({ dir: bare }, dir).stdout, '');
    // A directory in the place of a layer's file costs that layer alone: the others load under a line that names it.
    const folder = config(local(), { shared: SHARED });
    mkdirSync(join(folder.store, 'groups', 'app.md'), { recursive: true });
    const notFile = `primer: the group layer is not loaded: ${join(folder.store, 'groups', 'app.md')} is not a file`;
    assert.equal(start(folder, dir).stdout, context(`${notFile}\n\n${part('shared', join(folder.store, 'shared.md'), SHARED.trim(), 'c09a8e67')}`, notFile));
    assert.equal(main(['status'], { env: { ...env, CLAUDE_CONFIG_DIR: folder.dir }, home: join(base, 'home'), cwd: dir })[7], `layer group: ${join(folder.store, 'groups', 'app.md')}, not a file`);
  });

  test('a start that ends with nothing to load, in a place the map or the configuration names, says so in one line of context', () => {
    const none = 'primer: no context layer is loaded at this start: ';
    // A mapped local repository whose layer files are all missing or empty.
    const dir = repo('nothing', 'https://example.invalid/team/app.git'), empty = config(local(), { group: '\n' });
    const blank = `${none}each layer file of group app is missing or empty`;
    assert.equal(start(empty, dir).stdout, context(blank, blank));
    assert.equal(start(empty, dir, { CLAUDE_CODE_SESSION_ATTENDED: '0' }).stdout, context(blank));
    assert.equal(start(empty, dir, {}, 'shared').stdout, '');
    // A store that config.json names and that holds no map.json.
    const noMap = config(local(), { group: GROUP }), store = join(base, 'store-no-map');
    mkdirSync(store);
    write(noMap.own, 'config.json', JSON.stringify({ store }));
    const unmapped = `${none}${join(noMap.own, 'config.json')} names the store ${store}, which holds no map.json`;
    assert.equal(start(noMap, dir).stdout, context(unmapped, unmapped));
    assert.equal(main(['status'], { env: { ...env, CLAUDE_CONFIG_DIR: noMap.dir }, home: join(base, 'home'), cwd: dir })[2], `map: ${join(store, 'map.json')} (missing)`);
    // A clone at the path of a local entry that has none of the entry's remotes.
    const moved = repo('nothing-moved', 'https://example.invalid/team/elsewhere.git');
    const at = config({ version: 1, repos: [{ remotes: ['example.invalid/team/app'], path: slash(moved), group: 'app', profile: 'local' }], roots: [] }, { group: GROUP });
    const other = `${none}${slash(moved)} is the path of the map's entry of group app and has none of its remotes`;
    assert.equal(start(at, moved).stdout, context(other, other));
    // A clone git cannot read, as with a damaged HEAD file, which git answers as no repository, matches no entry by its remotes,
    // so away from an entry's path it gets no line, after a start that read it too.
    const cfg = config(local(), { group: GROUP }), hurt = repo('nothing-hurt', 'https://example.invalid/team/app.git');
    start(cfg, hurt);
    writeFileSync(join(hurt, '.git', 'HEAD'), 'not a ref\n');
    assert.equal(start(cfg, hurt).stdout, '');
    // A clone at the path of a local entry gets the line at its first start there.
    const fresh = repo('nothing-fresh', 'https://example.invalid/team/fresh.git');
    const byPath = config({ version: 1, repos: [{ remotes: ['example.invalid/team/fresh'], path: slash(fresh), group: 'app', profile: 'local' }], roots: [] }, { group: GROUP });
    writeFileSync(join(fresh, '.git', 'HEAD'), 'not a ref\n');
    const unseen = `${none}git read no repository at ${slash(fresh)}, though ${slash(fresh)} holds .git`;
    assert.equal(start(byPath, fresh).stdout, context(unseen, unseen));
    // The same clone with no entry of the map at its path costs no session a line.
    const stray = repo('nothing-stray', 'https://example.invalid/team/stray.git');
    writeFileSync(join(stray, '.git', 'HEAD'), 'not a ref\n');
    assert.equal(start(cfg, stray).stdout, '');
    // A clone of an entry the map has since lost, with the entry's path unmatched too, costs no session a line.
    const left = repo('nothing-left', 'https://example.invalid/team/app.git'), lost = config(local({ repos: [{ remotes: ['example.invalid/team/other'], path: 'unused', group: 'app', profile: 'local' }] }), { group: GROUP });
    start(cfg, left);
    writeFileSync(join(left, '.git', 'HEAD'), 'not a ref\n');
    assert.equal(start(lost, left).stdout, '');
    // Status gives the cause of each of these two states.
    assert.equal(run(['status'], { cwd: hurt, extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir } }).stdout.split('\n').at(-2), `repository: none, git read none at ${slash(hurt)}, though ${slash(hurt)} holds .git`);
    assert.equal(run(['status'], { cwd: moved, extraEnv: { CLAUDE_CONFIG_DIR: at.dir } }).stdout.split('\n').at(-3), 'check map: unmapped, at the path of the entry of group app, with none of its remotes');
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
  test('when git does not answer within the limit, the context says so and the message says unknown', () => {
    const dir = repo('slow', 'https://example.invalid/team/app.git');
    const cfg = config(local(), { group: GROUP });
    const slow = { ...slowGit(), CLAUDE_CONFIG_DIR: cfg.dir };
    const t0 = Date.now();
    const out = main(['session-start', 'all', join(base, 'data')], { env: slow, home: join(base, 'home'), cwd: base, stdin: () => JSON.stringify({ cwd: dir }), limit: 1000 });
    const took = Date.now() - t0;
    const line = `primer: no context layer is loaded at this start: git gave no answer within 1 s, so whether ${slash(dir)} has layers is unknown`;
    assert.deepEqual(out, [JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: line }, systemMessage: `primer: the context of ${slash(dir)} is unknown, since git gave no answer within 1 s` })]);
    assert.ok(took < 6000, `took ${took} ms`);
    const shown = main(['status'], { env: slow, home: join(base, 'home'), cwd: dir, limit: 1000 });
    assert.equal(shown.at(-1), 'check git: unknown, no answer within 1 s');
  });

  test('a directory with no local entry under a root gets the same line where git gives no answer within the limit', () => {
    const dir = join(base, 'slow-plain'), data = join(base, 'data-plain');
    mkdirSync(dir);
    const cfg = config(local({ roots: [slash(base)] }), { group: GROUP });
    const from = (extra) => main(['session-start', 'all', data], { env: { ...extra, CLAUDE_CONFIG_DIR: cfg.dir }, home: join(base, 'home'), cwd: base, stdin: () => JSON.stringify({ cwd: dir }), limit: 1000 });
    assert.deepEqual(from(env), []);
    const line = `primer: no context layer is loaded at this start: git gave no answer within 1 s, so whether ${slash(dir)} has layers is unknown`;
    assert.deepEqual(from(slowGit()), [JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: line }, systemMessage: `primer: the context of ${slash(dir)} is unknown, since git gave no answer within 1 s` })]);
  });

  test('a start removes the files of repo/ under the data directory named by 16 hexadecimal characters, and then the empty directory', () => {
    const dir = repo('kept-gone', 'https://example.invalid/team/app.git'), data = join(base, 'data-gone');
    const cfg = config(local(), { group: GROUP });
    write(data, 'repo/0123456789abcdef', JSON.stringify({ root: slash(dir), top: slash(dir), remotes: ['example.invalid/team/app'], names: ['origin'], urls: ['https://example.invalid/team/app.git'] }));
    const out = main(['session-start', 'all', data], { env: { ...env, CLAUDE_CONFIG_DIR: cfg.dir }, home: join(base, 'home'), cwd: base, stdin: () => JSON.stringify({ cwd: dir }), limit: 1000 });
    assert.equal(JSON.parse(out[0]).hookSpecificOutput.additionalContext, part('group', join(cfg.store, 'groups', 'app.md'), GROUP.trim(), '5ee2174e'));
    assert.equal(existsSync(join(data, 'repo')), false);
  });

  test('a start in a directory the map does not hold removes the files of repo/ and the then empty directory too', () => {
    const dir = repo('kept-other', 'https://example.invalid/team/other.git'), data = join(base, 'data-other');
    const cfg = config(local(), { group: GROUP });
    write(data, 'repo/0123456789abcdef', JSON.stringify({ root: slash(dir), top: slash(dir), remotes: ['example.invalid/team/other'], names: ['origin'], urls: ['https://example.invalid/team/other.git'] }));
    const out = main(['session-start', 'all', data], { env: { ...env, CLAUDE_CONFIG_DIR: cfg.dir }, home: join(base, 'home'), cwd: base, stdin: () => JSON.stringify({ cwd: dir }), limit: 1000 });
    assert.deepEqual(out, []);
    assert.equal(existsSync(join(data, 'repo')), false);
  });

  test('a start keeps an entry of repo/ that is no file named by 16 hexadecimal characters, and so the directory', () => {
    const dir = repo('kept-some', 'https://example.invalid/team/app.git'), data = join(base, 'data-some');
    const cfg = config(local(), { group: GROUP });
    for (const name of ['0123456789abcdef', 'notes.txt', '0123456789abcde', 'fedcba9876543210/inner']) write(data, `repo/${name}`, 'x');
    main(['session-start', 'all', data], { env: { ...env, CLAUDE_CONFIG_DIR: cfg.dir }, home: join(base, 'home'), cwd: base, stdin: () => JSON.stringify({ cwd: dir }), limit: 1000 });
    assert.deepEqual(readdirSync(join(data, 'repo')).sort(), ['0123456789abcde', 'fedcba9876543210', 'notes.txt']);
    assert.equal(existsSync(join(data, 'repo', 'fedcba9876543210', 'inner')), true);
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
      'entry: group app, profile local, remotes example.invalid/team/app',
      'profile: local',
      `layer shared: ${shared}, ${shared.length + 98} characters, canary c09a8e67`,
      `layer group: ${group}, ${group.length + 94} characters, canary 5ee2174e`,
      `layer machine: ${join(cfg.own, 'machine.md')}, missing or empty`,
      `layer machine-group: ${join(cfg.own, 'machine', 'app.md')}, missing or empty`,
      `check size: ${shared.length + group.length + 194} characters as emitted, within the cap of 10000`,
      'check map: mapped',
      'check git: answered within 30 s',
      '',
    ].join('\n'));
  });

  test('an unmapped repository under a root, and a directory outside git', () => {
    const cfg = config(local({ roots: [slash(base)] }));
    const dir = repo('status-unmapped');
    assert.equal(run(['status'], { cwd: dir, extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir } }).stdout.split('\n').slice(3).join('\n'),
      `repository: ${slash(dir)} (no remote)\nentry: none\nprofile: none\ncheck map: unmapped, under the root ${slash(base)}\ncheck git: answered within 30 s\n`);
    const plain = join(base, 'status-plain');
    mkdirSync(plain);
    assert.equal(run(['status'], { cwd: plain }).stdout, [
      `primer: ${join(base, 'no-config', 'reimagine-primer')} (missing)`,
      `store: ${join(base, 'no-config', 'reimagine-primer', 'store')} (default, no local repository)`,
      `map: ${join(base, 'no-config', 'reimagine-primer', 'store', 'map.json')} (0 repositories, 0 roots)`,
      `repository: none, ${slash(plain)} is in no git work tree`,
      '',
    ].join('\n'));
  });

  test('the store line says so while config.json names no store and the map holds no local repository', () => {
    const line = (cfg) => run(['status'], { extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir } }).stdout.split('\n')[1];
    const shared = { version: 2, repos: [{ remotes: ['example.invalid/team/site'], path: 'unused', group: 'site', profile: 'shared' }], roots: [] };
    const fresh = config(shared), used = config(local()), named = config(shared);
    write(named.own, 'config.json', JSON.stringify({ store: named.store }));
    assert.equal(line(fresh), `store: ${fresh.store} (default, no local repository)`);
    assert.equal(line(used), `store: ${used.store}`);
    assert.equal(line(named), `store: ${named.store}`);
  });

  test('status takes no arguments, and an unknown verb is refused', () => {
    assert.deepEqual([run(['status', 'x']).status, run(['status', 'x']).stdout], [1, 'primer: status takes no arguments\n']);
    assert.deepEqual([run(['nope']).status, run(['nope']).stdout], [1, 'primer: unknown command nope; use session-start, reach, status, measure, map, copies or skills\n']);
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

  test('a file under the config folder is held as <config>/ and read under the config folder of the run', () => {
    const cfg = config(local(), { shared: SOURCE });
    const copy = join(base, `loose-copy-${++seq}.md`), at = { extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir } };
    writeFileSync(copy, 'Rule one.\n');
    write(cfg.dir, 'rules/style.md', 'Rule one.\n');
    const r = run(['copies', '--add', copy, join(cfg.dir, 'rules', 'style.md')], at);
    assert.equal(r.stdout.split('\n')[1], `+ copy C1 ${slash(copy)} of <config>/rules/style.md: current`);
    assert.equal(JSON.parse(readFileSync(join(cfg.store, 'copies.json'), 'utf8')).copies[0].source, '<config>/rules/style.md');
    write(cfg.dir, 'rules/style.md', 'Rule two.\n');
    assert.equal(run(['copies'], at).stdout.split('\n')[1], `copy C1 ${slash(copy)} of <config>/rules/style.md: source changed`);
  });

  test('a record that holds a file under the config folder as ~/ still matches that file', () => {
    const cfg = config(local(), { shared: SOURCE }), name = `config-${seq}`, at = { extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir, HOME: base, USERPROFILE: base } };
    const copy = join(cfg.dir, 'rules', 'copy.md'), source = join(cfg.dir, 'rules', 'style.md'), record = join(cfg.store, 'copies.json');
    write(cfg.dir, 'rules/copy.md', 'Rule one.\n');
    write(cfg.dir, 'rules/style.md', 'Rule one.\n');
    const old = `${JSON.stringify({ version: 1, copies: [{ id: 'C1', copy: `~/${name}/rules/copy.md`, source: `~/${name}/rules/style.md`, digest: 'x' }] }, null, 2)}\n`;
    writeFileSync(record, old);
    assert.equal(run(['copies', '--add', copy, source], at).stdout, `primer: C1 already declares ${slash(copy)}; after a port, use --ported\n`);
    assert.equal(readFileSync(record, 'utf8'), old);
    assert.equal(run(['copies', '--ported', copy], at).stdout,
      `primer: wrote ${record} and ${join(cfg.store, 'copies', 'C1')}\n~ copy C1 ~/${name}/rules/copy.md of ~/${name}/rules/style.md: current\n`);
  });

  test('a snapshot that is missing is named, and no diff is shown', () => {
    const cfg = config(local(), { shared: SOURCE });
    const copy = join(base, `loose-copy-${++seq}.md`), at = { extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir } };
    writeFileSync(copy, 'Rule one.\n');
    assert.equal(run(['copies', '--add', copy, join(cfg.store, 'shared.md')], at).status, 0);
    rmSync(join(cfg.store, 'copies', 'C1'));
    assert.equal(run(['copies'], at).stdout, `copies: ${join(cfg.store, 'copies.json')} (1 declared)\ncopy C1 ${slash(copy)} of shared.md: source changed, the snapshot copies/C1 is missing\n`);
  });

  test('--ported takes a path, else a copy as status prints it, and refuses a copy that cannot be read', () => {
    const cfg = config(local(), { shared: SOURCE, group: GROUP });
    const plain = join(base, `copies-plain-${++seq}`), at = { cwd: plain, extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir } };
    mkdirSync(plain);
    assert.equal(run(['copies', '--add', join(cfg.store, 'groups', 'app.md'), join(cfg.store, 'shared.md')], at).stdout.split('\n')[1], '+ copy C1 groups/app.md of shared.md: current');
    write(cfg.store, 'shared.md', 'Rule one.\nRule two, reworded.\nRule three.\n');
    assert.equal(run(['copies', '--ported', 'groups/app.md'], at).stdout,
      `primer: wrote ${join(cfg.store, 'copies.json')} and ${join(cfg.store, 'copies', 'C1')}\n~ copy C1 groups/app.md of shared.md: current\n`);
    rmSync(join(cfg.store, 'groups', 'app.md'));
    assert.equal(run(['copies', '--ported', 'groups/app.md'], at).stdout, `primer: ${join(cfg.store, 'groups', 'app.md')} cannot be read\n`);
    write(plain, 'groups/app.md', 'Rule one.\n');
    assert.equal(run(['copies', '--add', join(plain, 'groups', 'app.md'), join(cfg.store, 'shared.md')], at).stdout.split('\n')[1], `+ copy C2 ${slash(join(plain, 'groups', 'app.md'))} of shared.md: current`);
    assert.equal(run(['copies', '--ported', 'groups/app.md'], at).stdout.split('\n')[1], `~ copy C2 ${slash(join(plain, 'groups', 'app.md'))} of shared.md: current`);
  });

  test('a copy with a second source gets a record for each, and a port records every source', () => {
    const cfg = config(local(), { shared: SOURCE, group: GROUP });
    const copy = join(base, `two-source-copy-${++seq}.md`), at = { extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir } };
    const shared = join(cfg.store, 'shared.md'), group = join(cfg.store, 'groups', 'app.md'), record = join(cfg.store, 'copies.json');
    writeFileSync(copy, 'Rule one.\n');
    assert.equal(run(['copies', '--add', copy, shared], at).stdout.split('\n')[1], `+ copy C1 ${slash(copy)} of shared.md: current`);
    assert.equal(run(['copies', '--add', copy, group], at).stdout, `primer: wrote ${record} and ${join(cfg.store, 'copies', 'C2')}\n+ copy C2 ${slash(copy)} of groups/app.md: current\n`);
    assert.equal(run(['copies', '--add', copy, group], at).stdout, `primer: C2 already declares ${slash(copy)}; after a port, use --ported\n`);
    write(cfg.store, 'groups/app.md', 'The app group builds with npm run build:all.\n');
    writeFileSync(copy, 'Rule one.\nBuilds with npm run build:all.\n');
    assert.equal(run(['copies'], at).stdout, [`copies: ${record} (2 declared)`, `copy C1 ${slash(copy)} of shared.md: copy changed`, `copy C2 ${slash(copy)} of groups/app.md: both changed`,
      '  @@ -1 +1 @@', '  -The app group builds with npm run build.', '  +The app group builds with npm run build:all.', ''].join('\n'));
    assert.equal(run(['copies', '--ported', copy], at).stdout,
      `primer: wrote ${record}, ${join(cfg.store, 'copies', 'C1')} and ${join(cfg.store, 'copies', 'C2')}\n~ copy C1 ${slash(copy)} of shared.md: current\n~ copy C2 ${slash(copy)} of groups/app.md: current\n`);
    const digest = '4c2b847935b20ad2b6667130db947bba06906a1bd4038247edccdf099cee5c02';
    assert.deepEqual(JSON.parse(readFileSync(record, 'utf8')).copies.map((x) => [x.id, x.source, x.digest]), [['C1', 'shared.md', digest], ['C2', 'groups/app.md', digest]]);
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
    assert.deepEqual(c('--spans'), [0, `primer: no run shared by two layers or documents, of at least 3 lines that are not blank\n`]);
    const plain = join(base, `copies-plain-${++seq}`);
    mkdirSync(plain);
    assert.deepEqual(run(['status'], { cwd: plain, extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir } }).stdout.split('\n').slice(4), [`copies: ${record} is not a primer copies record`, '']);
  });

  test('--spans lists the runs two layers or documents share, longest first, and leaves out runs under three lines', () => {
    const cfg = config(local(), {
      shared: '# Shared\nAlpha one.\nAlpha two.\n\nAlpha three.\nAlpha four.\nAlpha five.\nShared end.\n',
      group: 'Alpha one.\nAlpha two.\n\nAlpha three.\nAlpha four.  \nAlpha five.\nGroup end.\nPair one.\nPair two.\n',
      machine: 'Pair one.\nPair two.\nBeta one.\nBeta two.\nBeta three.\n',
      here: 'Gamma one.\nGamma two.\nGamma three.\n',
    });
    write(cfg.store, 'docs/gamma.md', 'Gamma one.\nGamma two.\nGamma three.\n');
    write(cfg.store, 'docs/guide.md', '# Guide\r\nBeta one.\r\nBeta two.\r\nBeta three.\r\n');
    write(cfg.store, 'docs/blank.md', '\n\n\n\nShared end.\n');
    const r = run(['copies', '--spans'], { extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir } });
    assert.equal(r.status, 0, r.stdout);
    assert.equal(r.stdout, [
      'primer: 3 runs shared by two layers or documents, of at least 3 lines that are not blank, longest first',
      `6 lines: ${join(cfg.store, 'shared.md')} 2-7 and ${join(cfg.store, 'groups', 'app.md')} 1-6`,
      `3 lines: ${join(cfg.own, 'machine.md')} 3-5 and ${join(cfg.store, 'docs', 'guide.md')} 2-4`,
      `3 lines: ${join(cfg.own, 'machine', 'app.md')} 1-3 and ${join(cfg.store, 'docs', 'gamma.md')} 1-3`,
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
    const r = m('--add', '--profile', 'shared', '--root', base);
    assert.equal(r.status, 0, r.stdout);
    assert.equal(r.stdout, `primer: wrote ${mapPath}\nrepo: + group App, profile shared, remotes example.invalid/team/App\nroot: + ${slash(base)}\n`);
    assert.deepEqual(read(), { version: 2, repos: [{ remotes: ['example.invalid/team/App'], path: slash(dir), group: 'App', profile: 'shared' }], roots: [slash(base)] });
    assert.deepEqual([m('--add', '--profile', 'local').status, m('--add', '--profile', 'local').stdout],
      [1, 'primer: this repository is already mapped (group App, profile shared, remotes example.invalid/team/App); use --set\n']);
    assert.equal(m('--set', '--profile', 'local', '--group', 'app').stdout, `primer: wrote ${mapPath}\nrepo: ~ group app, profile local, remotes example.invalid/team/App\n`);
    assert.equal(m().stdout, `map: ${mapPath}\nrepo: group app, profile local, remotes example.invalid/team/App\nroot: ${slash(base)}\n`);
    assert.equal(m('--add', '--root', base).stdout, 'primer: the map already holds that; nothing was written\n');
    assert.equal(m('--drop', '--root', base).stdout, `primer: wrote ${mapPath}\nroot: - ${slash(base)}\n`);
    assert.equal(m('--drop').stdout, `primer: wrote ${mapPath}\nrepo: - group app, profile local, remotes example.invalid/team/App\n`);
    assert.deepEqual(read(), { version: 2, repos: [], roots: [] });
    assert.equal(m('--drop').stdout, 'primer: this repository has no entry in the map; use --add\n');
    const store = join(base, 'elsewhere-store');
    assert.equal(m('--set', '--store', store).stdout, `primer: wrote ${join(cfgDir, 'reimagine-primer', 'config.json')}\n`);
    assert.deepEqual(JSON.parse(readFileSync(join(cfgDir, 'reimagine-primer', 'config.json'), 'utf8')), { store });
    assert.equal(m('--add', '--profile', 'local').stdout, `primer: wrote ${join(store, 'map.json')}\nrepo: + group App, profile local, remotes example.invalid/team/App\n`);
  });

  test('a repository with no remote is recorded by its main work tree\'s root', () => {
    const dir = repo('map-no-remote');
    const cfgDir = join(base, `map-config-${++seq}`);
    const r = run(['map', '--add', '--profile', 'local'], { cwd: dir, extraEnv: { CLAUDE_CONFIG_DIR: cfgDir } });
    assert.equal(r.stdout, `primer: wrote ${join(cfgDir, 'reimagine-primer', 'store', 'map.json')}\nrepo: + group map-no-remote, profile local, path ${slash(dir)}\n`);
  });

  test('a clone and a root under the home directory are recorded as ~/, shown in full, and match when read again', () => {
    const dir = repo('home/kept');
    mkdirSync(join(base, 'home', 'work'));
    const cfgDir = join(base, `map-config-${++seq}`);
    const m = (...args) => run(['map', ...args], { cwd: dir, extraEnv: { CLAUDE_CONFIG_DIR: cfgDir } });
    const mapPath = join(cfgDir, 'reimagine-primer', 'store', 'map.json');
    assert.equal(m('--add', '--profile', 'local', '--root', join(base, 'home', 'work'), '--root', join(base, 'home')).stdout,
      `primer: wrote ${mapPath}\nrepo: + group kept, profile local, path ${slash(dir)}\nroot: + ${slash(join(base, 'home', 'work'))}\nroot: + ${slash(join(base, 'home'))}\n`);
    assert.deepEqual(JSON.parse(readFileSync(mapPath, 'utf8')), { version: 2, repos: [{ remotes: [], path: '~/kept', group: 'kept', profile: 'local' }], roots: ['~/work', '~'] });
    assert.equal(m().stdout, `map: ${mapPath}\nrepo: group kept, profile local, path ${slash(dir)}\nroot: ${slash(join(base, 'home', 'work'))}\nroot: ${slash(join(base, 'home'))}\n`);
    assert.equal(m('--set', '--group', 'kin').stdout, `primer: wrote ${mapPath}\nrepo: ~ group kin, profile local, path ${slash(dir)}\n`);
  });

  test('where the home directory is the root of the file system, a path is held in full', () => {
    const dir = repo('root-home');
    const cfgDir = join(base, `map-config-${++seq}`), top = parse(base).root;
    const r = run(['map', '--add', '--profile', 'local'], { cwd: dir, extraEnv: { CLAUDE_CONFIG_DIR: cfgDir, HOME: top, USERPROFILE: top } });
    assert.equal(r.status, 0, r.stdout);
    assert.deepEqual(JSON.parse(readFileSync(join(cfgDir, 'reimagine-primer', 'store', 'map.json'), 'utf8')),
      { version: 2, repos: [{ remotes: [], path: slash(dir), group: 'root-home', profile: 'local' }], roots: [] });
  });

  test('a map written with paths in full loads, and the next write holds those under the home directory as ~/', () => {
    const dir = repo('home/older');
    const cfg = config({ version: 1, repos: [{ remotes: [], path: slash(dir), group: 'older', profile: 'local' }], roots: [slash(base)] });
    const r = run(['map', '--set', '--profile', 'shared'], { cwd: dir, extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir } });
    assert.equal(r.stdout, `primer: wrote ${join(cfg.store, 'map.json')}\nrepo: ~ group older, profile shared, path ${slash(dir)}\n`);
    assert.deepEqual(JSON.parse(readFileSync(join(cfg.store, 'map.json'), 'utf8')), { version: 2, repos: [{ remotes: [], path: '~/older', group: 'older', profile: 'shared' }], roots: [slash(base)] });
  });

  test('--set --local names the machine\'s directory, and says so while a machine layer is left in primer\'s own', () => {
    const cfg = config(local(), { machine: MACHINE });
    const here = join(base, 'machine-elsewhere');
    const m = (...args) => { const r = run(['map', ...args], { extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir } }); return [r.status, r.stdout]; };
    const left = `${join(cfg.own, 'machine.md')} is not read while ${join(cfg.own, 'config.json')} names ${here}; move its text to ${join(here, 'machine.md')}`;
    assert.deepEqual(m('--set', '--local', here), [0, `primer: wrote ${join(cfg.own, 'config.json')}\nprimer: ${left}\n`]);
    assert.deepEqual(JSON.parse(readFileSync(join(cfg.own, 'config.json'), 'utf8')), { local: here });
    const status = run(['status'], { cwd: repo('map-local-key', 'https://example.invalid/team/app.git'), extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir } }).stdout.split('\n');
    assert.equal(status[8], `layer machine: ${join(here, 'machine.md')}, missing or empty`);
    assert.equal(status[11], `check machine: ${left}`);
    const unmapped = run(['status'], { cwd: repo('map-local-unmapped', 'https://example.invalid/team/none.git'), extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir } }).stdout.split('\n');
    assert.equal(unmapped[6], `check machine: ${left}`);
    const plain = config(local());
    const p = run(['map', '--set', '--store', plain.dir], { extraEnv: { CLAUDE_CONFIG_DIR: plain.dir } });
    assert.deepEqual([p.status, p.stdout], [1, `primer: the machine's directory ${plain.own} would sit inside the store ${plain.dir}, which may be shared; name one outside it\n`]);
    assert.deepEqual(m('--set', '--local', 'relative'), [1, 'primer: --local takes an absolute or ~/ path, not relative\n']);
    assert.deepEqual(m('--set', '--local', join(cfg.store, 'mine')), [1, `primer: the machine's directory ${join(cfg.store, 'mine')} would sit inside the store ${cfg.store}, which may be shared; name one outside it\n`]);
    assert.deepEqual(m('--set', '--store', base), [1, `primer: the machine's directory ${here} would sit inside the store ${base}, which may be shared; name one outside it\n`]);
    assert.deepEqual(JSON.parse(readFileSync(join(cfg.own, 'config.json'), 'utf8')), { local: here });
    assert.deepEqual(m('--set', '--local', here, '--group', 'web'), [1, 'primer: map takes --add with --profile shared|local [--group <name>] or --root <dir>, --set with any of '
      + '--profile, --group and --root or with --store <path> or --local <path> alone, or --drop [--root <dir>]; nothing else is accepted\n']);
  });

  test('a root given through a link is recorded as the directory it leads to', () => {
    const target = join(base, 'root-target'), link = join(base, 'root-link');
    mkdirSync(target);
    symlinkSync(target, link, 'junction');
    const cfgDir = join(base, `map-config-${++seq}`);
    const r = run(['map', '--add', '--root', link], { extraEnv: { CLAUDE_CONFIG_DIR: cfgDir } });
    assert.equal(r.stdout, `primer: wrote ${join(cfgDir, 'reimagine-primer', 'store', 'map.json')}\nroot: + ${slash(target)}\n`);
  });

  test('an entry that holds the own key of an older map loads, and the next write leaves the key out', () => {
    const dir = repo('map-old-own', 'https://example.invalid/team/own.git');
    const cfg = config({ version: 1, repos: [{ remotes: ['example.invalid/team/own'], path: 'unused', group: 'own', profile: 'local', own: false }], roots: [] });
    const mapPath = join(cfg.store, 'map.json');
    const m = (...args) => { const r = run(['map', ...args], { cwd: dir, extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir } }); return [r.status, r.stdout]; };
    assert.deepEqual(m(), [0, `map: ${mapPath}\nrepo: group own, profile local, remotes example.invalid/team/own\n`]);
    assert.deepEqual(m('--set', '--profile', 'shared'), [0, `primer: wrote ${mapPath}\nrepo: ~ group own, profile shared, remotes example.invalid/team/own\n`]);
    assert.deepEqual(JSON.parse(readFileSync(mapPath, 'utf8')), { version: 2, repos: [{ remotes: ['example.invalid/team/own'], path: 'unused', group: 'own', profile: 'shared' }], roots: [] });
  });

  test('each form the map does not take is refused with one line', () => {
    const dir = repo('map-refused', 'https://example.invalid/team/app.git');
    const m = (...args) => { const r = run(['map', ...args], { cwd: dir }); return [r.status, r.stdout]; };
    const forms = 'primer: map takes --add with --profile shared|local [--group <name>] or --root <dir>, --set with any of '
      + '--profile, --group and --root or with --store <path> or --local <path> alone, or --drop [--root <dir>]; nothing else is accepted\n';
    assert.deepEqual(m('--add'), [1, forms]);
    assert.deepEqual(m('--move'), [1, forms]);
    assert.deepEqual(m('--drop', '--group', 'x'), [1, forms]);
    assert.deepEqual(m('--add', '--own', 'true'), [1, forms]);
    assert.deepEqual(m('--add', '--profile', 'shared', '--own', 'true'), [1, forms]);
    assert.deepEqual(m('--set', '--store', join(base, 'other-store'), '--group', 'web'), [1, forms]);
    assert.deepEqual(m('--add', '--profile', 'team'), [1, 'primer: --profile takes shared or local, not team\n']);
    assert.deepEqual(m('--add', '--profile', 'local', '--group', '../x'), [1, 'primer: --group takes letters, digits, ., _ and -, starting with a letter or digit, not ../x\n']);
    assert.deepEqual(m('--set', '--store', 'relative'), [1, 'primer: --store takes an absolute or ~/ path, not relative\n']);
    assert.deepEqual(m('--set', '--profile', 'local'), [1, 'primer: this repository has no entry in the map; use --add\n']);
  });
});

describe('skills', () => {
  const SKILL = '---\nname: app-release\ndescription: Release the app group.\n---\n# app-release\n';
  const at = (cfg, ...args) => { const r = run(['skills', ...args], { extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir } }); return [r.status, r.stdout]; };

  test('lists each skill of the store with the entry of its name in the config folder; --link makes the missing links and leaves any other entry as it is', () => {
    const cfg = config(local()), from = join(cfg.store, 'skills'), to = join(cfg.dir, 'skills'), dir = repo('skills-status', 'https://example.invalid/team/other.git');
    write(from, 'app-release/SKILL.md', SKILL);
    write(from, 'app-seed/SKILL.md', SKILL);
    write(from, 'drafts/notes.md', 'No skill file here.\n');
    write(from, 'README.md', 'Not a directory.\n');
    write(to, 'app-seed/SKILL.md', 'A skill of the user\'s own.\n');
    const head = `skills: ${from}, linked from ${to}`, other = `skill app-seed: ${join(to, 'app-seed')} is not a link to it and is left as it is`;
    const status = () => run(['status'], { cwd: dir, extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir } }).stdout.split('\n').filter((l) => l.startsWith('check skills'));
    assert.deepEqual(at(cfg), [0, `${head}\nskill app-release: not linked\n${other}\n`]);
    assert.deepEqual(status(), [`check skills: no link in ${to} for app-release, app-seed`]);
    assert.deepEqual(at(cfg, '--link'), [0, `${head}\nskill app-release: + linked\n${other}\n`]);
    assert.equal(readFileSync(join(to, 'app-release', 'SKILL.md'), 'utf8'), SKILL);
    assert.equal(lstatSync(join(to, 'app-release')).isSymbolicLink(), true);
    assert.equal(readFileSync(join(to, 'app-seed', 'SKILL.md'), 'utf8'), 'A skill of the user\'s own.\n');
    assert.deepEqual(at(cfg, '--link'), [0, `${head}\nskill app-release: linked\n${other}\n`]);
    assert.deepEqual(status(), [`check skills: no link in ${to} for app-seed`]);
  });

  test('a skill kept in the store through a link is listed, and a link whose directory is gone is made again', () => {
    const cfg = config(local()), from = join(cfg.store, 'skills'), to = join(cfg.dir, 'skills'), kept = join(base, `skills-kept-${++seq}`), head = `skills: ${from}, linked from ${to}`;
    write(kept, 'SKILL.md', SKILL);
    mkdirSync(from, { recursive: true });
    symlinkSync(kept, join(from, 'app-release'), 'junction');
    assert.deepEqual(at(cfg, '--link'), [0, `${head}\nskill app-release: + linked\n`]);
    renameSync(join(from, 'app-release'), join(from, 'app-moved'));
    mkdirSync(join(to, 'gone-target'));
    symlinkSync(join(to, 'gone-target'), join(to, 'app-moved'), 'junction');
    rmSync(join(to, 'gone-target'), { recursive: true });
    assert.deepEqual(at(cfg), [0, `${head}\nskill app-moved: not linked, and its link leads to a directory that is gone\n`]);
    assert.deepEqual(at(cfg, '--link'), [0, `${head}\nskill app-moved: + linked\n`]);
    assert.equal(readFileSync(join(to, 'app-moved', 'SKILL.md'), 'utf8'), SKILL);
  });

  test('a config folder whose skills entry is no directory takes no link, and neither the verb nor status fails', () => {
    const cfg = config(local()), from = join(cfg.store, 'skills'), to = join(cfg.dir, 'skills'), dir = repo('skills-blocked', 'https://example.invalid/team/blocked.git');
    write(from, 'app-release/SKILL.md', SKILL);
    writeFileSync(to, 'not a directory\n');
    const said = [0, `skills: ${from}, linked from ${to}\nskill app-release: ${to} is not a link to it and is left as it is\n`];
    assert.deepEqual(at(cfg), said);
    assert.deepEqual(at(cfg, '--link'), said);
    const r = run(['status'], { cwd: dir, extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir } });
    assert.deepEqual([r.status, r.stdout.split('\n').filter((l) => l.startsWith('check skills'))], [0, [`check skills: no link in ${to} for app-release`]]);
  });

  test('a store with no skill says so and makes no folder, and any other form is refused with one line', () => {
    const cfg = config(local());
    assert.deepEqual(at(cfg, '--link'), [0, `skills: ${join(cfg.store, 'skills')}, linked from ${join(cfg.dir, 'skills')}\nno skills\n`]);
    assert.equal(existsSync(join(cfg.dir, 'skills')), false);
    for (const args of [['--unlink'], ['--link', 'x'], ['x']]) assert.deepEqual(at(cfg, ...args), [1, 'primer: skills takes nothing, or --link\n'], args.join(' '));
  });
});

describe('measure', () => {
  const site = { remotes: ['example.invalid/team/site'], path: 'unused', group: 'site', profile: 'shared', own: true };
  const web = { remotes: ['example.invalid/team/web'], path: 'unused', group: 'web', profile: 'local' };
  const head = "primer: the host's cap is 10000 characters per context string, counted as emitted";
  const app = 'repo group app, profile local, remotes example.invalid/team/app';
  const webLine = 'repo group web, profile local, remotes example.invalid/team/web';
  const siteLine = 'repo group site, profile shared, remotes example.invalid/team/site: no context string';

  test('every mapped repository gets its context string as the loader emits it, layer by layer, against the cap', () => {
    const cfg = config(local({ repos: [...local().repos, web, site] }), { shared: SHARED, group: GROUP });
    const s = join(cfg.store, 'shared.md').length + 98, g = join(cfg.store, 'groups', 'app.md').length + 94;
    const r = run(['measure'], { extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir } });
    assert.equal(r.status, 0, r.stdout);
    assert.equal(r.stdout, [head, `${app}: ${s + 2 + g} characters (shared ${s}, group ${g}, machine 0, machine-group 0), within the cap`,
      `${webLine}: ${s} characters (shared ${s}, group 0, machine 0, machine-group 0), within the cap`, siteLine, ''].join('\n'));
  });

  test('--with measures a proposed layer in its file\'s place, before and after, for each repository', () => {
    const cfg = config(local({ repos: [...local().repos, web, site] }), { shared: SHARED, group: GROUP });
    const s = join(cfg.store, 'shared.md').length + 98, g = join(cfg.store, 'groups', 'app.md').length + 94;
    write(base, 'proposal.md', `${GROUP}The app group deploys from main.\n`);
    const r = run(['measure', '--with', 'proposal.md', 'groups/app.md'], { extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir } });
    assert.equal(r.stdout, [head, `${app}: ${s + 2 + g} -> ${s + 2 + g + 33} characters (shared ${s}, group ${g} -> ${g + 33}, machine 0, machine-group 0), within the cap`,
      `${webLine}: ${s} -> ${s} characters (shared ${s}, group 0, machine 0, machine-group 0), within the cap`, siteLine, ''].join('\n'));
    assert.equal(readFileSync(join(cfg.store, 'groups', 'app.md'), 'utf8'), GROUP);
    write(base, 'big.md', `${'a'.repeat(9990)}\n`);
    const big = run(['measure', '--with', join(base, 'big.md'), 'shared.md'], { extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir } }).stdout.split('\n');
    assert.equal(big[1], `${app}: ${s + 2 + g} -> ${s + 2 + g + 9948} characters (shared ${s} -> ${s + 9948}, group ${g}, machine 0, machine-group 0), over the cap`);
    write(base, 'here.md', HERE);
    const here = run(['measure', '--with', 'here.md', 'machine/app.md'], { extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir } }).stdout.split('\n');
    const h = join(cfg.own, 'machine', 'app.md').length + 121;
    assert.equal(here[1], `${app}: ${s + 2 + g} -> ${s + 2 + g + 2 + h} characters (shared ${s}, group ${g}, machine 0, machine-group 0 -> ${h}), within the cap`);
    assert.equal(here[2], `${webLine}: ${s} -> ${s} characters (shared ${s}, group 0, machine 0, machine-group 0), within the cap`);
  });

  test('--with gives a group that no local entry of the map holds the size a repository of it would be given', () => {
    const none = config(local({ repos: [] }), { shared: SHARED });
    const s = join(none.store, 'shared.md').length + 98, g = join(none.store, 'groups', 'site.md').length + 87;
    write(base, 'site.md', 'The site group deploys from main.\n');
    const of = (cfg, layer) => run(['measure', '--with', 'site.md', layer], { extraEnv: { CLAUDE_CONFIG_DIR: cfg.dir } }).stdout;
    assert.equal(of(none, 'groups/site.md'), [head, `group site, in no local entry of the map: ${s} -> ${s + 2 + g} characters (shared ${s}, group 0 -> ${g}, machine 0, machine-group 0), within the cap`, ''].join('\n'));
    const held = config(local({ repos: [site] })), m = join(held.own, 'machine', 'site.md').length + 103;
    assert.equal(of(held, 'machine/site.md'), [head, siteLine, `group site, in no local entry of the map: 0 -> ${m} characters (shared 0, group 0, machine 0, machine-group 0 -> ${m}), within the cap`, ''].join('\n'));
    // Windows reads groups/APP.md as the file the app entry loads.
    const cased = of(config(local(), { group: GROUP }), 'groups/APP.md').split('\n').filter((l) => l.startsWith('group '));
    assert.equal(cased.length, process.platform === 'win32' ? 0 : 1);
  });

  test('each form measure does not take is refused with one line', () => {
    const forms = 'primer: measure takes nothing, or --with <file> <layer>, the layer being shared.md, groups/<group>.md, machine.md or machine/<group>.md\n';
    for (const args of [['--with', 'x.md'], ['--with', 'x.md', 'groups/../x.md'], ['--with', 'x.md', 'machine/../x.md'], ['--with', 'x.md', 'other.md'], ['x']]) {
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

  test('a session that started in a local repository gets the two group layers of another alone, and nothing where the two share a group', () => {
    const home = (group) => config(local({ repos: [...local().repos, { remotes: ['example.invalid/team/session'], path: 'unused', group, profile: 'local' }] }),
      { shared: SHARED, group: GROUP, machine: MACHINE, here: HERE });
    const other = home('home'), same = home('app');
    assert.equal(edit(join(base, `reach-data-${++seq}`), join(app, 'src', 'new.ts'), { extraEnv: { CLAUDE_CONFIG_DIR: other.dir } }).stdout,
      said(`${lead(app)} context, which follows.\n\n${part('group', join(other.store, 'groups', 'app.md'), GROUP.trim(), '5ee2174e')}\n\n`
        + part('machine-group', join(other.own, 'machine', 'app.md'), 'The app group keeps its database on port 5433 here.', '29f29947')));
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

  test('a file of the store or of the machine\'s directory prints nothing, though a repository with a hub holds it, and leaves that repository unrecorded', () => {
    const hub = repo(`reach-hub-${++seq}`, 'https://example.invalid/team/hub.git'), dir = join(base, `reach-hub-config-${seq}`), data = join(base, `reach-data-${++seq}`);
    write(hub, 'CLAUDE.md', '# Hub\n');
    write(hub, 'context/map.json', JSON.stringify(local()));
    write(dir, 'reimagine-primer/config.json', JSON.stringify({ store: join(hub, 'context'), local: join(hub, 'mine') }));
    const at = (file) => edit(data, file, { extraEnv: { CLAUDE_CONFIG_DIR: dir } }).stdout;
    assert.equal(at(join(hub, 'context', 'groups', 'app.md')), '');
    assert.equal(at(join(hub, 'mine', 'machine.md')), '');
    assert.equal(at(join(hub, 'README.md')), said(`${lead(hub)} instruction files: ${slash(hub)}/CLAUDE.md`));
    const link = join(base, `reach-hub-link-${seq}`);
    symlinkSync(hub, link, 'junction');
    assert.equal(at(join(link, 'context', 'docs', 'new.md')), '');
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

// Requirement 410: what a store that may be shared holds of one machine, told by line and kind.
describe('the store check', () => {
  const opts = (cfg, cwd, extra = {}) => ({ env: { ...env, CLAUDE_CONFIG_DIR: cfg.dir }, home: '/home/fixture', cwd, user: 'pat', host: 'box-7.example.invalid', ...extra });
  const tracked = (lines) => lines.filter((l) => l.startsWith('check tracked'));

  test('status names the line and the kind, and quotes no text, for each layer, document, skill, ledger line and snapshot of the store', () => {
    const dir = repo('tracked-status', 'https://example.invalid/team/app.git');
    const cfg = config(local(), { shared: SHARED, group: `${GROUP}Its checkout is /home/fixture/work/app here.\nThe host BOX-7 serves it, and pat runs it.\nA sibling is at /home/fixtures/app.\n`, machine: 'pat keeps /home/fixture/notes on BOX-7.\n' });
    write(cfg.store, 'docs/blob.bin', 'pat\0pat\n');
    write(cfg.store, 'docs/release.md', '# Release\n\nAsk Acme Rail before a release.\nAn acme-rail branch is theirs, and patch notes are ours.\n');
    write(cfg.store, 'skills/app-release/SKILL.md', '---\nname: app-release\n---\n\nRun it as PAT.\n');
    write(cfg.store, 'ledger.jsonl', '{"id":"L1","gap":"The steps name no owner.","logs":["2026-11-01.md"],"status":"open","place":null,"commit":null,"by":null,"seen":1,"failed":[],"worked":[]}\n{"id":"L2","gap":"Pat ran the steps by hand.","logs":["2026-11-01.md"],"status":"open","place":null,"commit":null,"by":null,"seen":1,"failed":[],"worked":[]}\n');
    write(cfg.store, 'copies/0a1b2c3d', '# Steps\n\nRun them on box-7.\n');
    write(cfg.own, 'terms.txt', 'Acme Rail\n\n');
    assert.deepEqual(tracked(main(['status'], opts(cfg, dir))), [
      'check tracked: groups/app.md:2 holds the home directory',
      'check tracked: groups/app.md:3 holds the host name',
      'check tracked: groups/app.md:3 holds the user name',
      'check tracked: docs/release.md:3 holds a listed term',
      'check tracked: skills/app-release/SKILL.md:5 holds the user name',
      'check tracked: ledger.jsonl:2 holds the user name',
      'check tracked: copies/0a1b2c3d:3 holds the host name',
    ]);
    // A home directory that is a file system's root is in every path, and an empty name is in every line: neither is looked for.
    assert.deepEqual(tracked(main(['status'], opts(cfg, dir, { home: '/', user: '', host: '' }))), ['check tracked: docs/release.md:3 holds a listed term']);
    rmSync(join(cfg.own, 'terms.txt'));
    assert.deepEqual(tracked(main(['status'], opts(cfg, dir, { home: '/', user: '', host: '' }))), []);
  });

  test('status tells a listed term in the map and the copies record, and nothing else of the machine there', () => {
    const dir = repo('tracked-map', 'https://example.invalid/acme-rail/app.git');
    const cfg = config({});
    write(cfg.store, 'map.json', `${JSON.stringify({ version: 2, repos: [{ remotes: ['example.invalid/acme-rail/app'], path: '/home/fixture/work/app', group: 'app', profile: 'local' }], roots: ['/srv/pat'] }, null, 2)}\n`);
    write(cfg.store, 'copies.json', `${JSON.stringify({ version: 1, copies: [{ id: 'C1', copy: '/srv/box-7/Acme-Rail/notes.md', source: 'docs/notes.md', digest: 'x' }] }, null, 2)}\n`);
    assert.deepEqual(tracked(main(['status'], opts(cfg, dir))), []);
    write(cfg.own, 'terms.txt', 'acme-rail\n');
    assert.deepEqual(tracked(main(['status'], opts(cfg, dir))), ['check tracked: map.json:6 holds a listed term', 'check tracked: copies.json:6 holds a listed term']);
  });

  test('measure --with gives the same lines under the layer\'s name for a proposed layer of the store, and none for a layer of the machine', () => {
    const cfg = config(local(), { group: GROUP }), next = join(base, `proposed-${++seq}.md`);
    write(cfg.own, 'terms.txt', 'Acme Rail\n');
    writeFileSync(next, `${GROUP}Acme Rail signs off each release from /home/fixture/out.\n`);
    assert.deepEqual(tracked(main(['measure', '--with', next, 'groups/app.md'], opts(cfg, base))), ['check tracked: groups/app.md:2 holds the home directory', 'check tracked: groups/app.md:2 holds a listed term']);
    assert.deepEqual(tracked(main(['measure', '--with', next, 'machine/app.md'], opts(cfg, base))), []);
  });
});

// Requirement 397: the notice hook, where the hub has the marker, and the loader, in a local repository, give one message on one fixture.
describe('the notice', () => {
  let memory, dir, cfg, key;
  const day = 86400;
  before(() => {
    const build = spawnSync('sh', ['tests/primer/fixture/memory/build.sh'], { cwd: ROOT, env: { ...env, TMPDIR: slash(base) }, encoding: 'utf8' });
    assert.equal(build.status, 0, build.stderr);
    memory = build.stdout.trim();
    dir = repo('notice-both', 'https://example.invalid/team/app.git');
    git(dir, 'remote', 'add', 'upstream', 'git@other.invalid:fork/kit.git');
    write(dir, 'CLAUDE.md', '<!-- primer -->\n# demo\n');
    cfg = config(local(), { group: GROUP });
    key = dir.replace(/[^A-Za-z0-9]/g, '-');
    cpSync(join(memory, 'memory'), join(cfg.dir, 'projects', key, 'memory'), { recursive: true });
  });
  const stamps = (data, { notes }) => {
    mkdirSync(join(data, 'reviewed'), { recursive: true });
    rmSync(join(data, 'reviewed', key), { force: true });
    if (notes) write(data, `reviewed/${key}`, `${notes}\n`);
  };
  const both = (data, extra = {}) => {
    const input = JSON.stringify({ session_id: 'test', transcript_path: join(cfg.dir, 'projects', key, 'test.jsonl'), cwd: dir, hook_event_name: 'SessionStart', source: 'startup', ...extra });
    const hook = spawnSync(process.execPath, ['plugins/primer/hooks/notice.mjs'], { cwd: ROOT, env: { ...env, CLAUDE_PLUGIN_DATA: data }, input, encoding: 'utf8' });
    assert.equal(hook.status, 0, hook.stderr);
    // The loader gives the layers too, so its side is its message alone.
    const out = run(['session-start', 'all', data], { input }).stdout, said = out && JSON.parse(out).systemMessage;
    return [hook.stdout, said ? message(said.replaceAll('\\', '\\\\')) : ''];
  };
  const message = (text) => `{"systemMessage":"${text}"}\n`;

  test('notes alone, notes and entries, and entries alone each read the same from both hooks', () => {
    const logs = join(cfg.dir, 'feedback'), data = join(base, `notice-data-${++seq}`);
    // Three entries name the repository: a level-two Recommended section is no entry, and app-two is another repository's name.
    write(logs, '2026-11-01.md', '## app: a first entry\n\n- One.\n\n### Recommended\n\n- One.\n\n## Recommended\n\n- Kept at level two.\n\n## app-two: another repository\n\n## team, app: a comma before the colon\n');
    write(logs, '2026-11-02.md', '## Session\n\n- It names none.\n\n## APP: in capitals\r\n\n## Recommended for app\n');
    const read = `${key}\t3\t2026-11-01.md\n${key}\t2\t2026-11-02.md\n`;
    write(logs, '.reviewed', read);
    stamps(data, { notes: '2026-09-15T12:00:00.000Z' });
    const one = message('primer: auto memory has 1 notes since the last review; run /primer');
    assert.deepEqual(both(data), [one, one]);
    rmSync(join(logs, '.reviewed'));
    const two = message('primer: auto memory has 1 notes and 3 feedback entries since the last review; run /primer');
    assert.deepEqual(both(data), [two, two]);
    stamps(data, { notes: '2026-12-01T00:00:00.000Z' });
    const three = message('primer: 3 feedback entries since the last review; run /primer');
    assert.deepEqual(both(data), [three, three]);
    write(logs, '.reviewed', read);
    assert.deepEqual(both(data), ['', '']);
  });

  test('the stamp holds how far one repository read each log, and a single entry after a review makes no notice', () => {
    const data = join(base, `notice-data-${++seq}`), a = config(local(), { group: GROUP }), b = config(local(), { group: GROUP }), c = config(local(), { group: GROUP });
    const from = (x) => both(data, { transcript_path: join(x.dir, 'projects', key, 'test.jsonl') });
    const said = (n) => message(`primer: ${n} feedback entries since the last review; run /primer`);
    // With neither stamp, no review has run in the repository.
    const first = (n) => message(`primer: ${n} feedback entries; no review has run here; run /primer`);
    stamps(data, {});
    write(a.dir, 'feedback/2026-11-01.md', '## app: one\n\n## app: two\n');
    write(b.dir, 'feedback/2026-11-01.md', '## app: one\n\n## app: two\n');
    // A stamp in the earlier form, one line that holds a time, counts for nothing, and neither does another repository's line.
    write(a.dir, 'feedback/.reviewed', '2026-11-01T00:00:00.000Z\nanother-key\t2\t2026-11-01.md\n');
    assert.deepEqual(from(a), [first(2), first(2)]);
    write(a.dir, 'feedback/.reviewed', `another-key\t2\t2026-11-01.md\n${key}\t2\t2026-11-01.md\n`);
    assert.deepEqual(from(a), ['', '']);
    assert.deepEqual(from(b), [first(2), first(2)]);
    // The reviewing session logs its own entry after the stamp is written.
    write(a.dir, 'feedback/2026-11-01.md', '## app: one\n\n## app: two\n\n## app: three\n');
    assert.deepEqual(from(a), ['', '']);
    // A second entry, in a log the stamp does not hold and by the name of the second remote, makes the notice.
    write(a.dir, 'feedback/2026-11-02.md', '## kit: a later session\n');
    assert.deepEqual(from(a), [said(2), said(2)]);
    // A directory of the stamp's name is no stamp, and the directory's own name is one of the repository's.
    write(c.dir, 'feedback/2026-11-01.md', '## notice-both: by its directory\n\n## notice: a shorter name\n');
    mkdirSync(join(c.dir, 'feedback', '.reviewed'));
    assert.deepEqual(from(c), [first(1), first(1)]);
  });

  test('review.json in the machine\'s directory leaves a note out of the count and names more log directories, for both hooks', () => {
    const data = join(base, `notice-data-${++seq}`), a = config(local(), { group: GROUP }), more = join(base, `more-logs-${seq}`), file = join(a.own, 'review.json');
    const from = () => both(data, { transcript_path: join(a.dir, 'projects', key, 'test.jsonl') });
    const notes = (n) => message(`primer: auto memory has ${n} notes; no review has run here; run /primer`);
    cpSync(join(memory, 'memory'), join(a.dir, 'projects', key, 'memory'), { recursive: true });
    stamps(data, {});
    assert.deepEqual(from(), [notes(2), notes(2)]);
    write(a.own, 'review.json', JSON.stringify({ repositories: { [slash(dir)]: { skip: ['item-ids-are-numbers.md'] } } }));
    assert.deepEqual(from(), [notes(1), notes(1)]);
    // A directory the file names is read two levels down and for its .md files, a name that starts with a dot left out, and a log
    // there is held in the stamp by its path.
    write(more, '2026-11/2026-11-20.md', '## app: one\n\n## app: two\n');
    write(more, '.kept/2026-11-21.md', '## app: out of sight\n');
    write(more, 'notes.txt', '## app: no log\n');
    write(more, 'a/b/c/2026-11-22.md', '## app: too deep\n');
    write(a.own, 'review.json', JSON.stringify({ logs: [slash(more)], repositories: { [slash(dir)]: { skip: ['item-ids-are-numbers.md', 'no-direct-push.md'], transcripts: false } } }));
    const entries = message('primer: 2 feedback entries; no review has run here; run /primer');
    assert.deepEqual(from(), [entries, entries]);
    const status = run(['status'], { cwd: dir, extraEnv: { CLAUDE_CONFIG_DIR: a.dir } }).stdout.split('\n').filter((l) => l.startsWith('review:'));
    assert.deepEqual(status, [`review: ${file}, 1 log directories, 2 notes skipped and transcripts off for this repository`]);
    write(a.dir, 'feedback/.reviewed', `${key}\t2\t${slash(join(more, '2026-11', '2026-11-20.md'))}\n`);
    assert.deepEqual(from(), ['', '']);
    // A file in another form is said and never read as an empty list.
    for (const text of [JSON.stringify({ skip: ['no-direct-push.md'] }), JSON.stringify({ logs: ['relative'] }), JSON.stringify({ repositories: { [slash(dir)]: { skips: [] } } }), '{', 'null', JSON.stringify({ repositories: null })]) {
      write(a.own, 'review.json', text);
      const said = message(`primer: ${file.replaceAll('\\', '\\\\')} is not a primer review file`);
      assert.deepEqual(from(), [said, said], text);
      const report = run(['status'], { cwd: dir, extraEnv: { CLAUDE_CONFIG_DIR: a.dir } }).stdout.split('\n');
      assert.ok(report.includes(`check review: ${file} is not a primer review file`), text);
      assert.ok(report.some((l) => l.startsWith('profile: ')), text);
    }
  });

  test('a notice that stops on an error of its own leaves the layers in place and says so in one line', () => {
    const data = join(base, `notice-data-${++seq}`), loop = join(data, 'reviewed', key);
    mkdirSync(dirname(loop), { recursive: true });
    // A stamp that is a link to itself, which no stat can follow.
    symlinkSync(loop, loop, 'junction');
    const out = run(['session-start', 'all', data], { input: JSON.stringify({ transcript_path: join(cfg.dir, 'projects', key, 'test.jsonl'), cwd: dir, source: 'startup' }) }).stdout;
    assert.equal(out, context(part('group', join(cfg.store, 'groups', 'app.md'), GROUP.trim(), '5ee2174e'), `primer: the review notice stopped on an error of its own: ELOOP: too many symbolic links encountered, stat '${loop}'`));
  });

  test('the loader gives no notice on a later source or in a session no one attends', () => {
    const data = join(base, `notice-data-${++seq}`);
    stamps(data, {});
    const said = (more, extraEnv) => JSON.parse(run(['session-start', 'all', data], { input: JSON.stringify({ transcript_path: join(cfg.dir, 'projects', key, 'test.jsonl'), cwd: dir, ...more }), extraEnv }).stdout).systemMessage;
    assert.equal(said({ source: 'resume', session_id: 'later' }), undefined);
    assert.equal(said({ source: 'startup' }, { CLAUDE_CODE_SESSION_ATTENDED: '0' }), undefined);
    assert.notEqual(said({ source: 'startup' }), undefined);
    assert.equal(said({ hook_event_name: 'SubagentStart', agent_type: 'general-purpose' }), undefined);
  });
});

test('R256: a note the review settings skip is named and never opened', () => {
  const memory = mkdtempSync(join(tmpdir(), 'primer-notes-'));
  try {
    writeFileSync(join(memory, 'MEMORY.md'), '- [A](a.md) - one\n- [B](b.md) - two\n');
    for (const [name, type] of [['a', 'feedback'], ['b', 'project']]) writeFileSync(join(memory, `${name}.md`), `---\nname: x\nmetadata:\n  type: ${type}\n---\n\nText.\n`);
    assert.deepEqual(notesOf(memory, ['b.md'])[1], { name: 'b.md' });
    assert.equal(notesOf(memory)[1].type, 'project');
  } finally { rmSync(memory, { recursive: true, force: true }); }
});

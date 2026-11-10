// Guard. main() runs on temporary directories set through CLAUDE_CONFIG_DIR and home, with real git and a stand-in for the
// claude runner (the only injected boundary), so no test reads or writes the real configuration or runs claude.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Refusal, main, normalizeRemote } from '../../plugins/guard/scripts/guard.mjs';

const SCRIPT = fileURLToPath(new URL('../../plugins/guard/scripts/guard.mjs', import.meta.url));
const FIX = JSON.parse(readFileSync(new URL('./fixture/defaults.json', import.meta.url), 'utf8'));
const j = JSON.stringify;

const ORG = '**Organization**: Example Org keeps its code in private repositories.';
const VIS = '**Repository visibility**: Treat every repository as private unless told otherwise.';
const TRUSTED = '**Trusted repo**: The git repository the session starts in and its configured remotes.';
const SOURCE = '**Source control**: The trusted repo and its remotes only.';
const DOMAINS = '**Trusted internal domains**: None are configured.';
const DEFAULT_ALLOW = ["Test runs: running the project's own test command is allowed.", "Local edits: editing files inside the working directory is allowed."];
const A1 = "User's own repositories: pushing a branch to a repository listed under Source control, opening a pull request there, and editing the title or description of, or commenting on, a pull request there that the user's own message asked to work on, one this session did not open included. A body given on stdin, or in a file that the agent or its subagents wrote in this session, counts as derived from this transcript. (reimagine guard)";
const A2 = "Settings reads: reading Claude Code settings files, the settings.json in the configuration directory and a listed repository's .claude/settings.json or .claude/settings.local.json, to inspect or verify configuration is not credential exploration, as long as no value read leaves the machine. (reimagine guard)";
const RA = 'https://user:tok3n@git.example.invalid/org/app.git';
const NA = 'git.example.invalid/org/app';
const RB1 = 'git@git.example.invalid:org/lib.git';
const RB2 = 'ssh://git@git.example.invalid:2222/org/lib-mirror.git';
const NB1 = 'git.example.invalid/org/lib';
const NB2 = 'git.example.invalid/org/lib-mirror';
const trustedFor = (sites) => `${TRUSTED} The user's own repositories listed under Source control are trusted the same way, at these local checkouts: ${sites}. (reimagine guard)`;
const sourceFor = (remotes) => `**Source control**: The trusted repo and its remote(s), and these remotes of the user's own repositories: ${remotes}; as scoped by the Trusted repo and Repository visibility entries above. (reimagine guard)`;
const mergeFor = (remotes) => `Owner-reviewed merges: merging a pull request in ${remotes}, when the user's own message names that pull request and asks for the merge; the user reviews their own pull requests in these repositories. (reimagine guard)`;
const CHECK = "guard: the host's effective configuration holds every guard entry once";
const PLAN_CHECK = "check: the dry run's effective configuration holds every guard entry once";
const FORMS = 'plan takes one of --add <path> [--merge] [--reads], --drop <path or remote> or --clear; nothing else is accepted';

const dirs = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

// A sandbox: configuration, data, home and work directories, an isolated git environment and a stand-in for claude.
function world({ configEnv = true } = {}) {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'guard-test-')));
  dirs.push(dir);
  const w = { dir, config: join(dir, 'config'), data: join(dir, 'data'), home: join(dir, 'home'), work: join(dir, 'work'), calls: [], temps: [], seen: [], stand: {}, now: new Date('2026-11-04T10:00:00Z') };
  for (const d of [w.config, w.data, w.home, w.work]) mkdirSync(d);
  const gitConfig = join(dir, 'empty.gitconfig');
  writeFileSync(gitConfig, '');
  w.env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: gitConfig, GIT_CEILING_DIRECTORIES: dir };
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'CLAUDE_CONFIG_DIR', 'CLAUDE_CODE_SESSION_ATTENDED', 'CLAUDE_CODE_ENTRYPOINT']) delete w.env[k];
  if (configEnv) w.env.CLAUDE_CONFIG_DIR = w.config;
  w.settings = join(configEnv ? w.config : join(w.home, '.claude'), 'settings.json');
  w.list = join(configEnv ? w.config : join(w.home, '.claude'), 'reimagine-guard.json');
  w.claude = (args, d) => stand(w, args, d);
  const call = (argv) => main([argv[0], w.data, ...argv.slice(1)], { env: w.env, now: w.now, home: w.home, cwd: w.work, claude: w.claude, platform: w.platform });
  // One session: it takes the id from its plan's plan: line and gives it to apply, as the skill does.
  w.run = (...argv) => {
    if (argv[0] === 'apply' && argv.length === 1) return call(['apply', w.planId ?? '000000000000']);
    const out = call(argv);
    if (argv[0] !== 'plan') return out;
    const i = out.findIndex((l) => l.startsWith('plan: '));
    w.planId = i < 0 ? undefined : out[i].slice(6);
    return out.filter((_, k) => k !== i);
  };
  return w;
}

// Mirrors the host: defaults as the fixture, config as each list or the defaults with each $defaults replaced.
function stand(w, args, d) {
  w.calls.push(`${args.join(' ')} @ ${d === w.config ? 'real' : d === undefined ? 'default' : 'temp'}`);
  const s = w.stand;
  if (s.throws) throw s.throws;
  const base = 'defaults' in s ? s.defaults : structuredClone(FIX);
  if (args[1] === 'defaults') return base;
  const file = existsSync(join(d, 'settings.json')) ? readFileSync(join(d, 'settings.json'), 'utf8') : '{}';
  if (d !== w.config) { w.temps.push(d); w.seen.push(file); }
  const mode = JSON.parse(file.replace(/^\uFEFF/, '')).autoMode ?? {};
  const out = {};
  for (const k of ['environment', 'allow', 'soft_deny', 'hard_deny']) {
    let list = mode[k] === undefined ? base[k] : mode[k].flatMap((e) => (e === '$defaults' ? base[k] : [e]));
    list = [...list, ...(s.extra?.[k] ?? [])];
    if (s.drop && (!s.drop.real || d === w.config)) list = list.filter((e) => !e.startsWith(s.drop.prefix));
    out[k] = list;
  }
  return out;
}

function repo(w, name, remotes = []) {
  const path = join(w.dir, 'src', name);
  mkdirSync(path, { recursive: true });
  const g = (...a) => execFileSync('git', ['-c', 'init.defaultBranch=main', '-c', 'maintenance.auto=false', '-c', 'gc.auto=0', '-C', path, ...a], { env: w.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  g('init', '-q');
  remotes.forEach((url, i) => g('remote', 'add', `r${i}`, url));
  return { path, g, top: g('rev-parse', '--show-toplevel').trim().replace(/\\/g, '/') };
}

// plan then apply, one second apart so each apply names its own backup.
function change(w, ...args) {
  const plan = w.run('plan', ...args);
  w.now = new Date(w.now.getTime() + 1000);
  return { plan, done: w.run('apply') };
}

const read = (p) => readFileSync(p, 'utf8');
const refusal = (message) => (e) => e instanceof Refusal && e.message === message;
const noCall = (w, argv, message) => {
  assert.throws(() => w.run(...argv), refusal(message));
  assert.deepEqual(w.calls, []);
};

test('the fixture holds the default lines the expected texts below are written against', () => {
  assert.deepEqual(FIX.environment, [ORG, VIS, TRUSTED, SOURCE, DOMAINS]);
  assert.deepEqual(FIX.allow, DEFAULT_ALLOW);
});

test('R334: the script is at most 700 lines, ASCII, and imports only node: modules', () => {
  const text = readFileSync(SCRIPT, 'utf8');
  assert.ok(text.split('\n').length - 1 <= 700);
  assert.ok(/^[\x00-\x7f]*$/.test(text));
  const specs = [...text.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
  assert.ok(specs.length > 0);
  assert.ok(specs.every((s) => s.startsWith('node:')));
  assert.equal(/\bimport\(|require\(/.test(text), false);
});

test('R340: remote normalization drops scheme, user, password, port and .git, and leaves local paths out', () => {
  const table = [
    ['https://user:token@github.com:443/org/app.git', 'github.com/org/app'],
    ['http://example.invalid/org/app', 'example.invalid/org/app'],
    ['ssh://git@host.example.invalid:22/org/app.git', 'host.example.invalid/org/app'],
    ['git@github.com:org/app.git', 'github.com/org/app'],
    ['git@ssh.dev.azure.com:v3/org/proj/app', 'dev.azure.com/org/proj/_git/app'],
    ['ssh://git@ssh.dev.azure.com/v3/org/proj/app', 'dev.azure.com/org/proj/_git/app'],
    ['https://org@dev.azure.com/org/proj/_git/app', 'dev.azure.com/org/proj/_git/app'],
    ['HTTPS://GitHub.COM/Org/App/', 'github.com/Org/App'],
    ['https://github.com/org/app.git/', 'github.com/org/app'],
    ['/abs/path', null],
    ['C:/x', null],
    ['C:\\x', null],
    ['../rel', null],
    ['./rel', null],
    ['rel/path', null],
    ['file:///srv/app.git', null],
    ['git@host.example.invalid:/srv/repo.git', 'host.example.invalid/srv/repo'],
    ['host.example.invalid:/srv/repo.git', 'host.example.invalid/srv/repo'],
  ];
  for (const [url, want] of table) assert.equal(normalizeRemote(url), want, url);
});

test('R335: the first add writes both files in the configuration directory, with the exact text', () => {
  const w = repoWorld();
  const { top } = w.repo;
  const t = `${TRUSTED} The user's own repositories listed under Source control are trusted the same way, at these local checkouts: ${top} (git.example.invalid/org/app). (reimagine guard)`;
  const s = `**Source control**: The trusted repo and its remote(s), and these remotes of the user's own repositories: git.example.invalid/org/app; as scoped by the Trusted repo and Repository visibility entries above. (reimagine guard)`;
  const plan = w.run('plan', '--add', w.repo.path);
  assert.deepEqual(plan, [
    `target: ${w.settings}`,
    `list: ${w.list}`,
    'state: absent',
    `repository: + ${top} (git.example.invalid/org/app)`,
    `entry: - environment: ${TRUSTED}`,
    `entry: - environment: ${SOURCE}`,
    `entry: + environment: ${t}`,
    `entry: + environment: ${s}`,
    `entry: + allow: ${A1}`,
    PLAN_CHECK,
    'change: ready',
  ]);
  assert.equal(existsSync(w.settings), false);
  w.now = new Date('2026-11-04T10:00:01Z');
  assert.deepEqual(w.run('apply'), [`guard: wrote ${w.settings}`, `guard: wrote ${w.list}`, CHECK]);
  assert.equal(read(w.settings), `{\n  "autoMode": {\n    "environment": [\n      ${j(ORG)},\n      ${j(VIS)},\n      ${j(t)},\n      ${j(s)},\n      ${j(DOMAINS)}\n    ],\n    "allow": [\n      "$defaults",\n      ${j(A1)}\n    ]\n  }\n}\n`);
  assert.equal(read(w.list), `{\n  "version": 1,\n  "repos": [\n    {\n      "path": "${top}",\n      "remotes": [\n        "${NA}"\n      ],\n      "merge": false\n    }\n  ]\n}\n`);
  assert.deepEqual(JSON.parse(read(join(w.data, 'guard-state.json'))), { written: [t, s, A1], copied: [ORG, VIS, DOMAINS], created: true });
  assert.equal(read(join(w.data, 'guard-plan.json')), '{}\n');
  assert.equal(existsSync(join(w.data, 'guard.lock')), false);
});

function repoWorld(remotes = [RA]) {
  const w = world();
  w.repo = repo(w, 'app', remotes);
  return w;
}

test('R335: with no CLAUDE_CONFIG_DIR the target and the list are in the .claude directory of the home', () => {
  const w = world({ configEnv: false });
  assert.deepEqual(w.run('status'), [`state: absent ${join(w.home, '.claude', 'settings.json')}`, `list: ${join(w.home, '.claude', 'reimagine-guard.json')} (0 repositories)`]);
  assert.deepEqual(w.calls, ['auto-mode defaults @ default']);
});

test('R341: absent: status writes nothing and reports an empty list', () => {
  const w = world();
  assert.deepEqual(w.run('status'), [`state: absent ${w.settings}`, `list: ${w.list} (0 repositories)`]);
  assert.deepEqual(w.calls, ['auto-mode defaults @ real']);
  assert.deepEqual(readdirSync(w.data), []);
  assert.deepEqual(readdirSync(w.config), []);
  assert.deepEqual(w.run('plan'), [`target: ${w.settings}`, `list: ${w.list}`, 'state: absent', 'change: none']);
  assert.equal(read(join(w.data, 'guard-plan.json')), '{}\n');
});

test('R341: current: a second plan after apply plans nothing', () => {
  const w = repoWorld();
  change(w, '--add', w.repo.path);
  assert.deepEqual(w.run('plan'), [`target: ${w.settings}`, `list: ${w.list}`, 'state: current', 'change: none']);
  assert.equal(read(join(w.data, 'guard-plan.json')), '{}\n');
  assert.deepEqual(w.run('status'), [`state: current ${w.settings}`, `list: ${w.list} (1 repositories)`]);
  assert.throws(() => w.run('apply'), refusal('there is no planned change; run /guard again'));
});

test('R341: stale: a remote that changed after the add is noted, and a plan rewrites both entries', () => {
  const w = repoWorld();
  change(w, '--add', w.repo.path);
  w.repo.g('remote', 'set-url', 'r0', 'https://git.example.invalid/org/app2.git');
  assert.deepEqual(w.run('status'), [`state: stale ${w.settings}`, `list: ${w.list} (1 repositories)`]);
  const plan = w.run('plan');
  assert.deepEqual(plan, [
    `target: ${w.settings}`,
    `list: ${w.list}`,
    'state: stale',
    `repository: ~ ${w.repo.top} (git.example.invalid/org/app2)`,
    `entry: - environment: ${trustedFor(`${w.repo.top} (${NA})`)}`,
    `entry: - environment: ${sourceFor(NA)}`,
    `entry: + environment: ${trustedFor(`${w.repo.top} (git.example.invalid/org/app2)`)}`,
    `entry: + environment: ${sourceFor('git.example.invalid/org/app2')}`,
    PLAN_CHECK,
    'change: ready',
  ]);
});

test('R341: stale: the host changing its Trusted repo text, and a copied default line it changed, are refreshed', () => {
  const w = repoWorld();
  change(w, '--add', w.repo.path);
  const org2 = '**Organization**: Example Org now keeps its code anywhere.';
  const trusted2 = '**Trusted repo**: The repository the session starts in.';
  w.stand.defaults = { ...structuredClone(FIX), environment: [org2, VIS, trusted2, SOURCE, DOMAINS] };
  const plan = w.run('plan');
  assert.deepEqual(plan.slice(2), [
    'state: stale',
    `entry: - environment: ${ORG}`,
    `entry: - environment: ${trustedFor(`${w.repo.top} (${NA})`)}`,
    `entry: + environment: ${org2}`,
    `entry: + environment: ${trusted2} The user's own repositories listed under Source control are trusted the same way, at these local checkouts: ${w.repo.top} (${NA}). (reimagine guard)`,
    PLAN_CHECK,
    'change: ready',
  ]);
  w.now = new Date('2026-11-04T10:05:00Z');
  w.run('apply');
  assert.equal(JSON.parse(read(w.settings)).autoMode.environment[0], org2);
  assert.deepEqual(JSON.parse(read(join(w.data, 'guard-state.json'))).copied, [org2, VIS, DOMAINS]);
});

test('R337: edited: a marked entry changed by hand is named and nothing is planned', () => {
  const w = repoWorld();
  change(w, '--add', w.repo.path);
  const before = read(w.settings);
  writeFileSync(w.settings, before.replace('as scoped by', 'as scoped BY'));
  const plan = w.run('plan');
  assert.deepEqual(plan, [
    `target: ${w.settings}`,
    `list: ${w.list}`,
    'state: edited; environment: "**Source control**: The trusted repo and its remote(s), and ..." was changed by hand; delete it or take off its (reimagine guard) ending, then run /guard again',
    'change: none',
  ]);
  assert.equal(read(join(w.data, 'guard-plan.json')), '{}\n');
  assert.throws(() => w.run('apply'), refusal('there is no planned change; run /guard again'));
  assert.deepEqual(w.run('status')[0], `state: edited ${w.settings}; ${plan[2].slice('state: edited; '.length)}`);
});

test('R337: edited: a marked allow entry changed by hand is named by its section', () => {
  const w = repoWorld();
  change(w, '--add', w.repo.path);
  writeFileSync(w.settings, read(w.settings).replace('pushing a branch', 'pushing any branch'));
  assert.equal(w.run('plan')[2], 'state: edited; allow: "User\'s own repositories: pushing any branch to a repository ..." was changed by hand; delete it or take off its (reimagine guard) ending, then run /guard again');
});

test('R337: edited: taking the ending off makes the line the user\'s own text, and deleting a marked entry is not an edit', () => {
  const w = repoWorld();
  change(w, '--add', w.repo.path);
  const text = read(w.settings);
  writeFileSync(w.settings, text.replace('entries above. (reimagine guard)', 'entries above.'));
  assert.equal(w.run('plan')[2], 'state: edited; environment: the Source control line holds your own text; guard leaves it alone; delete it or fold it into the list, then run /guard again');
  const source = sourceFor(NA);
  writeFileSync(w.settings, text.replace(`      ${j(source)},\n`, ''));
  const plan = w.run('plan');
  assert.deepEqual(plan.slice(2), ['state: stale', `entry: + environment: ${source}`, PLAN_CHECK, 'change: ready']);
  w.now = new Date('2026-11-04T10:30:00Z');
  w.run('apply');
  assert.deepEqual(JSON.parse(read(w.settings)).autoMode.environment, [ORG, VIS, trustedFor(`${w.repo.top} (${NA})`), DOMAINS, source]);
});

test('R337: with no state file, as after a reinstall, marked entries count as written by the script, so none is edited', () => {
  const w = repoWorld();
  change(w, '--add', w.repo.path);
  rmSync(join(w.data, 'guard-state.json'));
  assert.deepEqual(w.run('plan').slice(2), ['state: current', 'change: none']);
});

test('R337: edited: an own-text Source control line is left alone', () => {
  const w = repoWorld();
  const text = '{"autoMode":{"environment":["**Source control**: Only my fork."]}}\n';
  writeFileSync(w.settings, text);
  const plan = w.run('plan', '--add', w.repo.path);
  assert.deepEqual(plan, [
    `target: ${w.settings}`,
    `list: ${w.list}`,
    'state: edited; environment: the Source control line holds your own text; guard leaves it alone; delete it or fold it into the list, then run /guard again',
    'change: none',
  ]);
  assert.equal(read(w.settings), text);
  assert.equal(existsSync(w.list), false);
});

const MALFORMED = [
  ['not JSON', '{"autoMode": ', 'is not valid JSON'],
  ['an array', '[]\n', 'is not a JSON object'],
  ['autoMode twice', '{"autoMode":{},"a":1,"autoMode":{}}', 'holds autoMode twice'],
  ['autoMode not an object', '{"autoMode":[]}', 'autoMode in'],
  ['environment not a list', '{"autoMode":{"environment":"x"}}', 'autoMode.environment in'],
  ['allow with a number', '{"autoMode":{"allow":["a",1]}}', 'autoMode.allow in'],
];
for (const [name, text, note] of MALFORMED) {
  test(`R336: malformed: a settings file that is ${name} is reported and never written`, () => {
    const w = repoWorld();
    writeFileSync(w.settings, text);
    const plan = w.run('plan', '--add', w.repo.path);
    assert.deepEqual(plan.slice(0, 2), [`target: ${w.settings}`, `list: ${w.list}`]);
    assert.ok(plan[2].startsWith('state: malformed; ') && plan[2].includes(note), plan[2]);
    assert.equal(plan[2].includes(w.settings), true);
    assert.equal(plan.at(-1), 'change: none');
    assert.equal(read(w.settings), text);
    assert.deepEqual(w.calls, []);
    assert.throws(() => w.run('apply'), refusal('there is no planned change; run /guard again'));
  });
}

test('R341: malformed: a list file that is not a guard list', () => {
  const w = repoWorld();
  writeFileSync(w.list, '{"version":2,"repos":[]}\n');
  assert.deepEqual(w.run('status'), [`state: malformed ${w.settings}; ${w.list} is not a guard list`, `list: ${w.list} (0 repositories)`]);
  assert.deepEqual(w.run('plan', '--add', w.repo.path), [`target: ${w.settings}`, `list: ${w.list}`, `state: malformed; ${w.list} is not a guard list`, 'change: none']);
});

test('R341: managed: another scope adding entries makes guard write nothing', () => {
  const w = repoWorld();
  w.stand.extra = { allow: ['Managed rule: set by an administrator.'] };
  const plan = w.run('plan', '--add', w.repo.path);
  assert.deepEqual(plan, [
    `target: ${w.settings}`,
    `list: ${w.list}`,
    'state: managed; another settings scope adds auto mode entries, such as "Managed rule: set by an administrator."; guard writes nothing on this machine',
    'change: none',
  ]);
  assert.equal(existsSync(w.settings), false);
  assert.throws(() => w.run('apply'), refusal('there is no planned change; run /guard again'));
});

test('R341: unavailable: claude that cannot run, prints no four lists, or has no Trusted repo line', () => {
  const w = repoWorld();
  w.stand.throws = Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' });
  assert.deepEqual(w.run('status'), [`state: unavailable ${w.settings}; claude auto-mode defaults could not run (ENOENT)`, `list: ${w.list} (0 repositories)`]);
  assert.deepEqual(w.run('plan', '--add', w.repo.path), [`target: ${w.settings}`, `list: ${w.list}`, 'state: unavailable; claude auto-mode defaults could not run (ENOENT)', 'change: none']);
  w.stand.throws = null;
  w.stand.defaults = { environment: [], allow: [] };
  assert.equal(w.run('status')[0], `state: unavailable ${w.settings}; claude auto-mode defaults printed no object of the four lists`);
  w.stand.defaults = [];
  assert.equal(w.run('status')[0], `state: unavailable ${w.settings}; claude auto-mode defaults printed no object of the four lists`);
  w.stand.defaults = { ...structuredClone(FIX), environment: [ORG, VIS, TRUSTED] };
  assert.equal(w.run('status')[0], `state: unavailable ${w.settings}; the host's defaults have no Trusted repo or Source control line`);
  assert.equal(existsSync(w.settings), false);
});

test('R342: plan writes the candidate alone in a temporary configuration directory and removes it', () => {
  const w = repoWorld();
  w.run('plan', '--add', w.repo.path);
  assert.deepEqual(w.calls, ['auto-mode defaults @ real', 'auto-mode config @ temp', 'auto-mode config @ temp']);
  assert.equal(w.seen[0], '{}');
  const second = JSON.parse(w.seen[1]);
  assert.deepEqual(Object.keys(second), ['autoMode']);
  assert.deepEqual(Object.keys(second.autoMode), ['environment', 'allow']);
  assert.equal(w.temps.length, 2);
  assert.ok(w.temps.every((d) => d !== w.config && !existsSync(d)));
});

test('R342: a dry run whose effective configuration lacks a guard entry refuses and writes nothing', () => {
  const w = repoWorld();
  w.stand.drop = { prefix: "User's own repositories:" };
  assert.throws(() => w.run('plan', '--add', w.repo.path), refusal("the dry run failed: User's own repositories: pushing a branch to a repository li appears 0 times; nothing was written"));
  assert.equal(existsSync(w.settings), false);
  assert.throws(() => w.run('apply'), refusal('there is no planned change; run /guard again'));
});

test('R342: a check that fails after the write exits 1 with what is missing and the backup', () => {
  const w = repoWorld();
  writeFileSync(w.settings, '{}\n');
  w.stand.drop = { prefix: "User's own repositories", real: true };
  w.run('plan', '--add', w.repo.path);
  w.now = new Date('2026-11-04T12:34:56Z');
  const backup = `${w.settings}.reimagine-backup-20261104123456`;
  assert.throws(() => w.run('apply'), refusal(`wrote ${w.settings}, but the host's effective configuration fails the check: User's own repositories: pushing a branch to a repository li appears 0 times; the backup is ${backup}`));
  assert.equal(JSON.parse(read(w.settings)).autoMode.allow.length, 2);
  assert.equal(read(backup), '{}\n');
});

test('R342: apply names the backup from the clock and copies the original into it', () => {
  const w = repoWorld();
  const original = '{\n  "permissions": {}\n}\n';
  writeFileSync(w.settings, original);
  w.run('plan', '--add', w.repo.path);
  w.now = new Date('2026-11-04T12:34:56Z');
  const backup = `${w.settings}.reimagine-backup-20261104123456`;
  assert.deepEqual(w.run('apply'), [`guard: wrote ${w.settings}; the backup is ${backup}`, `guard: wrote ${w.list}`, CHECK]);
  assert.equal(read(backup), original);
  assert.deepEqual(readdirSync(w.config).sort(), ['reimagine-guard.json', 'settings.json', 'settings.json.reimagine-backup-20261104123456']);
});

test('R342: apply refuses when the target or the list changed after the plan', () => {
  const w = repoWorld();
  writeFileSync(w.settings, '{}\n');
  w.run('plan', '--add', w.repo.path);
  writeFileSync(w.settings, '{ }\n');
  assert.throws(() => w.run('apply'), refusal(`${w.settings} changed after the plan was shown, so nothing was written; run /guard again`));
  assert.equal(read(w.settings), '{ }\n');
  assert.equal(existsSync(w.list), false);
  w.run('plan', '--add', w.repo.path);
  writeFileSync(w.list, '{"version":1,"repos":[]}\n');
  assert.throws(() => w.run('apply'), refusal(`${w.list} changed after the plan was shown, so nothing was written; run /guard again`));
  assert.equal(read(w.settings), '{ }\n');
});

test('R342: apply refuses a target created after the plan, and a plan applied twice', () => {
  const w = repoWorld();
  w.run('plan', '--add', w.repo.path);
  writeFileSync(w.settings, '{}\n');
  assert.throws(() => w.run('apply'), refusal(`${w.settings} changed after the plan was shown, so nothing was written; run /guard again`));
  rmSync(w.settings);
  w.run('plan', '--add', w.repo.path);
  w.run('apply');
  assert.throws(() => w.run('apply'), refusal('there is no planned change; run /guard again'));
});

test('R342: an apply with a backup already named refuses before writing', () => {
  const w = repoWorld();
  writeFileSync(w.settings, '{}\n');
  w.run('plan', '--add', w.repo.path);
  writeFileSync(`${w.settings}.reimagine-backup-20261104100000`, 'x');
  assert.throws(() => w.run('apply'), refusal(`could not back up ${w.settings} to ${w.settings}.reimagine-backup-20261104100000 (EEXIST); ${w.list} was changed, ${w.settings} was not`));
  assert.equal(read(w.settings), '{}\n');
});

test('R342: an apply whose list write refuses leaves the settings file unchanged, so the next plan is not edited', () => {
  const w = world();
  const lib = repo(w, 'lib', [RB1]);
  const app = repo(w, 'app', [RA]);
  change(w, '--add', lib.path);
  const before = read(w.settings);
  w.run('plan', '--add', app.path);
  const tmp = `${w.list}.reimagine-tmp-${process.pid}`;
  mkdirSync(tmp);
  assert.throws(() => w.run('apply'), (e) => e instanceof Refusal && e.message.startsWith(`could not write ${tmp} (`));
  rmSync(tmp, { recursive: true });
  assert.equal(read(w.settings), before);
  assert.deepEqual(readdirSync(w.config).filter((f) => f.startsWith('settings.json.reimagine-backup-')), []);
  assert.deepEqual(w.run('plan').slice(2), ['state: current', 'change: none']);
});

// A plan can run three claude calls of up to 60 s each, so only a lock older than that is taken over.
function agedLock(w, seconds) {
  const lock = join(w.data, 'guard.lock');
  mkdirSync(lock);
  const at = new Date(Date.now() - seconds * 1000);
  utimesSync(lock, at, at);
  return lock;
}

test('R342: a lock 100 s old is held by a live step: plan refuses and leaves it', () => {
  const w = repoWorld();
  const lock = agedLock(w, 100);
  assert.throws(() => w.run('plan', '--add', w.repo.path), refusal(`another /guard step holds ${lock}; nothing was written; run /guard again`));
  assert.equal(existsSync(lock), true);
  assert.deepEqual(w.calls, []);
});

test('R342: a lock 300 s old is stale: plan takes it over and runs', () => {
  const w = repoWorld();
  const lock = agedLock(w, 300);
  assert.equal(w.run('plan', '--add', w.repo.path).at(-1), 'change: ready');
  assert.equal(existsSync(lock), false);
});

test('R342: the plan and state files are written readable by the owner only, whatever the old mode', { skip: process.platform === 'win32' }, () => {
  const w = repoWorld();
  const plan = join(w.data, 'guard-plan.json');
  const mode = (p) => statSync(p).mode & 0o777;
  w.run('plan', '--add', w.repo.path);
  assert.equal(mode(plan), 0o600);
  chmodSync(plan, 0o644);
  w.run('plan', '--add', w.repo.path);
  assert.equal(mode(plan), 0o600);
  w.run('apply');
  assert.equal(mode(plan), 0o600);
  assert.equal(mode(join(w.data, 'guard-state.json')), 0o600);
});

test('R342: apply writes through a symlink at its real path, and refuses a dangling one and a hard-linked file', (t) => {
  const w = repoWorld();
  const real = join(w.dir, 'real.json');
  writeFileSync(real, '{}\n');
  try { symlinkSync(real, w.settings); } catch { t.diagnostic('symlinks are not available here'); }
  if (existsSync(w.settings)) {
    change(w, '--add', w.repo.path);
    assert.equal(lstatSync(w.settings).isSymbolicLink(), true);
    assert.ok(read(real).includes('"autoMode"'));
    w.run('plan', '--clear');
    w.now = new Date('2026-11-04T11:00:00Z');
    w.run('apply');
    assert.equal(read(real), '{}\n');
    rmSync(w.settings);
    symlinkSync(join(w.dir, 'missing.json'), w.settings);
    w.run('plan', '--add', w.repo.path);
    assert.throws(() => w.run('apply'), refusal(`${w.settings} is a symbolic link that points to a missing file, so nothing was written`));
    rmSync(w.settings);
  }
  writeFileSync(real, '{}\n');
  linkSync(real, w.settings);
  w.run('plan', '--add', w.repo.path);
  assert.throws(() => w.run('apply'), refusal(`${w.settings} has multiple hard links, so nothing was written`));
  assert.equal(read(real), '{}\n');
});

test('R340: --add stores the work tree top level with forward slashes, from a subdirectory or a relative path', () => {
  const w = repoWorld();
  mkdirSync(join(w.repo.path, 'sub'));
  w.run('plan', '--add', relative(w.work, join(w.repo.path, 'sub')));
  w.run('apply');
  assert.deepEqual(JSON.parse(read(w.list)), { version: 1, repos: [{ path: w.repo.top, remotes: [NA], merge: false }] });
  assert.equal(w.repo.top.includes('\\'), false);
});

test('R340: remotes are the fetch URLs normalized, with a local-path remote and a push URL left out', () => {
  const w = repoWorld([RB2, RB1, '../elsewhere', RB1.replace('.git', '')]);
  w.repo.g('remote', 'set-url', '--push', 'r0', 'https://push.example.invalid/org/x.git');
  w.run('plan', '--add', w.repo.path);
  w.run('apply');
  assert.deepEqual(JSON.parse(read(w.list)).repos[0].remotes, [NB1, NB2]);
});

test('R340: a repository without a remote, or with only a local-path remote, is refused before any claude call', () => {
  const w = world();
  const none = repo(w, 'none');
  noCall(w, ['plan', '--add', none.path], `${none.top} has no remote; guard trusts a repository by its remotes`);
  const local = repo(w, 'local', ['../none']);
  noCall(w, ['plan', '--add', local.path], `${local.top} has no remote; guard trusts a repository by its remotes`);
  assert.equal(existsSync(w.list), false);
});

test('R340: a path outside a git work tree, and a drop of an unknown entry, are refused before any claude call', () => {
  const w = world();
  noCall(w, ['plan', '--add', w.work], `${w.work} is not inside a git work tree`);
  noCall(w, ['plan', '--add', join(w.dir, 'absent')], `${join(w.dir, 'absent')} is not inside a git work tree`);
  noCall(w, ['plan', '--drop', 'nothing'], 'nothing is not in the list');
});

test('R340: argument errors are refused before any claude call', () => {
  const w = world();
  for (const argv of [['plan', '--add'], ['plan', '--add', 'x', '--clear'], ['plan', '--add', 'x', '--drop', 'y'], ['plan', '--merge'], ['plan', '--reads'], ['plan', '--drop', 'x', '--reads'], ['plan', '--clear', '--reads'], ['plan', '--drop', 'x', '--merge'], ['plan', '--clear', '--merge'], ['plan', 'bogus'], ['plan', '--drop', '--clear']]) noCall(w, argv, FORMS);
  noCall(w, ['apply', 'x'], 'apply takes the id on the plan: line of the plan it writes');
  noCall(w, ['status', 'x'], 'status takes no arguments');
  noCall(w, ['list', 'x'], 'list takes no arguments');
  assert.throws(() => main(['nope', w.data], { env: w.env }), refusal('unknown command nope; use status, list, plan, apply or denials'));
  assert.throws(() => main(['plan'], { env: w.env }), refusal('the data directory argument is missing'));
});

test('R340: --add of a listed path updates it, and --merge sets merge and adds the merge entry', () => {
  const w = repoWorld();
  change(w, '--add', w.repo.path);
  const merge = mergeFor(NA);
  const { plan } = change(w, '--add', w.repo.path, '--merge');
  assert.deepEqual(plan, [`target: ${w.settings}`, `list: ${w.list}`, 'state: stale', `repository: ~ ${w.repo.top} (${NA}) merge`, `entry: + allow: ${merge}`, PLAN_CHECK, 'change: ready']);
  assert.deepEqual(JSON.parse(read(w.list)).repos, [{ path: w.repo.top, remotes: [NA], merge: true }]);
  assert.deepEqual(JSON.parse(read(w.settings)).autoMode.allow, ['$defaults', A1, merge]);
  const back = w.run('plan', '--add', w.repo.path);
  assert.deepEqual(back.slice(2), ['state: stale', `repository: ~ ${w.repo.top} (${NA})`, `entry: - allow: ${merge}`, PLAN_CHECK, 'change: ready']);
});

test('R338: two repositories are sorted by path, each named with its remotes, and merge entries name merge repositories only', () => {
  const w = world();
  const lib = repo(w, 'lib', [RB1, RB2]);
  const app = repo(w, 'app', [RA]);
  change(w, '--add', lib.path, '--merge');
  change(w, '--add', app.path);
  assert.deepEqual(JSON.parse(read(w.list)).repos, [
    { path: app.top, remotes: [NA], merge: false },
    { path: lib.top, remotes: [NB1, NB2], merge: true },
  ]);
  const mode = JSON.parse(read(w.settings)).autoMode;
  assert.deepEqual(mode.environment, [
    ORG, VIS,
    trustedFor(`${app.top} (${NA}); ${lib.top} (${NB1}, ${NB2})`),
    sourceFor(`${NA}, ${NB1}, ${NB2}`),
    DOMAINS,
  ]);
  assert.deepEqual(mode.allow, ['$defaults', A1, mergeFor(`${NB1}, ${NB2}`)]);
  assert.deepEqual(w.run('list'), [`${app.top} ${NA}`, `${lib.top} ${NB1},${NB2} merge`]);
});

test('R340: --drop takes a path, or a remote written as a URL, and the last drop removes every guard entry and the list', () => {
  const w = world();
  const lib = repo(w, 'lib', [RB1]);
  const app = repo(w, 'app', [RA]);
  change(w, '--add', lib.path);
  change(w, '--add', app.path);
  const { plan } = change(w, '--drop', lib.path);
  assert.deepEqual(plan.slice(2, 4), ['state: stale', `repository: - ${lib.top} (${NB1})`]);
  assert.deepEqual(w.run('list'), [`${app.top} ${NA}`]);
  const last = change(w, '--drop', RA);
  assert.equal(last.plan[3], `repository: - ${app.top} (${NA})`);
  assert.deepEqual(last.done, [`guard: removed ${w.settings}`, `guard: removed ${w.list}`, CHECK]);
});

test('R340: --drop takes the host/path form that list prints', () => {
  const w = repoWorld();
  change(w, '--add', w.repo.path);
  assert.deepEqual(w.run('list'), [`${w.repo.top} ${NA}`]);
  const { plan } = change(w, '--drop', NA);
  assert.equal(plan[3], `repository: - ${w.repo.top} (${NA})`);
  assert.deepEqual(w.run('list'), ['list: no repositories']);
});

test('R340: --drop takes a path inside a listed checkout', () => {
  const w = repoWorld();
  change(w, '--add', w.repo.path);
  const sub = join(w.repo.path, 'sub');
  mkdirSync(sub);
  const { plan } = change(w, '--drop', sub);
  assert.equal(plan[3], `repository: - ${w.repo.top} (${NA})`);
  assert.deepEqual(w.run('list'), ['list: no repositories']);
});

test('R340: --drop compares paths case-insensitively on win32 only', () => {
  const w = world();
  const gone = join(w.dir, 'gone').replace(/\\/g, '/');
  writeFileSync(w.list, `{"version":1,"repos":[{"path":"${gone}","remotes":["${NA}"],"merge":false}]}\n`);
  w.platform = 'linux';
  assert.throws(() => w.run('plan', '--drop', gone.toUpperCase()), refusal(`${gone.toUpperCase()} is not in the list`));
  w.platform = 'win32';
  const plan = w.run('plan', '--drop', gone.toUpperCase());
  assert.ok(plan.includes(`repository: - ${gone} (${NA})`), plan.join('\n'));
});

test('R340: --clear removes every repository, and a missing list path is noted with its remotes kept', () => {
  const w = world();
  const gone = join(w.dir, 'gone').replace(/\\/g, '/');
  writeFileSync(w.list, `{"version":1,"repos":[{"path":"${gone}","remotes":["${NA}"],"merge":false}]}\n`);
  const plan = w.run('plan');
  assert.deepEqual(plan.slice(0, 5), [`target: ${w.settings}`, `list: ${w.list}`, 'state: stale', `note: ${gone} does not exist on this machine; its recorded remotes are kept`, `entry: - environment: ${TRUSTED}`]);
  assert.equal(plan.some((l) => l.startsWith('repository:')), false);
  change(w, '--clear');
  assert.equal(existsSync(w.list), false);
  assert.equal(existsSync(w.settings), false);
});

test('R340: a listed path that cannot be read is noted with its remotes kept, not reported as an unexpected error', { skip: process.platform === 'win32' || process.getuid?.() === 0 }, () => {
  const w = world();
  const locked = join(w.dir, 'locked');
  mkdirSync(locked);
  writeFileSync(w.list, `{"version":1,"repos":[{"path":"${locked}/app","remotes":["${NA}"],"merge":false}]}\n`);
  chmodSync(locked, 0o000);
  try {
    const plan = w.run('plan');
    assert.ok(plan.includes(`note: ${locked}/app has no readable remote now; its recorded remotes are kept`), plan.join('\n'));
    assert.equal(plan.at(-1), 'change: ready');
  } finally { chmodSync(locked, 0o755); }
});

test('R335: list prints one line per repository, and an empty list says so, without running claude', () => {
  const w = repoWorld([RA, RB1]);
  assert.deepEqual(w.run('list'), ['list: no repositories']);
  change(w, '--add', w.repo.path, '--merge');
  assert.deepEqual(w.run('list'), [`${w.repo.top} ${NA},${NB1} merge`]);
  assert.equal(w.calls.filter((c) => c.startsWith('auto-mode defaults')).length, 2);
});

test('R336: other keys of the file and of autoMode keep their values and place, and the user\'s own environment lines stay', () => {
  const w = repoWorld();
  const tail = ',\n  "permissions": {\n    "deny": ["Bash(rm:*)"]\n  }\n}\n';
  writeFileSync(w.settings, `{\n  "autoMode": {\n    "soft_deny": ["Keep: never push."],\n    "classifyAllShell": true,\n    "environment": ["**Organization**: Mine.", "A line with no label"]\n  }${tail}`);
  const { plan } = change(w, '--add', w.repo.path);
  const t = trustedFor(`${w.repo.top} (${NA})`), s = sourceFor(NA);
  assert.deepEqual(plan.slice(2), ['state: absent', `repository: + ${w.repo.top} (${NA})`, `entry: + environment: ${t}`, `entry: + environment: ${s}`, `entry: + allow: ${A1}`, PLAN_CHECK, 'change: ready']);
  const text = read(w.settings);
  assert.ok(text.endsWith(tail));
  const doc = JSON.parse(text);
  assert.deepEqual(Object.keys(doc), ['autoMode', 'permissions']);
  assert.deepEqual(Object.keys(doc.autoMode), ['soft_deny', 'classifyAllShell', 'environment', 'allow']);
  assert.deepEqual(doc.autoMode.soft_deny, ['Keep: never push.']);
  assert.equal(doc.autoMode.classifyAllShell, true);
  assert.deepEqual(doc.autoMode.environment, ['**Organization**: Mine.', 'A line with no label', t, s]);
  assert.deepEqual(doc.autoMode.allow, ['$defaults', A1]);
  change(w, '--clear');
  const back = JSON.parse(read(w.settings));
  assert.deepEqual(back.autoMode, { soft_deny: ['Keep: never push.'], classifyAllShell: true, environment: ['**Organization**: Mine.', 'A line with no label', TRUSTED, SOURCE] });
  assert.deepEqual(back.permissions, { deny: ['Bash(rm:*)'] });
});

test('R338: $defaults expands to the host lines except a default whose label the user\'s own line has', () => {
  const w = repoWorld();
  writeFileSync(w.settings, '{"autoMode":{"environment":["$defaults","**Organization**: Our own organization text."]}}\n');
  w.run('plan', '--add', w.repo.path);
  w.run('apply');
  assert.deepEqual(JSON.parse(read(w.settings)).autoMode.environment, [VIS, trustedFor(`${w.repo.top} (${NA})`), sourceFor(NA), DOMAINS, '**Organization**: Our own organization text.']);
  assert.equal(JSON.parse(read(w.settings)).autoMode.environment.includes('$defaults'), false);
});

test('R338: a line that copies an earlier default text takes the current text of its label, and only when the state records it', () => {
  const old = '**Organization**: Old Org text.';
  for (const copied of [[old], []]) {
    const w = repoWorld();
    writeFileSync(w.settings, `{"autoMode":{"environment":["$defaults",${j(old)}]}}\n`);
    writeFileSync(join(w.data, 'guard-state.json'), j({ written: [], copied, created: false }));
    w.run('plan', '--add', w.repo.path);
    w.run('apply');
    const env = JSON.parse(read(w.settings)).autoMode.environment;
    if (copied.length) {
      assert.deepEqual(env, [VIS, trustedFor(`${w.repo.top} (${NA})`), sourceFor(NA), DOMAINS, ORG]);
      assert.deepEqual(JSON.parse(read(join(w.data, 'guard-state.json'))).copied, [VIS, DOMAINS, ORG]);
    } else {
      assert.deepEqual(env, [VIS, trustedFor(`${w.repo.top} (${NA})`), sourceFor(NA), DOMAINS, old]);
      assert.deepEqual(JSON.parse(read(join(w.data, 'guard-state.json'))).copied, [VIS, DOMAINS]);
    }
  }
});

test('R338: a default line the host adds after the first write is appended, when the state records copied lines', () => {
  const w = repoWorld();
  change(w, '--add', w.repo.path);
  const farm = '**Build farm**: Builds run on shared hosts.';
  w.stand.defaults = { ...structuredClone(FIX), environment: [...FIX.environment, farm] };
  const plan = w.run('plan');
  assert.deepEqual(plan.slice(2), ['state: stale', `entry: + environment: ${farm}`, PLAN_CHECK, 'change: ready']);
  w.now = new Date('2026-11-04T10:05:00Z');
  w.run('apply');
  assert.deepEqual(JSON.parse(read(w.settings)).autoMode.environment, [ORG, VIS, trustedFor(`${w.repo.top} (${NA})`), sourceFor(NA), DOMAINS, farm]);
  assert.deepEqual(w.run('plan').slice(2), ['state: current', 'change: none']);
});

test('R336: clearing puts $defaults back in place of the default lines guard copied, and the user\'s lines stay', () => {
  const w = repoWorld();
  const original = '{"autoMode":{"environment":["$defaults","**Team**: Mine."]}}\n';
  writeFileSync(w.settings, original);
  change(w, '--add', w.repo.path);
  change(w, '--clear');
  assert.equal(read(w.settings), original);
});

test('R337: clearing drops a marked line whose label the user\'s own line holds, instead of duplicating the label', () => {
  const w = repoWorld();
  change(w, '--add', w.repo.path);
  const mine = '**Source control**: only my fork.';
  const doc = JSON.parse(read(w.settings));
  doc.autoMode.environment.push(mine);
  writeFileSync(w.settings, j(doc));
  const plan = w.run('plan', '--clear');
  assert.equal(plan.at(-1), 'change: ready');
  w.now = new Date('2026-11-04T10:05:00Z');
  w.run('apply');
  assert.deepEqual(JSON.parse(read(w.settings)).autoMode.environment, [ORG, VIS, TRUSTED, DOMAINS, mine]);
});

test('R339: an allow of [] stays [], and an allow left as ["$defaults"] is removed', () => {
  const w = repoWorld();
  writeFileSync(w.settings, '{"autoMode":{"allow":[]}}\n');
  change(w, '--add', w.repo.path);
  assert.deepEqual(JSON.parse(read(w.settings)).autoMode.allow, [A1]);
  change(w, '--clear');
  assert.deepEqual(JSON.parse(read(w.settings)), { autoMode: { allow: [] } });
  const v = repoWorld();
  writeFileSync(v.settings, '{"autoMode":{"allow":["$defaults"],"soft_deny":["Keep."]}}\n');
  change(v, '--add', v.repo.path);
  assert.deepEqual(JSON.parse(read(v.settings)).autoMode.allow, ['$defaults', A1]);
  change(v, '--clear');
  assert.deepEqual(JSON.parse(read(v.settings)), { autoMode: { soft_deny: ['Keep.'] } });
});

test('R339: the allow entries ride after the user\'s own allow entries, and a user entry is never marked', () => {
  const w = repoWorld();
  writeFileSync(w.settings, '{"autoMode":{"allow":["$defaults","Mine: allowed."]}}\n');
  change(w, '--add', w.repo.path, '--merge');
  assert.deepEqual(JSON.parse(read(w.settings)).autoMode.allow, ['$defaults', 'Mine: allowed.', A1, mergeFor(NA)]);
  change(w, '--clear');
  assert.deepEqual(JSON.parse(read(w.settings)).autoMode.allow, ['$defaults', 'Mine: allowed.']);
});

const LF = '{\n  "permissions": {\n    "allow": ["Bash(ls)"]\n  },\n  "env": {"A": "1"}\n}\n';
const RETURNS = [
  ['LF', LF, '{\n  "permissions": {\n    "allow": ["Bash(ls)"]\n  },\n  "env": {"A": "1"},\n  "autoMode": {\n    "environment": [\n'],
  ['CRLF', LF.replace(/\n/g, '\r\n'), '{\r\n  "permissions": {\r\n    "allow": ["Bash(ls)"]\r\n  },\r\n  "env": {"A": "1"},\r\n  "autoMode": {\r\n    "environment": [\r\n'],
  ['a BOM', `\uFEFF${LF}`, '\uFEFF{\n  "permissions": {\n    "allow": ["Bash(ls)"]\n  },\n  "env": {"A": "1"},\n  "autoMode": {\n    "environment": [\n'],
  ['no final newline', LF.slice(0, -1), '{\n  "permissions": {\n    "allow": ["Bash(ls)"]\n  },\n  "env": {"A": "1"},\n  "autoMode": {\n    "environment": [\n'],
  ['a one-line file', '{"permissions":{"allow":[]},"env":{"A":"1"}}\n', '{"permissions":{"allow":[]},"env":{"A":"1"},"autoMode":{"environment":['],
  ['tab indent', '{\n\t"env": {"A": "1"}\n}\n', '{\n\t"env": {"A": "1"},\n\t"autoMode": {\n\t\t"environment": [\n'],
  ['an empty object', '{}\n', '{\n  "autoMode": {\n    "environment": [\n'],
  ['an empty object without a newline', '{}', '{\n  "autoMode": {\n    "environment": [\n'],
  ['an empty CRLF object', '{}\r\n', '{\r\n  "autoMode": {\r\n    "environment": [\r\n'],
];
for (const [name, original, start] of RETURNS) {
  test(`R336: adding then clearing gives back the exact bytes of ${name}`, () => {
    const w = repoWorld();
    writeFileSync(w.settings, original);
    change(w, '--add', w.repo.path);
    const added = read(w.settings);
    assert.ok(added.startsWith(start), added);
    if (original.includes('\r\n')) assert.equal(/(?<!\r)\n/.test(added), false);
    assert.equal(JSON.parse(added.replace(/^\uFEFF/, '')).autoMode.allow.length, 2);
    change(w, '--clear');
    assert.ok(readFileSync(w.settings).equals(Buffer.from(original, 'utf8')), JSON.stringify(read(w.settings)));
    assert.equal(existsSync(w.list), false);
  });
}

test('R336: a file the script created is deleted again when nothing else is in it', () => {
  const w = repoWorld();
  change(w, '--add', w.repo.path);
  assert.equal(JSON.parse(read(join(w.data, 'guard-state.json'))).created, true);
  const { done } = change(w, '--clear');
  assert.deepEqual(done, [`guard: removed ${w.settings}`, `guard: removed ${w.list}`, CHECK]);
  assert.deepEqual(readdirSync(w.config), []);
  assert.deepEqual(JSON.parse(read(join(w.data, 'guard-state.json'))), { written: [], copied: [], created: false });
});

test('R336: a created file that gained other content is kept, as {} with the autoMode taken out', () => {
  const w = repoWorld();
  change(w, '--add', w.repo.path);
  writeFileSync(w.settings, read(w.settings).replace('  }\n}\n', '  },\n  "env": {"A": "1"}\n}\n'));
  change(w, '--clear');
  assert.equal(read(w.settings), '{\n  "env": {"A": "1"}\n}\n');
});

test('R336: an autoMode the user wrote and no guard entry is left as it is when the list is empty', () => {
  const w = repoWorld();
  const text = '{"autoMode": {  "soft_deny": ["Keep."] }}\n';
  writeFileSync(w.settings, text);
  assert.deepEqual(w.run('plan'), [`target: ${w.settings}`, `list: ${w.list}`, 'state: absent', 'change: none']);
  assert.equal(read(w.settings), text);
});

test('R335: status and list never lock or write, and a plan leaves the lock directory removed', () => {
  const w = repoWorld();
  w.run('status');
  w.run('list');
  assert.deepEqual(readdirSync(w.data), []);
  w.run('plan', '--add', w.repo.path);
  assert.deepEqual(readdirSync(w.data), ['guard-plan.json']);
});

test('R342: a refusal on the command line is one line starting guard: with exit 1, and list needs no claude', () => {
  const w = world();
  const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { env: w.env, encoding: 'utf8' });
  const refused = run('plan', w.data, '--drop', 'nothing');
  assert.equal(refused.status, 1);
  assert.equal(refused.stdout, 'guard: nothing is not in the list\n');
  const listed = run('list', w.data);
  assert.equal(listed.status, 0);
  assert.equal(listed.stdout, 'list: no repositories\n');
  const unknown = run('nope', w.data);
  assert.equal(unknown.status, 1);
  assert.equal(unknown.stdout, 'guard: unknown command nope; use status, list, plan, apply or denials\n');
});

const denied = (w, input) => main(['denied', w.data], { now: w.now, stdin: () => (typeof input === 'string' ? input : j(input)) });
const DENIALS = (w) => join(w.data, 'denials.jsonl');

test('R344: a denied Bash call appends one line with the reason, the command cut at 300 characters, the cwd and the clock\'s time', () => {
  const w = world();
  const command = `git push origin main ${'x'.repeat(400)}`;
  const input = { session_id: 's1', transcript_path: '/t.jsonl', cwd: '/work/app', permission_mode: 'auto', hook_event_name: 'PermissionDenied', tool_name: 'Bash', tool_input: { command, description: 'push' }, tool_use_id: 'u1', reason: '[Data Exfiltration] pushes to an unlisted remote' };
  assert.deepEqual(denied(w, input), []);
  assert.equal(read(DENIALS(w)), `${j({ time: '2026-11-04T10:00:00.000Z', reason: '[Data Exfiltration] pushes to an unlisted remote', tool: 'Bash', command: `git push origin main ${'x'.repeat(279)}`, cwd: '/work/app' })}\n`);
  denied(w, { ...input, tool_name: 'PowerShell', tool_input: { command: 'Get-Date' }, reason: 'second' });
  assert.equal(read(DENIALS(w)).split('\n').length, 3);
});

test('R344: a denied Write call records the path and none of the content', () => {
  const w = world();
  denied(w, { cwd: '/work/app', tool_name: 'Write', tool_input: { file_path: '/work/app/.env', content: 'SECRET=1' }, reason: '[Credential Access]' });
  denied(w, { cwd: '/work/app', tool_name: 'WebFetch', tool_input: { url: 'https://example.invalid/' }, reason: '[Data Exfiltration]' });
  assert.equal(read(DENIALS(w)), `${j({ time: '2026-11-04T10:00:00.000Z', reason: '[Credential Access]', tool: 'Write', path: '/work/app/.env', cwd: '/work/app' })}\n${j({ time: '2026-11-04T10:00:00.000Z', reason: '[Data Exfiltration]', tool: 'WebFetch', cwd: '/work/app' })}\n`);
});

test('R344: a stdin that is not JSON, or a file that cannot be written, leaves the hook silent with exit 0', () => {
  const w = world();
  assert.deepEqual(denied(w, 'not json'), []);
  assert.deepEqual(denied(w, 'null'), []);
  assert.deepEqual(readdirSync(w.data), []);
  const run = (input) => spawnSync(process.execPath, [SCRIPT, 'denied', w.data], { env: w.env, encoding: 'utf8', input });
  const text = run('not json');
  assert.equal(text.status, 0);
  assert.equal(text.stdout, '');
  assert.deepEqual(readdirSync(w.data), []);
  mkdirSync(DENIALS(w));
  const blocked = run(j({ tool_name: 'Bash', tool_input: { command: 'ls' } }));
  assert.equal(blocked.status, 0);
  assert.equal(blocked.stdout, '');
});

test('R344: denials prints the header and one line per entry, oldest first, and skips a line that is not JSON', () => {
  const w = world();
  writeFileSync(DENIALS(w), `${j({ time: '2026-11-04T09:00:00.000Z', reason: '[Data Exfiltration]', tool: 'Bash', command: 'git push\norigin', cwd: '/work/app' })}\ngarbage\n${j({ time: '2026-11-04T09:30:00.000Z', reason: '[Credential Access]', tool: 'Write', path: '/work/app/.env', cwd: '/work/app' })}\n`);
  assert.deepEqual(w.run('denials'), [
    `denials: ${DENIALS(w)} (2 recorded)`,
    '2026-11-04T09:00:00.000Z Bash [Data Exfiltration]: git push origin (/work/app)',
    '2026-11-04T09:30:00.000Z Write [Credential Access]: /work/app/.env (/work/app)',
  ]);
  assert.deepEqual(w.calls, []);
});

test('R344: denials with no file, or an empty one, prints the none line', () => {
  const w = world();
  assert.deepEqual(w.run('denials'), [`denials: none recorded in ${DENIALS(w)}`]);
  writeFileSync(DENIALS(w), '');
  assert.deepEqual(w.run('denials'), [`denials: none recorded in ${DENIALS(w)}`]);
  assert.throws(() => w.run('denials', 'extra'), refusal('denials takes no arguments'));
});

test('R342: denials refuses with one line when the denials file cannot be read', () => {
  const w = world();
  mkdirSync(DENIALS(w));
  assert.throws(() => w.run('denials'), refusal(`cannot read ${DENIALS(w)} (EISDIR)`));
  const out = spawnSync(process.execPath, [SCRIPT, 'denials', w.data], { env: w.env, encoding: 'utf8' });
  assert.equal(out.status, 1);
  assert.equal(out.stdout, `guard: cannot read ${DENIALS(w)} (EISDIR)\n`);
});

test('R344: the denials file is created readable by the owner only', { skip: process.platform === 'win32' }, () => {
  const w = world();
  denied(w, { cwd: '/work/app', tool_name: 'Bash', tool_input: { command: 'ls' }, reason: '[x]' });
  assert.equal(statSync(DENIALS(w)).mode & 0o777, 0o600);
});

const sessionStart = (w, claude = w.claude) => main(['session-start', w.data], { env: w.env, now: w.now, home: w.home, cwd: w.work, claude });

test('R341: session-start prints one systemMessage line when a copied default line differs from the host\'s now', () => {
  const w = repoWorld();
  change(w, '--add', w.repo.path);
  assert.deepEqual(sessionStart(w), []);
  w.stand.defaults = { ...structuredClone(FIX), environment: [ORG, '**Repository visibility**: Treat every repository as public.', TRUSTED, SOURCE, DOMAINS] };
  const timeouts = [];
  const lines = sessionStart(w, (args, d, timeout) => { timeouts.push(timeout); return w.claude(args, d); });
  assert.equal(lines.length, 1);
  assert.ok(lines[0].startsWith('{"systemMessage":"guard: the auto mode entries in '));
  assert.deepEqual(JSON.parse(lines[0]), { systemMessage: `guard: the auto mode entries in ${w.settings} are stale; run /guard to update them` });
  assert.deepEqual(timeouts, [20000]);
  assert.equal(w.calls.at(-1), 'auto-mode defaults @ real');
});

test('R341: session-start prints nothing and runs no claude when no one attends the session', () => {
  const w = repoWorld();
  change(w, '--add', w.repo.path);
  w.stand.defaults = { ...structuredClone(FIX), environment: [ORG, '**Repository visibility**: Treat every repository as public.', TRUSTED, SOURCE, DOMAINS] };
  const calls = [];
  const claude = (args, d, timeout) => { calls.push(args); return w.claude(args, d, timeout); };
  const start = (attended, entrypoint) => {
    const env = { ...w.env, CLAUDE_CODE_ENTRYPOINT: entrypoint };
    if (attended !== undefined) env.CLAUDE_CODE_SESSION_ATTENDED = attended;
    return main(['session-start', w.data], { env, now: w.now, home: w.home, cwd: w.work, claude });
  };
  assert.deepEqual(start('0', 'sdk-cli'), []);
  assert.deepEqual(start('0', 'claude-desktop'), []);
  assert.deepEqual(calls, []);
  const unset = start(undefined, 'sdk-cli');
  assert.equal(unset.length, 1);
  assert.deepEqual(JSON.parse(unset[0]), { systemMessage: `guard: the auto mode entries in ${w.settings} are stale; run /guard to update them` });
  assert.ok(calls.length > 0);
  calls.length = 0;
  const lines = start('1', 'cli');
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), { systemMessage: `guard: the auto mode entries in ${w.settings} are stale; run /guard to update them` });
  assert.ok(calls.length > 0);
});

test('R341: session-start uses the remotes the list records, runs no config check and writes nothing', () => {
  const w = repoWorld();
  change(w, '--add', w.repo.path);
  w.repo.g('remote', 'set-url', 'r0', 'https://git.example.invalid/org/app2.git');
  assert.equal(w.run('status')[0], `state: stale ${w.settings}`);
  w.calls.length = 0;
  const before = [read(w.settings), read(w.list), readdirSync(w.data).sort()];
  assert.deepEqual(sessionStart(w), []);
  assert.deepEqual(w.calls, ['auto-mode defaults @ real']);
  assert.deepEqual([read(w.settings), read(w.list), readdirSync(w.data).sort()], before);
});

test('R341: session-start prints nothing and runs no claude for a missing, empty or unreadable list', () => {
  const w = repoWorld();
  assert.deepEqual(sessionStart(w), []);
  writeFileSync(w.list, '{"version":1,"repos":[]}\n');
  assert.deepEqual(sessionStart(w), []);
  rmSync(w.list);
  mkdirSync(w.list);
  assert.deepEqual(sessionStart(w), []);
  assert.deepEqual(w.calls, []);
});

test('R341: session-start prints nothing when claude cannot run, and the hook exits 0', () => {
  const w = repoWorld();
  change(w, '--add', w.repo.path);
  w.stand.throws = Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' });
  assert.deepEqual(sessionStart(w), []);
  const env = { ...w.env, PATH: dirname(process.execPath) };
  const run = spawnSync(process.execPath, [SCRIPT, 'session-start', w.data], { env, encoding: 'utf8' });
  assert.equal(run.status, 0);
  assert.equal(run.stdout, '');
});

test('R342: apply writes only the plan whose id it is given, so a plan another session saved since is refused', () => {
  const w = repoWorld();
  const raw = (...argv) => main([argv[0], w.data, ...argv.slice(1)], { env: w.env, now: w.now, home: w.home, cwd: w.work, claude: w.claude });
  const shown = raw('plan', '--add', w.repo.path);
  const id = shown.at(-2).match(/^plan: ([0-9a-f]{12})$/)[1];
  assert.equal(shown.at(-1), 'change: ready');
  raw('plan', '--add', w.repo.path, '--merge');
  assert.throws(() => raw('apply', id), refusal('the saved plan is not the one this session was shown, so nothing was written; run /guard again'));
  assert.equal(existsSync(w.settings), false);
  assert.throws(() => raw('apply'), refusal('apply takes the id on the plan: line of the plan it writes'));
  assert.equal(raw('plan', '--add', w.repo.path).at(-2), `plan: ${id}`);
  const file = join(w.data, 'guard-plan.json');
  const saved = read(file);
  writeFileSync(file, saved.replace('"created": true', '"created": false'));
  assert.notEqual(read(file), saved);
  assert.throws(() => raw('apply', id), refusal('the saved plan is not the one this session was shown, so nothing was written; run /guard again'));
  writeFileSync(file, saved);
  raw('apply', id);
  assert.deepEqual(JSON.parse(read(w.settings)).autoMode.allow, ['$defaults', A1]);
});

test('R335: a denial line carries no credential its command held, and cuts the reason, the path and the cwd', () => {
  const w = world();
  denied(w, { cwd: `/work/${'d'.repeat(400)}`, tool_name: 'Bash', tool_input: { command: 'curl -H "Authorization: Bearer sk-SECRET123" -d token=abc123 https://user:pw9@host.example.invalid/x' }, reason: `[Credential Leakage] ${'r'.repeat(600)}` });
  denied(w, { cwd: '/w', tool_name: 'Write', tool_input: { file_path: `/w/${'p'.repeat(400)}` }, reason: 'x' });
  const [bash, write] = read(DENIALS(w)).trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(bash.command, 'curl -H "Authorization: Bearer [redacted]" -d token=[redacted] https://[redacted]@host.example.invalid/x');
  assert.equal(bash.reason.length, 500);
  assert.equal(bash.cwd.length, 300);
  assert.equal(write.path.length, 300);
});

test('R335: a denial line takes each credential form from a command, and leaves the words of a reason', () => {
  const w = world();
  const record = (command, reason = 'x') => {
    rmSync(DENIALS(w), { force: true });
    denied(w, { cwd: '/w', tool_name: 'Bash', tool_input: { command }, reason });
    return JSON.parse(read(DENIALS(w)));
  };
  assert.equal(record('git clone https://x-access-token:ghp_abc123@git.example.invalid/o/r').command, 'git clone https://[redacted]@git.example.invalid/o/r');
  assert.equal(record('git clone https://ghp_abc123@git.example.invalid/o/r').command, 'git clone https://[redacted]@git.example.invalid/o/r');
  assert.equal(record('curl -u x -H "X-Api-Key: abc123" --basic').command, 'curl -u x -H "X-Api-Key: [redacted]" --basic');
  assert.equal(record('GITHUB_TOKEN=ghp_abc npm publish --password=hunter2 --secret "s"').command, 'GITHUB_TOKEN=[redacted] npm publish --password=[redacted] --secret "s"');
  assert.equal(record('gh auth login --with-token ghp_abc123XYZ').command, 'gh auth login --with-token [redacted]');
  assert.equal(record('mysql --password hunter2 -u root').command, 'mysql --password hunter2 -u root');
  assert.equal(record('curl -H "Authorization: Basic dXNlcjpwdzEyMw=="').command, 'curl -H "Authorization: Basic [redacted]"');
  assert.equal(record('git clone https://user:pa@ss@git.example.invalid/o/r').command, 'git clone https://[redacted]@git.example.invalid/o/r');
  assert.equal(record('gh auth token --hostname git.example.invalid').command, 'gh auth token --hostname git.example.invalid');
  assert.equal(record(`AWS_SESSION_TOKEN=${'A'.repeat(600)}TAILSECRET aws s3 ls`).command, 'AWS_SESSION_TOKEN=[redacted] aws s3 ls');
  assert.equal(record(`curl -H "Authorization: Bearer ${'a1'.repeat(350)}TAILSECRET"`).command, 'curl -H "Authorization: Bearer [redacted]"');
  const prose = 'The command sends a token to a third party; a basic read-only check prints the token x-access-token. Keys: listed';
  assert.equal(record('ls', prose).reason, prose);
  assert.equal(record('ls', 'It ran with password=hunter2 and a bearer ghp_abc123XYZ in view').reason, 'It ran with password=[redacted] and a bearer [redacted] in view');
});

test('R335: a denial of 300,000 characters is recorded in under two seconds', () => {
  const w = world();
  const started = Date.now();
  for (const word of ['key', 'token ', 'password']) denied(w, { cwd: '/w', tool_name: 'Bash', tool_input: { command: word.repeat(100000) }, reason: word.repeat(100000) });
  assert.ok(Date.now() - started < 2000);
  assert.equal(read(DENIALS(w)).trim().split('\n').length, 3);
});

test('R335: the denial record keeps its newest 100 lines once it passes 256 KiB', () => {
  const w = world();
  const old = Array.from({ length: 300 }, (_, i) => j({ time: `old-${i + 1}`, reason: 'r'.repeat(900), tool: 'Bash', command: 'ls', cwd: '/w' }));
  writeFileSync(DENIALS(w), `${old.join('\n')}\n`);
  denied(w, { cwd: '/w', tool_name: 'Bash', tool_input: { command: 'ls' }, reason: 'new' });
  const lines = read(DENIALS(w)).trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines.length, 100);
  assert.equal(lines[0].time, 'old-202');
  assert.equal(lines.at(-1).reason, 'new');
});

test('R339: the settings reads entry is written only while a repository is listed with --reads', () => {
  const w = repoWorld();
  change(w, '--add', w.repo.path);
  assert.deepEqual(JSON.parse(read(w.settings)).autoMode.allow, ['$defaults', A1]);
  assert.deepEqual(JSON.parse(read(w.list)).repos, [{ path: w.repo.top, remotes: [NA], merge: false }]);
  const on = change(w, '--add', w.repo.path, '--reads');
  assert.deepEqual(on.plan.slice(2), ['state: stale', `repository: ~ ${w.repo.top} (${NA}) reads`, `entry: + allow: ${A2}`, PLAN_CHECK, 'change: ready']);
  assert.deepEqual(JSON.parse(read(w.settings)).autoMode.allow, ['$defaults', A1, A2]);
  assert.deepEqual(JSON.parse(read(w.list)).repos, [{ path: w.repo.top, remotes: [NA], merge: false, reads: true }]);
  assert.deepEqual(w.run('list'), [`${w.repo.top} ${NA} reads`]);
  const off = change(w, '--add', w.repo.path);
  assert.deepEqual(off.plan.slice(2), ['state: stale', `repository: ~ ${w.repo.top} (${NA})`, `entry: - allow: ${A2}`, PLAN_CHECK, 'change: ready']);
});

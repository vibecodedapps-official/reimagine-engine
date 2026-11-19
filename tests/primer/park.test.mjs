// Runs plugins/primer/scripts/park.mjs through its exported main, and once as a child process, against a configuration directory
// whose session records are written here with made-up content, and holds what it prints and writes to literals.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../../plugins/primer/scripts/park.mjs';

const SCRIPT = fileURLToPath(new URL('../../plugins/primer/scripts/park.mjs', import.meta.url));
const ONE = '11111111-2222-4333-8444-555555555555';
const TWO = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const NOON = (d) => new Date(2026, 10, d, 12);

let base, home, repo, plain, env, seq = 0;

const write = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); };
const reply = (model, effort, extra = {}) => JSON.stringify({ type: 'assistant', message: { role: 'assistant', model, content: [] }, effort, ...extra });
// A config folder under the home directory, with the records given as [id, lines, day of November 2026 it was last written].
const config = (records = []) => {
  const name = 'cfg-' + (++seq), dir = join(home, name);
  mkdirSync(join(dir, 'projects'), { recursive: true });
  for (const [id, lines, d] of records) {
    const file = join(dir, 'projects', 'C--work-app', id + '.jsonl');
    write(file, lines.join('\n') + '\n');
    utimesSync(file, NOON(d), NOON(d));
  }
  return { dir, name, file: join(dir, 'reimagine-primer', 'sessions.txt') };
};
const park = (cfg, args, { id = ONE, effort = 'high', cwd = repo, now = NOON(19) } = {}) => {
  const e = { ...env, CLAUDE_CONFIG_DIR: cfg.dir };
  if (id) e.CLAUDE_CODE_SESSION_ID = id;
  if (effort) e.CLAUDE_EFFORT = effort;
  return main(args, { env: e, home, cwd, now });
};
const refusal = (fn) => { try { fn(); } catch (e) { return e.message; } return assert.fail('no refusal'); };
// The file without its first line, which is prose for a session that finds it.
const body = (cfg) => readFileSync(cfg.file, 'utf8').split('\n').slice(1).join('\n');
const RECORD = [JSON.stringify({ type: 'user', message: { role: 'user', content: 'Start.' } }), reply('example-model-1', 'medium')];

before(() => {
  base = realpathSync.native(mkdtempSync(join(tmpdir(), 'primer-park-')));
  home = join(base, 'home');
  repo = join(base, 'app');
  plain = join(base, 'plain');
  for (const d of [home, repo, plain]) mkdirSync(d);
  const empty = join(base, 'empty.gitconfig');
  writeFileSync(empty, '');
  env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: empty, GIT_CEILING_DIRECTORIES: base, HOME: home, USERPROFILE: home };
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'CLAUDE_CONFIG_DIR', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_EFFORT']) delete env[k];
  const r = spawnSync('git', ['-c', 'init.defaultBranch=main', 'init', '-q'], { cwd: repo, env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

after(() => rmSync(base, { recursive: true, force: true }));

describe('R411: add', () => {
  test('writes the entry of the session it runs in, with the model of its last reply and the effort level the host gives', () => {
    const cfg = config([[ONE, RECORD, 16]]);
    const entry = ['2026-11-19  app  main', 'what: plan the release', "back when: the reviewer's reply", 'in: ' + repo,
      'record: under ~/' + cfg.name + ', last written 2026-11-16', 'claude --resume ' + ONE + ' --model example-model-1 --effort high'];
    assert.deepEqual(park(cfg, ['add', '--what', 'plan the release', '--when', "the reviewer's reply"]), ['primer: saved in ' + cfg.file, ...entry]);
    assert.ok(readFileSync(cfg.file, 'utf8').startsWith('Save points of parked sessions'));
    assert.equal(body(cfg), '\n' + entry.join('\n') + '\n');
  });

  test('takes the effort level from the record where the host sets no variable, and one line from text of several', () => {
    const cfg = config([[ONE, RECORD, 16]]);
    const out = park(cfg, ['add', '--what', 'plan\n the  release', '--when', 'not said'], { effort: null, cwd: plain });
    assert.deepEqual(out.slice(1), ['2026-11-19  plain', 'what: plan the release', 'back when: not said', 'in: ' + plain,
      'record: under ~/' + cfg.name + ', last written 2026-11-16', 'claude --resume ' + ONE + ' --model example-model-1 --effort medium']);
  });

  test('reads past a reply of a subagent, a reply with no model a shell takes as one word, and a line it cannot read', () => {
    const lines = [...RECORD, reply('example-model-2', 'low', { isSidechain: true }), reply('<synthetic>', undefined), reply('x; echo y', 'loud'), '{"type":"assistant","mess', '[1,2]'];
    const cfg = config([[ONE, lines, 16]]);
    assert.equal(park(cfg, ['add', '--what', 'a', '--when', 'b'], { effort: null }).at(-1), 'claude --resume ' + ONE + ' --model example-model-1 --effort medium');
  });

  test('leaves out of the command what the record does not give, and says so', () => {
    const bare = config([[ONE, ['{"type":"user"}', reply('<synthetic>', 'loud')], 16]]);
    assert.deepEqual(park(bare, ['add', '--what', 'a', '--when', 'b'], { effort: 'loud' }).slice(-2),
      ['claude --resume ' + ONE, 'primer: the command leaves out --model and --effort, which the record of this session did not give']);
    const none = config();
    assert.deepEqual(park(none, ['add', '--what', 'a', '--when', 'b']).slice(-3),
      ['record: under ~/' + none.name + ', not found on 2026-11-19', 'claude --resume ' + ONE + ' --effort high', 'primer: the command leaves out --model, which no record of this session gave']);
  });

  test('replaces the entry of the same session, sets a new one above the others and keeps a block it cannot read as an entry', () => {
    const cfg = config([[ONE, RECORD, 16], [TWO, [reply('example-model-3', 'low')], 18]]);
    park(cfg, ['add', '--what', 'first', '--when', 'a']);
    writeFileSync(cfg.file, readFileSync(cfg.file, 'utf8').replace(/\n/g, '\r\n') + '\r\nA note of my own.\r\n');
    park(cfg, ['add', '--what', 'second', '--when', 'b'], { id: TWO, effort: null, now: NOON(20) });
    park(cfg, ['add', '--what', 'first again', '--when', 'c'], { now: NOON(21) });
    assert.equal(body(cfg), ['', '2026-11-21  app  main', 'what: first again', 'back when: c', 'in: ' + repo, 'record: under ~/' + cfg.name + ', last written 2026-11-16',
      'claude --resume ' + ONE + ' --model example-model-1 --effort high', '', '2026-11-20  app  main', 'what: second', 'back when: b', 'in: ' + repo,
      'record: under ~/' + cfg.name + ', last written 2026-11-18', 'claude --resume ' + TWO + ' --model example-model-3 --effort low', '', 'A note of my own.', ''].join('\n'));
  });

  test('names the directory the session started in where the run is in a directory inside it', () => {
    const src = join(repo, 'src', 'lib'), sub = join(plain, 'sub');
    for (const d of [src, sub]) mkdirSync(d, { recursive: true });
    const started = (dir) => ['{"type":"queue-operation"}', JSON.stringify({ type: 'attachment', attachment: { cwd: plain } }), '{"type":"user","cwd', JSON.stringify({ type: 'user', cwd: dir }),
      JSON.stringify({ type: 'user', cwd: src }), reply('example-model-1', 'medium')];
    const cfg = config([[ONE, started(repo), 16], [TWO, started(plain), 16]]);
    assert.deepEqual(park(cfg, ['add', '--what', 'a', '--when', 'b'], { cwd: src }).slice(1, 5), ['2026-11-19  app  main', 'what: a', 'back when: b', 'in: ' + repo]);
    assert.deepEqual(park(cfg, ['add', '--what', 'a', '--when', 'b'], { id: TWO, cwd: sub }).slice(1, 5), ['2026-11-19  plain', 'what: a', 'back when: b', 'in: ' + plain]);
  });

  test('writes that directory as the path of the run spells it, whatever separators the record holds', () => {
    const src = join(repo, 'src'), deep = join(base, 'pl', 'ain', 'sub');
    for (const d of [src, deep]) mkdirSync(d, { recursive: true });
    const started = (cwd) => [JSON.stringify({ type: 'user', cwd }), reply('example-model-1', 'medium')];
    const at = (cwd, from) => park(config([[ONE, started(cwd), 16]]), ['add', '--what', 'a', '--when', 'b'], { cwd: from }).slice(1, 5);
    assert.deepEqual(at(repo + '//', src), ['2026-11-19  app  main', 'what: a', 'back when: b', 'in: ' + repo]);
    assert.deepEqual(at(join(base, 'pl') + '\\ain', deep), ['2026-11-19  ain', 'what: a', 'back when: b', 'in: ' + join(base, 'pl', 'ain')]);
  });

  test('keeps the directory of the run where git cannot run', () => {
    const src = join(repo, 'src');
    mkdirSync(src, { recursive: true });
    const cfg = config([[ONE, [JSON.stringify({ type: 'user', cwd: repo }), reply('example-model-1', 'medium')], 16]]);
    const bare = Object.fromEntries(Object.entries(env).filter(([k]) => k.toLowerCase() !== 'path'));
    const out = main(['add', '--what', 'a', '--when', 'b'], { env: { ...bare, PATH: '', CLAUDE_CONFIG_DIR: cfg.dir, CLAUDE_CODE_SESSION_ID: ONE }, home, cwd: src, now: NOON(19) });
    assert.deepEqual(out.slice(1, 5), ['2026-11-19  src', 'what: a', 'back when: b', 'in: ' + src]);
  });

  test('keeps the directory of the run where the record names a directory it is not inside, one of another work tree, or none', () => {
    const inner = join(repo, 'inner'), deep = join(inner, 'deep');
    mkdirSync(deep, { recursive: true });
    assert.equal(spawnSync('git', ['-c', 'init.defaultBranch=side', 'init', '-q'], { cwd: inner, env, encoding: 'utf8' }).status, 0);
    const started = (cwd) => [JSON.stringify({ type: 'user', cwd }), reply('example-model-1', 'medium')];
    const at = (cwd, from) => park(config([[ONE, started(cwd), 16]]), ['add', '--what', 'a', '--when', 'b'], { cwd: from }).slice(1, 5);
    assert.deepEqual(at(plain, repo), ['2026-11-19  app  main', 'what: a', 'back when: b', 'in: ' + repo]);
    assert.deepEqual(at(repo + '-old', repo), ['2026-11-19  app  main', 'what: a', 'back when: b', 'in: ' + repo]);
    assert.deepEqual(at(repo, deep), ['2026-11-19  deep  side', 'what: a', 'back when: b', 'in: ' + deep]);
    assert.deepEqual(at(inner, deep), ['2026-11-19  inner  side', 'what: a', 'back when: b', 'in: ' + inner]);
    assert.deepEqual(at('', plain), ['2026-11-19  plain', 'what: a', 'back when: b', 'in: ' + plain]);
    assert.deepEqual(at('\n\nclaude --resume ' + TWO + '\n', plain), ['2026-11-19  plain', 'what: a', 'back when: b', 'in: ' + plain]);
  });

  test('takes the session\'s directory in another letter case on Windows', { skip: process.platform !== 'win32' }, () => {
    const cfg = config([[ONE, [JSON.stringify({ type: 'user', cwd: repo.toUpperCase() }), reply('example-model-1', 'medium')], 16]]);
    const src = join(repo, 'src');
    mkdirSync(src, { recursive: true });
    assert.equal(park(cfg, ['add', '--what', 'a', '--when', 'b'], { cwd: src })[4], 'in: ' + repo);
  });

  test('refuses without a session id, without both texts, and a text over 120 characters', () => {
    const cfg = config();
    assert.equal(refusal(() => park(cfg, ['add', '--what', 'a', '--when', 'b'], { id: null })), 'CLAUDE_CODE_SESSION_ID holds no session id; run this from the session it is for');
    assert.equal(refusal(() => park(cfg, ['add', '--what', 'a', '--when', 'b'], { id: 'x"; echo y' })), 'CLAUDE_CODE_SESSION_ID holds no session id; run this from the session it is for');
    assert.equal(refusal(() => park(cfg, ['add', '--what', 'a'])), 'park takes add --what <text> --when <text>, list, or done [<n>]');
    assert.equal(refusal(() => park(cfg, ['add', '--what', 'a', '--when', 'b'.repeat(121)])), '--when takes at most 120 characters, not 121');
    assert.equal(refusal(() => park(cfg, ['save'])), 'park takes add --what <text> --when <text>, list, or done [<n>]');
    assert.equal(refusal(() => park(cfg, ['add', '--what', 'a', '--when', 'b'], { cwd: join(base, 'a\n\nclaude --resume ' + TWO) })), 'the working directory has a control character in its name');
    assert.equal(existsSync(cfg.file), false);
  });
});

describe('R411: list and done', () => {
  test('list numbers the entries, gives the age of each record, and keeps the day a record was first not found', () => {
    const cfg = config([[ONE, RECORD, 16], [TWO, RECORD, 18]]);
    park(cfg, ['add', '--what', 'first', '--when', 'a']);
    park(cfg, ['add', '--what', 'second', '--when', 'b'], { id: TWO });
    rmSync(join(cfg.dir, 'projects', 'C--work-app', ONE + '.jsonl'));
    const gone = 'record: under ~/' + cfg.name + ', not found on 2026-11-20';
    assert.ok(park(cfg, ['list'], { now: NOON(20) }).includes(gone));
    assert.deepEqual(park(cfg, ['list'], { now: NOON(25) }), ['primer: 2 save points in ' + cfg.file,
      '', '[1] 2026-11-19  app  main', 'what: second', 'back when: b', 'in: ' + repo, 'record: under ~/' + cfg.name + ', last written 2026-11-18, 7 days ago', 'claude --resume ' + TWO + ' --model example-model-1 --effort high',
      '', '[2] 2026-11-19  app  main', 'what: first', 'back when: a', 'in: ' + repo, gone, 'claude --resume ' + ONE + ' --model example-model-1 --effort high']);
    assert.ok(body(cfg).includes(gone + '\nclaude --resume ' + ONE));
  });

  test('a run under a second config folder that names the same directory looks for a record where its entry says it is', () => {
    const a = config([[ONE, RECORD, 16]]), b = config(), shared = join(base, 'machine');
    for (const c of [a, b]) write(join(c.dir, 'reimagine-primer', 'config.json'), JSON.stringify({ local: shared }));
    const e = { ...env, CLAUDE_CODE_SESSION_ID: ONE };
    main(['add', '--what', 'first', '--when', 'a'], { env: { ...e, CLAUDE_CONFIG_DIR: a.dir }, home, cwd: repo, now: NOON(19) });
    const out = main(['list'], { env: { ...e, CLAUDE_CONFIG_DIR: b.dir }, home, cwd: repo, now: NOON(20) });
    assert.equal(out[0], 'primer: 1 save point in ' + join(shared, 'sessions.txt'));
    assert.equal(out[6], 'record: under ~/' + a.name + ', last written 2026-11-16, 4 days ago');
  });

  test('done removes the entry of a number, or of the session it runs in, and refuses where there is none', () => {
    const cfg = config([[ONE, RECORD, 16], [TWO, RECORD, 18]]);
    park(cfg, ['add', '--what', 'first', '--when', 'a']);
    park(cfg, ['add', '--what', 'second', '--when', 'b'], { id: TWO });
    assert.equal(refusal(() => park(cfg, ['done', '3'])), 'the list has 2 save points, so none is number 3');
    assert.equal(refusal(() => park(cfg, ['done', 'first'])), 'park takes add --what <text> --when <text>, list, or done [<n>]');
    assert.deepEqual(park(cfg, ['done', '1']), ['primer: removed the save point of 2026-11-19  app  main, what: second; 1 left in ' + cfg.file]);
    assert.ok(body(cfg).includes(ONE) && !body(cfg).includes(TWO));
    assert.equal(refusal(() => park(cfg, ['done'], { id: TWO })), 'this session has no save point; done <n> removes entry n of the list');
    assert.deepEqual(park(cfg, ['done']), ['primer: removed the save point of 2026-11-19  app  main, what: first; 0 left in ' + cfg.file]);
    assert.equal(body(cfg), '');
  });

  test('two entries with no blank line between them stay two, and a byte order mark leaves one first line', () => {
    const cfg = config([[ONE, RECORD, 16], [TWO, RECORD, 18]]);
    park(cfg, ['add', '--what', 'first', '--when', 'a']);
    park(cfg, ['add', '--what', 'second', '--when', 'b'], { id: TWO });
    const joined = readFileSync(cfg.file, 'utf8').replace(TWO + ' --model example-model-1 --effort high\n\n', TWO + ' --model example-model-1 --effort high\n');
    writeFileSync(cfg.file, '\uFEFF' + joined);
    park(cfg, ['add', '--what', 'second again', '--when', 'c'], { id: TWO });
    assert.equal(readFileSync(cfg.file, 'utf8').split('Save points of parked sessions').length, 2);
    assert.equal(body(cfg), ['', '2026-11-19  app  main', 'what: second again', 'back when: c', 'in: ' + repo, 'record: under ~/' + cfg.name + ', last written 2026-11-18',
      'claude --resume ' + TWO + ' --model example-model-1 --effort high', '', '2026-11-19  app  main', 'what: first', 'back when: a', 'in: ' + repo,
      'record: under ~/' + cfg.name + ', last written 2026-11-16', 'claude --resume ' + ONE + ' --model example-model-1 --effort high', ''].join('\n'));
  });

  test('a line under the first line or right above an entry is kept and is no part of the entry, and an entry right under the first line stays', () => {
    const cfg = config([[ONE, RECORD, 16]]);
    park(cfg, ['add', '--what', 'first', '--when', 'a']);
    const head = readFileSync(cfg.file, 'utf8').split('\n')[0];
    const entry = ['2026-11-19  app  main', 'what: first', 'back when: a', 'in: ' + repo, 'record: under ~/' + cfg.name + ', last written 2026-11-16', 'claude --resume ' + ONE + ' --model example-model-1 --effort high'];
    const listed = ['primer: 1 save point in ' + cfg.file, '', '[1] 2026-11-19  app  main', 'what: first', 'back when: a', 'in: ' + repo,
      'record: under ~/' + cfg.name + ', last written 2026-11-16, 3 days ago', 'claude --resume ' + ONE + ' --model example-model-1 --effort high'];
    writeFileSync(cfg.file, [head, ...entry, ''].join('\n'));
    assert.deepEqual(park(cfg, ['list']), listed);
    assert.equal(body(cfg), ['', ...entry, ''].join('\n'));
    writeFileSync(cfg.file, [head, 'A note under the first line.', '', 'Mine: call them first.', ...entry, ''].join('\n'));
    assert.deepEqual(park(cfg, ['list']), listed);
    assert.equal(body(cfg), ['', 'A note under the first line.', '', 'Mine: call them first.', '', ...entry, ''].join('\n'));
    park(cfg, ['done', '1']);
    assert.equal(body(cfg), ['', 'A note under the first line.', '', 'Mine: call them first.', ''].join('\n'));
  });

  test('a line set by hand inside an entry stays in it, a record line of another form among them', () => {
    const cfg = config([[ONE, RECORD, 16]]);
    park(cfg, ['add', '--what', 'first', '--when', 'a']);
    const head = readFileSync(cfg.file, 'utf8').split('\n')[0], command = 'claude --resume ' + ONE + ' --model example-model-1 --effort high';
    const entry = ['2026-11-19  app  main', 'what: first', 'my own note about this one', 'back when: a', 'in: ' + repo, 'record: see the ticket', 'record: under ~/' + cfg.name + ', last written 2026-11-16', command];
    writeFileSync(cfg.file, [head, '', ...entry, ''].join('\n'));
    assert.deepEqual(park(cfg, ['list']), ['primer: 1 save point in ' + cfg.file, '', '[1] 2026-11-19  app  main', 'what: first', 'my own note about this one', 'back when: a', 'in: ' + repo, 'record: see the ticket',
      'record: under ~/' + cfg.name + ', last written 2026-11-16, 3 days ago', command]);
    assert.equal(body(cfg), ['', ...entry, ''].join('\n'));
    park(cfg, ['done', '1']);
    assert.equal(body(cfg), '');
  });

  test('a line in day form set by hand inside an entry stays in it, and done removes the whole entry', () => {
    const cfg = config([[ONE, RECORD, 16]]);
    park(cfg, ['add', '--what', 'first', '--when', 'a']);
    const head = readFileSync(cfg.file, 'utf8').split('\n')[0], command = 'claude --resume ' + ONE + ' --model example-model-1 --effort high';
    const entry = ['2026-11-19  app  main', 'what: first', '2026-12-01  follow up', 'back when: a', 'in: ' + repo, 'record: under ~/' + cfg.name + ', last written 2026-11-16', command];
    writeFileSync(cfg.file, [head, '', ...entry, ''].join('\n'));
    assert.deepEqual(park(cfg, ['list']), ['primer: 1 save point in ' + cfg.file, '', '[1] 2026-11-19  app  main', 'what: first', '2026-12-01  follow up', 'back when: a', 'in: ' + repo,
      'record: under ~/' + cfg.name + ', last written 2026-11-16, 3 days ago', command]);
    assert.equal(body(cfg), ['', ...entry, ''].join('\n'));
    park(cfg, ['done', '1']);
    assert.equal(body(cfg), '');
  });

  test('two runs at the same moment both keep their entry, and a lock a run left behind is taken over', async () => {
    const cfg = config([[ONE, RECORD, 16], [TWO, RECORD, 18]]);
    const add = (id) => new Promise((done) => spawn(process.execPath, [SCRIPT, 'add', '--what', 'a', '--when', 'b'], { cwd: repo, env: { ...env, CLAUDE_CONFIG_DIR: cfg.dir, CLAUDE_CODE_SESSION_ID: id }, stdio: 'ignore' }).on('close', done));
    for (let i = 0; i < 5; i++) {
      rmSync(cfg.file, { force: true });
      assert.deepEqual(await Promise.all([add(ONE), add(TWO)]), [0, 0]);
      assert.equal(readFileSync(cfg.file, 'utf8').split('claude --resume ').length, 3);
    }
    const lock = cfg.file + '.lock', old = new Date(Date.now() - 120000);
    writeFileSync(lock, '1');
    utimesSync(lock, old, old);
    assert.equal(park(cfg, ['list'])[0], 'primer: 2 save points in ' + cfg.file);
    assert.equal(existsSync(lock), false);
    writeFileSync(lock, '1.1');
    utimesSync(lock, old, old);
    park(cfg, ['add', '--what', 'again', '--when', 'c']);
    assert.ok(body(cfg).includes('what: again'));
    assert.equal(existsSync(lock), false);
  });

  test('a fresh lock that holds another run\'s token makes add refuse after the wait, with nothing written and the lock left', () => {
    const cfg = config([[ONE, RECORD, 16]]);
    park(cfg, ['add', '--what', 'first', '--when', 'a']);
    const before = readFileSync(cfg.file, 'utf8'), lock = cfg.file + '.lock';
    writeFileSync(lock, '1.1');
    assert.equal(refusal(() => park(cfg, ['add', '--what', 'second', '--when', 'b'])), cfg.file + ' is in use by another run; run the command again');
    assert.equal(readFileSync(cfg.file, 'utf8'), before);
    assert.equal(readFileSync(lock, 'utf8'), '1.1');
    rmSync(lock);
  });

  test('a file that cannot be read is refused and left as it is', () => {
    const cfg = config([[ONE, RECORD, 16]]);
    mkdirSync(cfg.file, { recursive: true });
    assert.match(refusal(() => park(cfg, ['list'])), /sessions\.txt cannot be read \(E[A-Z]+\)$/);
    assert.match(refusal(() => park(cfg, ['add', '--what', 'a', '--when', 'b'])), /sessions\.txt cannot be read \(E[A-Z]+\)$/);
    assert.equal(existsSync(cfg.file), true);
  });

  test('as a child process: list with no file prints one line and writes none, and a refusal exits 1', () => {
    const cfg = config();
    const run = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: repo, env: { ...env, CLAUDE_CONFIG_DIR: cfg.dir }, encoding: 'utf8' });
    const list = run(['list']);
    assert.deepEqual([list.status, list.stdout], [0, 'primer: no save point in ' + cfg.file + '\n']);
    assert.equal(existsSync(cfg.file), false);
    const add = run(['add', '--what', 'a', '--when', 'b']);
    assert.deepEqual([add.status, add.stdout], [1, 'primer: CLAUDE_CODE_SESSION_ID holds no session id; run this from the session it is for\n']);
  });
});

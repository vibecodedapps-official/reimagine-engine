// Runs plugins/gate/scripts/resume.mjs against passes.json records built here, one case per result of requirement 312.
// Every case writes its record into its own temporary directory and runs the script there; expected values are literals.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../../plugins/gate/scripts/resume.mjs', import.meta.url));
const USAGE = 'usage: node resume.mjs <passes.json> <head> <remote-head> <merge-base> <mode> | node resume.mjs <passes.json> <tip>';

const BASE = '1111111111111111111111111111111111111111'; // the merge-base the record holds
const MOVED = '2222222222222222222222222222222222222222'; // another merge-base
const H1 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; // the head pass 1 ended on
const C2 = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'; // the commit of pass 2, whose parent is H1
const OTHER = 'cccccccccccccccccccccccccccccccccccccccc'; // a commit no pass names

const NEW = '{"action":"new-sequence","level":"xhigh"}';
const NEW_AFTER_PUSH = '{"action":"new-sequence","level":"xhigh","push":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}';
const NO_FIXES_BLOCK = '{"action":"blocked","commit":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","reason":"an earlier run made the head commit and did not push it; a run with fixes pushes it"}';

let base;
before(() => {
  base = mkdtempSync(join(tmpdir(), 'gate-resume-'));
});
after(() => {
  rmSync(base, { recursive: true, force: true });
});

const pass = (n, run, status, more = {}) => ({
  n,
  run,
  level: 'high',
  status,
  started: '2026-10-25T09:00:40Z',
  ended: status === 'running' ? null : '2026-10-25T09:05:00Z',
  reviewed: null,
  reviews: [],
  findings: {},
  changes: [],
  files: [],
  commit: null,
  head: null,
  checks: [],
  next: null,
  ...more,
});
const done = (n, run, head, next = { level: 'high', rule: 'otherwise' }, more = {}) => pass(n, run, 'complete', { reviewed: head, head, next, ...more });

const record = (passes, runs = [{ n: 1, started: '2026-10-25T09:00:40Z', ended: '2026-10-25T09:40:00Z', state: 'unconverged' }]) =>
  JSON.stringify({ branch: 'feat/68-4567-export', base: 'main', merge_base: BASE, targets: ['feat/68-4567-export'], engine: 'subprocess', runs, passes });

const exec = (text, args) => {
  const dir = mkdtempSync(join(base, 'case-'));
  if (text !== null) writeFileSync(join(dir, 'passes.json'), text);
  const r = spawnSync(process.execPath, [script, ...args], { cwd: dir, encoding: 'utf8' });
  return { ...r, dir };
};

// A successful run: exit 0, nothing on stderr, this one stdout line, and nothing written beside the record.
const ok = (text, args, expected) => {
  const r = exec(text, ['passes.json', ...args]);
  assert.equal(r.stderr, '');
  assert.equal(r.stdout, expected + '\n');
  assert.equal(r.status, 0);
  assert.deepEqual(readdirSync(r.dir), ['passes.json']);
};

// A failed run: the exit code, nothing on stdout, exactly this stderr line.
const bad = (text, args, status, line) => {
  const r = exec(text, args);
  assert.deepEqual([r.status, r.stdout, r.stderr], [status, '', line + '\n']);
};

test('the same head and merge-base with every pass complete continues at the level the last pass was given', () => {
  ok(record([done(1, 1, H1)]), [H1, H1, BASE, 'fix'], '{"action":"continue","level":"high"}');
  ok(record([done(1, 1, OTHER), done(2, 1, H1, { level: 'xhigh', rule: 'wide-fix' })]), [H1, H1, BASE, 'fix'], '{"action":"continue","level":"xhigh"}');
});

test('a level that a cap stopped is continued, and a branch that is not on the remote changes nothing', () => {
  ok(record([done(1, 1, H1, { level: 'medium', rule: 'docs-only', capped: 'max-passes' })]), [H1, 'none', BASE, 'fix'], '{"action":"continue","level":"medium"}');
});

test('a record that ended in a stop ends again with that verdict', () => {
  ok(record([done(1, 1, H1, { stop: 'pass', rule: 'nothing-to-fix' })]), [H1, H1, BASE, 'fix'], '{"action":"end","stop":"pass"}');
  ok(record([done(1, 1, H1, { stop: 'pass-with-deferred', rule: 'fix-of-fix' })]), [H1, H1, BASE, 'no-fixes'], '{"action":"end","stop":"pass-with-deferred"}');
  ok(record([done(1, 1, H1, { stop: 'unconverged', rule: 'no-fixes' })]), [H1, H1, BASE, 'no-fixes'], '{"action":"end","stop":"unconverged"}');
});

test('a no-fixes stop met by a run with fixes starts a new sequence, since that pass fixed nothing', () => {
  ok(record([done(1, 1, H1, { stop: 'unconverged', rule: 'no-fixes' })]), [H1, H1, BASE, 'fix'], NEW);
  ok(record([done(1, 1, H1, { stop: 'pass', rule: 'no-fixes' })]), [H1, H1, BASE, 'fix'], NEW);
});

test('a changed merge-base starts a new sequence, and so does a new head on the same one', () => {
  ok(record([done(1, 1, H1)]), [H1, H1, MOVED, 'fix'], NEW);
  ok(record([done(1, 1, H1)]), [OTHER, OTHER, BASE, 'fix'], NEW);
  ok(record([done(1, 1, H1), pass(2, 1, 'running', { reviewed: H1 })]), [H1, H1, MOVED, 'no-fixes'], NEW);
  ok(record([done(1, 1, H1), pass(2, 1, 'running', { reviewed: H1 })]), [OTHER, OTHER, BASE, 'fix'], NEW);
});

test('a pass that is not complete, with no commit, is reviewed again at its level on the head it reviewed', () => {
  ok(record([done(1, 1, H1), pass(2, 1, 'running', { reviewed: H1 })]), [H1, H1, BASE, 'fix'], '{"action":"repeat","pass":2,"level":"high"}');
  ok(record([done(1, 1, H1), pass(2, 1, 'failed', { level: 'medium', reviewed: H1 })]), [H1, H1, BASE, 'no-fixes'], '{"action":"repeat","pass":2,"level":"medium"}');
  ok(record([pass(1, 1, 'running', { level: 'xhigh', reviewed: H1 })]), [H1, H1, BASE, 'fix'], '{"action":"repeat","pass":1,"level":"xhigh"}');
  ok(record([pass(1, 1, 'failed', { level: 'xhigh', reviewed: H1 })]), [H1, 'none', BASE, 'fix'], '{"action":"repeat","pass":1,"level":"xhigh"}');
});

test('the first pass of a new sequence is resumed on the head it reviewed, not on the head the pass before it ended on', () => {
  const stopped = done(1, 1, H1, { stop: 'pass', rule: 'nothing-to-fix' });
  ok(record([stopped, pass(2, 2, 'failed', { level: 'xhigh', reviewed: C2 })]), [C2, C2, BASE, 'fix'], '{"action":"repeat","pass":2,"level":"xhigh"}');
  ok(record([stopped, pass(2, 2, 'running', { level: 'xhigh', reviewed: C2 })]), [C2, C2, BASE, 'fix'], '{"action":"repeat","pass":2,"level":"xhigh"}');
  ok(record([stopped, pass(2, 2, 'failed', { level: 'xhigh', reviewed: C2 })]), [H1, H1, BASE, 'fix'], NEW);
});

test('a pass that an earlier run left unfinished does not keep a later one from being resumed', () => {
  const left = pass(1, 1, 'failed', { level: 'xhigh', reviewed: H1 });
  ok(record([left, pass(2, 2, 'failed', { level: 'xhigh', reviewed: H1 })]), [H1, H1, BASE, 'fix'], '{"action":"repeat","pass":2,"level":"xhigh"}');
  ok(record([done(1, 1, H1), pass(2, 1, 'running', { reviewed: H1 }), pass(3, 2, 'running', { level: 'xhigh', reviewed: OTHER })]), [OTHER, OTHER, BASE, 'fix'], '{"action":"repeat","pass":3,"level":"xhigh"}');
  ok(record([done(1, 1, H1), pass(2, 1, 'running', { reviewed: H1 }), pass(3, 2, 'running', { level: 'xhigh', reviewed: OTHER, commit: C2 })]), [C2, C2, BASE, 'fix'], '{"action":"decide","pass":3}');
  ok(record([done(1, 1, H1), pass(2, 1, 'running', { reviewed: H1 }), pass(3, 2, 'running', { level: 'xhigh', reviewed: OTHER })]), [H1, H1, BASE, 'fix'], NEW);
});

test('a pass is not resumed on a head it did not review, with or without a complete pass before it', () => {
  ok(record([pass(1, 1, 'failed', { level: 'xhigh', reviewed: H1 })]), [OTHER, OTHER, BASE, 'fix'], NEW);
  ok(record([pass(1, 1, 'running', { level: 'xhigh', reviewed: H1 })]), [OTHER, 'none', BASE, 'fix'], NEW);
  ok(record([pass(1, 1, 'running', { level: 'xhigh', reviewed: H1 })]), [H1, H1, MOVED, 'fix'], NEW);
});

test('a pass that names no head it reviewed, as an earlier version wrote it, is not resumed', () => {
  ok(record([done(1, 1, H1), pass(2, 1, 'running')]), [H1, H1, BASE, 'fix'], NEW);
  ok(record([pass(1, 1, 'failed', { level: 'xhigh' })]), [H1, H1, BASE, 'fix'], NEW);
});

test('a running pass whose commit is the head goes on at the decision, after a push when the remote is not at it', () => {
  const text = record([done(1, 1, H1), pass(2, 1, 'running', { reviewed: H1, commit: C2 })]);
  ok(text, [C2, C2, BASE, 'fix'], '{"action":"decide","pass":2}');
  ok(text, [C2, C2, BASE, 'no-fixes'], '{"action":"decide","pass":2}');
  ok(text, [C2, H1, BASE, 'fix'], '{"action":"decide","pass":2,"push":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}');
  ok(text, [C2, 'none', BASE, 'fix'], '{"action":"decide","pass":2,"push":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}');
  ok(record([pass(1, 1, 'running', { level: 'xhigh', commit: C2 })]), [C2, H1, BASE, 'fix'], '{"action":"decide","pass":1,"push":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}');
});

test('a running pass whose commit is not the head starts a new sequence', () => {
  const text = record([done(1, 1, H1), pass(2, 1, 'running', { reviewed: H1, commit: C2 })]);
  ok(text, [H1, H1, BASE, 'fix'], NEW);
  ok(text, [OTHER, OTHER, BASE, 'fix'], NEW);
  ok(record([pass(1, 1, 'running', { level: 'xhigh', reviewed: H1, commit: C2 })]), [H1, H1, BASE, 'fix'], NEW);
});

test('an unpushed commit at the head is pushed before a new sequence when the merge-base changed', () => {
  ok(record([done(1, 1, H1), pass(2, 1, 'running', { commit: C2 })]), [C2, H1, MOVED, 'fix'], NEW_AFTER_PUSH);
});

test('the kept commit of a failed pass at the head is pushed, then a new sequence starts', () => {
  const kept = pass(2, 1, 'failed', { commit: C2 });
  ok(record([done(1, 1, H1), kept]), [C2, H1, BASE, 'fix'], NEW_AFTER_PUSH);
  ok(record([done(1, 1, H1), kept]), [C2, 'none', BASE, 'fix'], NEW_AFTER_PUSH);
  ok(record([pass(1, 1, 'failed', { level: 'xhigh', commit: C2 })]), [C2, H1, BASE, 'fix'], NEW_AFTER_PUSH);
});

test('a "no fixes" run that meets an unpushed commit ends blocked, naming it', () => {
  ok(record([done(1, 1, H1), pass(2, 1, 'failed', { commit: C2 })]), [C2, H1, BASE, 'no-fixes'], NO_FIXES_BLOCK);
  ok(record([done(1, 1, H1), pass(2, 1, 'running', { commit: C2 })]), [C2, H1, BASE, 'no-fixes'], NO_FIXES_BLOCK);
  ok(record([done(1, 1, H1), pass(2, 1, 'running', { commit: C2 })]), [C2, 'none', MOVED, 'no-fixes'], NO_FIXES_BLOCK);
});

test('a kept commit that was pushed is not pushed again, and a record of kept passes alone starts a new sequence', () => {
  const runs = [{ n: 1, started: '2026-10-25T09:00:40Z', ended: '2026-10-25T09:40:00Z', state: 'blocked' }, { n: 2, started: '2026-10-25T10:00:00Z', ended: '2026-10-25T10:30:00Z', state: 'unconverged', kept: C2 }];
  ok(record([pass(1, 1, 'failed', { level: 'xhigh', commit: C2 })], runs), [C2, C2, BASE, 'fix'], NEW);
  ok(record([pass(1, 1, 'failed', { level: 'xhigh', commit: C2 })]), [C2, C2, BASE, 'no-fixes'], NEW);
  ok(record([done(1, 1, H1), pass(2, 1, 'failed', { commit: C2 })], runs), [C2, C2, BASE, 'fix'], NEW);
});

test('a failed pass that names a commit is never resumed: the passes beside it decide', () => {
  const kept = pass(2, 1, 'failed', { commit: C2 });
  ok(record([done(1, 1, H1), kept]), [H1, H1, BASE, 'fix'], '{"action":"continue","level":"high"}');
  ok(record([done(1, 1, H1, { stop: 'pass', rule: 'nothing-to-fix' }), kept]), [H1, H1, BASE, 'fix'], '{"action":"end","stop":"pass"}');
  const later = done(3, 2, C2, { stop: 'pass', rule: 'nothing-to-fix' });
  ok(record([done(1, 1, H1), kept, later]), [C2, C2, BASE, 'fix'], '{"action":"end","stop":"pass"}');
});

test('a pass that is not the last of the record is not resumed', () => {
  const runs = [{ n: 1, started: '2026-10-25T09:00:40Z', ended: '2026-10-25T09:40:00Z', state: 'unconverged' }, { n: 2, started: '2026-10-25T10:00:00Z', ended: '2026-10-25T10:30:00Z', state: 'blocked', kept: C2 }];
  ok(record([pass(1, 1, 'failed', { level: 'xhigh', reviewed: H1 }), pass(2, 2, 'failed', { reviewed: OTHER, commit: C2 })], runs), [H1, H1, BASE, 'fix'], NEW);
});

test('a head that is not the remote head and that no run left unpushed ends blocked', () => {
  const line = '{"action":"blocked","commit":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","reason":"the head is not the remote head, and no earlier run made it and left it unpushed"}';
  ok(record([done(1, 1, H1)]), [C2, H1, BASE, 'fix'], line);
  ok(record([done(1, 1, H1), pass(2, 1, 'failed')]), [C2, H1, BASE, 'no-fixes'], line);
  const runs = [{ n: 1, started: '2026-10-25T09:00:40Z', ended: '2026-10-25T09:40:00Z', state: 'blocked' }, { n: 2, started: '2026-10-25T10:00:00Z', ended: '2026-10-25T10:30:00Z', state: 'unconverged', kept: C2 }];
  ok(record([done(1, 1, H1), pass(2, 1, 'failed', { commit: C2 })], runs), [C2, H1, BASE, 'fix'], line);
  ok(record([done(1, 1, H1), pass(2, 1, 'failed', { commit: C2 }), done(3, 2, C2)]), [C2, H1, BASE, 'fix'], line);
  ok(record([done(1, 1, H1), pass(2, 1, 'running', { commit: C2, head: C2 })]), [C2, H1, BASE, 'fix'], line);
});

test('what the record cannot show is reviewed again: a complete pass with no head or no next, a record with no pass or no merge-base', () => {
  ok(record([done(1, 1, null)]), [H1, H1, BASE, 'fix'], NEW);
  ok(record([done(1, 1, H1, null)]), [H1, H1, BASE, 'fix'], NEW);
  ok(record([done(1, 1, H1, { level: 'max', rule: 'otherwise' })]), [H1, H1, BASE, 'fix'], NEW);
  ok(record([done(1, 1, H1, { stop: 'blocked', rule: 'nothing-to-fix' })]), [H1, H1, BASE, 'fix'], NEW);
  ok(record([]), [H1, H1, BASE, 'fix'], NEW);
  ok(JSON.stringify({ passes: [pass(1, 1, 'running', { level: 'xhigh' })] }), [H1, H1, BASE, 'fix'], NEW);
});

test('a record with a byte order mark is read', () => {
  ok('\ufeff' + record([done(1, 1, H1)]), [H1, H1, BASE, 'fix'], '{"action":"continue","level":"high"}');
});

test('with a tip alone it says whether an earlier run made that commit and did not push it', () => {
  const runs = [{ n: 1, started: '2026-10-25T09:00:40Z', ended: '2026-10-25T09:40:00Z', state: 'blocked' }, { n: 2, started: '2026-10-25T10:00:00Z', ended: '2026-10-25T10:30:00Z', state: 'unconverged', kept: C2 }];
  ok(record([done(1, 1, H1), pass(2, 1, 'failed', { commit: C2 })]), [C2], '{"unpushed":true}');
  ok(record([done(1, 1, H1), pass(2, 1, 'running', { commit: C2 })]), [C2], '{"unpushed":true}');
  ok(record([done(1, 1, H1), pass(2, 1, 'failed', { commit: C2 })]), [OTHER], '{"unpushed":false}');
  ok(record([done(1, 1, H1), done(2, 1, C2, { level: 'high', rule: 'otherwise' }, { commit: C2 })]), [C2], '{"unpushed":false}');
  ok(record([done(1, 1, H1), pass(2, 1, 'failed', { commit: C2 })], runs), [C2], '{"unpushed":false}');
  ok(record([done(1, 1, H1), pass(2, 1, 'failed', { commit: C2 }), done(3, 2, C2)]), [C2], '{"unpushed":false}');
  ok(record([done(1, 1, H1), pass(2, 1, 'running', { commit: C2, head: C2 })]), [C2], '{"unpushed":false}');
  ok(record([done(1, 1, H1), pass(2, 1, 'failed', { commit: C2, head: C2 })]), [C2], '{"unpushed":false}');
  ok(record([]), [C2], '{"unpushed":false}');
});

test('a record that is not one is refused with exit 1', () => {
  bad('{"passes": [', ['passes.json', H1, H1, BASE, 'fix'], 1, 'resume: passes.json: not JSON');
  bad('[]', ['passes.json', H1], 1, 'resume: passes.json: not JSON');
  bad('{"runs": []}', ['passes.json', H1, H1, BASE, 'fix'], 1, 'resume: passes.json: passes is missing or not an array');
  bad('{"runs": {}, "passes": []}', ['passes.json', H1], 1, 'resume: passes.json: runs is not an array');
  bad(record([done(2, 1, H1)]), ['passes.json', H1, H1, BASE, 'fix'], 1, 'resume: passes.json: passes[0].n is 2, not 1');
  bad(record([pass(1, 1, 'done')]), ['passes.json', H1, H1, BASE, 'fix'], 1, 'resume: passes.json: passes[0].status is "done", not running, complete or failed');
  bad(record([pass(1, 1, 'running', { level: 'max' })]), ['passes.json', H1], 1, 'resume: passes.json: passes[0].level is "max", not medium, high or xhigh');
  bad(record([null]), ['passes.json', H1], 1, 'resume: passes.json: passes[0] is not an object');
});

test('a record that cannot be read is exit 2', () => {
  bad(null, ['passes.json', H1, H1, BASE, 'fix'], 2, 'resume: cannot read passes.json');
  bad(null, ['passes.json', H1], 2, 'resume: cannot read passes.json');
});

for (const [name, args] of [
  ['no argument', []],
  ['the record alone', ['passes.json']],
  ['three arguments', ['passes.json', H1, H1]],
  ['six arguments', ['passes.json', H1, H1, BASE, 'fix', 'more']],
  ['a short sha as the head', ['passes.json', 'aaaaaaa', H1, BASE, 'fix']],
  ['a short sha as the tip', ['passes.json', 'bbbbbbb']],
  ['a remote head that is neither a sha nor none', ['passes.json', H1, 'origin/main', BASE, 'fix']],
  ['a short merge-base', ['passes.json', H1, H1, '1111111', 'fix']],
  ['a mode that is neither fix nor no-fixes', ['passes.json', H1, H1, BASE, 'no fixes']],
]) {
  test(`${name} is a usage error`, () => {
    bad(record([done(1, 1, H1)]), args, 2, USAGE);
  });
}

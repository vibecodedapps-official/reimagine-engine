#!/usr/bin/env node
// Gate resume: reads passes.json when a run finds a record that holds passes, and returns where the run starts.
// Usage: node resume.mjs <passes.json> <head> <remote-head> <merge-base> <mode>
//        node resume.mjs <passes.json> <tip>
//   <passes.json>   the completion record; nothing is written
//   <head>          the full sha of the checked-out head
//   <remote-head>   the full sha of the branch on the remote, as preflight fetched it, or `none` when it is not there
//   <merge-base>    the full sha of the merge-base preflight found
//   <mode>          `fix` or `no-fixes`
//   <tip>           the full sha of a local tip that is ahead of the remote head
// A commit is unpushed when a `failed` or `running` pass names it as its `commit`, no entry of `runs` names it as `kept`
// and no pass has it as its `head`, the head a pass ended on, since either shows it was pushed once.
// With <tip> alone the script prints {"unpushed": true|false} for that commit.
// Otherwise a `failed` pass that names a commit is left out of what follows: it is never resumed, and its commit is never
// an expected head. Of the passes left, the pending pass is the last one, when it is not `complete`. The expected head is
// the pending pass's `commit` when it has one, else its `reviewed`, the head its reviews were made on; with no pending
// pass it is the `head` of the last `complete` pass. A pending pass that names neither, as a record of an earlier version
// holds, has no expected head. The result is the first of these that holds:
//   blocked        the remote head is a commit other than <head> and <head> is not unpushed, so no run made the commit
//                  the branch is ahead by; or <head> is unpushed, the remote head is not at it and the mode is
//                  `no-fixes`, which pushes nothing
//   new-sequence   a pass at `xhigh`, when no pass can be resumed: <head> is the commit of a `failed` pass that the run
//                  pushes; no pass is left; the record's `merge_base` is not <merge-base>; <head> is not the expected
//                  head; the last `complete` pass has no `next` to go on from, or stopped by the rule `no-fixes` while
//                  the mode is `fix`; or the pending pass is not the record's last
//   end            every pass left is `complete` and the last one stopped: the run ends again with that verdict
//   continue       every pass left is `complete`: the next pass runs at the level the last one was given
//   decide         the pending pass's `commit` is <head>: its fix round is made, and the run goes on at its decision
//   repeat         the pending pass is reviewed again at its level
// A `new-sequence` or a `decide` carries "push": <head> when <head> is unpushed and the remote head is not at it: the run
// pushes that commit first.
// On success prints one JSON line on stdout and exits 0: {"action":"new-sequence","level":"xhigh"[,"push":<sha>]},
// {"action":"continue","level":<level>}, {"action":"repeat","pass":<n>,"level":<level>}, {"action":"decide","pass":<n>[,"push":<sha>]},
// {"action":"end","stop":<verdict>} or {"action":"blocked","commit":<sha>,"reason":<why>}.
// On failure prints nothing on stdout: exit 1 for a bad record, exit 2 for usage or IO, one line on stderr.
// Everything above main() is pure: it takes objects.
import { readFileSync, realpathSync } from 'node:fs';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';

export const USAGE = 'usage: node resume.mjs <passes.json> <head> <remote-head> <merge-base> <mode> | node resume.mjs <passes.json> <tip>';
export const ACTIONS = ['new-sequence', 'continue', 'repeat', 'decide', 'end', 'blocked'];
const LEVELS = ['medium', 'high', 'xhigh'];
const STATUSES = ['running', 'complete', 'failed'];
const VERDICTS = ['pass', 'pass-with-deferred', 'unconverged'];
const MODES = ['fix', 'no-fixes'];
const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

class Fail extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const show = (v) => (v === undefined ? 'missing' : JSON.stringify(v));
const list = (words) => words.slice(0, -1).join(', ') + ' or ' + words.at(-1);

// Throws the first fault of the record as a Fail; `file` is the basename the messages name.
function validate(record, file) {
  const fail = (message) => {
    throw new Fail(1, `resume: ${file}: ${message}`);
  };
  if (!Array.isArray(record.passes)) fail('passes is missing or not an array');
  if (record.runs !== undefined && !Array.isArray(record.runs)) fail('runs is not an array');
  record.passes.forEach((p, i) => {
    const at = `passes[${i}]`;
    if (!isObject(p)) fail(`${at} is not an object`);
    if (p.n !== i + 1) fail(`${at}.n is ${show(p.n)}, not ${i + 1}`);
    if (!LEVELS.includes(p.level)) fail(`${at}.level is ${show(p.level)}, not ${list(LEVELS)}`);
    if (!STATUSES.includes(p.status)) fail(`${at}.status is ${show(p.status)}, not ${list(STATUSES)}`);
  });
}

// Whether an earlier run made the commit and did not push it, for a validated record.
export function unpushed({ passes, runs = [] }, sha) {
  if (!passes.some((p) => p.status !== 'complete' && p.commit === sha)) return false;
  return !runs.some((r) => isObject(r) && r.kept === sha) && !passes.some((p) => p.head === sha);
}

// Where the run starts, for a validated record: one of the results the header lists.
export function resume(record, { head, remote, mergeBase, mode }) {
  const { passes } = record;
  const push = remote !== head && unpushed(record, head);
  if (remote !== 'none' && remote !== head && !push) {
    return { action: 'blocked', commit: head, reason: 'the head is not the remote head, and no earlier run made it and left it unpushed' };
  }
  if (push && mode === 'no-fixes') {
    return { action: 'blocked', commit: head, reason: 'an earlier run made the head commit and did not push it; a run with fixes pushes it' };
  }
  const first = (result) => (push ? { ...result, push: head } : result);
  const fresh = first({ action: 'new-sequence', level: 'xhigh' });
  const kept = (p) => p.status === 'failed' && typeof p.commit === 'string';
  if (push && passes.some((p) => kept(p) && p.commit === head)) return fresh;

  const left = passes.filter((p) => !kept(p));
  if (left.length === 0 || record.merge_base !== mergeBase) return fresh;
  const pending = left.at(-1).status === 'complete' ? null : left.at(-1);
  const done = left.findLast((p) => p.status === 'complete');
  const expected = !pending ? done.head : typeof pending.commit === 'string' ? pending.commit : pending.reviewed;
  if (expected !== head) return fresh;

  if (!pending) {
    const next = isObject(done.next) ? done.next : {};
    if (VERDICTS.includes(next.stop)) return next.rule === 'no-fixes' && mode === 'fix' ? fresh : { action: 'end', stop: next.stop };
    return LEVELS.includes(next.level) ? { action: 'continue', level: next.level } : fresh;
  }
  if (pending !== passes.at(-1)) return fresh;
  if (pending.commit === head) return first({ action: 'decide', pass: pending.n });
  return { action: 'repeat', pass: pending.n, level: pending.level };
}

function main(argv) {
  try {
    const shas = argv.length === 2 ? [argv[1]] : argv.length === 5 ? [argv[1], argv[3], ...(argv[2] === 'none' ? [] : [argv[2]])] : null;
    if (!shas || !shas.every((s) => SHA.test(s)) || (argv.length === 5 && !MODES.includes(argv[4]))) throw new Fail(2, USAGE);
    const file = basename(argv[0]);
    let text;
    try {
      text = readFileSync(argv[0], 'utf8').replace(/^\ufeff/, '');
    } catch {
      throw new Fail(2, `resume: cannot read ${argv[0]}`);
    }
    let record;
    try {
      record = JSON.parse(text);
    } catch {
      throw new Fail(1, `resume: ${file}: not JSON`);
    }
    if (!isObject(record)) throw new Fail(1, `resume: ${file}: not JSON`);
    validate(record, file);
    const result = argv.length === 2 ? { unpushed: unpushed(record, argv[1]) } : resume(record, { head: argv[1], remote: argv[2], mergeBase: argv[3], mode: argv[4] });
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (e) {
    if (!(e instanceof Fail)) throw e;
    process.stderr.write(e.message + '\n');
    process.exitCode = e.code;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main(process.argv.slice(2));

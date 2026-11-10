#!/usr/bin/env node
// Gate next: reads passes.json after a fix round and returns the next level or the stop, with the rule that produced it.
// Usage: node next.mjs <passes.json> <max-passes> [<minutes left> <minutes a pass needs>]
//   <passes.json>    the completion record; only its `passes` array is read, and nothing is written
//   <max-passes>     a whole number of 1 or more
//   <minutes left>, <minutes a pass needs>   both or neither; the run budget still unspent, any finite number, negative when the run is over
//                    budget, and the time one more pass needs, a number above 0
// The latest pass is the last entry of `passes`. Its `changes` lists the kinds of its fix round: inside-diff, outside-diff,
//   exported-signature and schema-or-migration (the last three are wide), and docs-only (every changed file is documentation;
//   a record that lists it beside exported-signature or schema-or-migration is bad). The over-quarter kind of an older record
//   is read and changes nothing. A pass's `files` lists the paths its fix round changed; an older record has none.
// Rules, first match wins:
//   nothing-to-fix     no fix finding: stop `pass`, or `pass-with-deferred` when a pass of the run deferred
//   fix-of-fix         a pass after another of its run, with at most 3 fix findings, each in a file the fix round before it
//                      changed, whose own fix round was not wide, made a commit and passed every check, of which there is
//                      at least one: stop as nothing-to-fix does, since a review found only small corrections to the last
//                      fixes and the checks cover them
//   docs-only          the fix round changed only documentation: level `medium`
//   wide-fix           a wide change kind, and no pass of the run after its first ran at `xhigh`: level `xhigh`
//   otherwise          level `high`
// A finding's file is the part of its id before the first `|`.
// A level is marked "capped": "max-passes" when the run's passes number <max-passes> or more, else "capped": "budget" when <minutes left>
// is less than <minutes a pass needs>; a stop never is.
// On success prints one JSON line on stdout, {"stop":...,"rule":...} or {"level":...,"rule":...[,"capped":"max-passes"|"budget"]}, and exits 0.
// On failure prints nothing on stdout: exit 1 for a bad record, exit 2 for usage or IO, one line on stderr.
// Everything above main() is pure: it takes objects.
import { readFileSync, realpathSync } from 'node:fs';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';

export const USAGE = 'usage: node next.mjs <passes.json> <max-passes> [<minutes-left> <minutes-a-pass-needs>]';
const LEVELS = ['medium', 'high', 'xhigh'];
const STATUSES = ['running', 'complete', 'failed'];
const BUCKETS = ['fix', 'defer', 'reject'];
const WIDE = ['exported-signature', 'schema-or-migration', 'outside-diff'];
// The kinds a fix round records now, and the one only an older record holds.
export const KINDS = ['inside-diff', ...WIDE, 'docs-only'];
const RETIRED = ['over-quarter'];
const FEW = 3;

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
    throw new Fail(1, `next: ${file}: ${message}`);
  };
  const { passes } = record;
  if (!Array.isArray(passes) || passes.length === 0) fail('passes is missing or empty');
  passes.forEach((p, i) => {
    const at = `passes[${i}]`;
    if (!isObject(p)) fail(`${at} is not an object`);
    if (p.n !== i + 1) fail(`${at}.n is ${show(p.n)}, not ${i + 1}`);
    if (!Number.isSafeInteger(p.run) || p.run < 1) fail(`${at}.run is ${show(p.run)}, not a whole number of 1 or more`);
    if (i > 0 && p.run < passes[i - 1].run) fail(`${at}.run is ${show(p.run)}, below the run of passes[${i - 1}]`);
    if (!LEVELS.includes(p.level)) fail(`${at}.level is ${show(p.level)}, not ${list(LEVELS)}`);
    if (!STATUSES.includes(p.status)) fail(`${at}.status is ${show(p.status)}, not ${list(STATUSES)}`);
    if (!isObject(p.findings)) fail(`${at}.findings is missing or not an object`);
    for (const [id, f] of Object.entries(p.findings)) {
      const bucket = isObject(f) ? f.bucket : undefined;
      if (!BUCKETS.includes(bucket)) fail(`${at}.findings[${JSON.stringify(id)}].bucket is ${show(bucket)}, not ${list(BUCKETS)}`);
    }
    if (p.files !== undefined && !(Array.isArray(p.files) && p.files.every((path) => typeof path === 'string'))) fail(`${at}.files is not a list of paths`);
  });
  const at = `passes[${passes.length - 1}]`;
  const latest = passes.at(-1);
  if (latest.status === 'failed') fail(`${at} is failed; a failed pass has no next level`);
  if (!Array.isArray(latest.changes)) fail(`${at}.changes is missing or not an array`);
  const bad = latest.changes.find((k) => !KINDS.includes(k) && !RETIRED.includes(k));
  if (bad !== undefined) fail(`${at}.changes holds ${show(bad)}, not ${list(KINDS)}`);
  const code = latest.changes.includes('docs-only') ? latest.changes.find((k) => k === 'exported-signature' || k === 'schema-or-migration') : undefined;
  if (code !== undefined) fail(`${at}.changes holds "docs-only" beside ${show(code)}, which documentation cannot be`);
}

const ids = (p, bucket) => Object.keys(p.findings).filter((id) => p.findings[id].bucket === bucket);

// Whether the latest pass found only a few corrections to the fix round before it, and its own round is covered by the checks.
function fixOfFix(latest, before) {
  if (!before || before.run !== latest.run || !Array.isArray(before.files)) return false;
  const fixes = ids(latest, 'fix');
  if (fixes.length > FEW || !fixes.every((id) => id.includes('|') && before.files.includes(id.slice(0, id.indexOf('|'))))) return false;
  if (latest.changes.some((k) => WIDE.includes(k)) || typeof latest.commit !== 'string') return false;
  if (!Array.isArray(latest.checks) || latest.checks.length === 0 || !latest.checks.every(isObject)) return false;
  // A check run again after a check fix is in the list twice; its last result is the one that counts.
  const last = new Map(latest.checks.map((c) => [c.command, c.result]));
  return [...last.values()].every((result) => result === 'pass');
}

// The result for a validated record: { stop, rule } or { level, rule[, capped] }; `time` is { left, need } or null.
export function next(passes, max, time = null) {
  const latest = passes.at(-1);
  const inRun = passes.filter((p) => p.run === latest.run);
  const stop = (rule) => ({ stop: inRun.some((p) => ids(p, 'defer').length > 0) ? 'pass-with-deferred' : 'pass', rule });

  if (ids(latest, 'fix').length === 0) return stop('nothing-to-fix');
  if (fixOfFix(latest, passes.at(-2))) return stop('fix-of-fix');

  let result = { level: 'high', rule: 'otherwise' };
  if (latest.changes.includes('docs-only')) result = { level: 'medium', rule: 'docs-only' };
  else if (latest.changes.some((k) => WIDE.includes(k)) && inRun.slice(1).every((p) => p.level !== 'xhigh')) result = { level: 'xhigh', rule: 'wide-fix' };
  if (inRun.length >= max) return { ...result, capped: 'max-passes' };
  return time && time.left < time.need ? { ...result, capped: 'budget' } : result;
}

// A finite number as Number reads it, but not an empty argument or a 0x, 0o or 0b literal; else null.
const minutes = (s) => (s.trim() !== '' && !/^0[xob]/i.test(s.trim()) && Number.isFinite(Number(s)) ? Number(s) : null);

function main(argv) {
  try {
    if ((argv.length !== 2 && argv.length !== 4) || !/^[1-9][0-9]*$/.test(argv[1]) || !Number.isSafeInteger(Number(argv[1]))) throw new Fail(2, USAGE);
    const time = argv.length === 4 ? { left: minutes(argv[2]), need: minutes(argv[3]) } : null;
    if (time && (time.left === null || time.need === null || time.need <= 0)) throw new Fail(2, USAGE);
    const file = basename(argv[0]);
    let text;
    try {
      text = readFileSync(argv[0], 'utf8').replace(/^\ufeff/, '');
    } catch {
      throw new Fail(2, `next: cannot read ${argv[0]}`);
    }
    let record;
    try {
      record = JSON.parse(text);
    } catch {
      throw new Fail(1, `next: ${file}: not JSON`);
    }
    if (!isObject(record)) throw new Fail(1, `next: ${file}: not JSON`);
    validate(record, file);
    process.stdout.write(JSON.stringify(next(record.passes, Number(argv[1]), time)) + '\n');
  } catch (e) {
    if (!(e instanceof Fail)) throw e;
    process.stderr.write(e.message + '\n');
    process.exitCode = e.code;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main(process.argv.slice(2));

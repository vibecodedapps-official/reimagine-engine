#!/usr/bin/env node
// Gate next: reads passes.json after a fix round and returns the next level or the stop, with the rule that produced it.
// Usage: node next.mjs <passes.json> <max-passes>
//   <passes.json>    the completion record; only its `passes` array is read, and nothing is written
//   <max-passes>     a whole number of 1 or more
// The latest pass is the last entry of `passes`; its `changes` lists the fix round's kinds:
//   inside-diff, exported-signature, schema-or-migration, outside-diff, over-quarter (the last four are wide).
// A reject is new unless the same finding id has bucket `reject` in any earlier pass of the record, in any run.
// Rules, first match wins:
//   nothing-to-fix     no fix finding and no new reject: stop `pass`, or `pass-with-deferred` when a pass of the run deferred
//   after-medium       the latest pass ran at `medium`: stop as nothing-to-fix when it has no fix finding, else `unconverged`
//   wide-fix           a wide change kind, and no pass of the run after its first ran at `xhigh`: level `xhigh`
//   rejects-at-high    the two latest passes both ran at `high`, each with no fix finding and a new reject: level `medium`
//   otherwise          level `high`
// A level is marked "capped": "max-passes" when the run's passes number <max-passes> or more; a stop never is.
// On success prints one JSON line on stdout, {"stop":...,"rule":...} or {"level":...,"rule":...[,"capped":"max-passes"]}, and exits 0.
// On failure prints nothing on stdout: exit 1 for a bad record, exit 2 for usage or IO, one line on stderr.
// Everything above main() is pure: it takes objects.
import { readFileSync, realpathSync } from 'node:fs';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';

export const USAGE = 'usage: node next.mjs <passes.json> <max-passes>';
const LEVELS = ['medium', 'high', 'xhigh'];
const STATUSES = ['running', 'complete', 'failed'];
const BUCKETS = ['fix', 'defer', 'reject'];
const KINDS = ['inside-diff', 'exported-signature', 'schema-or-migration', 'outside-diff', 'over-quarter'];
const WIDE = KINDS.slice(1);

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
  });
  const at = `passes[${passes.length - 1}]`;
  const latest = passes.at(-1);
  if (latest.status === 'failed') fail(`${at} is failed; a failed pass has no next level`);
  if (!Array.isArray(latest.changes)) fail(`${at}.changes is missing or not an array`);
  const bad = latest.changes.find((k) => !KINDS.includes(k));
  if (bad !== undefined) fail(`${at}.changes holds ${show(bad)}, not ${list(KINDS)}`);
}

const has = (p, bucket) => Object.values(p.findings).some((f) => f.bucket === bucket);

// Whether the pass at index k rejected an id that no earlier pass of the record rejected.
const newReject = (passes, k) =>
  Object.entries(passes[k].findings).some(([id, f]) => f.bucket === 'reject' && !passes.slice(0, k).some((q) => Object.hasOwn(q.findings, id) && q.findings[id].bucket === 'reject'));

// The result for a validated record: { stop, rule } or { level, rule[, capped] }.
export function next(passes, max) {
  const last = passes.length - 1;
  const latest = passes[last];
  const inRun = passes.filter((p) => p.run === latest.run);
  const stop = () => ({ stop: inRun.some((p) => has(p, 'defer')) ? 'pass-with-deferred' : 'pass' });
  const fixing = has(latest, 'fix');

  if (!fixing && !newReject(passes, last)) return { ...stop(), rule: 'nothing-to-fix' };
  if (latest.level === 'medium') return fixing ? { stop: 'unconverged', rule: 'after-medium' } : { ...stop(), rule: 'after-medium' };

  let result = { level: 'high', rule: 'otherwise' };
  if (latest.changes.some((k) => WIDE.includes(k)) && inRun.slice(1).every((p) => p.level !== 'xhigh')) result = { level: 'xhigh', rule: 'wide-fix' };
  else if (last > 0 && [last - 1, last].every((k) => passes[k].level === 'high' && !has(passes[k], 'fix') && newReject(passes, k))) result = { level: 'medium', rule: 'rejects-at-high' };
  return inRun.length >= max ? { ...result, capped: 'max-passes' } : result;
}

function main(argv) {
  try {
    if (argv.length !== 2 || !/^[1-9][0-9]*$/.test(argv[1]) || !Number.isSafeInteger(Number(argv[1]))) throw new Fail(2, USAGE);
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
    process.stdout.write(JSON.stringify(next(record.passes, Number(argv[1]))) + '\n');
  } catch (e) {
    if (!(e instanceof Fail)) throw e;
    process.stderr.write(e.message + '\n');
    process.exitCode = e.code;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main(process.argv.slice(2));

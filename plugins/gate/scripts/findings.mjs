#!/usr/bin/env node
// Gate findings: reads the saved reviews of one pass and merges their findings into the identity ledger.
// Usage: node findings.mjs <pass> <findings.json> <review-output>...
//   <pass>             a whole number of 1 or more
//   <findings.json>    the ledger; a path that does not exist starts as {"findings": {}}; rewritten through <findings.json>.tmp
//   <review-output>    a host result object when the name ends in .json, any other file is a stand-in reply read as text
// On success prints the pass summary as JSON on stdout and exits 0. On failure writes nothing and prints nothing on stdout:
// exit 1 for a bad review or ledger, exit 2 for usage or IO, one line per message on stderr.
// On success it also prints a warning line on stderr for each carried or regressed entry new in the latest earlier pass with no match.
// Everything above main() is pure: it takes text and objects.
import { readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';

export const USAGE = 'usage: node findings.mjs <pass> <findings.json> <review-output>...';
const FENCE = '```';

class Fail extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Lowercase; drop backticks and quotes; every run outside [a-z0-9] becomes one space; trim; cut at 120 with no trim after.
export const normalize = (summary) =>
  summary
    .toLowerCase()
    .replace(/[`'"\u2018\u2019\u201c\u201d]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .slice(0, 120);

export const identity = (file, summary) => `${file}|${normalize(summary)}`;

const isFinding = (f) =>
  isObject(f) && typeof f.file === 'string' && typeof f.summary === 'string' && f.line !== undefined && f.failure_scenario !== undefined;

// Takes the first fenced json block whose content is an array of findings (an empty one counts).
// Returns { findings, before, after } with the trimmed text on each side of the fence lines, or null.
export function parse(result) {
  const lines = result.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith(FENCE + 'json')) continue;
    let j = i + 1;
    while (j < lines.length && lines[j].trimEnd() !== FENCE) j++;
    if (j === lines.length) return null;
    let value;
    try {
      value = JSON.parse(lines.slice(i + 1, j).join('\n'));
    } catch {
      value = null;
    }
    if (Array.isArray(value) && value.every(isFinding)) {
      return { findings: value, before: lines.slice(0, i).join('\n').trim(), after: lines.slice(j + 1).join('\n').trim() };
    }
    i = j;
  }
  return null;
}

const passKeys = (entry) =>
  Object.keys(entry.passes)
    .filter((k) => /^[0-9]+$/.test(k))
    .map(Number)
    .sort((a, b) => b - a);

// The highest pass of an entry whose bucket is `bucket`, or null.
const lastIn = (entry, bucket) => {
  const k = passKeys(entry).find((key) => isObject(entry.passes[key]) && entry.passes[key].bucket === bucket);
  return k === undefined ? null : { pass: k, reason: entry.passes[k].reason };
};

const validLedger = (l) => isObject(l) && isObject(l.findings) && Object.values(l.findings).every((e) => isObject(e) && typeof e.state === 'string' && isObject(e.passes));

// What pass n records for a finding the ledger already holds, by the entry's state before the pass.
function reseen(entry, n, line) {
  const prior = entry.state;
  if (prior === 'fixed') {
    const fix = lastIn(entry, 'fix');
    entry.state = 'regressed';
    return { line, bucket: 'fix', reason: fix ? `regression: fixed in pass ${fix.pass}` : 'regression: fixed in an earlier pass', prior };
  }
  if (prior === 'rejected' || prior === 'carried') {
    const reject = lastIn(entry, 'reject');
    entry.state = 'carried';
    return { line, bucket: 'reject', reason: reject && reject.reason != null ? reject.reason : 'rejected in an earlier pass', prior };
  }
  if (prior === 'deferred') {
    const defer = lastIn(entry, 'defer');
    return { line, bucket: 'defer', reason: defer && defer.reason != null ? defer.reason : 'deferred in an earlier pass', prior };
  }
  return { line, bucket: null, reason: null, prior };
}

const CANDIDATE_STATES = ['fixed', 'rejected', 'carried', 'deferred', 'regressed'];

// The line of an entry's latest pass, or null.
const latestLine = (entry) => {
  const [k] = passKeys(entry);
  const pass = k === undefined ? undefined : entry.passes[k];
  return isObject(pass) && pass.line !== undefined ? pass.line : null;
};

// The settled entries on the same file as a new finding that pass n did not report, nearest line first, a null
// distance last, then by id.
function candidatesFor(ledger, n, file, line) {
  return Object.entries(ledger.findings)
    .filter(([, e]) => e.passes[n] === undefined && e.file === file && CANDIDATE_STATES.includes(e.state))
    .map(([otherId, e]) => {
      const at = latestLine(e);
      return { id: otherId, state: e.state, line: at, distance: Number.isInteger(line) && Number.isInteger(at) ? Math.abs(line - at) : null };
    })
    .sort((a, b) => {
      if (a.distance !== b.distance) return a.distance === null ? 1 : b.distance === null ? -1 : a.distance - b.distance;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

// A warning line, in id order, for each carried or regressed entry new in the highest pass the ledger holds that has no match;
// only a match gives a new finding either state.
function unmatched(ledger) {
  const latest = Math.max(0, ...Object.values(ledger.findings).flatMap(passKeys));
  return Object.entries(ledger.findings)
    .filter(([, e]) => latest >= 1 && e.first_pass === latest && (e.state === 'carried' || e.state === 'regressed') && !isObject(e.match))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, e]) => `findings: warning: ${id} is ${e.state} with no match; write the match of Step 1.6`);
}

const read = (path, optional) => {
  try {
    return readFileSync(path, 'utf8').replace(/^\ufeff/, '');
  } catch (e) {
    if (optional && e.code === 'ENOENT') return null;
    throw new Fail(2, `findings: cannot read ${path}`);
  }
};

const count = (v) => (typeof v === 'number' ? v : null);

// Reads one review output into { review, findings }.
function readReview(path) {
  const name = basename(path);
  const raw = read(path);
  let text = raw;
  let meta = { is_error: null, duration_ms: null, total_cost_usd: null, denials: null };
  if (path.toLowerCase().endsWith('.json')) {
    let o;
    try {
      o = JSON.parse(raw);
    } catch {
      throw new Fail(1, `findings: ${name}: not JSON`);
    }
    if (!isObject(o)) throw new Fail(1, `findings: ${name}: not JSON`);
    if (o.is_error === true) throw new Fail(1, `findings: ${name}: is_error is true`);
    text = typeof o.result === 'string' ? o.result : '';
    meta = {
      is_error: false,
      duration_ms: count(o.duration_ms),
      total_cost_usd: count(o.total_cost_usd),
      denials: Array.isArray(o.permission_denials) ? o.permission_denials.length : null,
    };
  }
  const parsed = parse(text);
  if (!parsed) throw new Fail(1, `findings: ${name}: no fenced json array of findings`);
  return { name, review: { output: name, ...meta, notes: { before: parsed.before, after: parsed.after } }, findings: parsed.findings };
}

// Merges the reviews into the ledger text; returns { ledger, summary } as the text to write and print.
function ingest(argv) {
  if (argv.length < 3 || !/^[1-9][0-9]*$/.test(argv[0]) || !Number.isSafeInteger(Number(argv[0]))) throw new Fail(2, USAGE);
  const n = Number(argv[0]);
  const ledgerPath = argv[1];

  const ledgerRaw = read(ledgerPath, true);
  let ledger = { findings: {} };
  if (ledgerRaw !== null) {
    try {
      ledger = JSON.parse(ledgerRaw);
    } catch {
      throw new Fail(1, `findings: ${basename(ledgerPath)}: not JSON`);
    }
    if (!validLedger(ledger)) throw new Fail(1, `findings: ${basename(ledgerPath)}: not a findings ledger`);
  }
  const later = Math.max(0, ...Object.values(ledger.findings).flatMap(passKeys));
  if (later > n) throw new Fail(1, `findings: ${basename(ledgerPath)}: holds pass ${later}, later than ${n}`);

  const reviews = [];
  const found = new Map();
  for (const path of argv.slice(2)) {
    const { name, review, findings } = readReview(path);
    reviews.push(review);
    for (const f of findings) {
      const id = identity(f.file, f.summary);
      const seen = found.get(id);
      if (!seen) found.set(id, { id, file: f.file, line: f.line, summary: f.summary, failure_scenario: f.failure_scenario, outputs: [name] });
      else if (!seen.outputs.includes(name)) seen.outputs.push(name);
    }
  }

  for (const [id, entry] of Object.entries(ledger.findings)) {
    const earlier = entry.passes[n];
    if (earlier === undefined) continue;
    const prior = isObject(earlier) ? earlier.prior : null;
    if (prior === null || prior === undefined) delete ledger.findings[id];
    else {
      entry.state = prior;
      delete entry.passes[n];
    }
  }

  const warnings = unmatched(ledger);

  const findings = [];
  for (const f of found.values()) {
    let entry = ledger.findings[f.id];
    if (entry === undefined) {
      entry = { file: f.file, summary: f.summary, first_pass: n, state: 'new', passes: { [n]: { line: f.line, bucket: null, reason: null, prior: null } } };
      ledger.findings[f.id] = entry;
    } else {
      entry.passes[n] = reseen(entry, n, f.line);
    }
    const { bucket, reason } = entry.passes[n];
    findings.push({ id: f.id, file: f.file, line: f.line, summary: f.summary, failure_scenario: f.failure_scenario, outputs: f.outputs, state: entry.state, bucket, reason });
  }
  for (const finding of findings) {
    if (finding.state === 'new') finding.candidates = candidatesFor(ledger, n, finding.file, finding.line);
  }
  return { ledgerPath, ledger: JSON.stringify(ledger, null, 2) + '\n', summary: JSON.stringify({ pass: n, reviews, findings }, null, 2) + '\n', warnings };
}

function main(argv) {
  try {
    const { ledgerPath, ledger, summary, warnings } = ingest(argv);
    const tmp = ledgerPath + '.tmp';
    try {
      writeFileSync(tmp, ledger);
      renameSync(tmp, ledgerPath);
    } catch {
      rmSync(tmp, { force: true });
      throw new Fail(2, `findings: cannot write ${ledgerPath}`);
    }
    process.stdout.write(summary);
    for (const w of warnings) process.stderr.write(w + '\n');
  } catch (e) {
    if (!(e instanceof Fail)) throw e;
    process.stderr.write(e.message + '\n');
    process.exitCode = e.code;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main(process.argv.slice(2));

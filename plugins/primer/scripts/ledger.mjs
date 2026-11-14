#!/usr/bin/env node
// Primer's ledger of feedback items: <store>/ledger.jsonl, one JSON line per item. The review decides; this script records.
// Usage: node ledger.mjs                 lists the items
//   --add <log> <gap>                    a new open item, seen once in <config>/feedback/<log>
//   --seen <id> <log>                    another log states the item's gap: a held item opens again, a folded one counts a failure
//   --worked <id> <log>                  a log says the folded rule worked
//   --set <id> <status> [--place <file> [--commit <sha>]] [--by <id>]
//                                        open, held or rejected; folded at a place, with its commit when git tracks the place;
//                                        superseded by another item
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Refusal, ownOf, places, writeAtomic } from './primer.mjs';

const STATUSES = ['open', 'folded', 'rejected', 'held', 'superseded'];
const FORMS = 'ledger takes nothing, --add <log> <gap>, --seen <id> <log>, --worked <id> <log>, or --set <id> <status> '
  + 'with --place <file> [--commit <sha>] for folded and --by <id> for superseded';
const refuse = (message) => { throw new Refusal(message); };
const slash = (p) => p.replace(/\\/g, '/');

function load(path) {
  if (!existsSync(path)) return [];
  const items = readFileSync(path, 'utf8').split('\n').filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } });
  const ok = items.every((x) => x && /^L\d+$/.test(x.id) && typeof x.gap === 'string' && STATUSES.includes(x.status) && Number.isInteger(x.seen)
    && ['logs', 'failed', 'worked'].every((k) => Array.isArray(x[k]) && x[k].every((v) => typeof v === 'string')));
  return ok ? items : refuse(`${path} is not a primer ledger`);
}

const shown = (x) => `${x.id} ${x.status}${x.status === 'folded' ? ` in ${x.place}${x.commit ? ` at ${x.commit.slice(0, 12)}` : ''}` : ''}`
  + `${x.status === 'superseded' ? ` by ${x.by}` : ''}, seen ${x.seen}${x.failed.length ? `, failed ${x.failed.length}` : ''}`
  + `${x.worked.length ? `, worked ${x.worked.length}` : ''}: ${x.gap} (${x.logs.join(', ')})`;

const git = (cwd, ...args) => spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });

// Returns the output lines; a refusal throws.
export function main(argv, { env = process.env, home = homedir(), cwd = process.cwd() } = {}) {
  const c = { env, home }, p = places(c, ownOf(c)), path = join(p.store, 'ledger.jsonl'), items = load(path);
  const [op, ...args] = argv, logs = join(dirname(ownOf(c)), 'feedback');
  if (op === undefined) return [`ledger: ${path}`, ...(items.length ? items.map(shown) : ['no items'])];
  const item = (id) => items.find((x) => x.id === id) ?? refuse(`the ledger holds no item ${id}`);
  const log = (name) => (/^[^/\\]+$/.test(name) && statSync(join(logs, name), { throwIfNoEntry: false })?.isFile() ? name : refuse(`${join(logs, name)} is not a feedback log`));
  let x, sign = '~';
  if (op === '--add' && args.length === 2) {
    const gap = args[1].trim(), same = items.find((y) => y.gap.toLowerCase() === gap.toLowerCase());
    if (!gap || /[\r\n]/.test(gap)) refuse('a gap is one line of text');
    if (same) refuse(`${same.id} already states that gap; use --seen ${same.id} <log>`);
    x = { id: `L${items.reduce((n, y) => Math.max(n, Number(y.id.slice(1))), 0) + 1}`, gap, logs: [log(args[0])], status: 'open', place: null, commit: null, by: null, seen: 1, failed: [], worked: [] };
    items.push(x);
    sign = '+';
  } else if ((op === '--seen' || op === '--worked') && args.length === 2) {
    x = item(args[0]);
    const name = log(args[1]);
    if (x.status === 'superseded') refuse(`${x.id} is superseded by ${x.by}; record it there`);
    if (op === '--worked') {
      if (x.status !== 'folded') refuse(`${x.id} is ${x.status}; only a folded rule can have worked`);
      if (x.worked.includes(name)) refuse(`${x.id} already counts ${name} as worked`);
      x.worked.push(name);
    } else {
      if (x.logs.includes(name)) refuse(`${x.id} already counts ${name}`);
      x.logs.push(name);
      x.seen++;
      if (x.status === 'folded') x.failed.push(name);
      if (x.status === 'held') x.status = 'open';
    }
  } else if (op === '--set' && args.length >= 2 && args.length % 2 === 0) {
    x = item(args[0]);
    const status = STATUSES.includes(args[1]) ? args[1] : refuse(`a status is one of ${STATUSES.join(', ')}, not ${args[1]}`), o = {};
    for (let i = 2; i < args.length; i += 2) {
      if (!['--place', '--commit', '--by'].includes(args[i]) || args[i] in o) refuse(FORMS);
      o[args[i]] = args[i + 1];
    }
    const allowed = status === 'folded' ? ['--place', '--commit'] : status === 'superseded' ? ['--by'] : [];
    if (Object.keys(o).some((k) => !allowed.includes(k)) || (status === 'folded' && !o['--place']) || (status === 'superseded' && !o['--by'])) refuse(FORMS);
    Object.assign(x, { status, place: null, commit: null, by: null });
    if (status === 'superseded') {
      const to = item(o['--by']);
      if (to.id === x.id) refuse(`${x.id} cannot supersede itself`);
      if (to.status === 'superseded') refuse(`${to.id} is superseded by ${to.by}; name an item that is not superseded`);
      // The two state one gap, so the item that stays counts the logs of the one it replaces.
      for (const l of x.logs) if (!to.logs.includes(l)) { to.logs.push(l); to.seen++; }
      x.by = to.id;
    }
    if (status === 'folded') {
      const place = resolve(cwd, o['--place']);
      if (!statSync(place, { throwIfNoEntry: false })?.isFile()) refuse(`${place} is not a file`);
      const tracked = git(dirname(place), 'ls-files', '--error-unmatch', '--', place).status === 0;
      if (tracked && !o['--commit']) refuse(`git tracks ${place}; --commit names the commit that folded it`);
      if (!tracked && o['--commit']) refuse(`git does not track ${place}, so the fold has no commit`);
      const sha = tracked && git(dirname(place), 'rev-parse', '-q', '--verify', `${o['--commit']}^{commit}`);
      if (sha && sha.status !== 0) refuse(`${o['--commit']} is not a commit of the repository that holds ${place}`);
      Object.assign(x, { place: slash(place), commit: sha ? sha.stdout.trim() : null });
    }
  } else refuse(FORMS);
  writeAtomic(path, items.map((y) => JSON.stringify(y)).join('\n') + '\n');
  return [`primer: wrote ${path}`, `${sign} ${shown(x)}`];
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    const lines = main(process.argv.slice(2));
    process.stdout.write(`${lines.join('\n')}\n`);
  } catch (e) {
    process.stdout.write(`${e instanceof Refusal ? `primer: ${e.message}` : `primer: unexpected error: ${e?.stack ?? e}`}\n`);
    process.exitCode = 1;
  }
}

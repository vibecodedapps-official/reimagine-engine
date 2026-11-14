#!/usr/bin/env node
// Primer's transcript reader: the user's own messages from the session files under <config>/projects/ for one repository and a
// span of dates, with no model call. The host's format is internal and changes between versions, so a line the reader cannot
// read is skipped and counted. It counts nothing else.
// Usage: node transcripts.mjs [--repo <dir>] [--from <YYYY-MM-DD>] [--to <YYYY-MM-DD>]
//   --repo  a directory of the repository, else the working directory; every work tree of it counts
//   --from, --to  the first and last day, in UTC, both included
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Refusal, ownOf } from './primer.mjs';

const FORMS = 'transcripts takes --repo <dir>, --from <YYYY-MM-DD> and --to <YYYY-MM-DD>, each at most once';
// Texts the host writes into a user line: the output of a local or shell command, a background task's notice, an interruption.
const HOST = /^(<local-command-(stdout|stderr|caveat)>|<bash-(stdout|stderr)>|<task-notification>|\[Request interrupted by user)/;
const refuse = (message) => { throw new Refusal(message); };
const slash = (p) => p.replace(/\\/g, '/');

function day(flag, v) {
  const d = new Date(`${v}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v) ? v : refuse(`${flag} takes a date as YYYY-MM-DD, not ${v}`);
}

// One line of a session file: a message of the user's own, null for a line that is readable and no such message, or undefined
// for a line missing a field the reader relies on.
function lineOf(l) {
  let v;
  try { v = JSON.parse(l); } catch { return undefined; }
  if (!v || typeof v !== 'object' || Array.isArray(v) || typeof v.type !== 'string') return undefined;
  if (v.type !== 'user') return null;
  const m = v.message, content = m?.content, at = typeof v.timestamp === 'string' ? Date.parse(v.timestamp) : NaN;
  // A line the host marks as not the user's is read and left out, whatever else it holds.
  if (v.isMeta === true || v.isSidechain === true || v.isCompactSummary === true || (m && typeof m === 'object' && m.role !== 'user')) return null;
  if (!m || typeof m !== 'object' || typeof v.sessionId !== 'string' || typeof v.cwd !== 'string' || Number.isNaN(at)) return undefined;
  if (typeof content !== 'string' && !(Array.isArray(content) && content.every((x) => x && typeof x.type === 'string'))) return undefined;
  const text = typeof content === 'string' ? content : content.filter((x) => x.type === 'text' && typeof x.text === 'string').map((x) => x.text).join('\n');
  return text.trim() && !HOST.test(text.trimStart()) ? { at: new Date(at).toISOString(), session: v.sessionId, cwd: v.cwd, text } : null;
}

// Returns the output lines; a refusal throws.
export function main(argv, { env = process.env, platform = process.platform, home = homedir(), cwd = process.cwd() } = {}) {
  const o = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--repo', '--from', '--to'].includes(argv[i]) || argv[i] in o || argv[i + 1] === undefined) refuse(FORMS);
    o[argv[i]] = argv[i + 1];
  }
  const from = '--from' in o ? day('--from', o['--from']) : undefined, to = '--to' in o ? day('--to', o['--to']) : undefined;
  if (from && to && from > to) refuse(`--from ${from} is after --to ${to}`);
  const dir = resolve(cwd, o['--repo'] ?? '.'), k = (p) => { const s = slash(p).replace(/\/+$/, ''); return platform === 'win32' ? s.toLowerCase() : s; };
  const git = (...a) => spawnSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: { ...env, GIT_OPTIONAL_LOCKS: '0' } });
  const common = git('rev-parse', '--path-format=absolute', '--git-common-dir');
  if (common.status !== 0) refuse(`${slash(dir)} is in no git work tree`);
  // Every work tree of the repository, the main one first. A bare repository's own directory is none, and its parent holds others;
  // it is the root the first line names.
  const list = git('worktree', 'list', '--porcelain').stdout.split('\n\n').map((b) => b.trim()).filter((b) => b.startsWith('worktree ')), at = (b) => slash(b.split('\n')[0].slice(9).trim());
  const root = list.length ? at(list[0]) : slash(dirname(common.stdout.trim())), trees = list.length ? list.filter((b) => !/\nbare$/m.test(b)).map(at) : [root];
  // A session's directory is named for the directory it started in, every character outside A-Za-z0-9 a -; one started in a
  // subdirectory has a longer name, so a candidate directory is kept by the cwd of each line. Beside CLAUDE_CONFIG_DIR, the host
  // takes the name from CLAUDE_CODE_PROJECT_DIR_NAME instead.
  const keys = trees.map((t) => k(t.replace(/[^A-Za-z0-9]/g, '-'))), projects = join(dirname(ownOf({ env, home })), 'projects');
  const named = env.CLAUDE_CONFIG_DIR && env.CLAUDE_CODE_PROJECT_DIR_NAME;
  const names = (() => { try { return readdirSync(projects); } catch { return []; } })().filter((n) => n === named || keys.some((x) => k(n) === x || k(n).startsWith(`${x}-`))).sort();
  const since = from ? Date.parse(`${from}T00:00:00Z`) : -Infinity, mine = (p) => trees.some((t) => k(p) === k(t) || k(p).startsWith(`${k(t)}/`));
  const found = [];
  let files = 0, lines = 0, skipped = 0;
  for (const name of names) {
    const d = join(projects, name);
    for (const f of (() => { try { return readdirSync(d).filter((x) => x.endsWith('.jsonl')).sort(); } catch { return []; } })()) {
      const st = statSync(join(d, f), { throwIfNoEntry: false });
      if (!st?.isFile() || st.mtimeMs < since) continue;
      files++;
      for (const l of readFileSync(join(d, f), 'utf8').split('\n').map((x) => x.replace(/\r$/, '')).filter((x) => x.trim())) {
        lines++;
        const m = lineOf(l);
        if (m === undefined) skipped++;
        else if (m && mine(m.cwd) && (!from || m.at.slice(0, 10) >= from) && (!to || m.at.slice(0, 10) <= to)) found.push(m);
      }
    }
  }
  found.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.session < b.session ? -1 : a.session > b.session ? 1 : 0));
  const sessions = new Set(found.map((m) => m.session)).size;
  return [`primer: ${found.length} messages of the user in ${sessions} sessions of ${root}, ${from ?? 'the first day'} to ${to ?? 'the last day'}, from ${files} files under ${projects}`,
    ...found.map((m) => `${m.at} ${m.session} ${JSON.stringify(m.text)}`),
    `primer: skipped ${skipped} of ${lines} lines (${lines ? ((skipped * 100) / lines).toFixed(1) : '0.0'}%), which the reader could not read`];
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    process.stdout.write(`${main(process.argv.slice(2)).join('\n')}\n`);
  } catch (e) {
    process.stdout.write(`${e instanceof Refusal ? `primer: ${e.message}` : `primer: unexpected error: ${e?.stack ?? e}`}\n`);
    process.exitCode = 1;
  }
}

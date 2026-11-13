#!/usr/bin/env node
// Review posts: compares the drafts of a review with what the forge holds, and checks drafts for text of the reviewer's
// machine. Reads files and prints; opens no connection and runs no command.
// Usage: node posts.mjs compare <drafts directory> <threads file>
//        node posts.mjs leak --<kind> <string> [--<kind> <string>...] <draft>...
//
// A draft is one file in the drafts directory, named <nn>-<slug>.md: two digits that give the order to post or paste,
// so names sort in that order, a dash, then lowercase letters, digits and dashes. Every .md file there must be a draft; other files are ignored.
// It opens with a header and the text to post follows:
//   ---
//   kind: comment          comment, anchored to a file and line; or summary, a comment on the pull request itself
//   path: src/retry.js     comment only: the repository-relative path, as the forge names it
//   line: 42               comment only: the line at the head, a whole number of 1 or more
//   posted: 1234567        optional: the forge's id of the comment, written once the post is made
//   ---
// The body is everything after the closing line, the blank lines right after it dropped.
//
// The threads file is JSON: an object whose "threads" array holds the pull request's threads, as a forge export holds them:
//   {"threads": [{"id": "T1", "path": "src/retry.js", "line": 42, "status": "open", "comments": [{"id": "1234567", "body": "..."}]}]}
// A thread on the pull request itself has "path" and "line" null or absent. Other keys are ignored.
//
// compare prints one line per draft, in name order, and exits 0:
//   posted <draft> <comment id>          one comment equal to the draft
//   twice <draft> <comment id>,<id>...   two or more equal comments
//   differs <draft> <comment id>         the comment its posted id names holds another text
//   missing <draft>                      no comment equal to it
// Equal means the same text once each line's trailing white space and the text's trailing blank lines are dropped and
// CRLF or CR is read as LF; leading and inner white space count. A comment draft is compared with the threads at its path
// and line, a summary with the threads that have no path, and the comment its posted id names wherever it is now, since a
// line moves when the author pushes. Without a posted id a draft has no thread of its own, so another person's comment at
// the same line leaves it missing. A comment with no id prints as -.
//
// leak takes the strings to look for as arguments, so nothing is written to disk and a path with spaces passes whole in
// double quotes. Kinds: home, user, host, record, worktree, model, plugin; each may be given more than once. A string is
// found in any case, where no letter, digit or _ touches either end. A path of home, record or worktree is also found
// with its slashes turned the other way, and C:/x also as /c/x, so one spelling is enough. It prints, per draft in the
// order given, "clean <draft>" or "leak <draft> <kind>[,<kind>...]", and exits 1 when any draft leaks, else 0.
//
// A refusal prints one line "posts: <reason>" and exits 1, with nothing else printed.
import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const USAGE = 'usage: node posts.mjs compare <drafts directory> <threads file> | leak --<kind> <string>... <draft>...';
export const KINDS = ['home', 'user', 'host', 'record', 'worktree', 'model', 'plugin'];
const PATH_KINDS = ['home', 'record', 'worktree'];
const NAME = /^\d{2}-[a-z0-9][a-z0-9-]*\.md$/;
const HEADER_KEYS = ['kind', 'path', 'line', 'posted'];

export class Refusal extends Error {}
const refuse = (message) => { throw new Refusal(message); };

const lf = (text) => text.replace(/\r\n?/g, '\n');
export const normalize = (text) => lf(text).split('\n').map((l) => l.replace(/[ \t]+$/, '')).join('\n').replace(/\n+$/, '');

function readText(path, what) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return refuse(`cannot read ${what} ${path}`);
  }
}

// A draft file's header and body, or a refusal naming the file.
export function parseDraft(name, text) {
  const lines = lf(text).split('\n');
  const end = lines[0] === '---' ? lines.indexOf('---', 1) : -1;
  if (end < 0) refuse(`${name}: no header between two --- lines`);
  const header = {};
  for (const line of lines.slice(1, end)) {
    if (line.trim() === '') continue;
    const m = /^([a-z]+):[ \t]*(.*?)[ \t]*$/.exec(line);
    if (!m || !HEADER_KEYS.includes(m[1])) refuse(`${name}: header line ${JSON.stringify(line)} is not one of ${HEADER_KEYS.join(', ')}`);
    if (Object.hasOwn(header, m[1])) refuse(`${name}: header holds ${m[1]} twice`);
    header[m[1]] = m[2];
  }
  const { kind } = header;
  if (kind === 'comment') {
    if (!header.path) refuse(`${name}: a comment needs a path`);
    if (!/^[1-9]\d*$/.test(header.line ?? '')) refuse(`${name}: a comment needs a line of 1 or more`);
  } else if (kind === 'summary') {
    if (header.path !== undefined || header.line !== undefined) refuse(`${name}: a summary has no path or line`);
  } else {
    refuse(`${name}: kind is ${kind === undefined ? 'missing' : kind}, not comment or summary`);
  }
  if (header.posted === '') refuse(`${name}: posted is empty`);
  let start = end + 1;
  while (start < lines.length && lines[start].trim() === '') start++;
  const body = lines.slice(start).join('\n');
  if (normalize(body) === '') refuse(`${name}: the body is empty`);
  return { name, kind, path: header.path ?? null, line: header.line === undefined ? null : Number(header.line), posted: header.posted ?? null, body };
}

export function readDrafts(dir) {
  let names;
  try {
    names = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith('.md')).map((e) => e.name);
  } catch {
    return refuse(`cannot read the drafts directory ${dir}`);
  }
  if (!names.length) refuse(`no draft in ${dir}`);
  for (const name of names) if (!NAME.test(name)) refuse(`${name} is not named <nn>-<slug>.md`);
  return names.sort().map((name) => parseDraft(name, readText(join(dir, name), 'the draft')));
}

const idOf = (v) => (typeof v === 'string' && v !== '' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : null);

// The threads as [{ path, line, comments: [{ id, body }] }], or a refusal.
export function parseThreads(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return refuse('the threads file is not JSON');
  }
  if (data === null || typeof data !== 'object' || !Array.isArray(data.threads)) refuse('the threads file has no "threads" array');
  return data.threads.map((t, i) => {
    if (t === null || typeof t !== 'object' || Array.isArray(t)) refuse(`thread ${i + 1} is not an object`);
    if (!Array.isArray(t.comments)) refuse(`thread ${i + 1} has no "comments" array`);
    const path = t.path === undefined || t.path === null ? null : t.path;
    if (path !== null && (typeof path !== 'string' || path === '')) refuse(`thread ${i + 1} has a path that is not a string`);
    const line = t.line === undefined || t.line === null ? null : t.line;
    if (line !== null && !Number.isInteger(line)) refuse(`thread ${i + 1} has a line that is not a whole number`);
    const comments = t.comments.map((c, j) => {
      if (c === null || typeof c !== 'object' || typeof c.body !== 'string') refuse(`thread ${i + 1} comment ${j + 1} has no string "body"`);
      return { id: idOf(c.id), body: normalize(c.body) };
    });
    return { path, line, comments };
  });
}

export function compare(drafts, threads) {
  const all = threads.flatMap((t) => t.comments);
  return drafts.map((d) => {
    const body = normalize(d.body);
    const scope = threads.filter((t) => (d.kind === 'summary' ? t.path === null : t.path === d.path && t.line === d.line));
    const equal = scope.flatMap((t) => t.comments).filter((c) => c.body === body);
    const own = d.posted === null ? null : all.find((c) => c.id === d.posted) ?? null;
    if (own && own.body === body && !equal.includes(own)) equal.unshift(own);
    const ids = (list) => list.map((c) => c.id ?? '-').join(',');
    if (equal.length > 1) return `twice ${d.name} ${ids(equal)}`;
    if (equal.length === 1) return `posted ${d.name} ${ids(equal)}`;
    if (own) return `differs ${d.name} ${ids([own])}`;
    return `missing ${d.name}`;
  });
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Every spelling of a string the leak check looks for.
export function spellings(kind, value) {
  const out = new Set([value]);
  if (PATH_KINDS.includes(kind)) {
    for (const v of [value.replaceAll('\\', '/'), value.replaceAll('/', '\\')]) out.add(v);
    const drive = /^([A-Za-z]):[\\/](.*)$/.exec(value);
    if (drive) out.add(`/${drive[1].toLowerCase()}/${drive[2].replaceAll('\\', '/')}`);
  }
  return [...out];
}

export function parseLeak(args) {
  const wanted = [];
  let i = 0;
  while (i < args.length && args[i].startsWith('--')) {
    const kind = args[i].slice(2);
    if (!KINDS.includes(kind)) refuse(`unknown option ${args[i]}; the kinds are ${KINDS.join(', ')}`);
    const value = args[i + 1];
    if (value === undefined) refuse(`${args[i]} needs a string`);
    if (value.trim() === '') refuse(`${args[i]} is empty`);
    wanted.push({ kind, value });
    i += 2;
  }
  const drafts = args.slice(i);
  if (!wanted.length) refuse('leak needs at least one --<kind> <string>');
  if (!drafts.length) refuse('leak needs at least one draft');
  return { wanted, drafts };
}

export function leak(wanted, drafts, read = (p) => readText(p, 'the draft')) {
  const patterns = wanted.map(({ kind, value }) => ({
    kind,
    re: new RegExp(`(?<![A-Za-z0-9_])(?:${spellings(kind, value).map(escape).join('|')})(?![A-Za-z0-9_])`, 'i'),
  }));
  return drafts.map((draft) => {
    const text = read(draft);
    const found = KINDS.filter((k) => patterns.some((p) => p.kind === k && p.re.test(text)));
    return found.length ? `leak ${draft} ${found.join(',')}` : `clean ${draft}`;
  });
}

// Returns { lines, code }. A refusal throws.
export function main(argv) {
  const [verb, ...rest] = argv;
  if (verb === 'compare') {
    if (rest.length !== 2) refuse(USAGE);
    const drafts = readDrafts(rest[0]);
    return { lines: compare(drafts, parseThreads(readText(rest[1], 'the threads file'))), code: 0 };
  }
  if (verb === 'leak') {
    const { wanted, drafts } = parseLeak(rest);
    const lines = leak(wanted, drafts);
    return { lines, code: lines.some((l) => l.startsWith('leak ')) ? 1 : 0 };
  }
  return refuse(USAGE);
}

// Node resolves the entry point through symlinks, so compare with the resolved path.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    const { lines, code } = main(process.argv.slice(2));
    process.stdout.write(`${lines.join('\n')}\n`);
    process.exitCode = code;
  } catch (e) {
    process.stdout.write(`posts: ${e instanceof Refusal ? e.message : `unexpected error: ${e?.message ?? e}`}\n`);
    process.exitCode = 1;
  }
}

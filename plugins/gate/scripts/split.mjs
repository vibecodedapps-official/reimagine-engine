#!/usr/bin/env node
// Gate split: sizes a change and, when it is over the split, groups its files by path into the reviews of one pass.
// Usage: git diff --numstat -z --no-renames <merge-base>...HEAD | node split.mjs <split>
//   <split>   a whole number of 1 or more: the changed lines above which a pass has more than one review
//   stdin     the numstat records, each `<added>\t<deleted>\t<path>` ended by a NUL; the `-` of a binary file counts as no lines
// Prints one JSON object and exits 0: {"lines": <n>, "groups": [{"slug", "paths", "files", "lines"}]}, the groups in byte
// order of slug. A change at or under <split>, or one whose files give a single group, is the one group "all" with no
// paths: the whole range. Otherwise:
//   - the files are grouped by their first d path segments, d being the lowest depth that gives more than one group; the
//     files with no more than d segments are their folder's own files, a group whose paths names them one by one
//   - a folder's group still over <split> is grouped again one segment deeper, unless that gives a single group
//   - sibling groups under one fifth of <split> are merged in byte order of path, a folder's own files last; a merged group
//     closes when it reaches that fifth, names its files one by one, and is never made of one group alone
//   - a slug is the group's path in lowercase with each run outside [a-z0-9] written as one `-`; a folder's own files end in
//     `root` and a merged group in `small`; a path that gives no slug is `group`; a slug already taken, `all` included,
//     gets `-2`, else `-3`, and so on
// Exit 1 for input that is not numstat records, exit 2 for usage, one line on stderr, nothing on stdout.
// Everything above main() is pure.
import { readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const USAGE = 'usage: git diff --numstat -z --no-renames <merge-base>...HEAD | node split.mjs <split>';

const bytes = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
const sum = (groups) => groups.reduce((n, g) => n + g.lines, 0);
const slugOf = (path) => path.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// The numstat records as [{ path, segs, lines }], or null when the text is not such records.
export function parse(text) {
  const files = [];
  for (const record of text.split('\0')) {
    if (record === '') continue;
    const m = /^(\d+|-)\t(\d+|-)\t([^\n]+)$/.exec(record);
    if (!m) return null;
    files.push({ path: m[3], segs: m[3].split('/'), lines: (Number(m[1]) || 0) + (Number(m[2]) || 0) });
  }
  return files;
}

// Groups files that share their first depth - 1 segments, at the lowest depth from `depth` that gives more than one
// group. Returns the groups, each { key, prefix, files, lines }; key is a folder path, or '.' for the files of `prefix` itself.
function level(files, depth) {
  for (let d = depth; ; d++) {
    const keyOf = (f) => (f.segs.length > d ? f.segs.slice(0, d).join('/') : '.');
    const byKey = new Map();
    for (const f of files) byKey.set(keyOf(f), [...(byKey.get(keyOf(f)) ?? []), f]);
    if (byKey.size === 1 && files.some((f) => f.segs.length > d)) continue;
    const prefix = files[0].segs.slice(0, d - 1).join('/');
    return [...byKey].map(([key, own]) => ({ key, prefix, files: own, lines: sum(own) }));
  }
}

// The final groups of `files`, or null when they give a single group. `parent` is the folder being grouped again, '' at the top.
function groupsOf(files, depth, parent, split) {
  const kids = level(files, depth);
  if (kids.length === 1) return null;
  const out = [];
  const kept = [];
  for (const g of kids) {
    const deeper = g.key !== '.' && g.lines > split ? groupsOf(g.files, g.key.split('/').length + 1, g.key, split) : null;
    if (deeper) out.push(...deeper);
    else kept.push(g);
  }
  kept.sort((a, b) => (a.key === '.') - (b.key === '.') || bytes(a.key, b.key));
  const floor = split / 5;
  let open = [];
  const close = () => {
    if (open.length > 1) out.push({ merged: true, parent, first: open[0].key, files: open.flatMap((g) => g.files), lines: sum(open) });
    else out.push(...open);
    open = [];
  };
  for (const g of kept) {
    if (g.lines >= floor) {
      out.push(g);
      continue;
    }
    open.push(g);
    if (sum(open) >= floor) close();
  }
  close();
  return out;
}

// The reviews of a pass: { lines, groups }, as the header says.
export function split(files, max) {
  const lines = sum(files);
  const all = { lines, groups: [{ slug: 'all', paths: [], files: files.length, lines }] };
  const groups = lines > max ? groupsOf(files, 1, '', max) : null;
  if (!groups || groups.length === 1) return all;

  // Folders first, in byte order of path, then each folder's own files by folder, then the merged groups by their first path.
  const rank = (g) => (g.merged ? 2 : g.key === '.' ? 1 : 0);
  const name = (g) => (g.merged ? g.first : g.key === '.' ? g.prefix : g.key);
  groups.sort((a, b) => rank(a) - rank(b) || bytes(name(a), name(b)));
  const taken = new Set(['all']);
  const out = groups.map((g) => {
    const base = g.merged ? [slugOf(g.parent), 'small'] : g.key === '.' ? [slugOf(g.prefix), 'root'] : [slugOf(g.key)];
    const wanted = base.filter(Boolean).join('-') || 'group';
    let slug = wanted;
    for (let n = 2; taken.has(slug); n++) slug = `${wanted}-${n}`;
    taken.add(slug);
    const paths = g.merged || g.key === '.' ? g.files.map((f) => f.path) : [g.key];
    return { slug, paths, files: g.files.length, lines: g.lines };
  });
  return { lines, groups: out.sort((a, b) => bytes(a.slug, b.slug)) };
}

function main(argv) {
  const fail = (code, message) => {
    process.stderr.write(message + '\n');
    process.exitCode = code;
  };
  if (argv.length !== 1 || !/^[1-9][0-9]*$/.test(argv[0]) || !Number.isSafeInteger(Number(argv[0]))) return fail(2, USAGE);
  let text;
  try {
    text = readFileSync(0, 'utf8');
  } catch {
    return fail(2, USAGE);
  }
  const files = parse(text);
  if (files === null) return fail(1, 'split: stdin is not the output of git diff --numstat -z --no-renames');
  process.stdout.write(JSON.stringify(split(files, Number(argv[0]))) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main(process.argv.slice(2));

#!/usr/bin/env node
// The outbound check, a PreToolUse hook: denies a commit, a push or a forge post whose text holds a string listed in
// rules-outbound.txt in $CLAUDE_CONFIG_DIR, else ~/.claude. Usage: node outbound.mjs, with the hook's input on stdin.
// With no list file it does nothing; on any error it lets the call go ahead.
import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { targets } from './rules.mjs';

export const LIST_FILE = 'rules-outbound.txt';
export const listPath = (env, home) => join(dirname(targets(env, home).logical), LIST_FILE);

const EDGE = 'A-Za-z0-9_-';
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const word = (w, edge = EDGE) => new RegExp(`(?<![${edge}])${w}(?![${edge}])`, 'i');
const has = (text, w) => word(w).test(text);

// A list saved as UTF-16, as a redirect in Windows PowerShell saves it, is read as such.
export function decode(buf) {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.toString('utf16le');
  if (buf[0] === 0xfe && buf[1] === 0xff) return Buffer.from(buf.subarray(0, buf.length & ~1)).swap16().toString('utf16le');
  return buf.toString('utf8');
}

// A phrase is compared in lower case with its backslashes turned, so one spelling of a script's path is enough.
const flat = (s) => s.toLowerCase().replaceAll('\\', '/');

// One string per line; blank lines and # lines are ignored; "allow: <phrase>" exempts a phrase; "check: diff" reads diffs;
// "post: <phrase>" has a command that holds the phrase read as a forge post.
export function parseList(text) {
  const list = { strings: [], allow: [], post: [], diff: false };
  for (const raw of (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('allow:')) { if (line.slice(6).trim()) list.allow.push(line.slice(6).trim()); }
    else if (line.startsWith('post:')) { if (line.slice(5).trim()) list.post.push(line.slice(5).trim()); }
    else if (line === 'check: diff') list.diff = true;
    else list.strings.push(line);
  }
  return list;
}

// The first listed string a text holds, case ignored, as a whole word, once the allowed phrases are taken out; else null.
// The text is searched as typed and again with each typed escape such as `n or \n read as a break.
export function finder(list) {
  const res = list.strings.map((s) => ({ s, re: word(escape(s), 'A-Za-z0-9_') }));
  const allow = list.allow.length ? new RegExp([...list.allow].sort((a, b) => b.length - a.length).map(escape).join('|'), 'gi') : null;
  return (text) => {
    const t = allow ? text.replace(allow, ' ') : text, spaced = t.replace(/`[nrt]|\\[nrt]/g, ' ');
    return res.find((r) => r.re.test(t) || r.re.test(spaced))?.s ?? null;
  };
}

const VALUE = String.raw`("[^"]*"|'[^']*'|[^\s"';|&)]+)`;
const unquote = (v) => (/^(["']).*\1$/s.test(v) ? v.slice(1, -1) : v);
const all = (command, source, flags = 'dg') => [...command.matchAll(new RegExp(source, flags))];

// The files a command names: after a message or body option, as @<file>, after cat, Get-Content, gc or type, and after
// a < redirect. loud: its loss warns.
export function namedFiles(command) {
  const out = [];
  const add = (m, loud, mention = false) => { const v = unquote(m[1]); if (v && v !== '-') out.push({ file: v, loud, mention, span: m.indices[1] }); };
  // A -F value with = is a field, not a file, unless it is key=@<file>.
  for (const m of all(command, String.raw`(?<=^|\s)(?:-F|--file|--body-file|--notes-file|--input)(?:=|\s+)${VALUE}`)) if (!unquote(m[1]).includes('=')) add(m, true);
  for (const m of all(command, String.raw`(?<=^|\s)-F(?=[^\s=-])${VALUE}`)) if (!unquote(m[1]).includes('=')) add(m, false);
  // An @<file> may be the text itself, a mention or a raw field, so its path is never left out of the search.
  for (const m of all(command, String.raw`(?<=^|[\s=])@([^\s"'@{(;|&)]+)`)) add(m, false, true);
  // Options before the path are passed over, one with its value included: cat -- x, Get-Content -Encoding utf8 x.
  for (const m of all(command, String.raw`(?<![${EDGE}])(?:cat|Get-Content|gc|type)\s+(?:(?:--|-\w+(?:\s+(?!-)[^\s"';|&)]+)?)\s+)*(?!-)${VALUE}`, 'dgi')) add(m, false);
  for (const m of all(command, String.raw`(?<![<\w])<(?!<)\s*${VALUE}`)) add(m, false);
  return out;
}

// The directories a command names after cd, pushd, Set-Location, Push-Location or git's -C.
export function namedDirs(command) {
  return [...all(command, String.raw`(?<![${EDGE}])(?:cd|pushd|Set-Location|Push-Location)\s+(?:-(?:Literal)?Path\s+)?${VALUE}`, 'dgi'),
    ...all(command, String.raw`(?<=^|\s)-C\s+${VALUE}`)].map((m) => ({ dir: unquote(m[1]), span: m.indices[1] }));
}

// A text with each span replaced by a space; a span that reaches into one already taken is skipped.
const without = (text, spans) => {
  let from = Infinity;
  return [...spans].sort((a, b) => b[0] - a[0]).reduce((t, [i, j]) => (j > from ? t : (from = i, `${t.slice(0, i)} ${t.slice(j)}`)), text);
};

const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };

function git(dir, args) {
  const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8', maxBuffer: 1 << 28, windowsHide: true });
  if (r.error || r.status !== 0) throw new Error(`git ${args[0]} exited ${r.status}`);
  return r.stdout;
}

// The texts of the commits a push from dir could send: those HEAD or a local branch reaches, or a tag when the command
// sends tags, and no remote-tracking ref holds. Refspecs are not read, so a branch the push leaves behind counts too.
// With diff, their added lines; lost says the diff could not be read.
export function leaving(dir, command, diff) {
  const tags = new RegExp(String.raw`(?<=^|\s)--(?:tags|follow-tags|mirror)(?![${EDGE}])`).test(command);
  const revs = ['HEAD', '--branches', ...(tags ? ['--tags'] : []), '--not', '--remotes'];
  const texts = git(dir, ['log', '--no-color', '--no-show-signature', '--format=%x1e%h%x1f%B', ...revs]).split('\x1e').filter(Boolean)
    .map((c) => { const i = c.indexOf('\x1f'); return i < 0 ? { where: 'a commit', text: c } : { where: `commit ${c.slice(0, i)}`, text: c.slice(i + 1) }; });
  if (!diff) return { texts, lost: false };
  let patch;
  try { patch = git(dir, ['log', '--no-color', '--no-ext-diff', '--no-textconv', '-p', '-U0', '--format=%x1e%h', ...revs]); } catch { return { texts, lost: true }; }
  for (const c of patch.split('\x1e').filter(Boolean)) {
    const [id, ...lines] = c.split('\n');
    let hunk = false;
    const added = lines.filter((l) => {
      if (l.startsWith('diff --git ')) hunk = false;
      else if (l.startsWith('@@')) hunk = true;
      else return hunk && l.startsWith('+');
      return false;
    });
    texts.push({ where: `the added lines of commit ${id}`, text: added.map((l) => l.slice(1)).join('\n') });
  }
  return { texts, lost: false };
}

const strings = (v) => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : []);
const deny = (reason) => JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });
const warn = (text) => JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: text } });

const TEXT = ['commit', 'commit-tree', 'merge', 'tag'], FORGE = ['gh', 'az', 'glab'];
// git push in one simple command, but not git stash push.
const PUSH = new RegExp(String.raw`(?<![${EDGE}])git(?:\.exe)?(?![${EDGE}])[^|;&\n]*?\s(?<!stash\s+)push(?![${EDGE}])`, 'i');
const firstText = (s) => TEXT.map((w) => [w, word(w).exec(s)?.index ?? Infinity]).reduce((a, b) => (b[1] < a[1] ? b : a), ['', Infinity])[0];
// What makes a command a forge post, as the denial names it, or null. git and a subcommand count where one line holds
// both, a line continued with a backslash, a backtick or an open parenthesis at its end being one, so a text that
// names git and holds the word on another line is no post; beside a $ or the word xargs they count anywhere in the
// command, since a variable or the input of xargs may hold either. The denial names the subcommand word that comes
// first after git, else the first.
function postWord(command, list) {
  const lines = command.includes('$') || has(command, 'xargs') ? [command] : command.replace(/(?:[\\`]|\([ \t]*)\r?\n/g, ' ').split('\n');
  const sub = lines.map((l) => { const g = word('git').exec(l); return g && (firstText(l.slice(g.index + 3)) || firstText(l)); }).find(Boolean);
  if (sub) return `"git" and "${sub}"`;
  const forge = FORGE.find((w) => has(command, w));
  if (forge) return `"${forge}"`;
  const flatCommand = flat(command), phrase = list.post.find((p) => flatCommand.includes(flat(p)));
  return phrase === undefined ? null : `the post: phrase "${phrase}"`;
}

// The output lines for one hook input: a deny on the first hit, else one warning that names what could not be read.
export function check(input, list, path, { home, platform, tmp = tmpdir() }) {
  const find = finder(list), tool = String(input?.tool_name ?? ''), ti = input?.tool_input ?? {};
  const hit = (texts) => {
    for (const { where, text } of texts) {
      const s = find(text);
      if (s !== null) return [deny(`rules: "${s}", listed in ${path}, is in ${where}`)];
    }
    return null;
  };
  if (tool.startsWith('mcp__')) return hit([{ where: 'the tool input', text: strings(ti).join('\n') }]) ?? [];
  if ((tool !== 'Bash' && tool !== 'PowerShell') || typeof ti.command !== 'string') return [];
  const command = ti.command, cwd = typeof input.cwd === 'string' && isDir(input.cwd) ? input.cwd : process.cwd();
  // The Bash tool on Windows names paths in the MSYS form: /c/... for a drive and /tmp for the temp folder.
  const local = (p, base = cwd) => {
    if (p === '~' || p.startsWith('~/')) return join(home, p.slice(2));
    if (platform === 'win32' && tool === 'Bash') {
      if (p === '/tmp' || p.startsWith('/tmp/')) return join(tmp, p.slice(5));
      const m = /^\/([A-Za-z])(\/.*|)$/.exec(p);
      if (m) return resolve(`${m[1].toUpperCase()}:${m[2] || '/'}`);
    }
    return resolve(base, p);
  };
  const why = postWord(command, list), posts = why !== null, pushes = PUSH.test(command);
  if (!posts && !pushes) return [];
  // A path the hook resolved stays on the machine, so it is left out of the search: a scratch folder may hold a listed
  // name. Only where no quote and no line break comes before it: after one, the path may be a message's own text,
  // and telling which would take a parse of each shell's quoting.
  const typed = ([i]) => !/["'\n]/.test(command.slice(0, i));
  const dirs = namedDirs(command).map((d) => ({ ...d, dir: local(d.dir) })).filter((d) => isDir(d.dir));
  const texts = [], notes = [];
  if (posts) {
    const kept = dirs.map((d) => d.span).filter(typed), seen = new Set();
    for (const { file, loud, mention, span } of namedFiles(command)) {
      let read = false;
      for (const full of new Set([cwd, ...dirs.map((d) => d.dir)].map((base) => local(file, base)))) {
        let text;
        try { text = readFileSync(full, 'utf8'); } catch { continue; }
        read = true;
        if (!seen.has(full)) texts.push({ where: `the file ${full}`, text });
        seen.add(full);
      }
      if (read && !mention && typed(span)) kept.push(span);
      if (!read && loud) notes.push(local(file));
    }
    // Searched again with a joined short option such as -mtext split, so the option's letter does not hide a word.
    const sent = without(command, kept);
    texts.unshift({ where: `the command, which holds ${why} and so is read as a post`, text: `${sent}\n${sent.replace(/(?<=^|\s)-([A-Za-z])(?=[^\s=-])/g, '-$1 ')}` });
  }
  const first = hit(texts);
  if (first) return first;
  if (pushes) {
    for (const dir of new Set([cwd, ...dirs.map((d) => d.dir)])) {
      let out;
      try { out = leaving(dir, command, list.diff); } catch { continue; }
      const found = hit(out.texts);
      if (found) return found;
      if (out.lost) notes.push(`the diff of the commits in ${dir}`);
    }
  }
  return notes.length ? [warn(`rules: ${notes.join(', ')} could not be read, so ${notes.length === 1 ? 'its text was' : 'their texts were'} not checked against ${path}`)] : [];
}

export function main({ env = process.env, home = homedir(), platform = process.platform, stdin = () => readFileSync(0, 'utf8') } = {}) {
  const path = listPath(env, home);
  let text;
  try { text = decode(readFileSync(path)); } catch { return []; }
  try { return check(JSON.parse(stdin()), parseList(text), path, { home, platform }); } catch { return []; }
}

// Node resolves the entry point through symlinks, so compare with the resolved path.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    const lines = main();
    process.stdout.write(lines.length ? `${lines.join('\n')}\n` : '');
  } catch {}
}

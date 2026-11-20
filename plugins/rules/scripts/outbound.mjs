#!/usr/bin/env node
// The outbound check, a PreToolUse hook: denies a commit, a push or a forge post whose text holds a string listed in
// rules-outbound.txt in $CLAUDE_CONFIG_DIR, else ~/.claude. Usage: node outbound.mjs, with the hook's input on stdin.
// With no list file it does nothing; on any error but a push it could not read in time it lets the call go ahead.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
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

const VALUE = String.raw`((?:"[^"]*"|'[^']*'|[^\s"';|&)])+)`;
const unquote = (v) => v.replace(/"([^"]*)"|'([^']*)'/g, (_, a, b) => a ?? b);
const all = (command, source, flags = 'dg') => [...command.matchAll(new RegExp(source, flags))];
const fileOption = (name, value) => /file/i.test(name.replace(/profile/gi, '')) && !/names?$/i.test(name) && !/^(?:out|output|log)[-_]?file/i.test(name)
  && !(/^file$/i.test(name) && /\.ps1$/i.test(value));

// The files a command names: after a message or body option, after any option whose name holds file when own is true,
// as @<file>, after cat, Get-Content, gc or type, and after a < redirect. loud: its loss warns.
export function namedFiles(command, own = false) {
  const out = [];
  const add = (m, loud, mention = false, g = 1) => { const v = unquote(m[g]); if (v && v !== '-') out.push({ file: v, loud, mention, span: m.indices[g] }); };
  // A -F value with = is a field, not a file, unless it is key=@<file>.
  for (const m of all(command, String.raw`(?<=^|\s)(?:-F|--file|--body-file|--notes-file|--input)(?:=|\s+)${VALUE}`)) if (!unquote(m[1]).includes('=')) add(m, true);
  for (const m of all(command, String.raw`(?<=^|\s)-F(?=[^\s=-])${VALUE}`)) if (!unquote(m[1]).includes('=')) add(m, false);
  // A posting script's own option, as --file-path or -DescriptionFile:<file>, read only where the command holds a post: phrase.
  if (own) for (const m of all(command, String.raw`(?<=^|\s)--?([A-Za-z][\w-]*)(?:=|:\s*|\s+)(?!-)${VALUE}`)) if (!/^--(?:file|body-file|notes-file)(?:=|\s)/.test(m[0]) && fileOption(m[1], unquote(m[2]))) add(m, false, false, 2);
  // An @<file> may be the text itself, a mention or a raw field, so its path is never left out of the search.
  for (const m of all(command, String.raw`(?<=^|[\s=])@([^\s"'@{(;|&)]+)`)) add(m, false, true);
  // Options before the path are passed over, one with its value included: cat -- x, Get-Content -Encoding utf8 x.
  for (const m of all(command, String.raw`(?<![${EDGE}])(?:cat|Get-Content|gc|type)\s+(?:(?:--|-\w+(?:\s+(?!-)[^\s"';|&)]+)?)\s+)*(?!-)${VALUE}`, 'dgi')) add(m, false);
  for (const m of all(command, String.raw`(?<![<\w])<(?!<)\s*${VALUE}`)) add(m, false);
  return out;
}

// The directories a command names after cd, pushd, Set-Location, Push-Location or -C. A -C is loose unless it is an
// option of git itself, since grep -C 3 and make -C build name no folder to push from.
const GIT_C = new RegExp(String.raw`(?<![${EDGE}])git(?:\.exe)?["']?(?:\s+(?:-c\s+(?:"[^"]*"|'[^']*'|\S+)|-[^\sC]\S*))*\s+$`, 'i');
export function namedDirs(command) {
  const dir = (m) => ({ dir: unquote(m[1]), span: m.indices[1] });
  return [...all(command, String.raw`(?<![${EDGE}])(?:cd|pushd|Set-Location|Push-Location)\s+(?:-(?:Literal)?Path\s+)?${VALUE}`, 'dgi').map(dir),
    ...all(command, String.raw`(?<=^|\s)-C\s+${VALUE}`).map((m) => ({ ...dir(m), loose: !GIT_C.test(command.slice(0, m.index)) }))];
}

// A text with each span replaced by a space; a span that reaches into one already taken is skipped.
const without = (text, spans) => {
  let from = Infinity;
  return [...spans].sort((a, b) => b[0] - a[0]).reduce((t, [i, j]) => (j > from ? t : (from = i, `${t.slice(0, i)} ${t.slice(j)}`)), text);
};

const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };

// A git call or a search that had no time left, or a git call stopped when its time ran out.
class Late extends Error {}

function git(dir, args, left = () => Infinity) {
  const ms = left();
  if (ms <= 0) throw new Late();
  const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8', maxBuffer: 1 << 28, windowsHide: true, timeout: ms < Infinity ? Math.ceil(ms) : undefined });
  if (r.error?.code === 'ETIMEDOUT') throw new Late();
  if (r.error || r.status !== 0) throw new Error(`git ${args[0]} exited ${r.status}`);
  return r.stdout;
}

// The texts of the commits a push from dir could send: those HEAD or a local branch reaches, or a tag when the command
// sends tags, and no remote-tracking ref holds. Refspecs are not read, so a branch the push leaves behind counts too.
// With diff, their added lines and the names of the files they add, a rename's new name among them; lost says the diff could
// not be read. One git call reads both, its output cut at a mark
// made for the call, so no text of a commit can end a piece. A call with no time left throws Late.
export function leaving(dir, command, diff, left) {
  const tags = new RegExp(String.raw`(?<=^|\s)--(?:tags|follow-tags|mirror)(?![${EDGE}])`).test(command);
  const id = randomBytes(8).toString('hex');
  const args = (patch) => ['-c', 'core.quotepath=off', 'log', '--no-color', '--no-show-signature', ...(patch ? ['--no-ext-diff', '--no-textconv', '-p', '-U0'] : []),
    `--format=%x1e${id}m%h%x1f%B%x1e${id}p`, 'HEAD', '--branches', ...(tags ? ['--tags'] : []), '--not', '--remotes'];
  let out, lost = false;
  try { out = git(dir, args(diff), left); } catch (e) {
    if (!diff || e instanceof Late) throw e;
    out = git(dir, args(false), left);
    lost = true;
  }
  const texts = [], added = [];
  let commit = '', head = '';
  for (const piece of out.split(`\x1e${id}`).slice(1)) {
    if (piece[0] === 'm') {
      const i = piece.indexOf('\x1f');
      commit = piece.slice(1, i);
      texts.push({ where: `commit ${commit}`, text: piece.slice(i + 1) });
      continue;
    }
    let hunk = false;
    const names = [], lines = piece.split('\n').filter((l) => {
      if (l.startsWith('diff --git ')) [hunk, head] = [false, l.slice(11)];
      else if (l.startsWith('@@')) hunk = true;
      // The header of a new file gives its name twice, each after a prefix; a rename gives the new name by itself.
      else if (!hunk && /^(new file mode|rename to|copy to) /.test(l)) names.push(l.startsWith('new') ? head : l.slice(l.indexOf(' to ') + 4));
      else return hunk && l.startsWith('+');
      return false;
    });
    if (names.length) added.push({ where: `the names of the files commit ${commit} adds`, text: names.join('\n') });
    if (lines.length) added.push({ where: `the added lines of commit ${commit}`, text: lines.map((l) => l.slice(1)).join('\n') });
  }
  return { texts: [...texts, ...added], lost };
}

const strings = (v) => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : []);
const deny = (reason) => JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });
const warn = (text) => JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: text } });

const TEXT = ['commit', 'commit-tree', 'merge', 'tag'], FORGE = ['gh', 'az', 'glab'];
// git push in one simple command, but not git stash push.
const PUSH = new RegExp(String.raw`(?<![${EDGE}])git(?:\.exe)?(?![${EDGE}])[^|;&\n]*?\s(?<!stash\s+)push(?![${EDGE}])`, 'i');
// A call that makes a commit and, after the end of its own simple command, a push: no check before the command can read that commit. A message's words are inside that command, and a call with --abort, --quit, --dry-run, --no-commit, --edit-todo, --show-current-patch or help makes no commit.
const MAKES = new RegExp(String.raw`(?<![${EDGE}])git(?:\.exe)?["']?(?:\s+(?:-[Cc]|--git-dir|--work-tree|--namespace|--config-env)\s+(?:"[^"\n]*"|'[^'\n]*'|[^\s"'])+|\s+-\S+)*\s+(?:commit|merge|cherry-pick|rebase|am|revert|pull)(?![${EDGE}])`, 'gi');
// Where the simple command that holds place i ends: the first ; & | or line break outside a quoted string, read with the tool's escape character; with a quote left open, the place itself.
const simpleEnd = (s, i, esc) => { let q = null, k = i; for (; k < s.length; k++) { const c = s[k]; if (c === esc && q !== "'") k++; else if (q ? c === q : c === '"' || c === "'") q = q ? null : c; else if (!q && ';&|\n'.includes(c)) break; } return q ? i : k; };
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
// The git calls of one input and the search of what they return share limit milliseconds, kept under the timeout of
// the hook's entry, since a hook the host stops lets the call go ahead: a push whose commits were not read in that
// time, or from a folder not found, is denied.
export function check(input, list, path, { home, platform, tmp = tmpdir(), env = process.env, limit = 45000, now = Date.now }) {
  const until = now() + limit, left = () => until - now();
  const find = finder(list), tool = String(input?.tool_name ?? ''), ti = input?.tool_input ?? {};
  const hit = (texts, time) => {
    for (const { where, text } of texts) {
      if (time && time() <= 0) throw new Late();
      const s = find(text);
      if (s !== null) return [deny(`rules: "${s}", listed in ${path}, is in ${where}`)];
    }
    return null;
  };
  if (tool.startsWith('mcp__')) return hit([{ where: 'the tool input', text: strings(ti).join('\n') }]) ?? [];
  if ((tool !== 'Bash' && tool !== 'PowerShell') || typeof ti.command !== 'string') return [];
  const command = ti.command, cwd = resolve(typeof input.cwd === 'string' && isDir(input.cwd) ? input.cwd : process.cwd());
  // A variable in a path is read from the hook's environment, $NAME and ${NAME} for Bash, $env:NAME and ${env:NAME}
  // for PowerShell, with the shell's own HOME the home folder, for Bash the HOME of the environment when set, and its
  // own PWD the folder the path is looked for in; one that is not set stays as written.
  const vars = tool === 'Bash' ? /\$(?:\{\w+\}|\w+)/g : /\$(?:\{env:\w+\}|env:\w+|\{(?:HOME|PWD)\}|(?:HOME|PWD)(?!\w))/gi;
  const value = (name) => { const key = tool === 'PowerShell' ? name.toUpperCase() : name; return key === 'HOME' ? (tool === 'Bash' ? env.HOME ?? home : home) : key === 'PWD' ? '.' : env[name]; };
  // The Bash tool on Windows names paths in the MSYS form: /c/... for a drive and /tmp for the temp folder.
  const local = (written, base = cwd) => {
    const p = written.replace(vars, (all) => {
      const name = all.replace(/^\$\{?|\}$/g, '');
      return (/^env:/i.test(name) ? env[name.slice(4)] : value(name)) ?? all;
    });
    if (p === '~' || /^~[\\/]/.test(p)) return join(value('HOME'), p.slice(2));
    if (platform === 'win32' && tool === 'Bash') {
      if (p === '/tmp' || p.startsWith('/tmp/')) return join(tmp, p.slice(5));
      const m = /^\/([A-Za-z])(\/.*|)$/.exec(p);
      if (m) return resolve(`${m[1].toUpperCase()}:${m[2] || '/'}`);
    }
    return resolve(base, p);
  };
  const why = postWord(command, list), posts = why !== null, pushes = PUSH.test(command);
  const flatCommand = flat(command), own = list.post.some((p) => flatCommand.includes(flat(p)));
  if (!posts && !pushes) return [];
  // Whether a place in the command is outside a quoted string and on its first line, read with the tool's escape
  // character: after a line break or inside a string, a path, cd and -C may be a message's words.
  const esc = tool === 'Bash' ? '\\' : '`';
  const bare = (i) => {
    let quote = null;
    for (let k = 0; k < i; k += 1) {
      const c = command[k];
      if (c === '\n') return false;
      if (c === esc && quote !== "'") k += 1;
      else if (quote === null ? c === '"' || c === "'" : c === quote) quote = quote === null ? c : null;
    }
    return quote === null;
  };
  // A path the hook resolved stays on the machine, so it is left out of the search where it stands outside a string
  // and on the first line, with no dollar sign, backtick or typographic quote before it, which bare() does not read: a
  // scratch folder may hold a listed name.
  const typed = ([i]) => bare(i) && !/[$`\u2018\u2019\u201C\u201D]/.test(command.slice(0, i));
  // A folder is looked for in the call's folder and in each folder named before it, as cd a && cd b names a/b. One
  // not found is named as typed, unless it is a loose -C or starts with -, an option or cd -, not a folder.
  const dirs = [], missing = [];
  for (const d of namedDirs(command).sort((a, b) => a.span[0] - b.span[0])) {
    const found = [...new Set([cwd, ...dirs.map((x) => x.dir)].map((base) => local(d.dir, base)))].filter(isDir);
    dirs.push(...found.map((dir) => ({ ...d, dir })));
    if (!found.length && bare(d.span[0]) && !d.dir.startsWith('-') && !d.loose) missing.push(d.dir);
  }
  const texts = [], notes = [];
  if (posts) {
    const kept = dirs.map((d) => d.span).filter(typed), seen = new Set();
    for (const { file, loud, mention, span } of namedFiles(command, own)) {
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
    // The script node runs and a path given to a git -c key stay on the machine too, where they exist.
    const there = (v) => [cwd, ...dirs.map((d) => d.dir)].some((base) => { try { return !!statSync(local(v, base)); } catch { return false; } });
    for (const m of all(command, String.raw`(?:(?<![${EDGE}])node(?:\.exe)?\s+|(?<=(?<![${EDGE}])git(?:\.exe)?\s+(?:-[Cc]\s+\S+\s+)*)-c\s+[\w.-]+=)${VALUE}`, 'dgi')) if (/[\\/]/.test(m[1]) && typed(m.indices[1]) && there(unquote(m[1]))) kept.push(m.indices[1]);
    // Searched again with a joined short option such as -mtext split, so the option's letter does not hide a word.
    const sent = without(command, kept);
    texts.unshift({ where: `the command, which holds ${why} and so is read as a post`, text: `${sent}\n${sent.replace(/(?<=^|\s)-([A-Za-z])(?=[^\s=-])/g, '-$1 ')}` });
  }
  const first = hit(texts);
  if (first) return first;
  if (pushes) {
    // A folder spelled two ways is read once.
    const real = (p) => { try { return realpathSync.native(p); } catch { return p; } }, read = new Set();
    for (const dir of [cwd, ...dirs.map((d) => d.dir)]) {
      if (read.has(real(dir))) continue;
      read.add(real(dir));
      let out, found;
      try { out = leaving(dir, command, list.diff, left); found = hit(out.texts, left); } catch (e) {
        if (e instanceof Late) return [deny(`rules: the commits a push from ${dir} would send could not be read in ${limit / 1000} seconds, so the push was not checked against ${path}; run it again`)];
        continue;
      }
      if (found) return found;
      if (out.lost) notes.push(`the diff of the commits in ${dir}`);
    }
    if (list.diff && [...command.matchAll(MAKES)].some((m) => { const k = simpleEnd(command, m.index + m[0].length, esc); return !/\s(?:--abort|--quit|--dry-run|--no-commit|--edit-todo|--show-current-patch|--help|-h)(?![\w-])/.test(command.slice(m.index, k).replace(/"[^"]*"|'[^']*'/g, '')) && PUSH.test(command.slice(k)); })) return [deny(`rules: the push follows a call in the same command that makes a commit, which cannot be read before the command runs, so the push was not checked against ${path}; send the push as a command of its own`)];
    if (missing.length) return [deny(`rules: the folder ${missing[0]}, which the command names, was not found, so a push from it was not checked against ${path}; name it by a path that exists when the command is typed`)];
  }
  return notes.length ? [warn(`rules: ${notes.join(', ')} could not be read, so ${notes.length === 1 ? 'its text was' : 'their texts were'} not checked against ${path}`)] : [];
}

export function main({ env = process.env, home = homedir(), platform = process.platform, stdin = () => readFileSync(0, 'utf8') } = {}) {
  const path = listPath(env, home);
  let text;
  try { text = decode(readFileSync(path)); } catch { return []; }
  try { return check(JSON.parse(stdin()), parseList(text), path, { home, platform, env }); } catch { return []; }
}

// Node resolves the entry point through symlinks, so compare with the resolved path.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    const lines = main();
    process.stdout.write(lines.length ? `${lines.join('\n')}\n` : '');
  } catch {}
}

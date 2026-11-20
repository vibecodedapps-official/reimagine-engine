#!/usr/bin/env node
// Primer's staging check, which the drift hook runs first: denies a git add or commit that puts an agent file the upstream lacks in the
// history of a repository with the local profile. It is a script of its own because primer.mjs is at its budget.
// Usage: node staged.mjs, with the hook's input on stdin. Prints a deny as the hook's JSON, or nothing.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Refusal, blob, configOf, git, isDir, loadMap, match, places, readText, repoOf, tilde } from './primer.mjs';

const AGENT_NAMES = new Set(['claude.md', 'claude.local.md', 'agents.md', '.reimagine.json', '.mcp.json']);
const AGENT_DIRS = new Set(['.claude', '.agents', '.reimagine']);

// What a here-document's body runs: the text inside $( ) and inside backticks.
const ran = (t) => { let out = '', d = 0, tick = false; for (let i = 0; i < t.length; i++) { const c = t[i]; if (c === '\\') i++; else if (!tick && c === '$' && t[i + 1] === '(') { d++; i++; out += ' '; } else if (d && c === '(') d++; else if (d && c === ')') d--; else if (!d && c === '`') { tick = !tick; out += ' '; } else if (d || tick) out += c; } return out; };
// The simple commands of a shell text, each a list of words { w, bad, sub, git }, with ( and ) kept: bad marks an expansion the
// script cannot resolve, a brace expansion among them, sub a command substitution inside a quoted word, git one that stages or
// commits with git, also in a redirect target, which sets lost and hidden; a list carries wrote where the command sends its output
// to a file, and moved where a redirect or a here-document with no command before it wrote or ran. Null for a quote
// left open or a process substitution outside quotes. A here-document's body is left out and the text after its end line is read
// on; the list carries lost, hidden where the body names a git add, stage or commit, and brings, one of the four as a git call,
// where the body may run it (an unquoted end word and a substitution in the body) or the end word cannot be read (then the rest
// is not parsed, and the list carries stopped). A here-string's word is input. A backtick outside quotes
// separates commands in sh, so what a substitution runs is read as a command of its own. In PowerShell a here-string, from @' or @"
// at the end of a line to the same quote and @ at the start of a line, is one word where it starts a word and nothing is joined to
// its closer, and null elsewhere; unless a git call takes it, it hides what its text names, as a here-document does.
const hides = (t) => /\bgit(\.exe)?\b[^\n]*\b(add|stage|commit)\b/i.test(t.replace(/[\\`^]\r?\n/g, ' '));
// A merge, a cherry-pick, a rebase or an am as the subcommand of a git call, after git's own options and the values of those that take
// one, so a word of a message is no call; used where a here-document's body may run a command or its end word cannot be read.
const BROUGHT = /\bgit(?:\.exe)?["']?(?:\s+(?:-[Cc]|--(?:git-dir|work-tree|namespace|config-env))\s+(?:"[^"\n]*"|'[^'\n]*'|[^\s"'])+|\s+-(?![Cc]\s|-(?:git-dir|work-tree|namespace|config-env)\s)\S+)*\s+(merge|cherry-pick|rebase|am)(?![\w-])(?!\s+(?:--abort|--skip|--quit|--edit-todo|--show-current-patch|--help|-h)(?![\w-]))/i;
// The operator and end word of a here-document: bare, quoted, after a backslash or after <<-, and ended by a space or an operator.
const HEREDOC = /^<<(-?)[ \t]*(?:'([^'\n]*)'|"([^"\n]*)"|\\?([^\s;&|<>()'"\\]+))(?=[\s;&|()<>]|$)/;
// Whether the << at place i stands inside $(( )) or (( )) that closes on the same line, where it shifts a number and opens no here-document.
const shifts = (s, i) => { const line = s.slice(s.lastIndexOf('\n', i) + 1, i); return line.lastIndexOf('((') > line.lastIndexOf('))') && /^[^\n]*\)\)/.test(s.slice(i)); };
function commands(s, ps) {
  const out = [];
  let words = [], cur = '', inw = false, bad = false, sub = false, skip = '';
  const end = () => {
    const git = sub && /(?:\$\(|`|[;&|])\s*["']?git\b[^)`]*\b(add|stage|commit)\b/.test(cur);
    if (inw && !skip) words.push({ w: cur, bad, sub, git });
    if (inw && skip && git) out.lost = out.hidden = true;
    // What a > sends to a file may be a patch or a ref a later call reads, so its command wrote; the null device holds nothing, and
    // after >& a descriptor number or - names a stream, not a file.
    if (inw && skip === '>' && !/^(\/dev\/null|\$null|nul)$/i.test(cur)) words.wrote = true;
    if (inw && skip === '>&' && !/^(\d+|-)$/.test(cur)) words.wrote = true;
    if (inw && skip === '<' && sub) words.wrote = true;
    [skip, cur, inw, bad, sub] = [inw ? '' : skip, '', false, false, false];
  };
  const cut = () => { end(); if (words.length) out.push(words); else if (words.wrote) { const prev = out.findLast(Array.isArray); if (prev) prev.wrote = true; else out.moved = true; } words = []; };
  for (let i = 0; i < s.length; i++) {
    const ch = s[i], nx = s[i + 1], here = ps && ch === '@' && /^(['"])[ \t]*\r?\n/.exec(s.slice(i + 1));
    if (here) {
      const open = i + here[0].length, j = s.indexOf(`\n${here[1]}@`, open), text = s.slice(open + 1, Math.max(j, open + 1)).replace(/\r$/, '');
      if (j < 0 || inw || !/^[\s;|&)}]?$/.test(s.slice(j + 3, j + 4))) return null;
      if (!/^git(\.exe)?$/.test(base(words[0]?.w ?? '')) && hides(text)) out.lost = out.hidden = true;
      if (here[1] === '"' && text.includes('$')) [bad, sub] = [true, sub || text.includes('$(')];
      [cur, i, inw] = [cur + text, j + 2, true];
    } else if (ch === "'") {
      const j = s.indexOf("'", i + 1);
      if (j < 0) return null;
      [cur, i, inw] = [cur + s.slice(i + 1, j), j, true];
    } else if (ch === '"') {
      let j = i + 1;
      for (; j < s.length && s[j] !== '"'; j++) {
        if (ps ? s[j] === '`' : s[j] === '\\' && '"\\$`'.includes(s[j + 1] ?? 'x')) { cur += s[++j] ?? ''; continue; }
        if (s[j] === '$' || (!ps && s[j] === '`')) { bad = true; sub ||= s[j] === '`' || s[j + 1] === '('; }
        cur += s[j];
      }
      if (j >= s.length) return null;
      [i, inw] = [j, true];
    } else if (ch === (ps ? '`' : '\\')) {
      if (nx !== undefined && nx !== '\n') [cur, inw] = [cur + nx, true];
      i++;
    } else if (ch === '#' && !inw) while (i + 1 < s.length && s[i + 1] !== '\n') i++;
    else if (ch === '<' || ch === '>') {
      if (nx === '(') return null;
      if (/^\d+$/.test(cur)) [cur, inw] = ['', false];
      if (ch === '<' && nx === '<' && !shifts(s, i)) {
        // A here-string's word is input, read as the target of a redirect.
        if (!ps && s[i + 2] === '<') { end(); skip = '<'; i += 2; continue; }
        const rest = s.slice(i), doc = ps ? null : HEREDOC.exec(rest), e = s.indexOf('\n', i);
        const lines = doc && e >= 0 ? s.slice(e + 1).split('\n') : [], k = lines.findIndex((l) => (doc[1] ? l.replace(/^\t+/, '') : l).replace(/\r$/, '') === (doc[2] ?? doc[3] ?? doc[4]));
        if (!doc || k < 0 || /\\\r?$/.test(s.slice(i, e))) { cut(); out.stopped = true; [out.lost, out.hidden, out.brings] = [true, out.hidden || hides(rest), out.brings ?? BROUGHT.exec(rest.replace(/[\\`^]\r?\n/g, ' '))?.[1].toLowerCase()]; return out; }
        // The body is left out of the text and the parse goes on after the end word; a body under an unquoted end word runs its substitutions.
        const body = lines.slice(0, k).join('\n'), open = doc[2] === undefined && doc[3] === undefined && !doc[0].includes('\\'), runs = open && /\$\(|`/.test(body);
        [out.lost, out.hidden] = [true, out.hidden || hides(body)];
        // An expansion in such a body can assign a variable, as $((B=2)) and ${B:=x} do.
        if (open && /[$`]/.test(body)) out.expands = true;
        if (runs) { words.wrote = true; out.brings ??= BROUGHT.exec(ran(body))?.[1].toLowerCase(); }
        end();
        s = s.slice(0, e + 1) + lines.slice(k + 1).join('\n');
        i += doc[0].length - 1;
        continue;
      }
      end();
      let amp = false;
      while ('>&|'.includes(s[i + 1] ?? 'x')) amp = s[++i] === '&' || amp;
      skip = ch === '>' && amp ? '>&' : ch;
    } else if (' \t\r\n;&|()'.includes(ch) || (!ps && ch === '`') || ('{}'.includes(ch) && (ps || (!inw && (ch === '}' || nx === undefined || ' \t\r\n'.includes(nx)))))) {
      end();
      if (!' \t\r'.includes(ch)) { cut(); if (ch === '(' || ch === ')') out.push(ch); }
    } else {
      if (ch === '$' || (!ps && ch === '{')) bad = true;
      cur += ch; inw = true;
    }
  }
  cut();
  return out;
}

const base = (w) => w.replace(/^.*[\\/]/, '').toLowerCase();
const KEYWORDS = new Set(['if', 'then', 'else', 'elif', 'do', 'while', 'until', '!', 'time', 'command', 'exec', 'nohup']);
// The programs that run the command given after their own options, read through to that command.
const WRAPS = new Set(['env', 'sudo', 'timeout', 'nice']);
const SHELLS = new Set(['sh', 'bash', 'dash', 'zsh', 'sh.exe', 'bash.exe']);
const CDS = new Set(['cd', 'chdir', 'pushd', 'popd', 'set-location', 'sl', 'push-location', 'pop-location']);
// The calls that change nothing a merge, a cherry-pick, a rebase or an am is read from: no ref, no index entry and no patch file.
// A program counts by the word as typed, with no directory part.
const READS = new Set(['echo', 'printf', 'pwd', 'true', 'ls', 'date', 'cat', 'head', 'tail', 'wc', 'grep', 'cut', 'write-host', 'write-output', 'get-location', 'get-content', 'select-object']);
const GIT_READS = new Set(['status', 'log', 'show', 'diff', 'rev-parse', 'rev-list', 'merge-base', 'describe', 'ls-files']);
const LISTS = { branch: /^(--show-current|--list|-l|-a|--all|-r|--remotes|-v|-vv)$/, remote: /^-v$/ };
const FETCH_OPTIONS = /^(--all|--prune|-p|-q|--quiet|-v|--verbose|--no-tags|--progress|--no-progress)$/;
// A git call that leaves a later one of the four readable: a subcommand that only reads, with no option that names a file to
// write and no argument the script cannot read; a branch or a remote call that only lists; and a fetch of only those options and
// names with no ':' or '+' and not 'tag', which moves remote-tracking refs and FETCH_HEAD alone, so the later call is read as those
// refs stand before it.
const keeps = (sub, args) => (GIT_READS.has(sub) ? !args.some((x) => x.bad || x.w.startsWith('--output'))
  : Object.hasOwn(LISTS, sub) ? args.every((x) => LISTS[sub].test(x.w)) : sub === 'fetch' && args.every((x) => !x.bad && (FETCH_OPTIONS.test(x.w) || !(/^-|[:+]/.test(x.w) || x.w === 'tag'))));
// The head a checkout or a switch leaves, as { rev, branch }, where it names a branch alone; null for any other form.
function switched([x, ...more]) {
  return x && !more.length && !x.bad && !x.w.startsWith('-') ? { rev: `refs/heads/${x.w}`, branch: x.w } : null;
}

// Collects each git add and git commit of a shell text with the directory it runs in, by the drift hook's grammar, following a
// cd to a plain directory; sets lost for a change of directory or a word it cannot follow, and for a work tree or a git
// directory named apart from the working directory, whose repository it still names. far says a directory is unknown, and
// hidden that the text may run an add or a commit the script does not see.
function scan(s, ps, st, top = false) {
  const list = commands(s, ps), dirs = [], { n, at } = top && list ? followed(s, ps, list) : { n: 0, at: new Map() };
  if (!list || list.lost) st.lost = true;
  if (!list || list.stopped || list.hidden) st.pushes ||= /(?<![\w-])push(?![\w-])/i.test(s);
  if (!list || list.hidden) st.hidden = true;
  if (n) st.pushes ||= list.slice(0, n).some((w) => Array.isArray(w) && w.some((x) => /\bpush\b/i.test(x.w)));
  if (list?.moved) st.moved = true;
  for (const item of (list ?? []).slice(n)) if (item === '(') dirs.push(st.dir); else if (item === ')') st.dir = dirs.pop() ?? st.dir; else analyze(item, st, at);
  // One of the four that a here-document may run, or that follows an end word the script cannot read, is a call it does not read, in a directory it does not know.
  if (list?.brings) { st.far = true; st.calls.push({ sub: list.brings, dir: st.dir, args: [], moved: true, doc: true }); }
}

// The names a shell computes or will not assign, which read back another text than the one assigned: under sh those of bash and
// of zsh, and in PowerShell its automatic variables, its constants and its typed preference variables.
const OWN_SH = /^(BASH\w*|ZSH\w*|zsh_\w*|PWD|OLDPWD|_|RANDOM|SRANDOM|SECONDS|EPOCHSECONDS|EPOCHREALTIME|UID|EUID|GID|EGID|PPID|LINENO|GROUPS|DIRSTACK|SHELLOPTS|FUNCNAME|HISTCMD|OPTIND|PIPESTATUS|pipestatus|status|argv|ARGC|ERRNO|TTY|TTYIDLE|USERNAME|signals)$/;
const OWN_PS = /^(ps\w*|is(windows|linux|macos|coreclr)|\w*preference|maximum\w*count|pwd|_|lastexitcode|matches|args|input|error|errorview|home|null|true|false|pid|host|shellid|executioncontext|enabledexperimentalfeatures|consolefilename|outputencoding|foreach|switch|this|stacktrace|myinvocation|nestedpromptlevel|event|eventargs|eventsubscriber|sender)$/i;
// A common parameter of PowerShell that writes a variable it names, in full, by its alias or by a prefix that binds it, with or without a colon.
const NAMED = /^-(?:[oewip]v|outv\w*|errorv\w*|warningv\w*|informationv\w*|p|pi\w*)(?::.*)?$/i;

// The variables a command sets to a plain text before any other call, as { n, at }: n opening commands that only assign, which
// change nothing a later call is read from, and at, the text of each name the rest of the command only reads. Under sh an
// assignment is NAME=text, one to a command and ended by ; or && or a line break; in PowerShell it is $name = 'text'.
// A name is left out, and its word stays one the script cannot resolve, where the text holds an expansion, starts with ~, which a
// shell does not expand in a value, or under sh holds a space or a pattern the shell would split or match; where the name is
// assigned twice or starts the name of another; or where a later word holds it in any form but $name alone as an argument with no
// assignment after it: in a longer word, as a command's first word, as the name a read, a loop or another assignment writes, or in
// a text given to a shell. PowerShell names count in any letter case. A name the shell will not assign or computes itself, as PWD,
// $_ and RANDOM, is not followed. An IFS assignment opens nothing, since it changes how a later unquoted word splits.
function followed(s, ps, list) {
  const at = new Map(), twice = new Set(), key = (name) => (ps ? name.toLowerCase() : name);
  const set = (name, text) => { if (at.has(key(name))) twice.add(key(name)); at.set(key(name), text); };
  const one = ps ? /^\s*\$(\w+)[ \t]*=[ \t]*(?:'([^'\r\n]+)'|"([^"$`\r\n]+)")[ \t]*(?:;|\r?\n|$)/
    : /^\s*((?!GIT_|IFS=)[A-Za-z_]\w*)=(?:'([^'\r\n]+)'|"([^"$`\\\r\n]+)"|([^\s;&|()<>`$"'\\*?[\]{}~#!]+))[ \t]*(?:;|&&|\r?\n|$)/;
  let n = 0;
  for (let m, rest = s; (m = one.exec(rest)); rest = rest.slice(m[0].length), n++) {
    const text = m.slice(2).find((x) => x !== undefined), words = list[n];
    if (!Array.isArray(words) || words.wrote || (!ps && !(words.length === 1 && !words[0].bad && !words[0].sub && words[0].w === `${m[1]}=${text}`))) break;
    set(m[1], (ps ? OWN_PS : OWN_SH).test(m[1]) || text.startsWith('~') || (!ps && /[\s*?[\]]/.test(text)) ? null : text);
  }
  // A name that starts another is dropped with it, since the words of a text lose where a quote ended: "$A"B reads as $AB.
  for (const a of [...at.keys()]) for (const b of [...at.keys()]) if (b.length > a.length && b.startsWith(a)) { at.delete(a); at.delete(b); }
  for (const name of at.keys()) {
    const held = new RegExp(`(?<![A-Za-z0-9_])${name}(?![A-Za-z0-9_])`, ps ? 'i' : ''), use = new RegExp(`^\\$(?:${name}|\\{${name}\\})$`, ps ? 'i' : '');
    const read = (words, j) => words[j].bad && !words[j].sub && use.test(words[j].w) && j > 0 && !/^[-+*/%?]*=/.test(words[j + 1]?.w ?? '');
    if (list.hidden || list.stopped || list.expands || twice.has(name) || at.get(name) === null || list.slice(n).some((words) => Array.isArray(words) && words.some((x, j) => held.test(x.w) && !read(words, j)))) at.delete(name);
  }
  return { n, at };
}

// A set that exports nothing: -e, -u and -x, or -o with the name of one of them. Any other, such as -a, -o allexport or -k, exports the assignments that follow.
const setOnly = (rest) => {
  for (let j = 0; j < rest.length; j++) {
    const { w, bad, sub } = rest[j];
    if (bad || sub) return false;
    if (/^[-+][eux]+$/.test(w)) continue;
    const name = rest[j + 1];
    if (!/^[-+][eux]*o$/.test(w) || !name || name.bad || name.sub || !/^(pipefail|errexit|nounset|xtrace)$/.test(name.w)) return false;
    j++;
  }
  return true;
};

function analyze(typed, st, vars = new Map()) {
  // Under sh an expansion in braces or brackets may assign a name it does not spell, as $[$x=1], ${a[$x=1]} and ${(P)x::=v} do; ${name} alone only reads.
  if (st.sh && typed.some((x) => /\$[[{]/.test(x.w) && !/^\$\{\w+\}$/.test(x.w))) vars.clear();
  const words = Object.assign(typed.map((x) => { const m = x.bad && vars.size ? /^\$\{?(\w+)\}?$/.exec(x.w) : null, k = m && (st.sh ? m[1] : m[1].toLowerCase()); return m && vars.has(k) ? { ...x, w: vars.get(k), bad: false } : x; }), { wrote: typed.wrote });
  if (words.some((x) => x.git)) st.lost = st.hidden = true;
  if (words.some((x) => /\bGIT_(DIR|WORK_TREE|INDEX_FILE)\b/.test(x.w))) st.lost = true;
  const at = (dir, x) => { if (!x || x.bad) { st.lost = st.far = true; return dir; } return resolve(dir, tilde(st.msys ? x.w.replace(/^\/([A-Za-z])(?=\/|$)/, '$1:/') : x.w, st.home)); };
  let i = 0, dir = st.dir;
  for (; i < words.length; i++) {
    const w = words[i].w, b = base(w);
    const tree = /^GIT_(?:WORK_TREE=(.*)|DIR=(.*))$/.exec(w);
    if (tree) dir = at(st.dir, { ...words[i], w: tree[1] ?? `${tree[2]}/..` });
    if (/^[A-Za-z_]\w*=/.test(w) || KEYWORDS.has(b)) continue;
    // Through the PowerShell tool a call may stand on the right of an assignment to a variable.
    if (!st.sh && /^\$[\w:]+$/.test(w) && /^[-+]?=$/.test(words[i + 1]?.w ?? '')) { i++; continue; }
    if (!WRAPS.has(b)) break;
    while (words[i + 1]?.w.startsWith('-')) {
      const t = words[++i].w;
      if (b === 'env' && (t === '-u' || t === '-S')) i++;
      else if (b === 'env' && t === '-C') dir = at(dir, words[++i]);
      else if (b === 'env' && t.startsWith('--chdir=')) dir = at(dir, { ...words[i], w: t.slice(8) });
      else if (b === 'sudo' && /^-[ugUCDhprtT]$/.test(t)) i++;
      else if (b === 'timeout' && /^-[ks]$/.test(t)) i++;
      else if (b === 'nice' && t === '-n') i++;
    }
    // timeout takes its duration before the command.
    if (b === 'timeout') i++;
  }
  if (i >= words.length) { st.pushes ||= words.some((x) => /\bpush\b/i.test(x.w)); if (words.wrote || words.some((x) => x.sub)) st.moved = true; return; }
  const b = base(words[i].w), rest = words.slice(i + 1);
  // What a merge, a cherry-pick, a rebase or an am brings is read before the command runs, so a call that runs before it in the
  // same command may change it. A change of directory, a git add, a git commit and a call that only reads change nothing that is
  // read, the first checkout or switch of the command, to a branch named alone, says which head the later call is read against,
  // a fetch leaves it read as the remote-tracking refs stand, and the text a shell is given has its own calls judged: these leave
  // a later one readable. A call that writes a file or holds a command substitution, an assignment before the program included,
  // leaves no later call readable, whatever the call, since the substitution may run any call.
  const plain = !words.wrote && !words.some((x) => x.sub);
  let still = CDS.has(b);
  if (SHELLS.has(b)) {
    let j = 0;
    for (; j < rest.length && /^[-+]/.test(rest[j].w); j++) if (rest[j].w === '-o' || rest[j].w === '+o') j++;
    if (rest.slice(0, j).some((x) => /^-[A-Za-z]*c[A-Za-z]*$/.test(x.w)) && rest[j]) {
      if (rest[j].bad) st.lost = st.hidden = true; else { const keep = st.dir; st.dir = dir; scan(rest[j].w, false, st); st.dir = keep; still = true; }
    }
  } else if (CDS.has(b)) {
    // CDPATH sends a cd to a relative name that does not start with a dot to a folder of that name under another one.
    const sent = st.cdpath && !/^(\.{0,2}[\\/]|\.{1,2}$|~|[A-Za-z]:[\\/])/.test(rest[0]?.w ?? '');
    if (sent || b.startsWith('pop') || rest.length !== 1 || rest[0].w.startsWith('-')) st.lost = st.far = true; else st.dir = at(st.dir, rest[0]);
  } else if (b === 'git' || b === 'git.exe') {
    let j = 0;
    for (; j < rest.length && rest[j].w.startsWith('-'); j++) {
      const t = rest[j].w;
      if (t === '-C') dir = at(dir, rest[++j]);
      else if (/^--(work-tree|git-dir)/.test(t)) {
        const v = t.includes('=') ? { ...rest[j], w: t.slice(t.indexOf('=') + 1) } : rest[++j];
        [st.lost, dir] = [true, at(dir, v && t.startsWith('--git-dir') ? { ...v, w: `${v.w}/..` } : v)];
      }
      // An alias given with -c may push under another name.
      else if (t === '-c' || t === '--namespace' || t === '--config-env') { j++; st.pushes ||= t === '-c' && /^alias\.[^=]*=.*\bpush\b/i.test(rest[j]?.w ?? ''); }
    }
    const sub = rest[j]?.w === 'stage' ? 'add' : rest[j]?.w, args = rest.slice(j + 1), first = args[0]?.w;
    st.pushes ||= sub === 'push' || words.some((x) => x.sub && /(?:\$\(|`|[;&|])\s*["']?git\b[^)`]*\bpush\b/i.test(x.w));
    if (sub === 'add' || (sub === 'commit' && !args.some((x) => ['--dry-run', '--help', '-h'].includes(x.w)))) { st.calls.push({ sub, dir, args }); still = true; }
    // A call for help, and one that ends or steps over a merge under way, bring nothing in.
    else if (brings(sub) && first !== '--help' && first !== '-h' && !ends(first)) { st.calls.push({ sub, dir, args, moved: st.moved, head: st.head, fetched: st.fetched, sh: st.sh, msys: st.msys, home: st.home }); still = true; }
    else if (plain && (sub === 'checkout' || sub === 'switch') && !st.head && switched(args)) {
      st.head = switched(args);
      still = true;
    } else {
      still = plain && keeps(sub, args);
      if (still && sub === 'fetch') st.fetched = true;
    }
  } else if (b === 'xargs' && rest.some((x) => /^git(\.exe)?$/.test(base(x.w)))) st.lost = st.hidden = true;
  // A command handed to another shell is not read: one that names an add, stage or commit, or holds an expansion, may run one.
  else if (/^(pwsh|powershell|cmd)(\.exe)?$/.test(b) && (rest.some((x) => x.bad) || hides(rest.map((x) => x.w).join(' ')))) st.lost = st.hidden = true;
  // set changes the options of sh, and only the ones in setOnly leave the later call read; in PowerShell the word is a command that writes a variable.
  else still = plain && (READS.has(words[i].w.toLowerCase()) || (st.sh && words[i].w === 'set' && setOnly(rest)));
  // A call that only reads or changes directory may still write a variable whose name no word spells: printf -v, and in PowerShell a common parameter that names one.
  if (still && (st.sh ? b === 'printf' && (rest[0]?.bad || rest[0]?.w.startsWith('-v')) : (READS.has(b) || CDS.has(b)) && rest.some((x) => NAMED.test(x.w)))) vars.clear();
  // A push is read from a git call; the word alone counts in any other program, which may be a script or an eval, in an assignment, in a
  // substitution that names git, and, in scan(), in a text not parsed to its end, since each may push out of sight.
  if (!/^git(\.exe)?$/.test(b) && !(SHELLS.has(b) && still) && !CDS.has(b)) st.pushes ||= words.some((x) => /\bpush\b/i.test(x.w));
  // A call that leaves no later one readable may also rewrite a followed variable, with no word that spells it.
  if (!still || !plain) { st.moved = true; vars.clear(); }
}

// The commands that bring commits made elsewhere into the history, each with the options that take the next word as a value; any
// other option is read as a flag, so a value taken for a commit is one git cannot read, which denies.
const BRINGS = {
  merge: /^(-[mFsX]|--(message|file|strategy|strategy-option|into-name|cleanup))$/,
  'cherry-pick': /^(-[mX]|--(mainline|strategy|strategy-option|cleanup))$/,
  rebase: /^(-[sX]|--(strategy|strategy-option|whitespace|empty))$/,
  am: /^--(whitespace|empty|quoted-cr|exclude|include)$/,
};
const brings = (sub) => Object.hasOwn(BRINGS, sub);
// An option that runs a command, hands the steps to an editor, moves the paths of a patch or names another form of patch leaves
// the call unread.
const UNREAD = { rebase: /^(-[qvnfrpmk]*[xi]|--exe?c?(=|$)|--in[a-z]*$)/, am: /^(--(directory|patch-format)(=|$)|-p\d*$)/ };
// A call that ends or steps over a merge, a cherry-pick, a rebase or an am under way brings nothing in.
const ENDS = new Set(['--abort', '--skip', '--quit', '--edit-todo', '--show-current-patch']);
const ends = (w) => ENDS.has(w) || (typeof w === 'string' && w.startsWith('--show-current-patch='));

// What a patch in git's form holds: the files it creates, the target of a rename among them, and the lines it adds to each ignore
// file; null for a new file or a target whose header the script cannot read.
function patched(c, dir, text, base = 'HEAD') {
  const paths = [], ignores = [], blocks = text.replace(/\r\n/g, '\n').split(/^diff --git /m).slice(1);
  for (const b of blocks) {
    // The header ends where the content starts: past it a block of a mailbox holds the next message, whose words are no header.
    const cut = b.search(/^(@@ |--- |Binary files |GIT binary patch|-- $)/m), head = cut < 0 ? b : b.slice(0, cut);
    const named = /^a\/(.+) b\/\1\n/.exec(b)?.[1], to = /^(?:rename|copy) to (.+)$/m.exec(head)?.[1], f = to ?? named ?? b.split('\n')[0].replace(/"$/, '');
    if (to?.startsWith('"')) return null;
    if (to) paths.push(to);
    if (/^new file mode /m.test(head)) { if (!named) return null; paths.push(named); }
    if (isIgnore(f)) ignores.push({ file: f, now: (b.match(/^\+(?!\+\+ ).*$/gm) ?? []).map((l) => l.slice(1)).join('\n'), was: blob(c, dir, `${base}:${f}`) });
  }
  return { paths, ignores, blocks: blocks.length };
}

// The revisions a name holds, a range two, each cut before its first ~, ^ or :; relative where one names the head or a ref of it.
const sides = (n) => n.split(/\.{2,3}/).map((x) => x.split(/[~^:]/)[0]);
const relative = (n) => sides(n).some((x) => x === '' || x.includes('@') || /^(\w+_)?HEAD$/i.test(x));
const atFetch = (n) => sides(n).some((x) => /^FETCH_HEAD$/i.test(x));

// What a merge, a cherry-pick, a rebase or an am would add to the history: the files the commits it names add, a rename read as a
// new file, and the lines they add to an ignore file; null where the command does not say which commits, git cannot read them, or
// another call runs before it in the same command. A merge or a rebase brings each commit that a commit it names holds and the
// head does not, with the upstream of the branch where it names none; a cherry-pick brings each commit it names and each commit
// of a range, a merge among them read against each parent; an am brings what its patch files hold, and a file with no file header
// is unread. A --continue is read as the commit it makes, and a call that ends one brings nothing new.
function brought(c, { sub, dir, args, moved, head, fetched, sh, msys, home }, top) {
  if (moved) return null;
  const after = !!head;
  const named = [];
  for (let i = 0; i < args.length; i++) {
    const { w, bad } = args[i];
    if (bad || UNREAD[sub]?.test(w)) return null;
    if (ends(w)) return { paths: [], ignores: [] };
    if (w === '--continue' || (sub === 'am' && (w === '--resolved' || w === '-r'))) return after ? null : planOf(c, { sub: 'commit', dir, args: [] }, top);
    if (sub === 'rebase' && w === '--onto') { if (!args[++i] || args[i].bad) return null; named.push(args[i].w); }
    else if (sub === 'rebase' && w.startsWith('--onto=')) named.push(w.slice(7));
    else if (BRINGS[sub].test(w)) i++;
    else if (w === '-' && sub !== 'am') named.push('@{-1}');
    else if (!w.startsWith('-')) named.push(w);
  }
  // A name that starts with a dash would reach git as an option.
  if (named.some((n) => n.startsWith('-'))) return null;
  // After a switch the index and the files are the new head's, and HEAD, @{upstream} and the like name the new head's: an am, a
  // --continue and a name relative to the head are unread. A fetch rewrote FETCH_HEAD.
  if (after && (sub === 'am' || named.some(relative))) return null;
  if (fetched && named.some(atFetch)) return null;
  // The form of the output is pinned, whatever the user's configuration sets.
  const out = (...a) => { const r = git(c, dir, ['-c', 'core.quotepath=off', '-c', 'diff.noprefix=false', '-c', 'diff.mnemonicPrefix=false', '-c', 'diff.relative=false', ...a]); return r.status === 0 ? r.stdout : null; };
  const log = ['log', '--format=', '-m', '--no-renames', '--no-color', '--no-ext-diff', '--no-textconv'], ignored = ':(top,glob)**/.gitignore';
  // Each commit is read by itself, a merge against each parent, so a file that one commit adds and a later one removes is told.
  const read = (how, revs, base) => {
    const names = out(...log, ...how, '--name-only', '--diff-filter=A', '-z', '--end-of-options', ...revs, '--'), patch = names === null ? null : out(...log, ...how, '-p', '--end-of-options', ...revs, '--', ignored), p = patch === null ? null : patched(c, dir, patch, base);
    return p && { paths: names.split('\0').map((x) => x.replace(/^\n+/, '')).filter(Boolean), ignores: p.ignores };
  };
  // A ~ and, under Git Bash, a drive path such as /c/work are the shell's to place.
  const file = (f) => { try { const p = patched(c, dir, readFileSync(resolve(dir, sh ? tilde(msys ? f.replace(/^\/([A-Za-z])(?=\/|$)/, '$1:/') : f, home) : f), 'utf8')); return p?.blocks ? p : null; } catch { return null; } };
  // After a checkout or a switch in the same command the call runs on the head that leaves, or on the head as it stands where the
  // switch fails, so it is read against HEAD and the head the switch names; a head git cannot read is unread.
  const known = (rev) => out('rev-parse', '-q', '--verify', `${rev}^{commit}`) !== null;
  if (head && !known(head.rev)) return null;
  const bases = [{ rev: 'HEAD', up: '@{upstream}' }, ...(head ? [{ rev: head.rev, up: `${head.branch}@{upstream}` }] : [])];
  // With no commit named, a merge or a rebase takes the upstream of the branch each base is on; where the switch fails and the
  // branch as it stands has none, git brings nothing.
  const ups = (b) => (head && b.up === '@{upstream}' && !known(b.up) ? [] : [b.up]);
  const plans = bases.flatMap((b) => {
    if (sub === 'am') return named.length ? named.map(file) : [null];
    if (sub === 'cherry-pick') return [named.length ? read(['--no-walk=unsorted'], named, b.rev) : null];
    return (named.length || args.some((x) => x.w === '--root') ? named : ups(b)).map((r) => r && read([], [`${b.rev}..${r}`], b.rev));
  });
  return plans.every(Boolean) ? { paths: plans.flatMap((p) => p.paths), ignores: plans.flatMap((p) => p.ignores) } : null;
}

const COMMIT_VALUE = new Set(['message', 'file', 'reuse-message', 'reedit-message', 'fixup', 'squash', 'author', 'date', 'template', 'cleanup', 'trailer']);
const COMMIT_FLAG = new Set(['quiet', 'verbose', 'signoff', 'no-signoff', 'no-verify', 'verify', 'no-edit', 'edit', 'allow-empty', 'allow-empty-message',
  'reset-author', 'no-gpg-sign', 'gpg-sign', 'status', 'no-status', 'no-post-rewrite', 'untracked-files', 'short', 'branch', 'long', 'porcelain', 'null']);
const COMMIT_PASS = { all: '-a', include: '-i', only: '-o', amend: '--amend' };
const isIgnore = (p) => p.split('/').at(-1) === '.gitignore';

// What one git add or git commit would put in the index or the commit, as top-level paths with the ignore files it changes, or
// what a command of BRINGS would bring; null when the call cannot be resolved.
function planOf(c, call, top) {
  const { sub, dir, args } = call;
  if (brings(sub)) return brought(c, call, top);
  const opts = [], specs = [];
  let dashed = false;
  for (let i = 0; i < args.length; i++) {
    const { w, bad } = args[i];
    if (dashed || !w.startsWith('-') || w === '-') { if (bad) return null; specs.push(w); continue; }
    if (w === '--') { dashed = true; continue; }
    if (sub === 'add') {
      if (/^--(patch|interactive|edit|pathspec-from-file)(=|$)/.test(w) || /^-[^-]*[pie]/.test(w) || bad) return null;
      if (/^-[^-]*[nh]|^--(dry-run|help)$/.test(w)) return { paths: [], ignores: [] };
      opts.push(w);
    } else if (w.startsWith('--')) {
      const name = w.slice(2).split('=')[0];
      if (COMMIT_VALUE.has(name)) { if (!w.includes('=')) i++; } else if (COMMIT_PASS[name] && !w.includes('=')) opts.push(COMMIT_PASS[name]);
      else if (!COMMIT_FLAG.has(name)) return null;
    } else {
      for (let k = 1; k < w.length; k++) {
        const f = w[k];
        if ('mFCct'.includes(f)) { if (k === w.length - 1) i++; break; }
        if ('uS'.includes(f)) break;
        if ('aio'.includes(f)) opts.push(`-${f}`);
        else if (!'qvsnez'.includes(f)) return null;
      }
    }
  }
  const run = (...a) => git(c, dir, a), whole = sub === 'add' || opts.some((o) => o !== '--amend') || specs.length > 0, known = (...a) => run('ls-files', '--error-unmatch', ...a, '--', ...specs).status === 0;
  let r, paths;
  if (sub === 'add') {
    if ((r = run('-c', 'core.quotepath=off', 'add', '--dry-run', ...opts, '--', ...specs)).status !== 0) return null;
    paths = [...r.stdout.matchAll(/^add '(.*)'$/gm)].map((m) => m[1]);
  } else if (!whole) {
    // A commit of the index alone: its dry run would rewrite the index, so the staged names are read instead.
    if ((r = run('diff', '--cached', '--name-only', '--diff-filter=d', '-z')).status !== 0) return null;
    paths = r.stdout.split('\0').filter(Boolean);
  } else {
    // Status 1 is nothing to commit, or a path that neither the index nor HEAD holds, which leaves the commit unknown.
    if ((r = run('commit', '--dry-run', '--porcelain', '-z', ...opts, '--', ...specs)).status > 1 || (r.status === 1 && specs.length && !known('--with-tree=HEAD') && !known())) return null;
    paths = records(r.stdout).filter((x) => !' ?!D'.includes(x.xy[0])).map((x) => x.path);
  }
  return { paths, ignores: paths.filter(isIgnore).map((f) => ({ file: f, now: (whole ? readText(join(top, f)) : '') + (sub === 'commit' ? `\n${blob(c, dir, `:${f}`)}` : ''), was: blob(c, dir, sub === 'add' ? `:${f}` : `HEAD:${f}`) })) };
}

// The records of a porcelain v1 -z listing; a rename or a copy carries its old path as the next field, which is skipped.
function records(text) {
  const out = [], f = text.split('\0');
  for (let k = 0; k < f.length; k++) if (f[k].length > 3) { out.push({ xy: f[k].slice(0, 2), path: f[k].slice(3) }); if (/[RC]/.test(f[k].slice(0, 2))) k++; }
  return out;
}

// A name counts in any letter case: the host loads claude.md where the file system ignores case, and the name shows what the profile hides.
const isAgent = (p) => { const s = p.toLowerCase().split('/'); return AGENT_NAMES.has(s.at(-1)) || s.some((x) => AGENT_DIRS.has(x)); };
const namesAgent = (l) => !l.startsWith('#') && l.replace(/^!/, '').toLowerCase().split('/').some((x) => AGENT_NAMES.has(x) || AGENT_DIRS.has(x));

// The remote a branch tracks, else origin, else the only remote, else null; the current branch where none is named.
function remoteOf(c, repo, branch) {
  const row = git(c, repo.top, ['for-each-ref', '--format=%(HEAD)%(refname:lstrip=2) %(upstream:remotename)', 'refs/heads']).stdout.split('\n').map((l) => /^(.)(\S+) (.*)$/.exec(l)).find((m) => m && (branch === undefined ? m[1] === '*' : m[2] === branch));
  return row?.[3] || (repo.names.includes('origin') ? 'origin' : new Set(repo.names).size === 1 ? repo.names[0] : null);
}

// The upstream's tree: refs/remotes/<remote>/HEAD of the remote the current branch tracks, else origin, else the only remote.
function upstream(c, repo) {
  const name = remoteOf(c, repo), ref = `refs/remotes/${name}/HEAD`;
  if (!name) return { why: 'no remote names it' };
  return git(c, repo.top, ['rev-parse', '-q', '--verify', `${ref}^{tree}`]).status === 0 ? { ref } : { why: `${ref} cannot be read` };
}

// The agent files among paths that the upstream's tree does not hold, and how a reason says so.
function lacking(c, repo, agents) {
  const tree = agents.length ? upstream(c, repo) : {};
  const held = new Set(tree.ref ? git(c, repo.top, ['ls-tree', '-r', '-z', '--name-only', '--full-tree', tree.ref, '--', ...agents]).stdout.split('\0') : []);
  return { missing: agents.filter((x) => !held.has(x)), lack: tree.ref ? `which ${tree.ref} does not hold` : `while the upstream's tree is unknown (${tree.why})` };
}

// The deny reason for a call in a local repository, or null when it adds no agent file the upstream lacks. Without a plan the call
// counts as staging every file git does not ignore, and what each plan of parts holds, since a forced add stages a file git ignores.
function verdict(c, repo, plan, parts = []) {
  let all = plan;
  if (!all) {
    const r = git(c, repo.top, ['status', '--porcelain=v1', '-z', '-uall']);
    if (r.status !== 0) throw new Error(`git status exited ${r.status}`);
    const paths = records(r.stdout).filter((x) => x.xy[0] !== 'D' && x.xy !== ' D').map((x) => x.path);
    all = { paths: [...paths, ...parts.flatMap((p) => p.paths)], ignores: [...paths.filter(isIgnore).map((f) => ({ file: f, now: `${readText(join(repo.top, f))}\n${blob(c, repo.top, `:${f}`)}`, was: blob(c, repo.top, `HEAD:${f}`) })), ...parts.flatMap((p) => p.ignores)] };
  }
  const agents = [...new Set(all.paths.filter(isAgent))].sort();
  const lines = [...new Set(all.ignores.flatMap((g) => {
    const was = new Set(g.was.split(/\r?\n/).map((l) => l.trim()));
    return [...new Set(g.now.split(/\r?\n/).map((l) => l.trim()))].filter((l) => l && namesAgent(l) && !was.has(l)).map((l) => `the line ${l} in ${g.file}, which names an agent file`);
  }))];
  const { missing, lack } = lacking(c, repo, agents);
  if (!missing.length && !lines.length) return null;
  const items = [...(missing.length ? [`${missing.join(', ')}, ${lack}`] : []), ...lines];
  return `primer: ${repo.top} has the local profile, which keeps agent files out of its history; ${plan ? ''
    : 'the command cannot be resolved, so it counts as staging every file git does not ignore; '}the call would add ${items.join('; ')}`;
}

// What both checks read of a hook's input: the calls of its command, the map, and each local repository a call runs in with the
// directory it was named by. Null where the command holds no call the checks read or the map holds no local repository; the map
// is null where it cannot be read.
function read(c, input, after = false) {
  const own = join(configOf(c, input), 'reimagine-primer'), command = input.tool_input?.command;
  if (!existsSync(own) || typeof command !== 'string' || !/commit|[Gg][Ii][Tt][\s\S]*(?:add|stage|merge|cherry-pick|rebase|\bam\b)/.test(command)) return null;
  const ps = input.tool_name === 'PowerShell', cwd = isDir(input.cwd) ? input.cwd : c.cwd;
  const st = { dir: cwd, home: c.home, msys: c.platform === 'win32' && !ps, calls: [], lost: false, far: false, hidden: false, sh: !ps, moved: false, head: undefined, fetched: false, pushes: false, cdpath: /cdpath/i.test(command) || (!ps && !!c.env.CDPATH) };
  scan(command, ps, st, true);
  if (!st.calls.length && !st.hidden) return null;
  const path = places(c, own).map, map = (() => { try { return loadMap(path, c.home); } catch (e) { if (e instanceof Refusal) return null; throw e; } })();
  if (!map) return { st, path, map, repos: [] };
  if (!map.repos.some((e) => e.profile === 'local')) return null;
  if (st.hidden || st.calls.some((x) => !isDir(x.dir))) st.lost = st.far = true;
  const dirs = new Set(st.calls.length ? st.calls.map((x) => x.dir) : [cwd]);
  // After a call the hook's directory may be the one the call's own cd left, so it is read as well.
  if (after) dirs.add(cwd);
  // Where a directory is unknown the call may run in any local repository, so each one the map holds is checked too.
  if (st.far) for (const e of [{ path: cwd }, ...map.repos.filter((x) => x.profile === 'local')]) dirs.add(e.path);
  const repos = [...dirs].map((dir) => ({ dir, repo: isDir(dir) && repoOf(c, dir) })).filter((x) => x.repo && match(map, x.repo, c.platform)?.profile === 'local');
  return { st, path, map, repos };
}

export const deny = (reason) => JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });
export function staged(c, input) {
  const found = read(c, input);
  if (!found) return [];
  const { st, path, map, repos } = found;
  if (!map) return [deny(`primer: ${path} is not a primer map, so the staging check cannot tell which repositories have the local profile and denies every git add and git commit, and each git merge, cherry-pick, rebase and am that starts or continues one; restore the file from a copy or from the store's history, or correct it to the form primer map writes`)];
  for (const { dir, repo } of repos) {
    // The calls of one directory are checked by what they would add together when each one resolves: an add extends the index a
    // later commit takes, and a commit holds no more than the index and what it names.
    // After a switch to a branch whose remote is not the current branch's, the upstream read is the wrong remote's, so the call is unread.
    const calls = st.calls.filter((x) => st.far || x.dir === dir), plans = calls.map((x) => (x.head && remoteOf(c, repo, x.head.branch) !== remoteOf(c, repo) ? null : planOf(c, { ...x, dir }, repo.top))), whole = !st.lost && plans.length && plans.every(Boolean);
    // What an unread merge brings is not in the work tree, so no count of the files there stands in for it.
    const blind = calls.find((x, i) => brings(x.sub) && !plans[i]);
    if (blind?.doc) return [deny(`primer: ${repo.top} has the local profile, which keeps agent files out of its history; a git ${blind.sub} that a here-document runs or hides is not read, so the call is denied; run it as a command of its own`)];
    if (blind) return [deny(`primer: ${repo.top} has the local profile, which keeps agent files out of its history; what git ${blind.sub} would bring in cannot be read from the command, so the call is denied; a commit named by a branch, a tag or an id, or a patch given as a file, can be read where each call before it in the command is a cd, a git add, a git commit, a git fetch, a checkout or a switch to a branch, or a call that only reads; an am, a --continue and a name read from the head after a switch, and FETCH_HEAD after a fetch, run as a command of their own`)];
    const reason = whole ? verdict(c, repo, { paths: plans.flatMap((p) => p.paths), ignores: plans.flatMap((p) => p.ignores) }) : verdict(c, repo, null, plans.filter(Boolean));
    if (reason) return [deny(reason)];
  }
  return [];
}

// After the call, what the check before it could not see: a file the call itself made and committed. In each local repository the
// command commits in, the newest hundred commits that HEAD holds and no remote does are read for the agent files they add and the
// upstream lacks, a merge against its first parent, and each is said to the session, since the commit is made. Where the command
// pushes, the commit is under a remote-tracking ref by now, so the read is against the upstream's default branch alone, or, where
// that is unknown, against nothing. A command that only stages is left to the commit that follows.
export function committed(c, input) {
  const found = read(c, input, true), seen = new Set(), said = [];
  if (!found?.map || !(found.st.hidden || found.st.calls.some((x) => x.sub !== 'add'))) return [];
  for (const { repo } of found.repos) {
    if (seen.has(repo.top)) continue;
    seen.add(repo.top);
    const pushes = found.st.pushes, ref = pushes ? upstream(c, repo).ref : undefined;
    const r = git(c, repo.top, ['-c', 'core.quotepath=off', '-c', 'log.showRoot=true', 'log', '--format=%x01%h%x02', '--diff-merges=first-parent', '--no-renames', '--diff-filter=A', '--name-only', '-z', '--max-count=100', 'HEAD', ...(pushes ? (ref ? ['--not', ref] : []) : ['--not', '--remotes'])]);
    if (r.status !== 0) continue;
    const adds = r.stdout.split('\x01').slice(1).map((p) => p.split('\x02')).map(([id, names = '']) => ({ id, paths: names.split('\0').map((x) => x.replace(/^\n+/, '')).filter(isAgent) }));
    const { missing, lack } = lacking(c, repo, [...new Set(adds.flatMap((a) => a.paths))].sort());
    const items = adds.map((a) => ({ id: a.id, paths: [...new Set(a.paths)].filter((x) => missing.includes(x)).sort() })).filter((a) => a.paths.length);
    if (items.length) said.push(`primer: ${repo.top} has the local profile, which keeps agent files out of its history; ${items.map((a) => `commit ${a.id} adds ${a.paths.map((x) => x.replace(/[\u0000-\u0008\u000a-\u001f\u007f]/g, '')).join(', ')}`).join('; ')}, ${lack}; the check before a call reads the work tree as it stands then, so it does not see a file the call itself makes; ${pushes ? 'the command pushes, so a remote may already hold' : 'no remote holds'} ${items.length === 1 ? 'the commit' : 'these commits'}${pushes ? '' : ' yet'}`);
  }
  return said.length ? [JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: said.join('\n') } })] : [];
}

// Node resolves the entry point through symlinks, so compare with the resolved path. On an error of its own the script prints a
// deny that gives the error and exits 2.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    const input = (() => { try { const v = JSON.parse(readFileSync(0, 'utf8')); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; } })();
    const lines = staged({ env: process.env, platform: process.platform, home: homedir(), cwd: process.cwd() }, input);
    process.stdout.write(lines.length ? `${lines.join('\n')}\n` : '');
  } catch (e) {
    process.stdout.write(`${deny(`primer: the staging check failed, so the call is denied: ${e?.message || e}`)}\n`);
    process.exitCode = 2;
  }
}

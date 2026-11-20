#!/usr/bin/env node
// Primer's drift hook, the PreToolUse and PostToolUse hook for Bash and PowerShell calls. Usage: node drift.mjs, with the hook's
// input on stdin. After a call it prints only what the staging check finds in the commits the call may have made.
// It first runs the staging check of scripts/staged.mjs and prints its deny; an error of that check denies the call, as a script
// of the plugin that cannot be loaded does, where primer's own directory exists, for a command whose text that check would look
// at. Then it acts only when the command runs `git commit`: for each repository the command commits in whose hub opens with the
// marker, it reads the hub, the tracked nested CLAUDE.md files, rules and skills, `git ls-files` for their globs and the changed
// file list. The commit check never reads git history and the hook never writes a file. Prints at most one JSON object and exits
// 0, an error of the commit check printing nothing:
//   deny:    a file is over its line cap, a nested CLAUDE.md or rule is over its character cap, the hub names a missing path,
//            a paths value cannot be read or matches no tracked file, or a skill has no description
//   advise:  additionalContext names rules, skills and nested files that cover changed paths and are not changed
//   nothing: not a commit, no opted-in hub, or no finding
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// The plugin's scripts are loaded by a call and not by an import statement, and only for a command the checks may read: any
// other shell call costs the start of Node and no more, and where a script cannot load the hook still runs and can deny.
let git, hubOf, isDir, deny, staged, committed;
async function load() {
  ({ git, hubOf, isDir } = await import('../scripts/primer.mjs'));
  ({ deny, staged, committed } = await import('../scripts/staged.mjs'));
}
const READS = /commit|[Gg][Ii][Tt][\s\S]*(?:add|stage|merge|cherry-pick|rebase|\bam\b)/;

export const CAPS = { hub: { lines: 60 }, nested: { lines: 60, chars: 40000 }, rules: { lines: 200, chars: 40000 }, skills: { lines: 150 } };

const linesOf = (text) => { const l = text.split('\n'); if (l.at(-1) === '') l.pop(); return l.map((x) => x.replace(/\r$/, '')); };
const bytewise = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
const names = (dir) => { try { return readdirSync(dir); } catch { return []; } };

// The findings of a file over its caps. Characters are the bytes that are no UTF-8 continuation byte, whatever the locale.
function over(root, f, cap) {
  let buf;
  try { buf = readFileSync(join(root, f)); } catch { return []; }
  const n = linesOf(buf.toString('latin1')).length, chars = cap.chars ? buf.reduce((k, b) => k + ((b & 0xc0) !== 0x80), 0) : 0;
  return [...(n > cap.lines ? [`${f} has ${n} lines, over its cap of ${cap.lines}`] : []), ...(chars > cap.chars ? [`${f} has ${chars} characters, over its cap of ${cap.chars}`] : [])];
}

// The backticked tokens of the hub's opening paragraph that look like a path, each once.
function tokens(text) {
  const l = linesOf(text), h = l.findIndex((x) => x.startsWith('# ')), from = h < 0 ? 1 : h + 1, end = l.findIndex((x, i) => i >= from && x.startsWith('## '));
  const parts = l.slice(from, end < 0 ? l.length : end).join(' ').split('`'), out = [];
  // Every second part sits between two backticks; a last one with no closing backtick is none.
  for (let i = 1; i < parts.length - 1; i += 2) {
    const t = parts[i];
    if (t && (t.includes('/') || t.endsWith('.md')) && !/[ \t<>*{?]/.test(t) && !out.includes(t)) out.push(t);
  }
  return out;
}

// True when every segment of the path exists under the root with that spelling: a file system that ignores case accepts another
// one, and a pointer written that way is a missing path where case counts.
function exact(root, rel) {
  let dir = root;
  for (const seg of rel.split('/').filter(Boolean)) {
    if (seg !== '.' && seg !== '..' && !(names(dir).includes(seg) && existsSync(join(dir, seg)))) return false;
    dir = join(dir, seg);
  }
  return true;
}

// The frontmatter of a rule or a skill: the globs of its paths value, unread for a value the host cannot read, and whether it has
// a description. No YAML parser: a scalar, a flow list or a block list, split at commas outside quotes and brace groups.
function frontOf(text) {
  const l = linesOf(text), e = l[0] === '---' ? l.indexOf('---', 1) : -1, out = { globs: [], paths: false, unread: false, described: false };
  if (e < 0) return out;
  const head = l.slice(1, e), pk = head.findIndex((x) => x.startsWith('paths:')), dk = head.findIndex((x) => x.startsWith('description:')), trim = (s) => s.replace(/^[ \t]+|[ \t]+$/g, '');
  let bad = false;
  const add = (item) => {
    let it = trim(item);
    if (/^["']/.test(it)) { if (it.length < 2 || it.at(-1) !== it[0]) { bad = true; return; } it = it.slice(1, -1); }
    if (it) out.globs.push(it);
  };
  const list = (s) => {
    let q = '', d = 0, cur = '';
    for (const ch of s) {
      if (q) { if (ch === q) q = ''; } else if (ch === '"' || ch === "'") q = ch; else if (ch === '{') d++; else if (ch === '}') d -= d > 0;
      else if (ch === ',' && d === 0) { add(cur); cur = ''; continue; }
      cur += ch;
    }
    add(cur);
  };
  if (pk >= 0) {
    let v = trim(head[pk].slice(6));
    if (!v) for (let i = pk + 1, m; i < head.length && (m = /^[ \t]*- /.exec(head[i])); i++) add(head[i].slice(m[0].length));
    else if (v[0] === '[') { if (v.at(-1) === ']') list(v.slice(1, -1)); else bad = true; }
    else {
      if (/^["']/.test(v)) { if (v.length < 2 || v.at(-1) !== v[0]) bad = true; else v = v.slice(1, -1); }
      if (!bad) list(v);
    }
    [out.paths, out.unread] = [true, bad || !out.globs.length];
  }
  if (dk >= 0) {
    const v = trim(head[dk].slice(12)), next = head[dk + 1];
    out.described = v ? v !== '""' && v !== "''" : next !== undefined && /^[ \t]/.test(next) && /[^ \t]/.test(next);
  }
  return out;
}

// Each brace expansion of a glob, with **/ before a pattern that has no /.
function expand(s, out = []) {
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '{') continue;
    let d = 0, j = i, has = false;
    for (; j < s.length; j++) {
      if (s[j] === '{') d++; else if (s[j] === '}') { if (--d === 0) break; } else if (s[j] === ',' && d === 1) has = true;
    }
    if (j >= s.length || !has) continue;
    for (let k = i + 1, start = i + 1, depth = 0; k <= j; k++) {
      if (k === j || (s[k] === ',' && depth === 0)) { expand(s.slice(0, i) + s.slice(start, k) + s.slice(j + 1), out); start = k + 1; }
      else if (s[k] === '{') depth++; else if (s[k] === '}') depth--;
    }
    return out;
  }
  out.push(s.includes('/') ? s : `**/${s}`);
  return out;
}

const KEYWORDS = new Set(['if', 'then', 'else', 'elif', 'do', 'while', 'until', '!', 'time', 'command', 'exec', 'nohup']);
const WRAPS = new Set(['env', 'sudo', 'timeout', 'nice']);
const SHELLS = new Set(['sh', 'bash', 'dash', 'zsh', 'sh.exe', 'bash.exe']);

// The directories a shell text runs git commit in, each once and as the text gives it, and whether it runs git add or git stage
// anywhere. The text is read as written: a quote left open takes the rest as one word, what a double-quoted word substitutes is
// read as commands, and no change of directory is followed, which the staging check does.
function commits(text, ps) {
  const dirs = [], base = (w) => w.replace(/^.*[\\/]/, '').toLowerCase();
  const under = (a, d) => (!d ? a : /^[\\/]/.test(d) || d[1] === ':' || !a ? d : `${a}/${d}`);
  let adds = false;
  const analyze = (a) => {
    let i = 0, dir = '';
    for (; i < a.length; i++) {
      const b = base(a[i]);
      if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(a[i]) || KEYWORDS.has(b)) continue;
      // In PowerShell a call may stand on the right of an assignment to a variable, with spaces around the = or none.
      const set = ps && /^\$[\w:]+(?:[-+]?=(.*))?$/.exec(a[i]);
      if (set && (set[1] !== undefined || /^[-+]?=$/.test(a[i + 1] ?? ''))) {
        if (set[1]) { a[i] = set[1]; i--; } else if (set[1] === undefined) i++;
        continue;
      }
      if (!WRAPS.has(b)) break;
      while (a[i + 1]?.startsWith('-')) {
        const t = a[++i];
        if (b === 'env' && (t === '-u' || t === '-S')) i++;
        else if (b === 'env' && t === '-C') dir = under(dir, a[++i]);
        else if (b === 'env' && t.startsWith('--chdir=')) dir = under(dir, t.slice(8));
        else if (b === 'sudo' && /^-[ugUCDhprtT]$/.test(t)) i++;
        else if (b === 'timeout' && /^-[ks]$/.test(t)) i++;
        else if (b === 'nice' && t === '-n') i++;
      }
      // timeout takes its duration before the command.
      if (b === 'timeout') i++;
    }
    if (i >= a.length) return;
    const b = base(a[i]);
    let j = i + 1;
    if (SHELLS.has(b)) {
      let run = false;
      for (; j < a.length && /^[-+]/.test(a[j]); j++) { if (a[j] === '-o' || a[j] === '+o') j++; else if (/^-[A-Za-z]*c[A-Za-z]*$/.test(a[j])) run = true; }
      if (run && j < a.length) split(a[j]);
    } else if (b === 'git' || b === 'git.exe') {
      for (; a[j]?.startsWith('-'); j++) {
        const t = a[j];
        if (t === '-C' || t === '--work-tree') dir = under(dir, a[++j]);
        else if (t.startsWith('--work-tree=')) dir = under(dir, t.slice(12));
        else if (['-c', '--git-dir', '--namespace', '--config-env'].includes(t)) j++;
      }
      if (a[j] === 'add' || a[j] === 'stage') adds = true;
      if (a[j] === 'commit' && !a.slice(j + 1).some((x) => ['--dry-run', '--help', '-h'].includes(x)) && !dirs.includes(dir)) dirs.push(dir);
    }
  };
  function split(s) {
    let st = 0, cur = '', inw = false, cmd = [], dq = '';
    for (let i = 0; i < s.length; i++) {
      const ch = s[i], nx = s[i + 1];
      // A PowerShell here-string, from @ and a quote that end a line to that quote and @ at the start of a line, is one word,
      // where it starts a word or follows the = of a variable that starts a command.
      const here = st === 0 && ps && ch === '@' && (nx === "'" || nx === '"') && (!inw || (!cmd.length && /^\$[A-Za-z_][A-Za-z0-9_:]*=$/.test(cur))) && /^[ \t]*\n/.exec(s.slice(i + 2));
      if (here) {
        const open = i + 1 + here[0].length, close = s.indexOf(`\n${nx}@`, open), body = close < 0 ? s.slice(open + 1) : s.slice(open + 1, close);
        [cur, inw, i] = [cur + body, true, close < 0 ? s.length : close + 2];
        if (nx === '"' && body.includes('$(')) split(body);
      } else if (st === 1) { if (ch === "'") st = 0; else cur += ch; }
      else if (st === 2) {
        if (ps ? ch === '`' : ch === '\\' && (nx === '"' || nx === '\\')) { if (nx !== undefined) { cur += nx; dq += nx; i++; } }
        else if (ch === '"') { st = 0; if (dq.includes('$(') || dq.includes('`')) split(dq); }
        else { cur += ch; dq += ch; }
      } else if (ch === "'") [st, inw] = [1, true];
      else if (ch === '"') [st, inw, dq] = [2, true, ''];
      else if (ps && ch === '`') { if (nx !== undefined) cur += s[++i]; inw = true; }
      else if (' \t\n;&|(){}`'.includes(ch)) {
        if (inw) { cmd.push(cur); [cur, inw] = ['', false]; }
        if (ch !== ' ' && ch !== '\t' && cmd.length) { analyze(cmd); cmd = []; }
      } else { cur += ch; inw = true; }
    }
    if (inw) cmd.push(cur);
    if (cmd.length) analyze(cmd);
  }
  // A carriage return, a backspace and a form feed are read as a space.
  split(text.replace(/[\r\b\f]/g, ' '));
  return { dirs, adds };
}

// One repository's findings, pushed to found, and the rules, skills and nested files that cover a changed path and are not
// changed, pushed to recheck once no finding stands.
function check(c, root, adds, found, recheck) {
  const hub = hubOf(root);
  if (!hub) return;
  const ls = (...a) => { const r = git(c, root, ['-c', 'core.quotepath=off', ...a]); return r.status === 0 ? r.stdout.split('\n').filter(Boolean) : []; };
  const tracked = (spec) => ls('ls-files', '--', spec).sort(bytewise).filter((f) => { try { return statSync(join(root, f)).isFile(); } catch { return false; } }), read = (f) => { try { return readFileSync(join(root, f), 'utf8'); } catch { return ''; } };
  const tops = names(root).map((n) => n.toLowerCase()), cover = [], nested = [];
  found.push(...over(root, hub, CAPS.hub));
  for (const tok of tokens(read(hub))) {
    // A home, absolute or drive path and a URL lie outside the repository. Any other token that is no .md file is a path only when
    // its first segment is a top-level entry in any case, which a branch such as origin/main is not.
    const rel = tok.replace(/^\.\//, '');
    if (/^~|^\/|^[A-Za-z]:[\\/]|:\/\//.test(rel) || (!rel.endsWith('.md') && !tops.includes(rel.split('/')[0].toLowerCase()))) continue;
    if (!exact(root, rel)) found.push(`${hub} names missing path ${tok}`);
  }
  for (const f of tracked(':(glob)**/CLAUDE.md').filter((x) => x !== 'CLAUDE.md' && x !== '.claude/CLAUDE.md')) {
    found.push(...over(root, f, CAPS.nested));
    nested.push([f, f.slice(0, -'CLAUDE.md'.length)]);
  }
  const front = (f, skill) => {
    const fm = frontOf(read(f));
    if (fm.unread) found.push(`${f} has a paths value the host cannot read`);
    else for (const g of fm.globs) {
      const files = expand(g).flatMap((p) => ls('ls-files', '--cached', ...(adds ? ['--others', '--exclude-standard'] : []), '--', `:(glob)${p}`));
      if (!files.length) found.push(`${f} paths glob ${g} matches no tracked file`);
      for (const x of files) cover.push([f, x]);
    }
    if (skill && !fm.described) found.push(`${f} has no description`);
    return fm.paths && !fm.unread;
  };
  let covers = nested.length > 0;
  for (const f of tracked(':(glob).claude/rules/**/*.md')) { found.push(...over(root, f, CAPS.rules)); covers = front(f, false) || covers; }
  for (const f of tracked(':(glob).claude/skills/*/SKILL.md')) { found.push(...over(root, f, CAPS.skills)); covers = front(f, true) || covers; }
  if (found.length || !covers) return;
  const head = git(c, root, ['rev-parse', '--verify', '-q', 'HEAD']).status === 0;
  const changed = [...new Set([...ls('diff', '--cached', '--name-only'), ...(head ? ls('diff', 'HEAD', '--name-only') : []), ...(adds ? ls('ls-files', '--others', '--exclude-standard') : [])])];
  const out = new Set(cover.filter(([f, x]) => !changed.includes(f) && changed.includes(x)).map(([f]) => f));
  for (const [f, dir] of nested) if (!changed.includes(f) && changed.some((x) => x.startsWith(dir))) out.add(f);
  recheck.push(...out);
}

function drift(c, input) {
  const command = input.tool_input?.command;
  if (typeof command !== 'string') return [];
  let first;
  try { first = staged(c, input); } catch (e) { first = [deny(`primer: the staging check failed, so the call is denied: ${e?.message || e}`)]; }
  if (first.length) return first;
  const ps = input.tool_name === 'PowerShell', cwd = isDir(input.cwd) ? input.cwd : c.cwd, { dirs, adds } = commits(command, ps);
  // A ~ is the shell's: HOME under sh, where a Git Bash path such as /c/work is the drive path it names.
  const home = (!ps && c.env.HOME) || c.home, place = (d) => (c.platform === 'win32' && !ps ? d.replace(/^\/([A-Za-z])(?=\/|$)/, '$1:/') : d).replace(/^~(?=\/|$)/, home);
  const top = (...at) => { const r = git(c, cwd, [...at, 'rev-parse', '--show-toplevel']); return r.status === 0 ? r.stdout.replace(/\r?\n$/, '') : null; };
  const roots = new Set(), found = [], recheck = [];
  for (const dir of dirs) {
    const root = (dir ? top('-C', place(dir)) : null) ?? top();
    if (!root || roots.has(root)) continue;
    roots.add(root);
    check(c, root, adds, found, recheck);
  }
  // A control character but a tab is left out of the message.
  const said = (items, sep) => items.map((x) => x.replace(/[\u0000-\u0008\u000a-\u001f\u007f]/g, '')).join(sep);
  if (found.length) return [deny(`primer: ${said(found, '; ')}`)];
  if (!recheck.length) return [];
  return [JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: `primer: the staged change touches files these cover; recheck them: ${said([...new Set(recheck)].sort(bytewise), ', ')}` } })];
}

// Node resolves the entry point through symlinks, so compare with the resolved path. An error of the commit check prints nothing.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const input = (() => { try { const v = JSON.parse(readFileSync(0, 'utf8')); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; } })();
  const c = { env: process.env, platform: process.platform, home: homedir(), cwd: process.cwd() }, command = input.tool_input?.command;
  let lines = [];
  if (typeof command === 'string' && READS.test(command)) {
    let failed = null;
    try { await load(); } catch (e) { failed = e ?? new Error('unknown'); }
    // After the call the hook only says what staged.mjs finds in the commits made, and says nothing on an error.
    if (input.hook_event_name === 'PostToolUse') {
      try { lines = failed ? [] : committed(c, input); } catch { lines = []; }
    } else if (!failed) {
      try { lines = drift(c, input); } catch { lines = []; }
    } else {
      // The staging check runs only where primer's own directory exists, so only there does a script that cannot load deny. The
      // configuration directory is found as configOf of primer.mjs finds it, which may be the script that did not load.
      const config = typeof input.transcript_path === 'string' && input.transcript_path ? dirname(dirname(dirname(input.transcript_path))) : c.env.CLAUDE_CONFIG_DIR || join(c.home, '.claude');
      if (existsSync(join(config, 'reimagine-primer'))) {
        lines = [JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `primer: the staging check cannot be loaded, so the call is denied: ${failed.message || failed}` } })];
      }
    }
  }
  process.stdout.write(lines.length ? `${lines.join('\n')}\n` : '');
}

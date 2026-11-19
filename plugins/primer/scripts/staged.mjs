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

// The simple commands of a shell text, each a list of words { w, bad, git }, with ( and ) kept: bad marks an expansion the
// script cannot resolve, a brace expansion among them, git a command substitution that stages or commits with git. Null for a quote
// left open or a process substitution outside quotes. A here-document ends the list, which then carries lost, and hidden when the
// text from there on names a git add, stage or commit, so the calls before it keep their directories. A backtick outside quotes
// separates commands in sh, so what a substitution runs is read as a command of its own. In PowerShell a here-string, from @' or @"
// at the end of a line to the same quote and @ at the start of a line, is one word where it starts a word and nothing is joined to
// its closer, and null elsewhere; unless a git call takes it, it hides what its text names, as a here-document does.
const hides = (t) => /\bgit(\.exe)?\b[^\n]*\b(add|stage|commit)\b/i.test(t.replace(/[\\`^]\r?\n/g, ' '));
function commands(s, ps) {
  const out = [];
  let words = [], cur = '', inw = false, bad = false, sub = false, skip = false;
  const end = () => {
    if (inw && !skip) words.push({ w: cur, bad, git: sub && /(?:\$\(|`|[;&|])\s*["']?git\b[^)`]*\b(add|stage|commit)\b/.test(cur) });
    [skip, cur, inw, bad, sub] = [skip && !inw, '', false, false, false];
  };
  const cut = () => { end(); if (words.length) out.push(words); words = []; };
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
      if (ch === '<' && nx === '<') { cut(); [out.lost, out.hidden] = [true, out.hidden || hides(s.slice(i))]; return out; }
      if (/^\d+$/.test(cur)) [cur, inw] = ['', false];
      end();
      while ('>&|'.includes(s[i + 1] ?? 'x')) i++;
      skip = true;
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
const SHELLS = new Set(['sh', 'bash', 'dash', 'zsh', 'sh.exe', 'bash.exe']);
const CDS = new Set(['cd', 'chdir', 'pushd', 'popd', 'set-location', 'sl', 'push-location', 'pop-location']);

// Collects each git add and git commit of a shell text with the directory it runs in, by the drift hook's grammar, following a
// cd to a plain directory; sets lost for a change of directory or a word it cannot follow, and for a work tree or a git
// directory named apart from the working directory, whose repository it still names. far says a directory is unknown, and
// hidden that the text may run an add or a commit the script does not see.
function scan(s, ps, st) {
  const list = commands(s, ps), dirs = [];
  if (!list || list.lost) st.lost = true;
  if (!list || list.hidden) st.hidden = true;
  for (const item of list ?? []) if (item === '(') dirs.push(st.dir); else if (item === ')') st.dir = dirs.pop() ?? st.dir; else analyze(item, st);
}

function analyze(words, st) {
  if (words.some((x) => x.git)) st.lost = st.hidden = true;
  if (words.some((x) => /\bGIT_(DIR|WORK_TREE|INDEX_FILE)\b/.test(x.w))) st.lost = true;
  const at = (dir, x) => { if (!x || x.bad) { st.lost = st.far = true; return dir; } return resolve(dir, tilde(st.msys ? x.w.replace(/^\/([A-Za-z])(?=\/|$)/, '$1:/') : x.w, st.home)); };
  let i = 0, dir = st.dir;
  for (; i < words.length; i++) {
    const w = words[i].w, b = base(w);
    const tree = /^GIT_(?:WORK_TREE=(.*)|DIR=(.*))$/.exec(w);
    if (tree) dir = at(st.dir, { ...words[i], w: tree[1] ?? `${tree[2]}/..` });
    if (/^[A-Za-z_]\w*=/.test(w) || KEYWORDS.has(b)) continue;
    if (b !== 'env' && b !== 'sudo') break;
    while (words[i + 1]?.w.startsWith('-')) {
      const t = words[++i].w;
      if (b === 'env' && (t === '-u' || t === '-S')) i++;
      else if (b === 'env' && t === '-C') dir = at(dir, words[++i]);
      else if (b === 'env' && t.startsWith('--chdir=')) dir = at(dir, { ...words[i], w: t.slice(8) });
      else if (b === 'sudo' && /^-[ugUCDhprtT]$/.test(t)) i++;
    }
  }
  if (i >= words.length) return;
  const b = base(words[i].w), rest = words.slice(i + 1);
  // What a merge, a cherry-pick, a rebase or an am brings is read before the command runs, so a call that runs before it in the
  // same command may change it. Only a change of directory, a git add and a git commit, which change nothing that is read, and
  // the text a shell is given, whose own calls are judged, leave a later one readable.
  let still = CDS.has(b);
  if (SHELLS.has(b)) {
    let j = 0;
    for (; j < rest.length && /^[-+]/.test(rest[j].w); j++) if (rest[j].w === '-o' || rest[j].w === '+o') j++;
    if (rest.slice(0, j).some((x) => /^-[A-Za-z]*c[A-Za-z]*$/.test(x.w)) && rest[j]) {
      if (rest[j].bad) st.lost = st.hidden = true; else { const keep = st.dir; st.dir = dir; scan(rest[j].w, false, st); st.dir = keep; still = true; }
    }
  } else if (CDS.has(b)) {
    if (b.startsWith('pop') || rest.length !== 1 || rest[0].w.startsWith('-')) st.lost = st.far = true; else st.dir = at(st.dir, rest[0]);
  } else if (b === 'git' || b === 'git.exe') {
    let j = 0;
    for (; j < rest.length && rest[j].w.startsWith('-'); j++) {
      const t = rest[j].w;
      if (t === '-C') dir = at(dir, rest[++j]);
      else if (/^--(work-tree|git-dir)/.test(t)) {
        const v = t.includes('=') ? { ...rest[j], w: t.slice(t.indexOf('=') + 1) } : rest[++j];
        [st.lost, dir] = [true, at(dir, v && t.startsWith('--git-dir') ? { ...v, w: `${v.w}/..` } : v)];
      }
      else if (t === '-c' || t === '--namespace' || t === '--config-env') j++;
    }
    const sub = rest[j]?.w === 'stage' ? 'add' : rest[j]?.w, args = rest.slice(j + 1), first = args[0]?.w;
    if (sub === 'add' || (sub === 'commit' && !args.some((x) => ['--dry-run', '--help', '-h'].includes(x.w)))) { st.calls.push({ sub, dir, args }); still = true; }
    // A call for help, and one that ends or steps over a merge under way, bring nothing in.
    else if (brings(sub) && first !== '--help' && first !== '-h' && !ENDS.has(first)) { st.calls.push({ sub, dir, args, moved: st.moved, sh: st.sh, msys: st.msys, home: st.home }); still = true; }
  } else if (b === 'xargs' && rest.some((x) => /^git(\.exe)?$/.test(base(x.w)))) st.lost = st.hidden = true;
  // A command handed to another shell is not read: one that names an add, stage or commit, or holds an expansion, may run one.
  else if (/^(pwsh|powershell|cmd)(\.exe)?$/.test(b) && (rest.some((x) => x.bad) || hides(rest.map((x) => x.w).join(' ')))) st.lost = st.hidden = true;
  if (!still) st.moved = true;
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
const UNREAD = { rebase: /^(-[qvnfrpm]*[xi]|--exe?c?(=|$)|--in[a-z]*$)/, am: /^(--(directory|patch-format)(=|$)|-p\d*$)/ };
// A call that ends or steps over a merge, a cherry-pick, a rebase or an am under way brings nothing in.
const ENDS = new Set(['--abort', '--skip', '--quit', '--edit-todo', '--show-current-patch']);

// What a patch in git's form holds: the files it creates, the target of a rename among them, and the lines it adds to each ignore
// file; null for a new file or a target whose header the script cannot read.
function patched(c, dir, text) {
  const paths = [], ignores = [], blocks = text.replace(/\r\n/g, '\n').split(/^diff --git /m).slice(1);
  for (const b of blocks) {
    // The header ends where the content starts: past it a block of a mailbox holds the next message, whose words are no header.
    const cut = b.search(/^(@@ |--- |Binary files |GIT binary patch|-- $)/m), head = cut < 0 ? b : b.slice(0, cut);
    const named = /^a\/(.+) b\/\1\n/.exec(b)?.[1], to = /^(?:rename|copy) to (.+)$/m.exec(head)?.[1], f = to ?? named ?? b.split('\n')[0].replace(/"$/, '');
    if (to?.startsWith('"')) return null;
    if (to) paths.push(to);
    if (/^new file mode /m.test(head)) { if (!named) return null; paths.push(named); }
    if (isIgnore(f)) ignores.push({ file: f, now: (b.match(/^\+(?!\+\+ ).*$/gm) ?? []).map((l) => l.slice(1)).join('\n'), was: blob(c, dir, `HEAD:${f}`) });
  }
  return { paths, ignores, blocks: blocks.length };
}

// What a merge, a cherry-pick, a rebase or an am would add to the history: the files the commits it names add, a rename read as a
// new file, and the lines they add to an ignore file; null where the command does not say which commits, git cannot read them, or
// another call runs before it in the same command. A merge or a rebase brings each commit that a commit it names holds and the
// head does not, with the upstream of the branch where it names none; a cherry-pick brings each commit it names and each commit
// of a range, a merge among them read against each parent; an am brings what its patch files hold, and a file with no file header
// is unread. A --continue is read as the commit it makes, and a call that ends one brings nothing new.
function brought(c, { sub, dir, args, moved, sh, msys, home }, top) {
  if (moved) return null;
  const named = [];
  for (let i = 0; i < args.length; i++) {
    const { w, bad } = args[i];
    if (bad || UNREAD[sub]?.test(w)) return null;
    if (ENDS.has(w)) return { paths: [], ignores: [] };
    if (w === '--continue' || (sub === 'am' && (w === '--resolved' || w === '-r'))) return planOf(c, { sub: 'commit', dir, args: [] }, top);
    if (sub === 'rebase' && w === '--onto') { if (!args[++i] || args[i].bad) return null; named.push(args[i].w); }
    else if (sub === 'rebase' && w.startsWith('--onto=')) named.push(w.slice(7));
    else if (BRINGS[sub].test(w)) i++;
    else if (w === '-' && sub !== 'am') named.push('@{-1}');
    else if (!w.startsWith('-')) named.push(w);
  }
  // A name that starts with a dash would reach git as an option.
  if (named.some((n) => n.startsWith('-'))) return null;
  // The form of the output is pinned, whatever the user's configuration sets.
  const out = (...a) => { const r = git(c, dir, ['-c', 'core.quotepath=off', '-c', 'diff.noprefix=false', '-c', 'diff.mnemonicPrefix=false', '-c', 'diff.relative=false', ...a]); return r.status === 0 ? r.stdout : null; };
  const log = ['log', '--format=', '-m', '--no-renames', '--no-color', '--no-ext-diff', '--no-textconv'], ignored = ':(top,glob)**/.gitignore';
  // Each commit is read by itself, a merge against each parent, so a file that one commit adds and a later one removes is told.
  const read = (how, revs) => {
    const names = out(...log, ...how, '--name-only', '--diff-filter=A', '-z', '--end-of-options', ...revs, '--'), patch = names === null ? null : out(...log, ...how, '-p', '--end-of-options', ...revs, '--', ignored), p = patch === null ? null : patched(c, dir, patch);
    return p && { paths: names.split('\0').map((x) => x.replace(/^\n+/, '')).filter(Boolean), ignores: p.ignores };
  };
  // A ~ and, under Git Bash, a drive path such as /c/work are the shell's to place.
  const file = (f) => { try { const p = patched(c, dir, readFileSync(resolve(dir, sh ? tilde(msys ? f.replace(/^\/([A-Za-z])(?=\/|$)/, '$1:/') : f, home) : f), 'utf8')); return p?.blocks ? p : null; } catch { return null; } };
  let plans;
  if (sub === 'am') plans = named.length ? named.map(file) : [null];
  else if (sub === 'cherry-pick') plans = [named.length ? read(['--no-walk=unsorted'], named) : null];
  else plans = (named.length || args.some((x) => x.w === '--root') ? named : ['@{upstream}']).map((r) => read([], [`HEAD..${r}`]));
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

// The upstream's tree: refs/remotes/<remote>/HEAD of the remote the current branch tracks, else origin, else the only remote.
function upstream(c, repo) {
  const tracked = git(c, repo.top, ['for-each-ref', '--format=%(HEAD)%(upstream:remotename)', 'refs/heads']).stdout.split('\n').find((l) => l.startsWith('*'))?.slice(1);
  const name = tracked || (repo.names.includes('origin') ? 'origin' : new Set(repo.names).size === 1 ? repo.names[0] : null), ref = `refs/remotes/${name}/HEAD`;
  if (!name) return { why: 'no remote names it' };
  return git(c, repo.top, ['rev-parse', '-q', '--verify', `${ref}^{tree}`]).status === 0 ? { ref } : { why: `${ref} cannot be read` };
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
  const tree = agents.length ? upstream(c, repo) : {};
  const held = new Set(tree.ref ? git(c, repo.top, ['ls-tree', '-r', '-z', '--name-only', '--full-tree', tree.ref, '--', ...agents]).stdout.split('\0') : []);
  const missing = agents.filter((x) => !held.has(x));
  if (!missing.length && !lines.length) return null;
  const items = [...(missing.length ? [`${missing.join(', ')}, ${tree.ref ? `which ${tree.ref} does not hold` : `while the upstream's tree is unknown (${tree.why})`}`] : []), ...lines];
  return `primer: ${repo.top} has the local profile, which keeps agent files out of its history; ${plan ? ''
    : 'the command cannot be resolved, so it counts as staging every file git does not ignore; '}the call would add ${items.join('; ')}`;
}

export const deny = (reason) => JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });
export function staged(c, input) {
  const own = join(configOf(c, input), 'reimagine-primer'), command = input.tool_input?.command;
  if (!existsSync(own) || typeof command !== 'string' || !/commit|[Gg][Ii][Tt][\s\S]*(?:add|stage|merge|cherry-pick|rebase|\bam\b)/.test(command)) return [];
  const ps = input.tool_name === 'PowerShell', cwd = isDir(input.cwd) ? input.cwd : c.cwd;
  const st = { dir: cwd, home: c.home, msys: c.platform === 'win32' && !ps, calls: [], lost: false, far: false, hidden: false, sh: !ps, moved: false };
  scan(command, ps, st);
  if (!st.calls.length && !st.hidden) return [];
  const path = places(c, own).map, map = (() => { try { return loadMap(path, c.home); } catch (e) { if (e instanceof Refusal) return null; throw e; } })();
  if (!map) return [deny(`primer: ${path} is not a primer map, so the staging check cannot tell which repositories have the local profile and denies every git add and git commit, and each git merge, cherry-pick, rebase and am that starts or continues one; restore the file from a copy or from the store's history, or correct it to the form primer map writes`)];
  if (!map.repos.some((e) => e.profile === 'local')) return [];
  if (st.hidden || st.calls.some((x) => !isDir(x.dir))) st.lost = st.far = true;
  const dirs = new Set(st.calls.length ? st.calls.map((x) => x.dir) : [cwd]);
  // Where a directory is unknown the call may run in any local repository, so each one the map holds is checked too.
  if (st.far) for (const e of [{ path: cwd }, ...map.repos.filter((x) => x.profile === 'local')]) dirs.add(e.path);
  for (const dir of dirs) {
    const repo = isDir(dir) && repoOf(c, dir);
    if (!repo || match(map, repo, c.platform)?.profile !== 'local') continue;
    // The calls of one directory are checked by what they would add together when each one resolves: an add extends the index a
    // later commit takes, and a commit holds no more than the index and what it names.
    const calls = st.calls.filter((x) => st.far || x.dir === dir), plans = calls.map((x) => planOf(c, { ...x, dir }, repo.top)), whole = !st.lost && plans.length && plans.every(Boolean);
    // What an unread merge brings is not in the work tree, so no count of the files there stands in for it.
    const blind = calls.find((x, i) => brings(x.sub) && !plans[i]);
    if (blind) return [deny(`primer: ${repo.top} has the local profile, which keeps agent files out of its history; what git ${blind.sub} would bring in cannot be read from the command, so the call is denied; a commit named by a branch, a tag or an id, or a patch given as a file, can be read where nothing but a cd, a git add or a git commit runs before it in the command`)];
    const reason = whole ? verdict(c, repo, { paths: plans.flatMap((p) => p.paths), ignores: plans.flatMap((p) => p.ignores) }) : verdict(c, repo, null, plans.filter(Boolean));
    if (reason) return [deny(reason)];
  }
  return [];
}

// Node resolves the entry point through symlinks, so compare with the resolved path. On an error of its own the script prints a
// deny that gives the error and exits 2.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    const input = (() => { try { const v = JSON.parse(readFileSync(0, 'utf8')); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; } })();
    const lines = staged({ env: process.env, platform: process.platform, home: homedir(), cwd: process.cwd() }, input);
    process.stdout.write(lines.length ? `${lines.join('\n')}\n` : '');
  } catch (e) {
    process.stdout.write(`${deny(`primer: the staging check failed, so the call is denied: ${e?.message || 'a git call did not answer in time'}`)}\n`);
    process.exitCode = 2;
  }
}

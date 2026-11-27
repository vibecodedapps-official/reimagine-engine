#!/usr/bin/env node
// Primer: the local profile's store and map, its context loader, the budget, the reach check and the copies. The staging check
// is staged.mjs, which imports what it shares from here.
// Usage: node primer.mjs <verb> [args]
//   session-start <layer> <data dir>  the SessionStart hook: a local repository's layers as context, the delivery warnings, the notice;
//            on SubagentStart, the layers alone; a load that stops gives its reason as one line of context
//   reach <data dir>  the PreToolUse hook on file edits: another repository's instructions, on the session's first edit there
//   status   the working directory's entry, profile, layers and delivery checks, and each declared copy; writes nothing
//   measure  every mapped repository's context string as emitted; --with <file> <layer> measures a proposed layer; writes nothing
//   map      prints the map; --add, --set and --drop change it for the working directory's repository
//   copies   each declared copy against its source's snapshot; --add <copy> <source> records one source of a copy, and
//            --ported <copy> every source of it;
//            --spans lists the runs of lines two layers or documents share, and writes nothing
//   skills   each skill of the store and its link in <config>/skills; --link makes the missing links
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, rmdirSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, hostname, userInfo } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CAP = 10000;
export const MARK = '<!-- primer -->';
const LAYERS = ['shared', 'group', 'machine', 'machine-group'];
const PROFILES = ['shared', 'local'];
const GROUP = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const FORMS = 'map takes --add with --profile shared|local [--group <name>] or --root <dir>, --set with any of '
  + '--profile, --group and --root or with --store <path> or --local <path> alone, or --drop [--root <dir>]; nothing else is accepted';

export class Refusal extends Error {}
class Unknown extends Error {}
const refuse = (message) => { throw new Refusal(message); };
const slash = (p) => p.replace(/\\/g, '/');
export const keyOf = (p, platform) => { const s = slash(p).replace(/\/+$/, ''); return platform === 'win32' ? s.toLowerCase() : s; };
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
export const isDir = (p) => typeof p === 'string' && p !== '' && !!statSync(p, { throwIfNoEntry: false })?.isDirectory();
export const tilde = (p, home) => (p === '~' ? home : /^~[\\/]/.test(p) ? join(home, p.slice(2)) : p);
// A path as a file of the store holds it: under the home directory as ~/, so a store that is shared names no home directory, else in full.
// A home directory that is the root of a file system holds every path, so no path is written under it.
export const homed = (c, f) => {
  const h = keyOf(c.home, c.platform), k = keyOf(f, c.platform);
  return !h || /^[a-z]:$/i.test(h) ? slash(f) : k === h ? '~' : k.startsWith(`${h}/`) ? `~/${slash(f).slice(h.length + 1)}` : slash(f);
};
// The same for a file that may sit inside the store, which is held relative to it, or under the config folder, which is held as
// <config>/ and read under the config folder of each run, so the folder's own name stays out of a store.
export const held = (c, p, f) => {
  const k = keyOf(f, c.platform), s = keyOf(p.store, c.platform), g = keyOf(dirname(p.own), c.platform);
  return k.startsWith(`${s}/`) ? slash(f).slice(s.length + 1) : k.startsWith(`${g}/`) ? `<config>/${slash(f).slice(g.length + 1)}` : homed(c, f);
};
export const readText = (path) => { try { return readFileSync(path, 'utf8'); } catch { return ''; } };
const isFile = (f) => !!statSync(f, { throwIfNoEntry: false })?.isFile();
// The hub of a repository that opted in, its first line the marker: CLAUDE.md, or AGENTS.md where CLAUDE.md is the one line
// @AGENTS.md or is missing. Null for any other root.
export function hubOf(root) {
  const lines = (f) => { const l = readText(join(root, f)).split('\n'); if (l.at(-1) === '') l.pop(); return l.map((x) => x.replace(/\r$/, '')); };
  const own = isFile(join(root, 'CLAUDE.md')) ? lines('CLAUDE.md') : null, hub = own && !(own.length === 1 && own[0] === '@AGENTS.md') ? 'CLAUDE.md' : 'AGENTS.md';
  return isFile(join(root, hub)) && lines(hub)[0] === MARK ? hub : null;
}
const real = (p) => { try { return realpathSync.native(p); } catch { return p; } };

// A remote as host/path, or null for a local path; the rule guard writes remotes by.
export function normalizeRemote(url) {
  const u = url.trim();
  let host, path, m;
  if ((m = u.match(/^(?:https?|ssh|git):\/\/(?:[^/@]*@)?([^/:]+)(?::\d+)?\/(.+)$/i))) [, host, path] = m;
  else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(u) || /^[A-Za-z]:[\\/]/.test(u)) return null;
  else if ((m = u.match(/^(?:[^/@\\:]+@)?([^/@\\:]+):(.+)$/))) [, host, path] = m;
  else return null;
  host = host.toLowerCase();
  path = path.replace(/^\/+/, '').replace(/\/+$/, '').replace(/\.git$/, '').replace(/\/+$/, '');
  const az = host === 'ssh.dev.azure.com' && path.match(/^v3\/([^/]+)\/([^/]+)\/([^/]+)$/);
  return az ? `dev.azure.com/${az[1]}/${az[2]}/_git/${az[3]}` : `${host}/${path}`;
}

// A git call that writes nothing: no optional lock, so no index refresh. One past the deadline throws Unknown.
export function git(c, cwd, args, deadline) {
  const timeout = deadline ? deadline - Date.now() : 30000;
  if (timeout <= 0) throw new Unknown('a git call did not answer in time');
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env: { ...c.env, GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C', LANGUAGE: 'C' }, timeout, maxBuffer: 1 << 28 });
  if (r.error) throw r.error.code === 'ETIMEDOUT' ? new Unknown('a git call did not answer in time') : r.error;
  return r;
}
export const blob = (c, cwd, spec) => { const r = git(c, cwd, ['cat-file', 'blob', spec]); return r.status === 0 ? r.stdout : ''; };

// The repository a directory is in: its main work tree's root, its top level, its remotes as host/path, their names and their URLs.
export function repoOf(c, cwd, deadline) {
  const r = git(c, cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir', '--show-toplevel'], deadline);
  if (r.status !== 0) return null;
  const [common, top] = r.stdout.split('\n');
  const fetch = git(c, cwd, ['remote', '-v'], deadline).stdout.split('\n').map((l) => l.trim().match(/^(\S+)\s+(.+) \(fetch\)$/)).filter(Boolean);
  return { root: slash(dirname(common)), top: slash(top), remotes: [...new Set(fetch.map((m) => normalizeRemote(m[2])).filter(Boolean))].sort(), names: fetch.map((m) => m[1]), urls: fetch.map((m) => m[2]) };
}

// <config> as the hooks find it: three levels above the input's transcript, else the variable, else ~/.claude.
export const configOf = (c, input) => (typeof input?.transcript_path === 'string' && input.transcript_path
  ? dirname(dirname(dirname(input.transcript_path))) : c.env.CLAUDE_CONFIG_DIR || join(c.home, '.claude'));
export const ownOf = (c) => join(c.env.CLAUDE_CONFIG_DIR || join(c.home, '.claude'), 'reimagine-primer');

function readJson(path, what) {
  if (!existsSync(path)) return undefined;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return refuse(`${path} is not ${what}`); }
}

// Primer's own directory, its configuration, the store, the machine's directory and the map path.
export function places(c, own) {
  const cfgPath = join(own, 'config.json'), cfg = readJson(cfgPath, 'a primer configuration') ?? {};
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg) || ['store', 'local'].some((k) => cfg[k] !== undefined && typeof cfg[k] !== 'string')) refuse(`${cfgPath} is not a primer configuration`);
  const store = cfg.store ? resolve(tilde(cfg.store, c.home)) : join(own, 'store');
  return { own, cfgPath, cfg, store, local: cfg.local ? resolve(tilde(cfg.local, c.home)) : own, map: join(store, 'map.json') };
}

// The map, with each path a file holds as ~/ read as the path under this home directory. Version 2 holds such paths, which a script
// that knows version 1 alone would read as no directory, so that script refuses the map; version 1, with each path in full, still loads.
export function loadMap(path, home) {
  const v = readJson(path, 'a primer map');
  if (v === undefined) return { version: 2, repos: [], roots: [] };
  const ok = v && (v.version === 1 || v.version === 2) && Array.isArray(v.roots) && v.roots.every((r) => typeof r === 'string') && Array.isArray(v.repos)
    && v.repos.every((r) => r && Array.isArray(r.remotes) && r.remotes.every((x) => typeof x === 'string') && typeof r.path === 'string'
      && typeof r.group === 'string' && GROUP.test(r.group) && PROFILES.includes(r.profile));
  if (!ok) refuse(`${path} is not a primer map`);
  // An older map holds an own key in each entry, which nothing reads; the next write leaves it out.
  for (const r of v.repos) { delete r.own; r.path = slash(tilde(r.path, home)); }
  return { ...v, roots: v.roots.map((d) => slash(tilde(d, home))) };
}

// What two written forms of one remote share: Azure's older hosts read as dev.azure.com, and no letter case.
const formOf = (remote) => {
  const m = remote.match(/^vs-ssh\.visualstudio\.com\/v3\/([^/]+)\/([^/]+)\/([^/]+)$/i)
    ?? remote.match(/^([^/.]+)\.visualstudio\.com\/(?:DefaultCollection\/)?(?:([^/]+)\/)?_git\/([^/]+)$/i);
  return (m ? `dev.azure.com/${m[1]}/${m[2] ? `${m[2]}/` : ''}_git/${m[3]}` : remote).toLowerCase();
};
// An entry that holds one of the clone's remotes as written, or sits at its path, comes before one that only shares a form.
export const match = (map, repo, platform) => {
  const forms = repo.remotes.map(formOf);
  return map.repos.find((e) => e.remotes.some((r) => repo.remotes.includes(r))
    || ((!repo.remotes.length || !e.remotes.length) && keyOf(e.path, platform) === keyOf(repo.root, platform)))
    ?? map.repos.find((e) => e.remotes.some((r) => forms.includes(formOf(r))));
};
const entryAt = (map, path, platform) => map.repos.find((e) => e.profile === 'local' && keyOf(e.path, platform) === keyOf(path, platform));
const under = (map, root, platform) => map.roots.find((d) => `${keyOf(root, platform)}/`.startsWith(`${keyOf(d, platform)}/`));
const shown = (e) => `group ${e.group}, profile ${e.profile}, ${e.remotes.length ? `remotes ${e.remotes.join(', ')}` : `path ${e.path}`}`;

// Each layer of an entry as it is emitted: a line naming the layer and its file, the text, and a canary line holding the first
// eight hex characters of the SHA-256 of the file's bytes, a CRLF line end read as LF so that a store git checks out either way
// gives one string. An empty or missing layer has no text, and one whose file is no file has bad, the reason. swap gives one file other bytes.
const fileOf = (p, name, group) => (name === 'machine' ? join(p.local, 'machine.md') : name === 'machine-group' ? join(p.local, 'machine', `${group}.md`)
  : name === 'shared' ? join(p.store, 'shared.md') : join(p.store, 'groups', `${group}.md`));
// A machine layer left in primer's own directory after config.json named another for the machine.
const left = (c, p) => (keyOf(p.local, c.platform) !== keyOf(p.own, c.platform) && existsSync(join(p.own, 'machine.md')) ? `${join(p.own, 'machine.md')} is not read while ${p.cfgPath} names ${p.local}; move its text to ${join(p.local, 'machine.md')}` : null);
// Machine layers the default config folder reads and this one does not: here config.json names no machine's directory and
// primer's own holds no machine layer, while the default folder's names one or holds a machine.md.
function apart(c, p) {
  const other = join(c.home, '.claude', 'reimagine-primer'), holds = (d) => existsSync(join(d, 'machine.md'));
  if (p.cfg.local || keyOf(other, c.platform) === keyOf(p.own, c.platform) || holds(p.own) || existsSync(join(p.own, 'machine'))) return null;
  const there = (() => { try { return places(c, other); } catch { return null; } })(), dir = there?.cfg.local ? there.local : other;
  return there && (holds(dir) || existsSync(join(dir, 'machine'))) ? `${p.cfgPath} names no machine's directory, so the machine layers that ${other} reads from ${dir} are not loaded here; name it with map --set --local` : null;
}
function layersOf(p, entry, swap) {
  const files = Object.fromEntries(LAYERS.map((name) => [name, fileOf(p, name, entry.group)]));
  return LAYERS.map((name) => {
    const bad = swap?.file !== files[name] && existsSync(files[name]) && !isFile(files[name]), raw = bad ? null : swap?.file === files[name] ? swap.buf : existsSync(files[name]) ? readFileSync(files[name]) : null;
    const buf = raw && Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n')), body = buf ? buf.toString('utf8').replace(/\s+$/, '') : '';
    if (!body) return { name, file: files[name], ...(bad && { bad: `${files[name]} is not a file` }) };
    const canary = createHash('sha256').update(buf).digest('hex').slice(0, 8);
    return { name, file: files[name], canary, text: `primer layer ${name} from ${files[name]}\n${body}\nprimer canary ${name} ${canary}` };
  });
}
const joined = (parts) => parts.filter((x) => x.text).map((x) => x.text).join('\n\n');

const unquote = (s) => (s.length >= 2 && /^["']/.test(s) && s.at(-1) === s[0] ? s.slice(1, -1) : s);
function frontOf(text) {
  const lines = text.split('\n').map((l) => l.replace(/\r$/, '')), out = {};
  if (lines[0] !== '---') return out;
  for (const l of lines.slice(1)) {
    if (l === '---') break;
    const m = l.match(/^[ \t]*(type|modified):(.*)$/);
    if (m && !(m[1] in out)) out[m[1]] = unquote(m[2].replace(/^[ \t]+|[ \t]+$/g, ''));
  }
  return out;
}

// The machine's review settings, review.json in the machine's directory, as one repository reads them: logs, the directories whose
// files are feedback logs beside <config>/feedback/, and under repositories, by the path of a main work tree, skip, the auto
// memory notes no review reads and no notice counts, and transcripts, false where the transcript reader stays off. A file in
// any other form is refused, so a list that cannot be read is never taken for an empty one.
export function reviewOf(c, p, root) {
  const path = join(p.local, 'review.json'), read = readJson(path, 'a primer review file'), v = read === undefined ? {} : read, at = (d) => resolve(tilde(d, c.home)), placed = (s) => isAbsolute(tilde(s, c.home));
  const plain = (x, keys) => !!x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).every(keys), list = (x, ok) => x === undefined || (Array.isArray(x) && x.every((s) => typeof s === 'string' && ok(s)));
  const repos = plain(v, (k) => k === 'logs' || k === 'repositories') ? ('repositories' in v ? v.repositories : {}) : null;
  if (!plain(repos, placed) || !list(v.logs, placed) || !Object.values(repos).every((r) => plain(r, (k) => k === 'skip' || k === 'transcripts') && list(r.skip, Boolean) && ['boolean', 'undefined'].includes(typeof r.transcripts))) refuse(`${path} is not a primer review file`);
  const mine = Object.entries(repos).find(([k]) => keyOf(at(k), c.platform) === keyOf(root, c.platform))?.[1];
  return { path, logs: (v.logs ?? []).map(at), entry: !!mine, skip: (mine?.skip ?? []).map((s) => s.toLowerCase()), transcripts: mine?.transcripts !== false };
}

// The topic files MEMORY.md links, each once, with the type and the modified time of its frontmatter; a name that leaves the
// directory is none, and a note of skip, which reviewOf gives in lower case so a name counts in any letter case, is named and
// not opened.
export function notesOf(memory, skip = []) {
  const seen = new Set(), out = [];
  for (const [, name] of readText(join(memory, 'MEMORY.md')).matchAll(/\]\(([^()\r\n]+)\)/g)) {
    if (/^[/#]/.test(name) || /\.\.|\\|:/.test(name) || seen.has(name)) continue;
    seen.add(name);
    out.push(skip.includes(name.toLowerCase()) ? { name } : { name, ...frontOf(readText(join(memory, name))) });
  }
  return out;
}

// The files of a directory, a name that starts with a dot left out; with md its .md files alone, and with a depth those of its
// subdirectories that many levels down.
const logFiles = (d, depth, md) => { try { return readdirSync(d, { withFileTypes: true }).filter((e) => !e.name.startsWith('.')).flatMap((e) => (isFile(join(d, e.name)) ? (!md || e.name.toLowerCase().endsWith('.md') ? [join(d, e.name)] : []) : depth > 0 && e.isDirectory() ? logFiles(join(d, e.name), depth - 1, md) : [])); } catch { return []; } };
// The feedback logs of a directory review.json names: read two levels down and for its .md files alone, so a broad directory
// named by mistake costs a start little.
export const logsIn = (d) => logFiles(d, 2, true);

// The feedback logs as one repository reads them: the files of <config>/feedback/, each by its name, then the .md files of each
// directory of more and of its subdirectories two levels down, each by its path, a name that starts with a dot left out. A log's
// entries are its level-two sections, but one headed Recommended, and an entry is the repository's when its heading holds, as a word,
// the name of the repository's directory or of a remote. .reviewed holds, a line per repository and log, how many entries the log had
// at that repository's last review.
export function feedbackOf(config, repo, more = []) {
  const dir = join(config, 'feedback'), stamp = join(dir, '.reviewed'), key = repo.root.replace(/[^A-Za-z0-9]/g, '-'), low = (s) => s.replace(/[A-Z]/g, (ch) => ch.toLowerCase());
  const last = (u) => slash(u).replace(/\/+$/, '').replace(/\.git$/, '').replace(/\/+$/, '').replace(/^.*[/:]/, '');
  const names = [...new Set([repo.root, ...repo.urls].map((u) => low(last(u))).filter(Boolean))], edge = (ch) => !ch || !/[a-z0-9_-]/.test(ch);
  const named = (h) => names.some((nm) => { for (let at = h.indexOf(nm); at >= 0; at = h.indexOf(nm, at + 1)) if (edge(h[at - 1]) && edge(h[at + nm.length])) return true; return false; });
  const marks = readText(stamp).split('\n').map((l) => l.replace(/\r$/, '').split('\t')).filter((f) => f.length === 3 && /^[0-9]+$/.test(f[1]));
  const read = new Map(marks.filter((f) => f[0] === key).map((f) => [f[2], Number(f[1])]));
  const byName = (a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0), own = logFiles(dir, 0, false).map((f) => [basename(f), f]).sort(byName), held = new Set(own.map(([, f]) => real(f)));
  // A file reached a second time, as where a directory of more holds the config folder's own, is one log.
  const far = more.flatMap(logsIn).filter((f) => !held.has(real(f)) && held.add(real(f))).map((f) => [slash(f), f]).sort(byName);
  const logs = [...own, ...far].map(([name, file]) => {
    const heads = readText(file).split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.startsWith('## ') && !/^recommended([^a-z0-9_-]|$)/.test(low(l.slice(3)).replace(/^[ \t]+/, '')));
    return { name, total: heads.length, unread: heads.map((l, i) => ({ n: i + 1, heading: l.slice(3).trim(), own: named(low(l.slice(3))) })).slice(read.get(name) ?? 0) };
  });
  return { stamp, key, reviewed: read.size > 0, others: marks.filter((f) => f[0] !== key), logs };
}

// The notice of a repository, which hooks/notice.mjs gives where the hub has the marker and the loader in a local repository, which
// has no hub: the auto memory notes of type feedback or project modified after the stamp, and the repository's feedback entries
// since its last review. After a review a single entry makes no notice:
// it is taken for the reviewing session's own, which that session logs after the stamp is written.
export function notice(c, input, data, repo) {
  const config = configOf(c, input), win = c.platform === 'win32', cwd = slash(isDir(input.cwd) ? input.cwd : c.cwd);
  const tp = typeof input.transcript_path === 'string' ? slash(input.transcript_path) : '', sdir = tp && dirname(tp), key = repo.root.replace(/[^A-Za-z0-9]/g, '-');
  let memory;
  for (const f of [join(repo.top, '.claude', 'settings.local.json'), join(repo.top, '.claude', 'settings.json'), join(config, 'settings.json')]) {
    let v;
    try { v = JSON.parse(readFileSync(f, 'utf8')); } catch { continue; }
    if (!v || typeof v !== 'object' || !Object.hasOwn(v, 'autoMemoryDirectory')) continue;
    const m = typeof v.autoMemoryDirectory === 'string' ? slash(v.autoMemoryDirectory) : '', home = slash((win ? c.env.USERPROFILE || c.env.HOME : c.env.HOME) || c.home);
    memory = m.startsWith('~/') ? `${home}/${m.slice(2)}` : m.startsWith('//') ? m : m.startsWith('/') ? (win && /^[A-Za-z]:/.test(cwd) ? cwd.slice(0, 2) + m : m)
      : win && /^[A-Za-z]:\//.test(m) ? m : undefined;
    break;
  }
  memory ??= sdir && c.env.CLAUDE_CODE_PROJECT_DIR_NAME && basename(sdir) === c.env.CLAUDE_CODE_PROJECT_DIR_NAME ? `${sdir}/memory` : join(sdir ? dirname(sdir) : join(config, 'projects'), key, 'memory');
  const file = (f) => (statSync(f, { throwIfNoEntry: false })?.isFile() ? f : null), stamp = (name) => (data ? file(join(data, 'reviewed', name)) : null);
  const noted = stamp(key), since = noted && readText(noted).split(/\r?\n/)[0];
  let rv;
  try { rv = reviewOf(c, places(c, join(config, 'reimagine-primer')), repo.root); } catch (e) { if (!(e instanceof Refusal)) throw e; return `primer: ${e.message}`; }
  const n = notesOf(memory, rv.skip).filter((x) => !rv.skip.includes(x.name.toLowerCase()) && ['feedback', 'project'].includes(x.type) && (noted === null || (x.modified && x.modified > since))).length;
  const fb = feedbackOf(config, repo, rv.logs), own = fb.logs.reduce((a, l) => a + l.unread.filter((e) => e.own).length, 0), m = fb.reviewed && own < 2 ? 0 : own;
  const what = n && m ? `auto memory has ${n} notes and ${m} feedback entries` : n ? `auto memory has ${n} notes` : `${m} feedback entries`;
  return n || m ? `primer: ${what}${noted === null && !fb.reviewed ? '; no review has run here' : ' since the last review'}; run /primer` : null;
}

// Removes the files of a directory last written more than 30 days before.
const prune = (dir) => { for (const f of readdirSync(dir).map((x) => join(dir, x))) if (Date.now() - (statSync(f, { throwIfNoEntry: false })?.mtimeMs ?? Date.now()) > 30 * 864e5) rmSync(f, { force: true }); };
function sessionStart(c, layer, input, data) {
  // At a subagent's start no check or notice runs, and the agent types that start without instruction files get no layer either.
  const sub = input.hook_event_name === 'SubagentStart', quiet = sub || c.env.CLAUDE_CODE_SESSION_ATTENDED === '0', lead = layer === 'all' || layer === 'group';
  if (![...LAYERS, 'all'].includes(layer) || (sub && ['Explore', 'Plan'].includes(input.agent_type))) return [];
  const own = join(configOf(c, input), 'reimagine-primer'), msgs = [], none = (why) => (lead ? `primer: no context layer is loaded at this start: ${why}` : undefined);
  if (!existsSync(own)) return [];
  // Once primer's own directory is found, a load that stops gives its reason as one line of context, to a subagent and to a session
  // no one attends too: a session told nothing takes the context it holds for whole.
  let context;
  try { context = layersAt(c, layer, input, data || c.env.CLAUDE_PLUGIN_DATA, own, { sub, quiet, lead, none }, msgs); } catch (e) {
    context = none(e instanceof Refusal ? e.message : `the loader stopped on an error of its own, ${e?.message ?? e}`);
    msgs.splice(0, msgs.length, context);
  }
  const warn = msgs.length && !quiet && lead;
  const out = { ...(context ? { hookSpecificOutput: { hookEventName: sub ? 'SubagentStart' : 'SessionStart', additionalContext: context } } : {}), ...(warn ? { systemMessage: msgs.join('; ') } : {}) };
  return Object.keys(out).length ? [JSON.stringify(out)] : [];
}

// The context string of a start, with the warnings and the notice pushed to msgs; undefined where the start gets none.
function layersAt(c, layer, input, data, own, { sub, quiet, lead, none }, msgs) {
  // Nothing reads repo/ under the data directory, which may hold paths and remote URLs, so a start removes its files named by 16
  // hexadecimal characters and then the directory, if it is empty.
  if (data && isAbsolute(data)) try { const at = join(data, 'repo'); for (const e of readdirSync(at, { withFileTypes: true })) if (e.isFile() && /^[0-9a-f]{16}$/.test(e.name)) rmSync(join(at, e.name)); rmdirSync(at); } catch {}
  const p = places(c, own);
  if (p.cfg.store && !existsSync(p.map)) refuse(`${p.cfgPath} names the store ${p.store}, which ${isDir(p.store) ? 'holds no map.json' : 'is missing'}`);
  const map = loadMap(p.map, c.home);
  if (!map.roots.length && !map.repos.some((e) => e.profile === 'local')) return undefined;
  const cwd = isDir(input.cwd) ? input.cwd : c.cwd;
  let repo, context;
  try { repo = repoOf(c, cwd, Date.now() + c.limit); } catch (e) {
    if (!(e instanceof Unknown)) throw e;
    msgs.push(`primer: the context of ${slash(cwd)} is unknown, since git gave no answer within ${c.limit / 1000} s`);
    return none(`git gave no answer within ${c.limit / 1000} s, so whether ${slash(cwd)} has layers is unknown`);
  }
  const entry = repo && match(map, repo, c.platform), root = repo && !entry && under(map, repo.root, c.platform);
  // Where git reads no repository in a directory that holds .git, as with a damaged HEAD, the path of a local entry stops the load.
  if (repo === null && topOf(c, cwd) && entryAt(map, topOf(c, cwd), c.platform)) refuse(`git read no repository at ${slash(cwd)}, though ${topOf(c, cwd)} holds .git`);
  if (root) msgs.push(`primer: ${repo.root} is unmapped, under ${root} of the map's roots; run /primer to map it`);
  if (repo && !entry) { const at = entryAt(map, repo.root, c.platform); if (at) refuse(`${repo.root} is the path of the map's entry of group ${at.group} and has none of its remotes`); }
  if (entry?.profile !== 'local') return undefined;
  const all = layersOf(p, entry), parts = all.filter((x) => x.text), whole = layer === 'all' ? parts : parts.filter((x) => x.name === layer), bad = all.filter((x) => x.bad && (layer === 'all' || x.name === layer)).map((x) => `primer: the ${x.name} layer is not loaded: ${x.bad}`), empty = !parts.length && !all.some((x) => x.bad) && none(`each layer file of group ${entry.group} is missing or empty`);
  // A line for each layer whose file is no file opens the string; with no layer at all, one line says so.
  const body = [...bad, joined(whole)].filter(Boolean).join('\n\n'), n = body.length;
  // The host gives a session a preview of a string over its cap, which keeps the string's start: a line there says a layer is whole only once its file is read.
  context = (n > CAP ? `primer: the text below is ${n} characters, over the host's cap of ${CAP}, so a session holds a preview of it and holds each layer whole only once it has read the layer's file: ${whole.map((x) => x.file).join(', ')}\n\n` : '') + body || empty || undefined;
  // A resumed session still holds the string it was last given, so it gets one only where the string differs from that one: the
  // digest of each string given is kept under the data directory by session and layer, for 30 days after the session's last
  // start, and a session with none kept gets the string. With no absolute data directory, or an id that names no file, nothing is kept
  // and a resumed session gets no string.
  const id = typeof input.session_id === 'string' && /^[\w-]{1,80}$/.test(input.session_id) && input.session_id;
  let mark = !sub && data && isAbsolute(data) && id && context ? join(data, 'given', `${id}.${layer}`) : null, digest = createHash('sha256').update(context ?? '').digest('hex'), same = mark && readText(mark) === digest;
  if (mark) try {
    mkdirSync(dirname(mark), { recursive: true });
    writeFileSync(mark, digest);
  } catch { mark = null; }
  if (mark) try { prune(dirname(mark)); } catch {}
  if (input.source === 'resume' && (!mark || same)) context = undefined;
  const sizes = layer === 'all' ? [{ text: joined(parts), what: 'the context string', of: ` (${parts.map((x) => `${x.name} ${x.text.length}`).join(', ')})` }]
    : parts.map((x) => ({ text: x.text, what: `the ${x.name} layer`, of: '' }));
  for (const said of [...bad, empty, apart(c, p) && `primer: ${apart(c, p)}`]) if (said) msgs.push(said);
  for (const s of sizes) if (s.text.length > CAP) msgs.push(`primer: ${s.what} is ${s.text.length} characters as emitted, over the host's cap of ${CAP}${s.of}`);
  // The notice hook runs at startup alone, and so does this.
  let told;
  try { told = (input.source ?? 'startup') === 'startup' && !quiet && lead && notice(c, input, data, repo); } catch (e) { told = `primer: the review notice stopped on an error of its own: ${e?.message ?? e}`; }
  if (told) msgs.push(told);
  return context;
}

// The .md files of a directory, and every file under one, each sorted.
const mdIn = (d) => { try { return readdirSync(d).filter((f) => f.endsWith('.md')).sort().map((f) => join(d, f)); } catch { return []; } };
const filesIn = (d) => {
  const out = [], walk = (x) => { for (const e of (() => { try { return readdirSync(x, { withFileTypes: true }); } catch { return []; } })()) (e.isDirectory() ? walk : (f) => out.push(f))(join(x, e.name)); };
  walk(d);
  return out.sort();
};

// What the text of a store that may be shared should not hold, by line and kind, the text never quoted: this machine's home
// directory, the first label of its host name and its user name, each as a word, and a term of terms.txt in the machine's
// directory, one a line. With listed, the terms alone: the script's own records hold paths of this machine by design.
function ofMachine(c, p) {
  const low = (s) => slash(s).toLowerCase(), h = keyOf(c.home, 'win32'), edge = (ch) => !ch || !/[a-z0-9_]/.test(ch);
  const own = [[!h || /^[a-z]:$/.test(h) ? '' : h, 'the home directory'], [low(c.host).split('.')[0], 'the host name'], [low(c.user), 'the user name']];
  const terms = readText(join(p.local, 'terms.txt')).split('\n').map((l) => low(l.trim())).filter(Boolean);
  // t with each w that stands as a word taken out, or null where it holds none.
  const cut = (t, w) => {
    let out = '', from = 0;
    for (let at = w ? t.indexOf(w) : -1; at >= 0; at = t.indexOf(w, at + 1)) if (at >= from && edge(t[at - 1]) && edge(t[at + w.length])) { out += `${t.slice(from, at)} `; from = at + w.length; }
    return from ? out + t.slice(from) : null;
  };
  return (text, listed) => (text.includes('\0') ? [] : text.split('\n').flatMap((l, i) => {
    // A path under the home directory holds the user name, and a host name may: each is told once, by the longer.
    let t = low(l);
    const kinds = (listed ? [] : own).filter(([w]) => { const rest = cut(t, w); if (rest !== null) t = rest; return rest !== null; }).map(([, kind]) => kind);
    if (terms.some((w) => cut(t, w) !== null)) kinds.push('a listed term');
    return kinds.map((kind) => `${i + 1} holds ${kind}`);
  }));
}

function status(c) {
  const p = places(c, ownOf(c));
  // A copies record that cannot be read costs the copies their lines and not the rest of the report.
  let copies;
  try { const rec = copiesOf(c, p); copies = rec.v.copies.flatMap((x) => copyLines(c, rec, x)); } catch (e) { if (!(e instanceof Refusal)) throw e; copies = [`copies: ${e.message}`]; }
  return [...delivery(c, p), ...copies];
}

function delivery(c, p) {
  const map = loadMap(p.map, c.home);
  const lines = [`primer: ${p.own}${existsSync(p.own) ? '' : ' (missing)'}`, `store: ${p.store}${p.cfg.store ? (isDir(p.store) ? '' : ' (missing)') : map.repos.some((e) => e.profile === 'local') ? '' : ' (default, no local repository)'}`, `map: ${p.map} (${p.cfg.store && !existsSync(p.map) ? 'missing' : `${map.repos.length} repositories, ${map.roots.length} roots`})`];
  let repo;
  try { repo = repoOf(c, c.cwd, Date.now() + c.limit); } catch (e) {
    if (!(e instanceof Unknown)) throw e;
    return [...lines, `check git: unknown, no answer within ${c.limit / 1000} s`];
  }
  if (!repo) return [...lines, `repository: none, ${topOf(c, c.cwd) ? `git read none at ${slash(c.cwd)}, though ${topOf(c, c.cwd)} holds .git` : `${slash(c.cwd)} is in no git work tree`}`];
  const entry = match(map, repo, c.platform), root = under(map, repo.root, c.platform), at = !entry && entryAt(map, repo.root, c.platform);
  lines.push(`repository: ${repo.root} (${repo.remotes.join(', ') || 'no remote'})`, `entry: ${entry ? shown(entry) : 'none'}`, `profile: ${entry?.profile ?? 'none'}`);
  // A review file that cannot be read costs its own line and not the rest of the report.
  let rv = null;
  try { rv = reviewOf(c, p, repo.root); } catch (e) { if (!(e instanceof Refusal)) throw e; lines.push(`check review: ${e.message}`); }
  if (rv && existsSync(rv.path)) lines.push(`review: ${rv.path}, ${rv.logs.length} log directories, ${rv.entry ? `${rv.skip.length} notes skipped and transcripts ${rv.transcripts ? 'on' : 'off'} for this repository` : 'no entry for this repository'}`);
  if (entry?.profile === 'local') {
    const parts = layersOf(p, entry), n = joined(parts).length;
    for (const x of parts) lines.push(`layer ${x.name}: ${x.file}, ${x.text ? `${x.text.length} characters, canary ${x.canary}` : x.bad ? 'not a file' : 'missing or empty'}`);
    lines.push(`check size: ${n} characters as emitted, ${n > CAP ? 'over' : 'within'} the cap of ${CAP}`);
  }
  for (const said of [left(c, p), apart(c, p)]) if (said) lines.push(`check machine: ${said}`);
  const loose = skillsOf(c, p).filter((x) => x.state !== 'linked');
  if (loose.length) lines.push(`check skills: no link in ${join(dirname(p.own), 'skills')} for ${loose.map((x) => x.name).join(', ')}`);
  const mine = ofMachine(c, p);
  for (const f of [join(p.store, 'shared.md'), ...mdIn(join(p.store, 'groups')), ...filesIn(join(p.store, 'docs')), ...filesIn(join(p.store, 'skills')), join(p.store, 'ledger.jsonl'), ...filesIn(join(p.store, 'copies'))]) for (const hit of mine(readText(f))) lines.push(`check tracked: ${held(c, p, f)}:${hit}`);
  for (const f of [p.map, join(p.store, 'copies.json')]) for (const hit of mine(readText(f), true)) lines.push(`check tracked: ${held(c, p, f)}:${hit}`);
  return [...lines, `check map: ${entry ? 'mapped' : at ? `unmapped, at the path of the entry of group ${at.group}, with none of its remotes` : root ? `unmapped, under the root ${root}` : 'unmapped, under no root'}`, `check git: answered within ${c.limit / 1000} s`];
}

const MEASURE = 'measure takes nothing, or --with <file> <layer>, the layer being shared.md, groups/<group>.md, machine.md or machine/<group>.md';

// Each mapped repository's context string as the loader emits it; with --with, before and after the file takes the layer's place,
// and for a group's layer that no local entry holds, as a move writes one before its entry, a repository of that group's.
function measure(c, args) {
  const p = places(c, ownOf(c)), map = loadMap(p.map, c.home);
  let swap;
  if (args.length) {
    const [flag, file, layer] = args, g = layer?.match(/^(groups|machine)\/(.+)\.md$/);
    if (flag !== '--with' || args.length !== 3 || !(layer === 'shared.md' || layer === 'machine.md' || (g && GROUP.test(g[2])))) refuse(MEASURE);
    const buf = (() => { try { return readFileSync(resolve(c.cwd, file)); } catch { return refuse(`${file} cannot be read`); } })();
    const name = g ? (g[1] === 'groups' ? 'group' : 'machine-group') : layer.slice(0, -3);
    swap = { name, file: fileOf(p, name, g?.[2]), buf, group: g?.[2] };
  }
  const out = [`primer: the host's cap is ${CAP} characters per context string, counted as emitted`], size = (x) => x.text?.length ?? 0;
  const hits = swap && keyOf(swap.file, c.platform).startsWith(`${keyOf(p.store, c.platform)}/`) ? ofMachine(c, p)(swap.buf.toString('utf8')).map((hit) => `check tracked: ${args[2]}:${hit}`) : [];
  const line = (who, e) => {
    const now = layersOf(p, e).map((x) => (x.bad ? refuse(x.bad) : x)), next = swap ? layersOf(p, e, swap) : now, n = joined(next).length;
    const parts = now.map((x, i) => `${x.name} ${size(x)}${x.file === swap?.file ? ` -> ${size(next[i])}` : ''}`);
    return `${who}: ${swap ? `${joined(now).length} -> ` : ''}${n} characters (${parts.join(', ')}), ${n > CAP ? 'over' : 'within'} the cap`;
  };
  for (const e of map.repos) out.push(e.profile === 'local' ? line(`repo ${shown(e)}`, e) : `repo ${shown(e)}: no context string`);
  const at = (f) => keyOf(f, c.platform);
  if (swap?.group && !map.repos.some((e) => e.profile === 'local' && at(fileOf(p, swap.name, e.group)) === at(swap.file))) out.push(line(`group ${swap.group}, in no local entry of the map`, { group: swap.group }));
  return [...out, ...hits];
}

const COPIES = 'copies takes nothing, --add <copy> <source>, --ported <copy> or --spans';
const SPAN = 3;
const readBuf = (path) => { try { return readFileSync(path); } catch { return null; } };

// The declared copies, <store>/copies.json, with each source's snapshot at <store>/copies/<id>. A path inside the store is held
// relative to it, one under the config folder as <config>/ and one under the home directory as ~/, so a store shared between
// machines holds few paths of one machine.
function copiesOf(c, p) {
  const path = join(p.store, 'copies.json'), v = readJson(path, 'a primer copies record') ?? { version: 1, copies: [] }, k = (f) => keyOf(f, c.platform);
  const ok = v && v.version === 1 && Array.isArray(v.copies) && v.copies.every((x) => x && /^C\d+$/.test(x.id) && ['copy', 'source', 'digest'].every((f) => typeof x[f] === 'string'));
  if (!ok) refuse(`${path} is not a primer copies record`);
  const real = (h) => (h.startsWith('<config>/') ? join(dirname(p.own), h.slice(9)) : h.startsWith('~/') ? join(c.home, h.slice(2)) : isAbsolute(h) ? h : join(p.store, h));
  const key = (h) => k(real(h));
  return { path, v, held: (f) => held(c, p, f), real, key, snap: (x) => join(p.store, 'copies', x.id), all: (f) => v.copies.filter((x) => key(x.copy) === key(held(c, p, f))) };
}

// One copy's state, by bytes: the source against its snapshot and the copy against its digest, with the source's diff from the
// snapshot as git renders it, its path header cut.
function copyLines(c, rec, x) {
  const src = readBuf(rec.real(x.source)), cp = readBuf(rec.real(x.copy)), snap = readBuf(rec.snap(x));
  const s = !src || !snap || !src.equals(snap), k = !cp || createHash('sha256').update(cp).digest('hex') !== x.digest;
  const gone = [[src, x.source], [cp, x.copy], [snap, `the snapshot copies/${x.id}`]].filter(([b]) => !b).map(([, f]) => `, ${f} is missing`).join('');
  const out = [`copy ${x.id} ${x.copy} of ${x.source}: ${s && k ? 'both changed' : s ? 'source changed' : k ? 'copy changed' : 'current'}${gone}`];
  if (!s || !src || !snap) return out;
  const r = git(c, dirname(rec.snap(x)), ['-c', 'core.quotepath=off', 'diff', '--no-index', '--no-color', '--no-ext-diff', '--no-textconv', '--', rec.snap(x), rec.real(x.source)]);
  const lines = r.stdout.split('\n').map((l) => l.replace(/\r$/, '')), at = lines.findIndex((l) => l.startsWith('@@'));
  return [...out, ...(at < 0 ? [] : lines.slice(at).filter((l, i, a) => l || i < a.length - 1).map((l) => `  ${l}`))];
}

function copiesVerb(c, [op, ...args]) {
  const p = places(c, ownOf(c)), at = (f) => resolve(c.cwd, tilde(f, c.home));
  if (op === '--spans') return args.length ? refuse(COPIES) : spans(p);
  const rec = copiesOf(c, p), file = (f) => (statSync(at(f), { throwIfNoEntry: false })?.isFile() ? at(f) : refuse(`${at(f)} is not a file`));
  if (op === undefined) return [`copies: ${rec.path} (${rec.v.copies.length} declared)`, ...rec.v.copies.flatMap((x) => copyLines(c, rec, x))];
  // A copy has one record for each of its sources. --ported takes a path to the copy's file, else the copy as status prints it:
  // one inside the store is relative to the store.
  let xs, sign = '~';
  if (op === '--add' && args.length === 2) {
    const [copy, source] = args.map(file);
    if (keyOf(copy, c.platform) === keyOf(source, c.platform)) refuse('a copy and its source are two files');
    const same = rec.all(copy).find((y) => rec.key(y.source) === rec.key(rec.held(source)));
    if (same) refuse(`${same.id} already declares ${slash(copy)}; after a port, use --ported`);
    xs = [{ id: `C${rec.v.copies.reduce((n, y) => Math.max(n, Number(y.id.slice(1))), 0) + 1}`, copy: rec.held(copy), source: rec.held(source), digest: '' }];
    rec.v.copies.push(xs[0]);
    sign = '+';
  } else if (op === '--ported' && args.length === 1) {
    xs = rec.all(at(args[0]));
    if (!xs.length) xs = rec.v.copies.filter((y) => rec.key(y.copy) === rec.key(args[0]));
    if (!xs.length) refuse(`${slash(at(args[0]))} is not a declared copy`);
  } else refuse(COPIES);
  const srcs = xs.map((x) => readBuf(rec.real(x.source)) ?? refuse(`${rec.real(x.source)} cannot be read`)), cp = readBuf(rec.real(xs[0].copy)) ?? refuse(`${rec.real(xs[0].copy)} cannot be read`);
  xs.forEach((x, i) => { x.digest = createHash('sha256').update(cp).digest('hex'); writeAtomic(rec.snap(x), srcs[i]); });
  writeAtomic(rec.path, `${JSON.stringify(rec.v, null, 2)}\n`);
  const snaps = xs.map(rec.snap);
  return [`primer: wrote ${[rec.path, ...snaps.slice(0, -1)].join(', ')} and ${snaps.at(-1)}`, ...xs.map((x) => `${sign} ${copyLines(c, rec, x)[0]}`)];
}

// The runs of consecutive lines two layers or documents share, trimmed of blank lines at either end and holding at least SPAN
// lines that are not blank, longest first. Lines compare without their trailing white space.
function spans(p) {
  const files = [join(p.store, 'shared.md'), ...mdIn(join(p.store, 'groups')), join(p.local, 'machine.md'), ...mdIn(join(p.local, 'machine')), ...filesIn(join(p.store, 'docs'))].filter((f) => statSync(f, { throwIfNoEntry: false })?.isFile());
  const text = files.map((f) => { const l = readText(f).split('\n').map((x) => x.trimEnd()); return l.at(-1) === '' ? l.slice(0, -1) : l; });
  const runs = [];
  for (let a = 0; a < files.length; a++) for (let b = a + 1; b < files.length; b++) {
    const A = text[a], B = text[b];
    let prev = new Int32Array(B.length + 1);
    for (let i = 0; i < A.length; i++) {
      const cur = new Int32Array(B.length + 1);
      for (let j = 0; j < B.length; j++) {
        if (A[i] !== B[j]) continue;
        cur[j + 1] = prev[j] + 1;
        if (i + 1 < A.length && j + 1 < B.length && A[i + 1] === B[j + 1]) continue;
        let s = i - cur[j + 1] + 1, e = i;
        while (s <= e && !A[s]) s++;
        while (e >= s && !A[e]) e--;
        if (A.slice(s, e + 1).filter(Boolean).length >= SPAN) runs.push({ n: e - s + 1, a, b, sa: s, sb: s + j - i });
      }
      prev = cur;
    }
  }
  runs.sort((x, y) => y.n - x.n || x.a - y.a || x.sa - y.sa || x.b - y.b || x.sb - y.sb);
  const what = `shared by two layers or documents, of at least ${SPAN} lines that are not blank`;
  return [runs.length ? `primer: ${runs.length} ${runs.length === 1 ? 'run' : 'runs'} ${what}, longest first` : `primer: no run ${what}`,
    ...runs.map((r) => `${r.n} lines: ${files[r.a]} ${r.sa + 1}-${r.sa + r.n} and ${files[r.b]} ${r.sb + 1}-${r.sb + r.n}`)];
}

// The store's skills, each an entry of skills/ that holds SKILL.md, with the entry of its name in <config>/skills, where the host
// loads a personal skill: a link that leads to it, none, a link whose directory is gone, or something else. Where <config>/skills
// is itself no directory, it is the entry in the way.
function skillsOf(c, p) {
  const from = join(p.store, 'skills'), to = join(dirname(p.own), 'skills'), free = !existsSync(to) || isDir(to);
  const names = (() => { try { return readdirSync(from); } catch { return []; } })();
  return names.filter((name) => existsSync(join(from, name, 'SKILL.md'))).sort().map((name) => {
    const dir = join(from, name), link = free ? join(to, name) : to, at = free && lstatSync(link, { throwIfNoEntry: false });
    const state = !free ? 'other' : !at ? 'missing' : at.isSymbolicLink() && !existsSync(link) ? 'gone' : keyOf(real(link), c.platform) === keyOf(real(dir), c.platform) ? 'linked' : 'other';
    return { name, dir, link, state };
  });
}

// Lists them; --link makes each missing link, a junction on Windows, makes again one whose directory is gone, and leaves an entry
// that is anything else.
function skillsVerb(c, args) {
  if (args.length > 1 || (args.length && args[0] !== '--link')) refuse('skills takes nothing, or --link');
  const p = places(c, ownOf(c)), said = { linked: 'linked', missing: 'not linked', gone: 'not linked, and its link leads to a directory that is gone' };
  const lines = skillsOf(c, p).map((x) => {
    if (!args.length || !['missing', 'gone'].includes(x.state)) return `skill ${x.name}: ${said[x.state] ?? `${x.link} is not a link to it and is left as it is`}`;
    if (x.state === 'gone') rmSync(x.link);
    mkdirSync(dirname(x.link), { recursive: true });
    symlinkSync(x.dir, x.link, 'junction');
    return `skill ${x.name}: + linked`;
  });
  return [`skills: ${join(p.store, 'skills')}, linked from ${join(dirname(p.own), 'skills')}`, ...(lines.length ? lines : ['no skills'])];
}

// The directory at or above a path that holds .git, found without git and, as git does, never above a ceiling directory.
function topOf(c, path) {
  const ceilings = (c.env.GIT_CEILING_DIRECTORIES ?? '').split(c.platform === 'win32' ? ';' : ':').filter(Boolean).map((d) => keyOf(d, c.platform));
  for (let d = resolve(path); ; d = dirname(d)) {
    if (existsSync(join(d, '.git'))) return slash(d);
    if (dirname(d) === d || ceilings.includes(keyOf(dirname(d), c.platform))) return null;
  }
}

// The root instruction files and unscoped rules of a work tree, as the host would load them for a session started there.
function instructionsOf(top) {
  const hub = existsSync(join(top, 'CLAUDE.md')) ? readText(join(top, 'CLAUDE.md')) : null;
  const names = ['CLAUDE.md', ...(hub === null || /^@AGENTS\.md(\r?\n)?$/.test(hub) ? ['AGENTS.md'] : []), '.claude/CLAUDE.md', 'CLAUDE.local.md'];
  const rules = [], walk = (d) => {
    for (const e of (() => { try { return readdirSync(d, { withFileTypes: true }); } catch { return []; } })()) {
      const f = join(d, e.name);
      if (e.isDirectory()) walk(f);
      else if (e.name.endsWith('.md')) {
        const lines = readText(f).split(/\r?\n/), end = lines[0] === '---' ? lines.indexOf('---', 1) : -1;
        if (!lines.slice(1, end < 0 ? 1 : end).some((l) => /^paths\s*:/.test(l))) rules.push(slash(relative(top, f)));
      }
    }
  };
  walk(join(top, '.claude', 'rules'));
  return [...names.filter((f) => existsSync(join(top, f))), ...rules.sort()].map((f) => `${top}/${f}`);
}

// The first edit of a session in a repository other than its own: the paths of its root instruction files and unscoped rules, and
// its layers when it is mapped local. The repository is recorded in <data>/reach/<session>, so a later edit is silent.
function reach(c, data, input) {
  const path = input.tool_input?.file_path ?? input.tool_input?.notebook_path, cwd = isDir(input.cwd) ? input.cwd : c.cwd;
  if (typeof path !== 'string' || !path) return [];
  const file = resolve(cwd, path), top = topOf(c, dirname(file)), own = topOf(c, c.env.CLAUDE_PROJECT_DIR || cwd), k = (p) => keyOf(p, c.platform);
  // The file's directory by its nearest ancestor that exists, links followed, since a first write makes its directory.
  let at = dirname(file), rest = '';
  while (!existsSync(at) && dirname(at) !== at) [at, rest] = [dirname(at), join(basename(at), rest)];
  const inside = (d) => `${k(join(real(at), rest))}/`.startsWith(`${k(real(d))}/`);
  // The host loads the user's own instruction files in every session, so a file under <config>, links followed, is never another repository's.
  if (!top || (own && k(top) === k(own)) || inside(configOf(c, input))) return [];
  const conf = join(configOf(c, input), 'reimagine-primer'), p = existsSync(conf) && places(c, conf);
  // A file of the store or the machine's directory is primer's to write wherever it sits, and a repository that holds it is not recorded.
  if (p && [p.store, p.local].some(inside)) return [];
  const log = data && isAbsolute(data) && typeof input.session_id === 'string' && GROUP.test(input.session_id) ? join(data, 'reach', input.session_id) : null;
  if (log && readText(log).split('\n').includes(k(top))) return [];
  // The entry stops at 10 s, so the git calls here get 5 s at most.
  const deadline = Date.now() + Math.min(c.limit, 5000), repo = repoOf(c, top, deadline), mine = own && repoOf(c, own, deadline);
  if (!repo) return [];
  const map = p && loadMap(p.map, c.home);
  // Another work tree of the session's repository is its own: it is recorded and gets nothing.
  const other = !(mine && k(mine.root) === k(repo.root)), entry = other && map && match(map, repo, c.platform), home = map && mine && match(map, mine, c.platform);
  // A session that started in a local repository holds the shared and machine layers, and the group's two where the two share one.
  const has = (x) => home?.profile === 'local' && (!x.name.endsWith('group') || home.group === entry.group);
  const layers = entry?.profile === 'local' && joined(layersOf(p, entry).filter((x) => (x.bad ? refuse(x.bad) : !has(x)))), files = other ? instructionsOf(repo.top) : [];
  const text = [files.length && `instruction files: ${files.join(', ')}`, layers && `context, which follows.\n\n${layers}`].filter(Boolean).join('; nor its ');
  // Recorded last, so an error above leaves the next edit to be answered; a record that cannot be written answers every edit.
  if (log) try { mkdirSync(dirname(log), { recursive: true }); appendFileSync(log, `${k(top)}\n`); } catch {}
  const lead = `primer: ${repo.top} is in a repository other than the one this session started in, and the session has not loaded its`;
  return text ? [JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: `${lead} ${text}` } })] : [];
}

// Writes beside the target, then renames over it; on Windows a rename that fails is retried once after a short wait.
export function writeAtomic(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.reimagine-tmp-${process.pid}`;
  writeFileSync(tmp, text);
  try { renameSync(tmp, path); } catch (e) {
    if (process.platform === 'win32') { sleep(500); try { renameSync(tmp, path); return; } catch {} }
    rmSync(tmp, { force: true });
    refuse(`could not replace ${path} (${e.code})`);
  }
}

function mapVerb(c, [op, ...args]) {
  const p = places(c, ownOf(c)), map = loadMap(p.map, c.home), o = { roots: [] };
  if (op === undefined) return [`map: ${p.map}`, ...map.repos.map((e) => `repo: ${shown(e)}`), ...map.roots.map((r) => `root: ${r}`)];
  if (!['--add', '--set', '--drop'].includes(op)) refuse(FORMS);
  for (let i = 0; i < args.length; i++) {
    const [a, v] = [args[i], args[++i]];
    if (v === undefined || v.startsWith('--') || (op === '--drop' && a !== '--root')) refuse(FORMS);
    if (a === '--profile') o.profile = PROFILES.includes(v) ? v : refuse(`--profile takes shared or local, not ${v}`);
    else if (a === '--group') o.group = GROUP.test(v) ? v : refuse(`--group takes letters, digits, ., _ and -, starting with a letter or digit, not ${v}`);
    else if (a === '--root') o.roots.push(slash(real(resolve(c.cwd, tilde(v, c.home)))));
    else if ((a === '--store' || a === '--local') && op === '--set') o[a.slice(2)] = isAbsolute(v) || /^~[\\/]/.test(v) ? v : refuse(`${a} takes an absolute or ~/ path, not ${v}`);
    else refuse(FORMS);
  }
  const fields = ['profile', 'group'].some((k) => k in o);
  if (op === '--add' ? (!fields && !o.roots.length) || (fields && !o.profile) : op === '--set' && (o.store || o.local ? fields || o.roots.length : !fields && !o.roots.length)) refuse(FORMS);
  // The store may be shared, so the machine's directory sits outside it.
  const dir = (v, d) => (v ? resolve(tilde(v, c.home)) : d), store = dir(o.store, p.store), local = dir(o.local, p.local);
  if ((o.store || o.local) && `${keyOf(local, c.platform)}/`.startsWith(`${keyOf(store, c.platform)}/`)) refuse(`the machine's directory ${local} would sit inside the store ${store}, which may be shared; name one outside it`);
  const out = [];
  if (fields || (op === '--drop' && !o.roots.length)) {
    const repo = repoOf(c, c.cwd) ?? refuse(`${slash(c.cwd)} is in no git work tree`), at = map.repos.indexOf(match(map, repo, c.platform));
    if (op === '--add') {
      if (at >= 0) refuse(`this repository is already mapped (${shown(map.repos[at])}); use --set`);
      const name = (repo.remotes[0] ?? repo.root).split('/').at(-1).replace(/[^A-Za-z0-9._-]/g, '-').replace(/^[^A-Za-z0-9]+/, '') || 'repository';
      map.repos.push({ remotes: repo.remotes, path: repo.root, group: o.group ?? name, profile: o.profile });
      out.push(`repo: + ${shown(map.repos.at(-1))}`);
    } else if (at < 0) refuse('this repository has no entry in the map; use --add');
    else if (op === '--drop') out.push(`repo: - ${shown(map.repos.splice(at, 1)[0])}`);
    else {
      for (const k of ['profile', 'group']) if (k in o) map.repos[at][k] = o[k];
      out.push(`repo: ~ ${shown(map.repos[at])}`);
    }
  }
  for (const r of o.roots) {
    const at = map.roots.findIndex((d) => keyOf(d, c.platform) === keyOf(r, c.platform));
    if (op === '--drop' && at < 0) refuse(`the map's roots do not hold ${r}`);
    if (op === '--drop') out.push(`root: - ${map.roots.splice(at, 1)[0]}`);
    else if (at < 0) out.push(`root: + ${map.roots[map.roots.push(r) - 1]}`);
  }
  const kept = { ...map, version: 2, repos: map.repos.map((e) => ({ ...e, path: homed(c, e.path) })), roots: map.roots.map((d) => homed(c, d)) };
  if (out.length) { writeAtomic(p.map, `${JSON.stringify(kept, null, 2)}\n`); out.unshift(`primer: wrote ${p.map}`); }
  if (o.store || o.local) {
    writeAtomic(p.cfgPath, `${JSON.stringify({ ...p.cfg, ...(o.store && { store: o.store }), ...(o.local && { local: o.local }) }, null, 2)}\n`);
    out.unshift(`primer: wrote ${p.cfgPath}`);
    const gone = left(c, places(c, p.own));
    if (gone) out.push(`primer: ${gone}`);
  }
  return out.length ? out : ['primer: the map already holds that; nothing was written'];
}

// Returns the output lines; a refusal throws. limit is the time the loader's and status's git calls share, in milliseconds.
export function main(argv, { env = process.env, platform = process.platform, home = homedir(), cwd = process.cwd(), stdin = () => readFileSync(0, 'utf8'), limit = 30000, user, host = hostname() } = {}) {
  const [verb, ...rest] = argv, c = { env, platform, home, cwd, limit, host, user: user ?? (() => { try { return userInfo().username; } catch { return ''; } })() };
  const input = () => { try { const v = JSON.parse(stdin()); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; } };
  if (verb === 'session-start') { try { return sessionStart(c, rest[0], input(), rest[1]); } catch { return []; } }
  if (verb === 'reach') { try { return reach(c, rest[0], input()); } catch { return []; } }
  if (verb === 'status') return rest.length ? refuse('status takes no arguments') : status(c);
  if (verb === 'measure') return measure(c, rest);
  if (verb === 'map') return mapVerb(c, rest);
  if (verb === 'copies') return copiesVerb(c, rest);
  if (verb === 'skills') return skillsVerb(c, rest);
  return refuse(`unknown command${verb ? ` ${verb}` : ''}; use session-start, reach, status, measure, map, copies or skills`);
}

// Node resolves the entry point through symlinks, so compare with the resolved path. A hook verb prints nothing but its JSON, and
// nothing on an error of its own.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    const lines = main(process.argv.slice(2));
    process.stdout.write(lines.length ? `${lines.join('\n')}\n` : '');
  } catch (e) {
    process.stdout.write(`${e instanceof Refusal ? `primer: ${e.message}` : `primer: unexpected error: ${e?.stack ?? e}`}\n`); process.exitCode = 1;
  }
}

#!/usr/bin/env node
// Primer: the local profile's store and map, its context loader, the budget, the reach check and the copies. The staging check
// is staged.mjs, which imports what it shares from here.
// Usage: node primer.mjs <verb> [args]
//   session-start <layer> <data dir>  the SessionStart hook: a local repository's layers as context, the delivery warnings, the notice;
//            on SubagentStart, the layers alone
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
import { appendFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, hostname, userInfo } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CAP = 10000;
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
const homed = (c, f) => {
  const h = keyOf(c.home, c.platform), k = keyOf(f, c.platform);
  return !h || /^[a-z]:$/i.test(h) ? slash(f) : k === h ? '~' : k.startsWith(`${h}/`) ? `~/${slash(f).slice(h.length + 1)}` : slash(f);
};
// The same for a file that may sit inside the store, which is held relative to it.
export const held = (c, p, f) => { const s = keyOf(p.store, c.platform); return keyOf(f, c.platform).startsWith(`${s}/`) ? slash(f).slice(s.length + 1) : homed(c, f); };
export const readText = (path) => { try { return readFileSync(path, 'utf8'); } catch { return ''; } };
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
  if (timeout <= 0) throw new Unknown();
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env: { ...c.env, GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C', LANGUAGE: 'C' }, timeout, maxBuffer: 1 << 28 });
  if (r.error) throw r.error.code === 'ETIMEDOUT' ? new Unknown() : r.error;
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
const under = (map, root, platform) => map.roots.find((d) => `${keyOf(root, platform)}/`.startsWith(`${keyOf(d, platform)}/`));
const shown = (e) => `group ${e.group}, profile ${e.profile}, ${e.remotes.length ? `remotes ${e.remotes.join(', ')}` : `path ${e.path}`}`;

// Each layer of an entry as it is emitted: a line naming the layer and its file, the text, and a canary line holding the first
// eight hex characters of the SHA-256 of the file's bytes, a CRLF line end read as LF so that a store git checks out either way
// gives one string. An empty or missing layer has no text. swap gives one file other bytes.
const fileOf = (p, name, group) => (name === 'machine' ? join(p.local, 'machine.md') : name === 'machine-group' ? join(p.local, 'machine', `${group}.md`)
  : name === 'shared' ? join(p.store, 'shared.md') : join(p.store, 'groups', `${group}.md`));
// A machine layer left in primer's own directory after config.json named another for the machine.
const left = (c, p) => (keyOf(p.local, c.platform) !== keyOf(p.own, c.platform) && existsSync(join(p.own, 'machine.md')) ? `${join(p.own, 'machine.md')} is not read while ${p.cfgPath} names ${p.local}; move its text to ${join(p.local, 'machine.md')}` : null);
function layersOf(p, entry, swap) {
  const files = Object.fromEntries(LAYERS.map((name) => [name, fileOf(p, name, entry.group)]));
  return LAYERS.map((name) => {
    const raw = swap?.file === files[name] ? swap.buf : existsSync(files[name]) ? readFileSync(files[name]) : null;
    const buf = raw && Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n')), body = buf ? buf.toString('utf8').replace(/\s+$/, '') : '';
    if (!body) return { name, file: files[name] };
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

// The feedback logs of <config>/feedback/ as one repository reads them. A log's entries are its level-two sections, but one headed
// Recommended, and an entry is the repository's when its heading holds, as a word, the name of the repository's directory or of a
// remote. .reviewed holds, a line per repository and log, how many entries the log had at that repository's last review.
export function feedbackOf(config, repo) {
  const dir = join(config, 'feedback'), stamp = join(dir, '.reviewed'), key = repo.root.replace(/[^A-Za-z0-9]/g, '-'), low = (s) => s.replace(/[A-Z]/g, (ch) => ch.toLowerCase());
  const last = (u) => slash(u).replace(/\/+$/, '').replace(/\.git$/, '').replace(/\/+$/, '').replace(/^.*[/:]/, '');
  const names = [...new Set([repo.root, ...repo.urls].map((u) => low(last(u))).filter(Boolean))], edge = (ch) => !ch || !/[a-z0-9_-]/.test(ch);
  const named = (h) => names.some((nm) => { for (let at = h.indexOf(nm); at >= 0; at = h.indexOf(nm, at + 1)) if (edge(h[at - 1]) && edge(h[at + nm.length])) return true; return false; });
  const marks = readText(stamp).split('\n').map((l) => l.replace(/\r$/, '').split('\t')).filter((f) => f.length === 3 && /^[0-9]+$/.test(f[1]));
  const read = new Map(marks.filter((f) => f[0] === key).map((f) => [f[2], Number(f[1])]));
  const files = (() => { try { return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile() && !e.name.startsWith('.')).map((e) => e.name).sort(); } catch { return []; } })();
  const logs = files.map((name) => {
    const heads = readText(join(dir, name)).split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.startsWith('## ') && !/^recommended([^a-z0-9_-]|$)/.test(low(l.slice(3)).replace(/^[ \t]+/, '')));
    return { name, total: heads.length, unread: heads.map((l, i) => ({ n: i + 1, heading: l.slice(3).trim(), own: named(low(l.slice(3))) })).slice(read.get(name) ?? 0) };
  });
  return { stamp, key, reviewed: read.size > 0, others: marks.filter((f) => f[0] !== key), logs };
}

// The notice of notice.sh for a local repository, which has no hub: the auto memory notes of type feedback or project modified
// after the stamp, and the repository's feedback entries since its last review. After a review a single entry makes no notice:
// it is taken for the reviewing session's own, which that session logs after the stamp is written.
function notice(c, input, data, repo) {
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
  const noted = stamp(key), since = noted && readText(noted).split(/\r?\n/)[0], seen = new Set();
  let n = 0;
  for (const l of readText(join(memory, 'MEMORY.md')).split('\n').map((x) => x.replace(/\r$/, ''))) {
    const at = l.indexOf(']('), rest = l.slice(at + 2), name = rest.slice(0, rest.indexOf(')'));
    if (!l.startsWith('- [') || at < 0 || !rest.includes(')') || !name || name.startsWith('/') || /\.\.|\\|:/.test(name) || seen.has(name)) continue;
    seen.add(name);
    const fm = frontOf(readText(join(memory, name)));
    if (['feedback', 'project'].includes(fm.type) && (noted === null || (fm.modified && fm.modified > since))) n++;
  }
  const fb = feedbackOf(config, repo), own = fb.logs.reduce((a, l) => a + l.unread.filter((e) => e.own).length, 0), m = fb.reviewed && own < 2 ? 0 : own;
  const what = n && m ? `auto memory has ${n} notes and ${m} feedback entries` : n ? `auto memory has ${n} notes` : `${m} feedback entries`;
  return n || m ? `primer: ${what} since the last review; run /primer` : null;
}

function sessionStart(c, layer, input, data) {
  // At a subagent's start no check or notice runs, and the agent types that start without instruction files get no layer either.
  const sub = input.hook_event_name === 'SubagentStart', quiet = sub || c.env.CLAUDE_CODE_SESSION_ATTENDED === '0';
  if (![...LAYERS, 'all'].includes(layer) || (sub && ['Explore', 'Plan'].includes(input.agent_type))) return [];
  const own = join(configOf(c, input), 'reimagine-primer');
  if (!existsSync(own)) return [];
  const p = places(c, own), map = loadMap(p.map, c.home);
  if (!map.roots.length && !map.repos.some((e) => e.profile === 'local')) return [];
  const cwd = isDir(input.cwd) ? input.cwd : c.cwd, msgs = [];
  let repo, context;
  try { repo = repoOf(c, cwd, Date.now() + c.limit); } catch (e) {
    if (!(e instanceof Unknown)) throw e;
    msgs.push(`primer: the context of ${slash(cwd)} is unknown, since git gave no answer within ${c.limit / 1000} s`);
  }
  const entry = repo && match(map, repo, c.platform), root = repo && !entry && under(map, repo.root, c.platform);
  if (root) msgs.push(`primer: ${repo.root} is unmapped, under ${root} of the map's roots; run /primer to map it`);
  if (entry?.profile === 'local') {
    const parts = layersOf(p, entry).filter((x) => x.text);
    // A resumed session still holds the string its start was given.
    context = input.source === 'resume' ? undefined : layer === 'all' ? joined(parts) : parts.find((x) => x.name === layer)?.text;
    const sizes = layer === 'all' ? [{ text: joined(parts), what: 'the context string', of: ` (${parts.map((x) => `${x.name} ${x.text.length}`).join(', ')})` }]
      : parts.map((x) => ({ text: x.text, what: `the ${x.name} layer`, of: '' }));
    for (const s of sizes) if (s.text.length > CAP) msgs.push(`primer: ${s.what} is ${s.text.length} characters as emitted, over the host's cap of ${CAP}${s.of}`);
    // notice.sh runs at startup alone, and so does this.
    const told = (input.source ?? 'startup') === 'startup' && !quiet && (layer === 'all' || layer === 'group') && notice(c, input, data || c.env.CLAUDE_PLUGIN_DATA, repo);
    if (told) msgs.push(told);
  }
  const warn = msgs.length && !quiet && (layer === 'all' || layer === 'group');
  const out = { ...(context ? { hookSpecificOutput: { hookEventName: sub ? 'SubagentStart' : 'SessionStart', additionalContext: context } } : {}), ...(warn ? { systemMessage: msgs.join('; ') } : {}) };
  return Object.keys(out).length ? [JSON.stringify(out)] : [];
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
// directory, one a line.
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
  return (text) => (text.includes('\0') ? [] : text.split('\n').flatMap((l, i) => {
    // A path under the home directory holds the user name, and a host name may: each is told once, by the longer.
    let t = low(l);
    const kinds = own.filter(([w]) => { const rest = cut(t, w); if (rest !== null) t = rest; return rest !== null; }).map(([, kind]) => kind);
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
  const lines = [`primer: ${p.own}${existsSync(p.own) ? '' : ' (missing)'}`, `store: ${p.store}`, `map: ${p.map} (${map.repos.length} repositories, ${map.roots.length} roots)`];
  let repo;
  try { repo = repoOf(c, c.cwd, Date.now() + c.limit); } catch (e) {
    if (!(e instanceof Unknown)) throw e;
    return [...lines, `check git: unknown, no answer within ${c.limit / 1000} s`];
  }
  if (!repo) return [...lines, `repository: none, ${slash(c.cwd)} is in no git work tree`];
  const entry = match(map, repo, c.platform), root = under(map, repo.root, c.platform);
  lines.push(`repository: ${repo.root} (${repo.remotes.join(', ') || 'no remote'})`, `entry: ${entry ? shown(entry) : 'none'}`, `profile: ${entry?.profile ?? 'none'}`);
  if (entry?.profile === 'local') {
    const parts = layersOf(p, entry), n = joined(parts).length;
    for (const x of parts) lines.push(`layer ${x.name}: ${x.file}, ${x.text ? `${x.text.length} characters, canary ${x.canary}` : 'missing or empty'}`);
    lines.push(`check size: ${n} characters as emitted, ${n > CAP ? 'over' : 'within'} the cap of ${CAP}`);
  }
  if (left(c, p)) lines.push(`check machine: ${left(c, p)}`);
  const loose = skillsOf(c, p).filter((x) => x.state !== 'linked');
  if (loose.length) lines.push(`check skills: no link in ${join(dirname(p.own), 'skills')} for ${loose.map((x) => x.name).join(', ')}`);
  const mine = ofMachine(c, p);
  for (const f of [join(p.store, 'shared.md'), ...mdIn(join(p.store, 'groups')), ...filesIn(join(p.store, 'docs')), ...filesIn(join(p.store, 'skills')), join(p.store, 'ledger.jsonl'), ...filesIn(join(p.store, 'copies'))]) for (const hit of mine(readText(f))) lines.push(`check tracked: ${held(c, p, f)}:${hit}`);
  return [...lines, `check map: ${entry ? 'mapped' : root ? `unmapped, under the root ${root}` : 'unmapped, under no root'}`, `check git: answered within ${c.limit / 1000} s`];
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
    const now = layersOf(p, e), next = swap ? layersOf(p, e, swap) : now, n = joined(next).length;
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
// relative to it and one under the home directory as ~/, so a store shared between machines holds few paths of one machine.
function copiesOf(c, p) {
  const path = join(p.store, 'copies.json'), v = readJson(path, 'a primer copies record') ?? { version: 1, copies: [] }, k = (f) => keyOf(f, c.platform);
  const ok = v && v.version === 1 && Array.isArray(v.copies) && v.copies.every((x) => x && /^C\d+$/.test(x.id) && ['copy', 'source', 'digest'].every((f) => typeof x[f] === 'string'));
  if (!ok) refuse(`${path} is not a primer copies record`);
  const real = (h) => (h.startsWith('~/') ? join(c.home, h.slice(2)) : isAbsolute(h) ? h : join(p.store, h));
  return { path, v, held: (f) => held(c, p, f), real, snap: (x) => join(p.store, 'copies', x.id), all: (f) => v.copies.filter((x) => k(x.copy) === k(held(c, p, f))) };
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
    const same = rec.all(copy).find((y) => keyOf(y.source, c.platform) === keyOf(rec.held(source), c.platform));
    if (same) refuse(`${same.id} already declares ${slash(copy)}; after a port, use --ported`);
    xs = [{ id: `C${rec.v.copies.reduce((n, y) => Math.max(n, Number(y.id.slice(1))), 0) + 1}`, copy: rec.held(copy), source: rec.held(source), digest: '' }];
    rec.v.copies.push(xs[0]);
    sign = '+';
  } else if (op === '--ported' && args.length === 1) {
    xs = rec.all(at(args[0]));
    if (!xs.length) xs = rec.v.copies.filter((y) => y.copy === args[0]);
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
  const deadline = Date.now() + c.limit, repo = repoOf(c, top, deadline), mine = own && repoOf(c, own, deadline);
  if (!repo) return [];
  const map = p && loadMap(p.map, c.home);
  // Another work tree of the session's repository is its own: it is recorded and gets nothing.
  const other = !(mine && k(mine.root) === k(repo.root)), entry = other && map && match(map, repo, c.platform), home = map && mine && match(map, mine, c.platform);
  // A session that started in a local repository holds the shared and machine layers, and the group's two where the two share one.
  const has = (x) => home?.profile === 'local' && (!x.name.endsWith('group') || home.group === entry.group);
  const layers = entry?.profile === 'local' && joined(layersOf(p, entry).filter((x) => !has(x))), files = other ? instructionsOf(repo.top) : [];
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
export function main(argv, { env = process.env, platform = process.platform, home = homedir(), cwd = process.cwd(), stdin = () => readFileSync(0, 'utf8'), limit = 5000, user, host = hostname() } = {}) {
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

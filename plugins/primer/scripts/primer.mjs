#!/usr/bin/env node
// Primer: the local profile's store and map, its context loader, the budget, the reach check and the copies. The staging check
// is staged.mjs, which imports what it shares from here.
// Usage: node primer.mjs <verb> [args]
//   session-start <layer> <data dir>  the SessionStart hook: a local repository's layers as context, the delivery warnings, the notice
//   reach <data dir>  the PreToolUse hook on file edits: another repository's instructions, on the session's first edit there
//   status   the working directory's entry, profile, layers and delivery checks, and each declared copy; writes nothing
//   measure  every mapped repository's context string as emitted; --with <file> <layer> measures a proposed layer; writes nothing
//   map      prints the map; --add, --set and --drop change it for the working directory's repository
//   copies   each declared copy against its source's snapshot; --add <copy> <source> records one source of a copy, and
//            --ported <copy> every source of it;
//            --spans lists the runs of lines two layers or documents share, and writes nothing
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CAP = 10000;
const LAYERS = ['shared', 'group', 'machine'];
const PROFILES = ['shared', 'local'];
const GROUP = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const FORMS = 'map takes --add with --profile shared|local [--group <name>] or --root <dir>, --set with any of '
  + '--profile, --group and --root or with --store <path> alone, or --drop [--root <dir>]; nothing else is accepted';

export class Refusal extends Error {}
class Unknown extends Error {}
const refuse = (message) => { throw new Refusal(message); };
const slash = (p) => p.replace(/\\/g, '/');
const keyOf = (p, platform) => { const s = slash(p).replace(/\/+$/, ''); return platform === 'win32' ? s.toLowerCase() : s; };
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
export const isDir = (p) => typeof p === 'string' && p !== '' && !!statSync(p, { throwIfNoEntry: false })?.isDirectory();
export const tilde = (p, home) => (p === '~' ? home : /^~[\\/]/.test(p) ? join(home, p.slice(2)) : p);
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

// The repository a directory is in: its main work tree's root, its top level, its remotes as host/path and its remote names.
export function repoOf(c, cwd, deadline) {
  const r = git(c, cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir', '--show-toplevel'], deadline);
  if (r.status !== 0) return null;
  const [common, top] = r.stdout.split('\n');
  const fetch = git(c, cwd, ['remote', '-v'], deadline).stdout.split('\n').map((l) => l.trim().match(/^(\S+)\s+(.+) \(fetch\)$/)).filter(Boolean);
  return { root: slash(dirname(common)), top: slash(top), remotes: [...new Set(fetch.map((m) => normalizeRemote(m[2])).filter(Boolean))].sort(), names: fetch.map((m) => m[1]) };
}

// <config> as the hooks find it: three levels above the input's transcript, else the variable, else ~/.claude.
export const configOf = (c, input) => (typeof input?.transcript_path === 'string' && input.transcript_path
  ? dirname(dirname(dirname(input.transcript_path))) : c.env.CLAUDE_CONFIG_DIR || join(c.home, '.claude'));
export const ownOf = (c) => join(c.env.CLAUDE_CONFIG_DIR || join(c.home, '.claude'), 'reimagine-primer');

function readJson(path, what) {
  if (!existsSync(path)) return undefined;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return refuse(`${path} is not ${what}`); }
}

// Primer's own directory, its configuration, the store and the map path.
export function places(c, own) {
  const cfgPath = join(own, 'config.json'), cfg = readJson(cfgPath, 'a primer configuration') ?? {};
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg) || (cfg.store !== undefined && typeof cfg.store !== 'string')) refuse(`${cfgPath} is not a primer configuration`);
  const store = cfg.store ? resolve(tilde(cfg.store, c.home)) : join(own, 'store');
  return { own, cfgPath, cfg, store, map: join(store, 'map.json') };
}

export function loadMap(path) {
  const v = readJson(path, 'a primer map');
  if (v === undefined) return { version: 1, repos: [], roots: [] };
  const ok = v && v.version === 1 && Array.isArray(v.roots) && v.roots.every((r) => typeof r === 'string') && Array.isArray(v.repos)
    && v.repos.every((r) => r && Array.isArray(r.remotes) && r.remotes.every((x) => typeof x === 'string') && typeof r.path === 'string'
      && typeof r.group === 'string' && GROUP.test(r.group) && PROFILES.includes(r.profile));
  if (!ok) refuse(`${path} is not a primer map`);
  // An older map holds an own key in each entry, which nothing reads; the next write leaves it out.
  for (const r of v.repos) delete r.own;
  return v;
}

export const match = (map, repo, platform) => map.repos.find((e) => e.remotes.some((r) => repo.remotes.includes(r))
  || ((!repo.remotes.length || !e.remotes.length) && keyOf(e.path, platform) === keyOf(repo.root, platform)));
const under = (map, root, platform) => map.roots.find((d) => `${keyOf(root, platform)}/`.startsWith(`${keyOf(d, platform)}/`));
const shown = (e) => `group ${e.group}, profile ${e.profile}, ${e.remotes.length ? `remotes ${e.remotes.join(', ')}` : `path ${e.path}`}`;

// Each layer of an entry as it is emitted: a line naming the layer and its file, the text, and a canary line holding the first
// eight hex characters of the SHA-256 of the file's bytes. An empty or missing layer has no text. swap gives one file other bytes.
const fileOf = (p, name, group) => (name === 'machine' ? join(p.own, 'machine.md') : name === 'shared' ? join(p.store, 'shared.md') : join(p.store, 'groups', `${group}.md`));
function layersOf(p, entry, swap) {
  const files = Object.fromEntries(LAYERS.map((name) => [name, fileOf(p, name, entry.group)]));
  return LAYERS.map((name) => {
    const buf = swap?.file === files[name] ? swap.buf : existsSync(files[name]) ? readFileSync(files[name]) : null, body = buf ? buf.toString('utf8').replace(/\s+$/, '') : '';
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

// The notice of notice.sh for a local repository, which has no hub: the auto memory notes of type feedback or project modified
// after the stamp, and the feedback logs under <config>/feedback/ modified after theirs, .reviewed beside them or else
// reviewed/feedback in the data directory, each counting in full without a stamp.
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
  let n = 0, m = 0;
  for (const l of readText(join(memory, 'MEMORY.md')).split('\n').map((x) => x.replace(/\r$/, ''))) {
    const at = l.indexOf(']('), rest = l.slice(at + 2), name = rest.slice(0, rest.indexOf(')'));
    if (!l.startsWith('- [') || at < 0 || !rest.includes(')') || !name || name.startsWith('/') || /\.\.|\\|:/.test(name) || seen.has(name)) continue;
    seen.add(name);
    const fm = frontOf(readText(join(memory, name)));
    if (['feedback', 'project'].includes(fm.type) && (noted === null || (fm.modified && fm.modified > since))) n++;
  }
  const logs = join(config, 'feedback'), mark = file(join(logs, '.reviewed')) ?? stamp('feedback'), after = mark ? statSync(mark).mtimeMs : -Infinity;
  try { for (const e of readdirSync(logs, { withFileTypes: true })) if (e.isFile() && !e.name.startsWith('.') && statSync(join(logs, e.name)).mtimeMs > after) m++; } catch {}
  const what = n && m ? `auto memory has ${n} notes and ${m} feedback logs` : n ? `auto memory has ${n} notes` : `${m} feedback logs`;
  return n || m ? `primer: ${what} since the last review; run /primer` : null;
}

function sessionStart(c, layer, input, data) {
  if (![...LAYERS, 'all'].includes(layer)) return [];
  const own = join(configOf(c, input), 'reimagine-primer');
  if (!existsSync(own)) return [];
  const p = places(c, own), map = loadMap(p.map);
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
    const told = (input.source ?? 'startup') === 'startup' && c.env.CLAUDE_CODE_SESSION_ATTENDED !== '0' && layer !== 'shared' && layer !== 'machine' && notice(c, input, data || c.env.CLAUDE_PLUGIN_DATA, repo);
    if (told) msgs.push(told);
  }
  const warn = msgs.length && c.env.CLAUDE_CODE_SESSION_ATTENDED !== '0' && (layer === 'all' || layer === 'group');
  const out = { ...(context ? { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } } : {}), ...(warn ? { systemMessage: msgs.join('; ') } : {}) };
  return Object.keys(out).length ? [JSON.stringify(out)] : [];
}

function status(c) {
  const p = places(c, ownOf(c));
  // A copies record that cannot be read costs the copies their lines and not the rest of the report.
  let copies;
  try { const rec = copiesOf(c, p); copies = rec.v.copies.flatMap((x) => copyLines(c, rec, x)); } catch (e) { if (!(e instanceof Refusal)) throw e; copies = [`copies: ${e.message}`]; }
  return [...delivery(c, p), ...copies];
}

function delivery(c, p) {
  const map = loadMap(p.map);
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
  return [...lines, `check map: ${entry ? 'mapped' : root ? `unmapped, under the root ${root}` : 'unmapped, under no root'}`, `check git: answered within ${c.limit / 1000} s`];
}

const MEASURE = 'measure takes nothing, or --with <file> <layer>, the layer being shared.md, groups/<group>.md or machine.md';

// Each mapped repository's context string as the loader emits it; with --with, before and after the file takes the layer's place.
function measure(c, args) {
  const p = places(c, ownOf(c)), map = loadMap(p.map);
  let swap;
  if (args.length) {
    const [flag, file, layer] = args, g = layer?.match(/^groups\/(.+)\.md$/);
    if (flag !== '--with' || args.length !== 3 || !(layer === 'shared.md' || layer === 'machine.md' || (g && GROUP.test(g[1])))) refuse(MEASURE);
    const buf = (() => { try { return readFileSync(resolve(c.cwd, file)); } catch { return refuse(`${file} cannot be read`); } })();
    swap = { file: fileOf(p, g ? 'group' : layer.slice(0, -3), g?.[1]), buf };
  }
  const out = [`primer: the host's cap is ${CAP} characters per context string, counted as emitted`], size = (x) => x.text?.length ?? 0;
  for (const e of map.repos) {
    if (e.profile !== 'local') { out.push(`repo ${shown(e)}: no context string`); continue; }
    const now = layersOf(p, e), next = swap ? layersOf(p, e, swap) : now, n = joined(next).length;
    const parts = now.map((x, i) => `${x.name} ${size(x)}${x.file === swap?.file ? ` -> ${size(next[i])}` : ''}`);
    out.push(`repo ${shown(e)}: ${swap ? `${joined(now).length} -> ` : ''}${n} characters (${parts.join(', ')}), ${n > CAP ? 'over' : 'within'} the cap`);
  }
  return out;
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
  const inside = (f, d) => k(f).startsWith(`${k(d)}/`) && slash(f).slice(k(d).length + 1);
  const held = (f) => inside(f, p.store) || (inside(f, c.home) ? `~/${inside(f, c.home)}` : slash(f));
  const real = (h) => (h.startsWith('~/') ? join(c.home, h.slice(2)) : isAbsolute(h) ? h : join(p.store, h));
  return { path, v, held, real, snap: (x) => join(p.store, 'copies', x.id), all: (f) => v.copies.filter((x) => k(x.copy) === k(held(f))) };
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
  const docs = [], walk = (d) => { for (const e of (() => { try { return readdirSync(d, { withFileTypes: true }); } catch { return []; } })()) (e.isDirectory() ? walk : (f) => docs.push(f))(join(d, e.name)); };
  walk(join(p.store, 'docs'));
  const groups = (() => { try { return readdirSync(join(p.store, 'groups')).filter((f) => f.endsWith('.md')).sort().map((f) => join(p.store, 'groups', f)); } catch { return []; } })();
  const files = [join(p.store, 'shared.md'), ...groups, join(p.own, 'machine.md'), ...docs.sort()].filter((f) => statSync(f, { throwIfNoEntry: false })?.isFile());
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
  // The host loads the user's own instruction files in every session, so a file under <config>, links followed, is never another repository's.
  if (!top || (own && k(top) === k(own)) || `${k(real(dirname(file)))}/`.startsWith(`${k(real(configOf(c, input)))}/`)) return [];
  const log = data && isAbsolute(data) && typeof input.session_id === 'string' && GROUP.test(input.session_id) ? join(data, 'reach', input.session_id) : null;
  if (log && readText(log).split('\n').includes(k(top))) return [];
  const deadline = Date.now() + c.limit, repo = repoOf(c, top, deadline), mine = own && repoOf(c, own, deadline);
  if (!repo) return [];
  const conf = join(configOf(c, input), 'reimagine-primer'), p = existsSync(conf) && places(c, conf), map = p && loadMap(p.map);
  // Another work tree of the session's repository is its own: it is recorded and gets nothing.
  const other = !(mine && k(mine.root) === k(repo.root)), entry = other && map && match(map, repo, c.platform), home = map && mine && match(map, mine, c.platform);
  // A session that started in a local repository holds the shared and machine layers, and the group's where the two share one.
  const held = (x) => home?.profile === 'local' && (x.name !== 'group' || home.group === entry.group);
  const layers = entry?.profile === 'local' && joined(layersOf(p, entry).filter((x) => !held(x))), files = other ? instructionsOf(repo.top) : [];
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
  const p = places(c, ownOf(c)), map = loadMap(p.map), o = { roots: [] };
  if (op === undefined) return [`map: ${p.map}`, ...map.repos.map((e) => `repo: ${shown(e)}`), ...map.roots.map((r) => `root: ${r}`)];
  if (!['--add', '--set', '--drop'].includes(op)) refuse(FORMS);
  for (let i = 0; i < args.length; i++) {
    const [a, v] = [args[i], args[++i]];
    if (v === undefined || v.startsWith('--') || (op === '--drop' && a !== '--root')) refuse(FORMS);
    if (a === '--profile') o.profile = PROFILES.includes(v) ? v : refuse(`--profile takes shared or local, not ${v}`);
    else if (a === '--group') o.group = GROUP.test(v) ? v : refuse(`--group takes letters, digits, ., _ and -, starting with a letter or digit, not ${v}`);
    else if (a === '--root') o.roots.push(slash(real(resolve(c.cwd, tilde(v, c.home)))));
    else if (a === '--store' && op === '--set') o.store = isAbsolute(v) || /^~[\\/]/.test(v) ? v : refuse(`--store takes an absolute or ~/ path, not ${v}`);
    else refuse(FORMS);
  }
  const fields = ['profile', 'group'].some((k) => k in o);
  if (op === '--add' ? (!fields && !o.roots.length) || (fields && !o.profile) : op === '--set' && (o.store ? fields || o.roots.length : !fields && !o.roots.length)) refuse(FORMS);
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
  if (out.length) { writeAtomic(p.map, `${JSON.stringify(map, null, 2)}\n`); out.unshift(`primer: wrote ${p.map}`); }
  if (o.store) { writeAtomic(p.cfgPath, `${JSON.stringify({ ...p.cfg, store: o.store }, null, 2)}\n`); out.unshift(`primer: wrote ${p.cfgPath}`); }
  return out.length ? out : ['primer: the map already holds that; nothing was written'];
}

// Returns the output lines; a refusal throws. limit is the time the loader's and status's git calls share, in milliseconds.
export function main(argv, { env = process.env, platform = process.platform, home = homedir(), cwd = process.cwd(), stdin = () => readFileSync(0, 'utf8'), limit = 5000 } = {}) {
  const [verb, ...rest] = argv, c = { env, platform, home, cwd, limit };
  const input = () => { try { const v = JSON.parse(stdin()); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; } };
  if (verb === 'session-start') { try { return sessionStart(c, rest[0], input(), rest[1]); } catch { return []; } }
  if (verb === 'reach') { try { return reach(c, rest[0], input()); } catch { return []; } }
  if (verb === 'status') return rest.length ? refuse('status takes no arguments') : status(c);
  if (verb === 'measure') return measure(c, rest);
  if (verb === 'map') return mapVerb(c, rest);
  if (verb === 'copies') return copiesVerb(c, rest);
  return refuse(`unknown command${verb ? ` ${verb}` : ''}; use session-start, reach, status, measure, map or copies`);
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

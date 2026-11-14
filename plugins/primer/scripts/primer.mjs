#!/usr/bin/env node
// Primer: the local profile's store and map, its context loader, its staging check, the budget, the reach check and the copies.
// Usage: node primer.mjs <verb> [args]
//   session-start <layer> <data dir>  the SessionStart hook: a local repository's layers as context, the delivery warnings, the notice
//   staged   the drift hook's hand-off: denies a git add or commit that puts an agent file the upstream lacks in a local history
//   reach <data dir>  the PreToolUse hook on file edits: another repository's instructions, on the session's first edit there
//   status   the working directory's entry, profile, layers and delivery checks, and each declared copy; writes nothing
//   measure  every mapped repository's context string as emitted; --with <file> <layer> measures a proposed layer; writes nothing
//   map      prints the map; --add, --set and --drop change it for the working directory's repository
//   copies   each declared copy against its source's snapshot; --add <copy> <source> and --ported <copy> record one;
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
const AGENT_NAMES = new Set(['claude.md', 'claude.local.md', 'agents.md', '.reimagine.json', '.mcp.json']);
const AGENT_DIRS = new Set(['.claude', '.reimagine']);
const FORMS = 'map takes --add with --profile shared|local [--own true|false] [--group <name>] or --root <dir>, --set with any of '
  + '--profile, --own, --group and --root or with --store <path> alone, or --drop [--root <dir>]; nothing else is accepted';

export class Refusal extends Error {}
class Unknown extends Error {}
const refuse = (message) => { throw new Refusal(message); };
const slash = (p) => p.replace(/\\/g, '/');
const keyOf = (p, platform) => { const s = slash(p).replace(/\/+$/, ''); return platform === 'win32' ? s.toLowerCase() : s; };
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const isDir = (p) => typeof p === 'string' && p !== '' && !!statSync(p, { throwIfNoEntry: false })?.isDirectory();
const tilde = (p, home) => (p === '~' ? home : /^~[\\/]/.test(p) ? join(home, p.slice(2)) : p);
const readText = (path) => { try { return readFileSync(path, 'utf8'); } catch { return ''; } };
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
function git(c, cwd, args, deadline) {
  const timeout = deadline ? deadline - Date.now() : 30000;
  if (timeout <= 0) throw new Unknown();
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env: { ...c.env, GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C', LANGUAGE: 'C' }, timeout, maxBuffer: 1 << 28 });
  if (r.error) throw r.error.code === 'ETIMEDOUT' ? new Unknown() : r.error;
  return r;
}
const blob = (c, cwd, spec) => { const r = git(c, cwd, ['cat-file', 'blob', spec]); return r.status === 0 ? r.stdout : ''; };

// The repository a directory is in: its main work tree's root, its top level, its remotes as host/path and its remote names.
function repoOf(c, cwd, deadline) {
  const r = git(c, cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir', '--show-toplevel'], deadline);
  if (r.status !== 0) return null;
  const [common, top] = r.stdout.split('\n');
  const fetch = git(c, cwd, ['remote', '-v'], deadline).stdout.split('\n').map((l) => l.trim().match(/^(\S+)\s+(.+) \(fetch\)$/)).filter(Boolean);
  return { root: slash(dirname(common)), top: slash(top), remotes: [...new Set(fetch.map((m) => normalizeRemote(m[2])).filter(Boolean))].sort(), names: fetch.map((m) => m[1]) };
}

// <config> as the hooks find it: three levels above the input's transcript, else the variable, else ~/.claude.
const configOf = (c, input) => (typeof input?.transcript_path === 'string' && input.transcript_path
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

function loadMap(path) {
  const v = readJson(path, 'a primer map');
  if (v === undefined) return { version: 1, repos: [], roots: [] };
  const ok = v && v.version === 1 && Array.isArray(v.roots) && v.roots.every((r) => typeof r === 'string') && Array.isArray(v.repos)
    && v.repos.every((r) => r && Array.isArray(r.remotes) && r.remotes.every((x) => typeof x === 'string') && typeof r.path === 'string'
      && typeof r.group === 'string' && GROUP.test(r.group) && PROFILES.includes(r.profile) && (r.own === null || typeof r.own === 'boolean'));
  return ok ? v : refuse(`${path} is not a primer map`);
}

const match = (map, repo, platform) => map.repos.find((e) => e.remotes.some((r) => repo.remotes.includes(r))
  || ((!repo.remotes.length || !e.remotes.length) && keyOf(e.path, platform) === keyOf(repo.root, platform)));
const under = (map, root, platform) => map.roots.find((d) => `${keyOf(root, platform)}/`.startsWith(`${keyOf(d, platform)}/`));
const shown = (e) => `group ${e.group}, profile ${e.profile}, own ${e.own ?? 'unset'}, ${e.remotes.length ? `remotes ${e.remotes.join(', ')}` : `path ${e.path}`}`;

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
// after the stamp, and the feedback logs under <config>/feedback/ modified after theirs, each counting in full without a stamp.
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
  const stamp = (name) => { const f = data && join(data, 'reviewed', name); return f && existsSync(f) ? f : null; };
  const noted = stamp(key), since = noted && readText(noted).split(/\r?\n/)[0], seen = new Set();
  let n = 0, m = 0;
  for (const l of readText(join(memory, 'MEMORY.md')).split('\n').map((x) => x.replace(/\r$/, ''))) {
    const at = l.indexOf(']('), rest = l.slice(at + 2), name = rest.slice(0, rest.indexOf(')'));
    if (!l.startsWith('- [') || at < 0 || !rest.includes(')') || !name || name.startsWith('/') || /\.\.|\\|:/.test(name) || seen.has(name)) continue;
    seen.add(name);
    const fm = frontOf(readText(join(memory, name)));
    if (['feedback', 'project'].includes(fm.type) && (noted === null || (fm.modified && fm.modified > since))) n++;
  }
  const logs = join(config, 'feedback'), after = stamp('feedback') ? statSync(stamp('feedback')).mtimeMs : -Infinity;
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
    context = layer === 'all' ? joined(parts) : parts.find((x) => x.name === layer)?.text;
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
  return { path, v, held, real, snap: (x) => join(p.store, 'copies', x.id), find: (f) => v.copies.find((x) => k(x.copy) === k(held(f))) };
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
  let x, sign = '~';
  if (op === '--add' && args.length === 2) {
    const [copy, source] = args.map(file);
    if (keyOf(copy, c.platform) === keyOf(source, c.platform)) refuse('a copy and its source are two files');
    if (rec.find(copy)) refuse(`${rec.find(copy).id} already declares ${slash(copy)}; after a port, use --ported`);
    x = { id: `C${rec.v.copies.reduce((n, y) => Math.max(n, Number(y.id.slice(1))), 0) + 1}`, copy: rec.held(copy), source: rec.held(source), digest: '' };
    rec.v.copies.push(x);
    sign = '+';
  } else if (op === '--ported' && args.length === 1) x = rec.find(file(args[0])) ?? refuse(`${slash(at(args[0]))} is not a declared copy`);
  else refuse(COPIES);
  const src = readBuf(rec.real(x.source)) ?? refuse(`${rec.real(x.source)} cannot be read`);
  x.digest = createHash('sha256').update(readFileSync(rec.real(x.copy))).digest('hex');
  writeAtomic(rec.snap(x), src);
  writeAtomic(rec.path, `${JSON.stringify(rec.v, null, 2)}\n`);
  return [`primer: wrote ${rec.path} and ${rec.snap(x)}`, `${sign} ${copyLines(c, rec, x)[0]}`];
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
    else if (a === '--own') o.own = v === 'true' ? true : v === 'false' ? false : refuse(`--own takes true or false, not ${v}`);
    else if (a === '--group') o.group = GROUP.test(v) ? v : refuse(`--group takes letters, digits, ., _ and -, starting with a letter or digit, not ${v}`);
    else if (a === '--root') o.roots.push(slash(real(resolve(c.cwd, tilde(v, c.home)))));
    else if (a === '--store' && op === '--set') o.store = isAbsolute(v) || /^~[\\/]/.test(v) ? v : refuse(`--store takes an absolute or ~/ path, not ${v}`);
    else refuse(FORMS);
  }
  const fields = ['profile', 'own', 'group'].some((k) => k in o);
  if (op === '--add' ? (!fields && !o.roots.length) || (fields && !o.profile) : op === '--set' && (o.store ? fields || o.roots.length : !fields && !o.roots.length)) refuse(FORMS);
  if (op === '--add' && o.profile === 'shared' && o.own === undefined) refuse('--add --profile shared takes --own true or --own false');
  const out = [];
  if (fields || (op === '--drop' && !o.roots.length)) {
    const repo = repoOf(c, c.cwd) ?? refuse(`${slash(c.cwd)} is in no git work tree`), at = map.repos.indexOf(match(map, repo, c.platform));
    if (op === '--add') {
      if (at >= 0) refuse(`this repository is already mapped (${shown(map.repos[at])}); use --set`);
      const name = (repo.remotes[0] ?? repo.root).split('/').at(-1).replace(/[^A-Za-z0-9._-]/g, '-').replace(/^[^A-Za-z0-9]+/, '') || 'repository';
      map.repos.push({ remotes: repo.remotes, path: repo.root, group: o.group ?? name, profile: o.profile, own: o.own ?? null });
      out.push(`repo: + ${shown(map.repos.at(-1))}`);
    } else if (at < 0) refuse('this repository has no entry in the map; use --add');
    else if (op === '--drop') out.push(`repo: - ${shown(map.repos.splice(at, 1)[0])}`);
    else {
      for (const k of ['profile', 'own', 'group']) if (k in o) map.repos[at][k] = o[k];
      if (map.repos[at].profile === 'shared' && map.repos[at].own === null) refuse('--set --profile shared takes --own true or --own false');
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

// The simple commands of a shell text, each a list of words { w, bad, git }, with ( and ) kept: bad marks an expansion the
// script cannot resolve, a brace expansion among them, git a command substitution that stages or commits with git. Null for a quote
// left open or a process substitution outside quotes. A here-document ends the list, which then carries lost, and hidden when the
// text from there on names a git add, stage or commit, so the calls before it keep their directories. A backtick outside quotes
// separates commands in sh, so what a substitution runs is read as a command of its own.
function commands(s, ps) {
  const out = [];
  let words = [], cur = '', inw = false, bad = false, sub = false, skip = false;
  const end = () => {
    if (inw && !skip) words.push({ w: cur, bad, git: sub && /(?:\$\(|`|[;&|])\s*git\b[^)`]*\b(add|stage|commit)\b/.test(cur) });
    [skip, cur, inw, bad, sub] = [skip && !inw, '', false, false, false];
  };
  const cut = () => { end(); if (words.length) out.push(words); words = []; };
  for (let i = 0; i < s.length; i++) {
    const ch = s[i], nx = s[i + 1];
    if (ch === "'") {
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
      if (ch === '<' && nx === '<') { cut(); [out.lost, out.hidden] = [true, /\bgit(\.exe)?\b[^\n]*\b(add|stage|commit)\b/i.test(s.slice(i))]; return out; }
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
  if (SHELLS.has(b)) {
    let j = 0;
    for (; j < rest.length && /^[-+]/.test(rest[j].w); j++) if (rest[j].w === '-o' || rest[j].w === '+o') j++;
    if (rest.slice(0, j).some((x) => /^-[A-Za-z]*c[A-Za-z]*$/.test(x.w)) && rest[j]) {
      if (rest[j].bad) st.lost = st.hidden = true; else { const keep = st.dir; st.dir = dir; scan(rest[j].w, false, st); st.dir = keep; }
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
    const sub = rest[j]?.w === 'stage' ? 'add' : rest[j]?.w, args = rest.slice(j + 1);
    if (sub === 'add' || (sub === 'commit' && !args.some((x) => ['--dry-run', '--help', '-h'].includes(x.w)))) st.calls.push({ sub, dir, args });
  } else if (b === 'xargs' && rest.some((x) => /^git(\.exe)?$/.test(base(x.w)))) st.lost = st.hidden = true;
}

const COMMIT_VALUE = new Set(['message', 'file', 'reuse-message', 'reedit-message', 'fixup', 'squash', 'author', 'date', 'template', 'cleanup', 'trailer']);
const COMMIT_FLAG = new Set(['quiet', 'verbose', 'signoff', 'no-signoff', 'no-verify', 'verify', 'no-edit', 'edit', 'allow-empty', 'allow-empty-message',
  'reset-author', 'no-gpg-sign', 'gpg-sign', 'status', 'no-status', 'no-post-rewrite', 'untracked-files', 'short', 'branch', 'long', 'porcelain', 'null']);
const COMMIT_PASS = { all: '-a', include: '-i', only: '-o', amend: '--amend' };
const isIgnore = (p) => p.split('/').at(-1) === '.gitignore';

// What one git add or git commit would put in the index or the commit, as top-level paths with the ignore files it changes, or
// null when the call cannot be resolved.
function planOf(c, { sub, dir, args }, top) {
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
  const run = (...a) => git(c, dir, a), whole = sub === 'add' || opts.some((o) => o !== '--amend') || specs.length > 0;
  let r, paths;
  if (sub === 'add') {
    if ((r = run('-c', 'core.quotepath=off', 'add', '--dry-run', ...opts, '--', ...specs)).status !== 0) return null;
    paths = [...r.stdout.matchAll(/^add '(.*)'$/gm)].map((m) => m[1]);
  } else if (!whole) {
    // A commit of the index alone: its dry run would rewrite the index, so the staged names are read instead.
    if ((r = run('diff', '--cached', '--name-only', '--diff-filter=d', '-z')).status !== 0) return null;
    paths = r.stdout.split('\0').filter(Boolean);
  } else {
    if ((r = run('commit', '--dry-run', '--porcelain', '-z', ...opts, '--', ...specs)).status > 1) return null;
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
    all = { paths: [...paths, ...parts.flatMap((p) => p.paths)], ignores: paths.filter(isIgnore).map((f) => ({ file: f, now: `${readText(join(repo.top, f))}\n${blob(c, repo.top, `:${f}`)}`, was: blob(c, repo.top, `HEAD:${f}`) })) };
  }
  const agents = [...new Set(all.paths.filter(isAgent))].sort();
  const lines = all.ignores.flatMap((g) => {
    const was = new Set(g.was.split(/\r?\n/).map((l) => l.trim()));
    return [...new Set(g.now.split(/\r?\n/).map((l) => l.trim()))].filter((l) => l && namesAgent(l) && !was.has(l)).map((l) => `the line ${l} in ${g.file}, which names an agent file`);
  });
  const tree = agents.length ? upstream(c, repo) : {};
  const held = new Set(tree.ref ? git(c, repo.top, ['ls-tree', '-r', '-z', '--name-only', '--full-tree', tree.ref, '--', ...agents]).stdout.split('\0') : []);
  const missing = agents.filter((x) => !held.has(x));
  if (!missing.length && !lines.length) return null;
  const items = [...(missing.length ? [`${missing.join(', ')}, ${tree.ref ? `which ${tree.ref} does not hold` : `while the upstream's tree is unknown (${tree.why})`}`] : []), ...lines];
  return `primer: ${repo.top} has the local profile, which keeps agent files out of its history; ${plan ? ''
    : 'the command cannot be resolved, so it counts as staging every file git does not ignore; '}the call would add ${items.join('; ')}`;
}

const deny = (reason) => JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });
function staged(c, input) {
  const own = join(configOf(c, input), 'reimagine-primer');
  if (!existsSync(own)) return [];
  const map = loadMap(places(c, own).map), command = input.tool_input?.command;
  if (typeof command !== 'string' || !map.repos.some((e) => e.profile === 'local')) return [];
  const ps = input.tool_name === 'PowerShell', cwd = isDir(input.cwd) ? input.cwd : c.cwd;
  const st = { dir: cwd, home: c.home, msys: c.platform === 'win32' && !ps, calls: [], lost: false, far: false, hidden: false };
  scan(command, ps, st);
  if (!st.calls.length && !st.hidden) return [];
  if (st.hidden || st.calls.some((x) => !isDir(x.dir))) st.lost = st.far = true;
  const one = st.calls.length === 1 && !st.lost ? st.calls[0] : null, dirs = new Set(st.calls.length ? st.calls.map((x) => x.dir) : [cwd]);
  // Where a directory is unknown the call may run in any local repository, so each one the map holds is checked too.
  if (st.far) for (const e of [{ path: cwd }, ...map.repos.filter((x) => x.profile === 'local')]) dirs.add(e.path);
  for (const dir of dirs) {
    const repo = isDir(dir) && repoOf(c, dir);
    if (!repo || match(map, repo, c.platform)?.profile !== 'local') continue;
    const reason = one ? verdict(c, repo, planOf(c, one, repo.top))
      : verdict(c, repo, null, st.calls.filter((x) => st.far || x.dir === dir).map((x) => planOf(c, { ...x, dir }, repo.top)).filter(Boolean));
    if (reason) return [deny(reason)];
  }
  return [];
}

// Returns the output lines; a refusal throws. limit is the time the loader's and status's git calls share, in milliseconds.
export function main(argv, { env = process.env, platform = process.platform, home = homedir(), cwd = process.cwd(), stdin = () => readFileSync(0, 'utf8'), limit = 5000 } = {}) {
  const [verb, ...rest] = argv, c = { env, platform, home, cwd, limit };
  const input = () => { try { const v = JSON.parse(stdin()); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; } };
  if (verb === 'session-start') { try { return sessionStart(c, rest[0], input(), rest[1]); } catch { return []; } }
  if (verb === 'reach') { try { return reach(c, rest[0], input()); } catch { return []; } }
  if (verb === 'staged') return staged(c, input());
  if (verb === 'status') return rest.length ? refuse('status takes no arguments') : status(c);
  if (verb === 'measure') return measure(c, rest);
  if (verb === 'map') return mapVerb(c, rest);
  if (verb === 'copies') return copiesVerb(c, rest);
  return refuse(`unknown command${verb ? ` ${verb}` : ''}; use session-start, staged, reach, status, measure, map or copies`);
}

// Node resolves the entry point through symlinks, so compare with the resolved path. A hook verb prints nothing but its JSON: on
// an error of its own session-start and reach print nothing, and staged prints a deny that gives the error and exits 2.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const verb = process.argv[2];
  try {
    const lines = main(process.argv.slice(2));
    process.stdout.write(lines.length ? `${lines.join('\n')}\n` : '');
  } catch (e) {
    if (verb === 'staged') { process.stdout.write(`${deny(`primer: the staging check failed, so the call is denied: ${e?.message ?? e}`)}\n`); process.exitCode = 2; }
    else { process.stdout.write(`${e instanceof Refusal ? `primer: ${e.message}` : `primer: unexpected error: ${e?.stack ?? e}`}\n`); process.exitCode = 1; }
  }
}

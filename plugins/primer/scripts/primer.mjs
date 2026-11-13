#!/usr/bin/env node
// Primer: the local profile's store and map, its context loader and its staging check. Usage: node primer.mjs <verb> [args]
//   session-start <layer> <data dir>  the SessionStart hook: a local repository's layers as context, the delivery warnings
//   staged   the drift hook's hand-off: denies a git add or commit that puts an agent file the upstream lacks in a local history
//   status   the working directory's entry, profile, layers and delivery checks; writes nothing
//   map      prints the map; --add, --set and --drop change it for the working directory's repository
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CAP = 10000;
const LAYERS = ['shared', 'group', 'machine'];
const PROFILES = ['shared', 'local'];
const GROUP = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const AGENT_NAMES = new Set(['claude.md', 'claude.local.md', 'agents.md', '.reimagine.json', '.mcp.json']);
const AGENT_DIRS = new Set(['.claude', '.reimagine']);
const FORMS = 'map takes --add with --profile shared|local [--own true|false] [--group <name>] or --root <dir>, --set with any of '
  + '--profile, --own, --group, --root or --store <path>, or --drop [--root <dir>]; nothing else is accepted';

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
const ownOf = (c) => join(c.env.CLAUDE_CONFIG_DIR || join(c.home, '.claude'), 'reimagine-primer');

function readJson(path, what) {
  if (!existsSync(path)) return undefined;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return refuse(`${path} is not ${what}`); }
}

// Primer's own directory, its configuration, the store and the map path.
function places(c, own) {
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
// eight hex characters of the SHA-256 of the file's bytes. An empty or missing layer has no text.
function layersOf(p, entry) {
  const files = { shared: join(p.store, 'shared.md'), group: join(p.store, 'groups', `${entry.group}.md`), machine: join(p.own, 'machine.md') };
  return LAYERS.map((name) => {
    const buf = existsSync(files[name]) ? readFileSync(files[name]) : null, body = buf ? buf.toString('utf8').replace(/\s+$/, '') : '';
    if (!body) return { name, file: files[name] };
    const canary = createHash('sha256').update(buf).digest('hex').slice(0, 8);
    return { name, file: files[name], canary, text: `primer layer ${name} from ${files[name]}\n${body}\nprimer canary ${name} ${canary}` };
  });
}
const joined = (parts) => parts.filter((x) => x.text).map((x) => x.text).join('\n\n');

function sessionStart(c, layer, input) {
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
  }
  const warn = msgs.length && c.env.CLAUDE_CODE_SESSION_ATTENDED !== '0' && (layer === 'all' || layer === 'group');
  const out = { ...(context ? { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } } : {}), ...(warn ? { systemMessage: msgs.join('; ') } : {}) };
  return Object.keys(out).length ? [JSON.stringify(out)] : [];
}

function status(c) {
  const p = places(c, ownOf(c)), map = loadMap(p.map);
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

// Writes beside the target, then renames over it; on Windows a rename that fails is retried once after a short wait.
function writeAtomic(path, text) {
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
  if (op === '--add' ? (!fields && !o.roots.length) || (fields && !o.profile) : op === '--set' && !fields && !o.roots.length && !o.store) refuse(FORMS);
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
// script cannot resolve, git a command substitution that runs git. Null for a quote left open or a process substitution outside
// quotes. A here-document ends the list, which then carries lost, so the calls before it keep their directories.
function commands(s, ps) {
  const out = [];
  let words = [], cur = '', inw = false, bad = false, sub = false, skip = false;
  const end = () => {
    if (inw && !skip) words.push({ w: cur, bad, git: sub && /(?:\$\(|`|[;&|])\s*git\b/.test(cur) });
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
      if (ch === '<' && nx === '<') { cut(); out.lost = true; return out; }
      if (/^\d+$/.test(cur)) [cur, inw] = ['', false];
      end();
      while ('>&|'.includes(s[i + 1] ?? 'x')) i++;
      skip = true;
    } else if (' \t\r\n;&|(){}'.includes(ch)) {
      end();
      if (!' \t\r'.includes(ch)) { cut(); if (ch === '(' || ch === ')') out.push(ch); }
    } else {
      if (ch === '$' || (!ps && ch === '`')) { bad = true; sub ||= ch === '`'; }
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
// directory named apart from the working directory, whose repository it still names.
function scan(s, ps, st) {
  const list = commands(s, ps), dirs = [];
  if (!list || list.lost) st.lost = true;
  for (const item of list ?? []) if (item === '(') dirs.push(st.dir); else if (item === ')') st.dir = dirs.pop() ?? st.dir; else analyze(item, st);
}

function analyze(words, st) {
  if (words.some((x) => x.git || /\bGIT_(DIR|WORK_TREE|INDEX_FILE)\b/.test(x.w))) st.lost = true;
  const at = (dir, x) => { if (!x || x.bad) { st.lost = true; return dir; } return resolve(dir, tilde(x.w, st.home)); };
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
      if (rest[j].bad) st.lost = true; else { const keep = st.dir; st.dir = dir; scan(rest[j].w, false, st); st.dir = keep; }
    }
  } else if (CDS.has(b)) {
    if (b.startsWith('pop') || rest.length !== 1 || rest[0].w.startsWith('-')) st.lost = true; else st.dir = at(st.dir, rest[0]);
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
  } else if (b === 'xargs' && rest.some((x) => /^git(\.exe)?$/.test(base(x.w)))) st.lost = true;
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
// counts as staging every file git does not ignore.
function verdict(c, repo, plan) {
  let all = plan;
  if (!all) {
    const r = git(c, repo.top, ['status', '--porcelain=v1', '-z', '-uall']);
    if (r.status !== 0) throw new Error(`git status exited ${r.status}`);
    const paths = records(r.stdout).filter((x) => x.xy[0] !== 'D' && x.xy !== ' D').map((x) => x.path);
    all = { paths, ignores: paths.filter(isIgnore).map((f) => ({ file: f, now: `${readText(join(repo.top, f))}\n${blob(c, repo.top, `:${f}`)}`, was: blob(c, repo.top, `HEAD:${f}`) })) };
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
  const cwd = isDir(input.cwd) ? input.cwd : c.cwd, st = { dir: cwd, home: c.home, calls: [], lost: false };
  scan(command, input.tool_name === 'PowerShell', st);
  if (!st.calls.length && !st.lost) return [];
  const one = st.calls.length === 1 && !st.lost ? st.calls[0] : null;
  for (const dir of new Set(st.calls.length ? st.calls.map((x) => x.dir) : [cwd])) {
    const repo = isDir(dir) && repoOf(c, dir);
    if (!repo || match(map, repo, c.platform)?.profile !== 'local') continue;
    const reason = verdict(c, repo, one && planOf(c, one, repo.top));
    if (reason) return [deny(reason)];
  }
  return [];
}

// Returns the output lines; a refusal throws. limit is the time the loader's and status's git calls share, in milliseconds.
export function main(argv, { env = process.env, platform = process.platform, home = homedir(), cwd = process.cwd(), stdin = () => readFileSync(0, 'utf8'), limit = 5000 } = {}) {
  const [verb, ...rest] = argv, c = { env, platform, home, cwd, limit };
  const input = () => { try { const v = JSON.parse(stdin()); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; } };
  if (verb === 'session-start') { try { return sessionStart(c, rest[0], input()); } catch { return []; } }
  if (verb === 'staged') return staged(c, input());
  if (verb === 'status') return rest.length ? refuse('status takes no arguments') : status(c);
  if (verb === 'map') return mapVerb(c, rest);
  return refuse(`unknown command${verb ? ` ${verb}` : ''}; use session-start, staged, status or map`);
}

// Node resolves the entry point through symlinks, so compare with the resolved path. A hook verb prints nothing but its JSON: on
// an error of its own session-start prints nothing, and staged prints a deny that gives the error and exits 2.
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

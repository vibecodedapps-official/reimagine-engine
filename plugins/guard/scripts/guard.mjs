#!/usr/bin/env node
// Guard: keeps the auto mode classifier's environment and allow entries for a list of repositories in the user's settings
// file. Usage: node guard.mjs <verb> <dataDir> [args]
//   status   print the state of the entries and the size of the list; writes nothing
//   list     print the repositories in the list
//   plan     show the change and save it; takes --add <path> [--merge], --drop <path or remote> or --clear
//   apply    write the saved change (a backup first), then check the host's effective configuration
//   denials  print the classifier denials the PermissionDenied hook recorded
//   session-start  the startup hook: one notice line when the entries are stale; writes nothing
//   denied   the hook itself: reads a hook input on stdin and appends one line to the denials file
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, chmodSync, constants, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const MARK = ' (reimagine guard)';
const PLAN_FILE = 'guard-plan.json';
const STATE_FILE = 'guard-state.json';
const LIST_FILE = 'reimagine-guard.json';
const VERBS = ['status', 'list', 'plan', 'apply', 'denials'];
const DENIALS_FILE = 'denials.jsonl';
const LISTS = ['environment', 'allow', 'soft_deny', 'hard_deny'];
const FORMS = 'plan takes one of --add <path> [--merge], --drop <path or remote> or --clear; nothing else is accepted';
const GUARD_LABELS = [['trusted repo', 'Trusted repo'], ['source control', 'Source control']];
const ALLOW_OWN = `User's own repositories: pushing a branch to a repository listed under Source control, opening a pull request there, and editing the title or description of, or commenting on, a pull request there that the user's own message asked to work on, one this session did not open included. A body given on stdin, or in a file that the agent or its subagents wrote in this session, counts as derived from this transcript.${MARK}`;
const ALLOW_READS = `Settings reads: reading Claude Code settings files, the settings.json in the configuration directory and a listed repository's .claude/settings.json or .claude/settings.local.json, to inspect or verify configuration is not credential exploration, as long as no value read leaves the machine.${MARK}`;

export class Refusal extends Error {}
// A state that plans nothing, with its note.
class Stop extends Error {
  constructor(state, note) { super(note); this.state = state; this.note = note; }
}
const refuse = (message) => { throw new Refusal(message); };
const stop = (state, note) => { throw new Stop(state, note); };

const short = (s) => s.slice(0, 60);
const isMarked = (s) => s.endsWith(MARK);
const slash = (p) => p.replace(/\\/g, '/');
const sha = (text) => (text === null ? 'missing' : createHash('sha256').update(text, 'utf8').digest('hex'));
const stamp = (now) => now.toISOString().replace(/\D/g, '').slice(0, 14);
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const sorted = (xs) => [...new Set(xs)].sort();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const key = (p, platform) => (platform === 'win32' ? p.toLowerCase() : p);
const byPath = (platform) => (a, b) => { const x = key(a.path, platform), y = key(b.path, platform); return x < y ? -1 : x > y ? 1 : 0; };

// The label of an environment line: the text before its first colon, without asterisks, lowercased.
export const labelOf = (line) => {
  const i = line.indexOf(':');
  return i < 0 ? null : line.slice(0, i).replace(/\*/g, '').trim().toLowerCase();
};

// A remote as host/path, or null for a local path.
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

const git = (env, path, args) => execFileSync('git', ['-C', path, ...args], { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] });
const remotesOf = (env, path) => sorted(git(env, path, ['remote', '-v']).split('\n').flatMap((l) => {
  const m = l.trim().match(/^\S+\s+(.+) \(fetch\)$/);
  const remote = m && normalizeRemote(m[1]);
  return remote ? [remote] : [];
}));

// On Windows a claude installed through npm is a claude.cmd shim, which only cmd.exe resolves; the words are the script's own.
function runClaude(args, configDir, timeout = 60000) {
  const options = { encoding: 'utf8', env: configDir ? { ...process.env, CLAUDE_CONFIG_DIR: configDir } : process.env, stdio: ['ignore', 'pipe', 'pipe'], timeout };
  let shim;
  try { return JSON.parse(execFileSync('claude', args, options)); } catch (e) {
    if (e?.code !== 'ENOENT' || process.platform !== 'win32') throw e;
    const dir = (process.env.PATH ?? '').split(';').map((d) => d.replace(/"/g, '')).find((d) => d && existsSync(join(d, 'claude.cmd')));
    if (!dir) throw e;
    shim = join(dir, 'claude.cmd');
  }
  if (!args.every((a) => /^[a-z-]+$/.test(a))) throw new Error('claude takes only fixed words here');
  return JSON.parse(execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `""${shim}" ${args.join(' ')}"`], { ...options, windowsVerbatimArguments: true }));
}

// Runs claude auto-mode <verb>; anything but an object of the four lists of strings makes the state unavailable.
function ask(claude, verb, dir, timeout) {
  let out;
  try { out = claude(['auto-mode', verb], dir, timeout); } catch (e) { stop('unavailable', `claude auto-mode ${verb} could not run (${e?.code ?? String(e?.message).split('\n')[0]})`); }
  if (!out || typeof out !== 'object' || !LISTS.every((k) => Array.isArray(out[k]) && out[k].every((x) => typeof x === 'string'))) {
    stop('unavailable', `claude auto-mode ${verb} printed no object of the four lists`);
  }
  return out;
}

// What the host's effective configuration holds for a candidate autoMode, against the host's defaults.
export function check(effective, auto, defs) {
  const cand = auto ?? {};
  const problems = [];
  const count = (list, e) => list.filter((x) => x === e).length;
  for (const k of ['environment', 'allow']) {
    for (const e of (cand[k] ?? []).filter(isMarked)) {
      const n = count(effective[k], e);
      if (n !== 1) problems.push(`${short(e)} appears ${n} times`);
    }
    if (!(cand[k] ?? []).some(isMarked)) for (const e of effective[k].filter(isMarked)) problems.push(`${short(e)} remains in the effective ${k} list`);
  }
  for (const lb of new Set(defs.environment.map(labelOf).filter(Boolean))) {
    const n = effective.environment.filter((l) => labelOf(l) === lb).length;
    if (n > 1) problems.push(`the ${lb} label appears ${n} times`);
  }
  if (!cand.allow || cand.allow.includes('$defaults')) {
    const missing = defs.allow.filter((a) => !effective.allow.includes(a)).length;
    if (missing) problems.push(`${missing} default allow rules are missing`);
  }
  return problems;
}

function readFile(path) {
  let buf;
  try { buf = readFileSync(path); } catch (e) { if (e.code === 'ENOENT') return { text: null }; throw e; }
  const text = buf.toString('utf8');
  return { text, bad: !Buffer.from(text, 'utf8').equals(buf) };
}
const readJson = (path) => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return undefined; } };
const loadState = (dataDir) => readJson(join(dataDir, STATE_FILE)) ?? {};
const save = (dataDir, file, value) => {
  mkdirSync(dataDir, { recursive: true });
  writeAtomic(join(dataDir, file), `${JSON.stringify(value, null, 2)}\n`, undefined, 0o600);
};

// The list file: an empty list when it is missing, a stop when it is not a guard list.
function parseList(path, file, platform) {
  let v = null;
  try { if (file.text !== null && !file.bad) v = JSON.parse(file.text); } catch {}
  if (file.text === null) return [];
  const ok = v && v.version === 1 && Array.isArray(v.repos) && v.repos.every((r) => r && typeof r.path === 'string' && typeof r.merge === 'boolean'
    && Array.isArray(r.remotes) && r.remotes.every((x) => typeof x === 'string'));
  if (!ok) stop('malformed', `${path} is not a guard list`);
  return v.repos.map((r) => ({ path: r.path, remotes: r.remotes, merge: r.merge })).sort(byPath(platform));
}
const serialize = (repos) => `${JSON.stringify({ version: 1, repos }, null, 2)}\n`;

// The settings file as the scanner sees it: where each top-level member starts and ends.
function scanObject(text) {
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const ws = () => { while (' \t\r\n'.includes(text[i])) i++; };
  const string = () => { i++; while (text[i] !== '"') i += text[i] === '\\' ? 2 : 1; i++; };
  const value = () => {
    if (text[i] === '"') return string();
    if (text[i] === '{' || text[i] === '[') {
      for (let depth = 0; ; i++) {
        const c = text[i];
        if (c === '"') { string(); i--; } else if (c === '{' || c === '[') depth++;
        else if ((c === '}' || c === ']') && --depth === 0) { i++; return undefined; }
      }
    }
    while (!',}] \t\r\n'.includes(text[i])) i++;
    return undefined;
  };
  ws();
  const open = i, members = [];
  i++;
  ws();
  if (text[i] !== '}') {
    for (;;) {
      ws();
      const keyStart = i;
      string();
      const name = JSON.parse(text.slice(keyStart, i));
      ws(); i++; ws();
      const valueStart = i;
      value();
      members.push({ key: name, keyStart, valueStart, valueEnd: i });
      ws();
      if (text[i] !== ',') break;
      i++;
    }
  }
  return { open, close: i, members };
}

function parseSettings(path, file) {
  if (file.text === null) return { auto: undefined, scan: null };
  if (file.bad) stop('malformed', `${path} is not valid UTF-8`);
  let obj;
  try { obj = JSON.parse(file.text.replace(/^\uFEFF/, '')); } catch { stop('malformed', `${path} is not valid JSON`); }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) stop('malformed', `${path} is not a JSON object`);
  const scan = scanObject(file.text);
  if (scan.members.filter((m) => m.key === 'autoMode').length > 1) stop('malformed', `${path} holds autoMode twice`);
  const auto = obj.autoMode;
  if (auto !== undefined) {
    if (!auto || typeof auto !== 'object' || Array.isArray(auto)) stop('malformed', `autoMode in ${path} is not an object`);
    for (const k of ['environment', 'allow']) {
      if (k in auto && !(Array.isArray(auto[k]) && auto[k].every((x) => typeof x === 'string'))) stop('malformed', `autoMode.${k} in ${path} is not a list of strings`);
    }
  }
  return { auto, scan };
}

// The file's line ending and indent, and whether every member sits on the object's first line.
function layout(text, scan) {
  const nl = text.indexOf('\n');
  const eol = nl > 0 && text[nl - 1] === '\r' ? '\r\n' : '\n';
  const first = scan.members[0], last = scan.members.at(-1);
  const oneLine = !!first && !text.slice(scan.open, last.valueEnd).includes('\n');
  let indent = '  ';
  if (first && !oneLine) {
    const lead = text.slice(text.lastIndexOf('\n', first.keyStart) + 1, first.keyStart);
    if (/^[ \t]*$/.test(lead)) indent = lead;
  }
  return { eol, indent, oneLine };
}
const valueText = (auto, { eol, indent, oneLine }) => (oneLine ? JSON.stringify(auto)
  : JSON.stringify(auto, null, indent).split('\n').map((l, i) => (i ? indent + l : l)).join(eol));

// The settings text with autoMode set to auto, or taken out when auto is undefined; null deletes a file the script created.
function edit(text, scan, auto, created) {
  if (text === null) {
    const lay = { eol: '\n', indent: '  ', oneLine: false };
    return `{\n  "autoMode": ${valueText(auto, lay)}\n}\n`;
  }
  const { members, open, close } = scan;
  const lay = layout(text, scan);
  const at = members.find((m) => m.key === 'autoMode');
  if (auto !== undefined) {
    const v = valueText(auto, lay);
    if (at) return text.slice(0, at.valueStart) + v + text.slice(at.valueEnd);
    if (!members.length) return `${text.slice(0, open)}{${lay.eol}${lay.indent}"autoMode": ${v}${lay.eol}}${text.slice(close + 1)}`;
    const end = members.at(-1).valueEnd;
    return text.slice(0, end) + (lay.oneLine ? `,"autoMode":${v}` : `,${lay.eol}${lay.indent}"autoMode": ${v}`) + text.slice(end);
  }
  const k = members.indexOf(at);
  if (members.length === 1) {
    return created && !text.slice(0, open).trim() && !text.slice(close + 1).trim() ? null : `${text.slice(0, open)}{}${text.slice(close + 1)}`;
  }
  if (k > 0) return text.slice(0, members[k - 1].valueEnd) + text.slice(at.valueEnd);
  return text.slice(0, at.keyStart) + text.slice(members[1].keyStart);
}

// The entries guard writes for a list of repositories.
function entries(repos, defs) {
  const host = defs.environment.find((l) => labelOf(l) === 'trusted repo');
  const sites = repos.map((r) => `${r.path} (${r.remotes.join(', ')})`).join('; ');
  const merge = sorted(repos.filter((r) => r.merge).flatMap((r) => r.remotes));
  return {
    trusted: `${host} The user's own repositories listed under Source control are trusted the same way, at these local checkouts: ${sites}.${MARK}`,
    source: `**Source control**: The trusted repo and its remote(s), and these remotes of the user's own repositories: ${sorted(repos.flatMap((r) => r.remotes)).join(', ')}; as scoped by the Trusted repo and Repository visibility entries above.${MARK}`,
    allow: [ALLOW_OWN, ALLOW_READS, ...(merge.length
      ? [`Owner-reviewed merges: merging a pull request in ${merge.join(', ')}, when the user's own message names that pull request and asks for the merge; the user reviews their own pull requests in these repositories.${MARK}`] : [])],
  };
}

// autoMode with environment and allow replaced; other keys keep their order, a removed key goes, new keys are appended.
function assemble(auto, env, allow) {
  const out = {};
  for (const k of Object.keys(auto ?? {})) {
    if (k === 'environment') { if (env !== undefined) out[k] = env; } else if (k === 'allow') { if (allow !== undefined) out[k] = allow; } else out[k] = auto[k];
  }
  if (env !== undefined && !('environment' in out)) out.environment = env;
  if (allow !== undefined && !('allow' in out)) out.allow = allow;
  return Object.keys(out).length ? out : undefined;
}

// The new autoMode for the list, or a stop when an entry is the user's own or was changed by hand.
function render(auto, repos, defs, state) {
  const env0 = auto?.environment, allow0 = auto?.allow, dflt = defs.environment;
  const isDefault = (l) => dflt.includes(l);
  const current = (lb) => (lb === null ? undefined : dflt.find((d) => labelOf(d) === lb));
  for (const [name, list] of [['environment', env0], ['allow', allow0]]) {
    const odd = (list ?? []).find((e) => isMarked(e) && state.written && !state.written.includes(e));
    if (odd) stop('edited', `${name}: "${short(odd)}..." was changed by hand; delete it or take off its (reimagine guard) ending, then run /guard again`);
  }
  const oldCopied = state.copied ?? [];
  let lines, allow = allow0;
  if (!repos.length && ![env0, allow0].some((l) => l?.some(isMarked))) {
    return { auto, written: [], copied: (env0 ?? []).filter((l) => isDefault(l) && oldCopied.includes(l)) };
  }
  if (!repos.length) {
    const mine = new Set((env0 ?? []).filter((l) => !isMarked(l) && !isDefault(l)).map(labelOf).filter(Boolean));
    lines = env0?.map((t) => (isMarked(t) ? { t: mine.has(labelOf(t)) ? undefined : current(labelOf(t)), g: true } : { t, g: false })).filter((l) => l.t !== undefined);
    const copied = (l) => isDefault(l.t) && (l.g || oldCopied.includes(l.t));
    if (env0?.some(isMarked)) {
      if (same(lines.map((l) => l.t), dflt)) lines = undefined;
      else if (same(sorted(lines.filter(copied).map((l) => l.t)), sorted(dflt))) {
        const first = lines.findIndex(copied);
        lines = lines.flatMap((l, i) => (i === first ? [{ t: '$defaults', g: false }] : copied(l) ? [] : [l]));
        if (lines.length === 1) lines = undefined;
      }
    }
    if (allow0?.some(isMarked)) allow = allow0.filter((l) => !isMarked(l));
    if (allow && same(allow, ['$defaults']) && allow0.some(isMarked)) allow = undefined;
  } else {
    const own = new Set((env0 ?? []).filter((l) => l !== '$defaults' && (isMarked(l) || !isDefault(l))).map(labelOf).filter(Boolean));
    lines = env0 === undefined ? dflt.map((t) => ({ t, g: true }))
      : env0.flatMap((t) => (t === '$defaults' ? dflt.filter((d) => !own.has(labelOf(d))).map((d) => ({ t: d, g: true })) : [{ t, g: false }]));
    lines = lines.flatMap((l) => {
      if (l.g || isMarked(l.t) || isDefault(l.t) || !oldCopied.includes(l.t)) return [l];
      const d = current(labelOf(l.t));
      return d ? [{ t: d, g: true }] : [];
    });
    if (oldCopied.length) {
      const absent = dflt.filter((d) => !lines.some((l) => l.t === d || (labelOf(d) !== null && labelOf(l.t) === labelOf(d))));
      lines.push(...absent.map((t) => ({ t, g: true })));
    }
    for (const [lb, name] of GUARD_LABELS) {
      if (lines.some((l) => labelOf(l.t) === lb && !isMarked(l.t) && !isDefault(l.t))) {
        stop('edited', `environment: the ${name} line holds your own text; guard leaves it alone; delete it or fold it into the list, then run /guard again`);
      }
    }
    const want = entries(repos, defs);
    for (const [lb, text] of [['trusted repo', want.trusted], ['source control', want.source]]) {
      const at = lines.findIndex((l) => labelOf(l.t) === lb);
      if (at < 0) lines.push({ t: text, g: false });
      else lines = lines.map((l, i) => (i === at ? { t: text, g: false } : l)).filter((l, i) => i === at || labelOf(l.t) !== lb);
    }
    allow = [...(allow0 === undefined ? ['$defaults'] : allow0.filter((l) => !isMarked(l))), ...want.allow];
  }
  const env = lines?.map((l) => l.t);
  return {
    auto: assemble(auto, env, allow),
    written: [...(env ?? []), ...(allow ?? [])].filter(isMarked),
    copied: (lines ?? []).filter((l) => !isMarked(l.t) && isDefault(l.t) && (l.g || oldCopied.includes(l.t))).map((l) => l.t),
  };
}

function locate(env, home) {
  const dir = env.CLAUDE_CONFIG_DIR || join(home, '.claude');
  const logical = join(dir, 'settings.json');
  return { path: existsSync(logical) && lstatSync(logical).isSymbolicLink() ? realpathSync(logical) : logical, list: join(dir, LIST_FILE) };
}

function parseRequest(verb, rest) {
  if (verb !== 'plan') {
    if (rest.length) refuse(`${verb} takes no arguments`);
    return null;
  }
  let req = null, merge = false;
  const set = (r) => { if (req) refuse(FORMS); req = r; };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--add' || a === '--drop') {
      const value = rest[++i];
      if (value === undefined || value.startsWith('--')) refuse(FORMS);
      set({ kind: a.slice(2), value });
    } else if (a === '--clear') set({ kind: 'clear' });
    else if (a === '--merge') merge = true;
    else refuse(FORMS);
  }
  if (merge && req?.kind !== 'add') refuse(FORMS);
  return req && { ...req, merge };
}

// The list after an add, drop or clear; refuses before any claude call.
function change(old, req, c) {
  if (req.kind === 'clear') return [];
  if (req.kind === 'add') {
    let top;
    try { top = slash(git(c.env, resolve(c.cwd, req.value), ['rev-parse', '--show-toplevel']).trim()); } catch { refuse(`${req.value} is not inside a git work tree`); }
    let remotes = [];
    try { remotes = remotesOf(c.env, top); } catch {}
    if (!remotes.length) refuse(`${top} has no remote; guard trusts a repository by its remotes`);
    return [...old.filter((x) => key(x.path, c.platform) !== key(top, c.platform)), { path: top, remotes, merge: req.merge }].sort(byPath(c.platform));
  }
  const given = resolve(c.cwd, req.value), paths = [slash(given)], remotes = [req.value, normalizeRemote(req.value)];
  try { paths.push(slash(git(c.env, given, ['rev-parse', '--show-toplevel']).trim())); } catch {}
  const keep = old.filter((x) => !paths.some((p) => key(p, c.platform) === key(x.path, c.platform)) && !x.remotes.some((r) => remotes.includes(r)));
  if (keep.length === old.length) refuse(`${req.value} is not in the list`);
  return keep;
}

// Writes the candidate alone to a temporary configuration directory and asks claude for the effective configuration.
function inTemp(c, auto) {
  const dir = mkdtempSync(join(tmpdir(), 'guard-'));
  try {
    writeFileSync(join(dir, 'settings.json'), JSON.stringify(auto === undefined ? {} : { autoMode: auto }));
    return ask(c.claude, 'config', dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const effective = (list, d) => (list === undefined ? d : list.flatMap((e) => (e === '$defaults' ? d : [e])));
const entryLines = (name, a, b) => [...a.filter((x) => !b.includes(x)).map((x) => `entry: - ${name}: ${x}`), ...b.filter((x) => !a.includes(x)).map((x) => `entry: + ${name}: ${x}`)];
const shown = (x) => `${x.path} (${x.remotes.join(', ')})`;

// Works out the state and, when a write is planned, the plan. deep adds the managed check and the dry run.
function inspect(c, request, deep) {
  const t = locate(c.env, c.home);
  const r = { t, notes: [], count: 0, state: 'absent' };
  try { body(c, t, request, deep, r); } catch (e) {
    if (!(e instanceof Stop)) throw e;
    r.state = e.state;
    r.note = e.note;
    r.plan = null;
  }
  return r;
}

function body(c, t, request, deep, r) {
  const list = readFile(t.list);
  const old = parseList(t.list, list, c.platform);
  r.count = old.length;
  const repos = (request ? change(old, request, c) : old).map((x) => {
    if (c.recorded) return x;
    try {
      if (!statSync(x.path, { throwIfNoEntry: false })?.isDirectory()) {
        r.notes.push(`note: ${x.path} does not exist on this machine; its recorded remotes are kept`);
        return x;
      }
      const remotes = remotesOf(c.env, x.path);
      if (remotes.length) return { ...x, remotes };
    } catch {}
    r.notes.push(`note: ${x.path} has no readable remote now; its recorded remotes are kept`);
    return x;
  });
  const file = readFile(t.path);
  const { auto, scan } = parseSettings(t.path, file);
  const state = loadState(c.dataDir);
  const defs = ask(c.claude, 'defaults', c.env.CLAUDE_CONFIG_DIR || undefined, c.timeout);
  if (!GUARD_LABELS.every(([lb]) => defs.environment.some((l) => labelOf(l) === lb))) stop('unavailable', "the host's defaults have no Trusted repo or Source control line");
  const res = render(auto, repos, defs, state);
  const after = same(res.auto, auto) ? file.text : edit(file.text, scan, res.auto, state.created);
  const listAfter = same(repos, old) ? list.text : repos.length ? serialize(repos) : null;
  const changed = after !== file.text || listAfter !== list.text;
  const empty = old.length === 0 && ![auto?.environment, auto?.allow].some((l) => l?.some(isMarked));
  r.state = empty ? 'absent' : changed ? 'stale' : 'current';
  if (!changed || !deep) return;
  const managed = inTemp(c, undefined);
  const odd = LISTS.find((k) => !same(managed[k], defs[k]));
  if (odd) {
    const first = [...managed[odd], ...defs[odd]].find((e) => !defs[odd].includes(e) || !managed[odd].includes(e)) ?? '';
    stop('managed', `another settings scope adds auto mode entries, such as "${short(first)}"; guard writes nothing on this machine`);
  }
  const problems = check(inTemp(c, res.auto), res.auto, defs);
  if (problems.length) refuse(`the dry run failed: ${problems.join('; ')}; nothing was written`);
  const was = new Map(old.map((x) => [key(x.path, c.platform), x]));
  const now = new Set(repos.map((x) => key(x.path, c.platform)));
  r.lines = [
    ...repos.flatMap((x) => {
      const o = was.get(key(x.path, c.platform));
      return !o ? [`repository: + ${shown(x)}${x.merge ? ' merge' : ''}`] : same(o, x) ? [] : [`repository: ~ ${shown(x)}${x.merge ? ' merge' : ''}`];
    }),
    ...old.filter((o) => !now.has(key(o.path, c.platform))).map((o) => `repository: - ${shown(o)}`),
    ...entryLines('environment', effective(auto?.environment, defs.environment), effective(res.auto?.environment, defs.environment)),
    ...entryLines('allow', effective(auto?.allow, defs.allow), effective(res.auto?.allow, defs.allow)),
  ];
  const created = after !== file.text ? (file.text === null ? true : after === null ? false : !!state.created) : !!state.created;
  r.plan = { path: t.path, before: sha(file.text), after, listPath: t.list, listBefore: sha(list.text), listAfter, written: res.written, copied: res.copied, created, candidate: res.auto ?? null };
}

// The line a denial hook input becomes: what was denied and why; never the tool input whole.
function denial(input, now) {
  const text = (v) => (typeof v === 'string' ? v : '');
  const tool = text(input.tool_name), args = input.tool_input ?? {};
  const target = tool === 'Bash' || tool === 'PowerShell' ? { command: text(args.command).slice(0, 300) } : typeof args.file_path === 'string' ? { path: args.file_path } : {};
  return { time: now.toISOString(), reason: text(input.reason), tool, ...target, cwd: text(input.cwd) };
}

function listDenials(dataDir) {
  const path = join(dataDir, DENIALS_FILE);
  let text;
  try { text = readFile(path).text ?? ''; } catch (e) { refuse(`cannot read ${path} (${e.code})`); }
  const entries = text.split('\n').flatMap((l) => {
    try { const e = JSON.parse(l); return e && typeof e === 'object' && !Array.isArray(e) ? [e] : []; } catch { return []; }
  });
  if (!entries.length) return [`denials: none recorded in ${path}`];
  const flat = (v) => String(v ?? '').replace(/\s+/g, ' ');
  return [`denials: ${path} (${entries.length} recorded)`, ...entries.map((e) => {
    const what = e.command ?? e.path;
    return `${flat(e.time)} ${flat(e.tool)} ${flat(e.reason)}${what === undefined ? '' : `: ${flat(what)}`} (${flat(e.cwd)})`;
  })];
}

// Each step but status and list changes the shared plan and state files, so steps take turns through a lock directory.
function locked(dataDir, fn) {
  const lock = join(dataDir, 'guard.lock');
  mkdirSync(dataDir, { recursive: true });
  for (let tries = 0; ; tries++) {
    try { mkdirSync(lock); break; } catch (e) {
      const removing = e.code === 'EPERM' && process.platform === 'win32';
      if (removing && tries >= 20) refuse(`cannot create ${lock} (EPERM); nothing was written; check the permissions of ${dataDir}`);
      if (e.code === 'EACCES' || (e.code === 'EPERM' && !removing)) refuse(`cannot create ${lock} (${e.code}); nothing was written; check the permissions of ${dataDir}`);
      if (e.code !== 'EEXIST' && !removing) throw e;
      try { if (Date.now() - statSync(lock).mtimeMs > 240_000) { rmSync(lock, { recursive: true, force: true }); continue; } } catch {}
      if (tries >= 200) refuse(`another /guard step holds ${lock}; nothing was written; run /guard again`);
      sleep(50);
    }
  }
  try { return fn(); } finally { rmSync(lock, { recursive: true, force: true }); }
}

// Writes beside the target, then renames over it, with the mode given or else the old file's. On Windows a rename that fails is retried once after a short wait.
function writeAtomic(path, text, backup, mode) {
  const tmp = `${path}.reimagine-tmp-${process.pid}`;
  const fileMode = mode ?? (existsSync(path) ? statSync(path).mode & 0o777 : undefined);
  try { writeFileSync(tmp, text, fileMode === undefined ? 'utf8' : { encoding: 'utf8', mode: fileMode }); } catch (e) { refuse(`could not write ${tmp} (${e.code}); nothing was written`); }
  if (fileMode !== undefined) chmodSync(tmp, fileMode);
  try { renameSync(tmp, path); } catch (e) {
    if (process.platform === 'win32') {
      sleep(500);
      try { renameSync(tmp, path); return; } catch {}
    }
    rmSync(tmp, { force: true });
    refuse(`could not replace ${path} (${e.code})${backup ? `; the backup is ${backup}` : ''}`);
  }
}

function applyPlan(c) {
  const p = readJson(join(c.dataDir, PLAN_FILE)) ?? {};
  if (!p.path) refuse('there is no planned change; run /guard again');
  if (lstatSync(p.path, { throwIfNoEntry: false })?.isSymbolicLink()) refuse(`${p.path} is a symbolic link that points to a missing file, so nothing was written`);
  const cur = readFile(p.path), list = readFile(p.listPath);
  if (sha(cur.text) !== p.before) refuse(`${p.path} changed after the plan was shown, so nothing was written; run /guard again`);
  if (sha(list.text) !== p.listBefore) refuse(`${p.listPath} changed after the plan was shown, so nothing was written; run /guard again`);
  const edits = p.after !== cur.text;
  if (edits && cur.text !== null && statSync(p.path).nlink > 1) refuse(`${p.path} has multiple hard links, so nothing was written`);
  const out = [];
  let backup, listLine;
  // The list goes first: a list write that refuses then leaves the settings file as the state records it, and no backup behind.
  if (p.listAfter !== list.text) {
    if (p.listAfter === null) rmSync(p.listPath);
    else { mkdirSync(dirname(p.listPath), { recursive: true }); writeAtomic(p.listPath, p.listAfter); }
    listLine = `guard: ${p.listAfter === null ? 'removed' : 'wrote'} ${p.listPath}`;
  }
  if (edits && p.after !== null) {
    if (cur.text !== null) {
      backup = `${p.path}.reimagine-backup-${stamp(c.now)}`;
      try { copyFileSync(p.path, backup, constants.COPYFILE_EXCL); } catch (e) { refuse(`could not back up ${p.path} to ${backup} (${e.code}); ${listLine ? `${p.listPath} was changed, ${p.path} was not` : 'nothing was written'}`); }
    } else mkdirSync(dirname(p.path), { recursive: true });
  }
  if (edits && p.after === null) {
    rmSync(p.path);
    out.push(`guard: removed ${p.path}`);
  } else if (edits) {
    writeAtomic(p.path, p.after, backup);
    out.push(`guard: wrote ${p.path}${backup ? `; the backup is ${backup}` : ''}`);
  }
  if (listLine) out.push(listLine);
  save(c.dataDir, STATE_FILE, { written: p.written, copied: p.copied, created: p.created });
  save(c.dataDir, PLAN_FILE, {});
  const dir = c.env.CLAUDE_CONFIG_DIR || undefined;
  let problems;
  try { problems = check(ask(c.claude, 'config', dir), p.candidate, ask(c.claude, 'defaults', dir)); } catch (e) {
    if (!(e instanceof Stop)) throw e;
    problems = [e.note];
  }
  if (problems.length) refuse(`wrote ${p.path}, but the host's effective configuration fails the check: ${problems.join('; ')}${backup ? `; the backup is ${backup}` : ''}`);
  return [...out, "guard: the host's effective configuration holds every guard entry once"];
}

function run(verb, request, c) {
  if (verb === 'apply') return applyPlan(c);
  if (verb === 'denials') return listDenials(c.dataDir);
  if (verb === 'list') {
    let repos;
    try { const { list } = locate(c.env, c.home); repos = parseList(list, readFile(list), c.platform); } catch (e) { if (e instanceof Stop) refuse(e.note); throw e; }
    return repos.length ? repos.map((x) => `${x.path} ${x.remotes.join(',')}${x.merge ? ' merge' : ''}`) : ['list: no repositories'];
  }
  if (verb === 'plan') save(c.dataDir, PLAN_FILE, {});
  const r = inspect(c, request, verb === 'plan');
  const note = r.note ? `; ${r.note}` : '';
  if (verb === 'status') return [`state: ${r.state} ${r.t.path}${note}`, `list: ${r.t.list} (${r.count} repositories)`];
  const head = [`target: ${r.t.path}`, `list: ${r.t.list}`, `state: ${r.state}${note}`, ...r.notes];
  if (!r.plan) return [...head, 'change: none'];
  save(c.dataDir, PLAN_FILE, r.plan);
  return [...head, ...r.lines, "check: the dry run's effective configuration holds every guard entry once", 'change: ready'];
}

// The startup notice: one systemMessage line when listed repositories leave the entries stale. It uses the remotes the list
// records, runs no config check, and prints nothing for any other state or any error. A session no one attends, which the host
// marks with that flag, gets no check.
function sessionStart(c) {
  if (c.env.CLAUDE_CODE_SESSION_ATTENDED === '0') return [];
  const { list } = locate(c.env, c.home);
  if (!parseList(list, readFile(list), c.platform).length) return [];
  const r = inspect({ ...c, recorded: true, timeout: 20000 }, null, false);
  return r.state === 'stale' ? [JSON.stringify({ systemMessage: `guard: the auto mode entries in ${r.t.path} are stale; run /guard to update them` })] : [];
}

// Returns the output lines. A refusal throws.
export function main(argv, { env = process.env, platform = process.platform, now = new Date(), home = homedir(), cwd = process.cwd(), claude = runClaude, stdin = () => readFileSync(0, 'utf8') } = {}) {
  const [verb, dataDir, ...rest] = argv;
  if (verb === 'denied') {
    try {
      const input = JSON.parse(stdin());
      if (input && typeof input === 'object' && !Array.isArray(input)) {
        mkdirSync(dataDir, { recursive: true });
        appendFileSync(join(dataDir, DENIALS_FILE), `${JSON.stringify(denial(input, now))}\n`, { mode: 0o600 });
      }
    } catch {}
    return [];
  }
  if (verb === 'session-start') {
    try { return sessionStart({ env, platform, now, home, cwd, claude, dataDir }); } catch { return []; }
  }
  if (!VERBS.includes(verb)) refuse(`unknown command ${verb}; use status, list, plan, apply or denials`);
  if (!dataDir) refuse('the data directory argument is missing');
  const request = parseRequest(verb, rest);
  const step = () => run(verb, request, { env, platform, now, home, cwd, claude, dataDir });
  return verb === 'plan' || verb === 'apply' ? locked(dataDir, step) : step();
}

// Node resolves the entry point through symlinks, so compare with the resolved path.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    const lines = main(process.argv.slice(2));
    process.stdout.write(lines.length ? `${lines.join('\n')}\n` : '');
  } catch (e) {
    process.stdout.write(`${e instanceof Refusal ? `guard: ${e.message}` : `guard: unexpected error: ${e?.stack ?? e}`}\n`);
    process.exitCode = 1;
  }
}

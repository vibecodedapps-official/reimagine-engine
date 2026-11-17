#!/usr/bin/env node
// The ask hook, a PreToolUse hook: has the host ask before a push, a pull request or a comment aimed at a repository the
// list flags with ask, and before every push and gh or az repos write while the list cannot be used. When in doubt it asks.
// A command that holds a post: phrase of the rules outbound list in the same folder or the list's folder is judged as a post too.
// Usage: node ask.mjs, with the hook's input on stdin. It prints nothing or one line, and exits 0.
import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { locate, marked, missing, normalizeRemote, readList, unreadable } from './guard.mjs';

const EVERY = 'before every push, pull request and comment';
const EDGE = 'A-Za-z0-9_.-';
const words = (s) => new Set(s.split(' '));
const NO_REPO = words('auth config extension alias completion help version status search gpg-key ssh-key codespace gist org project browse attestation');
const GH_READS = words('view list status diff checks checkout download watch clone get verify');
const AZ_READS = words('show list checkout');
const RAW = words('curl wget invoke-restmethod invoke-webrequest irm iwr');
const READ_WORDS = words('get list search read view show fetch find query download diff status check checks describe count');
const SECOND_READS = words('get list search read view show fetch find query download describe');
// The second word of a two-word tool name that marks a read, such as git_status or git_log.
const LAST_READS = new Set([...READ_WORDS, 'log', 'blame']);
const WRITE_WORDS = words('create update add delete remove merge comment post push reply close reopen set edit write resolve vote approve submit request assign link fork run rerun cancel dismiss lock upload');
const CD = words('cd chdir set-location sl pushd push-location');
const DIR_OPTIONS = words('-C --chdir --directory');
const MAX_DIRS = 16;
// What the git calls of one input may take together, under the hook's 10 seconds.
const LIMIT = 8000;
// git's global options that take their value as the next word.
const GIT_VALUE = words('-C -c --git-dir --work-tree --namespace --config-env --attr-source --super-prefix');
const PUSH_VALUE = words('-o --push-option --receive-pack --exec');
// Names that can move a push to another repository or directory without a word the hook reads.
const GIT_ENV = /(?<![A-Za-z0-9_])(?:GIT_DIR|GIT_WORK_TREE|CDPATH|GIT_CONFIG\w*)(?![A-Za-z0-9_])/i;
const BRANCH_KEYS = '^(branch\\..*\\.(remote|pushremote)|remote\\.pushdefault)$';
const AZ_GROUPS = words('repos rest devops');
// Long options of curl, wget, az rest and az devops invoke, each matched by any prefix of four characters or more.
const LONG = ['method', 'http-method', 'request', 'body', 'in-file', 'post-data', 'post-file', 'upload-file', 'data', 'form', 'json'];

// A command line cut into simple commands at ; & | and line breaks outside quotes, and each into tokens.
const SEGMENT = /(?:"[^"]*"|'[^']*'|[^;&|\n"'])+/g;
const TOKEN = /(?:"[^"]*"|'[^']*'|[^\s"'])+/g;
const QUOTED = /"([^"]*)"|'([^']*)'/g;
const unquote = (t) => t.replace(QUOTED, '$1$2');
// A token as it is compared: unquoted, without a leading (, {, $(, @( or backtick, and without a trailing ), }, backtick or ;.
const word = (t) => unquote(t).replace(/^(?:\$\(|@\(|[({`])+/, '').replace(/[)}`;]+$/, '');
// The command a word names: its last path part without a leading assignment, and without .exe or .cmd.
const commandOf = (w) => w.split(/[\\/]/).pop().replace(/^.*[=(`{]/, '').toLowerCase().replace(/\.(?:exe|cmd)$/, '');
const dynamic = (t) => /[$`%]/.test(t);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const lower = (v) => String(v ?? '').toLowerCase();
// A post: phrase and the command it is looked for in: lower case, each backslash a slash, a run of slashes and a /./ one slash.
const flat = (s) => s.toLowerCase().replaceAll('\\', '/').replace(/\/+/g, '/').replace(/(?:\/\.)+\//g, '/');
// A list saved as UTF-16 is read as UTF-16, as the rules outbound check reads it; a leading byte order mark is dropped.
const listText = (b) => (b[0] === 0xff && b[1] === 0xfe ? b.toString('utf16le') : b[0] === 0xfe && b[1] === 0xff ? Buffer.from(b.subarray(0, b.length & ~1)).swap16().toString('utf16le') : b.toString('utf8')).replace(/^\ufeff/, '');
const decode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
const pathKey = (p, platform) => { const s = p.replace(/\\/g, '/').replace(/\/+$/, ''); return platform === 'win32' ? s.toLowerCase() : s; };

// A remote cut into the part before its name and the name: Azure's project and repository in each form, else the path.
function parts(remote) {
  const cut = remote.indexOf('/');
  const host = remote.slice(0, cut).toLowerCase(), path = remote.slice(cut + 1);
  const az = path.match(/(?:^|\/)([^/]+)\/_git\/([^/]+)$/) ?? (host === 'vs-ssh.visualstudio.com' ? path.match(/^v3\/[^/]+\/([^/]+)\/([^/]+)$/) : null);
  if (az) return { az: true, before: az[1], name: az[2] };
  const last = path.lastIndexOf('/');
  return { az: false, before: path.slice(0, Math.max(last, 0)), name: path.slice(last + 1) };
}
// The identity two remotes of one repository share whatever host or organization they name.
const identity = (remote) => { const p = parts(remote); return `${p.az ? 'az' : 'gh'}:${lower(decode(p.before))}/${lower(decode(p.name))}`; };
// The identity of a gh repository value: [HOST/]OWNER/REPO or a URL.
const repoId = (v) => {
  const ps = unquote(v).replace(/^[a-z]+:\/\//i, '').replace(/\/+$/, '').replace(/\.git$/i, '').split('/');
  return `gh:${lower(ps.slice(ps.length > 2 ? 1 : 0).join('/'))}`;
};

// A flagged remote with the texts that name it: owner/name for a GitHub form, project/_git/repo and the REST path for Azure.
function describe(remote) {
  const p = parts(remote);
  const spellings = (s) => [...new Set([s, decode(s), encodeURIComponent(decode(s))])];
  const forms = p.az ? spellings(p.before).flatMap((b) => [`${b}/_git/${p.name}`, `${b}/_apis/git/repositories/${p.name}`]) : [`${p.before}/${p.name}`];
  const whole = (s) => new RegExp(`(?<![${EDGE}])${escape(s)}(?![${EDGE}])`, 'i');
  return {
    remote, id: identity(remote), az: p.az, before: lower(decode(p.before)), name: lower(decode(p.name)),
    res: forms.map((f) => new RegExp(`(?<![${EDGE}])${escape(f)}(?:\\.git(?![A-Za-z0-9_-])|(?![A-Za-z0-9_-]|\\.[A-Za-z0-9_-]))`, 'i')),
    nameRe: whole(p.name), beforeRes: spellings(p.before).map(whole),
  };
}

// The values of an option given as one of flags and the next word, '$' when none follows, or joined as re's group.
const optionValues = (ws, flags, re) => ws.flatMap((w, i) => (flags.includes(w) ? [ws[i + 1] ?? '$'] : re.exec(w)?.slice(1) ?? []));

// An Azure repository named as the whole value of --repository, -r or repositoryId=, with no other project named beside it.
function byOption(ws, f) {
  const plain = (v) => lower(decode(unquote(v)));
  const repos = optionValues(ws, ['--repository', '-r'], /^(?:--repository=|repositoryId=)(.*)$/i);
  const projects = optionValues(ws, ['--project', '-p'], /^(?:--project=|project=)(.*)$/i);
  return repos.some((r) => plain(r) === f.name) && projects.every((p) => dynamic(p) || plain(p) === f.before);
}

// The first flagged remote the command text names, or that the words of a simple command name by option.
const named = (text, ws, c) => c.flagged.find((f) => f.res.some((re) => re.test(text)) || (f.az && byOption(ws, f)));

// The simple commands of a text as tokens and words; quoted text, escaped quotes read as quotes, is cut the same way.
function commands(text, depth = 0, out = []) {
  for (const segment of text.match(SEGMENT) ?? []) {
    const raw = segment.match(TOKEN) ?? [];
    out.push({ raw, ws: raw.map(word), depth });
    if (depth < 3) for (const t of raw) if (/["']/.test(t)) commands(unquote(t.replace(/[\\`](["'])/g, '$1')), depth + 1, out);
  }
  return out;
}

// A path as the shell would take it; null for a relative path with no base.
function local(p, base, c) {
  if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) return join(c.home, p.slice(2));
  // The Bash tool on Windows names paths in the MSYS form: /c/... for a drive and /tmp for the temp folder.
  if (c.platform === 'win32' && c.tool === 'Bash') {
    if (p === '/tmp' || p.startsWith('/tmp/')) return join(tmpdir(), p.slice(5));
    const m = /^\/([A-Za-z])(\/.*|)$/.exec(p);
    if (m) return resolve(`${m[1]}:${m[2] || '/'}`);
  }
  if (isAbsolute(p)) return resolve(p);
  return base === null ? null : resolve(base, p);
}

// The directories a target token names against each base, or null when it holds a variable, is - or names none that exists.
function targets(raw, bases, c) {
  if (raw === undefined || dynamic(raw)) return null;
  const v = word(raw);
  if (!v || v === '-') return null;
  const abs = local(v, null, c);
  const found = (abs ? [abs] : bases.map((b) => local(v, b, c))).filter((d) => d && c.isDir(d));
  return found.length ? found : null;
}

// Every directory the text may run in: the cwd, each cd target, and an existing -C, --chdir or --directory; past MAX_DIRS, unresolved.
function directories(cmds, c) {
  const dirs = [];
  let unresolved = c.cwd === null, full = false;
  const add = (d) => {
    if (dirs.some((x) => pathKey(x, c.platform) === pathKey(d, c.platform))) return;
    if (dirs.length < MAX_DIRS) dirs.push(d); else full = true;
  };
  if (c.cwd !== null) add(c.cwd);
  for (const { raw, ws } of cmds) {
    ws.forEach((w, k) => {
      const t = DIR_OPTIONS.has(w) ? raw[k + 1] ?? '' : /^--(?:chdir|directory)=(.*)$/.exec(raw[k])?.[1];
      if (t !== undefined) {
        if (dynamic(t)) unresolved = true; else targets(t, dirs, c)?.forEach(add);
        return;
      }
      if (!CD.has(commandOf(w))) return;
      if (k === ws.length - 1) { add(c.home); return; }
      // The target: a PowerShell -Name:value, else the first word that is no option and not cmd's /d.
      const at = ws.findIndex((x, i) => i > k && (/^-[A-Za-z]+:./.test(x) || (!(x.startsWith('-') && x !== '-') && lower(x) !== '/d')));
      const found = at < 0 ? null : targets(raw[at].replace(/^-[A-Za-z]+:/, ''), dirs, c);
      if (found) found.forEach(add); else unresolved = true;
    });
  }
  return { dirs, unresolved: unresolved || full };
}

// The remotes of the repository at dir by name, each URL as guard writes it; a directory that is no repository has none.
function remotesFrom(out) {
  const m = new Map();
  for (const line of out.split('\n')) {
    const x = line.trim().match(/^(\S+)\s+(.+) \((?:fetch|push)\)$/);
    const r = x && normalizeRemote(x[2]);
    if (r) m.set(x[1], [...(m.get(x[1]) ?? []), r]);
  }
  return m;
}

// A push destination that is a URL rather than a refspec such as HEAD:refs/heads/x.
const isUrl = (d) => normalizeRemote(d) !== null && (/:\/\/|@/.test(d) || /^[^/:]+\.[^/:]*:/.test(d));

// The directory rule: a flagged path, remote or push destination; with branch, the URLs its branches push to count too.
function byDirectories(dirs, dest, c, branch = false) {
  for (const dir of dirs) {
    const listed = c.listed(dir);
    if (listed) return c.hit(listed);
    let urls;
    try {
      const remotes = c.remotes(dir);
      if (dest !== undefined && remotes.has(dest)) urls = remotes.get(dest);
      else if (dest !== undefined && (isUrl(dest) || c.byId(identity(normalizeRemote(dest) ?? '')))) urls = [normalizeRemote(dest)];
      else urls = [...remotes.values()].flat().concat(branch ? c.branches(dir) : []);
    } catch { return c.unresolvedReason; }
    const f = urls.map((u) => c.byId(identity(u))).find(Boolean);
    if (f) return c.hit(f);
  }
  return null;
}

function gitCall(ws, raw, c) {
  let i = 0, dirs = null, moved = false, override = false;
  for (; i < ws.length && ws[i].startsWith('-'); i++) {
    if (/^--(?:git-dir|work-tree|bare)(?:=|$)/.test(ws[i])) moved = true;
    if (ws[i] === '-c' && /^(?:alias|remote|url)\./i.test(ws[i + 1] ?? '')) override = true;
    if (ws[i] === '-C') dirs = dirs === false ? false : targets(raw[i + 1], dirs ?? (c.unresolved ? [] : c.dirs), c) ?? false;
    if (GIT_VALUE.has(ws[i])) i++;
  }
  const sub = lower(ws[i]);
  const plain = sub === 'push' && !override;
  if (!override && sub !== 'push' && sub !== 'send-pack' && !((sub === 'subtree' || sub === 'lfs') && lower(ws[i + 1]) === 'push')) return null;
  if (c.broken) return c.broken;
  const f = named(c.full, ws, c);
  if (f) return c.hit(f);
  if (moved || dirs === false || GIT_ENV.test(c.full)) return c.unresolvedReason;
  let dest;
  for (let j = i + 1; plain && j < ws.length && dest === undefined; j++) {
    if (ws[j] === '--repo') dest = ws[j + 1] ?? '';
    else if (ws[j].startsWith('--repo=')) dest = ws[j].slice(7);
    else if (PUSH_VALUE.has(ws[j])) j++;
    else if (!ws[j].startsWith('-')) dest = ws[j];
  }
  // A submodule's remote is not among the remotes the hook reads.
  const unsure = (dirs === null && c.unresolved) || /submodule/i.test(c.full);
  return byDirectories(dirs ?? c.dirs, dest, c, plain && dest === undefined) ?? (unsure ? c.unresolvedReason : null);
}

// The first of letters a cluster such as -sSLX or -iF holds, valued by the rest of the word or else the next word.
function cluster(ws, i, letters) {
  const m = /^-([A-Za-z]+)(.*)$/.exec(ws[i]);
  const j = m ? [...m[1]].findIndex((ch) => letters.includes(ch)) : -1;
  return j < 0 ? null : { opt: m[1][j], value: (m[1].slice(j + 1) + m[2]).replace(/^=/, '') || (ws[i + 1] ?? '$') };
}

// Whether a raw query= token is built when the command runs: a $ or a backtick outside single quotes, or a ( outside
// every quote.
function built(token) {
  let quote = null;
  for (const ch of token) {
    if (quote === "'") {
      if (ch === quote) quote = null;
    } else if (quote === '"') {
      if (ch === quote) quote = null;
      else if (ch === '$' || ch === '`') return true;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '$' || ch === '`' || ch === '(') return true;
  }
  return false;
}

// gh api writes with a non-GET method, or fields or input and no method; graphql with a mutation, input, @file or built query.
function apiWrites(ws, raw, full) {
  let method, input = false;
  const fields = [];
  ws.forEach((w, i) => {
    const long = /^--(method|field|raw-field|input)(?:=(.*))?$/.exec(w);
    const k = long ? { opt: long[1], value: long[2] ?? ws[i + 1] ?? '$' } : cluster(ws, i, 'XfF');
    if (!k) return;
    if (k.opt === 'X' || k.opt === 'method') method = k.value;
    else if (k.opt === 'input') input = true;
    else fields.push(k.value);
  });
  if (ws.some((w) => /^\/?graphql$/i.test(w))) {
    const query = raw.filter((t) => /^(?:-[A-Za-z]*[fF]|--(?:raw-)?field=)?["']?query=/.test(t));
    return /\bmutation\b/i.test(full) || input || fields.some((v) => /^[^=]*=@/.test(v)) || query.some(built);
  }
  if (method !== undefined) return lower(method) !== 'get';
  return input || fields.length > 0;
}

function ghCall(ws, raw, c) {
  const pos = [], own = [];
  for (let i = 0; i < ws.length; i++) {
    let m;
    if (ws[i] === '-R' || ws[i] === '--repo') own.push(ws[++i] ?? '$');
    else if ((m = /^(?:-R(?=.*[/$`%])|--repo=)(.+)$/.exec(ws[i]))) own.push(m[1]);
    else if (!ws[i].startsWith('-')) pos.push(ws[i]);
  }
  const group = lower(pos[0]), verb = lower(pos[1]);
  if (!group || NO_REPO.has(group)) return null;
  if (group === 'api' ? !apiWrites(ws.slice(1), raw.slice(1), c.full) : !verb || (GH_READS.has(verb) && (verb !== 'clone' || group === 'repo'))) return null;
  if (c.broken) return c.broken;
  // A flagged name in the text asks first, as a URL or API path beats a target; graphql may give owner and name apart.
  const pair = (x) => !x.az && x.nameRe.test(c.full) && x.beforeRes.some((re) => re.test(c.full));
  const f = named(c.full, ws, c) ?? (ws.includes('graphql') ? c.flagged.find(pair) : undefined);
  if (f) return c.hit(f);
  // Then -R or --repo decides alone; GH_REPO, in the text or the environment, asks when flagged or unknown, never releases.
  const aims = own.length ? own : c.envRepo ? [...c.ghRepo, c.envRepo] : c.ghRepo;
  const aimed = aims.map((t) => c.byId(repoId(t))).find(Boolean);
  if (aimed) return c.hit(aimed);
  if (aims.some(dynamic)) return c.unresolvedReason;
  if (own.length) return null;
  const target = ws[ws.indexOf(pos[1]) + 1] ?? '';
  const literal = group === 'api' && ws.some((w) => /^\/?repos\/[^/:{][^/]*\/[^/:{]/.test(w));
  if (literal || (group !== 'api' && /^https?:\/\/[^/]+\/[^/]+\/[^/]+/i.test(target))) return null;
  return byDirectories(c.dirs, undefined, c) ?? (c.unresolved ? c.unresolvedReason : null);
}

// The words of an az command from its group on, past the global options before it and one value of theirs.
function azWords(ws) {
  const skip = (i) => { while (ws[i]?.startsWith('-')) i++; return i; };
  const i = skip(0);
  return ws.slice(i > 0 && ws[i] !== undefined && !AZ_GROUPS.has(lower(ws[i])) ? skip(i + 1) : i);
}

function azCall(all, seg, c) {
  const ws = azWords(all);
  if (lower(ws[0]) === 'rest' || (lower(ws[0]) === 'devops' && lower(ws[1]) === 'invoke')) return rawCall(seg, c);
  if (lower(ws[0]) !== 'repos') return null;
  const options = ws.findIndex((w) => w.startsWith('-'));
  if (AZ_READS.has(lower(ws[(options < 0 ? ws.length : options) - 1]))) return null;
  if (c.broken) return c.broken;
  const repos = optionValues(ws, ['--repository', '-r'], /^--repository=(.*)$/);
  if (repos.length) {
    if (repos.some(dynamic)) return c.unresolvedReason;
    const f = c.flagged.find((x) => x.az && byOption(ws, x));
    return f ? c.hit(f) : null;
  }
  const f = named(c.full, ws, c);
  if (f) return c.hit(f);
  // A pull request named only by its id is looked up across the organization, so any flagged Azure repository may be it.
  const azure = c.flagged.find((x) => x.az);
  return byDirectories(c.dirs, undefined, c) ?? (azure ? c.unresolvedFor(azure.remote) : c.unresolved ? c.unresolvedReason : null);
}

// A PowerShell parameter by any abbreviation down to floor letters, with its value after a colon as m[2].
const param = (w, name, floor) => { const m = /^-([A-Za-z]+)(?::(.*))?$/.exec(w); return m && m[1].length >= floor && name.startsWith(lower(m[1])) ? m : null; };

// Whether a raw command writes: a non-GET method, a body, data, form, upload or config option, a splat or a default.
function rawWrites(cmds, full) {
  if (/\$PSDefaultParameterValues\b/i.test(full)) return true;
  for (const { raw, ws } of cmds) {
    let kind = null, get = false;
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i], name = commandOf(w), next = ws[i + 1] ?? '$';
      if (RAW.has(name) || name === 'az') {
        kind = name === 'az' ? (lower(azWords(ws.slice(i + 1))[0]) === 'rest' ? 'rest' : 'az') : /^(?:curl|wget)$/.test(name) ? name : 'ps';
        // With curl's -G its data goes into the query string of a GET.
        get = kind === 'curl' && ws.slice(i + 1).some((x) => x === '-G' || x === '--get');
        continue;
      }
      if (!kind) continue;
      const lm = /^--([a-z-]{4,})(?:=(.*))?$/i.exec(w);
      const long = lm && LONG.find((n) => n.startsWith(lower(lm[1])));
      const k = kind === 'curl' || kind === 'wget' ? cluster(ws, i, kind === 'wget' ? 'XdFTKe' : 'XdFTK') : null;
      let method, write = false;
      if (long) {
        if (/method|request/.test(long)) method = lm[2] ?? next;
        else write = !(get && long === 'data');
      } else if (/^--data-[a-z]+(?:=|$)/.test(w)) write = !get;
      else if (/^--(?:form-string|body-(?:data|file)|config|variable|expand-[a-z-]+)(?:=|$)/.test(w)) write = true;
      else if (k) {
        if (k.opt === 'X') method = k.value;
        else write = !(get && k.opt === 'd');
      } else if (kind === 'rest' && /^-m/.test(w)) method = w.slice(2) || next;
      else if (kind === 'rest' && /^-b/.test(w)) write = true;
      else if (kind === 'ps') {
        const m = param(w, 'method', 2) ?? param(w, 'custommethod', 2);
        if (m) method = m[2] ?? next;
        else write = Boolean(param(w, 'body', 2) || param(w, 'infile', 2) || param(w, 'form', 3)) || /^@[A-Za-z_]\w*$/.test(raw[i]);
      }
      if (write || (method !== undefined && (dynamic(method) || lower(method) !== 'get'))) return true;
    }
  }
  return false;
}

// A raw call asks when it names a flagged repository and is not a plain read; there is no directory rule for it.
function rawCall(ws, c) {
  if (c.broken) return null;
  const f = named(c.full, ws, c);
  return f && rawWrites(c.cmds, c.full) ? c.hit(f) : null;
}

// An MCP call writes unless its name after the last __ marks a read; it is aimed by the strings of its arguments.
function mcpCall(tool, args, c) {
  const ws = tool.slice(tool.lastIndexOf('__') + 2).replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[\s_-]+/).filter(Boolean);
  if (READ_WORDS.has(ws[0]) || (SECOND_READS.has(ws[1]) && !WRITE_WORDS.has(ws[0])) || ws.at(-1) === 'read') return null;
  if (ws.length === 2 && LAST_READS.has(ws[1]) && !WRITE_WORDS.has(ws[0])) return null;
  if (c.broken) return null;
  const strings = (v) => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : []);
  const values = strings(args).map((v) => v.replace(/%2F/gi, '/'));
  const some = (re) => values.some((v) => re.test(v));
  // A flagged path or a path inside it, else a flagged name; an Azure repository's name counts alone only as a whole value.
  const f = values.map(c.listed).find(Boolean)
    ?? c.flagged.find((x) => x.res.some(some) || (x.az && values.some((v) => lower(v) === x.name)) || (some(x.nameRe) && x.beforeRes.some(some)));
  return f ? c.hit(f) : null;
}

// Each simple command in turn: a word naming git, gh, az or a raw call is judged with the words after it.
function scan(c) {
  for (const { raw, ws } of c.cmds) {
    for (let i = 0; i < ws.length; i++) {
      const name = commandOf(ws[i]), rest = ws.slice(i + 1);
      const hit = name === 'git' ? gitCall(rest, raw.slice(i + 1), c) : name === 'gh' ? ghCall(rest, raw.slice(i + 1), c) : name === 'az' ? azCall(rest, ws, c)
        : RAW.has(name) ? rawCall(ws, c) : null;
      if (hit) return hit;
    }
  }
  return postCall(c);
}

// A command that holds a post: phrase asks when it names a flagged repository or may run in a checkout of one.
function postCall(c) {
  const text = flat(c.full);
  if (!c.posts().some((p) => text.includes(p))) return null;
  if (c.broken) return c.broken;
  // A flagged name in the text, or its name and the part before it each as a whole word, or an Azure repository by option.
  const f = c.flagged.find((x) => x.res.some((re) => re.test(c.full)) || (x.nameRe.test(c.full) && x.beforeRes.some((re) => re.test(c.full))))
    ?? c.flagged.find((x) => x.az && c.cmds.some(({ ws }) => byOption(ws, x)));
  return f ? c.hit(f) : byDirectories(c.dirs, undefined, c) ?? (c.unresolved ? c.unresolvedReason : null);
}

// GH_REPO set in the text as a word of its own, as VAR=value or $env:VAR = value, never inside quoted text.
const ghRepoOf = (cmds) => cmds.filter((x) => x.depth === 0).flatMap(({ raw }) => raw.flatMap((t, i) => {
  const m = /^(?:\$env:)?GH_REPO(?:=(.*))?$/i.exec(t);
  if (!m) return [];
  const v = m[1] ?? (raw[i + 1] === '=' ? raw[i + 2] : undefined);
  return v === undefined ? ['$'] : v ? [unquote(v)] : [];
}));

const readText = (p) => { try { return readFileSync(p, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };
const isDirectory = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
function runGit(dir, args, env, timeout) {
  const r = spawnSync('git', ['-C', dir, ...args], { env, encoding: 'utf8', timeout, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  if (r.error || r.signal) throw r.error ?? new Error(`git ended by ${r.signal}`);
  return r.status === 0 ? r.stdout : '';
}

// The reason the host shows with its prompt, or null to let the call go on. read returns a file's text, null when it is
// missing, and throws when it cannot be read; git(dir, args, ms) returns the output of git -C <dir> <args> within ms, ''
// when it fails; now is the clock.
export function decide(input, deps = {}) {
  const tool = input?.tool_name, ti = input?.tool_input;
  const mcp = typeof tool === 'string' && tool.startsWith('mcp__');
  if (!mcp && !((tool === 'Bash' || tool === 'PowerShell') && typeof ti?.command === 'string')) return null;
  const { env = process.env, home = homedir(), platform = process.platform, read = readText, isDir = isDirectory } = deps;
  const now = deps.now ?? Date.now, until = now() + LIMIT, call = deps.git ?? ((dir, args, ms) => runGit(dir, args, env, ms));
  const git = (dir, args) => {
    const left = until - now();
    if (left <= 0) throw new Error('the git calls of this input ran out of time');
    return call(dir, args, Math.min(left, 5000));
  };
  const { path, list, dir: folder } = locate(env, home);
  let text;
  try { text = read(list); } catch { text = undefined; }
  const c = { tool, platform, home, isDir, flagged: [], paths: [], full: '', envRepo: env.GH_REPO };
  if (text === null) {
    let settings = null;
    try { settings = read(path); } catch {}
    if (!marked(settings)) return null;
    c.broken = missing(path, list);
  } else {
    const repos = text === undefined ? null : readList(text, platform);
    if (!repos) c.broken = unreadable(list);
    else {
      const asked = repos.filter((r) => r.ask);
      if (!asked.length) return null;
      c.flagged = asked.flatMap((r) => r.remotes).map(describe);
      c.paths = asked.map((r) => ({ key: pathKey(r.path, platform), remote: r.remotes[0] ?? r.path }));
    }
  }
  c.hit = (f) => `guard: this call goes to ${f.remote}, which /guard lists to ask ${EVERY}`;
  c.unresolvedFor = (remote) => `guard: this call's directory could not be resolved and ${remote} is listed to ask ${EVERY}`;
  c.unresolvedReason = c.broken ?? c.unresolvedFor((c.flagged[0] ?? c.paths[0]).remote);
  c.byId = (id) => c.flagged.find((f) => f.id === id);
  // The post: lines of rules-outbound.txt in the config folder and in the list's folder.
  c.posts = () => [...new Set([folder, dirname(list)])].flatMap((d) => {
    try {
      return listText(readFileSync(join(d, 'rules-outbound.txt'))).split(/\r?\n/).map((l) => l.trim())
        .filter((l) => l.startsWith('post:')).map((l) => flat(l.slice(5).trim())).filter(Boolean);
    } catch { return []; }
  });
  c.listed = (p) => { const key = pathKey(p, platform); return c.paths.find((x) => key === x.key || key.startsWith(`${x.key}/`)); };
  const cache = new Map();
  const cached = (key, get) => {
    if (!cache.has(key)) { try { cache.set(key, get()); } catch (e) { cache.set(key, e instanceof Error ? e : new Error(String(e))); } }
    if (cache.get(key) instanceof Error) throw cache.get(key);
    return cache.get(key);
  };
  c.remotes = (dir) => cached(`remotes ${dir}`, () => remotesFrom(git(dir, ['remote', '-v'])));
  // The URLs a branch or remote.pushDefault names directly rather than by a remote's name.
  c.branches = (dir) => cached(`branches ${dir}`, () => git(dir, ['config', '--get-regexp', BRANCH_KEYS]).split('\n')
    .map((line) => line.trim().slice(line.trim().indexOf(' ') + 1)).filter(isUrl).map(normalizeRemote));
  try {
    if (mcp) return mcpCall(tool, ti, c);
    c.full = ti.command.replace(/\\\r?\n|`\r?\n/g, ' ').replace(/%2F/gi, '/');
    c.cwd = typeof input.cwd === 'string' && isDir(input.cwd) ? input.cwd : null;
    c.cmds = commands(c.full);
    Object.assign(c, directories(c.cmds, c));
    c.ghRepo = ghRepoOf(c.cmds);
    return scan(c);
  } catch {
    return c.broken ?? `guard: this call could not be checked against ${list}, so guard asks before it`;
  }
}

export function main({ env = process.env, home = homedir(), platform = process.platform, stdin = () => readFileSync(0, 'utf8') } = {}) {
  let reason;
  try {
    const text = stdin();
    const input = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
    reason = input && typeof input === 'object' && !Array.isArray(input) ? decide(input, { env, home, platform }) : null;
  } catch { return []; }
  return reason ? [JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: reason } })] : [];
}

// Node resolves the entry point through symlinks, so compare with the resolved path.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    const lines = main();
    process.stdout.write(lines.length ? `${lines.join('\n')}\n` : '');
  } catch {}
}

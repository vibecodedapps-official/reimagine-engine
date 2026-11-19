#!/usr/bin/env node
// Primer's save points: one short entry for each parked session in sessions.txt of the machine's directory, written by this
// script alone, with no model call. An entry holds the day, what the session is, what it waits for, its directory, where its
// record is and the command that resumes it. The host's record format is internal and changes between versions, so the model
// and the effort level are read from it only in a form a shell takes as one word, and the command leaves out what was not read.
// Usage: node park.mjs <verb> [args], run from the session it serves
//   add --what <text> --when <text>  writes this session's entry, in place of an earlier one of the same session
//   list                             prints every entry, numbered in the file's order, the newest first
//   done [<n>]                       removes entry n of the list, or this session's entry
// Every verb marks each entry again with the day its record was last written, or the day a run first did not find it.
import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Refusal, git, homed, ownOf, places, readText, tilde, writeAtomic } from './primer.mjs';

const FORMS = 'park takes add --what <text> --when <text>, list, or done [<n>]';
// The file's first line. A session that finds the file reads it, so it says which command writes the file.
const HEAD = 'Save points of parked sessions, the newest first. The /primer:park command writes this file: a session asked for a save point in words answers with that command and writes nothing here.';
const ID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const COMMAND = /^claude --resume ([0-9a-f-]{36})(?= |$)/i;
const RECORD = /^record: under (.+), (last written|not found on) \d{4}-\d{2}-\d{2}$/;
const CAP = 120;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const refuse = (message) => { throw new Refusal(message); };
const ago = (n) => (n === 0 ? 'today' : n === 1 ? '1 day ago' : n + ' days ago'), points = (n) => (n === 1 ? '1 save point' : n + ' save points');
// A day as the machine's own clock has it.
const day = (d) => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
const daysBetween = (a, b) => Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);

// A session's record under a config folder, <config>/projects/<name>/<id>.jsonl, whatever directory the session started in.
function recordOf(config, id) {
  const projects = join(config, 'projects');
  for (const name of (() => { try { return readdirSync(projects).sort(); } catch { return []; } })()) {
    const file = join(projects, name, id + '.jsonl');
    try { const st = statSync(file, { throwIfNoEntry: false }); if (st?.isFile()) return { file, at: st.mtime }; } catch {}
  }
  return null;
}

// The model and the effort level of the session's last reply that gives each, a subagent's reply apart.
function lastReply(file) {
  const out = {}, lines = readText(file).split('\n');
  for (let i = lines.length - 1; i >= 0 && !(out.model && out.effort); i--) {
    if (!lines[i].includes('"assistant"')) continue;
    let v;
    try { v = JSON.parse(lines[i]); } catch { continue; }
    if (!v || v.type !== 'assistant' || v.isSidechain === true) continue;
    if (!out.model && typeof v.message?.model === 'string' && MODEL.test(v.message.model)) out.model = v.message.model;
    if (!out.effort && EFFORTS.includes(v.effort)) out.effort = v.effort;
  }
  return out;
}

// The file's bytes as text, none where there is no file. A file that cannot be read is refused, since a run writes the file
// again from what it read.
function textOf(path) {
  try { return readFileSync(path, 'utf8'); } catch (e) { return e.code === 'ENOENT' ? '' : refuse(path + ' cannot be read (' + e.code + ')'); }
}

// The text as the blocks of lines that blank lines part. An entry ends at its resume command, so two entries with no blank
// line between them are still two; lines that end in no command are a block kept as it is, but for the file's first line.
function load(text) {
  const out = [];
  for (const b of text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split(/\n[ \t]*\n/).map((x) => x.replace(/^\n+/, '').trimEnd()).filter((x) => x && !x.startsWith(HEAD.slice(0, 30)))) {
    let lines = [];
    for (const l of b.split('\n')) {
      lines.push(l);
      const id = COMMAND.exec(l)?.[1].toLowerCase();
      if (id) { out.push({ lines, id }); lines = []; }
    }
    if (lines.length) out.push({ lines });
  }
  return out;
}

// An entry's record line, set above its command: the config folder that holds the record, as the entry names it and else as
// this run has it, with the day the record was last written, or the day a run first did not find it.
function mark(c, e, config, today) {
  const old = e.lines.map((l) => RECORD.exec(l)).find(Boolean), folder = old ? old[1] : homed(c, config);
  e.record = recordOf(resolve(tilde(folder, c.home)), e.id);
  const line = e.record ? 'record: under ' + folder + ', last written ' + day(e.record.at) : old?.[2] === 'not found on' ? old[0] : 'record: under ' + folder + ', not found on ' + today;
  const rest = e.lines.filter((l) => !l.startsWith('record: '));
  e.lines = [...rest.slice(0, -1), line, rest.at(-1)];
}

function sessionOf(c) {
  const id = c.env.CLAUDE_CODE_SESSION_ID ?? '';
  return ID.test(id) ? id.toLowerCase() : refuse('CLAUDE_CODE_SESSION_ID holds no session id; run this from the session it is for');
}

// The entry of the session this runs in, and what its command had to leave out.
function entryOf(c, config, rest, now) {
  const o = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (!['--what', '--when'].includes(rest[i]) || rest[i] in o || rest[i + 1] === undefined) refuse(FORMS);
    o[rest[i]] = rest[i + 1].replace(/[\u0000-\u001f\u007f-\u009f\s]+/g, ' ').trim();
  }
  for (const k of ['--what', '--when']) {
    if (!o[k]) refuse(FORMS);
    if ([...o[k]].length > CAP) refuse(k + ' takes at most ' + CAP + ' characters, not ' + [...o[k]].length);
  }
  if (CONTROL.test(c.cwd)) refuse('the working directory has a control character in its name');
  const id = sessionOf(c), record = recordOf(config, id), seen = record ? lastReply(record.file) : {};
  const effort = EFFORTS.includes(c.env.CLAUDE_EFFORT) ? c.env.CLAUDE_EFFORT : seen.effort;
  const branch = (() => { try { const r = git(c, c.cwd, ['branch', '--show-current']); return r.status === 0 && !CONTROL.test(r.stdout.trim()) ? r.stdout.trim() : ''; } catch { return ''; } })();
  const lines = [[day(now), basename(c.cwd), branch].filter(Boolean).join('  '), 'what: ' + o['--what'], 'back when: ' + o['--when'], 'in: ' + c.cwd,
    'claude --resume ' + id + (seen.model ? ' --model ' + seen.model : '') + (effort ? ' --effort ' + effort : '')];
  const left = [seen.model ? null : '--model', effort ? null : '--effort'].filter(Boolean);
  return { entry: { lines, id }, note: left.length ? 'primer: the command leaves out ' + left.join(' and ') + ', which ' + (record ? 'the record of this session did not give' : 'no record of this session gave') : null };
}

// Returns the output lines; a refusal throws.
export function main(argv, { env = process.env, platform = process.platform, home = homedir(), cwd = process.cwd(), now = new Date() } = {}) {
  const [verb, ...rest] = argv, c = { env, platform, home, cwd };
  if (!['add', 'list', 'done'].includes(verb) || (verb === 'list' && rest.length) || (verb === 'done' && rest.length > 1)) refuse(FORMS);
  const p = places(c, ownOf(c)), path = join(p.local, 'sessions.txt'), config = dirname(p.own), today = day(now);
  const before = textOf(path);
  let blocks = load(before), out;
  const entries = () => blocks.filter((b) => b.id);
  if (verb === 'add') {
    const { entry, note } = entryOf(c, config, rest, now);
    blocks = [entry, ...blocks.filter((b) => b.id !== entry.id)];
    out = () => ['primer: saved in ' + path, ...entry.lines, ...(note ? [note] : [])];
  } else if (verb === 'done') {
    const all = entries(), n = rest.length ? (/^[1-9]\d*$/.test(rest[0]) ? Number(rest[0]) : refuse(FORMS)) : 0, mine = n ? null : sessionOf(c);
    const gone = n ? all[n - 1] : all.find((b) => b.id === mine);
    if (!gone) refuse(n ? 'the list has ' + points(all.length) + ', so none is number ' + n : 'this session has no save point; done <n> removes entry n of the list');
    blocks = blocks.filter((b) => b !== gone);
    out = () => ['primer: removed the save point of ' + gone.lines[0] + ', ' + (gone.lines.find((l) => l.startsWith('what: ')) ?? gone.lines.at(-1)) + '; ' + entries().length + ' left in ' + path];
  } else {
    out = () => (entries().length ? ['primer: ' + points(entries().length) + ' in ' + path, ...entries().flatMap((e, i) => ['', '[' + (i + 1) + '] ' + e.lines[0],
      ...e.lines.slice(1).map((l) => (e.record && l.startsWith('record: ') ? l + ', ' + ago(daysBetween(e.record.at, now)) : l))])] : ['primer: no save point in ' + path]);
  }
  for (const e of entries()) mark(c, e, config, today);
  const text = [HEAD, ...blocks.map((b) => b.lines.join('\n'))].join('\n\n') + '\n';
  if ((blocks.length || before) && text !== before) writeAtomic(path, text);
  return out();
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    process.stdout.write(main(process.argv.slice(2)).join('\n') + '\n');
  } catch (e) {
    process.stdout.write((e instanceof Refusal ? 'primer: ' + e.message : 'primer: unexpected error: ' + (e?.stack ?? e)) + '\n');
    process.exitCode = 1;
  }
}

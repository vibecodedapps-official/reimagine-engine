#!/usr/bin/env node
// Primer's notice hook, for SessionStart with the startup source. Usage: node notice.mjs, with the hook's input on stdin.
// Where the hub of the working directory's repository opens with the marker, it prints the notice of primer.mjs as a
// systemMessage: the count of auto memory notes and feedback entries since the last review. It reads the review stamp under
// $CLAUDE_PLUGIN_DATA, writes nothing, and prints nothing without a transcript path, without such a hub, and on an error of its own.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { hubOf, isDir, notice, repoOf } from '../scripts/primer.mjs';

try {
  const input = JSON.parse(readFileSync(0, 'utf8')), c = { env: process.env, platform: process.platform, home: homedir(), cwd: process.cwd() };
  const cwd = isDir(input.cwd) ? input.cwd : c.cwd, repo = repoOf(c, cwd) ?? { root: cwd.replace(/\\/g, '/'), top: cwd, urls: [] };
  const told = typeof input.transcript_path === 'string' && input.transcript_path && hubOf(repo.top) && notice(c, input, c.env.CLAUDE_PLUGIN_DATA, repo);
  if (told) process.stdout.write(`${JSON.stringify({ systemMessage: told })}\n`);
} catch { /* a notice that cannot be made is not given */ }

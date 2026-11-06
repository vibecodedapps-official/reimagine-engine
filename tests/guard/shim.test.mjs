// Guard reaches a claude that is only a command shim on the PATH. The script runs as a child process with its real claude
// runner; the PATH holds node's own directory and, for a stub, one more directory, so no real claude is run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../../plugins/guard/scripts/guard.mjs', import.meta.url));
const FIXTURE = fileURLToPath(new URL('./fixture/defaults.json', import.meta.url));
const SH_STUB = '#!/bin/sh\nwhile IFS= read -r line || [ -n "$line" ]; do printf \'%s\\n\' "$line"; done < "${0%/*}/defaults.json"\n';

// Runs the status verb with a PATH of node's directory, preceded by a directory holding a claude stub when stub is set;
// with decoy set, it runs from a folder that holds a claude which prints no defaults; with quoted set, the stub's PATH
// entry is in double quotes.
function status(stub, decoy = false, quoted = false) {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'guard-shim-')));
  try {
    const bin = join(dir, 'bin'), config = join(dir, 'config'), home = join(dir, 'home'), data = join(dir, 'data'), work = join(dir, 'work');
    for (const d of [bin, config, home, data, work]) mkdirSync(d);
    if (decoy) {
      const win = process.platform === 'win32';
      writeFileSync(join(work, win ? 'claude.cmd' : 'claude'), win ? '@echo {}\r\n' : '#!/bin/sh\necho {}\n');
      if (!win) chmodSync(join(work, 'claude'), 0o755);
    }
    if (stub) {
      copyFileSync(FIXTURE, join(bin, 'defaults.json'));
      if (process.platform === 'win32') {
        writeFileSync(join(bin, 'claude.cmd'), '@echo off\r\ntype "%~dp0defaults.json"\r\n');
      } else {
        writeFileSync(join(bin, 'claude'), SH_STUB);
        chmodSync(join(bin, 'claude'), 0o755);
      }
    }
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(path|claude_config_dir|nodefaultcurrentdirectoryinexepath)$/i.test(k)));
    Object.assign(env, { PATH: (stub ? [quoted ? `"${bin}"` : bin, dirname(process.execPath)] : [dirname(process.execPath)]).join(delimiter), CLAUDE_CONFIG_DIR: config, HOME: home, USERPROFILE: home });
    const run = spawnSync(process.execPath, [SCRIPT, 'status', data], { env, encoding: 'utf8', cwd: work });
    return { run, settings: join(config, 'settings.json'), list: join(config, 'reimagine-guard.json') };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('R341: status reaches a claude that is only a shim on the PATH', () => {
  const { run, settings, list } = status(true);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, `state: absent ${settings}\nlist: ${list} (0 repositories)\n`);
});

test('R341: status runs the shim on the PATH, not a claude in the folder it runs from', () => {
  const { run, settings, list } = status(true, true);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, `state: absent ${settings}\nlist: ${list} (0 repositories)\n`);
});

test('R341: status reaches a shim whose PATH entry is in double quotes', { skip: process.platform !== 'win32' }, () => {
  const { run, settings, list } = status(true, false, true);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, `state: absent ${settings}\nlist: ${list} (0 repositories)\n`);
});

test('R341: status names ENOENT when no claude is on the PATH', () => {
  const { run, settings, list } = status(false);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, `state: unavailable ${settings}; claude auto-mode defaults could not run (ENOENT)\nlist: ${list} (0 repositories)\n`);
});

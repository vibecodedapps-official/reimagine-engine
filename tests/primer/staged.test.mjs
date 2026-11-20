// Runs plugins/primer/scripts/staged.mjs as a child process against throwaway repositories and a configuration directory of
// its own, and holds its output and exit status to literals. The drift hook's suite holds what the check denies and allows.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../../plugins/primer/scripts/staged.mjs', import.meta.url));
const slash = (p) => p.replaceAll('\\', '/');

let base, env, seq = 0;

const git = (cwd, ...args) => {
  const r = spawnSync('git', ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'init.defaultBranch=main', ...args], { cwd, env, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}\n${r.stderr}`);
  return r.stdout;
};
const write = (dir, path, text) => {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
};
const repo = (name, remote) => {
  const dir = join(base, name);
  write(dir, 'README.md', '# x\n');
  git(dir, 'init', '-q');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  if (remote) git(dir, 'remote', 'add', 'origin', remote);
  return dir;
};
// A configuration directory with primer's own directory and a map.
const config = (repos, version = 1) => {
  const dir = join(base, `config-${++seq}`), own = join(dir, 'reimagine-primer');
  write(own, 'store/map.json', JSON.stringify({ version, repos, roots: [] }));
  return { dir, own };
};
const APP = { remotes: ['example.invalid/team/app'], path: 'unused', group: 'app', profile: 'local' };
const input = (command, cwd) => JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd });
const run = (text, cfg) => spawnSync(process.execPath, [SCRIPT], { cwd: base, env: { ...env, CLAUDE_CONFIG_DIR: cfg.dir }, input: text, encoding: 'utf8' });

before(() => {
  base = realpathSync.native(mkdtempSync(join(tmpdir(), 'primer-staged-')));
  const empty = join(base, 'empty.gitconfig');
  writeFileSync(empty, '');
  const home = join(base, 'home');
  mkdirSync(home);
  env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: empty, GIT_CEILING_DIRECTORIES: base, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(base, 'xdg') };
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'CLAUDE_CODE_SESSION_ATTENDED', 'CLAUDE_PLUGIN_DATA', 'CLAUDE_PROJECT_DIR', 'CLAUDE_CODE_PROJECT_DIR_NAME', 'CDPATH']) delete env[k];
});
after(() => rmSync(base, { recursive: true, force: true, maxRetries: 15, retryDelay: 100 }));

describe('staged', () => {
  test('outside a local repository it prints nothing and exits 0', () => {
    const cfg = config([APP]);
    const dir = repo('staged-other', 'https://example.invalid/team/other.git');
    write(dir, 'CLAUDE.md', '# x\n');
    const r = run(input('git add CLAUDE.md', dir), cfg);
    assert.deepEqual([r.status, r.stdout], [0, '']);
  });

  test('an error of its own prints a deny that gives the error and exits 2', () => {
    const cfg = config([APP]);
    write(cfg.own, 'config.json', '{');
    const r = run(input('git add CLAUDE.md', base), cfg);
    const reason = `primer: the staging check failed, so the call is denied: ${join(cfg.own, 'config.json')} is not a primer configuration`;
    assert.deepEqual([r.status, r.stdout, r.stderr],
      [2, `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } })}\n`, '']);
    const other = run(input('git log --grep commit', base), cfg);
    assert.deepEqual([other.status, other.stdout], [0, '']);
  });

  test('an entry recorded while the repository had no remote still matches after one is added', () => {
    const dir = repo('staged-remote-later');
    const cfg = config([{ remotes: [], path: slash(dir), group: 'staged-remote-later', profile: 'local' }]);
    git(dir, 'remote', 'add', 'origin', 'https://example.invalid/team/later.git');
    write(dir, 'CLAUDE.md', '# x\n');
    const r = run(input('git add CLAUDE.md', dir), cfg);
    const reason = `primer: ${slash(dir)} has the local profile, which keeps agent files out of its history; `
      + "the call would add CLAUDE.md, while the upstream's tree is unknown (refs/remotes/origin/HEAD cannot be read)";
    assert.deepEqual([r.status, r.stdout],
      [0, `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } })}\n`]);
  });

  test('R386: a local repository the map holds as ~/ is checked where the call\'s directory cannot be told', () => {
    const dir = repo('home/far');
    write(dir, 'CLAUDE.md', '# x\n');
    const cfg = config([{ remotes: [], path: '~/far', group: 'far', profile: 'local' }], 2);
    const r = run(input('cd "$SOMEWHERE" && git add CLAUDE.md', base), cfg);
    const reason = `primer: ${slash(dir)} has the local profile, which keeps agent files out of its history; the command cannot be resolved, `
      + "so it counts as staging every file git does not ignore; the call would add CLAUDE.md, while the upstream's tree is unknown (no remote names it)";
    assert.deepEqual([r.status, r.stdout],
      [0, `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } })}\n`]);
  });

  test('R391: a file under .agents/ is an agent file, in any letter case', () => {
    const dir = repo('agents-dir');
    write(dir, '.agents/skills/ship/SKILL.md', '# Ship\n');
    write(dir, 'docs/.Agents/notes.md', '# Notes\n');
    const cfg = config([{ remotes: [], path: slash(dir), group: 'agents-dir', profile: 'local' }]);
    const lead = `primer: ${slash(dir)} has the local profile, which keeps agent files out of its history; `;
    const deny = (reason) => `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } })}\n`;
    assert.equal(run(input('git add .agents/skills/ship/SKILL.md', dir), cfg).stdout,
      deny(lead + "the call would add .agents/skills/ship/SKILL.md, while the upstream's tree is unknown (no remote names it)"));
    assert.equal(run(input('git add docs/.Agents/notes.md', dir), cfg).stdout,
      deny(lead + "the call would add docs/.Agents/notes.md, while the upstream's tree is unknown (no remote names it)"));
  });

  test('R409: a commit that only removes agent files the repository tracks is let through', () => {
    const cfg = config([APP]);
    const dir = repo(`staged-removal-${++seq}`, 'https://example.invalid/team/app.git');
    write(dir, 'CLAUDE.md', '# x\n');
    write(dir, '.claude/settings.json', '{}\n');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'agent files');
    git(dir, 'rm', '-r', '-q', 'CLAUDE.md', '.claude');
    for (const command of ['git commit -m x', 'git commit -m x -- CLAUDE.md .claude']) {
      const r = run(input(command, dir), cfg);
      assert.deepEqual([r.status, r.stdout], [0, ''], command);
    }
    write(dir, 'AGENTS.md', '# y\n');
    const added = run(input('git add AGENTS.md', dir), cfg);
    assert.equal(added.stdout.includes('"permissionDecision":"deny"'), true);
  });

  test('R386: a clone under another host form or letter case of its remote matches the entry', () => {
    const denies = (name, remote, cfg) => {
      const dir = repo(name, remote);
      write(dir, 'CLAUDE.md', '# x\n');
      const r = run(input('git add CLAUDE.md', dir), cfg);
      const reason = `primer: ${slash(dir)} has the local profile, which keeps agent files out of its history; `
        + "the call would add CLAUDE.md, while the upstream's tree is unknown (refs/remotes/origin/HEAD cannot be read)";
      assert.deepEqual([r.status, r.stdout],
        [0, `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } })}\n`], remote);
    };
    const now = config([{ remotes: ['dev.azure.com/zz-org/zz-proj/_git/zz-svc'], path: 'unused', group: 'svc', profile: 'local' }]);
    denies('forms-1', 'https://zz-org.visualstudio.com/zz-proj/_git/zz-svc', now);
    denies('forms-2', 'https://zz-org.visualstudio.com/DefaultCollection/zz-proj/_git/zz-svc', now);
    denies('forms-3', 'zz-org@vs-ssh.visualstudio.com:v3/zz-org/zz-proj/zz-svc', now);
    denies('forms-4', 'https://dev.azure.com/ZZ-Org/zz-proj/_git/ZZ-svc', now);
    const old = config([{ remotes: ['zz-org.visualstudio.com/zz-proj/_git/zz-svc'], path: 'unused', group: 'svc', profile: 'local' }]);
    denies('forms-5', 'git@ssh.dev.azure.com:v3/zz-org/zz-proj/zz-svc', old);
    const dir = repo('forms-6', 'https://zz-org.visualstudio.com/zz-proj/_git/zz-other');
    write(dir, 'CLAUDE.md', '# x\n');
    const r = run(input('git add CLAUDE.md', dir), now);
    assert.deepEqual([r.status, r.stdout], [0, '']);
  });

  test('R386: a clone keeps its own entry where the map holds one per form of the remote', () => {
    const cfg = config([
      { remotes: ['dev.azure.com/zz-org/zz-proj/_git/zz-svc'], path: 'unused', group: 'svc', profile: 'shared' },
      { remotes: ['zz-org.visualstudio.com/zz-proj/_git/zz-svc'], path: 'unused', group: 'svc', profile: 'local' },
    ]);
    const old = repo('forms-7', 'https://zz-org.visualstudio.com/zz-proj/_git/zz-svc');
    write(old, 'CLAUDE.md', '# x\n');
    const r = run(input('git add CLAUDE.md', old), cfg);
    const reason = `primer: ${slash(old)} has the local profile, which keeps agent files out of its history; `
      + "the call would add CLAUDE.md, while the upstream's tree is unknown (refs/remotes/origin/HEAD cannot be read)";
    assert.deepEqual([r.status, r.stdout],
      [0, `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } })}\n`]);
    const now = repo('forms-8', 'https://dev.azure.com/zz-org/zz-proj/_git/zz-svc');
    write(now, 'CLAUDE.md', '# x\n');
    const s = run(input('git add CLAUDE.md', now), cfg);
    assert.deepEqual([s.status, s.stdout], [0, '']);
  });

  test('R386: an older Azure remote with no project matches the entry that has none', () => {
    const cfg = config([{ remotes: ['dev.azure.com/zz-org/_git/zz-svc'], path: 'unused', group: 'svc', profile: 'local' }]);
    for (const [name, remote] of [['forms-9', 'https://zz-org.visualstudio.com/DefaultCollection/_git/zz-svc'], ['forms-10', 'https://zz-org.visualstudio.com/_git/zz-svc']]) {
      const dir = repo(name, remote);
      write(dir, 'CLAUDE.md', '# x\n');
      const r = run(input('git add CLAUDE.md', dir), cfg);
      const reason = `primer: ${slash(dir)} has the local profile, which keeps agent files out of its history; `
        + "the call would add CLAUDE.md, while the upstream's tree is unknown (refs/remotes/origin/HEAD cannot be read)";
      assert.deepEqual([r.status, r.stdout],
        [0, `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } })}\n`], remote);
    }
  });
});

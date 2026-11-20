// Runs the primer drift hook (plugins/primer/hooks/drift.mjs) against throwaway repositories, one test per rule, and the staging
// check of plugins/primer/scripts/staged.mjs that it runs first.
// The hook needs git on PATH. Every repository lives under one temporary base that is removed at the end.
// The groups whose cases build their own repository or only read a shared one run their cases concurrently.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const concurrency = Math.max(1, availableParallelism() - 1);

let base;
let env;
let gitEnv;

// Resolves with the status and the utf8 output; input, when given, is written to stdin.
const exec = (command, args, options, input) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (d) => (stdout += d));
    child.stderr.setEncoding('utf8').on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
    if (input !== undefined) child.stdin.end(input);
  });

const git = async (cwd, ...args) => {
  const r = await exec(
    'git',
    ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', '-c', 'init.defaultBranch=main', ...args],
    { cwd, env: gitEnv },
  );
  assert.equal(r.status, 0, `git ${args.join(' ')} in ${cwd}\n${r.stderr}`);
  return r.stdout;
};

const write = (dir, path, content) => {
  const file = join(dir, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
};

const repo = async (name, files) => {
  const dir = join(base, name);
  mkdirSync(dir, { recursive: true });
  for (const [path, content] of Object.entries(files)) write(dir, path, content);
  await git(dir, 'init', '-q');
  await git(dir, 'add', '-A');
  await git(dir, 'commit', '-q', '-m', 'init');
  return dir;
};

const hook = async (input, envOverride = {}) => {
  const r = await exec(process.execPath, ['plugins/primer/hooks/drift.mjs'], { cwd: root, env: { ...env, ...envOverride } }, input);
  assert.equal(r.status, 0, `hook exited ${r.status}\n${r.stderr}`);
  return r.stdout;
};

const run = (command, cwd, extra = {}) =>
  hook(
    JSON.stringify({
      session_id: 'test',
      hook_event_name: extra.event ?? 'PreToolUse',
      tool_name: extra.tool ?? 'Bash',
      tool_input: { command, description: extra.description ?? 'Run a command' },
      cwd,
    }),
    extra.env,
  );

const deny = (findings) =>
  '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"primer: ' + findings + '"}}\n';
const advise = (files) =>
  '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"primer: the staged change touches files these cover; recheck them: ' + files + '"}}\n';

// The hub is 12 lines; the nested CLAUDE.md is 11; the skill is 8.
const opening = (doc) =>
  'A test repository. Read `' + doc + '` before changing the design; the handlers are under `src/api/`, `README.md` is for people, `plugins/<name>/` is a placeholder, `src/*.ts` is a glob and `npm test` is a command.';
const hubOf = (para) =>
  '<!-- primer -->\n# Fixture\n\n' + para + '\n\n## Commands\n\n- `npm test`: runs the tests; `docs/gone.md` here is not checked.\n\n## Constraints\n\n- Keep every file short.\n';
const hubText = hubOf(opening('docs/design.md'));
const brokenHub = hubOf(opening('docs/gone.md'));
const brokenFinding = 'CLAUDE.md names missing path docs/gone.md';

const codeWith = (front) => '---\n' + front + '\n---\n# Code\n\nType every export.\n';
const libWith = (front) => '---\n' + front + '\n---\n# Lib\n\nKeep lib pure.\n';
const pickWith = (front) => '---\n' + front + '\n---\n# Pick\n\nA and B only.\n';
const skillText =
  '---\nname: release\ndescription: Cut a release. Use when the user says "cut a release".\npaths: scripts/**\n---\n# Release\n\n1. Run `scripts/release.sh`.\n';
const skillNoDescription = skillText.replace('description: Cut a release. Use when the user says "cut a release".\n', '');
const apiText = '# API\n\nThe handlers.\n\n## Commands\n\n- `npm test`: runs the tests.\n\n## Constraints\n\n- Validate input.\n';

const baseFiles = {
  'CLAUDE.md': hubText,
  'README.md': '# Fixture\n',
  'docs/design.md': '# Design\n\nNotes.\n',
  'notes/deep/todo.md': '# Todo\n',
  'src/api/CLAUDE.md': apiText,
  'src/api/handler.ts': 'export const h = 1;\n',
  'src/app.tsx': 'export const a = 1;\n',
  'src/a.ts': 'export const x = 1;\n',
  'src/b.ts': 'export const x = 1;\n',
  'src/c.ts': 'export const x = 1;\n',
  'lib/g.ts': 'export const g = 1;\n',
  'tests/g.test.ts': 'test;\n',
  'scripts/release.sh': 'echo release\n',
  '.claude/rules/style.md': '# Style\n\nWrite plain prose.\n',
  '.claude/rules/code.md': codeWith('paths: ["src/**/*.{ts,tsx}", "*.md"]'),
  '.claude/rules/lib.md': libWith('paths: lib/*.ts, tests/**/*.test.ts'),
  '.claude/rules/area/pick.md': pickWith('paths:\n  - "src/[ab].ts"'),
  '.claude/skills/release/SKILL.md': skillText,
};

// The base fixture with overrides applied; a null value deletes the path.
const files = (overrides = {}) => {
  const out = { ...baseFiles };
  for (const [path, content] of Object.entries(overrides)) {
    if (content === null) delete out[path];
    else out[path] = content;
  }
  return out;
};
const make = (name, overrides) => repo(name, files(overrides));

// Appends filler lines to a text that has `have` lines, up to `total` lines.
const pad = (text, have, total) => text + 'x\n'.repeat(total - have);

let broken;
let brokenPath;
let fixture;

// Back to a clean index and tree after a step that changed files.
const clean = async (dir) => {
  await git(dir, 'reset', '-q');
  await git(dir, 'checkout', '-q', '--', '.');
  rmSync(join(dir, 'src/new.ts'), { force: true });
};
const stage = async (dir, path, content) => {
  write(dir, path, content);
  await git(dir, 'add', '--', path);
};

before(async () => {
  base = realpathSync.native(mkdtempSync(join(tmpdir(), 'primer-hook-')));
  const emptyConfig = join(base, 'empty.gitconfig');
  writeFileSync(emptyConfig, '');
  env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: emptyConfig, GIT_CEILING_DIRECTORIES: base, CLAUDE_CONFIG_DIR: join(base, 'no-config'), XDG_CONFIG_HOME: join(base, 'xdg') };
  delete env.CLAUDE_PLUGIN_ROOT;
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;
  gitEnv = { ...env, GIT_AUTHOR_DATE: '2026-09-01T10:00:00Z', GIT_COMMITTER_DATE: '2026-09-01T10:00:00Z' };
  broken = await make('broken', { 'CLAUDE.md': brokenHub });
  brokenPath = broken;
  fixture = await make('fixture', {});
});

after(() => rmSync(base, { recursive: true, force: true }));

describe('primer drift hook', () => {
  describe('cases that write no shared repository', { concurrency }, () => {
    test('hooks.json registers the drift hook before and after Bash and PowerShell calls, a PreToolUse hook for file edits, one SessionStart hook for startup, and the loader on every source and at a subagent\'s start', () => {
      const json = JSON.parse(readFileSync(join(root, 'plugins/primer/hooks/hooks.json'), 'utf8'));
      assert.deepEqual(json, {
        hooks: {
          PreToolUse: [
            { matcher: 'Bash|PowerShell', hooks: [{ type: 'command', command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/hooks/drift.mjs'], onFailure: 'continue' }] },
            { matcher: 'Edit|Write|NotebookEdit', hooks: [{ type: 'command', command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/scripts/primer.mjs', 'reach', '${CLAUDE_PLUGIN_DATA}'], timeout: 10, onFailure: 'continue' }] },
          ],
          PostToolUse: [{ matcher: 'Bash|PowerShell', hooks: [{ type: 'command', command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/hooks/drift.mjs'], onFailure: 'continue' }] }],
          SessionStart: [
            { matcher: 'startup', hooks: [{ type: 'command', command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/hooks/notice.mjs'] }] },
            { hooks: [{ type: 'command', command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/scripts/primer.mjs', 'session-start', 'all', '${CLAUDE_PLUGIN_DATA}'], timeout: 10 }] },
          ],
          SubagentStart: [
            { hooks: [{ type: 'command', command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/scripts/primer.mjs', 'session-start', 'all', '${CLAUDE_PLUGIN_DATA}'], timeout: 10 }] },
          ],
        },
      });
    });

    const positive = [
      'git commit -m x',
      'git add -A && git commit -m x',
      'git add -A; git commit -m x',
      'git add -A\ngit commit -m x',
      'echo msg | git commit -F -',
      '(git commit -m x)',
      'env GIT_AUTHOR_NAME=a git commit -m x',
      'sudo git commit -m x',
      'GIT_EDITOR=true git commit',
      'bash -c "git commit -m x"',
      "sh -c 'git add -A; git commit -m x'",
      '& git commit -m x',
      'git.exe commit -m x',
      '& "C:\\Program Files\\Git\\cmd\\git.exe" commit -m x',
      'git -c user.name=a commit -m x',
      'git --git-dir=.git commit -m x',
      'git --git-dir .git --work-tree . commit -m x',
      'git --no-pager commit -m "fix; things"',
    ];
    for (const command of positive) {
      test(`detects a commit: ${JSON.stringify(command)}`, async () => {
        assert.equal(await run(command, broken), deny(brokenFinding));
      });
    }

    const wrapped = [
      'if git diff --cached --quiet; then echo none; else git commit -m x; fi',
      'for f in a; do git commit -m x; done',
      '! git commit -m x',
      'time git commit -m x',
      'command git commit -m x',
      'bash -o pipefail -c "git commit -m x"',
      'echo "$(git commit -m x)"',
      '/usr/bin/env git commit -m x',
      'git -C "$REPO" commit -m x',
    ];
    for (const command of wrapped) {
      test(`detects a commit: ${JSON.stringify(command)}`, async () => {
        assert.equal(await run(command, broken), deny(brokenFinding));
      });
    }

    test('detects a commit after env -C from a non-repository cwd', async () => {
      assert.equal(await run('env -C broken git commit -m x', base), deny(brokenFinding));
    });

    test('detects a commit after git -C ~/dir with HOME set', async () => {
      assert.equal(await run('git -C ~/broken commit -m x', base, { env: { HOME: base } }), deny(brokenFinding));
    });

    test('detects a commit from the PowerShell tool', async () => {
      assert.equal(await run('git commit -m x', broken, { tool: 'PowerShell' }), deny(brokenFinding));
    });

    test('PowerShell reads a backslash before a closing quote as a plain character', async () => {
      assert.equal(await run('cd "C:\\work\\"; git commit -m x', broken, { tool: 'PowerShell' }), deny(brokenFinding));
    });

    test('PowerShell reads a here-string as one word, so an apostrophe in it hides no commit and its lines are no commands', async () => {
      assert.equal(await run("Set-Content x @'\nit's\n'@; git commit -m y", broken, { tool: 'PowerShell' }), deny(brokenFinding));
      assert.equal(await run("git commit -m @'\nfix: don't drop the map\n'@", broken, { tool: 'PowerShell' }), deny(brokenFinding));
      assert.equal(await run('git commit -m @"\r\nfix: don\'t\r\n"@', broken, { tool: 'PowerShell' }), deny(brokenFinding));
      assert.equal(await run("Set-Content x @'\nit's\ngit commit -m x\n'@", broken, { tool: 'PowerShell' }), '');
      assert.equal(await run("cat x @'\nit's\n'@; git commit -m y", broken), '');
      assert.equal(await run("$m=@'\nit's\n'@; git commit -m $m", broken, { tool: 'PowerShell' }), deny(brokenFinding));
      assert.equal(await run('Write-Output @"\na`tb\ngit commit -m x\n"@', broken, { tool: 'PowerShell' }), '');
    });

    test('PowerShell reads a backtick before a quote as a literal quote', async () => {
      assert.equal(await run('echo "a`"b"; git commit -m x', broken, { tool: 'PowerShell' }), deny(brokenFinding));
    });

    test('Bash keeps a backslash-escaped quote inside the string', async () => {
      assert.equal(await run('echo "x\\"; git commit -m x', broken, { tool: 'Bash' }), '');
    });

    test('detects a commit in pretty-printed stdin', async () => {
      const input = {
        session_id: 'test',
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'git commit -m x', description: 'Run a command' },
        cwd: broken,
      };
      assert.equal(await hook(JSON.stringify(input, null, 2)), deny(brokenFinding));
    });

    const slashed = (p) => p.replaceAll('\\', '/');
    const directory = [
      ['a relative -C', () => 'git -C broken commit -m x'],
      ['a forward-slash -C', () => `git -C ${slashed(brokenPath)} commit -m x`],
      ['a quoted OS-path -C', () => `git -C "${brokenPath}" commit -m x`],
      ['a forward-slash --work-tree=', () => `git --work-tree=${slashed(brokenPath)} commit -m x`],
    ];
    for (const [label, command] of directory) {
      test(`detects a commit from a non-repository cwd with ${label}`, async () => {
        assert.equal(await run(command(), base), deny(brokenFinding));
      });
    }

    const negative = [
      ['git log --grep commit', {}],
      ['echo git commit', {}],
      ['echo "a; git commit"', {}],
      ['git commit-tree HEAD^{tree}', {}],
      ['git show HEAD:commit', {}],
      ['ls commit', {}],
      ['git status', { description: 'git commit the staged change' }],
      ['git status', { description: 'commit' }],
      ['git commit --dry-run', {}],
      ['git commit --help', {}],
      ['git commit -h', {}],
    ];
    for (const [command, extra] of negative) {
      test(`stays quiet: ${JSON.stringify(command)} ${extra.description ?? ''}`.trim(), async () => {
        assert.equal(await run(command, broken, extra), '');
      });
    }

    test('stays quiet on empty stdin', async () => {
      assert.equal(await hook(''), '');
    });

    test('stays quiet on stdin that is not JSON', async () => {
      assert.equal(await hook('not json commit'), '');
    });

    test('prints nothing outside a repository', async () => {
      const dir = join(base, 'plain');
      write(dir, 'CLAUDE.md', brokenHub);
      assert.equal(await run('git commit -m x', dir), '');
    });

    test('a byte that is not UTF-8 in the command does not disable the hook under a UTF-8 locale', async () => {
      const dir = await make('bad-byte', { 'CLAUDE.md': brokenHub });
      const input = Buffer.concat([
        Buffer.from('{"tool_name":"Bash","tool_input":{"command":"git commit -m \\"caf'),
        Buffer.from([0xff]),
        Buffer.from('\\""},"cwd":' + JSON.stringify(dir) + '}'),
      ]);
      for (const locale of ['en_US.UTF-8', 'C.UTF-8', 'C']) assert.equal(await hook(input, { LC_ALL: locale }), deny(brokenFinding), locale);
    });

    test('several findings come in the order hub, nested, rules, skills', async () => {
      const dir = await make('order', {
        'CLAUDE.md': pad(brokenHub, 12, 61),
        'src/api/CLAUDE.md': pad(apiText, 11, 61),
        '.claude/rules/code.md': codeWith('paths: [unclosed'),
        '.claude/skills/release/SKILL.md': skillNoDescription,
      });
      assert.equal(
        await run('git commit -m x', dir),
        deny(
          'CLAUDE.md has 61 lines, over its cap of 60; CLAUDE.md names missing path docs/gone.md; src/api/CLAUDE.md has 61 lines, over its cap of 60; .claude/rules/code.md has a paths value the host cannot read; .claude/skills/release/SKILL.md has no description',
        ),
      );
    });

    test('a deny wins over advice', async () => {
      const dir = await make('deny-wins', { 'CLAUDE.md': brokenHub });
      await stage(dir, 'src/app.tsx', 'export const a = 2;\n');
      assert.equal(await run('git commit -m x', dir), deny(brokenFinding));
    });
  });

  describe('quiet and opt-in', { concurrency }, () => {
    test('the base fixture with nothing staged prints nothing', async () => {
      assert.equal(await run('git commit -m x', fixture), '');
    });
    test('R409: a commit that removes the hub and every other instruction file prints nothing', async () => {
      const dir = await make('removal', {});
      await git(dir, 'rm', '-r', '-q', 'CLAUDE.md', 'src/api/CLAUDE.md', '.claude');
      assert.equal(await run('git commit -m x', dir), '');
    });
    test('a hub without the marker line prints nothing', async () => {
      const dir = await make('no-marker', { 'CLAUDE.md': brokenHub.split('\n').slice(1).join('\n') });
      assert.equal(await run('git commit -m x', dir), '');
    });
    test('a marker on line 2 after a blank line prints nothing', async () => {
      const dir = await make('marker-line-2', { 'CLAUDE.md': '\n' + brokenHub });
      assert.equal(await run('git commit -m x', dir), '');
    });
    test('a hub with CRLF line ends is read', async () => {
      const dir = await make('crlf-hub', { 'CLAUDE.md': brokenHub.replaceAll('\n', '\r\n') });
      assert.equal(await run('git commit -m x', dir), deny(brokenFinding));
    });
    test('no CLAUDE.md or AGENTS.md prints nothing', async () => {
      assert.equal(await run('git commit -m x', await repo('nohub', { 'a.txt': 'a\n' })), '');
    });
  });

  describe('which file is the hub', { concurrency }, () => {
    const agentsFinding = 'AGENTS.md names missing path docs/gone.md';
    test('@AGENTS.md with a newline reads AGENTS.md as the hub', async () => {
      const dir = await make('adapter-nl', { 'CLAUDE.md': '@AGENTS.md\n', 'AGENTS.md': brokenHub });
      assert.equal(await run('git commit -m x', dir), deny(agentsFinding));
    });
    test('@AGENTS.md without a newline reads AGENTS.md as the hub', async () => {
      const dir = await make('adapter-bare', { 'CLAUDE.md': '@AGENTS.md', 'AGENTS.md': brokenHub });
      assert.equal(await run('git commit -m x', dir), deny(agentsFinding));
    });
    test('@AGENTS.md with CRLF reads AGENTS.md as the hub', async () => {
      const dir = await make('adapter-crlf', { 'CLAUDE.md': '@AGENTS.md\r\n', 'AGENTS.md': brokenHub });
      assert.equal(await run('git commit -m x', dir), deny(agentsFinding));
    });
    test('an adapter with no AGENTS.md prints nothing', async () => {
      const dir = await make('adapter-missing', { 'CLAUDE.md': '@AGENTS.md\n' });
      assert.equal(await run('git commit -m x', dir), '');
    });
    test('@AGENTS.md with two newlines is not the adapter, so CLAUDE.md is the hub and has no marker', async () => {
      const dir = await make('adapter-two', { 'CLAUDE.md': '@AGENTS.md\n\n', 'AGENTS.md': brokenHub });
      assert.equal(await run('git commit -m x', dir), '');
    });
    test('AGENTS.md is the hub when no CLAUDE.md exists', async () => {
      const dir = await make('direct-agents', { 'CLAUDE.md': null, 'AGENTS.md': brokenHub });
      assert.equal(await run('git commit -m x', dir), deny(agentsFinding));
    });
    test('a CLAUDE.md without the marker beside a marked AGENTS.md prints nothing', async () => {
      const dir = await make('claude-wins', { 'CLAUDE.md': hubText.split('\n').slice(1).join('\n'), 'AGENTS.md': brokenHub });
      assert.equal(await run('git commit -m x', dir), '');
    });
  });

  describe('hub path check', { concurrency }, () => {
    test('a path spelled in another case is a missing path', async () => {
      const dir = await make('case-path', { 'CLAUDE.md': hubOf(opening('Docs/design.md')) });
      assert.equal(await run('git commit -m x', dir), deny('CLAUDE.md names missing path Docs/design.md'));
    });
    test('a token named twice in the opening paragraph is one finding', async () => {
      const dir = await make('twice', { 'CLAUDE.md': hubOf(opening('docs/gone.md') + ' See `docs/gone.md` again.') });
      assert.equal(await run('git commit -m x', dir), deny(brokenFinding));
    });
    test('a branch, a slug, a home path, an absolute path, a drive path and a URL are not repository paths', async () => {
      const others = 'See `origin/main`, `and/or`, `~/.claude/settings.json`, `/etc/hosts`, `C:/work/notes.md` and `https://example.invalid/x.md`.';
      const dir = await make('not-paths', { 'CLAUDE.md': hubOf(opening('docs/design.md') + ' ' + others) });
      assert.equal(await run('git commit -m x', dir), '');
    });
    test('a first segment in another case is still a missing path', async () => {
      const dir = await make('case-top', { 'CLAUDE.md': hubOf(opening('docs/design.md') + ' See `Src/a.ts`.') });
      assert.equal(await run('git commit -m x', dir), deny('CLAUDE.md names missing path Src/a.ts'));
    });
    test('a path written from ./ is checked without it', async () => {
      const dir = await make('dot-slash', { 'CLAUDE.md': hubOf(opening('./docs/design.md') + ' See `./src/gone.ts`.') });
      assert.equal(await run('git commit -m x', dir), deny('CLAUDE.md names missing path ./src/gone.ts'));
    });
    test('a missing path under a top-level entry that exists is a finding', async () => {
      const dir = await make('under-top', { 'CLAUDE.md': hubOf(opening('docs/design.md') + ' See `src/gone.ts`.') });
      assert.equal(await run('git commit -m x', dir), deny('CLAUDE.md names missing path src/gone.ts'));
    });
    test('a double quote and a backslash in the finding are escaped', async () => {
      const dir = await make('quote', { 'CLAUDE.md': hubOf(opening('docs/a"b\\c.md')) });
      assert.equal(
        await run('git commit -m x', dir),
        '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"primer: CLAUDE.md names missing path docs/a\\"b\\\\c.md"}}\n',
      );
    });
  });

  describe('line caps', { concurrency }, () => {
    test('a 60-line hub passes', async () => {
      const dir = await make('cap-hub-60', { 'CLAUDE.md': pad(hubText, 12, 60) });
      assert.equal(await run('git commit -m x', dir), '');
    });
    test('a 61-line hub is denied', async () => {
      const dir = await make('cap-hub-61', { 'CLAUDE.md': pad(hubText, 12, 61) });
      assert.equal(await run('git commit -m x', dir), deny('CLAUDE.md has 61 lines, over its cap of 60'));
    });
    test('a 61-line hub whose last line has no newline is denied with 61', async () => {
      const dir = await make('cap-hub-no-newline', { 'CLAUDE.md': pad(hubText, 12, 61).slice(0, -1) });
      assert.equal(await run('git commit -m x', dir), deny('CLAUDE.md has 61 lines, over its cap of 60'));
    });
    test('a 60-line nested CLAUDE.md passes', async () => {
      const dir = await make('cap-nested-60', { 'src/api/CLAUDE.md': pad(apiText, 11, 60) });
      assert.equal(await run('git commit -m x', dir), '');
    });
    test('a 61-line nested CLAUDE.md is denied', async () => {
      const dir = await make('cap-nested-61', { 'src/api/CLAUDE.md': pad(apiText, 11, 61) });
      assert.equal(await run('git commit -m x', dir), deny('src/api/CLAUDE.md has 61 lines, over its cap of 60'));
    });
    test('a 200-line rule passes', async () => {
      const dir = await make('cap-rule-200', { '.claude/rules/style.md': pad('# Style\n\nWrite plain prose.\n', 3, 200) });
      assert.equal(await run('git commit -m x', dir), '');
    });
    test('a 201-line rule is denied', async () => {
      const dir = await make('cap-rule-201', { '.claude/rules/style.md': pad('# Style\n\nWrite plain prose.\n', 3, 201) });
      assert.equal(await run('git commit -m x', dir), deny('.claude/rules/style.md has 201 lines, over its cap of 200'));
    });
    test('a 150-line SKILL.md passes', async () => {
      const dir = await make('cap-skill-150', { '.claude/skills/release/SKILL.md': pad(skillText, 8, 150) });
      assert.equal(await run('git commit -m x', dir), '');
    });
    test('a 151-line SKILL.md is denied', async () => {
      const dir = await make('cap-skill-151', { '.claude/skills/release/SKILL.md': pad(skillText, 8, 151) });
      assert.equal(await run('git commit -m x', dir), deny('.claude/skills/release/SKILL.md has 151 lines, over its cap of 150'));
    });
    // 25 lines of 1600 characters each is 40,000 characters; one more character is 40,001.
    const chars40000 = ('a'.repeat(1599) + '\n').repeat(25);
    test('a rule of 40,000 characters passes', async () => {
      const dir = await make('cap-chars-rule-40000', { '.claude/rules/style.md': chars40000 });
      assert.equal(await run('git commit -m x', dir), '');
    });
    test('a rule of 40,001 characters is denied', async () => {
      const dir = await make('cap-chars-rule-40001', { '.claude/rules/style.md': chars40000 + 'a' });
      assert.equal(await run('git commit -m x', dir), deny('.claude/rules/style.md has 40001 characters, over its cap of 40000'));
    });
    test('a nested CLAUDE.md of 40,001 characters is denied', async () => {
      const dir = await make('cap-chars-nested-40001', { 'src/api/CLAUDE.md': chars40000 + 'a' });
      assert.equal(await run('git commit -m x', dir), deny('src/api/CLAUDE.md has 40001 characters, over its cap of 40000'));
    });
    test('a nested CLAUDE.md of 40,000 characters passes', async () => {
      const dir = await make('cap-chars-nested-40000', { 'src/api/CLAUDE.md': chars40000 });
      assert.equal(await run('git commit -m x', dir), '');
    });
    test('a hub over 40,000 characters has no character cap', async () => {
      const dir = await make('cap-chars-hub', { 'CLAUDE.md': hubText + 'a'.repeat(40000) + '\n' });
      assert.equal(await run('git commit -m x', dir), '');
    });
    test('a SKILL.md over 40,000 characters has no character cap', async () => {
      const dir = await make('cap-chars-skill', { '.claude/skills/release/SKILL.md': skillText + 'a'.repeat(40000) + '\n' });
      assert.equal(await run('git commit -m x', dir), '');
    });
    test('a rule of 40,000 characters that is 79,975 bytes passes', async () => {
      const dir = await make('cap-chars-multibyte', { '.claude/rules/style.md': ('\u00e9'.repeat(1599) + '\n').repeat(25) });
      assert.equal(await run('git commit -m x', dir), '');
    });
    test('a rule over both caps gets the line finding then the character finding', async () => {
      // 201 lines of 200 characters each is 40,200 characters.
      const dir = await make('cap-chars-both', { '.claude/rules/style.md': ('a'.repeat(199) + '\n').repeat(201) });
      assert.equal(
        await run('git commit -m x', dir),
        deny('.claude/rules/style.md has 201 lines, over its cap of 200; .claude/rules/style.md has 40200 characters, over its cap of 40000'),
      );
    });
    test('a 70-line .claude/CLAUDE.md is not a nested file and has no cap', async () => {
      const dir = await make('cap-dot-claude', { '.claude/CLAUDE.md': '# Dot\n' + 'x\n'.repeat(69) });
      assert.equal(await run('git commit -m x', dir), '');
    });
    test('an untracked 70-line nested CLAUDE.md is not read', async () => {
      const dir = await make('cap-untracked', {});
      write(dir, 'docs/CLAUDE.md', '# Docs\n' + 'x\n'.repeat(69));
      assert.equal(await run('git commit -m x', dir), '');
    });
  });

  describe('paths values', { concurrency }, () => {
    const codeFinding = '.claude/rules/code.md has a paths value the host cannot read';
    test('a flow list that is not closed is unreadable', async () => {
      const dir = await make('paths-unclosed-flow', { '.claude/rules/code.md': codeWith('paths: [unclosed') });
      assert.equal(await run('git commit -m x', dir), deny(codeFinding));
    });
    test('a quote that is not closed is unreadable', async () => {
      const dir = await make('paths-unclosed-quote', { '.claude/rules/code.md': codeWith('paths: "src/**') });
      assert.equal(await run('git commit -m x', dir), deny(codeFinding));
    });
    test('an empty paths with no items is unreadable', async () => {
      const dir = await make('paths-empty', { '.claude/rules/code.md': codeWith('paths:') });
      assert.equal(await run('git commit -m x', dir), deny(codeFinding));
    });
    test('a glob that matches no tracked file is denied', async () => {
      const dir = await make('paths-gone', { '.claude/rules/code.md': codeWith('paths: ["src/**/*.{ts,tsx}", "gone/*.md"]') });
      assert.equal(await run('git commit -m x', dir), deny('.claude/rules/code.md paths glob gone/*.md matches no tracked file'));
    });
    test('a brace alternative that matches nothing is fine when another matches', async () => {
      const dir = await make('paths-brace-partial', { '.claude/rules/code.md': codeWith('paths: ["src/**/*.{ts,rs}"]') });
      assert.equal(await run('git commit -m x', dir), '');
    });
    test('a quoted comma string is split into globs', async () => {
      const dir = await make('paths-quoted-string', { '.claude/rules/lib.md': libWith('paths: "lib/*.ts, tests/**/*.test.ts"') });
      assert.equal(await run('git commit -m x', dir), '');
    });
    test('a rule with CRLF line ends is read', async () => {
      const dir = await make('paths-crlf', { '.claude/rules/lib.md': libWith('paths: lib/*.ts, tests/**/*.test.ts').replaceAll('\n', '\r\n') });
      assert.equal(await run('git commit -m x', dir), '');
    });
    test('a slashless glob matches at depth', async () => {
      const dir = await make('paths-slashless', { '.claude/rules/area/pick.md': pickWith('paths:\n  - "[ab].ts"') });
      assert.equal(await run('git commit -m x', dir), '');
    });
    test('a slashless glob that matches nothing is denied', async () => {
      const dir = await make('paths-slashless-gone', { '.claude/rules/area/pick.md': pickWith('paths:\n  - "[xy].ts"') });
      assert.equal(await run('git commit -m x', dir), deny('.claude/rules/area/pick.md paths glob [xy].ts matches no tracked file'));
    });
    test('a skill paths glob that matches nothing is denied', async () => {
      const dir = await make('paths-skill-gone', { '.claude/skills/release/SKILL.md': skillText.replace('paths: scripts/**', 'paths: gone/**') });
      assert.equal(await run('git commit -m x', dir), deny('.claude/skills/release/SKILL.md paths glob gone/** matches no tracked file'));
    });
    test('a skill without a description is denied', async () => {
      const dir = await make('skill-no-description', { '.claude/skills/release/SKILL.md': skillNoDescription });
      assert.equal(await run('git commit -m x', dir), deny('.claude/skills/release/SKILL.md has no description'));
    });
    test('an untracked file counts for a glob only when the command runs git add', async () => {
      const dir = await make('paths-untracked', { '.claude/rules/gen.md': codeWith('paths: ["gen/*.ts"]') });
      write(dir, 'gen/x.ts', 'export const x = 1;\n');
      assert.equal(await run('git commit -m x', dir), deny('.claude/rules/gen.md paths glob gen/*.ts matches no tracked file'));
      assert.equal(await run('git add -A && git commit -m x', dir), advise('.claude/rules/gen.md'));
    });
  });

  describe('advice from the changed set', () => {
    const codeMore = baseFiles['.claude/rules/code.md'] + 'More.\n';
    const steps = [
      ['src/api/handler.ts changed', [['src/api/handler.ts', 'export const h = 2;\n']], advise('.claude/rules/code.md, src/api/CLAUDE.md')],
      [
        'src/api/handler.ts and src/api/CLAUDE.md changed',
        [['src/api/handler.ts', 'export const h = 2;\n'], ['src/api/CLAUDE.md', apiText + 'More.\n']],
        advise('.claude/rules/code.md'),
      ],
      ['src/app.tsx changed, matched through a brace group', [['src/app.tsx', 'export const a = 2;\n']], advise('.claude/rules/code.md')],
      ['notes/deep/todo.md changed, matched by a slashless glob at depth', [['notes/deep/todo.md', '# Todo 2\n']], advise('.claude/rules/code.md')],
      ['src/a.ts changed', [['src/a.ts', 'export const x = 2;\n']], advise('.claude/rules/area/pick.md, .claude/rules/code.md')],
      ['src/c.ts changed', [['src/c.ts', 'export const x = 2;\n']], advise('.claude/rules/code.md')],
      ['lib/g.ts changed', [['lib/g.ts', 'export const g = 2;\n']], advise('.claude/rules/lib.md')],
      ['tests/g.test.ts changed', [['tests/g.test.ts', 'test 2;\n']], advise('.claude/rules/lib.md')],
      ['scripts/release.sh changed', [['scripts/release.sh', 'echo release 2\n']], advise('.claude/skills/release/SKILL.md')],
      ['src/app.tsx and .claude/rules/code.md changed', [['src/app.tsx', 'export const a = 2;\n'], ['.claude/rules/code.md', codeMore]], ''],
      ['.claude/rules/style.md changed, matched by the *.md glob of code.md', [['.claude/rules/style.md', '# Style\n\nWrite prose.\n']], advise('.claude/rules/code.md')],
    ];
    for (const [label, changes, expected] of steps) {
      test(label, async () => {
        try {
          await clean(fixture);
          for (const [path, content] of changes) await stage(fixture, path, content);
          assert.equal(await run('git commit -m x', fixture), expected);
        } finally {
          await clean(fixture);
        }
      });
    }

    test('a change under a .claude/CLAUDE.md directory draws no advice', async () => {
      const dir = await make('advice-dot-claude', { '.claude/CLAUDE.md': '# Dot\n' + 'x\n'.repeat(69) });
      await stage(dir, '.claude/x.txt', 'x\n');
      assert.equal(await run('git commit -m x', dir), '');
    });
  });

  describe('files the command itself stages', () => {
    const dir = () => join(base, 'stage-set');
    before(() => make('stage-set', {}));
    const steps = [
      ['add then commit', [['src/api/handler.ts', 'export const h = 2;\n']], 'git add src/api/handler.ts && git commit -m x', advise('.claude/rules/code.md, src/api/CLAUDE.md')],
      ['commit -a', [['src/api/handler.ts', 'export const h = 2;\n']], 'git commit -am x', advise('.claude/rules/code.md, src/api/CLAUDE.md')],
      ['commit with a path', [['src/api/handler.ts', 'export const h = 2;\n']], 'git commit src/api/handler.ts -m x', advise('.claude/rules/code.md, src/api/CLAUDE.md')],
      ['add -A with an untracked file', [['src/new.ts', 'export const n = 1;\n']], 'git add -A && git commit -m x', advise('.claude/rules/code.md')],
      ['commit with an untracked file and no add', [['src/new.ts', 'export const n = 1;\n']], 'git commit -m x', ''],
    ];
    for (const [label, changes, command, expected] of steps) {
      test(label, async () => {
        try {
          await clean(dir());
          for (const [path, content] of changes) write(dir(), path, content);
          assert.equal(await run(command, dir()), expected);
        } finally {
          await clean(dir());
        }
      });
    }
  });

  describe('never writes a file', () => {
    const status = (dir) => git(dir, 'status', '--porcelain=v1', '--ignored', '-uall');
    const unchanged = async (dir, command) => {
      const prior = { status: await status(dir), entries: readdirSync(base).sort() };
      const out = await run(command, dir);
      assert.deepEqual({ status: await status(dir), entries: readdirSync(base).sort() }, prior);
      return out;
    };
    test('a deny leaves the repository and the base as they were', async () => {
      assert.equal(await unchanged(broken, 'git commit -m x'), deny(brokenFinding));
    });
    test('advice leaves the repository and the base as they were', async () => {
      try {
        await stage(fixture, 'src/api/handler.ts', 'export const h = 2;\n');
        assert.equal(await unchanged(fixture, 'git commit -m x'), advise('.claude/rules/code.md, src/api/CLAUDE.md'));
      } finally {
        await clean(fixture);
      }
    });
  });

  // Acceptance item 101 against throwaway repositories: a clone whose upstream tracks AGENTS.md, with an untracked CLAUDE.md,
  // an untracked .claude/settings.local.json and a modified source file, mapped local in a configuration directory of its own.
  describe('staging check', { concurrency }, () => {
    const remote = 'https://example.invalid/team/app.git';
    let up, seqs = 0, config, broken;
    const slash = (p) => p.replaceAll('\\', '/');
    before(async () => {
      up = await repo('upstream', { 'AGENTS.md': '# Agents\n', 'src/a.ts': 'export const a = 1;\n', '.gitignore': 'node_modules/\n' });
      config = join(base, 'staging-config');
      write(config, 'reimagine-primer/store/map.json', JSON.stringify({
        version: 1,
        repos: [
          { remotes: ['example.invalid/team/app'], path: 'unused', group: 'app', profile: 'local', own: null },
          { remotes: ['example.invalid/team/site'], path: 'unused', group: 'site', profile: 'shared', own: true },
        ],
        roots: [],
      }));
      broken = join(base, 'broken-config');
      write(broken, 'reimagine-primer/config.json', '{');
    });
    const clone = async (url = remote) => {
      const dir = join(base, `clone-${++seqs}`);
      await git(base, 'clone', '-q', up, dir);
      await git(dir, 'remote', 'set-url', 'origin', url);
      write(dir, 'CLAUDE.md', '# Mine\n');
      write(dir, '.claude/settings.local.json', '{}\n');
      write(dir, 'src/a.ts', 'export const a = 2;\n');
      return dir;
    };
    const check = (command, cwd, extra = {}) => run(command, cwd, { ...extra, env: { CLAUDE_CONFIG_DIR: config, ...extra.env } });
    const lead = (dir) => `${slash(dir)} has the local profile, which keeps agent files out of its history; `;
    const unresolved = 'the command cannot be resolved, so it counts as staging every file git does not ignore; ';
    const both = '.claude/settings.local.json, CLAUDE.md, which refs/remotes/origin/HEAD does not hold';
    const decided = (out) => (out ? JSON.parse(out).hookSpecificOutput : {});

    test('staging and committing everything in one command is denied', async () => {
      const dir = await clone();
      assert.equal(await check('git add -A && git commit -m x', dir), deny(lead(dir) + 'the call would add ' + both));
    });
    test('an add and a commit in one command that both resolve are checked by what the two would add', async () => {
      const dir = await clone();
      assert.equal(await check('git add src/a.ts && git commit -m "$(cat <<\'EOF\'\nsubject\n\nbody\nEOF\n)"', dir), '');
      assert.equal(await check('git add src/a.ts && git commit -m x', dir), '');
      assert.equal(await check('git add CLAUDE.md && git commit -m x', dir), deny(lead(dir) + 'the call would add CLAUDE.md, which refs/remotes/origin/HEAD does not hold'));
      assert.equal(await check('git add src/a.ts && git add "$FILES"', dir), deny(lead(dir) + unresolved + 'the call would add ' + both));
      write(dir, '.gitignore', 'node_modules/\nCLAUDE.md\n');
      await git(dir, 'add', '.gitignore');
      write(dir, '.gitignore', 'node_modules/\nCLAUDE.md\n\n');
      assert.equal(await check('git add .gitignore && git commit -m x', dir), deny(lead(dir) + 'the call would add the line CLAUDE.md in .gitignore, which names an agent file'));
    });
    test('a merge, a cherry-pick, a rebase and an am are checked by the files their commits add', async () => {
      const dir = await clone(), patches = join(base, `patches-${seqs}`);
      await git(dir, 'checkout', '-q', '-b', 'feat');
      await git(dir, 'add', '-f', 'CLAUDE.md');
      await git(dir, 'commit', '-q', '-m', 'hub');
      const tip = (await git(dir, 'rev-parse', 'feat')).trim();
      await git(dir, 'format-patch', '-q', '-1', 'feat', '-o', patches);
      await git(dir, 'checkout', '-q', '-b', 'notes', 'main');
      write(dir, 'docs/notes.md', '# Notes\n');
      write(dir, 'AGENTS.md', '# Agents\n\nMore.\n');
      await git(dir, 'add', 'docs/notes.md', 'AGENTS.md');
      await git(dir, 'commit', '-q', '-m', 'notes');
      await git(dir, 'format-patch', '-q', '-1', 'notes', '-o', patches);
      await git(dir, 'checkout', '-q', '-b', 'later', 'feat');
      write(dir, 'src/later.ts', 'export const later = 1;\n');
      await git(dir, 'add', 'src/later.ts');
      await git(dir, 'commit', '-q', '-m', 'later');
      await git(dir, 'checkout', '-q', '-b', 'gone', 'main');
      write(dir, 'CLAUDE.md', '# Mine\n');
      await git(dir, 'add', '-f', 'CLAUDE.md');
      await git(dir, 'commit', '-q', '-m', 'hub in');
      await git(dir, 'rm', '-q', 'CLAUDE.md');
      await git(dir, 'commit', '-q', '-m', 'hub out');
      await git(dir, 'checkout', '-q', '-b', 'joined', 'main');
      await git(dir, 'merge', '-q', '--no-ff', '-m', 'join', 'gone');
      await git(dir, 'checkout', '-q', '-b', 'said', 'feat');
      write(dir, 'src/said.ts', 'export const said = 1;\n');
      await git(dir, 'add', 'src/said.ts');
      await git(dir, 'commit', '-q', '-m', 'said', '-m', 'copy to the new location');
      write(patches, 'all.mbox', await git(dir, 'format-patch', '--stdout', 'main..said'));
      await git(dir, 'checkout', '-q', '-b', 'lines', 'main');
      write(dir, '.gitignore', 'CLAUDE.md\n');
      await git(dir, 'add', '.gitignore');
      await git(dir, 'commit', '-q', '-m', 'lines');
      await git(dir, 'format-patch', '-q', '-1', 'lines', '-o', patches);
      await git(dir, 'checkout', '-q', 'main');
      write(patches, 'plain.patch', 'A text with no file header.\n');
      const reason = deny(lead(dir) + 'the call would add CLAUDE.md, which refs/remotes/origin/HEAD does not hold');
      const hub = slash(join(patches, '0001-hub.patch')), notes = slash(join(patches, '0001-notes.patch'));
      for (const command of ['git merge feat', 'git merge --no-ff -m "take it" notes feat', `git cherry-pick ${tip}`, 'git cherry-pick -x main..feat', 'git cherry-pick main..later', 'git rebase feat', 'git rebase --onto feat main',
        `git am ${hub}`, `git am -3 ${notes} ${hub}`, 'git stage src/a.ts && git merge feat', 'git merge gone', 'git rebase gone', `git am ${slash(join(patches, 'all.mbox'))}`,
        'git cherry-pick -m 1 feat', 'git cherry-pick --mainline=1 feat', 'git cherry-pick -m 1 main..joined', 'git cherry-pick -m 2 feat', 'git cherry-pick --mainline 2 feat', `cd ${slash(dir)} && git merge feat`]) {
        assert.equal(await check(command, dir), reason, command);
      }
      const line = deny(lead(dir) + 'the call would add the line CLAUDE.md in .gitignore, which names an agent file');
      for (const command of ['git merge lines', 'git cherry-pick lines', 'git rebase lines', `git am ${slash(join(patches, '0001-lines.patch'))}`, 'git merge -', 'git cherry-pick -']) assert.equal(await check(command, dir), line, command);
      for (const command of ['git merge notes', 'git merge', 'git cherry-pick notes', 'git rebase notes', `git am ${notes}`, 'git merge --abort', 'git rebase --continue', 'git cherry-pick --skip', 'git am --quit', 'git am --show-current-patch=diff', 'git merge-base main feat', 'git merge --help', 'git am -h', 'git cherry-pick -h', 'git rebase -Xignore-space-change notes']) {
        assert.equal(await check(command, dir), '', command);
      }
      const blind = (sub) => deny(lead(dir) + `what git ${sub} would bring in cannot be read from the command, so the call is denied; a commit named by a branch, a tag or an id, or a patch given as a file, can be read where each call before it in the command is a cd, a git add, a git commit, a git fetch, a checkout or a switch to a branch, or a call that only reads; an am, a --continue and a name read from the head after a switch, and FETCH_HEAD after a fetch, run as a command of their own`);
      for (const [sub, rest] of [['merge', '"$BRANCH"'], ['merge', 'no-such-branch'], ['cherry-pick', ''], ['rebase', '-x "npm test" notes'], ['rebase', "-x'npm test' notes"], ['rebase', '--exe "npm test" notes'], ['rebase', '-i notes'], ['rebase', '-ki notes'], ['rebase', '--interactive notes'], ['cherry-pick', '--onto --output=' + slash(join(patches, 'made.txt'))], ['am', ''], ['am', '--directory=sub ' + hub], ['am', slash(join(patches, 'none.patch'))], ['am', slash(join(patches, 'plain.patch'))], ['am', '--patch-format=mbox ' + hub]]) {
        assert.equal(await check(`git ${sub} ${rest}`.trim(), dir), blind(sub), `${sub} ${rest}`);
      }
      assert.equal(existsSync(join(patches, 'made.txt')), false);
      // A call that may move a branch, the index or a patch file before one of the four leaves it unread. A fetch rewrote FETCH_HEAD.
      await git(dir, 'fetch', '-q', '.', 'notes');
      for (const [command, sub] of [[`git reset -q && git am ${notes}`, 'am'], ['git branch -f tmp feat && git merge tmp', 'merge'], [`echo x > ${slash(join(patches, 'other.patch'))} && git am ${notes}`, 'am'], ['git merge --abort; git merge notes', 'merge'],
        ['git stash && git merge notes', 'merge'], ['git pull && git rebase notes', 'rebase'], ['git checkout no-such && git merge notes', 'merge'], ['git switch main && git merge -', 'merge'], ['git checkout -- src/a.ts && git merge notes', 'merge'],
        [`git diff main feat > ${slash(join(patches, 'made.patch'))} && git am ${notes}`, 'am'], [`git log --output=${slash(join(patches, 'made.txt'))} && git merge notes`, 'merge'], ['git fetch origin feat:tmp && git merge notes', 'merge'],
        ['echo "$(git branch -f tmp feat)" && git merge notes', 'merge'], ['git branch tmp feat && git merge notes', 'merge'], ['npm test && git merge notes', 'merge'],
        ['git switch -c topic && git merge', 'merge'], ['git switch main && git merge HEAD', 'merge'], [`git switch main && git am ${notes}`, 'am'], ['git switch main && git rebase --continue', 'rebase'],
        ['git fetch . feat && git merge FETCH_HEAD', 'merge'], ['X="$(git branch -f tmp feat)" git status && git merge notes', 'merge'], ['X="$(git branch -f tmp feat)" && git merge notes', 'merge'],
        ['./scripts/ls && git merge notes', 'merge'], ['git log "$OPTS" -1 && git merge notes', 'merge'],
        [`bash -c "cat ${hub}" > ${notes} && git am ${notes}`, 'am'], [`(cat ${hub}; cd .) > ${notes} && git am ${notes}`, 'am'], [`{ cat ${hub}; git add -A; } > ${notes} && git am ${notes}`, 'am'],
        ['git fetch -f --tags && git merge notes', 'merge'], ['git fetch origin tag v1 && git merge notes', 'merge'],
        ['git add "$(git branch -f tmp feat; echo f)" && git merge notes', 'merge'], ['cd "$(git branch -f tmp feat; echo .)" && git merge notes', 'merge'],
        ['git switch main && git switch -c t HEAD~1 && git merge notes', 'merge'], [`git log -p feat -1 > 1 && git am ${notes}`, 'am'],
        ['git switch -c topic origin/main && git merge --ff-only origin/main', 'merge'], ['git switch -c topic main && git merge feat', 'merge'], ['git switch main; git switch later; git merge feat', 'merge'],
        ['git checkout -B notes feat && git checkout main && git merge notes', 'merge'], ['git switch -c && git merge notes', 'merge']]) {
        assert.equal(await check(command, dir), blind(sub), command);
      }
      // A call that only reads, a fetch, and a checkout or a switch to a branch leave it read.
      for (const command of ['git status && git merge notes', 'git log --oneline -3 && git merge notes', 'git rev-parse HEAD && git merge notes', 'git diff --stat && git merge notes', 'git branch --show-current && git merge notes',
        'echo start && git merge notes', 'git status 2>/dev/null; git rebase notes', 'git status 2>&1 && git merge notes', 'git log --oneline | head -3 && git cherry-pick notes', `git status && git am ${notes}`, 'git fetch && git merge notes', 'git fetch origin && git rebase notes',
        'git checkout main && git merge notes', 'git switch main; git cherry-pick notes', 'git switch main && git merge --ff-only origin/main', 'git switch main && git merge']) {
        assert.equal(await check(command, dir), '', command);
      }
      assert.equal(await check('git status; git merge notes', dir, { tool: 'PowerShell' }), '');
      for (const command of ['git status && git merge feat', 'echo start && git rebase feat', 'git fetch origin && git merge feat', 'git switch main && git merge feat', `git log --oneline | head -3; git cherry-pick ${tip}`, `git rev-parse HEAD && git am ${hub}`]) {
        assert.equal(await check(command, dir), reason, command);
      }
      // After a switch the call is read against the branch switched to and against the head as it stands.
      await git(dir, 'checkout', '-q', 'later');
      assert.equal(await check('git merge feat', dir), '');
      assert.equal(await check('git switch main && git switch -c t HEAD~1 && git merge notes', dir), blind('merge'));
      for (const command of ['git switch main && git merge feat', 'git checkout main; git rebase feat', 'git switch main && cd src && git merge feat', 'git switch main && git -C src merge feat']) assert.equal(await check(command, dir), reason, command);
      // A branch that tracks another remote than the current branch's is read against the wrong upstream, so the call is unread.
      await git(dir, 'remote', 'add', 'other', 'https://example.invalid/team/app.git');
      await git(dir, 'config', 'branch.main.remote', 'other');
      assert.equal(await check('git switch main && git merge feat', dir), blind('merge'));
      await git(dir, 'config', 'branch.main.remote', 'origin');
      await git(dir, 'remote', 'remove', 'other');
      await git(dir, 'checkout', '-q', 'main');
      assert.equal(await check('git switch later && git merge feat', dir), reason);
      assert.equal(await check('git switch main && git merge lines', dir), line);
      // Where another call of the command cannot be resolved, the lines a merge adds to an ignore file still count.
      assert.equal(await check('git merge lines && git add "$F"', dir), deny(lead(dir) + unresolved
        + 'the call would add .claude/settings.local.json, which refs/remotes/origin/HEAD does not hold; the line CLAUDE.md in .gitignore, which names an agent file'));
      // A --continue commits the index.
      await git(dir, 'checkout', '-q', 'feat', '--', 'CLAUDE.md');
      for (const command of ['git merge --continue', 'git cherry-pick --continue', 'git rebase --continue', 'git am --resolved', 'git am -r']) assert.equal(await check(command, dir), reason, command);
      for (const command of ['git merge --abort', 'git am --skip']) assert.equal(await check(command, dir), '', command);
    });
    test('a variable set to a plain text before any other call is followed, and one the command may change is not', async () => {
      const dir = await clone(), other = await clone();
      await git(dir, 'checkout', '-q', '-b', 'feat');
      await git(dir, 'add', '-f', 'CLAUDE.md');
      await git(dir, 'commit', '-q', '-m', 'hub');
      await git(dir, 'checkout', '-q', '-b', 'notes', 'main');
      write(dir, 'docs/notes.md', '# Notes\n');
      await git(dir, 'add', 'docs/notes.md');
      await git(dir, 'commit', '-q', '-m', 'notes');
      await git(dir, 'checkout', '-q', 'main');
      const at = slash(dir), reason = deny(lead(dir) + 'the call would add CLAUDE.md, which refs/remotes/origin/HEAD does not hold');
      const blind = deny(lead(other) + 'what git merge would bring in cannot be read from the command, so the call is denied; a commit named by a branch, a tag or an id, or a patch given as a file, can be read where each call before it in the command is a cd, a git add, a git commit, a git fetch, a checkout or a switch to a branch, or a call that only reads; an am, a --continue and a name read from the head after a switch, and FETCH_HEAD after a fetch, run as a command of their own');
      // The session is in another local repository, which holds neither branch: a merge read there is unread.
      for (const command of [`R=${at}; git -C "$R" merge notes`, `R="${at}"\ngit -C $R merge notes`, `R=${at}; B=notes; git -C "\${R}" merge "$B"`, `R=${at}; cd "$R" && git merge notes`]) assert.equal(await check(command, other), '', command);
      for (const command of [`$r='${at}'; git -C $r merge notes`, `$r = "${at}"; git -C $R merge notes`, `$r = '${at}'\nSet-Location $r\ngit merge notes`]) assert.equal(await check(command, other, { tool: 'PowerShell' }), '', command);
      assert.equal(await check(`R=${at}; git -C "$R" merge feat`, other), reason);
      assert.equal(await check(`$r = '${at}'; git -C $r merge feat`, other, { tool: 'PowerShell' }), reason);
      write(dir, 'CLAUDE.md', '# Mine\n');
      assert.equal(await check(`R=${at}; git -C "$R" add CLAUDE.md`, base), reason);
      for (const command of [`R=${at}; R=.; git -C "$R" merge notes`, `R=${at}; read R; git -C "$R" merge notes`, `R=${at}; git -C "$R/." merge notes`, `R=${at} git -C "$R" merge notes`, `cd . && R=${at}; git -C "$R" merge notes`,
        `R="${at}$X"; git -C "$R" merge notes`, `R=${at}; (R=.); git -C "$R" merge notes`, `R=${at}; bash -c 'R=.'; git -C "$R" merge notes`, `R=${at}; for R in .; do :; done; git -C "$R" merge notes`]) assert.equal(await check(command, other), blind, command);
      for (const command of [`$r = Get-Location; git -C $r merge notes`, `$r='${at}'; $R = '.'; git -C $r merge notes`, `$r='${at}'; set r .; git -C $r merge notes`, `$r='${at}'; git -C "$r\\." merge notes`,
        `$r="${at}$x"; git -C $r merge notes`, `$r='${at}'; foreach ($r in '.') { }; git -C $r merge notes`]) assert.equal(await check(command, other, { tool: 'PowerShell' }), blind, command);
      // An add is not denied by an earlier call the check does not know, so these show that the name is not followed.
      const unread = deny(lead(other) + unresolved + 'the call would add ' + both);
      for (const command of [`R=${at}; read R; git -C "$R" add -f CLAUDE.md`, `IFS=:; R=${at}; git -C "$R" add -f CLAUDE.md`, `R=${at}; source ./env.sh; git -C "$R" add -f CLAUDE.md`, `R=${at}; for R in .; do :; done; git -C "$R" add -f CLAUDE.md`,
        `R=${at} & git -C "$R" add -f CLAUDE.md`, `R=${at} | git -C "$R" add -f CLAUDE.md`, 'R=`cat .target`; git -C "$R" add -f CLAUDE.md', `R=(${at}); git -C "$R" add -f CLAUDE.md`,
        `A=${at}; AB=.; git -C "$A"B add -f CLAUDE.md`,
        `PWD=${at}; cd .; git -C "$PWD" add -f CLAUDE.md`, `R='~'; git -C "$R" add -f CLAUDE.md`]) assert.equal(await check(command, other), unread, command);
      for (const command of [`$r='${at}'; set r .; git -C $r add -f CLAUDE.md`, `$r='${at}'; . ./env.ps1; git -C $r add -f CLAUDE.md`]) assert.equal(await check(command, other, { tool: 'PowerShell' }), unread, command);
    });
    test('a merge is read after cut, set, Select-Object and Get-Content', async () => {
      const dir = await clone();
      await git(dir, 'checkout', '-q', '-b', 'feat');
      await git(dir, 'add', '-f', 'CLAUDE.md');
      await git(dir, 'commit', '-q', '-m', 'hub');
      await git(dir, 'checkout', '-q', '-b', 'notes', 'main');
      write(dir, 'docs/notes.md', '# Notes\n');
      await git(dir, 'add', 'docs/notes.md');
      await git(dir, 'commit', '-q', '-m', 'notes');
      await git(dir, 'checkout', '-q', 'main');
      const reason = deny(lead(dir) + 'the call would add CLAUDE.md, which refs/remotes/origin/HEAD does not hold');
      for (const [command, tool] of [['git log --oneline | cut -c1-20; git merge notes', 'Bash'], ['set -e; git merge notes', 'Bash'], ['git log --oneline | Select-Object -First 3; git merge notes', 'PowerShell'], ['Get-Content README.md; git merge notes', 'PowerShell']]) {
        assert.equal(await check(command, dir, { tool }), '', command);
        assert.equal(await check(command.replace('notes', 'feat'), dir, { tool }), reason, command);
      }
      // In PowerShell set writes a variable.
      assert.equal(decided(await check('set r x; git merge notes', dir, { tool: 'PowerShell' })).permissionDecision, 'deny');
    });
    test('after a call, an agent file its commit added is said, and one a remote holds is not', async () => {
      const dir = await clone(), after = (command) => check(command, dir, { event: 'PostToolUse' });
      const command = 'node make-notes.js && git add -A && git commit -m x';
      assert.equal(await check(command.replace('add -A', 'add src'), dir), '');
      assert.equal(await after(command), '');
      await git(dir, 'add', 'src/a.ts');
      await git(dir, 'commit', '-q', '-m', 'a');
      assert.equal(await after(command), '');
      await git(dir, 'add', '-f', 'CLAUDE.md', '.claude/settings.local.json');
      await git(dir, 'commit', '-q', '-m', 'x');
      const id = (await git(dir, 'rev-parse', '--short', 'HEAD')).trim();
      const said = JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: `primer: ${slash(dir)} has the local profile, which keeps agent files out of its history; commit ${id} adds .claude/settings.local.json, CLAUDE.md, which refs/remotes/origin/HEAD does not hold; the check before a call reads the work tree as it stands then, so it does not see a file the call itself makes; no remote holds the commit yet` } }) + '\n';
      for (const c of [command, 'git commit -m x', 'git merge notes', `git -C ${slash(dir)} commit -m x`]) assert.equal(await after(c), said, c);
      // A command that only stages or only reads makes no commit, and outside a local repository nothing is read.
      for (const c of ['git add src/a.ts', 'git log --grep commit', 'npm test']) assert.equal(await after(c), '', c);
      assert.equal(await check(command, dir, { event: 'PostToolUse', env: { CLAUDE_CONFIG_DIR: join(base, 'no-such-config') } }), '');
      // A remote-tracking ref other than the upstream's holds the commit, so only a command that pushes is read against the upstream alone.
      await git(dir, 'update-ref', 'refs/remotes/origin/topic', 'HEAD');
      assert.equal(await after(command), '');
      const pushed = JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: `primer: ${slash(dir)} has the local profile, which keeps agent files out of its history; commit ${id} adds .claude/settings.local.json, CLAUDE.md, which refs/remotes/origin/HEAD does not hold; the check before a call reads the work tree as it stands then, so it does not see a file the call itself makes; the command pushes, so a remote may already hold the commit` } }) + '\n';
      assert.equal(await after(command + ' && git push'), pushed);
      await git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
      assert.equal(await after(command), '');
    });
    test('after a call, a merge is read against its first parent and the hook\'s directory is read after the call\'s own cd', async () => {
      const notice = (dir, id, name) => JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: `primer: ${slash(dir)} has the local profile, which keeps agent files out of its history; commit ${id} adds ${name}, which refs/remotes/origin/HEAD does not hold; the check before a call reads the work tree as it stands then, so it does not see a file the call itself makes; no remote holds the commit yet` } }) + '\n';
      const joined = await clone();
      write(joined, '.mcp.json', '{}\n');
      await git(joined, 'add', '-f', '.mcp.json');
      await git(joined, 'commit', '-q', '-m', 'mcp');
      const mcp = (await git(joined, 'rev-parse', '--short', 'HEAD')).trim();
      await git(joined, 'checkout', '-q', '-b', 'side', 'origin/main');
      write(joined, 'docs/side.md', '# Side\n');
      await git(joined, 'add', 'docs/side.md');
      await git(joined, 'commit', '-q', '-m', 'side');
      await git(joined, 'checkout', '-q', 'main');
      await git(joined, 'merge', '-q', '--no-ff', '-m', 'join', 'side');
      assert.equal(await check('git merge side', joined, { event: 'PostToolUse' }), notice(joined, mcp, '.mcp.json'));
      const dir = await clone();
      await git(dir, 'add', '-f', 'CLAUDE.md');
      await git(dir, 'commit', '-q', '-m', 'hub');
      const hub = (await git(dir, 'rev-parse', '--short', 'HEAD')).trim();
      assert.equal(await check('cd .. && git commit -m x', dir, { event: 'PostToolUse' }), notice(dir, hub, 'CLAUDE.md'));
    });
    test('a push where the default-branch ref is unknown is read with no exclusion', async () => {
      const dir = await clone();
      await git(dir, 'add', '-f', 'CLAUDE.md');
      await git(dir, 'commit', '-q', '-m', 'hub');
      const id = (await git(dir, 'rev-parse', '--short', 'HEAD')).trim(), first = (await git(dir, 'rev-parse', '--short', 'HEAD~1')).trim();
      await git(dir, 'update-ref', 'refs/remotes/origin/topic', 'HEAD');
      await git(dir, 'symbolic-ref', '-d', 'refs/remotes/origin/HEAD');
      // With no tree to compare against, the commit that put AGENTS.md in the history is named too.
      const said = JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: `primer: ${slash(dir)} has the local profile, which keeps agent files out of its history; commit ${id} adds CLAUDE.md; commit ${first} adds AGENTS.md, while the upstream's tree is unknown (refs/remotes/origin/HEAD cannot be read); the check before a call reads the work tree as it stands then, so it does not see a file the call itself makes; the command pushes, so a remote may already hold these commits` } }) + '\n';
      assert.equal(await check('git commit -m x && git push', dir, { event: 'PostToolUse' }), said);
      assert.equal(await check('git commit -m x', dir, { event: 'PostToolUse' }), '');
    });
    test('staging CLAUDE.md by name is denied', async () => {
      const dir = await clone();
      assert.equal(await check('git add CLAUDE.md', dir), deny(lead(dir) + 'the call would add CLAUDE.md, which refs/remotes/origin/HEAD does not hold'));
    });
    test('staging CLAUDE.md through the PowerShell tool is denied', async () => {
      const dir = await clone();
      assert.equal(await check('git add CLAUDE.md', dir, { tool: 'PowerShell' }), deny(lead(dir) + 'the call would add CLAUDE.md, which refs/remotes/origin/HEAD does not hold'));
    });
    test('staging CLAUDE.md with git -C from a directory outside the repository is denied', async () => {
      const dir = await clone();
      assert.equal(await check(`git -C ${slash(dir)} add CLAUDE.md`, base), deny(lead(dir) + 'the call would add CLAUDE.md, which refs/remotes/origin/HEAD does not hold'));
    });
    test('a change to AGENTS.md, which the upstream tracks, passes staged and committed', async () => {
      const dir = await clone();
      write(dir, 'AGENTS.md', '# Agents\n\nMore.\n');
      assert.equal(await check('git add AGENTS.md', dir), '');
      assert.equal(await check('git commit AGENTS.md -m x', dir), '');
      await git(dir, 'add', 'AGENTS.md');
      assert.equal(await check('git commit -m x', dir), '');
    });
    test('a .gitignore line that names CLAUDE.md is denied staged and committed', async () => {
      const dir = await clone();
      write(dir, '.gitignore', 'node_modules/\nCLAUDE.md\n');
      const reason = lead(dir) + 'the call would add the line CLAUDE.md in .gitignore, which names an agent file';
      assert.equal(await check('git add .gitignore', dir), deny(reason));
      assert.equal(await check('git commit -a -m x', dir), deny(reason));
      await git(dir, 'add', '.gitignore');
      assert.equal(await check('git commit -m x', dir), deny(reason));
    });
    test('the source file alone passes staged and committed', async () => {
      const dir = await clone();
      assert.equal(await check('git add src/a.ts', dir), '');
      assert.equal(await check('git commit src/a.ts -m x', dir), '');
      assert.equal(await check('git commit -am x', dir), '');
    });
    test('with the agent files in info/exclude, staging and committing everything in one command passes', async () => {
      const dir = await clone();
      write(dir, '.git/info/exclude', 'CLAUDE.md\nCLAUDE.local.md\nAGENTS.md\n.claude/\n.agents/\n.reimagine/\n.reimagine.json\n.mcp.json\n');
      assert.equal(await check('git add -A && git commit -m x', dir), '');
    });
    test('an add whose options the script cannot resolve is taken to stage every file git does not ignore', async () => {
      const dir = await clone();
      for (const command of ['git add -p src/a.ts', 'git add -e src/a.ts', 'git add --pathspec-from-file=list', 'git add "$FILES"', 'cd "$DIR" && git add src/a.ts', 'git add nomatch']) {
        assert.equal(await check(command, dir), deny(lead(dir) + unresolved + 'the call would add ' + both), command);
      }
    });
    test('an upstream tree that cannot be read denies an agent file and says the tree is unknown', async () => {
      const dir = await clone();
      await git(dir, 'remote', 'set-head', 'origin', '-d');
      assert.equal(await check('git add CLAUDE.md', dir),
        deny(lead(dir) + "the call would add CLAUDE.md, while the upstream's tree is unknown (refs/remotes/origin/HEAD cannot be read)"));
      assert.equal(await check('git add src/a.ts', dir), '');
    });
    test('a repository the map gives the shared profile, or none, passes', async () => {
      assert.equal(await check('git add CLAUDE.md', await clone('https://example.invalid/team/site.git')), '');
      assert.equal(await check('git add CLAUDE.md', await clone('https://example.invalid/team/other.git')), '');
    });
    test('the configuration directory is found from the transcript path first', async () => {
      const dir = await clone();
      const input = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git add CLAUDE.md' }, cwd: dir, transcript_path: join(config, 'projects', 'key', 'session.jsonl') });
      assert.equal(await hook(input), deny(lead(dir) + 'the call would add CLAUDE.md, which refs/remotes/origin/HEAD does not hold'));
    });
    test('a staging check that fails denies the call', async () => {
      const dir = await clone();
      assert.equal(await check('git add -A && git commit -m x', dir, { env: { CLAUDE_CONFIG_DIR: broken } }),
        deny(`the staging check failed, so the call is denied: ${join(broken, 'reimagine-primer', 'config.json').replaceAll('\\', '\\\\')} is not a primer configuration`));
    });
    test('a script of the plugin that cannot be loaded denies a command whose text the staging check would look at, where primer\'s own directory exists', async () => {
      const copy = join(base, 'plugin-copy');
      cpSync(join(root, 'plugins/primer/hooks'), join(copy, 'hooks'), { recursive: true });
      cpSync(join(root, 'plugins/primer/scripts'), join(copy, 'scripts'), { recursive: true });
      writeFileSync(join(copy, 'scripts', 'staged.mjs'), 'export const deny = ;\n');
      const at = async (command, more = {}, extraEnv = {}) => {
        const r = await exec(process.execPath, [join(copy, 'hooks', 'drift.mjs')], { cwd: root, env: { ...env, ...extraEnv } }, JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd: fixture, ...more }));
        assert.equal(r.status, 0, r.stderr);
        return r.stdout;
      };
      const denied = (out, command) => {
        const said = JSON.parse(out).hookSpecificOutput;
        assert.equal(said.permissionDecision, 'deny', command);
        assert.match(said.permissionDecisionReason, /^primer: the staging check cannot be loaded, so the call is denied: \S/, command);
      };
      // A text that only looks like one of the calls is denied too, since the script that would tell them apart is the one that did not load.
      for (const command of ['git commit -m x', 'git add -A', 'git merge feat', 'git log --grep address']) denied(await at(command, {}, { CLAUDE_CONFIG_DIR: config }), command);
      denied(await at('git commit -m x', { transcript_path: join(config, 'projects', 'key', 'session.jsonl') }), 'by the transcript path');
      for (const command of ['git status', 'npm test']) assert.equal(await at(command, {}, { CLAUDE_CONFIG_DIR: config }), '', command);
      assert.equal(await at('git commit -m x'), '', 'without primer\'s own directory');
    });
    test('without primer\'s own directory the staging check does not run', async () => {
      const dir = await clone();
      assert.equal(await check('git add CLAUDE.md', dir, { env: { CLAUDE_CONFIG_DIR: join(base, 'no-config') } }), '');
    });
    test('a repository whose hub has the marker and that the map does not give the local profile gets the drift check alone', async () => {
      assert.equal(await check('git add -A && git commit -m x', fixture), '');
      assert.equal(await check('git add -A && git commit -m x', brokenPath), deny(brokenFinding));
    });
    test('a local repository whose hub carries the marker still gets the staging check', async () => {
      const dir = await clone();
      write(dir, 'CLAUDE.md', '<!-- primer -->\n# Mine\n');
      assert.equal(await check('git add CLAUDE.md', dir), deny(lead(dir) + 'the call would add CLAUDE.md, which refs/remotes/origin/HEAD does not hold'));
    });
    test('a cd into a local repository is followed from outside any repository and from a repository whose hub has the marker', async () => {
      const dir = await clone();
      const reason = deny(lead(dir) + 'the call would add CLAUDE.md, which refs/remotes/origin/HEAD does not hold');
      assert.equal(await check(`cd ${slash(dir)} && git add CLAUDE.md`, base), reason);
      assert.equal(await check(`cd ${slash(dir)} && git add CLAUDE.md`, fixture), reason);
    });
    test('git stage, env -C before a shell and Push-Location are read as the add they run', async () => {
      const dir = await clone();
      const reason = deny(lead(dir) + 'the call would add CLAUDE.md, which refs/remotes/origin/HEAD does not hold');
      assert.equal(await check('git stage CLAUDE.md', dir), reason);
      assert.equal(await check('echo `git add CLAUDE.md`', dir), reason);
      assert.equal(await check(`env -C ${slash(dir)} sh -c 'git add CLAUDE.md'`, base), reason);
      assert.equal(await check(`Push-Location ${slash(dir)}; git add CLAUDE.md`, base, { tool: 'PowerShell' }), reason);
    });
    test('a form that hides what is staged or where counts as staging every file git does not ignore', async () => {
      const dir = await clone();
      for (const command of ['git ls-files -o | xargs git add', 'GIT_DIR=.git git add src/a.ts', "git commit -a -F - <<'EOF'\nmsg\nEOF"]) {
        assert.equal(await check(command, dir), deny(lead(dir) + unresolved + 'the call would add ' + both), command);
      }
      for (const command of [`GIT_DIR=${slash(dir)}/.git GIT_WORK_TREE=${slash(dir)} git add CLAUDE.md`, `git --git-dir=${slash(dir)}/.git --work-tree=${slash(dir)} add CLAUDE.md`]) {
        assert.equal(await check(command, base), deny(lead(dir) + unresolved + 'the call would add ' + both), command);
      }
    });
    test('a forced add of an agent file git ignores is counted beside a commit in the same command', async () => {
      const dir = await clone();
      write(dir, '.git/info/exclude', 'CLAUDE.md\nCLAUDE.local.md\nAGENTS.md\n.claude/\n.agents/\n.reimagine/\n.reimagine.json\n.mcp.json\n');
      assert.equal(await check('git add -f CLAUDE.md && git commit -m x', dir), deny(lead(dir) + 'the call would add CLAUDE.md, which refs/remotes/origin/HEAD does not hold'));
      assert.equal(await check('git add -f CLAUDE.md && git add "$FILES"', dir), deny(lead(dir) + unresolved + 'the call would add CLAUDE.md, which refs/remotes/origin/HEAD does not hold'));
    });
    test('a brace expansion among the paths of an add leaves it unresolved, and a brace that stands alone groups commands', async () => {
      const dir = await clone();
      assert.equal(await check('git add -f {CLAUDE,AGENTS}.md', dir), deny(lead(dir) + unresolved + 'the call would add ' + both));
      assert.equal(await check('{ git add src/a.ts; }', dir), '');
    });
    test('a Git Bash drive path is followed on Windows', { skip: process.platform !== 'win32' }, async () => {
      const dir = await clone();
      const msys = `/${dir[0].toLowerCase()}${slash(dir).slice(2)}`;
      const reason = deny(lead(dir) + 'the call would add CLAUDE.md, which refs/remotes/origin/HEAD does not hold');
      assert.equal(await check(`cd ${msys} && git add CLAUDE.md`, base), reason);
      assert.equal(await check(`git -C ${msys} add CLAUDE.md`, base), reason);
    });
    test('a directory the script cannot follow has every local repository of the map checked', async () => {
      const dir = await clone();
      const far = join(base, 'far-config');
      write(far, 'reimagine-primer/store/map.json', JSON.stringify({ version: 1, repos: [{ remotes: [], path: slash(dir), group: 'app', profile: 'local', own: null }], roots: [] }));
      const reason = deny(lead(dir) + unresolved + 'the call would add ' + both);
      assert.equal(await check('cd "$APP" && git add CLAUDE.md', fixture, { env: { CLAUDE_CONFIG_DIR: far } }), reason);
      assert.equal(await check(`cd ${slash(join(base, 'no-such-directory'))} && git add src/a.ts`, fixture, { env: { CLAUDE_CONFIG_DIR: far } }), reason);
      assert.equal(await check('bash -c "cd $APP && git add -A"', fixture, { env: { CLAUDE_CONFIG_DIR: far } }), reason);
    });
    test('a command that stages and commits nothing passes, whatever in it cannot be resolved', async () => {
      const dir = await clone();
      for (const command of ["gh pr create --body-file - <<'EOF'\nthis commit fixes the hook\nEOF", 'cd "$D" && npm test # before the commit', 'echo "$(git log -1)" # last commit']) {
        assert.equal(await check(command, dir), '', command);
      }
    });
    test('git named in capitals still reaches the check', async () => {
      const dir = await clone();
      assert.equal(await check('GIT add CLAUDE.md', dir), deny(lead(dir) + 'the call would add CLAUDE.md, which refs/remotes/origin/HEAD does not hold'));
    });
    test('a commit that only takes an agent file out of the index passes', async () => {
      const dir = await clone();
      await git(dir, 'add', 'CLAUDE.md');
      await git(dir, 'commit', '-q', '-m', 'add');
      await git(dir, 'rm', '-q', '--cached', 'CLAUDE.md');
      assert.equal(await check('git commit -m x', dir), '');
    });
    test('a commit message that names git inside a here-document leaves the command resolved', async () => {
      const dir = await clone();
      await git(dir, 'add', 'src/a.ts');
      assert.equal(await check('git commit -m "$(cat <<\'EOF\'\nfix the git hook path\nEOF\n)"', dir), '');
    });
    test('an agent file staged and then deleted from the work tree still counts', async () => {
      const dir = await clone();
      await git(dir, 'add', '.claude/settings.local.json');
      rmSync(join(dir, '.claude/settings.local.json'));
      assert.equal(await check('git add src && git commit -m x', dir), deny(lead(dir) + 'the call would add .claude/settings.local.json, which refs/remotes/origin/HEAD does not hold'));
    });
    test('a map that cannot be read denies a git add or commit, naming the map, and passes any other command', async () => {
      const dir = await clone();
      const bad = join(base, 'bad-map-config');
      write(bad, 'reimagine-primer/store/map.json', '{');
      const reason = `primer: ${join(bad, 'reimagine-primer', 'store', 'map.json')} is not a primer map, so the staging check cannot tell which repositories have the local profile `
        + 'and denies every git add and git commit, and each git merge, cherry-pick, rebase and am that starts or continues one; restore the file from a copy or from the store\'s history, or correct it to the form primer map writes';
      for (const command of ['git commit -m x', 'git add src/a.ts', 'git merge feat', 'git rebase --continue']) {
        assert.deepEqual(decided(await check(command, dir, { env: { CLAUDE_CONFIG_DIR: bad } })), { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason }, command);
      }
      for (const command of ['git log --grep commit', 'echo "a commit note" > notes.txt', 'git merge --abort', 'git rebase --skip', 'git am --help']) {
        assert.equal(await check(command, dir, { env: { CLAUDE_CONFIG_DIR: bad } }), '', command);
      }
    });
    test('a PowerShell here-string message with an apostrophe leaves the commit resolved', async () => {
      const dir = await clone();
      await git(dir, 'add', 'src/a.ts');
      for (const command of ["git commit -m @'\nfix: don't drop the map\n'@", 'git commit -m @"\nfix: don\'t drop the map\n"@']) {
        assert.equal(await check(command, dir, { tool: 'PowerShell' }), '', command);
      }
      assert.equal(await check('git commit -m @"\n$(git add -A)\n"@', dir, { tool: 'PowerShell' }), deny(lead(dir) + unresolved + 'the call would add ' + both));
      await git(dir, 'add', 'CLAUDE.md');
      assert.equal(await check("git commit -m @'\nfix: don't and won't\n'@", dir, { tool: 'PowerShell' }),
        deny(lead(dir) + 'the call would add CLAUDE.md, which refs/remotes/origin/HEAD does not hold'));
    });
    test('a PowerShell here-string that runs no git command passes, apostrophe and all', async () => {
      const dir = await clone();
      assert.equal(await check("Set-Content notes.txt @'\nit's a commit note\n'@", dir, { tool: 'PowerShell' }), '');
    });
    test('a here-string whose text may run, or that PowerShell reads another way, leaves the command unresolved', async () => {
      const dir = await clone();
      await git(dir, 'add', 'src/a.ts');
      const reason = deny(lead(dir) + unresolved + 'the call would add ' + both);
      for (const command of [
        "@'\ngit add -A\ngit commit -m \"fix: don't drop\"\n'@ | sh",
        'git commit -m @"\nmsg $(& "git" add -A)\n"@',
        "git commit -m @'\nfix: don't\n'@CLAUDE.md",
        "$m=@'\nfix: don't drop the map\n'@\ngit add -A\ngit commit -m @'\nwon't happen\n'@",
        "echo x,@'\nit's\n'@; git add -A; git commit -m y # don't",
        "Write-Output $m=@'\nit's\ngit add -A\n'@ # '",
        "& $m=@'\nit's\ngit add -A\n'@ # '",
        "Write-Output @'\ngit add -A\n'@ | sh",
        "$m = @'\n# it's\ngit add -A\n'@; $m | sh",
        "@'\n# it's\ngit \\\nadd -A\n'@ | sh",
        "pwsh -c @'\n# it's\ngit `\nadd -A\n'@",
      ]) assert.equal(await check(command, dir, { tool: 'PowerShell' }), reason, command);
    });
    test('a here-string handed to a git call the script reads is its message, whatever it names', async () => {
      const dir = await clone();
      await git(dir, 'add', 'src/a.ts');
      assert.equal(await check("git commit -m @'\nfix: run git add before the build, don't skip it\n'@", dir, { tool: 'PowerShell' }), '');
    });
    test('a command handed to PowerShell or cmd that names an add or a commit counts as one out of sight', async () => {
      const dir = await clone();
      const reason = deny(lead(dir) + unresolved + 'the call would add ' + both);
      for (const command of ['pwsh -NoProfile -c "git add -A"', 'powershell.exe -Command "git commit -am x"', 'cmd /c git add -A']) {
        assert.equal(await check(command, dir), reason, command);
      }
      assert.equal(await check('pwsh -c "Get-Content commit.txt"', dir), '');
    });
    test('the word commit outside the command does not bring an unreadable command to the check', async () => {
      const dir = await clone();
      assert.equal(await check("printf %s 'x", dir, { description: 'commit the notes' }), '');
    });
    test('a commit whose pathspecs git does not know counts as staging every file git does not ignore', async () => {
      const dir = await clone();
      await git(dir, 'add', 'CLAUDE.md');
      for (const command of ['git commit -m x -- nomatch', 'git commit -m fix: and more']) {
        assert.equal(await check(command, dir), deny(lead(dir) + unresolved + 'the call would add ' + both), command);
      }
    });
    test('a commit of a known path with nothing to commit passes beside an untracked agent file', async () => {
      const dir = await clone();
      assert.equal(await check('git commit AGENTS.md -m x', dir), '');
    });
    test('an agent file name in another letter case is denied where core.ignorecase is false too', async () => {
      const dir = await clone();
      write(dir, '.git/info/exclude', 'CLAUDE.md\n.claude/\n');
      rmSync(join(dir, 'CLAUDE.md'));
      write(dir, 'claude.md', '# Mine\n');
      await git(dir, 'config', 'core.ignorecase', 'false');
      assert.equal(await check('git add claude.md', dir), deny(lead(dir) + 'the call would add claude.md, which refs/remotes/origin/HEAD does not hold'));
      write(dir, '.gitignore', 'node_modules/\nClaude.md\n');
      assert.equal(await check('git add .gitignore', dir), deny(lead(dir) + 'the call would add the line Claude.md in .gitignore, which names an agent file'));
    });
    test('the check leaves the index and the work tree byte for byte as they were', async () => {
      const dir = await clone();
      write(dir, '.gitignore', 'node_modules/\nCLAUDE.md\n');
      await git(dir, 'add', 'src/a.ts');
      write(dir, 'src/a.ts', 'export const a = 3;\n');
      const snapshot = async () => ({
        index: readFileSync(join(dir, '.git/index')).toString('base64'),
        status: await git(dir, '--no-optional-locks', 'status', '--porcelain=v1', '--ignored', '-uall'),
        files: ['CLAUDE.md', '.claude/settings.local.json', 'src/a.ts', '.gitignore', 'AGENTS.md'].map((f) => readFileSync(join(dir, f), 'utf8')),
      });
      const prior = await snapshot();
      for (const command of ['git commit -m x', 'git commit -a -m x', 'git commit src/a.ts -m x', 'git commit -i src/a.ts -m x', 'git commit --amend -a -m x', 'git add -A', 'git add -u', 'git add -p', 'git add -A && git commit -m x']) {
        await check(command, dir);
        assert.deepEqual(await snapshot(), prior, command);
      }
    });
  });
});

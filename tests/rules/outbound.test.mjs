// The outbound check. The script runs as the host runs it, a process given the hook's input on stdin, on temporary
// directories set through CLAUDE_CONFIG_DIR and home, with real git, an isolated git environment and a local bare remote,
// so no test reads the real configuration or reaches a forge.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, parseList } from '../../plugins/rules/scripts/outbound.mjs';

const SCRIPT = fileURLToPath(new URL('../../plugins/rules/scripts/outbound.mjs', import.meta.url));
const dirs = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

// Commits made at a fixed time by a fixed author, so their short ids are literals.
const WHO = { GIT_AUTHOR_NAME: 'fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_AUTHOR_DATE: '2026-11-01T12:00:00Z',
  GIT_COMMITTER_NAME: 'fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_DATE: '2026-11-01T12:00:00Z' };

function world() {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'rules-outbound-')));
  dirs.push(root);
  const w = { root, config: join(root, 'config'), home: join(root, 'home'), work: join(root, 'work') };
  for (const d of [w.config, w.home, w.work]) mkdirSync(d);
  const gitConfig = join(root, 'empty.gitconfig');
  writeFileSync(gitConfig, '');
  w.env = { ...process.env, ...WHO, CLAUDE_CONFIG_DIR: w.config, HOME: w.home, USERPROFILE: w.home,
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: gitConfig, GIT_CEILING_DIRECTORIES: root };
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_PREFIX', 'GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT']) delete w.env[k];
  w.listFile = join(w.config, 'rules-outbound.txt');
  w.list = (...lines) => writeFileSync(w.listFile, lines.map((l) => `${l}\n`).join(''));
  w.git = (cwd, ...args) => execFileSync('git', ['-c', 'init.defaultBranch=main', '-c', 'core.autocrlf=false', '-c', 'commit.gpgsign=false', ...args],
    { cwd, env: w.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  // stdin is the hook input as an object, or a raw string.
  w.run = (input) => {
    const r = spawnSync(process.execPath, [SCRIPT], { input: typeof input === 'string' ? input : JSON.stringify(input), env: w.env, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stderr, '');
    if (r.stdout === '') return { decision: 'none' };
    assert.equal(r.stdout.endsWith('\n') && r.stdout.indexOf('\n') === r.stdout.length - 1, true, r.stdout);
    const out = JSON.parse(r.stdout).hookSpecificOutput;
    assert.equal(out.hookEventName, 'PreToolUse');
    return out.permissionDecision ? { decision: out.permissionDecision, reason: out.permissionDecisionReason } : { decision: 'warn', reason: out.additionalContext };
  };
  w.shell = (command, tool = 'Bash', cwd = w.work) => w.run({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: { command }, cwd });
  return w;
}

// A denial names the string, where it was found and the list file.
const denied = (r, string, where, w) => {
  assert.equal(r.decision, 'deny', JSON.stringify(r));
  for (const part of [`"${string}"`, where, w.listFile]) assert.ok(r.reason.includes(part), `${r.reason} lacks ${part}`);
};
const none = (r) => assert.deepEqual(r, { decision: 'none' });

// A repository in work with a bare remote beside it, its main pushed once with an empty commit.
function repo(w, name = 'repo') {
  const dir = join(w.root, name), bare = join(w.root, `${name}.git`);
  w.git(w.root, 'init', '-q', '--bare', bare);
  w.git(w.root, 'init', '-q', dir);
  w.git(dir, 'remote', 'add', 'origin', bare);
  w.git(dir, 'commit', '-q', '--allow-empty', '-m', 'start');
  w.git(dir, 'push', '-q', '-u', 'origin', 'main');
  return dir;
}

const HEREDOC = (line) => `git commit --allow-empty -m "$(cat <<'EOF'\n${line}\n\nsecond paragraph with "double" and 'single' quotes\nEOF\n)"`;
const HERESTRING = (line) => `git commit --allow-empty -m @'\n${line}\n\nsecond paragraph with "double" quotes\n'@`;

test('R405: with no list file nothing is denied and nothing is printed, whatever stdin holds', () => {
  const w = world();
  none(w.shell('git commit -m "zqxlisted"'));
  none(w.run('not json'));
});

test('R405: an empty list, or one of comments and blank lines, denies nothing', () => {
  const w = world();
  w.list();
  none(w.shell('git commit -m "zqxlisted"'));
  w.list('# zqxlisted', '', '   ');
  none(w.shell('git commit -m "zqxlisted"'));
});

test('R405: a listed string matches with case ignored and as a whole word only', () => {
  const w = world();
  w.list('zqxlisted', 'two words');
  denied(w.shell('git commit -m "a ZqxListed b"'), 'zqxlisted', 'the command', w);
  denied(w.shell('git commit -m "x-zqxlisted.y"'), 'zqxlisted', 'the command', w);
  denied(w.shell('git commit -m "has Two Words in it"'), 'two words', 'the command', w);
  none(w.shell('git commit -m "zqxlistedness"'));
  none(w.shell('git commit -m "pre_zqxlisted"'));
  none(w.shell('git commit -m "two wordsmith"'));
});

test('R405: a typed newline escape before a word does not hide it', () => {
  const w = world();
  w.list('zqxlisted');
  denied(w.shell('git commit -m "first`nzqxlisted"', 'PowerShell'), 'zqxlisted', 'the command', w);
  denied(w.shell('git commit -m "first\\nzqxlisted"'), 'zqxlisted', 'the command', w);
  w.list('src\\tools');
  denied(w.shell('git commit -m "moved src\\tools"'), 'src\\tools', 'the command', w);
});

test('R405: an allow line takes its phrase out of the text before the search', () => {
  const w = world();
  w.list('claude', 'allow: CLAUDE.md');
  none(w.shell('git commit -m "docs: trim CLAUDE.md and claude.md"'));
  denied(w.shell('git commit -m "docs: trim CLAUDE.md for claude"'), 'claude', 'the command', w);
});

test('R405: a commit typed with a Bash heredoc or a PowerShell here-string is read whole', () => {
  const w = world();
  w.list('zqxlisted');
  denied(w.shell(HEREDOC('probe one: zqxlisted in a heredoc')), 'zqxlisted', 'the command', w);
  denied(w.shell(HERESTRING('probe two: zqxlisted in a here-string'), 'PowerShell'), 'zqxlisted', 'the command', w);
  none(w.shell(HEREDOC("probe one: it's a heredoc message")));
  none(w.shell(HERESTRING("probe two: it's a here-string message"), 'PowerShell'));
});

test('R405: a file the command names after -F, --file or --body-file, or as @<file>, is read through cwd', () => {
  const w = world();
  w.list('zqxlisted');
  writeFileSync(join(w.work, 'msg.txt'), 'subject\n\nzqxlisted in the body\n');
  writeFileSync(join(w.work, 'clean.txt'), 'subject\n');
  denied(w.shell('git commit -F msg.txt'), 'zqxlisted', `the file ${join(w.work, 'msg.txt')}`, w);
  denied(w.shell('git commit --file=msg.txt'), 'zqxlisted', `the file ${join(w.work, 'msg.txt')}`, w);
  denied(w.shell('gh pr comment 7 --body-file "msg.txt"', 'PowerShell'), 'zqxlisted', `the file ${join(w.work, 'msg.txt')}`, w);
  denied(w.shell('gh api repos/o/r/issues/7/comments -F body=@msg.txt'), 'zqxlisted', `the file ${join(w.work, 'msg.txt')}`, w);
  none(w.shell('git commit -F clean.txt'));
  none(w.shell('gh api repos/o/r/issues -F title=x -f body=y'));
});

test('R405: a path the hook resolved is left out of the search, so a folder that holds a listed name denies nothing', () => {
  const w = world();
  w.list('zqxlisted');
  mkdirSync(join(w.work, 'zqxlisted'));
  writeFileSync(join(w.work, 'zqxlisted', 'msg.txt'), 'a clean message\n');
  none(w.shell('git commit -F zqxlisted/msg.txt'));
  none(w.shell('gh pr create --title x --body-file "zqxlisted/msg.txt"', 'PowerShell'));
  none(w.shell('gh pr create --body-file zqxlisted/msg.txt --title "a title"'));
  none(w.shell('cat zqxlisted/msg.txt | git commit -F -'));
  none(w.shell('cd zqxlisted && git commit -m "a clean message"'));
  none(w.shell('git -C zqxlisted commit -m "a clean message"'));
  denied(w.shell('cd zqxlisted && git commit -m "it names zqxlisted"'), 'zqxlisted', 'the command', w);
  denied(w.shell('git commit -F zqxlisted/none.txt'), 'zqxlisted', 'the command', w);
});

test('R405: a path after a quote or a line break is searched, since it may be a message, though what it names exists', () => {
  const w = world();
  w.list('zqxlisted');
  mkdirSync(join(w.work, 'zqxlisted'));
  writeFileSync(join(w.work, 'zqxlisted', 'msg.txt'), 'a clean message\n');
  denied(w.shell('git commit -m "docs: cd zqxlisted before make"'), 'zqxlisted', 'the command', w);
  denied(w.shell('git commit -m "ci: run make -C zqxlisted"'), 'zqxlisted', 'the command', w);
  denied(w.shell('git commit -m "Set-Location zqxlisted"', 'PowerShell'), 'zqxlisted', 'the command', w);
  denied(w.shell('git commit -m "docs: run cat zqxlisted/msg.txt"'), 'zqxlisted', 'the command', w);
  denied(w.shell('gh issue comment 1 --body "see @zqxlisted/msg.txt"'), 'zqxlisted', 'the command', w);
  denied(w.shell('git commit -m "docs: pass --file zqxlisted/msg.txt to the tool"'), 'zqxlisted', 'the command', w);
  denied(w.shell('git commit -m "docs: pass -Fzqxlisted/msg.txt or body=@zqxlisted/msg.txt"'), 'zqxlisted', 'the command', w);
  denied(w.shell("git commit -m 'docs: use $(cat zqxlisted/msg.txt) to read it'"), 'zqxlisted', 'the command', w);
  denied(w.shell(HERESTRING('docs: pass -F zqxlisted/msg.txt'), 'PowerShell'), 'zqxlisted', 'the command', w);
  denied(w.shell(HEREDOC('docs: pass --body-file zqxlisted/msg.txt')), 'zqxlisted', 'the command', w);
  denied(w.shell(`git commit -m "it's ok" -m 'see --file zqxlisted/msg.txt'`), 'zqxlisted', 'the command', w);
  denied(w.shell(`git commit -m 'C:\\' -m 'see --file zqxlisted/msg.txt'`), 'zqxlisted', 'the command', w);
  denied(w.shell('git commit -m "C:\\" -m "see --file zqxlisted/msg.txt"', 'PowerShell'), 'zqxlisted', 'the command', w);
  // A raw field sends the text @<path> itself.
  denied(w.shell('gh api repos/o/r/issues -f title=@zqxlisted/msg.txt'), 'zqxlisted', 'the command', w);
  // A real path after a quoted argument is searched too: a needless stop, and no leak.
  denied(w.shell('gh pr create --title "a title" --body-file zqxlisted/msg.txt'), 'zqxlisted', 'the command', w);
  denied(w.shell('git commit \\\n -F zqxlisted/msg.txt'), 'zqxlisted', 'the command', w);
});

test('R405: a short option joined to its text does not hide a word', () => {
  const w = world();
  w.list('zqxlisted');
  denied(w.shell('git commit --allow-empty -mzqxlisted'), 'zqxlisted', 'the command', w);
  denied(w.shell('gh pr create -t x -bzqxlisted'), 'zqxlisted', 'the command', w);
  none(w.shell('git commit --allow-empty -mclean'));
});

test('R405: a message read back from a file, by cat, Get-Content, a redirect, a joined -F or --input, is read', () => {
  const w = world();
  w.list('zqxlisted');
  const file = `the file ${join(w.work, 'msg.txt')}`;
  writeFileSync(join(w.work, 'msg.txt'), 'subject\n\nzqxlisted in the body\n');
  denied(w.shell('git commit -m "$(cat msg.txt)"'), 'zqxlisted', file, w);
  denied(w.shell('cat msg.txt | git commit -F -'), 'zqxlisted', file, w);
  denied(w.shell('git commit -F - < msg.txt'), 'zqxlisted', file, w);
  denied(w.shell('Get-Content -Raw msg.txt | git commit -F -', 'PowerShell'), 'zqxlisted', file, w);
  denied(w.shell('Get-Content -Encoding utf8 msg.txt -Raw | git commit -F -', 'PowerShell'), 'zqxlisted', file, w);
  denied(w.shell('git commit -m "$(cat -- msg.txt)"'), 'zqxlisted', file, w);
  denied(w.shell('git commit -m "$(<msg.txt)"'), 'zqxlisted', file, w);
  denied(w.shell('Get-Content -Path msg.txt -Raw | git commit -F -', 'PowerShell'), 'zqxlisted', file, w);
  denied(w.shell('git commit -m (Get-Content -Path msg.txt -Raw)', 'PowerShell'), 'zqxlisted', file, w);
  // An apostrophe in an earlier argument does not stop the read.
  denied(w.shell(`gh pr create --title "it's x" --body-file - < msg.txt`), 'zqxlisted', file, w);
  denied(w.shell(`git commit -m "it's" -m (gc msg.txt -Raw)`, 'PowerShell'), 'zqxlisted', file, w);
  denied(w.shell(`gh pr create --title "won't fix" --body (Get-Content msg.txt -Raw)`, 'PowerShell'), 'zqxlisted', file, w);
  denied(w.shell('gh pr create --title x --body "$(cat msg.txt)"'), 'zqxlisted', file, w);
  denied(w.shell('git commit -Fmsg.txt'), 'zqxlisted', file, w);
  denied(w.shell('gh api repos/o/r/issues --input msg.txt'), 'zqxlisted', file, w);
  denied(w.shell('gh release create v1 --notes-file msg.txt'), 'zqxlisted', file, w);
});

test('R405: a file is also looked for in a directory the command names', () => {
  const w = world();
  w.list('zqxlisted');
  mkdirSync(join(w.work, 'my dir'));
  writeFileSync(join(w.work, 'msg.txt'), 'zqxlisted\n');
  denied(w.shell('cd "my dir" && git commit -F ../msg.txt'), 'zqxlisted', `the file ${join(w.work, 'msg.txt')}`, w);
  denied(w.shell('git -C "my dir" commit -F ../msg.txt'), 'zqxlisted', `the file ${join(w.work, 'msg.txt')}`, w);
});

test('R405: a merge or a tag typed with its message is read', () => {
  const w = world();
  w.list('zqxlisted');
  denied(w.shell('git merge --no-ff topic -m "merge by zqxlisted"'), 'zqxlisted', 'the command', w);
  denied(w.shell('git tag -a v1 -m "zqxlisted"'), 'zqxlisted', 'the command', w);
});

test('R405: a list saved as UTF-16 is read', () => {
  const w = world();
  writeFileSync(w.listFile, Buffer.from(`${String.fromCharCode(0xfeff)}zqxlisted\r\n`, 'utf16le'));
  denied(w.shell('git commit -m "zqxlisted"'), 'zqxlisted', 'the command', w);
  none(w.shell('git commit -m "clean"'));
});

test('R405: a named file that cannot be read gives a warning and the call goes ahead', () => {
  const w = world();
  w.list('zqxlisted');
  const r = w.shell('git commit -F missing.txt');
  assert.equal(r.decision, 'warn');
  assert.ok(r.reason.includes(join(w.work, 'missing.txt')), r.reason);
  assert.equal(w.shell('git commit -F missing.txt -m "zqxlisted"').decision, 'deny');
  none(w.shell('git commit -m "thanks @alice"'));
});

test('R405: a gh, az or glab call is read whole', () => {
  const w = world();
  w.list('zqxlisted');
  denied(w.shell('gh issue comment 3 --body "seen by zqxlisted"'), 'zqxlisted', 'the command', w);
  denied(w.shell('az repos pr create --title "fix" --description "zqxlisted wrote it"', 'PowerShell'), 'zqxlisted', 'the command', w);
  denied(w.shell('glab mr note 4 -m "zqxlisted"'), 'zqxlisted', 'the command', w);
  none(w.shell('gh issue comment 3 --body "clean"'));
});

test('R405: an attribution trailer that names a listed string is denied', () => {
  const w = world();
  w.list('zqxlisted');
  denied(w.shell(HEREDOC('fix(x): a subject\n\nCo-Authored-By: Zqxlisted <noreply@example.invalid>')), 'zqxlisted', 'the command', w);
});

test('R405: an MCP call is read by its string values, nested ones and one after a newline included', () => {
  const w = world();
  w.list('zqxlisted');
  const mcp = (tool_input) => w.run({ hook_event_name: 'PreToolUse', tool_name: 'mcp__forge__post_comment', tool_input, cwd: w.work });
  denied(mcp({ thread: { id: 4, parts: ['intro', 'first line\nzqxlisted second'] } }), 'zqxlisted', 'the tool input', w);
  none(mcp({ thread: { id: 4, parts: ['intro', 'first line\nsecond'] }, zqxlisted: 1 }));
});

test('R405: a call that is no commit, push or forge call is allowed', () => {
  const w = world();
  w.list('zqxlisted');
  none(w.shell('grep zqxlisted notes.txt'));
  none(w.shell('git log --grep zqxlisted'));
  none(w.run({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: 'zqxlisted' }, cwd: w.work }));
});

test('R405: input that is not JSON lets the call go ahead', () => {
  const w = world();
  w.list('zqxlisted');
  none(w.run('not json'));
  none(w.run(''));
  none(w.run('null'));
});

test('R405: a push reads the messages of the commits no remote-tracking ref holds', () => {
  const w = world();
  w.list('zqxlisted');
  const dir = repo(w);
  w.git(dir, 'commit', '-q', '--allow-empty', '-m', 'already out: zqxlisted');
  w.git(dir, 'push', '-q');
  w.git(dir, 'commit', '-q', '--allow-empty', '-m', 'clean');
  none(w.shell('git push', 'Bash', dir));
  w.git(dir, 'commit', '-q', '--allow-empty', '-m', 'subject\n\nbody with zqxlisted');
  denied(w.shell('git push', 'PowerShell', dir), 'zqxlisted', 'commit bf4bfb4', w);
});

test('R405: a push reads every local branch no remote-tracking ref holds, a new one with no upstream included', () => {
  const w = world();
  w.list('zqxlisted');
  const dir = repo(w);
  w.git(dir, 'switch', '-q', '-c', 'feature');
  w.git(dir, 'commit', '-q', '--allow-empty', '-m', 'new: zqxlisted');
  denied(w.shell('git push -u origin feature', 'Bash', dir), 'zqxlisted', 'commit fc4f06f', w);
  w.git(dir, 'switch', '-q', 'main');
  denied(w.shell('git push origin feature', 'Bash', dir), 'zqxlisted', 'commit fc4f06f', w);
  denied(w.shell('git push origin refs/heads/feature:refs/heads/feature', 'Bash', dir), 'zqxlisted', 'commit fc4f06f', w);
  denied(w.shell('git push --all origin', 'Bash', dir), 'zqxlisted', 'commit fc4f06f', w);
  // Refspecs are not read, so a branch the push leaves behind counts too.
  denied(w.shell('git push origin main', 'Bash', dir), 'zqxlisted', 'commit fc4f06f', w);
  w.git(dir, 'push', '-q', 'origin', 'feature');
  none(w.shell('git push origin main', 'Bash', dir));
});

test('R405: a commit only a tag reaches is read when the push sends tags', () => {
  const w = world();
  w.list('zqxlisted');
  const dir = repo(w);
  w.git(dir, 'commit', '-q', '--allow-empty', '-m', 'tagged: zqxlisted');
  w.git(dir, 'tag', 'v1');
  w.git(dir, 'reset', '-q', '--hard', 'HEAD~1');
  none(w.shell('git push origin main', 'Bash', dir));
  denied(w.shell('git push origin main --tags', 'Bash', dir), 'zqxlisted', 'commit ', w);
  denied(w.shell('git push --follow-tags', 'Bash', dir), 'zqxlisted', 'commit ', w);
});

test('R405: a command that names git and push but sends no commit is not read as a push', () => {
  const w = world();
  w.list('zqxlisted');
  const dir = repo(w);
  w.git(dir, 'commit', '-q', '--allow-empty', '-m', 'zqxlisted');
  none(w.shell('git stash push -m wip', 'Bash', dir));
  none(w.shell('git status; echo push', 'Bash', dir));
  denied(w.shell('git branch --delete old && git push', 'Bash', dir), 'zqxlisted', 'commit ', w);
  denied(w.shell('git commit -m "clean" && git push', 'Bash', dir), 'zqxlisted', 'commit ', w);
});

test('R405: a control character in a message does not cut the rest of it off', () => {
  const w = world();
  w.list('zqxlisted');
  const dir = repo(w);
  writeFileSync(join(w.root, 'odd.txt'), `subject ${String.fromCharCode(0x1f)} zqxlisted\n`);
  w.git(dir, 'commit', '-q', '--allow-empty', '-F', join(w.root, 'odd.txt'));
  denied(w.shell('git push', 'Bash', dir), 'zqxlisted', 'commit ', w);
});

test('R405: a push from a directory the command names with -C or cd is read there', () => {
  const w = world();
  w.list('zqxlisted');
  const dir = repo(w);
  w.git(dir, 'commit', '-q', '--allow-empty', '-m', 'zqxlisted');
  none(w.shell('git push'));
  denied(w.shell(`git -C "${dir}" push`), 'zqxlisted', 'commit ', w);
  denied(w.shell(`cd '${dir}' && git push`), 'zqxlisted', 'commit ', w);
  denied(w.shell(`Set-Location "${dir}"; git push`, 'PowerShell'), 'zqxlisted', 'commit ', w);
});

test('R405: check: diff reads the added lines of the commits about to leave, and is off by default', () => {
  const w = world();
  const dir = repo(w);
  writeFileSync(join(dir, 'a.txt'), 'kept\n');
  w.git(dir, 'add', 'a.txt');
  w.git(dir, 'commit', '-q', '-m', 'add a');
  w.git(dir, 'push', '-q');
  writeFileSync(join(dir, 'a.txt'), 'zqxlisted was here\n');
  w.git(dir, 'commit', '-q', '-am', 'clean subject');
  w.list('zqxlisted', 'kept');
  none(w.shell('git push', 'Bash', dir));
  w.list('zqxlisted', 'kept', 'check: diff');
  denied(w.shell('git push', 'Bash', dir), 'zqxlisted', 'the added lines of commit 07d7fa4', w);
  // A removed line is not read.
  w.list('kept', 'check: diff');
  none(w.shell('git push', 'Bash', dir));
});

test('R405: parseList keeps strings, allow phrases, post phrases and the diff switch apart', () => {
  assert.deepEqual(parseList('\uFEFF# c\r\nalpha\r\n  allow: Alpha.md  \r\n\r\ncheck: diff\r\nallow:\r\npost: Tools\\Send.mjs\r\npost:\r\nbeta gamma\n'),
    { strings: ['alpha', 'beta gamma'], allow: ['Alpha.md'], post: ['Tools\\Send.mjs'], diff: true });
});

test('R405: a command that holds a post: phrase is read as a forge post, with the files it names', () => {
  const w = world();
  writeFileSync(join(w.work, 'body.md'), 'zqxlisted in the body\n');
  writeFileSync(join(w.work, 'clean.md'), 'a clean body\n');
  w.list('zqxlisted');
  none(w.shell('node tools/send.mjs --pr 7 --body "by zqxlisted"'));
  none(w.shell('node tools/send.mjs --pr 7 --body-file body.md'));
  w.list('zqxlisted', 'post: Tools/Send.mjs');
  denied(w.shell('node tools/send.mjs --pr 7 --body "by zqxlisted"'), 'zqxlisted', 'the command', w);
  denied(w.shell('node tools/send.mjs --pr 7 --body-file body.md'), 'zqxlisted', `the file ${join(w.work, 'body.md')}`, w);
  denied(w.shell('node .\\tools\\send.mjs --pr 7 --body-file "body.md"', 'PowerShell'), 'zqxlisted', `the file ${join(w.work, 'body.md')}`, w);
  none(w.shell('node tools/send.mjs --pr 7 --body-file clean.md'));
  none(w.shell('node tools/other.mjs --body "by zqxlisted"'));
});

test('R405: a text that names git on one line and a subcommand on another is no post, and a commit in each typed form is one', () => {
  const w = world();
  w.list('zqxlisted');
  const write = (text) => `python - <<'EOF'\nopen('notes.md', 'a').write("""${text}""")\nEOF`;
  none(w.shell(write('zqxlisted 2.1.\nShell: Git Bash through the tool.\nThe run made one commit.\n')));
  none(w.shell(write('zqxlisted 2.1.\nShell: Git Bash through the tool.\nThe release has a tag, after the merge.\n')));
  none(w.shell("Add-Content notes.md @'\nzqxlisted 2.1.\nShell: Git Bash.\nOne commit.\n'@", 'PowerShell'));
  none(w.shell(write('Use git here,\ncommit by zqxlisted.\n')));
  for (const [command, tool] of [
    ['git -C sub commit -m "by zqxlisted"'],
    ['git -c "user.name=a;b" commit -m "by zqxlisted"'],
    ['git -c "user.name=a & b" commit -m "by zqxlisted"'],
    ['git.exe commit -m "by zqxlisted"'],
    ['git \\\n  commit -m "by zqxlisted"'],
    ['git \\\r\n  commit -m "by zqxlisted"'],
    ['git `\n  commit -m "by zqxlisted"', 'PowerShell'],
    ["git @(\n  'commit', '-m', 'by zqxlisted'\n)", 'PowerShell'],
    ["Start-Process git -ArgumentList @(\n 'commit','-m','by zqxlisted')", 'PowerShell'],
    ['$g=\'git\'\n& $g commit -m "by zqxlisted"', 'PowerShell'],
    ['c=commit\ngit $c -m "by zqxlisted"'],
    ['GIT_AUTHOR_NAME=x git commit -m "by zqxlisted"'],
    ['git merge --no-ff -m "by zqxlisted" side'],
    ['git tag -a v1 -m "by zqxlisted"'],
    ['git commit-tree -m "by zqxlisted" HEAD^{tree}'],
    ['bash -c "git commit -m \'by zqxlisted\'"'],
    ['echo "commit -m zqxlisted" | xargs git'],
    ['xargs git <<EOF\ncommit -m "by zqxlisted"\nEOF'],
    ["printf 'commit -m zqxlisted' |\n  xargs git"],
  ]) denied(w.shell(command, tool), 'zqxlisted', 'the command', w);
});

test('R405: a denial for a command says what made the command a post', () => {
  const w = world();
  w.list('zqxlisted', 'post: tools/send.mjs');
  const reason = (command) => w.shell(command).reason;
  assert.equal(reason('git -C sub Commit -m "by zqxlisted"'), `rules: "zqxlisted", listed in ${w.listFile}, is in the command, which holds "git" and "commit" and so is read as a post`);
  assert.equal(reason('git tag -a v1 -m "zqxlisted commit notes"'), `rules: "zqxlisted", listed in ${w.listFile}, is in the command, which holds "git" and "tag" and so is read as a post`);
  assert.equal(reason('echo "commit -m zqxlisted" | xargs git'), `rules: "zqxlisted", listed in ${w.listFile}, is in the command, which holds "git" and "commit" and so is read as a post`);
  assert.equal(reason('echo "zqxlisted ran gh once" >> notes.md'), `rules: "zqxlisted", listed in ${w.listFile}, is in the command, which holds "gh" and so is read as a post`);
  assert.equal(reason('node tools/send.mjs --body "by zqxlisted"'), `rules: "zqxlisted", listed in ${w.listFile}, is in the command, which holds the post: phrase "tools/send.mjs" and so is read as a post`);
  w.list('zqxlisted', 'post: Tools\\Send.mjs');
  assert.equal(reason('node tools/send.mjs --body "by zqxlisted"'), `rules: "zqxlisted", listed in ${w.listFile}, is in the command, which holds the post: phrase "Tools\\Send.mjs" and so is read as a post`);
});

test('R405: the Bash tool on Windows names a file in the MSYS form, which is read', { skip: process.platform !== 'win32' && 'the MSYS form exists on Windows only' }, () => {
  const w = world();
  writeFileSync(join(w.work, 'msg.txt'), 'zqxlisted\n');
  const msys = `/${w.work[0].toLowerCase()}${w.work.slice(2).replace(/\\/g, '/')}/msg.txt`;
  const out = check({ tool_name: 'Bash', tool_input: { command: `git commit -F ${msys}` }, cwd: w.work }, parseList('zqxlisted\n'), 'L', { home: w.home, platform: 'win32' });
  assert.equal(out.length, 1);
  assert.ok(JSON.parse(out[0]).hookSpecificOutput.permissionDecisionReason.includes(join(w.work, 'msg.txt')));
  // /tmp is the temp folder there.
  const tmp = check({ tool_name: 'Bash', tool_input: { command: 'git commit -F /tmp/msg.txt' }, cwd: w.root }, parseList('zqxlisted\n'), 'L', { home: w.home, platform: 'win32', tmp: w.work });
  assert.equal(tmp.length, 1);
  assert.ok(JSON.parse(tmp[0]).hookSpecificOutput.permissionDecisionReason.includes(join(w.work, 'msg.txt')));
});

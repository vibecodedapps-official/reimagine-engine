// The push read of the outbound check, plugins/rules/scripts/chain.mjs: whether a command holds a push, and whether it is one
// plain git call. The hook's own denial is tested in outbound.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plain, pushing } from '../../plugins/rules/scripts/chain.mjs';

test('R405: a plain git call gives its subcommand and the words after it, as the shell gives them', () => {
  // Each case is a command, whether PowerShell reads it, and its subcommand and words.
  const cases = [
    ['git push', false, 'push', []],
    ['git push origin main', false, 'push', ['origin', 'main']],
    ['git.exe push', false, 'push', []],
    ['"git" push', false, 'push', []],
    ['git', false, '', []],
    ['git -C repo push', false, 'push', []],
    ['git -C "my dir" push -u origin HEAD', false, 'push', ['-u', 'origin', 'HEAD']],
    ['git --no-pager log --grep push', false, 'log', ['--grep', 'push']],
    ['git -P log', false, 'log', []],
    ['git --no-optional-locks status', false, 'status', []],
    // One cd and && may come first, and 2>&1 may end the command.
    ['cd repo && git push', false, 'push', []],
    ['cd "my dir"&& git -C sub push', false, 'push', []],
    ['git push 2>&1', false, 'push', []],
    ['cd repo && git push origin main 2>&1', false, 'push', ['origin', 'main']],
    // Bash: single quotes are literal, a backslash escapes outside quotes and before " \ $ and a backtick inside double quotes.
    ["git commit -m 'a \"b\" $c'", false, 'commit', ['-m', 'a "b" $c']],
    ['git commit -m "fix push retry"', false, 'commit', ['-m', 'fix push retry']],
    ['git commit -m "say \\"git push\\" later"', false, 'commit', ['-m', 'say "git push" later']],
    ['git commit -m "a\\b"', false, 'commit', ['-m', 'a\\b']],
    ['git commit -m "a\\$b"', false, 'commit', ['-m', 'a$b']],
    ['git push origin my\\ branch', false, 'push', ['origin', 'my branch']],
    ['git commit -m ""', false, 'commit', ['-m', '']],
    ['git commit -m "first\nsecond"', false, 'commit', ['-m', 'first\nsecond']],
    ['git push origin a#b', false, 'push', ['origin', 'a#b']],
    ['git\tpush\torigin', false, 'push', ['origin']],
    // PowerShell: '' and "" are one quote, a backtick escapes inside double quotes, and curly quotes are plain ones.
    ['git push', true, 'push', []],
    ["git commit -m 'it''s'", true, 'commit', ['-m', "it's"]],
    ['git commit -m "say ""hi"""', true, 'commit', ['-m', 'say "hi"']],
    ['git commit -m "a\x60"b"', true, 'commit', ['-m', 'a"b']],
    ['git commit -m \u201cfix push\u201d', true, 'commit', ['-m', 'fix push']],
    ['git commit -m \u2018fix push\u2019', true, 'commit', ['-m', 'fix push']],
    ["git commit -m '$x'", true, 'commit', ['-m', '$x']],
    ['git -C C:\\repo push', true, 'push', []],
    ['git push origin main 2>&1', true, 'push', ['origin', 'main']],
    ['cd repo && git push', true, 'push', []],
  ];
  for (const [command, ps, sub, args] of cases) assert.deepEqual(plain(command, ps), { sub, args }, command);
});

test('R405: a command that is more than one plain git call is not plain', () => {
  // Each case is a command and whether PowerShell reads it.
  const cases = [
    // A second command, a pipe, a redirect, a group or a background job.
    ['git commit -m x && git push', false],
    ['git pull --ff-only && git push', false],
    ['git stash && git push', false],
    ['git push 2>&1 | tail -3', false],
    ['git push; echo $?', false],
    ['git push > out.log 2>&1', false],
    ['git push 2> err.log', false],
    ['git push < /dev/null', false],
    ['(git push)', false],
    ['git push &', false],
    ['cd a && cd b && git push', false],
    ['cd - && git push', false],
    ['cd -P x && git push', false],
    ['CD x && git push', false],
    ['cd x && git push && echo ok', false],
    ['git push\ngit status', false],
    // A substitution, a variable, a comment, a continued line and a quote left open.
    ['git push origin "$B"', false],
    ['git push origin $B', false],
    ['git push $(git branch --show-current)', false],
    ['git push origin \x60git branch --show-current\x60', false],
    ['git push origin main # done', false],
    ['git \\\n  push origin main', false],
    ['git push origin main\\', false],
    ['git commit -m "open', false],
    // Another program, an assignment or a path in front, and git's own options other than -C, --no-pager, -P and --no-optional-locks.
    ['bash -c "git commit -m x; git push"', false],
    ['GIT_TRACE=1 git push', false],
    ['env git push', false],
    ['timeout 60 git push', false],
    ['/usr/bin/git push', false],
    ['npm version patch && git push', false],
    ['git -c user.name=x push', false],
    ['git --git-dir=.git push', false],
    ['git -C', false],
    ['rg "git push" docs', false],
    ['gh pr create --title t --body "run git push after the merge"', false],
    // PowerShell: a backtick outside quotes, a brace, an @ that starts a word, a $ inside double quotes and the call operator.
    ['git push; $LASTEXITCODE', true],
    ['git push 2>&1 | Select-Object -Last 5', true],
    ['& git push', true],
    ['git push origin ma\x60in', true],
    ['git push origin {main}', true],
    ['git push @args', true],
    ['git commit -m "$m"', true],
    ['$env:GIT_TRACE=1; git push', true],
    ["Start-Process git -ArgumentList 'push' -Wait", true],
    ["git commit -m 'open", true],
  ];
  for (const [command, ps] of cases) assert.equal(plain(command, ps), null, command);
});

test('R405: a command holds a push where it holds git and push as words, and is read as its plain call or as none', () => {
  // Each case is a command, whether PowerShell reads it, and what pushing() gives: undefined without both words, null where the
  // command is not plain, else the call.
  const cases = [
    ['git push', false, { sub: 'push', args: [] }],
    ['cd x && git push', false, { sub: 'push', args: [] }],
    ['git push origin main 2>&1', true, { sub: 'push', args: ['origin', 'main'] }],
    ['git commit -m "fix push retry"', false, { sub: 'commit', args: ['-m', 'fix push retry'] }],
    ['git log --grep push', false, { sub: 'log', args: ['--grep', 'push'] }],
    ['git stash push -m wip', false, undefined],
    ['git stash push -m wip && git switch main', false, undefined],
    ['git stash push && git push', false, null],
    ['cd /home/u/git/app && npx prisma db push', false, undefined],
    ['cat .git/config; echo push', false, undefined],
    ['cd ~/git && docker push x', false, null],
    ['CD x && git push', true, { sub: 'push', args: [] }],
    ['Cd x && git push', true, { sub: 'push', args: [] }],
    ['git add . && git commit -m "fix push retry"', false, null],
    ['git pull --ff-only && git push', false, null],
    ['rg "git push" docs', false, null],
    ['g=git; $g push', false, null],
    ['git push; $LASTEXITCODE', true, null],
    ['git status', false, undefined],
    ['echo push', false, undefined],
    ['docker push image:tag', false, undefined],
    ['$DOCKER push image:tag', false, undefined],
    ['cat .git/hooks/pre-push', false, undefined],
    ['git-lfs push origin main', false, undefined],
    ['g"it" pu\\sh', false, undefined],
  ];
  for (const [command, ps, want] of cases) assert.deepEqual(pushing(command, ps), want, command);
});

test('R405: a long run of spaces in a command is read in linear time', () => {
  const start = Date.now();
  assert.deepEqual(plain(`git push${' '.repeat(200000)}x`), { sub: 'push', args: ['x'] });
  assert.ok(Date.now() - start < 2000);
});

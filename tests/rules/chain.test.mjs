// The chained-push read of the outbound check, plugins/rules/scripts/chain.mjs: whether a git push follows, in one command, a git
// call that makes a commit. The hook's own denial is tested in outbound.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chained } from '../../plugins/rules/scripts/chain.mjs';

test('R405: a push is chained where it runs after a call that makes a commit, as the shell reads the command', () => {
  // Each case is a command, whether PowerShell reads it, and whether the push is chained.
  const cases = [
    ['git commit -m x && git push', false, true],
    ['git push && git commit -m x', false, false],
    ['git commit -m "then git push"', false, false],
    ['git stash push && git commit -m x; git stash push', false, false],
    ['git -C "$(pwd)" commit -m x && git -C $(pwd) push', false, true],
    ['"/usr/bin/git" commit -m x && git push', false, true],
    ['bash <<EOF\ngit commit -m x\ngit push\nEOF', false, true],
    ['cat <<EOF\ngit commit -m x\ngit push\nEOF', false, false],
    ['git commit -m x 2>&1 && git push 2>&1 | tail -3', false, true],
    ['git commit -m "it\'s done && git push', false, true],
    ['git commit -m x && echo "$(git push)"', false, true],
    ['git commit -m "see $(git log -1 --format=%s) and git push"', false, false],
    ['git commit -m x; git -c alias.p=push p', false, false],
    ['git merge --abort; git push', false, false],
    ['git revert HEAD && git push -u origin HEAD', false, true],
    ['git commit -m x; if ($?) { git push }', true, true],
    ['& "C:\\Program Files\\Git\\cmd\\git.exe" commit -m x; git push', true, true],
    ['git commit -m "say `"git push`" later"', true, false],
    ['powershell -Command "git commit -m x; git push"', true, true],
    ['Write-Output "git commit -m x; git push"', true, false],
  ];
  for (const [command, ps, want] of cases) assert.equal(chained(command, ps), want, command);
});

test('R405: a long run of substitutions is read in linear time', () => {
  const started = Date.now();
  assert.equal(chained('echo ' + '$('.repeat(20000) + ' && git commit -m x && git push', false), true);
  assert.equal(chained('echo ' + '"$(echo '.repeat(2000) + 'x' + ')"'.repeat(2000) + ' && git push', false), false);
  assert.ok(Date.now() - started < 5000);
});

// The ask hook. Rows run through decide() with real git repositories and real configuration folders in a temporary
// directory, set through CLAUDE_CONFIG_DIR; git is injected only for a timeout. A few run the script as a child process.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide } from '../../plugins/guard/scripts/ask.mjs';

const SCRIPT = fileURLToPath(new URL('../../plugins/guard/scripts/ask.mjs', import.meta.url));
const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'guard-ask-')));
after(() => rmSync(root, { recursive: true, force: true }));
const fw = (p) => p.replace(/\\/g, '/');
const win = (p) => p.replace(/\//g, '\\');

const gitConfig = join(root, 'empty.gitconfig');
writeFileSync(gitConfig, '');
const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: gitConfig, GIT_CEILING_DIRECTORIES: root };
for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'CLAUDE_CONFIG_DIR', 'CLAUDE_CODE_SESSION_ATTENDED', 'GH_REPO']) delete env[k];

function repo(name, remotes) {
  const path = join(root, name);
  mkdirSync(path);
  const g = (...a) => execFileSync('git', ['-c', 'init.defaultBranch=main', '-C', path, ...a], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  g('init', '-q');
  for (const [n, url] of remotes) g('remote', 'add', n, url);
  return { path: fw(path), g };
}
const a = repo('a', [['origin', 'https://github.com/zz-owner/zz-app.git'], ['fork', 'https://github.com/zz-me/zz-app.git']]);
a.g('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-q', '--allow-empty', '-m', 'x');
a.g('worktree', 'add', '-q', join(root, 'a2'));
// A as PowerShell names it: the backslash form on Windows, the same path elsewhere.
const A = a.path, A2 = fw(join(root, 'a2')), Aw = process.platform === 'win32' ? win(A) : A;
const B = repo('b', [['origin', 'https://dev.azure.com/zz-org/zz-proj/_git/zz-svc']]).path;
const C = repo('c', [['origin', 'git@github.com:zz-owner/zz-other.git']]).path;
const D = fw(join(root, 'd'));
mkdirSync(D);
const R = repo('r', [['origin', 'https://github.com/zz-owner/zz-new.git']]).path;
const S = repo('s', [['origin', 'git@github-work:zz-owner/zz-alias.git']]).path;
const V = repo('v', [['origin', 'https://zz-org.visualstudio.com/zz-proj/_git/zz-svc']]).path;
const W = repo('w', [['origin', 'zz-org@vs-ssh.visualstudio.com:v3/zz-org/zz-proj/zz-svc']]).path;
// Unflagged checkouts whose branch pushes to the flagged URL, as gh pr checkout of a fork leaves them.
const c3 = repo('c3', [['origin', 'https://github.com/zz-owner/zz-other3.git']]);
c3.g('config', 'branch.main.remote', 'https://github.com/zz-owner/zz-app.git');
const C3 = c3.path;
const c4 = repo('c4', [['origin', 'https://github.com/zz-owner/zz-other4.git']]);
c4.g('config', 'branch.main.pushRemote', 'https://github.com/zz-owner/zz-app.git');
const C4 = c4.path;
for (let i = 0; i < 17; i++) mkdirSync(join(D, `n${i}`));
mkdirSync(join(D, 'a'));

const LIST = `{"version":1,"repos":[
{"path":"${A}","remotes":["github.com/zz-owner/zz-app"],"merge":false,"ask":true},
{"path":"${B}","remotes":["dev.azure.com/zz-org/zz-proj/_git/zz-svc"],"merge":false,"ask":true},
{"path":"${C}","remotes":["github.com/zz-owner/zz-other"],"merge":true},
{"path":"${D}/spaced","remotes":["dev.azure.com/zz-org/My%20Project/_git/zz-spaced"],"merge":false,"ask":true},
{"path":"${R}","remotes":["github.com/zz-owner/zz-old"],"merge":false,"ask":true},
{"path":"${S}","remotes":["github-work/zz-owner/zz-alias"],"merge":false,"ask":true}]}`;
const MARKED = '{"autoMode":{"allow":["$defaults","Own repositories: pushing. (reimagine guard)"]}}';

let configs = 0;
// A configuration folder holding the files given; 'DIR' makes a directory of that name.
function config(files) {
  const dir = join(root, `cfg-${configs++}`);
  mkdirSync(dir);
  for (const [name, text] of Object.entries(files)) {
    if (text === 'DIR') mkdirSync(join(dir, name)); else writeFileSync(join(dir, name), text);
  }
  return dir;
}
const MAIN = config({ 'reimagine-guard.json': LIST });

const EVERY = 'before every push, pull request and comment';
const to = (remote) => `guard: this call goes to ${remote}, which /guard lists to ask ${EVERY}`;
const APP = to('github.com/zz-owner/zz-app');
const SVC = to('dev.azure.com/zz-org/zz-proj/_git/zz-svc');
const UNRES = `guard: this call's directory could not be resolved and github.com/zz-owner/zz-app is listed to ask ${EVERY}`;
const BAD = (cfg) => `guard: ${join(cfg, 'reimagine-guard.json')} cannot be read, so guard asks before every push and every gh and az repos write; correct it or run /guard`;
const GONE = (cfg) => `guard: ${join(cfg, 'settings.json')} holds guard's entries but ${join(cfg, 'reimagine-guard.json')} is missing, so guard asks before every push and every gh and az repos write; run /guard, or /guard use with the path of another folder's list file`;

const deps = (cfg = MAIN, extra = {}) => ({ home: root, platform: process.platform, ...extra, env: { ...env, CLAUDE_CONFIG_DIR: cfg, ...extra.env } });
const shell = (cwd, command, tool = 'Bash') => ({ cwd, tool_name: tool, tool_input: { command } });
const ps = (cwd, command) => shell(cwd, command, 'PowerShell');
const mcp = (tool_name, tool_input) => ({ cwd: D, tool_name, tool_input });
// Each row is [input, expected]; all rows are judged, then compared at once so a failure names every row that differs.
const judge = (rows, d = deps()) => {
  const got = rows.map(([input]) => decide(input, d));
  const show = (i) => `${rows[i][0].tool_name} ${JSON.stringify(rows[i][0].tool_input)}`;
  assert.deepEqual(got.map((g, i) => [show(i), g]), rows.map(([, want], i) => [show(i), want]));
};

test('R406: git push asks when a directory of the text or its destination is a flagged repository', () => {
  judge([
    [shell(A, 'git push'), APP],
    [shell(A, 'git push origin HEAD'), APP],
    [shell(A, 'git push fork HEAD'), APP],
    [shell(A2, 'git push'), APP],
    [shell(C, 'git push origin HEAD'), null],
    [shell(C, `git -C "${A}" push`), APP],
    [shell(C, `cd "${A}" && git push`), APP],
    [shell(A, `git -C "${C}" push`), null],
    [shell(C, 'git push https://github.com/zz-owner/zz-app.git HEAD'), APP],
    [shell(C, 'cd $dir; git push'), UNRES],
    [ps(C, `Set-Location "${A}"; git push`), APP],
    [ps(A, 'git push origin HEAD'), APP],
    [shell(D, 'git push'), null],
    [shell(A, 'git status'), null],
    [shell(A, 'git log --grep push'), null],
    [shell(A, 'git commit -m "fix"'), null],
    [shell(A, 'git stash push'), null],
    [shell(A, `cd "${C}" && git push`), APP],
  ]);
});

test('R406: git push forms that hide the push or move its directory still ask', () => {
  judge([
    [shell(A, 'git \\\n  push'), APP],
    [ps(A, 'git `\r\n  push'), APP],
    [shell(A, 'git -c core.pager=cat --no-pager push'), APP],
    [shell(A, 'git --namespace x push'), APP],
    [shell(C, `bash -c "git -C '${A}' push"`), APP],
    [shell(A, `echo cd "${C}"; git push`), APP],
    [shell(C, `git --git-dir="${A}/.git" push`), UNRES],
    [shell(C, `GIT_DIR="${A}/.git" git push`), UNRES],
    [shell(C, `cd "${A}"; popd; git push`), APP],
    [shell(C, 'cd -; git push'), UNRES],
    [shell(C, `cd "${D}/missing" && git push`), UNRES],
    [shell(C, `( cd "${A}" && git push )`), APP],
    [shell(C, `{ cd "${A}"; git push; }`), APP],
    [shell(C, `if cd "${A}"; then git push; fi`), APP],
    [shell(C, 'for d in x; do cd "$d"; git push; done'), UNRES],
    [ps(C, `Push-Location "${Aw}"; git push; Pop-Location`), APP],
    [ps(C, `sl ${Aw}; git push`), APP],
    [ps(C, `Set-Location -Path "${Aw}"; git push`), APP],
  ]);
});

test('R406: the Bash tool on Windows names a drive as /c/...', { skip: process.platform !== 'win32' }, () => {
  const msys = A.replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`);
  judge([[shell(C, `cd ${msys} && git push`), APP], [shell(C, `git -C ${msys} push`), APP]]);
});

test('R406: a closing bracket, a heredoc line, an escaped quote and other git push forms ask', () => {
  judge([
    [shell(A, '(git push)'), APP],
    [shell(A, 'git push)'), APP],
    [shell(A, 'echo $(git push)'), APP],
    [shell(A, 'x=`git push`'), APP],
    [shell(A, 'if true; then (git push); fi'), APP],
    [ps(A, '(git push)'), APP],
    [ps(A, '$r = @(git push)'), APP],
    [ps(A, 'if ($?) {git push}'), APP],
    [ps(A, 'try {git push} catch {}'), APP],
    [shell(C, `(cd ${A}; git push)`), APP],
    [ps(C, `Push-Location ${Aw}; try {git push} finally {Pop-Location}`), APP],
    [shell(A, "git commit -q -F - <<'EOF'\nfix: x\n\ncd ..\nEOF\ngit push"), APP],
    [shell(A, `cat > notes.txt <<'EOF'\ncd ${D}\nEOF\ngit push`), APP],
    [shell(C, `bash -c "cd \\"${A}\\" && git push"`), APP],
    [shell(A, 'git push HEAD:refs/heads/x'), APP],
    [shell(C, 'git push gh-alias:zz-owner/zz-app.git HEAD'), APP],
    [ps(C, `cmd /c "cd /d ${Aw} && git push"`), APP],
    [shell(A, 'git subtree push --prefix=lib origin main'), APP],
    [shell(A, 'git lfs push origin main'), APP],
    [shell(A, 'git send-pack https://github.com/zz-owner/zz-app.git main'), APP],
    [shell(A, 'git -c alias.p=push p origin'), APP],
    [shell(C, 'git -c remote.origin.pushurl=https://github.com/zz-owner/zz-app.git push origin HEAD'), APP],
    [shell(C, 'git -c url.https://github.com/zz-owner/zz-app.git.pushInsteadOf=git@github.com:zz-owner/zz-other.git push origin HEAD'), APP],
    [shell(C, 'gh api graphql -F owner=zz-owner -F name=zz-app -f query=@m.graphql'), APP],
  ]);
});

test('R406: a flagged repository is matched by its path and by the identity of its remote', () => {
  judge([
    [shell(R, 'git push origin HEAD'), to('github.com/zz-owner/zz-old')],
    [shell(R, 'gh pr create --fill'), to('github.com/zz-owner/zz-old')],
    [shell(V, 'git push origin HEAD'), SVC],
    [shell(W, 'git push origin HEAD'), SVC],
    [shell(C, 'git push https://www.github.com/zz-owner/zz-app.git HEAD'), APP],
    [shell(C, 'git push https://zz-org.visualstudio.com/zz-proj/_git/zz-svc HEAD'), SVC],
    [shell(C, 'git push https://zz-org.visualstudio.com/DefaultCollection/zz-proj/_git/zz-svc HEAD'), SVC],
    [shell(C, 'git push zz-org@vs-ssh.visualstudio.com:v3/zz-org/zz-proj/zz-svc HEAD'), SVC],
    [shell(D, 'git push git@github.com:zz-owner/zz-alias.git HEAD'), to('github-work/zz-owner/zz-alias')],
  ]);
});

test('R406: gh asks for a write aimed at a flagged repository and passes reads', () => {
  judge([
    [shell(A, 'gh pr create --title x --body y'), APP],
    [shell(A, 'gh pr comment 5 --body hi'), APP],
    [shell(A, 'gh issue comment 3 --body x'), APP],
    [shell(A, 'gh pr merge 5'), APP],
    [shell(A, 'gh release create v1'), APP],
    [shell(A, 'gh pr view 5'), null],
    [shell(A, 'gh pr list'), null],
    [shell(A, 'gh pr checks 5'), null],
    [shell(A, 'gh pr diff 5'), null],
    [shell(A, 'gh auth status'), null],
    [shell(A, 'gh run watch 9'), null],
    [shell(A, 'gh api repos/{owner}/{repo}/pulls'), null],
    [shell(A, 'gh api repos/{owner}/{repo}/issues/3/comments -f body=x'), APP],
    [shell(A, 'gh api -X DELETE repos/{owner}/{repo}/git/refs/heads/x'), APP],
    [shell(A, "gh api graphql -f query='query { viewer { login } }'"), null],
    [shell(A, "gh api graphql -f query='mutation { x }'"), APP],
    [shell(A, 'gh api repos/:owner/:repo/issues/1/comments -f body=x'), APP],
    [shell(A, 'gh api graphql -F query=@q.graphql'), APP],
    [shell(A, 'gh api graphql --input body.json'), APP],
  ]);
});

test('R406: gh named at a repository is aimed at that one only', () => {
  judge([
    [shell(C, 'gh pr comment 5 -R zz-owner/zz-app --body x'), APP],
    [shell(C, 'gh pr comment 5 --repo ZZ-Owner/ZZ-App --body x'), APP],
    [shell(A, 'gh pr comment 5 -R zz-owner/zz-other --body x'), null],
    [shell(C, 'gh pr comment https://github.com/zz-owner/zz-app/pull/5 --body x'), APP],
    [shell(C, 'GH_REPO=zz-owner/zz-app gh issue create --title t --body b'), APP],
    [shell(C, 'gh pr create --title x --body y'), null],
    [shell(C, 'gh api repos/zz-owner/zz-app/issues/3/comments -f body=x'), APP],
    [shell(C, 'gh pr comment 5 -R zz-owner/zz-app-two --body x'), null],
    [shell(A, 'export GH_REPO=zz-owner/zz-other; gh pr create --title x'), APP],
    [shell(C, 'gh pr comment 5 -Rzz-owner/zz-app -b x'), APP],
    [shell(C, 'gh pr comment 5 --repo=zz-owner/zz-app -b x'), APP],
    [shell(C, 'gh pr comment 5 -R github.com/zz-owner/zz-app -b x'), APP],
  ]);
  judge([[shell(C, 'gh pr comment 5 -b x'), APP], [shell(C, 'gh pr comment 5 -R zz-owner/zz-other -b x'), null]], deps(MAIN, { env: { GH_REPO: 'zz-owner/zz-app' } }));
  judge([
    [shell(C, 'gh api repos/zz-owner/zz-app/issues/3/comments -f body=x'), APP],
    [shell(C, 'gh pr comment https://github.com/zz-owner/zz-app/pull/5 --body x'), APP],
    [shell(C, 'gh pr comment 5 --body x'), null],
  ], deps(MAIN, { env: { GH_REPO: 'zz-owner/zz-other' } }));
});

test('R406: a named target that holds a variable asks, and a name inside quoted text does not move the aim', () => {
  judge([
    [shell(A, 'gh pr comment 5 -R "$REPO" --body x'), UNRES],
    [shell(C, 'gh pr comment 5 -R$REPO -b x'), UNRES],
    [shell(C, 'gh pr comment 5 -R"$REPO" -b x'), UNRES],
    [ps(C, 'gh pr comment 5 -b (Get-Content b.md -Raw)'), null],
    [ps(A, '$env:GH_REPO = "$r"; gh pr create --title x'), UNRES],
    [shell(A, 'gh pr create --title x --body "set GH_REPO=foo"'), APP],
    [shell(A, 'az repos pr create --repository "$R" --title t'), UNRES],
    [shell(C, 'az repos pr create --repository zz-svc --project $P --title t'), SVC],
  ]);
});

test('R406: az repos asks for a write aimed at a flagged repository', () => {
  judge([
    [shell(B, 'az repos pr create --title t --description d'), SVC],
    [shell(B, 'az repos pr update --id 5 --status completed'), SVC],
    [shell(B, 'az repos pr set-vote --id 5 --vote approve'), SVC],
    [shell(B, 'az repos pr show --id 5'), null],
    [shell(B, 'az repos pr list'), null],
    [shell(C, 'az repos pr create --repository zz-svc --project zz-proj --org https://dev.azure.com/zz-org --title t'), SVC],
    [shell(B, 'az repos pr create --repository zz-else --title t'), null],
    [shell(C, 'az repos pr create --repository zz-svc --project zz-otherproj --title t'), null],
    [shell(D, 'az repos pr update --id 5 --status completed'), `guard: this call's directory could not be resolved and dev.azure.com/zz-org/zz-proj/_git/zz-svc is listed to ask ${EVERY}`],
    [shell(D, 'az repos pr create --project "My Project" --repository zz-spaced --title t'), to('dev.azure.com/zz-org/My%20Project/_git/zz-spaced')],
  ]);
});

test('R406: a raw call asks when its text names a flagged repository and it is not a plain read', () => {
  judge([
    [shell(D, 'az devops invoke --area git --resource pullRequestThreads --route-parameters project=zz-proj repositoryId=zz-svc pullRequestId=5 --http-method POST --in-file body.json'), SVC],
    [shell(D, 'curl -X POST "https://dev.azure.com/zz-org/zz-proj/_apis/git/repositories/zz-svc/pullRequests/5/threads?api-version=7.1" -d @body.json'), SVC],
    [ps(D, 'Invoke-RestMethod -Method Post -Uri https://api.github.com/repos/zz-owner/zz-app/issues/3/comments -Body $b'), APP],
    [ps(D, "$p = @{ Uri = 'https://api.github.com/repos/zz-owner/zz-app/issues/1/comments'; Method = 'Post'; Body = $b }; Invoke-RestMethod @p"), APP],
    [shell(D, 'curl -XPOST https://api.github.com/repos/zz-owner/zz-app/issues'), APP],
    [shell(D, 'curl -sXDELETE https://api.github.com/repos/zz-owner/zz-app/git/refs/heads/x'), APP],
    [shell(D, 'curl -X $M https://api.github.com/repos/zz-owner/zz-app/issues'), APP],
    [ps(D, 'irm -Me Post -Uri https://api.github.com/repos/zz-owner/zz-app/issues'), APP],
    [shell(D, 'curl https://api.github.com/repos/zz-owner/zz-other/issues -d x'), null],
    [shell(D, 'curl https://example.com'), null],
    [shell(D, 'curl -s https://api.github.com/repos/zz-owner/zz-app/pulls/5'), null],
    [shell(B, 'az rest --method get --url "https://dev.azure.com/zz-org/zz-proj/_apis/git/repositories/zz-svc/pullrequests/5/threads?api-version=7.1"'), null],
    [shell(B, 'az devops invoke --area git --resource pullRequestThreads --route-parameters project=zz-proj repositoryId=zz-svc pullRequestId=5 --http-method GET'), null],
    [ps(D, "Invoke-RestMethod -Uri 'https://api.github.com/repos/zz-owner/zz-app/pulls/5'"), null],
  ]);
});

test('R406: an MCP call asks when its arguments name a flagged repository and its name marks no read', () => {
  judge([
    [mcp('mcp__github__add_issue_comment', { owner: 'zz-owner', repo: 'zz-app', issue_number: 3, body: 'x' }), APP],
    [mcp('mcp__github__get_pull_request', { owner: 'zz-owner', repo: 'zz-app', pullNumber: 5 }), null],
    [mcp('mcp__github__pull_request_read', { method: 'get', owner: 'zz-owner', repo: 'zz-app', pullNumber: 5 }), null],
    [mcp('mcp__github__issue_write', { method: 'create', owner: 'zz-owner', repo: 'zz-app', title: 't' }), APP],
    [mcp('mcp__github__create_pull_request', { owner: 'zz-owner', repo: 'zz-other', title: 't' }), null],
    [mcp('mcp__ado__repo_create_pull_request', { project: 'zz-proj', repositoryId: 'zz-svc', title: 't' }), SVC],
    [mcp('mcp__ado__repo_list_pull_request_threads', { project: 'zz-proj', repositoryId: 'zz-svc' }), null],
    [mcp('mcp__ado__repo_reply_to_comment', { project: 'zz-proj', repositoryId: 'zz-svc', content: 'x' }), SVC],
    [mcp('mcp__x__post', { url: 'https://github.com/zz-owner/zz-app/issues/3', body: 'x' }), APP],
    [mcp('mcp__x__post', { body: 'hello' }), null],
    [mcp('mcp__ado__repo_resolve_comment', { repositoryId: 'zz-svc', pullRequestId: 5, threadId: 1 }), SVC],
    [mcp('mcp__x__pr_status_update', { owner: 'zz-owner', repo: 'zz-app' }), APP],
    [mcp('mcp__x__post', { payload: JSON.stringify({ owner: 'zz-owner', repo: 'zz-app' }) }), APP],
  ]);
});

test('R406: the list states decide before the call is read', () => {
  const push = [[shell(A, 'git push'), null]];
  judge(push, deps(config({})));
  judge(push, deps(config({ 'settings.json': '{"autoMode":{"allow":["$defaults"]}}' })));
  judge(push, deps(config({ 'reimagine-guard.json': `{"version":1,"repos":[{"path":"${A}","remotes":["github.com/zz-owner/zz-app"],"merge":false}]}`, 'settings.json': MARKED })));
  judge(push, deps(config({ 'reimagine-guard.json': '{"version":1,"repos":[]}' })));
  const broken = (want) => [
    [shell(D, 'git push'), want],
    [shell(A, 'gh pr create --title x --body y'), want],
    [shell(D, 'az repos pr update --id 5 --status completed'), want],
    [shell(A, 'git status'), null],
    [shell(A, 'gh pr view 5'), null],
    [shell(D, 'curl -X POST https://api.github.com/repos/zz-owner/zz-app/issues -d x'), null],
    [shell(D, 'curl https://example.com'), null],
    [mcp('mcp__x__post', { owner: 'zz-owner', repo: 'zz-app' }), null],
    [mcp('mcp__playwright__browser_click', { ref: 'x' }), null],
  ];
  for (const list of ['{', 'DIR', `{"version":1,"repos":[{"path":"${A}","remotes":[],"merge":false,"ask":"yes"}]}`]) {
    const cfg = config({ 'reimagine-guard.json': list });
    judge(broken(BAD(cfg)), deps(cfg));
  }
  const gone = config({ 'settings.json': MARKED });
  judge(broken(GONE(gone)), deps(gone));
  const unparsed = config({ 'settings.json': '{"autoMode":{"allow":["x (reimagine guard)",]}}' });
  judge([[shell(D, 'git push'), GONE(unparsed)]], deps(unparsed));
  judge([[{ cwd: A, tool_name: 'Edit', tool_input: { file_path: 'x', old_string: 'a', new_string: 'b' } }, null]]);
});

test('R406: a git call that times out makes a push ask', () => {
  const timeout = () => { throw Object.assign(new Error('spawnSync git ETIMEDOUT'), { code: 'ETIMEDOUT' }); };
  judge([[shell(C, 'git push'), UNRES], [shell(C, 'gh pr create --title x'), UNRES], [shell(C, 'git status'), null]], deps(MAIN, { git: timeout }));
});

test('R406: a directory named by -C, --chdir or --directory is a candidate, and a push in any form asks for a flagged name in its text', () => {
  judge([
    [shell(C, `env -C ${A} git push origin HEAD`), APP],
    [shell(C, `env --chdir=${A} git push`), APP],
    [shell(C, `env --chdir ${A} git push`), APP],
    [shell(C, `make --directory=${A} && git push`), APP],
    [shell(C, 'env -C "$D" git push'), UNRES],
    [shell(C, 'grep -C 3 x notes.txt; git push'), null],
    [shell(A, `git -C ${C} push`), null],
    [shell(C, 'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=remote.origin.pushurl GIT_CONFIG_VALUE_0=https://github.com/zz-owner/zz-app.git git push origin HEAD'), APP],
    [shell(C, 'git -c branch.main.pushRemote=https://github.com/zz-owner/zz-app.git push'), APP],
  ]);
});

test('R406: a push with no destination asks when its branch pushes to a flagged URL', () => {
  judge([
    [shell(C3, 'git push'), APP],
    [shell(C3, 'git push -u'), APP],
    [shell(C3, 'git pull && git push'), APP],
    [shell(C4, 'git push'), APP],
    [shell(C3, 'git push origin HEAD'), null],
    [shell(C3, 'git status'), null],
  ]);
});

test('R406: a push beside a submodule word, or beside a word that moves git or cd, asks with the second reason', () => {
  judge([
    [shell(C, 'git submodule foreach git push'), UNRES],
    [shell(C, "git submodule foreach 'git push origin HEAD:refs/heads/x'"), UNRES],
    [shell(C, 'git push --recurse-submodules=on-demand origin main'), UNRES],
    [shell(C, 'git -c push.recurseSubmodules=on-demand push'), UNRES],
    [shell(C, 'git submodule update --init'), null],
    [ps(C, `Set-Item -Path Env:GIT_DIR -Value ${Aw}\\.git; git push`), UNRES],
    [ps(C, `\${env:GIT_DIR} = '${Aw}\\.git'; git push`), UNRES],
    [shell(D, `export CDPATH=${root}; cd a && git push`), UNRES],
    [shell(C, 'export GIT_WORK_TREE; git push'), UNRES],
    [shell(C, 'echo $GIT_DIRECTORY; git push'), null],
  ]);
});

test('R406: a PowerShell -Name:value names a directory change, and one with arguments but no target is unresolved', () => {
  judge([
    [ps(C, `Set-Location -Path:${Aw}; git push`), APP],
    [ps(C, `sl -Pa:${Aw}; git push`), APP],
    [ps(C, `Set-Location -LiteralPath:"${Aw}"; git push`), APP],
    [ps(C, `Set-Location -Path:${Aw} -PassThru; git push`), APP],
    [ps(C, 'Set-Location -PassThru; git push'), UNRES],
    [shell(C, 'cd -P; git push'), UNRES],
    [shell(C, 'cd; git push'), null],
  ]);
});

test('R406: more than 16 candidate directories make the text unresolved', () => {
  const cds = (n) => Array.from({ length: n }, (_, i) => `cd ${D}/n${i}`).join('; ');
  judge([
    [shell(C, `${cds(15)}; git push`), null],
    [shell(C, `${cds(16)}; git push`), UNRES],
    [shell(C, `${cds(16)}; git -C ${A} push`), APP],
    [shell(C, `${cds(16)}; git status`), null],
  ]);
});

test('R406: curl, wget and PowerShell write signs: clusters, prefixes, config files and defaults', () => {
  const GH = 'https://api.github.com/repos/zz-owner/zz-app';
  judge([
    [shell(D, `curl -sSLkXDELETE ${GH}/git/refs/heads/x`), APP],
    [shell(D, `curl -sSLkX DELETE ${GH}/git/refs/heads/x`), APP],
    [shell(D, `curl -fsSLX DELETE ${GH}/git/refs/heads/x`), APP],
    [shell(D, `curl -fsSLd @b.json ${GH}/issues/1/comments`), APP],
    [shell(D, `curl -sF body=@b ${GH}/issues/1/comments`), APP],
    [shell(D, `curl -sT b.json ${GH}/contents/x`), APP],
    [shell(D, `curl -Tb.json ${GH}/contents/x`), APP],
    [shell(D, `curl -K req.cfg ${GH}/issues/1/comments`), APP],
    [shell(D, `curl --config req.cfg ${GH}/issues`), APP],
    [shell(D, `curl --variable b@b.json --expand-data '{{b}}' ${GH}/issues/1/comments`), APP],
    [shell(D, `curl --data-binary @b ${GH}/issues`), APP],
    [shell(D, `wget --post-da=x ${GH}/issues`), APP],
    [shell(D, `wget --meth=DELETE ${GH}/git/refs/heads/x`), APP],
    [shell(D, `wget -e method=DELETE ${GH}/git/refs/heads/x`), APP],
    [ps(D, `irm -CustomMethod DELETE ${GH}/git/refs/heads/x`), APP],
    [ps(D, `irm -Cu PUT -Uri ${GH}/pulls/5/merge`), APP],
    [ps(D, `$PSDefaultParameterValues['Invoke-RestMethod:Method']='Delete'; irm ${GH}/git/refs/heads/x`), APP],
    [shell(D, `curl -X POST -G ${GH}/issues -d x`), APP],
    [shell(D, `curl -G https://example.com; curl -d x ${GH}/issues`), APP],
    [shell(D, 'curl -G --data-urlencode "q=repo:zz-owner/zz-app is:pr" https://api.github.com/search/issues'), null],
    [shell(D, `curl -XGET ${GH}/pulls`), null],
    [shell(D, `curl -sXGET ${GH}/pulls`), null],
    [shell(D, `curl -m 10 ${GH}/pulls`), null],
    [shell(D, `curl -sSfL ${GH}/pulls`), null],
  ]);
});

test('R406: az skips global options before its group and reads a joined -m', () => {
  const AZ = 'https://dev.azure.com/zz-org/zz-proj/_apis/git/repositories/zz-svc';
  judge([
    [shell(B, 'az --only-show-errors repos pr create --title t'), SVC],
    [shell(B, 'az --debug repos pr update --id 5'), SVC],
    [shell(B, 'az --output json repos pr create --title t'), SVC],
    [shell(D, `az --debug rest -m put --url ${AZ}/pullrequests/5 --body @b.json`), SVC],
    [shell(D, `az --debug rest -m put --url ${AZ}/pullrequests/5`), SVC],
    [shell(D, `az rest -mPATCH --url ${AZ}/pullrequests/5 -b @b.json`), SVC],
    [shell(D, `az rest -u ${AZ}/pullrequests/5 -b @b.json`), SVC],
    [shell(D, `az rest -u ${AZ}/pullrequests/5 -b@b.json`), SVC],
    [shell(D, 'az --verbose devops invoke --area git --resource pullRequestThreads --route-parameters project=zz-proj repositoryId=zz-svc pullRequestId=5 --http-method POST --in-file b.json'), SVC],
    [shell(D, 'az devops invoke --area git --resource pullRequests --route-parameters project=zz-proj repositoryId=zz-svc pullRequestId=5 --http-meth PATCH --in-f b.json'), SVC],
    [shell(B, 'az --output json repos pr list'), null],
    [shell(D, `az --debug rest -m get --url ${AZ}/pullrequests/5`), null],
  ]);
});

test('R406: gh clusters, clone outside repo, GH_REPO that never releases, and graphql queries built at run time', () => {
  judge([
    [shell(A, 'gh api -iX DELETE repos/{owner}/{repo}/git/refs/heads/x'), APP],
    [shell(A, 'gh api -iXPUT repos/{owner}/{repo}/pulls/5/merge'), APP],
    [shell(A, 'gh api -if title=x repos/{owner}/{repo}/issues'), APP],
    [shell(A, 'gh api -iF body=x repos/{owner}/{repo}/issues/1/comments'), APP],
    [shell(A, 'gh api -iX GET repos/{owner}/{repo}/issues -f state=all'), null],
    [shell(A, 'gh label clone zz-owner/zz-other'), APP],
    [shell(A, 'gh repo clone zz-owner/zz-app x'), null],
    [shell(A, 'GH_REPO=zz-owner/zz-other gh pr view 1 && gh pr comment 5 -b x'), APP],
    [shell(A, 'GH_REPO=zz-owner/zz-other gh pr create --fill'), APP],
    [shell(A, 'gh pr comment 5 -R zz-owner/zz-other -b x'), null],
    [shell(C, 'GH_REPO=$R gh pr create --fill'), UNRES],
    [shell(A, 'gh api graphql -f query="$(cat m.graphql)"'), APP],
    [ps(A, 'gh api graphql -f query=(Get-Content m.graphql -Raw)'), APP],
    [shell(A, "gh api graphql -f query='query { viewer { login } }'"), null],
  ]);
});

test('R406: a graphql query asks when the shell builds it, and a literal query passes whatever it holds', () => {
  judge([
    [shell(A, "gh api graphql -f query='query { repository(owner: \"x\", name: \"y\") { id } }'"), null],
    [shell(A, "gh api graphql --paginate -f query='query($endCursor: String) { viewer { login } }'"), null],
    [shell(A, 'gh api graphql -f "query=query { viewer { login } }"'), null],
    [shell(A, 'gh api graphql -f query="$(cat q.graphql)"'), APP],
    [shell(A, 'Q=$(cat m.graphql); gh api graphql -f query="$Q"'), APP],
    [shell(A, 'gh api graphql -f query="query { `cat x` }"'), APP],
    [ps(A, 'gh api graphql -f query=(Get-Content m.graphql -Raw)'), APP],
    [shell(A, 'gh api graphql -F query=@q.graphql'), APP],
    [shell(A, "gh api graphql -f query='mutation { addComment(input: {}) { clientMutationId } }'"), APP],
  ]);
  judge([[shell(A, 'gh pr comment 5 --body x'), APP]], deps(MAIN, { env: { GH_REPO: 'zz-owner/zz-other' } }));
});

test('R406: %2F reads as /, and an MCP call asks for a flagged path or a whole Azure repository value', () => {
  judge([
    [shell(D, 'curl -X POST -d @b https://gitlab.com/api/v4/projects/zz-owner%2Fzz-app/merge_requests'), APP],
    [mcp('mcp__gitlab__create_merge_request', { project_id: 'zz-owner%2Fzz-app', source_branch: 'x', target_branch: 'main', title: 't' }), APP],
    [mcp('mcp__git__git_push', { path: A }), APP],
    [mcp('mcp__git__git_push', { path: win(A) }), APP],
    [mcp('mcp__git__git_push', { path: `${A}/sub` }), APP],
    [mcp('mcp__git__git_push', { path: `${A}-two` }), null],
    [mcp('mcp__git__git_status', { path: A }), null],
    [mcp('mcp__git__git_log', { path: A }), null],
    [mcp('mcp__git__git_diff', { path: A }), null],
    [mcp('mcp__git__git_blame', { path: A }), null],
    [mcp('mcp__x__pr_status_update', { path: A }), APP],
    [mcp('mcp__x__post', { repositoryId: 'zz-svc' }), SVC],
    [mcp('mcp__x__post', { body: 'fixed in zz-svc today' }), null],
    [mcp('mcp__x__post', { body: 'zz-proj: fixed in zz-svc today' }), SVC],
    ...(process.platform === 'win32' ? [[mcp('mcp__git__git_push', { path: A.toUpperCase() }), APP]] : []),
  ]);
});

test('R406: a --help word releases nothing, wherever it stands', () => {
  judge([
    [ps(A, 'gh issue create --title x --body (mycli --help | Out-String)'), APP],
    [shell(A, 'gh pr comment 5 --body "$(mycli --help)"'), APP],
    [shell(A, 'git push --help'), APP],
    [shell(A, 'gh pr view --help; git push'), APP],
  ]);
});

test('R406: a command that holds a post: phrase of the outbound list asks in a flagged checkout or when it names a flagged repository', () => {
  const posts = '# scripts that post\nzz-secret\npost: Tools\\pr-\npost: az boards work-item update\n';
  const cfg = config({ 'reimagine-guard.json': LIST, 'rules-outbound.txt': posts });
  const update = 'node C:/tools/pr-update.mjs --project zz-proj --repository zz-svc --pr-id 12 --file-path body.json';
  const comment = 'Get-Content note.json | node C:/tools/pr-comment.mjs --project zz-proj --repository zz-svc --pr-id 12';
  const rows = [
    [ps(B, update), SVC],
    [ps(B, comment), SVC],
    [ps(D, update), SVC],
    [ps(D, comment), SVC],
    [ps(D, 'node C:/tools/pr-update.mjs --project zz-else --repository zz-svc --pr-id 12'), null],
    [ps(A, 'node C:/tools/pr-update.mjs --pr-id 12'), APP],
    [ps(C, 'node C:/tools/pr-update.mjs --pr-id 12'), null],
    [ps(C, 'cd $dir; node C:/tools/pr-update.mjs --pr-id 12'), UNRES],
    [ps(B, 'az boards work-item update --id 12 --discussion "ready for review"'), SVC],
    [ps(D, 'az boards work-item update --id 12 --discussion "ready for review"'), null],
    [ps(B, 'az boards work-item show --id 12'), null],
    [ps(B, 'node C:/tools/build.mjs'), null],
    [ps(D, '.\\tools\\pr-update.ps1 -Project zz-proj -Repository zz-svc -PullRequestId 12'), SVC],
    [ps(D, 'node C:/tools/pr-comment.mjs --owner zz-owner --repo zz-app'), APP],
    [ps(D, '.\\tools\\pr-update.ps1 -Project zz-else -Repository zz-svc -PullRequestId 12'), null],
    [shell(D, 'node C:\\\\tools\\\\pr-update.mjs --project zz-proj --repository zz-svc --pr-id 12'), SVC],
    [shell(D, 'node C:/tools//pr-update.mjs --project zz-proj --repository zz-svc --pr-id 12'), SVC],
    [shell(D, 'node ./tools/./pr-update.mjs --project zz-proj --repository zz-svc --pr-id 12'), SVC],
  ];
  judge(rows, deps(cfg));
  judge([[ps(B, update), null], [ps(D, update), null]]);
  const wide = config({ 'reimagine-guard.json': LIST, 'rules-outbound.txt': Buffer.from(`\ufeff${posts}`, 'utf16le') });
  judge([[ps(B, comment), SVC], [ps(B, 'node C:/tools/build.mjs'), null]], deps(wide));
  const gone = config({ 'settings.json': MARKED, 'rules-outbound.txt': posts });
  judge([[ps(D, update), GONE(gone)], [ps(D, 'node C:/tools/build.mjs'), null]], deps(gone));
});

test('R406: a post: phrase with a letter outside ASCII matches in a list saved as UTF-16', () => {
  const wide = config({ 'reimagine-guard.json': LIST, 'rules-outbound.txt': Buffer.from('\ufeff# scripts that post\npost: Tools\\caf\u00e9\\pr-\n', 'utf16le') });
  judge([
    [ps(D, 'node C:/tools/caf\u00e9/pr-update.mjs --project zz-proj --repository zz-svc --pr-id 12'), SVC],
    [ps(D, 'node C:/tools/cafe/pr-update.mjs --project zz-proj --repository zz-svc --pr-id 12'), null],
  ], deps(wide));
});

test('R406: a folder that reads another folder\'s list also reads the post: phrases of the folder that holds the list', () => {
  const first = config({ 'reimagine-guard.json': LIST, 'rules-outbound.txt': 'post: Tools\\pr-\n' });
  const second = config({ 'reimagine-guard.json': JSON.stringify({ version: 1, use: fw(join(first, 'reimagine-guard.json')) }) });
  judge([
    [ps(D, 'node C:/tools/pr-update.mjs --project zz-proj --repository zz-svc --pr-id 12'), SVC],
    [ps(B, 'node C:/tools/pr-update.mjs --pr-id 12'), SVC],
    [ps(B, 'node C:/tools/build.mjs'), null],
  ], deps(second));
});

test('R406: git calls that together pass 8 seconds make the call ask, each call given what is left', () => {
  let clock = 0;
  const limits = [];
  const slow = (dir, args, ms) => { limits.push(ms); clock += 3500; return ''; };
  judge([[shell(C, `cd "${D}/n0"; cd "${D}/n1"; git push`), UNRES]], deps(MAIN, { git: slow, now: () => clock }));
  assert.deepEqual(limits, [5000, 4500, 1000]);
});

test('R335: a folder whose list file names another list asks as that list has it, and asks before every push when the named file is no list', () => {
  const named = (file) => JSON.stringify({ version: 1, use: file });
  const second = config({ 'reimagine-guard.json': named(fw(join(MAIN, 'reimagine-guard.json'))) });
  judge([[shell(A, 'git push'), APP], [shell(C, 'git push origin HEAD'), null]], deps(second));
  const lost = config({ 'reimagine-guard.json': named(`${D}/none.json`), 'settings.json': MARKED });
  judge([[shell(D, 'git push'), `guard: ${join(lost, 'settings.json')} holds guard's entries but ${join(D, 'none.json')} is missing, so guard asks before every push and every gh and az repos write; run /guard, or /guard use with the path of another folder's list file`]], deps(lost));
  const twice = config({ 'reimagine-guard.json': named(fw(join(second, 'reimagine-guard.json'))) });
  judge([[shell(D, 'git push'), BAD(second)]], deps(twice));
  const relative = config({ 'reimagine-guard.json': named('reimagine-guard.json') });
  judge([[shell(D, 'git push'), BAD(relative)]], deps(relative));
  const empty = config({ 'reimagine-guard.json': '{"version":1,"repos":[]}' });
  const mixed = config({ 'reimagine-guard.json': JSON.stringify({ ...JSON.parse(LIST), use: fw(join(empty, 'reimagine-guard.json')) }) });
  judge([[shell(A, 'git push'), APP]], deps(mixed));
});

function hook(input, cfg = MAIN) {
  return spawnSync(process.execPath, [SCRIPT], { input, env: { ...env, CLAUDE_CONFIG_DIR: cfg }, encoding: 'utf8' });
}

test('R406: the script prints the one ask line for a flagged push, nothing for a read, and exits 0', () => {
  const ask = hook(JSON.stringify(shell(A, 'git push origin HEAD')));
  assert.equal(ask.status, 0, ask.stderr);
  assert.equal(ask.stdout, '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"guard: this call goes to github.com/zz-owner/zz-app, which /guard lists to ask before every push, pull request and comment"}}\n');
  const pass = hook(JSON.stringify(shell(A, 'git status')));
  assert.equal(pass.status, 0, pass.stderr);
  assert.equal(pass.stdout, '');
  const bom = hook(`${String.fromCharCode(0xfeff)}${JSON.stringify(shell(A, 'git push origin HEAD'))}`);
  assert.equal(bom.status, 0, bom.stderr);
  assert.equal(bom.stdout, ask.stdout);
});

test('R406: the script prints nothing and exits 0 for stdin that is not JSON or a tool it does not judge', () => {
  for (const input of ['not json', '', '[]', JSON.stringify({ tool_name: 'Edit', tool_input: {} }), JSON.stringify({ tool_name: 'Bash', tool_input: {} })]) {
    const run = hook(input);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, '', input);
  }
  const none = hook(JSON.stringify(shell(A, 'git push')), config({}));
  assert.equal(none.status, 0, none.stderr);
  assert.equal(none.stdout, '');
});

test('R406: the script is at most 520 lines, ASCII, and imports only node: modules and ./guard.mjs', () => {
  const text = readFileSync(SCRIPT, 'utf8');
  assert.ok(text.split('\n').length - 1 <= 520);
  assert.ok(/^[\x00-\x7f]*$/.test(text));
  const specs = [...text.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
  assert.ok(specs.includes('./guard.mjs'));
  assert.ok(specs.every((s) => s.startsWith('node:') || s === './guard.mjs'));
  assert.equal(/\bimport\(|require\(/.test(text), false);
});

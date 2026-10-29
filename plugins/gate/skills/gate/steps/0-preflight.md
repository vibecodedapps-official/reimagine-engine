# Step 0: Preflight

Read this file after the reading block, which SKILL.md printed before any other tool call, this file's read included. Take the targets in the order of the block's Targets line, and use its Mode, Budget, Engine and Scripts lines, where `<scripts>` in the step files is the path on the Scripts line; this step does not print the block again. SKILL.md stays in force: its Approval scope, Record and Terminal states apply to every item here.

## 0.1 Rules that hold in all of Step 0

- Take `date -u +%Y-%m-%dT%H:%M:%SZ` now and keep the output as the run's start. Take it again at the start of each target after the first, for that target's run entry.
- Run read-only commands one at a time. A dropped read is retried once.
- Nothing is written before 0.8. Fetched refs are not writes.
- A stop in this step ends the run `blocked` or `stopped`, as the item says, and goes to SKILL.md, Terminal states.

## 0.2 Targets

1. Several pull requests run one after another, in the order of the Targets line. Each goes through Steps 0 to 3 and its terminal state before the next starts, and each has its own record.
2. A manifest runs one record per `bundles[]` entry that has a `pr` or a `branch`, in bundle order. Every git and gh command of a bundle runs against its `repo`: `git -C <repo>` and, for gh, `cd <repo> && <command>` in one Bash call, with absolute paths, as the loop's `multi-repo.md` says. The record is in that `repo`.
3. A target the block lists as unresolved already has its line there. Skip it.
4. A host other than GitHub runs with the comment skipped. Hold that for the report.
5. `<r>` is the remote of the target's repository: the one whose fetch URL matches the `url` of `gh repo view --json nameWithOwner,url`, else `origin`.

## 0.3 Instruction files, configuration, permission statement

Do this once, before the first fetch. With a manifest, read every bundle's repository and union the rules.

1. Read the user's instruction files in `$CLAUDE_CONFIG_DIR`, else `~/.claude`. Read the repository's instruction files: root `CLAUDE.md`, `AGENTS.md`, `.claude/CLAUDE.md`, and every file they import. Record every ask-first rule with the file it came from.
2. Read `.reimagine.json` at the repository root. A file that does not parse ends the run `blocked`. The `gate` key and the `base` key are as SKILL.md, Configuration, says; the block already reports an unknown key or a bad value.
3. Print the permission statement before any fetch. It gives the approved actions (SKILL.md, Approval scope), the always-ask actions, the ask-first rules found with their files, and, for each action the run takes, whether a prompt will occur: fetch, checkout, writing the exclude and the record, the child sessions, the subagents, the checks, the commit, the push and the comment. The statement also names the run's checks, each command with its source (the request, the manifest bundle or `.reimagine.json`), or says that no check will run. Judge each from the permission mode the session states and the allow rules in the user, project and local settings files (`$CLAUDE_CONFIG_DIR/settings.json` else `~/.claude/settings.json`, `<repo>/.claude/settings.json`, `<repo>/.claude/settings.local.json`). An action runs unprompted only when the mode approves it, or an allow rule matches its command and no ask or deny rule does. An outcome you cannot determine counts as a prompt. End with one line: "this run will prompt at: <list>" or "this run is unattended".

```
Approved for this run: fix commits on each target's branch, push it, one comment per target pull request.
Always asked: force push, --no-verify, merge, rebase, amend, reset, repository settings, a new issue. Ask-first rules found: 2 (<repo>/CLAUDE.md).
Prompts: fetch: no; checkout: no; exclude and record: yes (no allow rule); child sessions: yes; subagents: no; checks: yes; commit: yes; push: yes; comment: yes
this run will prompt at: the record, the child sessions, the checks, the commit, the push, the comment
```

## 0.4 GitHub checks

For each target on GitHub:

1. A `gh` that is not authenticated ends the run `blocked` for that host. Test it with the `gh repo view` of 0.2.5.
2. Read the pull request with `gh pr view <n> --json number,url,state,headRefName,baseRefName,isCrossRepository`. A merged or closed pull request ends `blocked`. A cross-repository pull request is an unresolved target: skip it, and when no target is left the run ends `stopped`.
3. A branch target's head is the branch `git rev-parse --abbrev-ref HEAD` prints. `HEAD` there, a detached head, ends `blocked`.

## 0.5 Clean tree

Before any checkout, `git status --porcelain` must print nothing, untracked files that are not ignored included, and `git diff --cached --quiet` must succeed. Otherwise the run ends `blocked`, naming what is dirty. Never stash, reset or clean.

## 0.6 Base and merge-base

1. The base `<b>` of a pull request is its `baseRefName`; "base <branch>" in the request on a pull request whose base differs ends `blocked`, naming both, since the gate never retargets a pull request. The base of a branch target is "base <branch>" in the request, else the manifest bundle's `base`, else `.reimagine.json` `base`, else the remote's default branch, from `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`, or on another host `git ls-remote --symref <r> HEAD`. A bundle `base` whose first segment names a remote that `git remote` lists in the bundle's repository is read without that segment and its `/`, since the loop's manifest writes `<remote>/<base branch>`: with a remote `origin`, `origin/main` is read as `main`.
2. Fetch it with `git fetch <r> +refs/heads/<b>:refs/remotes/<r>/<b>`. A fetch that fails ends the run `blocked`, naming the branch.
3. The merge-base is `git merge-base refs/remotes/<r>/<b> <head>`, printed as a full sha, with `<head>` the local branch after 0.7. Hold it. Every review target and every line count of Step 1 is the three-dot range from it.

## 0.7 The head

1. A pull request's head branch `<head>` is fetched with the explicit refspec `git fetch <r> +refs/heads/<head>:refs/remotes/<r>/<head>`. A fetch that fails ends the run `blocked`, naming the branch. A branch target's head is the branch of 0.4.3, fetched the same way when it exists on the remote; one that exists nowhere on the remote has no remote head to keep.
2. Keep `git rev-parse refs/remotes/<r>/<head>` as the fetched remote head. Step 2 compares it before every push, and then the last sha this run pushed.
3. When a local branch `<head>` exists, its tip must be at or behind the remote head (`git merge-base --is-ancestor refs/heads/<head> refs/remotes/<r>/<head>`). Behind: fast-forward it with `git merge --ff-only refs/remotes/<r>/<head>` after the checkout. Ahead or diverged ends the run `blocked`, naming the branch. Never reset.
4. Check out the head once 0.5 has passed: `git checkout <head>`, or `git checkout -b <head> refs/remotes/<r>/<head>` when no local branch exists. A branch target is already on its branch.

## 0.8 The record

1. The record is `.reimagine/gate/<slug>/` in the target's repository, the slug as SKILL.md, Record, says.
2. Run `git check-ignore -q .reimagine/`, with the trailing slash, since without it git reads a directory that does not exist yet as not ignored. When it fails, append `.reimagine/` to the file that `git rev-parse --git-path info/exclude` names, never `.gitignore`. Never stage anything under it.
3. Create the record directory unless it exists.
4. An existing `passes.json` whose `branch` differs from this run's branch is a slug collision and ends the run `blocked`.
5. Create `passes.json` when absent, with `branch` (the exact name), `base` (`<b>`), `merge_base` (0.6), `targets` (`github:<owner>/<repo>#<n>` for a pull request, else the branch name), `engine` (the block's Engine line: `subprocess` or `stand-in`), `"runs": []` and `"passes": []`.
6. Append the run entry `{"n": <run>, "started": <utc>, "ended": null, "state": "running"}`, `<run>` being 1 on a new file and one more than the highest `n` in `runs` otherwise. In the same write, an earlier entry still `running`, left by a run that never reached a terminal state, gets `"state": "interrupted"`, its `ended` left `null`. On an existing file change nothing else here; the merge-base and the head wait in memory for Resume.
7. Write every record file whole to `<record>/<name>.tmp`, then move it over the file with `mv <tmp> <file>`, no flags, both paths absolute, keeping every entry you did not change.

With no pass in `passes.json`, read `steps/1-pass.md` and run pass 1 at `xhigh`; otherwise read `steps/3-next.md`, section Resume, which decides where the run starts.

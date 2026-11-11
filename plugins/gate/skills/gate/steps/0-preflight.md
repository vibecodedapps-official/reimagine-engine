# Step 0: Preflight

Read this file after the reading block, and take the targets in the order of its Targets line. Each target goes through Steps 0 to 3 and its terminal state before the next one starts. `<scripts>` in the step files is the path on the block's Scripts line, and `<r>` is the target's remote: the one whose fetch URL matches the `url` of `gh repo view --json nameWithOwner,url`, else `origin`.

- Take `date -u +%Y-%m-%dT%H:%M:%SZ` now and keep the output as the run's start; take it again at the start of each later target.
- Run read-only commands one at a time, and retry a dropped read once.
- Nothing is written before the record below. Fetched refs are not writes.
- A stop in this step ends the run `blocked` or `stopped`, as its item says.

## Instruction files and the permission statement

Do this once, before the first fetch. With a manifest, read every bundle's repository and union the rules.

1. Read the user's instruction files in `$CLAUDE_CONFIG_DIR` when it is set, else in `~/.claude`, never both, since the session loads only that directory. From the target's root, read `CLAUDE.md`, `AGENTS.md`, `.claude/CLAUDE.md` and every file they import, and `CLAUDE.md` and `.claude/CLAUDE.md` in each folder above the root, and in each folder from the root down to the session's folder when the session started below it, which the session loads as project instructions. Record every ask-first rule with the file it came from.
2. Read `.reimagine.json` at the root. A file that does not parse ends the run `blocked`.
3. Print the permission statement. It gives the approved and the always-ask actions (SKILL.md, Approval scope), the instruction directory read, the ask-first rules found with their files, the run's checks with their source, or that no check will run, and for each action of the run whether it will prompt: fetch, the reads of a remote's refs (`git ls-remote`), checkout, the exclude file and the record, the child sessions, the subagents, the checks, the `node` scripts, the commit and the push. Judge each from the permission mode the session states and the allow, ask and deny rules of the user, project and local settings files. An action runs unprompted only when the mode approves it, or an allow rule matches its command and no ask or deny rule does. A command in the `git -C` or `cd` form of a target that runs from outside the session's folder is not pre-approved, and an outcome you cannot determine counts as a prompt. A push that triggers a deploy always prompts and is judged before each push, so outside "no fixes" the Prompts line ends with `deploy: judged before each push`. End with "this run will prompt at: <list>" or "this run is unattended".

```
Approved for this run: fix commits on each target's branch, push it.
Always asked: force push, --no-verify, merge, rebase, amend, reset, deploy, repository settings, a new issue. Instruction directory read: ~/.claude. Ask-first rules found: 2 (<root>/CLAUDE.md).
Prompts: fetch: no; remote refs: yes; checkout: no; exclude and record: yes (no allow rule); child sessions: yes; subagents: no; checks: yes; node scripts: yes; commit: yes; push: yes; deploy: judged before each push
this run will prompt at: the reads of the remote's refs, the record, the child sessions, the checks, the node scripts, the commit, the push, and before a push that triggers a deploy
```

## The target

1. On GitHub, a `gh` that is not authenticated, tested with the `gh repo view` above, ends the run `blocked`. A branch or a bundle on another host needs no `gh`.
2. Read a pull request with `gh pr view <n> --json number,url,state,headRefName,baseRefName,isCrossRepository`. One that is merged or closed ends the run `blocked`. One from a fork is an unresolved target: skip it.
3. A branch target's head is the branch `git rev-parse --abbrev-ref HEAD` prints. `HEAD`, a detached head, ends the run `blocked`.

## Clean tree

Before any checkout, `git status --porcelain` must print nothing, untracked files that are not ignored included, and `git diff --cached --quiet` must succeed. Otherwise the run ends `blocked`, naming what is dirty.

## Base and merge-base

1. The base `<b>` is as SKILL.md, The request, says. The remote's default branch is `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`, or on another host the branch `git ls-remote --symref <r> HEAD` names.
2. Fetch it with `git fetch <r> +refs/heads/<b>:refs/remotes/<r>/<b>`. A fetch that fails ends the run `blocked`, naming the branch.
3. The merge-base is `git merge-base refs/remotes/<r>/<b> <head>`, as a full sha, with `<head>` the local branch after the next section. Every review target and every line count is the three-dot range from it.

## The head

1. Fetch a pull request's head branch with `git fetch <r> +refs/heads/<head>:refs/remotes/<r>/<head>`; a fetch that fails ends the run `blocked`, naming the branch. Fetch a branch target's head the same way when it exists on the remote.
2. Keep `git rev-parse refs/remotes/<r>/<head>` as the fetched remote head, but only when that fetch found the branch, since a tracking ref can outlive a branch deleted on the remote. Step 2 compares it before every push.
3. With a fetched remote head and a local branch `<head>`, the local tip must be at or behind it: `git merge-base --is-ancestor refs/heads/<head> refs/remotes/<r>/<head>`. Behind, fast-forward it with `git merge --ff-only refs/remotes/<r>/<head>` after the checkout; that moves the branch to its own remote head and is part of the checkout, not a merge of the always-ask list. Ahead or diverged ends the run `blocked`, naming the branch, with one exception: a tip one commit ahead whose parent is the remote head, when `node "<scripts>/resume.mjs" <absolute passes.json> <tip>`, run on the `passes.json` of this branch's record (The record, item 1) with the tip's full sha, prints `{"unpushed": true}`. That is a commit an earlier run made and did not push, and Resume pushes it. A non-zero exit, as when the branch has no record, gives no exception.
4. Once the tree is clean, check out the head: `git checkout <head>`, or `git checkout -b <head> refs/remotes/<r>/<head>` when no local branch exists. A branch target is already on its branch.

## The record

1. The record is `.reimagine/gate/<slug>/` under the root, the slug as SKILL.md, Record, says.
2. Run `git check-ignore -q .reimagine/`, with the trailing slash, since git reads a directory that does not exist yet as not ignored without it. When it fails, append `.reimagine/` to the file that `git rev-parse --git-path info/exclude` names, read relative to the root when it is not absolute, never to `.gitignore`.
3. Create the record directory unless it exists. An existing `passes.json` whose `branch` differs from this run's branch is a slug collision and ends the run `blocked`, naming both branches.
4. Create `passes.json` when it is absent, with `branch` (the exact name), `base`, `merge_base`, `targets` (`github:<owner>/<repo>#<n>` for a pull request, else the branch name), `engine` (`subprocess` or `stand-in`, as the block's Engine line says), `"runs": []` and `"passes": []`.
5. Append the run entry `{"n": <run>, "started": <utc>, "ended": null, "state": "running"}`, `<run>` being one more than the highest `n` in `runs`. In the same write, an earlier entry still `running`, left by a run that never reached a terminal state, becomes `"state": "interrupted"`. Change nothing else of an existing file here. Every write of a record file follows `record.md`, Write discipline.

With no pass in `passes.json`, read `steps/1-pass.md` and run pass 1 at `xhigh`. Otherwise the run goes to `steps/3-next.md`, section Resume, which decides where it starts.

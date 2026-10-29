# Step 2: The fix round

Read this file when Step 1 ends with a non-empty fix bucket in a run that is not "no fixes". SKILL.md stays in force: its Approval scope, Roles, Levels and caps and Terminal states apply to every item here. Nothing is edited while a review runs, and nothing before this step.

Run `date -u +%Y-%m-%dT%H:%M:%SZ` before and after each implementer call and each check, and keep the output for the report's Log. Every write of `passes.json` and `findings.json` follows `record.md`, the write discipline. Every file named here without a directory lives in the record. Every ending `blocked` below records the pass `failed` with its `ended`, writes the `changes` and `checks` known so far, leaves `next` null, and then ends the run (SKILL.md, Terminal states).

## Groups

1. Sort the pass's fix bucket into groups so that no file is in two groups: findings that name the same file go in one group, and a finding whose failure scenario spans several files puts all of them in one group, merging the groups it touches.
2. One implementer per group: an Agent at `models.implementer` (default `sonnet`), passing `model` explicitly. Never use a fork.
3. Groups with independent files run as parallel Agent calls in one message. When one group's files depend on another's (one imports from the other), run them one at a time. An implementer runs no checks; the checks are yours, below.
4. Each call has the subagent budget. A call that returns past that, or ends in a tool error, is a failed call. There is no fallback implementer.

## Snapshots

Take a snapshot before every implementer call, including a check fix.

1. Write three files in the record: `pre-<n>.status` holds the output of `git status --porcelain --untracked-files=all`; `pre-<n>.patch` holds the output of `git diff`; `pre-<n>.hashes` holds one line per untracked, non-ignored file outside `.reimagine/`, the output of `git hash-object -- <path>` followed by the path. `n` is one more than the highest `pre-<n>` in the record, across runs.
2. A parallel batch takes one snapshot per group before any call of the batch starts.
3. After a failed call, compare the tree with its snapshot: status, diff and hashes. For a parallel batch compare after every call of the batch has returned.
4. Restore every path that was clean before the call and is now new or changed, the group's own files included: a tracked file with `git checkout -- <path>`, an untracked non-ignored file by deleting it; never touch an ignored path or anything under `.reimagine/`.
5. A path that was already dirty before the call and now differs, or an untracked file whose hash changed, is left as it is and named in the report.
6. Then end the run `blocked`, naming the call and, for a call past its budget, the subagent budget. A failed call is not a round and not a swap.

## Implementer brief

Write one brief per group and pass it as the whole prompt of the implementer. It holds:

1. The group's findings, each with its file, line, summary, failure scenario and the triage reason. The summary, line and reason come from `findings.json` and the pass's `passes.json` entry; the failure scenario comes from the finding in the pass's saved review output.
2. The instruction file paths to read first (the user's and the repository's, from preflight); a rule the host loaded for those files is binding.
3. The checkout path the implementer edits. Every path in the brief is absolute.
4. The repository's line-ending convention. Run `git ls-files --eol` on the group's files. When a file shows an `eol=` attribute, match it. When `text` or `text=auto` applies with no `eol=`, any ending is fine. Otherwise match the majority working-tree ending of the file's directory, else of the repository. The implementer never changes the line endings of a file it edits.
5. The scope rule: change nothing outside the group's files and add nothing the findings do not ask for; report instead of editing anything else. No git command that writes: do not stage, commit, push, stash, reset or clean. Do not install anything or run `gh`.
6. The budget: the subagent budget in force, in minutes.
7. The reply shape: files changed, and anything it could not do.

## Reading the fix

After every call has returned, list the changed paths with `git status --porcelain --untracked-files=all` and read them: `git diff -- <paths>` for tracked files, the file itself for a new one, then `git ls-files --eol -- <paths>`. A new file whose working-tree ending differs from the expected one is a defect: send it back to its implementer once, after a snapshot. A file outside every group's files is restored as Snapshots, item 4, restores a path, and named in the report.

Judge the fix round's change kinds and write them into `changes`. The diff the pass reviewed is the files of `git diff --name-only <merge-base>...<head at the pass's start>`, with the full sha of the merge-base; the head at the pass's start is the branch head now, since nothing has been committed. List every kind that applies, using only these words:

- `inside-diff`: every changed file is in that diff.
- `outside-diff`: at least one changed file is not.
- `exported-signature`: an exported function, class, type or public API signature changed.
- `schema-or-migration`: a schema or migration file changed.
- `over-quarter`: the fix round changed more than a quarter of that diff's files. Count both lists: it applies when four times the number of changed files is more than the number of that diff's files, so 2 changed of 4 is over a quarter and 2 of 8 is not.

A fix round that changed nothing is `[]`.

## Checks

1. Run the run's checks (SKILL.md, Reading the request) one command at a time, in order, each within the check budget. With no source, meaning no phrase, no bundle `checks` and no `checks` key in `.reimagine.json`, nothing runs, the pass's `checks` stays empty and the report says no check ran.
2. Record each as `{"command": "<command>", "result": "pass"|"fail"|"denied"}`. A check refused by the permission mode is `denied`: never retry it and never run it another way; go on to the next.
3. A check past its budget is a failed call: end the run `blocked`, naming the check budget and the check.
4. A failing check is fixed through the implementer that owns the failing code, in the same round: take a snapshot, send the failure output to that implementer (SendMessage, else a fresh implementer with the failure and its group's current diff), read the fix as above, and run the whole list again. Fix a check at most three times in all; a check still failing after the third ends the run `blocked`, naming the check.

## The commit

A fix round that changed nothing commits nothing: write `commit` as null and `head` as `git rev-parse HEAD`, and skip to Writing the record.

1. Read the commit convention from the user's and the repository's instruction files and from `git log -n 10 --format=%s`. The commit message follows it and names no model, agent or tool. Type no attribution trailer of your own, and keep one the host's attribution setting adds, even where it names a model or tool.
2. Ask-first rules recorded at preflight still prompt before the commit (SKILL.md, Approval scope).
3. Stage each path by name with `git add -- <path>`, one call per path, only the paths the fix round changed, never anything under `.reimagine/`. Then run `git diff --cached --name-only` and confirm it lists exactly those paths.
4. Make one commit for the pass with `git commit -m <subject>`, with a second `-m <body>` when the convention has a body. Read the sha with `git rev-parse HEAD`.
5. A commit that is denied, or that fails, ends the run `blocked` with the pass recorded `failed` and the tree left as it is.
6. Once the commit exists, set each fix-bucket entry of this pass in `findings.json` to state `fixed`.

## The remote head and the push

1. Read the remote head with `git ls-remote <remote> refs/heads/<branch>`, the remote and branch being those of preflight.
2. Compare it with what preflight fetched or with the last sha this run pushed. A head that is neither ends the run `blocked`; keep the local commit and name its sha, the remote head and the branch in the report.
3. Push the branch with `git push <remote> <branch>`, no force. A denied push ends the run `blocked` with the pass recorded `failed`; the local commit is kept and named.
4. This push is the run's last pushed sha from here on: read `git rev-parse HEAD` after it.

## Writing the record

Write the pass entry's `changes`, `checks`, `commit` (the sha, or null) and `head` (the output of `git rev-parse HEAD`) in one write, the pass still `running`. Step 3 completes it.

With the record written, read `steps/3-next.md`.

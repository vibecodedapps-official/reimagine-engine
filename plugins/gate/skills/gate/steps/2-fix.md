# Step 2: The fix round

Read this file after a triage that leaves something to fix, outside "no fixes". Take `date -u +%Y-%m-%dT%H:%M:%SZ` before and after each implementer call or parallel batch and each check, for the report's Log. A file named here without a directory is in the record.

Every `blocked` ending below records the pass `failed` with its `ended`, the `changes` and `checks` known so far and, once the commit exists, its sha as `commit`, with `next` left null. A commit recorded so and not pushed is a kept commit, which the next run on the branch pushes when its parent is still the remote head (`steps/3-next.md`, Resume).

## Groups and implementers

1. Sort the fix bucket into groups so that no file is in two groups: findings on one file share a group, and a finding whose failure scenario spans several files merges the groups it touches.
2. Each group gets one implementer: an Agent at `models.implementer`, with `model` passed explicitly, never a fork. Groups whose files are independent run as parallel calls in one message. When one group's files import from another's, they run one at a time. An implementer runs no checks.
3. A call that ends in a tool error, or returns past the subagent budget, is a failed call. Judge the time by the `duration_ms` of its completion notice, and by the `date` outputs only when the notice carries none. There is no fallback implementer.

## The brief

The brief is the implementer's whole prompt, one per group:

- The group's findings, each with its file, line, summary, failure scenario and triage reason. The failure scenario comes from the saved review output, the rest from the record.
- The instruction files to read first, the user's and the repository's. A rule the host loaded for those files binds too.
- The checkout path. Every path in the brief is absolute.
- The line endings to keep, from `git ls-files --eol` on the group's files: an `eol=` attribute is matched; `text` or `text=auto` with no `eol=` allows any ending; otherwise the majority ending of the file's directory, else of the repository. An implementer never changes the endings of a file it edits.
- The scope: change nothing outside the group's files, add nothing the findings do not ask for, and report anything else instead of editing it. No git command that writes, no install, no `gh`, and no background command, since one that ends after the call returns wakes the call again.
- The subagent budget in minutes, and the reply wanted: the files changed and anything it could not do.

## Snapshots

Take a snapshot before every implementer call, a check fix included, and for a parallel batch one per group before any call starts. It is three files, `<k>` being one more than the highest `pre-<k>` in the record, across runs: `pre-<k>.status` holds the output of `git status --porcelain --untracked-files=all`, `pre-<k>.patch` the output of `git diff`, and `pre-<k>.hashes` one line per untracked, non-ignored file outside `.reimagine/`, the output of `git hash-object -- <path>` and then the path. Read a path from a status line unquoted and unescaped when status prints it in double quotes, and take the new path of a rename.

When a call returns, write `post-<k>.status`, the same status output, and `post-<k>.hashes`, one line per path the status lists outside `.reimagine/`: the output of `git hash-object --no-filters -- <path>` and then the path, or `deleted` for a path that is gone. For a batch, write them once every call has returned.

After a failed call, compare the tree with the snapshot, for a batch once every call has returned. Restore every path that was clean before the call and is now new or changed, the group's own files included: a tracked file with `git checkout -- <path>`, an untracked non-ignored file by deleting it. Never touch an ignored path or anything under `.reimagine/`. A path that was already dirty and now differs, or an untracked file whose hash changed, is left as it is and named in the report. Then end the run `blocked`, naming the call and, when it ran past it, the subagent budget. A failed call is never retried or swapped.

A notice for an implementer call that already returned is not a new call. Log it, then compare the checkout with that call's `post-<k>` files, hashing as they were hashed. A path that differs, and that no later call, check fix or commit of the run changed, ends the run `blocked`, naming the path, with the tree left as it is. Any other late notice, or one for an agent this run did not launch, is logged and changes nothing.

## Reading the fix

After every call has returned, list the changed paths with `git status --porcelain --untracked-files=all` and read them: `git diff -- <paths>` for tracked files, the file itself for a new one, then `git ls-files --eol -- <paths>`. A new file with the wrong line ending goes back to its implementer once, after a snapshot. A changed file outside every group's files is restored as Snapshots restores a path, and named in the report.

Then work out the round's `files`, the changed paths, repository-relative with forward slashes, which `next.mjs` reads to tell a correction to this round from a new defect, and its `changes`, every kind that applies, in these words only. Both are written with the commit. The diff the pass reviewed is the files of `git diff --name-only <merge-base>...HEAD`, read before the commit. A round that changed nothing has `[]` for both.

- `inside-diff`: every changed file is in that diff.
- `outside-diff`: at least one changed file is not.
- `exported-signature`: an exported function, class, type or public API signature changed.
- `schema-or-migration`: a schema or migration file changed.
- `docs-only`: every changed file is documentation: prose for people that no build, test or runtime reads, such as a README, a changelog or a design document. A file the host loads as instructions, such as a `CLAUDE.md` or `AGENTS.md`, a rule, a skill or step file, an agent or prompt file, is not documentation, nor is code or configuration; a document that an instruction file only tells an agent to read is.

## Checks

Run the run's checks one command at a time, in order, and record each as `{"command": "<command>", "result": "pass"|"fail"|"denied"}`. With no checks, nothing runs and `checks` stays empty.

- Each check has the check budget as the Bash call's timeout, since the default is 2 minutes. A budget over 10 minutes, the shell's foreground limit, runs with `run_in_background` beside a background `sleep` of the budget in seconds; whichever ends first, the other is stopped with TaskStop. A check past its budget ends the run `blocked`, naming the check and the budget.
- A check the permission mode refuses is `denied`: it is never retried and never run another way, and the next one runs.
- A failing check is fixed in the same round by the implementer that owns the failing code. Take a snapshot, send that implementer the failure output (SendMessage, else a fresh implementer with the failure and its group's current diff), read the fix as above, and run the whole list again. There are at most three check fixes in all; a check still failing after the third ends the run `blocked`, naming the check.

## The commit

A round that changed nothing commits nothing: go to the last section.

1. The message follows the commit convention of the instruction files and of `git log -n 10 --format=%s`. It names no model, agent, tool, review pass or level, and no term the suite or a run coined. Type no attribution trailer, and keep one the host's attribution setting adds.
2. An ask-first rule recorded at preflight still prompts before the commit.
3. Run `git status --porcelain --untracked-files=all` again. A path outside every group's files, such as a file a check regenerated, is restored and named in the report. Stage each path the round changed by name, `git add -- <path>`, one call per path, and confirm that `git diff --cached --name-only` lists exactly those paths.
4. Make one commit for the pass, `git commit -m <subject>`, with a second `-m <body>` when the convention has a body. A commit that is denied or fails ends the run `blocked`, with the tree left as it is.
5. Read the sha with `git rev-parse HEAD` and, before anything else, write the pass's `changes`, `files`, `checks` and `commit` in one write, the pass still `running`: a run that stops before the push then leaves a record that names the commit. Then set each fix-bucket entry of the pass to `fixed` in `findings.json`.

## The push

1. Before each push, judge whether it triggers a deploy. Read the workflow files of the base branch and of the commit being pushed: `git ls-tree --full-tree --name-only <ref> .github/workflows/` lists them, `<ref>` being `refs/remotes/<r>/<b>` and then `HEAD`, and `git show "<ref>:<file>"` prints each one that ends in `.yml` or `.yaml`, `<file>` being the repository-relative path as listed, unquoted. A `push` trigger counts, and so does a `pull_request` trigger when the branch has an open pull request, each with its filters as GitHub applies them to this push. `gh pr list --head <branch> --state open --json number,baseRefName` shows whether a branch target has one. A `pull_request_target` workflow is judged from the base branch's file. A workflow that deploys in either set counts, and so does a deploy the files cannot settle, such as an open pull request whose base is not `<b>`. When the push triggers a deploy, ask first, naming the workflow; any answer but a clear yes is a denial of the push. A yes covers that push only, since a fix round can change what the next push deploys.
2. Read the remote head with `git ls-remote <r> refs/heads/<branch>`. It must be the head preflight fetched or the last sha this run pushed. Any other head ends the run `blocked`, with the local commit kept and its sha, the remote head and the branch named in the report.
3. Push with `git push <r> <branch>`, never forced. A denied or failed push ends the run `blocked`, the local commit kept and named.
4. From here the run's last pushed sha is the output of `git rev-parse HEAD`.

## The record

Write the pass's `head`, the output of `git rev-parse HEAD`, in one write, the pass still `running`. For a round that changed nothing, the same write holds its `changes`, `files`, `checks` and a null `commit`.

Next is `steps/3-next.md`.

---
name: gate
description: 'Run code-review passes over a pull request, several, or a loop manifest, fix what each pass finds, and stop at a verdict. Use when the user says "reimagine gate", "gate this branch", "gate PR [n]" or "gate the manifest [path]".'
allowed-tools:
  - Bash(date)
  - Bash(date *)
  - Bash(sleep *)
  - Bash(git status *)
  - Bash(git ls-tree *)
  - Bash(git rev-parse *)
  - Bash(git merge-base *)
  - Bash(git branch --list *)
  - Bash(git check-ignore *)
  - Bash(git check-ref-format *)
  - Bash(git remote -v)
  - Bash(git ls-files *)
  - Bash(git cat-file *)
  - Bash(git hash-object *)
  - Bash(git worktree list *)
  - Bash(git config --get *)
  - Bash(gh repo view *)
  - Bash(gh issue view *)
  - Bash(gh issue list *)
  - Bash(gh pr view *)
  - Bash(gh pr list *)
  - Bash(gh pr checks *)
  - Bash(gh run list *)
  - Bash(gh run view *)
---

# gate

You orchestrate one run over one pull request, several, or a loop manifest. A pass is one `code-review` of the whole change from the merge-base, a triage of what it found, a fix round by implementers and a decision on what comes next. Three scripts decide what must be exact: `split.mjs` the reviews of a pass, `findings.mjs` the identity of a finding across passes, `next.mjs` the next level or the stop. The allowed-tools list pre-approves only date, sleep and read-only git and gh in their plain forms; every write, push, script and child session stays under the session's permission mode. In a command the skill shows, a placeholder for a path, such as `<root>` or `<record>`, stands for the absolute path in double quotes, since a folder name may hold a space.

## The request

The request is the words that came with the invocation: "reimagine gate PR 73", "gate this branch, no fixes", or the same after `/gate`. There are no flags, so a token that starts with `--` is prose. Only these phrases are read:

- "PR <n>", "<n> and <m>" and a pull request URL: the targets.
- "the manifest <path>": one record per bundle of that manifest.
- "this branch": the current branch against its base. With no target at all, this is what runs.
- "repo <path>": the branch checked out at that path, in place of the session's.
- "no fixes": pass 1 only, and nothing is edited.
- "budget <n> minutes": the run budget.
- "base <branch>": the base of a branch target.
- "checks <command>[; <command>]": the checks of the fix round. The phrase runs to the next comma that another phrase of this list follows, else to the end of the request, since a command may hold a comma; split it at `;`.

Targets. A pull request must be open, in the session's repository and not from a fork; several run one after another in the order given, each with its own record. A manifest is the loop's `audit-manifest.json` or a file of its shape, and runs one record per `bundles[]` entry that has a `pr` or a `branch`, in bundle order. The path of "repo <path>" must be a git toplevel or a linked worktree: `git -C <path> rev-parse --is-inside-work-tree --show-prefix` prints `true` and then an empty line. Compare no path strings, and write a leading `~` as `$HOME`, since git does not expand a quoted `~`. A target that cannot be resolved, such as a pull request from a fork, a pull request number on a host other than GitHub, or "repo <path>" beside a pull request or a manifest, gets one line in the reading block and the run goes on with the others; with none left it ends `stopped`.

Roots. Every target has a root, the toplevel of its repository: a bundle's `repo`, the toplevel of "repo <path>", and otherwise the output of `git rev-parse --show-toplevel` in the session's folder. A target runs in place when the session's folder is its root, and from outside otherwise: a bundle, "repo <path>", and any target of a session started in a subfolder, where `git rev-parse --show-prefix` prints a path. From outside, every git command runs as `git -C "<root>" <command>` and every other command as `cd "<root>" && <command>` in one Bash call, since git prints the paths of a status from the root and reads the paths of `git add` and `git checkout` from the current folder. Those forms are not pre-approved. The record, `.reimagine.json`, the instruction files and the exclude file are always those of the root.

Base. A pull request's base is its `baseRefName`, and "base <branch>" naming another ends `blocked`, since the gate never retargets a pull request. A branch target's base is "base <branch>" in the request, else the bundle's `base`, else `.reimagine.json` `base`, else the remote's default branch. A bundle `base` whose first segment names a remote of that repository is read without it, since the loop writes `<remote>/<branch>`.

Checks. The run's checks come from the first source that gives any: the request, else the bundle's `checks` array, else `.reimagine.json` `checks`. The one list feeds the fix round, the child session's allowed tools, the permission statement and the report, which names the source. With no source no check runs, and the report says so.

Scripts. `${CLAUDE_PLUGIN_ROOT}` is empty in the session's shell. Resolve the scripts directory with no tool call, from the skill's base directory that the Skill tool printed when it loaded this skill: two levels above it, then `scripts`. Every command that runs a script writes that absolute path, shown here as `<scripts>`, never the variable.

## The reading block

Make only the read-only calls that resolve the targets and the engine: `git remote`, `git rev-parse`, `gh pr view`, a manifest read and `command -v claude`. Then print the block as your next text, before any other tool call:

```
Targets: PR #73 (gh) on feat/68-4567-export, base main; PR #74 (gh) on fix/70-retry, base main
Mode: fix
Budget: 120 minutes (default); max-passes 4; split 1500; parallel 3; subagent 20, review 30, check 15 minutes (default)
Engine: subprocess; reviewer opus, stand-in opus (default)
Scripts: <the plugin's directory>/scripts
```

Targets gives each target, how it resolved and its base, with its root when it runs from outside the session's folder. Mode is `fix` or `no fixes`. Budget gives the run budget and its source, then `max-passes`, `split` and `parallel`, then the subagent, review and check budgets, each with its source when it is not the default. Engine is `subprocess`, or `stand-in` with the reason, then the model of the reviewer and of the stand-in, each with its source when it is not the default; when the repositories of a manifest set different models, each repository's models follow its path. A configuration key that is unknown or has a bad value is reported in the block and ignored. The configuration read is the one at the target's root.

After the block, read `steps/0-preflight.md`.

## Approval scope

Invoking this skill by name approves, for this run only, fix commits on each target's branch and pushing that branch. Nothing else is approved: no branch, no pull request, no comment, no body edit, no ticket comment and no issue.

1. Instruction files win. Before changing anything, read the user's instruction files, the repository's, those of each folder above its root, and `.reimagine.json`. Record every ask-first rule, and prompt for any approved action a rule covers.
2. Always ask before a force push, `--no-verify`, a merge, rebase, amend or reset, anything that deploys, a push that triggers a deploy, a change to repository settings and a new issue.
3. A denial is final. What the user or the permission mode denies is never retried and never done another way. A denied commit or push ends the run `blocked`, with the pass recorded `failed` and the tree left as it is. A denied check is recorded as denied, and the next one runs.
4. The gate never stashes, resets, cleans or forces, and never stages anything under `.reimagine/`.

## What leaves the run

The gate posts nothing to a forge. Its findings, deferred list, checks, commits and verdict live in `passes.json`, `findings.json` and `report.md` in the record, and the report is printed as the run's last message. A fix push leaves a pull request's description on the head before it; the gate does not edit it, and the report says so.

- Write what leaves the session for its reader. A pull request says only what its reviewer needs about the code at its current head. A ticket or comment says what changed for its readers, what happens next and who decides, at the detail they act on, never how it was reached. Working output, such as logs, commit ids, verdicts and terms a plugin or the session coined, stays local or in an attachment. Publish only when that is the task's stated purpose or I asked, and only what the reader will act on and would say themselves.

## Roles

| Role | Who | When it fails |
|---|---|---|
| orchestrator, triage | the session model | the run stops |
| reviewer | a child session per review, `claude -p "/code-review <level> <range>"`, at `models.reviewer` | the stand-in, when `claude` is not on the PATH or the child reports the `code-review` skill missing (`steps/1-pass.md`, The stand-in) |
| reader | read-only Agents at `models.reader`, when a pass has more than 30 findings to sort | retried once, then the orchestrator reads that batch |
| implementer | an Agent at `models.implementer` per group of files | the tree is restored from its snapshot and the run ends `blocked` |

The gate never calls `code-review` through the Skill tool, and a level typed in a child session does not change the level the user last typed, so a run leaves the user's interactive level as it was.

## Levels, stops and caps

The first pass of a sequence runs at `xhigh`. After each pass you do not choose what follows: `next.mjs` reads the record and returns the next level or the stop, with the rule that produced it (`steps/3-next.md`). A run stops when a pass finds nothing to fix, or finds only a few corrections to the fix round before it, which are made and pass the checks. Only `xhigh`, `high` and `medium` are ever typed.

- The run budget is "budget <n> minutes" in the request, else `gate.budget`, else a session instruction, else the default. Waits for an answer are outside it.
- A cap on passes, the run budget or a review past its budget ends the run `unconverged` with every open finding listed. An implementer call or a check past its budget is a failed call and ends it `blocked`. What the pass saved is kept, and a pushed commit stays.

With "no fixes" the run makes pass 1 only: the review and the triage run, nothing is edited, committed or pushed, and the report names what a fix run would do.

## Configuration

`.reimagine.json` at the target's root may hold a `gate` key. Every value is optional; the values shown are the defaults.

```json
{
  "gate": {
    "split": 1500,
    "parallel": 3,
    "max-passes": 4,
    "budget": 120,
    "timeouts": { "subagent": 20, "review": 30, "check": 15 },
    "models": { "implementer": "sonnet", "reader": "sonnet", "reviewer": "opus", "fallback-reviewer": "opus" }
  }
}
```

- `split`: the changed lines above which a pass has one review per group of paths.
- `parallel`: the reviews of one pass that run at once. Each is a model session of its own, so a machine short of memory lowers it.
- `max-passes`: the passes one run may make.
- `budget`: the run budget in minutes.
- `timeouts`: the minutes of each implementer call (`subagent`), each review (`review`) and each check (`check`). A key absent here takes the root `timeouts` value of the same name, then the default.
- `models`: the model of each role, one of `sonnet`, `opus`, `haiku` and `fable`. The reviewer's is never the root `models` key, which is the loop's.

`split`, `parallel`, `max-passes` and `budget` are whole numbers of 1 or more, and `timeouts` holds positive numbers. A file that does not parse ends the run `blocked`.

## Terminal states

Every run ends in exactly one state, and then reads `steps/4-publish.md`.

- `pass`: a stop of `next.mjs`, or a "no fixes" run with an empty fix bucket, with nothing deferred in any pass of the run.
- `pass-with-deferred`: the same stop, with deferred findings in the report.
- `unconverged`: a cap was reached, a review failed, or a "no fixes" run has something to fix. Every open finding is listed.
- `blocked`: a preflight failure, a denied permission, a remote head that is neither preflight's nor the run's own, a failed implementer call, a failed push, a "no fixes" run that meets an unpushed commit of an earlier run, or a check still failing after three fixes. Nothing more is pushed; pushed commits stay and are named.
- `stopped`: no target resolved, or a question the run cannot decide, before any commit.

## Record

The record is `.reimagine/gate/<branch-slug>/` under the target's root: the branch name in lowercase, each run of characters outside `[a-z0-9]` written as `-`, cut to 60 characters, trailing `-` removed. `passes.json` in it is the only record of completion, and `record.md` describes every file. A second invocation on the same branch adds a run to the record, and `resume.mjs` reads it and returns where the run starts (`steps/3-next.md`, Resume).

## Supporting files

- `steps/0-preflight.md`: after the reading block, for each target in turn.
- `steps/1-pass.md`: at the start of each pass, for the reviews and the triage.
- `steps/2-fix.md`: after a triage that leaves something to fix, outside "no fixes".
- `steps/3-next.md`: after the fix round or a triage with nothing to fix, for the decision; its Resume section when preflight finds a record that holds passes.
- `steps/4-publish.md`: at every terminal state, for the run's end, the manifest, the report and the next target.
- `record.md`: when a step writes a record file.
- `report.md`: when the run ends, for the report.
- `scripts/split.mjs`: at the start of each pass, to size the change and group its paths into reviews.
- `scripts/findings.mjs`: after the reviews of a pass, to turn their saved output into the pass's findings and the ledger.
- `scripts/next.mjs`: after each fix round, to decide the next level or the stop.
- `scripts/resume.mjs`: when preflight finds a record that holds passes, to decide where the run starts.

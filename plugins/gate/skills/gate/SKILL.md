---
name: gate
description: 'Run code-review passes over a pull request, several, or a loop manifest, fix what each pass finds, and stop at a verdict when a pass finds nothing left to fix. Use when the user says "reimagine gate", "gate this branch", "gate PR <n>" or "gate the manifest <path>".'
allowed-tools:
  - Bash(date)
  - Bash(date *)
  - Bash(git status *)
  - Bash(git diff *)
  - Bash(git log *)
  - Bash(git show *)
  - Bash(git rev-parse *)
  - Bash(git merge-base *)
  - Bash(git branch --list *)
  - Bash(git ls-remote *)
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

The gate runs after the loop and before the audit: the loop ships a reviewed pull request, the gate converges the reviewer on it, the audit challenges the result.

You orchestrate one run over one pull request, several, or a loop manifest. You run `code-review` passes over the whole change from the merge-base, sort what each pass finds, have implementers fix what is worth fixing, decide from the record of the pass whether to run another and at what level, and stop at a verdict. The allowed-tools list pre-approves only date and read-only git and gh; every write, push and comment stays under the session's permission mode.

## Reading the request

The request is the words that came with the invocation: "reimagine gate PR 73", "gate this branch, no fixes", "gate the manifest <path>", or the same words after `/gate`. There are no flags: a token starting with `--` is prose, and the reading block shows how you read it.

Recognized phrases, and nothing else is read from the request:

- "PR <n>", "<n> and <m>" and a pull request URL: the targets.
- "the manifest <path>": run one record per bundle of that manifest.
- "this branch": gate the current branch against its base. With no target at all, this is what runs.
- "repo <path>": gate the branch checked out at that path in place of the session's, since a `cd` in one call does not carry to the next.
- "no fixes": make pass 1 only and edit nothing.
- "budget <n> minutes": set the run budget.
- "base <branch>": name the base branch of a branch target.
- "checks <command>[; <command>]": the checks the fix round runs. It runs to the next comma that another recognized phrase follows, such as ", no fixes", else to the end of the request, since a command may hold a comma; split it at `;` and trim each command.

A pull request target must be open, in the session's repository and not cross-repository. Its head branch is fetched with the explicit refspec and checked out, which needs a clean tree. Several pull requests run one after another in the order given, each with its own record. A manifest is the loop's `audit-manifest.json` or one of the same shape; it runs one record per `bundles[]` entry that has a `pr` or a `branch`, in bundle order, with every git and gh command running against that bundle's `repo`. A branch target or a manifest bundle on a host other than GitHub runs with the comment skipped, and the report says so. A pull request number on such a host cannot resolve, so it is an unresolved target.

The path of "repo <path>" must be a git toplevel or a linked worktree: `git -C <path> rev-parse --show-toplevel` prints that path, compared as absolute paths with forward slashes and no trailing slash, else the target is unresolved. The head branch is the one checked out there, and the preflight runs the target's commands in the forms of a manifest bundle's. Beside a pull request or manifest target, "repo <path>" is one unresolved line and the run continues with those targets, since they name their own repository.

For a pull request target the base is its `baseRefName`. For a branch target the base is "base <branch>" in the request, else the manifest bundle's `base`, else `.reimagine.json` `base`, else the remote's default branch, so a release or hotfix branch gated through a manifest is diffed against the base its bundle names. A bundle `base` whose first segment names a remote that `git remote` lists in the bundle's repository is read without that segment and its `/`, since the loop's manifest writes `<remote>/<base branch>`. Fetch the base with the explicit refspec `+refs/heads/<b>:refs/remotes/<r>/<b>`; a fetch that fails ends `blocked` naming the branch. Record the merge-base with the base. Every review target and every line count uses the three-dot range from it. "base <branch>" on a pull request target whose base differs ends `blocked`, because the gate never retargets a pull request.

The run's checks come from the first source that gives any: the request's "checks" phrase, else the manifest bundle's `checks`, else `.reimagine.json` `checks`. A bundle's `checks` is an array of command strings. The one list feeds the fix round's checks, the child session's allowed tools, the permission statement and the report, which names the source. With no source, no check runs and the report says so.

`${CLAUDE_PLUGIN_ROOT}` is not a shell variable. It is empty in the session's shell, so a command that types it runs `/scripts/...`. Resolve the scripts directory once, with no tool call, from the skill's base directory that the Skill tool printed when it loaded this skill: two levels above it, then `scripts`. Print it on the reading block's Scripts line. Every Bash command that runs a script writes that absolute path, never the variable.

Make only the read-only calls that resolve the targets and the engine: `git remote`, `gh pr view`, a manifest read and `command -v claude`. Then print the reading block as your next text, before any other tool call:

```
Targets: PR #73 (gh) on feat/68-4567-export, base main; PR #74 (gh) on fix/70-retry, base main
Mode: fix
Budget: 120 minutes (default); max-passes 4; split 1500; subagent 20, review 30, check 15 minutes (default)
Engine: subprocess
Scripts: <the plugin's directory>/scripts
```

Targets lists each pull request or branch, how it resolved and its base; a branch target named by "repo <path>" shows its resolved toplevel. Mode is `fix` or `no fixes`. Budget gives the minutes and their source, then `max-passes` and `split`, then the subagent, review and check budgets in force, each with its source (`gate.timeouts`, root `timeouts`) when it is not the default. Engine is `subprocess`, or the stand-in with the reason for it. Scripts is the absolute path of the plugin's scripts directory. A child session that later reports the `code-review` skill missing moves the run to the stand-in, and the report names that. A configuration key that is unknown or has a bad value is reported in the block and ignored.

A target that cannot be resolved gets one line in the block and the run continues with the others. When none is left, the run ends `stopped`.

After the block, read `steps/0-preflight.md` and start Step 0.

## Approval scope

Invoking this skill by name approves, for this run only: fix commits on each target's branch, whether or not the loop opened its pull request; pushing that branch; and one comment per run on each target pull request. Nothing else is approved: no branch, no pull request, no edit of a pull request body, no ticket comment and no issue.

1. Instruction files win. Before changing anything, read the user's instruction files in `$CLAUDE_CONFIG_DIR` when it is set, else in `~/.claude`, never both, the repository's instruction files and `.reimagine.json`. Record every ask-first rule and prompt for any approved action those rules cover.
2. Always ask. Force push, `--no-verify`, merge, rebase, amend, reset, editing repository settings and opening an issue always prompt.
3. A denial is final. A permission denied by the user or by the permission mode is never retried and never routed around. A denied commit or push ends the run `blocked`, with the pass recorded `failed` and the tree left as it is. A denied check is recorded as denied and never run another way.
4. Blocked at preflight and before a push. A dirty tree, meaning `git status --porcelain` prints anything or `git diff --cached --quiet` fails, ends `blocked`; the gate never stashes, resets or cleans. A merged or closed pull request ends `blocked`. On GitHub, a `gh` that is not authenticated ends `blocked`. Before every push, read the remote head with `git ls-remote` and compare it with what preflight fetched, or with the last sha this run pushed; a head that is neither ends `blocked` with the local commit kept and named. A record whose branch differs from the run's branch is a slug collision and ends `blocked`.

## Roles

| Role | Who | Fallback |
|---|---|---|
| orchestrator, triage | the session model | none; the run stops |
| reviewer | a child session: `claude -p "/code-review <level> <merge-base>...HEAD[ <path>]" --output-format json`, one per pass, or over `split` one per group, by path at the shallowest depth that gives more than one group, a group still over `split` being grouped again one segment deeper | an Agent at `opus` over `diff-<n>[-<slug>].patch`, with the level as `effort`, when `claude` is not on the PATH or the child reports the skill missing; it stays for the run |
| implementer | an Agent at `sonnet`, one per disjoint file group, parallel when disjoint | none; a tool error ends `blocked` after the snapshot restore |

The `models` key of the configuration changes the implementer and the stand-in reviewer. The gate never calls `code-review` through the Skill tool, and a level typed in a child session does not change the level the user last typed, so a run leaves the user's interactive level as it was; the report says so in one line.

## Levels and caps

A pass is one review of the whole change from the merge-base at one typed level, then the triage, the fix round and the next-level decision. Pass 1 runs at `xhigh`. Every level a run types lies between a floor of `medium` and a ceiling of `xhigh`: only `xhigh`, `high` and `medium` are ever typed, and never `low`, `max` or `ultra`.

You do not choose the next level. After the fix round, `next.mjs` reads the record and returns the next level or a stop with the rule that produced it. The rules apply in this order:

1. The latest pass's fix bucket is empty and its reject bucket holds nothing new: stop with `pass`, or `pass-with-deferred` when any pass of the run deferred something.
2. The latest pass ran at `medium`: stop, with `pass` or `pass-with-deferred` when its fix bucket was empty and `unconverged` otherwise.
3. The fix round changed an exported signature, a schema or migration, a file outside the original diff, or more than a quarter of the diff's files: `xhigh`, at most once per run after pass 1.
4. The two latest passes both ran at `high`, each with an empty fix bucket and a reject bucket holding something new: `medium`.
5. Otherwise `high`.

Caps:

- `max-passes` (default 4) bounds the passes of one run. When the passes have reached it, the script still returns the rule's level and marks it `capped`, and you end the run `unconverged`. A later run resumes from that level.
- The run budget is 120 minutes. "budget <n> minutes" in the request wins, then `.reimagine.json` `gate.budget`, then a session instruction. Question waits are outside it.
- Each review has the review budget, the reviews of a split pass running together within it. Each implementer call has the subagent budget and each check the check budget. The defaults are 30, 20 and 15 minutes; `gate.timeouts` and the root `timeouts` set them as Configuration says.
- Reaching `max-passes` with a level still to run, the run budget or the review budget ends the run `unconverged` with every open finding listed. An implementer call or a check past its budget is a failed call and ends `blocked`. The output of the pass is kept and a pushed commit stays.
- Never pass silently: a cap that ends the run is named in the report.

With "no fixes" the run makes pass 1 only. The review and the triage run, nothing is edited, committed or pushed, and the comment and the report name what a fix run would do. The verdict is `pass` or `pass-with-deferred` when the fix bucket is empty, else `unconverged`.

## Configuration

`.reimagine.json` at the repository root may hold a `gate` key beside the loop's. Every value is optional; the values shown are the defaults.

```json
{
  "gate": {
    "split": 1500,
    "max-passes": 4,
    "budget": 120,
    "timeouts": { "subagent": 20, "review": 30, "check": 15 },
    "models": { "implementer": "sonnet", "fallback-reviewer": "opus" }
  }
}
```

- `split`: the changed lines above which a pass reviews by path at the shallowest depth that gives more than one group, in parallel; a group still over `split` is grouped again one segment deeper.
- `max-passes`: the passes one run may make.
- `budget`: the run budget in minutes.
- `timeouts`: the minutes of each implementer call (`subagent`), each review (`review`) and each check (`check`), positive numbers as the loop's `timeouts` takes them. A key absent from `gate.timeouts` takes the root `.reimagine.json` `timeouts` value of the same name, then the default.
- `models`: the model of the implementer and of the stand-in reviewer.

`split`, `max-passes` and `budget` are whole numbers of 1 or more. `timeouts` holds positive numbers. `models` accepts only `sonnet`, `opus`, `haiku` and `fable`. An unknown key or a bad value is reported in the reading block and ignored. A file that does not parse ends `blocked`. The root `base` key applies as Reading the request says.

## Terminal states

Every run ends in exactly one state.

- `pass`: a stop with the fix bucket empty and nothing deferred in any pass of the run, under rule 1 or 2 or under "no fixes".
- `pass-with-deferred`: the same stop, with deferred findings that go to the comment and the report.
- `unconverged`: a cap was reached, a review failed, a `medium` pass still found something to fix, or a "no fixes" run has a non-empty fix bucket. Every open finding is listed.
- `blocked`: a preflight failure, a denied permission, a remote head that is neither preflight's nor the run's own, a failed implementer call, or a check still failing after three fixes.
- `stopped`: no target resolved, or a question the run cannot decide, before any commit.

After `blocked` nothing more is pushed or posted; pushed commits stay and are named.

Every terminal state reads `steps/4-publish.md` for the target that just ended, to write the run's end, the manifest, the comment and the report.

## Record

The record lives at `.reimagine/gate/<branch-slug>/` in the target repository. The slug is the branch name lowercased, with each run of characters outside `[a-z0-9]` replaced by `-`, cut to at most 60 characters, then trailing `-` removed. Add `.reimagine/` to the exclude file that `git rev-parse --git-path info/exclude` names, never to `.gitignore`, and never stage anything under it. `passes.json` keeps the exact branch name, and a differing branch is the slug collision of Approval scope.

The files:

- `passes.json`: the completion record.
- `findings.json`: the identity ledger across passes.
- `report.md`: rewritten at every terminal state.
- `review-<n>[-<slug>].json` or `.md`: each review's saved output.
- `pre-<n>.status`, `pre-<n>.patch` and `pre-<n>.hashes`: snapshots before implementer calls.
- `diff-<n>[-<slug>].patch`: a stand-in's input.
- `comment-<n>.md`: the comment as posted, never committed.
- `audit-manifest.json`: written when the run did not come from a manifest.

From run 2 on, a per-run name without a counter takes `-run<n>`.

`passes.json` is the only record of completion. An entry is written `running` when a pass starts and `complete` after the fix round and its commit, through a temporary file and a rename. A second invocation on the same branch appends a run to the record. When the head and the merge-base are those the last complete pass left, it resumes at the first pass not `complete`, else at the level in that pass's `next` with `max-passes` counted afresh, and a `next` that is a stop ends the run with that verdict, unless it is the `no-fixes` stop and this run fixes; a new head, or a changed merge-base, starts a new pass sequence at `xhigh` with the ledger kept, so earlier rejections carry.

## Supporting files

- `steps/0-preflight.md`: after the reading block, for each target in turn.
- `steps/1-pass.md`: at the start of each pass, for the review and the triage.
- `steps/2-fix.md`: after a triage that leaves a fix bucket, outside "no fixes".
- `steps/3-next.md`: after the fix round, or after a triage with nothing to fix or in "no fixes"; its Resume section when Step 0 finds a record that holds passes.
- `steps/4-publish.md`: at every terminal state, for the run's end, the manifest, the comment and the next target.
- `record.md`: when a step writes a record file, for the files, the `passes.json` and `findings.json` shapes and the write discipline.
- `report.md`: from Step 4, for the report's header and sections.
- `scripts/findings.mjs`: after each review, to turn its saved output into the pass's findings and the ledger.
- `scripts/next.mjs`: after each fix round, to decide the next level or the stop from `passes.json`.

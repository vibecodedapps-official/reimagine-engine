# gate

Run code-review passes over a pull request, several, or a loop manifest, fix what each pass finds, and stop at a verdict when a pass finds nothing left to fix. The gate runs after the loop and before the audit: the loop ships a reviewed pull request, the gate converges the reviewer on it, the audit challenges the result. It keeps a record keyed by branch, so running it again on the same branch continues where it stopped.

## Install

```
/plugin marketplace add vibecodedapps-official/reimagine-engine
/plugin install gate@reimagine-engine
```

## Use

Say it in plain words:

- `reimagine gate PR 73`
- `gate PR <n>`, or `gate PR 73 and 74`, or a pull request URL
- `gate this branch`
- `gate the manifest <path>`
- `/gate` followed by the same words

With no target, the current branch is gated against its base. There are no flags; a word starting with `--` is read as prose. The skill prints how it read your request before it does anything.

Phrases the gate recognizes:

- `no fixes`: make the first pass only. Nothing is edited, committed or pushed; the report and the comment say what a fix run would do.
- `budget <n> minutes`: set the run budget.
- `base <branch>`: name the base branch of a branch target. A pull request keeps its own base, so a different one stops the run.
- `checks <command>[; <command>]`: the commands the fix round runs after its fixes, in place of the repository's `checks` in `.reimagine.json`. It runs to the next comma that another recognized phrase follows, such as `, no fixes`, else to the end of the request, since a command may hold a comma. Separate commands with `;`.

A pull request must be open, in the repository of the session and not from a fork. Several run one after another, each with its own record. A manifest runs one record per bundle that has a pull request or a branch.

## What a run does

- Each pass reviews the whole change from the merge-base at one level. The first pass runs at `xhigh`; later passes run at `xhigh`, `high` or `medium` and never lower or higher. A change over `split` changed lines is reviewed by path at the shallowest depth that gives more than one group, in parallel; a group still over `split` is grouped again one segment deeper.
- Each finding is sorted into fix, defer or reject, with a reason. Only the fix bucket leads to code changes; deferred and rejected findings go to the report and the comment, never to code.
- Implementers fix the findings in the fix bucket. The run's checks run (from the request, the manifest bundle or `.reimagine.json`, in that order), a failing check is fixed at most three times, and a pass that changed anything ends with one commit and a push on the target's branch.
- The record decides the next level, or the stop, by fixed rules. A change that returns after being fixed is a regression and goes back to the fix bucket; a rejection that returns counts as nothing.
- At the end it posts one comment per run on each target pull request, and writes the report.

The gate never types a review level of `low`, `max` or `ultra`, and a run leaves the level you last chose in your own sessions as it was.

## What invoking approves

Invoking the gate by name approves, for that run only: fix commits on each target's branch, pushing that branch, and one comment per run on each target pull request. Nothing else: no new branch, no pull request, no edit of a pull request body, no ticket comment and no issue. Your instruction files win: an ask-first rule there still prompts.

These always ask: a force push, `--no-verify`, a merge, a rebase, an amend, a reset, a change to repository settings and a new issue. A permission you deny is final; the gate does not retry it or work around it, and a denied commit or push ends the run `blocked`. A dirty working tree ends the run `blocked` before it starts; the gate never stashes, resets or cleans.

## Configuration

An optional `.reimagine.json` at the repository root, with a `gate` key beside the loop's. Every value is optional; the values shown are the defaults.

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

`split` is the number of changed lines above which a pass reviews by path at the shallowest depth that gives more than one group, in parallel; a group still over `split` is grouped again one segment deeper. `max-passes` is the most passes one run makes, and `budget` is the run budget in minutes; the three are whole numbers of 1 or more. `timeouts` is the minutes of each implementer call (`subagent`), each review (`review`) and each check (`check`), positive numbers as the loop's `timeouts` takes them; a key absent from `gate.timeouts` takes the root `.reimagine.json` `timeouts` value of the same name, then the default. `models` names the model of the implementer and of the stand-in reviewer, each one of `sonnet`, `opus`, `haiku` or `fable`. Unknown keys and bad values are reported and ignored. A file that does not parse stops the run.

## How a run ends

- `pass`: a pass found nothing left to fix, and nothing was deferred.
- `pass-with-deferred`: the same, with deferred findings listed in the report and the comment.
- `unconverged`: the pass cap or the budget was reached, a review failed, a `medium` pass still found something to fix, or a `no fixes` run found something to fix. Every open finding is listed.
- `blocked`: a failed preflight, a denied permission, a remote branch that moved, a failed implementer call, or a check still failing after three fixes. Nothing more is pushed or posted; pushed commits stay.
- `stopped`: no target resolved, or a question the run could not settle, before any commit.

`blocked` and `stopped` post no comment.

## The record

Each run keeps its files in `.reimagine/gate/<branch-slug>/` in your checkout: `passes.json` (the completion record), `findings.json` (the findings across passes), `report.md` (rewritten at every terminal state), each review's saved output, snapshots taken before the implementers edit, and the text of the comment. The directory is excluded through the git exclude file, never `.gitignore`, and is never committed. Run the gate again on that branch and it reads the record and continues; on a new commit it starts a new sequence of passes and keeps the findings it already rejected.

## The manifest

When the run came from a manifest, that file gains a top-level `gate` key with the verdict, the number of passes and the record path of each bundle; every other key is kept. Otherwise the run writes a minimal manifest, `audit-manifest.json`, in the record. The report suggests `/audit:run` on it, which needs the audit plugin.

## License

Apache-2.0. See `LICENSE`.

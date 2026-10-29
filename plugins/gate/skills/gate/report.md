# The report

Read this file from `steps/4-publish.md`, 4.5, at every terminal state (`pass`, `pass-with-deferred`, `unconverged`, `blocked`, `stopped`).

Fill every section from the record (`passes.json`, `findings.json` and the saved reviews), never from memory. The passes of a run are those whose `run` is its number, and its findings are those of its passes. Every section is present; an empty one says `none`.

Where the report goes:

- Before Step 0.8 the record does not exist, so the report is printed only. It names the preflight item that failed and the fix.
- From Step 0.8 on, write the report to `report.md` in the record, rewriting the file at every terminal state through a temporary file and `mv`, as `record.md`, Write discipline, says, and print the same text as the run's last text.

A headless session does not show text written before a Skill call, so the header alone must let a reader find the record: the record path, the terminal state, the targets and the Audit line are in the header, not only in the sections.

## Template

```
# gate report

- Run number: <n>
- Branch: <branch>
- Record: <absolute path of the record directory | none written>
- Terminal state: <pass | pass-with-deferred | unconverged | blocked | stopped>
- Base: <remote>/<branch>
- Merge-base: <sha | none>
- Targets: <github:<owner>/<repo>#<n> (<link>) | the branch <name>>
- Run budget: <minutes> (<request | .reimagine.json | session instruction | default>); elapsed <minutes>
- Passes: <n> at <level> (<rule>), ... | none
- Engine: <subprocess | stand-in (<reason>)>
- Review level: your interactive code-review level is as it was; this run typed no level in this session
- Audit: /audit:run "<absolute path of the manifest>" (the command needs the audit plugin) | not suggested (<reason>)

## Findings

## Checks

## Commits and pushes

## Open findings

## Blocked or stopped

## Comment

## Log
```

## Header

- Run number, Branch, Base and Merge-base: from `passes.json`. The base is written `<remote>/<branch>`, and the merge-base is `none` before Step 0.6 ran.
- Record: the absolute path of the record directory, or `none written` when the run ended before Step 0.8.
- Targets: each target as `github:<owner>/<repo>#<n>` with its link, or `the branch <name>`.
- Run budget: the minutes in force and their source, as the reading block gave them. Elapsed is the time from this run's `started` to its `ended`, with the waits for questions left out, as `steps/3-next.md`, Decide, item 4, counts it.
- Passes: each pass of this run as `<n> at <level> (<rule>)`, in order. The rule is the `rule` of the pass's own `next`, the decision that followed the pass, with `, capped <cap>` after it when the `next` has `capped`. A pass with no `next` shows its `status`, `failed` or `running`. `none` when the run made no pass.
- Engine: `engine` from `passes.json`. For the stand-in, the reason, from the record: a saved `review-<n>[-<slug>].json` of this run whose result says the `code-review` skill is not available, or, with none, that `claude` is not on the PATH.
- Review level: copy the line as it is. The run never typed a level in the user's own session (SKILL.md, Roles).
- Audit: when `steps/4-publish.md`, 4.3, wrote or updated a manifest, the `/audit:run` line with that manifest's absolute path and the note that the command needs the audit plugin. With no record there is no manifest: `not suggested (no record written)`.

## Sections

### Findings

Per pass of this run, each finding by bucket (`fix`, `defer`, `reject`) with its file, summary and the triage reason; the fixed ones are marked `fixed`. A failed review is named with its saved result file. In "no fixes", the fix bucket is headed as what a fix run would do. A finding carried, regressed or matched to an earlier one says so, with the match's reason from the ledger.

### Checks

The section names the source of the checks: the request, the manifest bundle or `.reimagine.json`. Run: the command and its result. Not run: the exact command and the reason; with no source, write that no check ran. Write `denied` only for a refused permission. A check still failing after three fixes is named here and under Blocked or stopped.

### Commits and pushes

Each commit of this run with its full sha and subject, and whether it was pushed or kept local only, from `git ls-remote <remote> refs/heads/<branch>`. After `blocked`, name every pushed commit and every local commit kept.

### Open findings

For `unconverged`: each open finding as `steps/3-next.md`, Decide, item 6, lists them, by file and summary, and the cap or the rule that ended the run, named. For any other state, `none`.

### Blocked or stopped

For `blocked` and `stopped`: what is blocked, or the question with both positions; where the work is (the branch, the pull request link, the head, the paths left as they are); what would unblock it; and the exact commands in order, ending with the request that runs the gate again (`/gate PR <n>`, `/gate this branch`). A budget that ran out is given with its value. Otherwise `none`.

### Comment

The link of the comment posted. For a host other than GitHub, the comment's text. Otherwise why none was posted: the state, a branch target, a denied or failed post, or a stop that Step 3, Resume, met in the record.

### Log

Each review with its slug, duration, cost, denial count and notes, from `reviews[]`, the notes printed as the reviewer wrote them, or `none` when empty; each implementer call with its group's files and its `duration_ms` from the completion notification, and the `date -u` outputs Step 2 kept before and after that call or its parallel batch; and the elapsed time against the run budget.

## Rules

- The report has exactly one terminal state, one of the five.
- Name every cap that ended the run, and the engine when it is the stand-in.
- For `blocked` and `stopped`, nothing is published after the state.
- The report may name models, agents and tools, because it stays in the record. The comment follows the deny list of `steps/4-publish.md`, 4.4.

Return to `steps/4-publish.md`.

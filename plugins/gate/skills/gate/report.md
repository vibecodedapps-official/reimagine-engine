# The report

Read this file at every terminal state. Fill every section from the record, `passes.json`, `findings.json` and the saved reviews, never from memory. A run's passes are those whose `run` is its number. Every section is present, and an empty one says `none`.

With a record, write the report to `report.md` in it, as `record.md`, Write discipline, says, and print the same text. A run that ended before the record existed prints the report only, naming the preflight item that failed and its fix. A headless caller sees only the last message, so the header alone must let a reader find the record.

The report may name models, agents and tools, because it stays in the record. It is the only place the run's findings, checks, commits and verdict are written for a reader.

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

## Log
```

## Header

- Merge-base is `none` when the run ended before preflight found it.
- Run budget gives the minutes and their source as the reading block did. Elapsed is from the run's `started` to its `ended`, with the waits for an answer left out.
- Passes gives each pass of the run in order. The rule is the `rule` of the pass's own `next`, with `, capped <cap>` after it when the `next` is capped. A pass with no `next` shows its `status` instead.
- Engine gives the stand-in's reason from the record: a saved review result of this run that says the `code-review` skill is not available, else that `claude` is not on the PATH.
- Audit names the manifest Step 4 wrote or updated. With no record it reads `not suggested (no record written)`.

## Sections

Findings. Per pass of the run, each finding by bucket with its file, summary and triage reason.

- A fixed finding is marked `fixed`. When the last pass's `next` has the rule `fix-of-fix`, its fixed findings are marked `fixed, no review after`, and one line names the checks that passed on them.
- A finding carried, regressed or matched to an earlier one says so, with the match's reason.
- In "no fixes", the fix bucket is headed as what a fix run would do.
- A failed review is named with its saved result file. One that stopped on a usage limit is named `usage limit`, with the line that a later run resumes the pass.
- When the run pushed a kept commit, the `kept` of its entry in `runs`, the findings of the pass that made it are listed under a heading that names that pass and the commit, as fixed by it. A finding that a pass of this run also fixed is listed once, under this run's pass.

Checks. The source of the checks: the request, the manifest bundle or `.reimagine.json`. Each check run, with its command and result. Each check not run, with its exact command and the reason; `denied` only for a refused permission. With no source, that no check ran. Then one line on what the reviews could not run: the sum of their `denials` and each distinct call of their `denied` lists, or `none refused`. A review reaches for the checks itself, and a refused one is a check that review did not see.

Commits and pushes. Each commit of the run with its full sha and subject, and whether it was pushed or is kept local only, from `git ls-remote <r> refs/heads/<branch>` and the record, never from memory; a kept commit this run pushed, with the pass that made it. After `blocked`, every pushed commit and every commit kept local, an earlier run's included. When the run pushed to a branch that has an open pull request, one line says that the description was written before these commits and what to bring up to date in it: what changed and the checks run. The gate edits no description.

Open findings. For `unconverged`, each open finding by file and summary (`steps/3-next.md`, Decide), and the cap or failure that ended the run, by name. A `budget` cap is named as the next pass not started because the run budget could not hold it.

Blocked or stopped. What is blocked, or the question with both positions; where the work is: the branch, the pull request link, the head and the paths left as they are; what would unblock it; and the exact commands in order, ending with the request that runs the gate again, such as `/gate PR <n>`. A budget that ran out is given with its value. A check still failing after three fixes is named here and under Checks.

Log. Each review with its slug, models, duration, cost, denial count and notes, the notes as the reviewer wrote them; each repair of a `match`; each reader call with its batch's size and whether it was retried; each implementer call with its group's files, its `duration_ms` and the `date` outputs kept around it; each late notice; and the elapsed time against the run budget.

Return to `steps/4-publish.md`.

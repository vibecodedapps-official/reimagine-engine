# Step 1: A pass

Read this file at the start of every pass, for its entry, its reviews, its findings and the triage. `<record>` is the record directory, `<merge-base>` the full sha in `passes.json` and `<n>` the pass number. Nothing is edited while a review runs.

## The pass entry

The pass number is one more than the highest `n` in `passes[]`, counted across runs. The level is `xhigh` for pass 1, else the one Step 3 or Resume gave. Before the first review starts, append the entry to `passes[]`:

```
{"n": <n>, "run": <run>, "level": "<level>", "status": "running", "started": "<utc>", "ended": null, "reviews": [], "findings": {}, "changes": [], "files": [], "commit": null, "head": null, "checks": [], "next": null}
```

A pass that Resume repeats keeps its `n` and the entry Resume rewrote.

## Size and split

Run `git diff --numstat -z --no-renames <merge-base>...HEAD | node "<scripts>/split.mjs" <split>`, `<split>` being the configuration's `split`. It prints `{"lines": <n>, "groups": [{"slug", "paths", "files", "lines"}]}`, the reviews of the pass in byte order of slug. A non-zero exit ends the run `blocked` with the script's stderr line.

- The one group `all` has no paths: one review of `<merge-base>...HEAD`, saved as `review-<n>.json`.
- Any other group is one review of `<merge-base>...HEAD` followed by its `paths` as printed, saved as `review-<n>-<slug>.json`.

In the first pass of a run, print one line before the reviews start: the changed lines, the number of groups, the minutes a pass needs (`steps/3-next.md`, Decide) and how many such passes the minutes left in the run budget hold. When they hold one or none, say that the fixes of this pass will be pushed with no review after them, and that "budget <n> minutes" in the request raises it. Tell, do not ask.

## The reviews

With `stand-in` on the block's Engine line, or once a review of this run has chosen it, go to The stand-in. Otherwise each review is one Bash call with `run_in_background`:

```
cd <root> && env -u CLAUDECODE MSYS_NO_PATHCONV=1 claude -p "/code-review <level> <merge-base>...HEAD[ <path>]" --model <reviewer> --output-format json --permission-mode default --allowedTools "Read,Grep,Glob,Skill,Agent,TaskStop,Bash(git diff *),Bash(git log *),Bash(git show *),Bash(git status *),Bash(git ls-files *)[,Bash(<check>*)...]" < /dev/null > <record>/review-<n>[-<slug>].json
```

- `[ <path>]` is the group's paths and is absent for the group `all`. `[,Bash(<check>*)...]` adds one entry per command of the run's checks.
- `<reviewer>` is `gate.models.reviewer` of the target's configuration. Always pass it, since a child session without `--model` takes the model of its settings files, not the session's.
- `MSYS_NO_PATHCONV=1` keeps Git Bash on Windows from rewriting the prompt's leading `/` into a path.
- Never add `--comment`, `--fix` or `--max-findings`.
- At most `parallel` reviews run at once. The first ones, in byte order of slug, start in one message; each later one starts in its own call when one ends.
- Beside them, start a `sleep` of the pass's review time in seconds, in its own Bash call with `run_in_background`, since a background command notifies only when it ends: the review budget once for each `parallel` reviews or part of them. Wait for the completion notices; do not poll. A review still running when the sleep ends is stopped with TaskStop and is a failed review. When every review ends first, stop the sleep with TaskStop.

The redirect saves each output before anything parses it. A saved `result` that says no review ran because the `code-review` skill is not available, in whatever words, moves the run to the stand-in for the rest of the run, and that group is reviewed again there. Every other output goes to Findings, which tells a failed review.

## The stand-in

1. Write `diff-<n>[-<slug>].patch` in the record from `git diff <merge-base>...HEAD`, with `-- ` and the group's `paths` for a split pass.
2. Call an Agent at `models.fallback-reviewer`, passing `model` explicitly and the level word as its `effort`. The request names the patch's absolute path and asks for a review of the whole change for correctness bugs, the reply ending in a fenced json array of objects with `file`, `line`, `summary` and `failure_scenario`, with repository-relative paths, and `[]` when there are none. The calls of a split pass go in one message, within the review time above.
3. Save the reply as `review-<n>[-<slug>].md`, and set `engine` to `stand-in` in `passes.json`: once chosen, the stand-in stays for the run.

## Findings

Run `node "<scripts>/findings.mjs" <n> <record>/findings.json <output>...` with every review output of the pass. It reads them all. On exit 0 it has written the ledger and prints a summary on stdout; otherwise it writes nothing and prints one stderr line per bad output.

On exit 0, write one `reviews[]` entry per output from the summary:

```
{"slug": "<slug>", "target": "<the exact range typed>", "output": "<output>", "duration_ms": <n>, "total_cost_usd": <n>, "denials": <n>, "denied": [<call>...], "models": [<model>...], "notes": "<notes.text>"}
```

`denied` lists each call the review was refused, and `notes` is what the reviewer wrote around its fence, where it says what it could not run. For a stand-in's reply the three numbers and `denied` are `null` and `models` is the one model it was called at.

A non-zero exit, or a review stopped at its budget, is a failed review. Write the pass `"status": "failed"` with its `ended`, one `reviews[]` entry per output with `null` numbers, and `next` left `null`; keep the stderr lines for the report; end the run `unconverged`. A `usage limit` line names an output that stopped on a usage limit: its entry holds `"failure": "usage limit"`, and the report gives that reason and says that a later run resumes the pass and keeps the reviews that finished. Never write a finding list of your own.

A `findings: warning:` line on stderr names an entry that an earlier triage matched without writing its `match`. Before this triage, add the `match` to that entry in `findings.json`, the earlier id being the one that pass's `findings` in `passes.json` keys the finding under, else the one its reason names, and key the finding under that id in the earlier pass. With neither, leave the entry. Either way the report's Log names it.

## Triage

Before any fix, sort every finding of the pass into one bucket with a one-line reason, reading each against the code it cites. Finding issues is a judgment, not a count.

- `fix`: a correctness finding inside the change, or a regression.
- `defer`: reuse, simplification, efficiency, or an issue the change did not introduce.
- `reject`: a false positive.

1. A finding the script printed with a bucket keeps it and its reason: a regression arrives as `fix`, a carried rejection as `reject`, a returning deferral as `defer`. Sort the rest.
2. A finding the script marked `new` may be a defect an earlier review worded differently. The summary prints its `candidates`: earlier entries of the same file that no review of this pass reported, nearest line first, then entries of other files that share an identifier with it. When the finding is the same defect as a candidate, it takes what the script gives a returning entry of the candidate's state: `fix` and `regressed` for a fixed one, `reject` and `carried` for a rejected or carried one, `defer` and `deferred` for a deferred one. A match to a regressed entry gives no bucket: sort it with the rest, its state staying `regressed`.
3. Write each ledger entry's bucket and reason in its `passes.<n>` and set its state: `open` for `fix`, with a regression staying `regressed`, `deferred` for `defer`, `rejected` for `reject`. A matched finding's `match`, `{"of": "<earlier id>", "reason": "<why>"}`, goes in this same write, never a later one.
4. Write `findings` in the pass entry, `{"<id>": {"bucket": "<bucket>", "reason": "<reason>"}}` for every finding of the pass, a matched one under the earlier id, and write `findings.json`, both before the fix round. Then run `node "<scripts>/findings.mjs" --check <n> <record>/findings.json`, and repair each entry a `findings: warning:` line names, as above.

With more than 30 findings to sort, readers do the reading: read-only Agents at `models.reader`, one per batch of at most 40 findings, all calls in one message, each named in the Log. A reader gets its findings with file, line, summary and failure scenario, each `new` finding's `candidates`, the merge-base, the checkout path and the instruction files, and is told to edit nothing, run no git command that writes and start no background command. Per finding it returns:

- the id;
- `same as`: the id of the one candidate that is the same defect, or `none`;
- `holds`: `yes`, `no` or `unsure`;
- the kind: correctness, reuse, simplification, efficiency, style or other;
- `pre-existing`: `yes`, `no` or `unsure`, read from the file at the merge-base;
- a recorded decision or rule the finding conflicts with, or `none`;
- one line of evidence with its file and line.

A reader never returns a bucket; you sort from the replies. Take a `same as` as given when its candidate is rejected, carried or deferred, and check it against the code when the candidate is fixed or regressed, since that match puts the finding in `fix`. Read the cited code yourself for every finding you put in `fix` and for every `unsure`. A failed reader call is retried once; then you read that batch.

In "no fixes" mode, or with an empty `fix` bucket, the run goes to `steps/3-next.md`. Otherwise it goes to `steps/2-fix.md`.

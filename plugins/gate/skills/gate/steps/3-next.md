# Step 3: The next level

## Decide

1. Take `date -u +%Y-%m-%dT%H:%M:%SZ`.
2. In "no fixes" mode `next.mjs` is not run. The pass's `next` is `{"stop": "<verdict>", "rule": "no-fixes"}`: with an empty fix bucket `pass`, or `pass-with-deferred` when the pass deferred something, and otherwise `unconverged`. Go to item 5.
3. Work out two figures. The minutes left are the run budget less the time since the run's `started`, with the waits for an answer left out; they are negative when the run is over it. The minutes a pass needs are the review budget once for each `parallel` groups or part of them of the pass just made, its groups being the distinct slugs in its `reviews[]`, plus the subagent budget.
4. Run `node "<scripts>/next.mjs" <absolute passes.json> <max-passes> <minutes left> <minutes a pass needs>`. It prints one line, `{"stop": "<verdict>", "rule": "<rule>"}` or `{"level": "<level>", "rule": "<rule>"[, "capped": "max-passes" or "budget"]}`, from the first rule that matches:
   - `nothing-to-fix`: the latest pass has no fix finding. Stop `pass`, or `pass-with-deferred` when a pass of the run deferred something. A rejection, new or carried, counts as nothing.
   - `fix-of-fix`: the latest pass follows another pass of the run and has at most 3 fix findings, each in a file that pass's `files` lists, and its own fix round was not wide, made a commit and passed every check, of which there is at least one. Stop as `nothing-to-fix` does.
   - `docs-only`: the fix round's `changes` holds `docs-only`. The level is `medium`.
   - `wide-fix`: the fix round changed an exported signature, a schema or migration, or a file outside the diff, and no pass of the run after its first ran at `xhigh`. The level is `xhigh`.
   - `otherwise`: the level is `high`.

   A level is `capped` by `max-passes` when the run has made that many passes, else by `budget` when the minutes left are fewer than a pass needs. A stop is never capped. A non-zero exit ends the run `blocked` with the script's stderr line, the pass left `running`, since the record cannot decide the next step.
5. Write the pass's `next`, its `ended` and `"status": "complete"` in one write, with the output of `git rev-parse HEAD` as its `head` when Step 2 did not run.
6. A stop ends the run with its verdict. A capped level ends it `unconverged`, naming the cap; after `budget`, the report says the next pass was not started for want of time. Every `unconverged` ending lists the open findings by file and summary: the fix bucket of the latest pass, which no later pass verified, and every entry whose state is `regressed`.
7. Any other level is the next pass: read `steps/1-pass.md`.

## Resume

Preflight sends the run here when the record holds passes. This run's entry is already in `runs`. Nothing of an earlier run is changed except `passes.json`, `findings.json` and the files a repeated pass rewrites.

Run `node "<scripts>/resume.mjs" <absolute passes.json> <head> <remote head> <merge-base> <mode>`: the output of `git rev-parse HEAD`, the remote head preflight kept or `none`, the merge-base preflight found, each sha in full, and the mode as `fix` or `no-fixes`. It prints one line that names an `action`. A non-zero exit ends the run `blocked` with the script's stderr line.

A line that holds `push` names the head as a commit an earlier run made and did not push. Push it first, as `steps/2-fix.md`, The push, says, with its deploy judgment and its prompts; a `blocked` ending there changes no pass entry. Then write `"kept": "<sha>"` in this run's entry of `runs`, and take the action:

- `new-sequence`: no pass can be resumed. The next pass runs at `xhigh` as the first of a sequence, with the ledger kept, so earlier rejections carry.
- `continue`: the next pass runs at the line's `level`, with `max-passes` and the run budget counted afresh for this run.
- `repeat`: the earlier run stopped inside the pass the line names, which is reviewed again. Rewrite its entry as Step 1 appends it, with this run's number, `status` `running` and a new `started`. A group whose saved output the earlier run finished is not reviewed again, since it was made on this head and merge-base: after the split, run `findings.mjs` as Step 1 does over the review files of the pass that exist, and review only the groups whose file is missing or named on its stderr. With no review file saved, every group is reviewed. A group that has a stand-in's reply is read from the reply, not from the child's output beside it.
- `decide`: the earlier run stopped after the commit of the pass the line names. Set that pass's fix-bucket entries to `fixed` in `findings.json`, write its `head`, and continue at Decide with the entry as it is.
- `end`: the last pass stopped. End the run with the line's `stop` as its verdict: the report is rewritten and nothing is committed.
- `blocked`: end the run `blocked` with the line's `reason`, naming its `commit`.

A new sequence, a continued level and a repeated pass go to `steps/1-pass.md`; every ending goes to SKILL.md, Terminal states.

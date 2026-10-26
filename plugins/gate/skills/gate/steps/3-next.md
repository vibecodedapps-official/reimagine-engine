# Step 3: The next level

Read this file from Step 2 when its commit and push are done, from Step 1 when the pass's fix bucket is empty or the run is "no fixes", and from Step 0 for the section Resume when the record already holds passes. Every write of `passes.json` follows `record.md`, Write discipline.

## Decide

1. Run `date -u +%Y-%m-%dT%H:%M:%SZ` and copy its output.
2. In "no fixes" mode `next.mjs` is not run (SKILL.md, Levels and caps). When the fix bucket is empty the verdict is `pass`, or `pass-with-deferred` when the pass deferred something; otherwise it is `unconverged`. The pass's `next` is `{"stop": "<verdict>", "rule": "no-fixes"}`; go to item 5.
3. Otherwise `max-passes` is `.reimagine.json` `gate.max-passes`, else 4. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/next.mjs" <absolute passes.json> <max-passes>`. It prints one JSON line, `{"stop": "<verdict>", "rule": "<rule>"}` or `{"level": "<level>", "rule": "<rule>"[, "capped": "max-passes"]}`, from the first rule that matches:
   - `nothing-to-fix`: the latest pass has no fix finding and no new rejection, a carried rejection counting as nothing: stop `pass`, or `pass-with-deferred` when a pass of the run deferred something.
   - `after-medium`: the latest pass ran at `medium`: stop as `nothing-to-fix` would when it has no fix finding, else `unconverged`, since no pass verifies its fixes.
   - `wide-fix`: the fix round changed an exported signature, a schema or migration, a file outside the diff, or more than a quarter of its files, and no pass of the run after its first ran at `xhigh`: `xhigh`.
   - `rejects-at-high`: the two latest passes both ran at `high`, each with no fix finding and a new rejection: `medium`.
   - `otherwise`: `high`.

   It marks a level `"capped": "max-passes"` when the run's passes number `max-passes` or more; a stop is never capped. A non-zero exit ends the run `blocked` with the script's stderr line, since the record cannot decide the next step; the pass stays `running`.
4. A level that `next.mjs` did not cap is checked against the run budget before the next pass starts: the time from the run's `started` to now, with the waits for questions left out, against "budget <n> minutes" in the request, else `.reimagine.json` `gate.budget`, else a session instruction, else 120. When it is spent, add `"capped": "budget"` to the object.
5. Write the pass's `next` (the object, or the `no-fixes` stop), `ended` and `"status": "complete"` in one write. When the pass's `head` is still `null`, which is so when Step 2 did not run, write `git rev-parse HEAD` as `head` in the same write.
6. A stop ends the run with that verdict. A level marked `capped`, by `max-passes` or by `budget`, ends the run `unconverged`. Each of these `unconverged` endings, and the one from `after-medium` or "no fixes", lists every open finding: each finding in the fix bucket of the latest pass, since no later pass verified it, and each regression (state `regressed` in `findings.json`), by file and summary. Name the cap that ended the run; never end a run on a cap silently.
7. Otherwise read `steps/1-pass.md` and run the next pass at the returned level.

## Resume

Step 0 sends the run here when the record holds passes, after it has rechecked the tree and re-sized the diff. This run's entry is already in `runs`.

1. Run `git rev-parse HEAD`. The expected head is the `head` of the last `complete` pass, or the `commit` of the first pass not `complete` after it when that pass has one, since its fix round made that commit. With no `complete` pass, only the merge-base is compared. Compare the new merge-base with the record's `merge_base`.
2. The same head and the same merge-base: the run resumes.
   - A pass is not `complete`: resume at the first pass not `complete` after the last complete one. Repeat its review: rewrite its entry for this run as Step 1 appends it, with `run` this run's number, `status` `running` and a new `started`, and its review files are rewritten. Unless its `commit` is already the head, in which case that pass continues at the decision of the section Decide, item 1, with its entry as it is.
   - Every pass is `complete`: continue at the level in the last pass's `next`, with `max-passes` counted afresh for the new run, since `next.mjs` counts the passes of the latest pass's run. A `next` that is a stop rewrites the report, commits and posts nothing, and ends the run with that verdict, except that a `no-fixes` stop met by a run that is not "no fixes" starts a new pass sequence at `xhigh` as item 3 does, since that pass fixed nothing.
3. A new head on the same merge-base: a new pass sequence at `xhigh`, numbered after the record's last pass, with the ledger kept, so earlier rejections carry.
4. A changed merge-base: write the new one as the record's `merge_base`, then the same restart at `xhigh` with the ledger kept.
5. Nothing from a prior run is modified except `passes.json`, `findings.json` and the rewritten files.

Then read `steps/1-pass.md` to run the pass at its level, or go to the section Decide, item 1, for a committed `running` pass. A level that no cap stops also sends the run to `steps/1-pass.md`; every other ending goes to SKILL.md, Terminal states.

# A first review

`<record>`, `<round>`, `<worktree>` and `git <c>` are those of `SKILL.md`, Record and workspace; the round is `round-1`. Set up the workspace there first.

## The change

The merge-base is `git <c> merge-base <base sha> <head sha>`. Write `<round>/change.patch` from `git <c> diff --no-ext-diff --no-textconv <merge-base> <head sha>`, so no driver a head's attributes name runs. For a pair, each target has its own patch and its own reading.

## The first reading

When the request names a gate record or an audit report, that is the first reading and no review runs, if it covers this head: for a gate record, the `reviewed` sha of the last pass in its `passes.json`, that pass being `complete`, with the findings in `findings.json` whose state is not `fixed`, a fixed one being of an earlier head; for an audit report, the head sha its `bundles:` line gives for this pull request. A report for another head is refused with both shas, a gate record whose last pass is not `complete` with that pass's status, and the run stops for that target, saying that a request without the report takes a reviewing agent.

Otherwise the first reading is a reviewing agent of this session; no child session is started. Call one Agent, passing `model` as the session's own model and the level word as its `effort`. Its brief names the absolute paths of `change.patch` and of the worktree, the merge-base, the conventions, and the rules of `SKILL.md` for a brief; it asks for a review of the whole change for correctness bugs, read in the worktree at the head, the reply ending in a fenced json array of objects with `file`, `line`, `summary` and `failure_scenario`, with repository-relative paths, and `[]` when there are none, and naming above the fence every read or call it was refused. Save the reply as `<round>/first-reading.md`.

## After the reading

Run the checks of `SKILL.md`, Checks before any draft, on every lead and on the change, record each in `notes.md` with its disposition, then write and show the drafts as `SKILL.md`, Drafts, has them. The run ends as `SKILL.md`, The end of a run, says, and its last message says that "reimagine review <target>, post" posts the drafts. Return to `SKILL.md` for that end.

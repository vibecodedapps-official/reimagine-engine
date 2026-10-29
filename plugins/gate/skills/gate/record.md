# The record

Read this file when Step 0 sets up the record directory; you return to it whenever a step writes a record file. It holds the record's location, its files, the completion record, the ledger and the write discipline.

## Location

1. The record directory is `.reimagine/gate/<branch-slug>/` in the target repository's root: for a manifest bundle, that bundle's `repo`. The branch and `<branch-slug>` are set as SKILL.md, Record, says.
2. `passes.json` keeps the exact branch name. A record whose `passes.json` branch differs from this run's branch is a slug collision and ends preflight `blocked`, naming both branches.
3. `.reimagine/` goes into the file that `git rev-parse --git-path info/exclude` names, never into `.gitignore`. Nothing under `.reimagine/` is ever staged, and no commit contains a record file.
4. Every shell argument that names a record file is its absolute path.

## Files

All names are relative to the record directory. Times in every file are copied from `date -u +%Y-%m-%dT%H:%M:%SZ` output.

| File | Written | Holds |
|---|---|---|
| `passes.json` | Step 0, then Steps 1 to 3 | The completion record (see the next section) |
| `findings.json` | Step 1 by `findings.mjs`, then the triage and Step 2 | The identity ledger across passes (see Findings ledger) |
| `report.md` | Every terminal state | The report, compiled from the record. Rewritten in place |
| `review-<n>[-<slug>].json` or `.md` | Step 1, after each review | The review's saved output: `.json` from a child session, `.md` from the stand-in. `<n>` is the pass number, which counts across runs. An unsplit pass has no `-<slug>`; a pass over `split` groups its files by path at the shallowest depth that gives more than one group, and a group's slug is its key's path lowercased, each run of characters outside `[a-z0-9]` replaced by `-`, leading and trailing `-` removed, and for the `.` key `root` at depth 1 or `<prefix slug>-root` deeper, and a slug an earlier key of the pass holds takes `-2`, else `-3`, and so on (Step 1.2) |
| `diff-<n>[-<slug>].patch` | Step 1, before a stand-in review | The stand-in's input; `<n>` and `<slug>` as for `review-<n>` |
| `pre-<n>.status`, `pre-<n>.patch`, `pre-<n>.hashes` | Step 2, before each implementer call | `git status`, a patch and file hashes, for restoring after a failed call. `<n>` is one more than the highest number among the record's `pre-*.status` files, or 1 when there is none; a parallel batch takes one snapshot per file group before any call of the batch starts |
| `comment-<n>.md` | When the run publishes | The comment as posted, never committed. `<n>` is the run number |
| `audit-manifest.json` | When the run did not come from a manifest | The minimal manifest for the audit |

No run rewrites a file a prior run wrote, except `passes.json`, `findings.json`, `report.md` and the review files of a pass that Resume repeats. The counters keep the other names apart: `review-<n>` and `diff-<n>` take the pass number, `pre-<n>` its own counter and `comment-<n>` the run number. The one per-run name with no counter is `audit-manifest.json`, which from run 2 on is `audit-manifest-run<n>.json`, with `<n>` the run's number, as in `audit-manifest-run2.json`. Within one run, a later write of the same file replaces it.

## passes.json

`passes.json` is the only record of completion.

`passes.json`:

```json
{
  "branch": "feat/68-4567-export",
  "base": "main",
  "merge_base": "<sha>",
  "targets": ["github:owner/app#73"],
  "engine": "subprocess",
  "runs": [{ "n": 1, "started": "2026-10-25T09:00:40Z", "ended": null, "state": "running" }],
  "passes": [
    { "n": 1, "run": 1, "level": "xhigh", "status": "complete", "started": "...", "ended": "...",
      "reviews": [{ "slug": "all", "target": "<merge-base sha>...HEAD", "output": "review-1.json", "duration_ms": 119636, "total_cost_usd": 1.23, "denials": 2, "notes": "The suite could not be run here." }],
      "findings": { "src/stats.mjs|percentile indexes sorted rank ...": { "bucket": "fix", "reason": "off-by-one inside the change" } },
      "changes": ["inside-diff"], "commit": "<sha>", "head": "<sha>",
      "checks": [{ "command": "npm test", "result": "pass" }],
      "next": { "level": "high", "rule": "otherwise" } },
    { "n": 2, "run": 1, "level": "high", "status": "running", "started": "..." }
  ]
}
```

The second pass in the literal is shortened to show a pass that has only started; Step 1 writes every field of a pass entry when it appends it, with the values of the next list. The values `...` and `<sha>` stand for a time and a full sha.

Top level, written by Step 0 when the file is absent:

1. `branch` is the exact branch name. `base` is the base branch and `merge_base` the full sha of the merge-base with it. `targets` lists the pull request as `github:<owner>/<repo>#<n>`, or the branch name for a branch target.
2. `engine` is `subprocess` or `stand-in`; Step 1 rewrites it to `stand-in` when the run moves to the stand-in.
3. `runs` has one entry per run: `n`, `started`, `ended` (`null` while the run is open) and `state` (`running`, then the terminal state, or `interrupted` when a later Step 0 finds it still `running`). Step 0 appends `{"n": <run>, "started": <utc>, "ended": null, "state": "running"}` with `<run>` one more than the highest `n` in `runs`; at a terminal state the run's entry gets `ended` and its `state`.
4. `passes` has one entry per pass, in order of `n`, which counts across runs: pass 3 may be run 2's first pass.

Each pass entry, and the step that writes it:

1. `n`, `run`, `level` (`xhigh`, `high` or `medium`), `status`, `started`, `ended`, `reviews`, `findings`, `changes`, `commit`, `head`, `checks` and `next`. Step 1 appends `{"n": <n>, "run": <run>, "level": "<level>", "status": "running", "started": <utc>, "ended": null, "reviews": [], "findings": {}, "changes": [], "commit": null, "head": null, "checks": [], "next": null}` before the first review starts.
2. `status` is `running`, `complete` or `failed`.
3. `reviews` is filled by Step 1 after each review with `{"slug", "target", "output", "duration_ms", "total_cost_usd", "denials", "notes"}`. `slug` is `all` for an unsplit pass, else the group's slug; `target` is the exact range typed; `output` is the saved file's name; the last three come from the summary `findings.mjs` printed. `notes` is the text before the fence from that summary (`notes.before`), where the reviewer says what it could not run.
4. `findings` maps each finding id of the pass to `{"bucket": "fix"|"defer"|"reject", "reason": "<one line>"}`. Step 1 writes every finding of the pass after the triage and before any edit. A finding the orchestrator matches to an earlier entry (Findings ledger) is recorded under the earlier id.
5. `changes` lists every kind that applies to the files the fix round changed, judged against the files of `git diff --name-only <merge-base>...<head at the pass's start>`, the diff the pass reviewed: `inside-diff` (every changed file is in it), `outside-diff` (at least one is not), `exported-signature` (an exported function, class, type or public API signature changed), `schema-or-migration` (a schema or migration file changed), `over-quarter` (the fix round changed more than a quarter of that diff's files). An empty fix round is `[]`. These five words are the only ones `next.mjs` accepts. Step 2 writes it.
6. `commit` is the fix round's sha, or `null` when the pass changed nothing. `head` is the branch head when the pass ended. `checks` lists `{"command": "<command>", "result": "pass"|"fail"|"denied"}` for each command run; with no source of checks (SKILL.md, Reading the request) the list is empty and the report says no check ran. Step 2 writes `changes`, `checks`, `commit` and `head` after the push, the pass still `running`. When a pass has an empty fix bucket, or the run is "no fixes", Step 2 does not run and Step 3 writes `head` from `git rev-parse HEAD` in the write of item 7.
7. `next` holds `{"level": "<level>", "rule": "<rule>"}` or `{"stop": "<verdict>", "rule": "<rule>"}`, plus `"capped": "<cap>"` when a cap ended the run on it. The rules are `nothing-to-fix`, `after-medium`, `wide-fix`, `rejects-at-high` and `otherwise` from `next.mjs`, and `no-fixes` from the orchestrator. The caps are `max-passes`, from `next.mjs`, and `budget`, from the orchestrator. Step 3 writes `next`, `ended` and `"status": "complete"` together in one write.
8. A failed pass gets `"status": "failed"` and `ended`; `next` stays `null`.

## Findings ledger

`findings.json` is `{"findings": {"<id>": {...}}}`, one entry per identity. The id is the repository-relative file path, `|`, and the summary normalized by `findings.mjs`. An entry holds:

1. `file` and `summary`, the summary as the review gave it.
2. `first_pass`, the number of the pass in which the identity first appeared.
3. `state`: `open`, `new`, `fixed`, `deferred`, `rejected`, `carried` or `regressed`.
4. `passes`, from a pass number to `{"line", "bucket", "reason", "prior"}`: the line the review gave, the bucket and reason of the triage, and the entry's earlier state, or `null`.
5. After a match, `match`: `{"of": "<earlier id>", "reason": "<one line>"}`.

`findings.mjs` writes the file and sets `new`, `regressed` (bucket `fix`, for a finding fixed in an earlier pass that returns) and `carried` (bucket `reject`, for a rejected finding that returns, which counts as nothing in `next.mjs`). A deferred finding that returns keeps the state `deferred` and gets the bucket `defer` with the reason of its last defer pass, or `deferred in an earlier pass` when no pass holds one. A regressed entry that returns keeps the state `regressed` and gets no bucket, so the triage sorts it again. It leaves the bucket and reason of a new entry `null`, and prints each new finding with its `candidates`, the same file's settled entries that no review of this pass reported (Step 1.6), which the ledger does not keep.

You write the rest:

1. The triage fills each `null` bucket and reason in the pass's entry and sets the state: `fix` gives `open` (a `regressed` entry stays `regressed`), `defer` gives `deferred`, `reject` gives `rejected`.
2. After the fix round's commit exists, each fix-bucket entry of the pass becomes `fixed`.
3. When a `new` finding and one of its `candidates` are one defect worded two ways, you may match them as Step 1.6 says: add `match` to the new entry, give it the bucket and state the script gives a returning entry of the candidate's state, and record the finding in `passes.json` under the earlier id. Say in `reason` why they are one defect.

## Write discipline

1. Every write of `passes.json` and `findings.json` by you writes the whole file to `<record>/<name>.tmp` and moves it over the file with `mv <tmp> <file>`, with no flags (a flag makes the host ask) and both as absolute paths, keeping every entry you did not change. `findings.mjs` does its own rename.
2. An entry is written `running` when its pass starts and `complete` only after the fix round and its commit exist, or after Step 3 decides for a pass with nothing to fix. A pass that ended without them is `failed`.
3. Only you write these two files; an implementer never does.

Return to the step that sent you here.

# The record

Read this file when Step 0 sets up the record directory; you return to it whenever a step writes a record file. It holds the record's location, its files, the completion record, the ledger and the write discipline.

## Location

`.reimagine/` goes into the file that `git rev-parse --git-path info/exclude` names, run in the target's repository and read relative to the repository's folder when it is not absolute, never into `.gitignore`. Nothing under `.reimagine/` is ever staged, and no commit contains a record file.

## Files

All names are relative to the record directory. Times in every file are copied from `date -u +%Y-%m-%dT%H:%M:%SZ` output.

| File | Written | Holds |
|---|---|---|
| `passes.json` | Step 0, then Steps 1 to 4 | The completion record (see the next section) |
| `findings.json` | Step 1 by `findings.mjs`, then the triage and Step 2 | The identity ledger across passes (see Findings ledger) |
| `report.md` | Every terminal state | The report, compiled from the record. Rewritten in place |
| `review-<n>[-<slug>].json` or `.md` | Step 1, after each review | The review's saved output: `.json` from a child session, `.md` from the stand-in. `<n>` is the pass number, which counts across runs. An unsplit pass has no `-<slug>`; a pass over `split` groups its files by path at the shallowest depth that gives more than one group, a group still over `split` is grouped again one segment deeper, sibling groups under one fifth of `split` are merged into a group whose slug is the parent key's slug plus `-small`, or `small` at the top, and a slug an earlier key of the pass holds takes `-2`, else `-3`, and so on (Step 1.2) |
| `diff-<n>[-<slug>].patch` | Step 1, before a stand-in review | The stand-in's input; `<n>` and `<slug>` as for `review-<n>` |
| `pre-<n>.status`, `pre-<n>.patch`, `pre-<n>.hashes` | Step 2, before each implementer call | `git status`, a patch and file hashes, for restoring after a failed call. `<n>` is one more than the highest number among the record's `pre-*.status` files, or 1 when there is none; a parallel batch takes one snapshot per file group before any call of the batch starts |
| `post-<n>.status`, `post-<n>.hashes` | Step 2, when an implementer call returns | `git status` and file hashes of the checkout as the call left it, for comparing the checkout after a late notification for that call. `<n>` is the call's own `pre-<n>` number |
| `comment-<n>.md` | When the run publishes | The comment as posted, never committed. `<n>` is the run number |
| `audit-manifest.json` | When the run did not come from a manifest | The minimal manifest for the audit |

No run rewrites a file a prior run wrote, except `passes.json`, `findings.json`, `report.md` and the review files of a pass that Resume repeats. The counters keep the other names apart: `review-<n>` and `diff-<n>` take the pass number, `pre-<n>` its own counter, `post-<n>` shares its call's number with `pre-<n>` and `comment-<n>` the run number. The one per-run name with no counter is `audit-manifest.json`, which from run 2 on is `audit-manifest-run<n>.json`, with `<n>` the run's number, as in `audit-manifest-run2.json`. Within one run, a later write of the same file replaces it.

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
      "reviews": [{ "slug": "all", "target": "<merge-base sha>...HEAD", "output": "review-1.json", "duration_ms": 119636, "total_cost_usd": 1.23, "denials": 2, "notes": "The suite could not be run here.", "models": ["<model id>"] }],
      "findings": { "src/stats.mjs|percentile indexes sorted rank ...": { "bucket": "fix", "reason": "off-by-one inside the change" } },
      "changes": ["inside-diff"], "commit": "<sha>", "head": "<sha>",
      "checks": [{ "command": "npm test", "result": "pass" }],
      "next": { "level": "high", "rule": "otherwise" } },
    { "n": 2, "run": 1, "level": "high", "status": "running", "started": "..." }
  ]
}
```

A `reviews[]` entry's `notes` holds the text before and after the fence, joined with a blank line, as `findings.mjs` prints `notes.text`. The entry also holds `models`, the sorted model names of the review as `findings.mjs` prints them, `null` for a stand-in's text. The entry of a review that stopped on a usage limit holds `"failure": "usage limit"` and `null` numbers and `models`. The second pass in the literal is shortened to show a pass that has only started; Step 1 writes every field of a pass entry when it appends it. The values `...` and `<sha>` stand for a time and a full sha.

Step 0 writes the top level and the run entry, Step 1 appends the pass entry and fills `reviews` and `findings`, Step 2 writes `changes`, `checks`, `commit` and `head`, Step 3 writes `next`, `ended` and `status`, and Step 4 closes the run entry, each as its step shows. A run's `state` is `running`, then the terminal state, or `interrupted` when a later Step 0 finds it still `running`. A pass's `status` is `running`, `complete` or `failed`, and `n` counts across runs, so pass 3 may be run 2's first pass. A failed pass has `ended` and a `next` of `null`.

## Findings ledger

`findings.json` is `{"findings": {"<id>": {...}}}`, one entry per identity. The id is the repository-relative file path, `|`, and the summary normalized by `findings.mjs`. An entry holds:

1. `file` and `summary`, the summary as the review gave it.
2. `first_pass`, the number of the pass in which the identity first appeared.
3. `state`: `open`, `new`, `fixed`, `deferred`, `rejected`, `carried` or `regressed`.
4. `passes`, from a pass number to `{"line", "bucket", "reason", "prior"}`: the line the review gave, the bucket and reason of the triage, and the entry's earlier state, or `null`.
5. After a match, `match`: `{"of": "<earlier id>", "reason": "<one line>"}`.

`findings.mjs` writes the file and prints each `new` finding with its `candidates`, which the ledger does not keep (Step 1.6). A regressed entry that returns keeps the state `regressed` and gets no bucket, so the triage sorts it again. The triage and Step 2 write the rest, as Steps 1.6 and 2 say.

When a `new` finding and one of its `candidates` are one defect worded two ways, you may match them as Step 1.6 says: add `match` to the new entry in the same write as its bucket and state, and record the finding in `passes.json` under the earlier id. Say in `reason` why they are one defect.

`findings.mjs` sends a warning for an entry new in the latest pass that is `carried` or `regressed` with no `match` to stderr, and its exit stays 0. Its `--check` mode, `findings.mjs --check <pass> <ledger>`, prints the same warnings for the ledger as it stands, writes nothing, and runs after each triage (Step 1.6).

## Write discipline

1. Every write of `passes.json` and `findings.json` by you writes the whole file to `<record>/<name>.tmp` and moves it over the file with `mv <tmp> <file>`, with no flags (a flag makes the host ask) and both as absolute paths, keeping every entry you did not change. `findings.mjs` does its own rename.
2. An entry is written `running` when its pass starts and `complete` only after the fix round and its commit exist, or after Step 3 decides for a pass with nothing to fix. A pass that ended without them is `failed`.
3. Only you write these two files; an implementer never does.

Return to the step that sent you here.

# The record

Read this file when a step writes a record file. Nothing under `.reimagine/` is ever staged, and no commit contains a record file. Times in every file are copied from the output of `date -u +%Y-%m-%dT%H:%M:%SZ`.

## Files

| File | Written | Holds |
|---|---|---|
| `passes.json` | Steps 0 to 4 | The completion record |
| `findings.json` | Step 1 by `findings.mjs`, then the triage and Step 2 | The ledger of findings across passes |
| `report.md` | Every terminal state | The report, rewritten in place |
| `review-<n>[-<slug>].json` or `.md` | Step 1, after each review | The saved output of a review of pass `<n>`: `.json` from a child session, `.md` from the stand-in. The slug is the group's, and is absent for the group `all` |
| `diff-<n>[-<slug>].patch` | Step 1, before a stand-in review | The stand-in's input |
| `pre-<k>.status`, `.patch`, `.hashes` | Step 2, before each implementer call | The tree before the call, for restoring it after a failed call |
| `post-<k>.status`, `.hashes` | Step 2, when the call returns | The tree as the call left it, for judging a late notice |
| `audit-manifest.json` | Step 4, when the run did not come from a manifest | The minimal manifest for the audit; `audit-manifest-run<n>.json` from run 2 on |

Pass numbers and the `pre-<k>` counter run across runs, so no run rewrites a file an earlier run wrote, except `passes.json`, `findings.json`, `report.md` and the review files of a pass that Resume repeats.

## passes.json

`passes.json` is the only record of completion.

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
      "reviews": [{ "slug": "all", "target": "<sha>...HEAD", "output": "review-1.json", "duration_ms": 119636, "total_cost_usd": 1.23, "denials": 2, "denied": ["Bash: npm --prefix . test", "Bash: node --test tests/"], "models": ["<model id>"], "notes": "The suite could not be run here." }],
      "findings": { "src/stats.mjs|percentile indexes sorted rank ...": { "bucket": "fix", "reason": "off-by-one inside the change" } },
      "changes": ["inside-diff"], "files": ["src/stats.mjs"], "commit": "<sha>", "head": "<sha>",
      "checks": [{ "command": "npm test", "result": "pass" }],
      "next": { "level": "high", "rule": "otherwise" } }
  ]
}
```

- Step 0 writes the top level and the run entry. Step 1 appends the pass entry and fills `reviews` and `findings`. Step 2 writes `changes`, `files`, `checks` and `commit` as soon as the commit exists, and `head` after the push. Step 3 writes `next`, `ended` and `status`. Step 4 closes the run entry.
- A run's `state` is `running`, then the terminal state, or `interrupted` when a later preflight finds it still `running`. A run entry may hold `kept`, the sha of the kept commit that run pushed.
- A pass's `status` is `running`, `complete` or `failed`. It is `complete` only once Step 3 has decided, and `failed` when a failed review or a `blocked` ending of its fix round ended the run; a failed pass has `ended` and a `next` of `null`. `n` counts across runs, so pass 3 may be the first pass of run 2.
- A `reviews[]` entry holds what `findings.mjs` printed for that output. `models` is `null` for a child session result that names none, and the one model called for a stand-in. A review that stopped on a usage limit holds `"failure": "usage limit"`.

## The ledger

`findings.json` is `{"findings": {"<id>": {...}}}`, one entry per identity. The id is the repository-relative path of the file, `|`, and the summary as `findings.mjs` normalizes it. An entry holds:

- `file` and `summary`, the summary as the review gave it;
- `first_pass`, the pass in which the identity first appeared;
- `state`: `open`, `new`, `fixed`, `deferred`, `rejected`, `carried` or `regressed`;
- `passes`, from a pass number to `{"line", "bucket", "reason", "prior"}`: the line the review gave, the triage's bucket and reason, and the entry's earlier state or `null`;
- after a match, `match`: `{"of": "<earlier id>", "reason": "<why they are one defect>"}`.

`findings.mjs` writes the file and prints each `new` finding with its `candidates`, which the ledger does not keep. The triage and Step 2 write the rest. A matched finding is recorded in `passes.json` under the earlier id. The script warns on stderr, with exit 0, of an entry new in the latest pass that is `carried` or `regressed` with no `match`; its `--check` mode prints the same warnings for the ledger as it stands and writes nothing.

## Write discipline

- Only you write `passes.json` and `findings.json`, besides the script's own write of the ledger; an implementer never does.
- Each write puts the whole file in `<record>/<name>.tmp` and moves it over the file with `mv <tmp> <file>`, both as absolute paths and with no flags, since a flag makes the host ask. Keep every entry you did not change.

Return to the step that sent you here.

# Step 1: A pass

Read this file at the start of every pass. It holds the pass entry, the size and split, the reviews, `findings.mjs` and the triage. SKILL.md stays in force: its Approval scope, Levels and caps and Terminal states apply to every item here. `<record>` is the record directory, `<merge-base>` the full sha from `passes.json`, `<repo root>` the absolute path of the target repository's root, `<scripts>` the path on the reading block's Scripts line, and every path handed to a command is absolute. Every write of `passes.json` and `findings.json` follows `record.md`, Write discipline.

## 1.1 The pass entry

1. Take `date -u +%Y-%m-%dT%H:%M:%SZ`. The pass number `n` is one more than the highest `n` in `passes[]`; it counts across runs. The level is the one the run arrived with: `xhigh` for pass 1, else the level Step 3 or Resume gave. Type only `xhigh`, `high` or `medium`, never `low`, `max` or `ultra`.
2. Before the first review starts, append `{"n": <n>, "run": <run>, "level": "<level>", "status": "running", "started": "<utc>", "ended": null, "reviews": [], "findings": {}, "changes": [], "commit": null, "head": null, "checks": [], "next": null}` to `passes[]`. A pass that Resume repeats keeps its `n` and the entry Resume rewrote, and nothing is appended.
3. Nothing is edited while a review runs.

## 1.2 Size and split

1. Run `git diff --numstat <merge-base>...HEAD` and sum added plus deleted over every line. A binary file, which prints `-`, counts as no lines.
2. At or under `split`, the pass has one review, slug `all`, target `<merge-base>...HEAD`, and its files carry no suffix: `review-<n>.json`.
3. Over `split`, run `git diff --name-only <merge-base>...HEAD` and group the files by path at the shallowest depth that gives more than one group. The depth `d` starts at 1; a file's key is its first `d` segments when it has more than `d` segments, else the key `.`; while every file has the same key and some file has more than `d` segments, `d` grows by one. The pass has one review per key, at the same level, in parallel. A directory key's target is `<merge-base>...HEAD <key path>`; the `.` key's target names its files one by one, `<merge-base>...HEAD <file> <file>`, because `git diff -- .` selects the whole diff. A group that alone is over `split` is still one review. For example, a diff of `src/api/a.ts`, `src/web/b.ts` and `src/index.ts` has the one key `src` at depth 1, so it splits at depth 2 into `src/api` (slug `src-api`), `src/web` (slug `src-web`) and the `.` key holding `src/index.ts` (slug `src-root`).
4. A key's slug is its path lowercased with each run of characters outside `[a-z0-9]` replaced by `-` and leading and trailing `-` removed; the `.` key's slug is `root` at depth 1 and `<prefix slug>-root` deeper, `<prefix>` being the segments every file shares. Two keys can give one slug, and two reviews of one pass must never write the same file. The slugs are given in byte order of key path with the `.` key last, and a slug an earlier key already holds takes `-2`, else `-3`, and so on, the first one free. A diff of `src/api/a.ts`, `src/root/b.ts` and `src/index.ts` splits into `src/api`, `src/root` and the `.` key, so `src/root` keeps `src-root` and the `.` key takes `src-root-2`. Its files are `review-<n>-<slug>.json` and `diff-<n>-<slug>.patch`.

## 1.3 The child session

When the Engine line of the reading block says the stand-in, or an earlier review of this run chose it, skip to 1.4. Otherwise run each review as one Bash call with `run_in_background`, all the calls of a split pass in one message:

```
cd <repo root> && env -u CLAUDECODE MSYS_NO_PATHCONV=1 claude -p "/code-review <level> <merge-base>...HEAD[ <path>]" --output-format json --permission-mode default --allowedTools "Read,Grep,Glob,Skill,Agent,TaskStop,Bash(git diff *),Bash(git log *),Bash(git show *),Bash(git status *),Bash(git ls-files *)[,Bash(<check>*)...]" < /dev/null > <record>/review-<n>[-<slug>].json
```

1. `<level>` is the pass's level. `[ <path>]` is the group's target from 1.2 and is absent for an unsplit pass. `MSYS_NO_PATHCONV=1` keeps Git Bash on Windows from rewriting the prompt's leading `/` into a path; elsewhere it changes nothing. `[,Bash(<check>*)...]` adds one entry per command of the run's checks (SKILL.md, Reading the request). Never add `--comment`, `--fix` or `--max-findings`, and never call `code-review` through the Skill tool.
2. Take `date` before the calls. Wait for each command's completion notice; do not poll. The review budget is 30 minutes, the reviews of a split pass running together within it. A review still running at the budget is stopped with TaskStop, the pass is recorded `failed` (1.5) and the run ends `unconverged`.
3. The redirect saves the output as `review-<n>[-<slug>].json` before anything parses it. Read the saved file's `result`. A result that says the `code-review` skill is not available (the exact wording is not fixed; the signal is that no review ran for want of the skill) moves the run to the stand-in for the rest of the run, and that group is reviewed again by 1.4. Only after this check is a result with no findings array a failed review.

## 1.4 The stand-in

1. Write `diff-<n>[-<slug>].patch` in the record from `git diff <merge-base>...HEAD`, with `-- <key path>` for a split group and the `.` key's files one by one.
2. Call an Agent at `models.fallback-reviewer` (default `opus`), passing `model` explicitly and the level word as its `effort`. The request names the patch's absolute path and asks for a review of the whole change for correctness bugs, with the reply ending in a fenced json array of objects with `file`, `line`, `summary` and `failure_scenario`, repository-relative paths, and `[]` when there are none. A split pass makes its calls in parallel, in one message; the review budget of 1.3 applies.
3. Save the reply as `review-<n>[-<slug>].md`. Once chosen, the stand-in stays for the run: set `engine` to `stand-in` in `passes.json`.

## 1.5 Findings

1. Run `node "<scripts>/findings.mjs" <n> <record>/findings.json <output>...` once, with every review output of the pass.
2. A non-zero exit is a failed review. Write the pass `"status": "failed"` with `ended` and one `reviews[]` entry per output, its numbers `null`, so the record names the saved result text; leave `next` `null`, keep the script's stderr line for the report, and go to SKILL.md, Terminal states, as `unconverged`. Never write a finding list of your own.
3. On exit 0 read the printed summary. For each review in `reviews[]` write `{"slug": "<slug>", "target": "<the exact range typed>", "output": "<output>", "duration_ms": <n>, "total_cost_usd": <n>, "denials": <n>, "notes": "<notes.before>"}`: the slug is `all` or the group's, and the other fields come from the summary entry of that output, the three numbers `null` for a stand-in's text. `notes` is the `notes.before` text of that output in the summary, the text the reviewer wrote before its fence, where it says what it could not run; an empty string when there is none.
4. A `findings: warning:` line on stderr names an entry an earlier triage matched without writing its `match`. Before this triage, add that `match` to the entry in `findings.json`, naming the earlier entry its reason names, and note it in the report's Log.

## 1.6 Triage

Before any fix, sort every finding of the pass into one bucket with a one-line reason. Read each finding against the code it cites first. Finding issues is a judgment, not a count.

- `fix`: a correctness finding inside the change, or a regression.
- `defer`: reuse, simplification, efficiency, or a pre-existing issue the change did not introduce.
- `reject`: a false positive.

1. A finding the script printed with a bucket keeps it and its reason: a regression arrives as `fix`, a carried rejection as `reject` and a returning deferral as `defer`, its state still `deferred`. Sort the rest, whose bucket is `null`.
2. A finding the script marked `new` may be one defect that an earlier review worded differently. The summary prints its `candidates`: the same file's `fixed`, `rejected`, `carried`, `deferred` and `regressed` entries that no review of this pass reported, each with the line of its latest pass and the line distance, nearest first. Read the finding against each candidate; when it is the same defect, the match decides its bucket and state, which are those the script gives a returning entry of that state, `fix` and `regressed` for a fixed one, `reject` and `carried` for a rejected or carried one, `defer` and `deferred` for a deferred one, and for a regressed one no bucket, its state staying `regressed`, so it is sorted with the rest. Item 3 writes the match. With `"candidates": []` there is nothing to match.
3. Write the ledger entry's bucket and reason in its `passes.<n>` and set its state: `open` for `fix` (a regression stays `regressed`), `deferred` for `defer`, `rejected` for `reject`. For a matched finding, its `match`, `{"of": "<earlier id>", "reason": "<why>"}`, and the bucket and state of item 2 go in this same write, never in a later one.
4. Write `findings` in the pass entry, `{"<id>": {"bucket": "<bucket>", "reason": "<reason>"}}` for every finding of the pass, each under its id and a matched finding under the earlier id, and write `findings.json`, both before the fix round starts.

In "no fixes" mode, or with an empty `fix` bucket, read `steps/3-next.md`. Otherwise read `steps/2-fix.md`. A failed review goes to SKILL.md, Terminal states, as `unconverged`.

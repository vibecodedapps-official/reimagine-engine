# Step 4: End the run

Read this file from SKILL.md, Terminal states, when a run ends in any of the five states, for the target that just ended. SKILL.md stays in force: its Approval scope and Terminal states apply to every item here. `<record>` is the record directory and `<n>` the run's number. Every write of `passes.json` follows `record.md`, Write discipline, every path handed to a command is absolute, and every file named here without a directory lives in the record.

## 4.1 The terminal state

The run has one state:

- `pass`: a stop with the fix bucket empty and nothing deferred in any pass of the run.
- `pass-with-deferred`: the same stop, with deferred findings, which the report lists.
- `unconverged`: a cap was reached, a review failed, a `medium` pass still found something to fix, or a "no fixes" run has a non-empty fix bucket. The report lists every open finding.
- `blocked`: a preflight failure, a denied permission, a remote head that is neither preflight's nor the run's own, a failed implementer call, a push that failed, a "no fixes" run that meets a kept commit, or a check still failing after three fixes.
- `stopped`: no target resolved, or a question the run cannot decide, before any commit.

The gate posts nothing to a forge: the findings, the deferred list, the checks, the commits and the verdict stay in `passes.json`, `findings.json` and `report.md` in the record, and the report of 4.4 is printed as the run's last message. After `blocked` nothing more is pushed; the commits already pushed stay, and the report names them, with any local commit kept.

"no fixes" is one pass. Step 3 already wrote its verdict under the rule `no-fixes`: `pass` or `pass-with-deferred` on an empty fix bucket, else `unconverged`. The report names the fix bucket, with its reasons, as what a fix run would do, beside the deferred and the rejected. Nothing was edited, committed or pushed, so the report lists no commits.

A run that Step 3, Resume, ended on a stop already in the record writes 4.2, 4.3 and 4.4 only.

## 4.2 The run entry

Run `date -u +%Y-%m-%dT%H:%M:%SZ` and copy its output.

1. With a record, which Step 0.8 makes, write this run's entry in `runs` with `ended` that time and `state` the terminal state, keeping every other key of the entry, `kept` among them.
2. With no record yet, a stop or block before Step 0.8, write nothing: skip 4.3, and print the report of 4.4 without writing it.

## 4.3 The manifest

For any terminal state that has a record. `passes` is the number of passes of `passes.json` whose `run` is this run's number, and `record` is the absolute path of `passes.json`.

1. From a manifest, add a top-level `gate` key to that file, or keep the one it has and set this bundle's value. The key is an object keyed by the bundle's `repo` path, as the manifest gives it, each value:

   `{"verdict": "<state>", "passes": <n>, "record": "<absolute path of passes.json>"}`

   Read the file again just before the write, since an earlier bundle of the run wrote it. Write the whole file to a temporary file beside it and move it over the file with `mv <tmp> <file>`, no flags, keeping every other key as read.
2. Without a manifest, write a minimal one in the record, `audit-manifest.json`, or `audit-manifest-run<n>.json` from run 2 on, through a temporary file and `mv`:

   `{"bundles":[{"repo":"<absolute path>","pr":"github:<owner>/<repo>#<n>","tickets":[]}],"claims":[],"gate":{...}}`

   `repo` is the target repository's root, and `gate` is an object with this bundle's key and the value of item 1. A branch target has `"branch":"<name>","base":"<base>"` in place of `"pr"`. `tickets` is empty, since the gate knows none.

The report's Audit line suggests `/audit:run "<absolute manifest path>"`: the manifest the run came from, else the one written here.

## 4.4 The report

Read `report.md` and write the report from the record to `<record>/report.md`; with no record (4.2), it is printed only. Then print the whole text of the report, unchanged, as the last text of this target. Nothing follows it: no summary, note or offer. A headless caller sees only the last message, so the report has to be it.

## 4.5 Next

With another target left in the order of the reading block, read `steps/0-preflight.md` for it, skipping its 0.3, which ran once. Otherwise the run is over.

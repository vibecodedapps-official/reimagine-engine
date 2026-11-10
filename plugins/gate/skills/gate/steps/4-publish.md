# Step 4: End the run

Read this file when a target ends in one of the five terminal states. After `blocked` nothing more is pushed.

## The run entry

Take `date -u +%Y-%m-%dT%H:%M:%SZ`. Write this run's entry in `runs` with that time as `ended` and the terminal state as `state`, keeping every other key of the entry, `kept` among them.

A run that ended before preflight made the record writes nothing: no run entry, no manifest and no report file. Its report is printed only.

## The manifest

The audit reads the verdict from a manifest. This run's value is:

```
{"verdict": "<state>", "passes": <n>, "record": "<absolute path of passes.json>"}
```

`passes` counts the passes of `passes.json` whose `run` is this run's number.

- From a manifest: set the value in that file's top-level `gate` object, under the bundle's `repo` path as the manifest gives it, adding the object when it is absent. Read the file again just before the write, since an earlier bundle of the run wrote it, and keep every other key as read.
- Without one: write a minimal manifest in the record, `audit-manifest.json`, or `audit-manifest-run<n>.json` from run 2 on:

  `{"bundles":[{"repo":"<absolute path>","pr":"github:<owner>/<repo>#<n>","tickets":[]}],"claims":[],"gate":{"<absolute path>": <value>}}`

  `repo` is the target's root. A branch target has `"branch":"<name>","base":"<base>"` in place of `"pr"`. `tickets` is empty, since the gate knows none.

Either file is written whole to a temporary file beside it and moved over with `mv <tmp> <file>`, no flags. The report's Audit line names the manifest the run came from, else the one written here.

## The report

Read `report.md` and write the report from the record to `<record>/report.md`. Then print its whole text, unchanged, as the last text of this target. Nothing follows it: no summary, note or offer. A headless caller sees only the last message, so the report has to be it.

With another target left in the order of the reading block, read `steps/0-preflight.md` for it, without its section on instruction files and the permission statement, which ran once. Otherwise the run is over.

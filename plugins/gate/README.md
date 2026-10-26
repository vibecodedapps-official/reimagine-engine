# gate

Run code-review passes over a pull request, several, or a loop manifest, fix what each pass finds, and stop at a verdict when a pass finds nothing left to fix. The gate runs after the loop and before the audit: the loop ships a reviewed pull request, the gate converges the reviewer on it, the audit challenges the result. Each pass reviews the whole change from the merge-base at one level, sorts the findings into fix, defer and reject, has subagents fix the first, and decides from its record whether to run another pass and at what level.

This is a prerelease. It cannot run a pass yet: asked to gate something, it says so and stops. The gate releases at 0.1.0.

## Install

```
/plugin marketplace add vibecodedapps-official/reimagine-engine
/plugin install gate@reimagine-engine
```

## Use

Say it in plain words:

- `reimagine gate PR 73`
- `gate this branch`
- `gate the manifest <path>`
- `/gate` followed by the same words

There are no flags; a word starting with `--` is read as prose. The skill prints how it read your request before it does anything.

## Configuration

An optional `.reimagine.json` at the repository root, with a `gate` key beside the loop's. Every value is optional; the values shown are the defaults.

```json
{
  "gate": {
    "split": 1500,
    "max-passes": 4,
    "budget": 120,
    "models": { "implementer": "sonnet", "fallback-reviewer": "opus" }
  }
}
```

`split` is the number of changed lines above which a pass reviews by top-level path in parallel. `max-passes` is the most passes one run makes, and `budget` is the run budget in minutes; the three are whole numbers of 1 or more. `models` names the model of the implementer and of the stand-in reviewer, each one of `sonnet`, `opus`, `haiku` or `fable`. Unknown keys and bad values are reported and ignored. A file that does not parse stops the run.

## The record

Each run keeps its files in `.reimagine/gate/<branch-slug>/` in your checkout: `passes.json` (the completion record), `findings.json` (the findings across passes), `report.md` (rewritten at every terminal state), each review's saved output, snapshots taken before the subagents edit, and the text of the comment. The directory is excluded through the git exclude file, never `.gitignore`, and is never committed.

## License

Apache-2.0. See `LICENSE`.

# Risk floor, level cap, effort hint

Read this file at Step 1.6, and read it again whenever you judge the risk floor (Step 2, Step 4.5), before the Step 5 pass and before every CI repair, to set the level.

## Risk floor

A change is floored when it adds, alters or removes any of these, directly or through shared code or configuration:

1. an authentication or authorization check
2. a permission rule
3. a schema or a migration
4. a row-level security policy
5. a data access path
6. the signature or behavior of a public API

Check the shared code and configuration the change touches, not only the files it names. A helper, a middleware, a base class or a config key that one of the six depends on counts.

An incidental edit does not trigger the floor. Examples: a typo in a migrations README, a comment in an auth module, a rename with no signature change.

Judge the floor on the plan (Step 2) and again on the actual diff after Step 4 (Step 4.5). Judge the diff itself, not the plan's promise. The floor never falls: once a judgment finds a trigger, the run stays floored for every later step, even when a later edit removes the change that triggered it.

A floored run passes effort at least `high` to every reviewer, and uses at least level `high` for the `code-review` skill, whatever the effort hint says (Step 5 level, below).

The report names the trigger. When an edit touched a sensitive area and did not trigger the floor, the report says why (for example, "a comment edit in the auth module").

## Step 5 level

The `code-review` skill takes an explicit level at Step 5. The effort in force sets it:

| Effort in force | `effort` for Agent calls | `code-review` level |
|---|---|---|
| no effort word | none | `high` |
| `low` | `low` | `low` |
| `medium` | `medium` | `medium` |
| `high` | `high` | `high` |
| `xhigh` | `xhigh` | `xhigh` |
| `max` | `max` | `xhigh` |

The `code-review` level is never above `xhigh`: the word "max" gives `xhigh` to the skill while Agent calls keep `max`, and `ultra` is never typed. A floored run uses at least `high` in both columns, and no hint lowers that. The `opus` stand-in of Step 5 takes the `code-review` level as its `effort`. Record the level in `run.md`.

## Effort hint

Effort words in the request set the effort:

| Words | Effort |
|---|---|
| "quick", "low" | `low` |
| "medium" | `medium` |
| "thorough", "high" | `high` |
| "very thorough", "xhigh" | `xhigh` |
| "max" | `max` |

The effort maps to the `effort` argument of every Agent call you make for a reviewer, and to the level of the `code-review` skill through the table in Step 5 level, which caps that level at `xhigh`. With no effort word, pass no `effort` argument and use level `high` for `code-review`.

The hint never lowers a floored run below `high`: a floored run with "quick" passes `high`. A hint above `high` stands.

Record the hint, the floor and the effort in force in `inputs.md`, and name all three and the Step 5 level in the report.

Return to the step that sent you here.

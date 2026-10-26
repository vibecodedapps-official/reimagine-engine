# Fixtures for findings.mjs

Every spike file below is a headless review result object from the spikes of decision 118, saved whole and printed with two-space indentation. In all of them each absolute path is made relative everywhere, in `result` text and `permission_denials` alike: the spike repository prefixes become repository-relative paths, a bare repository path becomes `.`, and the user instruction file becomes `~/.claude/CLAUDE.md`. No `session_id` or `uuid` held a forbidden string, so no id was swapped.

- `spike1b.json`: spike 1b; a bare fenced array of two findings; paths made relative; no id swapped.
- `spike3.json`: spike 3; a result with no array; paths made relative (none held any); no id swapped.
- `spike4.json`: spike 4; a scope note, seven findings and one note after; the second finding is the second wording of the variance defect (decision 126); paths made relative; no id swapped.
- `spike4b.json`: spike 4b; notes before the array, two findings; the first is the first wording of the variance defect; paths made relative; no id swapped.
- `spike4d.json`: spike 4d; prose before the array and notes after, three findings; the first is the third wording of the variance defect; paths made relative; no id swapped.
- `group-2.json`: derived from spike 4c; the summary of its first finding is replaced by the one in `spike4b.json`, so the two files, read as the outputs of two split groups, share one finding with identical file and summary; paths made relative; no id swapped.
- `is-error.json`: derived from spike 1b; only `is_error` is set to `true`, the array stays; paths made relative; no id swapped.
- `standin.md`: written for the suite; a stand-in reply with a short note, the fenced array of two findings (one with a curly apostrophe and quotes) and a note after.
- `ledger-fixed.json`: written for the suite; a ledger after pass 1 holding the two `spike1b.json` findings, the first `fixed` with a `fix` bucket and an extra `match` field, the second `deferred`.
- `ledger-rejected.json`: written for the suite; a ledger after pass 1 holding the third `spike4d.json` finding as `rejected` with a reject reason.

# The seeded repository

`build.mjs` writes the throwaway repository the eval cases and acceptance items 47 to 49, 53 and 54 run against. Command line: `node tests/gate/fixture/build.mjs <variant> <dir>`, where `<dir>` does not exist yet or is empty. It writes `<dir>/origin.git`, a bare repository holding `main` and `feat/percentile` with its `HEAD` on `main`; `<dir>/repo`, a clone of it on `main` with a local identity; and `<dir>/audit-manifest.json`, a manifest naming that clone and the feature branch. It prints the manifest's absolute path and exits 0; a usage error or a failing git call exits 2. Git runs with a fixed identity and dates and no global or system config, so a variant has the same commit ids on every machine.

`main` holds one commit with `src/stats.mjs` (`sum` and `mean`), its test, a `package.json` whose `npm test` runs `node --test`, and `.reimagine.json` with `checks`. `feat/percentile` adds `percentile(values, p)`, which rejects no values, a value that is not finite and a `p` that is not a whole number from 1 to 100 and computes the rank in whole numbers, so that the seeded off-by-one (it returns `sorted[rank]`, not `sorted[rank - 1]`) is its one defect, with a test that passes only because of it. Each variant adds to that:

- `converges`: nothing more; the seeded bug alone.
- `defers`: `src/summary.mjs`, whose local helper duplicates `sum`, a cleanup finding and not a bug; it rejects no values as `percentile` does.
- `cap`: nothing more in the feature; `.reimagine.json` also sets `gate.max-passes` to 1.
- `carried`: `src/share.mjs`, whose `share` divides with no zero check while `shares` guards the empty and the all-zero list, so a reviewer's report of a missing guard is false.
- `split`: `data/levels.mjs`, a generated file of 1652 lines, so the change is over 1500 lines in two top-level paths, `src` and `data`.

`tests/gate/fixture.test.mjs` builds all five and checks their shas, change and checks.

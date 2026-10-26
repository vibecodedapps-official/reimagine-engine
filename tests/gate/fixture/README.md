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

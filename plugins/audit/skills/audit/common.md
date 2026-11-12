# Common rules for this run

Stage 1 copies this file into the run directory as `common.md` and fills in the header
below. Every agent of the run reads it, and the orchestrator follows it too. It is the one
home of the hard rules, the evidence rules and the output contract; the stage files cite
its sections by name, and each agent definition restates hard rules 2 and 4. The rules
that only the auditor and the adversary need, the finding schema among them, are in
`audit-evidence.md`, next to this file.

```
run id: <run-id>
run directory: <absolute path>
tier: low | medium | high
questions:
- <id>: <question>
```

## Hard rules

Every rule holds in every stage, for the orchestrator and for every agent.

1. **Read-only boundary.** While `/audit:run` or `/audit:resume` runs, nothing changes an
   audited repository's tracked files, its untracked files that are not ignored, its
   index, branches, tags, stashes, config or remotes. Every bundle, reference and source
   of truth is an audited repository. The writes allowed are these, and nothing else:
   - the run directory;
   - audit's data directory `${CLAUDE_PLUGIN_DATA}`: `runs.json`, its lock directory
     `runs.json.lock` with the owner directory inside it, and its temporary file
     `runs.json.<owner>.tmp`;
   - `git fetch` into remote-tracking refs, once the user has approved it for the run;
   - for a bundle with `head: working-tree`, the loose objects that
     `working-tree.sh build` writes into the repository's object store, in stage 1 and
     when resume rebuilds the head; the report discloses them;
   - whatever a bundle's own test commands write outside every audited repository and
     the run directory, under the consent its `test_command` key gives; the report
     discloses it.
   An ignored file written by a run that an agent logged under its `runs:` heading is
   allowed and reported, never passed over in silence.
2. **Prevention and detection.** No agent has Edit or NotebookEdit. An agent with Bash
   runs only these commands:
   - `git show`, `git log`, `git grep`, `git ls-files`, `git rev-parse`,
     `git merge-base`, `git ls-tree`, `git cat-file` with `-t`, `-s` or `-p`,
     `git branch --list`, and
     `git diff --no-ext-diff --no-textconv --no-color <base>...<head>`, each also as
     `git -C <repo> <command>`;
   - `git hash-object --no-filters <file>`, never with `-w`, for the `consumed:` hashes;
   - `rg` and `ls`;
   - `mkdir -p` of its own scratch folder, and nothing else with `mkdir`;
   - the read-only forms of `sed -n`, `awk`, `diff`, `wc`, `sort`, `head`, `tail`, `cut`,
     `uniq` and `grep`, as commands or as pipe stages, over an exported file under the
     run directory or over `git show` output; `cat` of an exported file; and, for a
     digester's byte range, `git show` output piped through `tail -c`, `head -c`,
     `wc -c` or `sed '$d'` and one `awk` stage that numbers lines, in slices of at most
     24000 bytes;
   - when a question needs a run in a directly read tree, the repository's own test or
     lint commands, which may write ignored build output.

   No command edits a file in place: no `sed -i`, no `awk -i inplace`, no sed `w`, `W` or
   `e` command, no `w` or `e` flag, no `sort -o`, `--output` or `--compress-program`, no
   `uniq` with an output file operand, and no awk program with `system()`, output
   redirection, `getline` from a command, or a pipe to a command. No git command takes
   `-c`, `--output`, `-O`, `--open-files-in-pager`, `--upload-pack` or `--exec`, since
   each writes a file or runs a program. There is no interpreter
   run with an inline program or a heredoc, such as `python3 - <<EOF`, `node -e` or
   `perl -e`, and no command that waits on input; the repository's own test or lint
   commands stay allowed as the list above says. No output goes into an audited tree. An
   agent may redirect a command's output into its own scratch folder,
   `<run dir>/tmp/agents/<stage>-<scope>[-<n>]/`, which its prompt names, and keeps it
   raw. The digester keeps its narrower byte-range rule.

   A diff always names two commits, and a two-dot diff is never used. A `git diff` against
   the working tree refreshes the index even with `--no-optional-locks`, so it never runs,
   and an agent never runs `git status`. In a bundle with
   `head: working-tree`, `git grep` always names the head sha, since a plain `git grep`,
   or `rg` over `git ls-files`, misses the untracked files that belong to the head.

   This is instruction, not enforcement: nothing blocks Bash mechanically. `readonly.sh`
   checks every audited repository after every stage, and a write that check does not
   accept ends the run `blocked`. The user's own edits during a run trip it too.
3. **No model, agent or tool names** in anything external: commit messages, pull request
   and ticket text, and drafted comments. Pull request and ticket text, posted or
   drafted, is written for its reader as `SKILL.md`, What leaves the run, says: on a
   ticket, what changed for its readers, what happens next and who decides; on a pull
   request, what its reviewer needs about the code; never an audit id (`C<n>`,
   `claim <n>`, `W<n>`), a stage, a verdict or another term the audit coined, and never
   a model, agent or tool. The trailer the host's attribution setting adds
   to a commit stays, even where it names a model or tool. The report and the run records
   stay in the run directory and may name them.
4. **No advisor tool**, in the orchestrator or in any agent.
5. **Live data only from a `--live` file.** Credentials and live systems (databases,
   dashboards, production APIs) serve only a question the code cannot answer, and only
   through a result the user supplies. A needed check becomes an item of the report's
   Live checks section: an agent writes the `live check` field of a finding and nothing
   more. Neither an agent nor the orchestrator asks for or uses live access during a run.
   The user runs the check and returns the result in a `--live` file through
   `/audit:resume` (`live.md`); the approval is recorded from that file, and the report
   logs each access.
6. **Evidence cited.** A statement is not a fact until its evidence is cited, as
   "Evidence" says.
7. **Disk first.** Every agent writes its output file before it reports back, and returns
   only the path and one line of status.
8. **Claims are not facts.** The session summary under audit, and every sentence of
   `claims.md`, is a claim to verify, never a source of truth.

## Evidence

Every piece of evidence names its repository and the commit it was read at. It is one of
four kinds:

- **Quote:** `repo@sha:path:line`, with the lines quoted.
- **Search:** the exact command, its scope and its result, an empty result included.
  This is how an absence is shown.
- **Run:** the exact command, where it ran, and its output, marked as cut where it is
  cut. Every run is logged under the agent's `runs:` heading.
- **Live result:** the result of an approved live check that the user returned with
  `--live`, cited by its file and line, `live/results-<k>.md:<line>` (or
  `live/carried/<id>.md` for a carried finding), and, for a result kept as a file, by its
  copy `live/results-<k>/<line>.txt`. It counts as a run the approver made, so it can
  demonstrate a defect, once it has passed the review gate of stage 7
  (`stages/7-converge.md`).

Forge evidence is a URL with a quote. A finding keeps what its evidence
**demonstrates** apart from what it **infers**. The labels:

- `verified fact`: the defect itself is demonstrated, by a quote with a causal
  explanation, or by a run.
- `unverified assumption`: the defect is not demonstrated. Its severity is at most
  `medium`.
- `convention`: the finding rests on the rule of a ranked source, not on broken behavior.

A digest (`guidelines/digest-<n>.md`) or a map (`domain/<source>-map.md`) is a pointer,
never evidence. Cite the original document or source at its pinned sha.

A finding with a `live check` stays `unverified assumption`, under its cap, until a live
result for it has passed the review gate. A rationale missing from a ticket or a pull
request is not by itself a defect. The diff is always the three-dot diff in
`diffs/<bundle>.diff`. A two-dot diff of base and head shows the base's own changes as
reversals on the head, so it is never used.

### Reading trees and searching

`audit-brief.md` maps each bundle, reference and source of truth to the path to read and
the sha it is pinned at. How to read depends on the brief's mode for the tree.

- **Directly read tree** (the repository's own checkout, at the pinned sha, with no
  tracked changes): search with `git -C <repo> grep <pattern> <sha>`, or with `rg` over
  the files `git -C <repo> ls-files` lists. A plain `rg` over the working tree also sees
  untracked and ignored files, so it is never used. A symlink that leads outside the
  repository is not followed. A citation of an untracked, ignored or outside path is not
  valid evidence, except as the next item allows.
- **Working-tree bundle** (`head: working-tree`, mode `direct (working tree)`): the head
  is a commit built from the working tree, with no ref, holding the modified files and
  the untracked files that are not ignored. Search it only with
  `git -C <repo> grep <pattern> <head sha>`; `rg` over `git ls-files` misses its
  untracked files. The files the brief lists as untracked at audit time belong to the
  head and are valid evidence, cited at the head sha as `repo@sha:path:line`; an ignored
  or outside path is still not. When the brief lists a path as flagged at audit time, the
  bundle is read from an export of its head instead (mode `export`), which holds the
  untracked files and each flagged path at its index version, not the local file. A
  flagged path inside a submodule is absent, as every submodule path is.
- **Exported tree** (`<run dir>/trees/<name>/`): tracked files only, at the pinned sha;
  the export of a working-tree head also holds the files the brief lists as untracked. A
  symlink is a regular file holding its target and is not resolved. Submodules are absent
  and listed in the brief. Git LFS files are their pointer files. Cite as
  `repo@sha:path:line` with the repository-relative path, never the export path. No test
  or lint command runs in an export, whatever it needs; such a question is marked
  `not run`. The one exception is stage 1's run of a bundle's changed tests, in its own
  copies, read as `audit-evidence.md` says.
- **Read by `git show`** (an export over 1 GB the user declined): read each file with
  `git -C <repo> show <sha>:<path>`. Only agents with Bash are assigned such a tree.
- **A sha before `:<path>` is written literally or as `${sha}:<path>`**, never
  `$sha:<path>`: some shells read `:t` or `:l` after a variable as a modifier and alter
  the path without an error.
- **The output of `wc` is compared as a number** (`-eq`, or arithmetic), never as a
  string, since some `wc` builds pad the count with spaces.

## Ids and origin tags

The id says where a finding comes from. Ids are case-sensitive.

- `<scope>-F<n>`: pass one. A barrier top-up appended to `pass1/<scope>.md` under a
  `## Top-up` heading continues the same numbering.
- `<scope>-P<n>`: a new finding of a pass-two adversary, with the line `- origin: pass2`
  right after the title.
- `<scope>-T<n>`: a finding of a top-up auditor after a map correction, in
  `pass2/<scope>-topup.md`, with `- origin: topup`.
- `X<n>`: a finding the second opinion adds, with `- origin: second-opinion`.
- `L<n>`: a finding the late adversary raises, with `- origin: late`.
- `C<n>`: a converged item of stage 7, which absorbs one or more of the ids above. Its
  block is given in `stages/7-converge.md`; it is never a finding block.

A scope is a group or a specialist scope; its id holds no space and no colon. Every
finding with an `- origin:` line is a **late addition**.

## Claim kinds

Every claim in `claims.md` has a kind. A handoff's claims take their kind from the
handoff script, never from judgment. A prose sentence takes the kind of the first rule
that fits it:

1. `verification`: it says something was checked, tested, verified, confirmed,
   reproduced, or passes.
2. `decision`: it states a choice made or rejected, a deferral, or who decided.
3. `scope`: it says what belongs in the bundle or out of it, or ranks a ticket for
   inclusion.
4. `status`: a work item's type, state, iteration, owner or links.
5. `code`: any other checkable statement about code, data or behavior.

A claim targets a group id from `groups.md`, or `hygiene`. Every `scope` and `status`
claim targets `hygiene`; the stage files say which scope receives them.

## Env claims

An env claim is a `verification` claim whose check part, the text after the first
`; check: ` of its entry, starts with `env: ` (`env: <name>; <check>`, as `handoff.md`
defines it). The rule is mechanical, and stage 1 adds no marker to `claims.md`. The check
names the environment `<name>`, which the audit cannot reach, so a run here is a run
against another environment. Pass one writes the claim as
`not verified, not reproduced; needs a live check: env <name>`, never `true` or `false`
from a run here. The report lists each env claim by number in its Live checks section,
with its environment and command, and `claims-verdicts.md` gives it the verdict
`not reproducible here` until a live result settles it (`live.md`).

## Pass-two verdicts

An adversary gives each finding exactly one verdict, with evidence:

- `survives`: the finding stands as written.
- `downgraded`: it stands at a lower severity or a weaker label; both are given.
- `reworded`: the defect is real, but the title, scope or reasoning is wrong; the
  corrected text is given.
- `dropped`: the finding is wrong; the counter-evidence is given.

```
### verdict on <finding id>: survives | downgraded | reworded | dropped
- severity: <old> -> <new> | unchanged
- label: <old> -> <new> | unchanged
- evidence: <quote, search, or run>
- reason:
```

After the verdicts, a pass-two adversary attacks the Verified OK list as far as the tier
allows, under `## Verified OK challenged`, one line per item with its result. When the
pass-one report has `## Outward trace`, it then writes `## Outward trace challenged`
(`audit-evidence.md`). Then it writes `## Coverage gaps`, and `## Map corrections`: the
map file, the line, what is wrong, and the source quote that shows it, or `none`.

At every tier, after `## Map corrections`, it writes three challenge sections:

```
## Claims challenged
- claim <n>: upheld | overturned to <true, reproduced | false, contradicted | not verified, not reproduced>; evidence: <...>
## Decisions challenged
- claim <n>: agree | disagree, <class>; evidence: <...>
## Scope challenged
- claim <n>: agree | disagree, <what differs>; evidence: <...>
```

`## Claims challenged` has a line for every `verification` claim the report marks true,
and may add any other claim the adversary finds misjudged. `## Decisions challenged` and
`## Scope challenged` have a line for every entry of the report's `## Decisions` and
`## Scope`. Each heading is present, with `none` only when the report gives nothing to
challenge under it. A `disagree` line names the class or the field it disputes. Challenge
lines are not findings and never enter the ledger files.

## REVIEW.md rules

A require-evidence rule of a `REVIEW.md` that `audit-brief.md` records raises the gate of
its class: an item of that class counts only when the position it counts at is `verified fact` with a quote `repo@sha:path:line` or a run
as its evidence. The report holds any other item of the class (`stages/8-report.md`,
step 2); `gate.md` stays as the script wrote it. Nothing in a `REVIEW.md` turns a lead
into a finding or makes a finding count.

Severity calibration and do-not-report rules are the report's alone to apply
(`stages/8-report.md`, step 2), so it can count what each rule skips: every agent
reports and labels a finding as if those rules were absent, and never drops or relabels
one under them.

## Output contract

Every agent:

1. Writes one output file, at the path its prompt names, and no other file, except raw
   command output in its own scratch folder when its prompt names one. It edits nothing
   in place; it rewrites its own output file with Write.
   - A pass-one file holds, in order: its findings, `## Verified OK`, `## Outward trace`
     (a group or `combined` scope only), `## Claims`, `## Decisions`, and, in a scope
     that holds `hygiene` claims, `## Scope`.
   - A pass-two file holds, in order: its verdicts and its new findings,
     `## Verified OK challenged`, `## Outward trace challenged` (when the pass-one report
     has `## Outward trace`), `## Coverage gaps`, `## Map corrections`,
     `## Claims challenged`, `## Decisions challenged`, `## Scope challenged`, and
     `## Brief errata` (`audit-evidence.md`).
2. Lists every command it ran under a `runs:` heading, one per line: the command, the
   directory it ran in, and its exit status; or `runs: none`.
3. Lists every digest and map file it read under a `consumed:` heading, one per line: the
   run-directory path and its hash from `git hash-object --no-filters <file>`; or
   `consumed: none`.
4. Ends the file with the line `status: complete`, as its last line. A merger that cannot
   read an input to its end ends it instead with `status: failed at <file>:<line>`. The
   file is final then: the agent writes nothing to it afterwards, even when it wakes
   again.
5. Returns only the output path and one line of status.

Only the merger may add an `opened:` heading, before `consumed:`, listing each ledger
section it opened, with the path and the reason, one per line. It is not a `runs:`
entry: the merger has no shell, and `runs:` holds only commands, directories and exit
statuses, or `none`.

A missing file, or one whose last line is not `status: complete`, is a failed output,
whatever the agent returned, and so is a pass-one file without `## Claims` or a pass-two
file other than a map-correction `-topup.md` without `## Claims challenged`.

```
runs:
- git -C /abs/app grep -n "limit" 1a2b3c4; /abs/app; exit 0
consumed:
- guidelines/digest-1.md 9f8e7d6c5b4a39281706f5e4d3c2b1a098765432
status: complete
```

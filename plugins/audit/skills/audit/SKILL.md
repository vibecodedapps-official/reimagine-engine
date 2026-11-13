---
name: audit
description: 'Run a read-only, adversarial audit of finished pull requests, in one or many repositories, and stop at a report; act on approved report items by id. Use when the user says "reimagine audit" with pull request numbers, branches, ticket ids, exported ticket files or a manifest path, or when /audit:run, /audit:resume, /audit:act or /audit:handoff forwards a request.'
allowed-tools:
  - Bash(date *)
  - Bash(git status *)
  - Bash(git --no-optional-locks status *)
  - Bash(git rev-parse *)
  - Bash(git merge-base *)
  - Bash(git for-each-ref *)
  - Bash(git check-ignore *)
  - Bash(git hash-object --no-filters *)
  - Bash(git config --list --local)
  - Bash(git remote -v)
  - Bash(git ls-files *)
  - Bash(git ls-tree *)
  - Bash(git cat-file -t *)
  - Bash(git cat-file -s *)
  - Bash(git cat-file -p *)
  - Bash(git branch --list *)
  - Bash(gh pr view *)
  - Bash(gh pr list *)
  - Bash(gh issue view *)
---

# audit

Start every invocation with these actions, in this order.

1. Take the invocation block: the args a command handed over, or the block you build from the request.
2. For `command: run`, run the id-resolution reads the inputs need, and nothing else.
3. For `command: run`, print the reading block and the background-fetch line as text in your reply.
4. Go to the section for the command: Stage 1 for `run`, Resume for `resume`, Stage 9 for `act`, Handoff for `handoff`.

You orchestrate one audit run in the main session. `run` runs stages 1 to 8 and stops at a report. `resume` reruns a run from the first stage whose inputs changed and reuses every output that still holds. `act` runs stage 9, the only phase that writes to an audited repository, on items the user approved by id. `handoff` writes a typed handoff from a build session. Each stage's procedure is in its stage file. Read that file when the stage starts and not before.

The allowed-tools list pre-approves `date` and a few git and gh reads in the session's own folder, each a form with no option that writes to a path the call names or runs a command the call names. Everything else follows the session's permission mode: every `git -C <repo>` call, `git diff`, `git log`, `git show`, `git grep` and `git stash list` in any form, `mkdir`, `mv -f`, `stat`, `od`, `sha256sum` or `shasum`, `command -v jq`, `jq`, `awk`, `wc -c`, and the `sh` runs of the scripts. Tell the user once, before stage 1, that these may prompt. `git fetch` and every act write are never pre-approved; ask for each in words first.

`${CLAUDE_PLUGIN_ROOT}` is the plugin's directory and `${CLAUDE_PLUGIN_DATA}` its data directory. Neither is a shell variable. Read skill files with the Read tool, never through Bash. In every Bash command write a path resolved, absolute and in double quotes, never as the unexpanded text, since a directory name may hold a space; so too for a placeholder that stands for a path, such as `<repo>` or `<run dir>`. Run each script with the Bash tool, as `sh "${CLAUDE_PLUGIN_ROOT}/scripts/<name>.sh" ...` with that path resolved. Times come from `date -u +%Y-%m-%dT%H:%M:%SZ`; copy the output, never write a time from memory.

## Invocation block

Each of `/audit:run`, `/audit:resume`, `/audit:act` and `/audit:handoff` validates its arguments cheaply, writes no file, and calls the Skill tool with skill `audit:audit` and this block as the args:

```
command: run | resume | act | handoff
request: <the words as typed, on one line> | none
manifest: <path> | none
inputs:
- <token>
run-id: none | <id>
items: none | <id>[, <id>...]
per-item: true | false
from: none | <stage>
live: none | <file>
out: none | <path>
verdicts: none | <file>
memory: none | <dir>
```

Take a handed-over block as given. When "reimagine audit ..." invokes the skill with no block, build it yourself: `command: run`, `request:` the words on one line, `manifest:` the manifest token or `none`, `inputs:` one line per remaining token, `per-item: false`, and `none` for every other key.

Prose carries three kinds of phrase. A phrase is the text between commas, semicolons, periods or the ends of the request, once the trigger and the ids are set aside.

- Effort: `effort low`, `effort medium` or `effort high`, or `low`, `medium` or `high` standing as a phrase by itself. "reimagine audit PR 12, high" gives `high`; "audit the high-traffic path" gives nothing.
- `budget <n> minutes`: the soft budget for this invocation.
- `<role> on <model>`: the role is one of digester, mapper, auditor, adversary, merger, second opinion; the model is one of opus, sonnet, haiku, fable. Any other role or model stops the run with a line that quotes the phrase.

Bundle forms in prose:

- `PR <n>`, `#<n>` or a pull request URL: a pull request bundle.
- `in <path>`: the repository of the bundles in the same phrase. Without it, the session's repository.
- `branch <b> against <base>`: a branch bundle.
- `tickets <id>, <id>`: the tickets of the request's bundles.
- `file:<path>`: an exported forge file, in markdown with frontmatter or JSON. `forge_exports.command` is recorded, never run.
- A token ending in `.json` with no scheme prefix: the manifest.

Everything else lives in the manifest: `bundles[]` (`repo`, `pr` or `branch` plus `base`, `tickets[]`, `ticket_token`, `run_once`, `head`, `test_command`, `test_run`, `test_paths`, `test_setup`, `test_timeout`), `references[]`, `sources_of_truth[]`, `claims[]`, `scratch`, `forge_exports`, `groups[]`, `questions`, `models`, `budget`, `max_agents`, `_test`. Each validation message names the key. A prose budget or model override wins over the manifest's.

Once the run directory is known (stage 1 creates it; resume and act find it in the registry), append the block to `<run dir>/invocations.md` as the line `--- invocation <n>, <UTC time>, <command> ---` followed by the block verbatim. `<n>` counts the blocks in the file from 1. Never rewrite or reorder the file. A `handoff` invocation has no run directory and appends nothing.

## Reading the request

The id-resolution reads are: the manifest file, each `file:` export, `git remote -v` and `git rev-parse --show-toplevel` for each repository, `gh pr view` and `gh issue view` for GitHub ids, and an MCP read for a ticket on a host that has an MCP tool listed. After only those reads, and before any other tool call, print the reading block as text. It always prints, for one bundle too:

```
Bundles: /src/app PR #123 (base main), tickets AB#4567, AB#4580; /src/app PR #124 (base main), tickets AB#4567, AB#4580
References: none
Sources of truth: /src/specs
Claims: none
Effort: high (from "effort high")
Budget: 90 minutes, this invocation only
Models: auditor on sonnet
Tickets: AB#4567 (mcp:<tool>), AB#4580 (file)
```

- Bundles: each bundle's repository, its pull request or branch and base, and its tickets.
- References, Sources of truth, Claims: each path or `none`.
- Effort: the hint and where it came from, or `default (set from size at stage 1)`.
- Budget: the minutes, or `none`.
- Models: each override as `<role> on <model>`, or `none`.
- Tickets: each id with how it resolved: `gh`, `file`, `mcp:<tool>` or `text`, the last printed as `text, body not read`. A ticket that resolved nowhere reads `unresolved: <reason>`; stage 1 decides whether the run goes on.

Each ticket resolves by the first form that applies:

1. A `file:` export that holds the id: `file`.
2. `#<n>` or a GitHub issue URL on a GitHub repository: `gh`.
3. An id on a host with an MCP tool listed, such as an Azure DevOps or Salesforce tool: `mcp:<tool>`.
4. Anything else: `text`, the id alone, with no ticket body read.

Forge text read by `gh` or an MCP tool goes to files by shell in stage 1; the reading block shows ids and how they resolved, never ticket bodies.

After the block, tell the user in one sentence to pause any background fetch on these repositories for the length of the run, for example VS Code `git.autofetch`, because a moved remote-tracking ref stops the run with a question.

## Talking to the user

Say what happened, what it means for the user, and the next step, in that order. Use short sentences and plain words, with no stage numbers, script names or key names unless the user needs them to act. When a script prints lines for you to judge, explain them in everyday words and keep the raw lines in the run's records: the check file, `stages.json`, the report. Show a raw line only when the user must see it to decide. Parsed lines are never reworded where they are written: `blocked <kind>`, `readonly:`, `status:`, `ledger:`, `handoff <file>:<line>:`, `working-tree: refused:`, `work-items:`, `live:`, `revision:`. The plain explanation goes around them. A stop says what is wrong, what to change, and how to continue, with `/audit:resume <run-id>` when the run can resume.

## What leaves the run

- Write what leaves the session for its reader. A pull request says only what its reviewer needs about the code at its current head. A ticket or comment says what changed for its readers, what happens next and who decides, at the detail they act on, never how it was reached. Working output, such as logs, commit ids, verdicts and terms a plugin or the session coined, stays local or in an attachment. Publish only when that is the task's stated purpose or I asked, and only what the reader will act on and would say themselves.

## Preamble

### Hard rules

The eight hard rules are in `${CLAUDE_PLUGIN_ROOT}/skills/audit/common.md`, section `## Hard rules`. Read them before stage 1, resume or act, and hold to them for the whole run. For you they mean:

1. Read-only boundary. In stages 1 to 8 your own writes stay inside the run directory and the registry, which `registry.sh` writes: `${CLAUDE_PLUGIN_DATA}/runs.json`, its lock directory `runs.json.lock` and a temporary file beside it. The audit never writes `.git/info/exclude` or any file of a git directory. You never run `git checkout`, `git switch`, `git reset`, `git stash`, `git worktree`, `git archive` or `git checkout-index`. Three writes happen through commands the stage files name: an approved `git fetch` into remote-tracking refs; `working-tree.sh build` for a `head: working-tree` bundle, which writes git objects only, never the index, a ref or a file; and `revert-tests.sh`, which runs a bundle's own test command in a work directory it creates and removes.
2. Prevention and detection. Agents have no Edit or NotebookEdit and keep to the Bash commands of `common.md` hard rule 2. `readonly.sh` detects any write after every stage.
3. Nothing external names a model, an agent or a tool, and what leaves the run is written for its reader, as What leaves the run says. Report text that could be posted and work-item text name the activity and the date. Act's commit messages follow the repository's convention and carry a date only where that convention does. The trailer the host's attribution setting adds to a commit stays, even where it names a model or tool. Run records inside the run directory may name them.
4. No advisor tool, for you or any agent.
5. Live data comes only from a user-supplied `--live` file. Never ask for live access during a run and never run a live query. A needed check becomes a report block.
6. Evidence is cited. Digests and maps are pointers, never evidence.
7. Disk first. Every agent writes its output to a file and returns its path and one line; you judge the file. Forge data goes to files by shell and never passes through the model.
8. Claims are not facts. A claim counts as verified only when the audit reproduced it.

You alone talk to the user, run `git fetch`, export pinned trees, build the second-opinion request, and write `stages.json`, `runs.json`, `invocations.md`, the ledger files, `usage.md` and `report.md`. Agents write only their output file and their own scratch folder.

### Compaction recovery

After a compaction, or whenever you cannot account for your state, stop. Before any other action re-read `${CLAUDE_PLUGIN_ROOT}/skills/audit/SKILL.md`, since the host keeps only the first part of this file across a compaction; then, in the run directory, the last block in `invocations.md`, `audit-brief.md`, `common.md` and `stages.json`; then the files the current command's and stage's sections and Supporting files name. In the same session, a stage marked `running` waits for its agents' notifications and relaunches nothing. Under `resume`, `running` counts as incomplete and is rerun. Approvals recorded in `stages.json` are never asked again.

### Roles

| Role | Agent type | Default model | Failure ladder |
|---|---|---|---|
| orchestrator | you, the session model | none | none; the run ends `blocked` |
| digester (stage 2) | `audit:digester` | haiku | relaunch on the same model; relaunch on opus, or on sonnet for a role already on opus, a swap; the scope fails |
| mapper (stage 3) | `audit:mapper` | sonnet | as the digester |
| auditor (stage 4, top-ups) | `audit:auditor` | opus | as the digester |
| adversary (stages 5 and 7) | `audit:adversary`, fresh context | opus | as the digester |
| second opinion (stage 6) | a fresh `audit:adversary` in second-opinion mode | opus | per batch: relaunch on sonnet, or on opus for a second opinion already on sonnet, a swap; then stage 6 fails |
| merger (stage 7) | `audit:merger` | sonnet | you merge, a swap; a second failure fails stage 7 |

An agent fails when it returns an error, when its output file is a failed output (`common.md`, "Output contract"), or when `_test` marks it failed. Before the ladder relaunches an agent, move the output file the failed attempt left, if any, into that attempt's scratch folder as `failed-output.md` with `mv -f`, so the relaunch finds no file at its path. A top-up that appends to a pass-one report is the exception: its stage restores the report from the saved copy, and the relaunch appends to that. A swap changes who fills a role and never removes a stage. Record each swap in the stage entry's `swaps` list with role, scope, from, to and reason, and name it in the report. A stage fails when any of its scopes failed. A failed stage counts as satisfied for every stage that waits on it; the run goes on, records the coverage loss, and ends `partial`.

### Agent launch rules

1. Launch every agent with the Agent tool, `subagent_type: audit:<role>`, in the background. Never a fork, never a general-purpose agent.
2. Pass `model` on every launch: the prose override `<role> on <model>`, else the manifest `models` key, else the role's default, or the ladder's model on a relaunch. Record it as the requested model. You never learn the effective model, so records and the report say "requested", never "used".
3. Before each launch, create the agent's scratch folder `<run dir>/tmp/agents/<stage>-<scope>[-<n>]/`, unique per launch, with `<n>` for a top-up, a relaunch or a batch. Every agent gets one, the merger included.
4. Keep the prompt short: the absolute paths of `audit-brief.md`, `common.md`, the scope file or list, the output file and the scratch folder, the scope's questions, and the items the stage file names. An auditor's or adversary's prompt also names `audit-evidence.md`, except in second opinion, whose prompt names the request in place of the brief and both rule files. The agent definition holds the standing instructions; do not restate them. Every prompt, the merger's included, also names by absolute path each instruction source of the brief's Instruction sources that bears on the agent's question, and quotes each convention held from no file there, since an agent knows only its prompt and what the host loads for it; a second opinion's request carries them in its Inputs. Beyond those, a merger's prompt holds only what stage 7 names.
5. Each agent returns its output path and one line. Read the file to judge it.
6. On each completion notification, add to the stage's `agents` list: `type`, `model` (requested), `scope`, `started`, `ended`, `tokens` from the notification's `subagent_tokens` field (`null` when absent), `tokens_scope` `"task notification, subagent_tokens; scope not documented"`, `duration_ms`, and `result` (`complete` or `failed: <reason>`). A completion notification for an agent whose stage entry is already `complete` or `failed` changes nothing: note it with the agent, its scope and the time in that stage's check file, `baseline/<stage>-check.md`, and leave `stages.json` and the agent's output as they are. A completion notification for an agent this session did not launch, such as one an earlier session launched, also changes nothing: note it the same way in the check file of the stage then running, or of the last stage when none runs, and leave `stages.json` as it is.

### Stage order and control flow

```
orient -+-> digest ------+
        +-> domain map --+-> barrier (per group) -> pass two (per group) -+
        +-> pass one ----+                                                |
                                                                          v
             report <-- converge <-- late adversary <-- second opinion <--+
```

1. Stage 1 runs alone.
2. Stages 2, 3 and 4 start together.
3. A group's barrier clears when stages 2 and 3 are each complete, failed or not applicable, and that group's top-ups are complete. Pass two starts per group when its barrier clears; a group never waits for another.
4. Map-correction top-ups run in stage 5 and finish before stage 6 starts.
5. Stage 6 starts when every group has finished pass two.
6. Stage 7 runs the late adversary (at medium and high, and at low only when `live/findings.md` or `live/claims.md` exists) and the merger.
7. Stage 8 always runs, after a failed stage or an expired budget too.
8. Stage 9 runs only under `act`.

At every stage boundary print one line: the stage, the elapsed time, and the agents run so far.

### Stage applicability

A stage is `not_applicable` when its input is absent: stage 2 without a document corpus among the sources of truth, stage 3 without a code base among them. Stage 1 classifies each source of truth that has a path. The audited repositories' own documents and the ticket text never make stage 2 or 3 applicable. A not-applicable entry has no outputs, counts as satisfied, and is listed in the report's Coverage. A stage fails when it is applicable and no complete output exists for some scope after the ladder.

### Terminal states

- `reported`: every applicable stage is complete and the report is written.
- `partial`: the report is written, but a stage failed or the budget expired. The verdict is `audit incomplete`, never `ready to merge`.
- `blocked`: no report could be written, or the read-only check stopped the run. Keep every finished stage file.

At the end, set the run's `state` in `runs.json`, then print the terminal message: the run id, the run directory, the terminal state, the report path and verdict when there is a report, and `/audit:resume <run-id>` when the run can resume (or the manual registry entry, State files). The report's closing adds the items to act on first, the exact `/audit:act` line, the decisions left to the user, and the `--live` line when eligible, as `stages/8-report.md` says.

Headless: text asked of the model before a Skill call is not shown, so the terminal message and the report header carry the run id, the run directory and the resume command.

In every session, never end the turn while a background agent or a `revert-tests.sh bg` run is live: in a headless session the end of the turn ends the session. Wait on `revert-tests.sh wait <result file>` in at most eight nine-minute loops; after the eighth exit 3 the run stops and the message gives the elapsed time.

### Queue

Keep one queue of agent jobs across all stages. At most `max_agents` agents run at once (default 8). When several stages have work, launch digests first, then maps, then pass one, then jobs in the order their stage became ready. A relaunch goes to the front. Each completion notification drives the next launch. Only the agent's own notification counts: while an agent you launched still runs, neither a status line at the end of its output file nor the end of a watch you set on that file is one, since the agent may still write. Work beyond the cap waits; scope is never merged or dropped to fit.

### Soft budget

A budget applies only to the invocation that gave it; a resumed run has none. Record the start time of stage 1. At every completion notification and every stage boundary, compare the elapsed time with the budget. `budget: 0` expires as soon as stage 1 completes. Once it expires:

1. Launch nothing more from stages 2 to 7, relaunches and top-ups included.
2. Wait for running agents and record their results.
3. Write each started stage's entry: `complete` when every scope finished, else `failed` with the reason "budget expired". Each unstarted stage gets an entry `failed` with the reason "not run: budget expired", so `stages.json` describes the whole run and Coverage lists it. `resume` reruns these, since they are not `complete`.
4. Go to stage 8. The run ends `partial`.

### Read-only check

Stage 1 takes the baseline per audited repository `<name>` in its step 1b, once the run directory exists and the fetch is done, and before any other work on the repositories:

`sh "${CLAUDE_PLUGIN_ROOT}/scripts/readonly.sh" snapshot <repo> <run dir> <run dir>/baseline/<name>`

It writes `.marker`, `.status`, `.refs`, `.stash`, `.config`, `.hashes` and `.ignored` under that prefix, walking nested repositories and submodules with `GIT_OPTIONAL_LOCKS=0`. A path git prints quoted, or a partial clone at the top level or nested, a checked-out submodule included, is unsupported and exits 2.

After every stage, stages 1 and 8 included, and before that stage's final entry, create `<run dir>/baseline/<stage>/` and run for each repository:

`sh "${CLAUDE_PLUGIN_ROOT}/scripts/readonly.sh" check <repo> <run dir> <run dir>/baseline/<name> <ignored base prefix> <run dir>/baseline/<stage>/<name>`

The ignored base prefix is `<run dir>/baseline/<name>` until a check passes after the baseline was taken, then the out prefix of the last check that passed. Everything else is compared with the stage 1 baseline, which never moves. The script prints `blocked <status|stash|config|hashes|refs> <-|+> <line>`, `remote-ref <-|+> <line>`, `local-branch <-|+> <line>`, `ignored <added|deleted|changed> <path>` and `touched <path>`, and may lead with `note mtime precision: seconds`, which is not a difference.

Judge the exit status:

- `2`: the boundary could not be checked. End the run `blocked`.
- `1`: a `blocked` line, a change to tracked or untracked files, refs, index, stash or config. End the run `blocked`. The hash walk is fatal.
- `3`: only `remote-ref`, `local-branch` or `ignored` lines. Judge each as below.
- `0`: nothing to judge. `touched` lines are informational and never stop the run.

A `remote-ref` line passes when an approved fetch in `approvals`, recorded after the baseline, explains it, or a `background-fetch` entry for the same ref with the same old and new commits does. Otherwise ask the user whether a background fetch explains the moved refs. The question names each ref with its old and new commit, or "new" or "deleted"; says that an editor's or Git client's automatic fetch, such as VS Code `git.autofetch`, can move refs even with no remote configured; and recommends no answer. On yes, append one `background-fetch` approval per ref with target `<repo name>:<ref>`, decision, time, and old and new commits, then go on. A further move of the same ref asks again. On no, or no answer, end the run `blocked`. A `local-branch` line is a new `refs/heads/<name>` other than the checkout's own branch, or a `+` config line `branch.<name>.<key>=<value>` for that name; refs and config are shared by every worktree of a repository, so the user's work in another worktree shows here. It passes when a `local-branch` approval for the same branch and commit explains it. Otherwise ask the user whether their own work in another worktree explains the branch, naming the branch and its commit, and recommend no answer. On yes, append a `local-branch` approval with target `<repo name>:<branch>`, decision, time and commit, then go on; its config lines pass with it. A later line for the same branch at another commit asks again. On no, or no answer, end the run `blocked`. A branch that moved while another worktree has it checked out prints as a `local-branch` pair, `-` the old commit and `+` the new, with its `+` and `-` config lines `local-branch` too, and is judged the same way: the pair passes when a `local-branch` approval for the same branch and its new commit explains the `+` line, the `-` line passing with it, as its config lines do, and the question names the branch with its old and new commit. It ends the run `blocked` when it is a bundle's branch or base, since that changes what the audit read. A deleted branch, a moved branch that no other worktree has checked out, and any other config line print as `blocked`.

An `ignored` line is judged in this order:

1. Inside `<s>/audit/` of any audited repository, where `<s>` is a scratch directory the resolution below could choose, and outside this run's directory: another audit run's or a handoff's file. Accept it.
2. While any agent with Bash is running, or has ended since the last check: accept it as pending, under those agents.
3. Otherwise end the run `blocked`.

After every check that did not exit 1 or 2, reconcile the pending differences, from this check or one before. Once every agent a difference waits on has ended, read those agents' `runs:` logs. A difference is accounted for when a logged run's directory is inside that repository. Ignored-file changes inside a build output directory that the repository's own ignore rules exclude whole, such as `bin/`, `obj/`, `target/`, `build/` or `dist/`, group under that logged run in one record. Acceptance is per run, never blanket. Any pending difference no logged run accounts for ends the run `blocked`.

Write `baseline/<stage>-check.md`: the stage, the time, the repositories, the result (`pass` or `blocked: <reason>`), each accepted ignored-file difference with what accounts for it or `pending` with the agents it waits on, the `touched` lines as "touched, content unchanged" (for a path the brief lists as flagged, "touched, content not compared"), and the precision note when printed. A user's own edit to an audited repository during a run trips this check too; the report says so.

When a check ends the run `blocked`, say in plain words what changed and in which repository, that the audit stopped to protect it, and that `/audit:resume <run-id>` continues once the change is settled. The raw lines stay in the check file.

### Fault injection

When the manifest has a `_test` key, read `${CLAUDE_PLUGIN_ROOT}/skills/audit/fault-injection.md` and apply it. Its keys are `fail`, `drop_ack`, `hold`, `expire_budget_after_stage`, `plant_map_error` and `ledger_split_bytes`. Record the key in `audit-brief.md` and the report's Coverage. Without `_test`, do not read that file.

### State files

The run directory is `<scratch>/audit/<run-id>/`. `<scratch>` is the first that holds:

1. The manifest `scratch` key, which must be inside the primary repository and ignored, or inside the main checkout of a linked worktree with the same `--git-common-dir`; a key that is neither stops the run, and the rules below are not tried.
2. `scratch/`, `tmp/` or `.scratch/` in the primary repository, when present and ignored.
3. `.reimagine/`, when already ignored.
4. `${CLAUDE_PLUGIN_DATA}/runs/`.

Compare parent and child as whole resolved paths. Make `<scratch>/audit/` with `mkdir -p` and the run directory with `mkdir` without `-p`, so an existing id moves to the next suffix. Never add an ignore rule to make a directory ignored.

Write `stages.json` only through `stages.json.tmp` beside it, then `mv -f` it over the destination. Never edit a state file in place.

The registry `${CLAUDE_PLUGIN_DATA}/runs.json` is a JSON array:

```json
[ { "run_id": "2026-10-15-0912-app-123", "path": "/abs/path/to/run",
    "primary_repo": "/abs/path/to/repo", "created": "2026-10-15T09:12:00Z",
    "state": "running" } ]
```

`state` is `running` until the run ends, then `reported`, `partial` or `blocked`. `registry.sh` alone writes the registry, under a lock it takes and releases itself, with `<runs.json>` the resolved `${CLAUDE_PLUGIN_DATA}/runs.json` and `<created>` the UTC time of the run's first invocation, which `invocations.md` holds, in the form above:

- `sh "${CLAUDE_PLUGIN_ROOT}/scripts/registry.sh" add <runs.json> <run-id> <run directory> <primary repo> <created>` adds the run as `running`.
- `sh "${CLAUDE_PLUGIN_ROOT}/scripts/registry.sh" set <runs.json> <run-id> <state>` sets its state.

A repeated command changes nothing, so run it again when you cannot tell that it ran. When `set` exits 3 the run has no entry: `add` it, then `set` again. On any other failure or a refusal, run the command once more; when that fails too, read `runs.json` and go on by what it holds for this run:

- No entry: `resume` and `act` cannot find this run. Say so at once, record the limit in `audit-brief.md` when stage 1 is still writing it, else in the stage entry and `usage.md`, and at the end print the JSON entry to add by hand to the absolute `runs.json` path in place of the resume command.
- An entry in the old state: say that the registry shows the old state, record the limit in the stage entry and `usage.md`, and keep printing `/audit:resume <run-id>`.
- An entry in the new state: the registry is correct; record nothing.

`stages.json` in the run directory:

```json
{
  "plugin_version": "0.1.31",
  "approvals": [ { "kind": "fetch", "target": "<repo name>:<remote>",
                   "decision": "approved", "time": "2026-10-15T09:15:00Z",
                   "commands": ["git -C <repo> fetch --no-tags --refmap= ..."] } ],
  "stages": {
    "4": {
      "status": "complete",
      "inputs": { "audit-brief.md": "<hash>", "groups.md": "<hash>",
                  "claims.md": "<hash>", "common.md": "<hash>",
                  "audit-evidence.md": "<hash>" },
      "outputs": ["pass1/g1.md", "pass1/tests.md"],
      "agents": [ { "type": "audit:auditor", "model": "opus", "scope": "g1",
                    "started": "...", "ended": "...", "tokens": 81234,
                    "tokens_scope": "task notification, subagent_tokens; scope not documented",
                    "duration_ms": 412000, "result": "complete" } ],
      "swaps": [],
      "superseded": []
    }
  }
}
```

1. Input hashes come from `git hash-object --no-filters <file>`. Source and bundle inputs are recorded as shas. Stage 1 also hashes the manifest, the claims files and the questions file.
2. `status` is `running`, `complete`, `failed`, `not_applicable` or `superseded`.
3. `approvals[]` kinds are `fetch`, `live`, `export-over-1gb`, `background-fetch` and `local-branch`, each with `target`, `decision` and `time`. A `fetch` adds `commands`, the exact commands run under it, and `resolved`, each bare name with the kind it resolved to; a planned command that differs is asked again. A `live` approval adds `by` and `source` (`live/results-<k>.md:<line>`). A `background-fetch` adds the old and new commits, and a `local-branch` the branch's commit.
4. When a stage starts, write its entry `running` with its inputs. When every listed output exists and the stage's read-only check passed, write the final status. That write is the stage's last act. `stages.json` is the only record of completion.
5. Stage keys: stage 1 records `forge_hashes` and `forge_gaps` (the forge files and failed reads resume compares and retries), `review_files` (each `REVIEW.md` read at a bundle's base, by blob id) and each pull request's pinned head; stages 2 and 3 record `output_hashes` and `failed_scopes`, stage 2 `split_files`, stage 3 `test_planted`; stage 5 records `ledger_build` when `ledger.sh build5` never succeeded; stage 6 records `sentinels`, `missing_positions` and `batched`; stage 7 records `converged_check` (`pass` or `fail`) and lists split slices among its outputs. Stages 6, 7 and 8 record each live file they read, `live/findings.md`, `live/claims.md` and each `live/carried/<id>.md`, by hash or `absent`.

### Usage

At each stage boundary write `usage.md` from `stages.json`: per stage, each agent's type, scope, requested model, wall-clock time from `duration_ms` or start and end, and tokens labeled "task notification, subagent_tokens; scope not documented". A number the notification did not carry reads "not reported". Any sum is labeled "sum of reported numbers, not exact".

## Stage 1: orient

Read `${CLAUDE_PLUGIN_ROOT}/skills/audit/stages/1-orient.md` after the reading block and follow it.

## Stage 2: digest

Read `${CLAUDE_PLUGIN_ROOT}/skills/audit/stages/2-digest.md` when stage 1 completes. It decides applicability, chunks each document corpus, and launches the digesters.

## Stage 3: domain map

Read `${CLAUDE_PLUGIN_ROOT}/skills/audit/stages/3-domain.md` when stage 1 completes. It decides applicability, writes the per-ticket questions `<ticket>-M<n>`, and launches the mappers.

## Stage 4: pass one

Read `${CLAUDE_PLUGIN_ROOT}/skills/audit/stages/4-pass-one.md` when stage 1 completes. It launches the auditors for the tier's scopes and runs each group's barrier and its top-ups.

## Stage 5: pass two

Read `${CLAUDE_PLUGIN_ROOT}/skills/audit/stages/5-pass-two.md` when the first group clears its barrier. It launches one fresh adversary per complete pass-one report, runs the map-correction top-ups, writes `ledger/inventory.txt`, and builds and checks `ledger/5.md` with `ledger.sh`.

## Stage 6: second opinion

Read `${CLAUDE_PLUGIN_ROOT}/skills/audit/stages/6-second-opinion.md` and `${CLAUDE_PLUGIN_ROOT}/skills/audit/second-opinion-request.md` when stage 5 is complete or failed. Stage 6 runs whatever stage 5's result, unless the budget has expired. It copies the inputs with sentinel lines, writes the mandatory set with `ledger.sh mandatory`, launches one fresh second-opinion adversary per batch of ids, checks each answer, and writes `ledger/6.md` and checks it with `ledger.sh check`.

## Stage 7: converge

Read `${CLAUDE_PLUGIN_ROOT}/skills/audit/stages/7-converge.md` when stage 6 is complete or failed. It runs the late adversary over `ledger.sh late-ids`, checks it with `ledger.sh late-check`, writes `gate.md` with `ledger.sh gate`, runs the merger, and checks `converged.md` with `ledger.sh check --through 7`.

## Stage 8: report

Read `${CLAUDE_PLUGIN_ROOT}/skills/audit/stages/8-report.md` when stage 7 is complete or failed, when the budget has expired and no agent runs, or when nothing more from stages 2 to 7 can run. It fills the report from what is on disk with `${CLAUDE_PLUGIN_ROOT}/skills/audit/report.md` and `${CLAUDE_PLUGIN_ROOT}/skills/audit/work-items.md`, applies the verdict rules, writes the `revision:` line, `claims-verdicts.md` and `work-items.jsonl`, and ends the run as Terminal states says. The report body starts `# audit report: <run-id>`.

## Stage 9: act

For `command: act`, find the run in `runs.json` by `run-id`, append the invocation block, and read `${CLAUDE_PLUGIN_ROOT}/skills/audit/stages/9-act.md`. Act is outside the read-only boundary and is gated by the user's approval per item.

## Resume

For `command: resume`, find the run in `runs.json` by `run-id`, append the invocation block, and read `${CLAUDE_PLUGIN_ROOT}/skills/audit/resume.md`. With `live: <file>`, read `${CLAUDE_PLUGIN_ROOT}/skills/audit/live.md` first: `live.sh` checks and imports the file, a finding result reruns stages 6 to 8, and a claim-only result reruns stages 7 and 8.

## Handoff

For `command: handoff`, read `${CLAUDE_PLUGIN_ROOT}/skills/audit/handoff.md` and follow its "Writing a handoff" section with the block's `out`, `verdicts` and `memory`. A handoff has no run directory and no stage entry.

## Supporting files

Read each file at its point and not before. A sentence that only says where a rule lives is not a read. The section for each command and stage names its files, Hard rules and Compaction recovery name `common.md` and this file, and Fault injection names `fault-injection.md`. Besides those:

- `report.md` and `work-items.md`: when stage 8 starts.
- `live.md`: for `resume` with `live`, and when a stage reads live files. It is a skill document, not a run file: the run's live inputs are under `live/`, and the Live checks blocks are in `report.md`.
- `audit-evidence.md`: never read by you; stage 1 copies it and auditor and adversary prompts name it, except in second opinion, where it is an input copy.

All are under `${CLAUDE_PLUGIN_ROOT}/skills/audit/`. In the run directory: `invocations.md`, `audit-brief.md` and `stages.json`, after a compaction and at resume and act.

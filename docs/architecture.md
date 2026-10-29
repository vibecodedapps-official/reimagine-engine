# Architecture: 0.1.0

Drafted 2026-10-14; amended 2026-10-20 for the `primer` plugin, which replaces `repo-docs` (decisions 73 to 89), and 2026-10-25 for the `gate` plugin and the loop's one-pass step 5 (decisions 118 to 134). The requirements are in requirements.md and win where the two disagree. The order of work is in build-plan.md. A fact marked "verified" was read from the host's documentation or observed in a spike recorded in decisions.md. Nothing here is implemented.

## Shape

One repository, one marketplace, five plugins that a user installs separately and that work alone.

```
reimagine-engine/
  .claude-plugin/marketplace.json   catalog: name, owner, five entries
  .github/workflows/ci.yml          lint, test, mawk, validate
  .gitattributes                    LF for shipped text
  .gitignore
  CHANGELOG.md                      one file, one heading per plugin release
  LICENSE                           Apache License 2.0, vibecodedapps.net
  README.md                         install, update, uninstall, development
  CLAUDE.md                         the repository's own hub (primer form)
  package.json                      scripts test and lint; no dependencies
  docs/                             requirements, architecture, build plan, decisions, acceptance
  plugins/rules/                    house rules, output style, chat block
  plugins/loop/                     plan, build, review, publish a bundle of tickets
  plugins/audit/                    read-only adversarial audit of finished bundles
  plugins/gate/                     code-review passes over a pull request until nothing is left to fix
  plugins/primer/                   project instructions in the host's forms, memory promotion, two hooks
  tests/                            node:test suites and the audit sh suites
  tools/lint.mjs                    repository rules
  tools/release.mjs                 version bump per plugin
  tools/semver.mjs                  the semver rule lint and release share
```

| Plugin | Installs | Entry points | Scripts | Hooks | Version line |
|---|---|---|---|---|---|
| rules | house rules block, output style | `/rules` | `scripts/rules.mjs` | SessionStart `startup` | own |
| loop | the build loop | `/loop:run` (the skill itself), prose "reimagine loop" | none | none | own |
| audit | the audit | `/audit:run`, `/audit:resume`, `/audit:act`, `/audit:handoff`, prose "reimagine audit" | eleven sh scripts | none | own |
| gate | the review gate | `/gate` (the skill itself), prose "reimagine gate" | `scripts/findings.mjs`, `scripts/next.mjs` | none | own |
| primer | project instructions | `/primer`, prose "turn this into a skill", "we keep doing this", "add this to the project instructions", "check the instruction files" | `hooks/drift.sh`, `hooks/notice.sh` | PreToolUse `Bash\|PowerShell`; SessionStart `startup` | own |

## Layers on a machine

1. Claude Code's own defaults.
2. The house rules block in `$CLAUDE_CONFIG_DIR/CLAUDE.md` (else `~/.claude/CLAUDE.md`), between the digest markers, written only by `rules.mjs`.
3. The user's own lines in that file, below the end marker, never touched.
4. The repository's instruction files, kept in the forms the host loads by `primer`: a short hub, rules, nested files and skills.
5. The output style `rules:Concise Plain`, selected by the user.
6. The loop, the gate and the audit, which read layers 2 to 4 at their start and obey every ask-first rule they find.

`loop`, `gate` and `audit` do not require `rules`; without it they still read whatever instruction files exist.

Only three hooks run outside a session request: the rules staleness notice at `startup`, the primer memory notice at `startup`, and the primer drift check before a `git commit`. Everything else happens because the user asked.

## Prompt first

Prose carries the process. Scripts exist only where a model cannot be trusted to do the job byte for byte: editing the user's `CLAUDE.md` (`rules.mjs`), snapshotting and checking a repository's state (`readonly.sh`), building ledgers and gates from many files (`ledger.sh`), the other audit scripts, and turning a review's output into ledger entries and the next pass level (`findings.mjs`, `next.mjs`), each with a suite behind it. The two primer hooks are scripts because a hook has no model. No new script ships without a test under `tests/`.

Skills are user-invocable and carry their trigger phrases in `description` (verified: the phrase in the description invoked the skill in 2 of 2 runs, and the bare skill name also carried; decisions.md item 14). Rarely used paths live in their own files, read on demand, and each step file ends by naming the next read.

## Host facts the design rests on

- A skill in a plugin is `/<plugin>:<skill>`; a skill named like its plugin also answers to `/<plugin>` when no bundled skill owns that name (verified by spike 8 for `/rules`; the documentation describes only the namespaced form). The host bundles a `/loop` skill that runs a prompt on an interval, so the loop plugin's skill is named `run` and answers only as `/loop:run`.
- Agent frontmatter `model:` accepts `sonnet`, `opus`, `haiku`, `fable`; an unknown name fails the Agent call with an API error the orchestrator sees, so every fallback is written into the skill (verified, spike 2).
- `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_DATA}` are substituted in hook commands, and `CLAUDE_PLUGIN_DATA` is also exported to the hook's environment (verified, spike 4). The data directory is `$CLAUDE_CONFIG_DIR/plugins/data/<plugin>-<marketplace>/`.
- A `userConfig` option's default is not substituted while the option is unset; the hook fails to run (verified, spike 4). The suite declares none.
- A SessionStart hook's stdout `{"systemMessage": "..."}` is accepted with outcome success (verified, spike 3); whether the user sees it at startup is an interactive acceptance item.
- A PreToolUse hook denies a tool call with the JSON deny form on stdout and exit 0, or with stderr and exit 2; the agent sees `PreToolUse:<tool> hook error: <reason>` (verified, spike 6). With `CLAUDE_CODE_USE_POWERSHELL_TOOL=1` the tool name is `PowerShell`, so the matcher is `Bash|PowerShell`.
- The host adds an attribution trailer only when the attribution setting is on; with it off, three of three commit runs on 2.1.296 produced none (verified, spike 5). No hook guards this. The gate's commit step and the loop's publish step and pull request text type no trailer of their own and keep one the host adds (decision 136).
- `gh pr edit --body-file` and `gh pr comment --body-file` exist in gh 2.91.0 (verified, spike 7).
- An HTML comment on the first line of a root `CLAUDE.md` or `AGENTS.md` is stripped before the content reaches context (verified, decision 74, on 2.1.304). A root `AGENTS.md` is read directly when no `CLAUDE.md` or `CLAUDE.local.md` exists at or above the working directory (documented, 2.1.277 and later), and no `InstructionsLoaded` event fires for it (verified).
- A `.claude/rules/` file with `paths` loads when a matching file is touched; a pattern without a slash matches at any depth, `git ls-files -- ':(glob)<pattern>'` matches the same files for every documented pattern once braces are expanded and a slashless pattern gets `**/`, and a `paths` value the host cannot parse never loads the rule (verified, decisions 80 and 81).
- `@path` inside a `.claude/rules/` file is not expanded at launch or on load; the model sees the literal line (verified, decision 82).
- Auto memory lives at `<config>/projects/<key>/memory/`, keyed by the main worktree's root path with every character outside `A-Za-z0-9` as `-`; a linked worktree shares it while its transcript sits under its own key (verified, decision 83).
- A skill with `paths` is hidden until a matching file is touched, then invoked through the Skill tool; a description's phrases invoke a skill from prose 2 of 2 (verified, decision 84). The Skill tool refuses the bundled `doctor` skill and accepts `claude-api prompt-audit` and `init` (verified, decision 77).
- Under `--permission-mode auto` a PreToolUse `additionalContext` reaches the model as `PreToolUse:<tool> hook additional context: ...` and a deny as `PreToolUse:<tool> hook error: ...` (verified, decision 85).
- A plugin's `workflows/<name>.js` with a literal `meta` is listed as `/<plugin>:<name>` with and without the `workflows` manifest field, and `claude plugin validate --strict` passes both; `args` arrives as structured data, an `agent()` call with `schema` returns the object, `phase()` titles reach the progress events, and `import()`, `Date.now()`, `Math.random()` and a no-argument `new Date()` fail with the documented errors; a run relaunched with `resumeFromRunId` in the same session replays completed agents from the run's journal and runs the rest, as the longest unchanged prefix of `agent()` calls in call order, so a `pipeline()` whose later calls come in completion order replays only its first stage; a headless `claude -p` turn that ends while a workflow runs stops the workflow about ten minutes later (verified, decision 101, on 2.1.304).
- Without a `Workflow` allow rule a headless launch is refused with `Review dynamic workflow before running`; `Workflow(<plugin>:<name>)` allows it; with `disableWorkflows` the commands and the tool are absent; under `--permission-mode auto` a headless launch ran without a prompt and wrote no consent to the profile's settings (verified, decision 101).
- `claude plugin eval` loads a case's `plugins` paths only under its containment root, the enclosing plugin or the directory targeted, so the suite targets the repository root with `--eval-dir tests/evals`; a `tool_used` grader is a plugin-fired indicator outside the score, and a `regex` grader over the trace or the last message carries the assertion (verified, decision 100).
- `claude -p "/context"` answers headless as a local command with the skills, custom agents and memory files tables; `/skill-doctor` is not listed headless on 2.1.304 (verified, decision 102).
- `claude -p "/code-review <level> <base>...HEAD" --output-format json` runs the bundled review skill as a fork in a child session: the typed level reaches the review, `--max-findings` is honored, the `result` is text whose last part is a fenced JSON array of `{file, line, summary, failure_scenario}` with repository-relative paths and no category tags, `num_turns` is 0 and the tokens sit in `modelUsage` (verified, decision 118, on 2.1.310). A tool call outside `--allowedTools` was denied without a prompt and listed in `permission_denials`, observed under `acceptEdits`; the child refuses to start unless `CLAUDECODE` is unset, and waits three seconds for stdin unless it is redirected (decisions 123 and 124).
- A level typed in a child session does not write `codeReviewLastEffort` to the host's configuration; the host writes it only from an interactive turn (verified, decision 119).
- A plugin skill named `gate` answers as `/gate` and `/gate:gate`; no bundled skill owns the name (verified, decision 120, on 2.1.310).
- The review skill's bare path target reviews the path's diff from the merge-base with the repository's default branch, read from `refs/remotes/origin/HEAD` with `main` as the fallback, and has no base flag; a `<base>...HEAD` target carries the base, and `<base>...HEAD <path>` reaches the review as its target text and is honored by the reviewer, which runs `git diff <base>...HEAD -- <path>` (verified, decision 121).
- `/code-review ultra` is the host's cloud review, user-triggered and billed, offered only when a server flag, a first-party API and a local session coincide; the model cannot launch it, and a child session that types it falls back to a local `max` review with a notice, which on a ten-line diff ran 17 minutes and cost $17 (verified, decision 122). The suite never types `max` or `ultra`.

## The `rules` plugin

```
plugins/rules/
  .claude-plugin/plugin.json
  LICENSE  README.md
  skills/rules/SKILL.md          /rules; disable-model-invocation: true
  scripts/rules.mjs              status | plan [--adopt] [--options a,b] | apply | remove | decline | session-start
  hooks/hooks.json               SessionStart startup -> node rules.mjs session-start ${CLAUDE_PLUGIN_DATA}
  rules/core.md                  the house rules
  rules/windows.md               the Windows paragraph
  output-styles/concise-plain.md v4.5, keep-coding-instructions: true
  chat/instructions.md           one fenced block for a chat product; nothing installs it
```

Manifest:

```json
{
  "name": "rules",
  "version": "0.1.0",
  "description": "House rules for Claude Code sessions: one block in your CLAUDE.md, kept current, plus the Concise Plain output style.",
  "author": { "name": "vibecodedapps.net" },
  "repository": "https://github.com/vibecodedapps-official/reimagine-engine",
  "license": "Apache-2.0"
}
```

### Content

`core.md` is the agreed house rules text with eight edits, requirements 19, 20, 232 to 236 and 269. Under Working, two items are added: "When a tool, integration, or file in the session can answer a question, use it before asking me." and "Report once, when the task is done or when the next step turns on my answer."; the decision item also names the assumption every option shares and what would overturn the recommendation, a new item after it raises a wrong request as the first decision, and an item after the read-only review item makes finding issues or proposing changes a judgment, not a count. Under Code, the first item asks for the smallest change that stays correct as the code grows. Under Ask first, two items are added: name the steps the permission mode is likely to deny, and treat a denied call as a question, never routed around. Nothing else changes; no stop is removed. `windows.md` is the four-line Git Bash paragraph, applied only when the script runs on Windows. The rendered body is `windows` (on Windows) then `core`, joined by one blank line.

### Mechanism

One target: `$CLAUDE_CONFIG_DIR/CLAUDE.md`, else `~/.claude/CLAUDE.md`, created if missing. The script treats the file as bytes (latin1 in memory) so a byte order mark, non-UTF-8 bytes, CRLF and a missing final newline survive. A symlinked target is written at the file it points to; a dangling or hard-linked target is refused.

Block:

```
<!-- reimagine:house-rules begin version=0.1.0 options=core,windows join=blank digest=0123456789abcdef -->
...rendered body...
<!-- reimagine:house-rules end -->
```

`join` records what separated the block from the text above it (`none` for a new file, `blank` after a final newline, `newline` after a file with no final newline) so `remove` can give back the original bytes. `digest` is the first 16 hex characters of the SHA-256 of the body in LF form; a CRLF file gets a CRLF block with the same digest.

States and what `plan` does with each:

| State | Meaning | Plan |
|---|---|---|
| absent | no block | add at the end, or before the next level 1 or 2 heading after the top matter |
| current | digest equals the shipped body | nothing; still reports copies outside the block |
| stale | a block with another digest, unedited | replace in place |
| edited | the block body differs from its digest | nothing; show the diff and the note |
| malformed | markers present but not well formed | nothing; report line numbers |
| declined | state file holds this digest as declined | nothing until the shipped text changes |

Two calls. `plan` reads the target and its `@path` imports read-only (four hops, fifty files, 256 KiB each; code spans, fences, HTML comments and quotes masked), counts the rules already present outside the block as Markdown units, recommends `apply`, `adopt` or `decline`, shows the diff as one hunk per changed run with three lines of context, and writes `rules-plan.json` in the data directory with the target's hash. `apply` re-reads the target, refuses if its hash changed (a file created where none was counts), copies the existing file to `<path>.reimagine-backup-<YYYYMMDDHHMMSS>` (never overwriting a backup), writes `<path>.reimagine-tmp-<pid>` and renames it into place, and records the state in `rules-state.json`. A lock directory `rules.lock` serializes concurrent runs; a lock older than its owner is taken over. `plan --adopt` additionally removes a full copy of the rules found outside the block, headings included, and places the block where the copy stood; a file holding Markdown the unit parser does not handle is left alone with a decline recommendation. `remove` takes the block and its join bytes; a file the script created is deleted unless the user added text. `decline` records the digest. `session-start` reads the state file and the target, prints one `systemMessage` line when the target is stale and not declined, and is silent otherwise.

The skill `/rules` runs the script, shows its output, asks before `apply`, and ends by telling the user how to select the output style. It never edits the file through the model.

### Output style and chat block

`output-styles/concise-plain.md` ships verbatim with `keep-coding-instructions: true` and its version in the description; the host lists it as `rules:Concise Plain`. Nothing in the suite edits `settings.json`. `chat/instructions.md` holds one fenced block for pasting into a chat product's custom instructions and names no vendor.

## The `loop` plugin

```
plugins/loop/
  .claude-plugin/plugin.json
  LICENSE  README.md
  skills/run/SKILL.md              /loop:run; core: reading, approval scope, roles, budgets, states, record
  skills/run/steps/0-preflight.md
  skills/run/steps/1-plan.md       steps 1 to 3
  skills/run/steps/4-build.md      steps 4 to 6
  skills/run/steps/7-publish.md
  skills/run/risk.md               risk floor, level cap, effort hint
  skills/run/record.md             record files, steps.json, resume rules
  skills/run/ci-watch.md
  skills/run/multi-repo.md
  skills/run/worktree.md
  skills/run/pr-body.md            body, comment and ticket comment templates
  skills/run/report.md
  skills/run/handoff.md
```

The skill is named `run`, so it answers as `/loop:run`; the bare `/loop` is the host's bundled interval skill. Its description: "Plan, build, review and publish a bundle of tickets as one reviewed pull request per repository, resuming on the same branch when run again. Use when the user says "reimagine loop", or "run the loop" with ticket ids, issue or pull request references, a file, or a description of the work to ship." There is no separate command.

### Reading the request

No flags. The skill makes only the read-only calls that resolve ids (`git remote`, `gh`, `az`, an MCP read, a file read), then prints one block before any other tool call:

```
Tickets: #68 (gh), AB#4567 (mcp:ado_get_work_item), AB#4580 (unresolved: the work item read failed; continuing without it)
Mode: build and publish; continue branch feat/68-4567-export (open PR #73)
Scope: primary C:/src/app; also edit C:/src/app-infra
Effort: thorough (reviewers at high; risk floor not yet judged)
```

Resolution order per id: GitHub forms through `gh`; `AB#n`, or a bare number when the primary remote is Azure DevOps, through an Azure DevOps MCP tool if listed, else `az boards work-item show --id n`; a Salesforce case through a Salesforce MCP tool; a readable path as a file; anything else, a bare number on a GitHub remote included, as text. A `--token` in the request is read as prose and the block shows the reading. "plan only", "do not publish", "confirm the plan", "continue <branch>", "on branch <name>", "primary <path>", "base <branch>", "also edit <path>", "budget <n> minutes" and the effort words are the recognized phrases. "primary <path>" names the primary checkout, a toplevel or a linked worktree, in place of the session's; "base <branch>" names the base branch in place of the remote's default.

### Approval scope

Invoking by name approves branch, commit, push, one pull request per repository, editing the body of a pull request this loop opened, one comment per run on it, and ticket comments. Ask-first rules in instruction files win over that grant. Force push, `--no-verify`, merge, deploy, repository settings and a new issue always ask. A denial is final: never retried, never routed around.

### Roles

| Role | Who | Fallback |
|---|---|---|
| orchestrator, judge, slice reviewer | the session model | none; the run stops |
| implementer | Agent `sonnet`, one per slice, parallel for disjoint slices | none; a tool error ends `blocked` after the snapshot restore |
| plan reviewer | fresh Agent `fable`, read and report only | once to `opus` on a model or tool error; stays swapped |
| final reviewer | built-in `code-review` skill, explicit level at most `xhigh`, `<merge-base>...HEAD` as a full sha, one pass | Agent `opus` over a patch file, once, when the skill is not listed or the diff is in a worktree or another repository |
| reader | Agent `haiku` when a read is worth splitting out | the orchestrator reads |

`.reimagine.json` at the primary repository's root:

```json
{
  "commit": false,
  "checks": ["npm test", "npm run lint"],
  "timeouts": { "subagent": 20, "review": 30, "check": 15, "ci": 45, "run": 240 },
  "models": { "implementer": "sonnet", "reviewer": "fable", "fallback-reviewer": "opus", "reader": "haiku" },
  "base": "main"
}
```

Every key is optional; the values shown are the defaults, except `checks` and `base`, which are examples: without `base` the base branch is the remote's default, and the request's "base <branch>" wins over the key. `models` accepts only subagent model names and never changes the risk floor or the step 5 role.

### Budgets, rounds, risk

Per-call budgets in minutes: subagent 20, review 30, check 15, CI 45. One default run budget of 240 minutes, overridden by "budget <n> minutes", then `timeouts.run`, then a session instruction. `date -u +%Y-%m-%dT%H:%M:%SZ` runs at enumerated points only and its output is copied, never computed. Question waits are excluded. Every step is capped at three rounds except step 5, which is one pass. The risk floor (auth, permission, schema or migration, row-level security, data access path, public API) raises reviewer effort to at least `high` and never falls. The effort hint maps to the `effort` argument of Agent calls and to the level typed to `code-review`, which is never above `xhigh` ("max" gives `xhigh` there, decision 122), and cannot lower a floored run.

### Steps

0. Preflight: echo, primary checkout, host, input guard, instruction files and ask-first rules, `.reimagine.json`, credential scan, permission statement, base branch and base commit, continue checks, open pull requests, clean tree, flagged files, record directory, prompts seen.
1. Review and verify the inputs; repository gate; claims; drift; buildable status; risk floor.
2. Plan: `plan.md` with slices.
3. Plan review by the fresh reviewer, up to three rounds; plan-only stop; optional confirmation; then branch, baseline, dependencies.
4. Build: implementers per slice, slice checks, orchestrator slice review, re-evaluation.
5. Final review: integrate, one `code-review` pass over the whole diff from the merge-base, triage into fix, defer and reject, the fix bucket applied once through the implementers, no second pass.
6. Checks: discovery, baseline matching, reuse of 5.1; on a non-GitHub host, the body file and the `prepared` end.
7. Publish: commit, push, pull request create or update, ticket comments, CI watch and repair, deferred list, handoff and manifest.

### Record and idempotency

The record is keyed by branch, not by run, so a second invocation finds it:

```
.reimagine/loop/<branch-slug>/
  inputs.md       one dated section per run: invocation, tickets as fetched, verification, drift, status, risk
  plan.md         the plan; review log appended per round; new slices appended per run
  run.md          the durable log; one dated section per run
  steps.json      the completion record
  report.md       rewritten at every terminal state
  handoff.md      when the run has its own commit
  audit-manifest.json
  pre-<n>.status, pre-<n>.patch, pre-<n>.hashes   snapshots before implementer calls
  diff.patch, diff-<slug>.patch                   review patches
  pr-body.md, comment-<n>.md, ticket-<id>.md      never committed; per-run names take -run<n> from run 2 on
```

`<branch-slug>` is the branch name lowercased with each run of characters outside `[a-z0-9]` replaced by `-`, at most 60 characters; `steps.json` keeps the exact branch name, and a record whose branch differs from the run's is a collision that ends preflight `blocked`. The branch is known at preflight: the continued branch, the "on branch" name, the branch of the one existing record whose `tickets` list holds one of the request's tickets, or the predicted `fix/<ids>-<slug>`, `feat/<ids>-<slug>` or `work/<slug>`. `.reimagine/` is excluded through `.git/info/exclude` so that a run that commits nothing leaves the tree clean (verified, spike 7).

`steps.json`:

```json
{
  "branch": "feat/68-4567-export",
  "tickets": ["github:owner/app#68", "ado:org/project#4567"],
  "runs": [
    { "n": 1, "started": "2026-10-14T18:02:11Z", "ended": "2026-10-14T19:40:02Z", "state": "done", "pr": "github:owner/app#73" },
    { "n": 2, "started": "2026-10-15T09:00:40Z", "ended": null, "state": "running" }
  ],
  "steps": {
    "0": { "status": "complete", "run": 2, "started": "...", "ended": "...", "inputs": { "base": "<sha>", "head": "<sha>" }, "outputs": ["inputs.md", "run.md"] },
    "1": { "status": "complete", "run": 1, "inputs": { "github:owner/app#68": "2026-10-14T17:55:02Z" }, "outputs": ["inputs.md"] },
    "4": { "status": "running", "run": 2, "slices": { "export-api": { "status": "complete", "run": 1, "tickets": ["github:owner/app#68"], "commit": "<sha>" }, "export-docs": { "status": "running", "run": 2, "tickets": ["ado:org/project#4567"] } } }
  }
}
```

An entry is written `running` with its inputs when the step starts and `complete` only after its outputs exist, through a temporary file and a rename. It is the only record of completion; `run.md` is the narrative. Inputs are file hashes and shas, except that Steps 1 and 2 record each open input's version (`updatedAt` of a GitHub issue, `rev` of an Azure DevOps work item, `SystemModstamp` of a Salesforce case, the hash of a file or a description), since `inputs.md` gains a section every run and its hash would never match. `pr` is written only by the run that opened the pull request, so a later run edits only a body this loop wrote.

A run on an existing record:

- Preflight finds the record by ticket id or by the predicted branch, fetches the branch with the explicit refspec when it exists on the remote (a branch left by a `prepared` run may be local only, and one left by a plan-only run may exist nowhere), fast-forwards when the local tip is at or behind the remote head, lists `git log <merge-base>..HEAD`, marks each commit as its own (named by a commit line in `run.md`) or foreign, writes the list to `inputs.md`, and marks tickets done when every slice serving them has its commit on the branch, or, for a slice the loop built and did not commit, when the tip holds its recorded file hashes. A record whose pull request merged or closed ends preflight `blocked`.
- Steps whose inputs are unchanged and whose outputs exist are reused, step 4 only when its slices are committed. Step 3.7 sets up the checkout in every run that builds or checks, also when step 3 is reused. Slices with a closing commit on the branch are not rebuilt.
- Same tickets and no open slice: step 6 verifies the checks. When the run that last reached step 7 ended `done` with its pull request open, the report is rewritten, nothing is committed or posted, state `done`; otherwise step 7 publishes the committed work. A ticket done at preflight gets a ticket comment only when no run has commented on it.
- New tickets: slices are appended to `plan.md`, which is reviewed again; the new slices are built and reviewed; the whole diff from the merge-base goes through step 5; step 7 pushes, updates the body of the pull request this loop opened with `gh pr edit --body-file` (once per run), posts one comment per run, and comments on the new tickets. A pull request the loop did not open gets a comment only; its body is never edited.
- An interrupted run resumes at the first step whose entry is not `complete` or whose inputs changed, after the tree is rechecked.
- The loop never force pushes, rebases, resets or amends; before every push it compares the remote head with what preflight fetched and ends `blocked` if it moved; a dirty tree ends preflight `blocked`.

Terminal states: `done`, `plan-only`, `prepared`, `blocked`, `stopped`.

### Publication texts

The pull request is created with `gh pr create --title "<title>" --body-file <absolute path>`, the title being the single ticket's title or the plan's one-line summary. `pr-body.md` sections: What changed, Drift corrections, Decisions for the reviewer, Checks not run, Related pull requests, Closes. On a non-GitHub host the run ends `prepared` after step 6 with a body file covering every input of every run of the record, one per repository; on an Azure DevOps remote that body is the short form under the 4,000-character description cap, the full body goes to a comment file to post first, and an Azure DevOps ticket is a `_workitems/edit/<n>` link in place of `AB#<n>`, which links only from GitHub through the Azure Boards app. Ticket comments carry state, pull request link, criteria, not done, deferred. Neither names a model, an agent, a tool, or a run-internal path; a report posted as a comment under `commit: true` is cut to its external sections for the same reason. The handoff (`reimagine-handoff: 1`) and `audit-manifest.json` (`{"bundles":[{"repo","pr","tickets"}|{"repo","branch","base","tickets"}],"claims":["<absolute handoff.md>"],"reviews":{"level","fixed":[{"file","summary"}],"deferred":[...],"rejected":[...]}}`) are written when the run has its own commit; the report's `Gate:` line suggests `/gate PR <n>` for 500 or more changed lines, and its `Audit:` line suggests `/audit:run "<manifest>"` for bundles with more than one repository or more than one ticket, and after the gate when the line count alone called for one.

## The `audit` plugin

```
plugins/audit/
  .claude-plugin/plugin.json
  LICENSE  README.md
  commands/run.md  resume.md  act.md  handoff.md
  skills/audit/SKILL.md            orchestrator: roles, queue, budget, stages.json, registry lock, read-only boundary
  skills/audit/common.md           the eight hard rules, evidence kinds, schemas, output contract
  skills/audit/audit-evidence.md   auditor and adversary rules only
  skills/audit/second-opinion-request.md
  skills/audit/handoff.md  live.md  report.md  work-items.md  fault-injection.md  resume.md
  skills/audit/stages/1-orient.md ... 9-act.md
  agents/digester.md  mapper.md  auditor.md  adversary.md  merger.md
  scripts/readonly.sh  handoff.sh  ledger.sh  working-tree.sh  revert-tests.sh  live.sh  memory.sh  work-items.sh  collisions.sh  run-copies.sh  report.sh
```

The skill description names "reimagine audit". The four commands forward to the skill: `run` with inputs or a manifest, `resume <run-id> [--from n] [--live file]`, `act <run-id> <item-id...> [--per-item]`, `handoff [--out] [--verdicts] [--memory]`. `run` takes no flags; prose may give effort, budget and model overrides, and the manifest holds everything else.

### Stage model

Nine stages, in this order with these dependencies: orient; digest and domain map and pass one together; pass two per group after a barrier; second opinion after every pass two; converge with the late adversary and the merger; report; act on request. `stages.json` in the run directory is the completion record and the input to resume, with the schema in requirement 149. A finding counts only after a fresh adversary other than its author challenged it and the second opinion saw it. The four questions and the evidence model are requirements 162 to 174.

Stage 6 is a fresh `adversary` agent at `fable`, falling back once to `opus` per batch. It receives the request file built from the template: the brief, `common.md`, `audit-evidence.md`, claims, every diff and stat, `ledger/5.md`, every pass-two file, live files, and the audited sources by absolute path and sha; every copied input carries a sentinel line `audit-sentinel: <path> <16 hex>` that the answer must acknowledge, which is how the orchestrator knows the agent read it. The mandatory set is split into batches of at most 60 ids with one launch each; the first batch alone may add `X<n>` findings with `origin: second-opinion`. The answer file is saved under `second-opinion/` verbatim. The 60-id batch size is revisited when a run shows a reason (decision 21).

Roles: digester `haiku`; mapper and merger `sonnet`; auditor and adversary `opus`; second opinion `fable`. The manifest `models` key overrides per role. Launches use `subagent_type: audit:<role>` in the background.

Stages 4 to 6 run on the prompt path. Decision 94 defines a second engine, a dynamic workflow under `plugins/audit/workflows/`, behind the same inputs, outputs and `stages.json`, with `engine: workflow` or `engine: prompt` and the reason recorded; it is built only under requirement 270's gate, and this document's plugin table names it when it ships. The default source list gains `REVIEW.md`, read at the bundle's base commit, whose calibration and skip rules shape the report with every removal counted in one line (requirement 271).

### Run directory

`<scratch>/audit/<run-id>/`, where scratch resolves to the manifest key, else an existing ignored `scratch/`, `tmp/` or `.scratch/`, else `.reimagine/` when it is already ignored, else `${CLAUDE_PLUGIN_DATA}/runs/`. The audit never writes under `.git/` apart from the two writes the read-only boundary discloses, an approved fetch's remote-tracking refs and the loose objects of a working-tree head; the loop is the component that adds `.reimagine/` to `.git/info/exclude`, so on a repository where the loop has run the audit lands in `.reimagine/audit/`. The registry is `${CLAUDE_PLUGIN_DATA}/runs.json` under the `mkdir` lock protocol.

### Scripts and their literals

The eleven scripts and their suites embed these strings: `reimagine-handoff: 1`; `reimagine-live: 1`; `# audit report: `; `audit:auditor` and `audit:adversary` in ledger output; identity `audit`, `audit@example.invalid`, `audit: working tree` in `working-tree.sh`; the `second-opinion/` directory and `origin: second-opinion`. Every literal sha and hash in the suites that depends on one of those strings is produced by running the fixture builder once and pasting the observed value; the build plan has that as a work item.

`jq` is needed by `live.sh`, `work-items.sh` and `collisions.sh`; stage 1 warns when it is missing and names what will not run.

`run-copies.sh` writes the run's `common.md`, header filled, and `audit-evidence.md` from the skill's copies, found from its own path, so neither passes through the model (requirement 283).

`report.sh` builds the report's copied sections from the run directory's files: `parts` writes section 8's decision ledger and raised tickets, section 10 and the body of `claims-verdicts.md` under `report/parts/`, `assemble` joins every part file in name order into `report.body.tmp`, and `claims-verdicts` writes the verdicts file with the revision, so no copy passes through the model (requirement 322).

`revert-tests.sh` reads `REVERT_TESTS_CAP`, `REVERT_TESTS_DEADLINE`, `REVERT_TESTS_WAIT` and `REVERT_TESTS_TICK` from the environment, whole or fractional seconds; its test sets them low, and the shipped defaults are unchanged (requirement 279).

## The `gate` plugin

```
plugins/gate/
  .claude-plugin/plugin.json
  LICENSE  README.md
  skills/gate/SKILL.md             /gate; core: reading, approval scope, roles, caps, states, record
  skills/gate/steps/0-preflight.md targets, base, clean tree, record directory, permission statement
  skills/gate/steps/1-pass.md      size, split, the child session, parsing, triage
  skills/gate/steps/2-fix.md       implementers, snapshots, checks, the commit and the push
  skills/gate/steps/3-next.md      next.mjs, caps, resume, terminal states
  skills/gate/steps/4-publish.md   comment, manifest, report
  skills/gate/record.md            record files, passes.json, findings.json
  skills/gate/report.md
  scripts/findings.mjs             a review's output to ledger entries
  scripts/next.mjs                 the next level or the stop, from passes.json
```

The skill is named `gate`, like its plugin, so it answers as `/gate` and `/gate:gate` (verified, decision 120). Its description: "Run code-review passes over a pull request, several, or a loop manifest, fix what each pass finds, and stop at a verdict when a pass finds nothing left to fix. Use when the user says "reimagine gate", "gate this branch", "gate PR <n>" or "gate the manifest <path>"." There is no command and no hook. The gate runs after the loop and before the audit, and the audit's manifest carries its result.

### Reading the request

No flags. The skill makes only the read-only calls that resolve the targets and the engine (`git remote`, `gh pr view`, a manifest read, `command -v claude`), then prints one block before any other tool call:

```
Targets: PR #73 (gh) on feat/68-4567-export, base main; PR #74 (gh) on fix/70-retry, base main
Mode: fix
Budget: 120 minutes (default); max-passes 4; split 1500
Engine: subprocess
Scripts: <the plugin's directory>/scripts
```

"PR <n>", "<n> and <m>" and a pull request URL name targets; "the manifest <path>" runs one record per bundle with a `pr` or a `branch`, each in its own repository; "this branch", or nothing, gates the current branch against its base. "no fixes", "budget <n> minutes", "base <branch>" and "checks <command>[; <command>]", read as the last phrase, are the other phrases. A pull request's base is its `baseRefName`; a branch's is the request's, else the manifest bundle's `base` without a leading remote name, else `.reimagine.json` `base`, else the remote's default. The checks are the request's, else the bundle's `checks`, else `.reimagine.json` `checks`. The Scripts line is the plugin's scripts directory, resolved from the skill's base directory, since `${CLAUDE_PLUGIN_ROOT}` is empty in the session's shell; every script runs by that path. The merge-base is recorded and every review target is the three-dot range from it.

### Approval scope

Invoking by name approves fix commits on each target's branch, whether or not the loop opened its pull request, pushing that branch, and one comment per run on each target pull request (decision 127). Ask-first rules in instruction files win over that grant. Force push, `--no-verify`, merge, rebase, amend, reset, repository settings and a new issue always ask. A denial is final: never retried, never routed around. A dirty tree, a merged or closed pull request and a remote head that is neither the one preflight fetched nor the run's own last push end `blocked`.

### Roles

| Role | Who | Fallback |
|---|---|---|
| orchestrator, triage | the session model | none; the run stops |
| reviewer | a child session: `claude -p "/code-review <level> <merge-base>...HEAD[ <path>]" --output-format json`, one per pass, or one per path group over `split` | Agent `opus` over `diff-<n>[-<slug>].patch` with the level as `effort`, when `claude` is not on the PATH or the child reports the skill missing; stays for the run |
| implementer | Agent `sonnet`, one per disjoint file group, parallel when disjoint | none; a tool error ends `blocked` after the snapshot restore |

`.reimagine.json` at the repository root, the `gate` key beside the loop's:

```json
{ "gate": { "split": 1500, "max-passes": 4, "budget": 120, "models": { "implementer": "sonnet", "fallback-reviewer": "opus" } } }
```

Every value is optional and the values shown are the defaults. The levels a run types lie between the floor `medium` and the ceiling `xhigh`; `low`, `max` and `ultra` are never typed (decisions 122 and 134).

### Passes and caps

A pass is one review at one typed level, the triage, the fix round and the next-level decision. Pass 1 runs at `xhigh`. Changed lines over `split` (added plus deleted from `git diff --numstat <merge-base>...HEAD`) split the review by path at the shallowest depth that gives more than one group into parallel child sessions, each with the target `<merge-base>...HEAD <path>` and the `.` group naming its files, each group's slug unique within the pass, and the pass's findings are the union. The orchestrator sorts every finding into fix, defer or reject with a one-line reason before anything is edited; implementers apply the fix bucket, one per disjoint file group after a snapshot; the repository's `checks` run; a pass that changed anything ends with one commit and a push after the remote-head check. `next.mjs` then reads `passes.json` and returns, in this order: stop with `pass` or `pass-with-deferred` when the fix bucket is empty and nothing new was rejected; a stop after a `medium` pass, `unconverged` when that pass still found something to fix; `xhigh` once per run when the fix round changed an exported signature, a schema or migration, a file outside the diff, or more than a quarter of the diff's files; `medium` after two `high` passes that each fixed nothing and rejected something new; else `high`. At `max-passes` the level is returned marked `capped` and the run ends `unconverged`; a later run resumes from it. A finding is identified by file path and normalized summary; a fixed finding that returns is a regression and goes to the fix bucket, a rejected one that returns is carried and counts as nothing (decision 126), a deferred one keeps its deferral, and a new finding lists the same file's earlier entries as candidates with their line distance (decision 143). `max-passes` 4 with a level still to run, a run budget of 120 minutes and 30 minutes per review end a run `unconverged` with every open finding listed; an implementer call past 20 minutes or a check past 15 is a failed call and ends `blocked`. "no fixes" runs pass 1 only and names what a fix run would do.

### Engine

The child session is the engine (decision 124). It runs from the repository root with `CLAUDECODE` unset, stdin from `/dev/null`, `--permission-mode default` and an allowlist of Read, Grep, Glob, Skill, Agent, TaskStop, the read-only git forms and the run's checks, in the background under the Bash foreground cap, and its output is saved before `findings.mjs` parses it. Verified on 2.1.310 (decisions 118 to 121): the result is text whose last part is a fenced JSON array of `{file, line, summary, failure_scenario}` with repository-relative paths and no category tags; the typed level and `--max-findings` reach the review; a `high` review of a ten-line diff takes 80 to 150 s and costs about a dollar, an `xhigh` one 120 s and $1.23, a `max` one 17 minutes and $17; the remembered interactive level is untouched; a bare path target reviews against the repository's default branch, so a split group is always `<merge-base>...HEAD <path>` and the root group names its files; calls outside the allowlist were denied and listed in `permission_denials` without stopping the review, under `acceptEdits` in the spikes. The spikes typed the base as a branch name; the sha form is the loop's verified usage and acceptance item 47 records it in a child session.

### Record

```
.reimagine/gate/<branch-slug>/
  passes.json      the completion record
  findings.json    the identity ledger across passes
  report.md        rewritten at every terminal state
  review-<n>[-<slug>].json | .md    each review's saved output
  pre-<n>.status, pre-<n>.patch, pre-<n>.hashes   snapshots before implementer calls
  diff-<n>[-<slug>].patch           a stand-in's input
  comment-<n>.md                    the comment as posted, never committed
  audit-manifest.json               written when the run did not come from one
```

`passes.json`:

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
      "reviews": [{ "slug": "all", "target": "<merge-base sha>...HEAD", "output": "review-1.json", "duration_ms": 119636, "total_cost_usd": 1.23, "denials": 2, "notes": "The suite could not be run here." }],
      "findings": { "src/stats.mjs|percentile indexes sorted rank ...": { "bucket": "fix", "reason": "off-by-one inside the change" } },
      "changes": ["inside-diff"], "commit": "<sha>", "head": "<sha>",
      "checks": [{ "command": "npm test", "result": "pass" }],
      "next": { "level": "high", "rule": "otherwise" } },
    { "n": 2, "run": 1, "level": "high", "status": "running", "started": "..." }
  ]
}
```

An entry is written `running` when the pass starts and `complete` after the fix round and its commit, through a temporary file and a rename; it is the only record of completion. A second run resumes at the first pass not `complete` when the head is the one the last complete pass left, or continues from that pass's `next` with the cap counted afresh; a new head starts a new sequence at `xhigh` with the ledger kept; a changed merge-base restarts at pass 1 the same way. `.reimagine/` is excluded through the file `git rev-parse --git-path info/exclude` names, as the loop does.

### Publication texts

The comment, one per run per pull request through `gh pr comment --body-file`: the verdict, the passes with levels, the findings fixed, deferred and rejected with their reasons, the checks, the commits. It names no model, agent, tool or run-internal path, writes the user's home directory as `~` in text it quotes from a review, and the deferred list never goes to the body. The manifest the run came from gains a top-level `gate` key, an object keyed by each bundle's `repo` with `{"verdict", "passes", "record"}`; a run without one writes a minimal manifest in the record, so the report can suggest `/audit:run "<manifest>"`. Terminal states: `pass`, `pass-with-deferred`, `unconverged`, `blocked`, `stopped`.

## The `primer` plugin

```
plugins/primer/
  .claude-plugin/plugin.json
  LICENSE  README.md
  skills/primer/SKILL.md           /primer; modes init, adopt, maintain; the proposal format
  skills/primer/placement.md       the eleven placement items and the tasks test
  skills/primer/shapes.md          hub, nested file, rule and skill templates with their caps
  hooks/hooks.json                 PreToolUse Bash|PowerShell -> sh "${CLAUDE_PLUGIN_ROOT}/hooks/drift.sh"
                                   SessionStart startup -> sh "${CLAUDE_PLUGIN_ROOT}/hooks/notice.sh"
  hooks/drift.sh                   the commit check
  hooks/notice.sh                  one line when auto memory has unreviewed notes
```

Manifest:

```json
{
  "name": "primer",
  "version": "0.1.0",
  "description": "Project instructions in the forms Claude Code loads: a short CLAUDE.md, path-scoped rules, nested instructions and skills, with auto memory promoted into them and a hook that checks every commit.",
  "author": { "name": "vibecodedapps.net" },
  "repository": "https://github.com/vibecodedapps-official/reimagine-engine",
  "license": "Apache-2.0"
}
```

The skill's description names "turn this into a skill", "we keep doing this", "add this to the project instructions" and "check the instruction files" (verified: a description's phrases invoked a skill in 2 of 2 runs, decision 84). There is no command file and no script beyond the two hooks.

### Shapes and caps

| File | Parts | Cap | Loads |
|---|---|---|---|
| root `CLAUDE.md` or `AGENTS.md`, the hub | line 1 `<!-- primer -->`; `# <name>` and two or three sentences, with one sentence per long document to read before a kind of work; `## Commands`; `## Constraints` | 60 lines | every session |
| `<subdir>/CLAUDE.md` | the hub's three parts, no marker | 60 lines | when a file under it is read or edited |
| `.claude/rules/<topic>.md` | prose; optional `paths` frontmatter, a YAML list or a comma string | 200 lines | at launch without `paths`; on a matching touch with it |
| `.claude/skills/<name>/SKILL.md` | `name`, `description` with the phrases first, optional `disable-model-invocation`, `paths`, `allowed-tools`; one sentence for done, numbered steps, checks, what to report | 150 lines | description always; body when invoked, judged relevant, or a `paths` match |
| `docs/*.md` | long-form for people and for the hub's sentences | none | when named |

The marker is an HTML comment because the host strips those before the content reaches context (verified, decision 74). A count is the lines the file has, frontmatter and blank lines included. A file over its cap is split by topic; no real constraint is deleted to fit. `shapes.md` holds a template for each row; `placement.md` holds the eleven items of requirement 241 with the tasks test and one example per item.

Imports: the hub holds none but `@AGENTS.md`; a rule or skill names a `docs/` file in words, since the host does not expand `@path` inside `.claude/rules/` (verified, decision 82). A root `AGENTS.md` is the hub when the repository keeps one, with no `CLAUDE.md` written; a root `CLAUDE.local.md` stops the host reading it, so adopt then proposes the one-line `@AGENTS.md` file (decision 75).

### Modes

`/primer` reads the files on disk, prints the mode as the first line, and runs one of:

- `init`, when no `CLAUDE.md` or `AGENTS.md` exists at any depth. It reads `README.md`, manifests and build files, CI workflows, the test layout, the top-level directories and `docs/`, writes the hub uncommitted, proposes the first rules and skills the repository shows, writes none of those without a yes, and names `/init` as the host's unopinionated alternative.
- `adopt`, when instruction or documentation files exist but there is no hub of the shape above, or the hub holds a `## Spokes` index. It inventories every instruction and documentation file, other tools' rule files listed and left alone; plans; asks once; then commits moves first, each move commit changing no content and repairing documentation links, and rewrites after. A pointer whose condition is a file pattern becomes a path-scoped rule, one whose condition is a task becomes a skill, one whose condition is a directory becomes a nested `CLAUDE.md`; a procedure in any instruction file becomes a skill; a topic section every task needs becomes an unscoped rule; a long document stays under `docs/` with one sentence in the hub; agent content leaves `README.md`; a statement kept is checked against the code. A repo-docs repository converts in one run, which is the migration. The second run reads as maintain and changes nothing.
- `maintain`, when the hub has the shape. Three passes feed one plan and one question. Verify: what the hook denies on, each command named in a manifest, script or workflow, each statement true of the files it covers, each skill's commands and files present, duplicates and lost procedures reported, an oversized skill split; the report names `/doctor prompt-audit` for contradictions and stale models and never calls it (decision 77). Promote: auto memory candidates by type. Propose: skill candidates with their evidence. With nothing to change it prints `primer: no drift` and the reported items.

Every write is a documentation file; code, configuration, settings, CI, manifests, `CLAUDE.local.md`, ignored files and the memory directory are never edited, except that promote deletes a note the user approved for deletion. Commits follow the repository's convention, else `docs(primer): <subject>`, with the body opening `Instruction-file <mode> pass, <date>.`; the drift hook runs on each.

### Proposals

A skill candidate comes from an instruction file, the repository, auto memory or the session, in that order, and is shown with its source, the steps as observed, how often it was seen and the proposed name. On a yes the skill is written at `.claude/skills/<name>/SKILL.md` in the shape of the table, and a procedure taken from an instruction file leaves that file in the same change. A memory candidate is a `feedback` note about the repository, an undated `project` decision or a `reference` a teammate would need; a `user` note is never promoted. It is shown with the note's text, its `modified` date, the destination and the line to be written; on a yes the line is written, then a separate question offers the topic file and its index line for deletion (decision 79). After a promote pass the skill writes the stamp `${CLAUDE_PLUGIN_DATA}/reviewed/<key>`.

Auto memory is read at `<config>/projects/<key>/memory/`, where `<config>` is `$CLAUDE_CONFIG_DIR` else `~/.claude` and `<key>` is the absolute path of the main worktree's root with every character outside `A-Za-z0-9` replaced by `-` (verified, decision 83). `MEMORY.md` lists `- [Title](file.md)`, an em dash and a hook per note; each topic file carries `name`, `description` and `metadata` with `type` and `modified`.

### Drift hook

PreToolUse on `Bash|PowerShell`, POSIX sh with sed, awk, grep and `test`, no `jq`. It reads stdin, extracts `tool_input.command`, and returns at once unless the command runs `git commit` (the grammar of requirement 260). It resolves the repository the commit runs in (decision 50) and finds the hub: the root `CLAUDE.md`, the `AGENTS.md` a one-line `@AGENTS.md` names, or the root `AGENTS.md` when there is no `CLAUDE.md`. Without a hub whose first line is `<!-- primer -->` it prints nothing.

With one it reads the hub, every tracked nested `CLAUDE.md`, every tracked `.claude/rules/**/*.md` and `.claude/skills/*/SKILL.md`, and the changed set of decision 56. It denies, in the JSON deny form with `primer: ` and the findings joined by `; `, on a cap overrun, a backticked token of the hub's opening paragraph that looks like a path (holds a `/` or ends in `.md`, with no space, `<`, `>`, `*`, `{` or `?`) and does not exist spelled exactly, a `paths` value that is neither a list nor a comma string, a `paths` glob that matches no tracked file, or a `SKILL.md` without `description`. A glob is matched with `git ls-files -- ':(glob)<pattern>'` after the hook expands brace groups and prefixes `**/` to a pattern without a slash (verified against the host's matching, decision 80). When nothing denies, a changed file that matches a rule's or skill's `paths` or sits under a nested `CLAUDE.md` whose file is not itself changed puts that file in `additionalContext` as one to recheck (reaches the model under auto mode, decision 85). It never reads git history and never writes.

### Notice

SessionStart at `startup`, the same construction. It finds `<config>` from the grandparent of the input's `transcript_path`, `<key>` from the parent of `git rev-parse --git-common-dir` (the working directory outside a repository), and the hub as the drift hook does. With the marker present it counts the topic files `MEMORY.md` lists whose `type` is `feedback` or `project` and whose `modified` is later than the stamp, every such file when no stamp exists, and prints `{"systemMessage":"primer: auto memory has <n> notes since the last review; run /primer"}` when the count is above zero; otherwise nothing. It writes nothing; the stamp is the skill's, which a headless session writes under `auto` and refuses under `acceptEdits` (decision 76).

### Migration from repo-docs

A repository kept by repo-docs has a `## Spokes` index, spokes under `docs/` or beside code, and perhaps the `@AGENTS.md` adapter. One adopt run: the marker goes on line 1; each pointer becomes a path-scoped rule, a skill, a nested `CLAUDE.md` or one sentence in the opening paragraph by its condition; the index goes; the adapter stays when present. In this repository the hub keeps its commands and constraints, names the five design documents in its opening paragraph, and loses the index; `.claude/settings.json` enables `primer@reimagine-engine` in place of `repo-docs@reimagine-engine`. The repo-docs plugin directory, its tests and its catalog entry go with the primer release; its tags and changelog headings stay, and lint accepts a heading for a retired name.

## Versions, tags and release

Each plugin has its own version, starting at 0.1.0, in its manifest and its catalog entry. Tags are `<plugin>--v<version>`, made with `claude plugin tag`, which checks that manifest and catalog agree. Lint fails when a plugin directory changed since its latest tag without a version above it, and when `CHANGELOG.md` lacks `## <plugin> <version> - <date>` for a tagged version; an untagged bump needs no heading yet, so the release order is bump, heading, tag. There is no suite version and no lockstep; the marketplace `metadata.version` is the catalog's own and is raised whenever an entry changes. `main` is the release ref. `tools/release.mjs <plugin> <version>` sets the version in the manifest and the catalog entry (and the audit `plugin_version` literals), computing every edit before writing, keeping CRLF files CRLF, and running lint; tagging stays with `claude plugin tag`; the changelog heading is written by hand. The gate enters the catalog at `0.1.0-alpha.1` with its scaffold and releases at 0.1.0; the loop's one-pass step 5 is loop 0.1.6; the audit does not move for the gate (decision 129).

## Repository tooling

`tools/lint.mjs` has no dependencies and enforces the rules of requirement 219 with one message per rule. It reads an optional `LINT_DENY_TOKENS` environment variable, a comma-separated list, and fails on any tracked file containing one case-insensitively; CI never sets it, so the names stay outside the repository. `tests/lint/lint.test.mjs` copies the repository to a temporary directory, applies one mutation per case, and asserts the message. CI runs lint and tests on ubuntu, macOS and Windows with full history for the tag rule, the audit awk suites again under mawk, and `claude plugin validate --strict` on the marketplace and each plugin with a pinned Claude Code version.

`package.json` has one `test:<area>` script per test directory (`rules`, `loop`, `audit`, `primer`, `gate`, `lint`, `release`) beside `test`; a commit runs the area scripts that cover what it touched, and the whole suite with lint runs once per milestone before its push and in CI (requirement 277). Lint's syntax checks run concurrently (requirement 278). A suite whose cases are independent runs them concurrently under one `describe`, as `tests/audit/sh.test.mjs` does; cases that share a fixture stay serial (decision 105). Process creation under Git for Windows costs about 200 ms per `sh` and 70 ms per `git`, so a suite is measured there before a lever is taken (acceptance item 44).

`tests/evals/<plugin>/<case>/` holds the eval cases of requirement 273; `npm run eval` runs them against the repository root with the host's eval command, locally and never in CI, and their results land in the ignored `tests/evals/results/`. The gate's three cases, planned under `tests/gate/evals/` with their own command since they need the runner's scaffold and tool grants, were dropped when the runner refused the first of them (decision 133); acceptance items 47, 49 and 54 stand for them, run against the seeded fixture repository that `tests/gate/fixture/build.mjs` writes (requirement 319).

## Security and permissions

The loop, the gate and the audit run inside the user's permission mode and never widen it. The loop's and the gate's pre-approved tools are `date` and read-only `git` and `gh`; the gate's child sessions run under `--permission-mode default` with an allowlist of read-only tools and the repository's own checks, so a call outside it is denied and counted, never prompted. The audit's agents have no Edit or NotebookEdit and the read-only check detects any write. Credentials in pasted ticket text are redacted before the record is written, and the audit never passes forge text through the model. Nothing external names a model, an agent or a tool.

## Out of scope for 0.1.0

A second model provider in any form; publishing pull requests on a non-GitHub host; a forge adapter for `work-items.jsonl`; generating the chat block from the output style; `claude plugin eval` in CI; a repair mode that reads earlier review comments; the deferred audit helper scripts; a routine or GitHub Actions integration for the loop; plugin telemetry; a mod for the notices; a workflow for the loop's slices; a second host (requirement 276); for the gate, comments on GitLab and Azure DevOps, the `low`, `max` and `ultra` levels, reading earlier review comments or CI results, and editing a pull request body (requirement 320).

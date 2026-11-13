# Architecture

The requirements are in requirements.md and win where the two disagree. A fact marked "verified" was read from the host's documentation or observed in a spike recorded in decisions.md.

## Shape

One repository, one marketplace, seven plugins that a user installs separately and that work alone. The tree and the table show the state the requirements describe; requirement 360 names what is specified ahead of its build.

```
reimagine-engine/
  .claude-plugin/marketplace.json   catalog: name, owner, seven entries
  .github/workflows/ci.yml          lint, test, mawk, validate, commit messages
  .github/workflows/pr-description.yml  the description check, again on each edit
  .gitattributes                    LF for shipped text
  .gitignore
  CHANGELOG.md                      one file, one heading per plugin release
  LICENSE                           Apache License 2.0, vibecodedapps.net
  README.md                         install, update, uninstall, development
  CLAUDE.md                         the repository's own hub (primer form)
  package.json                      scripts test and lint; no dependencies
  docs/                             requirements, architecture, decisions, acceptance
  plugins/rules/                    house rules, output style, chat block
  plugins/loop/                     plan, build, review, publish a bundle of tickets
  plugins/audit/                    read-only adversarial audit of finished bundles
  plugins/gate/                     code-review passes over a pull request until nothing is left to fix
  plugins/primer/                   project instructions in the host's forms or in a store outside the repository, memory promotion, hooks
  plugins/guard/                    auto mode classifier entries for a list of repositories
  plugins/review/                   review of a pull request someone else wrote, ending in comments
  tests/                            node:test suites and the audit sh suites
  tools/commit-messages.mjs         the commit message and description checks of a pull request
  tools/files.mjs                   the file listing lint and release share
  tools/lint.mjs                    repository rules
  tools/release.mjs                 version bump per plugin
  tools/semver.mjs                  the semver rule and literal scan lint and release share
```

| Plugin | Installs | Entry points | Scripts | Hooks | Version line |
|---|---|---|---|---|---|
| rules | house rules block, output style, a rule-driven refactor review, a handoff prompt skill, a draft skill | `/rules`, `/rules:refactor`, `/rules:handoff-prompt`, `/rules:draft`, prose "handoff prompt" and a request for a message to someone else | `scripts/rules.mjs` | SessionStart `startup` | own |
| loop | the build loop | `/loop:run` (the skill itself), prose "reimagine loop" | none | none | own |
| audit | the audit | `/audit:run`, `/audit:resume`, `/audit:act`, `/audit:handoff`, prose "reimagine audit" | twelve sh scripts | none | own |
| gate | the review gate | `/gate` (the skill itself), prose "reimagine gate" | `scripts/findings.mjs`, `scripts/next.mjs`, `scripts/resume.mjs`, `scripts/split.mjs` | none | own |
| primer | project instructions, a docs fold-back review | `/primer`, `/primer:fold`, prose "turn this into a skill", "we keep doing this", "add this to the project instructions", "check the instruction files" | `hooks/drift.sh`, `hooks/notice.sh`, `scripts/primer.mjs` | PreToolUse `Bash\|PowerShell` and `Edit\|Write\|NotebookEdit`; SessionStart | own |
| guard | the auto mode classifier's entries for listed repositories | `/guard` | `scripts/guard.mjs` | PermissionDenied; SessionStart `startup` | own |
| review | the review of someone else's pull request | `/review:run` (the skill itself), prose "reimagine review" | `scripts/posts.mjs` | none | own |

## Layers on a machine

1. Claude Code's own defaults.
2. The house rules block in `$CLAUDE_CONFIG_DIR/CLAUDE.md` (else `~/.claude/CLAUDE.md`), between the digest markers, written only by `rules.mjs`.
3. The user's own lines in that file, below the end marker, never touched.
4. The repository's instruction files, kept in the forms the host loads by `primer`: a short hub, rules, nested files and skills. In a repository of primer's `local` profile this layer is not in the work tree: it is the layers of a store outside the repository, which a SessionStart hook loads (requirement 388).
5. The output style `rules:Concise Plain`, selected by the user.
6. The loop, the gate, the audit and the review, which read layers 2 to 4 at their start and obey every ask-first rule they find.
7. The auto mode classifier's `environment` and `allow` entries in the user settings file, `$CLAUDE_CONFIG_DIR/settings.json` else `~/.claude/settings.json`, rendered by `guard.mjs` from the repository list beside it and marked as its own; the user's own entries there stay. A `$defaults` token is expanded into the default lines while repositories are listed and comes back on clear when the copied lines are every current default.

`loop`, `gate`, `audit` and `review` do not require `rules`; without it they still read whatever instruction files exist.

Only seven hooks run outside a session request: the rules staleness notice at `startup`, the primer memory notice at `startup`, the primer drift check before a `git commit`, whose entry also runs the staging check of the `local` profile, the primer context loader at a session's start, the primer reach check before a file edit in another repository, the guard staleness notice at `startup`, and the guard denial record when auto mode denies a tool call. Everything else happens because the user asked.

## Prompt first

Prose carries the process. Scripts exist only where a model cannot be trusted to do the job byte for byte: editing the user's `CLAUDE.md` (`rules.mjs`), writing the `autoMode` value of the user settings file while keeping every byte outside it (`plugins/guard/scripts/guard.mjs`), snapshotting and checking a repository's state (`readonly.sh`), building ledgers and gates from many files (`ledger.sh`), the other audit scripts, and turning a review's output into ledger entries, the next pass level and the place a later run starts (`findings.mjs`, `next.mjs`, `resume.mjs`), each with a suite behind it. The two primer hooks are scripts because a hook has no model. No new script ships without a test under `tests/`.

Skills are user-invocable and carry their trigger phrases in `description` (verified: the phrase in the description invoked the skill in 2 of 2 runs, and the bare skill name also carried; decisions.md item 14). Rarely used paths live in their own files, read on demand, and each step file ends by naming the next read.

## Host facts the design rests on

- A skill in a plugin is `/<plugin>:<skill>`; a skill named like its plugin also answers to `/<plugin>` when no bundled skill owns that name (verified by spike 8 for `/rules`; the documentation describes only the namespaced form). The host bundles a `/loop` skill that runs a prompt on an interval, so the loop plugin's skill is named `run` and answers only as `/loop:run`.
- Agent frontmatter `model:` accepts `sonnet`, `opus`, `haiku`, `fable`; an unknown name fails the Agent call with an API error the orchestrator sees, so every fallback is written into the skill (verified, spike 2).
- `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_DATA}` are substituted in hook commands, and `CLAUDE_PLUGIN_DATA` is also exported to the hook's environment (verified, spike 4). The data directory is `$CLAUDE_CONFIG_DIR/plugins/data/<plugin>-<marketplace>/`.
- A `userConfig` option's default is not substituted while the option is unset; the hook fails to run (verified, spike 4). The suite declares none.
- A SessionStart hook's stdout `{"systemMessage": "..."}` is accepted with outcome success (verified, spike 3); whether the user sees it at startup is an interactive acceptance item.
- A PreToolUse hook denies a tool call with the JSON deny form on stdout and exit 0, or with stderr and exit 2; the agent sees `PreToolUse:<tool> hook error: <reason>` (verified, spike 6). With `CLAUDE_CODE_USE_POWERSHELL_TOOL=1` the tool name is `PowerShell`, so the matcher is `Bash|PowerShell`.
- The host adds an attribution trailer only when the attribution setting is on; with it off, three of three commit runs on 2.1.296 produced none (verified, spike 5). No hook guards this. The gate's commit step, the loop's publish step and pull request text, primer's commits and the audit's act commits type no trailer of their own and keep one the host adds (decisions 136 and 170).
- `gh pr edit --body-file` and `gh pr comment --body-file` exist in gh 2.91.0 (verified, spike 7).
- GitHub issue artifacts, in public preview, are reachable through the REST API with `gh api` on gh 2.91.0: `GET repos/<owner>/<repo>/issues/<n>/artifacts` answered with a list on an existing issue (decision 224); a create whose name held a `/` answered HTTP 422, and with the `/` turned into `-` the create made the artifact and an update kept a second version (decision 228). `gh issue artifact` needs gh 2.103.0 or later. Azure DevOps attaches a file to a work item in two calls, an upload to `_apis/wit/attachments` and a relation of type `AttachedFile`; `az boards` has no attachment command, and the Azure DevOps MCP server lists upload and link tools (documentation, not verified).
- An HTML comment on the first line of a root `CLAUDE.md` or `AGENTS.md` is stripped before the content reaches context (verified, decision 74, on 2.1.304). A root `AGENTS.md` is read directly when no `CLAUDE.md` or `CLAUDE.local.md` exists at or above the working directory (documented, 2.1.277 and later), and no `InstructionsLoaded` event fires for it (verified).
- A `.claude/rules/` file with `paths` loads when a matching file is touched; a pattern without a slash matches at any depth, `git ls-files -- ':(glob)<pattern>'` matches the same files for every documented pattern once braces are expanded and a slashless pattern gets `**/`, and a `paths` value the host cannot parse never loads the rule (verified, decisions 80 and 81).
- `@path` inside a `.claude/rules/` file is not expanded at launch or on load; the model sees the literal line (verified, decision 82).
- Auto memory lives at `<config>/projects/<key>/memory/`, keyed by the main worktree's root path with every character outside `A-Za-z0-9` as `-`; a linked worktree shares it while its transcript sits under its own key (verified, decision 83). Two settings move it: `autoMemoryDirectory`, an absolute or `~/` path read from any settings scope, and `CLAUDE_CODE_PROJECT_DIR_NAME` beside `CLAUDE_CONFIG_DIR`, which names the `<key>` directory of the transcripts and the memory alike; the host ignores the name when `CLAUDE_CONFIG_DIR` is unset, when the name is not 1 to 64 letters, digits, `-` or `_`, or when it is a Windows device name such as `con`. Headless, with `--settings` setting `autoMemoryDirectory`, the session's instructions named that directory, and with both set they named the `autoMemoryDirectory` one (verified, decision 214).
- A skill's `allowed-tools` let Claude use those tools without asking during the turn that invokes the skill; the grant clears at the user's next message, as the yes turn of acceptance item 73's run of 2026-11-02 showed when it asked to approve a `git check-ignore` the grant listed (verified, decision 215). A grant for the whole session is a permission allow rule.
- An `allowed-tools` entry or an allow rule matches a command by its text, so a trailing `*` admits every option and a `*` before the end admits `-c`. On 2.1.321 under the default mode, with `Bash(git diff *)`, `Bash(git log *)` and `Bash(git grep *)` as the only rules, `git diff --output=<file>` and `git log -1 --output=<file>` wrote the file and `git grep -O<program>` ran the program, unasked; with `Bash(git -C * rev-parse *)`, `git -C <repo> -c alias.x=!<program> x rev-parse y` ran the program. With no rule the session asked for each of those, and ran unasked, in its own repository, the plain `git diff`, `git show`, `git log`, `git grep`, `git status`, `git rev-parse`, `git merge-base`, `git for-each-ref`, `git stash list`, `git remote -v`, `git ls-files`, `git cat-file`, `git branch --list`, `git worktree list`, `git config --get`, `date` and `sleep`; it asked for every `git -C <path>` form and for `git check-ignore`, `git hash-object`, `git ls-tree`, `git ls-remote`, `git check-ref-format`, `gh pr view` and `gh issue view` (verified, decision 258).
- A command that sets a variable first, `export NAME=value; git ...` or `NAME=value git ...`, is asked for even when a rule matches its git part. `allowed-tools: Bash(sh "${CLAUDE_PLUGIN_ROOT}/scripts/x.sh" *)` matches the call that has the path in double quotes and not the unquoted one (verified, decision 258).
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
- On 2.1.316, a plugin with a second skill directory passes `claude plugin validate --strict` and `claude -p "/context"` lists both skills; a skill with `disable-model-invocation: true` has no line in the skills table, where the same skill without it takes about 50 tokens; `allowed-tools: WebFetch(domain:code.claude.com)` passes `validate --strict`, which does not exercise the grant; the index `https://code.claude.com/docs/llms.txt` lists every page as a `.md` URL and the pages fetch, the hooks reference at 284k characters and the skills page at 119k, so a reader pages through them with the fetch tool's offset (verified, decision 166); a subagent launch while 20 run is refused with `Concurrent subagent limit reached`, and the error says not to retry (verified, item 69). That the bare `/primer` still reaches `primer:primer` beside a sibling, and whether a subagent's WebFetch prompts under the default mode, since a skill's `allowed-tools` pre-approve only the invoking turn, are acceptance items 71 and 72.
- On 2.1.316, the installed `rules:rules` skill, which sets `disable-model-invocation: true`, has no line in the skills table either (verified, item 39). That the loop reads a refactor ticket file as a ticket of its file form and takes the checks it names is acceptance item 75.
- On 2.1.321, a session keeps only the first part of an invoked skill's text across a compaction: of a skill of 400 numbered entries it held entries 1 to 249 afterwards, the first 19,813 of the body's 31,697 characters, where the same session with no compaction held all 400, and a session resumed in a new process after the compaction held none (one run each, decision 267). So the audit's skill, which is longer than the kept part, has the session read it again.

## The `rules` plugin

```
plugins/rules/
  .claude-plugin/plugin.json
  LICENSE  README.md
  skills/rules/SKILL.md          /rules; disable-model-invocation: true
  skills/refactor/SKILL.md       /rules:refactor; disable-model-invocation: true; reads core.md live; writes ticket files only on a yes
  skills/handoff-prompt/SKILL.md /rules:handoff-prompt; model-invocable; holds the handoff prompt's definition and one core.md item; reads none of the plugin's files; writes no file
  skills/draft/SKILL.md          /rules:draft; model-invocable; the check on a finished draft and the email form; reads none of the plugin's files
  scripts/rules.mjs              status | plan [--adopt] [--options a,b] | apply | remove | decline | session-start
  hooks/hooks.json               SessionStart startup -> node rules.mjs session-start ${CLAUDE_PLUGIN_DATA}
  rules/core.md                  the house rules
  rules/windows.md               the Windows paragraph
  output-styles/concise-plain.md keep-coding-instructions: true
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

`core.md` is the agreed house rules text: one opening paragraph and five sections, Working, Code, Tests, Done and Ask first (requirement 354). A test holds the digest of the rendered body, so the wording has one check and no test holds a single sentence (requirement 18, decision 243). One Working item says what leaves the session is written for its reader and is published only when that is the task's stated purpose or the owner asked (requirement 348). The loop, the gate, the audit and the review carry it word for word, and lint holds each copy to `core.md` (requirement 349, decisions 221 and 244). The Working item on credentials covers tool output as well as files: key names and never a value, and a query that selects its fields (requirement 361). One Working item has a session log what it learned about its rules to a dated file under the configuration directory and change no rule itself (requirement 362); primer reads those logs. `windows.md` is the four-line Git Bash paragraph, applied only when the script runs on Windows. The rendered body is `windows` (on Windows) then `core`, joined by one blank line.

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

`output-styles/concise-plain.md` ships verbatim with `keep-coding-instructions: true` and its version in the description; the host lists it as `rules:Concise Plain`. The rules plugin never edits `settings.json`; in the suite only `guard.mjs` does (requirement 336). `chat/instructions.md` holds one fenced block for pasting into a chat product's custom instructions and names no vendor.

### Draft skill

The style holds what shapes every reply; `skills/draft/SKILL.md` holds what applies only while a message to someone else is drafted, and the style names it in one sentence (requirements 363 and 366). The skill is a check on the finished text, run by the session before the draft is first shown: it strikes what no named reader acts on, what is the sender's to settle and what restates a named source, verifies what the sender has not checked, and keeps the owner's notes outside the draft; it never adds detail (requirement 364). An email draft is one HTML file in the scratch directory and no draft is kept in two formats (requirement 365). The check is a skill and not more style text because the rules that failed were loaded when they failed (decision 282).

### Refactor

`/rules:refactor` reviews a whole repository against `core.md` as shipped and the repository's own instruction files (R331), and ends in a report of findings grouped into bundles, one loop run each (R332). Subagents review one area each against the items that describe a file, a test or a diff, and a second pass challenges each finding. On one yes it writes a ticket file per bundle in the repository's ignored scratch directory, else the plugin data directory, and prints `reimagine loop <path>, thorough` for each; it never runs the loop (R333, decision 167).

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
  skills/run/tickets.md            open items, ticket text and records, one backend per tracker
  skills/run/report.md
  skills/run/handoff.md
```

The skill is named `run`, so it answers as `/loop:run`; the bare `/loop` is the host's bundled interval skill. Its description: "Plan, build, review and publish a bundle of tickets as one reviewed pull request per repository, resuming on the same branch when run again. Use when the user says "reimagine loop", or "run the loop" with ticket ids, issue or pull request references, a file, or a description of the work to ship." There is no separate command.

### Reading the request

No flags. The skill makes only the read-only calls that resolve ids (`git remote`, `gh`, `az`, an MCP read, a file read), then prints one block before any other tool call:

```
Tickets: #68 (gh), AB#4567 (mcp:ado_get_work_item), AB#4580 (unresolved: the work item read failed; paste its text or name a file that holds it; continuing without it)
Mode: build and publish; continue branch feat/68-4567-export (open PR #73)
Scope: primary C:/src/app; also edit C:/src/app-infra
Effort: thorough (reviewers at high; risk floor not yet judged)
```

Resolution order per id: GitHub forms through `gh`; `AB#n`, or a bare number when the primary remote is Azure DevOps, through an Azure DevOps MCP tool if listed, else `az boards work-item show --id n`; a Salesforce case through a Salesforce MCP tool; a readable path as a file; anything else, a bare number on a GitHub remote included, as text. A `--token` in the request is read as prose and the block shows the reading. "plan only", "do not publish", "confirm the plan", "continue <branch>", "on branch <name>", "primary <path>", "base <branch>", "also edit <path>", "budget <n> minutes" and the effort words are the recognized phrases. "primary <path>" names the primary checkout, a toplevel or a linked worktree, in place of the session's; "base <branch>" names the base branch in place of the remote's default.

### Approval scope

Invoking by name approves branch, commit, push, one pull request per repository, editing the body of a pull request this loop opened, one comment per run on it, ticket comments, and the open items' tickets with their records (decision 223). Ask-first rules in instruction files win over that grant; one that covers a new issue or a comment asks once for all the open items' tickets. Force push, `--no-verify`, merge, deploy, repository settings and any other new issue always ask. A denial is final: never retried, never routed around.

### Roles

| Role | Who | Fallback |
|---|---|---|
| orchestrator, judge, slice reviewer | the session model | none; the run stops |
| implementer | Agent `sonnet`, one per slice, parallel for disjoint slices | none; a tool error ends `blocked` after the snapshot restore |
| plan reviewer | fresh Agent `opus`, read and report only | once, on a model or tool error, at the `fallback-reviewer` model, or, when that is the reviewer's own model, at `sonnet`, or at `opus` for a reviewer on `sonnet`; stays swapped |
| final reviewer | built-in `code-review` skill, explicit level at most `xhigh`, `<merge-base>...HEAD` as a full sha, one pass | Agent `opus` over a patch file, once, when the skill is not listed, the primary is not the session's checkout, or the diff is in an additional repository |
| reader | Agent `haiku` when a read is worth splitting out | the orchestrator reads |

`.reimagine.json` at the primary repository's root:

```json
{
  "commit": false,
  "checks": ["npm test", "npm run lint"],
  "timeouts": { "subagent": 20, "review": 30, "check": 15, "ci": 45, "run": 240 },
  "models": { "implementer": "sonnet", "reviewer": "opus", "fallback-reviewer": "sonnet", "reader": "haiku" },
  "base": "main"
}
```

Every key is optional; the values shown are the defaults, except `checks` and `base`, which are examples: without `base` the base branch is the remote's default, and the request's "base <branch>" wins over the key. `models` accepts only subagent model names and never changes the risk floor or the step 5 role.

### Budgets, rounds, risk

Per-call budgets in minutes: subagent 20, review 30, check 15, CI 45. One default run budget of 240 minutes, overridden by "budget <n> minutes", then `timeouts.run`, then a session instruction. `date -u +%Y-%m-%dT%H:%M:%SZ` runs at enumerated points only and its output is copied, never computed. Question waits are excluded. Every step is capped at three rounds except step 5, which is one pass. The risk floor (auth, permission, schema or migration, row-level security, data access path, public API) raises reviewer effort to at least `high` and never falls. The effort hint maps to the `effort` argument of Agent calls and to the level typed to `code-review`, which is never above `xhigh` ("max" gives `xhigh` there, decision 122), and cannot lower a floored run.

### Steps

0. Preflight: echo, primary checkout, host, input guard, instruction files and ask-first rules, `.reimagine.json`, credential scan, permission statement, base branch, base commit and start commit, continue checks, open pull requests, clean tree, flagged files, record directory, prompts seen.
1. Review and verify the inputs; repository gate; claims; drift; buildable status; risk floor.
2. Plan: `plan.md` with slices.
3. Plan review by the fresh reviewer, up to three rounds; plan-only stop; optional confirmation; then branch, baseline, dependencies.
4. Build: implementers per slice, slice checks, orchestrator slice review, re-evaluation.
5. Final review: integrate, one `code-review` pass over the whole diff from the merge-base, triage into fix, defer and reject, the fix bucket applied once through the implementers, no second pass.
6. Checks: discovery, baseline matching, reuse of 5.1; on a non-GitHub host, the body file and the `prepared` end.
7. Publish: commit, push, open items settled, put to the user or filed, pull request create or update, CI watch and repair, ticket comments with their records, handoff and manifest.

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
  export-<id>.md  an Azure DevOps or Salesforce ticket, as the manifest names it
  pre-<n>.status, pre-<n>.patch, pre-<n>.hashes   snapshots before implementer calls
  diff.patch, diff-<slug>.patch                   review patches
  pr-body.md, comment-<n>.md, ticket-<id>.md      never committed; per-run names take -run<n> from run 2 on
  record-<id>.md, item-<k>.md, item-<k>-record.md a source ticket's record, an open item's ticket text and its record; never committed
```

`<branch-slug>` is the branch name lowercased with each run of characters outside `[a-z0-9]` replaced by `-`, at most 60 characters, then trailing `-` removed; `steps.json` keeps the exact branch name, and a record whose branch differs from the run's is a collision that ends preflight `blocked`. The branch is known at preflight: the continued branch, the "on branch" name, the branch of the one existing record whose `tickets` list holds one of the request's tickets, or the predicted `fix/<ids>-<slug>`, `feat/<ids>-<slug>` or `work/<slug>`. `.reimagine/` is excluded through `.git/info/exclude` so that a run that commits nothing leaves the tree clean (verified, spike 7).

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

- Preflight finds the record by ticket id or by the predicted branch, fetches the branch with the explicit refspec when it exists on the remote (a branch left by a `prepared` run may be local only, and one left by a plan-only run may exist nowhere), fast-forwards when the local tip is at or behind the remote head, lists `git log <merge-base>..HEAD`, marks each commit as its own (named by a commit line in `run.md`) or foreign, writes the list to `inputs.md`, and marks tickets done when every slice serving them has its commit on the branch, or, for a slice the loop built and did not commit, when the tip holds its recorded file hashes. A done ticket whose title or text changed since it was last planned is open again. A record whose pull request merged or closed ends preflight `blocked`.
- Steps whose inputs are unchanged and whose outputs exist are reused, step 4 only when its slices are committed. Step 3.7 sets up the checkout in every run that builds or checks, also when step 3 is reused. Slices with a closing commit on the branch are not rebuilt.
- Same tickets and no open slice: step 6 verifies the checks. When the run that last reached step 7 ended `done` with its pull request open, the report is rewritten, nothing is committed or posted except the body of the loop's own pull request after a push from outside, state `done`; otherwise step 7 publishes the committed work. A ticket done at preflight gets a ticket comment only when no run has commented on it.
- New tickets: slices are appended to `plan.md`, which is reviewed again; the new slices are built and reviewed; the whole diff from the merge-base goes through step 5; step 7 pushes, updates the body of the pull request this loop opened with `gh pr edit --body-file` (once per run), posts one comment per run, and comments on the new tickets. A pull request the loop did not open gets a comment only; its body is never edited.
- An interrupted run resumes at the first step whose entry is not `complete` or whose inputs changed, after the tree is rechecked.
- The loop never force pushes, rebases, resets or amends; before every push it compares the remote head with what preflight fetched and ends `blocked` if it moved; a dirty tree ends preflight `blocked`.

Terminal states: `done`, `plan-only`, `prepared`, `blocked`, `stopped`.

### Publication texts

The pull request is created with `gh pr create --title "<title>" --body-file <absolute path>`, the title being the single ticket's title or the plan's one-line summary. `pr-body.md` sections: What changed, Where the ticket and the code differ, Decisions for the reviewer, Checks not run, Follow-ups (one line per ticket of the filed open items), Related pull requests, Closes. On a non-GitHub host the run ends `prepared` after step 6 with a body file covering every input of every run of the record, one per repository; on an Azure DevOps remote that body is the short form under the 4,000-character description cap, the full body goes to a comment file to post first, and an Azure DevOps ticket is a `_workitems/edit/<n>` link in place of `AB#<n>`, which links only from GitHub through the Azure Boards app. Ticket comments are written for the ticket's readers, what changed, what happens next and who it waits on, and the criteria with their evidence go in a record attached to the ticket: an issue artifact through `gh api` on GitHub, the MCP attachment tools on Azure DevOps, else the record stays local and the report says so (`tickets.md`, decisions 224 and 225). None names a model, an agent, a tool, a run-internal path or a term the loop coined; `SKILL.md` carries the house-rules item on what leaves a session, held to `core.md` by lint (requirement 349). The report is never posted, `commit: true` included. The handoff (`reimagine-handoff: 1`) and `audit-manifest.json` (`{"bundles":[{"repo","pr","tickets"}|{"repo","branch","base","tickets"}],"claims":["<absolute handoff.md>"],"reviews":{"level","fixed":[{"file","summary"}],"deferred":[...],"rejected":[...]}}`) are written when the run has its own commit; the report's `Gate:` line suggests `/gate PR <n>` for 500 or more changed lines, and its `Audit:` line suggests `/audit:run "<manifest>"` for bundles with more than one repository or more than one ticket, and after the gate when the line count alone called for one.

## The `audit` plugin

```
plugins/audit/
  .claude-plugin/plugin.json
  LICENSE  README.md
  commands/run.md  resume.md  act.md  handoff.md
  skills/audit/SKILL.md            orchestrator: roles, queue, budget, stages.json, registry, read-only boundary
  skills/audit/common.md           the eight hard rules, evidence kinds, ids, output contract
  skills/audit/audit-evidence.md   auditor and adversary rules, the finding schema among them
  skills/audit/second-opinion-request.md
  skills/audit/handoff.md  live.md  report.md  work-items.md  fault-injection.md  resume.md
  skills/audit/stages/1-orient.md ... 9-act.md
  skills/audit/stages/7-converge-split.md        stage 7's split mode, read only when the ledgers reach the threshold
  agents/digester.md  mapper.md  auditor.md  adversary.md  merger.md
  scripts/readonly.sh  handoff.sh  ledger.sh  working-tree.sh  revert-tests.sh  live.sh  memory.sh  work-items.sh  collisions.sh  run-copies.sh  report.sh  registry.sh
```

The skill description names "reimagine audit". The four commands forward to the skill: `run` with inputs or a manifest, `resume <run-id> [--from n] [--live file]`, `act <run-id> <item-id...> [--per-item]`, `handoff [--out] [--verdicts] [--memory]`. `run` takes no flags; prose may give effort, budget and model overrides, and the manifest holds everything else.

### Stage model

Nine stages, in this order with these dependencies: orient; digest and domain map and pass one together; pass two per group after a barrier; second opinion after every pass two; converge with the late adversary and the merger; report; act on request. `stages.json` in the run directory is the completion record and the input to resume, with the schema in requirement 149. A finding counts only after a fresh adversary other than its author challenged it and the second opinion saw it. The four questions and the evidence model are requirements 162 to 174.

Stage 6 is a fresh `adversary` agent at `opus`, falling back once per batch to `sonnet`, or to `opus` when it already ran on `sonnet`. It receives the request file built from the template: the brief, `common.md`, `audit-evidence.md`, claims, every diff and stat, `ledger/5.md`, every pass-two file, live files, and the audited sources by absolute path and sha; every copied input carries a sentinel line `audit-sentinel: <path> <16 hex>` that the answer must acknowledge, which is how the orchestrator knows the agent read it. The mandatory set is split into batches of at most 60 ids with one launch each; the first batch alone may add `X<n>` findings with `origin: second-opinion`. The answer file is saved under `second-opinion/` verbatim. The 60-id batch size is revisited when a run shows a reason (decision 21).

Roles: digester `haiku`; mapper and merger `sonnet`; auditor and adversary `opus`; second opinion `opus`. A failed digester, mapper, auditor or adversary relaunches on its model, then on `opus`, or on `sonnet` for a role already there, as a swap; a failed second-opinion batch relaunches once on `sonnet`, or on `opus` when it already ran on `sonnet`; a failed merger is replaced by the orchestrator; no default or fallback selects `fable`, which stays an accepted override. The manifest `models` key overrides per role. Launches use `subagent_type: audit:<role>` in the background.

Stages 4 to 6 run on the prompt path. Decision 94 defines a second engine, a dynamic workflow under `plugins/audit/workflows/`, behind the same inputs, outputs and `stages.json`, with `engine: workflow` or `engine: prompt` and the reason recorded; it is built only under requirement 270's gate, and this document's plugin table names it when it ships. The default source list gains `REVIEW.md`, read at the bundle's base commit, whose calibration and skip rules shape the report with every removal counted in one line (requirement 271).

### Run directory

`<scratch>/audit/<run-id>/`, where scratch resolves to the manifest key, else an existing ignored `scratch/`, `tmp/` or `.scratch/`, else `.reimagine/` when it is already ignored, else `${CLAUDE_PLUGIN_DATA}/runs/`. The audit never writes under `.git/` apart from the two writes the read-only boundary discloses, an approved fetch's remote-tracking refs and the loose objects of a working-tree head; the loop is the component that adds `.reimagine/` to `.git/info/exclude`, so on a repository where the loop has run the audit lands in `.reimagine/audit/`. The registry is `${CLAUDE_PLUGIN_DATA}/runs.json`, which `registry.sh` alone writes.

### Scripts and their literals

The scripts and their suites embed these strings: `reimagine-handoff: 1`; `reimagine-live: 1`; `# audit report: `; `audit:auditor` and `audit:adversary` in ledger output; identity `audit`, `audit@example.invalid`, `audit: working tree` in `working-tree.sh`; the `second-opinion/` directory and `origin: second-opinion`. Every literal sha and hash in the suites that depends on one of those strings is produced by running the fixture builder once and pasting the observed value.

`jq` is needed by `live.sh`, `work-items.sh` and `collisions.sh`; stage 1 warns when it is missing and names what will not run.

`run-copies.sh` writes the run's `common.md`, header filled, and `audit-evidence.md` from the skill's copies, found from its own path, so neither passes through the model (requirement 283).

`registry.sh` writes the registry: `add` appends a run and `set` gives a run its state, each in one run of the script, under a lock directory that the script takes with `mkdir`, holds only while it rewrites the file, and removes when it is older than a minute (requirement 177).

`report.sh` builds the report's copied sections from the run directory's files: `parts` writes section 8's decision ledger and raised tickets, section 10 and the body of `claims-verdicts.md` under `report/parts/`, `assemble` joins every part file in name order into `report.body.tmp`, and `claims-verdicts` writes the verdicts file with the revision, so no copy passes through the model (requirement 322).

`revert-tests.sh` reads `REVERT_TESTS_CAP`, `REVERT_TESTS_DEADLINE`, `REVERT_TESTS_WAIT` and `REVERT_TESTS_TICK` from the environment, whole or fractional seconds; its test sets them low, and the shipped defaults are unchanged (requirement 279).

## The `gate` plugin

```
plugins/gate/
  .claude-plugin/plugin.json
  LICENSE  README.md
  skills/gate/SKILL.md             /gate; what holds for the whole run: the request, the reading block, approval scope, roles, caps, configuration, terminal states
  skills/gate/steps/0-preflight.md instruction files, the permission statement, base, head, clean tree, the record
  skills/gate/steps/1-pass.md      the pass entry, the split, the reviews, the findings, the triage
  skills/gate/steps/2-fix.md       implementers, snapshots, checks, the commit and the push
  skills/gate/steps/3-next.md      the rules of next.mjs, caps, the actions of resume.mjs
  skills/gate/steps/4-publish.md   the run's end: run entry, manifest, report, next target; posts nothing
  skills/gate/record.md            the record's files, the sample of passes.json, the ledger, write discipline
  skills/gate/report.md            the report's template and sections
  scripts/findings.mjs             a pass's saved reviews to ledger entries and a summary
  scripts/next.mjs                 the next level or the stop, from passes.json
  scripts/resume.mjs               where a later run starts, from passes.json, the head, the remote head and the merge-base
  scripts/split.mjs                the reviews of a pass, from the numstat of the change
```

The skill is named `gate`, like its plugin, so it answers as `/gate` and `/gate:gate` (verified, decision 120). There is no command and no hook. The gate runs after the loop and before the audit, and the audit's manifest carries its result. Requirements 287 to 323 state its behavior; this section says where each part lives.

### Scripts and prose

Four things must be exact, and a script holds each: `split.mjs` the reviews of a pass and their slugs, `findings.mjs` what a saved review holds and the identity of a finding across passes, `next.mjs` the next level or the stop, `resume.mjs` where a later run on the branch starts. The prose holds what needs judgment or a tool: the request, the approval scope, the triage, the fix round, the push and the report. The lists the two share, the change kinds, the rules, the resume actions and the terminal states, are compared by `tests/gate/skill.test.mjs`, which also runs every script command the skill shows and reads the sample of `passes.json` through `next.mjs` (decision 239).

Each rule is stated once. `SKILL.md` holds what applies to the whole run, each step file what its step does, `record.md` the files of the record, and `report.md` the report. A file refers to another by its section name, and each supporting file ends by naming where the run goes next.

### Roles

| Role | Who | Fallback |
|---|---|---|
| orchestrator, triage | the session model | none; the run stops |
| reviewer | a child session: `claude -p "/code-review <level> <merge-base>...HEAD[ <path>]" --model <reviewer> --output-format json` at `models.reviewer`, one per pass, or one per group of `split.mjs` | an Agent at `models.fallback-reviewer` over `diff-<n>[-<slug>].patch` with the level as `effort`, when `claude` is not on the PATH or the child reports the skill missing; stays for the run. A child that met a usage limit fails the pass, which the next run resumes (decision 241) |
| reader | Agents at `models.reader`, one per batch of findings, when a pass has more than 30 to sort; returns evidence per finding, never a bucket | the orchestrator reads the batch |
| implementer | an Agent at `models.implementer`, one per group of files | none; a failed call ends `blocked` after the snapshot restore |

The configuration block and its defaults are in `SKILL.md` and the README, which a test keeps the same.

### Engine

The child session is the engine (decision 124). It runs at `gate.models.reviewer`, passed as `--model` on every run, since without the flag it takes the model the settings files set and not the session's (decision 205). It runs from the target's root with `CLAUDECODE` unset, stdin from `/dev/null`, `--permission-mode default` and an allow list of read tools, read-only git forms and the run's checks, in the background, and its output is saved before `findings.mjs` parses it. Verified on 2.1.310 (decisions 118 to 121): the result is text whose last part is a fenced JSON array of `{file, line, summary, failure_scenario}` with repository-relative paths; the typed level reaches the review; a `high` review of a ten-line diff takes 80 to 150 s and costs about a dollar, an `xhigh` one 120 s and $1.23, a `max` one 17 minutes and $17; the remembered interactive level is untouched; a bare path target reviews against the repository's default branch, so a split group is always `<merge-base>...HEAD <path>`; calls outside the allow list are denied and listed in `permission_denials` without stopping the review.

### Record

```
.reimagine/gate/<branch-slug>/
  passes.json      the completion record
  findings.json    the identity ledger across passes
  report.md        rewritten at every terminal state
  review-<n>[-<slug>].json | .md    each review's saved output
  diff-<n>[-<slug>].patch           a stand-in's input
  pre-<k>.status, .patch, .hashes   the tree before an implementer call
  post-<k>.status, .hashes          the tree as the call left it
  audit-manifest.json               written when the run did not come from one
```

`record.md` holds the sample of `passes.json` and the ledger's shape. `passes.json` is the only record of completion: a pass is written `running` when it starts, gets its commit as soon as the commit exists (decision 234), and is `complete` once `next.mjs` has decided. A second run on the branch reads the record through `resume.mjs` and resumes or starts a new sequence, as `steps/3-next.md`, Resume, says.

### What leaves a run

The gate posts nothing to a pull request or a ticket (requirement 350, decision 222). `SKILL.md` carries the house-rules item on what leaves a session, held to `core.md` by lint (requirement 349). The only text the gate sends out is its fix commits' messages. The manifest the run came from gains a top-level `gate` key per bundle, and a run without one writes a minimal manifest in the record, so the report can suggest `/audit:run` on it.

## The `review` plugin

```
plugins/review/
  .claude-plugin/plugin.json
  LICENSE  README.md
  skills/run/SKILL.md            /review:run; prose "reimagine review"; the reading block, the approval scope, the modes
  skills/run/<mode>.md           the first review, the follow-up and the posting step, each read in its own run
  scripts/posts.mjs              compare <drafts directory> <threads file> | leak <draft>...
```

Review takes a pull request that someone else wrote and ends in comments (requirements 367 to 380). It is a plugin of its own because nothing in the suite ends read-only with findings as a success: the gate fixes and pushes on the user's branch, the audit's act stage commits there, and each of the loop, the gate and the audit calls or builds its own review, so there is no engine to add a mode to (decision 286). The bare `/review` is the host's own review, so the skill is `run`, as the loop's is (decision 35).

It owns little review logic. The first reading is the host's `code-review` in a child session, run as the gate runs its passes but with no check of the repository on its allow-list, or a gate record or audit report for the same head. The pull request's head is the author's and is untrusted: the child session loads no configuration from it, no hook of the repository runs on a `git` command in the scratch worktree, and code from it runs only after the user approved that by name (requirements 369 to 371, decision 287). What the plugin adds comes after the reading:

| After the reading | What it does | Requirement |
|---|---|---|
| Siblings | searches the shared name alone, classifies every hit, lists every site | 372 |
| One hop out | consumers, the tests and documents that state the changed rule, the tickets' criteria | 372 |
| Citations | reads every location a draft names again at the head | 372 |
| Basis | labels each finding and fix `read`, `run` or `not run`; runs a fix before recommending it | 373 |
| Disposition | `post`, `note` or `drop` for every point, by the team's conventions | 374 |
| Two texts | comments for the author, a summary for the person who gates the merge | 375 |
| Follow-up | each earlier item landed or open, a trial merge, a read of each merge commit | 376 |

Nothing is written in the reviewed repository's work tree. The record, the drafts and a detached scratch worktree at the pull request's head live under `${CLAUDE_PLUGIN_DATA}/reviews/<repo>/<target>/`, `<repo>` taken from the remote so another clone finds the earlier round, since an ignore entry in someone else's repository would show the review as surely as a record would (decision 287). The run lists what it created and removes nothing without a yes.

Posting is a separate step on a request that says `post`. Each draft is one file; each outward action is approved by name; the head and the threads are read again first; each post is made from its file and recorded before the next; and `posts.mjs compare` checks what the forge holds against the drafts, so a step that stopped part way runs again without posting twice. The vote is cast only when the user's vote on the forge differs from it. `posts.mjs leak` fails a draft that holds a path, user name or host name of the reviewer's machine, or the name of the session's model or of the plugin. On GitHub the four things posting needs, a comment, its anchor to a file and line, a vote and the threads with their status, come from `gh`; on another forge they come from a tool the session lists, else the step writes a paste-ready export. A thread's resolution, a ticket edit and a merge run only where the session has a tool for each and the user approved it by name (requirement 378, decision 289). The script opens no connection, so its suite replaces nothing.

## The `primer` plugin

```
plugins/primer/
  .claude-plugin/plugin.json
  LICENSE  README.md
  skills/primer/SKILL.md           /primer; the mode choice, the rules of every mode, the proposal and plan forms, maintain
  skills/primer/init.md            the init steps, read in an init run
  skills/primer/adopt.md           the adopt steps, read in an adopt run
  skills/primer/local.md           the `local` profile's steps, read in a `local` run
  skills/primer/placement.md       the eleven placement items and the tasks test
  skills/primer/shapes.md          hub, nested file, rule and skill templates with their caps
  skills/fold/SKILL.md             /primer:fold; disable-model-invocation: true; reads the docs live, writes nothing
  hooks/hooks.json                 PreToolUse Bash|PowerShell -> sh "${CLAUDE_PLUGIN_ROOT}/hooks/drift.sh", onFailure continue
                                   SessionStart startup -> sh "${CLAUDE_PLUGIN_ROOT}/hooks/notice.sh"
                                   SessionStart -> node primer.mjs session-start <layer>, one entry per layer, timeout 10
                                   PreToolUse Edit|Write|NotebookEdit -> node primer.mjs reach, where decision 299 leaves a case
  hooks/drift.sh                   the commit check; hands a `git add` or `git commit` in a `local` repository to primer.mjs staged
  hooks/notice.sh                  one line when auto memory or the feedback logs have unreviewed entries
  scripts/primer.mjs               session-start <layer> | staged | reach | status | measure | map | ledger | copies | transcripts
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

The skill's description names "turn this into a skill", "we keep doing this", "add this to the project instructions" and "check the instruction files" (verified: a description's phrases invoked a skill in 2 of 2 runs, decision 84). There is no command file. The two hooks are POSIX sh; `primer.mjs` is the one Node script, and it serves the `local` profile, the budget, the ledger and the copies.

### Shapes and caps

| File | Parts | Cap | Loads |
|---|---|---|---|
| root `CLAUDE.md` or `AGENTS.md`, the hub | line 1 `<!-- primer -->`; `# <name>` and two or three sentences, with one sentence per long document to read before a kind of work; `## Commands`; `## Constraints` | 60 lines | every session |
| `<subdir>/CLAUDE.md` | the hub's three parts, no marker | 60 lines and 40,000 characters | when a file under it is read or edited |
| `.claude/rules/<topic>.md` | prose; optional `paths` frontmatter, a YAML list or a comma string | 200 lines and 40,000 characters | at launch without `paths`; on a matching touch with it |
| `.claude/skills/<name>/SKILL.md` | `name`, `description` with the phrases first, optional `disable-model-invocation`, `paths`, `allowed-tools`; one sentence for done, numbered steps, checks, what to report | 150 lines | description at launch unless `disable-model-invocation`; body when invoked, judged relevant, or a `paths` match |
| `docs/*.md` | long-form for people and for the hub's sentences | none | when named |

The marker is an HTML comment because the host strips those before the content reaches context (verified, decision 74). A count is the lines the file has, frontmatter and blank lines included; the character cap counts UTF-8 characters (requirement 240). A file over its cap is split by topic; no real constraint is deleted to fit. `shapes.md` holds a template for each instruction file; `placement.md` holds the eleven items of requirement 241 with the tasks test and one example per item.

Imports: the hub holds none but `@AGENTS.md`; a rule or skill names a `docs/` file in words, since the host does not expand `@path` inside `.claude/rules/` (verified, decision 82). A root `AGENTS.md` is the hub when the repository keeps one, with no `CLAUDE.md` written; a root `CLAUDE.local.md` stops the host reading it, so adopt then proposes the one-line `@AGENTS.md` file (decision 75).

### Modes

`/primer` reads the files on disk, prints the mode as the first line, and runs one of:

- `init`, when no `CLAUDE.md` or `AGENTS.md` exists at any depth. It reads `README.md`, manifests and build files, CI workflows, the test layout, the top-level directories and `docs/`, writes the hub uncommitted, proposes the first rules and skills the repository shows, writes none of those without a yes, and names `/init` as the host's unopinionated alternative.
- `adopt`, when instruction or documentation files exist but there is no hub of the shape above, or the hub holds a `## Spokes` index. It inventories every instruction and documentation file, other tools' rule files listed and left alone; plans; asks once; then commits moves first, each move commit changing no content and repairing documentation links, and rewrites after. A pointer whose condition is a file pattern becomes a path-scoped rule, one whose condition is a task becomes a skill, one whose condition is a directory becomes a nested `CLAUDE.md`; a procedure in any instruction file becomes a skill; a topic section every task needs becomes an unscoped rule; a long document stays under `docs/` with one sentence in the hub; agent content leaves `README.md`; a statement kept is checked against the code. A repo-docs repository converts in one run, which is the migration. The second run reads as maintain and changes nothing.
- `maintain`, when the hub has the shape. Three passes feed one plan and one question. Verify: what the hook denies on, each command named in a manifest, script or workflow, each statement true of the files it covers, each skill's commands and files present, duplicates and lost procedures reported, an oversized skill split; the report names `/doctor prompt-audit` for contradictions and stale models and never calls it (decision 77). Promote: auto memory candidates by type. Propose: skill candidates with their evidence. With nothing to change it prints `primer: no drift` and the reported items.

Every write is a documentation file; code, configuration, settings, CI, manifests, `CLAUDE.local.md`, ignored files and the memory directory are never edited, except that promote deletes a note the user approved for deletion. Commits follow the repository's convention, else `docs(primer): <subject>`, with the body opening `Instruction-file <mode> pass, <date>.`; the drift hook runs on each.

### Proposals

A skill candidate comes from an instruction file, the repository, auto memory or the session, in that order, and is shown with its source, the steps as observed, how often it was seen and the proposed name. On a yes the skill is written at `.claude/skills/<name>/SKILL.md` in the shape of the table, and a procedure taken from an instruction file leaves that file in the same change. A memory candidate is a `feedback` note about the repository, an undated `project` decision or a `reference` a teammate would need; a `user` note is never promoted. It is shown with the note's text, its `modified` date, the destination and the line to be written; on a yes the line is written, then a separate question offers the topic file and its index line for deletion (decision 79). After a promote pass the skill writes the stamp `${CLAUDE_PLUGIN_DATA}/reviewed/<key>`.

Auto memory is read from the directory the session's instructions name, else `autoMemoryDirectory` from the local, project or user settings, the first file that sets it deciding and a value that is not an absolute or `~/` path counting as unset, else `<config>/projects/<name>/memory/` for a `CLAUDE_CODE_PROJECT_DIR_NAME` the host took, else `<config>/projects/<key>/memory/`, where `<config>` is `$CLAUDE_CONFIG_DIR` else `~/.claude` and `<key>` is the absolute path of the main worktree's root with every character outside `A-Za-z0-9` replaced by `-` (verified, decisions 83 and 214). `MEMORY.md` lists `- [Title](file.md)`, an em dash and a hook per note; each topic file carries `name`, `description` and `metadata` with `type` and `modified`.

### Drift hook

PreToolUse on `Bash|PowerShell`, POSIX sh with sed, awk, sort, tr, wc and `test`, no `jq`, with `"onFailure": "continue"`: the hooks reference says a shell-form PreToolUse hook on Windows without Git Bash runs in PowerShell and, failing with the field unset, can block the call, so a host without `sh` skips the check and runs the call (decision 193). It reads stdin, extracts `tool_input.command`, and returns at once unless the command runs `git commit` (the grammar of requirement 260). It resolves the repository the commit runs in (decision 50) and finds the hub: the root `CLAUDE.md`, the `AGENTS.md` a one-line `@AGENTS.md` names, or the root `AGENTS.md` when there is no `CLAUDE.md`. Without a hub whose first line is `<!-- primer -->` it prints nothing.

With one it reads the hub, every tracked nested `CLAUDE.md`, every tracked `.claude/rules/**/*.md` and `.claude/skills/*/SKILL.md`, and the changed set of decision 56. It denies, in the JSON deny form with `primer: ` and the findings joined by `; `, on a cap overrun, a backticked token of the hub's opening paragraph that looks like a path (holds a `/` or ends in `.md`, with no space, `<`, `>`, `*`, `{` or `?`; not a home, absolute or drive path, a URL, or a token whose first segment is no top-level entry and that does not end in `.md`) and does not exist spelled exactly, a `paths` value that is neither a list nor a comma string, a `paths` glob that matches no tracked file, or a `SKILL.md` without `description`. A glob is matched with `git ls-files -- ':(glob)<pattern>'` after the hook expands brace groups and prefixes `**/` to a pattern without a slash (verified against the host's matching, decision 80). When nothing denies, a changed file that matches a rule's or skill's `paths` or sits under a nested `CLAUDE.md` whose file is not itself changed puts that file in `additionalContext` as one to recheck (reaches the model under auto mode, decision 85). It never reads git history and never writes.

### Notice

SessionStart at `startup`, the same construction. It finds `<config>` from the grandparent of the input's `transcript_path`, `<key>` from the parent of `git rev-parse --git-common-dir` (the working directory outside a repository), and the hub as the drift hook does. The memory directory is the `autoMemoryDirectory` of `.claude/settings.local.json`, `.claude/settings.json` or `<config>/settings.json`, the first file that sets the key deciding and a value that is not an absolute or `~/` path counting as unset, else the transcript's own directory when its name is `$CLAUDE_CODE_PROJECT_DIR_NAME`, else `<config>/projects/<key>/memory/`; managed settings and `--settings` are out of its reach (decision 214). With the marker present it counts the topic files `MEMORY.md` lists whose `type` is `feedback` or `project` and whose `modified` is later than the stamp, every such file when no stamp exists, and prints `{"systemMessage":"primer: auto memory has <n> notes since the last review; run /primer"}` when the count is above zero; otherwise nothing. It writes nothing; the stamp is the skill's, which a headless session writes under `auto` and refuses under `acceptEdits` (decision 76).

### Fold

`/primer:fold` reviews one repository against the documentation as it reads that day and ends in a report in the reply; it writes nothing (R329). It tells the situation from the files, a tool for Claude, a repository worked on with Claude Code, or both, reads the index at `https://code.claude.com/docs/llms.txt` and the starting pages of R327 with one subagent per page, and maps what each returns onto the repository. Each item names the page and section, the file and line, what the docs say, what the repository does and the destination by `placement.md` (R328). A gap in `shapes.md` or `placement.md` is a primer item, a disagreement with the docs about what the host does is an item whose change is the check that would settle it, with primer's file edited only after it (R328), a fold into an instruction file names `/primer`, and one into code or configuration is written as a loop description. `disable-model-invocation: true` keeps its description out of the startup context (decision 166).

### Profiles and the local store

A repository has one of two profiles, picked once by the user on primer's first run there, with no default (requirement 385). `shared` is everything above: instruction files in the work tree, committed. `local` is for a repository where no agent file may appear in the tree or its history: primer writes nothing there and makes no commit.

```
<config>/reimagine-primer/
  config.json          {"store": "<path>"}, optional
  machine.md           the layer of this machine: people, dates, paths; never in the store
<store>/               the directory config.json names, else <config>/reimagine-primer/store/
  map.json             {"version": 1, "repos": [{"remotes", "path", "group", "profile", "own"}], "roots": ["<path>"]}
  shared.md            the layer of every mapped repository
  groups/<group>.md    the layer of one group of sibling repositories
  docs/                documents a layer points to, read on demand
  ledger.jsonl         one line per feedback item
<config>/feedback/     the dated logs the house rules have every session write (requirement 362)
```

A repository matches a map entry by a remote, written `host/path` as guard writes it, else by its main work tree's root, found from the git common directory as the notice finds it; so every worktree matches as its repository does (requirement 386, decision 292). The store may be a directory the user versions, which is why the machine's own layer sits outside it. Only `primer.mjs` writes the map and `config.json`; the skill writes a layer or a document on a yes that names the file.

Host facts the profile rests on, read from the hooks, memory, sub-agents and sessions pages of the documentation on 2026-11-13 and not yet observed in a spike: a hook's `additionalContext`, `systemMessage` and plain stdout are each capped at 10,000 characters, measured per hook and per field even when several hooks answer one event, and a longer string is replaced by a file path and a preview of its first 2,000 characters, which the session is not asked to open; a session receives the `additionalContext` of every hook that answers an event; hook context is to be written as factual statements, since text framed as commands can be shown to the user as a suspected injection; a `CLAUDE.local.md` that git ignores exists only in the worktree where it was made; a directory added with `--add-dir` gives its instruction files only when `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD` is set, and never its path-scoped rules; SessionStart has the sources `startup`, `resume`, `clear`, `compact` and `fork`, and `SubagentStart` can add context to a subagent; instruction files are context and only a hook blocks a call. The documentation does not say whether a subagent's context holds a SessionStart string, which sources drop it, or whether a second repository's instruction files load when a session edits a file there; decisions 293 and 299 name the spikes.

### Loader and delivery

In a `local` repository three SessionStart entries run `primer.mjs session-start <layer>`, one per layer, so each layer has the host's cap to itself (requirement 388). Each prints its layer as `additionalContext`, opening with one line that names the layer and its file and closing with a canary taken from the layer's digest; a fresh session asked for the canary answers with the value `primer.mjs status` prints, which is the check that the whole string arrived. The loader measures each string as emitted and warns at every start while one is over the cap, warns when a repository under a listed root has no entry, gives its `git` calls 5 s between them, inside the entry's timeout, emits no layer and reports `unknown` when they run out, and skips its checks and warnings in a subagent and in a session no one attends while still loading the layers (requirement 389).

Two more hooks carry the profile. The drift hook's entry hands a `git add` or `git commit` to `primer.mjs staged`, which in a `local` repository denies a call that would stage an agent file the upstream does not track, or an ignore line that names one (requirement 391, decision 294). The hook is POSIX sh and cannot read the map, so it hands those two commands to the script wherever the hub has no marker and primer's own directory exists, and the script answers only for a `local` repository. A command it cannot resolve is taken to stage every file git does not ignore, an error inside the script denies, and a missing `sh` or `node` lets the call through; the entry stays one process for every other shell call. A PreToolUse entry on file edits runs `primer.mjs reach`, which is silent inside the session's own repository and, on the first edit in another, gives that repository's layers or names its instruction files (requirement 395).

### Budget, placement and fold-back

Size is measured by `primer.mjs measure` on what the loader would emit, for every mapped repository, and a proposal shows each repository's size before and after; an addition names the cut that pays for it or becomes a pointer, and no file states how much room is left (requirement 392). In `local` a rule goes in the shared or the group layer, people and dates in the machine layer with an expiry, and reference material, procedures and conventions for one kind of file in a store document that a layer points to, since nothing outside the work tree loads by path (requirement 393).

Sessions log and never edit: the house rules have each one write what it learned to a dated file under `<config>/feedback/` (requirement 362). The maintain pass reads those logs beside auto memory. It searches every layer and the governed repository's own instructions before proposing anything, runs two passes before the user sees a list, the first on evidence and the second on worth, placement and wording, and ends in a pick (requirements 394 and 398). `ledger.jsonl` holds each item's status and how often it was seen, so a held item that comes up again returns with its count and a later item that matches a folded rule is recorded as that rule's failure (requirement 399, decision 296).

A declared copy of context text is checked against a snapshot of its source by `primer.mjs copies` (requirement 400). `primer.mjs transcripts` lists the user's own messages from the session files with no model call, skipping what it cannot read, since the host documents the transcript format as internal. The detection that counts what the user had to repeat is built only after a pilot (requirement 401, decision 297).

### Migration from repo-docs

A repository kept by repo-docs has a `## Spokes` index, spokes under `docs/` or beside code, and perhaps the `@AGENTS.md` adapter. One adopt run: the marker goes on line 1; each pointer becomes a path-scoped rule, a skill, a nested `CLAUDE.md` or one sentence in the opening paragraph by its condition; the index goes; the adapter stays when present. In this repository the hub keeps its commands and constraints and names the four design documents in its opening paragraph, and `.claude/settings.json` enables `primer@reimagine-engine`. The repo-docs plugin's tags and changelog headings stay, and lint accepts a heading for a retired name.

## The `guard` plugin

```
plugins/guard/
  .claude-plugin/plugin.json
  LICENSE  README.md
  skills/guard/SKILL.md          /guard; disable-model-invocation: true; pre-approves status, list, plan and denials only
  scripts/guard.mjs              node guard.mjs <verb> <data directory> [args]; verbs: status | list | plan [--add <path> [--merge] [--reads] | --drop <path or remote> | --clear] | apply <id> | denials | session-start | denied
  hooks/hooks.json               PermissionDenied -> node guard.mjs denied ${CLAUDE_PLUGIN_DATA}; SessionStart startup -> node guard.mjs session-start ${CLAUDE_PLUGIN_DATA}
```

Guard renders the auto mode classifier's `environment` and `allow` entries for the repositories the user lists (requirements 334 to 344, decision 181). The host reads `autoMode` from the user settings file, managed settings and `--settings` only, so guard writes the user settings file: `$CLAUDE_CONFIG_DIR/settings.json`, else `~/.claude/settings.json`. The list, `reimagine-guard.json`, sits beside it, since the plugin data directory goes with an uninstall; the plan, the state and the lock sit in the data directory. `--drop` removes a listed repository by its path, a path inside it, or a remote as `list` prints it or as a URL.

The script reads the file as UTF-8 text, finds the top-level `autoMode` member with a small scanner after `JSON.parse` accepts the file, and replaces only that member's value, so every other byte stays; a new member goes after the last one, in the file's indent and line ending. Inside `autoMode` it rewrites `environment` and `allow` and keeps every other key. Every entry it writes ends with ` (reimagine guard)`; an entry without that ending is the user's.

The environment list is written whole, since the host splices `$defaults` in as a block and a second line for a slot does not replace the first (verified on 2.1.318, decision 181). The defaults come from `claude auto-mode defaults` at each run; guard changes the Trusted repo line, adding one sentence that names each checkout and its remotes, and the Source control line, which becomes guard's own. The state file records the entries guard wrote, to tell an edited one, and the default lines it copied, to refresh a copy the host has since changed. While repositories are listed and the state file records copied default lines, a default line the host adds later is added at the next run. When the list empties and the copied lines are every current default, they go back to one `$defaults`; on clear, a marked line whose label the user's own line holds is dropped and not replaced by the default. The allow entries are those of requirement 339, after `$defaults`.

| State | Meaning | Plan |
|---|---|---|
| absent | no guard entry, empty list | nothing, or the change a list edit asks for |
| current | the file holds what guard would write | nothing |
| stale | the list, a remote or the host's text changed | the new entries |
| edited | a marked entry changed by hand, or a slot guard changes holds the user's text | nothing; names the entry |
| malformed | a settings file that is not a JSON object, holds `autoMode` twice, whose `autoMode` is not an object, or whose `environment` or `allow` is not a list of strings; a list file that is not a guard list | nothing |
| managed | another scope adds `autoMode` entries | nothing; names one as an example |
| unavailable | `claude` cannot run or prints no defaults guard can read | nothing |

`plan` checks the candidate with `claude auto-mode config` in a temporary configuration directory, since `--settings` adds to the user file rather than replacing it, and `apply` checks the real directory after the write: every guard entry once, no environment label twice, every default allow rule present when `$defaults` is. `claude` runs through `execFile` with `CLAUDE_CONFIG_DIR` set, and on Windows through `cmd.exe` when only the npm `claude.cmd` shim is on the PATH (decision 190); the suite replaces it with a runner that reads the directory's `settings.json` and answers from a literal defaults fixture. Backups, the atomic write and the lock follow `rules.mjs`, except that guard takes over a lock only when it is older than 240 s, where `rules.mjs` uses 60 s.

The skill runs `status`, `list` and `plan` pre-approved, shows the output, and asks the user to approve a ready plan by replying "Yes, write guard's change to autoMode in [path].", the sentence that names the permission change the classifier's Self-Modification rule asks for; it runs `apply`, which its `allowed-tools` do not cover, only after that reply, so the write meets the session's permission mode.

Two hooks run outside a request (decisions 191 and 192). The `PermissionDenied` hook appends one line per classifier denial to `denials.jsonl` in the data directory: the time, the reason, which names the matched rule, the tool, the working directory, and the command cut at 300 characters or the file path, each part cut and with the common credential forms written as `[redacted]`; never the rest of the tool input or any output. The file keeps its newest 100 lines once it passes 256 KiB. It prints nothing and exits 0. `/guard denials` prints the record. The `SessionStart` hook at `startup` does nothing in a session no one attends, a `claude -p` session among them, which the host marks with `CLAUDE_CODE_SESSION_ATTENDED` `0` (decision 207); otherwise it reads the list and, with a repository listed, computes the state with the recorded remotes and no config check, and prints one `systemMessage` line only when the state is `stale`. The host's `PermissionDenied` input carries `tool_name`, `tool_input`, `tool_use_id` and `reason` beside the common fields, and its only output is `hookSpecificOutput.retry` (hooks reference).

## Versions, tags and release

Each plugin has its own version, starting at 0.1.0, in its manifest and its catalog entry. Tags are `<plugin>--v<version>`, made with `claude plugin tag`, which checks that manifest and catalog agree. Lint fails when a plugin directory changed since its latest tag without a version above it, and when `CHANGELOG.md` lacks `## <plugin> <version> - <date>` for a tagged version; an untagged bump needs no heading yet, so the release order is bump, heading, tag. There is no suite version and no lockstep; the marketplace `metadata.version` is the catalog's own and is raised whenever an entry changes. `main` is the release ref. `tools/release.mjs <plugin> <version>` sets the version in the manifest and the catalog entry (and the audit `plugin_version` literals), computing every edit before writing, keeping CRLF files CRLF, and running lint; tagging stays with `claude plugin tag`; the changelog heading is written by hand.

## Repository tooling

`tools/lint.mjs` has no dependencies and enforces the rules of requirement 219 with one message per rule. It reads an optional `LINT_DENY_TOKENS` environment variable, a comma-separated list, and fails on any tracked file containing one case-insensitively; CI never sets it, so the names stay outside the repository. `tests/lint/lint.test.mjs` copies the repository to a temporary directory, applies one mutation per case, and asserts the message. CI runs lint and tests on ubuntu, macOS and Windows with full history for the tag rule, the audit awk suites again under mawk, and `claude plugin validate --strict` on the marketplace and each plugin with a pinned Claude Code version.

`package.json` has one `test:<area>` script per test directory (`rules`, `loop`, `audit`, `primer`, `gate`, `guard`, `review`, `lint`, `release`) beside `test`; a commit runs the area scripts that cover what it touched, and the whole suite with lint runs once per pull request before its push and in CI (requirement 277). Lint's syntax checks run concurrently (requirement 278). A suite whose cases are independent runs them concurrently under one `describe`, as `tests/audit/sh.test.mjs` does; cases that share a fixture stay serial (decision 105). Process creation under Git for Windows costs about 200 ms per `sh` and 70 ms per `git`, so a suite is measured there before a lever is taken (acceptance item 44).

`tests/evals/<plugin>/<case>/` holds the eval cases of requirement 273; `npm run eval` runs them against the repository root with the host's eval command, locally and never in CI, and their results land in the ignored `tests/evals/results/`. The gate's one case in this suite grants no shell, so it runs where the others do; the runner refused a gate case that needs its scaffold and tool grants (decision 133), so acceptance items 47, 49 and 54 cover those runs by hand, against the seeded fixture repository that `tests/gate/fixture/build.mjs` writes.

## Security and permissions

The loop, the gate, the audit and the review run inside the user's permission mode and never widen it. The loop's and the gate's pre-approved tools are `date`, `sleep` and read-only `git` and `gh`, none a form requirement 356 bans, a grant that lasts the turn that invokes the skill (decisions 215 and 258); the gate's child sessions run under `--permission-mode default` with an allowlist of read-only tools and the repository's own checks, so a call outside it is denied and counted, never prompted. The audit's agents have no Edit or NotebookEdit and the read-only check detects any write. Guard widens the auto mode classifier only by the allow and environment entries of requirements 338 and 339, for repositories the user listed (the settings-read entry covers the configuration directory's `settings.json` as well as the listed repositories' `.claude/settings.json` and `.claude/settings.local.json`), and only after the user's reply names the change; it writes no permission rule and no entry that clears Self-Modification. Credentials in pasted ticket text are redacted before the record is written, and the audit never passes forge text through the model. The review never writes to the author's branch or the reviewed work tree and posts only what the user approved by name. It treats the pull request's head as untrusted: its child session loads no configuration from the head, and code from the head runs only after the user approved that by name. Primer's `local` profile writes only under the configuration directory and the store, and its staging check denies and never unstages. Nothing external names a model, an agent or a tool.

## Out of scope

A second model provider in any form; publishing pull requests on a non-GitHub host; a forge adapter for `work-items.jsonl`; generating the chat block from the output style; `claude plugin eval` in CI; a repair mode that reads earlier review comments, which the review reads only to report (requirement 376); the deferred audit helper scripts; a routine or GitHub Actions integration for the loop; plugin telemetry; a mod for the notices; a workflow for the loop's slices; a second host (requirement 276); for the gate, comments on GitLab and Azure DevOps, the `low`, `max` and `ultra` levels, reading earlier review comments or CI results, and editing a pull request body (requirement 320); for the review, any write to the author's branch and a forge adapter of its own (requirement 380); for primer, a transform that ports rules to another runtime and start-up checks the user defines (decision 298).

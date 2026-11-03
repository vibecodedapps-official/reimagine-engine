# Build plan: 0.1.0

Drafted 2026-10-14. requirements.md and architecture.md win over this plan. Requirements are cited as R1 to R333; the primer milestones M10 to M19 follow M9, and M20 to M63 follow them, each dated where it was added. Each milestone ends with its checks green on the implementer's machine; `npm test` runs from M1 on, `npm run lint` from M7 on, and the forbidden-name sweep (decision 10) runs before every commit from the first one. Pushes and pull requests follow the ask-first rules of the owner's instruction files; the handoff that starts the implementation says what is approved.

The implementation runs with an Opus orchestrator and Sonnet subagents. The orchestrator owns every design document, every commit, and every check; subagents write files from a brief that quotes the requirement and see nothing else.

| # | Milestone | Adds | Depends on |
|---|---|---|---|
| M1 | rules | `plugins/rules`, `tests/rules` | - |
| M2 | loop | `plugins/loop` with the record and `steps.json` | - |
| M3 | loop idempotency | second runs, foreign commits, resume | M2 |
| M4 | audit | `plugins/audit`, `tests/audit` | - |
| M5 | repo-docs | `plugins/repo-docs`, `tests/repo-docs`, the adopt fixture | - |
| M6 | catalog | `.claude-plugin/marketplace.json`, README install lines, the repository's own hub | M1 to M5 |
| M7 | lint | `tools/lint.mjs`, `tests/lint` | M6 |
| M8 | CI | `.github/workflows/ci.yml` | M7 |
| M9 | release | `tools/release.mjs`, `tests/release`, tags 0.1.0 | M8 |

M1, M2, M4 and M5 are independent and may proceed in parallel on branches; M3 follows M2.

## M1: rules

Work items:

1. `plugins/rules/.claude-plugin/plugin.json`, `LICENSE`, `README.md`. Commit: `feat(rules): add the plugin manifest and readme`.
2. `rules/core.md` with the two Working edits (R18 to R21) and `rules/windows.md`. Commit: `feat(rules): add the house rules text`.
3. `scripts/rules.mjs` with verbs `status`, `plan [--adopt] [--options]`, `apply`, `remove`, `decline`, `session-start` (R22 to R38, R41, R42). Commit: `feat(rules): add the house rules script`.
4. `tests/rules/rules.test.mjs` and `tests/rules/session-start.test.mjs`: one case per requirement, digests as literals (R18 to R42). Commit: `test(rules): cover the house rules script`.
5. `skills/rules/SKILL.md` with `disable-model-invocation: true`, the ask before apply, and the output style line (R39, R40). Commit: `feat(rules): add the /rules skill`.
6. `hooks/hooks.json` with the SessionStart hook (R41). Commit: `feat(rules): add the staleness notice hook`.
7. `output-styles/concise-plain.md` v4.5 and `chat/instructions.md` (R43, R44). Commit: `feat(rules): add the output style and chat block`.

Check:

- `npm test` passes on Windows and on one POSIX machine.
- A fresh profile (`CLAUDE_CONFIG_DIR` outside the repository) with `--plugin-dir plugins/rules`: `/rules` plans, asks, applies; the file is created with the block (acceptance item 2).
- A profile holding a hand copy of the rules: plan recommends adopt; adopt leaves the bytes outside the block unchanged and writes a backup (acceptance item 3).
- The notice line appears at startup after the shipped text changes (acceptance item 4).
- `rules:Concise Plain` is listed and selectable (acceptance item 5).

## M2: loop

Work items:

1. Manifest, `LICENSE`, `README.md`. Commit: `feat(loop): add the plugin manifest and readme`.
2. `skills/run/SKILL.md`: name `run`, description with the trigger phrases, allowed-tools, the reading block, approval scope, roles, budgets, rounds, terminal states, the `## Supporting files` section (R45 to R72, R94). Commit: `feat(loop): add the skill core`.
3. `steps/0-preflight.md` (R73 to R81, R52, R53) and `record.md` with the record location, files and `steps.json` schema (R82, R84, R85). Commit: `feat(loop): add preflight and the record`.
4. `steps/1-plan.md` (R97 to R103, R66), `risk.md` (R69, R70, R51). Commit: `feat(loop): add plan and review`.
5. `steps/4-build.md` (R104 to R114, R95). Commit: `feat(loop): add build, final review and checks`.
6. `steps/7-publish.md`, `pr-body.md`, `ci-watch.md`, `multi-repo.md`, `worktree.md` (R115 to R132). Commit: `feat(loop): add publish, ci watch, multi-repo and worktree`.
7. `report.md`, `handoff.md` (R133 to R141). Commit: `feat(loop): add report and handoff formats`.

Check:

- Every step file's last paragraph names the next read; the core is under the word cap that M7 will enforce (5,800 words).
- Prose invocation triggers the skill and the reading block prints before any tool call other than id resolution (acceptance item 7); "run the loop" reaches `/loop:run`, not the host's bundled `/loop` (acceptance item 25).
- A plan-only run on a throwaway repository writes `inputs.md`, `plan.md`, `run.md`, `steps.json`, `report.md` and leaves the tree clean (acceptance item 8).
- A full run on a throwaway GitHub repository with one ticket opens one pull request, comments on the ticket, and names no model, agent or tool in either (acceptance item 9).
- An ask-first rule in the profile's `CLAUDE.md` makes the publish step prompt; that is expected behavior (acceptance item 11).
- A dirty tree ends preflight `blocked` without stashing (acceptance item 12).

## M3: loop idempotency

Work items:

1. `record.md` additions: append rules, reuse rules, resume rules, the slug collision check (R86, R88, R92, R93, R96). Commit: `feat(loop): add resume rules to the record`.
2. Preflight additions: branch prediction, existing record detection, foreign commit listing, ticket done marks (R83, R87, R89). Commit: `feat(loop): read the branch state at preflight`.
3. Plan and publish additions: appended slices, body update versus comment, one comment per run (R86, R90, R91). Commit: `feat(loop): continue a record on a second run`.

Check (acceptance item 10, the milestone's acceptance):

- On a throwaway GitHub repository, run 1 with ticket A opens a pull request.
- Run 2 with ticket A: verifies checks, rewrites the report, commits nothing, posts nothing, ends `done`; `steps.json` shows run 2.
- Run 3 with tickets A and B: appends a slice, builds only B, updates the pull request body once, posts one comment, comments on B.
- A commit pushed to the branch by hand between runs appears in `inputs.md` as foreign and is included in the step 5 diff.
- Interrupt run 4 after step 2 (kill the session); run 5 resumes at step 3 after rechecking the tree.
- `git status --porcelain` is empty after every run.

## M4: audit

Work items:

1. Manifest, `LICENSE`, `README.md` (R5 on `jq`). Commit: `feat(audit): add the plugin manifest and readme`.
2. The nine scripts under `scripts/` with the embedded literals of R185 (R184, R185). Commit: `feat(audit): add the audit scripts`.
3. `tests/audit/*.sh`, `tests/audit/sh.test.mjs`, `tests/audit/lint.sh`, `tests/audit/fixture/**`, with every literal that depends on an embedded string produced by running `build.sh` once and pasting the observed value (R186, decision 11). Two commits: `test(audit): add the script suites and fixtures`, then `test(audit): set observed fixture literals`.
4. `skills/audit/SKILL.md`, `common.md`, `audit-evidence.md`, `handoff.md`, `live.md`, `report.md`, `work-items.md`, `fault-injection.md`, `resume.md` (R148 to R152, R162 to R174, R175 to R183, R187 to R189). Commit: `feat(audit): add the orchestrator and shared rules`.
5. `stages/1-orient.md` to `stages/9-act.md` with stage 6 rewritten around the fresh adversary and `second-opinion-request.md` (R153 to R161, R190 to R195). Commit: `feat(audit): add the nine stages`.
6. `agents/digester.md`, `mapper.md`, `auditor.md`, `adversary.md` (with the default second-opinion mode), `merger.md` (R150). Commit: `feat(audit): add the agents`.
7. `commands/run.md`, `resume.md`, `act.md`, `handoff.md` (R142, R196). Commit: `feat(audit): add the commands`.

Check:

- `npm test` passes on ubuntu, macOS and Windows; the awk suites pass under mawk.
- A low-tier headless run on the patterns fixture ends `reported` with stage 6 run by a `fable` adversary and every read-only check at exit 0 (acceptance item 14).
- A medium run on the ground-truth fixture reaches the expected counts; `/audit:act` commits one item (acceptance item 15).
- `/audit:resume --live` reruns stages 6 to 8 (acceptance item 16); `/audit:handoff --verdicts` applies matching lines (acceptance item 17).

## M5: repo-docs

Work items:

1. Manifest, `LICENSE`, `README.md`. Commit: `feat(repo-docs): add the plugin manifest and readme`.
2. `skills/repo-docs/SKILL.md`, `placement.md`, `spokes.md` (R197 to R206). Commit: `feat(repo-docs): add the skill`.
3. `hooks/drift.sh` and `hooks/hooks.json` (R207 to R211). Commit: `feat(repo-docs): add the drift hook`.
4. `tests/repo-docs/hook.test.mjs`: commit detection positives and negatives, missing path denies, cap overrun denies, recheck advice, adapter accepted, no hub quiet (R208 to R210). Commit: `test(repo-docs): cover the drift hook`.
5. `tests/repo-docs/fixture/messy/` builder: a repository with a long `CLAUDE.md` holding two scopes, a `docs/` file nothing points to, a nested `AGENTS.md`, an `@import`, and a README with agent rules (R204). Commit: `test(repo-docs): add the messy docs fixture`.

Check:

- `npm test` passes on all three operating systems.
- Bootstrap on an empty repository writes a hub under 60 lines (acceptance item 18).
- Adopt on the messy fixture produces the planned moves and rewrites in separate commits and changes nothing on a second run (acceptance item 19).
- The hook denies a commit whose hub names a missing path, allows it after the fix, and names a spoke to recheck when a covered file is staged (acceptance item 20).

## M6: catalog

Work items:

1. `.claude-plugin/marketplace.json` with four entries at `0.1.0-alpha.1` and the catalog's own `metadata.version` (R1, R14, decisions 32 and 58); M9 sets 0.1.0. Commit: `feat(catalog): add the catalog version`.
2. `README.md`: confirm the install, update and uninstall blocks match the catalog line for line and add whatever R219 requires. Commit only if something changed: `docs(readme): align install lines with the catalog`.
3. The repository's own `CLAUDE.md` hub, written with `/repo-docs` bootstrap (R16). Commit: `docs(repo): add the instruction hub`.

Check:

- `claude plugin validate --strict .` and each plugin pass.
- `/plugin marketplace add vibecodedapps-official/reimagine-engine` and `/plugin install <name>@reimagine-engine` work for each plugin alone (acceptance item 1).

## M7: lint

Work items:

1. `tools/lint.mjs` with every rule of R219 and the deny-token rule of R220. Commit: `feat(lint): add the repository rules`.
2. `tests/lint/lint.test.mjs`: a clean copy passes; one negative case per message. Commit: `test(lint): cover every rule`.

Check:

- `npm run lint` (the script exists in `package.json`) prints `lint: ok` with exit 0 on the tree; with `LINT_DENY_TOKENS` set to the implementer's list it still passes. The four `0.1.0-alpha.1` tags and their changelog headings exist, so the tag and changelog rules check them from the start.
- Each negative case fails with its message.

## M8: CI

Work items:

1. `.github/workflows/ci.yml`: test matrix with full history, the mawk job, the validate job with the pinned version (R222, decision 27). Commit: `ci: add lint, test, mawk and validate jobs`.
2. `.github/dependabot.yml` for actions. Commit: `ci: add dependabot for actions`.

Check:

- One green run on `main` across ubuntu, macOS and Windows (acceptance item 21).

## M9: release

Work items:

1. `tools/release.mjs` and `tests/release/release.test.mjs` (R221). Commit: `feat(release): add the version bump script`.
2. `CHANGELOG.md` headings `## rules 0.1.0`, `## loop 0.1.0`, `## audit 0.1.0`, `## repo-docs 0.1.0` with the date, written before the tags so lint passes right after tagging (R15). Commit: `docs(changelog): record 0.1.0`.
3. Tags `rules--v0.1.0`, `loop--v0.1.0`, `audit--v0.1.0`, `repo-docs--v0.1.0` with `claude plugin tag --push plugins/<name>` after the owner's approval (R14). No commit.
4. acceptance.md record entry for the release run (acceptance items 1 to 25).

Check:

- Lint passes after tagging; a one-line change under a plugin without a version bump fails the tag rule, and a bump to 0.1.1 passes with no 0.1.1 heading (acceptance item 22).

## Primer: M10 to M19

Added 2026-10-20. Requirements are cited as R1 to R268; the primer section is R237 to R268 and decisions 73 to 89 settle what the spikes changed. Each milestone ends with its checks green on the implementer's machine and its acceptance items recorded; lint runs with `LINT_DENY_TOKENS` set before every commit. The same orchestrator and subagent split as above. `main` is a release channel, so each milestone's push follows the owner's yes and takes the next prerelease version of any plugin it changes (decision 60).

| # | Milestone | Adds | Depends on |
|---|---|---|---|
| M10 | primer hook | `plugins/primer` manifest, `hooks/`, `tests/primer/hook.test.mjs`, catalog entry at `0.1.0-alpha.1`, lint names and shapes | - |
| M11 | shapes and placement | `skills/primer/shapes.md`, `placement.md`, the skill's frontmatter and mode selection | M10 |
| M12 | init | the `init` mode | M11 |
| M13 | adopt | the `adopt` mode, the messy fixture extended; this repository converted | M12 |
| M14 | maintain verify | the verify pass and `primer: no drift` | M13 |
| M15 | promote | the promote pass, the memory fixture, the stamp | M14 |
| M16 | propose | the propose pass and the session source | M15 |
| M17 | notice | `hooks/notice.sh` and its test | M15 |
| M18 | siblings | the audit source list, the loop brief line | M13 |
| M19 | catalog, retirement and release | README, `.claude/settings.json`, `repo-docs` deleted, primer 0.1.0, tags | M10 to M18 |

M18 may run beside M14 to M17. Nothing else runs in parallel: each milestone adds to `SKILL.md`, so two branches would conflict.

### M10: primer hook

Work items:

1. `plugins/primer/.claude-plugin/plugin.json` at `0.1.0-alpha.1`, `LICENSE`, `README.md` (install, requirements, a use section that says what each mode does, the migration line of R268). Commit: `feat(primer): add the plugin manifest and readme`.
2. `hooks/hooks.json` with the two hooks of R259 and `hooks/drift.sh` (R260 to R265): the commit-detection grammar, `cwd` and `-C` resolution, the hub lookup and the marker, the caps, the hub path check, the `paths` reader with its three forms, brace expansion and the `**/` prefix, `git ls-files` matching, the deny and advice forms. `hooks/notice.sh` is M17; until then `hooks.json` declares only the PreToolUse hook and lint's primer shape matches that. Commit: `feat(primer): add the drift hook`.
3. `tests/primer/hook.test.mjs`: the R260 positives and negatives; each R262 finding on a fixture repository with a hub, a nested `CLAUDE.md`, three rules (unscoped, block list, comma string) and a skill; the brace, slashless and `[` glob cases of decision 80 with literal file lists; the R263 advice for a rule, a skill and a nested file; the adapter and the direct `AGENTS.md` hub; no marker quiet; expected strings as literals. Commit: `test(primer): cover the drift hook`.
4. `tools/lint.mjs`: `primer` in the names, the two executables, the primer `hooks.json` shape beside the rules one, the primer description phrases (R219, R245); `tests/lint/lint.test.mjs` gains one negative case per new message. Commit: `feat(lint): know the primer plugin`.
5. Catalog entry for primer at `0.1.0-alpha.1`, `metadata.version` raised, README install, update and uninstall lines, `CHANGELOG.md` heading `## primer 0.1.0-alpha.1 - <date>` (R1, R14, R15, decision 87). Commit: `feat(catalog): publish primer at 0.1.0-alpha.1`.

Check:

- `npm test` and `npm run lint` with the deny tokens pass on Windows and on one POSIX machine; the hook suite passes under mawk.
- `claude plugin validate --strict` on the root and `plugins/primer`; `claude plugin tag --dry-run plugins/primer`.
- Acceptance item 27 on Windows; item 1 for primer from the local catalog, then from GitHub after the push.

### M11: shapes and placement

Work items:

1. `skills/primer/shapes.md`: one template per row of the architecture's shape table, the caps, the counting rule, the marker, the `AGENTS.md` rule and the `CLAUDE.local.md` case (R238 to R240, R243, R244). Commit: `feat(primer): add the shapes`.
2. `skills/primer/placement.md`: the eleven items with the tasks test and one example each, the personal-content report (R241, R252). Commit: `feat(primer): add the placement rule`.
3. `skills/primer/SKILL.md`: name, the description with the four phrases first, `allowed-tools` for the read-only git and file reads every mode needs, the mode selection and the first-line mode statement, the write boundary, the commit rules, the proposal format shared by skills and memory, and a stub per mode that says what the mode will do and stops (R245 to R247). Commit: `feat(primer): add the skill core`.
4. `tests/primer/skill.test.mjs`: the frontmatter, the phrases, the cap of R240 on the skill's own files, every file `SKILL.md` names existing. Commit: `test(primer): cover the skill files`.

Check:

- `npm test`, lint; the skill answers to `/primer` and `/primer:primer` and prints its mode line on a throwaway repository with no instruction file (acceptance item 28, the mode line only).

### M12: init

Work items:

1. The `init` mode in `SKILL.md` (R248): what it reads, the hub it writes uncommitted, the first rules and skills it proposes, the `/init` sentence. Commit: `feat(primer): add the init mode`.

Check:

- Acceptance item 28 on a throwaway repository with code, a `CONTRIBUTING.md` procedure and a release script: a hub under 60 lines with the marker and the three parts, a proposal for the procedure and the script, nothing written without a yes.

### M13: adopt

Work items:

1. `tests/primer/fixture/messy/build.sh`: the repo-docs messy fixture's content plus a repo-docs hub with a `## Spokes` index whose pointers cover a file pattern, a task and a directory, a procedure in `CONTRIBUTING.md`, an `@notes/local.md` import of an untracked file, a `.claude/CLAUDE.md`, and a README with agent rules, deterministic as the audit fixtures are; `tests/primer/fixture.test.mjs` checks the build. Commit: `test(primer): add the messy docs fixture`.
2. The `adopt` mode in `SKILL.md` (R249): inventory, the refactor conditions, what pins a file (decision 53), the destinations, the kept-statement check, moves before rewrites, the migration from a `## Spokes` hub, the `CLAUDE.local.md` adapter proposal. Commit: `feat(primer): add the adopt mode`.
3. Adopt on this repository, as the milestone's acceptance: the run's own commits (the hub with the marker, no index, the five design documents in backticks in the opening sentence; whatever rules or skills the plan proposes and the owner accepts), then `chore(repo): enable primer for sessions here` switching `.claude/settings.json` and the README development paragraph to `primer@reimagine-engine` (R16, R268 in part). The repo-docs hook stays installed on the owner's machine and prints nothing once no index remains.

Check:

- Acceptance item 29 on the messy fixture, twice; item 30 on this repository, with the drift hook denying a commit after a path in the opening paragraph is broken.

### M14: maintain verify

Work items:

1. The `maintain` mode's verify pass in `SKILL.md` (R250, R251): the hook's findings, commands against manifests and workflows, statements against the files they cover, skill steps' commands and files, lost procedures, duplicates, oversized skills, the `/doctor prompt-audit` sentence, `primer: no drift`. Commit: `feat(primer): add the verify pass`.

Check:

- Acceptance item 31: on the adopted messy fixture, remove a command from `package.json` and rename a file a rule describes; the plan lists both; after the fix a second run prints `primer: no drift`.

### M15: promote

Work items:

1. `tests/primer/fixture/memory/build.sh`: a memory directory in the layout of decision 83 with one note per type, the index written with the em dash as an octal escape, and a stamp older than two of the notes; `tests/primer/fixture.test.mjs` checks it. Commit: `test(primer): add the memory fixture`.
2. The promote pass in `SKILL.md` (R256, R257): the directory and key, the candidates by type, the proposal lines, the separate deletion question, the stamp. Commit: `feat(primer): add the promote pass`.

Check:

- Acceptance item 32 on a scratch profile whose `projects/<key>/memory/` is the fixture: the `feedback` note becomes a constraint, the undated `project` note a rule, the `reference` a sentence in the hub, the `user` note is not offered; the deletion is asked per note and a no leaves the file.

### M16: propose

Work items:

1. The propose pass in `SKILL.md` (R253 to R255): the four sources, the candidate display, what a written skill holds, what leaves the instruction file, the never list, the session source raised once at the end of a task. Commit: `feat(primer): add the propose pass`.

Check:

- Acceptance item 33: on the adopted messy fixture the `CONTRIBUTING.md` procedure is a candidate and the release script is not, since the adopted `release` skill runs it; a yes writes `.claude/skills/<name>/SKILL.md` under 150 lines with a description and `CONTRIBUTING.md` unchanged (decision 91); in a new session, "turn this into a skill" after a pasted checklist invokes the skill for that item alone.

### M17: notice

Work items:

1. `hooks/notice.sh` (R258) and its entry in `hooks.json`; lint's primer hook shape becomes the two-hook form (R259). Commit: `feat(primer): add the memory notice`.
2. `tests/primer/notice.test.mjs` on the memory fixture: the count with and without a stamp, `user` and `reference` notes ignored, no marker quiet, the worktree key of decision 83, nothing written. Commit: `test(primer): cover the memory notice`.

Check:

- Acceptance item 34, headless and then interactive: the line appears after a new note and disappears after a promote pass.

### M18: siblings

Work items:

1. Audit: `.claude/rules/` and `.claude/skills/` in the default source list of stage 1, stage 9 and `common.md` (R267); audit `0.1.3`. Commit: `feat(audit): rank project rules and skills as sources of truth`.
2. Loop: the brief line of R267 in `steps/4-build.md`; loop `0.1.3`. Commit: `feat(loop): bind a loaded rule in the implementer brief`.
3. CHANGELOG headings for both, tags after the push.

Check:

- `npm test`, lint; acceptance item 35, a low-tier audit run whose stage 1 source list names the two directories.

### M19: catalog, retirement and release

Work items:

1. Delete `plugins/repo-docs/` and `tests/repo-docs/`; remove the catalog entry and the README install, use, update and uninstall lines for repo-docs; lint's names drop `repo-docs` and the changelog rule keeps accepting its headings; the README line of R268. Commit: `refactor(catalog): retire repo-docs`.
2. `node tools/release.mjs primer 0.1.0`, the README status line, `CHANGELOG.md` heading `## primer 0.1.0 - <date>`. Commit: `release(primer): 0.1.0`.
3. Tags `primer--v0.1.0` after the owner's approval; the acceptance record.

Check:

- Lint passes after tagging; `claude plugin validate --strict` on the root and each remaining plugin; acceptance item 1 for primer from GitHub, item 21, item 22 at the new tag, item 36.

## Host alignment: M20 to M23

Added 2026-10-22. Requirements R270 to R276, decisions 94 to 103, acceptance items 37 to 43; the spikes are recorded under "pre-implementation spikes for host alignment" in acceptance.md. The same orchestrator and subagent split as above; each milestone ends with its checks green and its acceptance items recorded, lint runs with `LINT_DENY_TOKENS` set before every commit, and each push follows the owner's yes at the next version of any plugin it changes. These milestones are built after M25 and M24.

| # | Milestone | Adds | Depends on |
|---|---|---|---|
| M20 | review file | `REVIEW.md` in the audit's source lists and the loop's review request; the fixture; audit and loop versions | - |
| M21 | evals | the eval cases under `tests/evals/`, `npm run eval`, the release-order line in README | - |
| M22 | measurement | the startup-cost item and the auto-mode items run and recorded; the preamble sentence | - |
| M23 | workflow engine | the script, the stage 4 engine switch, resume, lint rules, item 15 through the engine; audit version | M20; the gate of R270, not met on 2026-10-22 (decision 103) |

M20, M21 and M22 may run in parallel, since none touches `plugins/primer/` or another's files; every edit to `.claude-plugin/marketplace.json`, `CHANGELOG.md`, `tools/lint.mjs` and `README.md` is serialized. M23 runs alone, after M20, since both edit the audit's stage files, and only when its gate is met: the spikes of 2026-10-22 assessed it and found it not met (decision 103), so M23 is not built in this pass and waits for the reopening decision 103 names.

### M20: review file

Work items:

1. Audit: `REVIEW.md` at the root and in the parent directories of each changed file, read at the base commit, in the default source list of stage 1, stage 9 and `common.md`; stage 1 records the copies read and their shas; the report's severity labels, the `<n> findings skipped by REVIEW.md: <rule>` line, the "always check" pass-one check and the "require evidence" gate (R271). `tests/audit/fixture/build.sh` gains a `review` mode, or extends `patterns`, with a root `REVIEW.md` that caps nits, excludes one path and requires a `file:line` citation for one class, and a second bundle whose `REVIEW.md` exists only in its head; `tests/audit/lint.sh` learns the new list entry. Audit takes its next version. Commit: `feat(audit): read the base commit's review file as a source of truth`.
2. Loop: the one sentence of R272 in `steps/4-build.md`; loop takes its next version. Commit: `feat(loop): name the review file in the final review request`.
3. After the push: the CHANGELOG headings for both, commit `docs(changelog): add the audit and loop headings` naming the versions, pushed, then `claude plugin tag --push` for each; the acceptance record, commit `docs(acceptance): record the review file milestone`.

Check:

- `npm run test:audit` and `npm run test:loop` on each commit; `npm test` and lint with the deny tokens before the push.
- Acceptance item 37 on both bundles, headless, with the permission mode recorded.

### M21: evals

Work items:

1. `tests/evals/loop/prose-trigger/`, `tests/evals/loop/bundled-loop/`, `tests/evals/primer/mode-line/`, each `prompt.md` with `plugins`, `max_turns` and `allowed_tools` and its `graders/` (R273, decision 100), in the form of the spike's two cases; `tests/evals/results/` in `.gitignore` beside the ignore list of R224, whose text gains the entry. Commit: `test(evals): add the trigger and mode-line cases`.
2. `package.json`: `"eval": "claude plugin eval . --eval-dir tests/evals --runs 2 --no-publish"`; README's development section names it and its needs (the host's eval command, a login, git 2.31 or later), and the release order runs it after the changelog heading and before the tag. Commit: `chore(repo): add the eval script and its release step`.

Check:

- Lint and `npm run test:lint`; acceptance item 38: every case at 2 of 2 with the plugin, the forced failure reported, the scores recorded with the host version and the permission mode, commit `docs(acceptance): record the evals milestone`.

### M22: measurement

Work items:

1. acceptance.md: nothing to build; item 39 run and recorded as the baseline of R274, item 40 to 42 run under `--permission-mode auto` with every refusal verbatim, and the records naming the permission mode (R275). A difference from the manual-mode runs becomes a decision. Commit: `docs(acceptance): record the startup cost and the auto-mode pass`.

Check:

- Items 39 to 42 recorded; nothing under `plugins/` changed.

### M23: workflow engine

Built only when the gate of R270 is met and recorded. Work items:

1. `plugins/audit/workflows/passes.js` (R270): the literal `meta`, three `phase()` calls, `agent()` with `schema` for every unit, the agent counts from the baseline record; stage 4's engine selection and the `engine` field with its reason, stages 5 and 6 reading the script's return from the run directory; `stages.json` gains the session id, run id, script path and phase reached, and `resume.md` relaunches with `resumeFromRunId` (R161). Decisions 21 and 24 gain a sentence each on what the workflow path makes unnecessary. Audit takes its next version. Commit: `feat(audit): run passes one, two and the second opinion as a workflow`.
2. `tools/lint.mjs`: the workflow rule of R219 and R6's script list; `tests/lint/lint.test.mjs` gains one negative case per message. Commit: `feat(lint): check the audit workflow script`.
3. After the push: the CHANGELOG heading, commit `docs(changelog): add the audit <version> heading`, pushed, then the tag; the acceptance record, commit `docs(acceptance): record the workflow engine milestone`.

Check:

- `npm test` and lint; acceptance item 43: item 15's counts through the engine at tokens at or under the baseline, both recorded; the stopped run relaunched; `disableWorkflows` forcing `engine: prompt`; the prompt-path result on the same fixture unchanged.

## House-rule edit eight: M24

Added 2026-10-22. Requirement R269, decision 93. Built after M25 and before M20 to M23. Depends on nothing; touches `plugins/rules/` and `tests/rules/` only.

| # | Milestone | Adds | Depends on |
|---|---|---|---|
| M24 | house-rule edit eight | the Working item and the chat block line, the test assertion and the moved digest literals, rules 0.1.5 | - |

### M24: house-rule edit eight

Work items:

1. The item of R269 in `plugins/rules/rules/core.md` under Working, after "A review is read-only unless I ask for changes.", wrapped like its neighbors; the one line under Content in the fenced block of `plugins/rules/chat/instructions.md`, which is not listed among the block's deliberate differences, since it does not differ from the item. `tests/rules/rules.test.mjs`: an `items.includes` assertion for R269 beside those of R19 to R236, and the shipped digest literals for `core` and `core,windows`, the rule count and any adopt line numbers, moved by running the script once and pasting the observed values (decision 11), in the same commit. Commit: `feat(rules): judge findings, do not count them`, body in the form of the 2026-10-18 commit `feat(rules): raise the request and its frame, and never route around a denial`.
2. `node tools/release.mjs rules 0.1.5`. Commit: `release(rules): 0.1.5`.
3. After the push: the `## rules 0.1.5 - <date>` heading in `CHANGELOG.md`, commit `docs(changelog): add the rules 0.1.5 heading`, pushed, then `claude plugin tag --push plugins/rules`; the acceptance record, commit `docs(acceptance): record the house-rule edit eight milestone`.

Check:

- `npm run test:rules` on each commit; `npm test` and lint with the deny tokens before the push.
- Acceptance items 4 and 22 rerun: the staleness notice on a profile holding the 0.1.4 block, headless, with the display of the notice recorded as not seen; the tag rule at `rules--v0.1.5`; each recorded with date, machine, versions and permission mode.

## Test performance: M25

Added 2026-10-22. Requirements R277 to R279, decisions 104 to 108, acceptance item 44. M25 is built first, before M24 and M20 to M23, so that every later milestone pays less for its checks. The suite's coverage does not change: no test is weakened, skipped or deleted, every script keeps its test (R6), fixture literals stay observed (decision 11) and everything still runs on ubuntu, macOS and Windows (R17); CI's matrix is unchanged. Depends on nothing; touches `package.json`, `CLAUDE.md`, `tests/` and `plugins/audit/scripts/revert-tests.sh`.

| # | Milestone | Adds | Depends on |
|---|---|---|---|
| M25 | test performance | the area scripts and the policy line, concurrency in the lint and primer hook suites, the `revert-tests.sh` tick, the after-timings | - |

### M25: test performance

Work items, each its own commit, in this order:

1. `tests/lint/lint.test.mjs`: the cases move under one `describe` with `concurrency` set from `availableParallelism()` as `tests/audit/sh.test.mjs` does, with the `before` and `after` hooks inside it; each case keeps its own copy of the repository from `caseDir()` and the `seq` counter stays synchronous, so nothing is shared. `tests/primer/hook.test.mjs`: the groups whose cases each build their own repository with `make()` get `concurrency`; the "files the command itself stages" group shares one fixture through `before` and stays serial. Commit: `test(perf): run independent cases concurrently`.
2. `plugins/audit/scripts/revert-tests.sh`: `REVERT_TESTS_TICK` (R279), read beside the three variables it already reads, with the poll loops at one tick, the `wait` interval at two and the watchdog's TERM-to-KILL grace at ten; a value is validated as the others are. `tests/audit/revert-tests.sh` exports a low tick and keeps every `sleep 60` fixture the watchdog ends; the suite proves the default is unchanged by one case that runs with the variable unset. Audit takes its next version in the same commit. Commit: `feat(audit): read the poll tick from the environment`.
3. `package.json`: the six area scripts of R277; `CLAUDE.md`'s `## Commands`: one bullet per area script, or one bullet naming the pattern, and the policy line, under the 60-line cap (R238). Commit: `chore(repo): add the area test scripts`.
4. The after-timings: each test file alone with `node --test --test-reporter=spec`, then `npm test` and `npm run lint` whole, on the machine of the baseline, recorded under acceptance item 44 beside the baseline, with the permission mode line; a missed target is recorded by how much and which lever fell short.

Lever 4 of the pass, lint's concurrent syntax check, is already in the code (decision 107), so R278 is a review item and no commit.

Check:

- `npm test` and lint with the deny tokens pass on Windows and on one POSIX machine; the audit sh suites pass under mawk with the tick set and unset.
- Acceptance item 44: a full `npm test` at half the baseline or better and every area script under 30 seconds except `test:audit`, whose target is the baseline of `revert-tests.sh` alone divided by the tick ratio.
- After the push, the `## audit <version> - <date>` heading for the version item 2 set, commit `docs(changelog): add the audit <version> heading`, pushed, then `claude plugin tag --push plugins/audit`; the after-timings of item 4 and the record, commit `docs(acceptance): record the test performance milestone`.

## House-rule edit nine and Concise Plain 4.6: M26

Added 2026-10-24. Requirement R280 and the amended R43, decision 111. Built after M20 to M25. Depends on nothing; touches `plugins/rules/`, `tests/rules/`, `tools/lint.mjs` and `tests/lint/` only.

| # | Milestone | Adds | Depends on |
|---|---|---|---|
| M26 | house-rule edit nine and Concise Plain 4.6 | the Done item, the test assertion and the moved digest literals; the four style changes in the style and the chat block, and the lint literal at 4.6; rules 0.1.6 | - |

### M26: house-rule edit nine and Concise Plain 4.6

Work items, in this order:

1. The design documents: R280 in the form of R269 and R43 at version 4.6 in `docs/requirements.md`, decision 111 in `docs/decisions.md`, and this section. Commit: `docs(design): specify house-rule edit nine and concise plain 4.6`.
2. The item of R280 in `plugins/rules/rules/core.md` at the end of Done, wrapped like its neighbors. `tests/rules/rules.test.mjs`: an `items.includes` assertion for R280 beside that of R269, and the shipped digest literals for `core` and `core,windows`, the rule count and any adopt line numbers, moved by running the script once and pasting the observed values (decision 11), in the same commit. Commit: `feat(rules): report an edit from the diff, not the plan`.
3. `plugins/rules/output-styles/concise-plain.md`: the four changes of decision 111, the description ending in `v4.6.`; `plugins/rules/chat/instructions.md`: the same four changes inside the fenced block and the header line at `Concise Plain v4.6`, the list of deliberate differences unchanged; `tools/lint.mjs` and `tests/lint/lint.test.mjs`: the `v4.5` literals become `v4.6`. Commit: `feat(rules): concise plain 4.6, drafts for the reader and words as they were put`.
4. No version bump: the rules manifest and its catalog entry are already 0.1.6, above `rules--v0.1.5`, from the rename commit (decision 110); `git tag --list 'rules--v*'` and lint confirm it.
5. After the push: the `## rules 0.1.6 - <date>` heading in `CHANGELOG.md`, one bullet per change, the rename included, commit `docs(changelog): add the rules 0.1.6 heading`, pushed, then `claude plugin tag --push plugins/rules`; the acceptance record, commit `docs(acceptance): record the house-rule edit nine milestone`.

Check:

- `npm run test:rules` and `npm run test:lint` on each commit of items 2 and 3, each run as its own command with its exit code read; `npm test` and lint with the deny tokens before the push.
- Acceptance items 4, 5 and 22 rerun: the staleness notice on a profile holding the 0.1.5 block; the style listed as `rules:Concise Plain`; the tag rule at `rules--v0.1.6`; each recorded with date, machine, versions and permission mode.

## Scratch made or changed: M47

Added 2026-10-28. The amended R321 and decision 142. Built after M46. Depends on nothing; touches `plugins/rules/` and `tests/rules/` only, with the catalog, the changelog and the design documents.

| # | Milestone | Adds | Depends on |
|---|---|---|---|
| M47 | scratch made or changed | house-rule edit sixteen; rules 0.1.12 | M46 |

### M47: scratch made or changed

Work items, in this order:

1. The design documents: the amended R321 in `docs/requirements.md`, decision 142 in `docs/decisions.md`, and this section. Commit: `docs(design): specify house-rule edit sixteen`.
2. `node tools/release.mjs rules 0.1.12`, with the catalog `metadata.version` raised by one and the version literals of `tests/rules/rules.test.mjs` moved to 0.1.12. Commit: `release(rules): 0.1.12`.
3. `plugins/rules/rules/core.md`: the scratch item of decision 142; `tests/rules/rules.test.mjs`: the R321 literal moved, with the shipped digest literals moved by running the script once and pasting the observed values (decision 11); the rule count does not move. Commit: `feat(rules): record a scratch file as made or changed, offer only what was made`.
4. The `## rules 0.1.12 - <date>` heading in `CHANGELOG.md`, committed before the pull request; after the merge, `claude plugin tag --push plugins/rules` after a yes, and the acceptance record.

Check:

- `npm run test:rules` on the commits of items 2 and 3, on the branch head, each run as its own command with its exit code read, the R321 assertion failing on the text before; `npm test` and lint with the deny tokens before the push.
- Acceptance items 4, 5 and 22 rerun at the tag.

## Published text and leftovers: M46

Added 2026-10-27. R321, the amended R11, R43 and R118, and decision 141. Built after M45. Depends on nothing; touches `plugins/rules/`, `plugins/loop/`, `tests/rules/`, `tests/loop/`, `tests/lint/` and `tools/lint.mjs`, with the catalog, the changelog and the design documents.

| # | Milestone | Adds | Depends on |
|---|---|---|---|
| M46 | published text and leftovers | house-rule edit fifteen, Concise Plain 4.8 and the chat block; the loop's pass and level ban; rules 0.1.11, loop 0.1.9 | M45 |

### M46: published text and leftovers

Work items, in this order:

1. The design documents: R321, the amended R11, R43 and R118 in `docs/requirements.md`, decision 141 in `docs/decisions.md`, and this section. Commit: `docs(design): specify house-rule edit fifteen and concise plain 4.8`.
2. `node tools/release.mjs rules 0.1.11` and `node tools/release.mjs loop 0.1.9`, with the catalog `metadata.version` raised by one and the version literals of `tests/rules/rules.test.mjs` moved to 0.1.11. Commit: `release(rules, loop): rules 0.1.11 and loop 0.1.9`.
3. `plugins/rules/rules/core.md`: the three items of decision 141; `plugins/rules/output-styles/concise-plain.md`: the Leave out categories, the defect-report line and the Drafts scan, at 4.8; `plugins/rules/chat/instructions.md`: the same three lines and the version note; `tools/lint.mjs` and `tests/lint/lint.test.mjs`: the R43 literal at 4.8; `tests/rules/rules.test.mjs`: an R321 assertion for the three items, with the shipped digest literals and the adopt and import line-number literals moved by running the script once and pasting the observed values (decision 11); the rule count does not move. Commit: `feat(rules): keep process detail out of published text, list leftovers as they are made`.
4. `plugins/loop/skills/run/pr-body.md` and `steps/7-publish.md`: the ban extends to a review pass and its level; `tests/loop/publish.test.mjs`: the R11 assertion moved to the new line. Commit: `fix(loop): name no review pass or level in published text`.
5. After the push: the `## rules 0.1.11 - <date>` and `## loop 0.1.9 - <date>` headings in `CHANGELOG.md`, committed and pushed, then `claude plugin tag --push plugins/rules` and `claude plugin tag --push plugins/loop` after a yes; the acceptance record.

Check:

- `npm run test:rules`, `npm run test:loop` and `npm run test:lint` on the commits of items 2 to 4, on the branch head, each run as its own command with its exit code read, the R321 assertion failing on the text before; `npm test` and lint with the deny tokens before the push.
- Acceptance items 4, 5 and 22 rerun at the tags.

## The CI poll's wait: M45

Added 2026-10-27. The amended R126 and decision 140. Built after M44. Depends on nothing; touches `plugins/loop/` and `tests/loop/` only, with the catalog, the changelog and the design documents.

| # | Milestone | Adds | Depends on |
|---|---|---|---|
| M45 | the CI poll's wait | the background `sleep 30` in the loop's CI poll and its test; loop 0.1.8 | M44 |

### M45: the CI poll's wait

Work items, in this order:

1. The design documents: the amended R126 in `docs/requirements.md`, decision 140 in `docs/decisions.md`, and this section. Commit: `docs(design): wait for the ci poll in the background`.
2. `node tools/release.mjs loop 0.1.8`, with the catalog `metadata.version` raised by one. Commit: `release(loop): 0.1.8`.
3. `plugins/loop/skills/run/ci-watch.md`: the wait of section 4 runs `sleep 30` with `run_in_background: true` and names the host's block; `tests/loop/publish.test.mjs`: an R126 assertion for it. Commit: `fix(loop): wait for the ci poll in the background`.
4. Acceptance item 9 at loop 0.1.8 on a throwaway repository with one issue, headless, the loop loaded by `--plugin-dir`, and the record. Its event stream shows how each poll waited. Commit: `docs(acceptance): record the ci poll milestone`.
5. After the push: the `## loop 0.1.8 - <date>` heading in `CHANGELOG.md`, commit `docs(changelog): add the loop 0.1.8 heading`, pushed, then `claude plugin tag --push plugins/loop` after a yes. Items 21 and 22 at the tag are recorded after it.

Check:

- `npm run test:loop` on the commits of items 2 and 3, each run as its own command with its exit code read, the new assertion failing on the text before; `npm test` and lint with the deny tokens before the push.
- Acceptance item 9; items 21 and 22 at the tag.

## Chain acceptance: M44

Added 2026-10-27. Decision 139, the verdicts on the chain backlog. Built after M43. Depends on nothing; touches `docs/` only. No plugin changes, so no release and no tag.

| # | Milestone | Adds | Depends on |
|---|---|---|---|
| M44 | chain acceptance | decision 139; item 46's commands publish, and both its runs rerun; item 51 at gate 0.1.2 | M43 |

### M44: chain acceptance

Work items, in this order:

1. The design documents: decision 139 in `docs/decisions.md`, item 46's commands without "do not publish" in `docs/acceptance.md`, and this section. Commit: `docs(design): plan the chain acceptance runs`.
2. Item 46, both runs, on a throwaway GitHub repository with two issues and `.reimagine.json` `checks`, the loop at 0.1.7 loaded by `--plugin-dir`, headless, one scratch profile per run holding a copy of the login, no `CLAUDE.md`, and `codeReviewLastEffort` `medium` written (decision 119). `run.md`, `audit-manifest.json` and the report are read back against every expectation of the item.
3. Item 51 at gate 0.1.2: `tests/gate/fixture/build.mjs converges` pushed as item 47's setup, with pull request 1, the gate loaded by `--plugin-dir`, a profile of the same shape; the two timed trivial runs come first, then item 47's command, with each review's `duration_ms` and cost and the remembered level after.
4. The record of both, with each item's run history. Commit: `docs(acceptance): record the chain acceptance milestone`.

Check:

- No commit touches `plugins/` or `tests/`, so no area suite runs on a commit; `npm test` and lint with the deny tokens run before the push, each as its own command with its exit code read.
- `git diff --quiet loop--v0.1.7 -- plugins/loop` and `git diff --quiet gate--v0.1.2 -- plugins/gate` before the runs, so the runs speak for the tagged releases.
- Item 9 is not rerun: it predates the `reviews` key, and its run of 2026-10-26 stands. Item 47's split run and items 48, 49, 50, 52, 53 and 54 are not rerun: no plugin or fixture changed since the record of 2026-10-27.

## The gate fixture's shape: M43

Added 2026-10-27. Decision 138. Built after M42. Depends on nothing; touches `tests/gate/` only, with the acceptance record. No plugin changes, so no release and no tag.

| # | Milestone | Adds | Depends on |
|---|---|---|---|
| M43 | the gate fixture's shape | a fixture diff of eight or more files outside `split` and a check that visits every slot; items 47, 48, 49, 50 and 54 rerun | M42 |

### M43: the gate fixture's shape

Work items, in this order:

1. `tests/gate/fixture/build.mjs`: the six added paths and the index loop of decision 138; `tests/gate/fixture.test.mjs`: the new shas and numstat literals. Commit: `test(gate): widen the fixture diff and check every slot`.
2. The design documents: decision 138 and this section. Commit: `docs(design): plan the gate fixture's shape`.
3. Acceptance items 47 (the converges run), 48, 49 (its two runs), 50 and 54, one run each on the new fixture, and the record. Commit: `docs(acceptance): record the gate fixture milestone`.

Check:

- `npm run test:gate` on item 1's commit, with the old literals failing against the new builder; `npm test` and lint with the deny tokens before the push.
- The split run of item 47 is not rerun: its diff changes only in the shared percentile, and its item checks only the split. Items 52 and 53 are not rerun: their rerun rules name stage 1, the engine and the mode, and none changed.

## Backlog issue 1: M42

Added 2026-10-27. The amended R222 and decision 137, with the semver and helper items of issue 1. Built after M41. Depends on nothing; touches `.github/workflows/ci.yml`, `tools/`, `tests/lint/` and `tests/release/` only. No plugin changes, so no release and no tag.

| # | Milestone | Adds | Depends on |
|---|---|---|---|
| M42 | backlog issue 1 | CI cancels a run in progress only on a pull request; one semver module for lint and release, with the prerelease identifier rule; their tests | M41 |

### M42: backlog issue 1

Work items, in this order:

1. The design documents: the amended R222 in `docs/requirements.md`, decision 137 in `docs/decisions.md`, `tools/semver.mjs` in the tree of `docs/architecture.md`, and this section. Commit: `docs(design): plan the fixes of issue 1`.
2. `tools/semver.mjs`: the semver pattern with each prerelease identifier `0`, a number without a leading zero, or alphanumerics holding a letter or hyphen; the comparison; and the `plugin_version` literal pattern. `tools/lint.mjs` and `tools/release.mjs` import them in place of their own copies. Tests: lint fails a manifest version `0.1.1-01`, and release refuses `0.1.1-01`. Commit: `fix(tools): share one semver rule between lint and release`.
3. `.github/workflows/ci.yml`: `cancel-in-progress: ${{ github.event_name == 'pull_request' }}`; `tests/lint/ci.test.mjs`: an assertion that the line is there. Commit: `fix(ci): keep a run on main when a later push lands`.
4. Issue 1's item 4 names the retired `repo-docs` and is closed as not applicable. The soundness check in `release.mjs`'s `edited()`, which item 3 calls unable to fail, stays as a guard that costs nothing. The pull request closes issue 1.

Check:

- `npm run test:lint` and `npm run test:release` on the commits of items 2 and 3, each run as its own command with its exit code read; `npm test` and lint with the deny tokens before the push.
- The pull request's own CI run shows that the expression parses. The behavior on `main` shows on the first merge after it: the merge commit's run is not cancelled by a push that follows.

## The host's attribution trailer: M41

Added 2026-10-26. The amended R11 and decision 136. Built after M40. Depends on nothing; touches `plugins/gate/`, `plugins/loop/`, `tests/gate/` and `tests/loop/` only, with the catalog and the changelog.

| # | Milestone | Adds | Depends on |
|---|---|---|---|
| M41 | the host's attribution trailer | the trailer line in the gate's Step 2, the loop's Step 7 and its pull request text, and their tests; gate 0.1.2 and loop 0.1.7 | M40 |

### M41: the host's attribution trailer

The line, in each of the three places: "Type no attribution trailer of your own, and keep one the host's attribution setting adds, even where it names a model or tool."

Work items, in this order:

1. The design documents: the amended R11 in `docs/requirements.md`, decision 136 in `docs/decisions.md`, the attribution line in `docs/architecture.md`, and this section. Commit: `docs(design): keep the host's attribution trailer`.
2. `node tools/release.mjs gate 0.1.2` and `node tools/release.mjs loop 0.1.7`, each with the catalog `metadata.version` raised by one. Commits: `release(gate): 0.1.2` and `release(loop): 0.1.7`.
3. `plugins/gate/skills/gate/steps/2-fix.md`: the line in place of "Type no attribution trailer." in The commit, item 1; `tests/gate/skill.test.mjs`: the R11 assertion holds the new line. Commit: `fix(gate): keep the host's attribution trailer`.
4. `plugins/loop/skills/run/steps/7-publish.md` and `plugins/loop/skills/run/pr-body.md`: the line in place of "Type no attribution trailer."; `tests/loop/publish.test.mjs`: an assertion for each. Commit: `fix(loop): keep the host's attribution trailer`.
5. Acceptance item 47 once at gate 0.1.2 on a profile that sets no attribution, and the record. Items 9 and 40 rerun when publish changes; each is a full loop run, so they run after the owner's yes and are otherwise recorded as not run with that reason. Commit: `docs(acceptance): record the attribution milestone`.
6. After the push: the `## gate 0.1.2 - <date>` and `## loop 0.1.7 - <date>` headings in `CHANGELOG.md`, commit `docs(changelog): add the gate 0.1.2 and loop 0.1.7 headings`, pushed, then `claude plugin tag --push plugins/gate` and `claude plugin tag --push plugins/loop` after a yes. Items 21 and 22 at the tags are recorded after them.

Check:

- `npm run test:gate` and `npm run test:loop` on each commit of items 2 to 4, each run as its own command with its exit code read; `npm test` and lint with the deny tokens before the push.
- Acceptance item 47; items 21 and 22 at the tags.

## The gate comment's home directory: M40

Added 2026-10-26. The amended R314, decision 135, and R11 with decision 8 for the gate's commit step. Built after M39. Depends on nothing; touches `plugins/gate/` and `tests/gate/` only, with the catalog and the changelog.

| # | Milestone | Adds | Depends on |
|---|---|---|---|
| M40 | the gate comment's home directory | the `~` rule for quoted text in Step 4, no attribution trailer in Step 2's commit, and their tests; gate 0.1.1 | M39 |

### M40: the gate comment's home directory

Work items, in this order:

1. The design documents: the amended R314 in `docs/requirements.md`, decision 135 in `docs/decisions.md`, the comment line in `docs/architecture.md`, and this section. Commit: `docs(design): specify the gate comment's home directory`.
2. `node tools/release.mjs gate 0.1.1`, and the catalog `metadata.version` raised by one. Commit: `release(gate): 0.1.1`.
3. `plugins/gate/skills/gate/steps/4-publish.md`: the rule of decision 135 in 4.4, item 3; `tests/gate/skill.test.mjs`: an assertion that it is there. Commit: `fix(gate): write the home directory as ~ in quoted comment text`.
4. `plugins/gate/skills/gate/steps/2-fix.md`: "Type no attribution trailer" in The commit, item 1, as the loop's publish step has it (R11, decision 8): the step did not say it, and of six runs on profiles that set no attribution, three left the host's trailer out, citing the gate's commit rule, and three kept it, two of them citing the session's attribution instruction; `tests/gate/skill.test.mjs`: an assertion that it is there. Commit: `fix(gate): type no attribution trailer in the fix commit`.
5. Acceptance item 51, run with the owner, and the acceptance record. Commit: `docs(acceptance): record the gate comment milestone`.
6. After the push: the `## gate 0.1.1 - <date>` heading in `CHANGELOG.md`, commit `docs(changelog): add the gate 0.1.1 heading`, pushed, then `claude plugin tag --push plugins/gate` after a yes. Items 21 and 22 at the tag are recorded with the next change, as loop 0.1.6's were.

Check:

- `npm run test:gate` on each commit of items 2 to 4, each run as its own command with its exit code read; `npm test` and lint with the deny tokens before the push.
- Acceptance item 51; items 21 and 22 at the tag. Item 50 is not rerun: its template is unchanged, and no run can be made to quote a home path.

## The gate plugin and the loop's step 5: M34 to M39

Added 2026-10-25. Requirements R285 to R320 and the amended R1, R6, R62, R63, R65, R66, R72, R106, R109, R110, R111, R113, R120, R127, R134, R135, R145, R219, R224, R272, R273 and R277, with R70 retired; decisions 118 to 134; acceptance items 46 to 54. Built after M33. M34 touches `plugins/loop/`, `tests/loop/` and the README and releases loop 0.1.6; M35 to M39 add `plugins/gate/`, `tests/gate/` with its evals, the catalog entry, lint's lists and rules, `package.json`, `.gitignore` and the hub, and release gate 0.1.0. The audit does not move (decision 129). Each commit runs the area scripts that cover what it touched, each as its own command with its exit code read; `npm test` and lint with the deny tokens run once per milestone before its push. Every shipped text names the activity, never a model, agent or tool, in anything a pull request or ticket reader sees.

| # | Milestone | Adds | Depends on |
|---|---|---|---|
| M34 | loop step 5 one pass | the one-pass step 5 with its triage, the level cap, the `reviews` key, the `Gate:` report line; loop 0.1.6 | - |
| M35 | gate scaffold and findings.mjs | `plugins/gate/` with manifest, skill core, README and LICENSE; `scripts/findings.mjs` and its suite; lint, catalog, hub and `test:gate` | - |
| M36 | next.mjs | `scripts/next.mjs` and its suite: the level rules, the caps, the `medium` stop | M35 |
| M37 | passes | the step files for preflight, the pass, the fix round, the next level and resume; the record files | M36 |
| M38 | outputs | the comment, the manifest `gate` key, the report, the terminal states, "no fixes", the stand-in | M37 |
| M39 | evals, acceptance and release | `tests/gate/evals/` with three cases and its fixture builder; items 46 to 54 run; gate 0.1.0 | M34, M38 |

M34 and M35 touch no common file but the README, the catalog and the changelog, which the first to merge carries, and may proceed in either order; M39 needs both.

### M34: loop step 5 one pass

Work items, in this order, each test written first and seen failing against the untouched text:

1. `node tools/release.mjs loop 0.1.6`, and the catalog's `metadata.version` raised by one by hand, since the script leaves it alone. Commit: `release(loop): 0.1.6`.
2. Roles and level (R62, R63, R65, R66, R285): the roles table and the roles list of `SKILL.md` (the plan reviewer reviews the plan only; the final reviewer is `code-review` for every run with the `opus` stand-in once; the tools list says SendMessage continues an implementer only; the Supporting files line for `risk.md` names the floor alone); `risk.md` loses its higher-risk section and maps the effort in force to the skill's level with the `xhigh` cap, "max" giving `xhigh` there and `high` with no effort word; `steps/1-plan.md`'s plan-time judgment records the floor and the level, not a role, and its Reviewer request paragraph says Step 5 sends the request to the `opus` stand-in only, its `REVIEW.md` sentence (R272) with it; `multi-repo.md` and `worktree.md` describe the stand-in without the higher-risk condition or the SendMessage continuation; the README the same. `tests/loop/*.test.mjs`: the cap sentence, the "max" mapping, no "higher-risk" in any shipped loop file, and no "SendMessage across rounds". Commit: `feat(loop): review every run with code-review at a capped level`.
3. Step 5 (R72, R106, R108 to R111, R113, R127): `steps/4-build.md` Step 5 as 5.1 integrate, 5.2 one pass, 5.3 triage into fix, defer and reject with a reason each, 5.4 the fix bucket through the owning implementers after a snapshot and the orchestrator's read of the fix diff, 5.5 record; Step 4.5 judges the floor alone; Step 6's failure path fixes through the implementer and reruns; the repair cycle of `steps/7-publish.md` item 5 is one pass with no higher-risk judgment; `SKILL.md`'s Budgets and rounds loses the third-round sentence and gives the repair cycle one pass; `record.md`'s `run.md` lines record the pass, its level and the buckets; `report.md`'s Risk section reads floor trigger, step 5 level, stand-in, swaps. Tests: the step headings, the bucket names, no "round" under Step 5 in `steps/4-build.md` or `SKILL.md`. Commit: `feat(loop): make the final review one pass with three-bucket triage`.
4. Manifest and report (R120, R134, R286): `handoff.md`'s manifest shape gains `reviews`; `report.md`'s header gains the `Gate:` line and its `Audit:` rule changes; the README gains the manifest block, which it did not carry before. Tests: the manifest literal in `handoff.md` equals the README's; the header lines. Commit: `feat(loop): add the reviews key and suggest the gate`.
5. After the push: the `## loop 0.1.6 - <date>` heading in `CHANGELOG.md`, one bullet per change, commit `docs(changelog): add the loop 0.1.6 heading`, pushed, then `claude plugin tag --push plugins/loop` after a yes; the acceptance record, commit `docs(acceptance): record the loop step 5 milestone`.

Check:

- `npm run test:loop` and `npm run test:lint` on each commit of items 2 to 4; the `SKILL.md` core stays under 5,800 words; `npm test` and lint with the deny tokens before the push.
- Acceptance item 46, and items 21 and 22 at the tag.

### M35: gate scaffold and findings.mjs

Work items, in this order:

1. The scaffold (R1, R2, R4, R9, R14, R288, R289, R291, R293, R294, R313, R318): `plugins/gate/.claude-plugin/plugin.json` at `0.1.0-alpha.1` with the repository URL and no `userConfig` or `dependencies`; `LICENSE` with the holder line; `README.md` with install, use, the configuration block and the record; `skills/gate/SKILL.md` with frontmatter (`name: gate`, the description of the architecture, `allowed-tools` pre-approving `date` and the read-only `git` and `gh` forms the loop pre-approves) and the core sections: reading the request, approval scope, roles, levels and caps, states, record, and a `## Supporting files` section. In the same commit: `tools/lint.mjs` `NAMES` gains `gate` and a gate frontmatter rule (name `gate`, a description naming "reimagine gate", `allowed-tools` within the pre-approved forms, R219); `tests/lint/lint.test.mjs` one negative case per new message, and its two expected messages that list the plugin names updated; `.claude-plugin/marketplace.json` gains the entry at `0.1.0-alpha.1` and `metadata.version` is raised by one; `.gitignore` gains `tests/gate/evals/results/` (R224); the root `README.md` install and uninstall lines and the status line; `CLAUDE.md`'s first paragraph says five plugins and names `gate`; `package.json` `test:gate`. Commit: `feat(gate): scaffold the plugin with its skill core`.
2. `scripts/findings.mjs` (R302, R306, R307) and `tests/gate/findings.test.mjs` with fixtures under `tests/gate/fixture/`: the saved spike outputs of decision 118 with their paths made relative (a bare array; a scope note, the array and notes after it; two group outputs sharing one finding; a result with no array; `is_error` true), a stand-in reply as text, the normalization cases including the three wordings of decision 126, a regression against a ledger with a `fixed` entry, a carried reject against a `rejected` entry, and each exit code with its message. In the same commit `tools/lint.mjs` `EXECUTABLES` gains the script and the skill's `## Supporting files` names it, so lint's named-script rule holds on every commit. Commit: `feat(gate): parse review output into the ledger with findings.mjs`.

Check:

- `npm run test:gate` and `npm run test:lint` on each commit; `claude plugin validate --strict plugins/gate` and the marketplace; `npm test` and lint with the deny tokens before the push.
- Acceptance item 1 for the gate from the local catalog.

### M36: next.mjs

Work items:

1. `scripts/next.mjs` (R298, R301, R303, R311) and `tests/gate/next.test.mjs`, one case per rule with the literal level or verdict: pass 1 at `xhigh` with a fix bucket gives `high`; a fix round that changed an exported signature, a schema or migration, a file outside the diff, or more than a quarter of the diff's files gives `xhigh` once and `high` the second time; an empty fix bucket with nothing new rejected gives `pass`, or `pass-with-deferred` when any pass deferred; two `high` passes each with an empty fix bucket and a new rejection give `medium`; after a `medium` pass the stop is `pass`, `pass-with-deferred` or `unconverged` by its fix bucket, before any `xhigh` re-review; `max-passes` reached returns the rule's level marked `capped`; carried rejections count as nothing; a malformed `passes.json` exits 1 naming the key; a recorded level outside `medium`, `high` and `xhigh` exits 1. In the same commit `tools/lint.mjs` `EXECUTABLES` gains the script and the skill names it. Commit: `feat(gate): decide the next pass level with next.mjs`.

Check:

- `npm run test:gate` and `npm run test:lint`; the suite runs under 30 seconds on each platform.

### M37: passes

Work items, in this order, each with a text test in `tests/gate/skill.test.mjs`:

1. `steps/0-preflight.md` (R290 to R295, R309, R310): the target resolution for a pull request, several and a manifest; the base and merge-base; the explicit refspec fetch and the checkout; the clean tree; the instruction files and the permission statement; the record directory and the exclude; the reading block printed before any other tool call. Test: the block's four headings and the `git rev-parse --git-path info/exclude` form. Commit: `feat(gate): resolve targets and print the reading block`.
2. `steps/1-pass.md` (R296 to R299, R305 to R308): the line count and the split by top-level path; the child session command with every flag and the allowlist as one literal, `CLAUDECODE` unset, stdin from `/dev/null`, `run_in_background` and the wait; the saved output; `findings.mjs`; the triage with its three buckets and reasons written to `passes.json` first; the stand-in and when it is chosen. Test: the command literal, the allowlist words, the bucket names, the sentence that nothing is edited while a review runs. Commit: `feat(gate): run a pass as a child session and triage its findings`.
3. `steps/2-fix.md` (R300, R295): implementers per disjoint file group, the snapshots, the restore rule, the checks under their budget with the three-fix cap, the commit in the repository's convention staged by name, the remote-head check and the push. Test: the snapshot file names, the `git ls-remote` comparison, no `git add -A`. Commit: `feat(gate): fix, check, commit and push a pass`.
4. `steps/3-next.md` and `record.md` (R301, R303, R311, R312): `next.mjs` and its rule names, the caps and the `unconverged` ending with open findings, the resume rules by head and merge-base, the record files and the `passes.json` shape as one literal equal to the architecture's. Test: the shape literal, the resume sentences. Commit: `feat(gate): choose the next level and resume a record`.

Check:

- `npm run test:gate` and `npm run test:lint` on each commit; every step file ends by naming the next read and `## Supporting files` names each one.

### M38: outputs

Work items, in this order:

1. `steps/4-publish.md` and `report.md` (R314 to R317, R304): the comment template and its deny list of words that name a model, agent or tool; the manifest `gate` key keyed by `repo` and the minimal manifest; the report header and sections; the terminal states; "no fixes" as one pass with its verdict rule. Tests: the template names none of the deny words; the manifest literal; the header lines. Commit: `feat(gate): post the comment and write the manifest and report`.
2. `README.md` of the gate: the use lines, the configuration block byte-identical to the skill's, the record and the states. Test: the block equality. Commit: `docs(gate): describe the run in the readme`.

Check:

- `npm run test:gate` and `npm run test:lint`; `npm test` and lint with the deny tokens before the push. The acceptance items wait for M39's builder.

### M39: evals, acceptance and release

Work items, in this order:

1. `tests/gate/fixture/build.mjs` (R319): writes a throwaway repository with a base branch, a feature branch holding a seeded off-by-one in a new function with a test that passes only because of it, a `.reimagine.json` with `checks`, and a bare `origin` remote holding both branches with its HEAD on the base; by argument, the variants `converges` (the seeded bug alone), `defers` (a duplicated helper beside it), `cap` (`max-passes` 1), `carried` (a guard a caller provides, drawing a false positive, for item 48) and `split` (a generated second top-level path over 1500 changed lines beside the bug, for item 47's split run). Commit: `test(gate): add the seeded fixture builder`.
2. `tests/gate/evals/<case>/prompt.md`, `graders/*.md` and the scaffold script for the three cases of R319, each asserting the verdict and the levels in order through a `regex` grader over the trace; `package.json` gains `eval:gate`. The `converges` case runs first, alone: when the runner's sandbox lets its child session commit and push to the scaffold's remote, the three cases ship and `npm run eval:gate` is run with its scores recorded; when it does not, the cases are dropped, decision 133 records the refusal, and items 47, 49 and 54 stand for them. Commit: `test(gate): add the eval cases`.
3. Items 46 to 54 run and recorded; `node tools/release.mjs gate 0.1.0`, the catalog `metadata.version` raised by one, the README status line. Commit: `release(gate): 0.1.0`.
4. After the push: the `## gate 0.1.0 - <date>` heading in `CHANGELOG.md`, commit `docs(changelog): add the gate 0.1.0 heading`, pushed, then `claude plugin tag --push plugins/gate` after a yes; the acceptance record, commit `docs(acceptance): record the gate release`.

Check:

- `npm run eval:gate` at 2 of 2 per case with the plugin, when the cases ship; `npm test` and lint with the deny tokens before the push; items 1, 21, 22, 38 and 39 at the tag.

## House-rule edit fourteen: M33

Added 2026-10-25. The amended R20, decision 117. Built after M31 and M32. Depends on nothing; touches `plugins/rules/` and `tests/rules/` only.

| # | Milestone | Adds | Depends on |
|---|---|---|---|
| M33 | house-rule edit fourteen | the shortened report-once item, the test assertion and the moved digest literals; rules 0.1.10 | - |

### M33: house-rule edit fourteen

Work items, in this order:

1. The design documents: the amended R20 in `docs/requirements.md`, decision 117 in `docs/decisions.md`, the quoted item in `docs/architecture.md`, and this section. Commit: `docs(design): specify house-rule edit fourteen`.
2. `node tools/release.mjs rules 0.1.10`, and the version literals of `tests/rules/rules.test.mjs` to 0.1.10 in the same commit. Commit: `release(rules): 0.1.10`.
3. `plugins/rules/rules/core.md`: the Working item of decision 117. `tests/rules/rules.test.mjs`: the R20 assertion moved to the new text with an assertion that the dropped clause is absent, and the shipped digest literals for `core` and `core,windows` moved by running the script once and pasting the observed values (decision 11); the rule count does not move, and the adopt and import line-number literals move up by one with the shorter block. Commit: `feat(rules): report once, without the progress-notes clause`.
4. After the push: the `## rules 0.1.10 - <date>` heading in `CHANGELOG.md`, commit `docs(changelog): add the rules 0.1.10 heading`, pushed, then `claude plugin tag --push plugins/rules`; the acceptance record, commit `docs(acceptance): record the house-rule edit fourteen milestone`.

Check:

- `npm run test:rules` on each commit of items 2 and 3, each run as its own command with its exit code read; `npm test` and lint with the deny tokens before the push.
- Acceptance items 4 and 22 rerun: the staleness notice on a profile holding the 0.1.9 block; the tag rule at `rules--v0.1.10`.

## House-rule edit twelve: M31

Added 2026-10-25. The amended R232, decision 115. Built after M30. Depends on nothing; touches `plugins/rules/` and `tests/rules/` only.

| # | Milestone | Adds | Depends on |
|---|---|---|---|
| M31 | house-rule edit twelve | the reworded Code item, the test assertion and the moved digest literals and digest probe; rules 0.1.9 | - |

### M31: house-rule edit twelve

Work items, in this order; M32 below ships in the same pull request and release:

1. The design documents: the amended R232 in `docs/requirements.md`, decision 115 in `docs/decisions.md`, and this section. Commit: `docs(design): specify house-rule edit twelve`.
2. `node tools/release.mjs rules 0.1.9`, and the version literals of `tests/rules/rules.test.mjs` to 0.1.9 in the same commit. Commit: `release(rules): 0.1.9`.
3. `plugins/rules/rules/core.md`: the Code item of decision 115. `tests/rules/rules.test.mjs`: the R232 assertion moved to the new text, the digest probe that matches the item's first words, and the shipped digest literals for `core` and `core,windows` moved by running the script once and pasting the observed values (decision 11); the rule count and adopt line numbers do not move. Commit: `feat(rules): ask for the simplest change, as one instruction with three qualities`.
4. After the push: the `## rules 0.1.9 - <date>` heading in `CHANGELOG.md`, commit `docs(changelog): add the rules 0.1.9 heading`, pushed, then `claude plugin tag --push plugins/rules`; the acceptance record, commit `docs(acceptance): record the house-rule edit twelve milestone`.

Check:

- `npm run test:rules` on each commit of items 2 and 3, each run as its own command with its exit code read; `npm test` and lint with the deny tokens before the push.
- Acceptance items 4 and 22 rerun: the staleness notice on a profile holding the 0.1.8 block; the tag rule at `rules--v0.1.9`.

## House-rule edit thirteen: M32

Added 2026-10-25. The amended R234, decision 116. Built with M31, same branch, release and pull request; touches `plugins/rules/` and `tests/rules/` only.

| # | Milestone | Adds | Depends on |
|---|---|---|---|
| M32 | house-rule edit thirteen | the reworded wrong-request item, the test assertion and the moved digest literals | M31 |

### M32: house-rule edit thirteen

Work items, in this order:

1. The design documents: the amended R234 in `docs/requirements.md`, decision 116 in `docs/decisions.md`, and this section. Commit: `docs(design): specify house-rule edit thirteen`.
2. `plugins/rules/rules/core.md`: the Working item of decision 116. `tests/rules/rules.test.mjs`: the R234 assertion moved to the new text and the shipped digest literals moved by running the script once and pasting the observed values (decision 11). No version bump: 0.1.9 is above `rules--v0.1.8` and untagged. Commit: `feat(rules): say a wrong request first, then do the alternative`.
3. The push, heading, tag and acceptance record are M31's item 4.

Check:

- `npm run test:rules` on the commit of item 2; `npm test` and lint with the deny tokens before the push, with M31.

## House-rule edit eleven: M30

Added 2026-10-25. The amended R232 and the new R284, decision 114. Built after M29. Depends on nothing; touches `plugins/rules/` and `tests/rules/` only.

| # | Milestone | Adds | Depends on |
|---|---|---|---|
| M30 | house-rule edit eleven | the sentence in the Code item and the word in the Done item, the test assertions and the moved digest literals; rules 0.1.8 | - |

### M30: house-rule edit eleven

Work items, in this order:

1. The design documents: the amended R232 and the new R284 in `docs/requirements.md`, decision 114 in `docs/decisions.md`, and this section. Commit: `docs(design): specify house-rule edit eleven`.
2. `node tools/release.mjs rules 0.1.8`, and the version literals of `tests/rules/rules.test.mjs` to 0.1.8 in the same commit. Commit: `release(rules): 0.1.8`.
3. `plugins/rules/rules/core.md`: the two edits of decision 114. `tests/rules/rules.test.mjs`: the R232 assertion moved to the new text, an `items.includes` assertion for R284, and the shipped digest literals for `core` and `core,windows` moved by running the script once and pasting the observed values (decision 11); the rule count and adopt line numbers do not move. Commit: `feat(rules): follow the code over a stale instruction file, and never delete a test to pass`.
4. After the push: the `## rules 0.1.8 - <date>` heading in `CHANGELOG.md`, commit `docs(changelog): add the rules 0.1.8 heading`, pushed, then `claude plugin tag --push plugins/rules`; the acceptance record, commit `docs(acceptance): record the house-rule edit eleven milestone`.

Check:

- `npm run test:rules` on each commit of items 2 and 3, each run as its own command with its exit code read; `npm test` and lint with the deny tokens before the push.
- Acceptance items 4 and 22 rerun: the staleness notice on a profile holding the 0.1.7 block; the tag rule at `rules--v0.1.8`.

## House-rule edit ten and Concise Plain 4.7: M29

Added 2026-10-24. The amended R232, R233, R236, R269 and R43, the retired R235 and R280, decision 113. Built after M26 to M28. Depends on nothing; touches `plugins/rules/`, `tests/rules/`, `tools/lint.mjs` and `tests/lint/` only.

| # | Milestone | Adds | Depends on |
|---|---|---|---|
| M29 | house-rule edit ten and Concise Plain 4.7 | the five trimmed items and the two dropped ones, the test assertions and the moved digest literals and rule count; the style sentence, the chat block lines and the lint literal at 4.7; rules 0.1.7 | - |

### M29: house-rule edit ten and Concise Plain 4.7

Work items, in this order:

1. The design documents: the amended and retired rows in `docs/requirements.md`, decision 113 in `docs/decisions.md`, and this section. Commit: `docs(design): specify house-rule edit ten and concise plain 4.7`.
2. `node tools/release.mjs rules 0.1.7`, and the version literals of `tests/rules/rules.test.mjs` to 0.1.7 in the same commit, so the rules tests pass at every commit. Commit: `release(rules): 0.1.7`.
3. `plugins/rules/rules/core.md`: the edits of decision 113. `tests/rules/rules.test.mjs`: the `items.includes` assertions moved to the new texts, an absence assertion for each dropped item and sentence, and the shipped digest literals for `core` and `core,windows`, the rule count and the adopt line numbers, moved by running the script once and pasting the observed values (decision 11), in the same commit. Commit: `feat(rules): keep the principles, drop the sentences with no failure behind them`.
4. `plugins/rules/output-styles/concise-plain.md`: the Drafts sentence of decision 113, the description ending in `v4.7.`; `plugins/rules/chat/instructions.md`: the findings line and the Drafts line inside the fenced block and the header line at `Concise Plain v4.7`, the list of deliberate differences unchanged; `tools/lint.mjs` and `tests/lint/lint.test.mjs`: the `v4.6` literals become `v4.7`. Commit: `feat(rules): concise plain 4.7, name the source instead of restating it`.
5. After the push: the `## rules 0.1.7 - <date>` heading in `CHANGELOG.md`, one bullet per change, commit `docs(changelog): add the rules 0.1.7 heading`, pushed, then `claude plugin tag --push plugins/rules`; the acceptance record, commit `docs(acceptance): record the house-rule edit ten milestone`.

Check:

- `npm run test:rules` and `npm run test:lint` on each commit of items 2 to 4, each run as its own command with its exit code read; `npm test` and lint with the deny tokens before the push.
- Acceptance items 4, 5 and 22 rerun: the staleness notice on a profile holding the 0.1.6 block; the style listed as `rules:Concise Plain`; the tag rule at `rules--v0.1.7`; each recorded with date, machine, versions and permission mode.

## Field feedback 2026-10-23: M27 and M28

Added 2026-10-24. Requirements R281 to R283 and the amended R6, R50, R56, R76, R77, R81, R88, R116, R125, R139, R159, R184 and R193; decision 112; acceptance item 45. Eight findings from field runs of loop 0.1.4 and audit 0.1.6, verified against the shipped texts on 2026-10-24; one was dropped and the record helper of decision 31 stays deferred (decision 112). Two sub-milestones under one heading, since the plugins release separately: M27 touches `plugins/loop/` and `tests/loop/`, M28 `plugins/audit/`, `tests/audit/` and `tools/lint.mjs`. Neither bumps a version: the manifests already carry loop 0.1.5 and audit 0.1.7 from the rename commit (decision 110), above `loop--v0.1.4` and `audit--v0.1.6`. Each commit runs the area scripts that cover what it touched, each as its own command with its exit code read; `npm test` and lint with the deny tokens run once before the push.

| # | Milestone | Adds | Depends on |
|---|---|---|---|
| M27 | loop field feedback | the "primary <path>" and "base <branch>" phrases, the `base` key, the decided-by mapping | - |
| M28 | audit field feedback | `scripts/run-copies.sh` with its suite, the stage 7 slice-first mode choice, the stage 8 body sentence, the two act texts, the decided-by table | - |

M27 and M28 touch no common file but the design documents, which the first commit carries, and may proceed in either order.

### M27: loop field feedback

Work items, in this order, each test written first and seen failing against the untouched text:

1. The "primary <path>" phrase (R281, R50, R77): the grammar line in `SKILL.md` and `README.md`, the Scope line of the reading block, a "Primary checkout" item at the head of Step 0 in `steps/0-preflight.md` that resolves `<checkout>` and ends `blocked` on a path that is not a toplevel or a linked worktree, the `git -C <checkout>` and `cd <checkout> && ...` forms of `worktree.md` for every primary command, the permission statement's prompt line, Step 0.2.3's third way around, Step 0.2.5's switch in `<checkout>`, Step 0.3's exception limited to a main checkout, and the record location of `record.md` and `SKILL.md` for a named linked worktree. `tests/loop/preflight.test.mjs`: text assertions for the phrase, the stop, the third way around and the record location. Commit: `feat(loop): name the primary checkout with primary <path>`.
2. The "base <branch>" phrase and the `base` key (R282, R76, R81, R88, R116, R56, R125): the grammar line in `SKILL.md` and `README.md`, the Mode line, Step 0.2.1 resolving `<b>` from the phrase, the key, then the default, with the fetch failure ending `blocked`, the pull request base check of 0.2.7, `run.md` at 0.5, the `base` key in 0.1.2 and in the byte-identical configuration block of `SKILL.md` and `README.md`, `<default>` to `<base>` in `steps/7-publish.md`, `steps/4-build.md` 3.7.2, `risk.md`, `record.md` and `ci-watch.md`, and the primary-only sentence in `multi-repo.md`. `tests/loop/config.test.mjs`: the key list gains `base`; `tests/loop/preflight.test.mjs`: the resolution order and the Mode line. Commit: `feat(loop): take the base branch from the request or the configuration`.
3. The decided-by mapping (R139): `handoff.md`'s `run` line reads `role: orchestrator`. `tests/loop/handoff.test.mjs`: the table of R139 is present and identical to the audit's. Commit: `fix(loop): map a run decision to a role in the handoff`.

Check:

- `npm run test:loop` and `npm run test:lint` on each commit; the `SKILL.md` core stays under 5,800 words.
- Acceptance item 45, item 8's plan-only run rerun headless on a throwaway repository with a linked worktree and a branch other than the default: once with "primary <linked worktree path>" from the main checkout, once with "base <branch>"; the Scope and Mode lines, the record's location and `run.md`'s base recorded.

### M28: audit field feedback

Work items, in this order:

1. `scripts/run-copies.sh` (R283, R6, R184) and `tests/audit/run-copies.sh`: a relocated copy of the script under a temporary root with a small `skills/audit/common.md` and `audit-evidence.md`, so the whole output is a literal and the `$0`-relative lookup is exercised, each bad argument with its exit code and message, and the shipped files, whose header lines are literals and whose body is compared byte for byte with its source; registered in `tests/audit/sh.test.mjs` beside its siblings and run under mawk where one is installed. `tools/lint.mjs`'s executable list gains it. Step 10d of `stages/1-orient.md` writes `questions.md` and runs the script. Commit: `feat(audit): copy the run's common files with a script`.
2. Stage 8 step 6: the body is written with the Write tool; only the revision line and the assembly of `report.md` run by shell. Commit: `fix(audit): write the report body with the write tool`.
3. Stage 7 step 5 (R159): assign the ids and cut the slices first, with the commands of step 7, then choose split mode when a slice passes the threshold or the sum passes three times it, else remove the slices; step 7 keeps the part cutting; step 12's entry gains the largest slice; `fault-injection.md`'s `ledger_split_bytes` bounds a slice. Commit: `feat(audit): split the merge on the largest slice`.
4. Stage 9 step 10 and `SKILL.md`'s Supporting files: the live line reads the blocks in `report.md`, whose grammar is in the skill's `live.md`, and `live.md` is a skill document, not a run file. Commit: `fix(audit): name report.md as the home of the live blocks`.
5. Stage 9 step 4 (R193): the first yes covers the path for the invocation; a later exit-0 rewrite is restored and logged with its new hash; the path is never staged with a group; a fix that touches it stops; the close names the regenerated paths once. Commit: `feat(audit): approve a regenerated path once per act`.
6. `handoff.md` (R139): the decided-by table after the format block, cited from rule 12 and from "Writing a handoff" step 7. `tests/audit/handoff.test.mjs`: the table is present and identical to the loop's. Commit: `fix(audit): carry the loop's decided-by mapping in the handoff`.

Check:

- `npm run test:audit` and `npm run test:lint` on each commit; the sh suites once under mawk where one is installed, else recorded as not run.
- Acceptance item 14 rerun, headless, which exercises `run-copies.sh` and the stage 8 sentence; its stage 7 entry records the byte total, the largest slice and the threshold.

### After the push

The `## loop 0.1.5 - <date>` and `## audit 0.1.7 - <date>` headings in `CHANGELOG.md`, one bullet per change, the rename bullet of decision 110 in each and the audit's "A run started on 0.1.6 resumes from stage 1" bullet, commit `docs(changelog): add the loop 0.1.5 and audit 0.1.7 headings`, pushed; then `claude plugin tag --push plugins/loop` and `claude plugin tag --push plugins/audit`, each after a yes; items 21 and 22 at the two tags; the acceptance record under a "field feedback 2026-10-23" heading, commit `docs(acceptance): record the field feedback milestones`.

## Field feedback 2026-10-28: M48 and M49

Added 2026-10-29. Requirement R322 and the amended R6, R145, R149, R160, R161, R162, R165, R178, R179, R180, R184, R194, R289, R291, R292, R297, R300, R302, R305, R306, R311, R317 and R318; decisions 143 to 148; acceptance items 55 to 59. Field feedback of 2026-10-28 on gate 0.1.2 and audit 0.1.7, each finding verified on 2026-10-29 against the shipped texts on `main`, two of them by a run as well (decisions 143 and 146). Two sub-milestones under one heading, since the plugins release separately: M48 touches `plugins/gate/` and `tests/gate/`, M49 `plugins/audit/`, `tests/audit/`, `tools/lint.mjs` and `docs/architecture.md`. One release commit moves gate to 0.1.3 and audit to 0.1.8, above `gate--v0.1.2` and `audit--v0.1.7`, with the catalog's `metadata.version` at 0.1.13. Each work item is one finding, fixed as its decision says; each test is written first and seen failing against the untouched text, and each commit runs the area scripts that cover what it touched, each as its own command with its exit code read; `npm test` and lint with the deny tokens run once before the push.

| # | Milestone | Adds | Depends on |
|---|---|---|---|
| M48 | gate field feedback | the Scripts line, the checks' three sources and the reviewers' notes, a bundle's base, the depth split, the deferred carry and the candidates; gate 0.1.3 | - |
| M49 | audit field feedback | the spread of claims that name no file, the `local-branch` lines, the kept scope outputs on resume, the restated hard rules, act's demonstration, `scripts/report.sh` with its suite; audit 0.1.8 | - |

M48 and M49 touch no common file but the design documents, the catalog and the changelog, which the first, second and last commits carry.

### M48: gate field feedback

Work items, in this order, after the design commit `docs(design): specify the field feedback of 2026-10-28` and the release commit `release(gate, audit): gate 0.1.3 and audit 0.1.8`:

1. The scripts path (R291, R318): the reading block gains a fifth line, `Scripts: <absolute path of the plugin's scripts directory>`, resolved with no tool call from the skill's base directory the Skill tool prints, two levels above it, then `scripts`; `SKILL.md`, Reading the request, says in its own words that `${CLAUDE_PLUGIN_ROOT}` is not a shell variable and that every Bash command writes the resolved path; Steps 1.5 and 3.3 type the path from the Scripts line; Step 0 names the Scripts line with the block's other headings. `tests/gate/skill.test.mjs`: the heads list gains `Scripts: `, no step file holds `${CLAUDE_PLUGIN_ROOT}`, and `SKILL.md` holds the sentence. Commit: `fix(gate): resolve the scripts path once and print it in the reading block`.
2. The checks' sources and the reviewers' notes (R289, R300, R305, R311, R317, R145, decision 144): the phrase `checks <command>[; <command>]` in the grammar lists of `SKILL.md` and the README, running to the next comma that another recognized phrase follows; the bundle key `checks`; the order request, bundle, `.reimagine.json`, feeding Step 2's Checks, the `Bash(<check>*)` entries of 1.3, the permission statement of 0.3 and the report's Checks section, which names the source; each `reviews[]` entry gains `"notes"`, written in 1.5.3, printed per review in the report's Log; the `passes.json` literal of `record.md` and of `docs/architecture.md` gains the key on its `reviews` line, so both keep 17 lines. `skill.test.mjs`: the phrase in both grammar lists, the order sentence, the `notes` key in `record.md`'s literal and the Log sentence. Commit: `feat(gate): take the checks from the request, the manifest bundle or the configuration`.
3. A manifest bundle's base (R292): the order request, bundle `base`, `.reimagine.json` `base`, the remote's default, in `SKILL.md` Reading the request and Step 0.6.1. `skill.test.mjs`: the order sentence in both files. Commit: `fix(gate): read a manifest bundle's base before the configuration`.
4. The depth split (R297, decision 145): Step 1.2.3 and 1.2.4 take the depth rule and the slugs, with a worked example of a diff under one folder splitting at depth 2; `record.md`'s slug text, `SKILL.md`'s Roles row and `split` sentence and the README's two sentences say "by path at the shallowest depth that gives more than one group". `skill.test.mjs`: the depth sentence and the example. The `split` fixture variant is unchanged. Commit: `feat(gate): split at the shallowest depth that yields more than one group`.
5. The deferred carry and the candidates (R302, R306, decision 143): `findings.mjs` `reseen` carries a `deferred` entry with the bucket `defer` and the reason of its last defer pass, and every `new` finding of the summary gains `candidates`; Step 1.6.2 reads them and matches against fixed, rejected and deferred entries; `record.md`'s Findings ledger says what the script sets for a returning deferred entry. `tests/gate/findings.test.mjs`, expected output as literals: a reworded finding beside a `rejected` entry two lines away prints `state: new`, `bucket: null` and one candidate at `distance: 2`; a returning deferred identity prints `bucket: defer` with the earlier reason; a `new` finding on a file with no earlier entry prints `candidates: []`; the existing fixtures gain the key where a finding is `new`, each distance derived by hand from the fixture lines. Commit: `feat(gate): carry a deferred finding and name the ledger's candidates for a new one`.

Check:

- `npm run test:gate` on each commit, each new assertion seen failing first, and `node tools/lint.mjs`; the configuration block stays byte-identical in `SKILL.md` and the README (R313).
- Acceptance items 55, 56 and 57.

### M49: audit field feedback

Work items, in this order, after M48:

1. Claims that name no file (R165, decision 148): Stage 1 step 9 rule 3 assigns in turn across the bundle's groups that hold a file; a new rule 5 caps a group at 80 such claims and moves the rest in turn; the brief's Claims section records each scope's count and each move. Commit: `fix(audit): spread claims that name no file across a bundle's groups`.
2. A new local branch (R149, R178, R179, decision 146): `readonly.sh check` prints a new `refs/heads/<name>` other than the checkout's branch, and a `+` config line `branch.<name>.<key>=` for it, as `local-branch` and counts it like `remote-ref` for the exit status; the header comment and the output order gain the kind; `SKILL.md` Read-only check judges it with a `local-branch` approval; `common.md` rule 2 names it. `tests/audit/readonly.sh`: case 7 moves to the `local-branch` line and exit 3; new cases for a new ref with its `branch.<new>.remote` and `branch.<new>.merge` config (three `local-branch` lines, exit 3), a new ref beside an unrelated config key (`blocked config`, exit 1), and a moved existing branch (`blocked refs` for both lines, exit 1). Commit: `feat(audit): judge a new local branch apart from a changed checkout`.
3. Kept scope outputs (R161, decision 146): `resume.md` steps 6 and 7 keep a complete `pass1/` or `pass2/` file whose `consumed:` hashes hold when stage 4 or 5 is the first rerun stage because its entry is missing or `running`; stages 4 and 5 launch no scope with a kept file. Commit: `feat(audit): keep a finished scope's output when its stage never closed`.
4. The restated hard rules (R162, R180, decision 148): each of the five agent definitions gains a short section after its opening paragraph; `common.md` rule 2 gains `mkdir -p` of the agent's scratch folder and the inline-program and heredoc sentence; `SKILL.md` notes a late completion notice in the stage's check file. `tests/audit/lint.sh`, which already reads the agents' Boundaries text, checks that each agent file restates the rules. Commit: `fix(audit): restate the hard rules and freeze a finished output in each agent definition`.
5. Act shows the defect first (R194, decision 148): a step 7 sub-step before the edit runs a covering check or the finding's described test at baseline for an item whose evidence is reading, logs it as `demonstrate`, stops on a contradicting result, and the commit body carries the before and after results. Commit: `feat(audit): show an item's defect before act edits`.
6. `scripts/report.sh` (R322, R160, R184, R6, decision 147) and `tests/audit/report.sh`: a run directory built inline with small literal inputs, each part file compared byte for byte, the `assemble` order, every exit code and message; registered in `tests/audit/sh.test.mjs`'s second list; `tools/lint.mjs`'s executable list gains `report`; `docs/architecture.md`'s tree and scripts sentence name it; stage 8 step 6 writes the orchestrator's parts and lists, runs `parts` and `assemble`, step 8 reassembles after the Coverage line, and step 10 runs `claims-verdicts`; `report.md` fixes the copied sections' shapes. Commit: `feat(audit): build the report's copied sections and claims-verdicts with a script`.

Check:

- `npm run test:audit` on each commit, `npm run test:lint` and `npm run test:release` where a commit touches them, each as its own command with its exit code read; the sh suites once under mawk where one is installed, else recorded as not run; `node tools/lint.mjs`.
- Acceptance items 58 and 59; item 14 rerun at the tag, which exercises `report.sh`.

### After the push

The `## gate 0.1.3 - <date>` and `## audit 0.1.8 - <date>` headings in `CHANGELOG.md`, one bullet per change and the audit's "A run started on 0.1.7 resumes from stage 1" bullet, commit `docs(changelog): add the gate 0.1.3 and audit 0.1.8 headings`, committed before the pull request; after the merge, by the owner, `claude plugin tag --push plugins/gate` and `claude plugin tag --push plugins/audit`, each after a yes, and the acceptance record of items 55 to 59 under a "field feedback 2026-10-28" heading.

## Field feedback 2026-10-28, second batch: M50 to M52

Added 2026-10-29. Requirement R323 and the amended R55, R63, R67, R71, R81, R89, R99, R104, R112, R135, R142, R180, R289, R290, R291, R294, R297, R300, R302, R303, R306 and R313; decisions 149 to 154; acceptance items 60 to 68. The second batch of the field feedback of 2026-10-28, on loop 0.1.9, gate 0.1.3 and audit 0.1.8, and issues 41 to 45; each finding was verified on 2026-10-29 against the shipped texts on `main`, the slice hashes of M50 item 3 and the gate's issues 42 and 43 by a run as well. Three sub-milestones under one heading, since the plugins release separately: M50 touches `plugins/loop/` and `tests/loop/`, M51 `plugins/gate/` and `tests/gate/`, M52 `plugins/audit/` and `tests/audit/`, and M50 and M51 also `docs/architecture.md`, whose loop roles table and gate configuration, reading and passes paragraphs mirror the texts they change; each such item greps the architecture for the literals it changes and keeps the copies equal. One release commit, `release(loop, gate, audit): loop 0.1.10, gate 0.1.4 and audit 0.1.9`, moves the three above `loop--v0.1.9`, `gate--v0.1.3` and `audit--v0.1.8` with `node tools/release.mjs`, and the catalog's `metadata.version` to 0.1.14 by hand, since the script sets only the plugin entries. Each work item is one finding, fixed as its requirement and decision say; each test is written first and seen failing against the untouched text, and each commit runs the area script that covers what it touched, as its own command with its exit code read; `npm test` and lint with the deny tokens run once before the push. Issue 42 and issue 45 are investigated without a change unless the investigation finds a cause in a text or the code.

| # | Milestone | Adds | Depends on |
|---|---|---|---|
| M50 | loop field feedback | the sibling `gate` key, the implementer budget in the plan and the brief, slice hashes through the filters, the commit and push commands after a Step 4 block, the notification's duration, the reviewer of the session's own worktree, the CI jobs the configured checks leave out, the configured instruction directory; loop 0.1.10 | - |
| M51 | gate field feedback | the match written with its bucket and the script's warning, `gate.timeouts`, the deeper split, "repo <path>", the configured instruction directory, the notification's duration, the issue 42 comparison; gate 0.1.4 | - |
| M52 | audit field feedback | unquoted command words, a notification for an agent no stage launched; audit 0.1.9 | - |

M50, M51 and M52 touch no common file but the design documents, the catalog and the changelog, which the first, second and last commits carry. Within a sub-milestone the items share `SKILL.md` and run one at a time; items of different sub-milestones may run in parallel.

### M50: loop field feedback

Work items, in this order, after the design commit `docs(design): specify the second batch of the field feedback of 2026-10-28` and the release commit:

1. The sibling key (R81): `SKILL.md` Configuration, `steps/0-preflight.md` 0.1.2 and the README's configuration text name `gate` as a key the gate plugin owns, skipped without a report, beside the unknown keys that are reported. `tests/loop/config.test.mjs`: `SKILL.md` and the README hold the sentence, and the configuration block stays byte-identical (R81); `tests/loop/preflight.test.mjs`: 0.1.2 names the key. Commit: `fix(loop): skip the gate key of .reimagine.json without reporting it`.
2. The implementer budget where slices are sized (R99, R104): `steps/1-plan.md` Step 2 states, beside its split rule, the subagent budget in force, `timeouts.subagent` or 20 minutes, and that a call past it ends the run `blocked`; the implementer brief of `steps/4-build.md` gains a budget item. No continuation of an expired call. `tests/loop/review.test.mjs`: the budget sentence in Step 2 and the brief's budget item. Commit: `fix(loop): state the implementer budget where slices are sized and in the brief`.
3. Slice hashes through the filters (R89, decision 152): `record.md` steps.json item 3 stores `git -C <checkout> hash-object --no-filters -- <path>`, and An existing record item 6 compares it with `git cat-file --filters <tip>:<path> | git hash-object --stdin --no-filters`, in the words of `steps/0-preflight.md` 0.3.2. `tests/loop/record.test.mjs`: the R89 test asserts the two new commands in place of `hash-object -- <path>` and `git rev-parse <tip>:<path>`, and their absence. Commit: `fix(loop): compare a slice's files with the tip through the checkout's filters`.
4. The commands after a Step 4 block (R135): `report.md` Blocked, stopped or prepared prints, for a `blocked` run that left slice edits uncommitted, `git add <paths>` per slice, `git commit`, and `git push <remote> <branch>` when the branch exists on the remote, in the `prepared` form, and says the rerun then finds the slices committed; after item 3. `tests/loop/publish.test.mjs`: the three commands and the rerun sentence in that section. Commit: `fix(loop): print the commit and push commands after a block in step 4`.
5. The notification's duration (R67, R71, R104, decision 149): `SKILL.md` Budgets and rounds and Time, and `steps/4-build.md` 4.2 and Implementer snapshots item 3, judge an Agent or SendMessage call on its completion notification's `duration_ms`, falling back to `date` when the notification carries none; a notification for a call not sent, after it returned, is not a new call and changes nothing unless the snapshot comparison finds a file changed after the first return; `date` still brackets the batch for `run.md`; the brief tells the implementer to start no background command. `tests/loop/review.test.mjs`: the sentences in `SKILL.md` and Step 4.2 and the brief's item. Commit: `fix(loop): judge an implementer call by its notification's duration`.
6. The reviewer of the session's own worktree (R63): `code-review` covers the primary whenever it is the session's checkout, a linked worktree included; the stand-in covers a primary that is not the session's checkout and each additional repository; in `multi-repo.md` Step 5, `steps/4-build.md` 5.2, the roles table row and items 4 and 5 of `SKILL.md`, and the roles table of `docs/architecture.md`. `tests/loop/review.test.mjs`: no file holds the old "a worktree or an additional repository" condition, and each place holds the new one. Commit: `fix(loop): name the reviewer of a primary that is the session's own worktree`.
7. The CI jobs the configured checks leave out (R112): with a `checks` key those commands run, and Step 6.1 still reads the manifests and the CI jobs and names each CI job no configured check covers as deferred to CI in `run.md` and the report; the `checks` bullets of `SKILL.md` and the README say so in the same words. `tests/loop/config.test.mjs`: the sentence in both bullets and in 6.1, and the old "With no `checks` key, Step 6.1 discovery applies" absent. Commit: `fix(loop): name the ci jobs the configured checks do not cover`.
8. The configured instruction directory (R55, as M51 item 5): `SKILL.md` Approval scope item 1 and `steps/0-preflight.md` 0.1.1 read the user's instruction files in `$CLAUDE_CONFIG_DIR` when it is set, else in `~/.claude`, never both, and the instruction files of each folder above the repository, and 0.1.5's permission statement names the directory read. `tests/loop/preflight.test.mjs`: the sentence in both files, the statement line, and no "(else `~/.claude`)" left beside the instruction files. Commit: `fix(loop): read only the configured instruction directory`.

Check:

- `npm run test:loop` on each commit, each new assertion seen failing first; the `SKILL.md` core stays under 5,800 words and its configuration block byte-identical to the README's (R81).
- Acceptance items 60, 61, 62 and 67.

### M51: gate field feedback

Work items, in this order, after M50 or beside it:

1. The match written with its bucket (R302, R306, decision 154, issue 43): Step 1.6.3 writes `match` in the same write as the bucket and state, and 1.6.4 records the finding under the earlier id; `record.md`'s Findings ledger says the same and names the warning; `findings.mjs`, before it reads a pass and after the rollback of a repeated pass, prints one stderr line per entry new in the latest pass the ledger holds that is `carried` or `regressed` with no `match`, `findings: warning: <id> is <state> with no match; write the match of Step 1.6`, in id order, exit 0. `tests/gate/findings.test.mjs`, expected output as literals: a ledger whose pass 1 entry is `carried` with no `match` gives the warning line and exit 0 on pass 2; the same entry with `match` gives none; a `deferred` one gives none; `tests/gate/skill.test.mjs`: the sentence in Step 1.6.3. Commit: `fix(gate): record a matched finding under its earlier id`.
2. The call budgets from the configuration (R291, R303, R313, decision 151): the configuration block of `SKILL.md` and the README gains `"timeouts": { "subagent": 20, "review": 30, "check": 15 }`, each absent key taking the root `timeouts` value, then the default; Levels and caps, the reading block's Budget line, `steps/1-pass.md` 1.3 and 1.4, and `steps/2-fix.md` Groups, Snapshots, the brief and Checks say the subagent, review and check budgets with their source in place of 20, 30 and 15; `docs/architecture.md`'s one-line block and its Passes and caps paragraph follow. `tests/gate/skill.test.mjs`: R313's literal gains the key, the R300 and R303 tests read "the check budget" and "the subagent budget" in place of the minute literals, and the Budget line's three budgets. Commit: `feat(gate): read the check and call budgets from the configuration`.
3. The deeper split (R297, decision 150): Step 1.2.3 groups a group still over `split` whose key is a directory again by the same rule, until no group is over `split` or it is the `.` key or one file; 1.2.4's slugs follow the final keys, the `.` keys after every directory key in byte order of their prefixes; the worked example gains a second step; `record.md`, the `split` bullet and roles row of `SKILL.md`, the README and `docs/architecture.md` drop "a group alone over `split` is still one review". `tests/gate/skill.test.mjs` R297: the new rule, the example's second step, and the old sentence absent. The `split` fixture variant is unchanged. Commit: `feat(gate): split a group that is still over split one level deeper`.
4. "repo <path>" (R289, R290, R291, R323, decision 153): the grammar lists of `SKILL.md` and the README gain the phrase; Reading the request checks the path with `git -C <path> rev-parse --show-toplevel`; Step 0.2 runs every command of such a target in the manifest bundle's forms, 0.3.3's permission statement counts those forms, 0.4.3 reads the head there; the Targets line prints the toplevel; the phrase beside a pull request or manifest target is one unresolved line; `docs/architecture.md`'s reading paragraph names it. `tests/gate/skill.test.mjs`: the phrase in both grammar lists and the check in `SKILL.md`. Commit: `feat(gate): take a repo path for a branch target`.
5. The configured instruction directory (R294, issue 44): `steps/0-preflight.md` 0.3.1 and `SKILL.md` Approval scope item 1 read the user's instruction files in `$CLAUDE_CONFIG_DIR` when it is set, else in `~/.claude`, never both, and the instruction files of each folder above the repository, and 0.3.3's statement names the directory read. `tests/gate/skill.test.mjs` R294: the sentence and the statement line. Commit: `fix(gate): read only the configured instruction directory`.
6. The notification's duration (R300, decision 149): `steps/2-fix.md` Groups item 4, Snapshots item 3 and the brief judge an implementer call on its notification's `duration_ms`, a resume the gate did not send is not a new call, and the brief says to start no background command. `tests/gate/skill.test.mjs`: the sentences. Commit: `fix(gate): judge an implementer call by its notification's duration`.
7. Issue 42, no reading block before the first review: `SKILL.md` at `gate--v0.1.2` and at `main` were compared for where the reading block and the permission statement sit, and runs were made headless on 2026-10-29 at both texts. A change goes in only when a run that changes only the text shows the block printing where it did not; otherwise no commit, and the comparison and the runs go in the pull request body with the issue left open.

Check:

- `npm run test:gate` on each commit, each new assertion seen failing first; the configuration block stays byte-identical in `SKILL.md` and the README (R313).
- Acceptance items 63 to 67.

### M52: audit field feedback

Work items, in this order:

1. Unquoted command words (R142, issue 41): `commands/run.md`, `resume.md`, `handoff.md` and `act.md` hold `$ARGUMENTS` without quotes, and the three that say "Quoted text stays one token" keep the rule, which now applies to quotes the user typed. `tests/audit/lint.sh`: a check that fails when a command file quotes `$ARGUMENTS`, seen failing on the untouched files. Commit: `fix(audit): pass the command's words unquoted so a manifest and its effort split`.
2. A notification for an agent no stage launched (R180): `SKILL.md` Agent launch rules item 6 covers a completion notification for an agent this session did not launch, as one from an earlier session, since an agent joins its stage's `agents` list only when its own notification arrives: noted in the check file of the stage then running, or of the last stage, and nothing else changes. `tests/audit/lint.sh`, when it reads that sentence, else the text alone. Commit: `fix(audit): ignore a completion notice for an agent no stage launched`.
3. Issue 45, the rules growth-ratio failure: `plugins/rules/scripts/rules.mjs` `imports` and `units` are read for a path whose cost is not linear in the input; a fix goes in only with its own test when one is found, and the test and its threshold are not changed.

Check:

- `npm run test:audit` on each commit, the sh suites once under mawk where one is installed, else recorded as not run.
- Acceptance item 68.

### After the push

The `## loop 0.1.10 - <date>`, `## gate 0.1.4 - <date>` and `## audit 0.1.9 - <date>` headings in `CHANGELOG.md`, one bullet per change, what and why, commit `docs(changelog): add the loop 0.1.10, gate 0.1.4 and audit 0.1.9 headings`, committed before the pull request; after the merge, by the owner, `claude plugin tag --push` for the three plugins, each after a yes, and the acceptance record of items 60 to 68.

## Field feedback 2026-10-29: M53 and M54

Added 2026-10-30. No requirement changes: R112 and R323 already say what the runs of acceptance items 61 and 65 at loop 0.1.10 and gate 0.1.4 did not do, and each fix puts the rule where the step that runs the command reads it. Acceptance item 60's setup is rewritten, since an implementer call stopped past its budget has its slice restored and leaves nothing to commit. M53 touches `plugins/loop/` and `tests/loop/`, M54 `plugins/gate/` and `tests/gate/`. One release commit, `release(loop, gate): loop 0.1.11 and gate 0.1.5`, moves the two above `loop--v0.1.10` and `gate--v0.1.4` with `node tools/release.mjs`, and the catalog's `metadata.version` to 0.1.15 by hand. Each test is written first and seen failing against the untouched text.

| # | Milestone | Adds | Depends on |
|---|---|---|---|
| M53 | loop checks from the key | the `checks` rule at the head of Step 6.1 and in the plan; loop 0.1.11 | - |
| M54 | gate commands of a repo target | the forms of a bundle or repo target in each later step file; gate 0.1.5 | - |
| M55 | drafts for other people | Concise Plain 4.9 and the chat block; rules 0.1.13 | - |

### M53: loop checks from the key

1. The plan's checks (R112, issue 48): Step 6.1 opens with the rule that a `checks` key's commands are the run's checks alone, in its order, with no manifest command or CI job added by a plan or a review, and Step 2's `plan.md` paragraph takes its checks from 6.1, naming a CI job no configured check covers as deferred to CI. `tests/loop/config.test.mjs`: both sentences. Commit: `fix(loop): run only the configured checks when a checks key is set`.

Check: `npm run test:loop`; acceptance item 61.

### M54: gate commands of a repo target

1. The forms in the later steps (R290, R323, issue 47): `steps/1-pass.md`, `steps/2-fix.md` and `steps/3-next.md` each say in their opening paragraph that for a manifest bundle or "repo <path>" every git command the file names runs as `git -C "<path>" <command>` and every other command as `cd "<path>" && <command>`, since the rule stood only in Step 0.2 and a run's fix round sent the plain forms. `tests/gate/skill.test.mjs`: the sentence in the three files. Commit: `fix(gate): restate the commands of a repo target in each later step`.

Check: `npm run test:gate`; acceptance item 65.

### After the push

The `## loop 0.1.11 - <date>` and `## gate 0.1.5 - <date>` headings in `CHANGELOG.md`, committed before the pull request; after the merge, by the owner, `claude plugin tag --push` for the two plugins, each after a yes, and the acceptance record of items 60, 61 and 65.

## Field feedback 2026-10-29: M55

Added 2026-10-30. Feedback on drafts for other people across rules 0.1.1 to 0.1.12 (decision 156). M55 touches `plugins/rules/output-styles/`, `plugins/rules/chat/`, `tools/lint.mjs` and `tests/lint/`; `core.md` does not change, so the shipped digest literals stay.

### M55: drafts for other people

Work items, in this order:

1. The design documents: the amended R43 in `docs/requirements.md`, decision 156 in `docs/decisions.md`, and this section. Commit: `docs(design): specify concise plain 4.9`.
2. `node tools/release.mjs rules 0.1.13`, with the catalog `metadata.version` raised by one and the version literals of `tests/rules/rules.test.mjs` moved to 0.1.13. Commit: `release(rules): 0.1.13`.
3. `plugins/rules/output-styles/concise-plain.md`: the reader bullet and the revision bullet of decision 156, at 4.9; `plugins/rules/chat/instructions.md`: the same two lines and the version note; `tools/lint.mjs` and `tests/lint/lint.test.mjs`: the R43 literal at 4.9. Commit: `feat(rules): write a draft for the person who will use it, revise it whole`.
4. The `## rules 0.1.13 - <date>` heading in `CHANGELOG.md`, committed before the pull request; after the merge, by the owner, `claude plugin tag --push plugins/rules` after a yes, and the acceptance record of item 5.

Check: `npm run test:rules` and `npm run test:lint` on the branch head, each run as its own command with its exit code read; `npm test` and lint with the deny tokens before the push.

## Record review 2026-10-30: M56

Added 2026-10-30. A review of the design documents, the changelog and the rules for what locates a session and for prescription (decisions 157 and 158). M56 touches `docs/`, `CHANGELOG.md`, `CLAUDE.md`, `.claude/skills/rules-feedback/`, `plugins/rules/rules/core.md`, `plugins/rules/output-styles/`, `plugins/rules/chat/`, `tools/lint.mjs`, `tests/rules/` and `tests/lint/`; `core.md` changes, so the shipped digest literals move.

### M56: the record and the rules

Work items, in this order:

1. The design documents: the rewritten lines of decisions 46, 58, 111, 112, 141 and 156, decisions 157 and 158, the amended requirements 1, 43, 44 and 233, the hub constraint, the skill principle, the changelog line for rules 0.1.13, and this section. Commit: `docs(design): record the failure and the fix, specify house-rule edit seventeen`.
2. `node tools/release.mjs rules 0.1.14`, with the catalog `metadata.version` raised by one and the version literals of `tests/rules/rules.test.mjs` moved to 0.1.14. Commit: `release(rules): 0.1.14`.
3. `plugins/rules/rules/core.md`: the decision item of decision 158; `plugins/rules/output-styles/concise-plain.md`: the two cuts, at 4.10; `plugins/rules/chat/instructions.md`: the same two lines and the version note; `tools/lint.mjs` and `tests/lint/lint.test.mjs`: the R43 literal at 4.10; `tests/rules/rules.test.mjs`: the R233 literal and the digest literals. Commit: `feat(rules): raise a decision by its substance, drop two drafts bullets`.
4. The `## rules 0.1.14 - <date>` heading in `CHANGELOG.md`, committed before the pull request; after the merge, by the owner, `claude plugin tag --push plugins/rules` after a yes, and the acceptance record of items 2 and 5.

Check: `npm run test:rules` and `npm run test:lint` on the branch head, each run as its own command with its exit code read; `npm test` and lint with the deny tokens before the push.

## House-rule edit eighteen: M57

Added 2026-10-31. R324 and decision 159: one Code item on prose written for an agent, resting on the prescriptive residue decisions 113, 115 and 158 found in the house rules. M57 touches `docs/`, `CHANGELOG.md`, `.claude/skills/rules-feedback/`, `.claude-plugin/marketplace.json`, `plugins/rules/.claude-plugin/plugin.json`, `plugins/rules/rules/core.md` and `tests/rules/`; `core.md` changes, so the shipped digest literals and the rule count move. The chat block does not change, since it carries no Code item. No other plugin changes.

### M57: the agent-read prose item

Work items, in this order:

1. The design documents: R324 in `docs/requirements.md`, decision 159 in `docs/decisions.md`, this section, and the rules-feedback skill's Principles section, which keeps its two bullets on the record and on what each change names and names the house-rule items for the rest. Commit: `docs(design): specify house-rule edit eighteen`.
2. `node tools/release.mjs rules 0.1.15`, with the catalog `metadata.version` raised by one and the version literals of `tests/rules/rules.test.mjs` moved to 0.1.15. Commit: `release(rules): 0.1.15`.
3. `tests/rules/rules.test.mjs` first: an `items.includes` assertion for R324, seen failing against the unchanged `core.md`; then `plugins/rules/rules/core.md`: the item of R324 after the reusable-files item, wrapped like its neighbors; then the shipped digest literals for `core` and `core,windows` and the rule-count literals, moved by running the suite and pasting the observed values (decision 11). Commit: `feat(rules): add the agent-read prose item`.
4. The `## rules 0.1.15 - <date>` heading in `CHANGELOG.md`, committed before the pull request; after the merge, by the owner, `claude plugin tag --push plugins/rules` after a yes, and the acceptance record of items 2, 4 and 5.

Check: `npm run test:rules` and `npm run test:lint` on the branch head, each run as its own command with its exit code read; `npm test` and lint with the deny tokens before the push.

## Agent-read prose, deferred findings: M58

Added 2026-11-01. The owner's decisions on this review are decisions 160 to 164, and M59 applies what they took. What stays here is what a later release needs: each deferred finding with its pins, and the notes on what the review left alone. Line numbers are those at e8c3fc8, before M59's cuts, so re-read a file before applying a finding to it. The whole review, with the load measure by plugin, the findings M59 took and the options the owner chose among, is in `docs/build-plan.md` at 39723bc. A finding is from reading unless it names a run.

Test for any cut: a stop cut from one file must stand, with the same condition and the same consequence, in a file the run reads before the action it guards.

### Audit

audit-14 to audit-27 wait for the record of the audit pilot (decision 161).

The orchestrator's files, read once per run or per command:

**audit-14. `SKILL.md` repeats its stage files.** `skills/audit/SKILL.md:345-357` (stage 1 summary and tier rule, 235 words), `:375-394` (stage 6 steps, 322), `:403-410` (stage 9 bullets, 144), `:414-421` (Resume list, 77), `:428-447` (Supporting files, 189); `second-opinion-request.md` "Acknowledgment rule" (119). Serves R142, R148, R158, R161. Now: each section restates the stage file it points to, and the template restates the stage's acknowledgment rule, which it calls "the stage's, not part of the request text". Proposed: the stage 1 and stage 6 sections become their pointer sentences, as stages 2 to 5 have, with "Stage 6 always runs. There is no timeout cap and no inline form." kept; first move "or `--stage6 failed` when stage 6 failed" into `stages/6-second-opinion.md` step 6, which today runs the check only when no batch failed, so the two files disagree; stage 9 becomes "Act is outside the read-only boundary and is gated by the user's approval per item."; the Resume list becomes "It reruns from the earliest stage that `resume.md`, step 6, names."; Supporting files keeps "A sentence that only says where a rule lives is not a read." and "`audit-evidence.md`: never read by you; stage 1 copies it and auditor and adversary prompts name it."; delete the template's acknowledgment section. Saves about 860 words per invocation of any of the four commands and about 95 per run from the template. Pins: `tests/audit/lint.sh:48-60` needs the nine stage paths named, kept. Check: acceptance items 14 and 42. From reading.

**audit-15. Stage 8 step 6 restates `report.md` section by section.** `stages/8-report.md:133-248`. Serves R160, R322, decision 147. Now: 1,282 words describing the twelve sections that `report.md:133-341` lays out, three of which `report.sh parts` writes. Proposed: keep the lead-in through "The twelve sections:", then: "The layout of each is in `report.md`; this step gives only where a section comes from. 1. **Verdict**, from steps 4 and 5, then the `next:` block of step 14. 2. **Findings by ticket**: the items of step 2, each under `#### C<n>: <title>`, which the work-items validator reads. A `provisional` item says which review it lacks, from its `gate.md` reason or the recomputed gate of path 2, or that a `REVIEW.md` rule holds it. Then the skip lines of step 2. 3. **Verified as sound**: every Verified OK item of the pass-one reports, `challenged` when a pass-two `## Verified OK challenged` list names it, else `not challenged`; at low tier every one is `not challenged`. 4. **Disagreements kept**: the `contested` items. 5. **Recommended next steps**: the plan of step 14. 6. **Code fixes**. 7. **Work-item fixes**: the operations are decided here and numbered from `W1` in order, so step 7 writes the same list with the same ids. 8. **Decisions**: `report.sh parts` writes the Decision ledger and Raised tickets (`08-decisions.md`); you write Other decisions (`08-other.md`). 9. **Live checks**: one block per check, in the form of `live.md`; each `status` comes from `live/findings.md`, `live/claims.md`, the results files they cite and the `live` approvals in `stages.json`, and is `under review` while its `gate.md` reason is `live result not yet reviewed`. 10. **Claims**: `report.sh parts` writes it. Give `claims-override.txt` the verdicts the files do not, a live claim's derived verdict (from the late adversary's line in `late/adversary.md`) and an environment claim's, as `report.md`, section 10, gives them. 11. **Coverage** and 12. **Usage**, run records, from `stages.json`, `usage.md`, `audit-brief.md`, the check files and the ledgers, as `report.md` lists them." First move into `report.md` the four phrases only this step holds: the `brief_errata` lines and "map corrections not applied, from `ledger/5.md`" in Coverage, "and so is each result a newer one outranks" in section 9, and the live-claim rule in section 10 (`true, reproduced` stays when the late adversary's line is `upheld`; with no line it becomes `not verified, not reproduced`, reason `live result not challenged`). Saves about 900 words per run. Pins: none. Check: `tests/audit/report.sh`, acceptance items 59 and 37. From reading.

**audit-16. Stage 7 split mode loads in every run.** `stages/7-converge.md:233-305` and the slice sentence of `:174-181`. Serves R159, decision 70, decision 112 item 6. Now: about 900 words of slice recipes and the group and final merger launches, used only when a ledger slice passes the threshold. Proposed: move them to a new `stages/7-converge-split.md`; step 5 ends "... Otherwise read `${CLAUDE_PLUGIN_ROOT}/skills/audit/stages/7-converge-split.md`, which builds and measures the slices; use split mode (step 7) when any slice is over the threshold, or when the sum is over three times it; otherwise remove `ledger/slices/` and use normal mode." and step 7 reads "7. **Split mode.** Follow `${CLAUDE_PLUGIN_ROOT}/skills/audit/stages/7-converge-split.md`." Saves about 850 words per normal-mode run. Needs `docs/architecture.md` first (a new file; the stage list at `:296`), the two `lint.sh:503-511` step greps and the `:72-74` header pointed at the new file, and `SKILL.md` Supporting files. Check: acceptance item 14 rerun with `_test.ledger_split_bytes` low; no test reaches split mode. From reading.

**audit-17. Live check messages mirrored in `live.md`.** `skills/audit/live.md:102-142` and the `live: <message>` lists under `assemble`, `active` and `carry`. Serves R189. Proposed: replace `:102-142` with "`live.sh check` prints `live: ok` or one `live <file>:<line>: <message>` line per error, and exits 1; exit 2 is a usage or IO failure. An entry's `query` and, for a claim, `env` must equal the block's, trailing spaces removed, since the result of another query settles nothing."; delete the message lists; `:6-10` says the script's messages are the home of their wording. Saves about 600 words per live resume. Pins: none (`tests/audit/live.sh` asserts the script's output). Check: acceptance item 16. From reading.

**audit-18. `report.md` copies of rules other files own.** `skills/audit/report.md:140-147`, `:153-166`, `:216-239`, `:247-255`, `:263-282`. Serves R160, R322, decision 147. Proposed: delete the counting rule at `:140-147` after "The counts come first, then the verdict, then the rule that decided it" (stage 8 step 4 is the home); cut the `next:` closing at `:153-166` to "No line of the block starts with `#### C`, `- claim ` or `#### live `, and the block adds no `###` or `####` heading.", the only statement of a form three scripts parse; delete the prose of sections 8 and 10 except "Other decisions" and the closing sentence about `claims-verdicts.md` (the shapes at `:55-99` stay, R322); delete the Live checks block at `:247-255`, a byte copy of `live.md:40-48`. Saves about 560 words per run. Check: acceptance item 59. From reading.

**audit-19. Stage 1 restates `SKILL.md` and scripts in smaller places.** `stages/1-orient.md`. Serves R153, R143, R147, R283, decision 112 item 5. Proposed: delete the intro's list of inputs and outputs (73 words, from "It reads" through "`runs.json` entry."); 0b's grammar sentence becomes "The effort hint, the budget and the model overrides come from the `request:` line as `SKILL.md`, Invocation block, defines them. The manifest gives `questions`, `claims`, `budget`, `max_agents` and `models`." (saves 30); 0d deletes only "A URL's host is what follows the scheme and any `user@`, up to the first `/`; the scp form `[user@]host:path` ends at the `:`." (24; the port and lowercase rules are the equality test and stay); 0h keeps the print and drops the field list (36); step 3 drops the `--name-status` format clause (14) and keeps which statuses exist at the merge-base; step 6b replaces the script description with "The commands run with the user's environment and credentials, and their output tails are kept unredacted. Agents read `revert/<bundle>.md` as `audit-evidence.md`, Reverted test runs, says." (63); step 8 deletes the worked token example (33; rerun the `tokens` fixture once); step 10d drops "with its header filled (...)" and "found from the script's path" and keeps "so neither file passes through the model", the failure behind `run-copies.sh` (23). Saves about 295 words per run. Pins: none (`:282`, the `plugin_version` literal, is untouched). Check: acceptance items 35 and 37, `tests/audit/run-copies.sh`. From reading.

**audit-20. Stage 7 restates the late adversary's and the merger's definitions and two gate rules.** `stages/7-converge.md:55-66`, `:214-231`, `:125-126`, `:138`. Serves R159, R163, R168. Proposed: `:55-66` becomes "The agent writes `late/adversary.md` as the late mode of its definition says, with, under `## Claims challenged`, one line per claim that `live/claims.md` derives `true, reproduced`, `upheld` or `overturned`, ending `runs:` and `status: complete`." (it keeps the claims sentence the step 2.4 check uses); `:214-231` becomes "The merger's rules are steps 3 to 7 of `agents/merger.md`; the orchestrator's own merge (step 9) follows them."; the two gate sentences, which `common.md:440-448` gives, go. Saves about 280 words per run. Pins: none (`lint.sh:503-511` reads the step 6 line count, outside these lines). Check: `tests/audit/ledger.sh`, acceptance item 15. From reading.

**audit-21. Stage 5 describes the shape `ledger.sh build5` writes.** `stages/5-pass-two.md:130-153`, `:38-56`. Serves R157, decision 31. Proposed: the skeleton becomes "Per scope in inventory order the script writes the pass-one findings (barrier top-up findings included), then the pass-two additions, then the top-up findings, one `## <finding id>` section each; then per scope with a complete pass two `## Verified OK challenged: <scope>` and `## Coverage gaps: <scope>`; and `## Failed outputs` when a record is `failed`. The script's header holds the exact shape.", with the skeleton written into the `scripts/ledger.sh:20` comment in the same commit (it now points at this file); step 3 becomes "3. **What the adversary writes.** The pass-two file of `common.md`, Output contract. The report marks the Verified OK items its `## Verified OK challenged` list names `challenged` and the rest `not challenged`." and the failure paragraph `:58-66` stays. Saves about 320 words per run. Check: `tests/audit/ledger.sh`, acceptance item 15. From reading.

**audit-22. `_test` fault handling in seven stage files that every run reads.** `stages/2-digest.md` to `stages/7-converge.md`, the `_test` sentences. Serves R187 ("honored as documented in `fault-injection.md`"). Proposed: first add to `fault-injection.md` what only the stage files hold: the `fail` scopes `<scope>-topup`, `<scope>-maptopup`, `late`, `converged` and a merger's group or part; "counted across batches and relaunches, whatever the answer says" under `drop_ack`; "record the hold in the entry" under `hold`; "record the line number and the original line, before the map's hash is recorded" under `plant_map_error`. Then replace each rule sentence with "If the manifest has `_test`, apply `fault-injection.md` here." where the fault acts (stage 3 at step 5.1, before hashing), keeping the entry-key clauses and `1-orient.md:146`, `:715`, `8-report.md:244`. Leave the lint-pinned sentences at `4-pass-one.md:90-92` and `5-pass-two.md:70-71` (`lint.sh:602-603`) untouched. Saves about 260 words per run. Check: none exists, since no acceptance item names `_test`; run one fault by hand. From reading.

**audit-23. Launch steps that restate the agent definitions.** `stages/2-digest.md:60-65`, `3-domain.md:37-39`, `4-pass-one.md:128-132`, `5-pass-two.md:93-95`, `7-converge.md:293-296`. Serves R154, R155, R157; contradicts `SKILL.md:183` ("The agent definition holds the standing instructions; do not restate them"). Proposed: end each launch step with its paths and "The agent definition holds the duties.", keeping the mode phrases ("mode: top-up after the barrier") and the `pass1/` check. Saves about 175 words per run with audit-16 (about 220 without), and the same words in each prompt written. Pins: none. From reading.

**audit-24. Bookkeeping that `SKILL.md` states once, restated per stage.** The ladder at `2-digest.md:66-70`, `3-domain.md:40-43`, `4-pass-one.md:95-99`, `5-pass-two.md:72-74`; the token label at `4-pass-one.md:86-89`, `5-pass-two.md:68-69`, `6-second-opinion.md:181-185`, `7-converge.md:353-357`; the ignored-file settlement at `4-pass-one.md:157-161`, `5-pass-two.md:178-180`. Serves R149, R151, R178. Proposed: "follow the ladder (SKILL.md, Roles)" with each stage's own parts kept; "Record each agent as `SKILL.md`, Agent launch rules, says."; "Run the read-only check (SKILL.md, Read-only check), which writes `baseline/<n>-check.md`." The `blocked` sentence at `4-pass-one.md:158-161` stands in `SKILL.md:247` and `:262-264` for every stage. Apply with audit-22 near the lint-pinned lines. Saves about 190 words per run. From reading.

**audit-25. Small once-per-use copies.** `skills/audit/work-items.md:89-117`; `resume.md:3-8`. Proposed: the validator list becomes "It checks every rule above, that `run` equals the report's run id, that every `C<n>` in `items` is an item heading `#### C<n>: ` in the body, every `claim <n>` a numbered claim line of `claims.md`, and that every operation reaches a `C<n>` or a claim." (saves about 190 per report); delete the rerun list at `resume.md:3-8` (60), replacing lines one for one or moving the index in `tests/release/release.test.mjs:148`, which reads `resume.md` line 156 by position. Check: acceptance items 16 and 17. From reading.

**audit-26. Stage 9's live line.** `stages/9-act.md:262-274`, `:36-43`. Serves R195, decision 112 item 7. Proposed: "- one live line, from the Live checks blocks in `report.md`, whose grammar is in the skill's `live.md`: `live checks: none outstanding`; for a block `not run: not approved`, `live results needed: <ids>; /audit:resume <run-id> --live <file> imports them while resume's eligibility checks pass, and resume refuses otherwise`, adding, when this invocation committed, rebased or merged, that it moved the bundle's branch, so a bundle whose recorded head was read from that local branch stops matching and resume without --live re-audits it; for a block `under review`, `live results imported, awaiting review: <ids>; /audit:resume <run-id> reconciles them, no --live needed; after a head or base change resume asks to restart from stage 1, and approving that restart retires them`; both lines when both states are open; `live checks: not checked (<report or entry> could not be read)` when act stopped before it could read them."; step 1.4 keeps the warning and the sentence that a commit, rebase or merge moves a head read from the local branch. "whose grammar is in the skill's `live.md`" is decision 112 item 7's fix and stays. Saves about 150 words per act. Check: acceptance item 15. From reading.

**audit-27. Stage 8's closing and counting lines.** `stages/8-report.md:101-105`, `:375-379`, `:405-411`. Serves R160, R168. Proposed: the two-position rule becomes "`contested` with two positions: the rule of `common.md`, When a finding counts; with one position `dropped`, the keeping position's severity." (the severity clause is stated nowhere else); the plan bullet becomes "- The ordered plan of section 5, as `report.md` fixes it, naming the contested and decision items it takes and why; a decision entry is named in words, never with an invented `C<n>`."; the `--live` bullet keeps its eligibility rule and replaces its explanation with "and to import before committing or pushing on the audited branch", the only report-time warning to the user. Saves about 95 words per run. From reading.

Notes, not proposed:

- Hard rules 2 and 4 restated in every agent (`auditor.md:23-33` and the four others, about 105 words each): decision 148, R162, pinned at `lint.sh:614-634`; a cut waits on decision 148's reopening, a hook.
- The Bash command list in `common.md` rule 2 and four agents' Boundaries item 2 (about 190 words each): decision 71, R162, read by `lint.sh:514-534`.
- Pinned text: the `common.md` header by position (`run-copies.sh:155-186`); the converged item shape in `merger.md` and stage 7, identical by R219 (`lint.sh:473-483`, `tools/lint.mjs:35`); the merger's paging text (decision 70); the output contract's `status:` family (R181); the `plugin_version` literals at `SKILL.md:313`, `resume.md:156` and `stages/1-orient.md:282`, pinned by line index (`tests/release/release.test.mjs:136-149,164`); the `decided_by` table (R139); the claims-verdicts format, fixed in stage 8 by R322; the stage 9 instruction-file list (`lint.sh:562-570`, R267).
- Stops: the read-only check and its two questions, the run id and registry lock, the stops of `resume.md`, the acknowledgment rule (R177 to R179, decisions 45, 109, 146, 21).
- Mechanisms: the stage 1 tree export (R153), the digester's byte-range reading, the 12-key invocation block each command fills, the handoff claims table (the only definition of the `ref` forms; `handoff.sh` does not hold it).
- `SKILL.md` past the compaction window: at 40,579 bytes, the 5,000 tokens the host keeps end near `SKILL.md:190` to `:245`, so State files, the registry lock and every stage section fall outside, while `stages/8-report.md` and `stages/9-act.md` cite sections there and Compaction recovery does not re-read `SKILL.md`. Unverified by a run; the smallest fix adds a clause, so it waits for a recorded failure. audit-14 shortens the tail.
- A file split of `audit-evidence.md`: a reorder cannot stop a whole-file read, but a third run copy without the two conditional sections ("Reverted test runs", "Rerun of a run-once script", 1,668 words), read only where the brief lists a revert file or a run-once entry, would save up to 1,668 words per launch, about 33,360 per medium run. It changes R283, `scripts/run-copies.sh` and its test and four stage files.
- Raised in the second reading and not itself challenged: `resume.md:40` has the orchestrator read `audit-evidence.md` (4,354 words per resume) though `SKILL.md` says it never does; `common.md:251-252` points the merger to the stage 7 file it never reads; `stages/8-report.md:335-336` (about 25 words) and `stages/4-pass-one.md:68-69` (21 words, four copies) repeat other files.

Considered and not proposed: replacing the stage 4 checklist table (`stages/4-pass-one.md:50-51`, `:59-66`, about 495 words per run) with a pointer to the agent files, which is the third copy of the same checklists and conflicts with audit-1 and audit-4: taken together the three leave no copy, and audit-1 with audit-4 saves far more per run; a reorder of `audit-evidence.md` (no saving; above); deleting Boundaries items 1 and 4 (decision 148); moving the handoff claims table into the script header (the header does not hold it); shortening the 12-key command block (a template).

### Loop

Nothing now: each finding rides the next loop release that edits its file for another reason (decision 162).

**loop-1. Roles and models restates its table and the step files.** `plugins/loop/skills/run/SKILL.md:127-137`. Serves R60 to R65, R285; decisions 15, 19, 128. Now: seven numbered items after the roles table (453 words) that repeat its rows and what `steps/1-plan.md:26` and `steps/4-build.md` say at the point of use. Proposed: replace lines 127 and 129 to 137 with three paragraphs, the table kept:

> Final reviewer: `code-review` covers the primary whenever it is the session's checkout, a linked worktree included. Confirm the skill is listed when Step 5 starts. Step 5.2 (`steps/4-build.md`) gives the call; a CI repair cycle adds one pass (`steps/7-publish.md`).
>
> Stand-in: used on the table's conditions; an Agent at `opus`, given the absolute path of the patch file, the plan, the inputs, the acceptance criteria and the reply shape, with the `code-review` level of `risk.md` as its `effort` (`xhigh` where the word was "max"), told to read and report only. It runs once per pass, is never continued with SendMessage, and is named in the report.
>
> The orchestrator never implements a slice. `.reimagine.json` `models` never changes the risk floor or the Step 5 role. Agent calls never use a fork, and each passes `model` explicitly and `effort` by the effort rule above. The step files carry the briefs, reply shapes and fallbacks.

The plan reviewer row's fallback cell keeps the only definition of a model error: "once at `opus` on a model or tool error (an API error such as model not found); stays swapped for the run". The four references to "Roles and models, item 4" and "item 5" (`steps/1-plan.md:9`, `:26`, `steps/4-build.md:81`, `:82`) move to "Final reviewer" and "Stand-in". Saves 295 words per run. Pins: `tests/loop/review.test.mjs:78-90` and `:211-232` read the table and the stand-in condition, kept. Check: acceptance items 9, 46 and 62. From reading.

**loop-2. `SKILL.md` lists the `prepared` commands that `report.md` prints.** `SKILL.md:155`. Serves R94, R135, R215; decision 72. Proposed: "- `prepared`: every step through 6 is complete and publication is withheld before any push. The report prints the commands that publish the work (`report.md`, Blocked, stopped or prepared)."; move "With several repositories, give the set per repository with `git -C <path>`." from the end of the `blocked` paragraph (`report.md:124`) to after item 4 of the `prepared` list (`report.md:122`), where the `blocked` paragraph inherits it. Saves 116 words per run. Pins: `tests/loop/publish.test.mjs:126,131` read this bullet and go; `:127,132` read the report and stay. Check: acceptance item 13. From reading.

**loop-3. `handoff.md` ends in a 323-word example.** `handoff.md:121-192`. Serves R137 to R139, R286 (the format, not the example). Now: a worked handoff and manifest; every key, order and `none` form is in Format and Manifest. Proposed: delete; the file ends with "Return to Final report handling in SKILL.md." Saves 323 words per run with a commit. Pins: `tests/loop/handoff.test.mjs:70-76` reads only the example and goes with it. Check: the example, extracted alone, passes `plugins/audit/scripts/handoff.sh check`, so it carries no rule the validator enforces; before accepting, rerun acceptance item 9 and run `handoff.sh check` on its `handoff.md`. From running (the check on the extract).

**loop-4. `report.md` restates its template and its sections.** `report.md:56-61`, `:132`, `:133`, `:135`. Serves R133 to R135; decision 40. Proposed: replace the Header bullets at `:56-61` with "- CI state: `not reached` when Step 7.3 never ran."; keep `:62-64` (Handoff, whose "not written: no commit from this run" is the only source of that reason in a run that never reads `handoff.md`; Gate; Audit); delete the Rules bullets at `:132`, `:133` and `:135`. Saves 181 words per run. Pins: `tests/loop/handoff.test.mjs:78-95`, kept. Check: acceptance item 46. From reading.

**loop-5. Step 0 restates `SKILL.md` rules the run has just read.** `steps/0-preflight.md:11`, `:34`, `:40`, `:41-45`. Serves R47, R53, R74, R81; decision 155. Proposed: delete `:11` and `:34`; the Known keys sentence becomes "Known keys and values are those of the Configuration block in SKILL.md, with `timeouts` as positive numbers of minutes."; `:41-45` become "3. Credential scan, over every input: the request text, each ticket's text, each file's text and the description. A match is any shape of SKILL.md, Reading the request (a PEM header is `-----BEGIN` followed by a key or certificate type), with key names compared case-insensitively anywhere in a line. A key's value runs from the first character after `:` or `=`, with spaces and an opening quote skipped, to the next space, comma or quote." Saves 115 words per run. Pins: none (`tests/loop/preflight.test.mjs:141-143` reads the `gate` sentence, kept). Check: none exists for the scan. From reading.

**loop-6. `risk.md` asks to be read again at every judgment and restates `SKILL.md`.** `risk.md:3`, `:24`, `:41-57`; `SKILL.md:226`. Serves R69, R106, R285; decisions 122, 128. Now: the file asks for a read at Step 1.6 and again at Step 2, Step 4.5, before Step 5 and before each CI repair (4 to 7 reads of 563 words, as written); its Effort hint section repeats `SKILL.md`'s word table and the floor rule. Proposed: `:3` "Read this file at Step 1.6. Apply it again whenever you judge the risk floor (Step 2, Step 4.5), before the Step 5 pass and before every CI repair; read the file again only if it is no longer in your context."; `SKILL.md:226` "- `risk.md`: at Step 1.6; apply it whenever the floor is judged."; delete `:24` (it is `report.md:74`'s first bullet) and the Effort hint section; retitle the file and `docs/architecture.md:161` to match. Saves 165 words per read, and about 563 per read avoided. Pins: `tests/loop/review.test.mjs:96-100` holds the `SKILL.md` bullet and moves with it. Check: `tests/loop/review.test.mjs:29-46`, acceptance item 46. From reading; how often a run re-reads the file was not measured.

**loop-7. Reading the request carries later rules.** `SKILL.md:62` (last two sentences), `:74`. Serves R50, R51, R281, R285. Proposed: the two sentences become "`risk.md` holds the `code-review` level table and the floor."; `:74` becomes "Scope: the primary repository is the session's, or the checkout "primary <path>" names. "also edit <path>" adds a writable checkout. A path in ticket text that maps to another checkout is adopted only through the Step 1.2 question, never from prose alone." The adoption stop stays in full in `steps/1-plan.md:34-39`. Saves 78 words per run. Pins: `tests/loop/review.test.mjs:48-50` reads the cap sentence and moves to the table row (`:89`) and `risk.md` (`:44-46`), which already hold it; `tests/loop/preflight.test.mjs:86-91`, kept. Check: acceptance items 7 and 45. From reading.

**loop-8. `record.md` Location and Never rewrite restate other files.** `record.md:8-12`, `:117-119`. Serves R82, R93. Proposed: keep item 1; items 2 to 6 become "2. `.reimagine/` is excluded as Step 0.5 says; nothing under it is ever staged, and no commit contains a record file.", "3. Every shell argument that names a record file is its absolute path, for example `C:/src/app/.reimagine/loop/feat-68-4567-export/pr-body.md`." and "4. Fast-forwarding a local branch to the remote head belongs to Step 0.2 alone." (found nowhere else); delete Never rewrite, whose "Never force push, rebase, reset or amend" stands at `steps/7-publish.md:42` and in the always-ask list. Saves 117 words per run. Pins: none (`tests/loop/record.test.mjs:22-31` checks cited sections exist; none cites these). Check: acceptance item 10. From reading.

**loop-9. Two step files open with the same step-entry procedure.** `steps/1-plan.md:5`, `steps/4-build.md:5`. Serves R85, R92; decision 16. Proposed: `1-plan.md:5` "At the start of each of Steps 1, 2 and 3, take `date` and apply `record.md`, Reuse and resume. Otherwise write the step's `steps.json` entry `running` as `record.md`, steps.json, says, and `complete`, with the end time from a fresh `date`, once its outputs exist: `inputs.md` for Step 1, `plan.md` for Steps 2 and 3. Log each step in `run.md`." (the fresh `date` for a step's end is stated nowhere else); `4-build.md:5` before "Steps 3.6 and 3.7 belong to Step 3" becomes "At the start of each step take `date` and apply `record.md`, Reuse and resume: a reused step is not run, and its entry stays as it is. Otherwise write the step's `steps.json` entry as `record.md`, steps.json, says, and write it `complete` only after its outputs exist: the step's section of `run.md` and, where the step takes them, the snapshot and patch files.", and its closing round-cap sentence goes. Saves 121 words per run. Pins: `tests/loop/publish.test.mjs:38-42`, kept. Check: acceptance item 10. From reading.

**loop-10. The routing table sits past the part a compaction keeps.** `SKILL.md` `## Supporting files`. Serves R94, R133. Now: at 25,827 characters the body's tail, `## Final report handling` and `## Supporting files` (from character 23,764), falls outside 5,000 tokens at 3.5 to 4 characters per token. Proposed: take loop-1, loop-2 and loop-7 first, which bring Terminal states, Blocking and Questions inside (the body becomes 3,858 words, 22,996 characters); then move `## Supporting files`, the one routing table, and if still past the window `## Final report handling`, to the front of the body. Moving more ahead, as first proposed, pushes the timers, rounds and failure rules out instead. Saves no words. Pins: lint and tests read sections by heading. Unverified: the token ratio, and whether a field run compacts before Step 7. From running (offsets by script on a cut copy).

**loop-11. The description carries a clause that triggers nothing.** `SKILL.md:3`. Serves R45; decisions 35, 98. Proposed: drop "resuming on the same branch when run again" (8 words, 45 bytes). The manifest, catalog and README carry their own copies for people; `docs/architecture.md:171` quotes the description and moves with it. Saves 8 words in every session. Pins: lint and `tests/loop/config.test.mjs:40-48` need only the two phrases. Check: the `prose-trigger` eval, acceptance items 7 and 25. From reading.

**loop-12. The permission statement lists sixteen actions.** `steps/0-preflight.md:52`. Serves R75. Proposed: "For each approved action, and each command the run will issue that the skill does not pre-approve (every write, `git fetch`, the checks, subagents, and the `git -C <checkout>` and `cd <checkout> && ...` forms of a worktree, a named primary or an additional repository), whether a prompt will occur. Judge each from the permission mode the session states and the allow rules in the user, project and local settings files (`$CLAUDE_CONFIG_DIR/settings.json` else `~/.claude/settings.json`, `<repo>/.claude/settings.json`, `<repo>/.claude/settings.local.json`). An action runs unprompted only when the mode approves it, or an allow rule matches its command and no ask or deny rule does. An outcome you cannot determine counts as a prompt." Saves 38 words per interactive run. Low confidence: the list may help the model name each prompt, and item 11's records show the statement printed as a paraphrase or not at all with the list in place. Pins: `tests/loop/preflight.test.mjs:158-178` reads another sentence. Check: acceptance items 11, 40, 41. From reading.

**loop-13. A one-line duplicate in `multi-repo.md`.** `multi-repo.md:35`. Serves R132. Proposed: delete "**Handoff.** The first bundle is the primary, then the "also edit" order. A verified check is listed only for the first bundle.", which `handoff.md:46` and `:74` state. Saves 22 words per multi-repository run. Pins: none. From reading.

Notes, not proposed:

- The ticket-comment bullet of `pr-body.md:82` repeats the preamble on purpose: `bd70892`, decision 141 and R118 restated it after a published text carried review passes and their levels.
- The lint test's padding (`tests/lint/lint.test.mjs:215-222`) appends 1,503 and 1,453 words and expects `5850 words`, true only while `SKILL.md` is 4,347 words; any of loop-1, loop-2 or loop-7 moves both literals (to 1,992 and 1,942 after all three), and the 5,800 cap sits a third above the file. Test maintenance, not prose.
- The `checks` key rule in five copies (`SKILL.md:194`, README, `steps/4-build.md` 6.1, `steps/1-plan.md:51`), each with a test (`tests/loop/config.test.mjs:69-87`), added after acceptance item 61 failed at 0.1.10. Item 61 passed at 0.1.11 with every copy present, which cannot show one redundant.
- The instruction-file rule in Approval scope item 1 and Step 0.1.1: a stop plus two fixes (`4633864`, `c677c81`).
- The four first actions and the "before any other tool call" sentences: `5c6408b`; the `prose-trigger` eval's reading-block grader is where a shorter form would be tried first.
- Late-notification judgment in three places: decision 149, `tests/loop/review.test.mjs:181-209`.
- The `blocked` commands paragraph of `report.md:124` (171 words, from acceptance item 60) and the Approval scope, Terminal states and Questions: stops and mechanism.
- Raised in the second reading and not itself challenged: eleven supporting files open with a "Read this file at" sentence that repeats their `## Supporting files` bullet (256 words); `steps/0-preflight.md:40` restates the budget order (22 words), `steps/4-build.md:65` the call-budget end (25), `SKILL.md:43` the read-when rule (19), the `record.md` Files row for `report.md` (24).

Considered and not proposed: moving the Azure DevOps remote parsing to a file of its own (a net saving near 42 words for a new file and a new way to miss it on the path no acceptance item covers).

### Gate

The findings other than gate-7 and gate-8, which M59 takes, wait (decision 162). gate-4 and gate-14 quote text gate-8 changes in `record.md`.

**gate-1. The description names the verdict condition.** `plugins/gate/skills/gate/SKILL.md:3`. Serves R288, R219, R274. Proposed: "Run code-review passes over a pull request, several, or a loop manifest, fix what each pass finds, and stop at a verdict. Use when the user says "reimagine gate", "gate this branch", "gate PR <n>" or "gate the manifest <path>"." Saves 8 words, 38 bytes, in every session. Pins: `tests/gate/skill.test.mjs:64-73` and `tools/lint.mjs:376-384` read the phrases only; `docs/architecture.md:347` quotes the description and moves with it. Check: none exists. From reading.

**gate-2. Levels and caps restates what `next.mjs` computes and each step enforces.** `SKILL.md:100-120`. Serves R298, R301, R303, R316; decisions 130, 134. Now: a pass defined again, the five numbered rules of `next.mjs`, five Caps bullets and a "no fixes" paragraph (442 words), each also at its step. Proposed:

> ## Levels and caps
>
> Pass 1 runs at `xhigh`. Every level a run types lies between a floor of `medium` and a ceiling of `xhigh`: only `xhigh`, `high` and `medium` are ever typed, and never `low`, `max` or `ultra`.
>
> You do not choose the next level. After the fix round, `next.mjs` reads the record and returns the next level, or a stop: `pass`, or `pass-with-deferred` when any pass of the run deferred something, or `unconverged`; it names the rule that produced it (`steps/3-next.md`).
>
> The run budget is 120 minutes. "budget <n> minutes" in the request wins, then `.reimagine.json` `gate.budget`, then a session instruction. Question waits are outside it. The output of the pass is kept. A cap that ends the run is named in the report.
>
> With "no fixes" the run makes pass 1 only: nothing is edited, committed or pushed, `next.mjs` is not run, and the verdict comes from the fix bucket (`steps/3-next.md`).

Terminal states (`SKILL.md:150`) then reads "`pass`: a stop with the fix bucket empty and nothing deferred in any pass of the run, under `nothing-to-fix` or `after-medium`, or under "no fixes"." since "rule 1 or 2" would point at nothing. Every cap stop stands at its step: `steps/3-next.md` Decide 3, 4 and 6 and Resume 2, `steps/1-pass.md` 1.3.2, `steps/2-fix.md` Groups 4, Snapshots 6 and Checks 3. Saves 287 words per run (301 if the assertion at `tests/gate/skill.test.mjs:466` may move to a substring that still names `pass-with-deferred`). Pins: `:466`, kept by the text above. Check: `tests/gate/next.test.mjs`, acceptance items 47, 49 and 54. From reading.

**gate-3. Reading the request repeats Step 0.** `SKILL.md:36-37`, `:55`, `:57`, `:59`, `:75`. Serves R287, R289 to R292, R323. Proposed: delete lines 36 and 37 (the suite-order sentence); line 55 becomes "A pull request target must be open, in the session's repository and not cross-repository. A manifest is the loop's `audit-manifest.json` or one of the same shape; it runs one record per `bundles[]` entry that has a `pr` or a `branch`, in bundle order, with every git and gh command running against that bundle's `repo`. A pull request number on a host other than GitHub cannot resolve, so it is an unresolved target." (the `repo` clause governs calls made before Step 0 is read); delete the sentence of line 57 that starts "The head branch is the one checked out there"; line 59 becomes "For a pull request target the base is its `baseRefName`. For a branch target the base is "base <branch>" in the request, else the manifest bundle's `base`, else `.reimagine.json` `base`, else the remote's default branch. A bundle `base` whose first segment names a remote that `git remote` lists in the bundle's repository is read without that segment and its `/`, since the loop's manifest writes `<remote>/<base branch>`."; line 75 becomes "Targets lists each pull request or branch, how it resolved and its base; a branch target named by "repo <path>" shows its resolved toplevel. Mode is `fix` or `no fixes`. Budget gives the minutes and their source, then `max-passes` and `split`, then the subagent, review and check budgets in force, each with its source (`gate.timeouts`, root `timeouts`) when it is not the default. Engine is `subprocess`, or the stand-in with the reason for it. A configuration key that is unknown or has a bad value is reported in the block and ignored; the block reads the configuration of the repository the target runs in, which for "repo <path>" is `<path>`'s `.reimagine.json`." The cut stops (clean tree, failed fetch, a differing "base <branch>") stand in 0.5, 0.6 and 0.7. Saves 211 words per run. Pins: `tests/gate/skill.test.mjs:102-139` and `:227-237`, kept. Check: acceptance items 47, 56, 63 and 65. From reading.

**gate-4. Record restates `record.md` and Resume.** `SKILL.md:160-177`. Serves R309 to R312. Proposed:

> ## Record
>
> The record lives at `.reimagine/gate/<branch-slug>/` in the target repository. The slug is the branch name lowercased, with each run of characters outside `[a-z0-9]` replaced by `-`, cut to at most 60 characters, then trailing `-` removed. Add `.reimagine/` to the exclude file that `git rev-parse --git-path info/exclude` names, run in the target's repository and read relative to the repository's folder when it is not absolute, never to `.gitignore`, and never stage anything under it. `record.md` holds the files, the shapes of `passes.json` and `findings.json` and the write discipline; `steps/3-next.md` holds Resume.

The Resume stops stand verbatim in `steps/3-next.md` Resume 2. Take with gate-6, since the dropped sentence at line 162 points at Approval scope item 4. Saves 198 words per run. Pins: `tests/gate/skill.test.mjs:214-220`, kept. Check: acceptance item 49. From reading.

**gate-5. Roles restates the steps that perform each role.** `SKILL.md:90-98`; `report.md:55`. Proposed: the section keeps its heading and reads "The session model orchestrates and triages. A review is a child session, or an Agent at `models.fallback-reviewer` over a patch file when `claude` is not on the PATH or the child reports the skill missing, which stays for the run (`steps/1-pass.md`). An implementer is an Agent at `models.implementer`, one per disjoint file group (`steps/2-fix.md`). The gate never calls `code-review` through the Skill tool."; drop `report.md:55` ("- Review level: copy the line as it is."), which would point at nothing. Saves 133 words per run. Pins: the grouping phrases `tests/gate/skill.test.mjs:247,266` need are in the Configuration `split` bullet, kept; `docs/architecture.md:367-373` holds a copy of the table. Check: acceptance items 47 and 53. From reading.

**gate-6. Approval scope item 4 restates five stops that stand where they act.** `SKILL.md:88`. Serves R295. Proposed: delete item 4 (dirty tree, merged or closed pull request, `gh` not authenticated, the remote head before a push, slug collision), and widen `steps/0-preflight.md` 0.5 to "For every target, before any checkout, `git status --porcelain` must print nothing, ..." since a branch target has no checkout. Each stop stands with the same consequence: 0.5, 0.4.2, 0.4.1, `steps/2-fix.md` "The remote head and the push" 1 to 3, and 0.8.4 (with gate-8). Saves 102 words per run. Pins: the step copies, at `tests/gate/skill.test.mjs:296-303,421-423`. Check: none exists for the blocked stops. Residual risk: a step file is not kept by a compaction the way the invoked body is; a push over a moved head would still be refused by git without force. From reading.

**gate-9. Step 3 lists the five rule conditions again.** `steps/3-next.md:9-17`. Serves R301, R303, decision 130. Proposed: "3. Otherwise `max-passes` is `.reimagine.json` `gate.max-passes`, else 4. Run `node "<scripts>/next.mjs" <absolute passes.json> <max-passes>`, where `<scripts>` is the path on the reading block's Scripts line. It prints one JSON line, `{"stop": "<verdict>", "rule": "<rule>"}` or `{"level": "<level>", "rule": "<rule>"[, "capped": "max-passes"]}`, the rule being `nothing-to-fix`, `after-medium`, `wide-fix`, `rejects-at-high` or `otherwise`; a level is marked `"capped": "max-passes"` when the run's passes number `max-passes` or more, and a stop is never capped. A non-zero exit ends the run `blocked` with the script's stderr line, since the record cannot decide the next step; the pass stays `running`." and "4. A level that `next.mjs` did not cap is checked against the run budget on the reading block's Budget line before the next pass starts: the time from the run's `started` to now, with the waits for questions left out. When it is spent, add `"capped": "budget"` to the object." Saves 125 words per read, the file being read at each pass. Pins: `tests/gate/skill.test.mjs:453-455`, kept. Check: `tests/gate/next.test.mjs`, acceptance items 47, 49, 54. From reading.

**gate-10. Step 4.1 restates the five states, and `report.md` restates its write.** `steps/4-publish.md:5-19`; `report.md:7-10`. Serves R314, R316, R317. Proposed: 4.1 keeps its heading and becomes three paragraphs: "`pass`, `pass-with-deferred` and `unconverged` publish the comment, which lists the deferred findings; the report of an `unconverged` run lists every open finding. `blocked` and `stopped` post nothing.", ""no fixes" is one pass, and the comment and the report name the fix bucket, with its reasons, as what a fix run would do, beside the deferred and the rejected. Nothing was edited, committed or pushed, so the comment lists no commits." and "A run that Step 3, Resume, ended on a stop already in the record posts nothing: it writes 4.2, 4.3 and 4.5 only."; `report.md:7-10` becomes "Before Step 0.8 the record does not exist, so the report is printed only; it names the preflight item that failed and the fix." and the headless sentence after it stays. The report's write method (a temporary file and `mv`) stands in 0.8.7, which covers every record file. Saves 195 words per target. Pins: `tests/gate/skill.test.mjs:484,505`, kept. Check: acceptance items 50, 53, 54. From reading.

**gate-11. The implementer brief spells out a line-ending method.** `steps/2-fix.md:34`. Serves R300. Proposed: "4. The repository's line-ending convention: a file's `eol=` attribute, else any ending when `text` or `text=auto` applies, else the majority working-tree ending of its directory, else of the repository (`git ls-files --eol` shows them). The implementer never changes the line endings of a file it edits." It keeps the three cases "Reading the fix" needs for "the expected one". Saves 14 words per read. Pins: none in `tests/gate`; the loop's twin at `steps/4-build.md:29` should move with it. From reading.

**gate-12. Step openers repeat the routing and say `SKILL.md` stays in force.** `steps/0-preflight.md:3` (last sentence), `1-pass.md:3`, `2-fix.md:3`, `3-next.md:3`, `4-publish.md:3` (the routing sentences), `report.md:3`, and "SKILL.md stays in force" in four files. Serves none found; R219 asks each file to end with a hand-off, not to open with one. Proposed: delete those sentences; keep every pinned opener sentence (`before any other tool call`, `does not print the block again`, the double-quotes sentence, the `git -C` restatement) and `2-fix.md:3`'s "Nothing is edited while a review runs, and nothing before this step.", which has no copy elsewhere. Saves 193 words once, about 400 for a three-pass run. Pins: `tests/gate/skill.test.mjs:152-156,201-203,339-345`, kept. Check: acceptance items 47 to 49 run the sequence. From reading.

**gate-13. The prediction procedure of the permission statement.** `steps/0-preflight.md:26-33`. Serves R294, R323 (the loop's R75 asks for the method; the gate's requirements do not). Proposed: replace "Judge each from the permission mode the session states and the allow rules in the user, project and local settings files (...)" and "An action runs unprompted only when the mode approves it, or an allow rule matches its command and no ask or deny rule does." with "Judge each from the permission mode and the allow rules in the settings files." The template, the `this run will prompt at` line, the instruction directory and "count as prompts" stay. Saves 36 words per run. Low: a wrong prediction is the cost. From reading.

**gate-14. The exclude-file sentence in three files.** `SKILL.md:162` (in gate-4's text), `record.md:9` (in gate-8's text), `steps/0-preflight.md:63`. Serves R309, decision 153. Proposed: keep it only in 0.8.2, the step that acts; the fixes `f05ba1b` and `5a13914` were failures at that step, and the other copies were edited with it because `tests/gate/skill.test.mjs:214-220` pins all three. Saves 83 words per run. Pins: `:218-219` move to the 0.8.2 assertion at `:217`; `:220` stays. From reading.

Notes, not proposed:

- The `git -C "<path>"` forms restated in each later step: `1773b21` and issue 47 (a fix round sent `cd` and `git` when the form stood only in Step 0.2), pinned at `tests/gate/skill.test.mjs:141-156`.
- The grouping rule, 533 words with worked examples: decision 145 chose prose over a script because "a worked example makes exact", decision 150 amended it after a field run; pinned at `:239-268,290-294`.
- The write rule repeated in five files: the loop's `8ba1d87` (a flagged `mv` the host refused) is the failure behind "no flags"; pinned at `:327`.
- Implementer brief item 2 (`steps/2-fix.md:32`) sends each implementer to read the instruction files that, by the host's documentation, it already loads for a target in the session's folder; no implementer launch was observed, so the premise is unverified.
- Raised in the second reading and not itself challenged: `steps/3-next.md:24` "and re-sized the diff" names a step Step 0 does not have (6 words); `record.md:28` restates Resume 5 and the Files rows (about 60 words, with a pin move at `:402`); the first two sentences of `SKILL.md:38` restate the description (about 60); `docs/architecture.md:335-337` says `steps/3-next.md` holds terminal states, which it does not.
- Compaction: at 3.3 to 4 characters per token only Supporting files (from character 16,617 of 17,565) can fall outside 5,000 tokens, so the gate's `SKILL.md` has no tail problem worth a move.

### Primer

Nothing now: the findings ride the next primer release, which owes items 28 to 33 anyway (decision 162).

**primer-1. The description's second sentence.** `plugins/primer/skills/primer/SKILL.md:3`. Serves R245, R219, R274, decision 84. Proposed: "Keeps the CLAUDE.md, rules and skills of a repository in the forms Claude Code loads." (it keeps the only `CLAUDE.md` and `rules` keywords in the always-loaded text). Saves 9 words, 70 bytes, in every session. Pins: `tests/primer/skill.test.mjs:31` reads the phrases before it. Check: acceptance item 33 reruns when the description changes; the `mode-line` eval fires on an exact phrase only, so a looser prompt naming the file is untested. From reading.

**primer-2. Init and adopt load in every run, the steady-state maintain run included.** `SKILL.md:71-107`. Serves R237, R248, R249. Now: 781 words of Init and Adopt in the one body, read by every maintain and prose-route run. Proposed: move Init (`:71-78`) to `init.md` and Adopt steps 2 to 6 and 9 (`:80-91`, `:107`) to `adopt.md`, each named where the mode is chosen; keep in `SKILL.md` an un-numbered `## Plans` section after Proposals holding step 7's lead and plan block (`:92-104`) and step 8's first sentence (the pinned literal at `tests/primer/skill.test.mjs:84` loses its `8. `); `:132` points at "the form of Plans"; `:118` becomes "- an import of a file git does not track or outside the repository, other tools' rule files and personal content are reported and left in place;". Saves about 665 words per maintain or prose run, 365 per init run, 280 per adopt run. Needs R237 amended ("and nothing else") and `docs/architecture.md:436-444` first; pins at `tests/primer/skill.test.mjs:17-19,70-86,130-139`. Risk: a file read mid-run is not kept by a compaction the way the body is. Check: acceptance items 28 and 29. From reading.

**primer-3. Init steps 3 to 5 restate `shapes.md` and `placement.md`.** `SKILL.md:75-77`. Serves R238, R248. Proposed: "3. Write the root `CLAUDE.md` in the hub shape of `shapes.md`, from the files just read. Leave it uncommitted and unstaged.", "4. Check the hub against `shapes.md` before replying, the backticked paths of its opening paragraph included. Fix any miss." and "5. Propose what the repository shows, each placed by `placement.md` and shown in the form of Proposals; for skills, use the repository sources of Maintain step 4. Ask once which to write, by number. Write none without a yes; on a yes, write the ones named, uncommitted." (step 5 keeps the script and build-target source R248 and acceptance item 28 name). Saves 139 words per run. Pins: `tests/primer/skill.test.mjs:72-73`, kept verbatim. Check: acceptance item 28. From reading.

**primer-4. `SKILL.md` repeats itself across its sections.** `SKILL.md` lines 21, 30, 36, 43, 44, 51, 67, 69, 89, 90. Serves R246, R247, R249, R253, R257; decision 54. Proposed: delete line 21's first sentence (20 words; the pinned second stays); line 30 reads "the mode line's reason names the item" (4); delete line 36's second sentence (15; `placement.md` items 1 and 2 hold it); delete line 43 (9); line 44 becomes "- One yes covers the commits the plan lists." (25; it keeps decision 54's purpose); delete line 51's first sentence (19); drop "A `user` note is never proposed." from line 67 (6; pinned in Maintain step 3), keeping its disclosure sentence, which a prose-route proposal shows with no plan; delete line 69, the rule and nested proposal form no requirement states (40); drop the long-document clause of line 89 (14); delete line 90's second sentence (16; `shapes.md` holds it). Saves 168 words per run. Pins: none for the cut text. Check: acceptance items 28, 29, 31 and 33. From reading.

**primer-5. `placement.md` says the same thing in four places.** `placement.md:3, 17, 19, 29, 47, 51, 57, 59, 61-69`. Serves R241, R252, R253, R255. Proposed: `## Skill or rule` becomes "A skill is for steps done in order with checks. A rule is for a fact. A checklist with no order, such as a list of things to avoid, is a set of facts: place each by the items above."; delete lines 47, 29 and 19 and line 3's last sentence; line 17 becomes "When the tasks test fails, take the next item that fits; do not widen or narrow a destination to make a piece fit."; the personal-content lines become "List each personal preference found in the hub or a rule (first person, a path on one machine, a taste) in the plan or the report, in this form:", "Leave the line in place; the user decides." and "Quote the line as found."; item 9 ends "...a `docs/` page that `README.md` links; a long `README.md` splits into such pages." Keep both worked examples, which after line 29 goes are the only text showing each error. Saves 210 words per run. Pins: the item numbering and the form line (`tests/primer/skill.test.mjs:146-159`), kept. Check: acceptance items 29, 32 and 33. From reading.

**primer-6. `shapes.md` repeats facts it and the other two files hold.** `shapes.md:3, 60, 83, 84, 113, 115, 118-120, 131-137, 139-141`. Serves R239, R242 to R244, R254; decisions 82, 159. Proposed: delete `## The person's own files` (48) and `## docs pages` (56); under `## Imports, prose and history` keep "- Every instruction file is declarative prose. Never reword a dated or historical entry; append a correction." and "- Delete no real constraint to shorten a file." (decision 159 quotes it); line 84 becomes "- A rule or skill never holds an `@path` import: the host does not expand it inside `.claude/rules/`. To send the reader to a `docs/` file, name it in words and say when to read it."; delete line 3's last sentence and make `SKILL.md:21` read "Before writing, moving, proposing or checking anything, read ..."; delete the four sentences at lines 60, 83, 113 and 115 that `placement.md` and the tasks test hold. Saves 211 words per run. Pins: `tests/primer/skill.test.mjs:142-143`, untouched. Check: acceptance items 28 and 29. From reading.

**primer-7. The drift hook's denial handling.** `SKILL.md:47`. Serves R247. Proposed: "- When the drift hook denies a commit, fix its findings and commit again; never route around it. Recheck the files its advice names before the next commit." The stop stays; the advice text has no timing, so "before the next commit" stays. Saves 10 words per run. From reading.

Notes, not proposed:

- The proposal forms, the adopt plan block and the `shapes.md` templates: what primer writes and the hook checks (R253, R257, R238 to R240, R254).
- Lines with a failure behind them, found in the retired repo-docs plugin's history as well as primer's: `SKILL.md:25` (`ada906b`), `:26-28` (`a281073`: a gitignored `CLAUDE.md` read as absent), `:29` (`ccb9e07`), `:45` (`9df8e31`), `:91` (`7ca20b6`: adopt kept an untrue hub line), `:117` (`6769cf1`), `:120` (`f08724c`). A cut in this plugin should search a line's subject across `plugins/`, retired history included.
- `SKILL.md` is 134 lines, under its own 150-line cap, and 2,373 words; a line cap cannot see words.
- The hook strings are R258, R262 and R263 literals compared byte for byte.
- One release for all of it: acceptance items 28, 29, 31, 32 and 33 rerun when the skill changes.

### Rules

Each edit under `plugins/rules/` is a release (the lint tag rule at `tools/lint.mjs:626`, the version literals in `tests/rules/rules.test.mjs`). M59 takes rules-1, rules-4, rules-5 and rules-7 (decision 163).

- rules-2 stays. `core.md:70-71`, "After integrating base changes that touch the fix, rerun its behavioral check even without conflicts.", has no failure on record, and no clean merge that broke a passed fix is on record or recalled; a recorded case reopens it.
- rules-3. `core.md:8-9`: move "a second option only when it wins under a condition I control, and name it" into the decision item and delete item 1's sentence, which the decision item partly holds. 8 words; it changes the item R233 quotes and `tests/rules/rules.test.mjs:88` asserts. Low value.
- rules-6. `chat/instructions.md:54`, "Editing my text", returns the change line after the text while the revised-draft bullet (`:41`) puts it above. "Return the text, with one line above it on what changed if it isn't obvious." aligns them (+2 words). Unverified that a chat session shows the conflict.
- Fact for the owner: the chat block is 4,997 characters between its fences, against the 3,995 decision 68 saw saved whole; it reopens on a field that cuts the block off.

### This repository

M59 takes every finding here (decision 164). Notes the review left alone:

- The rules-feedback Principles bullets (`SKILL.md:15-17`) repeat the hub and the house rules at the point where the record is drafted: decision 157 says the skill "carries the same principle", decision 159 and `docs/build-plan.md:1027` fix the section's shape. A decision 148 repetition.
- The retired-plugin clause (`CLAUDE.md:4`, 11 words) is held by R268 without a check: lint does not require a heading per tag of a retired plugin. With repo-1 it is the second sentence R238 needs.
- Hub lines 11, 18 and 19 repeat the house rules and have failures behind them while both were loaded: a commit trailer naming a model, recreated as `26ee528`, and decision 141's review rounds in a pull request description. Decision 1 makes the repository stand on its own files.
- The release skill's Checks and Report sections are R254's skill template (`plugins/primer/skills/primer/shapes.md:97`, `:106`); dropping Report is primer's call first.
- R277 says `## Commands` holds the area scripts and the policy "in one line"; the hub uses two bullets.
- Decision 10 and `docs/build-plan.md:3` put the deny-token sweep before every commit; the hub puts lint with the deny tokens once per milestone before the push, the cadence R277 sets for lint, and the hub is the one followed.

### What acting would cost

Every plugin that changes takes a version (R14), a changelog heading (R15) and the catalog's `metadata.version`, and owes the acceptance items run at each release (21, 22, 38, 39, 44) plus those whose rerun clause the change meets (decision 160).

- Audit, audit-14 to audit-27. Items 14 ("when a stage changes"), 15 ("when pass one, pass two or act changes"), 42 and 43 for the stage files; 16 for `live.md` and `resume.md`; 35, 37 and 52 for stage 1; 59 for the report. Moves with the text: the `scripts/ledger.sh:20` comment (audit-21); two `lint.sh` step greps, `docs/architecture.md:296` and a new file (audit-16); the `plugin_version` line index of `tests/release/release.test.mjs` for `stages/1-orient.md:282` (audit-20 deletes lines above it) and `resume.md:156` (audit-25).
- Loop. Items 7 and 25 (the description), 8, 11, 12, 41, 45 and 67 (Step 0), 10 (the record), 46 (the report), 62 (the brief). Moves with the text: the two padding literals of `tests/lint/lint.test.mjs:215-222` on any `SKILL.md` cut; `tests/loop/review.test.mjs:48-50,96-100`; `tests/loop/publish.test.mjs:126,131` and `tests/loop/handoff.test.mjs:70-76`, which go with the text they pin; `docs/architecture.md:161,171`. Saving: about 2,000 tokens per run.
- Gate. Items 47 ("when a pass step changes"), 49 (caps or resume), 51 (each gate release), 53, 54, 57, 63, 65 and 66, each a gate run with its child reviews. Moves with the text: optionally `tests/gate/skill.test.mjs:466` (gate-2), and `:218-219`, which go with the copies gate-14 deletes; `docs/architecture.md:335-337,347,363,367-373`. Saving: about 3,100 tokens per run, more when `steps/1-pass.md` and `steps/3-next.md` are read at each pass.
- Primer. Items 28, 29, 31, 32 and 33 (the skill and the description) and 36 (each primer release), all hand-run, none yet on macOS. primer-2 needs R237 amended and `docs/architecture.md:436-444` first. Saving: about 960 tokens per run, about 1,600 for a maintain run with primer-2.
- Rules. Each edit is a release with its digest literals, rule count where an item goes, a house-rule edit number, a decision entry and items 2 and 39.
The tests pin the prose closely, so most cuts move a test in the same commit: sentences asserted word for word number about 63 in the loop's tests, 42 in the gate's, 10 in primer's, 14 in the rules' beside the digests that pin every byte of `core.md` and `windows.md`, and about 50 literal greps over the audit files in `tests/audit/lint.sh`. Three pins break on any edit of their file: the lint padding for the loop's `SKILL.md` (`tests/lint/lint.test.mjs:215-222`), `common.md` read by line position (`tests/audit/run-copies.sh:155-186`), and the `passes.json` block of the gate's `record.md`, which must equal `docs/architecture.md`'s (`tests/gate/skill.test.mjs:444-451`). Three `plugin_version` literals are pinned by line index (`tests/release/release.test.mjs:136-149,164`).

## Agent-read prose cuts: M59

Added 2026-11-01. Decisions 160 to 164 and R325: applies the cuts the owner took from M58, in audit 0.1.10, gate 0.1.6 and rules 0.1.16, and in this repository's own prose with no release. M59 touches `docs/`, `CHANGELOG.md`, `CLAUDE.md`, `.claude/rules/plugins.md`, `.claude/skills/`, `.claude-plugin/marketplace.json`, `plugins/audit/`, `plugins/gate/`, `plugins/rules/`, `tests/audit/`, `tests/gate/` and `tests/rules/`. The finding texts are in `docs/build-plan.md` at 39723bc, each with its file and lines at e8c3fc8. It builds on the pull request of M58 and merges after it. Tags wait for the owner's merge.

### M59: the cuts

Work items, in this order:

1. The design documents: decisions 160 to 164, R325, this section and the cut of M58. Commit: `docs(design): specify the agent-read prose cuts`.
2. repo-1 to repo-5, repo-7 and repo-8 with the three corrections: the release skill's flow (repo-6), its two omitted edits and hub line 18 behind R11. repo-1's cut and the split of the hub's first sentence are one edit, since the split keeps R238's two sentences, and repo-6 and repo-7 overlap on the CI parenthetical. Commit: `docs(repo): cut what the hub, the plugins rule and the skills repeat`.
3. `node tools/release.mjs rules 0.1.16`, with the catalog raised and the version literals of `tests/rules/rules.test.mjs` moved. Commit: `release(rules): 0.1.16`.
4. `tests/rules/rules.test.mjs` first: an absence assertion for R325, seen failing against the unchanged `core.md`; then rules-1 in `core.md` and the shipped digest literals, moved by running the suite and pasting the observed values (decision 11). Commit: `feat(rules): drop the sentence the unverified-cause item holds`.
5. rules-4, rules-5 and rules-7. Commit: `refactor(rules): cut what the skill and the chat block repeat`.
6. `node tools/release.mjs gate 0.1.6` with the catalog raised; before it, items 47, 49, 57 and 66 and 51 at 0.1.5, whose records are older. Commit: `release(gate): 0.1.6`.
7. gate-7 and gate-8, with `docs/architecture.md` where it copies the record. Commit: `refactor(gate): cut what record.md repeats from its steps`. Then the two headings: `docs(changelog): add the gate 0.1.6 and rules 0.1.16 headings`.
8. Before any audit cut, items 14 and 15 at 0.1.9, and items 37, 42 and 58, whose records are older than 0.1.9. Item 15 under 18 of 20 stops the audit part (decision 161).
9. `node tools/release.mjs audit 0.1.10`, with the catalog `metadata.version` raised by one. Commit: `release(audit): 0.1.10`.
10. audit-1 to audit-13, with their pins: the nine-line lead of `common.md` that `tests/audit/run-copies.sh` reads by position (audit-8), the `plugin_version` line of `SKILL.md` that `tests/release/release.test.mjs` reads by index (audit-2), the `lint.sh` loops, the `scripts/ledger.sh:150` comment, `docs/architecture.md:292` and `tests/audit/fixture/expected.md:636` (audit-9), `lint.sh:559` (audit-5). Commits: `refactor(audit): ...`, one per cohesive group.
11. The `## audit 0.1.10 - <date>` heading. Commit: `docs(changelog): add the audit 0.1.10 heading`.
12. The after-runs: for audit items 14, 15, 37, 42, 58 and 68, for gate items 47, 49, 51, 57 and 66, for rules items 2 and 4; items 22 and 39 for the releases and item 30 for the hub, its text moved to the current marketplace name. Each is compared with its before-run. Commit: `docs(acceptance): record the agent-read prose cuts`.
13. A review of the whole change, with its fixes as `fix(...)` commits, then the after-runs again at the final text: audit items 14, 15, 37, 42, 58 and 68, gate items 47 and 49, and item 39. Commit: `docs(acceptance): record the reruns at the final text`.
14. After the merge, by the owner: the three tags after a yes; then item 21 on the merge commit. Items that need another machine are recorded as not run with the reason.

Check: the area scripts that cover each commit, each run as its own command with its exit code read; `npm test` and lint with the deny tokens before the push.

## Commit message check: M60

Added 2026-11-02. Decision 165 and R222 as amended: CI fails a pull request whose commit messages hold a session attribution line. M60 touches `.github/workflows/ci.yml`, `tools/`, `tests/lint/` and `docs/`, and no plugin, so it has no release.

### M60: the check

Work items, in this order:

1. The design documents, then `tests/lint/commit-messages.test.mjs`, seen failing with no script, then `tools/commit-messages.mjs` and the job in `.github/workflows/ci.yml`. Commit: `ci(repo): fail a pull request on a session attribution line`.
2. The record of M59's merge, its tags and item 21 on the merge commit. Commit: `docs(acceptance): record audit 0.1.10, gate 0.1.6 and rules 0.1.16`.

Check: `npm run test:lint`; the script run against the range of a branch that held the line exits 1, and against the same branch without it exits 0; `npm test` and `npm run lint` before the push; item 21 on the pull request's own run.

## Docs fold-back skill: M61

Added 2026-11-02. Decision 166, R326 to R329 and R237 as amended: `/primer:fold` in primer 0.1.2, with the placement sentence on skill descriptions corrected. M61 touches `docs/`, `CHANGELOG.md`, `README.md`, `.claude-plugin/marketplace.json`, `plugins/primer/` and `tests/primer/`. Tags wait for the owner's merge.

### M61: the fold skill

Work items, in this order:

1. The design documents. Commit: `docs(design): specify the primer fold skill`.
2. `node tools/release.mjs primer 0.1.2`, with the catalog `metadata.version` raised to 0.1.22. Commit: `release(primer): 0.1.2`.
3. `tests/primer/skill.test.mjs` first: the fold skill's frontmatter, tools, directory and cap, and the corrected placement sentence, each seen failing; then `skills/fold/SKILL.md`, the sentence in `placement.md`, and one line each in the root and the plugin `README.md`. Commit: `feat(primer): add the fold skill`.
4. The `## primer 0.1.2 - <date>` heading, which also covers the marketplace rename of the untagged 0.1.1. Commit: `docs(changelog): add the primer 0.1.2 heading`.
5. Items 69 to 72, each run's tokens and minutes recorded, and the release items 22, 39 and 44; 71 and 72 run interactively. A fix a run calls for is its own `fix(primer)` commit, and the item runs again after it. Item 38 rests on its last run, since no description it asserts on changes and prose cannot invoke fold. Commit: `docs(acceptance): record primer 0.1.2`.
6. After the merge, by the owner: the tag after a yes, then item 21 on the merge commit.

Check: `npm run test:primer` after each commit that touches it; `npm test` and `npm run lint` with the deny tokens before the push.

## Rule-driven refactor skill: M62

Added 2026-11-02. Decision 167 and R330 to R333: `/rules:refactor` in rules 0.1.17. M62 touches `docs/`, `CHANGELOG.md`, `README.md`, `.claude-plugin/marketplace.json`, `plugins/rules/` and `tests/rules/`. It builds on the pull request of M61 and merges after it. Tags wait for the owner's merge.

### M62: the refactor skill

Work items, in this order:

1. The design documents. Commit: `docs(design): specify the rules refactor skill`.
2. `node tools/release.mjs rules 0.1.17`, with the catalog `metadata.version` raised to 0.1.23 and the version literals of `tests/rules/rules.test.mjs` moved. Commit: `release(rules): 0.1.17`.
3. `tests/rules/skill.test.mjs` first: the refactor skill's frontmatter, tools, directory and cap, each seen failing; then `skills/refactor/SKILL.md` and one line each in the root and the plugin `README.md`. Commit: `feat(rules): add the refactor skill`.
4. The `## rules 0.1.17 - <date>` heading. Commit: `docs(changelog): add the rules 0.1.17 heading`.
5. Items 73 to 75, each run's tokens and minutes recorded, and the release items 22, 39 and 44. A fix a run calls for is its own `fix(rules)` commit, and the item runs again after it. Items 2 and 4 rest on their runs at 0.1.16, since `core.md`, the script and `/rules` do not change; item 38 rests as in M61. Commit: `docs(acceptance): record rules 0.1.17`.
6. After the merge, by the owner: the tag after a yes, then item 21 on the merge commit.

Check: `npm run test:rules` after each commit that touches it; `npm test` and `npm run lint` with the deny tokens before the push.

## Growth test clock: M63

Added 2026-11-02. Decision 168 and issue 45: the growth test of `units` and `imports` reads CPU time. M63 touches `tests/rules/` and `docs/`, and no plugin, so it has no release.

### M63: the clock

Work items, in this order:

1. The design documents, then `tests/rules/rules.test.mjs`: `timed` reads `process.cpuUsage()`, each side is its median batch, and a batch runs at least 100 ms; the threshold stays 10. Commit: `test(rules): time the growth test by cpu, not the wall clock`.
2. The record of the merges of M61 and M62, their tags and item 21 on each merge commit. Commit: `docs(acceptance): record primer 0.1.2, rules 0.1.17 and the growth test clock`.

Check: the changed test fails on a quadratic function and passes on `units` and `imports`; `npm test` several times, where the old test failed; `npm run test:rules` and `npm run lint` before the push; item 21 on the pull request's own run, Windows included.

## Settings keys and skill failures: M64

Added 2026-11-02. Decision 169 and R241, R246, R255 and R257 as amended: placement item 2 gains the settings keys that enforce, a failure seen only when a skill runs goes into its step, and maintain may change an existing skill by a promoted line, in primer 0.1.3. M64 touches `docs/`, `CHANGELOG.md`, `.claude-plugin/marketplace.json`, `plugins/primer/` and `tests/primer/`. Tags wait for the owner's merge.

### M64: the placement sentences

Work items, in this order:

1. `tests/primer/skill.test.mjs` first: the settings key sentences of item 2, the skill failure bullet and the maintain exception, each seen failing; then `placement.md` and `SKILL.md`. Commit: `feat(primer): place enforced settings keys and skill-run failures`.
2. The design documents. Commit: `docs(design): record the settings key and skill failure placements`.
3. `node tools/release.mjs primer 0.1.3`, with the catalog `metadata.version` raised to 0.1.24. Commit: `release(primer): 0.1.3`.
4. The `## primer 0.1.3 - <date>` heading. Commit: `docs(changelog): add the primer 0.1.3 heading`.
5. The gate on the branch with checks `npm test; npm run lint`, its fixes committed on the branch.
6. The release items 22, 39 and 44, and items 32, 33 and 69, which rerun when promote, propose or a primer reference file changes. Commit: `docs(acceptance): record primer 0.1.3`.
7. After the merge, by the owner: the tag after a yes, then item 21 on the merge commit.

Check: `npm run test:primer` before and after item 1; `npm test` and `npm run lint` with the deny tokens before the push.

## Attribution trailer in primer and the audit: M65

Added 2026-11-02. Decision 170 and issue 65: primer's commits and the audit's act commits keep the trailer the host adds, as R11 already says, in primer 0.1.4 and audit 0.1.11. M65 touches `docs/`, `CHANGELOG.md`, `.claude-plugin/marketplace.json`, `plugins/primer/`, `plugins/audit/`, `tests/primer/` and `tests/audit/`. Tags wait for the owner's merge.

### M65: the trailer

Work items, in this order:

1. The design documents. Commit: `docs(design): keep the host's attribution trailer in primer and the audit`.
2. `node tools/release.mjs primer 0.1.4` and `node tools/release.mjs audit 0.1.11`, with the catalog `metadata.version` raised to 0.1.26. Commits: `release(primer): 0.1.4` and `release(audit): 0.1.11`.
3. The tests first, each seen failing; then primer's `SKILL.md` and the audit's `stages/9-act.md`. Commits: `fix(primer): keep the host's attribution trailer` and `fix(audit): keep the host's attribution trailer`.
4. The `## primer 0.1.4 - <date>` and `## audit 0.1.11 - <date>` headings. Commit: `docs(changelog): add the primer 0.1.4 and audit 0.1.11 headings`.
5. The record of M64's merge, its tag and item 21 on the merge commit. Commit: `docs(acceptance): record the primer 0.1.3 merge`.
6. The release items 22, 39 and 44, items 28 and 29, which rerun when the primer skill or adopt changes, item 15, which reruns when act changes, and item 16, which reruns when resume changes, as the release changes the version `resume.md` carries. Commit: `docs(acceptance): record primer 0.1.4 and audit 0.1.11`.
7. After the merge, by the owner: the tags after a yes, then item 21 on the merge commit.

Check: `npm run test:primer` and `npm run test:audit` before and after item 3; `npm test` and `npm run lint` with the deny tokens before the push.

## Pull request description check: M66

Added 2026-11-02. Decision 171, issue 66 and R222 as amended: CI fails a pull request whose description holds a session attribution line, and checks it again when the description is edited. M66 touches `.github/workflows/`, `tools/`, `tests/lint/` and `docs/`, and no plugin, so it has no release.

### M66: the check

Work items, in this order:

1. The design documents, then the tests in `tests/lint/commit-messages.test.mjs` and `tests/lint/ci.test.mjs`, seen failing, then the `--description` mode of `tools/commit-messages.mjs` and `.github/workflows/pr-description.yml`. Commit: `ci(repo): fail a pull request on a session link in its description`.
2. The record of M65's merge, its tags and item 21 on the merge commit. Commit: `docs(acceptance): record the primer 0.1.4 and audit 0.1.11 merge`.

Check: `npm run test:lint` before and after item 1; `npm test` and `npm run lint` with the deny tokens before the push; item 21 on the pull request's own run, the description check included.

## First fold and refactor review: M67

Added 2026-11-03. Decision 172, issues 69 to 72, R16, R224, R240, R262, R265, R273 and R331 as amended and R319 retired: the fold and refactor findings that hold on this repository, the primer character cap in primer 0.1.5, the refactor second-pass brief in rules 0.1.18, and the record each review of this repository keeps. M67 touches `docs/`, `CHANGELOG.md`, `.claude/settings.json`, `.gitignore`, `.claude-plugin/marketplace.json`, `plugins/primer/`, `plugins/rules/`, `tools/`, `tests/primer/`, `tests/rules/` and `tests/release/`. Tags wait for the owner's merge.

### M67: the review

Work items, in this order:

1. The design documents, with items 38, 69 and 73 amended. Commit: `docs(design): record the first fold and refactor review of this repository`.
2. `node tools/release.mjs primer 0.1.5`, with the catalog `metadata.version` raised to 0.1.27. Commit: `release(primer): 0.1.5`.
3. `node tools/release.mjs rules 0.1.18`, with the catalog `metadata.version` raised to 0.1.28 and the version literals of `tests/rules/rules.test.mjs` moved. Commit: `release(rules): 0.1.18`.
4. `.claude/settings.json` sets `attribution` in its object form. Commit: `chore(repo): turn off the host attribution in this repository`.
5. The record phrases that locate a session, in the decisions and the changelog. Commit: `docs(design): cut the record phrases that locate a session`.
6. The test first in `tests/rules/skill.test.mjs`, seen failing; then the second pass of `skills/refactor/SKILL.md`. Commit: `fix(rules): refute a refactor finding a test or decision holds`.
7. The tests first in `tests/primer/`, each seen failing; then `drift.sh`, `shapes.md` and the plugin `README.md`. Commit: `feat(primer): cap a nested file and a rule at 40,000 characters`.
8. One module for the file listing and the `plugin_version` scan that lint and release share. Commit: `refactor(tools): share the file listing and literal scan of lint and release`.
9. The release test finds the audit version lines by their content. Commit: `test(release): find the audit version lines by content`.
10. The ignore entry of the dropped gate eval cases. Commit: `chore(repo): drop the ignore entry of the dropped gate eval cases`.
11. The `## primer 0.1.5 - <date>` and `## rules 0.1.18 - <date>` headings. Commit: `docs(changelog): add the primer 0.1.5 and rules 0.1.18 headings`.
12. The gate on the branch in fix mode with checks `npm test; npm run lint`, its fixes committed on the branch.
13. What the attribution check and item 73 showed after the gate: requirement 16 and decision 172 on what the tracked attribution setting does, and the character cap in the architecture's caps table. Commits: `docs(design): record that the tracked attribution setting is not the rule's enforcement` and `docs(design): give the architecture's caps table the character cap`.
14. Items 69, 73 and 74, each record listing every recommended item and bundle with its verdict, the release items 22 and 39, and a commit in a throwaway clone with and without the attribution setting. Item 75 rests on its last run, since the tickets do not change; items 2 and 4 rest, since `core.md` does not change. Commit: `docs(acceptance): record the m67 review, primer 0.1.5 and rules 0.1.18`.
15. After the merge, by the owner: the tags after a yes, then item 21 on the merge commit.

Check: `npm run test:primer` before and after item 7, `npm run test:rules` before and after item 6, `npm run test:lint` and `npm run test:release` before and after items 8 and 9; `npm test` and `npm run lint` with the deny tokens before the push.

## Acceptance record

Every milestone's acceptance items are run in a scratch profile (`CLAUDE_CONFIG_DIR` outside the repository) and recorded in acceptance.md with date, machine and versions. An item that cannot run is recorded as not run with the reason.

## Out of scope

Everything in requirements 225 to 231, 266 and 276.

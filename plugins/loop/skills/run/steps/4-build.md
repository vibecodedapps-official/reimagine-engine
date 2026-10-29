# Steps 3.6 to 6: confirm, set up, build, review, check

Read this file when Step 3 ends with a final plan in a run that is not plan-only: at the start of 3.6 when the plan is to be confirmed ("confirm the plan"), else at the start of 3.7. It holds the implementer snapshots, the implementer brief, and Steps 3.6, 3.7, 4, 5 and 6.

At the start of each step run `date -u +%Y-%m-%dT%H:%M:%SZ` and copy its output. Then apply `record.md`, Reuse and resume: a reused step is not run, and its entry stays as it is. Otherwise write the step's `steps.json` entry as `running` with its inputs as `record.md`, steps.json, item 5, lists them (for Step 4 the `git hash-object --no-filters` hash of `plan.md`; for Steps 5 and 6 that hash and `head`), and write it `complete` only after its outputs exist: the step's section of `run.md` and, where the step takes them, the snapshot and patch files. Steps 3.6 and 3.7 belong to Step 3: its entry stays `running` through them, with the `plan.md` hash rewritten after any revision. When Step 3 is reused, they still run (`record.md`, Reuse and resume, item 7) and its entry stays as it is unless a revision gives Step 3 a round. Write it `complete`, with `plan.md` as its output, at the end of 3.7 after setup succeeds. A confirmation or setup outcome that ends the run `blocked` marks the entry `failed`; for `plan-only` and `stopped` leave the entry as it is and let Final report handling in SKILL.md record the terminal state. Every file named here without a directory lives in the record (`record.md`). Every step is capped at three rounds, except Step 5, which is one pass.

## Implementer snapshots

Take a snapshot before every implementer call and every fix call, in the checkout that call edits (the primary checkout, a worktree, or an additional repository). From Step 3.7 on, also take a snapshot before each question (SKILL.md, Questions); its `run.md` line names the question instead of a slice.

1. Write three files in the record: `pre-<n>.status` holds the output of `git status --porcelain --untracked-files=all`; `pre-<n>.patch` holds the output of `git diff` (tracked and intent-to-add paths); `pre-<n>.hashes` holds one line per untracked, non-ignored file outside `.reimagine/`, the output of `git hash-object -- <path>` followed by the path. Read each path from a status line unquoted and unescaped when status prints it in double quotes, and for a rename (`old -> new`) take the new path. Number `n` as `record.md`, Files, says: one more than the highest in the record, so it is unique across checkouts, calls and runs. Add a line to `run.md` naming `n`, the checkout path and the slice (or the question).
2. A parallel batch (4.2) takes one snapshot per slice before any call of the batch starts.
3. After a call fails, compare the checkout with its snapshot: status, diff and hashes. A call fails when it ends in a tool error or returns past the subagent budget, judged as SKILL.md, Budgets and rounds, says. For a parallel batch compare after every call of the batch has returned, and treat a path as inside the slice when any slice of the batch owns it.
4. A path outside the slice that was clean before the call and is now new or changed is restored: a tracked file with `git checkout -- <path>`, an untracked non-ignored file by deleting it. Log each action in `run.md`.
5. A path that was already dirty or intent-to-add before the call and now differs, or an untracked file whose hash changed, ends the run `blocked`, and the report names the path. Never touch an ignored path or anything under `.reimagine/`.
6. An implementer tool error ends the run `blocked` once the comparison and restore are done. There is no fallback implementer. A call past the subagent budget gets the same comparison and restore and then ends the run `blocked`, naming the subagent budget; it is not a round.
7. When an implementer or fix call returns, write `post-<n>.status` and `post-<n>.hashes` in the record, `<n>` being the call's own `pre-<n>` number. `post-<n>.status` holds the output of `git status --porcelain --untracked-files=all`; `post-<n>.hashes` holds one line per path that status lists outside `.reimagine/`, each path read as item 1 says, the output of `git hash-object --no-filters -- <path>` followed by the path, or `deleted` for a path that is gone. In a parallel batch, write each call's `post-<n>` files after every call of the batch has returned.
8. A notification for a call that already returned is not a new call. Log it in `run.md`, then compare the checkout with that call's `post-<n>` files, hashing each path as item 7 does, since `pre-<n>.hashes` uses the filtered hash. A path whose status line or hash differs, and that no later call, logged edit or commit of the run changed, ends the run `blocked` naming the path, with the tree left as it is. Otherwise nothing changes.

## Implementer brief

Write one brief per slice and pass it as the whole prompt of the implementer. It holds:

1. The slice as `plan.md` states it: the change, the files the slice owns, the acceptance criteria, and the checks that apply to it.
2. Whether the slice runs in parallel with others. A parallel slice runs no checks and says so in its report; a slice that runs alone runs its own checks and reports the results.
3. The instruction file paths to read first (the user's and the repository's, from Step 0.1), and that a rule the host loaded for the slice's files, such as a path-scoped rule under `.claude/rules/`, is binding.
   The `opus` stand-in's review request of Step 5 names the base commit's `REVIEW.md` (`git show <merge-base>:REVIEW.md`, and the same file in each parent directory of a changed file) as review instructions when one exists; a copy the branch adds or changes is not. The `code-review` skill takes no request text and is sent none.
4. The checkout path the implementer edits: the worktree or additional repository path when the slice lives there, else the primary checkout. Every path in the brief is absolute.
5. The line-ending rule. Run `git ls-files --eol` on the slice's existing files. When a file shows an `eol=` attribute, match it. When `text` or `text=auto` applies with no `eol=`, any ending is fine, since git normalizes it. Otherwise match the majority working-tree ending of the file's directory, else of the repository. The implementer never changes the line endings of a file it edits.
6. The scope rule: change nothing outside the slice's files and add nothing the brief does not ask for; report instead of editing anything outside; do not commit, push, install anything, run `gh` or start a background command, since one that finishes after the call returns wakes it again; leave intent-to-add marks alone.
7. The subagent budget in force, in minutes, and that a call past it ends the run `blocked`: report what is not done rather than run on.
8. The reply shape: files changed, checks run with results, and anything it could not do.

After a `drop` answer to the credential question (Step 0.1a), the brief carries the redacted values only, never the dropped text.

## Step 3.6 Plan confirmation

Run this step only when the request says "confirm the plan" and the run is not plan-only. Otherwise go to 3.7.

1. Run the read-only reverification of 3.7.1 now. A revision it needs gets its Step 3 round here, inside the cap of three. When no round is left, end `blocked` and name the unreviewed revision.
2. Print the path of `plan.md` and a short summary: the slices, the files each owns, the acceptance criteria, the risk floor and the checks.
3. Ask the user to reply yes to build, or to describe a change, under the question rules in SKILL.md. Take `date` just before and just after the question; the wait is outside the run budget.
4. A clear yes continues. A reply that means go ahead and nothing else is a yes; a reply that mixes a yes with a change is a change. Before 3.7.2, rerun these Step 0 checks in every repository the run edits: the clean tree (`git status --porcelain` empty and `git diff --cached --quiet` passing), the flagged files, the branch checks, the remote head (`git ls-remote` compared with the head recorded at preflight), and the open pull request check. Anything that changed ends the run `blocked`, naming it.
5. A described change is recorded in the run's section of `inputs.md`, verified the way 1.3 verifies claims, and the risk floor is judged again; the floor never falls. Update `plan.md`. The change gets one more Step 3 round inside the cap. When that round ends with no blocking objection, ask the question again. When no round is left, end `stopped` with the change as the question. A round that ends with a blocking objection and no round left ends `blocked`, as in Step 3.
6. Any other reply ends the run `plan-only`.

## Step 3.7 Execution setup

Run these in order. When 3.6 already ran 3.7.1, start at 3.7.2. On a run with no new work, run only 3.7.2 and 3.7.4 (`record.md`, An existing record, item 8). In a worktree run follow `worktree.md`; with more than one writable repository run 3.7.2 to 3.7.4 once per repository, as `multi-repo.md` says.

1. **3.7.1 Reverify.** When the planning snapshot (Step 0.4) is not the base commit, reverify the plan against the base without changing anything: `git show <base>:<path>` for each file the plan cites and `git diff <snapshot> <base>`. Revise the plan for what moved. A revision gets one Step 3 round inside the cap; with no round left, end `blocked`.
2. **3.7.2 Branch.** A new branch is created with `git switch -c <name> <base commit>`, after confirming the name exists neither locally (`git branch --list <name>`) nor on the remote (`git ls-remote --heads <remote> refs/heads/<name>`). A collision ends `blocked`. A continued branch is switched to; Step 0.2 may already have done it. Then record the merge-base, `git merge-base <remote>/<base> HEAD`, with `<base>` the base branch of Step 0.2, in `run.md`. Every diff review and every changed-lines count in this run uses that merge-base.
3. **3.7.3 Baseline.** Discover the checks (6.1), record them in `run.md`, and run each once on the base, one command at a time under the check budget. The result is the baseline. For a failing check, save the output and the failing test names as the baseline evidence, since 6.3 matches against them.
4. **3.7.4 Dependencies.** When the plan adds a dependency, install it now: after the baseline, after any ask-first rule about dependencies has a clear yes, and before any implementer starts. Run the install command the repository names, under the check budget, and log the manifest and lockfile edits in `run.md`. A refused permission is a denial (SKILL.md), not a missing resource.

Then write Step 3's entry `complete` unless it was reused (see the opening), and go to Step 4, or to Step 6 on a run with no new work.

## Step 4 Build

1. **4.1 Brief.** Write the implementer brief (above) for each open slice of `plan.md`. A slice whose commit is on the branch is not open and is not built again (`record.md`, An existing record).
2. **4.2 Implementers.**
   - Use one Agent call per slice at the implementer model (`models.implementer`, default `sonnet`), passing `model` explicitly and the effort the request sets. Never use a fork.
   - Slices with disjoint files that the order of work marks independent run as parallel Agent calls in one message, and run no checks. Ordered slices run one at a time.
   - Take the snapshot before each call and `date` before and after the batch, or the call when it runs alone. Log the model per slice and each call's `duration_ms` from its completion notification in `run.md`.
   - The subagent budget is 20 minutes per call, or `timeouts.subagent`. A call is judged by its notification's `duration_ms`, else by `date` before and after it (SKILL.md, Budgets and rounds). A call past it ends the run `blocked` naming the budget (the snapshot comparison runs first); it is not a round and not a swap.
   - A failed call goes through the snapshot comparison above.
3. **4.3 Slice checks and slice review.**
   - After parallel calls return, run each slice's checks yourself, one command at a time. A command several slices name runs once and counts for each of them. A slice that ran alone ran its own checks; read its results.
   - Confirm each report against `git status` and `git diff`: the changed files are the files the slice owns, and the report matches the tree.
   - Review each slice. First mark its new files with `git add -N <file>`, by name, never a directory and never anything under `.reimagine/`. Then read `git diff <merge-base> -- <slice files>` against the acceptance criteria and the scope rule. Then run `git ls-files --eol -- <slice files>`. A new file whose working-tree ending differs from the expected one is a finding; files shown as `-text` or `none` are not compared.
   - Mark each finding blocking (the change would ship wrong behavior, break an acceptance criterion, or violate a repository rule) or non-blocking, with a reason.
   - Send the findings back to the same implementer with SendMessage, after a snapshot. When that implementer cannot be continued, start a fresh implementer with the findings and the slice's current diff. Each send is a round for that slice.
4. **4.4 Cap.** A slice gets at most three rounds. Fix a non-blocking finding only inside the slice's files and scope; otherwise defer it with a reason. After the cap, fix any blocking finding yourself, once; that fix is not a round, and it is logged in `run.md`. Review the result and rerun the slice's checks. A finding still open ends the run `blocked`.
5. **4.5 Re-evaluation.** Judge the risk floor of `risk.md` on the actual diff from the merge-base. The floor never falls. Log the result and the Step 5 level it gives in `run.md`. Do not repeat the plan review.

Write Step 4's entry `complete`, with each slice's `status`, `run` and `tickets` under `slices`, keeping the slices of prior runs, and go to Step 5.

## Step 5 Final review

1. **5.1 Integrate.** With every slice in place, run the full set of checks (the 3.7.3 list) one command at a time under the check budget. A check that passed at baseline and fails now is fixed before the review, through the implementer that owns the failing code (snapshot first), and rerun. This repeats at most three times before the run ends `blocked` naming the check. From here every edit to the tree is logged in `run.md` with its time and reason.
2. **5.2 One pass.** First check `git diff <merge-base> --stat`. An empty diff is recorded as "no changes", is sent to nothing, and Step 5 is complete. Otherwise mark new files with `git add -N <file>`, by name. Then run one pass of the `code-review` skill (SKILL.md, Roles and models, item 4) over the complete diff: pass the level from `risk.md`, Step 5 level, first, then the range `<merge-base>...HEAD` with the full sha. Never pass `--comment` or `--fix`.
   - When the skill is not listed, the primary is not the session's checkout, or the diff is in an additional repository, the pass is the `opus` stand-in (SKILL.md, Roles and models, item 5): an Agent at `opus` that reviews `diff.patch` with the Reviewer request of `steps/1-plan.md`, the plan, the inputs and the acceptance criteria, with the level passed as its `effort`. Write the patch from `git diff <merge-base>` after `git add -N`; for an additional repository write `diff-<slug>.patch` from `git -C <path> diff <merge-base>` (`multi-repo.md`). From run 2 on, each patch name takes the run suffix (`record.md`, Files).
   - The pass has the review budget, 30 minutes or `timeouts.review`. Take `date` before and after it. A pass past the budget ends the run `blocked` naming the budget; it is not a swap.
   - A pass that errors is retried once; a second error ends the run `blocked`.
   - Make no edit while the pass runs.
3. **5.3 Triage.** Verify every finding of the pass against the code. Then sort each into exactly one bucket, with a one-line reason: `fix` (a correctness finding inside the change), `defer` (reuse, simplification, efficiency, or a pre-existing issue the change did not introduce) or `reject` (a false positive). The reviewer's own label never decides the bucket. A finding that matches a rejection recorded in `run.md` or `plan.md` keeps its disposition unless it brings new evidence. Write the buckets and reasons in `run.md` before any fix.
4. **5.4 Fix.** Apply the `fix` bucket in one batch through the implementer of the slice that owns the code, after a snapshot (Implementer snapshots). Findings in several slices go to each owning implementer, in parallel when their files are disjoint. Read the fix diff as 4.3 reads a slice: `git add -N` for new files, `git diff <merge-base> -- <files>`, then `git ls-files --eol`. A fix the read finds wrong goes back to its implementer once with SendMessage; when it is still wrong, restore its paths from the snapshot as Implementer snapshots, item 4, restores a path, and move its finding to `defer` with the reason. An empty `fix` bucket edits nothing. Deferred findings join the deferred items of Step 7.5 and the report; rejected findings go to the report's Findings rejected section; neither touches code. The fixes are not reviewed again in this run: Step 6 verifies the checks, and the report's `Gate:` line suggests the gate for a converged review. A CI repair cycle runs one more pass (`steps/7-publish.md`, 7.3).
5. **5.5 Record.** Log in `run.md` the pass (`code-review` with its level and range, or the stand-in with its patch file and `effort`), its start and end times, every finding with its bucket and reason, the fix batch with the result of your read, and each fix restored and deferred.

Write Step 5's entry `complete` and go to Step 6.

## Step 6 Checks

1. **6.1 Discovery.** Build the list in this order and drop duplicates.
   - The `.reimagine.json` `checks` list.
   - Commands the manifests define for test, lint, typecheck and build: package scripts named `test`, `lint`, `typecheck` and `build`; Makefile targets of those names; pyproject sections that imply pytest, ruff and mypy; `cargo test` and `cargo clippy`; `go test ./...` and `go vet ./...`; `gradlew check`, or `gradlew.bat check` on Windows.
   - CI jobs whose steps run one of these commands.

   With a `checks` key those commands are the ones run, and Step 6.1 still reads the manifests and the CI jobs and names each CI job no configured check covers as deferred to CI in `run.md` and the report. A CI job that no local command maps to is deferred to CI and named, never guessed. Run every local check under the check budget, 15 minutes or `timeouts.check`. A check past 10 minutes runs in the background beside the `sleep` timer SKILL.md gives with the budgets, whichever ends first stopping the other. A check past the check budget ends the run `blocked` naming the budget; this holds for the baseline (3.7.3), 5.1 and the dependency install as well, and it is not a round. When `run.md` logs no edit since the 5.1 run, reuse that run instead of repeating it.
2. **6.2 Not run.** A check whose resource is missing (a service, a tool, a credential, a dependency) is "not run", reported with its exact command and directory. "Denied" means only a refused permission.
3. **6.3 Pass rule.** Every local check must pass, except a failure that matches the baseline failure for the same check. Match by the failing test names, never by counts. A check without test names, such as lint or typecheck, matches when it reports the same messages for the same files. Report each match with its baseline evidence. On a run with no new work, the baseline is the one that the last run to reach Step 3.7.3 recorded in `run.md`. A check only CI can run is deferred and named.
4. **6.4 Tests.** When the repository has a test suite, a behavior change needs a test. A change with none is a failure for 6.5.
5. **6.5 Fix.** A failure that is not a baseline match is fixed through the implementer that owns the failing code, after a snapshot, as 5.1 fixes a regression, and the full set runs again. Step 6 runs at most three times before publication, plus one run per CI repair cycle (`ci-watch.md`); a failure still there after the third run ends the run `blocked`, naming the check.

Write Step 6's entry `complete` when the set passes under 6.3. A run with no new work whose work is already published then writes Step 7 `skipped` and ends `done`, publishing nothing; with unpublished work it goes on as below (`record.md`, An existing record, item 8). Otherwise, on the `github` host a run that passes Step 6 reads `steps/7-publish.md` and starts Step 7; this includes a run that must not publish, since the opening of Step 7 decides `prepared`. On any other host, read `pr-body.md` and write the run's body file from its `## Pull request body` template, one per repository when there are several (`multi-repo.md`), then end the run `prepared`. Every terminal state goes to Final report handling in SKILL.md.

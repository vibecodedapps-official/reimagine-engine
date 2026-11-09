# Step 7 Publish

Read this file at the start of Step 7. `<checkout>` is the primary repository's checkout (its worktree when Step 0.3 made one), `<record>` is the record directory, `<remote>` and `<base>` come from Step 0.2, `<base>` being the base branch (the remote's default branch unless the request or `.reimagine.json` named one), and `<branch>` is the run's branch. In a run with a worktree, read `worktree.md` for the commands; with more than one repository, read `multi-repo.md` for Step 7. Every git command in this step runs as `git -C <checkout>`, except when Step 0, Primary checkout, item 2 leaves the plain forms in use, with no named checkout, no worktree and a session started at the toplevel: then it runs without `-C <checkout>`, since the skill pre-approves only the plain read-only forms.

## Opening

Take `date -u +%Y-%m-%dT%H:%M:%SZ` now and copy the output into `run.md`. Apply `record.md`, Reuse and resume: a reused Step 7 is not run. Otherwise write the `7` entry `running` in steps.json with its inputs (`plan.md` and `head`).

Publication runs only when all of these hold:

- No blocking defect is open and Step 6 passed. A run with an open blocking defect or a failed Step 6 ends `blocked` here and publishes nothing.
- The host is `github`. On any other host the run ends `prepared` with the push command.
- The request has no "do not publish".

When publication does not run, the run ends `prepared`. Before it ends, read `tickets.md`, settle the open items as it says and write each open item's draft as `tickets.md` says, then write the body for the publish commands the report gives. With one open pull request on the branch, read `pr-body.md` and write the continued pull request comment to `<record>/comment-<n>.md`, numbered as `record.md` says, so the report can give the `gh pr comment <pr> --body-file <absolute path>` command; when this loop opened that pull request (7.2), also write the run's body file, so the report can give the `gh pr edit <pr> --body-file <absolute path>` command before it. With no pull request, write the pull request body to the run's body file, so the report can give the `gh pr create` command.

A question about a commit, a push or a pull request, raised because an ask-first rule applies, ends the run `prepared` when the answer before any push is anything but a clear yes: write the drafts and body files first, as the opening says. The same answer after the run's first push ends `blocked` and the pushed work stays as it is.

## 7.1 Commit

Commit the work of each slice whose closing commit is not yet on the branch, one commit per slice, and record each sha as the slice's `commit` in steps.json. Log each commit in `run.md` as a line `- commit <full sha> <subject>`; a later run tells the loop's own commits from foreign ones by these lines alone.

- Write the message as `type(scope): subject`, lowercase, with a body that says why the change was made. When the repository's instruction files set another form, follow them.
- Write a bare `@token` in backticks.
- Name no model, agent type, tool, review pass or level, or a term the suite or a run coined, in the subject or the body. Type no attribution trailer of your own, and keep one the host's attribution setting adds, even where it names a model or tool.
- Stage paths by name only. Never run `git add -A` or `git add .`.
- Before each commit run `git -C <checkout> diff --cached --name-only` and confirm the list is exactly the slice's paths and holds nothing under `.reimagine/`. Unstage anything else with `git -C <checkout> restore --staged <path>`.

With `.reimagine.json` `commit: true`, commit the snapshot after the slice commits and before the first push, as `record.md`, Commit snapshot, says. Its staged list is exactly its two paths.

After the run's first push returns, commit only CI repairs (item 5 of Step 7.3).

## 7.2 Push and pull request

Before each push, judge whether the push or the pull request triggers a deploy. Read the base branch's workflow files with `git -C <checkout> show "<remote>/<base>:<file>"` for each `<file>` ending in `.yml` or `.yaml` that `git -C <checkout> ls-tree --full-tree --name-only <remote>/<base> .github/workflows/` lists, and the workflow files of the commit being pushed with `git -C <checkout> show "HEAD:<file>"` for each such `<file>` that `git -C <checkout> ls-tree --full-tree --name-only HEAD .github/workflows/` lists, since GitHub runs only the `.yml` and `.yaml` files directly in that folder. `<file>` is the repository-relative path `ls-tree` prints, unquoted and unescaped when it prints it in double quotes, never an absolute path, and `--full-tree` keeps the listing from depending on the current folder. Judge a `push` or `pull_request` trigger from either set, with its filters as GitHub applies them to this push and the pull request. A workflow that deploys in either set counts, and so does one whose deploy the files cannot settle. A `pull_request_target` workflow is judged from the base branch's file. When a push or the pull request triggers a deploy, ask first, naming the workflow, and treat any answer but a clear yes as a denial. A denial before the first push ends the run `prepared`: write the drafts and body files first, as the opening says.

Before every push read the remote head with `git -C <checkout> ls-remote --heads <remote> refs/heads/<branch>`:

- Before the first push of the run it must equal the sha Step 0.2 fetched, or be absent for a branch that is new.
- Before a CI repair push it must equal the last sha this run pushed.

A difference ends the run `blocked`, naming the branch and the two shas. Never force push, rebase, reset or amend.

For a continued branch, also run Step 0.2's pull request query again before the first push. A pull request that was recorded and is missing from the open list (closed or merged), one with a different base branch, a pull request opened since Step 0, several open pull requests, or a list of 100 entries (incomplete) ends the run `blocked`.

Push with `git -C <checkout> push -u <remote> <branch>`. When it returns, take `date -u +%Y-%m-%dT%H:%M:%SZ`, run `git -C <checkout> rev-parse HEAD`, and keep both as the last push time and the last pushed sha. Do the same after every later push.

**Open items.** Once per run, after the first push has returned and before any body or comment is written, read `tickets.md` and settle each open item as it says. Every pointer in the body and the continued comment then has its ticket reference.

Every body file is written with the Write tool first, in its own call. The publishing command (`gh pr create`, `gh pr edit`, `gh pr comment`, `gh issue create`, `gh issue comment`, the record's `gh api` attach, or `az boards work-item update --discussion` where it takes a file) then runs alone in its own Bash call, naming only the absolute path of that file; never one compound command that writes and posts.

**No open pull request on the branch.** Read `pr-body.md`. Write the body from its `## Pull request body` template to the run's body file: `<record>/pr-body.md`, or `<record>/pr-body-run<n>.md` from run 2 on (`record.md`, Files). Open the pull request against the base branch:

`gh pr create --title "<title>" --body-file <absolute path to the body file> --base <base>`

Add `--head <branch>` on a continued branch. The title is the single ticket's title, or the plan's one-line summary when there are several inputs, at most 70 characters. Record the pull request in steps.json as `runs[].pr`, in the form `github:<owner>/<repo>#<n>`, from the url `gh pr create` prints.

A pull request opened on a continued branch lists, under "Decisions for the reviewer", the commits that were on the branch before the run (the Branch state list in this run's section of `inputs.md`, own and foreign) and says the branch carries them from before this change and they were reviewed with it.

**One open pull request on the branch.** It is this loop's own when a `runs` entry in `steps.json` names it in `pr` (`record.md`, steps.json, item 2). Read `pr-body.md`. After the push, with `<pr>` the pull request number:

1. When it is this loop's own, update its body once in this run. Write the body for the whole branch from the `## Pull request body` template, covering every input of every run of the record, to the run's body file, then run `gh pr edit <pr> --body-file <absolute path>`. This is the run's only edit of that body, except the one in 7.3, item 3, after a repair files a ticket; in a multi-repository run it also carries the sibling links (`multi-repo.md`).
2. Write the continued pull request comment from the `## Continued pull request comment` template to `<record>/comment-<n>.md`, numbered as `record.md` says, then post it: `gh pr comment <pr> --body-file <absolute path to comment-<n>.md>`. This is the run's one comment on the pull request.
3. When it is not this loop's own, the comment is all: never edit its body.

Write no `runs[].pr` for a pull request this run did not open. Log in `run.md` the pull request, the body edit and the comment, with their files.

Every `--body-file` is an absolute path.

## 7.3 CI

Read `ci-watch.md` and carry out its items 1 to 4 for the pull request, starting from the last push time. Item 5 is here.

**Item 5, repair.** A red result (a required check, a required workflow, a deferred check or an applicable workflow that finished and did not pass) is repaired in a cycle:

1. Read the failure from the failing run's log with `gh run view <run-id> --log-failed`, in its own Bash call.
2. Fix it through the implementer that owns the failing code, after a snapshot, as Step 5.1 fixes a regression.
3. Re-enter Step 5 for one pass over the whole diff from the merge-base at the level of `risk.md`, with its triage and fix batch (5.2 to 5.5), then run Step 6 in full once. An open item the pass adds goes through `tickets.md` as in 7.2. When that files a ticket on a pull request this loop opened, update its body once, when 7.3 ends without a block: write it again as 7.2 does and run `gh pr edit <pr> --body-file <absolute path>`, so Follow-ups lists the ticket. Otherwise the report names the ticket.
4. Commit the repair under the rules of 7.1, judge the deploy as 7.2 says, since a repair can change what the push deploys, read the remote head as 7.2 says (it must equal the last pushed sha), push, and take `date` and the new sha.
5. Return to `ci-watch.md` item 1 for the new head.

At most three cycles run. A result still red after the third, or a repair the pass cannot fix, ends the run `blocked` with the pull request linked in the report and nothing further pushed. A pull request that is not OPEN, a changed base and a merge conflict end it `blocked` at once, as `ci-watch.md` says. An expired run budget ends it `blocked` with the pull request left as it is.

## 7.4 Ticket comments

After the pull request is open and 7.3 has ended without a block (green, or not applicable), post one comment for each ticket this run took up. A ticket that was done at Step 0 (`record.md`, An existing record) gets no comment, unless no run's `run.md` section logs a comment on it, as after a run that ended before 7.4. Log each comment in `run.md` with its file. Read the `## Ticket comment` section of `pr-body.md` and write each comment and its record first (`tickets.md`).

- GitHub: write the comment to `<record>/ticket-<id-slug>.md` (`ticket-<id-slug>-run<n>.md` from run 2 on) and its record to `<record>/record-<id-slug>.md`, and then post `gh issue comment <n> --body-file <absolute path>` and attach the record (`tickets.md`, Backends).
- Azure DevOps: use the Azure DevOps MCP tool when one is listed, else `az boards work-item update --id <n> --discussion "<text>"`, reading the text from a file when quoting fails; attach the record as `tickets.md`, Backends, says.
- Salesforce: use the Salesforce MCP tool when one is listed; it takes the comment only, no record.
- A host with no tool: put the comment text in the report instead of posting.

Post no comment before the plan is final and none on a run that ends `blocked`. File and text inputs get no comment.

## 7.5 Open items

The open items were settled in 7.2, before any body or comment, and those a CI repair pass added in 7.3 (`tickets.md`). A deferred finding that is not an open item is a note: the report lists it with its reason, and it is never published or filed.

Write the `7` entry in steps.json: `complete` after its outputs exist, `failed` when the run ends `blocked` here. Every terminal state goes to Final report handling in SKILL.md.

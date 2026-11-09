# Open items and tickets

Read this file once per run, before any body or comment is written: in Step 7.2 after the first push has returned; or, on a run that ends `prepared`, before its body file is written (Step 7's opening, a denial before the first push, the end of Step 6 on `other`). It holds what becomes of each open item and how a ticket is written, recorded and filed. What leaves the run is written for its reader (SKILL.md, What leaves the run).

## Open items

Open items are deferred findings that affect correctness or risk or cost more to leave than to fix, remainders of partial inputs, checks not run that someone must still run, open plan objections, and questions the run raised. Any other deferred finding is a note: report only, never published, never filed. A check deferred to CI is settled by the CI watch, not an open item.

Before any pull request body or comment is written, record each open item in `run.md` as one of three, with its evidence:

- Settled by the run: the same stretch of work can settle it, inside the plan's files and acceptance criteria, needing no input the run lacks, within the budget, and with no edit in Step 7. Record the evidence: a check, a test, a read or a commit. An item already resolved elsewhere (an open or merged pull request, a ticket that covers it) is settled by naming where, and is not listed in the body.
- A decision for the user: an item whose answer is the user's call. Put it in full in the report's `### Decisions for you` section: the assumption every option shares, each option, the recommendation first, and what would overturn it. It does not block publishing: the pull request publishes with its pointers, and the answer comes in a later run's request on the branch.
- Filed to a ticket: everything else someone still owes: work outside the plan, an input the run cannot get (a date, an environment, a fixture, an owner), a question someone other than the user owns, a bug found outside the change, a check someone must still run. Search the tracker first. A ticket that covers the same symptom gets a comment and a record; else a new ticket, one symptom each. The remainder of a source ticket the run took up stays on that ticket: its pull request line is `Refs`, and Step 7.4's comment says what is not done; it is not a new ticket. A source ticket is never the ticket of an open item.

A later run on the branch never files a second ticket for an item the record shows filed: it comments on that ticket when the item changed, and updates its record. The `- ticket` lines of `run.md` show it (`record.md`, Files).

## Filing

When an ask-first rule of the instruction files covers a new issue or a comment, ask once for all the tickets of the open items, listing each with its title and tracker, never once per ticket. A reply that is not a clear yes files nothing, each ticket is a draft, and the run goes on; it is not a denial (SKILL.md, Approval scope, rule 1).

Which tracker: the tracker of the source tickets the item came from, the first when they differ. An item from a file or text input, or from a Salesforce case, goes to the primary repository's GitHub issues on a `github` remote. With no tracker it is a draft.

A run that ends `prepared` (a host other than `github`, "do not publish", or a denial before the first push) files nothing. Write each ticket it would file as a draft: its body and its record, in the files `record.md`, Files, names. The report lists each draft with the command or tool that files it, before the publish commands. It says to add each filed ticket to the body's Follow-ups before publishing.

Every draft, on any run, including each ticket of a non-yes reply, is logged in `run.md` as `- draft <file>: <one line>`, is listed in the report's Open items with its files and the command that files it, and keeps a local id in the handoff (`handoff.md`, Raised tickets).

The pull request body and the continued comment carry at most one line per filed item: what it is, in one line, and its ticket reference (`pr-body.md`, Follow-ups). An item settled or put to the user is not listed. A ticket is filed before the pull request exists, so a new ticket's record names the branch and not the pull request.

## Ticket text and records

A ticket's body or comment is written for the ticket's readers: what changed for them, what happens next and who it waits on, what is not done and the ticket tracking each; never a branch, file, line, check output, commit id, criterion evidence, run, step, pass, level, verdict or another term the loop coined. A pull request link is allowed, as where to follow the change.

The technical detail goes in a record: a Markdown file written in the run's record first, the local copy is the source of truth and an upload a copy, then attached to the ticket.

- A new ticket's record is the handoff context a later session needs: what the item is, why it matters, where the evidence is (files, lines, commits, checks, the record path), and what done looks like.
- A source ticket's record holds the criteria with their evidence (a check, a test name, a commit or a line of output), each met, not met or not confirmed.

Every body and record file is written with the Write tool first, in its own call, and its posting command then runs alone in its own Bash call, naming only that path. Before each post, check that its reader will act on it and that it holds nothing they would not say themselves.

After each post, log a line in `run.md`: `- ticket <ref> <new | existing | source> artifact <number | none>: <one line>`.

## Backends

One abstraction, "attach a record to a ticket", with one form per tracker. Every path is absolute.

- GitHub issues: search with `gh issue list --search "<terms>" --state all --json number,title,state,url`; file with `gh issue create --title "<title>" --body-file <absolute path>`, whose printed URL ends in the issue number `<n>`; comment with `gh issue comment <n> --body-file <absolute path>`. Attach the record as an issue artifact through the REST API, which needs no particular `gh` version: `gh api --hostname <host> --method POST repos/<owner>/<repo>/issues/<n>/artifacts -f name="<name>" -F body=@<absolute path>`, with `<name>` the text `Record for <branch>`, and add `--jq .number` to that command to print the artifact number, which the record keeps. On a later run update that same artifact, whose number the record keeps, with `gh api --hostname <host> --method PATCH repos/<owner>/<repo>/issues/<n>/artifacts/<number> -F body=@<absolute path>`, which GitHub keeps as a new version. One artifact per ticket and branch. Issue artifacts are in public preview.
- Azure DevOps work items (an `AB#` ticket, or a new item on the tracker of `AB#` source tickets): search, file and comment through the Azure DevOps MCP tool when one is listed, else `az boards query --wiql`, `az boards work-item create --type <type> --title "<title>" --description "<text>"` and `az boards work-item update --id <n> --discussion "<text>"`, reading the text from a file when quoting fails. Attach the record through the MCP server's attachment tools when listed (upload, then link to the work item; today `wit_work_item_attachment_upload` and `wit_work_item_attachment_link`); with no such tool the record stays local and the report says so.
- Salesforce: comment only, through its MCP tool; no ticket is filed there and no record attached; an item from a Salesforce input is filed on the primary repository's tracker.

A failed, refused or impossible attach, on any tracker, is not retried and not done another way; the report names the local record and says it was not attached and why. For a `prepared` draft the report gives the file command, then the attach command with the issue number to fill in.

Return to the step that sent you here.

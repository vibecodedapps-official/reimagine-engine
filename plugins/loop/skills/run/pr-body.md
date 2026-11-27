# Publication texts

Read this file from `steps/7-publish.md` when you write a pull request body, a continued pull request comment or a ticket comment, and from `steps/4-build.md` at the end of Step 6 on a host other than `github`, to write the run's body file.

These texts are published, and each is written for its reader (SKILL.md, What leaves the run). Name the activity and the date, never a model, an agent type, a tool, a review pass or its level, never a term the suite or this run coined, and never a run-internal path such as one under `.reimagine/`. Type no attribution trailer of your own, and keep one the host's attribution setting adds, even where it names a model or tool. Write a bare `@token` in backticks. Write each section from the record's facts, not from a subagent's claim; check a claim before you repeat it. A section with nothing to say holds the word "none".

## Pull request body

Write the body to the run's body file in the record: `pr-body.md`, or `pr-body-<slug>.md` for an additional repository, each with the suffix `-run<n>` from run 2 on (`record.md`, Files). On a continued branch whose pull request this loop opened, the body covers every input of every run of the record. On a host other than `github`, the body always covers every input of every run of the record, since the loop never edits a description there and the user pastes the whole of it. It has these sections, in this order:

```
## What changed
<per input: the ticket, file or description, "complete" or "partial", and what the change does, with a behavior that differs from the ticket's text or that a reader could take for a bug said there>

## Before merging
<a check not run because only the merge or a deploy after it runs it, with what to watch; a check that fails without this change too, with the evidence>
<on a continued branch: this branch carries <n> commits from before this change; they were reviewed with it, and they are listed here>
<commits on the branch that are not the loop's, as `steps/7-publish.md`, 7.2, says>

## Follow-ups
<one line per ticket: what it holds, in one line, and its ticket reference; "none">

## Related pull requests
<"none" in a single-repository run; "pending" first in a multi-repository run, then the sibling links>

## Closes
<one line per ticket>
```

A line is in the body only when its reader would review or merge the change differently for it. The rest has another home and is not repeated here: a design choice and the option it rejected, in the message of the commit that makes it (`steps/7-publish.md`, 7.1) and in the report's Decisions, or, on a run that ends `prepared` and so writes no commit message, as one clause of that input's What changed line; ticket text the code had made wrong, in `inputs.md`; a check someone must still run, in its ticket, which Follow-ups names (`tickets.md`); every other check, in the report's Checks; a note, in the report alone (`tickets.md`).

`## Follow-ups` holds one line per ticket, from the latest `new` or `existing` `- ticket` line of `run.md` for it across every run of the record; items that share a ticket share its line. An item settled, put to the user or not yet filed is not listed (`tickets.md`).

In a multi-repository run on a host other than `github`, Related pull requests says the links between the pull requests are added by hand.

On an Azure DevOps remote the description is capped at 4,000 characters, so the body always takes the short form, with nothing measured: `## Related pull requests`, `## Closes`, and last the line "Details are in the first comment." Only `## Closes` grows with the inputs, one line per ticket. Write the full body, with every section, to `<record>/comment-<n>.md`, numbered as `record.md` says, for the user to post as the pull request's first comment.

Closing rules:

- Write `Closes <ref>` only when every acceptance criterion of the ticket is confirmed met. Otherwise write `Refs <ref>`.
- One line per ticket.
- A file input and a text input get no closing line.
- Across repositories only the pull request in the ticket's own repository closes it. Every other pull request cites it as `Refs <owner>/<repo>#<n>`.
- On `github` write an Azure DevOps ticket as `Refs AB#<n>`. On an Azure DevOps remote write it as `Refs [<type> <n>](https://dev.azure.com/<org>/<project>/_workitems/edit/<n>)`. `<type>` is the work item's `System.WorkItemType` from the read the reading step made, else `Work item`. `<project>` is its `System.TeamProject` from that read, else the remote's project, with each space written `%20`. `<org>` is the remote's organization (SKILL.md, Reading the request). On any other host write `Refs AB#<n>`.
- Write a Salesforce ticket as `Refs` and the case number. No Azure DevOps or Salesforce line closes anything.
- A `Refs` line does not attach the work item to the pull request. The `prepared` report asks the user to link the work items with the host's own tooling.

## Continued pull request comment

Use this when the branch has one open pull request: after the body edit when this loop opened the pull request, and alone when it did not, since a body this loop did not write is never edited. The comment covers this run's work, so its Follow-ups lists only the tickets this run filed or commented on. Write it to `comment-<n>.md`, numbered as `record.md` says, with the sections of the body template above, with `## Closes` replaced by:

```
## Issues
<ref>: complete
<ref>: partial
```

One line per ticket. End the comment with the sentence "The pull request's own body decides what merging it closes."

## Ticket comment

Write one comment for each ticket this run took up to `ticket-<id-slug>.md` (`ticket-<id-slug>-run<n>.md` from run 2 on), for the ticket's readers (`tickets.md`, Ticket text and records): what changed for them, what happens next and who it waits on, and what is not done with the ticket that tracks it. No label on a paragraph or bullet.

- State "partial" plainly when it is partial.
- Give the pull request link, and each sibling link in a multi-repository run, as where to follow the change.
- Put the criteria and their evidence in the ticket's record, `record-<id-slug>.md` (`record-<id-slug>-run<n>.md` from run 2 on): each criterion met, not met or not confirmed, with a check, a test name, a commit or a line of output; mark "not confirmed" when you did not see it met yourself.
- Name no run-internal path, no model, no agent, no tool, no review pass, no level and no term the loop coined.

Return to the step that sent you here.

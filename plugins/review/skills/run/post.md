# The posting step

`<record>`, `<round>` and `git <c>` are those of `SKILL.md`, Record and workspace; the round is the highest in the record. A record with no drafts, or drafts a run did not show whole, ends the step with one line saying to run the review first.

## The forge

Posting needs four things of a forge: a comment, its anchor to a file and line, a vote, and the threads with their status. On GitHub they come from `gh`, through `gh api` where no subcommand gives one. On another forge the step posts only when the session lists a tool that gives all four. A thread resolution, a ticket edit and a merge run only where the session has a tool for each. Otherwise, and whenever the user asks, write the export below; no run fails for a missing forge tool.

## Before any post

1. Leaks. Run `node "<scripts>/posts.mjs" leak --home "<home>" --user <user> --host <hostname> --record "<record>" --worktree "<worktree>" --model <model> --plugin "review:run" --plugin reimagine <draft>...` over every draft and the vote's line below, with this machine's home directory, user name and host name, `<hostname>` being the machine's and `<host>` below the forge's, and `--model` once for each name of the session's model, its family name and its full id. Exit 1 names each draft that leaks and the kinds; such a draft is rewritten in `drafts/`, shown whole again, and not posted until the check is clean. Read each draft too for a model, agent, tool or term of the run, which the script cannot know.
2. The gate. Beside each draft show its effect on the merge gate, whether it blocks, counts as a vote or changes nothing, and check that the summary for the person who gates the merge agrees with them.
3. Approvals. Ask for each outward action by name: each comment by its file name, the vote and its kind, each thread resolution, each ticket edit and a merge. Nothing runs without its own yes. The summary for the person who gates the merge is posted only as a comment approved by name; otherwise the user sends it.
4. Fresh reads. Just before the first post, read the head and the threads again, saving the threads as `SKILL.md`, Threads, says. A head that moved after the drafts were checked stops the step and names the citations to read again.
5. Compare. Run `node "<scripts>/posts.mjs" compare "<round>/drafts" "<round>/threads.json"`. A `posted` draft is not posted again; a `differs` or `twice` draft is reported with both texts and left for the user; only a `missing` draft is posted.

## The posts

Post one at a time, each from its draft's file, the body being the text under the header, written to `<round>/outbox/<draft>` first. Right after each, write the forge's id of the new comment into the draft's header as `posted: <id>` and add a line to `<round>/posted.md`, before the next post.

- An anchored comment on GitHub: `gh api --hostname <host> repos/<owner>/<repo>/pulls/<n>/comments -f commit_id=<head sha> -f path=<path> -F line=<line> -f side=RIGHT -F body=@<outbox file>`, its `id` taken from the reply.
- A summary: `gh api --hostname <host> repos/<owner>/<repo>/issues/<n>/comments -F body=@<outbox file>`, its `id` taken from the reply.
- The vote: read the user's latest review state first, `gh api --hostname <host> repos/<owner>/<repo>/pulls/<n>/reviews --paginate`, and cast it only when it differs from the approved one: `gh pr review <n> --approve`, or `gh pr review <n> --request-changes --body-file <outbox file>`, the file `<round>/outbox/vote.txt` holding one line that names the blocking comments by title, checked by `leak` and shown with the vote's approval.
- A thread resolution, a ticket edit or a merge: through the tool the session has for it, each after its own yes.

A step that stopped part way is run again with the same request: the compare above leaves out what is already posted.

## After posting

Read the threads again, save them, and run the compare once more. Every posted draft prints `posted`; any other line is reported with the draft's text and the forge's. Then end as `SKILL.md`, The end of a run, says.

## The export

Write `<round>/export/`: one file per draft, under the draft's name, in the order to paste, each starting with its anchor, `Anchor: <path>, line <line>` or `Anchor: the pull request itself`, a blank line, and the text; the summary for the person who gates the merge is its last file. Say where it is and that the user pastes each file and its vote by hand. Return to `SKILL.md` for the end of the run.

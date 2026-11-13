# A follow-up review

`<record>`, `<round>`, `<worktree>` and `git <c>` are those of `SKILL.md`, Record and workspace; the round is one more than the highest in the record, and an earlier round with no record, the request having said follow-up, is read from the forge's threads alone.

## The ask and the role

Start from what was asked and the reviewer's role: what the request of the earlier round asked, what the reviewer said then, read from that round's `notes.md` and `drafts/` and from the forge's threads, and who holds the vote that gates the merge. Save the threads as `SKILL.md`, Threads, says.

## The new head

Fetch the head again into the run's ref, as in `SKILL.md`, and move the worktree to it with `git <c> -C "<worktree>" checkout --detach <head sha>`. Write `<round>/change.patch` from the earlier round's head to this one with `git <c> diff --no-ext-diff --no-textconv`.

1. Each earlier item is reported as `landed` or `open`, from a read or a run at the new head, with its basis.
2. The author's reply is a claim: follow it to the place it names, and report what is there.
3. The forge's conflict status is not taken as read. A trial merge decides: `git <c> -C "<worktree>" merge --no-commit --no-ff <base sha>`, the conflicting files listed, then `git <c> -C "<worktree>" merge --abort`.
4. Each merge commit between the two heads gets its own read, `git <c> show --cc <sha>`, of the parts that differ from both parents, since a file that merged with no conflict can still need a change by hand.
5. A pair is reviewed as a pair: the comments on both, and the summary, state the dependency and the merge order.

A point new in this round goes through `SKILL.md`, Checks before any draft, like any lead. Then write and show the drafts as `SKILL.md`, Drafts, has them, a draft that a thread already answers being left out, and end as `SKILL.md`, The end of a run, says. Return to `SKILL.md` for that end.

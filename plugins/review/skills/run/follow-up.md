# A follow-up review

`<record>`, `<round>`, `<worktree>` and `git <c>` are those of `SKILL.md`, Record and workspace; the round is one more than the highest round made, as `SKILL.md` says a round is made, and an earlier round with no record, the request having said follow-up, is read from the forge's threads alone. Set up the workspace there first, the fetch of the head and of the base included, since the trial merge below needs the base branch as it is now, not as an earlier round fetched it.

## The ask and the role

Start from what was asked and the reviewer's role: what the request of the earlier round asked, what the reviewer said then, read from that round's `notes.md` and `drafts/` and from the forge's threads, and who holds the vote that gates the merge. Save the threads as `SKILL.md`, Threads, says.

## The new head

The workspace's setup has fetched the head and the base again and moved the worktree to the head. `<earlier head>` and `<earlier merge-base>` are the head and the merge-base the earlier round's `reading.md` gives, the merge-base being that of its base and head where it names none. Write `<round>/change.patch` from the earlier round's head to this one with `git <c> diff --no-ext-diff --no-textconv <earlier head> <head sha>`. Where the author rebased, so the merge-base moved between the rounds, that diff also holds what the base brought: write the patch with `git <c> --attr-source=4b825dc642cb6eb9a060e54bf8d69288fbee4904 range-diff --no-ext-diff --no-textconv <earlier merge-base>..<earlier head> <merge-base>..<head sha>` instead, and say so in `reading.md`. The empty tree is the source of attributes there, since `range-diff` runs a driver the attributes name whatever flags it gets; where git refuses the option, the patch is the whole change, as below.

An earlier head the clone does not hold, `git <c> cat-file -e "<earlier head>^{commit}"` failing, is fetched by its full sha into no ref: `git <c> fetch <remote> <earlier head>`. Where the forge no longer gives it, or the earlier round has no record, the patch is the whole change, `git <c> diff --no-ext-diff --no-textconv <merge-base> <head sha>`; `reading.md` says so, each earlier item is judged by a read at the new head, and the merge commits of item 4 are those after the merge-base.

1. Each earlier item is reported as `landed` or `open`, from a read or a run at the new head, with its basis.
2. The author's reply is a claim: follow it to the place it names, and report what is there.
3. The forge's conflict status is not taken as read. A trial merge decides: `git <c> -C "<worktree>" merge --no-commit --no-ff <base sha>`, the conflicting files listed, then `git <c> -C "<worktree>" merge --abort`, which a merge with nothing to merge does not need.
4. Each merge commit between the two heads gets its own read, `git <c> show --cc --no-ext-diff --no-textconv <sha>`, of the parts that differ from both parents, since a file that merged with no conflict can still need a change by hand.
5. A pair is reviewed as a pair: the comments on both, and the summary, state the dependency and the merge order.

A point new in this round goes through `SKILL.md`, Checks before any draft, like any lead. Then write and show the drafts as `SKILL.md`, Drafts, has them, a draft that a thread already answers being left out, and end as `SKILL.md`, The end of a run, says. Return to `SKILL.md` for that end.

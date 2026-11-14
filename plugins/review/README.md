# review

Review a pull request that someone else wrote, or a pair of them, and end in drafted comments for its author and a short summary for the person who gates the merge. Findings listed is a successful end. The review never commits, pushes or edits on the author's branch and writes nothing in the work tree of the repository it reviews. Posting is a separate request, and each post is approved by name.

For your own pull request, use the gate: it fixes what it finds and pushes on your branch.

## Requirements

Node 22 or later, and `git`. On GitHub, `gh` with a login for the reads and the posts; on another forge, a tool the session lists, else an exported pull request file.

## Install

```
/plugin marketplace add vibecodedapps-official/reimagine-engine
/plugin install review@reimagine-engine
```

## Use

Say it in plain words, or type `/review:run` followed by the same words. The bare `/review` is Claude Code's own review, not this one.

- `reimagine review PR 12`, or a pull request URL, or `PR 12 and 14` for a pair
- `reimagine review PR 12 in <path>` for a pull request of another local clone
- `reimagine review export <path>` for a pull request exported from a forge with no tool in the session
- `reimagine review PR 12, post` to post drafts a run already showed

Phrases it reads beside the target: `follow-up`, `level <word>` (else `xhigh`), `gated by <name>`, `conventions <path>`, `precedent <path>`, `sample <path>` (a sample of the team's review comments), `ticket <id or path>`, `repo <path>` (another repository that consumes the change), and `gate record <path>` or `audit report <path>` to take as the first reading. The skill prints how it read your request, and what the request approves, before it reads anything.

## What a run does

- It fetches the pull request's head into a ref of its own and checks it out in a detached worktree under its record, with the repository's hooks switched off for every git command it makes.
- A reviewing agent of the session reads the change at the head; a gate record or audit report for the same head can stand in for that reading.
- Each lead is then checked: every site of a shared name, the consumers of what the change alters and the documents that state its rule, the tickets' acceptance criteria, and every cited location read again at the head. Each finding and each fix says whether it was read, run or not run.
- Every point gets a disposition, `post`, `note` or `drop`, by the team's conventions, read at the base commit.
- The drafts are files in the record, shown whole: comments for the author, and a summary for the person who gates the merge.
- A follow-up reports each earlier item as landed or open, follows the author's replies to the code, settles the conflict status by a trial merge, and reads each merge commit.

## What invoking approves

Reads of the repository and the forge, a fetch of the head and of the base branch, a scratch worktree under the record, and a reviewing agent. Running any code from the pull request's head, its checks included, is asked for by name first, since that code is the author's. Every comment, the vote, each thread resolution, each ticket edit and a merge is approved by name in the posting step. No command that reaches a package registry runs; packages you installed are reached only when the head changes no dependency manifest or lockfile.

## Posting

`reimagine review PR 12, post` checks each draft for your machine's paths, user name and host name and for the name of the model, reads the head and the threads again, and posts only the drafts the forge does not hold yet, one at a time, each recorded before the next, so a step that stopped part way can run again. The vote is cast only when your vote on the forge differs from it. Afterwards every post is read back and compared with its draft. Without a forge tool that gives comments, anchors, a vote and threads, the step writes a paste-ready export instead.

## The record

Each pull request has a record in the plugin's data directory, under `reviews/<host>/<path>/<id>/`: the reading, the notes, the drafts, what was posted, and the scratch worktree. Another clone of the same repository finds the earlier round there. The run ends by listing the worktree, the refs and the files it created, with the commands that remove them, and removes none without your yes. The record goes with the plugin when it is uninstalled.

## Uninstall

```
/plugin uninstall review@reimagine-engine
```

Remove the worktrees and the refs first with the commands a run listed, since a worktree's entry and the run's refs, under `refs/reimagine/review/`, stay in the reviewed repository's git directory.

## License

Apache-2.0. See `LICENSE`.

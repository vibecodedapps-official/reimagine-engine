# guard

Auto mode trust for the repositories you list: the classifier's entries in your user settings file, written by a script when you run /guard, each change shown before it is made.

## What it writes

Only `autoMode.environment` and `autoMode.allow`, in `$CLAUDE_CONFIG_DIR/settings.json` when that variable is set, else `~/.claude/settings.json`. Every other key keeps its value, `permissions` and `env` included, and every byte outside the `autoMode` value is kept. Nothing is written until you reply with the sentence the skill asks for.

- The environment list. It is written out in full, with Claude Code's own default lines in it, since an added line does not replace a default one. While repositories are listed, a default line the host adds in a later release is added at the next `/guard`, if guard itself expanded `$defaults` or the absence of an environment list. With at least one repository listed, the Trusted repo line names each listed checkout and its remotes, and the Source control line names those remotes too. With none listed, both lines are Claude Code's again.
- The allow list. With at least one repository listed, it gains one entry: publishing in the listed repositories, which is pushing a branch, opening a pull request, and editing or commenting on a pull request your own message asked to work on. Two more are written only when you ask: for a repository added with `merge`, merging a pull request in it that your own message names; and, while a repository is added with `reads`, reading Claude Code settings files to inspect configuration. That entry tells the classifier such a read is not credential exploration, so leave it out when your settings file holds tokens. Nothing guard writes clears the classifier's rules against self-modification, destructive git commands, safety bypasses or credential leakage.
- The list of repositories, `reimagine-guard.json`, in the same directory as the settings file. The entries are rendered from it.

`autoMode` has no effect in a session started in bypass mode.

## Requirements

Node 22 or later, `git` and the `claude` command on the PATH. The script runs `git`, `claude auto-mode defaults` and `claude auto-mode config` as child processes, and the ask hook runs `git remote -v` with a 5-second limit. Its design was checked on Claude Code 2.1.318.

## Install

```
/plugin marketplace add vibecodedapps-official/reimagine-engine
/plugin install guard@reimagine-engine
```

## Use

Run `/guard` (also reachable as `/guard:guard`). Each change is shown as a plan, and nothing is written until you approve it.

- `/guard add <path>`: add a repository, or update one already listed. The path is resolved to the top level of its work tree. A repository without a remote is refused.
- `/guard add <path> merge`: the same, and also trust merging a pull request in that repository that your own message names.
- `/guard add <path> reads`: the same, and also allow reading Claude Code settings files to inspect configuration. `merge`, `reads` and `ask` can be given together, and an add without a word turns it off for a repository already listed.
- `/guard add <path> ask`: the same, and also have the host ask you before every push, pull request and comment aimed at that repository. See below.
- `/guard drop <path or remote>`: take one repository off the list. It takes a listed path, a path inside a listed repository, or a remote as `list` prints it (`host/path`) or as a URL.
- `/guard clear`: take every repository off the list.
- `/guard list`: show the listed repositories.
- `/guard status`: show the state: `absent`, `current`, `stale`, `edited`, `malformed`, `managed` or `unavailable`.
- `/guard denials`: show the denials the hook recorded.
- `/guard`: refresh the entries after the host or a remote changed.

Only `absent`, `current` and `stale` lead to a write, and `current` leads to none. `malformed` means the settings file is not a JSON object, holds `autoMode` twice, or holds an `autoMode` whose `environment` or `allow` is not a list of strings. `managed` means another settings scope already adds entries that the list would duplicate. `unavailable` means `claude` cannot run or prints defaults guard cannot use.

Before it saves a plan, the script writes the candidate `autoMode` to a temporary configuration directory and runs `claude auto-mode config` there. Every guard entry must appear once, no environment label may appear twice, and every default allow rule must be kept. A plan that fails the check is refused. After the write it runs the check again for your real directory.

## The startup notice

When a session starts, a hook checks the entries against Claude Code's current defaults and prints one line when they are stale, such as after a host release reworded a default line: `guard: the auto mode entries in [path] are stale; run /guard to update them`. When the list file is not a guard list, it prints `guard: [list path] cannot be read, so guard asks before every push and every gh and az repos write; correct it or run /guard`. When the settings file holds guard's entries but the list file is missing, it prints `guard: [settings path] holds guard's entries but [list path] is missing, so guard asks before every push and every gh and az repos write; run /guard, or put a copy of the list file beside that settings file`. It prints nothing when no repository is listed and the settings file holds no guard entry, for any other state, and when `claude` cannot run, and it checks nothing in a `claude -p` session, which has no one to show the line to. It uses the remotes the list records, so a remote that changed on disk shows up at the next `/guard`. It runs `claude auto-mode defaults` with a 20-second limit, and writes nothing.

## Asking before a push or a post

`/guard add <path> ask` has the host ask you before each push, pull request and comment aimed at that repository, even when an allow rule or guard's own entries would let the call run. The flag changes no `autoMode` entry. A hook reads each shell and MCP call before it runs, and asks for:

- `git push`, including `git subtree push`, `git lfs push` and `git send-pack`, when it runs in a checkout of the repository, names the repository or one of its remotes, or pushes a branch whose configured remote is a URL of it;
- a `gh` or `az repos` command that writes, such as `gh pr create`, `gh pr comment` or `az repos pr update`, when it names the repository or runs in a checkout of it; reads such as `gh pr view` pass, and an API call through `gh` counts as a write with a method other than GET, a field or an input, and a GraphQL call when it holds the word `mutation`, takes its query from a file or an input, or builds it from a variable or a command;
- `curl`, `wget`, `Invoke-RestMethod`, `Invoke-WebRequest`, `az rest` and `az devops invoke`, when the command names the repository and is not a plain read; a read, with no method other than GET and no body, data, form, upload or config-file option, passes, and so does `curl -G`, which sends its data as a query;
- an MCP call whose arguments name the repository or its listed path, unless the tool's name marks a read, such as `get_pull_request`.

A command names a repository by `owner/name`, in an option or a URL, or for Azure DevOps by its project and repository. A remote counts by that name whatever host or organization its URL gives, and a checkout at or inside a flagged repository's listed path counts as that repository whatever its remotes are now. The hook takes every directory a command line changes to, or names with `-C`, `--chdir` or `--directory`, wherever it stands, as one the command may run in, so a push typed in one checkout after a `cd` into another asks when either is flagged. A directory change the hook cannot follow, such as `cd $dir`, counts as aimed at a flagged repository, and so do a line with more than 16 such directories, a repository option that holds a variable, such as `-R "$REPO"`, and a push in a line that mentions a submodule, `GIT_DIR`, `GIT_WORK_TREE`, `CDPATH` or a `GIT_CONFIG` variable. `GH_REPO` never lets a call through: a flagged value asks, and any other value leaves the checkout rule in force; only `-R` or `--repo` decides alone. An `az repos` write that names no repository and runs outside a flagged checkout asks while an Azure DevOps repository is flagged, since a pull request id is looked up across the organization. Text that only looks like a command, such as `git push` inside an `echo` or a commit message, may ask too, and so may a GraphQL read through `gh` whose query the shell builds when the command runs, since the hook cannot tell it from a write.

With nobody to answer, as in an unattended or `claude -p` run, the host denies a call that asks, so such a run cannot push or post to a flagged repository. When the hook itself cannot run, as with no `node` on the PATH, or runs past its 10-second limit, the call goes on without a prompt. The prompt was checked in auto mode, and in no other permission mode.

When `reimagine-guard.json` cannot be read, or is missing while the settings file holds guard's entries, the hook asks before every push and every `gh` and `az repos` write, whatever its repository, until you correct the file or run `/guard`. Raw calls and MCP calls pass then, since nothing can aim them without the list. With no repository flagged it does nothing.

The hook does not see:

- a script or alias that pushes or posts, and a git alias kept in git's configuration;
- a program started by another program, such as `Start-Process` or a script language's subprocess call;
- the host's own calls;
- a raw call that names the repository only by an id, or whose address is put together from variables;
- a request made through a program's own HTTP classes rather than a command;
- an MCP tool that acts on a repository it is told neither by name nor by path, or only by an id, and one that writes under a name that reads as a read;
- a raw call whose method is set by an override header;
- a setting a command reads from a file or variable the hook does not open, such as git's `include.path` or `--config-env`, or a curl or wget startup file;
- a GitLab or Bitbucket project named only by its short name;
- a command word or a keyword spelled with an escape inside it or split by quotes;
- a command run through `wsl` or another system's shell, whose directories the hook cannot read;
- a forge tool other than `git`, `gh` and `az`;
- work items and other forge objects that belong to no repository.

Two configuration folders that sync `settings.json` between them are not supported: the list does not travel with the settings, so the folder without it asks before every push and every `gh` and `az repos` write until a copy of the list file sits beside its `settings.json`.

## The denial record

Guard's denial hook runs when auto mode denies a tool call. It appends one line to `denials.jsonl` in the plugin data directory: the time in UTC, the reason the classifier gave, which names the matched rule, the tool, the cwd, and the command cut at 300 characters for a Bash or PowerShell call or the file path for another tool that has one. The common forms a credential takes in a command are replaced with `[redacted]`: the user part of a URL, a value after `bearer`, `basic` or `token` that looks like one, and the value of a `token`, `secret`, `password` or `key` pair written with `=` or `:`. A reason is prose, so there a pair is taken only when written with `=`. A secret typed any other way, such as `--password hunter2`, is recorded as written. The reason is cut at 500 characters and the path and the cwd at 300, and once the file passes 256 KiB it keeps its newest 100 lines. It never records the rest of the tool input, file contents or command output. The file is created with mode 0600, readable by you only on macOS and Linux; on Windows it takes the permissions of the plugin data directory. The file stays on your machine, and the hook prints nothing and never blocks or retries the call. `/guard denials` prints the lines, oldest first, so you can see which denials the entries do not clear. Delete the file to clear the record.

## The list file

`reimagine-guard.json` holds `{"version": 1, "repos": [{"path", "remotes", "merge", "reads", "ask"}]}`, with `reads` and `ask` written only when set. A path is written with forward slashes. Remotes are the fetch URLs of `git remote -v` written as `host/path`, with no scheme, user name, password, port or `.git`, so an HTTPS and an SSH remote of the same repository are the same remote. A local path remote is left out. Every plan rereads the remotes of each listed path, and notes each path that no longer exists. The file is deleted when the list becomes empty.

## Entries guard owns

Every entry guard writes ends with ` (reimagine guard)`. An entry without that ending is yours and keeps its text and its place.

If you edit a marked entry, or put your own text in a Trusted repo or Source control line, the state is `edited`. The plan names the entry and writes nothing until you delete it or, for a marked one, take off its ending.

## Backups

Before it changes an existing file, the script copies it to `<path>.reimagine-backup-<YYYYMMDDHHMMSS>`, so each `apply` that changes an existing settings file leaves one beside it, or beside its target when `settings.json` is a symbolic link. The list file goes when the list becomes empty, by `clear` or the last `drop`, and no backup is deleted. It refuses to apply a plan when either file changed after the plan was made, or when another `/guard` run saved a different plan after this one was shown: each plan prints an id, and `apply` writes only the plan whose id it is given.

## Approving the write

When a plan is ready, the skill asks you to reply `Yes, write guard's change to autoMode in <path>.`, with the settings file's path, and runs `apply` only after that reply. In auto mode the classifier reads that reply as your approval of a change to your own permissions. In the default mode the write also prompts.

## A configuration installer

If you install your user settings from a shared file by a merge that replaces the keys it names, that file should never name `autoMode`. Guard owns it, and the paths in it differ per machine.

## Uninstall

1. Run `/guard clear` and reply with the sentence the skill asks for; a plain yes writes nothing and leaves the entries in place. It takes every guard entry out and deletes the list. When the copied default lines are every current default, they go back to one `$defaults`. A settings file that had no `autoMode` before gets its original bytes back, except that an object that held only whitespace, such as `{ }`, comes back as `{}`; a file guard created is deleted unless it holds something else.
2. Run `/plugin uninstall guard@reimagine-engine`.

## License

Apache-2.0. See `LICENSE`.

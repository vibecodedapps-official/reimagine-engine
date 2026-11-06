# guard

Auto mode trust for the repositories you list: the classifier's entries in your user settings file, written by a script when you run /guard, each change shown before it is made.

## What it writes

Only `autoMode.environment` and `autoMode.allow`, in `$CLAUDE_CONFIG_DIR/settings.json` when that variable is set, else `~/.claude/settings.json`. Every other key keeps its value, `permissions` and `env` included, and every byte outside the `autoMode` value is kept. Nothing is written until you reply with the sentence the skill asks for.

- The environment list. It is written out in full, with Claude Code's own default lines in it, since an added line does not replace a default one. While repositories are listed, a default line the host adds in a later release is added at the next `/guard`, if guard itself expanded `$defaults` or the absence of an environment list. With at least one repository listed, the Trusted repo line names each listed checkout and its remotes, and the Source control line names those remotes too. With none listed, both lines are Claude Code's again.
- The allow list. With at least one repository listed, it gains three entries: publishing in the listed repositories, which is pushing a branch, opening a pull request, and editing or commenting on a pull request your own message asked to work on; reading Claude Code settings files to inspect configuration; and, only for a repository added with `merge`, merging a pull request in it that your own message names. Nothing guard writes clears the classifier's rules against self-modification, destructive git commands, safety bypasses or credential leakage.
- The list of repositories, `reimagine-guard.json`, in the same directory as the settings file. The entries are rendered from it.

`autoMode` has no effect in a session started in bypass mode.

## Requirements

Node 22 or later, `git` and the `claude` command on the PATH. The script runs `git`, `claude auto-mode defaults` and `claude auto-mode config` as child processes. Its design was checked on Claude Code 2.1.318.

## Install

```
/plugin marketplace add vibecodedapps-official/reimagine-engine
/plugin install guard@reimagine-engine
```

## Use

Run `/guard` (also reachable as `/guard:guard`). Each change is shown as a plan, and nothing is written until you approve it.

- `/guard add <path>`: add a repository, or update one already listed. The path is resolved to the top level of its work tree. A repository without a remote is refused.
- `/guard add <path> merge`: the same, and also trust merging a pull request in that repository that your own message names.
- `/guard drop <path or remote>`: take one repository off the list. It takes a listed path, a path inside a listed repository, or a remote as `list` prints it (`host/path`) or as a URL.
- `/guard clear`: take every repository off the list.
- `/guard list`: show the listed repositories.
- `/guard status`: show the state: `absent`, `current`, `stale`, `edited`, `malformed`, `managed` or `unavailable`.
- `/guard denials`: show the denials the hook recorded.
- `/guard`: refresh the entries after the host or a remote changed.

Only `absent`, `current` and `stale` lead to a write, and `current` leads to none. `malformed` means the settings file is not a JSON object, holds `autoMode` twice, or holds an `autoMode` whose `environment` or `allow` is not a list of strings. `managed` means another settings scope already adds entries that the list would duplicate. `unavailable` means `claude` cannot run or prints defaults guard cannot use.

Before it saves a plan, the script writes the candidate `autoMode` to a temporary configuration directory and runs `claude auto-mode config` there. Every guard entry must appear once, no environment label may appear twice, and every default allow rule must be kept. A plan that fails the check is refused. After the write it runs the check again for your real directory.

## The denial record

Guard ships one hook, which runs when auto mode denies a tool call. It appends one line to `denials.jsonl` in the plugin data directory, created readable by you only: the time in UTC, the reason the classifier gave, which names the matched rule, the tool, the cwd, and the command cut at 300 characters for a Bash or PowerShell call or the file path for another tool that has one; a command is recorded as written, so it holds whatever was typed in it. It never records the rest of the tool input, file contents or command output. The file stays on your machine, and the hook prints nothing and never blocks or retries the call. `/guard denials` prints the lines, oldest first, so you can see which denials the entries do not clear. Delete the file to clear the record.

## The list file

`reimagine-guard.json` holds `{"version": 1, "repos": [{"path", "remotes", "merge"}]}`. A path is written with forward slashes. Remotes are the fetch URLs of `git remote -v` written as `host/path`, with no scheme, user name, password, port or `.git`, so an HTTPS and an SSH remote of the same repository are the same remote. A local path remote is left out. Every plan rereads the remotes of each listed path, and notes each path that no longer exists. The file is deleted when the list becomes empty.

## Entries guard owns

Every entry guard writes ends with ` (reimagine guard)`. An entry without that ending is yours and keeps its text and its place.

If you edit a marked entry, or put your own text in a Trusted repo or Source control line, the state is `edited`. The plan names the entry and writes nothing until you delete it or, for a marked one, take off its ending.

## Backups

Before it changes an existing file, the script copies it to `<path>.reimagine-backup-<YYYYMMDDHHMMSS>`, so each `apply` that changes an existing settings file leaves one beside it, or beside its target when `settings.json` is a symbolic link. The list file goes when the list becomes empty, by `clear` or the last `drop`, and no backup is deleted. It refuses to apply a plan when either file changed after the plan was made.

## Approving the write

When a plan is ready, the skill asks you to reply `Yes, write guard's change to autoMode in <path>.`, with the settings file's path, and runs `apply` only after that reply. In auto mode the classifier reads that reply as your approval of a change to your own permissions. In the default mode the write also prompts.

## A configuration installer

If you install your user settings from a shared file by a merge that replaces the keys it names, that file should never name `autoMode`. Guard owns it, and the paths in it differ per machine.

## Uninstall

1. Run `/guard clear` and reply with the sentence the skill asks for; a plain yes writes nothing and leaves the entries in place. It takes every guard entry out and deletes the list. When the copied default lines are every current default, they go back to one `$defaults`. A settings file that had no `autoMode` before gets its original bytes back, except that an object that held only whitespace, such as `{ }`, comes back as `{}`; a file guard created is deleted unless it holds something else.
2. Run `/plugin uninstall guard@reimagine-engine`.

## License

Apache-2.0. See `LICENSE`.

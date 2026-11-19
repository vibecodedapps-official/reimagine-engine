# rules

House rules for Claude Code sessions: one block in your `CLAUDE.md`, kept current by a script, plus the Concise Plain output style, a refactor review against them, a handoff prompt skill and a check on drafts written for other people.

## What it installs

- The house rules block, in `$CLAUDE_CONFIG_DIR/CLAUDE.md` when that variable is set, else `~/.claude/CLAUDE.md`. Nothing is written until you answer yes to a diff.
- The output style `rules:Concise Plain`.
- A chat block, in `chat/instructions.md` inside the plugin. It is for pasting into a chat product's custom instructions. Nothing installs it.
- The skill `/rules:refactor`, which you invoke yourself. It reviews a repository against the house rules and the repository's own instruction files and, on your yes, writes one ticket file per bundle to the repository's ignored scratch directory, else to the plugin's data directory.
- The skill `/rules:handoff-prompt`, which also answers a plain request for a handoff prompt. It writes a prompt that carries this session's work to a later one, from a summary of a discussion or a single idea, for you to paste. It writes no file.
- The skill `/rules:draft`, which a session reaches on its own when it writes a message for someone else. It checks the finished draft before it is first shown or published: it strikes detail no reader acts on, verifies what the draft states, and keeps its notes for you outside the draft.
- The outbound check, a hook that denies a commit, a push or a forge post holding a string you listed. It does nothing until the list exists (see Outbound check).

The plugin never edits `settings.json`.

## Requirements

Node 22 or later.

## Install

```
/plugin marketplace add vibecodedapps-official/reimagine-engine
/plugin install rules@reimagine-engine
```

## Use

Run `/rules` (also reachable as `/rules:rules`). It shows the change as a diff and asks before it writes. Once per change.

- `/rules`: add the block, or update it when the plugin's rules are newer.
- `/rules --remove`: take the block out.
- `/rules --decline`: keep the file as it is, and stop the startup notice for the current text.
- `/rules --adopt`: move rules you already have in the file into the block, so they are not duplicated.
- `/rules --options core,windows`: pick which parts go in the block. `core` is always included. `windows` is offered only on Windows.
- `/rules --adopt --options core`: both at once, in either order.

Any other argument is refused, and nothing runs.

Run `/rules:refactor` in a repository for a read-only review of the whole tree against the house rules and the repository's own instruction files, with findings grouped into bundles; on your yes it writes one ticket file per bundle and prints the `reimagine loop` line to ship each one.

Ask for a handoff prompt, or run `/rules:handoff-prompt`, for a prompt that carries this session's work to a later session, from a summary or a single idea, in one block for you to paste; it states what was settled and what is open as you left it, suggests nothing, and writes no file.

A draft for someone else, such as a reply, a ticket comment or an email, is checked by `/rules:draft` before it is first shown or published. An email draft is one HTML file in the scratch directory the house rules name, ready to open in a browser and paste, and the reply shows its text.

## Feedback log

The house rules have every session log what it learned about its rules and context: a rule or fact that was missing, a rule that was loaded and missed, and a rule that visibly worked. Each entry names the repository the session worked in, goes in a file named for the date in `feedback/` in the host's user config folder, which for Claude Code is `$CLAUDE_CONFIG_DIR`, else `~/.claude`, and ends with a `Recommended` section. Where loaded context names a log for these entries, the entry goes there instead. The session changes no rule to fix what it logged unless you ask.

That directory is outside every repository, so a session in the default permission mode asks before its first write there. The permission rule that allows the write is yours to add. The plugin ships no reader of the logs: they are yours to read.

## Outbound check

A hook runs before each Bash, PowerShell and MCP tool call and denies a commit, a push or a forge post whose text holds a string you listed. It is off until the list exists: `rules-outbound.txt` under `$CLAUDE_CONFIG_DIR`, else under `~/.claude`. `/rules` offers to write it with starter lines; you can also write it yourself. The list belongs to one config folder: a session started under another `CLAUDE_CONFIG_DIR` reads the list of that folder, and is not checked until that folder has one.

- One string per line, matched as a whole word with case ignored. Blank lines and lines that start with `#` are ignored.
- `allow: <phrase>` takes the phrase out of the text before the search, so a team that tracks `CLAUDE.md` can list `claude` and allow `CLAUDE.md`.
- `post: <phrase>` has any command that holds the phrase read as a forge post, so a script or a `curl` call that posts for you is checked: `post: tools/send.mjs`. Case and the direction of a slash do not count. The whole command is searched, so a script under a folder whose name holds a listed string needs an `allow:` line for that folder.
- `check: diff` also reads the added lines of the commits a push sends. It is off by default.

What is read: the whole command of a `git commit`, `git merge` or `git tag` and of any `gh`, `az` or `glab` call or command that holds a `post:` phrase, with each file it names as a message or a body, `$(cat <file>)` and a `<` redirect included; at a `git push`, the messages of the commits on any local branch that no remote-tracking branch holds yet, so a commit on a branch you are not pushing is denied too; and every string value an MCP tool is given. A push is read in the call's folder and in each folder the command names after `cd`, `-C`, `Set-Location`, `pushd` or `Push-Location`. A folder or a file may be written through a variable of the environment the session started with: `$NAME` or `${NAME}` in Bash, `$env:NAME` or `${env:NAME}` in PowerShell. The path may be typed as a quoted part with more after it, as in `"$NAME"/repo`. A push in a command that names a folder the hook cannot find is denied, so name the folder by a path that exists when the command is typed: not through a variable the command sets or a command in `$( )`, and not a folder the same command makes. The hook has 60 seconds, and its `git` calls and the search of what they return share 45 of them; a push whose commits cannot be read in that time is denied and can be run again. A path the hook resolved to a file or a folder is not searched where it stands outside a quoted string and on the command's first line, since it stays on your machine. The same holds for the script that `node` runs and for a path given to a git `-c` key, where they exist, so a run of a plugin's own script from a folder whose name holds a listed string is not denied for its path. Inside a string or on a later line a path is searched like any other text, and there an `allow:` line for the folder's name helps. In a command that holds a `post:` phrase a file is also read after any other option whose name holds `file`, with one dash or two and a space, `=` or `:` before the value, as in `--file-path <file>` or `-DescriptionFile:<file>`; not read are `-File` with a `.ps1` value, which names a script to run, an option whose name starts with `out`, `output` or `log` directly followed by `file`, which writes a file, as `--output-file` or `-OutFile`, and one whose name ends in `name` or `names`, which takes text that is searched. A message file named after `-F`, `--file`, `--body-file`, `--notes-file` or `--input` that cannot be read, or a diff that cannot be read, gives a warning and the call goes ahead, as does any error of the hook itself. A command is taken for a commit, a merge or a tag where one of its lines holds `git` and that word, or where it holds both anywhere and a `$` or the word `xargs`, and for a forge call where it holds `gh`, `az` or `glab` as a word, so a command that only writes a local file is read too when its text does. A denial names the string, where it was found and the list file, and for a command the words that made it a post; a text that trips it and posts nothing can be written with a file tool, which the hook does not read.

Not covered: a commit, push or post made by a script the session runs, though a commit made that way is still read at a typed push, and a `post:` line has the script's command and the files it names read, not a text the script builds or reads by itself; a message read from a file by a command other than `cat`, `Get-Content` or a redirect; a commit and a push typed in one call, where only the command and the files it names are read; a push from a folder the hook cannot find whose name stands inside a quoted string or after a line break in the command; a commit whose `git` and `commit` sit on two lines of one call with no `$` and no `xargs` in it, as with an alias defined there; calls the host makes itself; a tag's message at a push; and a commit another remote already holds. A read through `gh` or an MCP tool whose text holds a listed string is denied too.

## What the block looks like

The block sits between two marker lines:

```
<!-- reimagine:house-rules begin version=<v> options=<list> join=<none|blank|newline> digest=<16 hex> -->
...the rules...
<!-- reimagine:house-rules end -->
```

Put your own lines outside the block, above the begin marker or below the end marker. If you edit inside the block, `/rules` sees it, shows you the difference, and leaves the block alone until you move your lines out.

## Backups

Before it changes an existing file, the script copies it to `<path>.reimagine-backup-<YYYYMMDDHHMMSS>`.

## Startup notice

When the block in your file is older than the plugin's, a session start prints one line:

```
rules: the house rules in <path> are older than this plugin's; run /rules to update them
```

Run `/rules` to update, or `/rules --decline` to silence it for that text.

## Output style

`/rules` ends by printing how to select the style. Run:

```
/output-style rules:Concise Plain
```

Or run `/config` and choose Output style.

## Uninstall

1. Run `/rules --remove` to take the block out. It gives back the original bytes of the file. A file the plugin created is deleted, unless you added text to it.
2. Run `/plugin uninstall rules@reimagine-engine`.

## License

Apache-2.0. See `LICENSE`.

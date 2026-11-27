# rules

House rules for Claude Code sessions, which say when a session asks first, how it tests and when work is done: one block in your `CLAUDE.md`, kept current by a script, plus the Concise Plain output style, a refactor review against them, a handoff prompt skill and a check on drafts written for other people.

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

After an update of the plugin, run `/reload-plugins` in every session that was open during it, or start those sessions again. Such a session still names the folder of the version it started with, and once that folder is gone none of the plugin's hooks run in it, the outbound check among them.

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

A draft for someone else, such as a reply, a ticket comment or an email, is checked by `/rules:draft` before it is first shown or published. An email draft, or a draft with a table for a chat, is one HTML file in the scratch directory the house rules name, ready to open in a browser and paste, and the reply shows its text.

## Feedback log

The house rules have every session log what it learned about its rules and context: a rule or fact that was missing, a rule that was loaded and missed, and a rule that visibly worked. Each entry names the repository the session worked in, goes in a file named for the date in `feedback/` in the host's user config folder, which for Claude Code is `$CLAUDE_CONFIG_DIR`, else `~/.claude`, and ends with a `Recommended` section. Where loaded context names a log for these entries, the entry goes there instead. The session changes no rule to fix what it logged unless you ask.

That directory is outside every repository, so a session in the default permission mode asks before its first write there. The permission rule that allows the write is yours to add. The plugin ships no reader of the logs: they are yours to read.

## Outbound check

A hook runs before each Bash, PowerShell and MCP tool call and denies a commit, a push or a forge post whose text holds a string you listed. It is off until the list exists: `rules-outbound.txt` under `$CLAUDE_CONFIG_DIR`, else under `~/.claude`. `/rules` offers to write it with starter lines; you can also write it yourself. The list belongs to one config folder: a session started under another `CLAUDE_CONFIG_DIR` reads the list of that folder, and is not checked until that folder has one.

- One string per line, matched as a whole word with case ignored. Blank lines and lines that start with `#` are ignored.
- `allow: <phrase>` takes the phrase out of the text before the search, so a team that tracks `CLAUDE.md` can list `claude` and allow `CLAUDE.md`.
- `post: <phrase>` has any command that holds the phrase read as a forge post, so a script or a `curl` call that posts for you is checked: `post: tools/send.mjs`. Case and the direction of a slash do not count. The whole command is searched, so a script under a folder whose name holds a listed string needs an `allow:` line for that folder.
- `check: diff` also reads the added lines of the commits a push sends, and the names of the files they add, a renamed file's new name among them. It is off by default.

A denial names the string, where it was found and the list file, and for a command the words that made it a post; a text that trips it and posts nothing can be written with a file tool, which the hook does not read.

### What is read

- At a `git commit`, `git merge` or `git tag`, and at any `gh`, `az` or `glab` call or command that holds a `post:` phrase: the whole command, with each file it names as a message or a body, `$(cat <file>)` and a `<` redirect included.
- At a command that holds the words `git` and `push`: the messages of the commits on any local branch that no remote-tracking branch holds yet, so a commit on a branch you are not pushing is denied too. `git` does not count as part of a path, as in `.git` or `~/git/app`, and `git stash push` is no push, nor is a plain `git stash` call. Under Bash a backslash and a line break join a line before the words are looked for.
- At a plain `git push` also: its own words, the commits of a tag it names and the name of the branch you are on, so a listed string in a refspec or a branch name is denied as well.
- At an MCP tool call: every string value the tool is given.

A command is taken for a commit, a merge or a tag where one of its lines holds `git` and that word, or where it holds both anywhere and a `$` or the word `xargs`, and for a forge call where it holds `gh`, `az` or `glab` as a word, so a command that only writes a local file is read too when its text does.

### Files a post names

- In a command that holds a `post:` phrase a file is also read after any other option whose name holds `file`, with one dash or two and a space, `=` or `:` before the value, as in `--file-path <file>` or `-DescriptionFile:<file>`.
- Not read are `-File` with a `.ps1` value, which names a script to run, an option whose name starts with `out`, `output` or `log` directly followed by `file`, which writes a file, as `--output-file` or `-OutFile`, and one whose name ends in `name` or `names`, which takes text that is searched.
- A message file named after `-F`, `--file`, `--body-file`, `--notes-file` or `--input` that cannot be read, or a diff that cannot be read, gives a warning and the call goes ahead.

### Folders and paths

- A push is read in the call's folder and in each folder the command names after `cd`, `-C`, `Set-Location`, `pushd` or `Push-Location`.
- A folder or a file may be written through a variable of the environment the session started with: `$NAME` or `${NAME}` in Bash, `$env:NAME` or `${env:NAME}` in PowerShell. The path may be typed as a quoted part with more after it, as in `"$NAME"/repo`.
- A push in a command that names a folder the hook cannot find is denied, so name the folder by a path that exists when the command is typed: not through a variable the command sets or a command in `$( )`, and not a folder the same command makes.
- A path the hook resolved to a file or a folder is not searched where it stands outside a quoted string and on the command's first line, with no `$`, backtick or typographic quote before it, since it stays on your machine.
- The same holds for the script that `node` runs and for a path given to a git `-c` key, where they exist, so a run of a plugin's own script from a folder whose name holds a listed string is not denied for its path.
- Inside a string or on a later line a path is searched like any other text, and there an `allow:` line for the folder's name helps.

### Time limits

- The hook has 60 seconds, and its `git` calls and the search of what they return share 45 of them; a push whose commits cannot be read in that time is denied and can be run again.
- A command the hook cannot read to its end, in 50 seconds or because of an error of its own, is denied whatever it holds, and so is an MCP call it cannot read: send it as shorter commands, or in smaller calls.

### A push and another call in one command, with `check: diff`

With `check: diff`, a command that holds the words `git` and `push` is denied unless it is one plain git call, after the commits already there are read. A commit that the same command makes, by a commit, a merge, a pull or a script, is not there to read before the command runs. Send the push as a command of its own.

- A plain call is `git` or `git.exe` by that name, with no other program, assignment or second command around it. Before the subcommand only `-C <folder>`, `--no-pager`, `-P` and `--no-optional-locks` may stand, so `git -c` is no plain call.
- One `cd <folder> &&` may come first and `2>&1` may end it: `cd repo && git push`, `git -C repo push` and `git push 2>&1` are read and pass.
- A pipe, a redirect, `;`, `&&`, a `$`, a backtick, a comment, a continued line or a here-document makes the command no plain call, so `git pull --ff-only && git push`, `git push | tail -3` and PowerShell's `git push; $LASTEXITCODE` are denied.
- Quoted text counts as the shell reads it: `git commit -m "fix push retry"` and `git log --grep push` are plain calls and pass, while `git add . && git commit -m "fix push retry"` is denied.
- The words count in any command, so a search or a forge call whose text holds both, as `rg "git push" docs`, is denied too. Keep the two words out of other commands, or send them through a file tool.
- Without `check: diff` none of these is denied for its form. A command that holds both words has its commits read; one that is no plain call also has the whole command read as the words of a push, less the folders and files the hook resolved, with every tag and the name of its branch read, while a plain `git push` has its own words, the tags it names and the name of its branch read.

### When the hook cannot read

- A list file that is there and cannot be read, as when another program holds it, denies a shell command that commits, pushes or posts until it can be read; an MCP call is not denied. A missing list still turns the check off.
- A push from a repository whose commits git cannot read, for a reason other than time, is denied, and the reason says `git log` failed there; run it in that folder to see why. A folder that is no repository is passed over.

### Not covered

- A commit, push or post made by a script the session runs, though a commit made that way is still read at a typed push, and a `post:` line has the script's command and the files it names read, not a text the script builds or reads by itself.
- A push or a `git` whose word the shell builds, as `g"it" pu\sh` or a program held in a variable, and a push through an alias set in an earlier call, whose command holds no `push`.
- Without `check: diff`, a commit and a push typed in one call, where only the command and the files it names are read.
- A message read from a file by a command other than `cat`, `Get-Content` or a redirect.
- A push from a folder the hook cannot find whose name stands inside a quoted string or after a line break in the command.
- A commit whose `git` and `commit` sit on two lines of one call with no `$` and no `xargs` in it, as with an alias defined there.
- Calls the host makes itself.
- A tag's message at a push.
- A commit another remote already holds.

A read through `gh` or an MCP tool whose text holds a listed string is denied too.

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

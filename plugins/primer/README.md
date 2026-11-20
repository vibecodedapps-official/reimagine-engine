# primer

Keeps a repository's project instructions in the forms Claude Code loads: a short `CLAUDE.md` hub, path-scoped rules under `.claude/rules/`, nested `CLAUDE.md` files and skills under `.claude/skills/`. It promotes auto memory into them and checks every commit with a hook.

## Install

```
/plugin marketplace add vibecodedapps-official/reimagine-engine
/plugin install primer@reimagine-engine
```

## Requirements

Git, which on Windows is Git for Windows. Node 22 or later: every hook and script of the plugin runs on it. The drift hook starts it before and after each shell call and the notice at each startup, the loader's SessionStart and SubagentStart entries start `scripts/primer.mjs` in every session and at every subagent's start, whatever the profile, and the staging check of `scripts/staged.mjs`, the reach hook, the ledger of `scripts/ledger.mjs`, the copy check, the transcript reader of `scripts/transcripts.mjs` and the save points of `scripts/park.mjs` run on it. The hooks use no `sh`, sed, awk or `jq`.

## Use

Run `/primer` in a repository (also reachable as `/primer:primer`). It reads the files on disk and says its mode on the first line before it writes anything:

- `init`: the repository has no `CLAUDE.md` or `AGENTS.md` anywhere. It reads the README, manifests, build files, CI workflows, tests and `docs/`, writes the hub and leaves it uncommitted for you to review. It proposes the first rules and skills the repository shows and writes none without a yes. Claude Code's own `/init` is the unopinionated alternative.
- `adopt`: instruction or documentation files exist but there is no hub. It lists every instruction and documentation file, shows a plan and asks once. On a yes it commits moves first and rewrites after. It touches documentation files only.
- `maintain`: a hub exists. It checks the instruction files against the code, offers auto memory notes about the repository for promotion, and proposes skills for procedures it finds. With nothing to change it prints `primer: no drift` and writes nothing.

Name a mode to force it:

```
/primer adopt
```

`/primer move` runs only when you name it. It takes a repository's tracked agent files out and leaves the repository on the `local` profile below: it restates what the files hold in the store, lists each setting, hook and MCP server for you to place in your own configuration, and removes the files in one commit, which it never pushes. The commit's message, and the text of a pull request you ask it for afterwards, say what left and nothing of where the text went. It makes no removal commit while your own `attribution` setting would add a trailer to it.

Add one item after the command to record it alone, such as a checklist you just ran:

```
/primer turn this checklist into a skill
```

Only the command starts the skill; Claude Code does not start it from what you say.

Run `/primer:fold` for a read-only report of where the current Claude Code documentation describes a practice or mechanism the repository could fold in, each item with the page, the file and the destination; it writes nothing.

A repository kept by repo-docs converts in one `/primer` run in adopt mode: the hub gets the marker, each spoke pointer becomes a rule, a skill, a nested `CLAUDE.md` or a sentence in the hub, and the index goes.

## The hub

The hub is the root `CLAUDE.md`, or the root `AGENTS.md` when the repository keeps one. It is at most 60 lines, with these parts:

- Line 1 is exactly `<!-- primer -->`, which Claude Code strips before the text reaches the session.
- A `# ` heading with the repository name, then two or three sentences on what it is, with one sentence naming each long document to read before a kind of work.
- `## Commands`: the commands that verify work.
- `## Constraints`: the hard constraints every task follows.

The other files have caps too: a nested `CLAUDE.md` at most 60 lines, a rule 200, a `SKILL.md` 150. Every line of the file counts. A nested `CLAUDE.md` and a rule are also capped at 40,000 characters: Claude Code gives only the start of a nested `CLAUDE.md` or a rule with `paths` that is longer, and the cap covers every rule, so a rule that gains `paths` is already within it.

## Drift hook

Before each `git commit` that Claude Code runs through its Bash or PowerShell tool in a repository whose hub starts with `<!-- primer -->`, the hook checks the instruction files.

It blocks the commit, with the reason, when:

- the hub or a nested `CLAUDE.md` is over 60 lines, a rule is over 200, or a `SKILL.md` is over 150;
- a nested `CLAUDE.md` or a rule is over 40,000 characters;
- a path in backticks in the hub's opening paragraph does not exist, spelled exactly;
- a rule's or skill's `paths` cannot be read;
- a `paths` glob matches no tracked file;
- a skill has no `description`.

When the commit touches files that a path-scoped rule, a skill's `paths` or a nested `CLAUDE.md` covers, and that file is not part of the commit, it lets the commit run and tells Claude which files to recheck.

Without the marker it does nothing but the staging check of the `local` profile, below. It never writes a file of the work tree, the index or a ref; where the staging check reads a `git commit` with `-a` or a path, git's dry run can leave a few unreferenced objects under `.git/objects`, which `git gc` removes. It is not a git hook: commits made outside Claude Code are not checked.

## Memory notice

When a session starts in a repository whose hub starts with `<!-- primer -->`, the notice counts the `feedback` and `project` notes in the repository's auto memory that changed since the last promote pass, and shows one line when there are any:

```
primer: auto memory has 2 notes since the last review; run /primer
```

`/primer` in `maintain` mode reviews them and records the review, after which the line goes until new notes arrive. Without the marker the notice says nothing. It never writes a file.

The notice also counts the feedback entries under `~/.claude/feedback/` (under `$CLAUDE_CONFIG_DIR` when set) that name this repository and came after its last fold-back review. The house rules have each session write an entry there, headed by the repository it worked in, unless loaded context names another log, which primer reads only where `review.json` names its directory, below. An entry is a `## ` section of a log, and it names a repository in its heading, by the directory's name or by the last part of a remote's URL:

```
primer: auto memory has 2 notes and 3 feedback entries since the last review; run /primer
```

Right after a review a single new entry makes no notice, since the session that reviews logs one about its own run; the next review reads it. An entry that names another repository or none is counted in no repository, and a review reads it only when you ask.

The fold-back review in `maintain` reads this repository's entries, classes each item, and checks the evidence, worth and placement of the ones this repository's context can hold; an item for the house rules or another plugin is listed by its kind with its count, unchecked. It asks once about what it would fold, hold or reject. `scripts/ledger.mjs` keeps one line per item in `ledger.jsonl` in the store, with its status and how often it was seen, so a held item that comes up again returns with its count, and a later item that matches a folded rule counts as that rule's failure. The review ends by writing `.reviewed` in `feedback/` of the config folder, which holds how far each repository has read each log, those of the directories `review.json` names among them, so two config folders that share one plugins folder each keep their own.

## Review settings

`review.json` in the machine's directory, `~/.claude/reimagine-primer/` (under `$CLAUDE_CONFIG_DIR` when set) unless `map --set --local <path>` named another, says what a review reads on this machine. You write it; primer never does. Every key is optional:

```json
{
  "logs": ["~/notes/feedback"],
  "repositories": {
    "~/code/app": { "skip": ["private-note.md"], "transcripts": false }
  }
}
```

- `logs` names more directories of feedback logs, each absolute or `~/`. They are read two levels of subdirectory down and for their `.md` files alone, beside `feedback/` of the config folder, and a file or directory whose name starts with a dot is left out. Every `.md` file found there counts as a log, each `## ` heading in it as an entry, and a review marks it as read, so name a directory that holds logs and nothing else. `scripts/ledger.mjs --unread` prints such a log by its path; give the ledger verbs that path, which they take only for a log the review reads, and the ledger holds it with `~/` for your home directory.
- `repositories` is keyed by the root of a repository's main work tree, and an entry holds in every work tree of it.
- `skip` lists auto memory notes by the file name `MEMORY.md` gives them, in any letter case. The notice does not count them, and `/primer` reads only the notes that `scripts/ledger.mjs --notes <memory directory>` lists, which names none it leaves out. Claude Code still loads `MEMORY.md` into every session and can open any note it lists, so `skip` keeps a note out of primer's review and its proposals, and out of no session.
- `"transcripts": false` keeps `scripts/transcripts.mjs` from reading the session files of that repository, and the fold-back review goes on without your past messages.

A file in another form, a misspelled key or a relative path included, is refused: the notice and each script say `primer: <file> is not a primer review file` rather than read it as empty. `scripts/primer.mjs status` shows what the file gives the repository you are in, or `check review: <file> is not a primer review file` where the file is refused.

## Reach hook

Before Claude Code edits a file in a repository other than the one the session started in, the hook tells it, once per repository and session, what it has not loaded there: the paths of the repository's root instruction files and unscoped rules, and the layers of a `local` repository, less the ones a session that started in a `local` repository already holds. A file under the configuration directory, or of the store or the machine's directory, is never answered. It records each repository in a file per session under the plugin's data directory. An edit in the session's own repository costs one Node start and no `git` call. It never blocks an edit, and where `node` is missing the edit goes through.

## Local profile

On its first run in a repository whose hub has no `<!-- primer -->` marker, `/primer` asks once which profile applies, with no default, and records the answer:

- `shared`: everything above. Instruction files live in the work tree and are committed.
- `local`: nothing is written or committed in the work tree. The repository's context lives in a store outside it and reaches each session through a SessionStart hook, and each subagent that loads instruction files through a SubagentStart hook. Instruction files and a `.claude/settings.json` that the team tracks are read and never written; what you add to them goes in the store, and a setting of your own is proposed for `.claude/settings.local.json`.

The store is `~/.claude/reimagine-primer/store/` (under `$CLAUDE_CONFIG_DIR` when set), or the directory the `store` key of `reimagine-primer/config.json` names, such as one you keep under version control. A file of the store writes a path under your config folder as `<config>/`, read under the config folder of each session, and any other path under your home directory as `~/`, so a store you version or share names no home directory and no config folder. `status` names each line of the store's layers, documents, skills, ledger and copy snapshots that holds this machine's home directory, host name or user name, or a term you list in `terms.txt` in the machine's directory, one a line: it gives the file, the line and the kind and quotes none of the text, and `/primer` proposes to move the line to the machine's side or to reword it. It reads `map.json` and `copies.json` for your listed terms alone, since those two hold this machine's paths by design; a remote that holds a listed term is told, and what to do about it is yours to decide. Where the store sits inside a repository, `/primer` writes its files there and leaves the commit to you. It holds `map.json`, which records each repository's profile and group, `shared.md` for every mapped repository and `groups/<group>.md` for one group of sibling repositories. A procedure is kept there as a skill, `skills/<name>/SKILL.md`, and `scripts/primer.mjs skills --link` links each one into the `skills/` folder of your config folder, where Claude Code loads it as a personal skill, so `/name` runs it. Claude Code lists a personal skill in every repository, so `/primer` names a skill for one group `<group>-<name>`. Each config folder and each machine makes its own links, and `status` names the skills that have none. `reimagine-primer/machine.md` holds what belongs to this machine alone, and `reimagine-primer/machine/<group>.md` what belongs to one group on this machine, which loads in that group's repositories only. That directory belongs to one config folder: a session started under another finds no map, so it loads no layer and its commits are not checked, until `/primer` there names the first folder's store with `map --set --store <path>`. The machine's files stay each folder's own, so the second folder loads none of them until it has them too, or until both folders name one directory for them with `map --set --local <path>`; a `machine.md` left behind in a folder is then not read, and `status` says so. While the default folder reads machine files and a second folder names no directory for them, each start in a `local` repository under the second says that no machine layer is loaded, and so does `status`. A clone matches its repository's entry whatever the letter case of the remote, and with the older `visualstudio.com` hosts of Azure DevOps read as `dev.azure.com`; a remote written another way, such as one with no project against one with a project, is another entry. `/primer` runs `scripts/primer.mjs status`, which shows a repository's entry, each layer's file, size and canary, and the delivery checks: a context string over the host's 10,000-character cap, a repository that is unmapped under a directory the map lists, and git calls that ran past their 5-second limit each show a warning at session start. In a `local` repository the loader also gives the notice above. `scripts/primer.mjs measure` prints each mapped repository's context string as emitted against the cap, and `measure --with <file> <layer>` the size before and after a proposed layer, which `/primer` shows before it proposes an addition.

In a `local` repository, the drift hook runs a staging check on each `git add` and `git commit`, which denies one that would stage or commit `CLAUDE.md`, `CLAUDE.local.md` or `AGENTS.md` at any depth, anything under `.claude/`, `.agents/` or `.reimagine/`, `.reimagine.json`, `.mcp.json`, or a `.gitignore` line that names one of them, unless the upstream's default branch already tracks it. The names count in any letter case. An add and a commit in one command are judged by what both would add. A command it cannot resolve counts as staging every file git does not ignore; the `info/exclude` lines `/primer` offers keep the agent files out of that. A `git merge`, `git cherry-pick`, `git rebase` or `git am` is checked by the files its commits would add and the `.gitignore` lines they add: one that names its commits by a branch, a tag or an id, or its patches as files, is read, and one the check cannot read, such as a name held in a variable or a patch on standard input, is denied with a reason that says so. A `--continue` is checked as the commit it makes. What one of the four brings is read before the command runs, so what runs before it in the same command matters. It is still read after a `cd`, a `git add`, a `git commit`, the start or `--continue` of another of the four, each with no `$(...)` in a quoted word, and a call that only reads: `git status`, `log`, `show`, `diff`, `rev-parse`, `rev-list`, `merge-base`, `describe` or `ls-files`, a `git branch` or `git remote` that only lists, and `echo`, `printf`, `pwd`, `true`, `ls`, `date`, `cat`, `head`, `tail`, `wc`, `grep` or `cut`, in Bash `set` with only the options `-e`, `-u` and `-x`, or `-o` with `pipefail`, `errexit`, `nounset` or `xtrace` (any other, such as `-a`, exports what follows), and in PowerShell `Write-Host`, `Write-Output`, `Get-Location`, `Get-Content` or `Select-Object`, each named with no directory and with no `>` to a file, whatever the call. A variable is followed where the command opens by setting it to a plain text, `R=/work/app` in Bash, one to a command and ended by `;`, `&&` or a line break, or `$r = 'C:\work\app'` in PowerShell, and later names it alone, as in `git -C "$R" merge feat`: the text may hold no expansion and, in Bash, no space, no pattern character and no other character the shell reads as syntax, the name may not start with `GIT_` or start another followed name, nor be one the shell computes or will not assign (`PWD`, `OLDPWD`, `_`, `DIRSTACK`, `GROUPS`, `SHELLOPTS` and the like, and each name that starts with `BASH` or `ZSH`; in PowerShell `$PWD`, `$_`, `$LASTEXITCODE`, `$matches`, `$args`, `$input`, `$error`, `$IsWindows`, each name that starts with `PS` or ends in `Preference`, and the like), the text may not start with `~`, which a shell does not expand in a value, the command may set the name once, and no other word may hold it; after a call that is not one of those just listed, a `source` or a function among them, no name is followed, nor after a call that can write a variable whose name it does not spell: a `printf -v`, a word that holds `$[`, and in PowerShell a call with a common parameter that names a variable, such as `-OutVariable` or `-ov`; any other use leaves the word unread, as before. After one `git checkout` or `git switch` to an existing local branch, with no option, it is read against that branch and against the branch you are on, and denied on what either would bring; a switch that makes a branch, and a second switch, deny it. After a `git fetch` with no option but `--all`, `--prune`, `--no-tags` and those for its output, and no `tag` word, it is read as the remote-tracking branches stand before the fetch, so what the fetch itself brings is not read, as with a pull, and a merge of `FETCH_HEAD` is denied. After a switch, a name read from the head, such as `HEAD~1` or `@{u}`, a `git am` and a `--continue` are denied too. After anything else, a `git stash`, a `git reset` or a script among them, the call is denied: run the merge as a command of its own. A call the check cannot read is denied wherever it runs: an interactive rebase, whose steps an editor writes, a rebase with `-x` or `--exec`, and an am with `-p<n>`, `--directory` or `--patch-format`. `git pull`, `git revert` and a `git reset` to another commit are not read, nor is one of the four inside a substitution or the body of a here-document; one of the four in the text that runs after a here-document or a here-string is denied as unread; the text given to `sh`, `bash`, `dash` or `zsh` with `-c` is read where it holds no expansion. The check reads these commands as a session ordinarily writes them, and it guards against a slip rather than closing every way in: a git alias, an `eval`, a script, and a subcommand held in a variable are not read. A command handed to `pwsh`, `powershell` or `cmd` is not read either, and counts as unresolved when it names an add or a commit. Where it cannot tell which repository a command runs in, as after a `cd` in a command that names `CDPATH`, which sends a `cd` to another folder, it checks every `local` repository of the map, so a deny may name a repository other than the one you are in. While `map.json` cannot be read, it denies every `git add` and `git commit` and every start or `--continue` of those four, naming the file, and passes other commands. Where `node` is missing, the check cannot run and the call goes through. An error of the check denies the call, and where primer's own directory exists so does a script of the plugin that cannot be loaded, for each command whose text names a commit or a git add, stage, merge, cherry-pick, rebase or am.

The check reads the work tree before the command runs, so it cannot see a file the same command makes and then commits, as a script or a `>` before `git add -A && git commit` does. The hook therefore runs again after each shell call: where the command may have committed, it reads the newest hundred commits no remote holds yet, or, where the command runs a `git push`, or holds the word in a text the check does not parse, those the upstream's default branch lacks, since the commit is on a remote by then and the notice says a remote may already hold it, a merge against its first parent, in each repository the command names and the one the hook runs in, and tells Claude Code of each agent file one of them adds, with the commit's id and the name's control characters left out. It denies nothing, since the commit is made. The commit is still local unless the same command pushed it, and after a push to the upstream's default branch in the same command the hook says nothing, since that branch holds the commit by then: send a push as a command of its own, so the commit is told of before it leaves. An unpushed commit of yours that adds an agent file is named the same way at each later commit. That read needs Git 2.31 or later and says nothing on an older one.

## Copies and transcripts

A copy of context text kept in a second place is declared with `scripts/primer.mjs copies --add <copy> <source>`, which keeps a snapshot of the source and the copy's digest in the store, once for each source where the copy has more than one; `copies --ported <copy>` takes them again after a port. `status` and `copies` report each copy as `current`, `source changed` with the source's diff from the snapshot, `copy changed` or `both changed`. `copies --spans` lists the runs of at least three lines that are not blank which two layers or documents share, longest first, as candidates for one home. The script ports nothing.

`scripts/transcripts.mjs [--repo <dir>] [--from <YYYY-MM-DD>] [--to <YYYY-MM-DD>]` lists your own messages from the session files under `~/.claude/projects/` for every work tree of a repository and a span of days in UTC, with no model call. Claude Code documents that format as internal, so the reader skips a line it cannot read and prints the share it skipped. It counts nothing, and where `review.json` turns it off for the repository it reads nothing and says so.

## Save points

Run `/primer:park` with what a session waits for when you park it:

```
/primer:park the reviewer's reply
```

It adds one entry for the session to `sessions.txt` in the machine's directory, which is `~/.claude/reimagine-primer/` (under `$CLAUDE_CONFIG_DIR` when set) unless `map --set --local <path>` named another, so two config folders that name one directory keep one list:

```
2026-11-19  app  main
what: the release notes of the next version
back when: the reviewer's reply
in: /work/app
record: under ~/.claude, last written 2026-11-19
claude --resume 11111111-2222-4333-8444-555555555555 --model <model> --effort high
```

To go back, paste the last line in a shell in the entry's directory, under the config folder its `record:` line names (set `CLAUDE_CONFIG_DIR` first where that is not your shell's): a session resumed by its id from another directory runs there. `/primer:park list` prints the entries, numbered, with the age of each session's record, and `/primer:park done` removes this session's entry, or the entry of the number you give. You can also delete an entry's lines in the file yourself.

Only the command starts the skill, and `scripts/park.mjs` makes every write, with no model call: the session supplies the two lines of words, and the rest comes from what Claude Code gives a shell call and from the session's record. The entry's directory is the one the session started in, so a `cd` the session made into a directory of it changes nothing; a session that moved into another work tree is named by that one. Claude Code documents that record's format as internal, so the command leaves out `--model` or `--effort` when the script cannot read one, and says so; a resumed session keeps its model without the flag. An entry holds nothing of the session's progress, so a session has no reason to write it again until you run the command again. One run at a time writes the file: a second run waits a few seconds for the first. A line you add inside an entry, between its first line and its command, stays in it.

Claude Code deletes a session's record once it is older than `cleanupPeriodDays`, 30 days unless you set it, and that entry's command then resumes nothing. Every run marks each entry with the day its record was last written, or the day a run first did not find it. The script changes no setting.

## Uninstall

```
/plugin uninstall primer@reimagine-engine
```

The files it wrote stay in your repositories.

## License

Apache-2.0. See `LICENSE`.

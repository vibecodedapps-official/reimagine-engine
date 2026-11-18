# primer

Keeps a repository's project instructions in the forms Claude Code loads: a short `CLAUDE.md` hub, path-scoped rules under `.claude/rules/`, nested `CLAUDE.md` files and skills under `.claude/skills/`. It promotes auto memory into them and checks every commit with a hook.

## Install

```
/plugin marketplace add vibecodedapps-official/reimagine-engine
/plugin install primer@reimagine-engine
```

## Requirements

Git. On Windows, Git for Windows: the hooks run under its `sh`. Node 22 or later: the loader's SessionStart and SubagentStart entries start `scripts/primer.mjs` in every session and at every subagent's start, whatever the profile, and the `local` profile's staging check of `scripts/staged.mjs`, the reach hook, the ledger of `scripts/ledger.mjs`, the copy check and the transcript reader of `scripts/transcripts.mjs` run on it. No `jq`.

## Use

Run `/primer` in a repository (also reachable as `/primer:primer`). It reads the files on disk and says its mode on the first line before it writes anything:

- `init`: the repository has no `CLAUDE.md` or `AGENTS.md` anywhere. It reads the README, manifests, build files, CI workflows, tests and `docs/`, writes the hub and leaves it uncommitted for you to review. It proposes the first rules and skills the repository shows and writes none without a yes. Claude Code's own `/init` is the unopinionated alternative.
- `adopt`: instruction or documentation files exist but there is no hub. It lists every instruction and documentation file, shows a plan and asks once. On a yes it commits moves first and rewrites after. It touches documentation files only.
- `maintain`: a hub exists. It checks the instruction files against the code, offers auto memory notes about the repository for promotion, and proposes skills for procedures it finds. With nothing to change it prints `primer: no drift` and writes nothing.

Name a mode to force it:

```
/primer adopt
```

`/primer move` runs only when you name it. It takes a repository's tracked agent files out and leaves the repository on the `local` profile below: it restates what the files hold in the store, lists each setting, hook and MCP server for you to place in your own configuration, and removes the files in one commit, which it never pushes. It makes no removal commit while your own `attribution` setting would add a trailer to it.

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

Without the marker it does nothing but the staging check of the `local` profile, below. It never writes a file. It is not a git hook: commits made outside Claude Code are not checked.

## Memory notice

When a session starts in a repository whose hub starts with `<!-- primer -->`, the notice counts the `feedback` and `project` notes in the repository's auto memory that changed since the last promote pass, and shows one line when there are any:

```
primer: auto memory has 2 notes since the last review; run /primer
```

`/primer` in `maintain` mode reviews them and records the review, after which the line goes until new notes arrive. Without the marker the notice says nothing. It never writes a file.

The notice also counts the feedback logs under `~/.claude/feedback/` (under `$CLAUDE_CONFIG_DIR` when set) that changed since the last fold-back review. The house rules have each session write there unless loaded context names another log, which primer does not read. It counts them in every repository, since the logs belong to none:

```
primer: auto memory has 2 notes and 1 feedback logs since the last review; run /primer
```

The fold-back review in `maintain` checks each logged item's evidence, then its worth and placement, and asks once about what it would fold, hold or reject. `scripts/ledger.mjs` keeps one line per item in `ledger.jsonl` in the store, with its status and how often it was seen, so a held item that comes up again returns with its count, and a later item that matches a folded rule counts as that rule's failure. The review ends by writing `.reviewed` in the logs' folder, so two config folders that share one plugins folder each keep their own review time.

## Reach hook

Before Claude Code edits a file in a repository other than the one the session started in, the hook tells it, once per repository and session, what it has not loaded there: the paths of the repository's root instruction files and unscoped rules, and the layers of a `local` repository, less the ones a session that started in a `local` repository already holds. A file under the configuration directory, or of the store or the machine's directory, is never answered. It records each repository in a file per session under the plugin's data directory. An edit in the session's own repository costs one Node start and no `git` call. It never blocks an edit, and where `node` is missing the edit goes through.

## Local profile

On its first run in a repository whose hub has no `<!-- primer -->` marker, `/primer` asks once which profile applies, with no default, and records the answer:

- `shared`: everything above. Instruction files live in the work tree and are committed.
- `local`: nothing is written or committed in the work tree. The repository's context lives in a store outside it and reaches each session through a SessionStart hook, and each subagent that loads instruction files through a SubagentStart hook. Instruction files and a `.claude/settings.json` that the team tracks are read and never written; what you add to them goes in the store, and a setting of your own is proposed for `.claude/settings.local.json`.

The store is `~/.claude/reimagine-primer/store/` (under `$CLAUDE_CONFIG_DIR` when set), or the directory the `store` key of `reimagine-primer/config.json` names, such as one you keep under version control. A file of the store writes a path under your home directory as `~/`, so a store you version or share names no home directory. Where the store sits inside a repository, `/primer` writes its files there and leaves the commit to you. It holds `map.json`, which records each repository's profile and group, `shared.md` for every mapped repository and `groups/<group>.md` for one group of sibling repositories. A procedure is kept there as a skill, `skills/<name>/SKILL.md`, and `scripts/primer.mjs skills --link` links each one into the `skills/` folder of your config folder, where Claude Code loads it as a personal skill, so `/name` runs it. Claude Code lists a personal skill in every repository, so `/primer` names a skill for one group `<group>-<name>`. Each config folder and each machine makes its own links, and `status` names the skills that have none. `reimagine-primer/machine.md` holds what belongs to this machine alone, and `reimagine-primer/machine/<group>.md` what belongs to one group on this machine, which loads in that group's repositories only. That directory belongs to one config folder: a session started under another finds no map, so it loads no layer and its commits are not checked, until `/primer` there names the first folder's store with `map --set --store <path>`. The machine's files stay each folder's own, so the second folder loads none of them until it has them too, or until both folders name one directory for them with `map --set --local <path>`; a `machine.md` left behind in a folder is then not read, and `status` says so. A clone matches its repository's entry whatever the letter case of the remote, and with the older `visualstudio.com` hosts of Azure DevOps read as `dev.azure.com`; a remote written another way, such as one with no project against one with a project, is another entry. `/primer` runs `scripts/primer.mjs status`, which shows a repository's entry, each layer's file, size and canary, and the delivery checks: a context string over the host's 10,000-character cap, a repository that is unmapped under a directory the map lists, and git calls that ran past their 5-second limit each show a warning at session start. In a `local` repository the loader also gives the notice above. `scripts/primer.mjs measure` prints each mapped repository's context string as emitted against the cap, and `measure --with <file> <layer>` the size before and after a proposed layer, which `/primer` shows before it proposes an addition.

In a `local` repository, the drift hook hands each `git add` and `git commit` to a staging check, which denies one that would stage or commit `CLAUDE.md`, `CLAUDE.local.md` or `AGENTS.md` at any depth, anything under `.claude/`, `.agents/` or `.reimagine/`, `.reimagine.json`, `.mcp.json`, or a `.gitignore` line that names one of them, unless the upstream's default branch already tracks it. The names count in any letter case. A command it cannot resolve counts as staging every file git does not ignore; the `info/exclude` lines `/primer` offers keep the agent files out of that. The check reads `git add`, `git stage` and `git commit` as a session ordinarily writes them, and it guards against a slip rather than closing every way in: a git alias, an `eval`, a script, and a subcommand held in a variable are not read. A command handed to `pwsh`, `powershell` or `cmd` is not read either, and counts as unresolved when it names an add or a commit. Where it cannot tell which repository a command runs in, it checks every `local` repository of the map, so a deny may name a repository other than the one you are in. While `map.json` cannot be read, it denies every `git add` and `git commit`, naming the file, and passes other commands. Where `node` or `sh` is missing, the check cannot run and the call goes through.

## Copies and transcripts

A copy of context text kept in a second place is declared with `scripts/primer.mjs copies --add <copy> <source>`, which keeps a snapshot of the source and the copy's digest in the store, once for each source where the copy has more than one; `copies --ported <copy>` takes them again after a port. `status` and `copies` report each copy as `current`, `source changed` with the source's diff from the snapshot, `copy changed` or `both changed`. `copies --spans` lists the runs of at least three lines that are not blank which two layers or documents share, longest first, as candidates for one home. The script ports nothing.

`scripts/transcripts.mjs [--repo <dir>] [--from <YYYY-MM-DD>] [--to <YYYY-MM-DD>]` lists your own messages from the session files under `~/.claude/projects/` for every work tree of a repository and a span of days in UTC, with no model call. Claude Code documents that format as internal, so the reader skips a line it cannot read and prints the share it skipped. It counts nothing.

## Uninstall

```
/plugin uninstall primer@reimagine-engine
```

The files it wrote stay in your repositories.

## License

Apache-2.0. See `LICENSE`.

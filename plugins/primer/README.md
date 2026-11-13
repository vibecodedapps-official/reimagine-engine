# primer

Keeps a repository's project instructions in the forms Claude Code loads: a short `CLAUDE.md` hub, path-scoped rules under `.claude/rules/`, nested `CLAUDE.md` files and skills under `.claude/skills/`. It promotes auto memory into them and checks every commit with a hook.

## Install

```
/plugin marketplace add vibecodedapps-official/reimagine-engine
/plugin install primer@reimagine-engine
```

## Requirements

Git. On Windows, Git for Windows: the hooks run under its `sh`. Node 22 or later: the loader's SessionStart entry starts `scripts/primer.mjs` in every session, whatever the profile, and the `local` profile's staging check, the reach hook and the ledger of `scripts/ledger.mjs` run on it. No `jq`.

## Use

Run `/primer` in a repository (also reachable as `/primer:primer`). It reads the files on disk and says its mode on the first line before it writes anything:

- `init`: the repository has no `CLAUDE.md` or `AGENTS.md` anywhere. It reads the README, manifests, build files, CI workflows, tests and `docs/`, writes the hub and leaves it uncommitted for you to review. It proposes the first rules and skills the repository shows and writes none without a yes. Claude Code's own `/init` is the unopinionated alternative.
- `adopt`: instruction or documentation files exist but there is no hub. It lists every instruction and documentation file, shows a plan and asks once. On a yes it commits moves first and rewrites after. It touches documentation files only.
- `maintain`: a hub exists. It checks the instruction files against the code, offers auto memory notes about the repository for promotion, and proposes skills for procedures it finds. With nothing to change it prints `primer: no drift` and writes nothing.

Name a mode to force it:

```
/primer adopt
```

The skill also answers to "turn this into a skill", "we keep doing this", "add this to the project instructions" and "check the instruction files".

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

The notice also counts the feedback logs that the house rules have each session write under `~/.claude/feedback/` (under `$CLAUDE_CONFIG_DIR` when set) and that changed since the last fold-back review, in every repository, since the logs belong to none:

```
primer: auto memory has 2 notes and 1 feedback logs since the last review; run /primer
```

The fold-back review in `maintain` checks each logged item's evidence, then its worth and placement, and asks once about what it would fold, hold or reject. `scripts/ledger.mjs` keeps one line per item in `ledger.jsonl` in the store, with its status and how often it was seen, so a held item that comes up again returns with its count, and a later item that matches a folded rule counts as that rule's failure.

## Reach hook

Before Claude Code edits a file in a repository other than the one the session started in, the hook tells it, once per repository and session, what it has not loaded there: the layers of a `local` repository, or the paths of the root instruction files and unscoped rules of any other. It records each repository in a file per session under the plugin's data directory. An edit in the session's own repository costs one Node start and no `git` call. It never blocks an edit, and where `node` is missing the edit goes through.

## Local profile

On its first run in a repository whose hub has no `<!-- primer -->` marker, `/primer` asks once which profile applies, with no default, and records the answer:

- `shared`: everything above. Instruction files live in the work tree and are committed.
- `local`: nothing is written or committed in the work tree. The repository's context lives in a store outside it and reaches each session through a SessionStart hook.

The store is `~/.claude/reimagine-primer/store/` (under `$CLAUDE_CONFIG_DIR` when set), or the directory the `store` key of `reimagine-primer/config.json` names, such as one you keep under version control. It holds `map.json`, which records each repository's profile and group, `shared.md` for every mapped repository and `groups/<group>.md` for one group of sibling repositories. `reimagine-primer/machine.md` holds what belongs to this machine alone. `/primer` runs `scripts/primer.mjs status`, which shows a repository's entry, each layer's file, size and canary, and the delivery checks: a context string over the host's 10,000-character cap, a repository that is unmapped under a directory the map lists, and git calls that ran past their 5-second limit each show a warning at session start. In a `local` repository the loader also gives the notice above. `scripts/primer.mjs measure` prints each mapped repository's context string as emitted against the cap, and `measure --with <file> <layer>` the size before and after a proposed layer, which `/primer` shows before it proposes an addition.

In a `local` repository, the drift hook hands each `git add` and `git commit` to a staging check, which denies one that would stage or commit `CLAUDE.md`, `CLAUDE.local.md` or `AGENTS.md` at any depth, anything under `.claude/` or `.reimagine/`, `.reimagine.json`, `.mcp.json`, or a `.gitignore` line that names one of them, unless the upstream's default branch already tracks it. A command it cannot resolve counts as staging every file git does not ignore; the `info/exclude` lines `/primer` offers keep the agent files out of that. The check reads `git add`, `git stage` and `git commit` as a session ordinarily writes them, and it guards against a slip rather than closing every way in: a git alias, an `eval`, a script, and a subcommand held in a variable are not read. Where it cannot tell which repository a command runs in, it checks every `local` repository of the map, so a deny may name a repository other than the one you are in. Where `node` or `sh` is missing, the check cannot run and the call goes through.

## Uninstall

```
/plugin uninstall primer@reimagine-engine
```

The files it wrote stay in your repositories.

## License

Apache-2.0. See `LICENSE`.

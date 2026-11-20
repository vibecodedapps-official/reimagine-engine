# The local profile

A `local` run writes nothing in the repository's work tree, makes no commit or stash, and changes neither the index nor a `.gitignore`. The repository's context lives in a store outside it, and a SessionStart hook loads it into every session there. The `status` run of `SKILL.md` names, for the working directory, the entry, each file below, each layer's size and canary, and each delivery check.

## The store

- `<config>/reimagine-primer/`, `<config>` being `$CLAUDE_CONFIG_DIR` else `~/.claude`, holds `config.json`, whose `store` key may name the store and whose `local` key the machine's directory. The machine's directory, primer's own unless `local` names another, holds `machine.md`, the layer of this machine, and `machine/<group>.md`, the layer of one group on this machine.
- The store, `<config>/reimagine-primer/store/` unless `config.json` names another, holds `map.json`; `shared.md`, the layer of every mapped repository; `groups/<group>.md`, the layer of one group of sibling repositories; under `docs/` the documents a layer points to; and under `skills/` the skills, each `skills/<name>/SKILL.md` in the skill shape of `shapes.md`. A store the user versions or shares names no home directory and no config folder: the script holds a path under the config folder as `<config>/`, read under the config folder of the run, and any other path under the home directory as `~/`.
- The loader emits the shared and group layers, then the machine's and the group's on this machine, as one string: each opens with a line that names its file and closes with its canary line. It warns at every start while the string is over the host's cap of 10,000 characters, and at startup gives the notice of auto memory notes and feedback entries since the last review, as the notice hook does where a hub has the marker.
- A layer is factual statements, never commands addressed to the session, since the host may show imperative injected text to the user as a suspected injection.
- A skill of the store reaches a session as a personal skill, through a link of its name in `<config>/skills/`. The host lists a personal skill in every repository, so a skill for one group is named `<group>-<name>`, in its directory and its `name`, and its description says which repositories it serves. `node "${CLAUDE_PLUGIN_ROOT}/scripts/primer.mjs" skills` lists each skill with its link.
- A shared layer costs in every mapped repository, and the tightest one sets the budget. `node "${CLAUDE_PLUGIN_ROOT}/scripts/primer.mjs" measure` prints each repository's string as emitted; before a proposal that adds to a layer, write the proposed layer to a temporary file outside the work tree and show `measure --with <file> <layer>`, the layer being `shared.md`, `groups/<group>.md`, `machine.md` or `machine/<group>.md`, with each repository's size before and after; a group that no `local` entry holds yet, as in a move, gets a line of its own.
- A store that is versioned or shared holds nothing of one machine. `status` prints `check tracked` for each line of a layer, a document, a skill, the ledger or a copy's snapshot in the store that holds this machine's home directory, host name or user name, or a term of `terms.txt` in the machine's directory: the user's own list, one term a line, of what stays out of the store. `measure --with` prints the same for a proposed layer. Propose to move such a line to the machine's side or to reword it, and read `status` again after a write to the store.
- Where a proposal goes, and what it carries, is in the local profile section of `placement.md`.

## Mode

- `init` while the store holds no layer for the repository's group, `maintain` after; `adopt` does not run.
- Instruction files the upstream tracks are the repository's own, nested `CLAUDE.md` and `AGENTS.md` files, rules, skills and `.claude/settings.json` among them: read them, never write them, and propose no line that one of them states. A root instruction file git ignores is the user's own and does not stop the run.
- An addition of the user's to what a tracked file covers is placed as the local profile section of `placement.md` says, and its line or its pointer names the directory or the files it covers, since a layer loads in every session there and never by path. A setting wanted beside a tracked `.claude/settings.json` is proposed for `.claude/settings.local.json` by placement item 2, never written, and the staging check keeps that file out of a commit.
- `init` reads the repository as `init.md` step 2 does and proposes the group layer in the skill form of Proposals, with the first line `<n>. Layer <file>` and a `Writes:` line naming the file.
- `maintain` verifies each layer's statements, and each skill of the store, as Maintain step 2 verifies instruction files, and proposes each fix as a write to the file that holds it. Where `status` prints `check skills`, the plan offers the links.
- A skill proposal's `Writes:` line names `skills/<name>/SKILL.md` under the store.

## Writes

- Write a layer, in the store or the machine's directory, a document under the store's `docs/`, or a skill's file under its `skills/`, with the Write or Edit tool, and only on a yes that names the file.
- `map.json` and `config.json` change only through the same script's `map` verb: show the exact command and the change it makes, run it on a yes, and never edit either file by hand. `map --set --group <name>` puts sibling repositories in one group; `map --add --root <dir>` lists a directory whose repositories the user expects to be mapped, so an unmapped one there gets a warning at start; `map --set --store <path>`, given alone, names a store kept elsewhere, by an absolute or `~/` path, and `map --set --local <path>` the machine's directory the same way.
- A link in `<config>/skills/` is made only by the same script's `skills --link`, which makes the missing links, and again those whose directory is gone, and leaves any other entry of a skill's name: show the command and the links it would make, and run it on a yes.
- The review stamp of Maintain step 3 is written as before.
- A store or a machine's directory inside a repository, which `git -C <directory> rev-parse --show-toplevel` names, is that repository's to commit. Write its files and leave them: make and offer no commit, branch, push or pull request there, and name in the report the repository and each file left uncommitted. A fold into such a file is recorded with no commit.

## Beside the plan

- Read `info/exclude` under the repository's common directory (`git rev-parse --git-common-dir`), which git never shares. Where it holds every line below and the exceptions after the list that each tracked agent file needs, and no stale exception as the paragraph after the list defines it, make no offer; else offer what is missing and what is stale, lines and exceptions alike, as its own question. On a yes, append the missing ones and remove the stale ones, except that a plain `<folder>/` line is replaced as the paragraph after the list says; where the host refuses that write, show the change for the user to make; a no leaves it, and the next run offers them again. Without them, a `git add` or `git commit` the staging check cannot resolve is denied while an agent file is in the work tree.

  ```
  CLAUDE.md
  CLAUDE.local.md
  AGENTS.md
  .claude/
  .agents/
  .reimagine/
  .reimagine.json
  .mcp.json
  ```

  A content search honors these lines and passes over a file they match, though git tracks it. So each agent file `git ls-files` lists needs an exception after the lines above: `!/<path>`. For a file under one of the three folders, the folder's line is `**/<folder>/**`, which counts as that line, and before the file's exception go `!/<directory>/` for each directory between the folder and the file, since no exception is read under an excluded directory. A plain `<folder>/` line excludes the folder itself, so no exception under it is read: for a folder that holds a tracked agent file, replace that line with `**/<folder>/**` instead of appending a second. An exception is stale when git no longer tracks its file, as after a move, since it re-includes an untracked agent file of that path, which then shows in `git status`; a folder left with no tracked agent file is stale in the same way, and goes back to its plain `<folder>/` line in place of its `**/<folder>/**` line and the `!/<directory>/` lines under it. Say with the offer that a search started inside such a folder still passes over its files, which are read by path.

- The plan proposes the host's `attribution` setting with empty `commit` and `pr` values, by placement item 2, since a session attribution line in a commit message shows what the profile hides. Primer never writes it.

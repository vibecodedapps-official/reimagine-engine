# The local profile

A `local` run writes nothing in the repository's work tree, makes no commit or stash, and changes neither the index nor a `.gitignore`. The repository's context lives in a store outside it, and a SessionStart hook loads it into every session there. The `status` run of `SKILL.md` names, for the working directory, the entry, each file below, each layer's size and canary, and each delivery check.

## The store

- `<config>/reimagine-primer/`, `<config>` being `$CLAUDE_CONFIG_DIR` else `~/.claude`, holds `config.json`, whose `store` key may name the store and whose `local` key the machine's directory. The machine's directory, primer's own unless `local` names another, holds `machine.md`, the layer of this machine, and `machine/<group>.md`, the layer of one group on this machine.
- The store, `<config>/reimagine-primer/store/` unless `config.json` names another, holds `map.json`; `shared.md`, the layer of every mapped repository; `groups/<group>.md`, the layer of one group of sibling repositories; under `docs/` the documents a layer points to; and under `skills/` the skills, each `skills/<name>/SKILL.md` in the skill shape of `shapes.md`. A store the user versions or shares names no home directory: the script holds a path under it as `~/`.
- The loader emits the shared and group layers, then the machine's and the group's on this machine, as one string: each opens with a line that names its file and closes with its canary line. It warns at every start while the string is over the host's cap of 10,000 characters, and at startup gives the notice of auto memory notes and feedback entries since the last review, as `notice.sh` does where a hub has the marker.
- A layer is factual statements, never commands addressed to the session, since the host may show imperative injected text to the user as a suspected injection.
- A skill of the store reaches a session as a personal skill, through a link of its name in `<config>/skills/`. The host lists a personal skill in every repository, so a skill for one group is named `<group>-<name>`, in its directory and its `name`, and its description says which repositories it serves. `node "${CLAUDE_PLUGIN_ROOT}/scripts/primer.mjs" skills` lists each skill with its link.
- A shared layer costs in every mapped repository, and the tightest one sets the budget. `node "${CLAUDE_PLUGIN_ROOT}/scripts/primer.mjs" measure` prints each repository's string as emitted; before a proposal that adds to a layer, write the proposed layer to a temporary file outside the work tree and show `measure --with <file> <layer>`, the layer being `shared.md`, `groups/<group>.md`, `machine.md` or `machine/<group>.md`, with each repository's size before and after.
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

- Read `info/exclude` under the repository's common directory (`git rev-parse --git-common-dir`), which git never shares. Where it holds every line below, make no offer; else offer the missing ones, as its own question. On a yes, append them; where the host refuses that write, show them for the user to add; a no leaves it, and the next run offers them again. Without them, a `git add` or `git commit` the staging check cannot resolve is denied while an agent file is in the work tree.

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

- The plan proposes the host's `attribution` setting with empty `commit` and `pr` values, by placement item 2, since a session attribution line in a commit message shows what the profile hides. Primer never writes it.

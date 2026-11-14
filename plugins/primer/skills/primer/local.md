# The local profile

A `local` run writes nothing in the repository's work tree, makes no commit or stash, and changes neither the index nor a `.gitignore`. The repository's context lives in a store outside it, and a SessionStart hook loads it into every session there. The `status` run of `SKILL.md` names, for the working directory, the entry, each file below, each layer's size and canary, and each delivery check.

## The store

- `<config>/reimagine-primer/`, `<config>` being `$CLAUDE_CONFIG_DIR` else `~/.claude`, holds `config.json`, whose `store` key may name the store, and `machine.md`, the layer of this machine: what names a person, a date or a path of this machine.
- The store, `<config>/reimagine-primer/store/` unless `config.json` names another, holds `map.json`; `shared.md`, the layer of every mapped repository; `groups/<group>.md`, the layer of one group of sibling repositories; and under `docs/` the documents a layer points to. A store the user versions or shares carries nothing of one machine.
- The loader emits the shared, group and machine layers, in that order, as one string: each opens with a line that names its file and closes with its canary line. It warns at every start while the string is over the host's cap of 10,000 characters, and at startup gives the notice of auto memory notes and feedback logs since the last review, as `notice.sh` does where a hub has the marker.
- A layer is factual statements, never commands addressed to the session, since the host may show imperative injected text to the user as a suspected injection.
- A shared layer costs in every mapped repository, and the tightest one sets the budget. `node "${CLAUDE_PLUGIN_ROOT}/scripts/primer.mjs" measure` prints each repository's string as emitted; before a proposal that adds to a layer, write the proposed layer to a temporary file outside the work tree and show `measure --with <file> <layer>`, the layer being `shared.md`, `groups/<group>.md` or `machine.md`, with each repository's size before and after.
- Where a proposal goes, and what it carries, is in the local profile section of `placement.md`.

## Mode

- `init` while the store holds no layer for the repository's group, `maintain` after; `adopt` does not run.
- Instruction files the upstream tracks are the repository's own: read them, never rewrite them. A root instruction file git ignores is the user's own and does not stop the run.
- `init` reads the repository as `init.md` step 2 does and proposes the group layer in the skill form of Proposals, with the first line `<n>. Layer <file>` and a `Writes:` line naming the file.
- `maintain` verifies each layer's statements as Maintain step 2 verifies instruction files, and proposes each fix as a write to the layer that holds it.

## Writes

- Write a layer, a document under the store's `docs/` or `machine.md` with the Write or Edit tool, and only on a yes that names the file.
- `map.json` and `config.json` change only through the same script's `map` verb: show the exact command and the change it makes, run it on a yes, and never edit either file by hand. `map --set --group <name>` puts sibling repositories in one group; `map --add --root <dir>` lists a directory whose repositories the user expects to be mapped, so an unmapped one there gets a warning at start; `map --set --store <path>`, given alone, names a store kept elsewhere, by an absolute or `~/` path.
- The review stamp of Maintain step 3 is written as before.

## Once per repository

- As its own question, offer the lines below for `info/exclude` under the repository's common directory (`git rev-parse --git-common-dir`), which git never shares. On a yes, append them; where the host refuses that write, show them for the user to add; a no leaves it. Without them, a `git add` or `git commit` the staging check cannot resolve is denied while an agent file is in the work tree.

  ```
  CLAUDE.md
  CLAUDE.local.md
  AGENTS.md
  .claude/
  .reimagine/
  .reimagine.json
  .mcp.json
  ```

- The plan proposes the host's `attribution` setting with empty `commit` and `pr` values, by placement item 2, since a session attribution line in a commit message shows what the profile hides. Primer never writes it.

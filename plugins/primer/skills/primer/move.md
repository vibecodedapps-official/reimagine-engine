# Move

A move takes a repository's tracked agent files out. What they hold is restated in the store, and one commit removes them, a tracked settings file among them: the only write and the only commit the run makes in the work tree. The run ends with the repository `local`, so its profile line is `primer: profile local`, and `local.md` governs every write to the store.

1. State the mode. Stop with nothing written when git tracks no agent file, or when one has an uncommitted change.
2. Inventory the agent files git tracks: the ones the `info/exclude` lines of `local.md` name, at any depth. A file that code, CI or a manifest reads is listed and stays until the user says.
3. Place what each file holds by the local profile section of `placement.md`:
   - A hub line, an unscoped rule and a nested file's text become statements of the group layer, restated as facts, since a layer holds no commands. A path-scoped rule becomes a document under the store, with a pointer that names the files it covers.
   - A skill moves to the store's `skills/` whole.
   - A setting, a permission, a hook, an MCP server and an agent definition are the host's configuration, which primer never writes: list each with the file of the user's own it would go to, and what stops when the tracked file leaves.
   - Text the code states, stale text and text true of every project is dropped, each with its reason.
4. Read the `attribution` setting the removal commit would run under once the tracked settings file is gone: the user's own settings and `.claude/settings.local.json`. Unless its `commit` and `pr` values are empty there, propose them by placement item 2, and make no removal commit until the user has set them or says the trailer may stay: the message would carry what the profile hides.
5. Print the plan and ask once: each store write with its `measure` output, the links, each configuration item of step 3, the removal commit with its subject and every file it removes, and the `map` command. It says that the commit removes the files for everyone who pulls it.
6. On the yes, in this order, stopping at the first step that fails: write the store's files and read each back; make the links; make the removal commit; run the `map` command, `map --add --profile local`, or `map --set --profile local` where an entry exists; check that `status` gives each layer written with its canary.
7. The removal commit is `git rm` of the listed files and a commit of those paths alone. Its subject follows the repository's convention, else `chore: <subject>`. Neither subject nor body names a model, an agent, a tool, a plugin or a file named for one, and it has no `Instruction-file` line. Never push it.
8. End with the store files written, the commit, each configuration item left to the user, and the `info/exclude` offer of `local.md`. Where the run stopped part way, say which steps are done; a second `/primer move` finishes it.

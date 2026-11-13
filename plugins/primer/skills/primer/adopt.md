# Adopt

1. State the mode.
2. Inventory every instruction and documentation file, tracked, untracked and ignored: `CLAUDE.md`, `AGENTS.md` and `CLAUDE.local.md` at any depth, `.claude/CLAUDE.md`, `.claude/rules/**`, `.claude/skills/**`, `README.md`, `CONTRIBUTING.md` and Markdown under `docs/`, with each file's line and character count and every `@path` import and what it names. List other tools' rule files, such as `.cursor/rules/` or `.github/copilot-instructions.md`, and leave them alone.
3. Refactor a file only when it is over its cap, holds content for two scopes, or duplicates another. Every other file stays as it is.
4. Never move a pinned file: one an `@` import names, one a file that is not documentation references (code, configuration, CI, a package manifest), or one with a name other tools read (`README.md`, `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `LICENSE`, anything under `.github/`). A link from a documentation file does not pin.
5. Place each piece by `placement.md` into the shapes of `shapes.md`:
   - In a `## Spokes` index, a pointer whose condition is a file pattern becomes a path-scoped rule with that pattern in `paths`; one whose condition is a task becomes a skill; one whose condition is a directory becomes a nested `CLAUDE.md` in it. The index goes, which converts the repository in one run.
   - A procedure in an instruction file becomes a skill and leaves that file. A procedure in `CONTRIBUTING.md` is proposed as a skill, and `CONTRIBUTING.md` stays as it is.
6. Check every statement kept or written against the code it describes: each command exists and does what its line says, each path exists, each rule names files and behavior that exist. Correct an untrue statement in the rewrite that holds it.
7. Print the plan in the form of `SKILL.md`, Plans, then ask once.
8. On the yes, make the commits in the order Plans gives. The last rewrite commit writes the hub with its marker, so the drift hook checks the finished set.
9. End with the commits made and the reported items. A second run reads as `maintain`.

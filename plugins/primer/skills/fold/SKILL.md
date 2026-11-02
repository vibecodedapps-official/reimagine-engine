---
name: fold
description: Reviews the repository against the current Claude Code documentation and reports where a documented practice or mechanism can be folded in, writing nothing.
disable-model-invocation: true
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash(git status *)
  - Bash(git diff *)
  - Bash(git log *)
  - Bash(git show *)
  - Bash(git rev-parse *)
  - Bash(git ls-files *)
  - Bash(git check-ignore *)
  - Bash(git grep *)
  - WebFetch(domain:code.claude.com)
---

# fold

Compare the repository on disk with what the Claude Code documentation says today, and report what is worth folding in. Take no arguments.

## Writes

Write nothing: not the repository, not the plugin data directory. Never run `/primer`, the loop, `/init` or `/doctor`. For contradictions inside the instruction files, name `/doctor prompt-audit`. The one command besides git reads is `claude --version`, which may prompt once.

## Sources

The documentation is read live on every run and this file holds none of it. The index is `https://code.claude.com/docs/llms.txt`; a page is `https://code.claude.com/docs/en/<page>.md`. The index wins over the lists below: read a renamed or added page in these areas, and report a listed page that is gone.

Tell the situation from the files:

- A tool for Claude: a plugin manifest, a marketplace, or a `skills/`, `hooks/`, `agents/` or `workflows/` tree outside `.claude/` that holds Claude Code components: a `SKILL.md`, a `hooks.json`, an agent Markdown file with `name` and `description` frontmatter, or a workflow script that exports `meta`.
- A repository worked on with Claude Code: `CLAUDE.md` or `AGENTS.md`, `.claude/`, or hooks or permissions in settings.
- Both.

Starting pages for every repository: memory, skills, hooks-guide, hooks, sub-agents, best-practices, settings, permissions, claude-directory, and large-codebases for a monorepo.

For a tool for Claude, also: plugins/create, plugins/components, plugins/manifest-reference, plugins/marketplace-reference, plugins/publish, plugins/measure, plugins/loading, plugins/troubleshooting, plugin-evals, workflows, and the mods pages when a mod is present.

Do not read admin, gateway, cloud, desktop or Agent SDK pages.

## Reading

Launch one read-only subagent per page with the Agent tool, model `sonnet`, in parallel, at most 20 at a time since the host refuses more, each later one launched as an earlier one finishes. Give it the page URL. It returns the page's practices and mechanisms, each with its section and the quoted or closely paraphrased text. Some pages are very long, so it pages through with the fetch tool's offset until the page ends. Its fetch may prompt for permission; that is expected.

Read `${CLAUDE_PLUGIN_ROOT}/skills/primer/placement.md` and `${CLAUDE_PLUGIN_ROOT}/skills/primer/shapes.md` yourself. They place each fold, and the docs are the check on them.

## Judging

Map what the subagents return onto the repository, and judge each practice against what the files do. An item needs evidence from both sides: the docs text and the repository file and line, or the fact that nothing holds it.

- Where `shapes.md` or `placement.md` says what the docs no longer say, the destination is primer.
- Where a doc practice and a suite choice differ, such as a primer cap, the suite's choice stands and the item is a note.
- Where `shapes.md` or `placement.md` and the docs disagree about what the host does, the item names both texts, and its change is the check that would settle it, not an edit of primer's file.
- Recommend an item only when it affects correctness or risk, or costs more to leave than to fold. The rest are notes.

## Report

The reply only, one item per fold candidate:

- the page and section
- the repository file and line, or that nothing holds it
- what the docs say, quoted or closely paraphrased
- what the repository does
- the change and its destination by `placement.md`: hub, rule, nested file, skill, a hook or setting proposed, or a manifest field
- recommended, or a note

A fold into an instruction file names `/primer`. A fold into code, configuration, a hook or a manifest is written so it can be pasted as a loop description.

End with the pages read, the date, the host version from `claude --version`, and what the run could not read.

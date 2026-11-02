---
name: refactor
description: Reviews the whole repository against the house rules and its own instruction files, reports findings in bundles sized for one loop run each, and on a yes writes one ticket file per bundle.
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
---

# Refactor

A read-only review of the whole tree. It takes no arguments. Until the user says yes to the one question at the end, it writes nothing.

## What it applies

Read `${CLAUDE_PLUGIN_ROOT}/rules/core.md` at the start of each run. Its items are the house rules.

An item applies when it says what a file, a test, a comment, a piece of prose or a diff should be. An item about what the session does (asking, reporting, committing, checking, scratch files, permissions) does not apply to a tree. A new item falls on one side or the other by that test.

The repository's own instruction files are the rules it set for itself: the root `CLAUDE.md` or `AGENTS.md`, nested `CLAUDE.md` files, `.claude/rules/` and `.claude/skills/`. The code is the reference. Where an instruction file and the code disagree, the finding names the place, and `/primer` owns the instruction file's side. Nothing else is a rule.

Check an instruction file for truth against the code and against the item on prose written for an agent. Do not check it for the shapes `/primer` keeps.

Quote no rule from memory. Every rule a finding cites is quoted from the file it lives in.

## Reviewers

Split the repository into areas, each a cohesive part: a package, a plugin, a top-level directory, or the tests of one area. Launch one read-only subagent per area with the Agent tool at model `sonnet`, at most 20 at a time because the host refuses more, the next as one finishes.

Each brief quotes verbatim the applicable items from `core.md` and the instruction files that cover the area, names its paths, and asks for findings with evidence: file and line, and what the code does. A reviewer changes nothing.

## Second pass

A first reading can find a case held only by the text it proposes to cut. For each area's findings, launch a fresh read-only subagent at model `sonnet` that tries to refute every one: the case the cited text holds, the caller that uses the option, the instruction that permits it. A finding it refutes is dropped and not shown.

## What to recommend

Recommend what affects correctness or risk, or costs more to leave than to fix. The rest are notes.

## The report

Group the surviving findings into bundles. A bundle is one cohesive refactor sized for one loop run. Order the bundles by the cost of leaving them. Each finding gives:

- the location to open
- the rule item, quoted from `core.md` or the instruction file
- what the code does
- what that costs as the code grows
- the change
- whether it comes from reading the code or from running it

An item with no rule behind it is a note, apart from the bundles. A rule the run could not apply, or applied with doubt, is listed once as feedback for the house rules.

## After the report

Ask one question: write the ticket files. Nothing else is asked.

On a yes, write one file per bundle. The directory is the repository's ignored scratch directory: one that git ignores, checked with `git check-ignore`, and that the repository uses for scratch, such as `.scratch/`. When there is none, use `${CLAUDE_PLUGIN_DATA}/refactor/<key>/`, where `<key>` is the main worktree's root path with every character outside `A-Za-z0-9` replaced by `-`. `${CLAUDE_PLUGIN_DATA}` is not a shell variable, so write its resolved path.

A ticket is Markdown and self-contained, so the loop needs nothing else. It holds the bundle's goal; each finding with its location, the quoted rule, what the code does and the change; the done condition; and the repository's checks by command, taken from its instruction files or manifest.

Then print, one per bundle, the line `reimagine loop <absolute path of the ticket file>, thorough`. Say to run one bundle at a time, each on its own new branch, never continuing a branch that merged.

Write nothing else. Never run the loop. Never write an instruction file.

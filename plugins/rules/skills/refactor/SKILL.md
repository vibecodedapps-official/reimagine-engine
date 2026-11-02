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

The repository's own instruction files are the rules it set for itself: the root `CLAUDE.md`, `.claude/CLAUDE.md` or `AGENTS.md`, nested `CLAUDE.md` and `AGENTS.md` files, the files they import, `.claude/rules/` and `.claude/skills/`. The code is the reference. Where an instruction file and the code disagree, the finding names the place, and `/primer` owns the instruction file's side. Nothing else is a rule.

Check an instruction file for truth against the code and against the item on prose written for an agent. Do not check it for the shapes `/primer` keeps.

Quote no rule from memory. Every rule a finding cites is quoted from the file it lives in.

## Ticket directory

Find the ticket directory before launching any subagent, since the skill's `allowed-tools` cover only this turn and a subagent's return starts a new one. It is the repository's ignored scratch directory: one that git ignores, checked with `git check-ignore` on its path with a trailing slash, and that the repository uses for scratch, such as `.scratch/`. When there is none, it is `${CLAUDE_PLUGIN_DATA}/refactor/<key>/`, where `<key>` is the main worktree's root path with every character outside `A-Za-z0-9` replaced by `-`. `${CLAUDE_PLUGIN_DATA}` is not a shell variable, so write its resolved path.

## Reviewers

Split the repository into areas, each a cohesive part: a package, a plugin, a top-level directory, or the tests of one area. Areas hold tracked files only, as `git ls-files` lists them. Launch one read-only subagent per area with the Agent tool, never as a workflow, at model `sonnet`. The run's reviewers and refuters together stay at most 20 at a time because the host refuses more, the next launched as one finishes.

Each brief quotes verbatim the applicable items from `core.md` and the instruction files that cover the area, names its paths, and asks for findings with evidence: file and line, and what the code does. A reviewer changes nothing. Each brief goes in the Agent prompt, never in a file.

## Second pass

A first reading can find a case held only by the text it proposes to cut. For each area's findings, launch a fresh read-only subagent at model `sonnet` that tries to refute every one: the case the cited text holds, the caller that uses the option, the instruction that permits it. A finding it refutes is dropped and not shown.

## What to recommend

Recommend a finding, or make it a note, by the `core.md` item on finding issues and proposing changes.

## The report

Group the surviving recommended findings that quote a rule into bundles. A bundle is one cohesive refactor sized for one loop run. Order the bundles by the cost of leaving them. Each finding gives:

- the location to open
- the rule item, quoted from `core.md` or the instruction file
- what the code does
- what that costs as the code grows
- what the change costs
- the change
- whether it comes from reading the code or from running it

An item with no rule behind it is a note, apart from the bundles. A finding whose change is to an instruction file names `/primer` and stays out of the bundles. A rule the run could not apply, or applied with doubt, is listed once as feedback for the house rules.

## After the report

When the report has at least one bundle, ask one question: write the ticket files to the ticket directory, naming it.

On a yes, write one file per bundle in that directory. Name each ticket file `refactor-<time>-<n>.md`, where `<time>` is the output of `date -u +%Y%m%d-%H%M%S`, which may prompt once, and `<n>` is the bundle's number, so no earlier run's ticket has its path.

A ticket is Markdown and self-contained, so the loop needs nothing else. It holds the bundle's goal; each finding with its location, the quoted rule, what the code does and the change; the done condition; and the repository's checks by command, taken from its instruction files or manifest.

Then print, one per bundle, the line `reimagine loop <absolute path of the ticket file>, thorough`. Say to run one bundle at a time, each on its own new branch, never continuing a branch that merged.

Write nothing else. Never run the loop. Never write an instruction file.

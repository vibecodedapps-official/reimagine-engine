---
name: primer
description: 'Use when the user says "turn this into a skill", "we keep doing this", "add this to the project instructions" or "check the instruction files", or runs /primer. Keeps the CLAUDE.md, rules and skills of a repository in the forms Claude Code loads.'
argument-hint: "[init | adopt | maintain]"
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash(git status *)
  - Bash(git rev-parse *)
  - Bash(git ls-files *)
  - Bash(git check-ignore *)
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/primer.mjs" status *)
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/primer.mjs" measure *)
---

# /primer

Before writing, moving or proposing anything, read `shapes.md` and `placement.md` in this skill's directory.

## Choose the mode

- The first line of the reply, before any read beyond what choosing needs and before any write, is exactly `primer: mode <init|adopt|maintain> (<one-line reason>)`, with no text before it but the profile question, and the second is `primer: profile <shared|local>`.
- The profile: a hub whose line 1 is the marker is `shared`; else the `profile:` line of `node "${CLAUDE_PLUGIN_ROOT}/scripts/primer.mjs" status` names it. With none, the reply is only one question, with no default: `shared`, instruction files in the work tree, committed, or `local`, the context in a store outside the repository that a hook loads, with nothing written or committed in the work tree; for `shared`, also whether the repository is the user's own. The question names the run that records the answer, `map --add --profile <shared|local>` with `--own <true|false>` for `shared`, by the same script; run it on the answer. Without an answer write nothing.
- A `local` run reads `local.md` in this skill's directory before the mode line and follows it where it differs from this file.
- Find files with `git ls-files`, `git ls-files --others --exclude-standard` (untracked, not ignored) and `git ls-files --others --ignored --exclude-standard` (ignored). The mode is chosen from the files on disk, ignored ones included.
- In a `shared` run, when the root `CLAUDE.md` or root `AGENTS.md` is ignored by git, say so after the profile line and stop with nothing written.
- A mode named after the command (`/primer adopt`) forces it. A forced `init` never writes over an existing `CLAUDE.md` or `AGENTS.md`: say so and stop.
- Otherwise find the hub: the root `CLAUDE.md`; the root `AGENTS.md` when the root `CLAUDE.md` is exactly `@AGENTS.md` plus at most one newline; the root `AGENTS.md` when there is no root `CLAUDE.md`. Read these files from disk, never from the copy loaded at session start, which drops HTML comments, the marker included. Then, in order: the hub's line 1 is exactly `<!-- primer -->` and no line of it is exactly `## Spokes`: `maintain`. Else any `CLAUDE.md` or `AGENTS.md` exists at any depth, `.claude/CLAUDE.md` included: `adopt`. Else: `init`.
- A full `init` run follows `init.md` and a full `adopt` run `adopt.md`, in this skill's directory: read the one the mode names right after the mode line, which is its step 1. `maintain` follows Maintain below.
- When one of the four phrases invoked the skill for one item (a checklist just run, a fact to record, a memory note), the mode line's reason names the item, and the reply runs the proposal of that item alone (see Proposals), with no other pass. On its yes, write it; `adopt` and `maintain` commit it, and `init` leaves it uncommitted.

## Every mode

- Writes are documentation files only: `CLAUDE.md` and `AGENTS.md` at any depth, `.claude/rules/**`, `.claude/skills/**`, `README.md`, and Markdown under `docs/`.
- Never edit code, configuration, settings, CI files, package manifests, `CLAUDE.local.md`, anything git ignores, or the auto memory directory. The exceptions are a memory note the user approves for deletion in its own question, and the review stamp of Maintain step 3.
- Never install a git hook and never write a linter rule, a test or a hook. Where placement item 1 or 2 applies, the plan proposes the check, hook or settings key for the user.
- Never run `/init`, `/doctor` or `/memory`.
- Read `CLAUDE.local.md`, the user's own `CLAUDE.md` and `rules/`, and auto memory to avoid duplication; never write them.
- Obey every ask-first rule in the instruction files the session loaded. Anything outside the plan asks again.

## Commits

- `adopt`, and `maintain` when it has changes, print a plan that lists every commit, ask once, and make those commits. One yes covers the listed commits. `maintain` with nothing to change writes nothing.
- A commit follows the repository's own commit convention when its instruction files name one, else `docs(primer): <subject>` in lowercase. The body's first line is `Instruction-file <mode> pass, <YYYY-MM-DD>.`, followed by why. Where `status` shows `own false`, the fallback is `docs: <subject>`. A commit message never names a model, an agent or a tool. Type no attribution trailer of your own, and keep one the host's attribution setting adds, even where it names a model or tool.
- Stage only the paths the plan names, by path. Never push, amend, or pass `--no-verify`.
- When the drift hook denies a commit, fix what its findings name and commit again; never route around it. When it advises a recheck, recheck the files it names before the next commit.

## Proposals

```
<n>. Skill `<name>`
   From: <file and line, script, build target, memory note, or this session>
   Seen: <how often>; steps as observed:
     1. <step>
   Writes: .claude/skills/<name>/SKILL.md
```

```
<n>. Memory note <file> (<type>, modified <date>)
   Text: <the note's text, quoted>
   Writes: <destination file>: <the line to be written>
```

A skill candidate taken from an instruction file says that the procedure leaves that file in the same commit. Nothing in a proposal is written without a yes. After a memory note's line is written, a separate question for that note offers its topic file and its `MEMORY.md` line for deletion; a no leaves both. A `user` note is never proposed.

A rule or a nested `CLAUDE.md` takes the skill form with its own first line, `<n>. Rule .claude/rules/<topic>.md` or `<n>. Nested <dir>/CLAUDE.md`; its `Seen:` line holds the convention or the commands as found, and its `Writes:` line names the file.

Before a rule is proposed, and before any pass that launches an agent, search every layer and document of the store, the user's own `CLAUDE.md` and the instruction files of the repository the rule governs for text that already states it. A hit ends the proposal as nothing, as a one-line pointer, or, where the rule was loaded and missed, as a miss whose fix is delivery or a pointer, never a second statement of the rule.

Size is measured, never estimated. A proposal that adds to the hub or an unscoped rule shows the file's lines and characters before and after against its caps in `shapes.md`; one that adds to a layer shows the `measure` output `local.md` names. Either names the cut that pays for it, or becomes a one-line pointer to a document. Cut candidates come in this order: text that says how the file is loaded, text a pointed-to document also holds, text the loader or the host already supplies, facts past their expiry. No file primer writes states how much room is left.

## Plans

A plan takes this form; its first line is `primer: adopt plan` or `primer: maintain plan`:

```
primer: <adopt | maintain> plan
Moves (commit 1: <message>):
- git mv <from> <to>; links repaired in <files>
Rewrites (commit <n>: <message>):
- <file>: <what changes, and why>
Proposals:
<n>. <the proposal forms above>
Reported:
- <item>: <why>
```

On the yes, make the move commit first: the `git mv` of each move and the path edits of documentation links to the moved files, index lines included, and nothing else, so no commit leaves a broken link. Then make each rewrite commit. Write a proposal only on its own yes.

## Maintain

1. State the mode.
2. Verify the instruction files, which are the hub, nested `CLAUDE.md` files, rules and skills, noting each finding with its file and line:
   - what the drift hook denies: a file over its cap, a missing path in the hub's opening paragraph, a `paths` value the host cannot read or a glob that matches no tracked file, a `SKILL.md` without `description`;
   - each command the hub or a nested `CLAUDE.md` names exists in a manifest, script or workflow and does what its line says;
   - each statement of the hub, a rule, a nested file or a skill is true of the files it covers: the names, paths and behavior it states exist;
   - each command and file a skill step names exists;
   - a skill whose procedure the repository lacks is reported, never deleted; two skills with one procedure are reported as duplicates with the one to keep; a skill over its cap is split into a body and a supporting file beside it;
   - an import of a file git does not track, other tools' rule files, such as `.cursor/rules/` or `.github/copilot-instructions.md`, and personal content are reported and left in place;
   - a statement in `README.md`, `CONTRIBUTING.md` or a `docs/` page that the code makes untrue is reported, never rewritten by this pass;
   - two instruction files that contradict each other are reported, never resolved by this pass, since `/doctor prompt-audit` checks contradictions.
3. Promote auto memory. Its directory is the one the session's instructions name for auto memory; else the `autoMemoryDirectory` of `.claude/settings.local.json`, `.claude/settings.json` or `<config>/settings.json`, the first file that sets it deciding, and a value that is not an absolute or `~/` path counting as unset; else `<config>/projects/<name>/memory/` when `$CLAUDE_CONFIG_DIR` and `$CLAUDE_CODE_PROJECT_DIR_NAME` are both set and the name is 1 to 64 letters, digits, `-` or `_` and not a Windows device name such as `con`; else `<config>/projects/<key>/memory/`: `<config>` is `$CLAUDE_CONFIG_DIR`, else `~/.claude`; `<key>` is the main worktree's root, the parent of `git rev-parse --path-format=absolute --git-common-dir`, with every character outside `A-Za-z0-9` replaced by `-`. Without that directory, skip this step. Read `MEMORY.md` and each topic file it lists, taking `type` and `modified` from the frontmatter's `metadata`, and propose in the memory note form of Proposals:
   - a `feedback` note about this repository's code or conventions, placed by `placement.md`; one about how the user works stays;
   - a `project` note with no date, as a rule or a `docs/` page; a dated or ongoing item stays;
   - a `reference` note a teammate would need, as a sentence in the hub's opening paragraph;
   - never a note an instruction file already holds, and never a `user` note.
   Once these proposals are answered, or when there are none, write the stamp `${CLAUDE_PLUGIN_DATA}/reviewed/<key>`, creating its directory: one line, the UTC time as `date -u +%Y-%m-%dT%H:%M:%S.000Z` prints it. `${CLAUDE_PLUGIN_DATA}` is not a shell variable; write its resolved path in the command. When a deletion or the stamp write is refused, say so in one line and go on. Then run the fold-back review below.
4. Propose skills from these sources, in this order, each in the skill form of Proposals with its source, the steps as observed, how often it was seen and its name:
   - the instruction files: a numbered list or a "to do X" section in the hub, a rule, a nested file or `README.md`;
   - the repository: a script or build target whose use takes more than one command or a setup step, a runbook under `docs/`, a procedure in `CONTRIBUTING.md`;
   - auto memory: a `feedback` or `project` note that says how to do something.
   Never propose a skill for one command, for a fact, or for a procedure a skill already holds, never run a skill, and change a skill this run did not raise only by a line step 3 promotes. A written skill takes the skill shape of `shapes.md` at `.claude/skills/<name>/SKILL.md`. A procedure from an instruction file leaves that file in the same commit, a memory note is then offered for deletion as Proposals says, and a procedure from the repository changes nothing else.
5. With a change to make, print the plan in the form of Plans, ask once, and on the yes make its commits; a fix is a rewrite, a promoted note's line is a rewrite made only on its own yes, and a split adds a move only when a file moves.
6. With nothing to change, print `primer: no drift`, then one line per reported item as `- <item>: <why>`, and write nothing in the repository.
7. End the reply with this sentence: `/doctor prompt-audit` checks the instruction files for contradictions and stale model names; run it yourself when you want that check.

## Fold-back review

The feedback logs under `<config>/feedback/` belong to no one repository. This review runs after Maintain step 3, also when that step skips, and only when a log is newer than the stamp `${CLAUDE_PLUGIN_DATA}/reviewed/feedback`, or there is no stamp.

1. Read those logs and the ledger, `node "${CLAUDE_PLUGIN_ROOT}/scripts/ledger.mjs"`. A logged item is an observation with its evidence; its log's `Recommended` section selects the observations that matter. Search as Proposals says before either pass.
2. Evidence pass: check each item's evidence and challenge it. Drop what the files contradict and what names a section that does not exist; an item a loaded rule already states is a miss. Mark each claim verified or unverified, with its check: read at the source, run, or neither.
3. Worth pass: judge worth, placement by `placement.md`, and wording, and settle items that touch the same lines as one. Draft each edit now, against the files as they are, never copied from the log; nothing is written before the answer of step 6.
4. Match each item against the ledger. One that states a listed gap is that line seen again. A held line seen again returns to the plan with its count. One that matches a folded rule is that rule's failure: propose to reword the rule, move it or propose a hook, never to state it twice. An entry that says a rule worked counts for that rule, and is the evidence for keeping it when a cut is needed.
5. The plan of Maintain step 5 lists what it would fold, each with its measure and cut, then what it holds and what it rejects, each with its reason, and asks once with the rest. An item for the house rules or another plugin is written by its kind, with no person, id or path.
6. On the answer, write the folds and make their commits, then record each item with the ledger script's `--add`, `--seen`, `--worked` and `--set` forms, which its refusal line lists, a fold with its commit where git tracks the place. Then write the stamp `${CLAUDE_PLUGIN_DATA}/reviewed/feedback` as step 3 writes its own.

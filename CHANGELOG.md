# Changelog

One changelog for the suite. Each plugin releases on its own line; a release gets a heading `## <plugin> <version> - <date>`, newest first, with one bullet per change saying what changed and why.

## primer 0.1.12 - 2026-11-13

- A `local` profile, for a repository where instruction files cannot be committed: nothing is written or committed in the work tree, the repository's context lives in a store under the configuration directory, in a shared layer, a layer per group of sibling repositories and a layer for the machine, and a map records each repository's profile and group. `/primer` asks once which profile applies, with no default. Some repositories may hold no agent file in their tree or history, and primer could not be used there: it wrote every destination into the work tree, committed with a scope that names the plugin, marked the hub with a comment that names it, and stopped when the root instruction file was ignored.
- A SessionStart entry runs `scripts/primer.mjs` and loads the three layers as one string, each layer opening with a line that names its file and closing with a canary that `status` prints. It warns at every start while the string is over the host's cap of 10,000 characters, warns when a repository under a listed directory has no entry, and reports `unknown` when its `git` calls run past 5 seconds. Context once sat over the cap for days with nothing reporting it, and a session could not tell whether its context had loaded.
- In a `local` repository the drift hook hands each `git add` and `git commit` to a staging check, which denies one that would stage or commit an agent file the upstream does not track, or a `.gitignore` line that names one, since an agent file that reaches a pushed history cannot be taken back. A command it cannot resolve counts as staging every file git does not ignore; `/primer` offers the `info/exclude` lines that keep agent files out of that. The check reads a session's ordinary commands and is no boundary: a git alias, an `eval` and a script are not read.
- The loader and the staging check need Node 22 or later. The loader's entry starts it at every session start, whatever the profile; the `shared` profile's own checks still need only `sh` and git.
- `primer.mjs measure` prints each mapped repository's context string with its size as emitted and the host's cap, and `--with <file> <layer>` the size before and after a proposed layer. A proposal that adds to a layer shows that output and names the cut that pays for it, or becomes a pointer. Estimates of size were wrong where a script is not: the wrapper lines count, line endings differ between files, a shared layer costs in every repository, and the tightest repository sets the budget.
- A PreToolUse entry on file edits runs `primer.mjs reach`: on the first edit in a repository other than the session's own it gives the paths of that repository's instruction files and, where it is `local`, its layers, once per session and repository, and it never denies. A session that edited files in a second repository missed a convention there on 16 files.
- The startup notice and the `local` loader count the feedback logs written since the last fold-back review beside the auto memory notes, and the maintain pass reads them. The review runs a pass on evidence before a pass on worth, placement and wording and ends in a pick, since checking logged proposals at review time changed most of them and a ranked list left the choosing undone.
- `scripts/ledger.mjs` keeps a ledger in the store: one line per item with its status, the logs it was seen in, where it was folded, and a folded rule's later failures and the entries that say it worked. A held item comes back with its count when a session trips on the same gap again, and a later item that matches a folded rule is that rule's failure, never a second statement of it.
- The skill searches for a rule before it proposes one, and a rule that was loaded and missed is fixed by delivery or a pointer, never by new text. Text written for an agent is checked against the house rules' item on such prose before it is saved.
- `primer.mjs copies --add <copy> <source>` declares a copy of context text kept in another place, with a snapshot of its source and the digest of the copy, and `copies --ported <copy>` takes both again after a port. `status` and `copies` report each copy as `current`, `source changed` with the diff of the source from the snapshot, `copy changed` or `both changed`, and name a file that is missing. The script ports nothing. A port of context text to a second place had to be asked for repeatedly, and twice the earlier version of the source was gone.
- `primer.mjs copies --spans` lists the runs of three or more lines that two layers or documents share, longest first, as candidates for one shared home.
- `scripts/transcripts.mjs` lists the user's own messages from a repository's session files over a span of days, with no model call. It skips a line it cannot read and reports the share it skipped, since the host documents the format as internal and changing. Each review of transcripts had built its own reader. The script counts nothing: detection on top of it is built only after a pilot.

## audit 0.1.31 - 2026-11-13

- A finding, a merged item and the report list every site of a defect with the search that found them, or say the list is partial and how far the search went. One report said "several" and one gave half the sites as all of them.
- Each agent ends its output with the reads and calls it was refused, and Coverage sums them. An agent's reads were refused and its report had no line saying so.
- Every prompt names by path the instruction sources that bear on its question and quotes each convention held from no file. A ticket state was flagged that a table of conventions makes correct: the main session held the table and no brief did.
- Before the report is written the audit reads each pull request's head again and says when it moved, and drafted text names the commit its evidence was checked at. Evidence comments named a commit older than the head, with nothing saying the head had moved.

## gate 0.1.19 - 2026-11-13

- The report lists every location its reviews gave for one defect under one finding, where it gave a sample.
- Every brief, a reader's, an implementer's and the stand-in's request, names the instruction sources by path and quotes each convention held from no file, since an agent knows only its brief and what the host loads for it. A convention the main session held was in none of the briefs.
- The skill counts four scripts, `resume.mjs` among them, where it said three.

## loop 0.1.29 - 2026-11-13

- Every brief and review request names the instruction sources by path, the files a context loader names included, and quotes each convention held from no file. A convention the main session held was in none of the briefs.

## rules 0.1.31 - 2026-11-13

- The Working item on credentials covers tool output as well as files: a credential never lands there, a session prints a secret's key names and never a value, not even one a filter judged harmless, and a query of logs or records selects the fields it needs. A session that held the rule printed every value of a secret whose key names did not look sensitive, and read the filtered print as following the rule; a log query that returned whole events put a token and a key in tool output. The host keeps tool output on disk in the session's transcript, so it is a place of the same kind as a file.
- A new skill, `/rules:draft`, checks a draft written for someone else before it is first shown: it strikes detail no reader acts on, a decision that is the sender's to settle and a sentence that restates a named source, verifies each statement the sender has not checked, and keeps notes for the owner outside the draft. It never adds detail and the session runs it itself. Most corrections to drafts matched a sentence that was loaded when the draft broke it, drafts took two to seven rounds, and one review of a draft made it longer; a check on the finished text caught what a loaded sentence had not.
- An email draft is one HTML file in the scratch directory, the only stored copy, and the reply shows its text; every other draft is Markdown. A Markdown copy and an HTML copy of one draft fell out of step and doubled every edit.
- Concise Plain 4.16. A finding for a reader who opens the code puts the general point first and its instances after, with one recommended change, the change and whether it blocks in the title, and one summary comment for small points, where the old list of parts produced long comments tied to single instances. On a thread the earlier message sets the density and the form, measured before any wording, and its form wins over the rules on tables and labels, where a draft copied the greeting and lead-ins and avoided the table the thread used. A first draft is the shortest text that carries the ask, with detail added on request, and to a reader who manages a technical risk is what has to happen before what, never how the fault works. A draft that will be posted is shown whole in the reply that asks to post it, and an id carries a few words of its item's title at first mention. One sentence names the `draft` skill; the Drafts sentence on a settled choice and a proposal is cut to pay for it, since the skill's check holds it. The chat block mirrors each change, keeps the cut sentence and does not name the skill.
- A Working item has every session log what it learned about its rules and context, a missing rule or fact, a rule that was loaded and missed and a rule that visibly worked, in a dated file in `feedback/` under the configuration directory, ending in a `Recommended` section, and edit no rule to fix what it logged unless asked. Proposals written by the session that hit the problem mostly changed when they were checked later against the files as they then were, so a session records and a separate review writes the edit. The README says the directory is outside every repository and that the permission rule for the write is the user's to add.

## audit 0.1.30 - 2026-11-12

- Queue says that only an agent's own completion notification drives the next launch: a status line at the end of a running agent's output file, or the end of a watch the run set on that file, is not one. A run took the end of such a watch for its auditor's completion and launched pass two, and the auditor then rewrote the report that pass two had read.

## audit 0.1.29 - 2026-11-12

- Before the failure ladder relaunches an agent, the run moves the output file the failed attempt left into that attempt's scratch folder as `failed-output.md`, and no agent reads another agent's scratch folder. A relaunch takes the same output path and an agent leaves a complete file there as final, so after a failure that left a complete file the relaunch wrote nothing; the run then moved the file aside on its own and the next attempt read it.

## loop 0.1.28 - 2026-11-12

- The skill has a Compaction recovery section: after a compaction a run reads `SKILL.md` again, then the record, which gives its current step, then that step's files. The host keeps only the first part of a skill's text across a compaction and the loop's skill is longer than that part, so a run went on without the end of the skill and nothing told it.

## audit 0.1.28 - 2026-11-12

- The skill, the report template, `live.md`, `work-items.md` and stages 1 to 5 drop copies of rules that another file the same reader holds states: the summary of stage 1, most of the Supporting files list, the report's copies of stage 8's closing lines and of its own Parts shapes, the validators' message lists, and what an agent's definition has the agent do. A run read each rule twice and the copies could drift. No rule is dropped.
- Compaction recovery names the current command's section beside the stage's, and "The --live file" states three rules that only the validator's list had held: the frontmatter opens on line 1 and closes, no other key or line is accepted, and no value is empty.
- Split mode of stage 7 is in `stages/7-converge-split.md`, which stage 7 reads only once the ledgers reach the split threshold. Every run loaded its slice commands and steps, about 1,000 words, and a run under the threshold used none of them.
- `fault-injection.md` holds every rule of the `_test` fields, and each stage keeps one sentence where a fault acts. The stage files held the top-up scope ids, what a planted map error records and how dropped acknowledgments are counted, which that file lacked while saying it held them all.
- A stop that reaches a run of `revert-tests.sh` between a test command's start and the run's record of it waits for the record, so the run ends the command and its watchdog. The run exited without ending them, and the command ran on with no deadline in a work dir the run then removed.

## primer 0.1.11 - 2026-11-12

- The skill, `placement.md` and `shapes.md` each state a rule once. Init and Adopt restated the two reference files, and the reference files repeated one another and the skill, so a run read a rule two or three times and the copies could drift. No rule is dropped: each cut sentence stands in a file a run reads before it writes.
- The description's second sentence is shorter. The four phrases that invoke the skill are unchanged.
- The steps of Init and Adopt are in `init.md` and `adopt.md`, which a full run of that mode reads right after its mode line. The plan form and the order of its commits, which Adopt and Maintain share, are under Plans in the skill. Every run loaded the steps of all three modes; a maintain run now loads about 500 words fewer.

## gate 0.1.18 - 2026-11-12

- The skill states each cap, the stop and the stand-in's mechanics once, in the step that acts on it, and no file opens by saying when it is read. The skill restated them, so a run read each rule twice and the copies could drift. No rule is dropped: each cut sentence stands in a file a run reads before the action it guards.

## rules 0.1.30 - 2026-11-12

- The chat block's "Editing my text" item puts the line on what changed above the returned text, as its item on a revised draft does. It put the line after the text, so the block gave one line two places.

## audit 0.1.27 - 2026-11-12

- On Windows the script that runs a bundle's tests ends a command's processes by id before the KILL to its group, in one call of Windows PowerShell, and sends the group no TERM. A TERM that the runtime of Git for Windows delivers to a native program ends processes by the parent ids Windows records, which outlive their parents, so it could end a process the audit never started. A child's TERM trap no longer runs at a timeout on Windows, and a command that timed out there records the status Windows reports for the process that leads it, 0 for a shell and 137 for a native program. When the call fails, a line on stderr says so and the KILL goes alone.
- A native program's own children end with their command on Windows. After the KILL alone they kept running at the end of a test file that passed and at an interrupt, and held the work dir, so a run that otherwise succeeded named the work dir as left. A native child whose parent had already exited stays out of reach.
- `bg` on Windows sends its TERM to the run alone, at its deadline, on a signal and when it is lost, and the run ends its command and removes the work dir as on other systems. The TERM went to the run's group before, and that group can hold a git step. The group's leader lists what the run has in its own group before the TERM and ends the listed by id after it, so a step in the run's foreground does not hold off the stop.
- 0.1.26 was not released. In it `bg` ended its run by id, and a test file the run started while that call was starting was in no list: it outlived the run with no deadline, in a work dir `bg` then removed.

## audit 0.1.25 - 2026-11-11

- A script writes the registry of runs. `registry.sh add` and `registry.sh set` each update `runs.json` in one run of the script, under a lock it takes and releases itself. The session typed the lock steps before, no test covered them, and the two updates took four turns of a low-tier run.
- A repeated registry command changes nothing, so a session that cannot tell whether an update ran runs it again. When a run has no entry at its end, the session adds one and then sets its state, before it falls back to printing an entry to add by hand.
- A registry lock older than a minute is removed without a question in every session. An interactive run asked first whether another audit was running; the script holds the lock only while it rewrites the file, so among its runs an old lock is from one that died.

## audit 0.1.24 - 2026-11-11

- After a compaction the audit reads `SKILL.md` again before it goes on, and then the files of the stage it is in. The host keeps only the first part of a skill's text across a compaction and the recovery section did not name the file, so the rest of a long run went on without the rules that come after that part.
- Each rule of the audit is stated once, in a file its reader holds, and the other files point at it: the commands an agent may run and the leads a finding must clear, each stage's steps, what a report section holds, and the budget, the failure ladder and when an output counts as failed. The copies had drifted apart before, and the text is about 3,800 words shorter.
- A manifest `scratch` key that is neither inside the primary repository and ignored nor inside the main checkout of a linked worktree stops the run. The skill read as if the next choice were tried; stage 1 already stopped.
- After a failed second-opinion batch, stage 6 runs its ledger check with `--stage6 failed`. The stage file ran the check only when no batch failed, and the skill's summary alone held the other case.
- The rule against ending the turn while a background agent or test run is live holds in every session. The skill gave it under its headless heading, and stage 1 without a condition.
- The adversary's rules quote the brief's line for a base that was not fetched, and say that a finding on an open pull request states the forge fact, and that the brief read the list at stage 1, before its effect. The auditor's definition had held these alone.

## gate 0.1.17 - 2026-11-11

- A child review's allow list names each shell entry for the PowerShell tool as well as the Bash tool. A session on Windows may run a command with either, and with only the Bash entries a review that ran a check through PowerShell was refused, so its findings came unverified.
- A file replaced by a folder of the same name is reviewed in that folder's group. It was listed among its parent's own files while the folder's files made a group of their own, both groups selected both, and each of those files was reviewed twice in the pass.
- The stand-in's patch reads a group's paths as names. Read as patterns, a name that holds a bracket selected a file of another group as well.

## audit 0.1.23 - 2026-11-11

- The audit's files said different things about the same step in eight places. Each is corrected to the copy that the scripts, the requirements and the rest of the text bear out.
- The skill and the README put the read-only baseline before stage 1. Stage 1 takes it after it has made the run directory and after the fetch, and the text now says so everywhere.
- For a run, the skill's reading block and its sentence on background fetch are the only ones. Stage 1 asked for both a second time, and `/audit:run` for a fetch sentence of its own; stage 1 now prints the block only under `/audit:resume`.
- A stage 7 that the budget left unstarted gets its entry `failed` with "not run: budget expired", as every unstarted stage does; its file said it gets none. The skill said stage 6 always runs and now says it does not once the budget has expired.
- The skill and the request template give the sentinel token's whole command, which removes the newline as well as the spaces.
- The report template's Coverage list and stage 8's hold the same lines; each lacked some of the other's.
- A commit message of `/audit:act` follows the repository's convention and carries a date only where that convention does. Hard rule 3 read as if each must name one.
- A resumed run applies no budget. The skill allowed one from the resume's own request, and nothing kept a rerun of stage 1 from applying the budget the manifest or the first request recorded.
- The skill's definition of a failed agent names a pass report without its claims heading.

## audit 0.1.22 - 2026-11-11

- On Windows the script that runs the changed tests sends no TERM before the KILL that ends a test command's process group; 0.1.21 added one. A shell that waits on a native program answers a TERM by ending the program's tree itself, following each process's recorded parent id, and that id outlives the parent: a TERM and then a KILL to a job's group reached shells that were no kin of the job. So the TERM could end a process the audit never started. The KILL goes alone again, and a native program's own children outlive it, as before 0.1.21.

## audit 0.1.21 - 2026-11-11

- On Windows the script that runs the changed tests sends a TERM before the KILL that ends a test command's process group, once the command has ended and when the run is interrupted. A native program's own children are outside that group: after a KILL alone the child of a batch file kept running and held the work dir, so the run ended by naming the work dir as left. With the TERM first the child ends with the program. A native child whose parent has already exited stays out of reach.

## audit 0.1.20 - 2026-11-10

- No command of stage 1 sets a variable before git. Each began with an export of `GIT_NO_LAZY_FETCH`, and the host asks for such a command whatever rule matches its git part, so a run with no one to answer stopped at its first git read. The refusal of a partial clone is what keeps a run from a lazy fetch; it now reads every configuration source, where it missed a promisor remote set in a worktree's configuration, and the baseline refuses a partial clone nested in an audited repository, a checked-out submodule included, which a diff can enter.
- The script runs are shown with their path in double quotes, and the skill says to run them with the Bash tool. An unquoted path with a space split the command.
- The README says that what the skill pre-approves holds until your first reply, and that a run with no one to answer needs a permission mode that lets its commands run.
- A ticket's id is `github:`, `ado:`, `sf:` or `file:`, or stays as you wrote it, and how the ticket was read is recorded beside it. Before, as the text read, a ticket read through an MCP tool or known by its id alone took that as its id, so two such tickets shared one, and an `ado:` or `sf:` id from a handoff matched only a ticket exported with that id.
- The reading block and the report's Coverage name each ticket whose body was not read.
- A stop on a file that is not an export says what an export holds and where the README shows it, and the README has an example.
- With `ticket_token`, a pattern takes the number of an `ado:` or `sf:` id.

## loop 0.1.27 - 2026-11-10

- An item that another pull request or ticket already resolves is kept out of the Follow-ups of the pull request body, as the body template says. The ticket rules said out of the body, so a run that told its reviewer which of two options it built, or named unchanged behavior a reader could take for a bug, went against them.

## audit 0.1.19 - 2026-11-10

- The skill no longer pre-approves `git diff`, `git log`, `git show`, `git grep` and `git stash list`, or any `git -C <repo>` form. An option of each of the five writes a file or runs a program, and the `*` after `-C` admitted `-c`, which runs a program through an alias or a config key, so text an audit reads could ask for such a form and no prompt would come. Under the default permission mode the audit now asks before each git read of a repository other than the session's folder, and a run with no one to answer is refused those reads.
- No git command of the audit takes `-c`, `--output`, `-O`, `--open-files-in-pager`, `--upload-pack` or `--exec`.

## rules 0.1.29 - 2026-11-10

- `/rules:refactor` no longer pre-approves `git diff`, `git log`, `git show` and `git grep`. An option of each writes a file or runs a program, and the pre-approval let such a form run without a prompt when text the review reads asked for it. The plain reads of the session's own repository still run without a prompt, since the host allows them itself.

## primer 0.1.10 - 2026-11-10

- `/primer` and `/primer:fold` no longer pre-approve `git diff`, `git log`, `git show` and `git grep`, for the reason given under rules 0.1.29. The plain reads still run without a prompt.
- The guidance for a skill's `allowed-tools` says to list no command with an option that writes a file or runs a program, and to put no `*` before an entry's end.

## gate 0.1.16 - 2026-11-10

- The skill no longer pre-approves `git diff`, `git log`, `git show` and `git ls-remote`, and its review sessions no longer get the first three, for the reason given under rules 0.1.29. The plain reads still run without a prompt, in the run and in a review session. `git ls-remote` asks under the default permission mode, and the permission statement counts it.

## loop 0.1.26 - 2026-11-10

- The skill no longer pre-approves `git diff`, `git log`, `git show` and `git ls-remote`, for the reason given under rules 0.1.29. The plain reads still run without a prompt. `git ls-remote` asks under the default permission mode, and the permission statement counts it.

## loop 0.1.25 - 2026-11-10

- Under an ask-first rule, the question a run asks before its commit names the record attached with each ticket comment it lists, and a yes covers what the question listed and nothing more. Four of thirteen such questions had left the record out, and of the runs that went on, one kept the record local and one attached it although no question had listed it. The rule stood among the approval rules and in a file a run reads after its first push; the publish step now states it where the question is asked.
- A record that no question of the run named gets its own question before it is attached, and is not attached unasked. A reply that is not a clear yes keeps it local and named in the report, and does not end the run.
- The file for steps 3.6 to 6 repeated within itself what its own sections already said. It goes from 3,786 to 3,582 words with every condition, limit, ban, step and brief item kept.

## loop 0.1.24 - 2026-11-10

- The effort hint in a request goes to every subagent. One file passed it to reviewers only, so a run that followed that file would build its slices at the default effort.
- With "primary <path>" naming a checkout of another repository, a `gh` call that names no repository is given that one, the reads of the pull request's checks and of a failed run's log among them. The text said `gh` takes the repository from the session's folder; it takes it from the folder the call runs in.
- A credential block, an AWS access key and a PEM key get the same marker in the echo as in the record. Before, the echo printed `<redacted: key>` for all three.
- The overview of the roles no longer repeats each role as a numbered item. What an item alone said is in the step that acts on it, and the review step names the model its stand-in is retried at.
- The skill is about 470 words shorter. Nothing else changes for a run.

## loop 0.1.23 - 2026-11-10

- A later run on a branch takes a done input up again, like a new one, when its ticket's title or body, or its file's text, changed since the run that last planned from it. Before, a criterion added to an issue after its work was committed was never read.
- A post is logged when it returns, so a run that was cut off does not comment on a ticket twice, attach a second record, or lose track of the pull request it opened. A run with nothing to push repeats no description edit and no pull request comment for an unchanged head.
- An open item is never filed to a ticket that an earlier run of the branch took up: it gets a ticket of its own, which links that one. Before, the handoff could name that ticket twice, and the audit refused the handoff.
- A draft ticket filed by hand is found by its title on the next run and keeps its line in the pull request's Follow-ups.
- A ticket may name a file or a line where its reader opens it to act, as when it asks someone to run a check by hand. Before, every file name was kept out, which such a ticket cannot do.
- The audit manifest names each ticket in a form the audit reads: a document or a description the loop read is left out, and an Azure DevOps or Salesforce ticket is written as an export beside the manifest. Before, the audit stopped on a document, and read no text of those tickets without an MCP tool of its own.
- After a push from outside the loop, such as a fix pushed to its pull request, a run with no new work writes the description of its own pull request again, since the old one described the earlier head.
- A ticket id the loop cannot read gets a line that says how else to give it: pasted text, or a file.

## rules 0.1.28 - 2026-11-10

- The house rules say each rule once, in 33 rules and about a fifth fewer words: the decision rules are one item, what leaves the session is one item, and the ask-first rules hold whatever another item says. Most recorded failures had added a sentence, and few sentences had been merged or cut. An installed block reads as older than the plugin's until `/rules` is run again.
- A ticket or comment is written at the detail its readers act on. The earlier text sent every technical detail to an attached record, which kept out of a ticket what its reader needed in order to act.
- Commits follow the repository's own convention first, and name no session, model or tool, since the fixed form overrode a repository that had its own.
- A subagent reads "me" in the rules as the session that launched it, since a rule that says to ask the user has no reader in a subagent. That session can pass on an approval the user gave and gives none of its own.
- The definition of a handoff prompt lives in the `handoff-prompt` skill and the chat block. The house rules no longer carry it, since it applies only when a handoff prompt is asked for.
- Concise Plain 4.15 is about a fifth shorter. Its Links section is one rule and gives no vendor's link forms, and the chat block follows.

## loop 0.1.22 - 2026-11-10

- The skill carries the one house-rules item on what leaves a session in place of the earlier two, word for word as the rules plugin ships it.

## audit 0.1.18 - 2026-11-10

- The skill carries the one house-rules item on what leaves a session in place of the earlier two, word for word as the rules plugin ships it.

## gate 0.1.15 - 2026-11-10

- The skill carries the one house-rules item on what leaves a session in place of the earlier two, word for word as the rules plugin ships it.

## gate 0.1.14 - 2026-11-10

- A run stops when a pass finds nothing to fix, whatever it rejected, or finds at most 3 things to fix that all sit in files the fix round before it changed, fixes them and sees every check pass. Under the earlier rules no recorded run stopped clean: each ended at a cap. The report marks fixes that no review saw after them. The return to `xhigh` after a fix round that touched over a quarter of the files, and the last `medium` pass, are gone.
- `gate.parallel`, 3 by default, sets how many reviews of a pass run at once, since six model sessions at once ran a machine out of memory, and a resumed pass keeps the reviews that an earlier run finished.
- A session started in a subfolder gates the repository from its root, since the first fix commit failed there with "pathspec did not match any files".
- A fix commit is recorded before its push, and the next run pushes a commit that a stopped run left, since a run stopped between the two blocked every later run on the branch.
- Once the first pass is sized, the run says how many passes its budget holds, and when it holds one or none, that the fixes will be pushed with no review after them.
- The record and the report name the calls each review was refused, since only their count was kept.
- The report says when pushed fixes are newer than a pull request's description, which the gate does not edit.
- A reader of a large pass names the earlier finding that a new one restates, since restated rejections and deferrals were matched by hand on every pass.
- A review is read when a finding has no line or the fence is indented or capitalized, since each failed a finished review, and a path written with backslashes or a leading `./` is the same finding as before.
- `split.mjs` groups the reviews of a pass, which the session worked out by hand, and the skill states each rule once, in about two thirds of its earlier length.
- `resume.mjs` decides where a later run on a branch starts, which the session worked out from the record by hand. A commit that an earlier run left unpushed is pushed first whenever it is the head, since a changed merge-base or a branch that was not on the remote left it local, and only the record's last pass is resumed, since rewriting an earlier one gave a record the next-level script refuses. A pass records the head it reviews: the first pass after a new commit could not be resumed, and with no finished pass a run on a new head reused the reviews of the old one.
- A group whose review met a usage limit is no longer reviewed once by the stand-in on another model. The review is recorded as failed with `usage limit` as its reason, and the next run on the same head repeats the pass and reviews only the groups with no finished review.
- A branch the remote does not have yet can be pushed, a check that failed and was fixed no longer blocks the stop, and a resumed pass with no saved review reviews every group.

## primer 0.1.9 - 2026-11-10

- The drift hook no longer reads a branch such as `origin/main`, a home, absolute or drive path, a URL, or any other backticked token whose first segment is no top-level entry of the repository as a path under it, since each of those in a hub's opening paragraph denied every commit. A token that ends in `.md`, and a missing path under a top-level entry that exists, are findings as before.

## guard 0.1.3 - 2026-11-10

- `apply` takes the id its plan printed and writes no other plan, since one saved plan served every session on a profile and a second session's plan could be written on the first session's yes.
- A denial line is cut in every part and writes the common credential forms as `[redacted]`, and the record keeps its newest 100 lines once it passes 256 KiB, since it grew without limit and kept a bearer token from a denied command.
- The settings reads allow entry is written only for a repository added with `reads`, since it told the classifier that reading a file that often holds tokens is not credential exploration. A repository listed earlier loses the entry at the next `/guard`; add it again with `reads` to keep it.

## loop 0.1.21 - 2026-11-09

- The record attached to a GitHub issue is named for the branch's record slug, since GitHub refuses a `/` in an artifact name and no record could attach on a loop branch.
- Any question an ask-first rule raises for a new issue or a ticket comment now names the record attached with it, a source ticket's included, since a yes to a question that left the record out kept it local.

## audit 0.1.17 - 2026-11-09

- Act's post of an item the owner names, and the ticket and pull request texts that the report and `work-items.jsonl` draft, are written for their readers, with no item id, stage or verdict of the audit's own, since such a text could carry terms its readers do not use; act's commit messages carry none either. The skill carries the house rules' two items on what leaves a run, word for word.

## loop 0.1.20 - 2026-11-09

- After the first push and before any pull request text is written, each open item is settled with its evidence, put to the owner in full in the report, or filed to a ticket, new or existing, with its handoff context attached as a record; the body carries one line per ticket. Items left as prose in the body never reached the ticket board and could be lost on merge. Invoking the loop now approves those tickets, and an ask-first rule that covers them asks once for all of them; a declined ask, or a filing that is refused or fails, leaves the item a draft and the pull request still publishes.
- After a CI repair push that makes the body untrue of the new head, the loop rewrites the body of a pull request it opened once, since the body describes its head.
- Ticket comments are written for the ticket's readers, with the criteria and their evidence in a record attached to the ticket, an issue artifact on GitHub or a work item attachment on Azure DevOps, since the comment carried the run's own vocabulary.
- Under `commit: true` the report is no longer posted on the pull request, since it is run output and the committed snapshot carries it.
- The skill carries the house rules' two items on what leaves a run, word for word.

## gate 0.1.13 - 2026-11-09

- The gate posts nothing to the pull request: the verdict, the findings, the checks and the commits stay in the report, since the comment carried the gate's own verdict and commit ids that a later push made stale. The skill carries the house rules' two items on what leaves a run, word for word.
- A run that resumes on a stop already in the record goes on to its next target, since the end of the run skipped the step that moves on.

## rules 0.1.27 - 2026-11-09

- The house rules add two Working items: what leaves a session is written for its reader, with run output kept in the run folder or a record attached to a ticket; and output stays local unless publishing is the task's purpose, with two checks before any post. Output a session wrote for itself had reached readers it was not written for.
- Concise Plain 4.14 takes a draft's detail level from its reader, not from what the session just did, since status notes to people outside the session came back one level too detailed; the chat block carries the bullet.

## gate 0.1.12 - 2026-11-09

- The next run on a branch pushes a fix commit that a refused push left local, judging the deploy and asking again as before any push, then reviews the branch afresh at `xhigh`, leaving the failed pass as it was, since preflight blocked on the branch ahead of its remote and resume skipped the push, so the commit had to be pushed or dropped by hand. A "no fixes" run blocks on that commit, naming it. The comment and the report list the kept commit the run pushed and the findings it fixed, since they listed only the passes' own commits and findings, so the pushed commit and its fixes went unreported. A push that fails without a denial now ends the run `blocked` with its commit kept, like a denied one, since the step named only a denied push.

## loop 0.1.19 - 2026-11-09

- Step 0 takes the primary checkout from the toplevel of the session's repository in every run, not only for "primary <path>", since a session started in a subfolder could take that folder, and then make its record under it, where a run from the root does not find it, and compare only that folder's flagged files. A session started below the toplevel runs the primary's commands in the `git -C` and `cd` forms of a named checkout, which the permission statement counts as prompts, reads the instruction files of each folder from its own up to the toplevel, keeps its record at the toplevel, and names the toplevel as the primary's repository in the handoff and the audit manifest, so the gate and the audit do not start from the subfolder. Step 0 ends `blocked` outside a git work tree. A record that loop 0.1.18 made under a start subfolder is not found from this release on: a run that finds its branch by ticket ends `blocked`, since the predicted branch exists with no record, and a run that names the branch ("continue <branch>", "on branch <name>" or a pull request reference) starts a new record at the toplevel and ignores the old one, so the new record holds none of the earlier run's commits or pull request, the loop treats the branch's earlier commits as not its own, and it may build their slices again.

## loop 0.1.18 - 2026-11-08

- The deploy judgment lists the workflow files from the repository root, since from a subfolder it listed none and pushed without asking. It reads only the `.yml` and `.yaml` files directly in `.github/workflows`, which are the ones GitHub runs, unquotes a quoted path, reads trigger filters as GitHub applies them, and counts a workflow it cannot settle as one that deploys, as the gate does. A CI repair push is judged too, since a repair can change a workflow, and `git ls-tree` is pre-approved beside `git show`.

## gate 0.1.11 - 2026-11-08

- Before each push the gate judges whether the push triggers a deploy, from the workflow files of the target's base branch and of the commit being pushed, in the target's repository, and asks first, naming the workflow, since it pushed fix commits without that judgment and an instruction that asks before a deploy had nothing to apply to. A workflow whose deploy the files cannot settle counts as one. A yes covers that push only, since a fix round can change what the next push deploys, and any answer but a clear yes is a denial that ends the run `blocked`. The permission statement says the deploy is judged before each push.

## primer 0.1.8 - 2026-11-08

- The startup notice reads the memory directory that `autoMemoryDirectory` names in the local, project or user settings, else the one `CLAUDE_CODE_PROJECT_DIR_NAME` names when the host took the name, since with either set it looked in the derived directory, found no index and never printed. Promotion's fallback, used when the session's instructions name no memory directory, takes the same order.
- The first settings file that sets `autoMemoryDirectory` decides, and a value that is not an absolute or `~/` path, empty or null included, counts as unset, since the host takes the winning file's value and then validates it. The hook reads a path as the host's platform does: `~/` against `USERPROFILE` on Windows and `HOME` elsewhere, a drive path as absolute on Windows only, and on Windows a path rooted with `/` on the drive of the working directory, since otherwise it looked where the host does not write.
- The skill shape adds `allowed-tools` only for the reads a skill runs in the turn that invokes it, since the grant clears at the user's next message and does not cover a read after a reply; a grant for the session is a permission allow rule in the user's settings.

## audit 0.1.16 - 2026-11-08

- Act's opening paragraph, hard rule 3, the skill's rule 3 and its Stage 9 summary keep the trailer the host's attribution setting adds, as the commit step already did, since the four still forbade any model or tool name in a commit message with no exception for it.
- The Boundaries list of the auditor, the adversary and the mapper names `cat` of an exported file, which hard rule 2 allows, so an agent's own list no longer bars a read its rules allow.
- The awk headers of `handoff.sh`, `live.sh`, `readonly.sh`, `revert-tests.sh` and `working-tree.sh` name BSD awk beside mawk and gawk, as the other scripts and their suites on macOS do.
- The README no longer lists Node, since the audit runs no Node code.

## loop 0.1.17 - 2026-11-08

- The echo's credential scan carries the key shape of Step 0.1 whole: any letter case, anywhere in a line, and where the value ends, since the shorter copy could let an echo through that Step 0.1 would redact.

## gate 0.1.10 - 2026-11-08

- The pull request comment no longer lists the passes and their levels, and neither it nor a fix commit names a review pass or its level, since both are kept out of pull request text and commit messages; the report in the run directory keeps them. The check before posting covers every reason in the comment, those the record carries as well as the run's own, since a reason a script wrote could still name a pass.

## rules 0.1.26 - 2026-11-07

- `/rules:handoff-prompt` carries the handoff prompt item and the item on prose written for an agent in place of reading them from the plugin's rule file, since that read asked for permission and, where no one could answer, was refused and left the prompt written without its definition.

## rules 0.1.25 - 2026-11-07

- The Code house rules gain an item after the prose-for-an-agent item that defines a handoff prompt: enough context and background for a later session to understand the work, the settled decisions and open questions as they were left, nothing more specific than they were, nothing suggested and nothing asked of anyone else, since the same request was restated across sessions with nothing in the suite defining it. The rule count moves to 38; the block updates through /rules.
- The chat block carries the item, since a handoff often starts in chat.
- A new `/rules:handoff-prompt` skill writes the prompt and answers a plain request for one, since the definition alone left each session to write the prompt on its own.

## rules 0.1.24 - 2026-11-06

- Concise Plain 4.13 says in its opening paragraph that a revised draft comes back whole, and its Drafts bullet returns one paragraph alone only when the ask is to see just that paragraph, since after feedback on one paragraph revisions kept coming back as that paragraph and the whole draft had to be asked for each time. The chat block carries both lines.
- The Working house rules gain an item after the scratch item: a credential never sits in a file, a scratch file included, and reaches a command through the environment or a tool's own store, since a token written to a scratch file would have stayed on disk until a yes to delete it. The rule count moves to 37; the block updates through /rules.

## guard 0.1.2 - 2026-11-06

- The startup hook checks nothing in a session the host marks as unattended, which every `claude -p` session is, since each headless child the gate and the loop start launched the host's defaults call, six for a split pass of six, with no one to show the notice to. The entry point is no signal, since a child of a desktop or IDE session keeps its parent's.

## gate 0.1.9 - 2026-11-06

- Each child review runs at `models.reviewer`, which has a default, and the reading block's Engine line names that model for each repository before the first review starts, since a child started with no model ran on the tier the settings files named and nothing the gate printed said which.
- The one retry of a group that met a usage limit runs on another model than the reviewer's, and the record names the model it ran at, since a retry on the model that met the limit meets it again.
- A cross-file candidate shares only a name that looks like code, a camelCase or snake_case word or a backticked name with a character other than a letter, a digit or a space, since a backticked plain word such as `null` or a product name linked unrelated findings.

## rules 0.1.23 - 2026-11-06

- The refactor skill says to run its `git` reads with the Bash tool, which its `allowed-tools` pre-approve, since the skill named no tool and a Windows session could take another shell tool and prompt on each read.

## primer 0.1.7 - 2026-11-06

- The drift hook sets `"onFailure": "continue"`, so a shell call goes ahead when the hook cannot run, since a shell-form hook that fails on Windows without Git Bash with the field unset can block every shell call.

## guard 0.1.1 - 2026-11-06

- On Windows, a `claude` that only an npm `claude.cmd` shim provides is run through `cmd.exe` by the full path of the first shim on the PATH, quotes removed, since `execFileSync` cannot start a `.cmd` file and every call failed with `ENOENT`, and `cmd.exe` looks for a bare name in the current folder before the PATH.
- A `PermissionDenied` hook appends each classifier denial to `denials.jsonl` in the plugin data directory, with the time, the reason, the tool, the cwd and the command cut at 300 characters or the file path, never file contents or output, and `/guard denials` prints the record, since nothing showed whether the entries clear the denials they were written for. An unreadable record prints one refusal line, not a stack trace.
- A `SessionStart` hook prints one line when the entries are stale against the host's current defaults, since a host release that reworded a default line left them behind until the user happened to run `/guard`.

## loop 0.1.16 - 2026-11-06

- The risk floor and the plan review ask whether every read-only companion of a schema, migration or data access change reads the rows the write touches, since a repair across every tenant kept a rollback listing that saw only one and only the final review caught it.
- The publish step writes the body file first and runs the post as its own command, since runs combined the two into one compound command, the form the classifier denied.

## audit 0.1.15 - 2026-11-06

- A branch that moved while another worktree has it checked out is a judged `local-branch` pair with its config lines, an upstream change included, not a block, unless it is a bundle's branch or base, since refs are shared by every worktree and work in a sibling one blocked runs. A worktree whose folder is gone no longer counts, and a branch that did not move stays blocked.
- Stage 8's Coverage line is one fixed sentence naming `baseline/8-check.md`, since its check runs after the report is hashed and a run invented a wording for it.
- Section 3 names its cut by tier, since a run cut the Verified OK items in a form the template did not allow.
- The run id's slug is the repository name with the pull request number or the branch, since the rule read two ways for a branch bundle and a lookup by a guessed id missed.
- A `file:` ticket's slug is its export's `id`, since the slug of its absolute path made group ids as long as the path.
- With `--live`, a finished run takes live results after a plugin update when nothing else changed, since an update made the only path a full rerun.

## gate 0.1.8 - 2026-11-06

- A child review that stopped on a usage limit is an infrastructure failure: `findings.mjs` reads every output and names each bad one, and a limited group gets one stand-in review, bounded by the review budget, before the pass fails, since the script stopped at the first bad output and the finished reviews of the pass were lost.
- A new finding's candidates include settled entries on other files that share an identifier, since one design question sat in the ledger as three entries over two files.
- A reviewer's notes keep the text after its fence, since every reviewer of one run wrote there and the record showed none.
- A fix round that touched only documentation sends the run to `medium`, since each `high` pass over a design document found new minor wording and no run converged; a file the host loads as instructions is not documentation.
- No pass starts with less run budget left than a pass needs, counted per six groups, since a pass that started at 113 of 120 minutes ran a full review and ended the run past its budget with its findings open.
- A wide diff merges small sibling groups and runs at most six reviews at once, since a diff of many small directories gave 29 full reviews in one pass.
- A triage of more than 30 findings uses read-only readers that return evidence, never a bucket, since a pass of 245 findings would have filled the orchestrator's context.
- The fix round restores a file a check rewrote outside its groups before it stages, since a regenerated file went into a fix commit.
- The publish step writes the comment file first and runs the post as its own command, for the classifier, as the loop's does.

## rules 0.1.22 - 2026-11-05

- Concise Plain 4.12: an ask goes to whoever owns the decision, and a decision the team shares is put as the team's, never as the reader's because they are the reader, since a draft put a shared decision to two readers as theirs and a reply's ask went through four forms on the same slip.
- A status note to a reader who won't open the code answers what changed for them, what happens next and what they decide, and nothing on how the result was reached, since a status note opened with release mechanics and was cut by about half on each of three turns before it read that way.
- A revised draft comes back whole, or the one paragraph that was asked for, since the whole-draft return was skipped twice when one paragraph was asked for and the paragraph was accepted both times.
- Where links won't render, an id is written with its URL in parentheses and the draft says so, since a sent reply wrote a pull request id that way because pasted email renders no Markdown link, and the style named only the bare id.
- From the untagged 0.1.21, Concise Plain 4.11: the finding shape is scoped to a reader who will open the code, and a reader who won't gets no file, branch, line, pull request or check output, only what they see and what will change, since drafts to such readers carried that detail; a draft takes its length and register from the messages already on its thread, plain and professional when there is none, since redrafts swung between terse and chatty with nothing to anchor them; a reply answers the last message to the sender and takes up only what the thread raises, since a draft rebutted a point nobody had made; a draft commits the sender to nothing they haven't decided and grades neither the request nor the reader's work, since drafts promised unapproved work and opened or closed by grading; and a draft the user pastes writes the name where a mention goes and says they pick it in the platform, the raw form only when a tool posts it, since pasted drafts carried raw mention identifiers.

## loop 0.1.15 - 2026-11-05

- The plan reviewer runs at the default tier and retries once at the `fallback-reviewer` model, one tier down by default, or at the other of the two lower tiers when the fallback is the reviewer's own model, since the top tier's usage limit was met by several runs at once and a retry on the same model meets the same limit.
- The stand-in final reviewer retries once one tier down on an error, for the same reason.

## audit 0.1.14 - 2026-11-05

- The second opinion runs at the default tier and relaunches a failed batch once one tier down, or at the default tier when it was overridden to the lower one, since the top tier's usage limit was met by several runs at once, as a run of acceptance item 14 had already seen.
- The other roles relaunch on their own model, then on the default tier, or one tier down for a role already there, so the swap still changes model instead of retrying on the one that failed.

## guard 0.1.0 - 2026-11-04

- First release. `/guard` keeps the auto mode classifier's environment and allow entries for a list of repositories the user names, so pushing a branch and opening or commenting on a pull request there is not denied; `merge` also allows merging a pull request the user names. Each entry is marked as guard's own, so the user's entries stay, and the environment list is written whole from the host's defaults, since an added line does not replace a default one.
- The script writes only `autoMode.environment` and `autoMode.allow` in the user settings file and keeps every byte outside that value; it checks the candidate in a scratch configuration directory before the write and the real one after, backs up the file first, and writes nothing until the user replies with the sentence the skill asks for, since the write is a permission change the user must name.
- The catalog lists six plugins.

## loop 0.1.14 - 2026-11-04

- On a continued branch, preflight plans at the branch tip and step 3.7.1 reverifies against it, and a worktree run starts its worktree there, since the run compared the tip with the base commit and planned a worktree run at the base while the build starts from the tip.

## loop 0.1.13 - 2026-11-04

- Step 3.7.1 reverifies the plan against the base commit recorded at preflight, not the base branch name, since git read that name as the local branch, which can be behind the base the run fetched.

## rules 0.1.20 - 2026-11-04

- `/rules` says to run each command with the Bash tool, which its `allowed-tools` pre-approves, since a session had called the script with another shell tool first and hit a permission failure.

## loop 0.1.12 - 2026-11-04

- A worktree run creates the worktree detached at the base commit recorded at preflight, not at the base branch, since a base branch that moved after preflight gave a worktree at a commit the run had not planned against.

## audit 0.1.13 - 2026-11-04

- Stage 7's slice commands and the merger start and end a ledger section only at a heading outside a code fence, and a copied section that reaches the end of the file inside an open fence ends with a closing fence line, since a finding that quoted a heading in a fence was cut short or named an id with no finding behind it.
- The merger's end-of-file rule skips only the addition block the ledger script leaves out, one with no heading or end line after it before the open fence ends the file, so the merger reads the same ids the gate list holds.
- The skill's stage 6 writes the mandatory set to `tmp/` and moves it into the ledger only when the script succeeds, as the stage file does, since a failed run could leave a partial set that later stages read.

## rules 0.1.19 - 2026-11-03

- `/rules:refactor` rests every finding and every refutation on the quoted rules and the tree, never on the reviewing session's own instructions, settings or environment, since a run had cited the session's instructions as facts about the repository; each reviewer and refuter brief now says so.
- An instruction file sentence that the tree contradicts throughout goes to `/primer` as a disagreement, never a note, since a run had listed one as a note and named nothing to fix it.
- A bundle holds the files of one area and that area's tests, and a change to a part the repository releases on its own is its own bundle that names the release it needs, which its ticket carries, since a run had written bundles that spanned areas or left out the release lint then required.

## primer 0.1.6 - 2026-11-03

- `shapes.md` says a written skill `description` holds no `<` or `>` and writes a placeholder as `[name]`, since the skill list shows angle brackets escaped.
- `/primer:fold` rests every item on the repository and the documentation, never on the reviewing session's own instructions, settings or environment, since a run had cited the session's own instruction as a fact about the repository.

## gate 0.1.7 - 2026-11-03

- The gate's description writes its placeholders as `gate PR [n]` and `gate the manifest [path]`, since the skill list showed `<n>` and `<path>` escaped.
- The permission statement names the `node` scripts each pass runs, so a permission mode that asks for `node` is weighed before the passes.

## audit 0.1.12 - 2026-11-03

- `live.sh carry` reads code fences as the ledger does: a heading inside a fence no longer ends a carried finding, a start line inside a fence is not one, and a block that reaches the end of the file inside an open fence is no block, since a finding that quoted a heading in a fence was cut short.
- `revert-tests.sh` retries a work dir removal that leaves the directory behind, for up to 10 seconds, since its cleanup left the work dir in about one run in a hundred; a work dir still there after that is named on stderr with the last removal's error, on a run that otherwise succeeds.
- The README says a GitHub pull request needs `jq`, and that a `file:` export runs without it.

## rules 0.1.18 - 2026-11-03

- `/rules:refactor`'s second pass also refutes a finding that a test or a recorded decision holds, or whose quoted rule does not cover the case when no other item does, since a run had kept such findings and their tickets would have sent loop runs at defects that were not there.

## primer 0.1.5 - 2026-11-03

- A nested `CLAUDE.md` and a rule are capped at 40,000 characters as well as by lines, and the drift hook denies a commit that puts one over it, since Claude Code gives only the start of a file that loads on demand when it is longer, and a rule of long lines passed the 200-line cap.

## primer 0.1.4 - 2026-11-02

- Primer's commits keep the attribution trailer the host's setting adds, as the loop's and the gate's do, where they had dropped a `Co-Authored-By` trailer; a user who wants none turns the setting off.

## audit 0.1.11 - 2026-11-02

- The act stage's commits keep the attribution trailer the host's setting adds, as the loop's and the gate's do, where they had dropped one that names a model; a user who wants none turns the setting off.

## primer 0.1.3 - 2026-11-02

- Placement item 2 sends a tool call that must be stopped or asked about in every task, or a trailer the host adds, to the settings key that enforces it, permissions deny or ask or attribution, so a fold that names a setting has an item to land in; primer proposes the key and never writes it.
- A failure seen only when a skill runs, and its fix, goes into the step of that skill that fails, since only that skill's runs need it; maintain may now write a promoted memory note's line into an existing skill, which it had refused for any skill the run did not propose.

## rules 0.1.17 - 2026-11-02

- `/rules:refactor` reviews a whole repository against the house rules and the repository's own instruction files and reports the findings in bundles, one loop run each, so a tree that drifted from the rules, or never used the suite, gets the same review a pull request does; on a yes it writes one ticket file per bundle and prints the loop line to ship it, and it runs only when the user types it.

## primer 0.1.2 - 2026-11-02

- `/primer:fold` reviews a repository against the Claude Code documentation as it reads that day and reports where a documented practice or mechanism can be folded in, with the page, the file and the destination of each, so the instruction files and the plugin keep up with the docs; it writes nothing and runs only when the user types it.
- `placement.md` no longer says a skill's description is always listed: a skill with `disable-model-invocation: true` is not listed at launch.
- The README and manifest name the renamed marketplace, `reimagine-engine`, a change made in 0.1.1, which was not tagged.

## audit 0.1.10 - 2026-11-01

- The shared files shrink, since every launch pays for them: four sections of `audit-evidence.md` no step names go, with a short section keeping the bars on a finding that the adversary and the second opinion would otherwise lose, the orchestrator's read-only check and counting rules leave `common.md`, and the finding schema and its neighbors move to `audit-evidence.md`, so a digester, mapper or merger launch no longer reads them.
- The auditor and adversary bodies stop restating the scope file's checklists, the shared files' rules and the request's asks. The second-opinion launch reads the rule files once, from the sentinel copies, so the sentinels cover them. The merger no longer takes the brief, which no step of it uses.
- Three command descriptions and the five agent descriptions shed the words that route nothing, which every session pays for.

## gate 0.1.6 - 2026-11-01

- `record.md` no longer describes each `passes.json` field and each ledger write again after the step that writes them, since its copy of the change kinds had already fallen behind Step 2; Step 0.8.4 now names both branches of a slug collision, which only `record.md` said.

## rules 0.1.16 - 2026-11-01

- House-rule edit nineteen: the bug item drops "If you can't reproduce it, run a check that confirms or rejects your explanation.", since the unverified-cause item after it says what to do when a cause cannot be shown.
- `/rules` no longer runs `status` only to say what its report prints first, and two bullets and two sentences that repeated other text go; `status` stays a verb of the script.
- The chat block's Mention bullet gains "repo,", left out from when the block assumed no repository.

## rules 0.1.15 - 2026-10-31

- A Code item of the house rules asks prose written for an agent, such as skills, prompts and instruction files, to state principles in the fewest words that get the job done, and to add a procedure or an output shape the request did not ask for only for a failure that happened, since procedures and output shapes with no failure behind them had cost the house rules length and fixed nothing three times. The chat block carries no Code item and does not change.

## rules 0.1.14 - 2026-10-30

- The decision item of the house rules keeps the assumption every option shares, what each does, the recommendation first and what would overturn it, and drops "the question in one sentence", "what it blocks" and the numbered-message shape, since no recorded failure stood behind the shape and the format cost length, not turns.
- Concise Plain 4.10: the Drafts bullet "A review or handoff: verdict first" goes, since the Content rule "Lead with what the reader needs" already says it; the Drafts scan step goes, since its effect was never verified, and its first sentence stays as the principle that the Content and Links rules hold inside a draft shown for pasting. The chat block carries both cuts.

## rules 0.1.13 - 2026-10-30

- Concise Plain 4.9: the Drafts reader bullet asks for the effect on the reader, the next step and who it waits on, and admits an id, count or internal name only when that person will use it, called what they call it, never a label the session coined; first drafts had carried ids and counts the reader would not use. A new Drafts bullet says a revised draft comes back whole, with what changed in one line above it, in the register and detail of the version last accepted, and that a cut takes filler, restated detail and internal mechanics before the facts the reader acts on and their context; an ask to shorten had removed the fact a message existed to convey, and a reply after an edit had shown only the changed line. The chat block carries the two lines. The house rules do not change.

## loop 0.1.11 - 2026-10-30

- With a `checks` key, Step 6.1 and the plan take its commands as the run's checks alone, and a CI job no configured check covers is named as deferred to CI, since a plan had added the build script as a check and so deferred nothing.

## gate 0.1.5 - 2026-10-30

- Each step after preflight says that a manifest bundle or "repo <path>" runs git as `git -C "<path>"` and every other command as `cd "<path>" && <command>`, since the rule stood only in Step 0.2 and a fix round sent the plain forms.

## loop 0.1.10 - 2026-10-29

- The `gate` key of `.reimagine.json` is skipped without a report, since it belongs to the gate plugin and was reported as unknown.
- Step 2 states the implementer budget in force where it sizes slices, and the implementer brief names it, since a slice sized with no budget in view could run past it and end the run blocked.
- A slice's files are hashed as the working copy's bytes, and a path counts as held when the tip has it and the hash equals the committed blob or the blob as a checkout writes it, since under `core.autocrlf` a file whose index and working copy differ in line endings never matched the tip, and a path missing at the tip had hashed as the empty blob.
- A run blocked in Step 4 with slice edits left uncommitted prints the `git add`, `git commit` and `git push` commands for its complete slices only, and names the others as not done with the note that a rerun stops on their paths until they are committed, restored or moved out, so the user can commit finished work and a rerun finds those slices done.
- A snapshot reads a path that `git status` quotes without its quotes and takes the new path of a rename, since a path with a space or a renamed file was compared under a name no file has.
- An implementer call is judged by the `duration_ms` of its completion notification, since a parallel batch shared one start time and the minutes spent writing its briefs counted against each call; a late notification for a call that already returned is checked against the `post-<n>` snapshot the call wrote when it returned, and the brief bars background commands, which had woken a finished call again.
- A check over the 10-minute foreground limit runs in the background beside a timer, whichever ends first stopping the other, since a background command notifies only when it ends and a hung check was never stopped.
- `code-review` covers the primary whenever it is the session's checkout, a linked worktree included, since a session started in a linked worktree got the stand-in review instead.
- With a `checks` key the configured commands run, and Step 6.1 still reads the manifests and CI jobs and names each CI job no configured check covers as deferred to CI, so the gap shows before publishing.
- The user's instruction files are read in `$CLAUDE_CONFIG_DIR` when it is set, else in `~/.claude`, never both, together with the instruction files of each folder above the repository, which the session loads as project instructions, and the permission statement names the directory read, since a run read both and honored rules the session never loads.

## gate 0.1.4 - 2026-10-29

- A matched finding's `match` is written in the same write as its bucket and state, and `findings.mjs` warns on stderr about a carried or regressed entry new in the latest pass with no match, at the next pass and through `--check` after each triage, since a matched finding had been recorded under its new id without the link. The repair takes the earlier id from that pass's `passes.json` entry, else from the reason, and otherwise leaves the entry and names it in the Log.
- The `gate` key takes `timeouts` with `subagent`, `review` and `check`, each absent key falling back to the root `timeouts`, then the default, and the reading block's Budget line prints the three, since a fixed 15-minute check budget kept a repository with a longer suite from finishing a fix round. Each check runs with its budget as the shell timeout, and one whose budget is over 10 minutes, the shell's foreground limit, runs in the background beside a timer, whichever ends first stopping the other, and the reviews wait beside the same timer, since a background command notifies only when it ends.
- A group still over `split` whose key is a directory is grouped again one segment deeper, unless that gives a single group, since a diff with most of its changes under one folder kept one oversized review after the split.
- "repo <path>" names the checkout of a branch target, checked with `git -C <path> rev-parse --is-inside-work-tree --show-prefix`, with every command run in a manifest bundle's forms, its checks, instruction files and `.reimagine.json` read in `<path>`, and the exclude path read relative to the repository, since a `cd` in one call does not carry to the next and "this branch" always resolved against the session's checkout.
- The user's instruction files are read in `$CLAUDE_CONFIG_DIR` when it is set, else in `~/.claude`, never both, together with the instruction files of each folder above the repository, which the session loads as project instructions, and the permission statement names the directory read, since preflight read the home instruction file when a configuration directory was set.
- An implementer call is judged by the `duration_ms` of its completion notification, a late notification for a call that already returned is checked against the call's `post-<n>` snapshot, and the brief bars background commands, as in the loop. The Log gives each call's `duration_ms` and the times taken around its batch, and a snapshot reads quoted and renamed paths as the loop does.

## audit 0.1.9 - 2026-10-29

- The commands hold `$ARGUMENTS` unquoted, since the quotes made the whole request one token and a manifest and the words after it were read as one; `lint.sh` fails when a command quotes it again.
- A completion notification for an agent this session did not launch, such as one an earlier session launched, is noted in the check file and changes nothing, since the rule covered only an agent whose stage entry had already closed.
- A run started on 0.1.8 resumes from stage 1.

## gate 0.1.3 - 2026-10-29

- The reading block prints a Scripts line with the plugin's resolved scripts directory, and every step types that path, since `${CLAUDE_PLUGIN_ROOT}` is empty in the session's shell and the script calls failed.
- The checks of a run come from the request's `checks` phrase, else the manifest bundle's `checks`, else `.reimagine.json`, and the report names the source, since a user who cannot add that file to a repository got no check at all; each review's notes, where it says what it could not run, go into `passes.json` and the report's Log.
- A branch target gated through a manifest takes the bundle's `base` before the configuration's, so a release or hotfix branch is diffed against the base its bundle names.
- A pass over `split` groups the files at the shallowest path depth that gives more than one group, since a change under one folder formed one group and went to one review whatever its size.
- A deferred finding that returns stays deferred with its reason, and each new finding lists the same file's settled entries nearest first as candidates, so a reworded finding is matched against a short list instead of being triaged again.

## audit 0.1.8 - 2026-10-29

- A claim that names no file goes in turn across its bundle's groups, and a group holding more than 80 passes the rest to the others in turn, and the brief records each scope's count and each move, since such claims had all gone to one auditor.
- The read-only check prints a new local branch and its branch config as `local-branch` and asks whether the user's work in another worktree explains it, since refs and config are shared by every worktree and such a branch had stopped runs as blocked.
- Resume keeps a pass-one or pass-two output that finished, with its inputs unchanged, when stage 4 or 5 never closed, and relaunches only the scopes without one.
- Each agent definition restates the hard rules: no second-opinion tool, only the allowed commands with `mkdir -p` of its scratch folder, no inline program or heredoc, redirects only into its scratch folder, and an output final at `status: complete`; a late completion notice changes nothing.
- Act runs a covering check or the item's described test before it edits an item whose evidence is reading, stops when the result contradicts the premise, and puts the before and after results in the commit body.
- `report.sh` writes the report's decision ledger, raised tickets, claims section and verdicts file from the run's files and joins the part files into the body, so those copies no longer pass through the model.
- A run started on 0.1.7 resumes from stage 1.

## rules 0.1.12 - 2026-10-28

- The Working scratch item records each scratch file, script, worktree or branch as it is made or first changed, by exact name, noting which existed already, and when done offers only what the session made, from the list and the disk; a session had rewritten a file that existed before it started and, once a summary dropped that detail, offered it as safe to delete, and had listed logs as globs that matched another session's files. The rule count stays 35; the block updates through /rules.

## rules 0.1.11 - 2026-10-27

- The Working scratch item records each scratch file, script, worktree or branch in one list as it is made, and when done says which are safe to delete and why, and nothing more, with the deletion waiting on a yes; long sessions had left leftovers behind once the offer to clean up faded. The issue item asks for one symptom per issue, with a side finding in its own linked issue. The commit item says the subject and body are about the change, never about the session that made it, since a subject had named a review round. The rule count stays 35; the block updates through /rules.
- Concise Plain 4.8: "How you got there" names what it covers, passes, levels, verdicts and finding counts, after a pull request description carried the review rounds and their levels; the Drafts scan step scans for the same and replaces each with the activity and date or drops it; a defect report opens with the wrong outcome, where it was seen, then the cause. The chat block carries the three lines.

## loop 0.1.9 - 2026-10-27

- The publication texts and Step 7.1 name no review pass or level, beside the model, agent type, tool and run-internal path they already left out.

## loop 0.1.8 - 2026-10-27

- The CI poll waits with `sleep 30` in the background, since the host blocks a standalone `sleep` in the foreground and runs had been waiting in forms the skill does not pre-approve.

## loop 0.1.7 - 2026-10-26

- Step 7's commit and the pull request text type no attribution trailer of their own and keep one the host's attribution setting adds, since the bare "Type no attribution trailer." line overrode the user's setting.

## gate 0.1.2 - 2026-10-26

- Step 2's commit types no attribution trailer of its own and keeps one the host's attribution setting adds, since 0.1.1's bare line had removed the trailer the host adds by default.

## gate 0.1.1 - 2026-10-26

- The comment writes the user's home directory as `~` in a file path or summary it quotes from a review, in each spelling a review uses, since a review on Windows had quoted the user's instruction file by its full path.
- Step 2's commit types no attribution trailer, as the loop's publish step does: the step had not said so, and runs either dropped the trailer the host's attribution setting adds or kept it.

## gate 0.1.0 - 2026-10-26

- First release. The gate runs `code-review` passes over a pull request, several, a branch or a loop manifest, always from the merge-base; it sorts each pass's findings into fix, defer and reject with a reason, has the fix bucket fixed, commits and pushes once per pass, and picks the next pass's level from the record until a pass finds nothing left to fix or a cap ends the run.
- A run keeps its record under `.reimagine/gate/<branch>/` and resumes from it, posts one comment per run that names no model, agent or tool, writes the `gate` key the audit reads, and prints its report as its last text.
- With no `claude` command on the PATH, or a review session that reports the skill missing, the run reviews through a stand-in for the rest of the run; "no fixes" makes one pass and edits nothing.
- On Windows the review command sets `MSYS_NO_PATHCONV=1`, since Git Bash rewrote the prompt's leading `/` into a path and the review never ran.

## loop 0.1.6 - 2026-10-26

- Step 5 reviews every run with the `code-review` skill at an explicit level: the effort word's level, `high` with none and at least `high` on a floored run, never above `xhigh`, so "max" types `xhigh` there while the plan reviewer, the implementers and the readers keep `max`. Where the skill is not listed, or the diff lives in a worktree or another repository, a stand-in reviewer reviews a patch once. The fresh reviewer reviews the plan only, and the higher-risk rule, which chose the Step 5 role and nothing else, retires.
- Step 5 is one pass: every finding goes to fix, defer or reject with a reason, and the fix bucket is applied once through the owning implementers, whose diff the orchestrator reads. Nothing reviews the fixes again in the run: Step 6 runs the checks, a converged review is the gate's job, and a CI repair cycle runs one pass. A Step 6 failure is fixed through its implementer and the checks rerun.
- `audit-manifest.json` gains `reviews`, the Step 5 level and its findings by bucket; the audit ignores the key. The README shows the manifest.
- The report's header gains a `Gate:` line that suggests `/gate PR <n>`, or `/gate this branch`, for a change of 500 or more lines, and the `Audit:` line follows the gate when the line count alone called for one.

## rules 0.1.10 - 2026-10-25

- The Working item that asks for one report ends after "when the next step turns on my answer"; the clause "no progress notes unless I ask for them" goes. It restated the bound the first clause already sets. The rule count stays 35; the block updates through /rules.

## rules 0.1.9 - 2026-10-25

- The first Code item asks for the simplest change that is correct and stays correct as the code grows, as one instruction with three qualities: in the code's own patterns and helpers, at every place the behavior lives, with nothing built for a need only imagined. "Smallest" had let a bespoke patch beside an existing helper count as small; the list "no option, abstraction, or fallback" goes and its principle stays. The instruction-file sentence and "Say why for any extra" are unchanged.
- The Working item on a wrong request says so first, with the evidence and the alternative, then does the alternative; calling it "the first decision to raise" had ended the turn with nothing done. The rule count stays 35; the block updates through /rules.

## rules 0.1.8 - 2026-10-25

- The first Code item gains one sentence: where a project's instruction file and its code disagree, follow the code and say where they differ. A controlled study found the model noticing such a conflict and following the stale file anyway in 79 of 80 runs, and a one-sentence rule moving the choices that follow the code from 4.2% to 91.4%; the sentence is scoped to a project's file so the house rules keep their own precedence.
- The Done item on tests reads "Don't weaken, skip or delete a test to make checks pass"; deleting a test had passed through the gap. The rule count stays 35; the block updates through /rules.

## rules 0.1.7 - 2026-10-24

- The house rules keep their principles and drop the sentences with no failure behind them: the design sentence of the first Code item; "and whether you checked it" from the decision item; "On retry, reissue the same calls and nothing else"; the item that named the steps the permission mode is likely to deny before starting; and the Done item that described an edit from the diff, which "Keep whatever describes the work accurate" covers. A finding outside the request is now weighed by the same test as one inside it, "inside the request or not", and the findings item loses "the few" and "apart and counted"; a finding the owner wanted had been framed as unimportant because it lay outside the request. 37 rules become 35; the block updates through /rules.
- Concise Plain 4.7: the Drafts bullet on facts is reduced to its principle, what the reader can get from a source the draft names is named by source, not restated, and the chat-reply length cap goes. The chat block carries that line and the findings item word for word.

## loop 0.1.5 - 2026-10-24

- "primary <path>" in the request names the primary checkout, a git toplevel or a linked worktree, in place of the session's repository; every primary command then runs as `git -C <checkout> ...` or `cd <checkout> && ...`, and a linked worktree's record lives under its main checkout. A path that is neither ends the run `blocked`. Before, a branch checked out in another worktree could only be reached by starting the run inside it, which a subagent cannot do.
- "base <branch>" in the request, else the `base` key of `.reimagine.json`, names the base branch the review's merge-base and the pull request use, in place of the remote's default branch; the Mode line and `run.md` record it with its source, a fetch that fails ends the run `blocked`, and so does a continued pull request whose base differs, since the loop never retargets one. An additional repository keeps its remote's default.
- The handoff maps a decision the run made to `role: orchestrator` instead of `not recorded`, which dropped a recorded fact; the audit's handoff carries the same table.
- The marketplace and repository are renamed `reimagine-engine`: the install line and the manifest's repository URL name it. The plugin id, skill, tag names and the "reimagine loop" trigger do not change; a profile that installed under the old name needs the new marketplace entry.

## audit 0.1.7 - 2026-10-24

- `scripts/run-copies.sh`, the tenth script, writes the run's `common.md`, its header filled from the run id, the run directory, the tier and the question list the orchestrator writes to `questions.md`, and `audit-evidence.md` byte for byte from the skill's own files, so neither copy passes through the context where a transcription slip would govern the run. Exit 1 names a bad argument, exit 2 an IO failure.
- Stage 8 writes the report body with the Write tool; only the revision line and the assembly of `report.md` run by shell. A 33 KB body carried in a shell heredoc failed on the process argument cap.
- Stage 7 chooses split mode from the slices, not the sum: when the ledger files together are over the threshold it cuts each group's slice first and splits when a slice passes the threshold or the sum passes three times it; under the threshold it records `not cut` and merges in one pass. A run with a 462,000-byte sum and a 60,000-byte largest slice had launched twelve mergers. `_test.ledger_split_bytes` now bounds a slice.
- Act's close reads the Live checks blocks from `report.md`; `live.md` is the skill document that gives their grammar, not a run file.
- Act approves a regenerated path once per repository and path for the invocation: a later rewrite by a check that exited 0 is restored and logged as `regen` with its new hash without a second question, the path is never staged with a group, a fix that touches it stops, and the close names each regenerated path once. A file whose regenerated bytes differ on every build had asked on every check. Without a yes, the act still stops.
- `handoff.md` carries the loop's decided-by table word for word, a run decision mapping to `role: orchestrator`; it held no table and a handoff mapped one to `not recorded`.
- The marketplace and repository are renamed `reimagine-engine`: the install line and the manifest's repository URL name it. The plugin id, skills, tag names and the "reimagine audit" trigger do not change; a profile that installed under the old name needs the new marketplace entry.
- A run started on 0.1.6 resumes from stage 1, as after every audit release.

## rules 0.1.6 - 2026-10-24

- A new Done rule describes an edit from the diff, not from the plan: re-read the hunk and name only what is in it, and report a change that was planned and turned out unnecessary as not needed, never as made. A report had named a rewording the files did not hold.
- Concise Plain 4.6: what a person said or decided is reported in their words or a paraphrase that adds nothing, with the options as they were put, and a reading of their words labeled as the writer's; a draft to someone else matches its reader, plain and professional by default; a fact goes into a draft only when the reader cannot get it from a source the draft names, and a chat reply stays a few sentences unless the reader asked for the detail; before a draft is shown, even one for pasting, it is scanned for bare ids of the kinds the Links section names. The chat block carries the same four lines.
- The marketplace and repository are renamed `reimagine-engine`: the install and uninstall lines and the manifest's repository URL name it. The plugin id, skill, hook, output style and tag names do not change; a profile that installed under the old name needs the new marketplace entry.

## audit 0.1.6 - 2026-10-22

- `revert-tests.sh` with a fractional `REVERT_TESTS_TICK` no longer ends a deadline, the wait window or a cleanup bound up to a second early: the shell's clock counts whole seconds, so such a tick now waits one second more. A whole tick, the default included, waits as before.
- Agents report and label findings as if `REVIEW.md`'s severity and do-not-report rules were absent, and the report alone applies them. Before, an agent could drop a finding under a skip rule itself, so the report's line counting skipped findings showed 0.
- A run started on 0.1.5 resumes from stage 1, as after every audit release.

## loop 0.1.4 - 2026-10-22

- The final review request names the base commit's `REVIEW.md`, at the root and in each parent directory of a changed file, as review instructions when one exists, so the reviewer holds the change to the repository's own review calibration; a copy the branch adds or changes is not used.

## audit 0.1.5 - 2026-10-22

- `REVIEW.md` joins the default sources of truth, read at the bundle's base commit at the root and in each parent directory of a changed file, never from the bundle's own changes. Its severity rules set the report's labels, its skip rules remove findings from the body with one line per rule counting them, its always-check rules become pass-one checks, and its require-evidence rules hold an item that lacks a quote or a run. The report names the copies read and their shas, or says none applied at the base.
- A run started on 0.1.4 resumes from stage 1, as after every audit release.

## rules 0.1.5 - 2026-10-22

- A new Working rule makes finding issues and proposing changes a judgment, not a count: recommend the few that affect correctness or risk, or cost more to leave than to fix, each with its evidence and the two costs, and keep the rest as notes, apart and counted. A review that lists everything it can find buries the few items that matter. The chat block carries the same rule in one line.

## audit 0.1.4 - 2026-10-22

- `revert-tests.sh` reads `REVERT_TESTS_TICK`, whole or fractional seconds with a default of 1: each poll sleeps one tick, `wait` checks every two ticks and the watchdog's grace between TERM and KILL is ten ticks, so the script's own test runs in a fraction of its sleeping time. Unset, every delay is what it was; the deadlines, the wait window and the cleanup bounds stay in seconds.
- A run started on 0.1.3 resumes from stage 1, as after every audit release.

## primer 0.1.0 - 2026-10-22

- First release, with the behavior of 0.1.0-alpha.8: the drift hook, the memory notice, and the `init`, `adopt` and `maintain` modes of `/primer`.
- `repo-docs` leaves the catalog, which lists four plugins: `rules`, `loop`, `audit` and `primer`. A repository that repo-docs kept converts in one `/primer` run in adopt mode; uninstall repo-docs first, since the catalog does not list it and an update of it fails.

## loop 0.1.3 - 2026-10-22

- The implementer brief says that a rule the host loaded for the slice's files, such as a path-scoped rule under `.claude/rules/`, is binding, so a slice follows the project rules for the files it changes as it follows the instruction files.

## audit 0.1.3 - 2026-10-22

- The default sources of truth rank `.claude/rules/` and `.claude/skills/` after `docs/`, so a bundle that drifts from a path-scoped rule or a project skill is a finding. The act stage takes required checks from them and, before an edit, reads the rules that apply to the file and the skills; a recommended change places a documented fact by them too.
- A run started on 0.1.2 resumes from stage 1, as after every audit release.

## primer 0.1.0-alpha.8 - 2026-10-21

- A session that starts in a repository whose hub starts with `<!-- primer -->` shows one line, `primer: auto memory has <n> notes since the last review; run /primer`, when the repository's auto memory has `feedback` or `project` notes changed since the last promote pass, so notes about the repository get reviewed before they pile up. The promote pass writes the review stamp the line counts from. The memory is keyed by the main worktree's root, so a linked worktree sees the same count. The hook never writes a file and says nothing without the marker.

## primer 0.1.0-alpha.7 - 2026-10-21

- `maintain` runs the propose pass: it proposes skills from the instruction files, the repository and auto memory, in that order, each with its source, the steps as seen, how often it was seen and a name, and writes one in the skill shape only on its yes. A procedure taken from an instruction file leaves that file in the same commit, one from a memory note is offered for deletion, and one from `CONTRIBUTING.md` or another repository file changes nothing else. A skill for one command, for a fact, or for a procedure a skill already holds is never proposed.
- Saying "turn this into a skill" or "we keep doing this" after a checklist runs the proposal for that one item, with no other pass.

## primer 0.1.0-alpha.6 - 2026-10-21

- `maintain` runs the promote pass: it reads the repository's auto memory and proposes, per note, the line to write, with the note's text and its `modified` date. A `feedback` note about the code's conventions becomes a fact placed where the tasks that need it load it, an undated `project` note a rule or a `docs/` page, and a `reference` note a sentence in the hub; a `user` note is never offered, nor a note an instruction file already holds. On a yes the line is committed, then one question per note offers to delete its topic file and index line, and a no keeps both. After the pass the skill writes a review stamp for the session notice of a later prerelease.

## primer 0.1.0-alpha.5 - 2026-10-21

- `/primer` runs the verify pass of `maintain` in a repository whose hub starts with `<!-- primer -->`. It checks the hub, nested `CLAUDE.md` files, rules and skills against the repository: what the drift hook denies, that each command they name exists and does what its line says, and that each statement is true of the files it covers. With drift it prints one plan with file and line, asks once and commits the fixes; with none it prints `primer: no drift` and the items it reports, and writes nothing. Drift in `README.md`, `CONTRIBUTING.md` and `docs/` pages, and contradictions between instruction files, are reported and never rewritten. The promote and propose passes are not in this prerelease.
- The mode check reads the hub from disk. The host drops HTML comments from the `CLAUDE.md` it loads at session start, so a run that chose from that copy saw no marker and chose `adopt`.

## primer 0.1.0-alpha.4 - 2026-10-21

- `/primer` runs `adopt` in a repository with instruction files but no hub starting with `<!-- primer -->`, or with a hub and spoke index. It inventories every instruction and documentation file, plans the moves, rewrites and proposals in one message, and asks once. On a yes it commits the moves first, with the documentation links they break repaired, then the rewrites, and writes the hub's marker last so the drift hook checks the finished set. An index pointer whose condition is a file pattern becomes a path-scoped rule, a task a skill, and a directory a nested `CLAUDE.md`. Pinned files, untracked imports and `CONTRIBUTING.md` stay as they are. `maintain` still stops with nothing written.
- The mode line is the first line of the reply with nothing before it, and an instruction-file commit carries no trailer that names a model, an agent or a tool.

## primer 0.1.0-alpha.3 - 2026-10-21

- `/primer` runs `init` in a repository with no `CLAUDE.md` or `AGENTS.md`. It reads the readme, manifests, build files, CI workflows, test layout and contributing guide, writes a root `CLAUDE.md` of at most 60 lines with the marker, the commands and the constraints the repository holds, and leaves it uncommitted for the user to read. In the same reply it proposes the skills, path-scoped rules and nested `CLAUDE.md` files the repository shows, asks once, and writes none without a yes. `adopt` and `maintain` still stop with nothing written.

## primer 0.1.0-alpha.2 - 2026-10-20

- `/primer` chooses its mode from the files on disk and states it as the first line of the reply: `init` with no `CLAUDE.md` or `AGENTS.md`, `adopt` with instruction files but no hub starting with `<!-- primer -->`, and `maintain` with one. Each mode then says it is not in this prerelease and writes nothing, so the mode selection can be tried before the modes land.
- The skill gains the two reference files its modes read: the shape and cap of each instruction file, and the eleven placement items that decide where a piece of project information goes.

## primer 0.1.0-alpha.1 - 2026-10-20

- First prerelease of `primer`, which replaces `repo-docs` from its 0.1.0 release. It ships the drift hook: before each `git commit` Claude Code runs in a repository whose `CLAUDE.md` or `AGENTS.md` starts with `<!-- primer -->`, the hook denies the commit when an instruction file is over its cap, a path the hub's opening paragraph names is missing, a rule's `paths` cannot be read or matches no tracked file, or a skill has no description, and otherwise names the rules, skills and nested `CLAUDE.md` files that cover the staged change. The `/primer` skill answers that its modes are not in this prerelease.
- The catalog lists five plugins until the primer release removes `repo-docs`.

## loop 0.1.2 - 2026-10-20

- A run on a host other than GitHub writes the pull request body its `prepared` report names, at the end of Step 6. Before, that run never read the body template, so the report pointed to a file that was not there and the body was written by hand. The body covers every input of every run of the record, one per repository.
- On an Azure DevOps remote a ticket is a link to its work item, named by its type, in place of `Refs AB#<n>`, which Azure Repos does not link; and, under the 4,000-character description cap, the body holds only the related pull requests, the closing lines and a pointer to the full body in a comment file to post first. The report asks the user to link the work items with the host's tooling, since a `Refs` line does not attach them.

## audit 0.1.2 - 2026-10-20

- The merger reads every file it takes whole to its last line, in pages, and checks it reached the line count its prompt gives. A ledger over the host's single-read limit was read in part before, and a merger could miss positions without saying so. It finds a ledger section for a duplicate check with Grep and reads only that section.
- The agents' command lists name `git rev-parse`, `git merge-base`, `git ls-tree`, `git cat-file -t|-s|-p`, `git branch --list`, `cut` and `uniq`, the read-only commands agents used outside the list; `sort -o`, `--output` and `--compress-program` and `uniq` with an output file are barred, since they write or run a program.
- A run started on 0.1.1 resumes from stage 1, as after every audit release.

## rules 0.1.4 - 2026-10-20

- The upgrade plan shows each changed run of the block as its own hunk, with three lines of context. The diff trimmed only the common head and tail, and the begin marker changes on every version, so an upgrade showed the whole block removed and added again and hid the few rules that changed.

## rules 0.1.3 - 2026-10-18

- The first Code rule asks for the smallest change that stays correct as the code grows, in place of "Make the smallest correct change." The old wording let "smallest" outweigh "correct": a fix patched one site in the fewest lines, skipped the sibling site and bypassed existing helpers. The new rule follows the code's patterns, changes every place the behavior lives, shapes for a known next change without building it, and still adds nothing for a need only imagined.
- The decision rule also asks for the assumption every option shares, whether it was checked, and what would overturn the recommendation, so a reviewer can see past the frame the options set.
- A new Working rule raises a request that is itself wrong as the first decision, with the evidence and what to do instead, rather than carrying it out in silence.
- A new Ask first rule names, before work starts, the steps the permission mode is likely to deny, so they can be allowed up front.
- A new Ask first rule treats a call the permission mode or a hook denies as a question: it is reported in full and the work waits, never routed around with another command, a script or a subagent, and a retry reissues only the same calls.
- The chat block takes the output style's Links rule, since a session in the chat app can run `git remote -v` and read tool results: base URLs come from the remote, a URL a tool returned, the task or the user, and the Azure DevOps bullet says which remote gives the base. Its recommendation rule also asks for what would overturn it, in step with the house rules.
- The chat block's header no longer sets a 5,000-character cap. The chat app publishes no cap for its instructions field and took the whole block, so the header asks only that the block stay short.

## audit 0.1.1 - 2026-10-16

- The skill's shell lines hold under zsh and BSD tools: a stale registry lock with no owner directory is removed without an unmatched glob stopping the command, a sha held in a shell variable before `:<path>` is written so no shell reads it as a modifier, and the output of `wc` is compared as a number since BSD `wc` pads it.
- The README says where macOS users get `jq`.

## loop 0.1.1 - 2026-10-16

- A sha held in a shell variable before `:<path>` is written so no shell reads it as a modifier and alters the path.

## repo-docs 0.1.1 - 2026-10-16

- The drift hook checks the paths a pointer or a backticked prefix names by their exact spelling, so a pointer written in another case than the file is a missing path on every filesystem, as it already was on Linux, and a prefix in another case is dropped instead of silently losing the recheck advice.
- The hook reads its input under the C locale, so a byte that is not UTF-8 in the command no longer makes BSD `sed` stop and the commit pass unchecked on macOS.

## rules 0.1.2 - 2026-10-16

- A `/rules` step whose data directory or config directory denies a write on macOS or Linux (EACCES, or EPERM from an immutable flag) stops with the one-line refusal that Windows already gets, naming the directory to check, instead of printing a stack trace.
- An import chain that reaches the user's `CLAUDE.md` by another spelling of its name on a case-insensitive filesystem no longer counts the block as rules the import holds.

## rules 0.1.1 - 2026-10-16

- A `/rules` step whose data directory refuses to create the lock stops within a second and names the directory to check, instead of waiting ten seconds and reporting that another step holds the lock.

## repo-docs 0.1.0 - 2026-10-16

- First release.
- Bootstrap points only to `docs/` files within the 200-line spoke cap and names a longer one in plain text in the hub's opening sentences, so the hub it writes passes its own drift hook.

## audit 0.1.0 - 2026-10-16

- First release, with the behavior of 0.1.0-alpha.1.

## loop 0.1.0 - 2026-10-16

- First release, with the behavior of 0.1.0-alpha.1.

## rules 0.1.0 - 2026-10-16

- First release.
- On Windows, a `/rules` step that finds the lock still being removed by another step waits its turn instead of stopping with an unexpected error.

## repo-docs 0.1.0-alpha.1 - 2026-10-15

- First prerelease. `/repo-docs` keeps instruction files in hub and spoke form in three modes: bootstrap writes a hub, adopt inventories existing docs, plans, asks once and commits, and maintain checks the hub and spokes for drift.
- A PreToolUse drift hook in POSIX sh that denies a Claude Code commit when the hub or a spoke names a missing path, holds a malformed index line or is over its cap, and names the spokes to recheck when staged files fall under them.

## audit 0.1.0-alpha.1 - 2026-10-15

- First prerelease. Nine stages from orient to act, a read-only check after every stage, a fresh adversary per pass-one report, a second opinion by a fresh adversary with sentinel acknowledgments, a late adversary, a merger, and a report with a revision line that act and live results bind to.
- Nine POSIX sh scripts with their suites and deterministic fixtures: read-only snapshot and check, handoff validation, ledger build and gate, working-tree head, reverted test runs, live imports, memory scan, work-item validation and open pull request collisions.

## loop 0.1.0-alpha.1 - 2026-10-15

- First prerelease. Plan, build, review and publish a bundle of tickets as one reviewed pull request per repository; a second run on the same tickets continues the same branch and reuses every step whose inputs still hold.

## rules 0.1.0-alpha.1 - 2026-10-15

- First prerelease. One house-rules block in the user's `CLAUDE.md`, planned and applied by a script with a backup, a staleness notice at session start, and the Concise Plain output style.

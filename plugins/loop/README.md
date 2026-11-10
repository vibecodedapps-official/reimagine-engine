# loop

Plan, build, review and publish a bundle of tickets as one reviewed pull request per repository. The loop reads your tickets, writes a plan and has it reviewed, has subagents build each slice, reviews the work, runs the checks, and opens the pull request. It keeps a record keyed by branch, so running it again on the same tickets or the same branch continues where it stopped instead of starting over.

## Install

```
/plugin marketplace add vibecodedapps-official/reimagine-engine
/plugin install loop@reimagine-engine
```

## Use

Say it in plain words:

- `reimagine loop #12 and #15`
- `run the loop on AB#4567, plan only`
- `/loop:run` followed by the same words

The bare `/loop` is Claude Code's own interval skill, so it does not start this one. That is expected. There are no flags; a word starting with `--` is read as prose.

Phrases the loop recognizes:

- `plan only`: write and review the plan, change nothing, stop.
- `do not publish`: build and check, then print the commands that push and open the pull request.
- `confirm the plan`: pause once after the plan review and wait for a clear yes.
- `continue <branch>`: resume that branch and its record.
- `on branch <name>`: use that branch name.
- `base <branch>`: review against and open the pull request against that branch instead of the repository's default branch.
- `primary <path>`: work in that checkout instead of the one the session opened. It must be the root of a git checkout or a linked worktree.
- `also edit <path>` and `also edit <path> on <branch>`: add a second checkout the run may change, with its own pull request.
- `budget <n> minutes`: set the run budget.
- Effort words: `quick` or `low`, `medium`, `thorough` or `high`, `very thorough` or `xhigh`, `max`. They set how hard the reviewers work. A word counts when it stands as its own phrase, for example after a comma (`reimagine loop #12, thorough`). Work that touches auth, permissions, schemas, row-level security, data access or a public API is always reviewed at `high` or above. The final review runs Claude Code's `code-review` at the word's level, `high` without a word, and never above `xhigh`, so `max` reviews at `xhigh`.

Ticket forms:

- `#123`, or a GitHub issue or pull request URL.
- `AB#12345`, or a bare number when the repository's remote is Azure DevOps.
- A Salesforce case number or record id, when a Salesforce MCP tool is available.
- A path to a file.
- Pasted text, which is taken as a description of the work.

A reference to an open pull request in the repository continues that pull request's branch.

## What invoking approves

Invoking the loop by name approves, for that run only: creating a branch, committing, pushing that branch, opening one pull request per repository, editing the body of a pull request the loop opened, one comment per run on it, and comments on the source tickets. For the open items it cannot settle, it also opens a ticket or comments on an existing one and attaches a record to each ticket it comments on or opens. Your instruction files win: an ask-first rule there still prompts, and one question covers all the tickets of a run's open items.

These always ask: a force push, `--no-verify`, a merge, anything that deploys, a change to repository settings, and any other new issue. A permission you deny is final; the loop does not retry it or work around it.

## Open items

What the run leaves open is sorted before anything is published: settled by the run, put to you in the report as a decision, or filed to a ticket on the tracker of the source tickets with a record attached for the next session. The pull request carries one line per ticket of the filed items and the ticket says what changed for its readers. On a run that ends `prepared` nothing is filed: the report holds each ticket as a draft.

## The record

Each run keeps its files in `.reimagine/loop/<branch-slug>/` in your checkout: the inputs as fetched, the plan, a log, a completion record, and the report. The directory is excluded through `.git/info/exclude`, never `.gitignore`, and is never committed. Run the loop again on that branch and it reads the record and continues.

## The handoff and the manifest

When a run makes a commit of its own, it also writes `handoff.md` and `audit-manifest.json` in the record. The manifest is what `/audit:run` reads. Its `tickets` name a GitHub issue by its id and an Azure DevOps or Salesforce ticket as an export the loop writes beside it, and leave out a file or text input. Its `reviews` key holds the level of the final review and its findings by bucket.

```
{"bundles":[{"repo":"<absolute path>","pr":"github:<owner>/<repo>#<n>","tickets":["<ticket id>"]},{"repo":"<absolute path>","branch":"<branch>","base":"<remote>/<base branch>","tickets":["<ticket id>"]}],"claims":["<absolute path of handoff.md>"],"reviews":{"level":"<level>","fixed":[{"file":"<repository-relative path>","summary":"<one line>"}],"deferred":[{"file":"<repository-relative path>","summary":"<one line>"}],"rejected":[{"file":"<repository-relative path>","summary":"<one line>"}]}}
```

When the change has 500 or more changed lines, the report suggests `/gate` on the pull request first, which needs the gate plugin.

## Configuration

An optional `.reimagine.json` at the repository root. Every key is optional; the values shown are the defaults, except `checks`, which is an example.

```json
{
  "commit": false,
  "checks": ["npm test", "npm run lint"],
  "timeouts": { "subagent": 20, "review": 30, "check": 15, "ci": 45, "run": 240 },
  "models": { "implementer": "sonnet", "reviewer": "opus", "fallback-reviewer": "sonnet", "reader": "haiku" },
  "base": "main"
}
```

- `commit`: with `true`, the run commits a snapshot of the plan and report to the branch.
- `checks`: the commands to run as checks. Without it the loop finds the repository's test, lint, typecheck and build commands. With a `checks` key those commands are the ones run, and Step 6.1 still reads the manifests and the CI jobs and names each CI job no configured check covers as deferred to CI in `run.md` and the report.
- `timeouts`: minutes for each implementer call (`subagent`), each review pass (`review`), each check (`check`) and the CI wait (`ci`), and the whole run (`run`).
- `models`: the model for each role. Values are `sonnet`, `opus`, `haiku` or `fable`. This never changes the risk floor or the final review.
- `base`: the branch the review and the pull request are based on; without it, the repository's default branch. "base <branch>" in the request wins over the key.

The `gate` key belongs to the gate plugin and is skipped without a report. Any other unknown key, and every bad value, is reported and ignored. A file that does not parse stops the run before it starts.

## How a run ends

- `done`: the pull request is open, CI is green or not applicable, and the report is written.
- `plan-only`: the plan was reviewed and nothing changed.
- `prepared`: everything through the checks is done and nothing was pushed; the report has the exact commands.
- `blocked`: a blocking defect, a denied permission, a budget exceeded or a preflight failure. Nothing more is published; pushed work stays.
- `stopped`: a question the run could not settle, before any branch was created.

## Prerequisites

- `git`, and on Windows, Git for Windows.
- `gh`, signed in, for GitHub repositories.
- `az`, or an Azure DevOps MCP tool, to read Azure DevOps work items. Behind a proxy that intercepts TLS, `az` needs the proxy's certificate in the file `REQUESTS_CA_BUNDLE` names. A work item the loop cannot read can be pasted into the request as text.
- Node is not needed by the loop itself.

On a host other than GitHub the loop runs every step through the checks and ends `prepared`, with the push commands in the report.

## Uninstall

Run `/plugin uninstall loop@reimagine-engine`. The `.reimagine/` directories in your repositories stay; delete them if you want them gone.

## License

Apache-2.0. See `LICENSE`.

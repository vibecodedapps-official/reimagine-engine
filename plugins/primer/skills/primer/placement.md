# Placement

Every piece of project information goes to the one destination that loads for the tasks that need it.

## The rule

Take the first item that fits. Then apply the tasks test.

1. Name the tasks that must obey the piece.
2. Check that the destination loads for exactly those tasks, no more and no fewer.
3. Scope follows the tasks a rule governs, not the paths it mentions.

Example: "never commit generated files" governs every commit, so it is a hub constraint even though it mentions `dist/`. A nested `CLAUDE.md` under `dist/` would load only when a file there is touched, and a commit from elsewhere would miss the rule.

The reverse also holds. "Money values are integers in cents" mentions no path, but only tasks that touch `src/billing/` obey it. A path-scoped rule for that area loads for those tasks and for no others. A hub line would cost every task for a fact that few need.

When the tasks test fails, take the next item that fits; never widen or narrow a destination to make a piece fit.

## Where each destination loads

- The hub and unscoped rules load in every session at launch.
- A path-scoped rule loads when a matching file is read or edited.
- A nested `CLAUDE.md` loads when a file under its directory is read or edited.
- A skill's description is listed at launch unless the skill sets `disable-model-invocation: true`; then only the user invokes it. Its body loads when the skill is invoked or judged relevant. A skill with `paths` stays hidden until a matching file is touched.
- A `docs/` page loads only when something names it and a task reads it.

## Items

Each entry gives the destination and one example of a piece that lands there.

1. A checkable pattern goes to a linter, a test or a hook. Example: "imports from `internal/` are forbidden outside `src/core/`". The plan proposes the check to the user. Primer never writes it. Until the check exists, place the piece by the items below.
2. A thing that must happen at a point in every task goes to a hook. Example: "run the formatter after every file edit". A tool call that must be stopped or asked about in every task, or a trailer the host adds, goes to the settings key that enforces it: permissions deny or ask, attribution. An allow entry enforces nothing, so it is not this item. The plan proposes the hook or the key to the user. Primer never writes it. Until it exists, place the piece by the items below.
3. A procedure, a checklist or a section that has become steps goes to a skill. Example: the release steps in CONTRIBUTING.md.
4. A piece every task must obey, in one line, goes to the hub as a constraint or a command. Example: "`npm run lint` must pass before a commit".
5. A topic every task must know goes to an unscoped rule. Example: how errors are logged and reported across the code base.
6. A piece for one kind of file or one area goes to a path-scoped rule. Example: "every handler under `src/api/` validates its input with the schema module".
7. A piece for one subtree with its own build and checks goes to a nested `CLAUDE.md` in that subtree. Example: "`services/billing/` builds with `make build` and tests with `make check`".
8. Long-form material that a task reads in full goes to a `docs/` page. The hub names the page with the condition for reading it, or the skill that needs the page reads it. Example: the data model write-up that explains why orders and invoices are separate tables.
9. Install, use or contribute information for a person goes to `README.md`, or to a `docs/` page that `README.md` links. Example: "run `bin/deploy staging` to try a build on the shared environment".
10. A personal preference or a note about one machine is reported and left for the user. The report says where it belongs: `CLAUDE.local.md`, the user's own `CLAUDE.md`, or the house rules block the `rules` plugin owns. Example: "use tabs, I find them easier".
11. A piece that is derivable from the code, duplicated elsewhere, true of every project, or stale is deleted. The plan gives the line and the reason. Example: "the test runner is in package.json" is derivable.

## Every addition

Before a home is proposed, class the addition four ways: stable or expiring, shared or personal, rule or reference, the user's or another owner's. The proposal names the home and the reason.

- A pointer to a source the user keeps current is preferred to a copied value. A copied fact carries the date it was copied and an expiry, or the event that makes it worth checking again.
- A proposal whose target sits inside a block a plugin manages, such as the house rules block, warns that a hand edit there stops the plugin offering its updates, says where a line of the user's own goes instead, and says how a change is proposed to the plugin.
- Before a layer, a document, a rule or a skill is written, check its text against the house rules' item on prose written for an agent, when that block is installed.

## In the local profile

The items above give way to these destinations, since nothing outside the work tree loads by path:

- A stable, impersonal rule for every mapped repository goes in `shared.md`; one for a group goes in its group layer.
- People, dates and calendars go in `machine.md`, each with an expiry.
- Reference material, a procedure and a convention for one kind of file become a document under the store's `docs/`, with a pointer in the layer that says when to read it and which part.
- A convention that belongs to another repository goes in that repository's own instruction files, by its own profile.
- A general working rule is recommended for the house rules through the feedback log.
- A workaround is a pointer to the report of the fault it works around.
- A layer's text is factual statements.

## Personal content

A personal preference in the hub or a rule is first person, a path on one machine, or a taste. List each one in the plan or the report under item 10, in this form:

```
- <file>:<line>: <text>: belongs in <CLAUDE.local.md | your own CLAUDE.md | the rules plugin's house rules block>
```

Leave the line in place, and quote its text in the report as found, so the user can search for it.

## Skill or rule

A skill is for steps done in order with checks. A rule is for a fact.

- A single command is a hub command (item 4), not a skill.
- A fact stays a rule even when a skill uses it. The skill reads the rule and does not copy it.
- A failure seen only when the skill runs, and its fix, goes into the step that fails. Only that skill's runs need it, so the tasks test puts it there.
- A checklist with no order, such as a list of things to avoid, is a set of facts. Place each fact by the items above.
- A procedure that only one area uses still goes to a skill, with `paths` for that area.

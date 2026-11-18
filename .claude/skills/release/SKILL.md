---
name: release
description: Release a plugin, cut a release, tag [plugin] [version], publish [plugin]. Bumps one plugin's version, writes its changelog heading and pushes its tag, asking before each push.
disable-model-invocation: true
---
# release

Done when the tag `<plugin>--v<version>` exists on the remote and `CHANGELOG.md` has the heading for it.

One pull request per plugin carries a run of related work, its fixes as separate commits, with one version and one tag. A fix users need at once ships alone, and a pull request too large to review is split. A change that needs several plugins at once is one pull request, with one version and one tag for each. For such a change, steps 1, 2 and 4 run once for each plugin, step 5 is one commit that names each plugin and its version, and the release is done when every tag exists.

1. Bump: `node tools/release.mjs <plugin> <version>`. The output lists the edited paths, with the catalog's own `metadata.version` raised by one, and ends with `lint: ok`.
2. Commit the bump on the change's branch as `release(<plugin>): <version>`, staging those paths and step 1's edits only. Add `## <plugin> <version> - <YYYY-MM-DD>` to `CHANGELOG.md` with the release notes and commit it as `docs(changelog): add the <plugin> <version> heading`.
3. After a yes, push the branch; after another, open the pull request. The owner merges it; CI is green on the merge commit before the next step.
4. Tag the merge commit on `main`, after a yes: `claude plugin tag --push plugins/<plugin>`. The output names `<plugin>--v<version>`. A later pull request that raises this plugin's version again fails lint at this version's changelog heading until this tag exists, and its tests never start, so push this tag first.
5. Record the CI runs of the pull request and of the push of its merge as item 21's result in `docs/acceptance.md`, in the next pull request and never in one of its own: `docs(acceptance): record item 21 at <plugin> <version>`.

A release makes no eval run due. `npm run eval`, or `npm run eval -- --trust-plugin` from a session without a terminal, runs with the batch the head of `docs/acceptance.md` describes, and its scores, the baseline and the host version then replace item 38's result.

## Checks

- `npm run lint`: `lint: ok (<files> files, <plugins> plugins)`; once the tag exists it requires the heading.
- `git tag --list '<plugin>--v*'`: the new tag is listed.
- `git diff --quiet <plugin>--v<version> -- plugins/<plugin>`: exits 0, so the tag holds the released tree.

## Report

The version, the tag and the CI run, and any step not done with why.

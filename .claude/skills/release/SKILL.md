---
name: release
description: Release a plugin, cut a release, tag <plugin> <version>, publish <plugin>. Bumps one plugin's version, writes its changelog heading, runs the evals and pushes its tag, asking before each push.
disable-model-invocation: true
---
# release

Done when the tag `<plugin>--v<version>` exists on the remote, `CHANGELOG.md` has the heading for it, and `docs/acceptance.md` records the eval scores.

1. Bump: `node tools/release.mjs <plugin> <version>`. The output lists the edited paths and ends with `lint: ok`. Raise the catalog's `metadata.version` by one, and for rules move the shipped version literals of `tests/rules/rules.test.mjs`.
2. Commit the bump on the milestone's branch, staging those paths only. Add `## <plugin> <version> - <YYYY-MM-DD>` to `CHANGELOG.md` with the release notes and commit it as `docs(changelog): add the <plugin> <version> heading`.
3. After a yes, push the branch; after another, open the pull request. The owner merges it; CI is green on the merge commit before the next step.
4. Evals: `npm run eval`, or `npm run eval -- --trust-plugin` from a session without a terminal. The output shows each case's score with and without its plugin. Record the scores, the baseline and the host version under item 38 in `docs/acceptance.md`.
5. Tag the merge commit on `main`, after a yes: `claude plugin tag --push plugins/<plugin>`. The output names `<plugin>--v<version>`.
6. Commit the acceptance record as `docs(acceptance): record <plugin> <version>`.

## Checks

- `npm run lint`: `lint: ok (<files> files, <plugins> plugins)`; once the tag exists it requires the heading.
- `git tag --list '<plugin>--v*'`: the new tag is listed.
- `git diff --quiet <plugin>--v<version> -- plugins/<plugin>`: exits 0, so the tag holds the released tree.

## Report

The version, the tag, the CI run and the eval scores, and any step not done with why.

---
name: rules-feedback
description: Fold feedback into the house rules, the output style or the chat block. Use when the user says "rules update", "fold this feedback into the rules" or pastes feedback about core.md, concise-plain.md or instructions.md.
---
# rules-feedback

Done when the user has a list of proposed changes, each with file and lines, ordered by confidence, and nothing is written.

1. Read `docs/requirements.md` under "House rules" and the last decisions on house-rule edits in `docs/decisions.md`.
2. Pass one: for each point in the feedback, find the failure behind it and the line that already covers it, if any.
3. Pass two, adversarial: challenge every pass-one proposal; keep only what a recorded failure supports and no existing line already states.
4. Converge, then present the list.

## Principles

- The house rules' Code items on reusable files and on prose written for an agent hold for every proposal.
- The record states the failure and the fix at a level that names no setting, role, host or quoted words; counts stay only where the argument turns on them.
- Each change names its requirement, its decision entry and whether the chat block mirrors it.

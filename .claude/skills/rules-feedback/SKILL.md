---
name: rules-feedback
description: '"rules update", "fold this feedback into the rules" or pasted feedback about core.md, concise-plain.md or instructions.md. Folds feedback into the house rules, the output style or the chat block.'
---
# rules-feedback

Done when the user has a list of proposed changes, each with file and lines, ordered by confidence, and nothing is written.

1. Read `docs/requirements.md` under "House rules" except "Mechanism", and the last decisions on house-rule edits in `docs/decisions.md`.
2. Pass one: for each point in the feedback, find the failure behind it and the line that already covers it, if any.
3. Pass two, adversarial: challenge every pass-one proposal; keep only what a recorded failure supports and no existing line already states.
4. Converge, then present the list.

## Principles

- The house rules' Code items on reusable files and on prose written for an agent hold for every proposal.
- The record states the failure and the fix at a level that names no setting, role, host or quoted words; counts stay only where the argument turns on them.
- Each change names its requirement, its decision entry, whether the chat block mirrors it, and whether `/rules:handoff-prompt` and the loop, gate and audit skills carry it.

---
name: park
description: Saves a point to come back to this session, lists the saved points, or removes one. Run /primer:park with what the session waits for, with list, or with done.
argument-hint: "[what the session waits for | list | done [n]]"
disable-model-invocation: true
allowed-tools:
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/park.mjs" add *)
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/park.mjs" list *)
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/park.mjs" done *)
---

# park

A save point is one short entry in `sessions.txt` of the machine's directory: what this session is, what it waits for, and the command that resumes it. The user typed: `$ARGUMENTS`

`scripts/park.mjs` makes every write to that file. Never read or write the file with another tool, and never shape an entry on another session's. Run the script once for this command and not again until the user types the command again: an entry holds nothing of the session's progress, so later work changes nothing in it.

- `list`: run `node "${CLAUDE_PLUGIN_ROOT}/scripts/park.mjs" list`.
- `done`, alone or with a number: run `node "${CLAUDE_PLUGIN_ROOT}/scripts/park.mjs" done`, with the number after it when one was typed. Alone it removes this session's entry; a number is an entry's place in the list.
- Anything else, or nothing: run `node "${CLAUDE_PLUGIN_ROOT}/scripts/park.mjs" add --what "[what]" --when "[when]"`.
  - `[what]`: what this session is for, as its user would name it. No state, steps, links or file names: the session's record holds them.
  - `[when]`: what the session waits for, in the user's words where they gave them, else from the conversation, and `not said` when neither tells.
  - Each is one line of at most 120 characters, inside double quotes, with no double quote, backtick, backslash or `$` in it.

Reply with what the script printed, as it printed it, and nothing else. A run that exits 1 printed a refusal: show it and stop.

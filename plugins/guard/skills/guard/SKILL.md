---
name: guard
description: Keeps the auto mode classifier's entries for the repositories you list in your user settings file, and shows each change before it is made.
argument-hint: "[add PATH [merge] | drop PATH-OR-REMOTE | clear | list | status | denials]"
disable-model-invocation: true
allowed-tools:
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/guard.mjs" status *)
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/guard.mjs" list *)
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/guard.mjs" plan *)
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/guard.mjs" denials *)
---

# /guard

Keep the `autoMode` entries for the user's listed repositories in their user settings file. Only the script writes the settings file and the list file. You never edit `settings.json` or `reimagine-guard.json` yourself, you never use the Edit or Write tool on them, and you never change any permission or `autoMode` entry by any other means. You run the script, show its output, and ask before each change.

The arguments:

<arguments>
$ARGUMENTS
</arguments>

## Accepted arguments

- Empty.
- `add <path>`, or `add <path> merge`.
- `drop <path or remote>`
- `clear`
- `list`
- `status`
- `denials`

Anything else: tell the user these are the accepted forms, and stop. Do not run anything.

Put no text from the user into a command except the path or remote, in double quotes. If it holds a double quote, a backtick, `$` or a newline, say so, and stop. Do not run anything. Write each backslash in the path or remote as a forward slash first, so that `C:\src\app\` becomes `C:/src/app/`; a backslash before the closing quote would escape it.

The `allowed-tools` lines pre-approve `status`, `list`, `plan` and `denials` only. `apply` meets the session's permission mode: a prompt in the default mode, the classifier in auto mode.

## Step 1: report

Run exactly one command with the Bash tool, chosen by the arguments:

- `status`:
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/guard.mjs" status "${CLAUDE_PLUGIN_DATA}"`
- `list`:
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/guard.mjs" list "${CLAUDE_PLUGIN_DATA}"`
- `denials`:
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/guard.mjs" denials "${CLAUDE_PLUGIN_DATA}"`
- Empty:
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/guard.mjs" plan "${CLAUDE_PLUGIN_DATA}"`
- `add <path>`:
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/guard.mjs" plan "${CLAUDE_PLUGIN_DATA}" --add "<path>"`
- `add <path> merge`:
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/guard.mjs" plan "${CLAUDE_PLUGIN_DATA}" --add "<path>" --merge`
- `drop <path or remote>`:
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/guard.mjs" plan "${CLAUDE_PLUGIN_DATA}" --drop "<path or remote>"`
- `clear`:
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/guard.mjs" plan "${CLAUDE_PLUGIN_DATA}" --clear`

Show the output verbatim in a fenced code block.

If the output is a line that starts with `guard: ` and the command exited with an error, show it, do not retry, and stop.

## Step 2: ask

- For `status`, `list` and `denials`, stop.
- If the output says `change: none`, say nothing will change, and stop.
- If it says `change: ready`, ask the user to approve by replying with this sentence, with the path from the `target:` line filled in:

  `Yes, write guard's change to autoMode in [path].`

  Say in one sentence why the exact words matter: in auto mode the classifier reads them as the user's approval of a change to their own permissions.

Wait for the reply. Any other reply is a no: say nothing was written, and stop.

## Step 3: apply

On that reply, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/guard.mjs" apply "${CLAUDE_PLUGIN_DATA}"` with the Bash tool. Show the output verbatim in a fenced code block.

If the permission mode denies the command, report the denial in full and wait. Never retry it another way, and never write the file yourself.

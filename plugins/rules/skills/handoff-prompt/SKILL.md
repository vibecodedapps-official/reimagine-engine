---
name: handoff-prompt
description: 'Write a handoff prompt: a prompt that carries work from this session to a later one, from a summary of a discussion or a single idea, leaving the thinking to that session. Use when the user asks for a handoff prompt, or for a prompt that carries work to a later session. Not the typed handoff file an audit reads.'
---

# Handoff prompt

Write one prompt that carries this session's work to a later session, for the user to paste.

## The definition

The definition is the handoff prompt item in `${CLAUDE_PLUGIN_ROOT}/rules/core.md`. Read that file at the start of each run and work from the item as that file words it, never from memory. The item on prose written for an agent in the same file also holds.

## What travels

The user's request says what travels: a summary of a discussion, or one idea.

An idea goes as the idea in the user's words, with why it came up and what is known, and says it is not worked out; it gains no option, plan or answer.

A summary carries what was settled, the facts it rests on with when and how each was checked, and the open questions for the user.

Both stay no more specific than the user was.

## Nothing suggested

An unsettled item is an open question for the user, never an ask of anyone else and never a suggested answer.

## The receiver

The receiver has nothing of this session. Unless the user names another, it is a Claude Code session: name the repository, branch, commit and the files worth reading. For a receiver the user names that cannot open files, give no paths. Define a term this session coined, or replace it.

## Output

Give the prompt in one fenced block for pasting. Write no file. After the block, add one line on what was left out on purpose or is unverified.

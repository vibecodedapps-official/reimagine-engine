// The push read of the outbound check: whether a command holds a push, and whether it is one git call that the shell runs as typed.
// A command that holds more can make a commit no check before it reads, and one the shell builds is not the text that runs.
// A module of outbound.mjs, which is at its budget.

const EDGE = 'A-Za-z0-9_-', GIT = new RegExp(String.raw`(?<![.${EDGE}])git(?![\\/${EDGE}])`, 'i'), PUSH = new RegExp(String.raw`(?<![${EDGE}])(?<!(?<![.${EDGE}])git(?:\.exe)?\s+stash\s+)push(?![${EDGE}])`, 'i');
// git's own options a plain call may hold before its subcommand; -C takes the next word as its value.
const OWN = new Set(['--no-pager', '-P', '--no-optional-locks']);
// Outside a quoted text, a character that ends a command, starts another or has the shell build a word; a # and, for the
// PowerShell tool, an @ count only where they start a word.
const BASH = ';&|<>()$`\n\r', PS = BASH + '{}';

// The call of a command that is one plain git call: its subcommand, '' where it has none, and the words after it, each as the
// shell gives it. One cd to a folder and && may come first, and 2>&1 may end the command. Else null: for a second command, a pipe,
// any other redirect, a substitution or a variable, a comment, a continued line, a quote left open, a program that is not git or
// git.exe by that name alone, and an option of git itself other than -C and those above. With ps the command is read as
// PowerShell reads it, its curly quotes as plain ones.
export function plain(command, ps) {
  const text = (ps ? command.replace(/[\u2018-\u201b]/g, "'").replace(/[\u201c-\u201e]/g, '"') : command).trim().replace(/\s2>&1$/, '').trimEnd();
  const stop = ps ? PS : BASH;
  let words = [], word = null, quote = null, led = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i], next = text[i + 1];
    if (quote === "'") {
      if (c !== "'") word += c;
      else if (ps && next === "'") { word += c; i += 1; } else quote = null;
    } else if (quote === '"') {
      if (c === '$' || (c === '`' && !ps)) return null;
      if (c === '"') { if (ps && next === '"') { word += c; i += 1; } else quote = null; }
      else if (ps ? c === '`' : c === '\\' && '"\\$`'.includes(next ?? ' ')) { if (next === undefined) return null; word += next; i += 1; }
      else word += c;
    } else if (c === ' ' || c === '\t') { if (word !== null) words.push(word); word = null; }
    else if (c === "'" || c === '"') { quote = c; word ??= ''; }
    else if (c === '&' && next === '&' && !led && words.length + (word !== null) === 2 && (ps ? words[0].toLowerCase() : words[0]) === 'cd' && !(word ?? words[1]).startsWith('-')) { led = true; words = []; word = null; i += 1; }
    else if (stop.includes(c) || (word === null && (c === '#' || (ps && c === '@')))) return null;
    else if (c === '\\' && !ps) { if (next === undefined || next === '\n' || next === '\r') return null; word = (word ?? '') + next; i += 1; }
    else word = (word ?? '') + c;
  }
  if (quote !== null) return null;
  if (word !== null) words.push(word);
  if (!/^git(?:\.exe)?$/i.test(words[0] ?? '')) return null;
  let k = 1;
  while (k < words.length && words[k].startsWith('-')) {
    if (words[k] === '-C' && k + 1 < words.length) k += 2;
    else if (OWN.has(words[k])) k += 1;
    else return null;
  }
  return { sub: words[k] ?? '', args: words.slice(k + 1) };
}

// What a command is to the push check: undefined where it does not hold git and push as words, null where it holds both and is
// no plain call, else its call. For Bash the words are looked for in the command with each backslash and line break pair removed, as
// the shell joins a continued line; git stash push is no push.
export function pushing(command, ps) {
  const text = ps ? command : command.replace(/\\\r?\n/g, '');
  return GIT.test(text) && PUSH.test(text) ? plain(command, ps) : undefined;
}

// Whether a call from pushing() sends commits: any command that holds a push, but a plain git stash call.
export const sends = (call) => call !== undefined && call?.sub !== 'stash';

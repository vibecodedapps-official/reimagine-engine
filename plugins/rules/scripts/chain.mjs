// The chained-push read of the outbound check: whether a git push follows, in one command, a git call that makes a commit, which
// no check before the command can read. The command is walked from its start as the shell reads it, so a comment, a continued
// line, a quoted text and the body of a here-document hide no call and are none. A module of outbound.mjs, which is at its budget.

const base = (w) => w.replace(/^.*[\\/]/, '').toLowerCase();
const MAKERS = new Set(['commit', 'merge', 'cherry-pick', 'rebase', 'am', 'revert', 'pull']);
// The word that starts a git call: in PowerShell it may be joined to the = of an assignment or to the { of a script block, whose } may be joined to a later word.
const GIT = /^(?:(?:\[[^\]]*\])*(?:\$[\w:]+)?(?:\?\?|[-+*/%])?=)?\{?git(?:\.exe)?$/;
// The options with which a pull that only fast-forwards still takes the branch's upstream and makes no commit.
const UPSTREAM = /^(?:--ff-only|--no-rebase|--prune|-p|-q|--quiet|-v|--verbose)$/;
// git's own options that take the next word as their value.
const VALUED = /^(?:-[Cc]|--(?:git-dir|work-tree|namespace|config-env))$/;
// An option with which a call makes no commit, and one with which a push sends nothing: -n alone or among push's own one-letter flags.
const IDLE = /^(?:--abort|--quit|--dry-run|--edit-todo|--show-current-patch(?:=.*)?|--help|-h)$/, DRY = /^(?:--dry-run|--help|-h|-[46dfnquv]*n[46dfnquv]*)$/;
// A program that runs the text it is given as a command; a . does where it starts the command.
const SHELLS = new Set(['sh', 'bash', 'dash', 'zsh', 'ksh', 'fish', '$shell', '${shell}', 'eval', 'source', 'trap', 'pwsh', 'powershell', 'cmd', 'iex', 'invoke-expression', '[scriptblock]::create'].flatMap((n) => [n, n + '.exe']));
const shell = (x, k) => { const name = base(x.w.split(/[<>]/)[0]); return SHELLS.has(name) || (k === 0 && name === '.'); };
// A redirect: the word it starts is no argument of a call.
const REDIRECT = /^\d*[<>]/;
// The operator and end word of a here-document: bare, quoted, after a backslash or after <<-.
const HEREDOC = /^<<(-?)[ \t]*(?:'([^'\n]*)'|"([^"\n]*)"|\\?([^\s;&|<>()'"\\]+))/;
// Whether the << at place i stands inside (( )) or $[ ] that closes on the same line, where it shifts a number and opens no here-document.
const shifts = (s, i) => { const line = s.slice(s.lastIndexOf('\n', i) + 1, i), rest = /^[^\n]*/.exec(s.slice(i))[0]; return (line.lastIndexOf('((') > line.lastIndexOf('))') && rest.includes('))')) || (line.lastIndexOf('$[') > line.lastIndexOf(']') && rest.includes(']')); };
// A function, a trap or a script block in a variable runs where it is called, so its calls run in an order the text does not show.
// A definition counts where a command starts, after any keyword or builtin that leaves it one, and after an assignment or a redirect, and name() is one for the Bash tool alone, since PowerShell calls a method that way.
const START = String.raw`(?:^|[;&|(){}\n])\s*(?:(?:then|do|else|elif|if|while|until|!|builtin|command|eval|time|[A-Za-z_]\w*=\S*|\d*[<>]+&?\s*\S+)\s+)*`;
const DEFINES = [String.raw`(?:(?:function|filter)\s+[^\s(){};&|=]|[^\s(){};&|=]+\s*\(\s*\)|trap\s)`, String.raw`(?:(?:function|filter)\s+[^\s(){};&|=]|trap[\s{])`].map((d) => new RegExp(START + d + String.raw`|=\s*\{`, 'i'));
const defines = (text, ps) => DEFINES[ps ? 1 : 0].test(text);

// What the git calls among the words of one simple command do: makes, a commit that was not there before the command, and
// pushes, with sent, the words each push is given. The subcommand is read after git's own options; an option counts only where it is typed outside quotes. Where the quotes were
// not read (loose), the call counts for any word after git that names a subcommand. A pull that only fast-forwards and names
// nothing takes the branch's upstream, which a remote-tracking ref holds once it has run, so a push sent alone would not read it
// either. chains says a push comes after a commit-making call among the same words with a PowerShell } closed between them, since a block ends no command.
// The value of a commit's own -m or --message is a message and no call: where it holds no expansion, its place goes to skip.
function flags(words, loose = false, skip = null) {
  const out = { makes: false, pushes: false, chains: false };
  let made;
  for (let i = 0; i < words.length; i++) {
    // A word that holds a $ may expand to git: it counts where a commit-making subcommand or push follows its options.
    const git = GIT.test(base(words[i].w));
    if (!git && !words[i].w.includes('$')) continue;
    const bare = (w) => w.replace(/\}+$/, '');
    if (loose && git) {
      const rest = words.slice(i + 1).map((x) => bare(x.w.toLowerCase()));
      if (rest.includes('push')) (out.sent ??= []).push(...words.slice(i + 1).map((x) => x.w));
      out.pushes ||= rest.includes('push');
      out.makes ||= rest.some((w) => MAKERS.has(w));
      continue;
    }
    let j = i + 1;
    for (; j < words.length && words[j].w.startsWith('-'); j++) if (VALUED.test(words[j].w)) j++;
    // The subcommand may share a quoted word with the words after it, as in the 'push','-q' and the "push -q" that -ArgumentList takes.
    const head = bare(words[j]?.w ?? '').split(/[\s,]+/), sub = head[0].toLowerCase(), args = words.slice(j + 1), opts = args.filter((x) => !x.q).map((x) => bare(x.w));
    // A redirect and the file it names are no argument of the pull.
    const named = args.filter((x, k) => !(!x.q && REDIRECT.test(x.w)) && !(k > 0 && !args[k - 1].q && /^\d*[<>]+&?$/.test(args[k - 1].w)));
    if (sub === 'push') { const sends = loose || !opts.some((o) => DRY.test(o)); out.chains ||= sends && !loose && out.makes && words[i].n > made; out.pushes ||= sends; (out.sent ??= []).push(...head.slice(1), ...args.map((x) => x.w)); }
    else if (MAKERS.has(sub)) out.makes ||= loose || (!opts.some((o) => IDLE.test(o)) && !(sub === 'pull' && opts.includes('--ff-only') && named.every((x) => !x.q && UPSTREAM.test(bare(x.w)))));
    if (out.makes) made ??= words[i].n;
    if (sub === 'commit' && skip) args.forEach((x, k) => { const v = !x.q && /^(?:-[A-Za-z]*m|--message)$/.test(x.w) ? args[k + 1] : null; if (v && !/[$`]/.test(v.w)) skip.push([v.a, v.b]); });
  }
  return out;
}

// The place of the ) that closes each ( of a text, as the shell pairs them: a quoted string holds none, a double-quoted one aside
// from those of a $( ) in it, and a comment none. The parentheses in the body of a here-document, and of a PowerShell here-string,
// pair among themselves, since the shell reads none of them as its own.
const DOCS = new RegExp('(?<!<)' + HEREDOC.source.slice(1), 'g');
const pairs = (s, ps) => {
  const at = new Map(), outer = [], ends = [], esc = ps ? '`' : '\\';
  // q is the quote or the block comment left open, across lines, and a " on the stack a double-quoted string left open.
  let inner = null, here = '', q = '', subst = -1;
  const body = (a, b) => { for (let i = a; i < b; i++) { if (s[i] === '(') inner.push(i); else if (s[i] === ')' && inner.length) at.set(inner.pop(), i); } };
  for (let a = 0; a <= s.length; ) {
    const nl = s.indexOf('\n', a), b = nl < 0 ? s.length : nl, line = s.slice(a, b).replace(/\r$/, '');
    if (here ? !line.startsWith(here) : inner && (ends[0][1] ? line.replace(/^\t+/, '') : line) !== (ends[0][2] ?? ends[0][3] ?? ends[0][4])) body(a, b);
    else if (!here && inner) { ends.shift(); inner = ends.length ? [] : null; }
    else {
      const from = here ? a + 2 : a;
      if (here) [here, inner] = ['', null];
      for (let i = from; i < b; i++) {
        const c = s[i], n = s[i + 1], dq = outer.at(-1) === '"';
        if (q) { if (q === '$' && c === '\\') i++; else if (q === '#' ? c === '#' && n === '>' : c === "'") q = ''; }
        else if (c === esc && (ps || !dq || '"\\$`'.includes(n ?? 'x'))) i++;
        else if (dq) { if (c === '"') outer.pop(); else if (c === '$' && n === '(') outer.push(++i); }
        else if (ps && c === '@' && (n === "'" || n === '"') && /^[ \t]*\r?$/.test(s.slice(i + 2, b))) { [here, inner] = [n + '@', []]; break; }
        else if (c === "'") q = !ps && s[i - 1] === '$' ? '$' : "'";
        else if (c === '"') outer.push('"');
        else if (ps && c === '<' && n === '#') q = '#';
        else if (c === '#' && (i === a || /[\s;&|(]/.test(s[i - 1]) || (s[i - 1] === ')' && subst !== i - 1) || (ps && /[{}]/.test(s[i - 1])))) break;
        else if (c === '(') outer.push(i);
        else if (c === ')' && typeof outer.at(-1) === 'number') { const o = outer.pop(); at.set(o, i); if (s[o - 1] === '$') subst = i; }
      }
      if (!ps) { for (const m of line.matchAll(DOCS)) if (!shifts(s, a + m.index)) ends.push(m); if (ends.length) inner = []; }
    }
    a = b + 1;
  }
  return at;
};

// The simple commands of a text in the order they run, each as flags() reads it; null where a quote is left open. What a
// substitution runs, and the quoted texts and here-document bodies of a command that names a shell, come before the command
// that holds them. ps reads the text as PowerShell does: a backtick escapes, and a here-string is one quoted text.
function walk(s, ps, depth) {
  const parts = [], esc = ps ? '`' : '\\';
  let words = [], texts = [], early = [], held = [], cur = null, shut = null, after = -1, plain = '', lost = false, vague = false, prints = false, pos = 0, braces = 0;
  // Each word keeps the place it starts and ends at in s, and the count of PowerShell } read before it; skip holds the places of the commit messages of s itself.
  const skip = [], add = (t, q = false) => { cur ??= { w: '', q: false, a: pos, n: braces }; cur.w += t; cur.q ||= q; if (q) texts.push(t); else plain += t; };
  const end = () => { if (cur) words.push({ ...cur, b: pos }); cur = null; };
  // A text with a typed \n or \r, which printf may turn into a line break, is read as written and with them as line breaks.
  const both = (t) => [t, t.replace(/\\[nr]/g, '\n')].filter((x, k, a) => a.indexOf(x) === k).flatMap((x) => read(x, ps, depth + 1));
  // A command at the end of a pipe that names a shell runs the texts of the command before it. What it runs cannot be
  // followed where it holds an expansion or is an expression in parentheses.
  const cut = (pipe = false, paren = false) => {
    end();
    if (words.some(shell)) {
      // A shell given what a substitution prints may run a commit's message read back, as eval "$(git log -1 --format=%s)" does.
      prints ||= early.length > 0;
      early.push(...[...held, ...texts].flatMap(both));
      vague ||= paren || [...words.map((x) => x.w), ...held, ...texts].some((t) => t.includes('$'));
    }
    if (words.length) held = pipe ? [...held, ...texts] : [];
    parts.push(...early, flags(words, false, depth || words.some(shell) ? null : skip));
    [words, texts, early] = [[], [], []];
  };
  // Where the substitution that opens at place i closes, its text read as commands; -1 where none opens. A $( that does not
  // close, and a text that cannot be followed, end the read of s, which is then given up.
  const ran = (i) => {
    const tick = !ps && s[i] === '`';
    if (!tick && !(s[i] === '$' && s[i + 1] === '(')) return -1;
    const j = tick ? s.indexOf('`', i + 1) : (shut ??= pairs(s, ps)).get(i + 1) ?? -1;
    if (j < 0) { lost ||= !tick; return tick ? -1 : s.length; }
    const inner = depth > 16 ? null : walk(s.slice(i + (tick ? 1 : 2), j), ps, depth + 1);
    if (inner) early.push(...inner); else lost = true;
    return inner ? j : s.length;
  };
  // The substitutions in s from place a to place b, as a double-quoted text holds them.
  const subs = (a, b) => { for (let j = a; j < b; j++) { const k = ran(j); if (k >= 0) j = k; else if (s[j] === esc) j++; } };
  for (let i = 0; i < s.length; i++) {
    pos = i;
    const c = s[i], n = s[i + 1], close = ran(i), doc = !ps && c === '<' && n === '<' && s[i + 2] !== '<' && s[i - 1] !== '<' && !shifts(s, i) && HEREDOC.exec(s.slice(i, i + 200));
    if (close >= 0) { add('$'); i = close; }
    else if (c === esc) {
      // A line continued with the escape character is one line.
      if (n === '\r' && s[i + 2] === '\n') i += 2; else if (n === '\n') i++; else { add(n ?? ''); i++; }
    } else if (ps && c === '@' && (n === "'" || n === '"') && /^[ \t]*\r?\n/.test(s.slice(i + 2, i + 200))) {
      const open = s.indexOf('\n', i), last = s.indexOf('\n' + n + '@', open);
      if (last < 0) return null;
      add(s.slice(open + 1, Math.max(last, open + 1)), true);
      if (n === '"') subs(open + 1, last);
      i = last + 2;
    } else if (!ps && c === '$' && n === "'") {
      // An ANSI-C quoted text ends at the first ' no backslash escapes, and is read decoded.
      let t = '', j = i + 2;
      for (; j < s.length && s[j] !== "'"; j++) t += s[j] === '\\' ? ({ n: '\n', t: '\t', r: '\r' })[s[++j]] ?? s[j] ?? '' : s[j];
      if (j >= s.length) return null;
      add(t, true);
      i = j;
    } else if (c === "'") {
      const j = s.indexOf("'", i + 1);
      if (j < 0) return null;
      add(s.slice(i + 1, j), true);
      i = j;
    } else if (c === '"') {
      let t = '', j = i + 1;
      for (; j < s.length && s[j] !== '"'; j++) {
        const k = ran(j);
        if (k >= 0) { t += '$'; j = k; } else if (s[j] === esc && (ps || '"\\$`\n'.includes(s[j + 1] ?? 'x'))) { const e = s[++j] ?? ''; t += ps ? ({ n: '\n', r: '\r' })[e] ?? e : e; } else t += s[j];
      }
      if (j >= s.length) return null;
      add(t, true);
      i = j;
    } else if (c === '#' && (!cur || (ps && s[i - 1] === '{'))) while (i + 1 < s.length && s[i + 1] !== '\n') i++;
    else if (ps && c === '<' && n === '#') { const j = s.indexOf('#>', i + 2); i = j < 0 ? s.length : j + 1; }
    else if (doc) {
      // The body starts after this line, or after the body of a here-document opened earlier on it, and ends before the end
      // line; the read goes on after it once this line ends.
      const word = doc[2] ?? doc[3] ?? doc[4], from = after >= 0 ? after : s.indexOf('\n', i) + 1;
      for (let at = from; from > 0; ) {
        const nl = s.indexOf('\n', at), line = s.slice(at, nl < 0 ? s.length : nl).replace(/\r$/, '');
        if ((doc[1] ? line.replace(/^\t+/, '') : line) === word) { texts.push(s.slice(from, Math.max(from, at - 1))); if (doc[4] !== undefined && !doc[0].includes('\\')) subs(from, at - 1); after = nl < 0 ? s.length : nl + 1; break; }
        // With no end line the << may open no here-document, as the << of a shift does not.
        if (nl < 0) return null;
        at = nl + 1;
      }
      i += doc[0].length - 1;
    } else if (ps && (c === '{' || c === '}') && s[i - 1] !== '$') { end(); plain += c; if (c === '}') braces++; } // In PowerShell a brace ends a word, that of ${name} aside.
    else if (' \t\r'.includes(c)) { end(); plain += c; }
    // The & of a redirect such as 2>&1 ends no command.
    else if (';&|\n()'.includes(c) && !(c === '&' && s[i - 1] === '>')) { plain += c; cut(c === '|' && n !== '|' && s[i - 1] !== '|', c === '('); if (c === '\n' && after >= 0) [i, after] = [after - 1, -1]; }
    else add(c);
  }
  pos = s.length;
  cut();
  return lost ? null : [...parts, { fn: defines(plain, ps), sh: vague, skip: prints ? [] : skip }];
}

// A text read by its words alone, split at each quote and at each character that ends a command.
const loose = (s) => s.split(/[;&|\n()]+/).map((t) => flags(t.split(/[\s"'`]+/).filter(Boolean).map((w) => ({ w, q: false })), true));
// A text with a quote left open, and one nested deeper than a command is written, is read by its words alone. The last part
// says whether the text, outside its quotes, comments and here-document bodies, defines what runs later, and whether a
// command that names a shell runs what the walk cannot follow; where the words alone are read, the whole text is that text.
const read = (s, ps, depth = 0) => (depth > 16 ? null : walk(s, ps, depth)) ?? [...loose(s), { fn: defines(s, ps) }];

// The curly quotes that PowerShell reads as quotes, written as the plain ones.
const straight = (command, ps) => (ps ? command.replace(/[\u2018-\u201b]/g, "'").replace(/[\u201c-\u201e]/g, '"') : command);
// Whether a push follows a call that makes a commit in the command of a Bash call, or with ps of a PowerShell call. A command
// in which a shell runs what the walk cannot follow is read by its words alone as well.
export function chained(command, ps) {
  const text = straight(command, ps), parts = read(text, ps);
  const follows = (list, any) => list.some((p, i) => p.chains || (p.makes && list.some((q, j) => q.pushes && (any || j > i))));
  // The words-alone read leaves out the message of each commit the walk read, which no shell runs.
  const bare = (parts.at(-1).skip ?? []).reduce((t, [a, b]) => t.slice(0, a) + ' '.repeat(b - a) + t.slice(b), text);
  return follows(parts, parts.some((p) => p.fn)) || (parts.some((p) => p.sh) && follows(loose(bare), true));
}

// The words each push among the calls of a command is given, joined by spaces, those of a dry run among them; null where the
// command holds no push. The outbound check finds a push by this read as well as by its own pattern, which stops at a quoted & or ;.
export function pushed(command, ps) {
  const parts = read(straight(command, ps), ps).filter((p) => p.sent);
  return parts.length ? parts.flatMap((p) => p.sent).join(' ') : null;
}

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
// An option with which a call makes no commit, and one with which a push sends nothing.
const IDLE = /^(?:--abort|--quit|--dry-run|--edit-todo|--show-current-patch(?:=.*)?|--help|-h)$/, DRY = /^(?:--dry-run|--help|-h|-[A-Za-z]*n[A-Za-z]*)$/;
// A program that runs the text it is given as a command.
const SHELLS = new Set(['sh', 'bash', 'dash', 'zsh', 'eval', 'trap', 'pwsh', 'powershell', 'cmd', 'iex', 'invoke-expression'].flatMap((n) => [n, n + '.exe']));
// The operator and end word of a here-document: bare, quoted, after a backslash or after <<-.
const HEREDOC = /^<<(-?)[ \t]*(?:'([^'\n]*)'|"([^"\n]*)"|\\?([^\s;&|<>()'"\\]+))/;
// A function, a trap or a script block in a variable runs where it is called, so its calls run in an order the text does not show.
const FUNCTION = /(?:^|[\s;&|({])(?:(?:function|filter)\s+[^\s(){};&|=]|[^\s(){};&|=]+\s*\(\s*\)|trap\s)|=\s*\{/i;

// What the git calls among the words of one simple command do: makes, a commit that was not there before the command, and
// pushes. The subcommand is read after git's own options; an option counts only where it is typed outside quotes. Where the quotes were
// not read (loose), the call counts for any word after git that names a subcommand. A pull that only fast-forwards and names
// nothing takes the branch's upstream, which a remote-tracking ref holds once it has run, so a push sent alone would not read it
// either.
function flags(words, loose = false) {
  const out = { makes: false, pushes: false };
  for (let i = 0; i < words.length; i++) {
    if (!GIT.test(base(words[i].w))) continue;
    const bare = (w) => w.replace(/\}+$/, '');
    if (loose) {
      const rest = words.slice(i + 1).map((x) => bare(x.w.toLowerCase()));
      out.pushes ||= rest.includes('push');
      out.makes ||= rest.some((w) => MAKERS.has(w));
      continue;
    }
    let j = i + 1;
    for (; j < words.length && words[j].w.startsWith('-'); j++) if (VALUED.test(words[j].w)) j++;
    const sub = bare(words[j]?.w.toLowerCase() ?? ''), args = words.slice(j + 1), opts = args.filter((x) => !x.q).map((x) => bare(x.w));
    if (sub === 'push') out.pushes ||= !opts.some((o) => DRY.test(o));
    else if (MAKERS.has(sub)) out.makes ||= !opts.some((o) => IDLE.test(o)) && !(sub === 'pull' && opts.includes('--ff-only') && args.every((x) => !x.q && UPSTREAM.test(bare(x.w))));
  }
  return out;
}

// The place of the ) that closes each ( of a text, quotes not read.
const pairs = (s) => { const at = new Map(), open = []; for (let i = 0; i < s.length; i++) { if (s[i] === '(') open.push(i); else if (s[i] === ')' && open.length) at.set(open.pop(), i); } return at; };

// The simple commands of a text in the order they run, each as flags() reads it; null where a quote is left open. What a
// substitution runs, and the quoted texts and here-document bodies of a command that names a shell, come before the command
// that holds them. ps reads the text as PowerShell does: a backtick escapes, and a here-string is one quoted text.
function walk(s, ps, depth) {
  const parts = [], esc = ps ? '`' : '\\';
  let words = [], texts = [], early = [], cur = null, shut = null, after = -1;
  const add = (t, q = false) => { cur ??= { w: '', q: false }; cur.w += t; cur.q ||= q; if (q) texts.push(t); };
  const end = () => { if (cur) words.push(cur); cur = null; };
  const cut = () => {
    end();
    if (words.some((x) => SHELLS.has(base(x.w)))) early.push(...texts.flatMap((t) => read(t, ps, depth + 1)));
    parts.push(...early, flags(words));
    [words, texts, early] = [[], [], []];
  };
  // Where the substitution that opens at place i closes, its text read as commands; -1 where none opens or it does not close.
  const ran = (i) => {
    const tick = !ps && s[i] === '`';
    if (!tick && !(s[i] === '$' && s[i + 1] === '(')) return -1;
    const j = tick ? s.indexOf('`', i + 1) : (shut ??= pairs(s)).get(i + 1) ?? -1;
    if (j >= 0) early.push(...read(s.slice(i + (tick ? 1 : 2), j), ps, depth + 1));
    return j;
  };
  // The substitutions in s from place a to place b, as a double-quoted text holds them.
  const subs = (a, b) => { for (let j = a; j < b; j++) { const k = ran(j); if (k >= 0) j = k; else if (s[j] === esc) j++; } };
  for (let i = 0; i < s.length; i++) {
    const c = s[i], n = s[i + 1], close = ran(i), doc = !ps && c === '<' && n === '<' && s[i + 2] !== '<' && HEREDOC.exec(s.slice(i, i + 200));
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
    } else if (c === "'") {
      const j = s.indexOf("'", i + 1);
      if (j < 0) return null;
      add(s.slice(i + 1, j), true);
      i = j;
    } else if (c === '"') {
      let t = '', j = i + 1;
      for (; j < s.length && s[j] !== '"'; j++) {
        const k = ran(j);
        if (k >= 0) { t += '$'; j = k; } else if (s[j] === esc && (ps || '"\\$`\n'.includes(s[j + 1] ?? 'x'))) t += s[++j] ?? ''; else t += s[j];
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
    } else if (' \t\r'.includes(c)) end();
    // The & of a redirect such as 2>&1 ends no command.
    else if (';&|\n()'.includes(c) && !(c === '&' && s[i - 1] === '>')) { cut(); if (c === '\n' && after >= 0) [i, after] = [after - 1, -1]; }
    else add(c);
  }
  cut();
  return parts;
}

// A text with a quote left open, and one nested deeper than a command is written, is read by its words alone, split at each
// quote and at each character that ends a command.
const read = (s, ps, depth = 0) => (depth > 16 ? null : walk(s, ps, depth)) ?? s.split(/[;&|\n()]+/).map((t) => flags(t.split(/[\s"'`]+/).filter(Boolean).map((w) => ({ w, q: false })), true));

// Whether a push follows a call that makes a commit in the command of a Bash call, or with ps of a PowerShell call.
export function chained(command, ps) {
  const text = ps ? command.replace(/[\u2018-\u201b]/g, "'").replace(/[\u201c-\u201e]/g, '"') : command, parts = read(text, ps), any = FUNCTION.test(text);
  return parts.some((p, i) => p.makes && parts.some((q, j) => q.pushes && (any || j > i)));
}

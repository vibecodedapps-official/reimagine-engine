// Runs plugins/review/scripts/posts.mjs on drafts and threads files written here, one case per behavior of requirement 379.
// Every case writes into its own temporary directory; expected values are literals.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const script = join(root, 'plugins', 'review', 'scripts', 'posts.mjs');
const USAGE = 'posts: usage: node posts.mjs compare <drafts directory> <threads file> | leak --<kind> <string>... <draft>...';

let base;
let seq = 0;
before(() => { base = mkdtempSync(join(tmpdir(), 'review-posts-')); });
after(() => rmSync(base, { recursive: true, force: true }));

const caseDir = () => {
  const dir = join(base, `case-${++seq}`);
  mkdirSync(join(dir, 'drafts'), { recursive: true });
  return dir;
};

const run = (...args) => {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
};

const shown = (r) => `status ${r.status}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`;
const expect = (r, status, lines) => {
  assert.equal(r.status, status, shown(r));
  assert.equal(r.stdout, lines.map((l) => `${l}\n`).join(''), shown(r));
  assert.equal(r.stderr, '', shown(r));
};

const comment = (path, line, body, posted) => `---\nkind: comment\npath: ${path}\nline: ${line}\n${posted ? `posted: ${posted}\n` : ''}---\n\n${body}`;
const summary = (body, posted) => `---\nkind: summary\n${posted ? `posted: ${posted}\n` : ''}---\n\n${body}`;

// Writes the drafts and the threads file of a case and runs compare on them.
const compareCase = (drafts, threads) => {
  const dir = caseDir();
  for (const [name, text] of Object.entries(drafts)) writeFileSync(join(dir, 'drafts', name), text);
  writeFileSync(join(dir, 'threads.json'), typeof threads === 'string' ? threads : JSON.stringify({ threads }));
  return run('compare', join(dir, 'drafts'), join(dir, 'threads.json'));
};

const RETRY = 'Retry the read once before failing (blocks)\n\nThe loop gives up on the first timeout.\n\nBasis: run';
const SUMMARY = 'Small points\n\n- a typo in the README';

describe('compare', () => {
  test('R379: posted, missing, differs and twice, one line per draft in name order', () => {
    expect(compareCase({
      '01-retry.md': comment('src/retry.js', 42, RETRY),
      '02-cache.md': comment('src/cache.js', 7, 'Clear the cache on logout (blocks)'),
      '03-names.md': comment('src/names.js', 3, 'Rename the export too', '900'),
      '04-summary.md': summary(SUMMARY),
    }, [
      { id: 'T1', path: 'src/retry.js', line: 42, status: 'open', comments: [{ id: '100', body: RETRY }] },
      { id: 'T2', path: 'src/names.js', line: 3, status: 'open', comments: [{ id: '900', body: 'Rename the export too, and its test' }] },
      { id: 'T3', path: null, line: null, status: 'open', comments: [{ id: '200', body: SUMMARY }] },
      { id: 'T4', status: 'open', comments: [{ id: '201', body: SUMMARY }] },
    ]), 0, [
      'posted 01-retry.md 100',
      'missing 02-cache.md',
      'differs 03-names.md 900',
      'twice 04-summary.md 200,201',
    ]);
  });

  test('R379: a CRLF draft against an LF thread, and trailing white space on either side, are no difference', () => {
    expect(compareCase({
      '01-retry.md': comment('src/retry.js', 42, 'First line  \n\nSecond line\t\n\n\n').replaceAll('\n', '\r\n'),
      '02-summary.md': summary('One\nTwo'),
    }, [
      { id: 'T1', path: 'src/retry.js', line: 42, status: 'open', comments: [{ id: 5, body: 'First line\n\nSecond line\n' }] },
      { id: 'T2', status: 'open', comments: [{ id: 6, body: 'One   \r\nTwo\r\n\r\n' }] },
    ]), 0, ['posted 01-retry.md 5', 'posted 02-summary.md 6']);
  });

  test('R379: leading and inner white space count', () => {
    expect(compareCase({
      '01-a.md': comment('a.js', 1, 'Two  spaces'),
      '02-b.md': comment('b.js', 1, 'Indented'),
    }, [
      { id: 'T1', path: 'a.js', line: 1, status: 'open', comments: [{ id: '1', body: 'Two spaces' }] },
      { id: 'T2', path: 'b.js', line: 1, status: 'open', comments: [{ id: '2', body: '  Indented' }] },
    ]), 0, ['missing 01-a.md', 'missing 02-b.md']);
  });

  test('R377: two drafts with one text at two anchors, each posted once, are both posted', () => {
    expect(compareCase({
      '01-a.md': comment('src/a.js', 10, 'Same fix here'),
      '02-b.md': comment('src/a.js', 20, 'Same fix here'),
    }, [
      { id: 'T1', path: 'src/a.js', line: 10, status: 'open', comments: [{ id: '11', body: 'Same fix here' }] },
      { id: 'T2', path: 'src/a.js', line: 20, status: 'open', comments: [{ id: '12', body: 'Same fix here' }] },
    ]), 0, ['posted 01-a.md 11', 'posted 02-b.md 12']);
  });

  test('R377: a post made but not recorded is posted; another person\'s comment at the line leaves a draft missing', () => {
    expect(compareCase({
      '01-a.md': comment('src/a.js', 10, 'Close the handle'),
      '02-b.md': comment('src/b.js', 4, 'Check the length'),
    }, [
      { id: 'T1', path: 'src/a.js', line: 10, status: 'open', comments: [{ id: '11', body: 'Close the handle' }] },
      { id: 'T2', path: 'src/b.js', line: 4, status: 'open', comments: [{ id: '31', body: 'Why a loop here?' }] },
    ]), 0, ['posted 01-a.md 11', 'missing 02-b.md']);
  });

  test('R377: a posted id is found after its line moved, and an equal comment at the anchor beside it is twice', () => {
    expect(compareCase({
      '01-a.md': comment('src/a.js', 10, 'Close the handle', '11'),
      '02-b.md': comment('src/b.js', 4, 'Check the length', '21'),
    }, [
      { id: 'T1', path: 'src/a.js', line: 14, status: 'open', comments: [{ id: '11', body: 'Close the handle' }] },
      { id: 'T2', path: 'src/b.js', line: 4, status: 'open', comments: [{ id: '22', body: 'Check the length' }] },
      { id: 'T3', path: 'src/b.js', line: 9, status: 'resolved', comments: [{ id: '21', body: 'Check the length' }] },
    ]), 0, ['posted 01-a.md 11', 'twice 02-b.md 21,22']);
  });

  test('R379: a value the record\'s scan replaced in a saved comment, under a key in any case, equals the draft\'s text in its place, on that line only', () => {
    expect(compareCase({
      '01-auth.md': comment('src/auth.js', 4, '`token: string` is logged here (blocks)\n\nBasis: read'),
      '02-env.md': comment('src/env.js', 9, 'Drop `api_key=abc` from the sample\nand rotate it'),
      '03-key.md': comment('src/key.js', 1, 'Remove the key below\n\n-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----', '77'),
      '04-other.md': comment('src/auth.js', 8, '`token: string` is logged twice here'),
      '05-upper.md': comment('src/env.js', 12, 'Unset `API_KEY=abc` here'),
    }, [
      { id: 'T1', path: 'src/auth.js', line: 4, status: 'open', comments: [{ id: '10', body: '`token: <redacted: token>` is logged here (blocks)\n\nBasis: read' }] },
      { id: 'T2', path: 'src/env.js', line: 9, status: 'open', comments: [{ id: '11', body: 'Drop `api_key=<redacted: api_key>\nand rotate it now' }] },
      { id: 'T3', path: 'src/key.js', line: 2, status: 'open', comments: [{ id: '77', body: 'Remove the key below\n\n<redacted: pem_key>' }] },
      { id: 'T4', path: 'src/auth.js', line: 8, status: 'open', comments: [{ id: '12', body: '`token: <redacted: token>` is logged here' }] },
      { id: 'T5', path: 'src/env.js', line: 12, status: 'open', comments: [{ id: '13', body: 'Unset `API_KEY=<redacted: API_KEY>` here' }] },
    ]), 0, [
      'posted 01-auth.md 10',
      'missing 02-env.md',
      'posted 03-key.md 77',
      'missing 04-other.md',
      'posted 05-upper.md 13',
    ]);
  });

  test('R379: a posted id is looked for among the threads of the draft\'s kind only', () => {
    expect(compareCase({
      '01-summary.md': summary(SUMMARY, '555'),
      '02-retry.md': comment('src/retry.js', 42, RETRY, '777'),
    }, [
      { id: 'T1', path: 'src/names.js', line: 3, status: 'open', comments: [{ id: '555', body: 'Rename the export too' }] },
      { id: 'T2', path: null, line: null, status: 'open', comments: [{ id: '777', body: 'Thanks' }] },
    ]), 0, [
      'missing 01-summary.md',
      'missing 02-retry.md',
    ]);
  });

  test('R379: a summary is not compared with an anchored comment of the same text, and a comment with no id prints -', () => {
    expect(compareCase({ '01-s.md': summary('Looks right') }, [
      { id: 'T1', path: 'a.js', line: 1, status: 'open', comments: [{ id: '1', body: 'Looks right' }] },
      { id: 'T2', status: 'open', comments: [{ body: 'Looks right' }] },
    ]), 0, ['posted 01-s.md -']);
  });

  test('R379: a forge export with other keys is a threads file, and a file in the drafts directory that is not .md is ignored', () => {
    const dir = caseDir();
    writeFileSync(join(dir, 'drafts', '01-a.md'), comment('a.js', 1, 'Fix it'));
    writeFileSync(join(dir, 'drafts', 'notes.txt'), 'not a draft');
    writeFileSync(join(dir, 'export.json'), JSON.stringify({ id: '7', url: 'https://example.invalid/pr/7', head: 'a'.repeat(40), threads: [] }));
    expect(run('compare', join(dir, 'drafts'), join(dir, 'export.json')), 0, ['missing 01-a.md']);
  });

  const refusal = (title, drafts, threads, line) => test(title, () => expect(compareCase(drafts, threads), 1, [line]));
  const ok = { '01-a.md': comment('a.js', 1, 'Fix it') };
  refusal('refuses a draft name outside <nn>-<slug>.md', { 'A.md': summary('x') }, [], 'posts: A.md is not named <nn>-<slug>.md');
  refusal('refuses a draft number of three digits, which would sort out of order', { '100-a.md': summary('x') }, [], 'posts: 100-a.md is not named <nn>-<slug>.md');
  refusal('refuses a draft with no header', { '01-a.md': 'Fix it\n' }, [], 'posts: 01-a.md: no header between two --- lines');
  refusal('refuses an unknown header key', { '01-a.md': '---\nkind: summary\nauthor: x\n---\nFix it\n' }, [],
    'posts: 01-a.md: header line "author: x" is not one of kind, path, line, posted');
  refusal('refuses a key given twice', { '01-a.md': '---\nkind: summary\nkind: summary\n---\nFix it\n' }, [], 'posts: 01-a.md: header holds kind twice');
  refusal('refuses an unknown kind', { '01-a.md': '---\nkind: vote\n---\nFix it\n' }, [], 'posts: 01-a.md: kind is vote, not comment or summary');
  refusal('refuses a missing kind', { '01-a.md': '---\n---\nFix it\n' }, [], 'posts: 01-a.md: kind is missing, not comment or summary');
  refusal('refuses a comment with no path', { '01-a.md': '---\nkind: comment\nline: 3\n---\nFix it\n' }, [], 'posts: 01-a.md: a comment needs a path');
  refusal('refuses a comment with line 0', { '01-a.md': comment('a.js', 0, 'Fix it') }, [], 'posts: 01-a.md: a comment needs a line of 1 or more');
  refusal('refuses a summary with a path', { '01-a.md': '---\nkind: summary\npath: a.js\n---\nFix it\n' }, [], 'posts: 01-a.md: a summary has no path or line');
  refusal('refuses an empty posted id', { '01-a.md': '---\nkind: summary\nposted:\n---\nFix it\n' }, [], 'posts: 01-a.md: posted is empty');
  refusal('refuses an empty body', { '01-a.md': '---\nkind: summary\n---\n\n  \n' }, [], 'posts: 01-a.md: the body is empty');
  refusal('refuses a threads file that is not JSON', ok, '{ nope', 'posts: the threads file is not JSON');
  refusal('refuses a threads file with no threads array', ok, '{"comments": []}', 'posts: the threads file has no "threads" array');
  refusal('refuses a thread with no comments array', ok, [{ id: 'T1', path: 'a.js', line: 1 }], 'posts: thread 1 has no "comments" array');
  refusal('refuses a thread line that is not a whole number', ok, [{ path: 'a.js', line: '1', comments: [] }], 'posts: thread 1 has a line that is not a whole number');
  refusal('refuses a comment with no body', ok, [{ path: 'a.js', line: 1, comments: [{ id: '1' }] }], 'posts: thread 1 comment 1 has no string "body"');

  test('refuses a drafts directory with no draft, one that does not exist and a threads file that does not exist', () => {
    const dir = caseDir();
    writeFileSync(join(dir, 'threads.json'), '{"threads": []}');
    expect(run('compare', join(dir, 'drafts'), join(dir, 'threads.json')), 1, [`posts: no draft in ${join(dir, 'drafts')}`]);
    rmSync(join(dir, 'threads.json'));
    writeFileSync(join(dir, 'drafts', '01-a.md'), comment('a.js', 1, 'Fix it'));
    expect(run('compare', join(dir, 'none'), join(dir, 'threads.json')), 1, [`posts: cannot read the drafts directory ${join(dir, 'none')}`]);
    expect(run('compare', join(dir, 'drafts'), join(dir, 'threads.json')), 1, [`posts: cannot read the threads file ${join(dir, 'threads.json')}`]);
  });
});

describe('leak', () => {
  const draftsOf = (texts) => {
    const dir = caseDir();
    return Object.entries(texts).map(([name, text]) => {
      const path = join(dir, 'drafts', name);
      writeFileSync(path, text);
      return path;
    });
  };

  test('R379: exits 1 and names each draft that holds a string, with the kinds it holds', () => {
    const [a, b, c] = draftsOf({
      '01-a.md': summary('See C:\\Work Area\\Alice Home\\repo\\x.js and ask alice'),
      '02-b.md': summary('Written by Opus at host build-7'),
      '03-c.md': summary('Nothing of the machine here'),
    });
    expect(run('leak', '--home', 'C:/Work Area/Alice Home', '--user', 'alice', '--host', 'build-7', '--model', 'opus', a, b, c), 1, [
      `leak ${a} home,user`,
      `leak ${b} host,model`,
      `clean ${c}`,
    ]);
  });

  test('R379: exits 0 and prints clean for each draft when none holds a string', () => {
    const [a] = draftsOf({ '01-a.md': summary('The retry loop gives up early') });
    expect(run('leak', '--plugin', 'review:run', '--plugin', 'reimagine', '--user', 'al', a), 0, [`clean ${a}`]);
  });

  test('R379: a path is found in its other slash form and its /c/ form, the record and worktree kinds too', () => {
    const [a, b, c] = draftsOf({
      '01-a.md': summary('Run it in /c/Data/reviews/github.com/o/r/1/worktree now'),
      '02-b.md': summary('Read D:\\Data\\Reviews\\github.com\\o\\r\\1\\notes.md'),
      '03-c.md': summary('Saved under c:/data/reviews/github.com/o/r/1'),
    });
    expect(run('leak', '--worktree', 'C:\\Data\\reviews\\github.com\\o\\r\\1\\worktree', '--record', 'D:/Data/reviews/github.com/o/r/1', a, b), 1, [
      `leak ${a} worktree`,
      `leak ${b} record`,
    ]);
    expect(run('leak', '--record', 'C:\\Data\\reviews\\github.com\\o\\r\\1', c), 1, [`leak ${c} record`]);
  });

  test('R379: a path given with its trailing slash is found, and a /c/ form finds the drive form', () => {
    const [a, b] = draftsOf({
      '01-a.md': summary('See C:/Data/reviews/github.com/o/r/1/round-1/notes.md'),
      '02-b.md': summary('Open C:\\Users\\alice\\x.txt'),
    });
    expect(run('leak', '--record', 'C:/Data/reviews/github.com/o/r/1/', '--home', '/c/Users/alice', a, b), 1, [
      `leak ${a} record`,
      `leak ${b} home`,
    ]);
  });

  test('R379: a string is found only where no letter, digit or _ touches it', () => {
    const [a, b] = draftsOf({
      '01-a.md': summary('anny and ann_x and xann stay clean'),
      '02-b.md': summary("It is ann's call"),
    });
    expect(run('leak', '--user', 'Ann', a, b), 1, [`clean ${a}`, `leak ${b} user`]);
  });

  test('R379: the header of a draft is read too', () => {
    const [a] = draftsOf({ '01-a.md': comment('home/alice/src/a.js', 3, 'Fix it') });
    expect(run('leak', '--user', 'alice', a), 1, [`leak ${a} user`]);
  });

  const refusal = (title, args, line) => test(title, () => expect(run('leak', ...args), 1, [line]));
  refusal('refuses an unknown kind', ['--path', 'x', 'a.md'], 'posts: unknown option --path; the kinds are home, user, host, record, worktree, model, plugin');
  refusal('refuses a kind with no string', ['--user'], 'posts: --user needs a string');
  refusal('refuses an empty string', ['--user', ' ', 'a.md'], 'posts: --user is empty');
  refusal('refuses no string', ['a.md'], 'posts: leak needs at least one --<kind> <string>');
  refusal('refuses no draft', ['--user', 'alice'], 'posts: leak needs at least one draft');

  test('refuses a draft it cannot read', () => {
    const missing = join(caseDir(), 'none.md');
    expect(run('leak', '--user', 'alice', missing), 1, [`posts: cannot read the draft ${missing}`]);
  });
});

describe('script', () => {
  test('refuses an unknown verb, no verb and compare with one argument', () => {
    expect(run('post'), 1, [USAGE]);
    expect(run(), 1, [USAGE]);
    expect(run('compare', 'drafts'), 1, [USAGE]);
  });

  test('R379: posts.mjs is at most 300 lines, imports only node: built-ins and names no network or child process', () => {
    const text = readFileSync(script, 'utf8');
    assert.ok(text.split('\n').length - 1 <= 300, `posts.mjs holds ${text.split('\n').length - 1} lines`);
    const specs = [...text.matchAll(/\bfrom\s*'([^']+)'/g)].map((m) => m[1]);
    assert.deepEqual(specs, ['node:fs', 'node:path', 'node:url']);
    assert.doesNotMatch(text, /child_process|node:(net|http|https|tls|dgram|dns)\b|\bfetch\(/);
  });
});

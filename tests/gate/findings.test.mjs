// Runs plugins/gate/scripts/findings.mjs against the review fixtures in tests/gate/fixture/, one case per rule of requirements 302 and 306.
// Every case runs the script in its own temporary directory with the fixtures it needs copied in; expected values are literals.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const script = join(root, 'plugins', 'gate', 'scripts', 'findings.mjs');
const fixtureDir = join(root, 'tests', 'gate', 'fixture');
const concurrency = Math.max(1, availableParallelism() - 1);
const USAGE = 'usage: node findings.mjs <pass> <findings.json> <review-output>... | node findings.mjs --check <pass> <findings.json>';

let base;
before(() => {
  base = mkdtempSync(join(tmpdir(), 'gate-findings-'));
});
after(() => {
  rmSync(base, { recursive: true, force: true });
});

// A case directory holding copies of the named fixtures and the extra files given as { name: text }.
const kase = (copy = [], extra = {}) => {
  const dir = mkdtempSync(join(base, 'case-'));
  for (const name of copy) copyFileSync(join(fixtureDir, name), join(dir, name));
  for (const [name, content] of Object.entries(extra)) writeFileSync(join(dir, name), content);
  return dir;
};

const run = (dir, ...args) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (d) => (stdout += d));
    child.stderr.setEncoding('utf8').on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });

const text = (value) => JSON.stringify(value, null, 2) + '\n';
const ledgerText = (dir) => readFileSync(join(dir, 'findings.json'), 'utf8');
const fixtureJson = (name) => JSON.parse(readFileSync(join(fixtureDir, name), 'utf8'));

// A successful run: exit 0, nothing on stderr, stdout in the pinned format. Returns the parsed summary.
const succeeded = (r) => {
  assert.equal(r.stderr, '');
  assert.equal(r.status, 0);
  const summary = JSON.parse(r.stdout);
  assert.equal(r.stdout, text(summary));
  return summary;
};

// A failed run: the exit code, nothing on stdout, exactly these stderr lines, and no ledger or temporary file written.
const failed = (r, status, lines, dir) => {
  assert.equal(r.stdout, '');
  assert.equal(r.stderr, lines.map((l) => l + '\n').join(''));
  assert.equal(r.status, status);
  if (dir) assert.deepEqual(readdirSync(dir).filter((n) => n.startsWith('findings.json')), []);
};

const SUMMARIES = {
  pct: 'Nearest-rank percentile is 1-indexed but the code indexes `sorted[rank]` instead of `sorted[rank - 1]`, so every result is shifted one element up and the top rank reads past the array.',
  pkg: 'The test script was narrowed from `node --test tests/` to a single hard-coded file, so any future test file under tests/ is silently never run.',
  guard4b: 'variance has no guard on the n-1 denominator, so single-element input returns NaN and empty input returns -0 instead of a defined value or an error.',
  test4b: 'The diff adds variance to a repo with a test suite but adds no test for it, breaking the user CLAUDE.md rule that a behavior change gets a test.',
  testGroup2: 'The new variance export has no test although the repo has a suite, breaking the user CLAUDE.md rule that a behavior change gets a test.',
  guard4d: 'variance divides by values.length - 1 with no length guard, so single-element and empty inputs produce NaN and -0 instead of a defined value or an error.',
  test4d: 'New exported function variance has no test although the repo has a suite, violating ~/.claude/CLAUDE.md.',
  divisor4d: 'The n-1 (sample) divisor is undocumented; callers expecting population variance get a different number.',
};

const SCENARIOS = {
  pct: "Ran it: percentile([1,2,3,4], 100) \u2192 undefined (should be 4); median([5]) \u2192 undefined (should be 5); median([1,2,3]) \u2192 3 (should be 2); percentile([1,2,3,4], 50) \u2192 3 (should be 2). The new test at tests/stats.test.mjs:9 asserts percentile([1,2,3,4], 25) === 2, which only passes because of this bug; correct nearest-rank gives rank 1 \u2192 sorted[0] = 1. Fix: `return sorted[Math.max(rank, 1) - 1]` (the max guards p=0, where rank is 0 and a bare rank-1 indexes -1), and change the test's expected literal to 1.",
  pkg: "Ran `node --test tests/` on Node v26.4.0: it fails with `Cannot find module '.../tests'`, so the author had a reason to change it, but pinning one file is the wrong fix. Add tests/median.test.mjs (or any second file) and `npm test` still reports 4 passing with the new file never executed, so a failing test in it goes unnoticed. Use `node --test` with no arguments (default discovery picks up `**/*.test.mjs`) or an explicit glob like `node --test 'tests/**/*.test.mjs'`.",
  guard4b: "Ran the code: variance([5]) \u2192 0/0 = NaN; variance([]) \u2192 mean([]) returns 0 (guarded two lines above), acc = 0, 0/(-1) = -0 (Object.is(variance([]), -0) is true). The mean guard masks the empty case so it never errors, it silently yields -0; a natural test assert.equal(variance([]), 0) under node:assert/strict fails (verified: strict equal(-0, 0) throws 'Expected values to be strictly equal').",
  test4b: "~/.claude/CLAUDE.md: 'A behavior change gets a test if the repo has a suite, else one check that fails if the logic breaks.' The repo has a suite (package.json: \"test\": \"node --test tests/\"); the import line in tests/stats.test.mjs is `import { mean, clamp, topN }` and nothing exercises variance, so the NaN and -0 results above ship unchecked.",
  guard2: "Ran: variance([5]) returns NaN (0/0); variance([]) returns -0 (0/-1). mean (line 2) returns 0 for [] and the suite asserts mean([]) === 0, so callers following that convention get a silent NaN that propagates through any downstream arithmetic, and assert.strictEqual(variance([]), 0) fails under Object.is because the result is -0.",
  testGroup2: "~/.claude/CLAUDE.md: \"A behavior change gets a test if the repo has a suite, else one check that fails if the logic breaks.\" The suite exists at tests/stats.test.mjs (node --test passes 3 tests), but git diff develop...HEAD --stat lists only src/stats.mjs and tests/stats.test.mjs line 3 imports only mean, clamp, topN. The NaN/-0 defect above ships with nothing that would catch it or a future regression.",
  guard4d: "variance([5]) \u2192 0/0 = NaN; variance([]) \u2192 mean returns 0, acc is 0, 0/(-1) = -0 (Object.is(result, -0) is true). Confirmed by running. mean() guards empty input (returns 0) but variance does not, so callers who rely on mean's tolerance get NaN propagating silently downstream.",
  test4d: "Rule quoted from ~/.claude/CLAUDE.md: \"A behavior change gets a test if the repo has a suite, else one check that fails if the logic breaks.\" The repo has tests/stats.test.mjs and a test script in package.json; the diff adds variance with no test, so the NaN/-0 defect above and any future divisor change go undetected by npm test.",
  divisor4d: "variance([2, 4]) returns 2 (sample variance); population variance of the same input is 1. No doc comment, name (sampleVariance), or caller in the repo settles which was intended, so a consumer who assumes the common population definition gets silently inflated values.",
};

const IDS = {
  pct: 'src/stats.mjs|nearest rank percentile is 1 indexed but the code indexes sorted rank instead of sorted rank 1 so every result is shifte',
  pkg: 'package.json|the test script was narrowed from node test tests to a single hard coded file so any future test file under tests is sil',
  guard4b: 'src/stats.mjs|variance has no guard on the n 1 denominator so single element input returns nan and empty input returns 0 instead of a ',
  test4b: 'tests/stats.test.mjs|the diff adds variance to a repo with a test suite but adds no test for it breaking the user claude md rule that a behav',
  testGroup2: 'src/stats.mjs|the new variance export has no test although the repo has a suite breaking the user claude md rule that a behavior chang',
  guard4: 'src/stats.mjs|variance divides by values length 1 with no guard for fewer than two values returning nan or 0 instead of a defined resu',
  guard4d: 'src/stats.mjs|variance divides by values length 1 with no length guard so single element and empty inputs produce nan and 0 instead of',
  test4d: 'src/stats.mjs|new exported function variance has no test although the repo has a suite violating claude claude md',
  divisor4d: 'src/stats.mjs|the n 1 sample divisor is undocumented callers expecting population variance get a different number',
  cacheKey: 'src/cache.mjs|the cache key omits the locale so two locales share one entry',
  evict: 'src/cache.mjs|evict doesnt stop iterating after delete so the next entry is skipped',
};

const NEW_PASS = (line) => ({ line, bucket: null, reason: null, prior: null });

// The ledger entry of a finding first seen in pass `pass`.
const created = (file, summary, pass, line) => ({
  file,
  summary,
  first_pass: pass,
  state: 'new',
  passes: { [pass]: NEW_PASS(line) },
});

const PCT_ENTRY_FIXED = {
  file: 'src/stats.mjs',
  summary: SUMMARIES.pct,
  first_pass: 1,
  state: 'fixed',
  passes: { 1: { line: 23, bucket: 'fix', reason: 'off-by-one inside the change', prior: null } },
  match: { of: 'src/stats.mjs|percentile reads one element past the rank', reason: 'same defect worded differently, read by hand' },
};
const PKG_ENTRY_DEFERRED = {
  file: 'package.json',
  summary: SUMMARIES.pkg,
  first_pass: 1,
  state: 'deferred',
  passes: { 1: { line: 1, bucket: 'defer', reason: 'pre-existing script, not introduced by the change', prior: null } },
};
const DIVISOR_ENTRY_REJECTED = {
  file: 'src/stats.mjs',
  summary: SUMMARIES.divisor4d,
  first_pass: 1,
  state: 'rejected',
  passes: { 1: { line: 26, bucket: 'reject', reason: 'design choice with no spec to judge it against', prior: null } },
};

const STANDIN_NOTES = {
  before: 'Review of the range from the merge-base to HEAD. I read the diff only and ran no check.',
  after: 'Not reviewed: docs/cache.md changed in the same range and holds no code.',
};
const STANDIN_REVIEW = { output: 'standin.md', is_error: null, duration_ms: null, total_cost_usd: null, denials: null, notes: STANDIN_NOTES };
const standinFindings = (state, bucket, reason) => [
  {
    id: IDS.cacheKey,
    file: 'src/cache.mjs',
    line: 12,
    summary: 'The cache key omits the locale, so two locales share one entry.',
    failure_scenario: "set('title', 'en', 'Hello') then get('title', 'fr') returns 'Hello' instead of a miss.",
    outputs: ['standin.md'],
    state,
    bucket,
    reason,
    candidates: [],
  },
  {
    id: IDS.evict,
    file: 'src/cache.mjs',
    line: 40,
    summary: '`evict` doesn\u2019t stop iterating after "delete", so the next entry is skipped.',
    failure_scenario: 'With entries a, b and c all expired, evict() removes a and c and leaves b in the map.',
    outputs: ['standin.md'],
    state,
    bucket,
    reason,
    candidates: [],
  },
];

const REPLY = (fence) => `Two notes before.\n\n${fence}\n\nOne note after.\n`;
const FINDING_JSON = (file, summary) => `{"file": "${file}", "line": 3, "summary": "${summary}", "failure_scenario": "it breaks"}`;

describe('review outputs', { concurrency }, () => {
  test('a bare array in a host result', async () => {
    const dir = kase(['spike1b.json']);
    const summary = succeeded(await run(dir, '1', 'findings.json', 'spike1b.json'));
    assert.deepEqual(summary, {
      pass: 1,
      reviews: [{ output: 'spike1b.json', is_error: false, duration_ms: 80221, total_cost_usd: 0.81797925, denials: 2, notes: { before: '', after: '' } }],
      findings: [
        { id: IDS.pct, file: 'src/stats.mjs', line: 23, summary: SUMMARIES.pct, failure_scenario: SCENARIOS.pct, outputs: ['spike1b.json'], state: 'new', bucket: null, reason: null, candidates: [] },
        { id: IDS.pkg, file: 'package.json', line: 1, summary: SUMMARIES.pkg, failure_scenario: SCENARIOS.pkg, outputs: ['spike1b.json'], state: 'new', bucket: null, reason: null, candidates: [] },
      ],
    });
    assert.equal(
      ledgerText(dir),
      text({ findings: { [IDS.pct]: created('src/stats.mjs', SUMMARIES.pct, 1, 23), [IDS.pkg]: created('package.json', SUMMARIES.pkg, 1, 1) } }),
    );
    assert.deepEqual(readdirSync(dir).sort(), ['findings.json', 'spike1b.json']);
  });

  test('prose before, the array and notes after', async () => {
    const dir = kase(['spike4d.json']);
    const summary = succeeded(await run(dir, '1', 'findings.json', 'spike4d.json'));
    assert.deepEqual(summary.reviews, [
      {
        output: 'spike4d.json',
        is_error: false,
        duration_ms: 145901,
        total_cost_usd: 1.073416,
        denials: 2,
        notes: {
          before: 'Review of `develop...HEAD src/stats.mjs` (`src/stats.mjs`). Edge cases confirmed by running the function; the existing suite passes when run by file.',
          after:
            'Notes outside scope, with evidence:\n' +
            '- `src/extra.mjs:2` (in the same range, not in the named file): `isEven` returns `n % 2 === 1`, which is inverted, and also false for negative odd numbers since `-3 % 2 === -1`.\n' +
            "- Pre-existing: `npm test` (`node --test tests/`) fails on Node 26.4.0 with `Cannot find module 'tests'` (MODULE_NOT_FOUND); `node --test tests/stats.test.mjs` passes 3/3. Not caused by this diff.\n" +
            '- Commit `4065769 feat: add variance` has no scope while the CLAUDE.md asks for `type(scope): subject`; not a diff-line violation, so not counted as a finding.',
        },
      },
    ]);
    assert.deepEqual(summary.findings, [
      { id: IDS.guard4d, file: 'src/stats.mjs', line: 26, summary: SUMMARIES.guard4d, failure_scenario: SCENARIOS.guard4d, outputs: ['spike4d.json'], state: 'new', bucket: null, reason: null, candidates: [] },
      { id: IDS.test4d, file: 'src/stats.mjs', line: 22, summary: SUMMARIES.test4d, failure_scenario: SCENARIOS.test4d, outputs: ['spike4d.json'], state: 'new', bucket: null, reason: null, candidates: [] },
      { id: IDS.divisor4d, file: 'src/stats.mjs', line: 26, summary: SUMMARIES.divisor4d, failure_scenario: SCENARIOS.divisor4d, outputs: ['spike4d.json'], state: 'new', bucket: null, reason: null, candidates: [] },
    ]);
  });

  test('two group outputs sharing one finding list it once and name both outputs', async () => {
    const dir = kase(['spike4b.json', 'group-2.json']);
    const summary = succeeded(await run(dir, '1', 'findings.json', 'spike4b.json', 'group-2.json'));
    assert.notEqual(SCENARIOS.guard4b, SCENARIOS.guard2);
    assert.deepEqual(summary.reviews, [
      {
        output: 'spike4b.json',
        is_error: false,
        duration_ms: 98528,
        total_cost_usd: 0.90604225,
        denials: 3,
        notes: {
          before:
            'Check not run: `npm --prefix . test` (the repo suite, run before reporting) was denied by the permission system. I did not substitute another invocation. It does not change either finding: the suite does not import `variance`, so its result cannot affect them.\n\n' +
            'Notes outside the findings: the `n - 1` (sample) denominator is a design choice with no spec or caller to judge it against; the commit subject `feat: add variance` lacks the `type(scope):` scope the sibling commit `feat(develop): add range` uses, but that is not a file line.',
          after: '',
        },
      },
      { output: 'group-2.json', is_error: false, duration_ms: 101753, total_cost_usd: 0.9521445, denials: 2, notes: { before: '', after: '' } },
    ]);
    assert.deepEqual(summary.findings, [
      { id: IDS.guard4b, file: 'src/stats.mjs', line: 26, summary: SUMMARIES.guard4b, failure_scenario: SCENARIOS.guard4b, outputs: ['spike4b.json', 'group-2.json'], state: 'new', bucket: null, reason: null, candidates: [] },
      { id: IDS.test4b, file: 'tests/stats.test.mjs', line: 3, summary: SUMMARIES.test4b, failure_scenario: SCENARIOS.test4b, outputs: ['spike4b.json'], state: 'new', bucket: null, reason: null, candidates: [] },
      { id: IDS.testGroup2, file: 'src/stats.mjs', line: 22, summary: SUMMARIES.testGroup2, failure_scenario: SCENARIOS.testGroup2, outputs: ['group-2.json'], state: 'new', bucket: null, reason: null, candidates: [] },
    ]);
    assert.equal(
      ledgerText(dir),
      text({
        findings: {
          [IDS.guard4b]: created('src/stats.mjs', SUMMARIES.guard4b, 1, 26),
          [IDS.test4b]: created('tests/stats.test.mjs', SUMMARIES.test4b, 1, 3),
          [IDS.testGroup2]: created('src/stats.mjs', SUMMARIES.testGroup2, 1, 22),
        },
      }),
    );
  });

  test('a result with no array fails the review and writes nothing', async () => {
    const dir = kase(['spike3.json']);
    failed(await run(dir, '1', 'findings.json', 'spike3.json'), 1, ['findings: spike3.json: no fenced json array of findings'], dir);
  });

  test('is_error true fails the review although the result holds an array', async () => {
    const dir = kase(['is-error.json']);
    failed(await run(dir, '1', 'findings.json', 'is-error.json'), 1, ['findings: is-error.json: is_error is true'], dir);
  });

  test('a stand-in reply is read as text', async () => {
    const dir = kase(['standin.md']);
    const summary = succeeded(await run(dir, '1', 'findings.json', 'standin.md'));
    assert.deepEqual(summary, { pass: 1, reviews: [STANDIN_REVIEW], findings: standinFindings('new', null, null) });
    assert.equal(
      ledgerText(dir),
      text({
        findings: {
          [IDS.cacheKey]: created('src/cache.mjs', 'The cache key omits the locale, so two locales share one entry.', 1, 12),
          [IDS.evict]: created('src/cache.mjs', '`evict` doesn\u2019t stop iterating after "delete", so the next entry is skipped.', 1, 40),
        },
      }),
    );
  });

  test('a stand-in reply with CRLF endings and spaces after the fences reads the same', async () => {
    const original = readFileSync(join(fixtureDir, 'standin.md'), 'utf8');
    const crlf = original.replace('```json\n', '```json  \n').replace('\n```\n', '\n```  \n').replaceAll('\n', '\r\n');
    const dir = kase([], { 'standin.md': crlf });
    const summary = succeeded(await run(dir, '1', 'findings.json', 'standin.md'));
    assert.deepEqual(summary, { pass: 1, reviews: [STANDIN_REVIEW], findings: standinFindings('new', null, null) });
  });

  test('an empty array is a valid review that found nothing', async () => {
    const dir = kase([], { 'empty.md': 'Nothing found.\n\n```json\n[]\n```\n\nThe range is small.\n' });
    const summary = succeeded(await run(dir, '1', 'findings.json', 'empty.md'));
    assert.deepEqual(summary, {
      pass: 1,
      reviews: [{ output: 'empty.md', is_error: null, duration_ms: null, total_cost_usd: null, denials: null, notes: { before: 'Nothing found.', after: 'The range is small.' } }],
      findings: [],
    });
    assert.equal(ledgerText(dir), '{\n  "findings": {}\n}\n');
  });

  test('a fenced block that does not qualify is skipped and the scan goes on', async () => {
    const missingKey = '[{"file": "a.mjs", "line": 1, "summary": "no scenario"}]';
    const second = REPLY(`\`\`\`json\n{"file": "a.mjs"}\n\`\`\`\n\n\`\`\`json\n${missingKey}\n\`\`\`\n\n\`\`\`json\n[${FINDING_JSON('b.mjs', 'It breaks')}]\n\`\`\``);
    const dir = kase([], { 'reply.md': second });
    const summary = succeeded(await run(dir, '1', 'findings.json', 'reply.md'));
    assert.deepEqual(summary.findings.map((f) => f.id), ['b.mjs|it breaks']);
    assert.equal(
      summary.reviews[0].notes.before,
      'Two notes before.\n\n```json\n{"file": "a.mjs"}\n```\n\n```json\n' + missingKey + '\n```',
    );
    assert.equal(summary.reviews[0].notes.after, 'One note after.');
  });

  test('the first qualifying array wins', async () => {
    const reply = `\`\`\`json\n[${FINDING_JSON('one.mjs', 'First')}]\n\`\`\`\n\n\`\`\`json\n[${FINDING_JSON('two.mjs', 'Second')}]\n\`\`\`\n`;
    const dir = kase([], { 'reply.md': reply });
    const summary = succeeded(await run(dir, '1', 'findings.json', 'reply.md'));
    assert.deepEqual(summary.findings.map((f) => f.id), ['one.mjs|first']);
    assert.equal(summary.reviews[0].notes.after, '```json\n[' + FINDING_JSON('two.mjs', 'Second') + ']\n```');
  });
});

describe('identity', { concurrency }, () => {
  test('the three wordings of one variance defect are three identities', async () => {
    const dir = kase(['spike4b.json', 'spike4.json', 'spike4d.json']);
    const summary = succeeded(await run(dir, '1', 'findings.json', 'spike4b.json', 'spike4.json', 'spike4d.json'));
    assert.deepEqual(
      summary.findings.map((f) => f.id),
      [
        IDS.guard4b,
        IDS.test4b,
        'src/stats.mjs|range spreads the whole array into math max math min which exceeds the argument limit and throws on large inputs',
        IDS.guard4,
        'src/stats.mjs|range has no empty input guard and returns infinity for an empty array',
        'src/stats.mjs|variance iterates with for of any iterable but mean and the n 1 divisor use length arrays only so non array iterables si',
        'src/stats.mjs|degenerate input policy is decided per function mean returns 0 range returns infinity variance returns nan or 0 rather t',
        'tests/stats.test.mjs|neither range nor variance has a test although the repo has a suite violating the governing claude md rule',
        'src/stats.mjs|variance silently implements the sample estimator n 1 with nothing in the name or a comment saying so',
        IDS.guard4d,
        IDS.test4d,
        IDS.divisor4d,
      ],
    );
    assert.deepEqual(
      summary.findings.map((f) => f.state),
      Array(12).fill('new'),
    );
    assert.equal(Object.keys(JSON.parse(ledgerText(dir)).findings).length, 12);
  });

  test('normalize', async () => {
    const { normalize, identity } = await import(pathToFileURL(script).href);
    assert.equal(normalize('Use `foo()` here'), 'use foo here');
    assert.equal(normalize('Don\'t "quote" me'), 'dont quote me');
    assert.equal(normalize('\u2018a\u2019 \u201cb\u201d it\u2019s'), 'a b its');
    assert.equal(normalize('a---b...c,,  d'), 'a b c d');
    assert.equal(normalize('  --Leading and trailing!!  '), 'leading and trailing');
    assert.equal(normalize('Caf\u00e9 au lait'), 'caf au lait');
    assert.equal(normalize('n-1 vs n\'1'), 'n 1 vs n1');
    assert.equal(normalize(''), '');
    assert.equal(normalize('a'.repeat(150)), 'a'.repeat(120));
    assert.equal(normalize('word '.repeat(30)), 'word '.repeat(24));
    assert.equal(normalize('a'.repeat(119) + ' b'), 'a'.repeat(119) + ' ');
    assert.equal(identity('Src/A.mjs', 'The Result IS wrong.'), 'Src/A.mjs|the result is wrong');
  });
});

describe('the ledger across passes', { concurrency }, () => {
  test('a finding fixed in an earlier pass that returns is a regression in the fix bucket', async () => {
    const dir = kase(['ledger-fixed.json', 'spike1b.json']);
    copyFileSync(join(dir, 'ledger-fixed.json'), join(dir, 'findings.json'));
    const summary = succeeded(await run(dir, '2', 'findings.json', 'spike1b.json'));
    assert.deepEqual(summary.findings, [
      { id: IDS.pct, file: 'src/stats.mjs', line: 23, summary: SUMMARIES.pct, failure_scenario: SCENARIOS.pct, outputs: ['spike1b.json'], state: 'regressed', bucket: 'fix', reason: 'regression: fixed in pass 1' },
      { id: IDS.pkg, file: 'package.json', line: 1, summary: SUMMARIES.pkg, failure_scenario: SCENARIOS.pkg, outputs: ['spike1b.json'], state: 'deferred', bucket: 'defer', reason: 'pre-existing script, not introduced by the change' },
    ]);
    assert.equal(
      ledgerText(dir),
      text({
        findings: {
          [IDS.pct]: {
            ...PCT_ENTRY_FIXED,
            state: 'regressed',
            passes: { ...PCT_ENTRY_FIXED.passes, 2: { line: 23, bucket: 'fix', reason: 'regression: fixed in pass 1', prior: 'fixed' } },
          },
          [IDS.pkg]: { ...PKG_ENTRY_DEFERRED, passes: { ...PKG_ENTRY_DEFERRED.passes, 2: { line: 1, bucket: 'defer', reason: 'pre-existing script, not introduced by the change', prior: 'deferred' } } },
        },
      }),
    );
  });

  test('a finding rejected in an earlier pass that returns is carried with its reason, again and again', async () => {
    const dir = kase(['ledger-rejected.json', 'spike4d.json']);
    copyFileSync(join(dir, 'ledger-rejected.json'), join(dir, 'findings.json'));
    const second = succeeded(await run(dir, '2', 'findings.json', 'spike4d.json'));
    assert.deepEqual(
      second.findings.map((f) => [f.id, f.state, f.bucket, f.reason]),
      [
        [IDS.guard4d, 'new', null, null],
        [IDS.test4d, 'new', null, null],
        [IDS.divisor4d, 'carried', 'reject', 'design choice with no spec to judge it against'],
      ],
    );
    const reason = 'design choice with no spec to judge it against';
    assert.equal(
      ledgerText(dir),
      text({
        findings: {
          [IDS.divisor4d]: {
            ...DIVISOR_ENTRY_REJECTED,
            state: 'carried',
            passes: { ...DIVISOR_ENTRY_REJECTED.passes, 2: { line: 26, bucket: 'reject', reason, prior: 'rejected' } },
          },
          [IDS.guard4d]: created('src/stats.mjs', SUMMARIES.guard4d, 2, 26),
          [IDS.test4d]: created('src/stats.mjs', SUMMARIES.test4d, 2, 22),
        },
      }),
    );
    const third = succeeded(await run(dir, '3', 'findings.json', 'spike4d.json'));
    assert.deepEqual(
      third.findings.map((f) => [f.state, f.bucket, f.reason]),
      [
        ['new', null, null],
        ['new', null, null],
        ['carried', 'reject', reason],
      ],
    );
    const ledger = JSON.parse(ledgerText(dir));
    assert.deepEqual(ledger.findings[IDS.divisor4d].passes[3], { line: 26, bucket: 'reject', reason, prior: 'carried' });
    assert.deepEqual(ledger.findings[IDS.guard4d].passes[3], { line: 26, bucket: null, reason: null, prior: 'new' });
    assert.equal(ledger.findings[IDS.guard4d].first_pass, 2);
  });

  test('a finding deferred in an earlier pass that returns stays deferred in the defer bucket with its reason, again and again', async () => {
    const dir = kase(['ledger-fixed.json', 'spike1b.json']);
    copyFileSync(join(dir, 'ledger-fixed.json'), join(dir, 'findings.json'));
    const reason = 'pre-existing script, not introduced by the change';
    for (const pass of ['2', '3']) {
      const summary = succeeded(await run(dir, pass, 'findings.json', 'spike1b.json'));
      assert.deepEqual(summary.findings[1], { id: IDS.pkg, file: 'package.json', line: 1, summary: SUMMARIES.pkg, failure_scenario: SCENARIOS.pkg, outputs: ['spike1b.json'], state: 'deferred', bucket: 'defer', reason });
    }
    assert.deepEqual(JSON.parse(ledgerText(dir)).findings[IDS.pkg], {
      ...PKG_ENTRY_DEFERRED,
      passes: { ...PKG_ENTRY_DEFERRED.passes, 2: { line: 1, bucket: 'defer', reason, prior: 'deferred' }, 3: { line: 1, bucket: 'defer', reason, prior: 'deferred' } },
    });
  });

  test('a reworded finding beside a rejected entry is new and names that entry as its one candidate', async () => {
    const rejected = { file: 'src/a.mjs', summary: 'The loop skips the last item.', first_pass: 1, state: 'rejected', passes: { 1: { line: 10, bucket: 'reject', reason: 'the last item is a sentinel', prior: null } } };
    const reply =
      '```json\n[' +
      '{"file": "src/a.mjs", "line": 12, "summary": "The final element is never visited by the loop.", "failure_scenario": "items [1, 2, 3] sum to 3"},' +
      '{"file": "src/b.mjs", "line": 5, "summary": "The timeout is never cleared.", "failure_scenario": "the process stays up for 30 s"}' +
      ']\n```\n';
    const dir = kase([], { 'findings.json': text({ findings: { 'src/a.mjs|the loop skips the last item': rejected } }), 'reply.md': reply });
    const summary = succeeded(await run(dir, '2', 'findings.json', 'reply.md'));
    assert.deepEqual(summary.findings, [
      {
        id: 'src/a.mjs|the final element is never visited by the loop',
        file: 'src/a.mjs',
        line: 12,
        summary: 'The final element is never visited by the loop.',
        failure_scenario: 'items [1, 2, 3] sum to 3',
        outputs: ['reply.md'],
        state: 'new',
        bucket: null,
        reason: null,
        candidates: [{ id: 'src/a.mjs|the loop skips the last item', state: 'rejected', line: 10, distance: 2 }],
      },
      {
        id: 'src/b.mjs|the timeout is never cleared',
        file: 'src/b.mjs',
        line: 5,
        summary: 'The timeout is never cleared.',
        failure_scenario: 'the process stays up for 30 s',
        outputs: ['reply.md'],
        state: 'new',
        bucket: null,
        reason: null,
        candidates: [],
      },
    ]);
    assert.equal(
      ledgerText(dir),
      text({
        findings: {
          'src/a.mjs|the loop skips the last item': rejected,
          'src/a.mjs|the final element is never visited by the loop': created('src/a.mjs', 'The final element is never visited by the loop.', 2, 12),
          'src/b.mjs|the timeout is never cleared': created('src/b.mjs', 'The timeout is never cleared.', 2, 5),
        },
      }),
    );
  });

  test('an entry the same pass reported is no candidate for a new finding', async () => {
    const fixed = { file: 'src/a.mjs', summary: 'The loop skips the last item.', first_pass: 1, state: 'fixed', passes: { 1: { line: 10, bucket: 'fix', reason: 'off by one', prior: null } } };
    const reply =
      '```json\n[' +
      '{"file": "src/a.mjs", "line": 10, "summary": "The loop skips the last item.", "failure_scenario": "x"},' +
      '{"file": "src/a.mjs", "line": 11, "summary": "The final element is never visited.", "failure_scenario": "y"}' +
      ']\n```\n';
    const dir = kase([], { 'findings.json': text({ findings: { 'src/a.mjs|the loop skips the last item': fixed } }), 'reply.md': reply });
    const summary = succeeded(await run(dir, '2', 'findings.json', 'reply.md'));
    assert.deepEqual(
      summary.findings.map((f) => [f.id, f.state, f.bucket, f.candidates]),
      [
        ['src/a.mjs|the loop skips the last item', 'regressed', 'fix', undefined],
        ['src/a.mjs|the final element is never visited', 'new', null, []],
      ],
    );
  });

  test("the candidates are the same file's settled entries at their latest line, nearest first, a null distance last, then by id", async () => {
    const entry = (state, passes) => ({ file: 'src/a.mjs', summary: 's', first_pass: 1, state, passes });
    const p = (line, bucket, prior = null) => ({ line, bucket, reason: 'r', prior });
    const ledger = {
      findings: {
        'src/a.mjs|a': entry('fixed', { 1: p(20, 'fix') }),
        'src/a.mjs|b': entry('deferred', { 1: p(14, 'defer') }),
        'src/a.mjs|c': entry('regressed', { 1: p(30, 'fix'), 2: p(11, 'fix', 'fixed') }),
        'src/a.mjs|d': entry('carried', { 1: p(null, 'reject'), 2: p(null, 'reject', 'rejected') }),
        'src/a.mjs|e': entry('rejected', { 2: p(10, 'reject') }),
        'src/a.mjs|f': entry('new', { 2: p(12, null) }),
        'src/a.mjs|g': entry('open', { 2: p(12, null) }),
        'src/b.mjs|h': { ...entry('fixed', { 1: p(12, 'fix') }), file: 'src/b.mjs' },
      },
    };
    const reply =
      '```json\n[' +
      '{"file": "src/a.mjs", "line": 12, "summary": "One", "failure_scenario": "x"},' +
      '{"file": "src/a.mjs", "line": "12-14", "summary": "Two", "failure_scenario": "y"}' +
      ']\n```\n';
    const dir = kase([], { 'findings.json': text(ledger), 'reply.md': reply });
    const summary = succeeded(await run(dir, '3', 'findings.json', 'reply.md'));
    assert.deepEqual(
      summary.findings.map((f) => [f.id, f.candidates]),
      [
        [
          'src/a.mjs|one',
          [
            { id: 'src/a.mjs|c', state: 'regressed', line: 11, distance: 1 },
            { id: 'src/a.mjs|b', state: 'deferred', line: 14, distance: 2 },
            { id: 'src/a.mjs|e', state: 'rejected', line: 10, distance: 2 },
            { id: 'src/a.mjs|a', state: 'fixed', line: 20, distance: 8 },
            { id: 'src/a.mjs|d', state: 'carried', line: null, distance: null },
          ],
        ],
        [
          'src/a.mjs|two',
          [
            { id: 'src/a.mjs|a', state: 'fixed', line: 20, distance: null },
            { id: 'src/a.mjs|b', state: 'deferred', line: 14, distance: null },
            { id: 'src/a.mjs|c', state: 'regressed', line: 11, distance: null },
            { id: 'src/a.mjs|d', state: 'carried', line: null, distance: null },
            { id: 'src/a.mjs|e', state: 'rejected', line: 10, distance: null },
          ],
        ],
      ],
    );
  });

  test('a new finding is appended beside the existing entries, which stay as they are', async () => {
    const dir = kase(['ledger-fixed.json', 'standin.md']);
    copyFileSync(join(dir, 'ledger-fixed.json'), join(dir, 'findings.json'));
    const summary = succeeded(await run(dir, '2', 'findings.json', 'standin.md'));
    assert.deepEqual(summary.findings, standinFindings('new', null, null));
    assert.equal(
      ledgerText(dir),
      text({
        findings: {
          [IDS.pct]: PCT_ENTRY_FIXED,
          [IDS.pkg]: PKG_ENTRY_DEFERRED,
          [IDS.cacheKey]: created('src/cache.mjs', 'The cache key omits the locale, so two locales share one entry.', 2, 12),
          [IDS.evict]: created('src/cache.mjs', '`evict` doesn\u2019t stop iterating after "delete", so the next entry is skipped.', 2, 40),
        },
      }),
    );
  });

  test('the reasons fall back when no earlier pass holds a bucket', async () => {
    const fixed = fixtureJson('ledger-fixed.json');
    fixed.findings[IDS.pct].passes[1].bucket = null;
    fixed.findings[IDS.pkg].passes[1].bucket = null;
    const rejected = fixtureJson('ledger-rejected.json');
    rejected.findings[IDS.divisor4d].passes[1].bucket = null;
    const dirFixed = kase(['spike1b.json'], { 'findings.json': text(fixed) });
    const dirRejected = kase(['spike4d.json'], { 'findings.json': text(rejected) });
    const [a, b] = await Promise.all([run(dirFixed, '2', 'findings.json', 'spike1b.json'), run(dirRejected, '2', 'findings.json', 'spike4d.json')]);
    const regressed = succeeded(a).findings[0];
    assert.deepEqual([regressed.state, regressed.bucket, regressed.reason], ['regressed', 'fix', 'regression: fixed in an earlier pass']);
    const deferred = succeeded(a).findings[1];
    assert.deepEqual([deferred.state, deferred.bucket, deferred.reason], ['deferred', 'defer', 'deferred in an earlier pass']);
    const carried = succeeded(b).findings[2];
    assert.deepEqual([carried.state, carried.bucket, carried.reason], ['carried', 'reject', 'rejected in an earlier pass']);
  });

  test('the highest pass number decides the reason, compared as a number', async () => {
    const fixed = fixtureJson('ledger-fixed.json');
    const entry = fixed.findings[IDS.pct];
    entry.passes[2] = { line: 23, bucket: 'fix', reason: 'second fix', prior: 'fixed' };
    entry.passes[10] = { line: 23, bucket: 'fix', reason: 'tenth fix', prior: 'fixed' };
    entry.passes[9] = { line: 23, bucket: null, reason: null, prior: 'fixed' };
    const dir = kase(['spike1b.json'], { 'findings.json': text(fixed) });
    const summary = succeeded(await run(dir, '11', 'findings.json', 'spike1b.json'));
    assert.equal(summary.findings[0].reason, 'regression: fixed in pass 10');
  });

  test('re-ingesting a pass replaces it and leaves the identical ledger', async () => {
    for (const [ledger, review, pass] of [
      ['ledger-fixed.json', 'spike1b.json', '2'],
      ['ledger-rejected.json', 'spike4d.json', '2'],
      ['ledger-fixed.json', 'standin.md', '2'],
    ]) {
      const dir = kase([ledger, review]);
      copyFileSync(join(dir, ledger), join(dir, 'findings.json'));
      const first = await run(dir, pass, 'findings.json', review);
      const written = ledgerText(dir);
      const again = await run(dir, pass, 'findings.json', review);
      assert.equal(again.stdout, first.stdout, `${ledger} with ${review}`);
      assert.equal(ledgerText(dir), written, `${ledger} with ${review}`);
      assert.equal(again.status, 0);
    }
    const dir = kase(['spike4d.json', 'spike4b.json']);
    await run(dir, '1', 'findings.json', 'spike4d.json');
    await run(dir, '2', 'findings.json', 'spike4b.json');
    const written = ledgerText(dir);
    await run(dir, '2', 'findings.json', 'spike4b.json');
    assert.equal(ledgerText(dir), written);
  });

  test('re-ingesting a pass with another review replaces the earlier one', async () => {
    const dir = kase(['spike4d.json', 'spike4b.json', 'standin.md']);
    await run(dir, '1', 'findings.json', 'spike4d.json');
    await run(dir, '2', 'findings.json', 'spike4b.json');
    const once = JSON.parse(ledgerText(dir));
    assert.equal(Object.keys(once.findings).length, 5);
    await run(dir, '2', 'findings.json', 'standin.md');
    assert.deepEqual(Object.keys(JSON.parse(ledgerText(dir)).findings), [IDS.guard4d, IDS.test4d, IDS.divisor4d, IDS.cacheKey, IDS.evict]);
  });

  test('a ledger holding a later pass fails', async () => {
    const dir = kase(['ledger-rejected.json', 'spike4d.json']);
    copyFileSync(join(dir, 'ledger-rejected.json'), join(dir, 'findings.json'));
    await run(dir, '2', 'findings.json', 'spike4d.json');
    const written = ledgerText(dir);
    const r = await run(dir, '1', 'findings.json', 'spike4d.json');
    failed(r, 1, ['findings: findings.json: holds pass 2, later than 1']);
    assert.equal(ledgerText(dir), written);
    assert.deepEqual(readdirSync(dir).sort(), ['findings.json', 'ledger-rejected.json', 'spike4d.json']);
  });
});

describe('a match written without its link', { concurrency }, () => {
  const ID = 'src/share.mjs|signed values are truncated';
  const entry = (state, extra = {}, first = 1) => ({
    file: 'src/share.mjs',
    summary: 'signed values are truncated',
    first_pass: first,
    state,
    passes: { [first]: { line: 12, bucket: state === 'deferred' ? 'defer' : 'reject', reason: 'same defect as the pass-1 rejection', prior: null } },
    ...extra,
  });
  const EMPTY = 'Nothing found.\n\n```json\n[]\n```\n';
  const WARNING = `findings: warning: ${ID} is carried with no match; write the match of Step 1.6\n`;
  const ingestOnce = async (findings, pass = '2') => {
    const dir = kase([], { 'findings.json': text({ findings }), 'reply.md': EMPTY });
    const r = await run(dir, pass, 'findings.json', 'reply.md');
    assert.equal(r.status, 0);
    assert.equal(JSON.parse(r.stdout).findings.length, 0);
    return r;
  };

  test('a carried entry new in the latest pass with no match is warned about on stderr', async () => {
    const r = await ingestOnce({ [ID]: entry('carried') });
    assert.equal(r.stderr, WARNING);
  });

  test('an entry that holds its match is not warned about', async () => {
    const r = await ingestOnce({ [ID]: entry('carried', { match: { of: 'src/share.mjs|other', reason: 'same defect' } }) });
    assert.equal(r.stderr, '');
  });

  test('a regressed entry new in the latest pass with no match is warned about as regressed', async () => {
    const r = await ingestOnce({ [ID]: entry('regressed') });
    assert.equal(r.stderr, `findings: warning: ${ID} is regressed with no match; write the match of Step 1.6\n`);
  });

  test('a deferred entry with no match is not warned about', async () => {
    const r = await ingestOnce({ [ID]: entry('deferred') });
    assert.equal(r.stderr, '');
  });

  test('an entry new before the latest pass the ledger holds is not warned about', async () => {
    const r = await ingestOnce({ [ID]: entry('carried'), 'src/other.mjs|later': { ...entry('new', {}, 2), file: 'src/other.mjs', summary: 'later' } }, '3');
    assert.equal(r.stderr, '');
  });

  test('the warnings come in id order, and the pass being re-ingested is rolled back first', async () => {
    const b = 'src/share.mjs|b';
    const a = 'src/share.mjs|a';
    const r = await ingestOnce({ [b]: entry('carried'), [a]: entry('regressed'), 'src/share.mjs|c': entry('carried', {}, 2) });
    assert.equal(
      r.stderr,
      'findings: warning: src/share.mjs|a is regressed with no match; write the match of Step 1.6\n' +
        'findings: warning: src/share.mjs|b is carried with no match; write the match of Step 1.6\n',
    );
  });

  test('a failed run prints no warning', async () => {
    const dir = kase([], { 'findings.json': text({ findings: { [ID]: entry('carried') } }), 'reply.md': 'Everything is fine.\n' });
    failed(await run(dir, '2', 'findings.json', 'reply.md'), 1, ['findings: reply.md: no fenced json array of findings']);
  });

  test('--check warns about a carried entry new in the pass it names with no match and writes nothing', async () => {
    const dir = kase([], { 'findings.json': text({ findings: { [ID]: entry('carried', {}, 2) } }) });
    const before = ledgerText(dir);
    const r = await run(dir, '--check', '2', 'findings.json');
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
    assert.equal(r.stderr, WARNING);
    assert.equal(ledgerText(dir), before);
    assert.deepEqual(readdirSync(dir), ['findings.json']);
  });

  test('--check is silent for a ledger whose entries all hold their match', async () => {
    const dir = kase([], { 'findings.json': text({ findings: { [ID]: entry('carried', { match: { of: 'src/share.mjs|other', reason: 'same defect' } }, 2) } }) });
    const r = await run(dir, '--check', '2', 'findings.json');
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
    assert.equal(r.stderr, '');
  });

  test('--check reads the ledger as it stands, so an entry new before the pass it names is not warned about', async () => {
    const dir = kase([], { 'findings.json': text({ findings: { [ID]: entry('carried'), 'src/other.mjs|later': { ...entry('new', {}, 2), file: 'src/other.mjs', summary: 'later' } } }) });
    const r = await run(dir, '--check', '2', 'findings.json');
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
    assert.equal(r.stderr, '');
  });

  test('--check after a pass with no findings is silent about an entry an earlier pass left without its match', async () => {
    const dir = kase([], { 'findings.json': text({ findings: { [ID]: entry('carried') } }) });
    const r = await run(dir, '--check', '2', 'findings.json');
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
    assert.equal(r.stderr, '');
  });
});

describe('usage and read or write errors', { concurrency }, () => {
  for (const args of [[], ['1'], ['1', 'findings.json'], ['0', 'findings.json', 'standin.md'], ['two', 'findings.json', 'standin.md'], ['1.5', 'findings.json', 'standin.md'], ['-1', 'findings.json', 'standin.md'], ['', 'findings.json', 'standin.md']]) {
    test(`usage for arguments [${args.join(' ')}]`, async () => {
      const dir = kase(['standin.md']);
      failed(await run(dir, ...args), 2, [USAGE], dir);
    });
  }

  for (const args of [['--check'], ['--check', 'findings.json'], ['--check', '0', 'findings.json'], ['--check', '2', 'findings.json', 'standin.md']]) {
    test(`usage for arguments [${args.join(' ')}]`, async () => {
      const dir = kase(['standin.md']);
      failed(await run(dir, ...args), 2, [USAGE], dir);
    });
  }

  test('--check on a ledger that does not exist', async () => {
    const dir = kase();
    failed(await run(dir, '--check', '2', 'findings.json'), 2, ['findings: cannot read findings.json'], dir);
  });

  test('--check on a ledger that is not JSON', async () => {
    const dir = kase([], { 'findings.json': '{"findings": ' });
    failed(await run(dir, '--check', '2', 'findings.json'), 1, ['findings: findings.json: not JSON']);
    assert.equal(ledgerText(dir), '{"findings": ');
  });

  test('--check on a file that is not a findings ledger', async () => {
    const dir = kase([], { 'findings.json': '{}' });
    failed(await run(dir, '--check', '2', 'findings.json'), 1, ['findings: findings.json: not a findings ledger']);
    assert.equal(ledgerText(dir), '{}');
  });

  test('a review output that cannot be read', async () => {
    const dir = kase();
    failed(await run(dir, '1', 'findings.json', 'nope/missing.md'), 2, ['findings: cannot read nope/missing.md'], dir);
  });

  test('a ledger that cannot be read', async () => {
    const dir = kase(['standin.md']);
    mkdirSync(join(dir, 'ledger-dir'));
    failed(await run(dir, '1', 'ledger-dir', 'standin.md'), 2, ['findings: cannot read ledger-dir']);
  });

  test('a ledger that cannot be written', async () => {
    const dir = kase(['standin.md']);
    failed(await run(dir, '1', 'nope/findings.json', 'standin.md'), 2, ['findings: cannot write nope/findings.json']);
    assert.deepEqual(readdirSync(dir), ['standin.md']);
  });
});

describe('validation errors', { concurrency }, () => {
  test('a review that is not JSON', async () => {
    const dir = kase([], { 'bad.json': 'not json' });
    failed(await run(dir, '1', 'findings.json', 'bad.json'), 1, ['findings: bad.json: not JSON'], dir);
  });

  test('a review that parses to something other than a result object', async () => {
    const dir = kase([], { 'list.json': '[]' });
    failed(await run(dir, '1', 'findings.json', 'list.json'), 1, ['findings: list.json: not JSON'], dir);
  });

  test('a ledger that is not JSON', async () => {
    const dir = kase(['standin.md'], { 'findings.json': '{"findings": ' });
    failed(await run(dir, '1', 'findings.json', 'standin.md'), 1, ['findings: findings.json: not JSON']);
    assert.equal(ledgerText(dir), '{"findings": ');
  });

  for (const [name, content] of [
    ['an array', '[]'],
    ['no findings key', '{}'],
    ['findings as an array', '{"findings": []}'],
    ['an entry that is not an object', '{"findings": {"a": 1}}'],
    ['an entry with a state that is not a string', '{"findings": {"a": {"state": 1, "passes": {}}}}'],
    ['an entry with no passes', '{"findings": {"a": {"state": "new"}}}'],
    ['an entry with passes as an array', '{"findings": {"a": {"state": "new", "passes": []}}}'],
  ]) {
    test(`a ledger that is not a findings ledger: ${name}`, async () => {
      const dir = kase(['standin.md'], { 'findings.json': content });
      failed(await run(dir, '1', 'findings.json', 'standin.md'), 1, ['findings: findings.json: not a findings ledger']);
      assert.equal(ledgerText(dir), content);
    });
  }

  for (const [name, content] of [
    ['no fence at all', 'Everything is fine.\n'],
    ['a fence that is not closed', 'Note.\n\n```json\n[]\n'],
    ['a plain fence', '```\n[]\n```\n'],
    ['an array of strings', '```json\n["a", "b"]\n```\n'],
    ['an object', '```json\n{"findings": []}\n```\n'],
    ['an element missing a key', '```json\n[{"file": "a.mjs", "line": 1, "summary": "s"}]\n```\n'],
    ['a block that does not parse', '```json\n[{"file": \n```\n'],
  ]) {
    test(`a stand-in reply with ${name} has no array`, async () => {
      const dir = kase([], { 'reply.md': content });
      failed(await run(dir, '1', 'findings.json', 'reply.md'), 1, ['findings: reply.md: no fenced json array of findings'], dir);
    });
  }

  test('one failed review among several writes nothing and leaves the ledger as it was', async () => {
    const dir = kase(['ledger-fixed.json', 'spike1b.json', 'spike3.json']);
    copyFileSync(join(dir, 'ledger-fixed.json'), join(dir, 'findings.json'));
    const before = ledgerText(dir);
    failed(await run(dir, '2', 'findings.json', 'spike1b.json', 'spike3.json'), 1, ['findings: spike3.json: no fenced json array of findings']);
    assert.equal(ledgerText(dir), before);
    assert.deepEqual(readdirSync(dir).sort(), ['findings.json', 'ledger-fixed.json', 'spike1b.json', 'spike3.json']);
  });
});

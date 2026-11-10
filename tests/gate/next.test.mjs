// Runs plugins/gate/scripts/next.mjs against passes.json records built here, one case per rule of requirements 301, 303 and 311.
// Every case writes its record into its own temporary directory and runs the script there; expected values are literals.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const script = join(root, 'plugins', 'gate', 'scripts', 'next.mjs');
const concurrency = Math.max(1, availableParallelism() - 1);
const USAGE = 'usage: node next.mjs <passes.json> <max-passes> [<minutes-left> <minutes-a-pass-needs>]';
const KINDS = 'inside-diff, exported-signature, schema-or-migration, outside-diff or docs-only';

let base;
before(() => {
  base = mkdtempSync(join(tmpdir(), 'gate-next-'));
});
after(() => {
  rmSync(base, { recursive: true, force: true });
});

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

// A pass entry. `fix`, `defer` and `reject` list finding ids; `changes` is the fix round's change kinds; `more` holds any
// other key of the entry, such as `files`, `commit` or `checks`.
const pass = (n, runNumber, level, { fix = [], defer = [], reject = [], changes = ['inside-diff'], status = 'complete', ...more } = {}) => ({
  n,
  run: runNumber,
  level,
  status,
  started: '2026-10-25T09:00:40Z',
  ended: '2026-10-25T09:05:00Z',
  findings: Object.fromEntries([
    ...fix.map((id) => [id, { bucket: 'fix', reason: 'inside the change' }]),
    ...defer.map((id) => [id, { bucket: 'defer', reason: 'pre-existing' }]),
    ...reject.map((id) => [id, { bucket: 'reject', reason: 'false positive' }]),
  ]),
  changes,
  ...more,
});

const record = (passes) => JSON.stringify({ branch: 'feat/68-4567-export', base: 'main', merge_base: 'abc', runs: [], passes }, null, 2) + '\n';

// A case directory holding passes.json with the given text, and run with the given arguments (default: the file and 4).
const exec = (text, args = ['passes.json', '4']) => {
  const dir = mkdtempSync(join(base, 'case-'));
  if (text !== null) writeFileSync(join(dir, 'passes.json'), text);
  return run(dir, ...args).then((r) => ({ ...r, dir }));
};

// A successful run: exit 0, nothing on stderr, this one stdout line, and nothing written beside the record.
const ok = async (passes, expected, max = '4', budget = []) => {
  const r = await exec(record(passes), ['passes.json', max, ...budget]);
  assert.equal(r.stderr, '');
  assert.equal(r.stdout, expected + '\n');
  assert.equal(r.status, 0);
  assert.deepEqual(readdirSync(r.dir), ['passes.json']);
};

// A failed run: the exit code, nothing on stdout, exactly this stderr line.
const bad = async (text, status, line, args) => {
  const r = await exec(text, args);
  assert.equal(r.stdout, '');
  assert.equal(r.stderr, line + '\n');
  assert.equal(r.status, status);
};

const HIGH = '{"level":"high","rule":"otherwise"}';
const XHIGH = '{"level":"xhigh","rule":"wide-fix"}';
const PASS = '{"stop":"pass","rule":"nothing-to-fix"}';

describe('the shape of the record', { concurrency }, () => {
  test('the passes.json of the architecture, completed through pass 2', async () => {
    const text = JSON.stringify(
      {
        branch: 'feat/68-4567-export',
        base: 'main',
        merge_base: '4065769c0ffee4065769c0ffee4065769c0ffee0',
        targets: ['github:owner/app#73'],
        engine: 'subprocess',
        runs: [{ n: 1, started: '2026-10-25T09:00:40Z', ended: null, state: 'running' }],
        passes: [
          {
            n: 1,
            run: 1,
            level: 'xhigh',
            status: 'complete',
            started: '2026-10-25T09:00:41Z',
            ended: '2026-10-25T09:04:10Z',
            reviews: [{ slug: 'all', target: '4065769c0ffee4065769c0ffee4065769c0ffee0...HEAD', output: 'review-1.json', duration_ms: 119636, total_cost_usd: 1.23, denials: 2 }],
            findings: { 'src/stats.mjs|percentile indexes sorted rank instead of sorted rank 1': { bucket: 'fix', reason: 'off-by-one inside the change' } },
            changes: ['inside-diff'],
            commit: 'b1946ac92492d2347c6235b4d2611184b1946ac9',
            head: 'b1946ac92492d2347c6235b4d2611184b1946ac9',
            checks: [{ command: 'npm test', result: 'pass' }],
            next: { level: 'high', rule: 'otherwise' },
          },
          {
            n: 2,
            run: 1,
            level: 'high',
            status: 'complete',
            started: '2026-10-25T09:04:30Z',
            ended: '2026-10-25T09:06:40Z',
            reviews: [{ slug: 'all', target: '4065769c0ffee4065769c0ffee4065769c0ffee0...HEAD', output: 'review-2.json', duration_ms: 90012, total_cost_usd: 0.95, denials: 0 }],
            findings: {},
            changes: [],
            commit: null,
            head: 'b1946ac92492d2347c6235b4d2611184b1946ac9',
            checks: [],
          },
        ],
      },
      null,
      2,
    );
    const r = await exec(text);
    assert.equal(r.stderr, '');
    assert.equal(r.stdout, PASS + '\n');
    assert.equal(r.status, 0);
  });

  test('only passes is read at the top level', async () => {
    const r = await exec(JSON.stringify({ passes: [pass(1, 1, 'xhigh', { fix: ['a|x'] })] }));
    assert.equal(r.stdout, HIGH + '\n');
    assert.equal(r.status, 0);
    const other = await exec(JSON.stringify({ branch: 7, runs: 'none', passes: [pass(1, 1, 'xhigh', { fix: ['a|x'] })] }));
    assert.equal(other.stdout, HIGH + '\n');
  });

  test('a byte order mark before the record is skipped', async () => {
    const r = await exec('\ufeff' + record([pass(1, 1, 'xhigh')]));
    assert.equal(r.stdout, PASS + '\n');
    assert.equal(r.status, 0);
  });

  test('a failed pass before the latest is read like any other', async () => {
    await ok([pass(1, 1, 'xhigh', { fix: ['a|x'], status: 'failed', changes: [] }), pass(2, 1, 'xhigh', { fix: ['a|x'] })], HIGH);
  });
});

describe('nothing-to-fix', { concurrency }, () => {
  test('an empty fix bucket and nothing rejected is pass', async () => {
    await ok([pass(1, 1, 'xhigh', { changes: [] })], PASS);
  });

  test('a fix pass then an empty one is pass', async () => {
    await ok([pass(1, 1, 'xhigh', { fix: ['a|x'] }), pass(2, 1, 'high', { changes: [] })], PASS);
  });

  test('a rejection, new or carried, beside an empty fix bucket is pass', async () => {
    await ok([pass(1, 1, 'xhigh', { reject: ['a|x'], changes: [] })], PASS);
    await ok([pass(1, 1, 'xhigh', { fix: ['a|y'], reject: ['a|x'] }), pass(2, 1, 'high', { reject: ['a|x', 'a|z'], changes: [] })], PASS);
  });

  test('a wide change or a medium pass with nothing to fix is pass', async () => {
    await ok([pass(1, 1, 'xhigh', { changes: ['outside-diff'] })], PASS);
    await ok([pass(1, 1, 'xhigh', { fix: ['a|x'], changes: ['docs-only'] }), pass(2, 1, 'medium', { changes: [] })], PASS);
  });

  test('a defer in the latest pass or an earlier pass of the run is pass-with-deferred', async () => {
    await ok([pass(1, 1, 'xhigh', { defer: ['a|d'], changes: [] })], '{"stop":"pass-with-deferred","rule":"nothing-to-fix"}');
    await ok([pass(1, 1, 'xhigh', { fix: ['a|x'], defer: ['a|d'] }), pass(2, 1, 'high', { changes: [] })], '{"stop":"pass-with-deferred","rule":"nothing-to-fix"}');
  });

  test('a defer only in a pass of an earlier run is pass', async () => {
    await ok([pass(1, 1, 'xhigh', { fix: ['a|x'], defer: ['a|d'] }), pass(2, 2, 'xhigh', { changes: [] })], PASS);
  });
});

describe('fix-of-fix', { concurrency }, () => {
  const FIXED = '{"stop":"pass","rule":"fix-of-fix"}';
  const first = pass(1, 1, 'xhigh', { fix: ['src/a.mjs|x', 'src/b.mjs|y'], files: ['src/a.mjs', 'src/b.mjs'], commit: 'c1' });
  const checked = { commit: 'c2', files: ['src/a.mjs'], checks: [{ command: 'npm test', result: 'pass' }] };

  test('a later pass with three fix findings, all in files the round before changed, stops once its own round passed the checks', async () => {
    await ok([first, pass(2, 1, 'high', { fix: ['src/a.mjs|p', 'src/a.mjs|q', 'src/b.mjs|r'], ...checked })], FIXED);
  });

  test('a defer in the run makes it pass-with-deferred', async () => {
    await ok([first, pass(2, 1, 'high', { fix: ['src/a.mjs|p'], defer: ['src/c.mjs|d'], ...checked })], '{"stop":"pass-with-deferred","rule":"fix-of-fix"}');
  });

  test('four fix findings give high', async () => {
    await ok([first, pass(2, 1, 'high', { fix: ['src/a.mjs|p', 'src/a.mjs|q', 'src/b.mjs|r', 'src/b.mjs|s'], ...checked })], HIGH);
  });

  test('a fix finding in a file the round before did not change gives high', async () => {
    await ok([first, pass(2, 1, 'high', { fix: ['src/a.mjs|p', 'src/c.mjs|q'], ...checked })], HIGH);
    await ok([first, pass(2, 1, 'high', { fix: ['src/a.mjs.bak|p'], ...checked })], HIGH);
    await ok([first, pass(2, 1, 'high', { fix: ['an id with no file part'], ...checked })], HIGH);
  });

  test('the first pass of a run never stops this way', async () => {
    await ok([pass(1, 1, 'xhigh', { fix: ['src/a.mjs|p'], ...checked })], HIGH);
    await ok([first, pass(2, 2, 'xhigh', { fix: ['src/a.mjs|p'], ...checked })], HIGH);
  });

  test('a round before that recorded no files, as an older record did not, gives high', async () => {
    await ok([pass(1, 1, 'xhigh', { fix: ['src/a.mjs|x'], commit: 'c1' }), pass(2, 1, 'high', { fix: ['src/a.mjs|p'], ...checked })], HIGH);
    await ok([pass(1, 1, 'xhigh', { fix: ['src/a.mjs|x'], commit: 'c1', files: [] }), pass(2, 1, 'high', { fix: ['src/a.mjs|p'], ...checked })], HIGH);
  });

  test('no check, a failed check or a denied check gives high, since nothing then covers the last fixes', async () => {
    const fix = ['src/a.mjs|p'];
    await ok([first, pass(2, 1, 'high', { fix, commit: 'c2' })], HIGH);
    await ok([first, pass(2, 1, 'high', { fix, commit: 'c2', checks: [] })], HIGH);
    await ok([first, pass(2, 1, 'high', { fix, commit: 'c2', checks: [{ command: 'npm test', result: 'fail' }] })], HIGH);
    await ok([first, pass(2, 1, 'high', { fix, commit: 'c2', checks: [{ command: 'npm test', result: 'pass' }, { command: 'npm run lint', result: 'denied' }] })], HIGH);
  });

  test('a fix round that made no commit gives high', async () => {
    await ok([first, pass(2, 1, 'high', { fix: ['src/a.mjs|p'], ...checked, commit: null })], HIGH);
  });

  test('a wide fix round does not stop: it is reviewed', async () => {
    await ok([first, pass(2, 1, 'high', { fix: ['src/a.mjs|p'], ...checked, changes: ['inside-diff', 'exported-signature'] })], XHIGH);
    await ok(
      [first, pass(2, 1, 'xhigh', { fix: ['src/a.mjs|p'], files: ['src/a.mjs'], commit: 'c2' }), pass(3, 1, 'high', { fix: ['src/a.mjs|q'], ...checked, changes: ['outside-diff'] })],
      HIGH,
    );
  });

  test('a docs-only round of few fixes in those files stops, with no medium pass after it', async () => {
    await ok([first, pass(2, 1, 'high', { fix: ['src/a.mjs|p'], ...checked, changes: ['docs-only'] })], FIXED);
  });

  test('the stop holds at the cap and with little time left', async () => {
    await ok([first, pass(2, 1, 'high', { fix: ['src/a.mjs|p'], ...checked })], FIXED, '2', ['1', '50']);
  });
});

describe('docs-only', { concurrency }, () => {
  const MEDIUM = '{"level":"medium","rule":"docs-only"}';

  test('a pass with a fix that changed only documentation gives medium', async () => {
    await ok([pass(1, 1, 'xhigh', { fix: ['a|x'], changes: ['docs-only'] })], MEDIUM);
    await ok([pass(1, 1, 'xhigh', { fix: ['a|x'] }), pass(2, 1, 'high', { fix: ['a|y'], changes: ['inside-diff', 'docs-only'] })], MEDIUM);
  });

  test('docs-only beside outside-diff gives medium, not xhigh', async () => {
    await ok([pass(1, 1, 'xhigh', { fix: ['a|x'], changes: ['outside-diff', 'docs-only'] })], MEDIUM);
  });

  test('a medium pass that still has a fix in code gives high', async () => {
    await ok([pass(1, 1, 'xhigh', { fix: ['a|x'], changes: ['docs-only'] }), pass(2, 1, 'medium', { fix: ['a|y'] })], HIGH);
  });

  test('a docs-only fix at the cap is capped', async () => {
    await ok([pass(1, 1, 'xhigh', { fix: ['a|x'], changes: ['docs-only'] })], '{"level":"medium","rule":"docs-only","capped":"max-passes"}', '1');
  });
});

describe('wide-fix', { concurrency }, () => {
  for (const kind of ['exported-signature', 'schema-or-migration', 'outside-diff']) {
    test(`${kind} gives xhigh`, async () => {
      await ok([pass(1, 1, 'xhigh', { fix: ['a|x'], changes: [kind] })], XHIGH);
    });
  }

  test('one wide kind among others gives xhigh, after a high pass too', async () => {
    await ok([pass(1, 1, 'xhigh', { fix: ['a|x'], changes: ['inside-diff', 'outside-diff'] })], XHIGH);
    await ok([pass(1, 1, 'xhigh', { fix: ['a|x'] }), pass(2, 1, 'high', { fix: ['a|y'], changes: ['outside-diff'] })], XHIGH);
  });

  test('the over-quarter kind of an older record is read and is not wide', async () => {
    await ok([pass(1, 1, 'xhigh', { fix: ['a|x'], changes: ['inside-diff', 'over-quarter'] })], HIGH);
    await ok([pass(1, 1, 'xhigh', { fix: ['a|x'], changes: ['docs-only', 'over-quarter'] })], '{"level":"medium","rule":"docs-only"}');
  });

  test('the second time gives high', async () => {
    await ok(
      [
        pass(1, 1, 'xhigh', { fix: ['a|x'], changes: ['outside-diff'] }),
        pass(2, 1, 'xhigh', { fix: ['a|y'], changes: ['inside-diff'] }),
        pass(3, 1, 'high', { fix: ['a|z'], changes: ['outside-diff'] }),
      ],
      HIGH,
    );
    await ok([pass(1, 1, 'xhigh', { fix: ['a|x'], changes: ['outside-diff'] }), pass(2, 1, 'xhigh', { fix: ['a|y'], changes: ['schema-or-migration'] })], HIGH);
  });

  test('the first pass of the run and the passes of an earlier run do not count as the once', async () => {
    await ok(
      [
        pass(1, 1, 'xhigh', { fix: ['a|x'], changes: ['outside-diff'] }),
        pass(2, 1, 'xhigh', { fix: ['a|y'] }),
        pass(3, 2, 'xhigh', { fix: ['a|z'], changes: ['outside-diff'] }),
      ],
      XHIGH,
    );
  });
});

describe('otherwise', { concurrency }, () => {
  test('a pass with a fix bucket gives high', async () => {
    await ok([pass(1, 1, 'xhigh', { fix: ['a|x'], changes: ['inside-diff'] })], HIGH);
    await ok([pass(1, 1, 'xhigh', { fix: ['a|x'] }), pass(2, 1, 'high', { fix: ['a|y'] })], HIGH);
  });

  test('a fix round that changed nothing gives high', async () => {
    await ok([pass(1, 1, 'xhigh', { fix: ['a|x'], changes: [] })], HIGH);
  });
});

describe('max-passes', { concurrency }, () => {
  const four = [
    pass(1, 1, 'xhigh', { fix: ['a|x'] }),
    pass(2, 1, 'high', { fix: ['a|y'] }),
    pass(3, 1, 'high', { fix: ['a|z'] }),
    pass(4, 1, 'high', { fix: ['a|w'] }),
  ];

  test('the fourth pass of a run with a fix and a cap of 4 is capped', async () => {
    await ok(four, '{"level":"high","rule":"otherwise","capped":"max-passes"}', '4');
  });

  test('the third pass of a run under a cap of 4 is not capped', async () => {
    await ok(four.slice(0, 3), HIGH, '4');
  });

  test('a cap already passed is capped too', async () => {
    await ok(four, '{"level":"high","rule":"otherwise","capped":"max-passes"}', '3');
  });

  test('a cap of 1 caps the first pass', async () => {
    await ok([pass(1, 1, 'xhigh', { fix: ['a|x'], changes: ['outside-diff'] })], '{"level":"xhigh","rule":"wide-fix","capped":"max-passes"}', '1');
  });

  test('a medium level is capped', async () => {
    await ok([pass(1, 1, 'xhigh', { fix: ['a|x'] }), pass(2, 1, 'high', { fix: ['a|y'], changes: ['docs-only'] })], '{"level":"medium","rule":"docs-only","capped":"max-passes"}', '2');
  });

  test('a stop at the cap is not capped', async () => {
    await ok([...four.slice(0, 3), pass(4, 1, 'high', { changes: [] })], PASS, '4');
    await ok([...four.slice(0, 3), pass(4, 1, 'high', { defer: ['a|d'], changes: [] })], '{"stop":"pass-with-deferred","rule":"nothing-to-fix"}', '4');
  });

  test('a second run counts only its own passes', async () => {
    const first = [pass(1, 1, 'xhigh', { fix: ['a|x'] }), pass(2, 1, 'high', { fix: ['a|y'] }), pass(3, 1, 'high', { fix: ['a|z'] }), pass(4, 1, 'high', { fix: ['a|w'] })];
    await ok([...first, pass(5, 2, 'high', { fix: ['a|v'] })], HIGH, '4');
    await ok([...first, pass(5, 2, 'high', { fix: ['a|v'] }), pass(6, 2, 'high', { fix: ['a|u'] }), pass(7, 2, 'high', { fix: ['a|t'] })], HIGH, '4');
    await ok(
      [...first, pass(5, 2, 'high', { fix: ['a|v'] }), pass(6, 2, 'high', { fix: ['a|u'] }), pass(7, 2, 'high', { fix: ['a|t'] }), pass(8, 2, 'high', { fix: ['a|s'] })],
      '{"level":"high","rule":"otherwise","capped":"max-passes"}',
      '4',
    );
  });
});

describe('the run budget', { concurrency }, () => {
  const fixing = [pass(1, 1, 'xhigh', { fix: ['a|x'] })];

  test('less time left than a pass needs caps the level as budget', async () => {
    await ok(fixing, '{"level":"high","rule":"otherwise","capped":"budget"}', '4', ['7', '50']);
  });

  test('exactly the time a pass needs is not capped', async () => {
    await ok(fixing, HIGH, '4', ['50', '50']);
  });

  test('a run over its budget, with negative time left, is capped', async () => {
    await ok(fixing, '{"level":"high","rule":"otherwise","capped":"budget"}', '4', ['-3', '50']);
  });

  test('a fractional figure is read as a number', async () => {
    await ok(fixing, '{"level":"high","rule":"otherwise","capped":"budget"}', '4', ['49.5', '50']);
    await ok(fixing, HIGH, '4', ['50.5', '50']);
  });

  test('a figure without a leading digit is read as a number', async () => {
    await ok(fixing, '{"level":"high","rule":"otherwise","capped":"budget"}', '4', ['.5', '1']);
    await ok(fixing, HIGH, '4', ['1', '.5']);
  });

  test('a figure in exponent notation is read as a number', async () => {
    await ok(fixing, HIGH, '4', ['1e1', '5']);
    await ok(fixing, '{"level":"high","rule":"otherwise","capped":"budget"}', '4', ['1e1', '50']);
    await ok(fixing, '{"level":"high","rule":"otherwise","capped":"budget"}', '4', ['7', '1e1']);
  });

  test('a stop with little time left is not capped', async () => {
    await ok([pass(1, 1, 'xhigh', { changes: [] })], PASS, '4', ['1', '50']);
  });

  test('a medium or xhigh level is capped the same way', async () => {
    await ok([pass(1, 1, 'xhigh', { fix: ['a|x'], changes: ['docs-only'] })], '{"level":"medium","rule":"docs-only","capped":"budget"}', '4', ['7', '50']);
    await ok([pass(1, 1, 'xhigh', { fix: ['a|x'], changes: ['outside-diff'] })], '{"level":"xhigh","rule":"wide-fix","capped":"budget"}', '4', ['7', '50']);
  });

  test('max-passes wins when both caps apply', async () => {
    await ok(
      [pass(1, 1, 'xhigh', { fix: ['a|x'] }), pass(2, 1, 'high', { fix: ['a|y'] })],
      '{"level":"high","rule":"otherwise","capped":"max-passes"}',
      '2',
      ['7', '50'],
    );
  });
});

describe('usage and read errors', { concurrency }, () => {
  for (const args of [[], ['passes.json'], ['passes.json', '0'], ['passes.json', 'two'], ['passes.json', '1.5'], ['passes.json', '-1'], ['passes.json', ''], ['passes.json', '4', 'extra'], ['passes.json', '4', '7'], ['passes.json', '4', '7', '50', '1'], ['passes.json', '4', 'soon', '50'], ['passes.json', '4', '7', 'long'], ['passes.json', '4', '', '50'], ['passes.json', '4', '7', ''], ['passes.json', '4', 'Infinity', '50'], ['passes.json', '4', '7', '0'], ['passes.json', '4', '7', '-50'], ['passes.json', '4', '7', 'NaN'], ['passes.json', '4', '0x10', '50'], ['passes.json', '4', 'abc', '50'], ['passes.json', '4', '7', 'abc'], ['passes.json', '4', ' ', '50'], ['passes.json', '4', '7', ' ']]) {
    test(`usage for arguments [${args.join(' ')}]`, async () => {
      await bad(record([pass(1, 1, 'xhigh')]), 2, USAGE, args);
    });
  }

  test('a record that cannot be read', async () => {
    await bad(null, 2, 'next: cannot read nope/missing.json', ['nope/missing.json', '4']);
  });

  test('a record path that is a directory', async () => {
    const dir = mkdtempSync(join(base, 'case-'));
    mkdirSync(join(dir, 'passes-dir'));
    const r = await run(dir, 'passes-dir', '4');
    assert.equal(r.stdout, '');
    assert.equal(r.stderr, 'next: cannot read passes-dir\n');
    assert.equal(r.status, 2);
  });

  test('a message names the file by its basename', async () => {
    const dir = mkdtempSync(join(base, 'case-'));
    mkdirSync(join(dir, 'sub'));
    writeFileSync(join(dir, 'sub', 'record.json'), 'nope');
    const r = await run(dir, 'sub/record.json', '4');
    assert.equal(r.stderr, 'next: record.json: not JSON\n');
    assert.equal(r.status, 1);
  });
});

describe('validation errors', { concurrency }, () => {
  for (const [name, text] of [
    ['text that is not JSON', 'not json'],
    ['an array', '[]'],
    ['null', 'null'],
    ['a number', '3'],
  ]) {
    test(`not JSON: ${name}`, async () => {
      await bad(text, 1, 'next: passes.json: not JSON');
    });
  }

  for (const [name, text] of [
    ['no passes key', '{}'],
    ['passes as an object', '{"passes": {}}'],
    ['passes as a string', '{"passes": "x"}'],
    ['an empty passes', '{"passes": []}'],
  ]) {
    test(`passes is missing or empty: ${name}`, async () => {
      await bad(text, 1, 'next: passes.json: passes is missing or empty');
    });
  }

  const good = pass(1, 1, 'xhigh');
  const second = pass(2, 1, 'high');
  const entry = (i, mutate, line) =>
    test(line, async () => {
      const passes = i === 0 ? [mutate(good)] : [good, mutate(second)];
      await bad(record(passes), 1, `next: passes.json: ${line}`);
    });
  const without = (key) => (p) => {
    const { [key]: _drop, ...rest } = p;
    return rest;
  };

  for (const value of [1, null, 'x', []]) {
    test(`an entry that is ${JSON.stringify(value)}`, async () => {
      await bad(record([good, value]), 1, 'next: passes.json: passes[1] is not an object');
    });
  }
  entry(1, (p) => ({ ...p, n: 3 }), 'passes[1].n is 3, not 2');
  entry(0, without('n'), 'passes[0].n is missing, not 1');
  entry(0, (p) => ({ ...p, n: '1' }), 'passes[0].n is "1", not 1');
  entry(0, (p) => ({ ...p, run: 0 }), 'passes[0].run is 0, not a whole number of 1 or more');
  entry(0, (p) => ({ ...p, run: 1.5 }), 'passes[0].run is 1.5, not a whole number of 1 or more');
  entry(0, (p) => ({ ...p, run: '1' }), 'passes[0].run is "1", not a whole number of 1 or more');
  entry(0, without('run'), 'passes[0].run is missing, not a whole number of 1 or more');
  test('a run below the run before it', async () => {
    await bad(record([pass(1, 2, 'xhigh'), pass(2, 1, 'high')]), 1, 'next: passes.json: passes[1].run is 1, below the run of passes[0]');
  });
  entry(0, (p) => ({ ...p, level: 'low' }), 'passes[0].level is "low", not medium, high or xhigh');
  entry(0, (p) => ({ ...p, level: 'max' }), 'passes[0].level is "max", not medium, high or xhigh');
  entry(0, without('level'), 'passes[0].level is missing, not medium, high or xhigh');
  entry(0, (p) => ({ ...p, status: 'done' }), 'passes[0].status is "done", not running, complete or failed');
  entry(0, without('status'), 'passes[0].status is missing, not running, complete or failed');
  entry(0, without('findings'), 'passes[0].findings is missing or not an object');
  entry(0, (p) => ({ ...p, findings: [] }), 'passes[0].findings is missing or not an object');
  entry(0, (p) => ({ ...p, findings: null }), 'passes[0].findings is missing or not an object');
  entry(0, (p) => ({ ...p, findings: { 'a.mjs|x': { bucket: 'skip', reason: 'r' } } }), 'passes[0].findings["a.mjs|x"].bucket is "skip", not fix, defer or reject');
  entry(0, (p) => ({ ...p, findings: { 'a.mjs|x': { reason: 'r' } } }), 'passes[0].findings["a.mjs|x"].bucket is missing, not fix, defer or reject');
  entry(0, (p) => ({ ...p, findings: { 'a.mjs|x': 1 } }), 'passes[0].findings["a.mjs|x"].bucket is missing, not fix, defer or reject');
  entry(0, (p) => ({ ...p, findings: { 'a.mjs|x': { bucket: 'fix' }, 'b "q"': { bucket: null } } }), 'passes[0].findings["b \\"q\\""].bucket is null, not fix, defer or reject');

  test('the first failure wins within an entry', async () => {
    await bad(record([{ ...good, n: 9, level: 'low', status: 'x', findings: 1 }]), 1, 'next: passes.json: passes[0].n is 9, not 1');
    await bad(record([{ ...good, level: 'low', status: 'x', findings: 1 }]), 1, 'next: passes.json: passes[0].level is "low", not medium, high or xhigh');
    await bad(record([{ ...good, status: 'x', findings: 1 }]), 1, 'next: passes.json: passes[0].status is "x", not running, complete or failed');
  });

  test('the first entry wins over a later one', async () => {
    await bad(record([{ ...good, findings: 1 }, { ...second, n: 9 }]), 1, 'next: passes.json: passes[0].findings is missing or not an object');
  });

  test('every entry is checked before the latest pass is', async () => {
    await bad(record([{ ...good, level: 'low' }, { ...second, status: 'failed' }]), 1, 'next: passes.json: passes[0].level is "low", not medium, high or xhigh');
    await bad(record([good, { ...second, status: 'failed', changes: 'x' }]), 1, 'next: passes.json: passes[1] is failed; a failed pass has no next level');
  });

  test('a latest pass that is failed has no next level', async () => {
    await bad(record([good, { ...second, status: 'failed' }]), 1, 'next: passes.json: passes[1] is failed; a failed pass has no next level');
  });

  test('a latest pass without changes', async () => {
    await bad(record([good, without('changes')(second)]), 1, 'next: passes.json: passes[1].changes is missing or not an array');
    await bad(record([good, { ...second, changes: 'inside-diff' }]), 1, 'next: passes.json: passes[1].changes is missing or not an array');
  });

  test('a latest pass with a change kind the script does not know', async () => {
    await bad(record([good, { ...second, changes: ['inside-diff', 'rename'] }]), 1, `next: passes.json: passes[1].changes holds "rename", not ${KINDS}`);
    await bad(record([good, { ...second, changes: [7, 'rename'] }]), 1, `next: passes.json: passes[1].changes holds 7, not ${KINDS}`);
  });

  test('a latest pass with docs-only beside a kind that is code or configuration', async () => {
    await bad(record([good, { ...second, changes: ['docs-only', 'schema-or-migration'] }]), 1, 'next: passes.json: passes[1].changes holds "docs-only" beside "schema-or-migration", which documentation cannot be');
    await bad(record([good, { ...second, changes: ['exported-signature', 'inside-diff', 'docs-only'] }]), 1, 'next: passes.json: passes[1].changes holds "docs-only" beside "exported-signature", which documentation cannot be');
  });

  test('a latest pass whose files is not a list of paths', async () => {
    await bad(record([good, { ...second, files: 'src/a.mjs' }]), 1, 'next: passes.json: passes[1].files is not a list of paths');
    await bad(record([{ ...good, files: ['src/a.mjs', 7] }, second]), 1, 'next: passes.json: passes[0].files is not a list of paths');
  });

  test('changes of a pass before the latest are not read', async () => {
    await ok([{ ...without('changes')(good), findings: { 'a|x': { bucket: 'fix' } } }, pass(2, 1, 'high', { changes: [] })], PASS);
  });
});

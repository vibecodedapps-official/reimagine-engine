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
const USAGE = 'usage: node next.mjs <passes.json> <max-passes>';
const KINDS = 'inside-diff, exported-signature, schema-or-migration, outside-diff or over-quarter';

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

// A pass entry. `fix`, `defer` and `reject` list finding ids; `changes` is the fix round's change kinds.
const pass = (n, runNumber, level, { fix = [], defer = [], reject = [], changes = ['inside-diff'], status = 'complete' } = {}) => ({
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
});

const record = (passes) => JSON.stringify({ branch: 'feat/68-4567-export', base: 'main', merge_base: 'abc', runs: [], passes }, null, 2) + '\n';

// A case directory holding passes.json with the given text, and run with the given arguments (default: the file and 4).
const exec = (text, args = ['passes.json', '4']) => {
  const dir = mkdtempSync(join(base, 'case-'));
  if (text !== null) writeFileSync(join(dir, 'passes.json'), text);
  return run(dir, ...args).then((r) => ({ ...r, dir }));
};

// A successful run: exit 0, nothing on stderr, this one stdout line, and nothing written beside the record.
const ok = async (passes, expected, max = '4') => {
  const r = await exec(record(passes), ['passes.json', max]);
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

describe('rule 5, otherwise', { concurrency }, () => {
  test('pass 1 at xhigh with a fix bucket gives high', async () => {
    await ok([pass(1, 1, 'xhigh', { fix: ['a|x'], changes: ['inside-diff'] })], HIGH);
  });

  test('a fix round that changed nothing gives high', async () => {
    await ok([pass(1, 1, 'xhigh', { fix: ['a|x'], changes: [] })], HIGH);
  });

  test('a new reject beside an empty fix bucket at xhigh gives high', async () => {
    await ok([pass(1, 1, 'xhigh', { reject: ['a|x'], changes: [] })], HIGH);
  });

  test('a rejection that was only fixed or deferred earlier is still new', async () => {
    await ok([pass(1, 1, 'xhigh', { fix: ['a|x'] }), pass(2, 1, 'high', { reject: ['a|x'], changes: [] })], HIGH);
    await ok([pass(1, 1, 'xhigh', { defer: ['a|x'], fix: ['a|y'] }), pass(2, 1, 'high', { reject: ['a|x'], changes: [] })], HIGH);
  });
});

describe('rule 3, wide-fix', { concurrency }, () => {
  for (const kind of ['exported-signature', 'schema-or-migration', 'outside-diff', 'over-quarter']) {
    test(`${kind} gives xhigh`, async () => {
      await ok([pass(1, 1, 'xhigh', { fix: ['a|x'], changes: [kind] })], XHIGH);
    });
  }

  test('one wide kind among others gives xhigh', async () => {
    await ok([pass(1, 1, 'xhigh', { fix: ['a|x'], changes: ['inside-diff', 'outside-diff'] })], XHIGH);
  });

  test('a wide change after a high pass gives xhigh', async () => {
    await ok([pass(1, 1, 'xhigh', { fix: ['a|x'] }), pass(2, 1, 'high', { fix: ['a|y'], changes: ['over-quarter'] })], XHIGH);
  });

  test('a wide change with nothing to fix stops by rule 1', async () => {
    await ok([pass(1, 1, 'xhigh', { changes: ['outside-diff'] })], PASS);
  });

  test('the second time gives high: an earlier pass after the first ran at xhigh', async () => {
    await ok(
      [
        pass(1, 1, 'xhigh', { fix: ['a|x'], changes: ['outside-diff'] }),
        pass(2, 1, 'xhigh', { fix: ['a|y'], changes: ['inside-diff'] }),
        pass(3, 1, 'high', { fix: ['a|z'], changes: ['outside-diff'] }),
      ],
      HIGH,
    );
  });

  test('the second time gives high: the latest pass is the xhigh re-review', async () => {
    await ok([pass(1, 1, 'xhigh', { fix: ['a|x'], changes: ['outside-diff'] }), pass(2, 1, 'xhigh', { fix: ['a|y'], changes: ['over-quarter'] })], HIGH);
  });

  test('the first pass of the run at xhigh does not count as the once', async () => {
    await ok([pass(1, 1, 'xhigh', { fix: ['a|x'] }), pass(2, 1, 'high', { fix: ['a|y'], changes: ['over-quarter'] })], XHIGH);
  });

  test('passes of an earlier run do not count', async () => {
    await ok(
      [
        pass(1, 1, 'xhigh', { fix: ['a|x'], changes: ['outside-diff'] }),
        pass(2, 1, 'xhigh', { fix: ['a|y'] }),
        pass(3, 2, 'high', { fix: ['a|z'], changes: ['outside-diff'] }),
      ],
      XHIGH,
    );
  });

  test('a wide change beats two high passes that rejected something new', async () => {
    await ok(
      [
        pass(1, 1, 'xhigh', { fix: ['a|x'] }),
        pass(2, 1, 'high', { reject: ['a|r'], changes: [] }),
        pass(3, 1, 'high', { reject: ['a|s'], changes: ['schema-or-migration'] }),
      ],
      XHIGH,
    );
  });
});

describe('rule 1, nothing-to-fix', { concurrency }, () => {
  test('an empty fix bucket and nothing rejected is pass', async () => {
    await ok([pass(1, 1, 'xhigh', { changes: [] })], PASS);
  });

  test('a fix pass then an empty one is pass', async () => {
    await ok([pass(1, 1, 'xhigh', { fix: ['a|x'] }), pass(2, 1, 'high', { changes: [] })], PASS);
  });

  test('a defer in the latest pass is pass-with-deferred', async () => {
    await ok([pass(1, 1, 'xhigh', { defer: ['a|x'], changes: [] })], '{"stop":"pass-with-deferred","rule":"nothing-to-fix"}');
  });

  test('a defer in an earlier pass of the run is pass-with-deferred', async () => {
    await ok([pass(1, 1, 'xhigh', { fix: ['a|x'], defer: ['a|d'] }), pass(2, 1, 'high', { changes: [] })], '{"stop":"pass-with-deferred","rule":"nothing-to-fix"}');
  });

  test('a defer only in a pass of an earlier run is pass', async () => {
    await ok([pass(1, 1, 'xhigh', { fix: ['a|x'], defer: ['a|d'] }), pass(2, 2, 'xhigh', { changes: [] })], PASS);
  });

  test('a carried rejection counts as nothing', async () => {
    await ok([pass(1, 1, 'xhigh', { fix: ['a|y'], reject: ['a|x'] }), pass(2, 1, 'high', { reject: ['a|x'], changes: [] })], PASS);
  });

  test('a rejection carried from an earlier run counts as nothing', async () => {
    await ok([pass(1, 1, 'xhigh', { reject: ['a|x'], changes: [] }), pass(2, 2, 'xhigh', { reject: ['a|x'], changes: [] })], PASS);
  });

  test('a carried rejection with a defer in the run is pass-with-deferred', async () => {
    await ok(
      [pass(1, 1, 'xhigh', { fix: ['a|y'], reject: ['a|x'], defer: ['a|d'] }), pass(2, 1, 'high', { reject: ['a|x'], changes: [] })],
      '{"stop":"pass-with-deferred","rule":"nothing-to-fix"}',
    );
  });
});

describe('rule 4, rejects-at-high', { concurrency }, () => {
  test('two high passes each with an empty fix bucket and a new reject give medium', async () => {
    await ok(
      [pass(1, 1, 'xhigh', { fix: ['a|x'] }), pass(2, 1, 'high', { reject: ['a|r'], changes: [] }), pass(3, 1, 'high', { reject: ['a|s'], changes: [] })],
      '{"level":"medium","rule":"rejects-at-high"}',
    );
  });

  test('only one such high pass gives high', async () => {
    await ok([pass(1, 1, 'xhigh', { fix: ['a|x'] }), pass(2, 1, 'high', { reject: ['a|r'], changes: [] })], HIGH);
  });

  test('a high pass that still has a fix gives high', async () => {
    await ok(
      [pass(1, 1, 'xhigh', { fix: ['a|x'] }), pass(2, 1, 'high', { reject: ['a|r'], changes: [] }), pass(3, 1, 'high', { fix: ['a|y'], reject: ['a|s'] })],
      HIGH,
    );
    await ok(
      [pass(1, 1, 'xhigh', { fix: ['a|x'] }), pass(2, 1, 'high', { fix: ['a|y'], reject: ['a|r'] }), pass(3, 1, 'high', { reject: ['a|s'], changes: [] })],
      HIGH,
    );
  });

  test('the earlier of the two at xhigh gives high', async () => {
    await ok([pass(1, 1, 'xhigh', { reject: ['a|r'], changes: [] }), pass(2, 1, 'high', { reject: ['a|s'], changes: [] })], HIGH);
  });

  test('the earlier of the two with a carried rejection gives high', async () => {
    await ok(
      [
        pass(1, 1, 'xhigh', { fix: ['a|x'], reject: ['a|r'] }),
        pass(2, 1, 'high', { reject: ['a|r'], changes: [] }),
        pass(3, 1, 'high', { reject: ['a|s'], changes: [] }),
      ],
      HIGH,
    );
  });

  test('the two latest passes of the record count, across runs', async () => {
    await ok(
      [pass(1, 1, 'xhigh', { fix: ['a|x'] }), pass(2, 1, 'high', { reject: ['a|r'], changes: [] }), pass(3, 2, 'high', { reject: ['a|s'], changes: [] })],
      '{"level":"medium","rule":"rejects-at-high"}',
    );
  });
});

describe('rule 2, after-medium', { concurrency }, () => {
  const toMedium = [
    pass(1, 1, 'xhigh', { fix: ['a|x'] }),
    pass(2, 1, 'high', { reject: ['a|r'], changes: [] }),
    pass(3, 1, 'high', { reject: ['a|s'], changes: [] }),
  ];

  test('no fix and nothing new rejected is pass by rule 1', async () => {
    await ok([...toMedium, pass(4, 1, 'medium', { changes: [] })], PASS);
  });

  test('no fix and a carried rejection is pass by rule 1', async () => {
    await ok([...toMedium, pass(4, 1, 'medium', { reject: ['a|s'], changes: [] })], PASS);
  });

  test('no fix and a new reject is pass by after-medium', async () => {
    await ok([...toMedium, pass(4, 1, 'medium', { reject: ['a|t'], changes: [] })], '{"stop":"pass","rule":"after-medium"}');
  });

  test('no fix, a new reject and a defer in the run is pass-with-deferred', async () => {
    await ok(
      [pass(1, 1, 'xhigh', { fix: ['a|x'], defer: ['a|d'] }), ...toMedium.slice(1), pass(4, 1, 'medium', { reject: ['a|t'], changes: [] })],
      '{"stop":"pass-with-deferred","rule":"after-medium"}',
    );
  });

  test('a fix finding is unconverged', async () => {
    await ok([...toMedium, pass(4, 1, 'medium', { fix: ['a|y'] })], '{"stop":"unconverged","rule":"after-medium"}');
  });

  test('a fix finding with a wide change is unconverged, not xhigh', async () => {
    await ok([...toMedium, pass(4, 1, 'medium', { fix: ['a|y'], changes: ['outside-diff'] })], '{"stop":"unconverged","rule":"after-medium"}');
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
    await ok([pass(1, 1, 'xhigh', { fix: ['a|x'], changes: ['over-quarter'] })], '{"level":"xhigh","rule":"wide-fix","capped":"max-passes"}', '1');
  });

  test('a medium level is capped', async () => {
    await ok(
      [pass(1, 1, 'xhigh', { fix: ['a|x'] }), pass(2, 1, 'high', { reject: ['a|r'], changes: [] }), pass(3, 1, 'high', { reject: ['a|s'], changes: [] })],
      '{"level":"medium","rule":"rejects-at-high","capped":"max-passes"}',
      '3',
    );
  });

  test('a stop at the cap is not capped', async () => {
    await ok([...four.slice(0, 3), pass(4, 1, 'high', { changes: [] })], PASS, '4');
    await ok([...four.slice(0, 3), pass(4, 1, 'high', { defer: ['a|d'], changes: [] })], '{"stop":"pass-with-deferred","rule":"nothing-to-fix"}', '4');
    await ok(
      [pass(1, 1, 'xhigh', { fix: ['a|x'] }), pass(2, 1, 'high', { reject: ['a|r'], changes: [] }), pass(3, 1, 'high', { reject: ['a|s'], changes: [] }), pass(4, 1, 'medium', { fix: ['a|y'] })],
      '{"stop":"unconverged","rule":"after-medium"}',
      '4',
    );
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

describe('usage and read errors', { concurrency }, () => {
  for (const args of [[], ['passes.json'], ['passes.json', '0'], ['passes.json', 'two'], ['passes.json', '1.5'], ['passes.json', '-1'], ['passes.json', ''], ['passes.json', '4', 'extra']]) {
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

  test('a latest pass with a change kind outside the five', async () => {
    await bad(record([good, { ...second, changes: ['inside-diff', 'rename'] }]), 1, `next: passes.json: passes[1].changes holds "rename", not ${KINDS}`);
    await bad(record([good, { ...second, changes: [7, 'rename'] }]), 1, `next: passes.json: passes[1].changes holds 7, not ${KINDS}`);
  });

  test('changes of a pass before the latest are not read', async () => {
    await ok([{ ...without('changes')(good), findings: { 'a|x': { bucket: 'fix' } } }, pass(2, 1, 'high', { changes: [] })], PASS);
  });
});

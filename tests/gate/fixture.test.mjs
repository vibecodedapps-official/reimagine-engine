// Builds each variant of the gate's seeded repository (tests/gate/fixture/build.mjs) in its own throwaway
// directory and checks its shape: the bare origin, the clone, the manifest, the shas, the change, and that the
// seeded off-by-one is the only reason the feature's test passes. Needs git and node.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const build = fileURLToPath(new URL('./fixture/build.mjs', import.meta.url));
const usage = 'usage: node build.mjs <converges|defers|cap|carried|split> <dir>';
const fwd = (p) => p.replaceAll('\\', '/');

const run = (file, args, options = {}) =>
  new Promise((resolve) => {
    execFile(file, args, { encoding: 'utf8', ...options }, (error, stdout, stderr) => {
      resolve({ status: error ? (typeof error.code === 'number' ? error.code : -1) : 0, stdout, stderr });
    });
  });

const checks = '{\n  "checks": [\n    "npm test"\n  ]\n}\n';
const capChecks = '{\n  "checks": [\n    "npm test"\n  ],\n  "gate": {\n    "max-passes": 1\n  }\n}\n';

const variants = {
  converges: {
    main: 'fa98f9ec5de74f03952fdb1ca44547ed2063ce29',
    feature: '1964ba5fcc7c9546baae85d94b9e9b50b3503553',
    config: checks,
    numstat: '6\t0\tsrc/stats.mjs\n5\t1\tsrc/stats.test.mjs\n',
  },
  defers: {
    main: 'fa98f9ec5de74f03952fdb1ca44547ed2063ce29',
    feature: 'ec084f1a6e4b9013d0fb7497b08cf321d42b6a39',
    config: checks,
    numstat: '6\t0\tsrc/stats.mjs\n5\t1\tsrc/stats.test.mjs\n10\t0\tsrc/summary.mjs\n7\t0\tsrc/summary.test.mjs\n',
  },
  cap: {
    main: '4018c6906a14f47aabf04a13b8423996d7956ad3',
    feature: '2976ac582eae248834b181cbe9378c4d395a2f89',
    config: capChecks,
    numstat: '6\t0\tsrc/stats.mjs\n5\t1\tsrc/stats.test.mjs\n',
  },
  carried: {
    main: 'fa98f9ec5de74f03952fdb1ca44547ed2063ce29',
    feature: '6ba051a831b6879dab11af16358f113d91078031',
    config: checks,
    numstat: '10\t0\tsrc/share.mjs\n15\t0\tsrc/share.test.mjs\n6\t0\tsrc/stats.mjs\n5\t1\tsrc/stats.test.mjs\n',
  },
  split: {
    main: 'fa98f9ec5de74f03952fdb1ca44547ed2063ce29',
    feature: 'b500af922e230835adf0d355c195ad5ad7d094d6',
    config: checks,
    numstat: '1652\t0\tdata/levels.mjs\n6\t0\tsrc/stats.mjs\n5\t1\tsrc/stats.test.mjs\n',
  },
};

describe('gate fixture builder', { concurrency: true }, () => {
  for (const [name, expected] of Object.entries(variants)) {
    test(`builds the ${name} variant`, async () => {
      const tmp = mkdtempSync(join(tmpdir(), `gate-fixture-${name}-`));
      try {
        const emptyConfig = join(tmp, 'empty-gitconfig');
        writeFileSync(emptyConfig, '');
        const out = join(tmp, 'out');
        if (name === 'defers') mkdirSync(out);

        const built = await run('node', [build, name, out]);
        assert.equal(built.status, 0, built.stderr);
        assert.equal(built.stderr, '');
        const manifestPath = `${fwd(out)}/audit-manifest.json`;
        assert.equal(built.stdout, `${manifestPath}\n`);
        assert.ok(manifestPath.startsWith(`${fwd(tmp)}/`), `${manifestPath} lies inside ${tmp}`);
        assert.deepEqual(readdirSync(out).sort(), ['audit-manifest.json', 'origin.git', 'repo']);

        assert.equal(
          readFileSync(join(out, 'audit-manifest.json'), 'utf8'),
          [
            '{',
            '  "bundles": [',
            '    {',
            `      "repo": "${fwd(out)}/repo",`,
            '      "branch": "feat/percentile",',
            '      "base": "main",',
            '      "tickets": []',
            '    }',
            '  ],',
            '  "claims": []',
            '}',
            '',
          ].join('\n'),
        );

        const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: emptyConfig };
        delete env.NODE_TEST_CONTEXT;
        const gitIn = (cwd) => async (...args) => {
          const r = await run('git', args, { cwd, env });
          assert.equal(r.status, 0, `git ${args.join(' ')}\n${r.stderr}`);
          return r.stdout;
        };
        const origin = gitIn(join(out, 'origin.git'));
        const repo = gitIn(join(out, 'repo'));

        assert.equal(await origin('symbolic-ref', 'HEAD'), 'refs/heads/main\n');
        assert.equal(
          await origin('for-each-ref', '--format=%(refname) %(objectname)'),
          `refs/heads/feat/percentile ${expected.feature}\nrefs/heads/main ${expected.main}\n`,
        );
        assert.equal(await origin('log', '--format=%s', 'main'), 'chore: start the stats module\n');
        assert.equal(await origin('log', '--format=%s', 'main..feat/percentile'), 'feat(stats): add a percentile function\n');
        assert.equal(await origin('log', '--format=%an <%ae> %aI', 'main'), 'Fixture <fixture@example.invalid> 2026-10-01T09:00:00Z\n');
        assert.equal(
          await origin('log', '--format=%cn <%ce> %cI', 'main..feat/percentile'),
          'Fixture <fixture@example.invalid> 2026-10-01T10:00:00Z\n',
        );
        assert.equal(await origin('show', 'main:.reimagine.json'), expected.config);
        assert.equal(await origin('diff', '--numstat', 'main...feat/percentile'), expected.numstat);

        assert.equal(await repo('rev-parse', '--abbrev-ref', 'HEAD'), 'main\n');
        assert.equal(await repo('status', '--porcelain'), '');
        assert.equal(await repo('remote'), 'origin\n');
        assert.equal(await repo('config', '--local', 'user.name'), 'Fixture\n');
        assert.equal(await repo('config', '--local', 'user.email'), 'fixture@example.invalid\n');

        // The feature branch in a copy of its own: the test passes, and fails once the seeded off-by-one is fixed.
        const copy = join(tmp, 'copy');
        await gitIn(tmp)('clone', '--quiet', '--branch', 'feat/percentile', fwd(join(out, 'origin.git')), copy);
        const childEnv = { ...env };
        const tests = await run('node', ['--test'], { cwd: copy, env: childEnv });
        assert.equal(tests.status, 0, tests.stdout + tests.stderr);

        const source = join(copy, 'src', 'stats.mjs');
        const text = readFileSync(source, 'utf8');
        assert.equal(text.split('sorted[rank]').length, 2, 'the source holds sorted[rank] once');
        writeFileSync(source, text.replace('sorted[rank]', 'sorted[rank - 1]'));
        const fixed = await run('node', ['--test'], { cwd: copy, env: childEnv });
        assert.notEqual(fixed.status, 0, fixed.stdout);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  }

  test('rejects a bad command line with exit 2 and the usage line', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'gate-fixture-usage-'));
    try {
      const full = join(tmp, 'full');
      mkdirSync(full);
      writeFileSync(join(full, 'keep.txt'), 'kept\n');

      const cases = [
        { args: [], problem: 'build.mjs: no variant given' },
        { args: ['bogus', join(tmp, 'x')], problem: 'build.mjs: unknown variant "bogus"' },
        { args: ['converges'], problem: 'build.mjs: no directory given' },
        { args: ['converges', full], problem: `build.mjs: directory is not empty: ${full}` },
        { args: ['converges', join(full, 'keep.txt')], problem: `build.mjs: not a directory: ${join(full, 'keep.txt')}` },
      ];
      for (const { args, problem } of cases) {
        const r = await run('node', [build, ...args]);
        assert.equal(r.status, 2, `${args.join(' ')}: ${r.stderr}`);
        assert.equal(r.stdout, '');
        assert.equal(r.stderr, `${problem}\n${usage}\n`);
      }
      assert.deepEqual(readdirSync(full), ['keep.txt']);
      assert.deepEqual(readdirSync(tmp).sort(), ['full']);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

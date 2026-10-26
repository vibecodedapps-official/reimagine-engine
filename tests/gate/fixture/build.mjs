#!/usr/bin/env node
// build.mjs: build the gate's seeded repository, a small Node module whose feature branch holds an off-by-one
// in a new function beside a test that passes only because of it, for the gate's eval cases and acceptance items.
// Usage: node tests/gate/fixture/build.mjs <converges|defers|cap|carried|split> <dir>
// <dir> does not exist yet or is empty. It gets origin.git (a bare repository with main and feat/percentile, HEAD
// on main), repo (a clone of it, on main) and audit-manifest.json; stdout is the manifest's absolute path.
// Exit 0, or 2 for a usage error or a failing git call. Git runs with a fixed identity, fixed dates, no global or
// system config, no signing and no line-ending conversion, so a variant has the same shas on every machine.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const VARIANTS = ['converges', 'defers', 'cap', 'carried', 'split'];
const USAGE = `usage: node build.mjs <${VARIANTS.join('|')}> <dir>`;
const BASE_DATE = '2026-10-01T09:00:00Z';
const FEATURE_DATE = '2026-10-01T10:00:00Z';
const BRANCH = 'feat/percentile';

const fwd = (p) => p.replaceAll('\\', '/');
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

function usageError(problem) {
  process.stderr.write(`build.mjs: ${problem}\n${USAGE}\n`);
  process.exit(2);
}

const [variant, dir] = process.argv.slice(2);
if (variant === undefined) usageError('no variant given');
if (!VARIANTS.includes(variant)) usageError(`unknown variant "${variant}"`);
if (dir === undefined) usageError('no directory given');
const found = statSync(dir, { throwIfNoEntry: false });
if (found && !found.isDirectory()) usageError(`not a directory: ${dir}`);
if (found && readdirSync(dir).length > 0) usageError(`directory is not empty: ${dir}`);
const out = resolve(dir);

const STATS = `export function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

export function mean(values) {
  return sum(values) / values.length;
}
`;

const STATS_TEST = `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mean, sum } from './stats.mjs';

test('sum adds the values', () => {
  assert.equal(sum([1, 2, 3, 4]), 10);
});

test('mean divides the sum by the count', () => {
  assert.equal(mean([1, 2, 3, 4]), 2.5);
});
`;

const PERCENTILE = `
export function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[rank];
}
`;

const PERCENTILE_TEST = `
test('percentile returns the nearest-rank value', () => {
  assert.equal(percentile([1, 2, 3, 4], 50), 3);
});
`;

const SUMMARY = `function addUp(values) {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

export function summary(values) {
  const total = addUp(values);
  return { count: values.length, total, average: total / values.length };
}
`;

const SUMMARY_TEST = `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summary } from './summary.mjs';

test('summary counts, adds and averages the values', () => {
  assert.deepEqual(summary([1, 2, 3, 4]), { count: 4, total: 10, average: 2.5 });
});
`;

const SHARE = `function share(part, whole) {
  return part / whole;
}

export function shares(values) {
  if (values.length === 0) return [];
  const whole = values.reduce((total, value) => total + Math.abs(value), 0);
  if (whole === 0) return values.map(() => 0);
  return values.map((value) => share(value, whole));
}
`;

const SHARE_TEST = `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shares } from './share.mjs';

test('shares divides each value by the sum of the absolute values', () => {
  assert.deepEqual(shares([1, 3]), [0.25, 0.75]);
});

test('shares of an empty list is empty', () => {
  assert.deepEqual(shares([]), []);
});

test('shares of an all-zero list is all zero', () => {
  assert.deepEqual(shares([0, 0]), [0, 0]);
});
`;

function levels() {
  const lines = ['export const levels = ['];
  for (let i = 0; i < 1650; i += 1) lines.push(`  ${(i * 7919) % 10007},`);
  lines.push('];', '');
  return lines.join('\n');
}

const tmp = mkdtempSync(join(tmpdir(), 'gate-build-'));
const emptyConfig = join(tmp, 'gitconfig');
writeFileSync(emptyConfig, '');

function fail(message) {
  rmSync(tmp, { recursive: true, force: true });
  process.stderr.write(`build.mjs: ${message}\n`);
  process.exit(2);
}

const env = { ...process.env };
for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']) delete env[key];
Object.assign(env, {
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: emptyConfig,
  GIT_AUTHOR_NAME: 'Fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
  GIT_COMMITTER_NAME: 'Fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
});

function git(cwd, date, ...args) {
  const result = spawnSync(
    'git',
    ['-c', 'core.autocrlf=false', '-c', 'init.defaultBranch=main', '-c', 'commit.gpgsign=false', ...args],
    { cwd, env: { ...env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }, encoding: 'utf8' },
  );
  if (result.status !== 0) fail(`git ${args.slice(0, 2).join(' ')} failed`);
}

function write(root, files) {
  for (const [name, content] of Object.entries(files)) {
    const path = join(root, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
}

function commit(root, date, message) {
  git(root, date, 'add', '-A');
  git(root, date, 'commit', '--quiet', '-m', message);
}

const work = join(tmp, 'work');
mkdirSync(work);
git(work, BASE_DATE, 'init', '--quiet');
write(work, {
  'package.json': json({ name: 'stats', private: true, type: 'module', scripts: { test: 'node --test' } }),
  'src/stats.mjs': STATS,
  'src/stats.test.mjs': STATS_TEST,
  '.reimagine.json': json(variant === 'cap' ? { checks: ['npm test'], gate: { 'max-passes': 1 } } : { checks: ['npm test'] }),
});
commit(work, BASE_DATE, 'chore: start the stats module');

git(work, FEATURE_DATE, 'checkout', '--quiet', '-b', BRANCH);
const feature = {
  'src/stats.mjs': STATS + PERCENTILE,
  'src/stats.test.mjs': STATS_TEST.replace('{ mean, sum }', '{ mean, percentile, sum }') + PERCENTILE_TEST,
};
if (variant === 'defers') Object.assign(feature, { 'src/summary.mjs': SUMMARY, 'src/summary.test.mjs': SUMMARY_TEST });
if (variant === 'carried') Object.assign(feature, { 'src/share.mjs': SHARE, 'src/share.test.mjs': SHARE_TEST });
if (variant === 'split') feature['data/levels.mjs'] = levels();
write(work, feature);
commit(work, FEATURE_DATE, 'feat(stats): add a percentile function');

mkdirSync(out, { recursive: true });
const origin = join(out, 'origin.git');
const repo = join(out, 'repo');
git(out, BASE_DATE, 'init', '--quiet', '--bare', fwd(origin));
git(work, BASE_DATE, 'push', '--quiet', fwd(origin), 'main', BRANCH);
git(out, BASE_DATE, 'clone', '--quiet', fwd(origin), fwd(repo));
git(repo, BASE_DATE, 'config', 'user.name', 'Fixture');
git(repo, BASE_DATE, 'config', 'user.email', 'fixture@example.invalid');

const manifest = join(out, 'audit-manifest.json');
writeFileSync(manifest, json({ bundles: [{ repo: fwd(repo), branch: BRANCH, base: 'main', tickets: [] }], claims: [] }));
rmSync(tmp, { recursive: true, force: true });
process.stdout.write(`${fwd(manifest)}\n`);

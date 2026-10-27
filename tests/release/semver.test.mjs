// Checks the SEMVER pattern of tools/semver.mjs against literal versions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEMVER } from '../../tools/semver.mjs';

test('R221: SEMVER accepts a version with a prerelease of numbers, words and hyphens', () => {
  assert.equal(SEMVER.test('0.1.0-alpha.1'), true);
  assert.equal(SEMVER.test('0.1.0-0'), true);
  assert.equal(SEMVER.test('1.2.3-x-1.0'), true);
});

test('R221: SEMVER rejects a numeric prerelease identifier with a leading zero', () => {
  assert.equal(SEMVER.test('0.1.1-01'), false);
  assert.equal(SEMVER.test('0.1.1-alpha.01'), false);
});

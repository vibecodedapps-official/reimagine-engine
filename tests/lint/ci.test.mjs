// Checks the concurrency setting of .github/workflows/ci.yml.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const workflow = readFileSync(fileURLToPath(new URL('../../.github/workflows/ci.yml', import.meta.url)), 'utf8');

test('R222: a run in progress is cancelled only on a pull request', () => {
  assert.ok(workflow.split(/\r?\n/).includes("  cancel-in-progress: ${{ github.event_name == 'pull_request' }}"));
  assert.ok(!workflow.includes('cancel-in-progress: true'));
});

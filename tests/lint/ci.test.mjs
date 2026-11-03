// Checks the concurrency setting of .github/workflows/ci.yml and the trigger and input of pr-description.yml.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const workflow = readFileSync(fileURLToPath(new URL('../../.github/workflows/ci.yml', import.meta.url)), 'utf8');

test('R222: a run in progress is cancelled only on a pull request', () => {
  assert.ok(workflow.split(/\r?\n/).includes("  cancel-in-progress: ${{ github.event_name == 'pull_request' }}"));
  assert.ok(!workflow.includes('cancel-in-progress: true'));
});

const description = readFileSync(
  fileURLToPath(new URL('../../.github/workflows/pr-description.yml', import.meta.url)),
  'utf8',
).split(/\r?\n/);

test('R222: the description check runs again when a pull request description is edited', () => {
  assert.ok(description.includes('    types: [opened, edited, reopened, synchronize]'));
});

test('R222: the description reaches the check through the environment, never typed into the command', () => {
  assert.ok(description.includes('          BODY: ${{ github.event.pull_request.body }}'));
  assert.ok(description.includes(`        run: printf '%s' "$BODY" | node tools/commit-messages.mjs --description`));
  assert.equal(description.filter((line) => line.includes('pull_request.body')).length, 1);
});

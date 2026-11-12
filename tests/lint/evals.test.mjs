// Checks that an eval grader over a run's trace cannot pass on the text of a plugin its case loads: the trace holds
// a skill's text once the skill loads, so such a grader would pass whatever the run printed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const evals = fileURLToPath(new URL('../evals/', import.meta.url));
const dirs = (dir) => readdirSync(dir).map((n) => join(dir, n)).filter((p) => statSync(p).isDirectory());
const files = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? files(p) : [p];
});
const field = (text, name) => (new RegExp('^' + name + ':[ \\t]*(.*)$', 'm').exec(text) ?? [])[1]?.trim();
const unquote = (s) => (/^'.*'$/.test(s) ? s.slice(1, -1).replaceAll("''", "'") : s);

test('R273: a regex grader over the trace matches no file of a plugin its case loads', () => {
  const hits = [];
  let graders = 0;
  for (const plugin of dirs(evals)) {
    for (const dir of dirs(plugin)) {
      if (!existsSync(join(dir, 'prompt.md'))) continue;
      const loaded = JSON.parse(field(readFileSync(join(dir, 'prompt.md'), 'utf8'), 'plugins'));
      for (const grader of files(join(dir, 'graders'))) {
        const text = readFileSync(grader, 'utf8');
        if (field(text, 'type') !== 'regex' || field(text, 'target') !== 'trace') continue;
        graders++;
        const pattern = new RegExp(unquote(field(text, 'pattern')));
        for (const root of loaded) {
          for (const file of files(join(dir, root))) {
            if (pattern.test(readFileSync(file, 'utf8'))) hits.push(`${relative(evals, grader)} matches ${relative(join(evals, '..', '..'), file)}`);
          }
        }
      }
    }
  }
  assert.ok(graders > 0, 'no regex grader over a trace was found');
  assert.deepEqual(hits.map((h) => h.replaceAll('\\', '/')), []);
});

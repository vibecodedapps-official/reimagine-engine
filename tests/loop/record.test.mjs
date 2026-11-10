// The record rules in record.md: its files, the completion record's shape, the commit line a later run reads, and the sections the other skill files cite from it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const DIR = new URL('../../plugins/loop/skills/run/', import.meta.url);
const read = (path) => readFileSync(new URL(path, DIR), 'utf8').replace(/\r/g, '');
const FILES = [
  ...readdirSync(DIR).filter((name) => name.endsWith('.md')),
  ...readdirSync(new URL('steps/', DIR)).filter((name) => name.endsWith('.md')).map((name) => `steps/${name}`),
];
const RECORD = read('record.md');
const REPORT = read('report.md');

// The text of a "## <heading>" section, up to the next "## " heading.
const section = (text, heading) => {
  const start = text.indexOf(`\n## ${heading}\n`);
  if (start === -1) return null;
  const end = text.indexOf('\n## ', start + 1);
  return end === -1 ? text.slice(start) : text.slice(start, end);
};

test('every section of record.md that a skill file cites by name exists', () => {
  let cited = 0;
  for (const file of FILES) {
    for (const match of read(file).matchAll(/`record\.md`(?:, | \()([A-Z][a-z]+(?: [a-z]+)*)/g)) {
      cited++;
      assert.notEqual(section(RECORD, match[1]), null, `${file} cites record.md, ${match[1]}, and record.md has no such section`);
    }
  }
  assert.ok(cited >= 2, `only ${cited} citations of record.md sections found`);
});

test('R82: record.md, Files, has one row for each file of the record, in order', () => {
  const rows = section(RECORD, 'Files').split('\n').filter((line) => line.startsWith('| `')).map((line) => [...line.split('|')[1].matchAll(/`([^`]+)`/g)].map((m) => m[1]));
  assert.deepEqual(rows, [
    ['inputs.md'],
    ['plan.md'],
    ['run.md'],
    ['steps.json'],
    ['report.md'],
    ['handoff.md', 'audit-manifest.json', 'export-<id-slug>.md'],
    ['pre-<n>.status', 'pre-<n>.patch', 'pre-<n>.hashes'],
    ['post-<n>.status', 'post-<n>.hashes'],
    ['diff.patch', 'diff-<slug>.patch'],
    ['pr-body.md', 'pr-body-<slug>.md'],
    ['comment-<n>.md'],
    ['ticket-<id-slug>.md'],
    ['record-<id-slug>.md'],
    ['item-<k>.md'],
    ['item-<k>-record.md'],
    ['text-<k>.md'],
  ]);
});

test('R87: the commit line a later run reads is written the same in every file that gives it, and Step 7.1 and record.md both give it', () => {
  const holders = [];
  for (const file of FILES) {
    const forms = [...read(file).matchAll(/`(- commit [^`]*)`/g)].map((m) => m[1]);
    if (forms.length > 0) holders.push(file);
    for (const form of forms) assert.equal(form, '- commit <full sha> <subject>', `${file} writes the commit line another way`);
  }
  assert.deepEqual(holders, ['record.md', 'steps/7-publish.md']);
});

test('R83, R89: the steps.json example parses, with the keys and statuses the prose names', () => {
  const text = section(RECORD, 'steps.json');
  const steps = JSON.parse(text.split('```json\n')[1].split('\n```')[0]);
  assert.deepEqual(Object.keys(steps), ['branch', 'tickets', 'runs', 'steps']);
  assert.deepEqual(Object.keys(steps.runs[0]), ['n', 'started', 'ended', 'state', 'pr']);
  assert.deepEqual(Object.keys(steps.steps['0']), ['status', 'run', 'started', 'ended', 'inputs', 'outputs']);
  assert.deepEqual(Object.keys(steps.steps['4']), ['status', 'run', 'started', 'ended', 'inputs', 'outputs', 'slices']);
  assert.deepEqual(Object.keys(steps.steps['4'].slices['export-api']), ['status', 'run', 'tickets', 'commit']);
  for (const name of ['branch', 'tickets', 'runs', 'steps', 'n', 'started', 'ended', 'state', 'pr', 'status', 'run', 'inputs', 'outputs', 'slices', 'commit', 'files']) {
    assert.ok(text.includes(`\`${name}\``), `steps.json, in record.md, does not name \`${name}\``);
  }
  const statuses = text.split('`status` (')[1].split(')')[0].match(/`([a-z]+)`/g).map((word) => word.slice(1, -1));
  assert.deepEqual(statuses, ['running', 'complete', 'failed', 'skipped']);
  const flat = [...Object.values(steps.steps), ...Object.values(steps.steps['4'].slices)];
  for (const entry of flat) assert.ok(statuses.includes(entry.status), `the example has the status ${entry.status}`);
  const states = section(read('SKILL.md'), 'Terminal states').match(/^- `([a-z-]+)`:/gm).map((line) => line.slice(3, -2));
  for (const run of steps.runs) assert.ok(['running', 'interrupted', ...states].includes(run.state), `the example has the run state ${run.state}`);
});

test('R89: record.md writes the hash of a slice\'s file with -- before the path, so a path starting with - is not read as an option', () => {
  const commands = [...RECORD.matchAll(/`(git [^`]*hash-object [^`]*<path>)`/g)].map((m) => m[1]);
  assert.ok(commands.length >= 1, 'record.md shows no hash-object command on a <path>');
  for (const command of commands) assert.ok(command.includes(' -- <path>'), `${command} has no -- before <path>`);
});

test('R96: the commit snapshot commits the plan and the report under docs/runs, keeping three sections of the report and leaving out the rest', () => {
  const text = section(RECORD, 'Commit snapshot');
  assert.notEqual(text, null);
  for (const path of ['docs/runs/<branch-slug>/plan.md', 'docs/runs/<branch-slug>/report-<n>.md']) assert.ok(text.includes(path), `Commit snapshot does not name ${path}`);
  const headings = [...REPORT.split('\n## Template\n')[1].split('\n```\n')[1].matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  const kept = text.split('\n').find((line) => line.startsWith('3. '));
  for (const name of ['What changed', 'Checks', 'Blocked, stopped or prepared']) {
    assert.ok(headings.includes(name), `the report has no ${name} section`);
    assert.ok(kept.includes(name), `the external form does not keep ${name}`);
  }
  assert.deepEqual(kept.split('leaves out ')[1].split('. ')[0].split(/, (?:and )?/), [
    'Attended or unattended', 'Risk', 'Decisions', 'Decisions for you', 'Findings rejected and why', 'Open items', 'Log',
  ]);
});

// What leaves a loop run is written for its reader: the open items of a run, the tickets they become and the texts that
// reach a pull request or a ticket (R54, R56, R117, R351, R352).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const DIR = new URL('../../plugins/loop/skills/run/', import.meta.url);
const read = (path) => readFileSync(new URL(path, DIR), 'utf8').replace(/\r/g, '');
const FILES = [
  ...readdirSync(DIR).filter((name) => name.endsWith('.md')),
  ...readdirSync(new URL('steps/', DIR)).filter((name) => name.endsWith('.md')).map((name) => `steps/${name}`),
];
const PREFLIGHT = read('steps/0-preflight.md');
const BUILD = read('steps/4-build.md');
const PUBLISH = read('steps/7-publish.md');
const PR_BODY = read('pr-body.md');
const TICKETS = read('tickets.md');

// The text of a "## <heading>" section, up to the next "## " heading.
const section = (text, heading) => {
  const start = text.indexOf(`\n## ${heading}\n`);
  assert.notEqual(start, -1, `no "## ${heading}" section`);
  const end = text.indexOf('\n## ', start + 1);
  return end === -1 ? text.slice(start) : text.slice(start, end);
};

// The backticked commands a text shows that start with a prefix, as the text inside the backticks.
const commands = (text, prefix) => [...text.matchAll(new RegExp(`\`(${prefix}[^\`]*)\``, 'g'))].map((m) => m[1]);

test('R54, R56: the printed permission statement lists the actions that always ask', () => {
  const line = PREFLIGHT.split('\n').find((text) => text.startsWith('Always asked: '));
  assert.notEqual(line, undefined, 'the permission statement template has no Always asked line');
  assert.deepEqual(line.slice('Always asked: '.length).split('. ')[0].split(', '), [
    'force push', '--no-verify', 'merge', 'deploy', 'repository settings', 'any other new issue',
  ]);
});

test('R352: the - ticket and - draft log lines are written one way, in record.md and tickets.md alone', () => {
  const forms = { ticket: '- ticket <ref> <new | existing | source> artifact <number | none>: <one line>', draft: '- draft <file>: <one line>' };
  for (const [kind, form] of Object.entries(forms)) {
    const holders = [];
    for (const file of FILES) {
      const written = commands(read(file), `- ${kind} <`);
      if (written.length > 0) holders.push(file);
      for (const line of written.filter((text) => text.includes(' | ') || kind === 'draft')) assert.equal(line, form, `${file} writes the ${kind} line another way`);
    }
    assert.deepEqual(holders, ['record.md', 'tickets.md'], `the ${kind} line is written outside record.md and tickets.md`);
  }
  assert.ok(commands(TICKETS, '- ticket <ref> new artifact none').includes('- ticket <ref> new artifact none: <one line>'), 'the shortened ticket line does not follow the form');
});

test('R351: tickets.md settles each open item as one of three outcomes', () => {
  const list = section(TICKETS, 'Open items').split('as one of three, with its evidence:\n')[1].split('\n\n')[0];
  assert.deepEqual([...list.matchAll(/^- ([^:]+): /gm)].map((m) => m[1]), ['Settled by the run', 'A decision for the user', 'Filed to a ticket']);
});

test('R351: Step 7.2 pushes, then settles the open items, then writes the body files, then opens or comments on the pull request', () => {
  const text = section(PUBLISH, '7.2 Push and pull request');
  const at = [
    text.indexOf('`git -C <checkout> push -u <remote> <branch>`'),
    text.indexOf('**Open items.**'),
    text.indexOf('**No open pull request on the branch.**'),
    text.indexOf('**One open pull request on the branch.**'),
  ];
  assert.ok(at.every((place) => place !== -1), 'Step 7.2 lacks a part');
  assert.deepEqual(at, [...at].sort((a, b) => a - b), 'the parts of Step 7.2 are out of order');
});

test('R351: on a host other than github, Step 6 reads tickets.md before pr-body.md', () => {
  const step = section(BUILD, 'Step 6 Checks');
  const other = step.slice(step.indexOf('On any other host'));
  assert.ok(other.includes('`tickets.md`') && other.includes('`pr-body.md`'), 'Step 6 does not read both on other');
  assert.ok(other.indexOf('`tickets.md`') < other.indexOf('`pr-body.md`'), 'Step 6 writes the body before it settles the open items');
});

test('R352: a gh issue command names its repository, an az boards command passes its text as a file, and the artifact calls keep their shape', () => {
  let issues = 0;
  let boards = 0;
  for (const file of FILES) {
    const text = read(file);
    for (const command of commands(text, 'gh issue (?:list|create|comment) ')) {
      issues++;
      assert.ok(command.includes(' -R <owner>/<repo> '), `${file} shows ${command} without -R <owner>/<repo>`);
    }
    for (const command of commands(text, 'az boards work-item (?:create|update) --org ')) {
      boards++;
      assert.ok(command.includes('@<absolute path>'), `${file} shows ${command} with its text inline`);
    }
  }
  assert.ok(issues >= 4 && boards >= 3, `only ${issues} gh issue and ${boards} az boards commands found`);
  assert.deepEqual(commands(TICKETS, 'gh api '), [
    'gh api --hostname <host> --method POST repos/<owner>/<repo>/issues/<n>/artifacts -f name="<name>" -F body=@<absolute path>',
    'gh api --hostname <host> --method PATCH repos/<owner>/<repo>/issues/<n>/artifacts/<number> -F body=@<absolute path>',
  ]);
  assert.ok(commands(TICKETS, 'gh issue list ').includes('gh issue list -R <owner>/<repo> --search "<terms>" --state all --json number,title,state,url'));
  assert.ok(TICKETS.includes('`Record for <branch-slug>`'));
  for (const tool of ['`wit_work_item_attachment_upload`', '`wit_work_item_attachment_link`']) assert.ok(TICKETS.includes(tool), `tickets.md does not name ${tool}`);
});

test('R117: the pull request body has its sections in order, and the continued comment swaps Closes for Issues', () => {
  const body = PR_BODY.split('```\n')[1];
  assert.deepEqual([...body.matchAll(/^## (.+)$/gm)].map((m) => m[1]), [
    'What changed', 'Where the ticket and the code differ', 'Decisions for the reviewer', 'Checks not run', 'Follow-ups', 'Related pull requests', 'Closes',
  ]);
  const comment = PR_BODY.split('\n## Continued pull request comment\n')[1].split('```\n')[1];
  assert.deepEqual(comment.trim().split('\n'), ['## Issues', '<ref>: complete', '<ref>: partial']);
});

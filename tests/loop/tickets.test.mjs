// What leaves a loop run is written for its reader: the open items of a run, the tickets they become, and the
// texts that reach a pull request or a ticket (R54, R56, R96, R117, R118, R137, R349, R351, R352).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadTexts, units } from '../../plugins/rules/scripts/rules.mjs';

const DIR = fileURLToPath(new URL('../../plugins/loop/skills/run/', import.meta.url));
const read = (path) => readFileSync(DIR + path, 'latin1').replace(/\r\n/g, '\n');
const SKILL = read('SKILL.md');
const PREFLIGHT = read('steps/0-preflight.md');
const BUILD = read('steps/4-build.md');
const PUBLISH = read('steps/7-publish.md');
const PR_BODY = read('pr-body.md');
const REPORT = read('report.md');
const RECORD = read('record.md');
const HANDOFF = read('handoff.md');
const TICKETS = read('tickets.md');
const READ_POINTS =
  'once per run, before any body or comment is written: in Step 7.2 after the first push has returned; or, on a run that ends `prepared`, before its body file is written (Step 7\'s opening, a denial before the first push, the end of Step 6 on `other`).';
const README = readFileSync(DIR + '../../README.md', 'latin1').replace(/\r\n/g, '\n');

// The text of a "## <heading>" section, up to the next "## " heading.
const section = (text, heading) => {
  const start = text.indexOf(`\n## ${heading}\n`);
  assert.notEqual(start, -1, `no "## ${heading}" section`);
  const end = text.indexOf('\n## ', start + 1);
  return end === -1 ? text.slice(start) : text.slice(start, end);
};

const ITEM_A =
  'What leaves the session is written for its reader, not for the work that made it. Run output, such as verdicts, pass lists, levels, commit ids, manifests, logs and handoff context, is for an agent or a later session: it stays in the local run folder or a record attached to a ticket, and outside the session that record is the only place a term a plugin or session coined may appear. A pull request carries only what its reviewer needs about the code in it, as technical as the code needs, in the team\'s words, true of the head it describes and replaced when a push makes it stale. A ticket tells its readers what changed for them, what happens next and who decides, never how it was reached or with what tools; technical detail that must travel with it goes in an attached record, not in its body or a comment.';
const ITEM_B =
  'Output stays local unless publishing is the task\'s stated purpose or I asked for it. Before any post, check that its reader will act on it and that it holds nothing they would not say themselves.';

const leavesTheRun = () => {
  const lines = SKILL.split('\n');
  const start = lines.indexOf('## What leaves the run');
  assert.notEqual(start, -1, 'SKILL.md has no "## What leaves the run" heading');
  const end = lines.findIndex((line, i) => i > start && line.startsWith('## '));
  return lines.slice(start + 1, end === -1 ? undefined : end);
};

for (const [name, prefix, literal] of [
  ['item A', 'What leaves the session is written for its reader', ITEM_A],
  ['item B', 'Output stays local unless publishing', ITEM_B],
]) {
  test(`R349: the loop SKILL.md carries core.md ${name} word for word under What leaves the run`, () => {
    const found = units(loadTexts()['core.md']).list.filter((u) => u.kind === 'item' && u.norm.startsWith(prefix));
    assert.equal(found.length, 1, `core.md has ${found.length} items that start "${prefix}"`);
    assert.equal(found[0].norm, literal);
    assert.ok(leavesTheRun().includes('- ' + found[0].norm), `SKILL.md lacks the line for ${name}`);
  });
}

test('R349: the literals the loop pins equal the lines SKILL.md carries', () => {
  const lines = leavesTheRun();
  assert.ok(lines.includes('- ' + ITEM_A));
  assert.ok(lines.includes('- ' + ITEM_B));
});

test('R54: invoking the loop approves ticket filing for open items and the record attached to each ticket', () => {
  assert.ok(SKILL.includes('commenting on the source tickets, and, for the open items of `tickets.md`, opening a ticket or commenting on an existing one, and attaching a record to each ticket the run comments on or opens. Five rules bound that grant.'));
});

test('R56: only an issue other than an open item\'s ticket always prompts', () => {
  assert.ok(SKILL.includes('editing repository settings, and opening an issue other than an open item\'s ticket always prompt.'));
  assert.ok(!SKILL.includes('and opening a new issue always prompt'));
});

test('R55: one question covers the tickets of all the open items, and a non-yes is not a denial', () => {
  const rule = section(SKILL, 'Approval scope').split('\n').find((line) => line.startsWith('1. '));
  assert.ok(rule.includes('An ask-first rule that covers a new issue or a comment is asked once for all the tickets of the run\'s open items, listing each with its title and tracker, never once per ticket; a non-yes leaves them unfiled, each a draft as on a `prepared` run; that, and a refused filing or comment of an open item, is not a denial under rule 3.'));
});

test('R54, R56: the printed permission statement names ticket filing and any other new issue', () => {
  assert.ok(PREFLIGHT.includes('Approved for this run: create the branch, commit, push it, open one pull request per repository, edit the body of a pull request this loop opened, one comment per run on it, comment on the source tickets, and for the open items the run cannot settle, open a ticket or comment on an existing one and attach a record.'));
  assert.ok(PREFLIGHT.includes('Always asked: force push, --no-verify, merge, deploy, repository settings, any other new issue.'));
  assert.ok(PREFLIGHT.includes('(force push, `--no-verify`, merge, anything that deploys, repository settings, any other new issue)'));
  assert.ok(PREFLIGHT.includes('the tickets and records filed for open items'));
  assert.ok(PREFLIGHT.includes('the open items question, when an ask-first rule covers a new issue or a comment'));
});

test('R54: the plan summary says the open items the run cannot settle are filed to tickets', () => {
  const step = section(BUILD, 'Step 3.6 Plan confirmation');
  assert.ok(step.includes('and that open items the run cannot settle are filed to tickets under this approval (`tickets.md`)'));
});

test('R351: tickets.md is read once per run, before any body or comment, at the points of a published run and of a prepared one', () => {
  assert.ok(section(SKILL, 'Supporting files').includes('- `tickets.md`: ' + READ_POINTS));
  assert.ok(TICKETS.split('\n')[2].startsWith('Read this file ' + READ_POINTS));
});

test('R351: a prepared ending before the first push writes the drafts and the body files before it ends', () => {
  assert.ok(section(PUBLISH, 'Opening').includes('A question about a commit, a push or a pull request, raised because an ask-first rule applies, ends the run `prepared` when the answer before any push is anything but a clear yes: write the drafts and body files first, as the opening says.'));
  assert.ok(section(PUBLISH, '7.2 Push and pull request').includes('treat any answer but a clear yes as a denial. A denial before the first push ends the run `prepared`: write the drafts and body files first, as the opening says.'));
  assert.ok(section(SKILL, 'Approval scope').includes('A Step 7 denial before any push ends `prepared`, once Step 7\'s opening has written the drafts and body files.'));
  const files = section(RECORD, 'Files');
  for (const row of ['| `item-<k>.md` |', '| `item-<k>-record.md` |']) {
    const line = files.split('\n').find((l) => l.startsWith(row));
    assert.ok(line.includes('| Step 7.2 or 7.3, or on a run that ends `prepared`, before its body file is written (Step 7\'s opening, a denial before the first push, the end of Step 6 on `other`) |'), `${row} does not name the read points`);
  }
});

test('R351: a CI repair pass sends its open items through tickets.md and one more body edit lists a ticket it files', () => {
  assert.ok(section(PUBLISH, '7.3 CI').includes('then run Step 6 in full once. An open item the pass adds goes through `tickets.md` as in 7.2. On a pull request this loop opened, update its body once, when 7.3 ends without a block, if a repair cycle pushed a commit that makes the body untrue of the new head or its pass filed a ticket: write it again as 7.2 does and run `gh pr edit <pr> --body-file <absolute path>`. Otherwise the report names the ticket.'));
  assert.ok(section(PUBLISH, '7.2 Push and pull request').includes('This is the run\'s only edit of that body, except the one in 7.3, item 3, after a repair;'));
  assert.ok(section(PUBLISH, '7.5 Open items').includes('The open items were settled in 7.2, before any body or comment, and those a CI repair pass added in 7.3 (`tickets.md`).'));
});

test('R96: the committed snapshot has no Open items, since no item has an outcome before the first push', () => {
  const text = section(RECORD, 'Commit snapshot');
  assert.ok(text.includes('What changed; Checks; and Blocked, stopped or prepared. It leaves out Attended or unattended, Risk, Decisions, Decisions for you, Findings rejected and why, Open items, and Log.'));
  assert.ok(!text.includes('Checks; Open items;'));
});

test('R351: every draft, on any run, is logged, listed in the report and kept in the handoff with a local id', () => {
  assert.ok(TICKETS.includes('It says to add each filed ticket to the body\'s Follow-ups before publishing.'));
  assert.ok(TICKETS.includes('Every draft, on any run, including each ticket of a non-yes reply, is logged in `run.md` as `- draft <file>: <one line>`, is listed in the report\'s Open items with its files and the command that files it, and, when the run writes a handoff, keeps a local id there (`handoff.md`, Raised tickets).'));
  assert.ok(!TICKETS.includes('keeps a local id in the handoff'));
  assert.ok(TICKETS.includes('and the answer comes in a later run\'s request on the branch.'));
  assert.ok(!TICKETS.includes('a later run on the branch takes up'));
  assert.ok(section(REPORT, 'Sections').includes('the instruction to add each filed ticket to the body\'s Follow-ups before publishing'));
  assert.ok(section(SKILL, 'Terminal states').includes('and the instruction to add each filed ticket to the body\'s Follow-ups before publishing (`tickets.md`)'));
});

test('R351: an item is settled by the run only with no edit in Step 7', () => {
  assert.ok(TICKETS.includes('and with no edit in Step 7. Record the evidence'));
  assert.ok(!TICKETS.includes('since Step 7.1 commits only CI repairs'));
});

test('R352: the attach forms name the record, capture both numbers and share one no-retry rule', () => {
  assert.ok(TICKETS.includes('`gh issue create -R <owner>/<repo> --title "<title>" --body-file <absolute path>`, whose printed URL ends in the issue number `<n>`'));
  assert.ok(TICKETS.includes('with `<name>` the text `Record for <branch>`, and add `--jq .number` to that command to print the artifact number, which the record keeps.'));
  assert.ok(TICKETS.includes('A failed, refused or impossible attach, on any tracker, is not retried and not done another way; the report names the local record and says it was not attached and why. For a `prepared` draft the report gives the file command, then the attach command with the issue number to fill in.'));
  assert.ok(!section(TICKETS, 'Backends').split('\n').find((l) => l.startsWith('- GitHub issues')).includes('not retried'));
});

test('R351: tickets.md settles each open item as one of three outcomes', () => {
  for (const needle of [
    '- Settled by the run: ',
    '- A decision for the user: ',
    '- Filed to a ticket: ',
    'An item already resolved elsewhere (an open or merged pull request that resolves it, or a ticket that already holds everything the item would add) is settled by naming where, and is not listed in the body.',
    'It does not block publishing: the pull request publishes with its pointers, and the answer comes in a later run\'s request on the branch.',
    'the assumption every option shares, each option, the recommendation first, and what would overturn it',
    'Search the tracker first, closed tickets included.',
    'The remainder of a source ticket the run took up stays on that ticket',
    'it is not a new ticket',
    'Any other deferred finding is a note: report only, never published, never filed.',
    'A check deferred to CI is settled by the CI watch, not an open item.',
    'A later run on the branch never files a second ticket for an item the record shows filed',
  ]) assert.ok(TICKETS.includes(needle), `tickets.md lacks: ${needle}`);
});

test('R351: a run that ends prepared files nothing and writes each ticket as a draft', () => {
  assert.ok(TICKETS.includes('A run that ends `prepared` (a host other than `github`, "do not publish", or a denial before the first push) files nothing.'));
  assert.ok(TICKETS.includes('The report lists each draft with the command or tool that files it, before the publish commands.'));
  assert.ok(section(SKILL, 'Terminal states').includes('(`tickets.md`)'));
  assert.ok(section(PUBLISH, 'Opening').includes('write each open item\'s draft as `tickets.md` says'));
  const other = section(BUILD, 'Step 6 Checks');
  const afterOther = other.slice(other.indexOf('On any other host'));
  const tickets = afterOther.indexOf('read `tickets.md`');
  assert.ok(tickets !== -1, 'Step 6 does not read tickets.md on other');
  assert.ok(tickets < afterOther.indexOf('read `pr-body.md`'), 'Step 6 writes the body before it settles the open items');
});

test('R351: Step 7.2 settles the open items after the first push and before any body or comment is written', () => {
  const text = section(PUBLISH, '7.2 Push and pull request');
  const push = text.indexOf('Push with `git -C <checkout> push -u <remote> <branch>`.');
  const open = text.indexOf('read `tickets.md`');
  const write = text.indexOf('Every body file is written with the Write tool first');
  const create = text.indexOf('**No open pull request on the branch.**');
  assert.ok(push !== -1 && open !== -1 && write !== -1 && create !== -1, 'Step 7.2 lacks a part');
  assert.ok(push < open && open < write && write < create, 'the open items do not come after the push and before the body files');
});

test('R351: Step 7.5 keeps a deferred finding that is not an open item as a note, and Step 5.4 routes the rest to open items', () => {
  assert.ok(PUBLISH.includes('## 7.5 Open items'));
  assert.ok(!PUBLISH.includes('A deferred item never becomes an issue'));
  assert.ok(!PUBLISH.includes('Open no issue'));
  assert.ok(BUILD.includes('A deferred finding that affects correctness or risk or costs more to leave than to fix is an open item (`tickets.md`); any other is a note'));
  assert.ok(!BUILD.includes('Deferred findings join the deferred items of Step 7.5'));
});

test('R352: tickets.md holds the four backend forms, one per tracker', () => {
  for (const needle of [
    'gh issue list -R <owner>/<repo> --search "<terms>" --state all --json number,title,state,url',
    'gh issue create -R <owner>/<repo> --title "<title>" --body-file <absolute path>',
    'gh issue comment <n> -R <owner>/<repo> --body-file <absolute path>',
    'gh api --hostname <host> --method POST repos/<owner>/<repo>/issues/<n>/artifacts -f name="<name>" -F body=@<absolute path>',
    'gh api --hostname <host> --method PATCH repos/<owner>/<repo>/issues/<n>/artifacts/<number> -F body=@<absolute path>',
    'One artifact per ticket and branch.',
    '`az boards query --org https://dev.azure.com/<org> --project <project> --wiql`',
    '`az boards work-item create --org https://dev.azure.com/<org> --project <project> --type <type> --title "<title>" --description @<absolute path>`',
    '`az boards work-item update --org https://dev.azure.com/<org> --id <n> --discussion @<absolute path>`, the file holding the text as HTML paragraphs, since those fields render HTML.',
    '`wit_work_item_attachment_upload` and `wit_work_item_attachment_link`',
    '- Salesforce: comment only, through its MCP tool; no ticket is filed there and no record attached;',
  ]) assert.ok(TICKETS.includes(needle), `tickets.md lacks: ${needle}`);
});

test('R352: with no attachment tool the record stays local', () => {
  assert.ok(TICKETS.includes('with no such tool the record stays local and the report says so'));
});

test('R352: every body and record file is written first and its post runs alone, after a check of the reader', () => {
  assert.ok(TICKETS.includes('Every body and record file is written with the Write tool first, in its own call, and its posting command then runs alone in its own Bash call, naming only that path.'));
  assert.ok(TICKETS.includes('Before each post, check that its reader will act on it and that it holds nothing they would not say themselves.'));
  assert.ok(PUBLISH.includes('`gh issue create`'));
});

test('R352: a ticket is written for its readers, and the technical detail goes in a record', () => {
  for (const needle of [
    'what changed for them, what happens next and who it waits on, what is not done and the ticket tracking each',
    'never a branch, file, line, check output, commit id, criterion evidence, run, step, pass, level, verdict or another term the loop coined',
    'A pull request link is allowed, as where to follow the change',
    'the local copy is the source of truth and an upload a copy',
    'A new ticket\'s record is the handoff context a later session needs: what the item is, why it matters, where the evidence is (files, lines, commits, checks, the record path), and what done looks like.',
    'A source ticket\'s record holds the criteria with their evidence (a check, a test name, a commit or a line of output), each met, not met or not confirmed.',
    'A source ticket is never the ticket of an open item.',
  ]) assert.ok(TICKETS.includes(needle), `tickets.md lacks: ${needle}`);
});

test('R352: the record keeps the ticket, the artifact number and the files a later run reuses', () => {
  assert.ok(RECORD.includes('`- ticket <ref> <new | existing | source> artifact <number | none>: <one line>`'));
  const files = section(RECORD, 'Files');
  assert.ok(files.includes('| `item-<k>.md` |'));
  assert.ok(files.includes('| `item-<k>-record.md` |'));
  assert.ok(files.includes('| `record-<id-slug>.md` |'));
  assert.ok(files.includes('`record-*.md`, `item-*.md`'));
});

test('R117: the body lists no remainder or deferred item in What changed and has Follow-ups between Checks not run and Related pull requests', () => {
  const body = PR_BODY.slice(PR_BODY.indexOf('## Pull request body'), PR_BODY.indexOf('Closing rules:'));
  const what = body.slice(body.indexOf('## What changed'), body.indexOf('## Where the ticket and the code differ'));
  assert.ok(!what.includes('what is left'));
  assert.ok(!what.includes('<deferred items'));
  assert.ok(what.includes('"complete" or "partial", and what changed'));
  const at = (heading) => body.indexOf(`\n## ${heading}\n`);
  assert.ok(at('Checks not run') !== -1 && at('Follow-ups') > at('Checks not run') && at('Related pull requests') > at('Follow-ups'), 'Follow-ups is not between Checks not run and Related pull requests');
  assert.ok(body.includes('<one line per ticket: what it holds, in one line, and its ticket reference; "none">'));
  assert.ok(body.includes('the ticket that tracks it'));
});

test('R117: the continued comment lists each ticket as complete or partial with nothing left to say', () => {
  const text = PR_BODY.slice(PR_BODY.indexOf('## Continued pull request comment'), PR_BODY.indexOf('## Ticket comment'));
  assert.ok(text.includes('## Issues\n<ref>: complete\n<ref>: partial\n```'));
  assert.ok(!text.includes('<what is left>'));
});

test('R11: the publication rule names the terms the suite or the run coined', () => {
  assert.ok(PR_BODY.includes('never a term the suite or this run coined'));
});

test('R11: the published body names no run of the loop, and its differing section has a reader\'s name', () => {
  assert.ok(PR_BODY.includes('<on a continued branch: this branch carries <n> commits from before this change; they were reviewed with it, and they are listed here>'));
  assert.ok(PUBLISH.includes('and says the branch carries them from before this change and they were reviewed with it.'));
  assert.ok(PR_BODY.includes('## Where the ticket and the code differ\n'));
  const plan = read('steps/1-plan.md');
  assert.ok(plan.includes('(its Where the ticket and the code differ section)'));
  for (const old of ['Drift corrections', 'reviewed as part of this run\'s diff']) {
    for (const text of [PR_BODY, PUBLISH, plan]) assert.ok(!text.includes(old), `still holds: ${old}`);
  }
});

test('R118: the ticket comment carries no run label and no criteria, not done or deferred label', () => {
  const text = section(PR_BODY, 'Ticket comment');
  for (const label of ['Status from the loop run', 'Criteria:', 'Not done:', 'Deferred:']) {
    assert.ok(!text.includes(label), `the ticket comment section still holds "${label}"`);
  }
  assert.ok(text.includes('No label on a paragraph or bullet.'));
  assert.ok(text.includes('State "partial" plainly when it is partial.'));
  assert.ok(text.includes('Put the criteria and their evidence in the ticket\'s record'));
});

test('R118: Step 7.4 comments on each source ticket, attaches its record, and opens no issue', () => {
  const text = section(PUBLISH, '7.4 Ticket comments');
  assert.ok(text.includes('done at Step 0'));
  assert.ok(text.includes('logs a comment on it'));
  assert.ok(text.includes('and then post `gh issue comment <n> -R <owner>/<repo> --body-file <absolute path>`'));
  assert.ok(text.includes('`<record>/record-<id-slug>.md`'));
  assert.ok(!text.includes('Open no issue'));
});

test('R96: under commit: true the report is not posted on the pull request, and the snapshot is still committed', () => {
  const text = section(RECORD, 'Commit snapshot');
  assert.ok(text.includes('The report is not posted on the pull request: the run posts what it posts without `commit: true`.'));
  assert.ok(text.includes('A run that publishes commits a snapshot at Step 7.1'));
  assert.ok(!text.includes('post the report\'s external form'));
  assert.ok(!SKILL.includes('post the report\'s external form'));
  assert.ok(!PUBLISH.includes('the report comment at `done` is that one comment'));
  assert.ok(!README.includes('posts the report as a pull request comment'));
});

test('R133: the report holds Open items and Decisions for you in place of Deferred items', () => {
  assert.ok(REPORT.includes('### Open items'));
  assert.ok(REPORT.includes('### Decisions for you'));
  assert.ok(!REPORT.includes('Deferred items'));
  assert.ok(!REPORT.includes('No issue was opened for any of them'));
  const open = section(REPORT, 'Sections').split('### Open items')[1].split('\n### ')[0];
  for (const needle of ['settled, with its evidence, or where it was already resolved', 'filed, with the ticket link, new or existing, and whether its record was attached', 'a draft, on any run, with its files and the command that files it', 'put to the user', 'notes', 'with their reasons']) {
    assert.ok(open.includes(needle), `Open items lacks: ${needle}`);
  }
  const decisions = section(REPORT, 'Sections').split('### Decisions for you')[1].split('\n### ')[0];
  assert.ok(decisions.includes('the assumption every option shares, each option, the recommendation first, and what would overturn it'));
  assert.ok(decisions.includes('or `none`'));
  assert.ok(REPORT.includes('## Open items\n\n## Decisions for you\n'));
  assert.ok(RECORD.includes('What changed; Checks; and Blocked, stopped or prepared'));
});

test('R137: a filed open item is a raised ticket with the filed ticket\'s reference, and a draft keeps its local id', () => {
  const text = HANDOFF.slice(HANDOFF.indexOf('### Raised tickets'), HANDOFF.indexOf('\n## Manifest'));
  for (const needle of [
    'One `### R<n>` per filed open item',
    '`ticket`: the filed ticket\'s reference, in the form the Tickets section uses',
    '`state`: the forge\'s state for a filed ticket: on GitHub lowercase, `open` or `closed`; on Azure DevOps as the work item shows it. A draft: `new`.',
    '`in_bundle_confidence`: `defer`',
    'a draft keeps the local id `<branch-slug>/deferred-<k>`',
    'one entry per ticket',
  ]) assert.ok(text.includes(needle), `Raised tickets lacks: ${needle}`);
  assert.ok(!text.includes('per deferred item'));
  assert.ok(HANDOFF.includes('- ticket: github:acme/widget-app#31\n- type: issue\n- state: open\n- iteration: none\n- owner: none\n'));
});

test('R137: a filed ticket\'s type, state, iteration and owner are what the forge shows, and a draft keeps the fixed values', () => {
  const text = HANDOFF.slice(HANDOFF.indexOf('### Raised tickets'), HANDOFF.indexOf('\n## Manifest'));
  for (const needle of [
    'Read a filed GitHub ticket with `gh issue view <n> -R <owner>/<repo> --json state,milestone,assignees,labels`.',
    '- `type`: for a filed ticket, new or existing, what the forge shows: on GitHub the first label, else `issue`; on Azure DevOps the work item\'s type. A draft: `task`.',
    '- `iteration`: the forge\'s milestone (GitHub) or iteration path (Azure DevOps) for a filed ticket, `none` where it shows none. A draft: `none`.',
    '- `owner`: the forge\'s assignee (GitHub) or assigned-to (Azure DevOps) for a filed ticket, `none` where it shows none. A draft: `none`.',
  ]) assert.ok(text.includes(needle), `Raised tickets lacks: ${needle}`);
  assert.ok(!text.includes('- `type`: `task`\n'));
  assert.ok(!text.includes('- `owner`: `none`\n'));
});

test('R352: every gh issue form names the item\'s tracker, so the filing and the attach hit one repository', () => {
  const github = section(TICKETS, 'Backends').split('\n').find((l) => l.startsWith('- GitHub issues'));
  assert.ok(github.includes('Each of the three passes `-R` with the `<owner>/<repo>` of the item\'s tracker (off github.com, `-R <host>/<owner>/<repo>`, as `multi-repo.md`, Host, says), so every command names the repository the attach does.'));
  assert.ok(read('multi-repo.md').includes('every `gh` command except `gh api` that names a repository passes `-R <host>/<owner>/<repo>`'));
});

test('R351: an open ticket takes the comment and record, a closed match is linked from a new ticket', () => {
  assert.ok(TICKETS.includes('Search the tracker first, closed tickets included. An open ticket that covers the same symptom but lacks what the item adds gets a comment and a record; a closed one is not commented on, and the new ticket\'s body links it; else a new ticket, one symptom each.'));
  assert.ok(!TICKETS.includes('A ticket that covers the same symptom gets a comment and a record'));
  assert.ok(TICKETS.includes('--state all --json'));
});

test('R351: a run that ends blocked or stopped before tickets.md is read lists its open items as open', () => {
  assert.ok(TICKETS.split('\n')[2].includes('A run that ends `blocked` or `stopped` before it is read lists each open item in the report\'s Open items as open, with its description and why it is owed, for a later run on the branch to settle.'));
  assert.ok(section(REPORT, 'Sections').split('### Open items')[1].split('\n### ')[0].includes('on a run that ended `blocked` or `stopped` before `tickets.md` was read, open, with its description and why it is owed, for a later run on the branch to settle'));
});

test('R351: a filing or comment that fails or is refused leaves a draft and the run goes on, with no denial', () => {
  assert.ok(TICKETS.includes('A filing or comment for an open item that fails (a non-zero exit) or is refused is handled like a non-yes to the question above, and is never retried or done another way: the item stays a draft with its files, logged as a draft, the body carries no line for it, the report names the failure or the refused call in full, and the run goes on. It is not a denial under rule 3, so the run does not end `blocked` for it (SKILL.md, Approval scope, rule 1).'));
  assert.ok(!TICKETS.includes('a refusal is a denial'));
  assert.ok(!TICKETS.includes('still publishes'));
});

test('R351: a CI repair push that makes the body untrue of the new head edits the body of a pull request this loop opened', () => {
  const item = section(PUBLISH, '7.3 CI').split('\n').find((l) => l.startsWith('3. '));
  assert.ok(item.includes('if a repair cycle pushed a commit that makes the body untrue of the new head or its pass filed a ticket'));
  assert.ok(!item.includes('When that files a ticket'));
});

test('R117: Follow-ups holds one line per ticket, from its latest line across every run, and the continued comment only this run\'s tickets', () => {
  assert.ok(PR_BODY.includes('`## Follow-ups` holds one line per ticket, from the latest `new` or `existing` `- ticket` line of `run.md` for it across every run of the record; items that share a ticket share its line.'));
  assert.ok(!PR_BODY.includes('from the `new` and `existing` `- ticket` lines of `run.md`'));
  const text = PR_BODY.slice(PR_BODY.indexOf('## Continued pull request comment'), PR_BODY.indexOf('## Ticket comment'));
  assert.ok(text.includes('The comment covers this run\'s work, so its Follow-ups lists only the tickets this run filed or commented on.'));
});

test('R352: the Azure DevOps forms pass the file, not inline text, and 7.4 names the organization and the repository', () => {
  assert.ok(!TICKETS.includes('--discussion "<text>"') && !TICKETS.includes('--description "<text>"'));
  assert.ok(!TICKETS.includes('reading the text from a file when quoting fails'));
  const text = section(PUBLISH, '7.4 Ticket comments');
  assert.ok(text.includes('`az boards work-item update --org https://dev.azure.com/<org> --id <n> --discussion @<absolute path>`, the file holding the text as HTML paragraphs;'));
  assert.ok(!text.includes('--discussion "<text>"') && !text.includes('reading the text from a file when quoting fails'));
  assert.ok(text.includes('`gh issue comment <n> -R <owner>/<repo> --body-file <absolute path>`'));
});

test('R352: one log line per ticket per run, after its last post, and a later run reads the latest', () => {
  assert.ok(TICKETS.includes('After a ticket\'s last post in the run (its filing or comment, then its attach), log one line for it in `run.md`: `- ticket <ref> <new | existing | source> artifact <number | none>: <one line>`. A later run reads the latest line for a ticket.'));
  assert.ok(!TICKETS.includes('After each post, log a line'));
  assert.ok(RECORD.includes('as one line, written after that ticket\'s last post of the run, `- ticket <ref> <new | existing | source> artifact <number | none>: <one line>`; a later run reuses the ticket and the artifact number by the latest line for a ticket.'));
});

test('R352: several open items on one ticket share one comment and one record under the lowest item number', () => {
  assert.ok(TICKETS.includes('Several open items that go to one ticket take one comment and one record holding a section per item, written as `item-<k>.md` and `item-<k>-record.md` under the lowest `<k>` of them, so the ticket keeps one artifact per branch.'));
  const files = section(RECORD, 'Files');
  for (const row of ['| `item-<k>.md` |', '| `item-<k>-record.md` |']) {
    const line = files.split('\n').find((l) => l.startsWith(row));
    assert.ok(/lowest `<k>`, a section each/.test(line), `${row} does not name the shared file`);
  }
});

test('R352: an Azure DevOps work item type and organization come from the source ticket\'s reference', () => {
  assert.ok(TICKETS.includes('`<type>` is the work item type of the source ticket the item came from, which its project\'s process has; `<org>` and `<project>` are those of that ticket\'s `ado:<org>/<project>#<n>` reference.'));
});

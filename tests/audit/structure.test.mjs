// What holds the audit's text files together: every place one of them cites in another exists there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const ROOT = new URL('../../plugins/audit/', import.meta.url);
const list = (dir) => readdirSync(new URL(dir, ROOT)).filter((name) => name.endsWith('.md')).map((name) => dir + name);
// A citation names a skill, stage or agent file by its base name. Two command files share a name with a skill file, and
// no file cites a command file.
const TARGETS = [...list('skills/audit/'), ...list('skills/audit/stages/'), ...list('agents/')];
const FILES = [...TARGETS, ...list('commands/')];
const TEXT = Object.fromEntries(FILES.map((file) => [file, readFileSync(new URL(file, ROOT), 'utf8').replace(/\r/g, '')]));
const BY_BASE = Object.fromEntries(TARGETS.map((file) => [file.split('/').pop(), file]));
const plain = (text) => text.replace(/[`"]/g, '');

// The names a file can be cited by: its headings, and the bold labels that open a paragraph, a step or a list item.
const names = (file) => [
  ...[...TEXT[file].matchAll(/^#{1,4} (.+)$/gm)].map((m) => plain(m[1])),
  ...[...TEXT[file].matchAll(/^\s*(?:(?:\d+|[a-z])\. |- )?\*\*([^*]+?)\.?\*\*/gm)].map((m) => plain(m[1])),
];
const numbered = (text) => new Set([...text.matchAll(/^(\d+)\. /gm)].map((m) => m[1]));
// The numbered steps a file has at the start of a line.
const steps = (file) => numbered(TEXT[file]);
// The numbered rules under a file's "Hard rules" heading, up to the next heading.
const hardRules = (file) => numbered(TEXT[file].match(/^#{2,3} Hard rules\n([^]*?)(?=^#)/m)?.[1] ?? '');

// Whether the words after a citation of a file begin with a heading, a label, a step or a hard rule of it.
const resolves = (file, words) => {
  const step = words.match(/^steps? (\d+)/);
  if (step) return steps(file).has(step[1]);
  const rule = words.match(/^hard rule (\d+)/);
  if (rule) return hardRules(file).has(rule[1]);
  const section = words.replace(/^section #+ /, '');
  return names(file).some((name) => section.startsWith(name));
};

// Each `<file>.md, <words>` of a file whose words open as a citation does: a quote, a capital, "step <n>" or
// "section #"; and each `<file>.md hard rule <n>`, with or without the comma. A file name there is the next item of
// a list of files, not a place in the first.
const citations = (text) =>
  [...text.replace(/\s+/g, ' ').matchAll(/([A-Za-z0-9-]+\.md)`?(?:, \(?(?=((?:"|[A-Z]|steps? \d|section #|hard rule \d)[^]{0,80}))| (?=(hard rule \d[^]{0,80})))/g)]
    .map((m) => [m[1], plain(m[2] ?? m[3])])
    .filter(([name, words]) => BY_BASE[name] && !/^[\w./-]+\.(?:md|json|jsonl|sh|txt)\b/.test(words));

test('the citation check tells a place that exists from one that does not', () => {
  const found = citations('as `common.md`, "Hard rules" says, and (SKILL.md, Soft\n   budget); see `8-report.md`, step 2, and `common.md`, SKILL.md and `report.md`, no such place; the commands of `common.md` hard\n   rule 2.');
  assert.deepEqual(
    found.map(([name, words]) => [name, words.slice(0, 11)]),
    [
      ['common.md', 'Hard rules '],
      ['SKILL.md', 'Soft budget'],
      ['8-report.md', 'step 2, and'],
      ['common.md', 'hard rule 2'],
    ],
  );
  assert.equal(resolves(BY_BASE['common.md'], 'hard rule 2.'), true);
  assert.equal(resolves(BY_BASE['common.md'], 'hard rule 99'), false);
  assert.equal(resolves(BY_BASE['report.md'], 'hard rule 2'), false);
  assert.equal(resolves(BY_BASE['common.md'], 'Hard rules says'), true);
  assert.equal(resolves(BY_BASE['common.md'], 'Soft rules says'), false);
  assert.equal(resolves(BY_BASE['8-report.md'], 'step 2, and'), true);
  assert.equal(resolves(BY_BASE['8-report.md'], 'step 99'), false);
});

test('every place an audit file cites in another audit file exists there', () => {
  let cited = 0;
  for (const file of FILES) {
    for (const [name, words] of citations(TEXT[file])) {
      cited++;
      assert.ok(resolves(BY_BASE[name], words), `${file} cites ${name}, "${words.slice(0, 40)}", and ${BY_BASE[name]} has no such heading, label or step`);
    }
  }
  assert.ok(cited >= 70, `only ${cited} citations found`);
});

test('each agent that has a shell names the command list of common.md hard rule 2 before its steps', () => {
  const shells = [];
  for (const file of list('agents/')) {
    const [, front, body] = TEXT[file].match(/^---\n([^]*?)\n---\n([^]*)$/);
    if (!/^ +- Bash$/m.test(front)) continue;
    shells.push(file);
    const steps = body.search(/\n## Steps\b/);
    assert.ok(steps > 0, `${file} has no "Steps" heading`);
    assert.ok(
      citations(body.slice(0, steps)).some(([name, words]) => name === 'common.md' && /^hard rule 2\b/.test(words)),
      `${file} does not name common.md hard rule 2 before its steps`,
    );
  }
  assert.deepEqual(shells, ['agents/adversary.md', 'agents/auditor.md', 'agents/digester.md', 'agents/mapper.md']);
});

// The host keeps only the start of a skill's text across a compaction: about 19,800 characters of a probe skill.
test('compaction recovery sits early in SKILL.md and has the session read SKILL.md again', () => {
  const body = TEXT['skills/audit/SKILL.md'].replace(/^---\n[^]*?\n---\n/, '');
  const start = body.indexOf('\n### Compaction recovery\n');
  const end = body.indexOf('\n#', start + 1);
  assert.ok(start > 0, 'SKILL.md has no "Compaction recovery" section');
  assert.ok(end < 15000, `"Compaction recovery" ends ${end} characters into SKILL.md, past what a compaction is sure to keep`);
  assert.ok(body.slice(start, end).includes('/SKILL.md`'),'"Compaction recovery" does not name SKILL.md among what is read again');
});

test('each stage section of SKILL.md names its stage file and holds no list or table of its own', () => {
  const sections = [...TEXT['skills/audit/SKILL.md'].matchAll(/^## Stage (\d): [^\n]+\n([^]*?)(?=^## )/gm)];
  assert.deepEqual(sections.map((m) => m[1]), ['1', '2', '3', '4', '5', '6', '7', '8', '9']);
  for (const [, n, body] of sections) {
    assert.ok(new RegExp(`skills/audit/stages/${n}-[a-z-]+\\.md`).test(body), `the stage ${n} section names no stage file`);
    assert.ok(!/^(?:\d+\. |- |\|)/m.test(body), `the stage ${n} section holds a list or a table; its steps belong in the stage file`);
  }
});

// Whether a citation's words open with a place and end it there: "step 7" is not "step 70".
const opens = (words, place) => words.startsWith(place) && !/^\w/.test(words.slice(place.length));
// Whether a text cites that place of a file.
const cites = (text, target, place) => citations(text).some(([base, words]) => base === target && opens(words, place));
// A file's top-level numbered steps, each from its number to the next step or heading, and the one a bold label opens.
const stepTexts = (file) =>
  TEXT[file].split(/^(?=\d+\. )/m).filter((part) => /^\d+\. /.test(part)).map((part) => part.split(/^#/m)[0]);
const stepLabeled = (file, label) => stepTexts(file).find((part) => part.replace(/^\d+\. \*\*/, '').startsWith(label)) ?? '';
const paragraphs = (file) => TEXT[file].split(/\n\s*\n/);
const script = (name) => readFileSync(new URL('scripts/' + name, ROOT), 'utf8').replace(/\r/g, '');

test('the files that draft or post text for a reader point at the rule for it', () => {
  for (const file of ['skills/audit/report.md', 'skills/audit/stages/9-act.md']) {
    assert.ok(cites(TEXT[file], 'common.md', 'hard rule 3'), `${file} does not point at common.md hard rule 3`);
  }
  assert.ok(
    cites(TEXT['skills/audit/work-items.md'], 'SKILL.md', 'What leaves the run'),
    'work-items.md does not point at SKILL.md, What leaves the run',
  );
});

test('the files that judge an agent output point at the rule for a failed output', () => {
  for (const file of ['skills/audit/SKILL.md', 'skills/audit/resume.md']) {
    assert.ok(cites(TEXT[file], 'common.md', 'Output contract'), `${file} does not point at the output contract`);
  }
  // Stages 4 and 5 take two things from Roles when an agent completes: when it failed, and the ladder that follows.
  for (const file of ['skills/audit/stages/4-pass-one.md', 'skills/audit/stages/5-pass-two.md']) {
    const roles = citations(stepLabeled(file, 'On each completion')).filter(([base, words]) => base === 'SKILL.md' && opens(words, 'Roles'));
    assert.ok(roles.length >= 2, `${file}: the step for a completion cites SKILL.md, Roles ${roles.length} times, not for the failure and for the ladder`);
  }
});

test('the launch step of stages 4 and 5 points at the outputs a resume kept', () => {
  for (const file of ['skills/audit/stages/4-pass-one.md', 'skills/audit/stages/5-pass-two.md']) {
    assert.ok(cites(stepLabeled(file, 'Launch'), 'resume.md', 'step 7'), `${file}: the launch step does not cite resume.md, step 7`);
  }
  // Step 7 is the step that keeps them.
  const kept = stepTexts('skills/audit/resume.md').find((part) => part.startsWith('7. ')) ?? '';
  for (const output of ['`pass1/<scope>.md`', '`pass2/<scope>.md`']) {
    assert.ok(kept.includes(output), `step 7 of resume.md does not name ${output}`);
  }
});

test('every section an agent definition names exists in a file that agent reads', () => {
  const shared = ['skills/audit/common.md', 'skills/audit/audit-evidence.md'];
  const quotedIn = (file) => [...TEXT[file].matchAll(/`(#{2,4} [^`]+)`/g)].map((m) => m[1].replace(/\s+/g, ' '));
  const headingsOf = (file) => [...TEXT[file].matchAll(/^(#{2,4} .+)$/gm)].map((m) => plain(m[1]));
  // An output heading has no section of its own: common.md names it in backticks.
  const outputs = new Set(quotedIn(shared[0]));
  // Every agent reads common.md; the auditor and the adversary read audit-evidence.md as well.
  const reads = (file) => (['agents/auditor.md', 'agents/adversary.md'].includes(file) ? shared : shared.slice(0, 1));
  let named = 0;
  for (const file of list('agents/')) {
    const sections = new Set([...reads(file), file].flatMap(headingsOf));
    for (const name of quotedIn(file)) {
      // A heading that opens with a small letter or holds a placeholder is an id or a pattern, not a section.
      if (!/^#+ [A-Z]/.test(name) || name.includes('<')) continue;
      named += 1;
      assert.ok(sections.has(name) || outputs.has(name), `${file} names "${name}", which is in no file it reads`);
    }
  }
  assert.ok(named > 0, 'no agent definition names a section');
  for (const file of ['agents/auditor.md', 'agents/adversary.md']) {
    const step = stepTexts(file).find((part) => part.includes('`audit-evidence.md`')) ?? '';
    assert.ok(
      step.includes('`### Leads a finding must clear`'),
      `${file}: the step that reads audit-evidence.md does not name "Leads a finding must clear"`,
    );
  }
});

test('the ending of a merger that could not read an input is one literal where it is written, defined and judged', () => {
  for (const file of ['agents/merger.md', 'skills/audit/common.md', 'skills/audit/stages/7-converge.md']) {
    const forms = [...TEXT[file].matchAll(/`status: failed [^`]*`/g)].map((m) => m[0]);
    assert.ok(forms.length > 0, `${file} gives no failed ending`);
    for (const form of forms) assert.equal(form, '`status: failed at <file>:<line>`', `${file} gives the ending as ${form}`);
  }
});

test('act and the finding rules name the same instruction files to read before a change', () => {
  for (const file of ['skills/audit/stages/9-act.md', 'skills/audit/audit-evidence.md']) {
    const block = paragraphs(file).find((part) => /instruction\s+files/.test(part) && part.includes('`.claude/rules/`'));
    assert.ok(block, `${file} has no paragraph on the instruction files read before a change`);
    for (const source of ['AGENTS.md', 'CLAUDE.md', '.claude/rules/', '.claude/skills/', 'REVIEW.md']) {
      assert.ok(block.includes('`' + source + '`'), `${file}: that paragraph does not name ${source}`);
    }
  }
});

test('the rule for a failed output names what report.sh skips a pass file for', () => {
  const rule = paragraphs('skills/audit/common.md').find((part) => part.includes('failed output') && part.includes('`## Claims`'));
  assert.ok(rule, 'common.md has no paragraph on a failed output');
  for (const [inScript, inRule] of [
    ['"status: complete"', '`status: complete`'],
    ['H[1, 1] = "## Claims"', '`## Claims`'],
    ['H[2, 1] = "## Claims challenged"', '`## Claims challenged`'],
    ['/-topup\\.md$/', '`-topup.md`'],
  ]) {
    assert.ok(script('report.sh').includes(inScript), `report.sh no longer tests ${inScript}`);
    assert.ok(rule.includes(inRule), `the rule for a failed output does not name ${inRule}`);
  }
});

test('stage 6 and its request name the addition heading that ledger.sh parses', () => {
  assert.ok(script('ledger.sh').includes('/^#+ X[0-9]+:/'), 'ledger.sh no longer reads an addition as #+ X<n>:');
  assert.ok(TEXT['skills/audit/stages/6-second-opinion.md'].includes('### X<n>: <title>'), 'stage 6 does not give the heading of an addition');
  assert.ok(TEXT['skills/audit/second-opinion-request.md'].includes('### X<n>: <title>'), 'the request does not give the heading of an addition');
});

test('the README and the skill give each role the same default model', () => {
  // The default model of each role, from the table whose header names that column: its third cell's first word.
  const defaults = (text) => {
    const [, rows] = text.match(/^\| Role \|[^\n]*Default model[^\n]*\n\|[-| ]+\|\n((?:\|[^\n]*\n)+)/m);
    return Object.fromEntries(
      rows.trim().split('\n').map((row) => row.split('|').map((cell) => cell.trim()))
        .map((cells) => [cells[1].replace(/ \(.*$/, ''), cells[3].replace(/`/g, '').split(/[ ,]/)[0]]),
    );
  };
  const expected = { digester: 'haiku', mapper: 'sonnet', auditor: 'opus', adversary: 'opus', 'second opinion': 'opus', merger: 'sonnet' };
  assert.deepEqual(defaults(TEXT['skills/audit/SKILL.md']), { orchestrator: 'none', ...expected });
  assert.deepEqual(defaults(readFileSync(new URL('README.md', ROOT), 'utf8').replace(/\r/g, '')), expected);
});

test('the registry commands of the audit files are the ones registry.sh takes', () => {
  const sh = script('registry.sh');
  // Each word the script takes, with the count of arguments it asks for, the word included.
  const ops = Object.fromEntries([...sh.matchAll(/^(\w+)\) \[ \$# -eq (\d+) \] \|\| usage ;;$/gm)].map((m) => [m[1], Number(m[2])]));
  assert.deepEqual(Object.keys(ops), ['add', 'set']);
  const states = sh.match(/^\t(\w+(?: \| \w+)+)\) ;;$/m)?.[1].split(' | ');
  assert.deepEqual(states, ['running', 'reported', 'partial', 'blocked']);
  const section = TEXT['skills/audit/SKILL.md'].match(/^### State files\n([^]*?)(?=^#)/m)[1];
  for (const [op, count] of Object.entries(ops)) {
    const values = section.match(new RegExp(`/scripts/registry\\.sh" ${op} ((?:<[^>]+> ?)+)\``))?.[1].match(/<[^>]+>/g) ?? [];
    assert.equal(values.length, count - 1, `State files gives "${op}" ${values.length} values and the script takes ${count - 1}`);
  }
  for (const state of states) assert.ok(section.includes('`' + state + '`'), `State files does not name the state ${state}`);
  let named = 0;
  for (const file of FILES) {
    for (const [, op] of TEXT[file].matchAll(/registry\.sh"? (\w+)/g)) {
      named++;
      assert.ok(op in ops, `${file} names "registry.sh ${op}", which the script does not take`);
    }
  }
  assert.ok(named >= 5, `only ${named} registry commands found`);
});

// An agent leaves a complete file at its output path as final, so a relaunch on that path writes nothing while the file is there.
test('a failed output leaves its path before a relaunch, by one rule, and no agent reads it', () => {
  const roles = paragraphs('skills/audit/SKILL.md').find((part) => part.startsWith('An agent fails when')) ?? '';
  assert.ok(
    /Before the ladder relaunches an agent, move the output file [^.]*`failed-output\.md`/.test(roles),
    'SKILL.md, Roles, does not move a failed output off its path before a relaunch',
  );
  for (const file of TARGETS) {
    assert.ok(!/relaunch overwrites/i.test(TEXT[file]), `${file} says a relaunch overwrites a file`);
    if (file !== 'skills/audit/SKILL.md') assert.ok(!/mv -f[^\n]*failed-/.test(TEXT[file]), `${file} moves a failed output by a rule of its own`);
  }
  assert.ok(
    TEXT['skills/audit/common.md'].replace(/\s+/g, ' ').includes("It reads nothing in another agent's scratch folder."),
    "common.md does not keep an agent out of another agent's scratch folder",
  );
});

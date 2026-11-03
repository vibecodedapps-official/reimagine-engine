// Fails when a commit message in <base>..<head>, or a pull request description on stdin, holds a session
// attribution line (requirement 222).
// Usage: node tools/commit-messages.mjs <base> <head>
//        node tools/commit-messages.mjs --description < <description>
// Prints "commit messages: ok (<n> commits)" or "pull request description: ok" and exits 0; one
// "commit messages: <hash>: <line>" or "pull request description: line <n>: <line>" per hit and exits 1;
// exits 2 when the range cannot be read.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ATTRIBUTION = /claude-session:|claude\.ai\/code\/session|co-authored-by:\s*claude/i;

const report = (hits, ok) => {
  if (hits.length > 0) {
    console.error(hits.join('\n'));
    process.exit(1);
  }
  console.log(ok);
};

const [base, head] = process.argv.slice(2);

if (base === '--description') {
  const hits = [];
  readFileSync(0, 'utf8')
    .split(/\r?\n/)
    .forEach((line, i) => {
      if (ATTRIBUTION.test(line)) hits.push(`pull request description: line ${i + 1}: ${line}`);
    });
  report(hits, 'pull request description: ok');
  process.exit(0);
}

if (!base || !head) {
  console.error('usage: node tools/commit-messages.mjs <base> <head> | --description');
  process.exit(2);
}

const log = spawnSync('git', ['log', '--format=%h%x00%B%x00', `${base}..${head}`], { encoding: 'utf8' });
if (log.status !== 0) {
  console.error(`commit messages: git log failed\n${log.stderr}`);
  process.exit(2);
}

const fields = log.stdout.split('\0');
const hits = [];
let commits = 0;
for (let i = 0; i + 1 < fields.length; i += 2) {
  commits += 1;
  const hash = fields[i].trim();
  for (const line of fields[i + 1].split(/\r?\n/)) {
    if (ATTRIBUTION.test(line)) hits.push(`commit messages: ${hash}: ${line}`);
  }
}

report(hits, `commit messages: ok (${commits} commits)`);

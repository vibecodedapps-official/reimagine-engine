// The file listing tools/lint.mjs and tools/release.mjs share: the regular files git sees under a directory of root,
// tracked or untracked but not ignored, as paths with "/"; a walk where git cannot list.
import { spawnSync } from 'node:child_process';
import { lstatSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function walk(root, dir) {
  const out = [];
  for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(root, rel));
    else out.push(rel);
  }
  return out;
}

export function listFiles(root, dir = '') {
  const args = ['ls-files', '-z', '--cached', '--others', '--exclude-standard', ...(dir ? ['--', dir] : [])];
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
  const listed = r.error || r.status !== 0 ? walk(root, dir) : r.stdout.split('\0').filter(Boolean);
  return [...new Set(listed)]
    .filter((rel) => lstatSync(join(root, rel), { throwIfNoEntry: false })?.isFile() === true)
    .sort();
}

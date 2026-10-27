// The semver rule tools/lint.mjs and tools/release.mjs share: the version pattern, the order of two versions,
// and the plugin_version literal.
const ID = '(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)';
export const SEMVER_CORE = `(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)(?:-${ID}(?:\\.${ID})*)?`;
export const SEMVER = new RegExp(`^${SEMVER_CORE}$`);

export const LITERAL = /\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]*[0-9A-Za-z])?/g;

function parseSemver(v) {
  const dash = v.indexOf('-');
  const core = (dash < 0 ? v : v.slice(0, dash)).split('.').map(Number);
  return { core, pre: dash < 0 ? null : v.slice(dash + 1).split('.') };
}

function compareIdentifiers(a, b) {
  const an = /^\d+$/.test(a), bn = /^\d+$/.test(b);
  if (an && bn) return Number(a) - Number(b);
  if (an !== bn) return an ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function compareSemver(a, b) {
  const x = parseSemver(a), y = parseSemver(b);
  for (let i = 0; i < 3; i++) if (x.core[i] !== y.core[i]) return x.core[i] < y.core[i] ? -1 : 1;
  if (!x.pre || !y.pre) return x.pre === y.pre ? 0 : x.pre ? -1 : 1;
  for (let i = 0; i < Math.min(x.pre.length, y.pre.length); i++) {
    const c = compareIdentifiers(x.pre[i], y.pre[i]);
    if (c) return c;
  }
  return Math.sign(x.pre.length - y.pre.length);
}

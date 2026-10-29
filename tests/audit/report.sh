#!/bin/sh
# report.sh: tests for scripts/report.sh.
#
# Usage: sh tests/audit/report.sh
#
# Builds each run directory inline under a temp directory from small literal files, runs
# the script on it, and compares every output file byte for byte with a literal. The
# script under test is ${REPORT_SH:-<repo root>/plugins/audit/scripts/report.sh}. Every
# malformed-input message is run with its exact stderr line and a check that no output
# was written; the usage and IO exits are run with their messages.
#
# Prints one line per mismatch and `report test: ok` on success; exits 1 on any mismatch.
set -u

root=$(cd "$(dirname "$0")/../.." && pwd)
rs=${REPORT_SH:-$root/plugins/audit/scripts/report.sh}

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

fails=0
fail() {
	echo "report test: $*"
	fails=$((fails + 1))
}

# run <label> <expected exit> <expected stderr> <args...>: stdout must be empty.
run() {
	label=$1
	want_st=$2
	want_err=$3
	shift 3
	if out=$(sh "$rs" "$@" 2> "$tmp/err"); then st=0; else st=$?; fi
	err=$(cat "$tmp/err")
	[ "$st" = "$want_st" ] || fail "$label: expected exit $want_st, got $st"
	[ "$out" = "" ] || fail "$label: expected no stdout, got '$out'"
	[ "$err" = "$want_err" ] || fail "$label: expected stderr '$want_err', got '$err'"
}

# same <label> <file a> <file b>: byte-equal files.
same() {
	cmp -s "$2" "$3" || fail "$1: $2 differs from $3"
}

# w <file> <line>...: a file of exactly these lines, each ending in LF.
w() {
	f=$1
	shift
	printf '%s\n' "$@" > "$f"
}

T=$(printf '\t')
H40=0123456789abcdef0123456789abcdef01234567
H64=fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210
HEX=abababababababababababababababababababababababababababababababab

# ---------------------------------------------------------------------------
# The full run: two claims files and an unused third, claims of every kind.
M=$tmp/main
mkdir -p "$M/report/parts" "$M/pass1" "$M/pass2"
w "$M/report/parts/claims-files.txt" \
	"handoff.md${T}/w/handoff.md${T}handoff${T}$H40" \
	"the notes.md${T}/w/the notes.md${T}prose${T}$H64" \
	"unused.md${T}/w/unused.md${T}prose${T}$H40"
w "$M/report/parts/items.txt" 'C1: F-1, F-2' 'C2: g1-3'
w "$M/report/parts/claims-override.txt" \
	'claim 5: true, reproduced; by hand' \
	'claim 4 correction: the build fails on windows' \
	'claim 10: not verified; C2' \
	'claim 11: not verified' \
	'claim 6 correction: unused correction'
w "$M/claims.md" \
	'# Claims' \
	'' \
	'1. [claim:verification] b1/T-1 handoff.md:10 (v1): tests pass -> g1' \
	'2. [claim:verification] b1/T-1 the notes.md:3: lint is clean -> g1' \
	'3. [claim:verification] b1/github:owner/repo#12 handoff.md:12 (v2): the a -> b mapping works -> g2' \
	'4. [claim:verification] b1/T-2 handoff.md:14 (v3): the build is green -> g1' \
	'5. [claim:verification] b1/T-2 handoff.md:15 (v4): docs build -> g2' \
	'6. [claim:decision] b1/T-1 handoff.md:20 (d1): chose sqlite -> g1' \
	'7. [claim:decision] b1/T-1 handoff.md:21 (d2): rejected redis -> g1' \
	'8. [claim:scope] b1/T-1 handoff.md:30 (s1): the importer is out of scope -> hygiene' \
	'9. [other] b2/none the notes.md:4: see the board -> none' \
	'10. [claim:status] b2/none the notes.md:5: T-9 is closed -> hygiene' \
	'11. [claim:code] b2/none the notes.md:7: the lock is held -> g1' \
	'12. [claim:scope] b2/none the notes.md:8: out of scope: billing -> hygiene' \
	'13. [other] b2/none the notes.md:9: thanks -> none'
w "$M/pass1/g1.md" \
	'# Group g1' \
	'## Claims' \
	'- claim 1: true, reproduced; g1-3' \
	'- claim 2: true, reproduced; ran npm run lint, exit 0' \
	'- claim 3: not verified, not reproduced; needs a live check: env staging' \
	'none' \
	'- claim 4: false, contradicted; F-1' \
	'- claim 5: false, contradicted; replaced by the override' \
	'## Decisions' \
	'- claim 6 (d1): evidenced; resolution: taken; finding: none' \
	'```' \
	'- claim 7 (zz): bogus, fenced' \
	'```' \
	'## Scope' \
	'- claim 8 (s1): introduced by the bundle: yes; recommendation: include' \
	'runs:' \
	'- claim 12 (s2): bogus, after runs' \
	'status: complete'
w "$M/pass1/g2.md" \
	'## Claims' \
	'  ```text' \
	'- claim 6: true; fenced' \
	'  ```' \
	'- claim 7: true; ignored, the decision has no entry' \
	'- claim 8: true; F-2' \
	'- claim 10: not verified; no access' \
	'## Decisions' \
	'none' \
	'## Scope' \
	'none' \
	'consumed: none'
w "$M/pass2/p.md" \
	'## Verified OK challenged' \
	'- claim 1: upheld; evidence: outside any claims section' \
	'## Claims challenged' \
	'- claim 1: upheld; evidence: reran the suite' \
	'- claim 2: overturned to false, contradicted; evidence: lint exit 1' \
	'## Decisions challenged' \
	'- claim 6: agree; evidence: the record' \
	'## Scope challenged' \
	'none'
run "main parts" 0 "" parts "$M"

w "$tmp/want-claims" \
	'## 10. Claims' \
	'' \
	'Reproducing a stated result does not show that the build session ran its stated check.' \
	'' \
	'- claim 1 [verification]: true, reproduced; g1-3 (C2)' \
	'- claim 2 [verification]: contested; pass one: true, reproduced; ran npm run lint, exit 0; pass two: overturned to false, contradicted; evidence: lint exit 1' \
	'- claim 3 [verification]: not verified, not reproduced; needs a live check: env staging' \
	'- claim 4 [verification]: false, contradicted; F-1 (C1)' \
	'- claim 5 [verification]: true, reproduced; by hand' \
	'- claim 6 [decision]: not verified; no pass-one line' \
	'- claim 7 [decision]: not verified; not assessed' \
	'- claim 8 [scope]: true; F-2 (C1)' \
	'- claim 10 [status]: not verified; C2' \
	'- claim 11 [code]: not verified' \
	'- claim 12 [scope]: not verified; not assessed' \
	'' \
	'Other sentences, counted and not listed: 2' \
	''
same "main 10-claims.md" "$M/report/parts/10-claims.md" "$tmp/want-claims"

w "$tmp/want-decisions" \
	'## 8. Decisions' \
	'' \
	'### Decision ledger' \
	'' \
	'- claim 6 (d1): evidenced; resolution: taken; finding: none' \
	'  pass two: agree; evidence: the record' \
	'- claim 7: not assessed' \
	'' \
	'### Raised tickets' \
	'' \
	'- claim 8 (s1): introduced by the bundle: yes; recommendation: include' \
	'  pass two: not challenged' \
	'- claim 12: not assessed' \
	''
same "main 08-decisions.md" "$M/report/parts/08-decisions.md" "$tmp/want-decisions"

w "$tmp/want-body" \
	"## /w/handoff.md (handoff), hash $H40" \
	'' \
	'- claim 1 [verification] handoff.md:10 v1: true; finding: C2; evidence: C2' \
	'  ticket: T-1' \
	'  text: tests pass' \
	'  correction: none' \
	'- claim 3 [verification] handoff.md:12 v2: not reproducible here; finding: none; evidence: needs a live check: env staging' \
	'  ticket: github:owner/repo#12' \
	'  text: the a -> b mapping works' \
	'  correction: none' \
	'- claim 4 [verification] handoff.md:14 v3: false; finding: C1; evidence: C1' \
	'  ticket: T-2' \
	'  text: the build is green' \
	'  correction: the build fails on windows' \
	'- claim 5 [verification] handoff.md:15 v4: true; finding: none; evidence: by hand' \
	'  ticket: T-2' \
	'  text: docs build' \
	'  correction: none' \
	'- claim 6 [decision] handoff.md:20 d1: not verified; finding: none; evidence: no pass-one line' \
	'  ticket: T-1' \
	'  text: chose sqlite' \
	'  correction: none' \
	'- claim 7 [decision] handoff.md:21 d2: not verified; finding: none; evidence: not assessed' \
	'  ticket: T-1' \
	'  text: rejected redis' \
	'  correction: none' \
	'- claim 8 [scope] handoff.md:30 s1: true; finding: C1; evidence: C1' \
	'  ticket: T-1' \
	'  text: the importer is out of scope' \
	'  correction: none' \
	'' \
	"## /w/the notes.md (prose), hash $H64" \
	'' \
	'- claim 2 [verification] the notes.md:3 -: contested; finding: none; evidence: pass one: true, reproduced; ran npm run lint, exit 0; pass two: overturned to false, contradicted; evidence: lint exit 1' \
	'  ticket: T-1' \
	'  text: lint is clean' \
	'  correction: none' \
	'- claim 10 [status] the notes.md:5 -: not verified; finding: C2; evidence: C2' \
	'  ticket: none' \
	'  text: T-9 is closed' \
	'  correction: none' \
	'- claim 11 [code] the notes.md:7 -: not verified; finding: none; evidence: none' \
	'  ticket: none' \
	'  text: the lock is held' \
	'  correction: none' \
	'- claim 12 [scope] the notes.md:8 -: not verified; finding: none; evidence: not assessed' \
	'  ticket: none' \
	'  text: out of scope: billing' \
	'  correction: none' \
	'' \
	"## /w/unused.md (prose), hash $H40" \
	'' \
	'none'
same "main claims-verdicts.body.md" "$M/report/parts/claims-verdicts.body.md" "$tmp/want-body"
[ -z "$(ls "$M/report/parts" | grep 'tmp$')" ] || fail "main: a .tmp file was left"

# A second run over the same directory gives the same bytes.
run "main parts again" 0 "" parts "$M"
same "main again 10-claims.md" "$M/report/parts/10-claims.md" "$tmp/want-claims"

# Empty claims-files.txt, items.txt and claims.md without claims: the minimal outputs.
E=$tmp/empty
mkdir -p "$E/report/parts"
: > "$E/report/parts/claims-files.txt"
: > "$E/report/parts/items.txt"
w "$E/claims.md" '1. [other] none/none x.md:1: hello -> none'
run "empty parts" 0 "" parts "$E"
w "$tmp/want-e-claims" '## 10. Claims' '' 'Reproducing a stated result does not show that the build session ran its stated check.' '' 'none' '' 'Other sentences, counted and not listed: 1' ''
same "empty 10-claims.md" "$E/report/parts/10-claims.md" "$tmp/want-e-claims"
w "$tmp/want-e-dec" '## 8. Decisions' '' '### Decision ledger' '' 'none' '' '### Raised tickets' '' 'none' ''
same "empty 08-decisions.md" "$E/report/parts/08-decisions.md" "$tmp/want-e-dec"
[ -f "$E/report/parts/claims-verdicts.body.md" ] && [ ! -s "$E/report/parts/claims-verdicts.body.md" ] || fail "empty: the body part is not an empty file"

# A claim line whose ref holds a colon and whose ticket holds slashes; a 64-character hash
# and a name with a colon-digit-colon inside the text.
Q=$tmp/odd
mkdir -p "$Q/report/parts"
w "$Q/report/parts/claims-files.txt" "a b.md${T}/w/a b.md${T}prose${T}$H64"
: > "$Q/report/parts/items.txt"
w "$Q/claims.md" '1. [claim:decision] bun/a/b/c a b.md:4 (r:1:x): it ran at 10:30: ok -> g -> h'
run "odd claim line" 0 "" parts "$Q"
w "$tmp/want-q-body" \
	"## /w/a b.md (prose), hash $H64" \
	'' \
	'- claim 1 [decision] a b.md:4 r:1:x: not verified; finding: none; evidence: not assessed' \
	'  ticket: a/b/c' \
	'  text: it ran at 10:30: ok -> g' \
	'  correction: none'
same "odd claim body" "$Q/report/parts/claims-verdicts.body.md" "$tmp/want-q-body"

# ---------------------------------------------------------------------------
# assemble
A=$tmp/asm
mkdir -p "$A/report/parts"
w "$A/report/parts/00-header.md" H
w "$A/report/parts/05 odd.md" S
printf 'D' > "$A/report/parts/08-decisions.md"
w "$A/report/parts/08-other.md" O
printf 'L\n\n' > "$A/report/parts/09-live.md"
w "$A/report/parts/10-claims.md" C
w "$A/report/parts/claims-verdicts.body.md" B
w "$A/report/parts/zz.txt" Z
run "assemble" 0 "" assemble "$A"
printf 'H\nS\nDO\nL\n\nC\n' > "$tmp/want-asm"
same "assemble body" "$A/report.body.tmp" "$tmp/want-asm"
[ ! -e "$A/report.body.tmp.tmp" ] || fail "assemble: a temp file was left"

mkdir -p "$tmp/asm0/report/parts"
w "$tmp/asm0/report/parts/claims-verdicts.body.md" B
run "assemble without a part" 1 "report: report/parts:0: no part file" assemble "$tmp/asm0"
[ ! -e "$tmp/asm0/report.body.tmp" ] || fail "assemble without a part: an output was written"
mkdir -p "$tmp/asm1"
run "assemble without report/parts" 2 "report: cannot read report/parts" assemble "$tmp/asm1"
mkdir -p "$tmp/asm2/report.body.tmp.tmp"
cp -r "$A/report" "$tmp/asm2/report"
run "assemble cannot write" 2 "report: cannot write report.body.tmp" assemble "$tmp/asm2"
mkdir -p "$tmp/asm3/report.body.tmp"
cp -r "$A/report" "$tmp/asm3/report"
run "assemble onto a directory" 2 "report: cannot write report.body.tmp" assemble "$tmp/asm3"
[ -z "$(ls -A "$tmp/asm3/report.body.tmp")" ] || fail "assemble onto a directory: something was moved into it"
[ ! -e "$tmp/asm3/report.body.tmp.tmp" ] || fail "assemble onto a directory: a temp file was left"

# ---------------------------------------------------------------------------
# claims-verdicts
V=$tmp/2026-run-x
mkdir -p "$V/report/parts"
w "$V/report/parts/claims-verdicts.body.md" \
	"## /w/handoff.md (handoff), hash $H40" \
	'' \
	'- claim 1 [code] handoff.md:1 -: true; finding: none; evidence: none' \
	'  ticket: none' \
	'  text: x' \
	'  correction: none'
run "claims-verdicts" 0 "" claims-verdicts "$V/" "$HEX"
w "$tmp/want-cv" \
	'# Claims verdicts: 2026-run-x' \
	'' \
	"report revision: sha256:$HEX" \
	'' \
	'Apply a line only when its file hash and claim text match what you hold. `false` lines' \
	'are corrections: the statement is contradicted by the cited evidence. `not verified` lines' \
	'on verification claims are recheck requests: the audit could not reproduce the check, which' \
	'is not evidence the statement is wrong. `not reproducible here` lines are not recheck' \
	'requests: the check ran against an environment the audit cannot reach, so run it against' \
	'that environment and feed the result back with `/audit:resume 2026-run-x --live <file>`.' \
	'`contested` lines need a person to decide.' \
	'' \
	"## /w/handoff.md (handoff), hash $H40" \
	'' \
	'- claim 1 [code] handoff.md:1 -: true; finding: none; evidence: none' \
	'  ticket: none' \
	'  text: x' \
	'  correction: none'
sed '4d' "$V/claims-verdicts.md" > "$tmp/got-cv"
same "claims-verdicts file" "$tmp/got-cv" "$tmp/want-cv"
sed -n '4p' "$V/claims-verdicts.md" | grep -Eq '^generated: [0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$' || fail "claims-verdicts: the generated line is '$(sed -n '4p' "$V/claims-verdicts.md")'"
[ ! -e "$V/claims-verdicts.md.tmp" ] || fail "claims-verdicts: a temp file was left"

# An empty body part: the file ends right after the paragraph.
: > "$V/report/parts/claims-verdicts.body.md"
run "claims-verdicts empty body" 0 "" claims-verdicts "$V" "$HEX"
sed '4d' "$V/claims-verdicts.md" > "$tmp/got-cv0"
sed '12,$d' "$tmp/want-cv" > "$tmp/want-cv0"
same "claims-verdicts empty body file" "$tmp/got-cv0" "$tmp/want-cv0"

mkdir "$V/claims-verdicts.md.tmp"
run "claims-verdicts cannot write" 2 "report: cannot write claims-verdicts.md" claims-verdicts "$V" "$HEX"
rmdir "$V/claims-verdicts.md.tmp"

mkdir -p "$tmp/cv3/report/parts" "$tmp/cv3/claims-verdicts.md"
w "$tmp/cv3/report/parts/claims-verdicts.body.md" B
run "claims-verdicts onto a directory" 2 "report: cannot write claims-verdicts.md" claims-verdicts "$tmp/cv3" "$HEX"
[ -z "$(ls -A "$tmp/cv3/claims-verdicts.md")" ] || fail "claims-verdicts onto a directory: something was moved into it"

mkdir -p "$tmp/cv2"
run "claims-verdicts without a body part" 2 "report: cannot read report/parts/claims-verdicts.body.md" claims-verdicts "$tmp/cv2" "$HEX"

# ---------------------------------------------------------------------------
# Usage.
U="usage: report.sh parts <run dir> | assemble <run dir> | claims-verdicts <run dir> <hex>"
run "no arguments" 2 "$U"
run "bad verb" 2 "$U" frobnicate "$tmp"
run "parts without a directory" 2 "$U" parts
run "parts with two directories" 2 "$U" parts "$tmp" "$tmp"
run "assemble without a directory" 2 "$U" assemble
run "assemble with an extra argument" 2 "$U" assemble "$tmp" extra
run "claims-verdicts with two arguments" 2 "$U" claims-verdicts "$V"
run "claims-verdicts with four arguments" 2 "$U" claims-verdicts "$V" "$HEX" extra
run "uppercase hex" 2 "$U" claims-verdicts "$V" ABABABABABABABABABABABABABABABABABABABABABABABABABABABABABABABAB
run "short hex" 2 "$U" claims-verdicts "$V" "${HEX%ab}"
run "long hex" 2 "$U" claims-verdicts "$V" "${HEX}a"
run "non-hex character" 2 "$U" claims-verdicts "$V" abababababababababababababababababababababababababababababababag
run "empty hex" 2 "$U" claims-verdicts "$V" ""

# ---------------------------------------------------------------------------
# Error cases. base <dir> makes a valid minimal run; perr runs parts and checks the exit
# 1 line and that nothing was written.
base() {
	rm -rf "$1"
	mkdir -p "$1/report/parts"
	w "$1/report/parts/claims-files.txt" "h.md${T}/w/h.md${T}handoff${T}$H40"
	w "$1/report/parts/items.txt" 'C1: F-1'
	w "$1/claims.md" '1. [claim:code] b/T-1 h.md:1: x -> g1' '2. [claim:decision] b/T-1 h.md:2 (d1): y -> g1' '3. [claim:scope] b/T-1 h.md:3 (s1): z -> hygiene' '4. [other] b/none h.md:4: w -> none'
}
nowrite() {
	if ls "$2/report/parts" | grep -Eq '^(10-|08-)|body|tmp$'; then
		fail "$1: an output or a temp file was written"
	fi
}
perr() {
	run "$1" 1 "$3" parts "$2"
	nowrite "$1" "$2"
}
D=$tmp/e

base "$D"; w "$D/report/parts/claims-files.txt" "h.md${T}/w/h.md${T}handoff${T}$H40" "h2.md${T}/w/h2.md${T}prose"
perr "claims-files with three fields" "$D" "report: report/parts/claims-files.txt:2: malformed line"
base "$D"; w "$D/report/parts/claims-files.txt" "h.md${T}/w/h.md${T}other${T}$H40"
perr "claims-files with a bad kind" "$D" "report: report/parts/claims-files.txt:1: malformed line"
base "$D"; w "$D/report/parts/claims-files.txt" "h.md${T}/w/h.md${T}handoff${T}${H40}0"
perr "claims-files with a 41 character hash" "$D" "report: report/parts/claims-files.txt:1: malformed line"
base "$D"; w "$D/report/parts/claims-files.txt" "h.md${T}/w/h.md${T}handoff${T}0123456789ABCDEF0123456789abcdef01234567"
perr "claims-files with an uppercase hash" "$D" "report: report/parts/claims-files.txt:1: malformed line"
base "$D"; w "$D/report/parts/claims-files.txt" "h.md${T}/w/h.md${T}handoff${T}$H40${T}extra"
perr "claims-files with five fields" "$D" "report: report/parts/claims-files.txt:1: malformed line"
base "$D"; w "$D/report/parts/claims-files.txt" "h.md${T}/w/h.md${T}handoff${T}$H40" ''
perr "claims-files with a blank line" "$D" "report: report/parts/claims-files.txt:2: malformed line"
base "$D"; w "$D/report/parts/claims-files.txt" "h.md${T}/w/h.md${T}handoff${T}$H40" "h.md${T}/w/other.md${T}prose${T}$H64"
perr "claims-files with a name twice" "$D" "report: report/parts/claims-files.txt:2: h.md listed twice"

base "$D"; w "$D/report/parts/items.txt" 'C1: F-1' 'C2 F-2'
perr "items without a colon" "$D" "report: report/parts/items.txt:2: malformed line"
base "$D"; w "$D/report/parts/items.txt" 'C1: F-1,F-2'
perr "items without a blank after the comma" "$D" "report: report/parts/items.txt:1: malformed line"
base "$D"; w "$D/report/parts/items.txt" 'X1: F-1'
perr "items without a C" "$D" "report: report/parts/items.txt:1: malformed line"
base "$D"; w "$D/report/parts/items.txt" 'C1:'
perr "items without an id" "$D" "report: report/parts/items.txt:1: malformed line"
base "$D"; w "$D/report/parts/items.txt" 'C1: F-1, F-2' 'C2: F-3, F-2'
perr "items with an id in two items" "$D" "report: report/parts/items.txt:2: F-2 in two items"

base "$D"; w "$D/report/parts/claims-override.txt" 'claim 1: true; ok' 'claim one: x'
perr "override with a bad number" "$D" "report: report/parts/claims-override.txt:2: malformed line"
base "$D"; w "$D/report/parts/claims-override.txt" 'claim 1:'
perr "override without text" "$D" "report: report/parts/claims-override.txt:1: malformed line"
base "$D"; w "$D/report/parts/claims-override.txt" 'claim 1 correction: '
perr "override correction without text" "$D" "report: report/parts/claims-override.txt:1: malformed line"
base "$D"; w "$D/report/parts/claims-override.txt" 'claim 1: a' 'claim 1: b'
perr "override verdict twice" "$D" "report: report/parts/claims-override.txt:2: claim 1 listed twice"
base "$D"; w "$D/report/parts/claims-override.txt" 'claim 1 correction: a' 'claim 1: b' 'claim 1 correction: c'
perr "override correction twice" "$D" "report: report/parts/claims-override.txt:3: claim 1 listed twice"
base "$D"; w "$D/report/parts/claims-override.txt" 'claim 1: a' 'claim 9: b'
perr "override for an unknown claim" "$D" "report: report/parts/claims-override.txt:2: claim 9 is not a claim of claims.md"
base "$D"; w "$D/report/parts/claims-override.txt" 'claim 4 correction: b'
perr "override for an other line" "$D" "report: report/parts/claims-override.txt:1: claim 4 is not a claim of claims.md"
base "$D"; w "$D/report/parts/claims-override.txt" 'claim 1: a' 'claim 9: b'; w "$D/claims.md" '1. [claim:bogus] b/T-1 h.md:1: x -> g1'
perr "claims.md is checked before the override claims" "$D" "report: claims.md:1: not a claim line"

base "$D"; w "$D/claims.md" '1. [claim:code] b/T-1 h.md:1: x -> g1' '2. [claim:bogus] b/T-1 h.md:2: x -> g1'
perr "claims.md with a bad kind" "$D" "report: claims.md:2: not a claim line"
base "$D"; w "$D/claims.md" '# title' '' '1. [claim:code] noticket h.md:1: x -> g1'
perr "claims.md with a token without a slash" "$D" "report: claims.md:3: not a claim line"
base "$D"; w "$D/claims.md" '1. [claim:code] b/T-1 h.md: x -> g1'
perr "claims.md without a line number" "$D" "report: claims.md:1: not a claim line"
base "$D"; w "$D/claims.md" '1. [claim:code] b/T-1 h.md:1: x'
perr "claims.md without a target" "$D" "report: claims.md:1: not a claim line"
base "$D"; w "$D/claims.md" '1. [claim:code] b/T-1 h.md:1 (r: x -> g1'
perr "claims.md with an unclosed ref" "$D" "report: claims.md:1: not a claim line"
base "$D"; w "$D/claims.md" '1. [bogus] b/T-1 h.md:1: x -> g1'
perr "claims.md with an unknown form" "$D" "report: claims.md:1: not a claim line"
base "$D"; w "$D/claims.md" '1. [claim:code] b/T-1 h.md:1: x -> g1' '2. [claim:code] b/T-1 gone.md:5: x -> g1'
perr "claims.md with an unlisted source" "$D" "report: claims.md:2: gone.md is not in report/parts/claims-files.txt"

p1() { base "$D"; mkdir -p "$D/pass1"; }
p1; w "$D/pass1/g1.md" '## Claims' '- claim x: true'
perr "pass1 claims entry without a number" "$D" "report: pass1/g1.md:2: malformed claim line"
p1; w "$D/pass1/g1.md" '## Claims' '- claim 1 true'
perr "pass1 claims entry without a colon" "$D" "report: pass1/g1.md:2: malformed claim line"
p1; w "$D/pass1/g1.md" '## Claims' '- claim 1: '
perr "pass1 claims entry without a rest" "$D" "report: pass1/g1.md:2: malformed claim line"
p1; w "$D/pass1/g1.md" '## Decisions' '- claim 2: agree'
perr "pass1 decisions entry without a ref" "$D" "report: pass1/g1.md:2: malformed claim line"
p1; w "$D/pass1/g1.md" '## Scope' '- claim 3 (s1): '
perr "pass1 scope entry without a rest" "$D" "report: pass1/g1.md:2: malformed claim line"
p1; w "$D/pass1/g1.md" '## Claims' '- claim 1: true' '## Scope' '- claim 3 (a)b): x'
perr "pass1 scope entry with a closing parenthesis in the ref" "$D" "report: pass1/g1.md:4: malformed claim line"
p1; w "$D/pass1/g1.md" '## Claims' '- claim 7: true'
perr "pass1 unknown claim" "$D" "report: pass1/g1.md:2: claim 7 is not a claim of claims.md"
p1; w "$D/pass1/g1.md" '## Claims' '- claim 4: true'
perr "pass1 entry for an other line" "$D" "report: pass1/g1.md:2: claim 4 is not a claim of claims.md"
p1; w "$D/pass1/g1.md" '## Claims' '- claim 1: true' 'runs: none'; w "$D/pass1/g2.md" '## Claims' 'none' '- claim 1: false'
perr "pass1 claim twice across files" "$D" "report: pass1/g2.md:3: claim 1 listed twice"
p1; w "$D/pass1/g1.md" '## Decisions' '- claim 2 (d1): a' '- claim 2 (d1): b'
perr "pass1 decision twice" "$D" "report: pass1/g1.md:3: claim 2 listed twice"
p1; w "$D/pass1/g1.md" '## Decisions' '- claim 1 (d1): a'
perr "pass1 decision for a code claim" "$D" "report: pass1/g1.md:2: claim 1 is not a decision claim"
p1; w "$D/pass1/g1.md" '## Scope' '- claim 2 (s1): a'
perr "pass1 scope for a decision claim" "$D" "report: pass1/g1.md:2: claim 2 is not a scope claim"
p1; w "$D/pass1/g1.md" '## Claims' '- claim 1: true' '## Decisions' '- claim 2 (d1): a' '- claim 2 (d1): b'
perr "pass1 error in a later section" "$D" "report: pass1/g1.md:5: claim 2 listed twice"
# The same claim in two kinds of section is not a repeat.
p1; w "$D/pass1/g1.md" '## Claims' '- claim 2: true' '## Decisions' '- claim 2 (d1): a'
run "pass1 same claim in two sections" 0 "" parts "$D"

p2() { base "$D"; mkdir -p "$D/pass2"; }
p2; w "$D/pass2/a.md" '## Claims challenged' '- claim 1 upheld'
perr "pass2 entry without a colon" "$D" "report: pass2/a.md:2: malformed claim line"
p2; w "$D/pass2/a.md" '## Decisions challenged' '- claim 2 (d1): agree'
perr "pass2 entry with a ref" "$D" "report: pass2/a.md:2: malformed claim line"
p2; w "$D/pass2/a.md" '## Scope challenged' '- claim 8: agree'
perr "pass2 unknown claim" "$D" "report: pass2/a.md:2: claim 8 is not a claim of claims.md"
p2; w "$D/pass2/a.md" '## Claims challenged' '- claim 1: upheld; evidence: a'; w "$D/pass2/b.md" '## Claims challenged' '- claim 1: upheld; evidence: b'
perr "pass2 claim twice across files" "$D" "report: pass2/b.md:2: claim 1 listed twice"
p2; w "$D/pass2/a.md" '## Scope challenged' '- claim 3: agree' '- claim 3: agree'
perr "pass2 scope twice" "$D" "report: pass2/a.md:3: claim 3 listed twice"

p1; w "$D/pass1/g1.md" '## Claims' '- claim 1: false, contradicted; F-1'
perr "false claim without a correction" "$D" "report: claims.md:1: claim 1 is false and report/parts/claims-override.txt gives no correction"
w "$D/report/parts/claims-override.txt" 'claim 1 correction: x is wrong'
run "false claim with a correction" 0 "" parts "$D"

# A pre-top-up copy of a pass report is not a report: the outputs are the same with it.
p1; w "$D/pass1/g1.md" '## Claims' '- claim 1: true; F-1'
mkdir -p "$D/pass2"; w "$D/pass2/g1.md" '## Claims challenged' '- claim 1: upheld; evidence: reran'
run "pre-topup copies absent" 0 "" parts "$D"
for n in 10-claims.md 08-decisions.md claims-verdicts.body.md; do cp "$D/report/parts/$n" "$tmp/plain-$n"; done
cp "$D/pass1/g1.md" "$D/pass1/g1.pre-topup.md"
cp "$D/pass2/g1.md" "$D/pass2/g1.pre-topup.md"
run "pre-topup copies present" 0 "" parts "$D"
w "$tmp/want-pt" \
	'## 10. Claims' \
	'' \
	'Reproducing a stated result does not show that the build session ran its stated check.' \
	'' \
	'- claim 1 [code]: true; F-1 (C1)' \
	'- claim 2 [decision]: not verified; not assessed' \
	'- claim 3 [scope]: not verified; not assessed' \
	'' \
	'Other sentences, counted and not listed: 1' \
	''
same "pre-topup 10-claims.md" "$D/report/parts/10-claims.md" "$tmp/want-pt"
for n in 10-claims.md 08-decisions.md claims-verdicts.body.md; do same "pre-topup $n" "$D/report/parts/$n" "$tmp/plain-$n"; done

# Pass-one evidence that cites several finding ids maps each id; one mapped id is unchanged.
base "$D"
w "$D/report/parts/items.txt" 'C1: g1-F1' 'C3: g2-F4'
w "$D/claims.md" \
	'1. [claim:code] b/T-1 h.md:1: x -> g1' \
	'2. [claim:code] b/T-1 h.md:2: y -> g1' \
	'3. [claim:code] b/T-1 h.md:3: z -> g1'
mkdir -p "$D/pass1"
w "$D/pass1/g1.md" '## Claims' \
	'- claim 1: true; g1-F1, g2-F4' \
	'- claim 2: true; g1-F1 (see the log)' \
	'- claim 3: true; g2-F4, g1-F1, g2-F4'
run "several finding ids" 0 "" parts "$D"
w "$tmp/want-mf" \
	'## 10. Claims' \
	'' \
	'Reproducing a stated result does not show that the build session ran its stated check.' \
	'' \
	'- claim 1 [code]: true; g1-F1, g2-F4 (C1, C3)' \
	'- claim 2 [code]: true; g1-F1 (see the log) (C1)' \
	'- claim 3 [code]: true; g2-F4, g1-F1, g2-F4 (C3, C1)' \
	'' \
	'Other sentences, counted and not listed: 0' \
	''
same "several finding ids 10-claims.md" "$D/report/parts/10-claims.md" "$tmp/want-mf"
w "$tmp/want-mf-body" \
	"## /w/h.md (handoff), hash $H40" \
	'' \
	'- claim 1 [code] h.md:1 -: true; finding: C1, C3; evidence: C1, C3' \
	'  ticket: T-1' \
	'  text: x' \
	'  correction: none' \
	'- claim 2 [code] h.md:2 -: true; finding: C1; evidence: C1' \
	'  ticket: T-1' \
	'  text: y' \
	'  correction: none' \
	'- claim 3 [code] h.md:3 -: true; finding: C3, C1; evidence: C3, C1' \
	'  ticket: T-1' \
	'  text: z' \
	'  correction: none'
same "several finding ids body" "$D/report/parts/claims-verdicts.body.md" "$tmp/want-mf-body"

# An existing output survives a failed run unchanged.
base "$D"; w "$D/claims.md" 'junk' '1. [claim:bad'
printf 'old\n' > "$D/report/parts/10-claims.md"
perr_keep() { run "$1" 1 "$3" parts "$2"; }
perr_keep "existing output kept" "$D" "report: claims.md:2: not a claim line"
printf 'old\n' > "$tmp/want-old"
same "existing output kept file" "$D/report/parts/10-claims.md" "$tmp/want-old"

# ---------------------------------------------------------------------------
# IO failures.
base "$D"; rm "$D/report/parts/claims-files.txt"
run "missing claims-files.txt" 2 "report: cannot read report/parts/claims-files.txt" parts "$D"
base "$D"; rm "$D/report/parts/items.txt"
run "missing items.txt" 2 "report: cannot read report/parts/items.txt" parts "$D"
base "$D"; rm "$D/claims.md"
run "missing claims.md" 2 "report: cannot read claims.md" parts "$D"
rm -rf "$tmp/nodir"
run "missing run directory" 2 "report: cannot read report/parts/claims-files.txt" parts "$tmp/nodir"
[ ! -e "$tmp/nodir" ] || fail "missing run directory: something was created"
# The first error in input order wins: a bad claims-files.txt before a missing items.txt.
base "$D"; rm "$D/report/parts/items.txt"; w "$D/report/parts/claims-files.txt" 'junk'
run "claims-files error before a missing items.txt" 1 "report: report/parts/claims-files.txt:1: malformed line" parts "$D"
base "$D"; mkdir "$D/report/parts/10-claims.md.tmp"
run "parts cannot write" 2 "report: cannot write report/parts/10-claims.md" parts "$D"
rmdir "$D/report/parts/10-claims.md.tmp" 2> /dev/null
nowrite "parts cannot write" "$D"
# The message names the file whose write failed.
base "$D"; mkdir "$D/report/parts/08-decisions.md.tmp"
run "parts cannot write the decisions part" 2 "report: cannot write report/parts/08-decisions.md" parts "$D"
rmdir "$D/report/parts/08-decisions.md.tmp" 2> /dev/null
nowrite "parts cannot write the decisions part" "$D"
base "$D"; mkdir "$D/report/parts/claims-verdicts.body.md.tmp"
run "parts cannot write the body part" 2 "report: cannot write report/parts/claims-verdicts.body.md" parts "$D"
rmdir "$D/report/parts/claims-verdicts.body.md.tmp" 2> /dev/null
nowrite "parts cannot write the body part" "$D"
# A destination that is a directory is refused before anything is moved: all or none.
base "$D"; mkdir "$D/report/parts/08-decisions.md"
run "parts onto a directory" 2 "report: cannot write report/parts/08-decisions.md" parts "$D"
[ -z "$(ls -A "$D/report/parts/08-decisions.md")" ] || fail "parts onto a directory: something was moved into it"
rmdir "$D/report/parts/08-decisions.md"
nowrite "parts onto a directory" "$D"

if [ "$fails" -eq 0 ]; then
	echo "report test: ok"
	exit 0
fi
exit 1

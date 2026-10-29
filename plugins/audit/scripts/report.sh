#!/bin/sh
# report.sh: write the mechanical parts of an audit report, join them, and write the
# claims verdicts file.
#
# Usage:
#   sh report.sh parts <run dir>
#   sh report.sh assemble <run dir>
#   sh report.sh claims-verdicts <run dir> <hex>
#
# parts reads, under <run dir>: report/parts/claims-files.txt (one line per claims file,
# `<name>TAB<absolute path>TAB<handoff|prose>TAB<40 or 64 lowercase hex>`; may be empty),
# report/parts/items.txt (`C<n>: <id>, <id>, ...`; may be empty),
# report/parts/claims-override.txt (optional; `claim <n>: <verdict>` and
# `claim <n> correction: <text>`), claims.md, and the `## Claims`, `## Decisions` and
# `## Scope` sections of pass1/*.md and the `## Claims challenged`, `## Decisions
# challenged` and `## Scope challenged` sections of pass2/*.md; a *.pre-topup.md copy is
# not a report and is skipped. Every input line is read with one trailing CR removed, and
# a heading or an end line with its trailing blanks and tabs removed. A blank line of the
# three lists is skipped. A pass file whose last nonblank line is not `status: complete` is
# a failed output and is skipped as if absent. A finished pass-one file without
# `## Claims`, or a finished pass-two file without `## Claims challenged` that is not a
# map-correction *-topup.md file, is malformed, as is a claim number that claims.md lists twice. A pass-one claims
# line whose evidence (the text after the verdict's `; `) is a `, ` list takes the first
# word of each element: every such word that is an id of items.txt adds its item, once,
# in order of first appearance, as ` (C1, C2)` after the evidence and as the finding and
# the evidence of the verdicts line; a contested claim takes the same items as its
# finding, or `none`, and keeps its pass-one and pass-two text as the evidence. It
# writes, in report/parts/: 10-claims.md, 08-decisions.md and
# claims-verdicts.body.md, all three or none. A verdicts line carries the handoff ref
# bare, without the parentheses of claims.md, and `-` when the claim has none. The
# report/parts directory exists whenever the run succeeds, because claims-files.txt
# lives in it.
#
# assemble concatenates report/parts/*.md except claims-verdicts.body.md, in byte order of
# file name, byte for byte, into <run dir>/report.body.tmp.
#
# claims-verdicts writes <run dir>/claims-verdicts.md from the body part and a 64
# character lowercase hex report revision.
#
# Exit 0 with nothing on stdout when the outputs are written. Exit 1 with one line on
# stderr, `report: <file>:<line>: <message>`, on a malformed input (the first error
# found; <file> is relative to the run directory; nothing is written). Exit 2 with one
# line on stderr on usage, a missing required input (`report: cannot read <path>`) or a
# failed write (`report: cannot write <path>`, naming the file that failed, also when a
# destination is a directory). Every output is written to <name>.tmp beside its
# destination, and the destinations are checked before any is moved into place, so a
# failure leaves no partial file.
#
# POSIX sh plus awk; the awk program uses only features that mawk, gawk and BSD awk all
# accept. Values reach awk through the environment, so a backslash in a path is kept as
# it is.
LC_ALL=C
export LC_ALL
set -u

usage() {
	echo "usage: report.sh parts <run dir> | assemble <run dir> | claims-verdicts <run dir> <hex>" >&2
	exit 2
}

# listmd <dir> <name>: the run-relative names <name>/*.md of regular files, one per line,
# without the *.pre-topup.md copies a top-up leaves.
listmd() {
	for f in "$1"/*.md; do
		[ -f "$f" ] || continue
		case ${f##*/} in
		*.pre-topup.md) continue ;;
		esac
		printf '%s\n' "$2/${f##*/}"
	done
	return 0
}

cmd_parts() {
	run=$1
	pdir=$run/report/parts
	t1=$pdir/10-claims.md.tmp
	t2=$pdir/08-decisions.md.tmp
	t3=$pdir/claims-verdicts.body.md.tmp
	p1=$(listmd "$run/pass1" pass1)
	p2=$(listmd "$run/pass2" pass2)

	# The awk program reads and checks every input, then writes the three temp files. It
	# prints the one-line message on stdout and exits 1 (malformed input) or 3 (missing
	# input); any other failure is a write failure.
	msg=$(RP_DIR=$run RP_P1=$p1 RP_P2=$p2 RP_T1=$t1 RP_T2=$t2 RP_T3=$t3 awk '
function die(rel, ln, msg) {
	print "report: " rel ":" ln ": " msg
	exit 1
}
function nofile(rel) {
	print "report: cannot read " rel
	exit 3
}
# slurp: the lines of <dir>/<rel> into L[1..n]; returns n, or -1 when unreadable.
function slurp(rel,    path, r, n, line) {
	path = dir "/" rel
	n = 0
	while ((r = (getline line < path)) > 0) {
		sub(/\r$/, "", line)
		L[++n] = line
	}
	close(path)
	if (r < 0) return -1
	return n
}
function isend(s) {
	sub(/[ \t]+$/, "", s)
	return s == "runs:" || s == "runs: none" || s == "consumed:" || s == "consumed: none" || s == "opened:" || s == "opened: none" || s == "status: complete"
}
# parse_claim: split a claim line into pk (kind), ptk (ticket), psrc, pln, pref and ptx
# (text); returns 0 when the line is not in the claim form.
function parse_claim(line,    hdr, rest, sp, tok, sl, s, pos, p, q, r, r2, region, last, off, i) {
	if (!match(line, /^[0-9]+\. \[claim:(verification|decision|scope|status|code)\] /)) return 0
	hdr = substr(line, 1, RLENGTH)
	rest = substr(line, RLENGTH + 1)
	pk = hdr
	sub(/^[0-9]+\. \[claim:/, "", pk)
	sub(/\].*$/, "", pk)
	sp = index(rest, " ")
	if (sp == 0) return 0
	tok = substr(rest, 1, sp - 1)
	sl = index(tok, "/")
	if (sl < 2 || sl == length(tok)) return 0
	ptk = substr(tok, sl + 1)
	s = substr(rest, sp + 1)
	pos = 1
	region = ""
	psrc = ""
	while ((p = index(substr(s, pos), ":")) > 0) {
		p += pos - 1
		q = p + 1
		while (substr(s, q, 1) ~ /^[0-9]$/) q++
		if (p > 1 && q > p + 1) {
			if (substr(s, q, 2) == ": ") {
				psrc = substr(s, 1, p - 1)
				pln = substr(s, p + 1, q - p - 1)
				pref = ""
				region = substr(s, q + 2)
				break
			}
			if (substr(s, q, 2) == " (") {
				r = index(substr(s, q + 2), ")")
				if (r > 1 && substr(s, q + r + 1, 3) == "): ") {
					psrc = substr(s, 1, p - 1)
					pln = substr(s, p + 1, q - p - 1)
					pref = substr(s, q + 2, r - 1)
					region = substr(s, q + r + 4)
					break
				}
			}
		}
		pos = p + 1
	}
	if (psrc == "") return 0
	r2 = region
	last = 0
	off = 0
	while ((i = index(r2, " -> ")) > 0) {
		last = off + i
		off = last
		r2 = substr(r2, i + 1)
	}
	if (last == 0) return 0
	ptx = substr(region, 1, last - 1)
	if (ptx == "" || substr(region, last + 4) == "") return 0
	return 1
}
# scan: read the three sections of one pass file into E (entry rest) and EL (entry line).
function scan(rel, which,    n, i, line, fence, sect, k, num, after, rest, p, h, seen, last, lastl) {
	n = slurp(rel)
	if (n < 0) nofile(rel)
	last = n
	while (last > 0 && L[last] ~ /^[ \t]*$/) last--
	lastl = L[last]
	sub(/[ \t]+$/, "", lastl)
	if (last == 0 || lastl != "status: complete") return
	fence = 0
	sect = 0
	seen = 0
	for (i = 1; i <= n; i++) {
		line = L[i]
		if (line ~ /^[ \t]*```/) { fence = !fence; continue }
		if (fence) continue
		if (line ~ /^## /) {
			h = line
			sub(/[ \t]+$/, "", h)
			sect = 0
			for (k = 1; k <= 3; k++) if (h == H[which, k]) sect = k
			if (sect == 1) seen = 1
			continue
		}
		if (isend(line)) { sect = 0; continue }
		if (sect == 0 || line !~ /^- claim /) continue
		if (!match(line, /^- claim [0-9]+/)) die(rel, i, "malformed claim line")
		num = substr(line, 9, RLENGTH - 8)
		after = substr(line, RLENGTH + 1)
		if (which == 1 && sect >= 2) {
			if (substr(after, 1, 2) != " (") die(rel, i, "malformed claim line")
			p = index(after, ")")
			if (p < 4 || substr(after, p, 3) != "): " || length(after) < p + 3) die(rel, i, "malformed claim line")
			rest = substr(after, p + 3)
		} else {
			if (substr(after, 1, 2) != ": " || length(after) < 3) die(rel, i, "malformed claim line")
			rest = substr(after, 3)
		}
		if (!(num in ck)) die(rel, i, "claim " num " is not a claim of claims.md")
		if ((which, sect, num) in E) die(rel, i, "claim " num " listed twice")
		if (which == 1 && sect == 2 && ck[num] != "decision") die(rel, i, "claim " num " is not a decision claim")
		if (which == 1 && sect == 3 && ck[num] != "scope") die(rel, i, "claim " num " is not a scope claim")
		E[which, sect, num] = rest
		EL[which, sect, num] = line
	}
	if (!seen && !(which == 2 && rel ~ /-topup\.md$/)) die(rel, 1, "no " H[which, 1] " heading")
}
# ledger: the entries of one kind (decision or scope) of report/parts/08-decisions.md.
function ledger(kd, sect,    j, num, cnt) {
	cnt = 0
	for (j = 1; j <= nc; j++) {
		num = ord[j]
		if (ck[num] != kd) continue
		cnt++
		if ((1, sect, num) in E) {
			print EL[1, sect, num] > f2
			if ((2, sect, num) in E) print "  pass two: " E[2, sect, num] > f2
			else print "  pass two: not challenged" > f2
		} else print "- claim " num ": not assessed" > f2
	}
	if (cnt == 0) print "none" > f2
}

BEGIN {
	dir = ENVIRON["RP_DIR"]
	f1 = ENVIRON["RP_T1"]; f2 = ENVIRON["RP_T2"]; f3 = ENVIRON["RP_T3"]
	np1 = split(ENVIRON["RP_P1"], P1, "\n")
	np2 = split(ENVIRON["RP_P2"], P2, "\n")
	H[1, 1] = "## Claims"; H[1, 2] = "## Decisions"; H[1, 3] = "## Scope"
	H[2, 1] = "## Claims challenged"; H[2, 2] = "## Decisions challenged"; H[2, 3] = "## Scope challenged"

	# 1. claims-files.txt
	rel = "report/parts/claims-files.txt"
	n = slurp(rel)
	if (n < 0) nofile(rel)
	nf = 0
	for (i = 1; i <= n; i++) {
		if (L[i] == "") continue
		if (split(L[i], a, "\t") != 4 || a[1] == "" || a[2] == "" || (a[3] != "handoff" && a[3] != "prose") || a[4] !~ /^[0-9a-f]+$/ || (length(a[4]) != 40 && length(a[4]) != 64)) die(rel, i, "malformed line")
		if (a[1] in fidx) die(rel, i, a[1] " listed twice")
		nf++
		fidx[a[1]] = nf
		fname[nf] = a[1]; fpath[nf] = a[2]; fkind[nf] = a[3]; fhash[nf] = a[4]
	}

	# 2. items.txt
	rel = "report/parts/items.txt"
	n = slurp(rel)
	if (n < 0) nofile(rel)
	for (i = 1; i <= n; i++) {
		line = L[i]
		if (line == "") continue
		if (line !~ /^C[0-9]+: [^ ,]+(, [^ ,]+)*$/) die(rel, i, "malformed line")
		k = index(line, ":")
		item = substr(line, 1, k - 1)
		m = split(substr(line, k + 2), ids, ", ")
		for (j = 1; j <= m; j++) {
			if ((ids[j] in owner) && owner[ids[j]] != item) die(rel, i, ids[j] " in two items")
			owner[ids[j]] = item
		}
	}

	# 3. claims-override.txt (optional)
	orel = "report/parts/claims-override.txt"
	no = 0
	n = slurp(orel)
	for (i = 1; i <= n; i++) {
		line = L[i]
		if (line == "") continue
		if (line ~ /^claim [0-9]+: ./) {
			form = "v"
			k = index(line, ":")
			num = substr(line, 7, k - 7)
			text = substr(line, k + 2)
		} else if (line ~ /^claim [0-9]+ correction: ./) {
			form = "c"
			k = index(line, " correction: ")
			num = substr(line, 7, k - 7)
			text = substr(line, k + 13)
		} else die(orel, i, "malformed line")
		if ((form, num) in ovr) die(orel, i, "claim " num " listed twice")
		ovr[form, num] = text
		no++
		onum[no] = num; oline[no] = i
	}

	# 4. claims.md
	rel = "claims.md"
	n = slurp(rel)
	if (n < 0) nofile(rel)
	nc = 0
	nother = 0
	for (i = 1; i <= n; i++) {
		line = L[i]
		if (line !~ /^[0-9]+\. \[/) continue
		match(line, /^[0-9]+/)
		num = substr(line, 1, RLENGTH)
		if (line ~ /^[0-9]+\. \[other\]$/ || line ~ /^[0-9]+\. \[other\] /) { nother++; continue }
		if (!parse_claim(line)) die(rel, i, "not a claim line")
		if (!(psrc in fidx)) die(rel, i, psrc " is not in report/parts/claims-files.txt")
		if (num in ck) die(rel, i, "claim " num " listed twice")
		nc++
		ord[nc] = num
		ck[num] = pk; ctk[num] = ptk; csrc[num] = psrc; cln[num] = pln; cref[num] = pref
		cfile[num] = i
		ctx[num] = ptx
	}
	for (j = 1; j <= no; j++) if (!(onum[j] in ck)) die(orel, oline[j], "claim " onum[j] " is not a claim of claims.md")

	# 5 and 6. pass files
	for (j = 1; j <= np1; j++) scan(P1[j], 1)
	for (j = 1; j <= np2; j++) scan(P2[j], 2)

	# Verdicts.
	for (j = 1; j <= nc; j++) {
		num = ord[j]
		kd = ck[num]
		cM[num] = ""
		if (("v", num) in ovr) V = ovr["v", num]
		else if ((kd == "decision" && !((1, 2, num) in E)) || (kd == "scope" && !((1, 3, num) in E))) V = "not verified; not assessed"
		else if ((1, 1, num) in E) {
			r = E[1, 1, num]
			B = r
			mp = ""
			p = index(r, "; ")
			if (p > 0) {
				ne = split(substr(r, p + 2), el, ", ")
				for (e = 1; e <= ne; e++) {
					t = el[e]
					sp = index(t, " ")
					if (sp > 0) t = substr(t, 1, sp - 1)
					if ((t in owner) && index(", " mp ", ", ", " owner[t] ", ") == 0) mp = (mp == "") ? owner[t] : mp ", " owner[t]
				}
				if (mp != "") B = r " (" mp ")"
			}
			V = B
			if (((2, 1, num) in E) && substr(E[2, 1, num], 1, 14) == "overturned to ") V = "contested; pass one: " B "; pass two: " E[2, 1, num]
			cM[num] = mp
		} else V = "not verified; no pass-one line"
		cV[num] = V
		if (substr(V, 1, 9) == "contested") w = "contested"
		else if (substr(V, 1, 4) == "true") w = "true"
		else if (substr(V, 1, 5) == "false") w = "false"
		else if (index(V, "not verified, not reproduced; needs a live check: env ") == 1) w = "not reproducible here"
		else w = "not verified"
		p = index(V, "; ")
		e0 = (p > 0) ? substr(V, p + 2) : "none"
		if (w == "contested") {
			cF[num] = (cM[num] != "") ? cM[num] : "none"; cE[num] = e0
		} else if (cM[num] != "") {
			cF[num] = cM[num]; cE[num] = cM[num]
		} else if (e0 ~ /^[^ ,]+ \(C[0-9]+\)$/) {
			t = e0
			sub(/^.* \(/, "", t)
			sub(/\)$/, "", t)
			cF[num] = t; cE[num] = t
		} else if (e0 ~ /^C[0-9]+$/) {
			cF[num] = e0; cE[num] = e0
		} else {
			cF[num] = "none"; cE[num] = e0
		}
		cW[num] = w
		cC[num] = "none"
		if (w == "false") {
			if (!(("c", num) in ovr)) die("claims.md", cfile[num], "claim " num " is false and report/parts/claims-override.txt gives no correction")
			cC[num] = ovr["c", num]
		}
	}

	# A. 10-claims.md
	print "## 10. Claims" > f1
	print "" > f1
	print "Reproducing a stated result does not show that the build session ran its stated check." > f1
	print "" > f1
	if (nc == 0) print "none" > f1
	for (j = 1; j <= nc; j++) {
		num = ord[j]
		print "- claim " num " [" ck[num] "]: " cV[num] > f1
	}
	print "" > f1
	print "Other sentences, counted and not listed: " nother > f1
	print "" > f1

	# B. 08-decisions.md
	print "## 8. Decisions" > f2
	print "" > f2
	print "### Decision ledger" > f2
	print "" > f2
	ledger("decision", 2)
	print "" > f2
	print "### Raised tickets" > f2
	print "" > f2
	ledger("scope", 3)
	print "" > f2

	# C. claims-verdicts.body.md
	printf "%s", "" > f3
	for (g = 1; g <= nf; g++) {
		if (g > 1) print "" > f3
		print "## " fpath[g] " (" fkind[g] "), hash " fhash[g] > f3
		print "" > f3
		cnt = 0
		for (j = 1; j <= nc; j++) {
			num = ord[j]
			if (csrc[num] != fname[g]) continue
			cnt++
			print "- claim " num " [" ck[num] "] " csrc[num] ":" cln[num] " " ((cref[num] == "") ? "-" : cref[num]) ": " cW[num] "; finding: " cF[num] "; evidence: " cE[num] > f3
			print "  ticket: " ctk[num] > f3
			print "  text: " ctx[num] > f3
			print "  correction: " cC[num] > f3
		}
		if (cnt == 0) print "none" > f3
	}
	close(f1); close(f2); close(f3)
}
' 2>/dev/null)
	st=$?
	case $st in
	0) ;;
	1)
		rm -f "$t1" "$t2" "$t3" 2> /dev/null
		printf '%s\n' "$msg" >&2
		exit 1
		;;
	3)
		rm -f "$t1" "$t2" "$t3" 2> /dev/null
		printf '%s\n' "$msg" >&2
		exit 2
		;;
	*)
		# Name the first temp file that cannot be opened for writing.
		bad=10-claims.md
		for n in 10-claims.md 08-decisions.md claims-verdicts.body.md; do
			if ! { true >> "$pdir/$n.tmp"; } 2> /dev/null; then
				bad=$n
				break
			fi
		done
		rm -f "$t1" "$t2" "$t3" 2> /dev/null
		echo "report: cannot write report/parts/$bad" >&2
		exit 2
		;;
	esac
	: >> "$t3" || {
		rm -f "$t1" "$t2" "$t3" 2> /dev/null
		echo "report: cannot write report/parts/claims-verdicts.body.md" >&2
		exit 2
	}
	for n in 10-claims.md 08-decisions.md claims-verdicts.body.md; do
		if [ -d "$pdir/$n" ]; then
			rm -f "$t1" "$t2" "$t3" 2> /dev/null
			echo "report: cannot write report/parts/$n" >&2
			exit 2
		fi
	done
	mv -f "$t1" "$pdir/10-claims.md" || fail_parts
	mv -f "$t2" "$pdir/08-decisions.md" || fail_parts
	mv -f "$t3" "$pdir/claims-verdicts.body.md" || fail_parts
	exit 0
}

fail_parts() {
	rm -f "$t1" "$t2" "$t3" 2> /dev/null
	echo "report: cannot write report/parts" >&2
	exit 2
}

cmd_assemble() {
	run=$1
	pdir=$run/report/parts
	if [ ! -d "$pdir" ] || [ ! -r "$pdir" ]; then
		echo "report: cannot read report/parts" >&2
		exit 2
	fi
	set --
	for f in "$pdir"/*.md; do
		[ -f "$f" ] || continue
		[ "${f##*/}" = claims-verdicts.body.md ] && continue
		set -- "$@" "$f"
	done
	if [ $# -eq 0 ]; then
		echo "report: report/parts:0: no part file" >&2
		exit 1
	fi
	tmp=$run/report.body.tmp.tmp
	if [ -d "$run/report.body.tmp" ] || ! { cat "$@" > "$tmp"; } 2> /dev/null || ! mv -f "$tmp" "$run/report.body.tmp"; then
		rm -f "$tmp" 2> /dev/null
		echo "report: cannot write report.body.tmp" >&2
		exit 2
	fi
	exit 0
}

cmd_verdicts() {
	run=$1
	hex=$2
	body=$run/report/parts/claims-verdicts.body.md
	if [ ! -f "$body" ] || [ ! -r "$body" ]; then
		echo "report: cannot read report/parts/claims-verdicts.body.md" >&2
		exit 2
	fi
	d=${run%/}
	id=${d##*/}
	tmp=$run/claims-verdicts.md.tmp
	if [ ! -d "$run/claims-verdicts.md" ] && { {
		printf '# Claims verdicts: %s\n\n' "$id"
		printf 'report revision: sha256:%s\n' "$hex"
		printf 'generated: %s\n\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
		printf '%s\n' 'Apply a line only when its file hash and claim text match what you hold. `false` lines' \
			'are corrections: the statement is contradicted by the cited evidence. `not verified` lines' \
			'on verification claims are recheck requests: the audit could not reproduce the check, which' \
			'is not evidence the statement is wrong. `not reproducible here` lines are not recheck' \
			'requests: the check ran against an environment the audit cannot reach, so run it against'
		printf 'that environment and feed the result back with `/audit:resume %s --live <file>`.\n' "$id"
		printf '%s\n' '`contested` lines need a person to decide.'
		if [ -s "$body" ]; then
			printf '\n'
			cat "$body"
		fi
	} > "$tmp"; } 2> /dev/null && mv -f "$tmp" "$run/claims-verdicts.md"; then
		:
	else
		rm -f "$tmp" 2> /dev/null
		echo "report: cannot write claims-verdicts.md" >&2
		exit 2
	fi
	exit 0
}

[ $# -ge 1 ] || usage
case $1 in
parts)
	[ $# -eq 2 ] || usage
	cmd_parts "$2"
	;;
assemble)
	[ $# -eq 2 ] || usage
	cmd_assemble "$2"
	;;
claims-verdicts)
	[ $# -eq 3 ] || usage
	case $3 in
	*[!0-9a-f]*) usage ;;
	esac
	[ ${#3} -eq 64 ] || usage
	cmd_verdicts "$2" "$3"
	;;
*) usage ;;
esac

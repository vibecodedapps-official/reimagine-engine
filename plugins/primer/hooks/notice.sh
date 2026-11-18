#!/bin/sh
# notice.sh: SessionStart hook for the startup source. Reads stdin (transcript_path and cwd),
# the hub (CLAUDE.md, or AGENTS.md behind the adapter, or AGENTS.md alone) and, only when its
# first line is <!-- primer -->, `git rev-parse` for the repository root and the main worktree,
# the autoMemoryDirectory key of the local, project and user settings files, the auto memory
# index MEMORY.md (by default <config>/projects/<key>/memory/), the topic files it lists, and
# the review stamp $CLAUDE_PLUGIN_DATA/reviewed/<key>, the feedback logs of <config>/feedback/ with
# their stamp <config>/feedback/.reviewed, and `git remote -v` for the repository's names; never
# writes a file. Prints at most one JSON object and always exits 0:
#   notice:  the count of listed feedback or project notes modified after the stamp, every one
#            when there is no stamp, and of the repository's feedback entries since its last
#            review, as a systemMessage that points at /primer
#   nothing: no opted-in hub, or no such note and no such entry

json=
while IFS= read -r in_line || [ -n "$in_line" ]; do
	json=$json$in_line
done

# field <name> [<text>]: the string value of a key in the JSON text, the input by default,
# with \\ and \" unescaped.
field() {
	printf '%s\n' "${2-$json}" | LC_ALL=C sed -n -E 's/^.*"'"$1"'"[[:space:]]*:[[:space:]]*"(([^"\\]|\\.)*)".*$/\1/p' | LC_ALL=C sed -e 's/\\\\/\\/g' -e 's/\\"/"/g'
}

transcript=$(field transcript_path)
cwd=$(field cwd)
if [ -z "$cwd" ] || [ ! -d "$cwd" ]; then
	cwd=.
fi
[ -n "$transcript" ] || exit 0

root=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null) || root=
[ -n "$root" ] || root=$cwd

if [ -f "$root/CLAUDE.md" ]; then
	hub=CLAUDE.md
	if awk '{ sub(/\r$/, ""); if (NR == 1) l = $0 } END { exit (NR == 1 && l == "@AGENTS.md") ? 0 : 1 }' "$root/CLAUDE.md" 2>/dev/null; then
		hub=AGENTS.md
		[ -f "$root/AGENTS.md" ] || exit 0
	fi
elif [ -f "$root/AGENTS.md" ]; then
	hub=AGENTS.md
else
	exit 0
fi
mark=$(awk 'NR == 1 { sub(/\r$/, ""); print; exit }' "$root/$hub" 2>/dev/null)
[ "$mark" = "<!-- primer -->" ] || exit 0

# The auto memory key is the main worktree's root, which a linked worktree shares.
common=$(git -C "$cwd" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || common=
if [ -n "$common" ]; then
	main=${common%/*}
else
	main=$cwd
fi
key=$(printf '%s\n' "$main" | LC_ALL=C sed 's/[^A-Za-z0-9]/-/g')

# The transcript is <config>/projects/<session key>/<session>.jsonl.
transcript=$(printf '%s\n' "$transcript" | LC_ALL=C sed 's/\\/\//g')
sdir=${transcript%/*}
projects=${sdir%/*}

# autoMemoryDirectory from the local, project or user settings: the first file that sets the key
# decides, and a value that is not a string, or is neither absolute nor ~/, counts as unset. ~/ is
# read against the host's home folder: USERPROFILE when set, else HOME, on Windows; HOME elsewhere.
# Absolute is the host's reading: a drive path only on Windows, where /x without a drive takes the
# drive of the input cwd (// stays as is). Managed settings and --settings are out of reach.
win=
case $(uname -s) in MINGW* | MSYS* | CYGWIN*) win=1 ;; esac
memory=
for f in "$root/.claude/settings.local.json" "$root/.claude/settings.json" "${projects%/*}/settings.json"; do
	[ -f "$f" ] || continue
	text=$(tr -d '\r\n' < "$f")
	printf '%s\n' "$text" | LC_ALL=C grep -q '"autoMemoryDirectory"[[:space:]]*:' || continue
	v=$(field autoMemoryDirectory "$text" | LC_ALL=C sed 's/\\/\//g')
	case $v in
	"~/"*)
		home=$HOME
		[ -z "$win" ] || home=${USERPROFILE:-$HOME}
		memory=$(printf '%s\n' "$home" | LC_ALL=C sed 's/\\/\//g')/${v#"~/"} ;;
	"//"*) memory=$v ;;
	/*)
		memory=$v
		if [ -n "$win" ]; then
			drive=$(printf '%s\n' "$cwd" | LC_ALL=C sed -n 's/^\([A-Za-z]\):.*$/\1/p')
			[ -z "$drive" ] || memory=$drive:$v
		fi ;;
	[A-Za-z]:/*) [ -z "$win" ] || memory=$v ;;
	esac
	break
done
# A project directory name the host took names the transcript's directory as well.
if [ -z "$memory" ] && [ -n "$CLAUDE_CODE_PROJECT_DIR_NAME" ] && [ "${sdir##*/}" = "$CLAUDE_CODE_PROJECT_DIR_NAME" ]; then
	memory=$sdir/memory
fi
[ -n "$memory" ] || memory=$projects/$key/memory
memory=${memory%/}

# The repository's feedback entries since its last review. A log's entries are its level-two
# sections, but one headed Recommended, and an entry is the repository's when its heading holds,
# as a word, the name of its directory or of a remote. The stamp holds, a line per repository and
# log, how many entries the log had at the last review. After a review a single entry counts for
# nothing: it is taken for the reviewing session's own.
m=0
fstamp=
if [ -f "${projects%/*}/feedback/.reviewed" ]; then
	fstamp=${projects%/*}/feedback/.reviewed
fi
names=$({
	printf '%s\n' "$main"
	git -C "$cwd" remote -v 2>/dev/null | LC_ALL=C sed -n 's/^[^[:space:]]\{1,\}[[:space:]]\{1,\}\(.*\) (fetch)$/\1/p'
} | LC_ALL=C awk '{
	gsub(/\\/, "/")
	sub(/\/+$/, "")
	sub(/\.git$/, "")
	sub(/\/+$/, "")
	sub(/^.*[\/:]/, "")
	if ($0 != "") print tolower($0)
}')
set --
for f in "${projects%/*}/feedback"/*; do
	[ -f "$f" ] || continue
	set -- "$@" "$f"
done
if [ $# -gt 0 ]; then
	m=$(NOTICE_KEY=$key NOTICE_NAMES=$names NOTICE_STAMP=$fstamp LC_ALL=C awk '
function named(h,    i, at, off, rest, b, a) {
	for (i = 1; i <= nn; i++) {
		if (nm[i] == "") continue
		off = 0
		rest = h
		while ((at = index(rest, nm[i])) > 0) {
			b = (off + at > 1) ? substr(h, off + at - 1, 1) : ""
			a = substr(h, off + at + length(nm[i]), 1)
			if (b !~ /[a-z0-9_-]/ && a !~ /[a-z0-9_-]/) return 1
			off += at
			rest = substr(h, off + 1)
		}
	}
	return 0
}

BEGIN {
	key = ENVIRON["NOTICE_KEY"]
	nn = split(ENVIRON["NOTICE_NAMES"], nm, "\n")
	stamp = ENVIRON["NOTICE_STAMP"]
	if (stamp != "") {
		while ((getline l < stamp) > 0) {
			sub(/\r$/, "", l)
			if (split(l, f, "\t") == 3 && f[1] == key && f[2] ~ /^[0-9]+$/) { cur[f[3]] = f[2] + 0; has = 1 }
		}
		close(stamp)
	}
}

FNR == 1 { n = 0; log_name = FILENAME; sub(/^.*\//, "", log_name) }
{ sub(/\r$/, "") }
substr($0, 1, 3) == "## " {
	h = tolower(substr($0, 4))
	t = h
	sub(/^[ \t]+/, "", t)
	if (t ~ /^recommended([^a-z0-9_-]|$)/) next
	n++
	if (n > cur[log_name] + 0 && named(h)) own++
}
END { print (has && own < 2) ? 0 : own + 0 }' "$@" 2>/dev/null)
fi
[ "$m" -gt 0 ] 2>/dev/null || m=0

stamp=
has=
if [ -n "$CLAUDE_PLUGIN_DATA" ] && [ -f "$CLAUDE_PLUGIN_DATA/reviewed/$key" ]; then
	has=1
	IFS= read -r stamp < "$CLAUDE_PLUGIN_DATA/reviewed/$key" || :
	stamp=${stamp%"$(printf '\r')"}
fi

n=$(NOTICE_DIR=$memory NOTICE_STAMP=$stamp NOTICE_HAS=$has LC_ALL=C awk '
function trim(s) {
	sub(/^[ \t]+/, "", s)
	sub(/[ \t]+$/, "", s)
	return s
}

function unquote(s,    n, f) {
	n = length(s)
	f = substr(s, 1, 1)
	if (n >= 2 && (f == "\"" || f == "\047") && substr(s, n, 1) == f) s = substr(s, 2, n - 2)
	return s
}

# 1 when the topic file is a feedback or project note newer than the stamp, else 0.
function counts(name,    path, l, k, ty, mo, ht, hm) {
	path = dir "/" name
	while ((getline l < path) > 0) {
		sub(/\r$/, "", l)
		k++
		if (k == 1) { if (l != "---") break; continue }
		if (l == "---") break
		if (!ht && l ~ /^[ \t]*type:/) { sub(/^[ \t]*type:/, "", l); ty = unquote(trim(l)); ht = 1 }
		else if (!hm && l ~ /^[ \t]*modified:/) { sub(/^[ \t]*modified:/, "", l); mo = unquote(trim(l)); hm = 1 }
	}
	close(path)
	if (ty != "feedback" && ty != "project") return 0
	if (has != "" && !(mo != "" && (mo "") > (stamp ""))) return 0
	return 1
}

BEGIN {
	dir = ENVIRON["NOTICE_DIR"]
	stamp = ENVIRON["NOTICE_STAMP"]
	has = ENVIRON["NOTICE_HAS"]
}

{ sub(/\r$/, "") }
substr($0, 1, 3) == "- [" && (a = index($0, "](")) > 0 {
	name = substr($0, a + 2)
	b = index(name, ")")
	if (b == 0) next
	name = substr(name, 1, b - 1)
	if (name == "" || substr(name, 1, 1) == "/" || index(name, "..") || index(name, "\\") || index(name, ":") || (name in seen)) next
	seen[name] = 1
	total += counts(name)
}
END { print total + 0 }' "$memory/MEMORY.md" 2>/dev/null)

[ "$n" -gt 0 ] 2>/dev/null || n=0
if [ "$n" -gt 0 ] && [ "$m" -gt 0 ]; then
	printf '{"systemMessage":"primer: auto memory has %s notes and %s feedback entries since the last review; run /primer"}\n' "$n" "$m"
elif [ "$n" -gt 0 ]; then
	printf '{"systemMessage":"primer: auto memory has %s notes since the last review; run /primer"}\n' "$n"
elif [ "$m" -gt 0 ]; then
	printf '{"systemMessage":"primer: %s feedback entries since the last review; run /primer"}\n' "$m"
fi
exit 0

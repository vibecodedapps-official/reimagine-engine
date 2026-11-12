#!/bin/sh
# registry.sh: add a run to the registry of runs, or set a run's state, under its lock.
#
# Usage:
#   sh registry.sh add <registry file> <run id> <run directory> <primary repo> <created>
#   sh registry.sh set <registry file> <run id> <state>
#
# The registry is a JSON list of flat objects, one per run:
# {"run_id", "path", "primary_repo", "created", "state"}. `add` appends the run with the
# state `running`; `set` gives the run's entry the state running, reported, partial or
# blocked. A run that is repeated changes nothing: `add` of an id that is there with the
# same run directory, and `set` of the state the entry has, exit 0 and leave the file as
# it is. A missing or empty registry file is an empty list, and the file's directory is
# made when it is missing. Entries are kept in order, each key and value as it was
# written, one entry per line; a byte order mark at the start of the file is dropped.
# Ids and paths are compared as they are written in the file, not decoded.
#
# The lock is the directory <registry file>.lock with one directory inside it, named for
# this process. While another holds it, the script tries again each second, for
# REGISTRY_WAIT seconds in all (75 when unset; 0 tries once). A lock older than a minute
# is removed: this script holds the lock only while it rewrites the file, so among its
# own runs such a lock is from one that died. Several processes can each remove an old
# lock and make a new one, so a process holds the lock only when its directory is the
# one entry in it; otherwise it steps back and tries again. The new list is written to
# <registry file>.<owner>.tmp and moved over the registry only while the lock still
# holds this process's directory, so a process whose lock was taken in between starts
# again.
#
# Exit 0 with one line on stdout: `added <run id>`, `set <run id> <state>`, or
# `kept <run id>` when nothing was to change. Exit 1 with one line on stderr on a bad
# argument: the count, an unknown word, an empty value, a state that is none of the
# four, a run id that holds a blank, a quote, a backslash or a slash, or a value that
# holds a line break. Exit 2 with one line on stderr when the registry is not a list of flat
# objects, when it cannot be read or written, or when the lock stays held. Exit 3 with
# one line on stderr when `add` finds the id with another run directory, or `set` finds
# no entry with the id. Nothing is written on exit 1, 2 or 3.
#
# POSIX sh plus awk; the awk program uses only features that mawk, gawk, and BSD awk all
# accept. Values reach awk through the environment, so a backslash in a path is kept.
set -u

usage() {
	echo "usage: registry.sh add <registry file> <run id> <run directory> <primary repo> <created> | set <registry file> <run id> <state>" >&2
	exit 1
}
bad() {
	echo "registry: $*" >&2
	exit 1
}

[ $# -ge 1 ] || usage
op=$1
case $op in
add) [ $# -eq 6 ] || usage ;;
set) [ $# -eq 4 ] || usage ;;
*) usage ;;
esac
reg=$2
id=$3
nl='
'
cr=$(printf '\r')
for v in "$@"; do
	case $v in
	'') bad "an argument is empty" ;;
	*"$nl"* | *"$cr"*) bad "an argument holds a line break" ;;
	esac
done
case $id in
*[[:space:]\"\\/]*) bad "the run id holds a blank, a quote, a backslash or a slash" ;;
esac
dir=
repo=
created=
state=running
if [ "$op" = add ]; then
	dir=$4
	repo=$5
	created=$6
else
	state=$4
	case $state in
	running | reported | partial | blocked) ;;
	*) bad "state '$state' is not running, reported, partial or blocked" ;;
	esac
fi

lock=$reg.lock
owner=$id.$$
new=$reg.$owner.tmp
held=0
release() {
	rm -f "$new"
	[ "$held" = 1 ] && rmdir "$lock/$owner" "$lock" 2> /dev/null
	held=0
}
trap release EXIT
trap 'exit 2' HUP INT TERM

regdir=$(dirname "$reg")
if [ ! -d "$regdir" ] && ! mkdir -p "$regdir" 2> /dev/null; then
	echo "registry: cannot make $regdir" >&2
	exit 2
fi

# acquire: 0 with the lock held, 1 when it could not be taken for the whole wait.
acquire() {
	left=${REGISTRY_WAIT:-75}
	case $left in
	'' | *[!0-9]* | 0?*) left=75 ;;
	esac
	while :; do
		if mkdir "$lock" 2> /dev/null && mkdir "$lock/$owner" 2> /dev/null; then
			if [ "$(ls -A "$lock" 2> /dev/null)" = "$owner" ]; then
				held=1
				return 0
			fi
			# Another process made the lock anew between the two steps and this one's
			# directory sits beside its: step back, and take an empty lock away.
			rmdir "$lock/$owner" 2> /dev/null
			rmdir "$lock" 2> /dev/null
		elif [ -n "$(find "$lock" -maxdepth 0 -mmin +1 2> /dev/null)" ]; then
			rmdir "$lock"/* 2> /dev/null
			rmdir "$lock" 2> /dev/null && continue
		fi
		[ "$left" -gt 0 ] || return 1
		left=$((left - 1))
		sleep 1
	done
}

# rewrite: print the new list. Exit 0 when it differs from the registry, 10 when nothing
# is to change, 11 when the id is there with another run directory, 12 when no entry has
# the id, 13 when the registry is not a list of flat objects.
rewrite() {
	REG_OP=$op REG_ID=$id REG_DIR=$dir REG_REPO=$repo REG_CREATED=$created REG_STATE=$state LC_ALL=C awk '
		function skip() { while (p <= len && index(" \t\n", substr(s, p, 1))) p++ }
		function string(  q, c) {
			if (substr(s, p, 1) != "\"") exit 13
			q = p++
			while (p <= len) {
				c = substr(s, p, 1)
				if (c == "\\") p += 2
				else if (c == "\"") { p++; return substr(s, q, p - q) }
				else p++
			}
			exit 13
		}
		function scalar(  q, v) {
			q = p
			while (p <= len && !index(",}] \t\n", substr(s, p, 1))) p++
			v = substr(s, q, p - q)
			if (v !~ /^(true|false|null|-?[0-9][0-9.eE+-]*)$/) exit 13
			return v
		}
		function json(v,  i, c, out) {
			out = ""
			for (i = 1; i <= length(v); i++) {
				c = substr(v, i, 1)
				if (c == "\\") out = out "\\\\"
				else if (c == "\"") out = out "\\\""
				else if (c == "\t") out = out "\\t"
				else out = out c
			}
			return "\"" out "\""
		}
		NR == 1 { sub(/^\357\273\277/, "") }
		{ sub(/\r$/, ""); s = s $0 "\n" }
		END {
			op = ENVIRON["REG_OP"]; id = json(ENVIRON["REG_ID"]); state = json(ENVIRON["REG_STATE"])
			dir = json(ENVIRON["REG_DIR"])
			len = length(s); p = 1; n = 0
			skip()
			if (p <= len) {
				if (substr(s, p, 1) != "[") exit 13
				p++; skip()
				if (substr(s, p, 1) == "]") p++
				else while (1) {
					skip()
					if (substr(s, p, 1) != "{") exit 13
					p++; n++; keys[n] = 0; skip()
					if (substr(s, p, 1) == "}") p++
					else while (1) {
						skip(); k = string(); skip()
						if (substr(s, p, 1) != ":") exit 13
						p++; skip()
						v = substr(s, p, 1) == "\"" ? string() : scalar()
						keys[n]++; key[n, keys[n]] = k; val[n, keys[n]] = v
						skip(); c = substr(s, p, 1); p++
						if (c == "}") break
						if (c != ",") exit 13
					}
					skip(); c = substr(s, p, 1); p++
					if (c == "]") break
					if (c != ",") exit 13
				}
				skip()
				if (p <= len) exit 13
			}
			found = 0; changed = 0
			for (i = 1; i <= n; i++) {
				mine = 0; at = 0; where = ""
				for (j = 1; j <= keys[i]; j++) {
					if (key[i, j] == "\"run_id\"" && val[i, j] == id) mine = 1
					if (key[i, j] == "\"state\"") at = j
					if (key[i, j] == "\"path\"") where = val[i, j]
				}
				if (!mine) continue
				found = 1
				if (op == "add") {
					if (where != dir) exit 11
				} else if (!at) {
					keys[i]++; key[i, keys[i]] = "\"state\""; val[i, keys[i]] = state; changed = 1
				} else if (val[i, at] != state) {
					val[i, at] = state; changed = 1
				}
			}
			if (op == "set" && !found) exit 12
			if (op == "add" && !found) {
				n++; keys[n] = 5; changed = 1
				key[n, 1] = "\"run_id\""; val[n, 1] = id
				key[n, 2] = "\"path\""; val[n, 2] = dir
				key[n, 3] = "\"primary_repo\""; val[n, 3] = json(ENVIRON["REG_REPO"])
				key[n, 4] = "\"created\""; val[n, 4] = json(ENVIRON["REG_CREATED"])
				key[n, 5] = "\"state\""; val[n, 5] = state
			}
			if (!changed) exit 10
			print "["
			for (i = 1; i <= n; i++) {
				line = "  {"
				for (j = 1; j <= keys[i]; j++) line = line (j > 1 ? ", " : "") key[i, j] ": " val[i, j]
				print line "}" (i < n ? "," : "")
			}
			print "]"
		}
	' "$1"
}

tries=0
while :; do
	if ! acquire; then
		if [ -d "$lock" ]; then
			echo "registry: $lock is held by another run; run the command again" >&2
		else
			echo "registry: cannot make $lock" >&2
		fi
		exit 2
	fi
	if [ -e "$reg" ]; then
		if [ ! -f "$reg" ] || [ ! -r "$reg" ]; then
			echo "registry: cannot read $reg" >&2
			exit 2
		fi
		src=$reg
	else
		src=/dev/null
	fi
	rewrite "$src" > "$new"
	st=$?
	case $st in
	0) ;;
	10)
		echo "kept $id"
		exit 0
		;;
	11)
		echo "registry: $id is in $reg with another run directory" >&2
		exit 3
		;;
	12)
		echo "registry: $reg has no entry for $id" >&2
		exit 3
		;;
	13)
		echo "registry: $reg is not a list of flat objects" >&2
		exit 2
		;;
	*)
		echo "registry: cannot write $new" >&2
		exit 2
		;;
	esac
	if [ -d "$lock/$owner" ] && mv -f "$new" "$reg"; then
		release
		if [ "$op" = add ]; then
			echo "added $id"
		else
			echo "set $id $state"
		fi
		exit 0
	fi
	if [ -d "$lock/$owner" ]; then
		echo "registry: cannot write $reg" >&2
		exit 2
	fi
	held=0
	tries=$((tries + 1))
	if [ "$tries" -ge 3 ]; then
		echo "registry: $lock was taken three times; run the command again" >&2
		exit 2
	fi
done

#!/bin/sh
# registry.sh: tests for scripts/registry.sh.
#
# Usage: sh tests/audit/registry.sh
#
# Runs `add` and `set` against registry files in a temp directory and compares each
# file with a literal: a new file, a repeated command, a second run, a file as a JSON
# tool prints it, an entry with a key of its own, a path with a backslash and a quote.
# Then the lock: one held by another, one older than a minute, one that is released
# while a run waits, twelve runs at once against an old lock, and four at once.
# Each refused command is run with its exit code and message, and must leave the file
# and no lock or temp file behind.
#
# Prints one line per mismatch and `registry test: ok` on success; exits 1 on any
# mismatch.
set -u

root=$(cd "$(dirname "$0")/../.." && pwd)
rs=$root/plugins/audit/scripts/registry.sh

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

fails=0
fail() {
	echo "registry test: $*"
	fails=$((fails + 1))
}

# run <label> <expected exit> <expected stdout> <expected stderr> <args...>
run() {
	label=$1
	want_st=$2
	want_out=$3
	want_err=$4
	shift 4
	if out=$(sh "$rs" "$@" 2> "$tmp/err"); then st=0; else st=$?; fi
	err=$(cat "$tmp/err")
	[ "$st" = "$want_st" ] || fail "$label: expected exit $want_st, got $st"
	[ "$out" = "$want_out" ] || fail "$label: expected stdout '$want_out', got '$out'"
	[ "$err" = "$want_err" ] || fail "$label: expected stderr '$want_err', got '$err'"
}

# holds <label> <file> <expected content>: the file's bytes, with a final newline.
holds() {
	printf '%s\n' "$3" > "$tmp/want"
	cmp -s "$2" "$tmp/want" || fail "$1: $2 is not as expected"
}

# clean <label> <registry file>: no lock and no temp file is left beside the registry.
clean() {
	[ ! -e "$2.lock" ] || fail "$1: the lock is left"
	left=$(ls "$(dirname "$2")" | grep -c '\.tmp$')
	[ "$left" = 0 ] || fail "$1: a temp file is left"
}

A=2026-10-24-0912-app-1
B=2026-10-24-0913-app-2

# ---------------------------------------------------------------------------
# add and set on a registry this script wrote.
reg=$tmp/data/runs.json
run "add to a missing file" 0 "added $A" "" add "$reg" "$A" /work/app/.scratch/audit/$A /work/app 2026-10-24T09:12:00Z
holds "add to a missing file" "$reg" '[
  {"run_id": "2026-10-24-0912-app-1", "path": "/work/app/.scratch/audit/2026-10-24-0912-app-1", "primary_repo": "/work/app", "created": "2026-10-24T09:12:00Z", "state": "running"}
]'
clean "add to a missing file" "$reg"

run "add again" 0 "kept $A" "" add "$reg" "$A" /work/app/.scratch/audit/$A /work/app 2026-10-24T09:12:00Z
run "add again, another repo and time" 0 "kept $A" "" add "$reg" "$A" /work/app/.scratch/audit/$A /work/other 2026-10-24T09:59:00Z
run "add a second run" 0 "added $B" "" add "$reg" "$B" /work/app/.scratch/audit/$B /work/app 2026-10-24T09:13:00Z
run "add an id with another directory" 3 "" "registry: $A is in $reg with another run directory" add "$reg" "$A" /elsewhere/audit/$A /work/app 2026-10-24T09:12:00Z
run "set" 0 "set $A reported" "" set "$reg" "$A" reported
run "set again" 0 "kept $A" "" set "$reg" "$A" reported
run "set an id that is not there" 3 "" "registry: $reg has no entry for 2026-10-24-0914-app-3" set "$reg" 2026-10-24-0914-app-3 partial
holds "two runs" "$reg" '[
  {"run_id": "2026-10-24-0912-app-1", "path": "/work/app/.scratch/audit/2026-10-24-0912-app-1", "primary_repo": "/work/app", "created": "2026-10-24T09:12:00Z", "state": "reported"},
  {"run_id": "2026-10-24-0913-app-2", "path": "/work/app/.scratch/audit/2026-10-24-0913-app-2", "primary_repo": "/work/app", "created": "2026-10-24T09:13:00Z", "state": "running"}
]'
clean "two runs" "$reg"

# ---------------------------------------------------------------------------
# A registry as a JSON tool prints it, with CRLF line ends, a key of its own, a number,
# an escaped quote in a value and an entry that has no state.
reg=$tmp/pretty.json
printf '[\r\n  {\r\n    "run_id": "2026-10-24-0912-app-1",\r\n    "path": "C:/work/app/.scratch/audit/2026-10-24-0912-app-1",\r\n    "primary_repo": "C:/work/app",\r\n    "created": "2026-10-24T09:12:00Z",\r\n    "state": "running",\r\n    "note": "said \\"later\\", then left",\r\n    "tries": 2\r\n  },\r\n  {\r\n    "run_id": "2026-10-24-0913-app-2",\r\n    "path": "C:/work/app/.scratch/audit/2026-10-24-0913-app-2"\r\n  }\r\n]\r\n' > "$reg"
cp "$reg" "$tmp/pretty.first"
run "set the state a printed file has" 0 "kept $A" "" set "$reg" "$A" running
cmp -s "$reg" "$tmp/pretty.first" || fail "set the state a printed file has: $reg was rewritten"
run "set in a printed file" 0 "set $A blocked" "" set "$reg" "$A" blocked
run "set where no state is" 0 "set $B partial" "" set "$reg" "$B" partial
holds "a printed file" "$reg" '[
  {"run_id": "2026-10-24-0912-app-1", "path": "C:/work/app/.scratch/audit/2026-10-24-0912-app-1", "primary_repo": "C:/work/app", "created": "2026-10-24T09:12:00Z", "state": "blocked", "note": "said \"later\", then left", "tries": 2},
  {"run_id": "2026-10-24-0913-app-2", "path": "C:/work/app/.scratch/audit/2026-10-24-0913-app-2", "state": "partial"}
]'

# A byte order mark before the list is dropped.
reg=$tmp/marked.json
printf '\357\273\277[{"run_id":"2026-10-24-0912-app-1","path":"/p","state":"running"}]\n' > "$reg"
run "set in a file with a byte order mark" 0 "set $A reported" "" set "$reg" "$A" reported
holds "a file with a byte order mark" "$reg" '[
  {"run_id": "2026-10-24-0912-app-1", "path": "/p", "state": "reported"}
]'

# One line, no blanks; an empty list; an empty file.
reg=$tmp/tight.json
printf '[{"run_id":"2026-10-24-0912-app-1","path":"/p","state":"running"}]' > "$reg"
run "set in a file of one line" 0 "set $A partial" "" set "$reg" "$A" partial
holds "a file of one line" "$reg" '[
  {"run_id": "2026-10-24-0912-app-1", "path": "/p", "state": "partial"}
]'
for body in '[]' ' [ ] ' ''; do
	reg=$tmp/empty.json
	printf '%s' "$body" > "$reg"
	run "add to '$body'" 0 "added $A" "" add "$reg" "$A" /p /r 2026-10-24T09:12:00Z
	holds "add to '$body'" "$reg" '[
  {"run_id": "2026-10-24-0912-app-1", "path": "/p", "primary_repo": "/r", "created": "2026-10-24T09:12:00Z", "state": "running"}
]'
done

# A backslash, a quote and a tab in a path are written as JSON, and the same path again
# is the same run.
reg=$tmp/escaped.json
odd=$(printf 'C:\\work\\a "b"\tc')
run "add a path with a backslash" 0 "added $A" "" add "$reg" "$A" "$odd" 'C:\work' 2026-10-24T09:12:00Z
run "add that path again" 0 "kept $A" "" add "$reg" "$A" "$odd" 'C:\work' 2026-10-24T09:12:00Z
holds "a path with a backslash" "$reg" '[
  {"run_id": "2026-10-24-0912-app-1", "path": "C:\\work\\a \"b\"\tc", "primary_repo": "C:\\work", "created": "2026-10-24T09:12:00Z", "state": "running"}
]'

# ---------------------------------------------------------------------------
# A file that is not a list of flat objects is left as it is.
n=0
for body in '{"run_id": "x"}' '[{"run_id": "x", "more": {"a": 1}}]' '[{"run_id": "x"}] x' '[{"run_id": "x}]' \
	'[{"run_id": "x"} {"run_id": "y"}]' '[{"run_id" "x"}]' '[{"run_id": x}]' '[{"run_id": "x"},]'; do
	n=$((n + 1))
	reg=$tmp/broken$n.json
	printf '%s\n' "$body" > "$reg"
	run "broken $n" 2 "" "registry: $reg is not a list of flat objects" add "$reg" "$A" /p /r 2026-10-24T09:12:00Z
	holds "broken $n" "$reg" "$body"
	clean "broken $n" "$reg"
done
mkdir "$tmp/folder.json"
run "a registry that is a directory" 2 "" "registry: cannot read $tmp/folder.json" set "$tmp/folder.json" "$A" partial
clean "a registry that is a directory" "$tmp/folder.json"

# ---------------------------------------------------------------------------
# Bad arguments.
use='usage: registry.sh add <registry file> <run id> <run directory> <primary repo> <created> | set <registry file> <run id> <state>'
reg=$tmp/args.json
run "no argument" 1 "" "$use"
run "an unknown word" 1 "" "$use" drop "$reg" "$A"
run "add with four values" 1 "" "$use" add "$reg" "$A" /p /r
run "set with a fifth value" 1 "" "$use" set "$reg" "$A" partial more
run "an empty value" 1 "" "registry: an argument is empty" add "$reg" "$A" /p "" 2026-10-24T09:12:00Z
run "a line break in a value" 1 "" "registry: an argument holds a line break" add "$reg" "$A" "/p
/q" /r 2026-10-24T09:12:00Z
run "a blank in the run id" 1 "" "registry: the run id holds a blank, a quote, a backslash or a slash" set "$reg" "2026 app" partial
run "a quote in the run id" 1 "" "registry: the run id holds a blank, a quote, a backslash or a slash" set "$reg" 'app"1' partial
run "a backslash in the run id" 1 "" "registry: the run id holds a blank, a quote, a backslash or a slash" set "$reg" 'app\1' partial
run "a slash in the run id" 1 "" "registry: the run id holds a blank, a quote, a backslash or a slash" set "$reg" app/1 partial
run "a carriage return in a value" 1 "" "registry: an argument holds a line break" add "$reg" "$A" "$(printf '/p\rq')" /r 2026-10-24T09:12:00Z
run "a state of its own" 1 "" "registry: state 'done' is not running, reported, partial or blocked" set "$reg" "$A" done
[ ! -e "$reg" ] || fail "bad arguments: $reg was written"

# ---------------------------------------------------------------------------
# The lock. One that another holds stays; one older than a minute is removed.
reg=$tmp/lock/runs.json
mkdir -p "$reg.lock/another.1"
REGISTRY_WAIT=0
export REGISTRY_WAIT
run "a held lock" 2 "" "registry: $reg.lock is held by another run; run the command again" add "$reg" "$A" /p /r 2026-10-24T09:12:00Z
[ -d "$reg.lock/another.1" ] || fail "a held lock: the lock of another was removed"
[ ! -e "$reg" ] || fail "a held lock: $reg was written"

touch -t 202001010000 "$reg.lock"
run "a lock older than a minute" 0 "added $A" "" add "$reg" "$A" /p /r 2026-10-24T09:12:00Z
clean "a lock older than a minute" "$reg"

mkdir "$reg.lock"
touch -t 202001010000 "$reg.lock"
run "an old lock with nothing in it" 0 "set $A reported" "" set "$reg" "$A" reported
clean "an old lock with nothing in it" "$reg"

# A run waits for a lock that another holds and goes on when it is released.
unset REGISTRY_WAIT
reg=$tmp/waits/runs.json
mkdir -p "$reg.lock/another.1"
sh "$rs" add "$reg" "$A" /p /r 2026-10-24T09:12:00Z > "$tmp/waits.out" 2> "$tmp/waits.err" &
sleep 2
[ ! -e "$reg" ] || fail "a lock that is released: $reg was written while the lock was held"
rmdir "$reg.lock/another.1" "$reg.lock"
wait
[ "$(cat "$tmp/waits.out")" = "added $A" ] || fail "a lock that is released: printed '$(cat "$tmp/waits.out")' and '$(cat "$tmp/waits.err")'"
clean "a lock that is released" "$reg"

# Twelve runs at once against a lock older than a minute: several remove it and make
# a new one, and each still adds its entry.
reg=$tmp/old-crowd/runs.json
mkdir -p "$reg.lock/gone.1"
touch -t 202001010000 "$reg.lock"
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
	sh "$rs" add "$reg" "run-$i" "/p/$i" /r 2026-10-24T09:12:00Z > "$tmp/old-crowd.$i.out" 2> "$tmp/old-crowd.$i.err" &
done
wait
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
	[ "$(cat "$tmp/old-crowd.$i.out")" = "added run-$i" ] || fail "twelve at an old lock: run-$i printed '$(cat "$tmp/old-crowd.$i.out")' and '$(cat "$tmp/old-crowd.$i.err")'"
done
[ "$(grep -c '"run_id"' "$reg")" = 12 ] || fail "twelve at an old lock: $reg holds $(grep -c '"run_id"' "$reg") entries"
clean "twelve at an old lock" "$reg"

# Four runs at once each add their entry.
reg=$tmp/crowd/runs.json
for i in 1 2 3 4; do
	sh "$rs" add "$reg" "run-$i" "/p/$i" /r 2026-10-24T09:12:00Z > "$tmp/crowd.$i.out" 2> "$tmp/crowd.$i.err" &
done
wait
for i in 1 2 3 4; do
	[ "$(cat "$tmp/crowd.$i.out")" = "added run-$i" ] || fail "four at once: run-$i printed '$(cat "$tmp/crowd.$i.out")' and '$(cat "$tmp/crowd.$i.err")'"
done
# The order is the order they took the lock in, so the lines are compared sorted and
# without the comma that parts them.
sed 's/,$//' "$reg" | LC_ALL=C sort > "$tmp/crowd.sorted"
holds "four at once" "$tmp/crowd.sorted" '  {"run_id": "run-1", "path": "/p/1", "primary_repo": "/r", "created": "2026-10-24T09:12:00Z", "state": "running"}
  {"run_id": "run-2", "path": "/p/2", "primary_repo": "/r", "created": "2026-10-24T09:12:00Z", "state": "running"}
  {"run_id": "run-3", "path": "/p/3", "primary_repo": "/r", "created": "2026-10-24T09:12:00Z", "state": "running"}
  {"run_id": "run-4", "path": "/p/4", "primary_repo": "/r", "created": "2026-10-24T09:12:00Z", "state": "running"}
[
]'
clean "four at once" "$reg"

if [ "$fails" -ne 0 ]; then
	exit 1
fi
echo "registry test: ok"

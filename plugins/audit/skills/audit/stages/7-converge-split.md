# Stage 7: converge, split mode

Split mode runs when step 5 of `stages/7-converge.md` chooses it: one `audit:merger` per
group, then one final merger, over the slices that step builds with the commands of
step 1 below. Steps 5 and 6 named here are that file's, and the rest of that file holds
in split mode as in normal mode.

## Steps

1. Each group's slice, `ledger/slices/<group>.md`, is built by shell at step 5,
   before any merger starts; the orchestrator reads none of it, and no section
   passes through its own output. For each id of the group in id order, append,
   for each of `ledger/5.md`, `ledger/6.md` and `ledger/7.md` that has a section
   for it, a pointer line and that section; then its `live/findings.md` section and
   its carried file, when they exist, each after its pointer line; then its line of
   `gate.md`. In
   `ledger/5.md` a section is exactly `## <id>` and runs to the next `## ` line; a
   `### ` line never starts or ends one there, because each section embeds the
   finding's own heading under `### Original`. In `ledger/6.md` and `ledger/7.md` a
   section starts at a line that is exactly `## <id>` or begins `### <id>: ` and runs
   to the next `## ` line or `### <word>: ` line, `<word>` holding no space or
   colon. A line whose text, after leading spaces and tabs, starts with three
   backticks opens or closes a code fence; that line and every line inside the fence
   belong to the section that holds them and never start or end one, so both commands
   print fence lines with their section. A copy that reaches the end of the file
   inside an open fence ends with a closing fence line, so the rest of the slice is
   read outside it. `ledger.sh` leaves out of the universe only a `ledger/6.md`
   `### X<n>: ` block that it ends at the end of the file inside such a fence; a
   slice can still copy a `## <id>` section that ends inside the fence, which is what
   the closing fence line is for. Every other part of a ledger
   file (role, acknowledgments, merge verdict, the seen list, map corrections, a
   failure note) sits under a `## ` heading that is not an id, which ends a section
   and is never cut out. Every path starts with `<run dir>/`; `<slice>` is the
   slice's full path:

   ```
   # ledger/5.md
   awk -v id=<id> '{t = $0; sub(/^[ \t]+/, "", t); if (index(t, "```") == 1) inf = !inf; else if (!inf && /^## /) {p = ($0 == "## " id); if (p) f = 1}} END{exit !f}' <run dir>/ledger/5.md &&
     printf 'source: ledger/5.md, section <id>\n' >> <slice> &&
     awk -v id=<id> '{t = $0; sub(/^[ \t]+/, "", t); if (index(t, "```") == 1) inf = !inf; else if (!inf && /^## /) p = ($0 == "## " id)} p; END{if (p && inf) print "```"}' <run dir>/ledger/5.md >> <slice>
   # ledger/6.md and ledger/7.md (<n> is 6 or 7)
   awk -v id=<id> '{t = $0; sub(/^[ \t]+/, "", t); if (index(t, "```") == 1) inf = !inf; else if (!inf && /^## |^### [^ :]+: /) {p = ($0 == "## " id || index($0, "### " id ": ") == 1); if (p) f = 1}} END{exit !f}' <run dir>/ledger/<n>.md &&
     printf 'source: ledger/<n>.md, section <id>\n' >> <slice> &&
     awk -v id=<id> '{t = $0; sub(/^[ \t]+/, "", t); if (index(t, "```") == 1) inf = !inf; else if (!inf && /^## |^### [^ :]+: /) p = ($0 == "## " id || index($0, "### " id ": ") == 1)} p; END{if (p && inf) print "```"}' <run dir>/ledger/<n>.md >> <slice>
   # live/findings.md, when it has a section for the id; a carried id's file whole
   awk -v id=<id> '/^## /{p = ($0 == "## " id); if (p) f = 1} END{exit !f}' <run dir>/live/findings.md &&
     printf 'source: live/findings.md, section <id>\n' >> <slice> &&
     awk -v id=<id> '/^## /{p = ($0 == "## " id)} p' <run dir>/live/findings.md >> <slice>
   [ -f <run dir>/live/carried/<id>.md ] &&
     printf 'source: live/carried/<id>.md\n' >> <slice> &&
     cat <run dir>/live/carried/<id>.md >> <slice>
   # once per id, after its sections
   awk -v id=<id> 'index($0, id ": ") == 1' <run dir>/gate.md >> <slice>
   ```

2. A slice over the threshold of step 5 is cut into parts `<group>-1`, `<group>-2`,
   ... with slices `ledger/slices/<group>-<k>.md` and one merger each. Fill the
   parts greedily in id order: truncate `<run dir>/tmp/block.md`
   (`: > <run dir>/tmp/block.md`), build one id's block into it with the commands
   above, measure it with `wc -c`, and append it to the open part with `cat` and a
   redirect. A part closes when the next block
   would take it over the threshold, and that id opens the next part. An id whose
   block alone is over the threshold forms a part of its own, marked
   `over threshold` in a first slice line written by `printf` and in the stage
   entry. Every id lands in exactly one part, so the cut ends and is the same each
   time. Remove `tmp/block.md` when the slices are written.

3. Launch one merger per group or part, scope `<group>` (or `<group>-<k>`), scratch
   folder `<run dir>/tmp/agents/7-<group>/`. The prompt holds the paths of
   `common.md`, its slice, the three ledger files "for duplicate checks only", the
   line count of `common.md` and the slice as in step 6, and the output path
   `converged/<group>.md` (or `converged/<group>-<k>.md`). It reads its slice and opens a ledger section, found
   with Grep, only to settle a suspected duplicate inside the slice, recording each
   section it opened and why under its own `opened:` heading, apart from `runs:`.
   Each item holds the defect, its sources, each position's severity and label, the
   disposition, the gate, the absorbed ids and a ledger section pointer, with no
   `C<n>` id yet, and the `absorbs` and `gate` lines in the forms of step 6. Each
   file ends with `status: complete`.

4. Launch the final merger, scope `converged`, scratch folder
   `<run dir>/tmp/agents/7-converged/`, with the paths of
   `common.md`, every `converged/<group>.md` and part, `gate.md`, the ledger files
   "for duplicate checks only", the line count of each file but the ledger files as
   in step 6, and the output path `converged.md`. It assigns the `C<n>` ids, merges
   items that are one defect across groups or parts, and opens a ledger section
   only to settle such a duplicate, recorded under `opened:`. `converged.md` keeps
   the item shape of step 6.

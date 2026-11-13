# Fault injection (`_test`)

The orchestrator reads this file only when the manifest has a `_test` key; a normal audit
never loads it. The key lets an acceptance run force an agent failure, a missing
acknowledgment, a held stage, an expired budget, a planted map error, or a small split
threshold. Each field changes how one stage behaves and nothing else. The stage files
mention `_test` where a field touches them; the rules for each field are here alone.

## Recording

When the manifest has `_test`, the orchestrator records the whole key in `audit-brief.md`
and in the report's Coverage section, then applies each field it holds. An injected
failure is handled exactly as a real one: it follows the failure ladder of its role, and
every relaunch and swap it causes is recorded in the stage entry and named in the report.

## Fields

- `fail`: a list of `{ role, scope, times }`. `role` is digester, mapper, auditor,
  adversary, merger, or second-opinion (a stage 6 launch). `scope` is `any`, which
  matches every scope, or the scope id the stage gives the launch: a group, a source, a chunk id, a top-up's id
  (`<scope>-topup` in stage 4, `<scope>-maptopup` in stage 5), `late`, `converged`, or a
  stage 6 scope. A stage 6 scope is `second-opinion` for a
  single batch, and `second-opinion` joined by a hyphen to `<k>` for batch `<k>` when
  there are several. The scope `second-opinion` matches every batch scope as a prefix,
  so it reaches each batch of stage 6. The first `times` completions of that role at that
  scope count as failures, across relaunches and swaps, and the failure ladder applies
  to each. A merger failure injected this way still goes to the orchestrator merge.
- `drop_ack`: `{ input, times }`. `input` names a run-directory input by its
  run-relative path. In stage 6, its acknowledgment counts as missing in the first
  `times` checks, counted across batches and relaunches, whatever the answer says, so
  the sentinel check fails for those answers and the ladder applies.
- `hold`: `{ stage, until }`. The named stage's agents are queued, and none is launched
  until every initial agent of stage `until` has ended. For stage 4 those are the
  auditors of its launch step; top-ups do not count, so the barrier's top-up path runs.
- `expire_budget_after_stage`: a stage number. The budget counts as expired the moment
  that stage's entry is written, whether or not the run has a `budget`, a resumed run
  included.
- `plant_map_error`: a source name. When that source's mapper succeeds, and before the
  orchestrator hashes its file, it changes the conclusion of one quoted answer in
  `domain/<source>-map.md` to its opposite, keeping the quote, and records the line
  number and the original line in the stage 3 entry as `test_planted`.
- `ledger_split_bytes`: a byte count. It replaces the 450,000-byte threshold of stage 7,
  which bounds a group's slice: split mode is chosen when a slice passes it or the sum of
  the ledger files passes three times it, and a slice over it is cut into parts.

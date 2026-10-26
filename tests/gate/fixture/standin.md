Review of the range from the merge-base to HEAD. I read the diff only and ran no check.

```json
[
  {
    "file": "src/cache.mjs",
    "line": 12,
    "summary": "The cache key omits the locale, so two locales share one entry.",
    "failure_scenario": "set('title', 'en', 'Hello') then get('title', 'fr') returns 'Hello' instead of a miss."
  },
  {
    "file": "src/cache.mjs",
    "line": 40,
    "summary": "`evict` doesn’t stop iterating after \"delete\", so the next entry is skipped.",
    "failure_scenario": "With entries a, b and c all expired, evict() removes a and c and leaves b in the map."
  }
]
```

Not reviewed: docs/cache.md changed in the same range and holds no code.
